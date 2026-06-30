use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const NO_ANALYTICS: (&str, &str) = ("CLI_HUB_NO_ANALYTICS", "1");
const CATALOG_LIMIT: usize = 80;

fn hidden_cmd(program: &str) -> Command {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new(program);
        cmd.creation_flags(0x08000000);
        cmd
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new(program)
    }
}

fn path_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(paths) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&paths));
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(home) = dirs::home_dir() {
            dirs.push(
                home.join("AppData")
                    .join("Local")
                    .join("Programs")
                    .join("Python")
                    .join("Python313"),
            );
            dirs.push(
                home.join("AppData")
                    .join("Local")
                    .join("Programs")
                    .join("Python")
                    .join("Python313-arm64"),
            );
            dirs.push(
                home.join("AppData")
                    .join("Local")
                    .join("Programs")
                    .join("Python")
                    .join("Python312"),
            );
            dirs.push(
                home.join("AppData")
                    .join("Local")
                    .join("Microsoft")
                    .join("WindowsApps"),
            );
            dirs.push(
                home.join("AppData")
                    .join("Roaming")
                    .join("Python")
                    .join("Python313")
                    .join("Scripts"),
            );
            dirs.push(
                home.join("AppData")
                    .join("Roaming")
                    .join("Python")
                    .join("Python312")
                    .join("Scripts"),
            );
        }
    }

    let mut seen = std::collections::HashSet::new();
    dirs.into_iter()
        .filter(|p| p.exists() && seen.insert(p.to_string_lossy().to_string()))
        .collect()
}

fn command_candidates(program: &str) -> Vec<PathBuf> {
    #[cfg(target_os = "windows")]
    let names = {
        let mut names = vec![program.to_string()];
        if !program.ends_with(".exe") && !program.ends_with(".cmd") && !program.ends_with(".bat") {
            names.push(format!("{program}.exe"));
            names.push(format!("{program}.cmd"));
            names.push(format!("{program}.bat"));
        }
        names
    };

    #[cfg(not(target_os = "windows"))]
    let names = [program.to_string()];

    path_dirs()
        .into_iter()
        .flat_map(|dir| names.iter().map(move |name| dir.join(name)))
        .collect()
}

fn resolve_command(program: &str) -> Option<PathBuf> {
    command_candidates(program)
        .into_iter()
        .find(|p| p.is_file())
}

fn command_path_string(program: &str) -> Option<String> {
    resolve_command(program).map(|p| p.to_string_lossy().to_string())
}

fn python_path() -> Option<PathBuf> {
    resolve_command("python")
        .or_else(|| resolve_command("python3"))
        .or_else(|| resolve_command("py"))
}

fn run_capture_path(program: &Path, args: &[&str]) -> Result<String, String> {
    let output = hidden_cmd(&program.to_string_lossy())
        .args(args)
        .env(NO_ANALYTICS.0, NO_ANALYTICS.1)
        .env("PYTHONUTF8", "1")
        .output()
        .map_err(|e| format!("执行失败 {}: {e}", program.to_string_lossy()))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if output.status.success() {
        Ok(if stdout.is_empty() { stderr } else { stdout })
    } else {
        Err(if stderr.is_empty() { stdout } else { stderr })
    }
}

fn run_capture_path_owned(program: &Path, args: &[String]) -> Result<String, String> {
    let output = hidden_cmd(&program.to_string_lossy())
        .args(args)
        .env(NO_ANALYTICS.0, NO_ANALYTICS.1)
        .env("PYTHONUTF8", "1")
        .output()
        .map_err(|e| format!("执行失败 {}: {e}", program.to_string_lossy()))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if output.status.success() {
        Ok(if stdout.is_empty() { stderr } else { stdout })
    } else {
        Err(if stderr.is_empty() { stdout } else { stderr })
    }
}

fn run_capture_path_owned_in_dir(
    program: &Path,
    args: &[String],
    cwd: &Path,
) -> Result<String, String> {
    let output = hidden_cmd(&program.to_string_lossy())
        .args(args)
        .current_dir(cwd)
        .env(NO_ANALYTICS.0, NO_ANALYTICS.1)
        .env("PYTHONUTF8", "1")
        .output()
        .map_err(|e| format!("执行失败 {}: {e}", program.to_string_lossy()))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if output.status.success() {
        Ok(if stdout.is_empty() { stderr } else { stdout })
    } else {
        Err(if stderr.is_empty() { stdout } else { stderr })
    }
}

fn run_capture_program(program: &str, args: &[&str]) -> Result<String, String> {
    let path = resolve_command(program).ok_or_else(|| format!("未找到命令：{program}"))?;
    run_capture_path(&path, args)
}

fn run_capture_program_json_even_on_failure(
    program: &str,
    args: &[&str],
) -> Result<(bool, String), String> {
    let path = resolve_command(program).ok_or_else(|| format!("未找到命令：{program}"))?;
    let output = hidden_cmd(&path.to_string_lossy())
        .args(args)
        .env(NO_ANALYTICS.0, NO_ANALYTICS.1)
        .env("PYTHONUTF8", "1")
        .output()
        .map_err(|e| format!("执行失败 {}: {e}", path.to_string_lossy()))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !stdout.is_empty() {
        Ok((output.status.success(), stdout))
    } else if output.status.success() {
        Ok((true, stderr))
    } else {
        Err(stderr)
    }
}

fn python_version(python: &Path) -> Option<String> {
    run_capture_path(python, &["--version"]).ok()
}

fn cli_hub_version() -> Option<String> {
    run_capture_program("cli-hub", &["--version"]).ok()
}

fn cli_hub_matrix_available() -> bool {
    run_capture_program("cli-hub", &["matrix", "list", "--json"]).is_ok()
}

fn cli_tool_package_names(item: Option<&Value>, name: &str) -> Vec<String> {
    let mut names = Vec::new();
    if let Some(item) = item {
        for key in ["package", "package_name", "pip_package", "npm_package"] {
            if let Some(value) = item.get(key).and_then(Value::as_str) {
                names.push(value.to_string());
            }
        }
    }
    names.push(name.to_string());
    names.push(format!("cli-anything-{name}"));
    names.push(format!("{name}-agent-harness"));
    let mut seen = std::collections::HashSet::new();
    names
        .into_iter()
        .filter(|value| valid_tool_name(value) && seen.insert(value.clone()))
        .collect()
}

fn cli_tool_installed_state(item: Option<&Value>, name: &str) -> (bool, String) {
    for package in cli_tool_package_names(item, name) {
        if let Some(python) = python_path() {
            if run_capture_path(&python, &["-m", "pip", "show", &package]).is_ok() {
                return (true, package);
            }
        }
        if resolve_command("npm").is_some()
            && run_capture_program("npm", &["list", "-g", &package, "--depth=0"]).is_ok()
        {
            return (true, package);
        }
    }
    if !name.is_empty() && resolve_command(name).is_some() {
        return (true, name.to_string());
    }
    (false, String::new())
}

fn parse_catalog(text: &str, limit: usize) -> Vec<Value> {
    let Ok(value) = serde_json::from_str::<Value>(text) else {
        return Vec::new();
    };
    let Some(items) = value.as_array() else {
        return Vec::new();
    };
    items
        .iter()
        .take(limit)
        .map(|item| {
            let name = item.get("name").and_then(Value::as_str).unwrap_or("");
            let (installed, installed_package) = cli_tool_installed_state(Some(item), name);
            json!({
                "name": name,
                "displayName": item.get("display_name").and_then(Value::as_str).unwrap_or_else(|| item.get("name").and_then(Value::as_str).unwrap_or("")),
                "description": item.get("description").and_then(Value::as_str).unwrap_or(""),
                "category": item.get("category").and_then(Value::as_str).unwrap_or(""),
                "version": item.get("version").and_then(Value::as_str).unwrap_or(""),
                "requires": item.get("requires").and_then(Value::as_str).unwrap_or(""),
                "entryPoint": item.get("entry_point").and_then(Value::as_str).unwrap_or(""),
                "installCmd": item.get("install_cmd").and_then(Value::as_str).unwrap_or(""),
                "homepage": item.get("homepage").and_then(Value::as_str).unwrap_or(""),
                "source": item.get("_source").and_then(Value::as_str).unwrap_or("harness"),
                "installed": installed,
                "installedPackage": installed_package,
            })
        })
        .collect()
}

fn catalog_counts(text: &str) -> (usize, usize, usize, Vec<String>) {
    let Ok(value) = serde_json::from_str::<Value>(text) else {
        return (0, 0, 0, Vec::new());
    };
    let Some(items) = value.as_array() else {
        return (0, 0, 0, Vec::new());
    };
    let mut harness = 0;
    let mut public = 0;
    let mut categories = std::collections::BTreeSet::new();
    for item in items {
        match item
            .get("_source")
            .and_then(Value::as_str)
            .unwrap_or("harness")
        {
            "public" => public += 1,
            _ => harness += 1,
        }
        if let Some(category) = item.get("category").and_then(Value::as_str) {
            if !category.trim().is_empty() {
                categories.insert(category.to_string());
            }
        }
    }
    (
        items.len(),
        harness,
        public,
        categories.into_iter().collect(),
    )
}

fn bundled_cli_anything_roots(app: Option<&AppHandle>) -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if let Some(app) = app {
        if let Ok(path) = app
            .path()
            .resolve("cli-anything", tauri::path::BaseDirectory::Resource)
        {
            roots.push(path);
        }
        if let Ok(path) = app.path().resolve(
            "resources/cli-anything",
            tauri::path::BaseDirectory::Resource,
        ) {
            roots.push(path);
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        roots.push(cwd.join("src-tauri").join("resources").join("cli-anything"));
        roots.push(cwd.join("resources").join("cli-anything"));
    }

    let mut seen = std::collections::HashSet::new();
    roots
        .into_iter()
        .filter(|p| p.exists() && seen.insert(p.to_string_lossy().to_string()))
        .collect()
}

fn read_bundled_registry(app: Option<&AppHandle>, file_name: &str) -> Option<String> {
    bundled_cli_anything_roots(app)
        .into_iter()
        .map(|root| root.join(file_name))
        .find(|path| path.is_file())
        .and_then(|path| std::fs::read_to_string(path).ok())
}

fn registry_clis(text: &str, source: &str) -> Vec<Value> {
    let Ok(value) = serde_json::from_str::<Value>(text) else {
        return Vec::new();
    };
    let Some(items) = value.get("clis").and_then(Value::as_array) else {
        return Vec::new();
    };
    items
        .iter()
        .map(|item| {
            let mut cloned = item.clone();
            if let Some(obj) = cloned.as_object_mut() {
                obj.insert("_source".into(), Value::String(source.into()));
            }
            cloned
        })
        .collect()
}

fn bundled_catalog_items(app: Option<&AppHandle>) -> Vec<Value> {
    let mut items = Vec::new();
    if let Some(text) = read_bundled_registry(app, "registry.json") {
        items.extend(registry_clis(&text, "harness"));
    }
    if let Some(text) = read_bundled_registry(app, "public_registry.json") {
        items.extend(registry_clis(&text, "public"));
    }
    items
}

fn item_matches_query(item: &Value, query: &str) -> bool {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return true;
    }
    let haystack = [
        "name",
        "display_name",
        "description",
        "category",
        "requires",
        "entry_point",
        "homepage",
    ]
    .iter()
    .filter_map(|key| item.get(*key).and_then(Value::as_str))
    .collect::<Vec<_>>()
    .join(" ")
    .to_lowercase();
    q.split_whitespace().all(|part| haystack.contains(part))
}

fn parse_catalog_items(items: &[Value], limit: usize) -> Vec<Value> {
    items
        .iter()
        .take(limit)
        .map(|item| {
            json!({
                "name": item.get("name").and_then(Value::as_str).unwrap_or(""),
                "displayName": item.get("display_name").and_then(Value::as_str).unwrap_or_else(|| item.get("name").and_then(Value::as_str).unwrap_or("")),
                "description": item.get("description").and_then(Value::as_str).unwrap_or(""),
                "category": item.get("category").and_then(Value::as_str).unwrap_or(""),
                "version": item.get("version").and_then(Value::as_str).unwrap_or(""),
                "requires": item.get("requires").and_then(Value::as_str).unwrap_or(""),
                "entryPoint": item.get("entry_point").and_then(Value::as_str).unwrap_or(""),
                "installCmd": item.get("install_cmd").and_then(Value::as_str).unwrap_or(""),
                "homepage": item.get("homepage").and_then(Value::as_str).unwrap_or(""),
                "source": item.get("_source").and_then(Value::as_str).unwrap_or("harness"),
            })
        })
        .collect()
}

fn bundled_catalog(app: Option<&AppHandle>, query: &str, limit: usize) -> Vec<Value> {
    let mut items = bundled_catalog_items(app)
        .into_iter()
        .filter(|item| item_matches_query(item, query))
        .collect::<Vec<_>>();
    items.sort_by(|a, b| {
        let ac = a.get("category").and_then(Value::as_str).unwrap_or("");
        let bc = b.get("category").and_then(Value::as_str).unwrap_or("");
        let an = a.get("name").and_then(Value::as_str).unwrap_or("");
        let bn = b.get("name").and_then(Value::as_str).unwrap_or("");
        ac.cmp(bc).then_with(|| an.cmp(bn))
    });
    parse_catalog_items(&items, limit)
}

fn catalog_counts_from_items(items: &[Value]) -> (usize, usize, usize, Vec<String>) {
    let mut harness = 0;
    let mut public = 0;
    let mut categories = std::collections::BTreeSet::new();
    for item in items {
        match item
            .get("_source")
            .and_then(Value::as_str)
            .unwrap_or("harness")
        {
            "public" => public += 1,
            _ => harness += 1,
        }
        if let Some(category) = item.get("category").and_then(Value::as_str) {
            if !category.trim().is_empty() {
                categories.insert(category.to_string());
            }
        }
    }
    (
        items.len(),
        harness,
        public,
        categories.into_iter().collect(),
    )
}

fn bundled_matrix_names(app: Option<&AppHandle>) -> Vec<String> {
    let Some(text) = read_bundled_registry(app, "matrix_registry.json") else {
        return vec![
            "video-creation".into(),
            "image-design".into(),
            "3d-cad".into(),
            "game-development".into(),
            "knowledge-research".into(),
        ];
    };
    let Ok(value) = serde_json::from_str::<Value>(&text) else {
        return Vec::new();
    };
    value
        .get("matrices")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("name").and_then(Value::as_str))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn bundled_matrix_detail(app: Option<&AppHandle>, name: &str) -> Option<Value> {
    let text = read_bundled_registry(app, "matrix_registry.json")?;
    let value = serde_json::from_str::<Value>(&text).ok()?;
    value
        .get("matrices")
        .and_then(Value::as_array)?
        .iter()
        .find(|item| item.get("name").and_then(Value::as_str) == Some(name))
        .cloned()
}

fn bundled_tool_item(app: Option<&AppHandle>, name: &str) -> Option<Value> {
    bundled_catalog_items(app)
        .into_iter()
        .find(|item| item.get("name").and_then(Value::as_str) == Some(name))
}

fn bundled_subdir_from_install_cmd(item: &Value) -> Option<String> {
    let install_cmd = item
        .get("install_cmd")
        .and_then(Value::as_str)
        .unwrap_or("");
    let marker = "git+https://github.com/HKUDS/CLI-Anything.git#subdirectory=";
    install_cmd
        .split(marker)
        .nth(1)
        .and_then(|rest| rest.split_whitespace().next())
        .map(|value| {
            value
                .trim_matches(|ch| ch == '"' || ch == '\'')
                .replace('/', std::path::MAIN_SEPARATOR_STR)
        })
}

fn bundled_harness_path(app: Option<&AppHandle>, item: &Value) -> Option<PathBuf> {
    let name = item.get("name").and_then(Value::as_str).unwrap_or("");
    let candidates = [
        bundled_subdir_from_install_cmd(item),
        if name.is_empty() {
            None
        } else {
            Some(format!("{name}{}agent-harness", std::path::MAIN_SEPARATOR))
        },
    ];

    for root in bundled_cli_anything_roots(app) {
        for candidate in candidates.iter().flatten() {
            let path = root.join(candidate);
            if path.is_dir()
                && (path.join("pyproject.toml").is_file()
                    || path.join("setup.py").is_file()
                    || path.join("package.json").is_file())
            {
                return Some(path);
            }
        }
    }
    None
}

fn pip_install_local_package(python: &Path, package_path: &Path) -> Result<String, String> {
    let args = vec![
        "-m".to_string(),
        "pip".to_string(),
        "install".to_string(),
        "--upgrade".to_string(),
        "--force-reinstall".to_string(),
        "--no-cache-dir".to_string(),
        package_path.to_string_lossy().to_string(),
    ];
    run_capture_path_owned(python, &args)
}

fn npm_install_local_package(package_path: &Path) -> Result<String, String> {
    let npm = resolve_command("npm").ok_or_else(|| {
        "未找到 npm，无法安装这个 Node.js harness。请先安装 Node.js / npm。".to_string()
    })?;
    let install = run_capture_path_owned_in_dir(&npm, &["install".into()], package_path)?;
    let link = run_capture_path_owned_in_dir(&npm, &["link".into()], package_path)?;
    Ok(format!("{install}\n{link}"))
}

fn install_local_harness(
    python: Option<&Path>,
    package_path: &Path,
) -> Result<(String, String), String> {
    if package_path.join("pyproject.toml").is_file() || package_path.join("setup.py").is_file() {
        let python = python.ok_or_else(|| {
            "未检测到 Python 3.10+。本地内置 Python harness 需要 Python/pip 安装，请先安装 Python 或星枢运行时。".to_string()
        })?;
        return pip_install_local_package(python, package_path)
            .map(|output| ("bundled-local-python-harness".into(), output));
    }
    if package_path.join("package.json").is_file() {
        return npm_install_local_package(package_path)
            .map(|output| ("bundled-local-node-harness".into(), output));
    }
    Err("内置 harness 缺少 pyproject.toml、setup.py 或 package.json，无法判断安装方式。".into())
}

fn valid_tool_name(name: &str) -> bool {
    !name.trim().is_empty()
        && name.len() <= 80
        && name
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.')
}

#[tauri::command]
pub async fn cli_anything_status(app: AppHandle) -> Result<Value, String> {
    let python = python_path();
    let python_available = python.is_some();
    let python_version = python
        .as_ref()
        .and_then(|path| python_version(path.as_path()));
    let pip_available = python
        .as_ref()
        .map(|p| run_capture_path(p, &["-m", "pip", "--version"]).is_ok())
        .unwrap_or(false);
    let cli_hub_path = command_path_string("cli-hub");
    let cli_hub_available = cli_hub_path.is_some();
    let cli_hub_version = cli_hub_version();

    let bundled_items = bundled_catalog_items(Some(&app));
    let bundled_counts = catalog_counts_from_items(&bundled_items);
    let bundled_roots = bundled_cli_anything_roots(Some(&app));
    let bundled_available = !bundled_items.is_empty();

    let mut total = bundled_counts.0;
    let mut harness = bundled_counts.1;
    let mut public = bundled_counts.2;
    let mut categories: Vec<String> = bundled_counts.3;
    if cli_hub_available {
        if let Ok(text) = run_capture_program("cli-hub", &["list", "--json", "--source", "all"]) {
            let counts = catalog_counts(&text);
            if counts.0 > 0 {
                total = counts.0;
                harness = counts.1;
                public = counts.2;
                categories = counts.3;
            }
        }
    }

    let matrix_available = if cli_hub_available {
        cli_hub_matrix_available()
    } else {
        false
    };
    let bundled_matrix_names = bundled_matrix_names(Some(&app));

    Ok(json!({
        "pythonAvailable": python_available,
        "pythonPath": python.map(|p| p.to_string_lossy().to_string()),
        "pythonVersion": python_version,
        "pipAvailable": pip_available,
        "cliHubAvailable": cli_hub_available,
        "cliHubPath": cli_hub_path,
        "cliHubVersion": cli_hub_version,
        "matrixAvailable": matrix_available || !bundled_matrix_names.is_empty(),
        "bundledAvailable": bundled_available,
        "bundledRoot": bundled_roots.first().map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
        "bundledCatalogTotal": bundled_counts.0,
        "bundledHarnessCount": bundled_counts.1,
        "bundledPublicCount": bundled_counts.2,
        "analyticsDisabled": true,
        "catalogTotal": total,
        "harnessCount": harness,
        "publicCount": public,
        "categories": categories,
        "matrixNames": if bundled_matrix_names.is_empty() { vec!["video-creation".to_string(), "image-design".to_string(), "3d-cad".to_string(), "game-development".to_string(), "knowledge-research".to_string()] } else { bundled_matrix_names },
        "installRoot": dirs::home_dir().map(|p| p.join(".cli-hub").to_string_lossy().to_string()).unwrap_or_default()
    }))
}

#[tauri::command]
pub async fn cli_anything_install(app: AppHandle) -> Result<Value, String> {
    let mut steps = Vec::new();
    let python = python_path().ok_or_else(|| {
        "未检测到 Python 3.10+。请先安装 Python，或安装星枢运行时后重试。当前版本不会静默安装系统级 Python，避免误改系统环境。".to_string()
    })?;
    steps.push(format!("Python 已检测：{}", python.to_string_lossy()));

    let version = python_version(&python).unwrap_or_default();
    if !version.is_empty() {
        steps.push(format!("Python 版本：{version}"));
    }

    let ensurepip = run_capture_path(&python, &["-m", "ensurepip", "--upgrade"]);
    match ensurepip {
        Ok(_) => steps.push("pip 检查 / 修复完成".into()),
        Err(e) => steps.push(format!("pip ensurepip 跳过或失败：{e}")),
    }

    run_capture_path(
        &python,
        &[
            "-m",
            "pip",
            "install",
            "--upgrade",
            "pip",
            "setuptools",
            "wheel",
        ],
    )
    .map_err(|e| format!("升级 pip/setuptools/wheel 失败：{e}"))?;
    steps.push("pip / setuptools / wheel 已升级".into());

    let bundled_cli_hub = bundled_cli_anything_roots(Some(&app))
        .into_iter()
        .map(|root| root.join("cli-hub"))
        .find(|path| {
            path.is_dir()
                && (path.join("pyproject.toml").is_file() || path.join("setup.py").is_file())
        });

    let local_install = if let Some(cli_hub_dir) = bundled_cli_hub.as_ref() {
        steps.push(format!(
            "检测到内置 CLI-Hub：{}",
            cli_hub_dir.to_string_lossy()
        ));
        pip_install_local_package(&python, cli_hub_dir)
    } else {
        Err("安装包内未找到内置 cli-hub，准备尝试在线安装".into())
    };

    match local_install {
        Ok(_) => steps.push("cli-anything-hub 已从星枢内置资源安装 / 更新".into()),
        Err(local_err) => {
            steps.push(format!("内置 CLI-Hub 安装失败或不可用：{local_err}"));
            let github_install = run_capture_path(
                &python,
                &[
                    "-m",
                    "pip",
                    "install",
                    "--upgrade",
                    "--force-reinstall",
                    "--no-cache-dir",
                    "git+https://github.com/HKUDS/CLI-Anything.git#subdirectory=cli-hub",
                ],
            );
            match github_install {
                Ok(_) => steps.push(
                    "cli-anything-hub 已从 GitHub 最新源码安装 / 更新（含 matrix 工作流）".into(),
                ),
                Err(github_err) => {
                    run_capture_path(
                        &python,
                        &["-m", "pip", "install", "--upgrade", "cli-anything-hub"],
                    )
                    .map_err(|pypi_err| {
                        format!("安装 cli-anything-hub 失败：内置={local_err}; GitHub={github_err}; PyPI={pypi_err}")
                    })?;
                    steps.push(
                        "cli-anything-hub 已从 PyPI 安装 / 更新；当前包可能不含 matrix 工作流"
                            .into(),
                    );
                }
            }
        }
    }

    let version = cli_hub_version().unwrap_or_else(|| "已安装但版本读取失败".into());
    steps.push(format!("cli-hub 版本：{version}"));
    if cli_hub_matrix_available() {
        steps.push("matrix 工作流命令已可用".into());
    } else {
        steps.push(
            "matrix 工作流命令不可用：当前 cli-hub 包不含 matrix 子命令，工具搜索/安装仍可用"
                .into(),
        );
    }

    Ok(json!({
        "ok": true,
        "steps": steps,
        "cliHubVersion": version,
        "analyticsDisabled": true
    }))
}

#[tauri::command]
pub async fn cli_anything_catalog(app: AppHandle, query: Option<String>) -> Result<Value, String> {
    let query = query.unwrap_or_default();
    if resolve_command("cli-hub").is_some() {
        let args = if query.trim().is_empty() {
            vec!["list", "--json", "--source", "all"]
        } else {
            vec!["search", query.trim(), "--json"]
        };
        if let Ok(text) = run_capture_program("cli-hub", &args) {
            let items = parse_catalog(&text, CATALOG_LIMIT);
            if !items.is_empty() {
                return Ok(json!({
                    "ok": true,
                    "query": query,
                    "count": items.len(),
                    "items": items,
                    "source": "cli-hub"
                }));
            }
        }
    }

    let items = bundled_catalog(Some(&app), &query, CATALOG_LIMIT);
    if items.is_empty() && bundled_catalog_items(Some(&app)).is_empty() {
        return Err("CLI-Anything 内置目录不可用，请检查安装包资源或重新安装星枢。".into());
    }
    Ok(json!({
        "ok": true,
        "query": query,
        "count": items.len(),
        "items": items,
        "source": "bundled"
    }))
}

#[tauri::command]
pub async fn cli_anything_install_tool(app: AppHandle, name: String) -> Result<Value, String> {
    if !valid_tool_name(&name) {
        return Err("工具名不合法，只允许英文、数字、点、下划线和中划线。".into());
    }

    let bundled_item = bundled_tool_item(Some(&app), &name);
    let bundled_path = bundled_item
        .as_ref()
        .and_then(|item| bundled_harness_path(Some(&app), item));

    if let Some(local_path) = bundled_path {
        let python = python_path();
        let info = bundled_item
            .as_ref()
            .map(|item| serde_json::to_string_pretty(item).unwrap_or_default())
            .unwrap_or_default();
        let (source, output) = install_local_harness(python.as_deref(), &local_path)?;
        let (installed, installed_package) = cli_tool_installed_state(bundled_item.as_ref(), &name);
        return Ok(json!({
            "ok": true,
            "name": name,
            "info": info,
            "output": output,
            "source": source,
            "localPath": local_path.to_string_lossy().to_string(),
            "installed": installed,
            "installedPackage": installed_package,
            "analyticsDisabled": true
        }));
    }

    if resolve_command("cli-hub").is_none() {
        return Err("这个工具未找到可直接安装的内置 harness，且 CLI-Anything Hub 未安装。请先点击“一键准备工具引擎”，再安装该工具。".into());
    }
    let info = run_capture_program("cli-hub", &["info", &name])?;
    let output = run_capture_program("cli-hub", &["install", &name])?;
    let (installed, installed_package) = cli_tool_installed_state(bundled_item.as_ref(), &name);
    Ok(json!({
        "ok": true,
        "name": name,
        "info": info,
        "output": output,
        "installed": installed,
        "installedPackage": installed_package,
        "analyticsDisabled": true
    }))
}

fn pip_uninstall_packages(python: &Path, packages: &[String]) -> Result<String, String> {
    let mut args = vec![
        "-m".to_string(),
        "pip".to_string(),
        "uninstall".to_string(),
        "-y".to_string(),
    ];
    args.extend(packages.iter().cloned());
    run_capture_path_owned(python, &args)
}

#[tauri::command]
pub async fn cli_anything_uninstall_tool(app: AppHandle, name: String) -> Result<Value, String> {
    if !valid_tool_name(&name) {
        return Err("工具名不合法，只允许英文、数字、点、下划线和中划线。".into());
    }
    let item = bundled_tool_item(Some(&app), &name);
    let packages = cli_tool_package_names(item.as_ref(), &name);
    let mut outputs = Vec::new();
    let mut attempted = false;
    if let Some(python) = python_path() {
        attempted = true;
        match pip_uninstall_packages(&python, &packages) {
            Ok(output) => outputs.push(output),
            Err(err) => outputs.push(format!("pip 卸载跳过或失败：{err}")),
        }
    }
    if resolve_command("npm").is_some() {
        for package in &packages {
            attempted = true;
            match run_capture_program("npm", &["uninstall", "-g", package]) {
                Ok(output) => outputs.push(output),
                Err(err) => outputs.push(format!("npm 卸载 {package} 跳过或失败：{err}")),
            }
        }
    }
    if !attempted {
        return Err("未找到 Python/pip 或 npm，无法执行卸载。".into());
    }
    let (installed, installed_package) = cli_tool_installed_state(item.as_ref(), &name);
    Ok(json!({
        "ok": !installed,
        "name": name,
        "packages": packages,
        "installed": installed,
        "installedPackage": installed_package,
        "output": outputs.join("\n"),
        "analyticsDisabled": true
    }))
}

#[tauri::command]
pub async fn cli_anything_matrix_preflight(app: AppHandle, name: String) -> Result<Value, String> {
    if resolve_command("cli-hub").is_none() {
        return Err("CLI-Anything Hub 未安装，请先点击“自动安装 / 修复依赖”。".into());
    }
    if !valid_tool_name(&name) {
        return Err("矩阵名不合法。".into());
    }
    if !cli_hub_matrix_available() {
        if let Some(matrix) = bundled_matrix_detail(Some(&app), &name) {
            return Ok(json!({
                "ok": true,
                "exitSuccess": true,
                "name": name,
                "source": "bundled",
                "output": {
                    "mode": "bundled-preflight-preview",
                    "message": "当前 cli-hub 未安装或不支持 matrix 子命令。星枢已读取内置矩阵定义，可用于售卖版说明和安装规划；真实执行预检请先安装 CLI-Hub。",
                    "matrix": matrix
                }
            }));
        }
        return Err("当前 cli-hub 不支持 matrix 工作流，且未找到内置矩阵定义。请先点击“自动安装 / 修复依赖”。".into());
    }
    let (success, output) = run_capture_program_json_even_on_failure(
        "cli-hub",
        &["matrix", "preflight", &name, "--json"],
    )?;
    Ok(json!({
        "ok": success,
        "exitSuccess": success,
        "name": name,
        "output": serde_json::from_str::<Value>(&output).unwrap_or_else(|_| json!({"raw": output}))
    }))
}
