use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::Command;

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

fn valid_tool_name(name: &str) -> bool {
    !name.trim().is_empty()
        && name.len() <= 80
        && name
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.')
}

#[tauri::command]
pub async fn cli_anything_status() -> Result<Value, String> {
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

    let mut total = 0;
    let mut harness = 0;
    let mut public = 0;
    let mut categories: Vec<String> = Vec::new();
    if cli_hub_available {
        if let Ok(text) = run_capture_program("cli-hub", &["list", "--json", "--source", "all"]) {
            let counts = catalog_counts(&text);
            total = counts.0;
            harness = counts.1;
            public = counts.2;
            categories = counts.3;
        }
    }

    let matrix_available = if cli_hub_available {
        cli_hub_matrix_available()
    } else {
        false
    };

    Ok(json!({
        "pythonAvailable": python_available,
        "pythonPath": python.map(|p| p.to_string_lossy().to_string()),
        "pythonVersion": python_version,
        "pipAvailable": pip_available,
        "cliHubAvailable": cli_hub_available,
        "cliHubPath": cli_hub_path,
        "cliHubVersion": cli_hub_version,
        "matrixAvailable": matrix_available,
        "analyticsDisabled": true,
        "catalogTotal": total,
        "harnessCount": harness,
        "publicCount": public,
        "categories": categories,
        "matrixNames": ["video-creation", "image-design", "3d-cad", "game-development", "knowledge-research"],
        "installRoot": dirs::home_dir().map(|p| p.join(".cli-hub").to_string_lossy().to_string()).unwrap_or_default()
    }))
}

#[tauri::command]
pub async fn cli_anything_install() -> Result<Value, String> {
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
        Ok(_) => steps
            .push("cli-anything-hub 已从 GitHub 最新源码安装 / 更新（含 matrix 工作流）".into()),
        Err(github_err) => {
            run_capture_path(
                &python,
                &["-m", "pip", "install", "--upgrade", "cli-anything-hub"],
            )
            .map_err(|pypi_err| {
                format!("安装 cli-anything-hub 失败：GitHub={github_err}; PyPI={pypi_err}")
            })?;
            steps.push(
                "cli-anything-hub 已从 PyPI 安装 / 更新；当前包可能不含 matrix 工作流".into(),
            );
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
pub async fn cli_anything_catalog(query: Option<String>) -> Result<Value, String> {
    if resolve_command("cli-hub").is_none() {
        return Err("CLI-Anything Hub 未安装，请先点击“自动安装 / 修复依赖”。".into());
    }
    let query = query.unwrap_or_default();
    let args = if query.trim().is_empty() {
        vec!["list", "--json", "--source", "all"]
    } else {
        vec!["search", query.trim(), "--json"]
    };
    let text = run_capture_program("cli-hub", &args)?;
    let items = parse_catalog(&text, CATALOG_LIMIT);
    Ok(json!({
        "ok": true,
        "query": query,
        "count": items.len(),
        "items": items
    }))
}

#[tauri::command]
pub async fn cli_anything_install_tool(name: String) -> Result<Value, String> {
    if resolve_command("cli-hub").is_none() {
        return Err("CLI-Anything Hub 未安装，请先点击“自动安装 / 修复依赖”。".into());
    }
    if !valid_tool_name(&name) {
        return Err("工具名不合法，只允许英文、数字、点、下划线和中划线。".into());
    }
    let info = run_capture_program("cli-hub", &["info", &name])?;
    let output = run_capture_program("cli-hub", &["install", &name])?;
    Ok(json!({
        "ok": true,
        "name": name,
        "info": info,
        "output": output,
        "analyticsDisabled": true
    }))
}

#[tauri::command]
pub async fn cli_anything_matrix_preflight(name: String) -> Result<Value, String> {
    if resolve_command("cli-hub").is_none() {
        return Err("CLI-Anything Hub 未安装，请先点击“自动安装 / 修复依赖”。".into());
    }
    if !valid_tool_name(&name) {
        return Err("矩阵名不合法。".into());
    }
    if !cli_hub_matrix_available() {
        return Err("当前 cli-hub 不支持 matrix 工作流。请先点击“自动安装 / 修复依赖”，星枢会优先安装 GitHub 最新版 CLI-Anything Hub。".into());
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
