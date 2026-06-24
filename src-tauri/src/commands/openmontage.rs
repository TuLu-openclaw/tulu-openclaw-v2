use serde_json::{json, Value};
use std::fs;
#[cfg(target_os = "windows")]
use std::io::Cursor;
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const REPO_URL: &str = "https://github.com/calesthio/OpenMontage.git";
const REPO_DIR: &str = "OpenMontage";
const NODE_X64_VERSION: &str = "22.13.1";

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

fn render_runtime_root() -> PathBuf {
    openmontage_dir().join(".openclaw-render-runtime")
}

fn bundled_node_dir() -> PathBuf {
    render_runtime_root().join(format!("node-v{NODE_X64_VERSION}-win-x64"))
}

#[cfg(target_os = "windows")]
fn bundled_node_path() -> PathBuf {
    bundled_node_dir().join("node.exe")
}

#[cfg(target_os = "windows")]
fn bundled_npm_path() -> PathBuf {
    bundled_node_dir().join("npm.cmd")
}

#[cfg(not(target_os = "windows"))]
fn bundled_node_path() -> PathBuf {
    PathBuf::new()
}

#[cfg(not(target_os = "windows"))]
fn bundled_npm_path() -> PathBuf {
    PathBuf::new()
}

fn bundled_npx_path() -> PathBuf {
    bundled_node_dir().join("npx.cmd")
}

fn is_windows_arm64() -> bool {
    cfg!(target_os = "windows") && std::env::consts::ARCH == "aarch64"
}

fn selected_node_path() -> Option<PathBuf> {
    if is_windows_arm64() && bundled_node_path().is_file() {
        return Some(bundled_node_path());
    }
    resolve_command("node")
}

fn selected_npm_path() -> Option<PathBuf> {
    if is_windows_arm64() && bundled_npm_path().is_file() {
        return Some(bundled_npm_path());
    }
    resolve_command("npm")
}

fn selected_npx_path() -> Option<PathBuf> {
    if is_windows_arm64() && bundled_npx_path().is_file() {
        return Some(bundled_npx_path());
    }
    resolve_command("npx")
}

fn runtime_mode() -> &'static str {
    if is_windows_arm64() {
        if bundled_node_path().is_file() && bundled_npm_path().is_file() {
            "windows-arm64-x64-node"
        } else {
            "windows-arm64-needs-x64-node"
        }
    } else {
        "native"
    }
}

fn render_supported() -> bool {
    if is_windows_arm64() {
        bundled_node_path().is_file() && bundled_npm_path().is_file()
    } else {
        selected_node_path().is_some() && selected_npm_path().is_some()
    }
}

fn tts_provider_files(dir: &Path) -> Vec<(&'static str, PathBuf)> {
    let audio = dir.join("tools").join("audio");
    vec![
        ("ElevenLabs", audio.join("elevenlabs_tts.py")),
        ("OpenAI", audio.join("openai_tts.py")),
        ("Google TTS", audio.join("google_tts.py")),
        ("Doubao", audio.join("doubao_tts.py")),
        ("Piper", audio.join("piper_tts.py")),
    ]
}

fn env_present(name: &str) -> bool {
    std::env::var(name)
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false)
}

fn env_file_value(dir: &Path, name: &str) -> Option<String> {
    let text = fs::read_to_string(dir.join(".env")).ok()?;
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        if key.trim() != name {
            continue;
        }
        let value = value
            .split_once(" #")
            .map(|(v, _)| v)
            .unwrap_or(value)
            .trim()
            .trim_matches('"')
            .trim_matches('\'')
            .to_string();
        if !value.is_empty() && value != "***" && !value.contains("your_key") {
            return Some(value);
        }
    }
    None
}

fn env_present_for_openmontage(dir: &Path, names: &[&str]) -> bool {
    names
        .iter()
        .any(|name| env_present(name) || env_file_value(dir, name).is_some())
}

fn venv_python(dir: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        dir.join(".venv").join("Scripts").join("python.exe")
    }
    #[cfg(not(target_os = "windows"))]
    {
        dir.join(".venv").join("bin").join("python")
    }
}

fn venv_command(dir: &Path, program: &str) -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    let candidates = [
        dir.join(".venv")
            .join("Scripts")
            .join(format!("{program}.exe")),
        dir.join(".venv")
            .join("Scripts")
            .join(format!("{program}.cmd")),
        dir.join(".venv").join("Scripts").join(program),
    ];

    #[cfg(not(target_os = "windows"))]
    let candidates = [dir.join(".venv").join("bin").join(program)];

    candidates.into_iter().find(|path| path.is_file())
}

fn python_module_available(python: &Path, module: &str) -> bool {
    python.is_file()
        && run_capture_path(python, &["-c", &format!("import {module}")], None, &[]).is_ok()
}

fn piper_available(dir: &Path) -> bool {
    command_exists("piper")
        || venv_command(dir, "piper").is_some()
        || python_module_available(&venv_python(dir), "piper")
}

fn tts_provider_hint(name: &str) -> &'static str {
    match name {
        "ElevenLabs" => "云端高质量配音：需要 ELEVENLABS_API_KEY",
        "OpenAI" => "OpenAI 配音：需要 OPENAI_API_KEY",
        "Google TTS" => "Google 配音：需要 GOOGLE_API_KEY / GEMINI_API_KEY 或凭据文件",
        "Doubao" => "豆包配音：需要 DOUBAO_SPEECH_API_KEY",
        "Piper" => "本地免费配音：更新 / 修复安装会自动尝试安装 piper-tts",
        _ => "需要按 OpenMontage provider 要求配置",
    }
}

fn tts_provider_available(dir: &Path, name: &str, file_exists: bool) -> bool {
    if !file_exists {
        return false;
    }
    match name {
        "ElevenLabs" => env_present_for_openmontage(dir, &["ELEVENLABS_API_KEY"]),
        "OpenAI" => env_present_for_openmontage(dir, &["OPENAI_API_KEY"]),
        "Google TTS" => env_present_for_openmontage(
            dir,
            &[
                "GOOGLE_API_KEY",
                "GEMINI_API_KEY",
                "GOOGLE_APPLICATION_CREDENTIALS",
            ],
        ),
        "Doubao" => env_present_for_openmontage(
            dir,
            &["DOUBAO_SPEECH_API_KEY", "DOUBAO_API_KEY", "ARK_API_KEY"],
        ),
        "Piper" => piper_available(dir),
        _ => false,
    }
}

fn openmontage_node_env(node_dir: Option<&Path>) -> Vec<(String, String)> {
    let mut envs = Vec::new();
    if let Some(dir) = node_dir.and_then(Path::parent) {
        let current_path = std::env::var_os("PATH").unwrap_or_default();
        let mut paths = vec![dir.to_path_buf()];
        paths.extend(std::env::split_paths(&current_path));
        if let Ok(joined) = std::env::join_paths(paths) {
            envs.push(("PATH".to_string(), joined.to_string_lossy().to_string()));
        }
        envs.push((
            "npm_config_arch".to_string(),
            if is_windows_arm64() {
                "x64".to_string()
            } else {
                std::env::consts::ARCH.to_string()
            },
        ));
    }
    envs
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
    command_version_path(&path)
}

fn command_version_path(path: &Path) -> Option<String> {
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
    run_capture_path(&command_path, args, cwd, &[])
}

fn run_capture_path(
    command_path: &Path,
    args: &[&str],
    cwd: Option<&Path>,
    envs: &[(String, String)],
) -> Result<String, String> {
    let command_label = command_path.to_string_lossy().to_string();
    let mut cmd = hidden_cmd(&command_label);
    cmd.args(args);
    for (key, value) in envs {
        cmd.env(key, value);
    }
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    let out = cmd
        .output()
        .map_err(|e| format!("运行 {} 失败: {e}", command_path.display()))?;
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
    if out.status.success() {
        Ok(if stdout.is_empty() { stderr } else { stdout })
    } else {
        Err(if stderr.is_empty() { stdout } else { stderr })
    }
}

fn clear_remotion_studio_cache(remotion_dir: &Path) -> Result<Vec<String>, String> {
    let mut steps = Vec::new();
    let cache_dir = remotion_dir.join("node_modules").join(".cache");
    if cache_dir.exists() {
        fs::remove_dir_all(&cache_dir).map_err(|e| {
            format!("清理 Remotion / webpack 缓存失败，请关闭视频工作台后重试: {e}")
        })?;
        steps.push("remotion-webpack-cache-cleared".to_string());
    }
    Ok(steps)
}

#[cfg(target_os = "windows")]
fn stop_existing_remotion_studio(remotion_dir: &Path) -> Result<Vec<String>, String> {
    let remotion_marker = remotion_dir.to_string_lossy().replace('\\', "\\\\");
    let script = format!(
        r#"$marker = '{}'
$targets = Get-CimInstance Win32_Process | Where-Object {{
  $_.ProcessId -ne $PID -and $_.CommandLine -and (
    $_.CommandLine -like "*$marker*" -or
    $_.CommandLine -like '*remotion studio*' -or
    $_.CommandLine -like '*@remotion\\cli*'
  )
}}
$ids = @($targets | Select-Object -ExpandProperty ProcessId)
foreach ($id in $ids) {{ Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }}
$ids -join ','"#,
        remotion_marker
    );
    let output = hidden_cmd("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .output()
        .map_err(|e| format!("清理旧 Remotion 工作台进程失败: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "清理旧 Remotion 工作台进程失败: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    let killed = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if killed.is_empty() {
        Ok(vec!["old-studio-processes-none".to_string()])
    } else {
        Ok(vec![format!("old-studio-processes-stopped:{killed}")])
    }
}

#[cfg(not(target_os = "windows"))]
fn stop_existing_remotion_studio(_remotion_dir: &Path) -> Result<Vec<String>, String> {
    Ok(vec!["old-studio-process-cleanup-skipped".to_string()])
}

fn find_available_local_port(start: u16) -> Result<u16, String> {
    for port in start..start.saturating_add(50) {
        if TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return Ok(port);
        }
    }
    Err("未找到可用于 OpenMontage 视频工作台的本地端口".into())
}

fn local_port_is_ready(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
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

#[cfg(target_os = "windows")]
async fn ensure_windows_x64_node_runtime() -> Result<Vec<String>, String> {
    let mut steps = Vec::new();
    let node = bundled_node_path();
    let npm = bundled_npm_path();
    if node.is_file() && npm.is_file() {
        steps.push("x64-node-present".to_string());
        return Ok(steps);
    }

    fs::create_dir_all(render_runtime_root())
        .map_err(|e| format!("创建 OpenMontage x64 运行时目录失败: {e}"))?;
    let zip_url =
        format!("https://nodejs.org/dist/v{NODE_X64_VERSION}/node-v{NODE_X64_VERSION}-win-x64.zip");
    let bytes = reqwest::get(&zip_url)
        .await
        .map_err(|e| format!("下载 Windows x64 Node 失败: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("读取 Windows x64 Node 安装包失败: {e}"))?;
    let reader = Cursor::new(bytes);
    let mut archive =
        zip::ZipArchive::new(reader).map_err(|e| format!("解压 Windows x64 Node 失败: {e}"))?;
    archive
        .extract(render_runtime_root())
        .map_err(|e| format!("释放 Windows x64 Node 失败: {e}"))?;

    if !node.is_file() || !npm.is_file() {
        return Err("Windows x64 Node 运行时安装后仍未找到 node.exe/npm.cmd".into());
    }
    steps.push("x64-node-installed".to_string());
    Ok(steps)
}

#[cfg(not(target_os = "windows"))]
async fn ensure_windows_x64_node_runtime() -> Result<Vec<String>, String> {
    Ok(Vec::new())
}

#[tauri::command]
pub async fn openmontage_status() -> Result<Value, String> {
    let dir = openmontage_dir();
    let remotion_dir = dir.join("remotion-composer");
    let venv_dir = dir.join(".venv");
    let node_modules = remotion_dir.join("node_modules");
    let installed = dir.join("README.md").exists() && dir.join("pipeline_defs").is_dir();
    let selected_node = selected_node_path();
    let selected_npm = selected_npm_path();
    let tts_providers: Vec<Value> = tts_provider_files(&dir)
        .into_iter()
        .map(|(name, file)| {
            let file_exists = file.is_file();
            json!({
                "name": name,
                "file": file.to_string_lossy(),
                "fileExists": file_exists,
                "available": tts_provider_available(&dir, name, file_exists),
                "hint": tts_provider_hint(name)
            })
        })
        .collect();
    let tts_available = tts_providers.iter().any(|item| {
        item.get("available")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
    });

    Ok(json!({
        "repoUrl": REPO_URL,
        "path": dir.to_string_lossy(),
        "installed": installed,
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "windowsArm64": is_windows_arm64(),
        "runtimeMode": runtime_mode(),
        "renderSupported": render_supported(),
        "renderRuntimeReady": render_supported(),
        "renderRuntimePath": if is_windows_arm64() { Some(bundled_node_dir().to_string_lossy().to_string()) } else { None },
        "requiresX64Runtime": is_windows_arm64(),
        "gitAvailable": command_exists("git"),
        "pythonAvailable": command_exists("python"),
        "nodeAvailable": selected_node.is_some(),
        "npmAvailable": selected_npm.is_some(),
        "uvAvailable": command_exists("uv"),
        "ffmpegAvailable": command_exists("ffmpeg"),
        "gitPath": resolve_command("git").map(|p| p.to_string_lossy().to_string()),
        "pythonPath": resolve_command("python").map(|p| p.to_string_lossy().to_string()),
        "nodePath": selected_node.as_ref().map(|p| p.to_string_lossy().to_string()),
        "npmPath": selected_npm.as_ref().map(|p| p.to_string_lossy().to_string()),
        "uvPath": resolve_command("uv").map(|p| p.to_string_lossy().to_string()),
        "ffmpegPath": resolve_command("ffmpeg").map(|p| p.to_string_lossy().to_string()),
        "gitVersion": command_version("git"),
        "pythonVersion": command_version("python"),
        "nodeVersion": selected_node.as_ref().and_then(|p| command_version_path(p)),
        "npmVersion": selected_npm.as_ref().and_then(|p| command_version_path(p)),
        "uvVersion": command_version("uv"),
        "ffmpegVersion": command_version("ffmpeg"),
        "ttsProviderAvailable": tts_available,
        "ttsProviders": tts_providers,
        "completeOpenMontageReady": installed && render_supported() && tts_available,
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
pub async fn openmontage_prepare_runtime() -> Result<Value, String> {
    let mut steps = Vec::new();
    if is_windows_arm64() {
        steps.extend(ensure_windows_x64_node_runtime().await?);
    } else if !render_supported() {
        return Err("未检测到可用的 Node.js/npm，无法准备 OpenMontage 渲染运行时".into());
    } else {
        steps.push("native-runtime-present".to_string());
    }

    Ok(json!({
        "ok": true,
        "runtimeMode": runtime_mode(),
        "renderSupported": render_supported(),
        "steps": steps,
        "nodePath": selected_node_path().map(|p| p.to_string_lossy().to_string()),
        "npmPath": selected_npm_path().map(|p| p.to_string_lossy().to_string()),
        "npxPath": selected_npx_path().map(|p| p.to_string_lossy().to_string())
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
            if run_capture("uv", &["pip", "install", "piper-tts"], Some(&dir)).is_ok() {
                steps.push("piper-tts".to_string());
            }
            steps.push("python-uv".to_string());
        } else if command_exists("python") {
            run_capture(
                "python",
                &["-m", "pip", "install", "-r", "requirements.txt"],
                Some(&dir),
            )?;
            if run_capture("python", &["-m", "pip", "install", "piper-tts"], Some(&dir)).is_ok() {
                steps.push("piper-tts".to_string());
            }
            steps.push("python-pip".to_string());
        }

        let env_file = dir.join(".env");
        let env_example = dir.join(".env.example");
        if !env_file.exists() && env_example.is_file() {
            fs::copy(&env_example, &env_file)
                .map_err(|e| format!("创建 OpenMontage .env 失败: {e}"))?;
            steps.push("env-example".to_string());
        }

        let remotion_dir = dir.join("remotion-composer");
        if is_windows_arm64() {
            steps.extend(ensure_windows_x64_node_runtime().await?);
        }
        if remotion_dir.is_dir() {
            let npm = selected_npm_path()
                .ok_or_else(|| "未检测到 npm，无法安装 Remotion 依赖".to_string())?;
            let node = selected_node_path();
            let envs = openmontage_node_env(node.as_deref());
            run_capture_path(&npm, &["install"], Some(&remotion_dir), &envs)?;
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
    if !render_supported() {
        return Err("当前环境尚未准备完整 OpenMontage 渲染运行时。Windows ARM64 需要先执行更新 / 修复安装以准备 x64 Node。".into());
    }
    let Some(npx) = selected_npx_path() else {
        return Err("未检测到 npx，无法启动 Remotion 工作台".into());
    };

    let mut steps = stop_existing_remotion_studio(&remotion_dir)?;
    tokio::time::sleep(Duration::from_millis(500)).await;
    steps.extend(clear_remotion_studio_cache(&remotion_dir)?);
    let port = find_available_local_port(3100)?;
    let node = selected_node_path();
    let mut cmd = hidden_cmd(npx.to_string_lossy().as_ref());
    cmd.args(["remotion", "studio", "--port", &port.to_string()])
        .current_dir(&remotion_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    for (key, value) in openmontage_node_env(node.as_deref()) {
        cmd.env(key, value);
    }
    cmd.spawn()
        .map_err(|e| format!("启动 Remotion 工作台失败: {e}"))?;

    let mut ready = false;
    for _ in 0..40 {
        if local_port_is_ready(port) {
            ready = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
    }
    steps.push(if ready {
        "studio-port-ready".to_string()
    } else {
        "studio-started-waiting-for-first-build".to_string()
    });
    let launch_id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let url = format!("http://localhost:{port}/?openclawLaunch={launch_id}");

    Ok(json!({
        "ok": true,
        "url": url,
        "port": port,
        "ready": ready,
        "cwd": remotion_dir.to_string_lossy(),
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
