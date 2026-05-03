import sys
import os

filepath = r'C:\Users\User\tulu-openclaw-v2\src-tauri\src\commands\assistant.rs'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Find the section to replace
start_marker = '/// \u67e5\u627e Star-Office-UI-master \u76ee\u5f55'
end_marker = '/// \u5217\u51fa\u76ee\u5f55\u5185\u5bb9'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx < 0 or end_idx < 0:
    print(f'ERROR: markers not found start={start_idx} end={end_idx}')
    sys.exit(1)

replacement = r'''/// 查找 Star-Office-UI-master 目录（优先 resource_dir，回退多级路径）
fn find_star_office_dir(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    // 1. 优先从 Tauri resource_dir 查找（打包后的正确路径）
    if let Ok(res_dir) = app.path().resource_dir() {
        let candidate = res_dir.join("Star-Office-UI-master");
        if candidate.join("backend").join("app.py").exists() {
            return Some(candidate);
        }
    }
    // 2. 开发模式：exe 在 src-tauri/target/debug/，需要往上跳到项目根
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_default();
    let dev_candidates = [
        exe_dir.join("..").join("..").join("..").join("..").join("_vendor").join("Star-Office-UI-master"),
        exe_dir.join("..").join("..").join("..").join("_vendor").join("Star-Office-UI-master"),
    ];
    for p in &dev_candidates {
        let resolved = p.canonicalize().unwrap_or_else(|_| p.clone());
        if resolved.join("backend").join("app.py").exists() {
            return Some(resolved);
        }
    }
    None
}

/// 启动 Star-Office-UI Python 后端
async fn start_star_office_backend(app: &tauri::AppHandle) -> Result<u16, String> {
    let port: u16 = 19000;
    let addr: std::net::SocketAddr = format!("127.0.0.1:{port}").parse().unwrap();
    // 检查后端是否已在运行
    if std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_millis(300)).is_ok() {
        return Ok(port);
    }
    let office_dir = find_star_office_dir(app)
        .ok_or_else(|| {
            let exe_dir = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                .unwrap_or_default();
            let res_dir = app.path().resource_dir().unwrap_or_default();
            format!(
                "未找到 Star-Office-UI-master 目录。\n已查找:\n- {} (resource_dir)\n- {} (exe 上级)",
                res_dir.join("Star-Office-UI-master").display(),
                exe_dir.join("..").join("..").join("..").join("..").join("_vendor").join("Star-Office-UI-master").display()
            )
        })?;
    // 确保 state.json 存在
    let state_file = office_dir.join("state.json");
    if !state_file.exists() {
        let sample = office_dir.join("state.sample.json");
        if sample.exists() {
            let _ = std::fs::copy(&sample, &state_file);
        } else {
            let _ = std::fs::write(
                &state_file,
                r#"{"state":"idle","detail":"待命中","progress":0}"#,
            );
        }
    }
    let agents_file = office_dir.join("agents-state.json");
    if !agents_file.exists() {
        let _ = std::fs::write(&agents_file, "{}");
    }
    // 检测 Python
    let python_candidates = ["python3", "python", "py"];
    let mut python_cmd = None;
    for cmd in &python_candidates {
        let mut check = std::process::Command::new(cmd);
        check.args(["--version"]);
        #[cfg(target_os = "windows")]
        check.creation_flags(0x08000000);
        if check.output().map(|o| o.status.success()).unwrap_or(false) {
            python_cmd = Some(cmd.to_string());
            break;
        }
    }
    let python = python_cmd.ok_or_else(|| "未找到 Python，请先安装 Python 3.10+ 并添加到 PATH".to_string())?;
    // 安装依赖（如果 requirements.txt 存在）
    let req_file = office_dir.join("backend").join("requirements.txt");
    if req_file.exists() {
        let mut install = std::process::Command::new(&python);
        install.args(["-m", "pip", "install", "-q", "-r", "requirements.txt"])
            .current_dir(&office_dir);
        #[cfg(target_os = "windows")]
        install.creation_flags(0x08000000);
        let _ = install.output();
    }
    // 启动后端
    let log_path = office_dir.join("backend-run.log");
    let log_file = std::fs::File::create(&log_path).map_err(|e| format!("创建日志失败: {e}"))?;
    let log_err = log_file.try_clone().map_err(|e| format!("克隆日志失败: {e}"))?;
    let mut cmd = std::process::Command::new(&python);
    cmd.args(["backend/app.py"])
        .current_dir(&office_dir)
        .stdin(std::process::Stdio::null())
        .stdout(log_file)
        .stderr(log_err)
        .env("STAR_BACKEND_PORT", port.to_string());
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    let child = cmd.spawn().map_err(|e| format!("启动 Star-Office 后端失败: {e}"))?;
    STAR_OFFICE_PID.store(child.id(), std::sync::atomic::Ordering::SeqCst);
    // 等待后端就绪
    for _ in 0..30 {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        if std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_millis(300)).is_ok() {
            return Ok(port);
        }
    }
    Err("Star-Office 后端启动超时（15秒），请检查 Python 环境和 backend-run.log".into())
}

/// 打开龙虾办公室独立窗口
#[tauri::command]
pub async fn open_lobster_office(app: tauri::AppHandle) -> Result<String, String> {
    use std::time::{SystemTime, UNIX_EPOCH};
    use tauri::WebviewUrl;
    use tauri::WebviewWindowBuilder;

    let port = start_star_office_backend(&app).await?;
    let url = format!("http://127.0.0.1:{port}");
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let window_label = format!("lobster_office_{}", ts);

    WebviewWindowBuilder::new(
        &app,
        &window_label,
        WebviewUrl::External(url.parse().unwrap()),
    )
    .title("\u9f99\u867e\u529e\u516c\u5ba4")
    .inner_size(1280.0, 800.0)
    .min_inner_size(960.0, 640.0)
    .resizable(true)
    .decorations(true)
    .center()
    .build()
    .map_err(|e| format!("\u521b\u5efa\u9f99\u867e\u529e\u516c\u5ba4\u7a97\u53e3\u5931\u8d25: {}", e))?;

    Ok("ok".into())
}

'''

content = content[:start_idx] + replacement + content[end_idx:]
with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print('OK')
