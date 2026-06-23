use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

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

fn command_exists(program: &str) -> bool {
    hidden_cmd(program)
        .arg("--version")
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false)
}

fn run_capture(program: &str, args: &[&str], cwd: Option<&Path>) -> Result<String, String> {
    let mut cmd = hidden_cmd(program);
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
