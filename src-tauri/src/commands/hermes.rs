//! Hermes Agent 命令
//! 与 Hermes Gateway (Python) 交互，管理安装、配置和运行

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use tokio::process::Command;
use tokio::time::Duration;

const HERMES_DEFAULT_PORT: u16 = 8642;

/// Hermes 安装信息
#[derive(Debug, Serialize, Deserialize, Default)]
pub struct HermesInfo {
    pub installed: bool,
    pub version: Option<String>,
    pub gateway_running: bool,
    pub gateway_port: Option<u16>,
    pub config_exists: bool,
    pub python_ok: bool,
    pub uv_ok: bool,
}

/// Python 检测结果
#[derive(Debug, Serialize, Deserialize, Default)]
pub struct PythonInfo {
    pub installed: bool,
    pub version: Option<String>,
    pub version_ok: bool,
    pub has_uv: bool,
    pub has_git: bool,
}

/// Hermes 配置
#[derive(Debug, Serialize, Deserialize, Default)]
pub struct HermesConfig {
    pub provider: Option<String>,
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub base_url: Option<String>,
}

/// 获取 Hermes 配置目录
fn hermes_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_default().join(".hermes")
}

/// 获取 Hermes 配置路径
fn hermes_config_path() -> PathBuf {
    hermes_dir().join("config.json")
}

/// 读取 Hermes 配置
fn read_hermes_config() -> Option<HermesConfig> {
    let path = hermes_config_path();
    if !path.exists() {
        return None;
    }
    let content = fs::read_to_string(&path).ok()?;
    serde_json::from_str(&content).ok()
}

/// 写 Hermes 配置
fn write_hermes_config(cfg: &HermesConfig) -> Result<(), String> {
    let path = hermes_config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())
}

/// Hermes Gateway 进程 PID 文件路径
fn hermes_pid_path() -> PathBuf {
    hermes_dir().join("gateway.pid")
}

/// 检查 Hermes Gateway 是否在运行
fn is_gateway_running() -> bool {
    if let Ok(pid) = fs::read_to_string(hermes_pid_path()) {
        let pid: u32 = pid.trim().parse().unwrap_or(0);
        if pid > 0 {
            #[cfg(windows)]
            {
                let output = std::process::Command::new("tasklist")
                    .args(["/FI", &format!("PID eq {pid}")])
                    .creation_flags(0x08000000)
                    .output();
                if let Ok(out) = output {
                    let s = String::from_utf8_lossy(&out.stdout);
                    return s.contains(&pid.to_string());
                }
            }
            #[cfg(not(windows))]
            {
                let output = std::process::Command::new("ps")
                    .args(["-p", &pid.to_string()])
                    .output();
                if let Ok(out) = output {
                    return out.status.success();
                }
            }
        }
    }
    false
}

/// Hermes 安装检查
#[tauri::command]
pub async fn check_hermes() -> Result<HermesInfo, String> {
    let hermes_bin = hermes_dir().join("bin").join("hermes");
    let installed = hermes_bin.exists() || which::which("hermes-agent").is_ok();
    let version = if installed {
        let out1 = Command::new("hermes-agent").args(["--version"]).output().await;
        let out2 = Command::new("python")
            .args(["-m", "hermes_agent", "--version"])
            .output()
            .await;
        out1.or(out2).ok().and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        })
    } else {
        None
    };
    let config_path = hermes_config_path();
    let config_exists = config_path.exists();
    let gateway_port = read_hermes_config()
        .and_then(|c| {
            c.base_url.as_ref().and_then(|u| {
                u.split(':')
                    .last()
                    .and_then(|p| p.trim_matches('/').parse().ok())
            })
        })
        .or(Some(HERMES_DEFAULT_PORT));

    Ok(HermesInfo {
        installed,
        version,
        gateway_running: is_gateway_running(),
        gateway_port,
        config_exists,
        python_ok: true,
        uv_ok: true,
    })
}

/// Python 环境检测
#[tauri::command]
pub async fn check_python() -> Result<PythonInfo, String> {
    let mut info = PythonInfo::default();

    match Command::new("python").args(["--version"]).output().await {
        Ok(out) if out.status.success() => {
            info.installed = true;
            let v = String::from_utf8_lossy(&out.stderr).trim().to_string();
            info.version = Some(v.replace("Python ", ""));
            if let Some(ver) = &info.version {
                let parts: Vec<u32> = ver
                    .split('.')
                    .take(2)
                    .filter_map(|s| s.parse().ok())
                    .collect();
                info.version_ok =
                    parts.get(0).copied() > Some(3)
                        || (parts.get(0) == Some(&3) && parts.get(1).copied() >= Some(11));
            }
        }
        _ => {}
    }

    info.has_uv = which::which("uv").is_ok();
    info.has_git = which::which("git").is_ok();

    Ok(info)
}

/// 安装 Hermes Agent
#[tauri::command]
pub async fn install_hermes(
    method: String,
    extras: Vec<String>,
) -> Result<(), String> {
    match method.as_str() {
        "uv-tool" => {
            let mut cmd = Command::new("uv");
            cmd.arg("tool").arg("install").arg("hermes-agent");
            if !extras.is_empty() {
                cmd.arg("--extra-index-url").arg(&extras[0]);
            }
            #[cfg(windows)]
            {
                cmd.creation_flags(0x08000000);
            }
            cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
            let status = cmd.status().await.map_err(|e| e.to_string())?;
            if !status.success() {
                return Err("安装失败".to_string());
            }
            Ok(())
        }
        _ => Err(format!("不支持的安装方式: {}", method)),
    }
}

/// Hermes Gateway 操作 (start/stop/restart)
#[tauri::command]
pub async fn hermes_gateway_action(action: String) -> Result<String, String> {
    match action.as_str() {
        "start" => {
            if is_gateway_running() {
                return Ok("Hermes Gateway 已在运行".to_string());
            }
            let mut cmd = Command::new("hermes-agent");
            cmd.arg("gateway").arg("run");
            #[cfg(windows)]
            {
                cmd.creation_flags(0x08000000);
            }
            let child = cmd
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| format!("启动失败: {}", e))?;
            let pid_path = hermes_pid_path();
            if let Some(parent) = pid_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(&pid_path, child.id().unwrap_or(0).to_string());
            Ok("Hermes Gateway 已启动".to_string())
        }
        "stop" => {
            if let Ok(pid_str) = fs::read_to_string(hermes_pid_path()) {
                let pid: u32 = pid_str.trim().parse().unwrap_or(0);
                if pid > 0 {
                    #[cfg(windows)]
                    {
                        let _ = std::process::Command::new("taskkill")
                            .args(["/PID", &pid.to_string(), "/F"])
                            .creation_flags(0x08000000)
                            .status();
                    }
                    #[cfg(not(windows))]
                    {
                        let _ = std::process::Command::new("kill")
                            .arg("-9")
                            .arg(&pid.to_string())
                            .status();
                    }
                }
            }
            let _ = fs::remove_file(hermes_pid_path());
            Ok("Hermes Gateway 已停止".to_string())
        }
        "restart" => {
            if let Ok(pid_str) = fs::read_to_string(hermes_pid_path()) {
                let pid: u32 = pid_str.trim().parse().unwrap_or(0);
                if pid > 0 {
                    #[cfg(windows)]
                    {
                        let _ = std::process::Command::new("taskkill")
                            .args(["/PID", &pid.to_string(), "/F"])
                            .creation_flags(0x08000000)
                            .status();
                    }
                    #[cfg(not(windows))]
                    {
                        let _ = std::process::Command::new("kill")
                            .arg("-9")
                            .arg(&pid.to_string())
                            .status();
                    }
                }
            }
            let _ = fs::remove_file(hermes_pid_path());

            let mut cmd = Command::new("hermes-agent");
            cmd.arg("gateway").arg("run");
            #[cfg(windows)]
            {
                cmd.creation_flags(0x08000000);
            }
            let child = cmd
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| format!("启动失败: {}", e))?;
            let pid_path = hermes_pid_path();
            if let Some(parent) = pid_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::write(&pid_path, child.id().unwrap_or(0).to_string());
            Ok("Hermes Gateway 已重启".to_string())
        }
        _ => Err(format!("未知操作: {}", action)),
    }
}

/// 设置 Hermes Gateway URL
#[tauri::command]
pub async fn hermes_set_gateway_url(url: String) -> Result<String, String> {
    let mut cfg = read_hermes_config().unwrap_or_default();
    cfg.base_url = Some(url.clone());
    write_hermes_config(&cfg)?;
    Ok(format!("Gateway URL 已设置为 {}", url))
}

/// 读取 Hermes 配置
#[tauri::command]
pub fn hermes_read_config() -> Result<HermesConfig, String> {
    read_hermes_config().ok_or_else(|| "配置文件不存在".to_string())
}

/// 配置 Hermes (API Key + Model)
#[tauri::command]
pub async fn configure_hermes(
    provider: String,
    api_key: String,
    model: String,
    base_url: Option<String>,
) -> Result<(), String> {
    let cfg = HermesConfig {
        provider: Some(provider),
        api_key: Some(api_key),
        model: Some(model),
        base_url,
    };
    write_hermes_config(&cfg)
}

/// 获取模型列表
#[tauri::command]
pub async fn hermes_fetch_models(
    base_url: String,
    api_key: String,
    api_type: Option<String>,
) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let base = base_url
        .trim_end_matches('/')
        .replace("/chat/completions", "")
        .replace("/completions", "")
        .replace("/responses", "")
        .replace("/messages", "")
        .replace("/models", "");

    let api_type = api_type.as_deref().unwrap_or("openai-completions");
    let models_url = match api_type {
        "anthropic-messages" => format!("{}/v1/models", base),
        "google-generative-ai" => format!("{}/models?key={}", base, api_key),
        _ => format!("{}/models", base),
    };

    let headers = match api_type {
        "anthropic-messages" => {
            let mut h = reqwest::header::HeaderMap::new();
            h.insert("anthropic-version", "2023-06-01".parse().unwrap());
            h.insert("x-api-key", api_key.parse().unwrap());
            h
        }
        _ => {
            let mut h = reqwest::header::HeaderMap::new();
            h.insert(
                "Authorization",
                format!("Bearer {}", api_key).parse().unwrap(),
            );
            h
        }
    };

    let resp = client
        .get(&models_url)
        .headers(headers)
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let data: Value = resp.json().await.map_err(|e| e.to_string())?;

    let models: Vec<String> = data
        .get("data")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m.get("id").and_then(|id| id.as_str()))
                .map(|s| s.to_string())
                .collect()
        })
        .unwrap_or_default();

    Ok(models)
}

/// Hermes Gateway 健康检查
#[tauri::command]
pub async fn hermes_health_check() -> Result<bool, String> {
    let cfg = read_hermes_config().ok_or("未配置 Hermes")?;
    let default_url = format!("http://127.0.0.1:{}", HERMES_DEFAULT_PORT);
    let base_url = cfg.base_url.as_deref().unwrap_or(&default_url);
    let client = reqwest::Client::new();
    let resp = client
        .get(&format!("{}/health", base_url))
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(resp.status().is_success())
}

/// 发送消息到 Hermes Agent
#[tauri::command]
pub async fn hermes_agent_run(
    prompt: String,
    session_id: Option<String>,
    history: Option<Vec<HashMap<String, String>>>,
    instructions: Option<String>,
) -> Result<Value, String> {
    let cfg = read_hermes_config().ok_or("未配置 Hermes")?;
    let default_url = format!("http://127.0.0.1:{}", HERMES_DEFAULT_PORT);
    let base_url = cfg.base_url.as_deref().unwrap_or(&default_url);
    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "prompt": prompt,
        "session_id": session_id,
        "history": history,
        "instructions": instructions,
        "model": cfg.model,
    });

    let resp = client
        .post(&format!("{}/v1/runs", base_url))
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Hermes API 错误: HTTP {}", resp.status()));
    }

    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(data)
}

/// 更新当前模型
#[tauri::command]
pub async fn hermes_update_model(model: String) -> Result<(), String> {
    let mut cfg = read_hermes_config().ok_or("未配置 Hermes")?;
    cfg.model = Some(model);
    write_hermes_config(&cfg)
}

/// 检测运行环境
#[tauri::command]
pub async fn hermes_detect_environments() -> Result<Value, String> {
    let mut result = serde_json::json!({});

    if let Ok(out) = Command::new("python").args(["--version"]).output().await {
        if out.status.success() {
            let v = String::from_utf8_lossy(&out.stderr).trim().to_string();
            result["python"] = serde_json::json!({ "installed": true, "version": v });
        }
    }

    result["uv"] = serde_json::json!({ "available": which::which("uv").is_ok() });
    result["git"] = serde_json::json!({ "available": which::which("git").is_ok() });

    if let Ok(out) = Command::new("docker").args(["info"]).output().await {
        result["docker"] = serde_json::json!({ "available": out.status.success() });
    }

    Ok(result)
}
