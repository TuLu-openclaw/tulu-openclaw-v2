use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Manager};

const UV_VERSION: &str = "0.7.12";

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const BROWSER_USE_VERSION: &str = "0.13.6";
const MCP_VERSION: &str = "1.26.0";
const SERVER_NAME: &str = "browser-use";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserUsePermissions {
    #[serde(default)]
    pub allow_interaction: bool,
    #[serde(default)]
    pub allow_autonomous: bool,
    #[serde(default)]
    pub allowed_domains: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BrowserUseStatus {
    installed: bool,
    runtime_ready: bool,
    registered: bool,
    version: Option<String>,
    runtime_dir: String,
    python: Option<String>,
    allow_interaction: bool,
    allow_autonomous: bool,
    allowed_domains: Vec<String>,
}

fn hidden_command(program: &Path) -> Command {
    let mut command = Command::new(program);
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);
    command
}

fn runtime_dir() -> PathBuf {
    super::openclaw_dir().join("browser-use")
}

fn venv_python() -> PathBuf {
    #[cfg(target_os = "windows")]
    return runtime_dir()
        .join("venv")
        .join("Scripts")
        .join("python.exe");
    #[cfg(not(target_os = "windows"))]
    return runtime_dir().join("venv").join("bin").join("python");
}

fn resolve_system_python() -> Option<PathBuf> {
    let candidates = if cfg!(target_os = "windows") {
        vec!["python.exe", "python3.exe", "python", "python3"]
    } else {
        vec!["python3", "python"]
    };
    for candidate in candidates {
        let output = Command::new(candidate)
            .args([
                "-c",
                "import sys; print(sys.executable); raise SystemExit(sys.version_info < (3, 11))",
            ])
            .output();
        if let Ok(output) = output {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return Some(PathBuf::from(path));
                }
            }
        }
    }
    None
}

fn bundled_asset(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let candidates = [
        app.path()
            .resolve(
                format!("browser-use/{name}"),
                tauri::path::BaseDirectory::Resource,
            )
            .ok(),
        app.path()
            .resolve(
                format!("resources/browser-use/{name}"),
                tauri::path::BaseDirectory::Resource,
            )
            .ok(),
        std::env::current_dir().ok().map(|cwd| {
            cwd.join("src-tauri")
                .join("resources")
                .join("browser-use")
                .join(name)
        }),
    ];
    candidates
        .into_iter()
        .flatten()
        .find(|path| path.is_file())
        .ok_or_else(|| format!("缺少 browser-use 资源文件: {name}"))
}

fn install_assets(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let root = runtime_dir();
    fs::create_dir_all(&root).map_err(|e| format!("创建 browser-use 目录失败: {e}"))?;
    for folder in ["downloads", "files", "profile"] {
        fs::create_dir_all(root.join(folder)).map_err(|e| format!("创建隔离目录失败: {e}"))?;
    }
    let guard = root.join("browser_use_guard.py");
    let profile = root.join("profile.json");
    fs::copy(bundled_asset(app, "browser_use_guard.py")?, &guard)
        .map_err(|e| format!("安装安全代理失败: {e}"))?;
    fs::copy(bundled_asset(app, "profile.json")?, &profile)
        .map_err(|e| format!("安装隔离配置失败: {e}"))?;

    let mut value: Value =
        serde_json::from_str(&fs::read_to_string(&profile).map_err(|e| e.to_string())?)
            .map_err(|e| format!("解析隔离配置失败: {e}"))?;
    value["browser_profile"]["default"]["user_data_dir"] =
        json!(root.join("profile").to_string_lossy());
    value["browser_profile"]["default"]["downloads_path"] =
        json!(root.join("downloads").to_string_lossy());
    value["browser_profile"]["default"]["file_system_path"] =
        json!(root.join("files").to_string_lossy());
    fs::write(
        &profile,
        serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("写入隔离配置失败: {e}"))?;
    Ok((guard, profile))
}

fn run_checked(program: &Path, args: &[String]) -> Result<String, String> {
    let output = hidden_command(program)
        .args(args)
        .env("PYTHONUTF8", "1")
        .env("PLAYWRIGHT_BROWSERS_PATH", runtime_dir().join("chromium"))
        .output()
        .map_err(|e| format!("执行 {} 失败: {e}", program.display()))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if output.status.success() {
        Ok(if stdout.is_empty() { stderr } else { stdout })
    } else {
        Err(if stderr.is_empty() { stdout } else { stderr })
    }
}

fn server_config(config: &Value) -> Option<&Value> {
    config.get("mcpServers")?.get(SERVER_NAME)
}

fn uv_path() -> PathBuf {
    runtime_dir().join(if cfg!(target_os = "windows") {
        "uv.exe"
    } else {
        "uv"
    })
}

fn uv_download_url() -> Result<String, String> {
    let filename = if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "uv-x86_64-pc-windows-msvc.zip"
    } else if cfg!(all(target_os = "windows", target_arch = "aarch64")) {
        "uv-aarch64-pc-windows-msvc.zip"
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "uv-aarch64-apple-darwin.tar.gz"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "uv-x86_64-apple-darwin.tar.gz"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "uv-x86_64-unknown-linux-gnu.tar.gz"
    } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
        "uv-aarch64-unknown-linux-gnu.tar.gz"
    } else {
        return Err("当前平台没有 browser-use 运行时支持".into());
    };
    Ok(format!(
        "https://github.com/astral-sh/uv/releases/download/{UV_VERSION}/{filename}"
    ))
}

async fn ensure_uv() -> Result<PathBuf, String> {
    let path = uv_path();
    if path.is_file() {
        return Ok(path);
    }
    if let Ok(found) = which::which("uv") {
        return Ok(found);
    }
    let bytes = reqwest::Client::new()
        .get(uv_download_url()?)
        .send()
        .await
        .map_err(|e| format!("下载 uv 失败: {e}"))?
        .error_for_status()
        .map_err(|e| format!("下载 uv 失败: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("读取 uv 失败: {e}"))?;
    fs::create_dir_all(runtime_dir()).map_err(|e| format!("创建运行时目录失败: {e}"))?;
    #[cfg(target_os = "windows")]
    {
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes))
            .map_err(|e| format!("解压 uv 失败: {e}"))?;
        for index in 0..archive.len() {
            let mut entry = archive.by_index(index).map_err(|e| e.to_string())?;
            if entry.name().ends_with("uv.exe") {
                let mut output = fs::File::create(&path).map_err(|e| e.to_string())?;
                std::io::copy(&mut entry, &mut output).map_err(|e| e.to_string())?;
                break;
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let gz = flate2::read::GzDecoder::new(std::io::Cursor::new(bytes));
        let mut archive = tar::Archive::new(gz);
        for item in archive.entries().map_err(|e| e.to_string())? {
            let mut entry = item.map_err(|e| e.to_string())?;
            if entry
                .path()
                .map_err(|e| e.to_string())?
                .file_name()
                .and_then(|v| v.to_str())
                == Some("uv")
            {
                entry.unpack(&path).map_err(|e| e.to_string())?;
                break;
            }
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o755))
                .map_err(|e| e.to_string())?;
        }
    }
    if path.is_file() {
        Ok(path)
    } else {
        Err("uv 下载后未找到可执行文件".into())
    }
}

fn read_permissions(server: Option<&Value>) -> (bool, bool, Vec<String>) {
    let env = server.and_then(|value| value.get("env"));
    let interaction = env
        .and_then(|v| v.get("XINGSHU_BROWSER_ALLOW_INTERACTION"))
        .and_then(Value::as_str)
        == Some("1");
    let autonomous = env
        .and_then(|v| v.get("XINGSHU_BROWSER_ALLOW_AUTONOMOUS"))
        .and_then(Value::as_str)
        == Some("1");
    let domains = env
        .and_then(|v| v.get("BROWSER_USE_ALLOWED_DOMAINS"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .split(',')
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string)
        .collect();
    (interaction, autonomous, domains)
}

fn validate_domains(domains: &[String]) -> Result<Vec<String>, String> {
    let mut cleaned = Vec::new();
    for raw in domains {
        let value = raw.trim().to_ascii_lowercase();
        if value.is_empty() {
            continue;
        }
        if value.contains('/')
            || value.contains(':')
            || value.contains('*')
            || value == "localhost"
            || value.ends_with(".local")
            || value.starts_with('.')
            || value.ends_with('.')
            || !value.contains('.')
        {
            return Err(format!("域名白名单格式无效: {raw}"));
        }
        if !value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-'))
        {
            return Err(format!("域名白名单包含非法字符: {raw}"));
        }
        if !cleaned.contains(&value) {
            cleaned.push(value);
        }
    }
    Ok(cleaned)
}

fn register_config(app: &AppHandle, permissions: BrowserUsePermissions) -> Result<(), String> {
    if permissions.allow_autonomous && permissions.allowed_domains.is_empty() {
        return Err("开启自主浏览器代理前必须至少配置一个域名白名单".into());
    }
    let python = venv_python();
    if !python.is_file() {
        return Err("browser-use 运行时尚未安装".into());
    }
    let (guard, profile) = install_assets(app)?;
    let domains = validate_domains(&permissions.allowed_domains)?;
    let mut config = super::config::read_mcp_config()?;
    if !config.is_object() {
        config = json!({});
    }
    let root = config.as_object_mut().ok_or("MCP 配置格式错误")?;
    let servers = root.entry("mcpServers").or_insert_with(|| json!({}));
    if !servers.is_object() {
        *servers = json!({});
    }
    servers.as_object_mut().unwrap().insert(SERVER_NAME.into(), json!({
        "command": python.to_string_lossy(),
        "args": [guard.to_string_lossy()],
        "cwd": runtime_dir().to_string_lossy(),
        "env": {
            "PYTHONUTF8": "1",
            "ANONYMIZED_TELEMETRY": "false",
            "BROWSER_USE_CLOUD_SYNC": "false",
            "BROWSER_USE_VERSION_CHECK": "false",
            "BROWSER_USE_DISABLE_EXTENSIONS": "true",
            "BROWSER_USE_CONFIG_PATH": profile.to_string_lossy(),
            "PLAYWRIGHT_BROWSERS_PATH": runtime_dir().join("chromium").to_string_lossy(),
            "XINGSHU_BROWSER_ALLOW_INTERACTION": if permissions.allow_interaction { "1" } else { "0" },
            "XINGSHU_BROWSER_ALLOW_AUTONOMOUS": if permissions.allow_autonomous { "1" } else { "0" },
            "BROWSER_USE_ALLOWED_DOMAINS": domains.join(",")
        }
    }));
    super::config::write_mcp_config(config)
}

#[tauri::command]
pub fn browser_use_status() -> Result<Value, String> {
    let python = venv_python();
    let version = if python.is_file() {
        run_checked(
            &python,
            &[
                "-c".into(),
                "import importlib.metadata; print(importlib.metadata.version('browser-use'))"
                    .into(),
            ],
        )
        .ok()
    } else {
        None
    };
    let runtime_ready = python.is_file()
        && run_checked(
            &python,
            &[
                "-c".into(),
                "import os; import browser_use, mcp; from playwright.sync_api import sync_playwright; p=sync_playwright().start(); path=p.chromium.executable_path; p.stop(); assert os.path.isfile(path); print('ready')".into(),
            ],
        )
        .is_ok()
        && runtime_dir().join("browser_use_guard.py").is_file()
        && runtime_dir().join("profile.json").is_file();
    let config = super::config::read_mcp_config().unwrap_or_else(|_| json!({}));
    let server = server_config(&config);
    let (allow_interaction, allow_autonomous, allowed_domains) = read_permissions(server);
    serde_json::to_value(BrowserUseStatus {
        installed: version.as_deref() == Some(BROWSER_USE_VERSION),
        runtime_ready,
        registered: server.is_some(),
        version,
        runtime_dir: runtime_dir().to_string_lossy().to_string(),
        python: if python.is_file() {
            Some(python.to_string_lossy().to_string())
        } else {
            resolve_system_python().map(|p| p.to_string_lossy().to_string())
        },
        allow_interaction,
        allow_autonomous,
        allowed_domains,
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_use_install(app: AppHandle) -> Result<Value, String> {
    let root = runtime_dir();
    fs::create_dir_all(&root).map_err(|e| format!("创建运行时目录失败: {e}"))?;
    let uv = ensure_uv().await?;
    if !venv_python().is_file() {
        run_checked(
            Path::new(&uv),
            &[
                "venv".into(),
                "--python".into(),
                "3.11".into(),
                root.join("venv").to_string_lossy().to_string(),
            ],
        )
        .map_err(|e| format!("自动安装 Python 3.11 运行时失败: {e}"))?;
    }
    run_checked(
        Path::new(&uv),
        &[
            "pip".into(),
            "install".into(),
            "--python".into(),
            venv_python().to_string_lossy().to_string(),
            format!("browser-use=={BROWSER_USE_VERSION}"),
            format!("mcp=={MCP_VERSION}"),
        ],
    )?;
    run_checked(
        &venv_python(),
        &[
            "-m".into(),
            "playwright".into(),
            "install".into(),
            "chromium".into(),
        ],
    )
    .map_err(|e| format!("安装隔离 Chromium 失败: {e}"))?;
    install_assets(&app)?;
    let existing_config = super::config::read_mcp_config().unwrap_or_else(|_| json!({}));
    let (allow_interaction, allow_autonomous, allowed_domains) =
        read_permissions(server_config(&existing_config));
    register_config(
        &app,
        BrowserUsePermissions {
            allow_interaction,
            allow_autonomous,
            allowed_domains,
        },
    )?;
    super::config::do_reload_gateway(&app).await?;
    browser_use_status()
}

#[tauri::command]
pub async fn browser_use_configure(
    app: AppHandle,
    permissions: BrowserUsePermissions,
) -> Result<Value, String> {
    register_config(&app, permissions)?;
    super::config::do_reload_gateway(&app).await?;
    browser_use_status()
}

fn remove_registration() -> Result<(), String> {
    let mut config = super::config::read_mcp_config()?;
    if let Some(servers) = config.get_mut("mcpServers").and_then(Value::as_object_mut) {
        servers.remove(SERVER_NAME);
    }
    super::config::write_mcp_config(config)
}

#[tauri::command]
pub async fn browser_use_unregister(app: AppHandle) -> Result<Value, String> {
    remove_registration()?;
    super::config::do_reload_gateway(&app).await?;
    browser_use_status()
}

#[tauri::command]
pub async fn browser_use_uninstall(app: AppHandle) -> Result<Value, String> {
    remove_registration()?;
    let root = runtime_dir();
    if root.is_dir() {
        fs::remove_dir_all(&root).map_err(|e| format!("删除 browser-use 运行时失败: {e}"))?;
    }
    super::config::do_reload_gateway(&app).await?;
    browser_use_status()
}
