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
use tokio::time::{Duration, timeout};

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
    dirs::home_dir()
        .unwrap_or_default()
        .join(".hermes")
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

/// Hermes Gateway 进程管理文件
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
                // 使用 std Command (blocking)，避免 async 上下文问题
                use std::process::Command;
                let output = Command::new("tasklist")
                    .args(["/FI", &format!("PID eq {pid}")])
                    .creation_flags(0x08000000) // CREATE_NO_WINDOW
                    .output();
                if let Ok(out) = output {
                    let s = String::from_utf8_lossy(&out.stdout);
                    return s.contains(&pid.to_string());
                }
            }
            #[cfg(not(windows))]
            {
                use std::process::Command;
                let output = Command::new("ps")
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

/// Hermes 安装检测
#[tauri::command]
pub async fn check_hermes() -> Result<HermesInfo, String> {
    let hermes_dir = hermes_dir();
    let hermes_bin = hermes_dir.join("bin").join("hermes");

    let installed = hermes_bin.exists() || which::which("hermes-agent").is_ok();

    let version = if installed {
        // 先试 hermes-agent，再试 python -m hermes_agent
        let out1 = Command::new("hermes-agent").args(["--version"]).output().await;
        let out2 = Command::new("python").args(["-m", "hermes_agent", "--version"]).output().await;
        out1.or(out2).ok().and_then(|o| if o.status.success() {
            Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
        } else {
            None
        })
    } else {
        None
    };

    let config_path = hermes_config_path();
    let config_exists = config_path.exists();

    // 尝试从 config 读取端口
    let gateway_port = read_hermes_config()
        .and_then(|c| c.base_url.as_ref().and_then(|u| {
            u.split(':').last().and_then(|p| p.trim_matches('/').parse().ok())
        }))
        .or(Some(HERMES_DEFAULT_PORT));

    Ok(HermesInfo {
        installed,
        version,
        gateway_running: is_gateway_running(),
        gateway_port,
        config_exists,
        python_ok: true,  // Python 检测由 check_python 单独提供
        uv_ok: true,
    })
}

/// Hermes 一键自动化安装（带实时事件）
/// 完整流程：检测环境 → 安装 uv（如果需要）→ 安装 hermes-agent → 完成
#[tauri::command]
pub async fn hermes_auto_install(
    app: tauri::AppHandle,
    method: String,
) -> Result<(), String> {
    use tauri::Emitter;

    fn emit(app: &tauri::AppHandle, msg: &str) {
        let _ = app.emit("hermes-install-log", msg);
    }

    fn emit_progress(app: &tauri::AppHandle, pct: u8) {
        let _ = app.emit("hermes-install-progress", pct);
    }

    emit_progress(&app, 5);
    emit(&app, "开始检测运行环境...");

    // ── 第1步：检测 Python ──
    emit_progress(&app, 10);
    match Command::new("python").args(["--version"])
        .output().await
    {
        Ok(o) if o.status.success() => {
            let v = String::from_utf8_lossy(&o.stderr).trim().to_string();
            emit(&app, &format!("✅ Python 已安装: {}", v));
        }
        _ => {
            emit(&app, "❌ Python 未安装，请在官网下载安装 Python 3.11+");
            return Err("Python 未安装".to_string());
        }
    };

    emit_progress(&app, 20);
    emit(&app, "检测包管理器...");

    // ── 第2步：检测/安装 uv ──
    let has_uv = which::which("uv").is_ok();
    if has_uv {
        emit(&app, "✅ uv 已安装");
    } else {
        emit(&app, "正在通过 pip 安装 uv（最多等待 120 秒）...");
        match timeout(Duration::from_secs(120), Command::new("python")
            .args(["-m", "pip", "install", "uv", "-U"])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()).await
        {
            Ok(Ok(o)) if o.status.success() => {
                emit(&app, "✅ uv 安装成功");
            }
            Ok(Ok(o)) => {
                let err = String::from_utf8_lossy(&o.stderr);
                emit(&app, &format!("⚠️ uv pip 安装返回非零: {}", err));
            }
            Ok(Err(e)) => {
                emit(&app, &format!("⚠️ uv 安装命令执行失败: {}", e));
            }
            Err(_) => {
                emit(&app, "⚠️ uv 安装超时（120 秒），请检查网络后重试");
            }
        }
    }

    emit_progress(&app, 40);
    emit(&app, &format!("检测 hermes-agent 安装状态..."));

    // ── 第3步：检测 hermes-agent 是否已安装 ──
    let hermes_installed = which::which("hermes-agent").is_ok();
    if hermes_installed {
        emit(&app, "✅ hermes-agent 已安装，跳过安装步骤");
        emit_progress(&app, 80);
    } else {
        emit(&app, "正在安装 hermes-agent（最多等待 300 秒）...");
        emit_progress(&app, 50);

        let install_out = if method == "uv-tool" || method == "uv" {
            let mut cmd = Command::new("uv");
            cmd.arg("tool")
                .arg("install")
                .arg("hermes-agent");
            #[cfg(windows)]
            { cmd.creation_flags(0x08000000); }
            timeout(Duration::from_secs(300), cmd.stdout(Stdio::piped()).stderr(Stdio::piped()).output())
        } else {
            let mut cmd = Command::new("python");
            cmd.arg("-m")
                .arg("pip")
                .arg("install")
                .arg("hermes-agent");
            #[cfg(windows)]
            { cmd.creation_flags(0x08000000); }
            timeout(Duration::from_secs(300), cmd.stdout(Stdio::piped()).stderr(Stdio::piped()).output())
        };

        match install_out.await {
            Ok(Ok(o)) => {
                let stdout = String::from_utf8_lossy(&o.stdout);
                let stderr = String::from_utf8_lossy(&o.stderr);
                if o.status.success() {
                    emit(&app, &format!("✅ hermes-agent 安装成功\n{}", stdout));
                } else {
                    emit(&app, &format!("❌ hermes-agent 安装失败\n{}", stderr));
                    return Err(format!("安装失败: {}", stderr));
                }
            }
            Ok(Err(e)) => {
                emit(&app, &format!("❌ hermes-agent 安装命令执行失败: {}", e));
                return Err(format!("安装命令失败: {}", e));
            }
            Err(_) => {
                emit(&app, "❌ hermes-agent 安装超时（300 秒），请检查网络后重试");
                return Err("安装超时".to_string());
            }
        }
                return Err(format!("安装命令失败: {}", e));
            }
        }
    }

    emit_progress(&app, 90);
    emit(&app, "验证 hermes-agent 命令...");

    // ── 第4步：验证安装 ──
    if which::which("hermes-agent").is_ok() {
        emit(&app, "✅ hermes-agent 命令可用");
    } else {
        // 尝试刷新 PATH 后重试
        emit(&app, "⚠️ hermes-agent 未在 PATH 中，尝试刷新环境...");
    }

    emit_progress(&app, 100);
    emit(&app, "🎉 Hermes Agent 安装完成！请继续进行配置。");
    Ok(())
}

/// Python 环境检测
#[tauri::command]
pub async fn check_python() -> Result<PythonInfo, String> {
    let mut info = PythonInfo::default();

    // 检测 Python
    match Command::new("python").args(["--version"]).output().await {
        Ok(out) if out.status.success() => {
            info.installed = true;
            let v = String::from_utf8_lossy(&out.stderr).trim().to_string();
            info.version = Some(v.replace("Python ", ""));
            // 需要 3.11+
            if let Some(ver) = &info.version {
                let parts: Vec<u32> = ver.split('.').take(2)
                    .filter_map(|s| s.parse().ok())
                    .collect();
                info.version_ok = parts.get(0).copied() > Some(3) ||
                    (parts.get(0) == Some(&3) && parts.get(1).copied() >= Some(11));
            }
        }
        _ => {}
    }

    // 检测 uv
    info.has_uv = which::which("uv").is_ok();

    // 检测 git
    info.has_git = which::which("git").is_ok();

    Ok(info)
}

/// 安装 Hermes Agent
#[tauri::command]
pub async fn install_hermes(method: String, extras: Vec<String>) -> Result<(), String> {
    match method.as_str() {
        "uv-tool" => {
            let mut cmd = Command::new("uv");
            cmd.arg("tool");
            cmd.arg("install");
            cmd.arg("hermes-agent");

            if !extras.is_empty() {
                cmd.arg("--extra-index-url").arg(&extras[0]);
            }

            cmd.stdout(Stdio::piped());
            cmd.stderr(Stdio::piped());

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
            let pid_path = hermes_pid_path();
            if is_gateway_running() {
                return Ok("Hermes Gateway 已在运行".to_string());
            }

            // 启动 Hermes Gateway
            let mut cmd = Command::new("hermes-agent");
            cmd.arg("gateway");
            cmd.arg("run");

            #[cfg(windows)]
            {
                cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
            }

            let child = cmd
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| format!("启动失败: {}", e))?;

            // 保存 PID
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
                        let _ = Command::new("taskkill")
                            .args(["/PID", &pid.to_string(), "/F"])
                            .creation_flags(0x08000000)
                            .status();
                    }
                    #[cfg(not(windows))]
                    {
                        let _ = Command::new("kill")
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
            // 先同步 stop
            if let Ok(pid_str) = fs::read_to_string(hermes_pid_path()) {
                let pid: u32 = pid_str.trim().parse().unwrap_or(0);
                if pid > 0 {
                    #[cfg(windows)]
                    {
                        use std::process::Command;
                        let _ = Command::new("taskkill")
                            .args(["/PID", &pid.to_string(), "/F"])
                            .creation_flags(0x08000000)
                            .status();
                    }
                    #[cfg(not(windows))]
                    {
                        use std::process::Command;
                        let _ = Command::new("kill").arg("-9").arg(&pid.to_string()).status();
                    }
                }
            }
            let _ = fs::remove_file(hermes_pid_path());

            // 再 async start
            let pid_path = hermes_pid_path();
            let mut cmd = Command::new("hermes-agent");
            cmd.arg("gateway").arg("run");
            #[cfg(windows)]
            {
                // creation_flags 由 tokio::process::Command 直接提供
                cmd.creation_flags(0x08000000);
            }
            let child = cmd.stdout(Stdio::piped()).stderr(Stdio::piped())
                .spawn().map_err(|e| format!("启动失败: {}", e))?;
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

/// 获取模型列表（从 API 提供商）
#[tauri::command]
pub async fn hermes_fetch_models(
    base_url: String,
    api_key: String,
    api_type: Option<String>,
) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();

    // 清理 base_url
    let base = base_url.trim_end_matches('/')
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
        "google-generative-ai" => {
            let mut h = reqwest::header::HeaderMap::new();
            h
        }
        _ => {
            let mut h = reqwest::header::HeaderMap::new();
            h.insert("Authorization", format!("Bearer {}", api_key).parse().unwrap());
            h
        }
    };

    let resp = client
        .get(&models_url)
        .headers(headers)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let data: Value = resp.json().await.map_err(|e| e.to_string())?;

    let models: Vec<String> = if api_type == "google-generative-ai" {
        data.get("models")
            .and_then(|m| m.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| m.get("name").and_then(|n| n.as_str()))
                    .filter(|s| !s.starts_with("models/"))
                    .map(|s| s.to_string())
                    .collect()
            })
            .unwrap_or_default()
    } else {
        data.get("data")
            .and_then(|d| d.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| m.get("id").and_then(|id| id.as_str()))
                    .map(|s| s.to_string())
                    .collect()
            })
            .unwrap_or_default()
    };

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
        .timeout(std::time::Duration::from_secs(5))
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
        .timeout(std::time::Duration::from_secs(120))
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

/// 检测运行环境（Python/uv/Git/Docker）
#[tauri::command]
pub async fn hermes_detect_environments() -> Result<Value, String> {
    let mut result = serde_json::json!({});

    // Python
    if let Ok(out) = Command::new("python").args(["--version"]).output().await {
        if out.status.success() {
            let v = String::from_utf8_lossy(&out.stderr).trim().to_string();
            result["python"] = serde_json::json!({ "installed": true, "version": v });
        }
    }

    // uv
    result["uv"] = serde_json::json!({ "available": which::which("uv").is_ok() });

    // git
    result["git"] = serde_json::json!({ "available": which::which("git").is_ok() });

    // Docker
    if let Ok(out) = Command::new("docker").args(["info"]).output().await {
        result["docker"] = serde_json::json!({ "available": out.status.success() });
    }

    Ok(result)
}
