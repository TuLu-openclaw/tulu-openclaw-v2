use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const REPO_URL: &str = "https://github.com/calesthio/OpenMontage.git";
const REPO_DIR: &str = "OpenMontage";

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

fn tools_root() -> PathBuf {
    super::openclaw_dir().join("external-tools")
}

fn openmontage_dir() -> PathBuf {
    tools_root().join(REPO_DIR)
}

#[cfg(target_os = "windows")]
fn registry_path_values() -> Vec<String> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    let mut values = Vec::new();
    for (root, subkey) in [
        (HKEY_CURRENT_USER, "Environment"),
        (
            HKEY_LOCAL_MACHINE,
            r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment",
        ),
    ] {
        if let Ok(key) = RegKey::predef(root).open_subkey_with_flags(subkey, KEY_READ) {
            if let Ok(path) = key.get_value::<String, _>("Path") {
                values.push(path);
            }
        }
    }
    values
}

#[cfg(not(target_os = "windows"))]
fn registry_path_values() -> Vec<String> {
    Vec::new()
}

fn common_command_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join("AppData").join("Roaming").join("npm"));
        dirs.push(home.join(".cargo").join("bin"));
        dirs.push(home.join(".local").join("bin"));
    }
    for var in [
        "ProgramFiles",
        "ProgramFiles(x86)",
        "LOCALAPPDATA",
        "APPDATA",
    ] {
        if let Ok(value) = std::env::var(var) {
            let base = PathBuf::from(value);
            dirs.push(base.join("nodejs"));
            dirs.push(base.join("Git").join("cmd"));
            dirs.push(base.join("Git").join("bin"));
            dirs.push(base.join("Microsoft").join("WinGet").join("Links"));
            dirs.push(base.join("Programs").join("Python").join("Python313"));
            dirs.push(base.join("Programs").join("Python").join("Python312"));
            dirs.push(base.join("Programs").join("Python").join("Python311"));
            dirs.push(base.join("Programs").join("Python").join("Launcher"));
            dirs.push(base.join("Programs").join("Microsoft VS Code").join("bin"));
        }
    }
    dirs.push(PathBuf::from(r"C:\Program Files\nodejs"));
    dirs.push(PathBuf::from(r"C:\Program Files\Git\cmd"));
    dirs.push(PathBuf::from(r"C:\Program Files\Git\bin"));
    dirs
}

fn path_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(path) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&path));
    }
    for path in registry_path_values() {
        let expanded = path
            .replace(
                "%USERPROFILE%",
                &std::env::var("USERPROFILE").unwrap_or_default(),
            )
            .replace(
                "%ProgramFiles%",
                &std::env::var("ProgramFiles").unwrap_or_default(),
            )
            .replace(
                "%ProgramFiles(x86)%",
                &std::env::var("ProgramFiles(x86)").unwrap_or_default(),
            )
            .replace(
                "%LOCALAPPDATA%",
                &std::env::var("LOCALAPPDATA").unwrap_or_default(),
            )
            .replace("%APPDATA%", &std::env::var("APPDATA").unwrap_or_default());
        dirs.extend(std::env::split_paths(&expanded));
    }
    dirs.extend(common_command_dirs());
    let mut seen = std::collections::HashSet::new();
    dirs.into_iter()
        .filter(|dir| seen.insert(dir.to_string_lossy().to_ascii_lowercase()))
        .collect()
}

fn command_candidates(program: &str) -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        if program.contains('.') {
            return vec![program.to_string()];
        }
        vec![
            format!("{program}.exe"),
            format!("{program}.cmd"),
            format!("{program}.bat"),
            program.to_string(),
        ]
    }
    #[cfg(not(target_os = "windows"))]
    {
        vec![program.to_string()]
    }
}

fn resolve_command(program: &str) -> Option<PathBuf> {
    if let Ok(path) = which::which(program) {
        return Some(path);
    }
    for dir in path_dirs() {
        for candidate in command_candidates(program) {
            let path = dir.join(candidate);
            if path.is_file() {
                return Some(path);
            }
        }
    }
    None
}

fn command_version(program: &str) -> Option<String> {
    let path = resolve_command(program)?;
    hidden_cmd(path.to_string_lossy().as_ref())
        .arg("--version")
        .output()
        .ok()
        .filter(|out| out.status.success())
        .map(|out| {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            let text = if stdout.is_empty() { stderr } else { stdout };
            text.lines().next().unwrap_or("可用").to_string()
        })
}

fn command_exists(program: &str) -> bool {
    resolve_command(program).is_some()
}

fn run_capture(program: &str, args: &[&str], cwd: Option<&Path>) -> Result<String, String> {
    let command_path = resolve_command(program).unwrap_or_else(|| PathBuf::from(program));
    let command_label = command_path.to_string_lossy().to_string();
    let mut cmd = hidden_cmd(&command_label);
    cmd.args(args);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    let out = cmd
        .output()
        .map_err(|e| format!("运行 {program} 失败: {e}"))?;
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
    if out.status.success() {
        Ok(if stdout.is_empty() { stderr } else { stdout })
    } else {
        Err(if stderr.is_empty() { stdout } else { stderr })
    }
}

fn git_head(dir: &Path) -> Option<String> {
    run_capture("git", &["rev-parse", "--short", "HEAD"], Some(dir)).ok()
}

fn read_package_version(dir: &Path) -> Option<String> {
    let package_json = dir.join("remotion-composer").join("package.json");
    let text = fs::read_to_string(package_json).ok()?;
    let value: Value = serde_json::from_str(&text).ok()?;
    value
        .get("version")
        .and_then(|v| v.as_str())
        .map(str::to_string)
}

#[tauri::command]
pub async fn openmontage_status() -> Result<Value, String> {
    let dir = openmontage_dir();
    let remotion_dir = dir.join("remotion-composer");
    let venv_dir = dir.join(".venv");
    let node_modules = remotion_dir.join("node_modules");
    let installed = dir.join("README.md").exists() && dir.join("pipeline_defs").is_dir();

    Ok(json!({
        "repoUrl": REPO_URL,
        "path": dir.to_string_lossy(),
        "installed": installed,
        "gitAvailable": command_exists("git"),
        "pythonAvailable": command_exists("python"),
        "nodeAvailable": command_exists("node"),
        "npmAvailable": command_exists("npm"),
        "uvAvailable": command_exists("uv"),
        "ffmpegAvailable": command_exists("ffmpeg"),
        "gitPath": resolve_command("git").map(|p| p.to_string_lossy().to_string()),
        "pythonPath": resolve_command("python").map(|p| p.to_string_lossy().to_string()),
        "nodePath": resolve_command("node").map(|p| p.to_string_lossy().to_string()),
        "npmPath": resolve_command("npm").map(|p| p.to_string_lossy().to_string()),
        "uvPath": resolve_command("uv").map(|p| p.to_string_lossy().to_string()),
        "ffmpegPath": resolve_command("ffmpeg").map(|p| p.to_string_lossy().to_string()),
        "gitVersion": command_version("git"),
        "pythonVersion": command_version("python"),
        "nodeVersion": command_version("node"),
        "npmVersion": command_version("npm"),
        "uvVersion": command_version("uv"),
        "ffmpegVersion": command_version("ffmpeg"),
        "commit": if installed { git_head(&dir) } else { None },
        "remotionVersion": if installed { read_package_version(&dir) } else { None },
        "pythonReady": venv_dir.exists(),
        "remotionReady": node_modules.exists(),
        "pipelineCount": if installed { fs::read_dir(dir.join("pipeline_defs")).map(|it| it.filter_map(Result::ok).filter(|e| e.path().extension().and_then(|v| v.to_str()) == Some("yaml")).count()).unwrap_or(0) } else { 0 },
        "license": "AGPL-3.0",
        "integrationMode": "external-connector"
    }))
}

#[tauri::command]
pub async fn openmontage_install(update: bool, install_deps: bool) -> Result<Value, String> {
    if !command_exists("git") {
        return Err("未检测到 git，无法克隆 OpenMontage".into());
    }
    let root = tools_root();
    let dir = openmontage_dir();
    fs::create_dir_all(&root).map_err(|e| format!("创建外部工具目录失败: {e}"))?;

    if dir.exists() {
        if update {
            run_capture("git", &["fetch", "--all", "--prune"], Some(&dir))?;
            run_capture("git", &["reset", "--hard", "origin/HEAD"], Some(&dir))?;
        }
    } else {
        run_capture("git", &["clone", REPO_URL, REPO_DIR], Some(&root))?;
    }

    let mut steps = vec!["repo".to_string()];
    if install_deps {
        if command_exists("uv") {
            run_capture("uv", &["venv", "--allow-existing"], Some(&dir))?;
            run_capture(
                "uv",
                &["pip", "install", "-r", "requirements.txt"],
                Some(&dir),
            )?;
            steps.push("python-uv".to_string());
        } else if command_exists("python") {
            run_capture(
                "python",
                &["-m", "pip", "install", "-r", "requirements.txt"],
                Some(&dir),
            )?;
            steps.push("python-pip".to_string());
        }

        let remotion_dir = dir.join("remotion-composer");
        if command_exists("npm") && remotion_dir.is_dir() {
            run_capture("npm", &["install"], Some(&remotion_dir))?;
            steps.push("remotion-npm".to_string());
        }
    }

    Ok(json!({
        "ok": true,
        "path": dir.to_string_lossy(),
        "commit": git_head(&dir),
        "steps": steps
    }))
}

#[tauri::command]
pub async fn openmontage_open_studio() -> Result<Value, String> {
    let dir = openmontage_dir();
    let remotion_dir = dir.join("remotion-composer");
    if !remotion_dir.is_dir() {
        return Err("OpenMontage 尚未安装或缺少 remotion-composer".into());
    }
    if !command_exists("npm") {
        return Err("未检测到 npm，无法启动 Remotion 工作台".into());
    }

    let npm = resolve_command("npm").unwrap_or_else(|| PathBuf::from("npm"));
    hidden_cmd(npm.to_string_lossy().as_ref())
        .args(["run", "start"])
        .current_dir(&remotion_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("启动 Remotion 工作台失败: {e}"))?;

    Ok(json!({
        "ok": true,
        "url": "http://localhost:3000",
        "cwd": remotion_dir.to_string_lossy(),
    }))
}

#[tauri::command]
pub async fn openmontage_open_folder() -> Result<Value, String> {
    let dir = openmontage_dir();
    if !dir.exists() {
        return Err("OpenMontage 尚未安装".into());
    }

    #[cfg(target_os = "windows")]
    {
        hidden_cmd("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("打开目录失败: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("打开目录失败: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("打开目录失败: {e}"))?;
    }

    Ok(json!({ "ok": true, "path": dir.to_string_lossy() }))
}
