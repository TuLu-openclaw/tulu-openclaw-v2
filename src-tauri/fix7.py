path = 'C:/Users/User/tulu-openclaw-v2/src-tauri/src/commands/assistant.rs'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

# Add a function that writes status to OpenClaw workspace
new_func = '''

/// 同步 OpenClaw 状态到龙虾办公室（写入 workspace/openclaw-office-state.json）
#[tauri::command]
pub async fn sync_openclaw_to_office(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    
    // 获取 OpenClaw workspace 路径
    let workspace = app.path().home_dir()
        .map_err(|e| e.to_string())?
        .join(".openclaw")
        .join("workspace");
    
    let state_file = workspace.join("openclaw-office-state.json");
    
    // 获取服务状态
    let services = crate::commands::service::get_services_status().await.unwrap_or_default();
    
    // 构建状态
    let mut status = serde_json::json!({
        "gateway_online": false,
        "hermes_online": false,
        "openclaw_online": false,
        "updated_at": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0)
    });
    
    for svc in &services {
        let name_lower = svc.label.to_lowercase();
        let is_online = svc.status == "running" || svc.status == "online";
        if name_lower.contains("gateway") {
            status["gateway_online"] = serde_json::Value::Bool(is_online);
        }
        if name_lower.contains("hermes") {
            status["hermes_online"] = serde_json::Value::Bool(is_online);
        }
        if name_lower.contains("openclaw") {
            status["openclaw_online"] = serde_json::Value::Bool(is_online);
        }
    }
    
    let json_str = serde_json::to_string_pretty(&status).map_err(|e| e.to_string())?;
    std::fs::write(&state_file, json_str).map_err(|e| e.to_string())?;
    
    Ok(())
}
'''

c = c.rstrip() + '\n' + new_func

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('Done: added sync_openclaw_to_office')
