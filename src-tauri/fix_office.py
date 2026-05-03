path = 'C:/Users/User/tulu-openclaw-v2/src-tauri/src/commands/assistant.rs'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

# Remove old implementations
import re

# Remove old update_office_state
pattern = r'/// 更新龙虾办公室状态.*?Ok\(\(\)\)\s*\}'
match = re.search(pattern, c, re.DOTALL)
if match:
    c = c[:match.start()] + c[match.end():]
    print('Removed old update_office_state')

# Remove old sync_openclaw_to_office
pattern = r'/// 同步 OpenClaw 状态到龙虾办公室.*?Ok\(\(\)\)\s*\}'
match = re.search(pattern, c, re.DOTALL)
if match:
    c = c[:match.start()] + c[match.end():]
    print('Removed old sync_openclaw_to_office')

new_code = '''
/// 龙虾办公室状态同步 - 后台线程写入状态文件
/// 
/// 状态文件路径: %APPDATA%/TuLuOpenClaw_v2/openclaw-office-state.json
/// Star-Office-UI 后端读取此文件，自动映射到办公室状态

use std::sync::OnceLock;
static OFFICE_SYNC_HANDLE: OnceLock<std::thread::JoinHandle<()>> = OnceLock::new();

/// 启动龙虾办公室状态同步后台线程
pub fn start_office_sync(app: tauri::AppHandle) {
    OFFICE_SYNC_HANDLE.get_or_init(move || {
        std::thread::spawn(move || {
            loop {
                std::thread::sleep(std::time::Duration::from_secs(5));
                if let Err(e) = sync_office_state(&app) {
                    eprintln!("[Office Sync] 同步失败: {e}");
                }
            }
        })
    });
}

/// 同步当前状态到龙虾办公室
fn sync_office_state(app: &tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    
    // 确定状态文件路径
    let state_file = app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("openclaw-office-state.json");
    
    // 确保目录存在
    if let Some(parent) = state_file.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    // 检查各服务状态
    let services = tokio::runtime::Runtime::new()
        .map_err(|e| e.to_string())?
        .block_on(crate::commands::service::get_services_status())
        .unwrap_or_default();
    
    let mut gateway_online = false;
    let mut hermes_online = false;
    let mut services_status = serde_json::Map::new();
    
    for svc in &services {
        let name = svc.label.clone();
        let running = svc.running;
        services_status.insert(name.clone(), serde_json::json!({
            "running": running,
            "description": svc.description
        }));
        
        let name_lower = name.to_lowercase();
        if name_lower.contains("gateway") || name_lower.contains("openclaw") {
            gateway_online = running;
        }
        if name_lower.contains("hermes") {
            hermes_online = running;
        }
    }
    
    // 确定综合状态
    let (state, detail) = if !gateway_online {
        ("idle".to_string(), "OpenClaw 离线".to_string())
    } else if gateway_online && hermes_online {
        ("writing".to_string(), "OpenClaw + Hermes 运行中".to_string())
    } else if gateway_online {
        ("executing".to_string(), "OpenClaw Gateway 运行中".to_string())
    } else {
        ("idle".to_string(), "待命中".to_string())
    };
    
    // 构建完整状态
    let state_data = serde_json::json!({
        "state": state,
        "detail": detail,
        "progress": 0,
        "updated_at": chrono_now(),
        "services": services_status,
        "gateway_online": gateway_online,
        "hermes_online": hermes_online,
        "agent_name": "爱羽"
    });
    
    // 写入文件
    let json_str = serde_json::to_string_pretty(&state_data).map_err(|e| e.to_string())?;
    std::fs::write(&state_file, json_str).map_err(|e| e.to_string())?;
    
    Ok(())
}

/// 获取当前时间戳（ISO 格式）
fn chrono_now() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| {
            let secs = d.as_secs();
            let dt = chrono::DateTime::from_timestamp(secs as i64, 0);
            dt.map(|d| d.to_rfc3339()).unwrap_or_default()
        })
        .unwrap_or_default()
}

/// 手动更新龙虾办公室状态（供前端调用）
#[tauri::command]
pub async fn update_office_state(
    app: tauri::AppHandle,
    state: String,
    detail: String,
) -> Result<(), String> {
    use tauri::Manager;
    
    // 验证状态值
    let valid_states = ["idle", "writing", "researching", "executing", "syncing", "error", "receiving", "replying"];
    if !valid_states.contains(&state.as_str()) {
        return Err(format!("无效状态: {}，有效值: {:?}", state, valid_states));
    }
    
    // 写入 Star-Office-UI 的 state.json
    let state_file = find_star_office_state_file(&app)?;
    
    let mut state_data: serde_json::Value = if state_file.exists() {
        let content = std::fs::read_to_string(&state_file).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    
    state_data["state"] = serde_json::Value::String(state);
    state_data["detail"] = serde_json::Value::String(detail);
    state_data["updated_at"] = serde_json::Value::String(chrono_now());
    
    let json_str = serde_json::to_string_pretty(&state_data).map_err(|e| e.to_string())?;
    std::fs::write(&state_file, json_str).map_err(|e| e.to_string())?;
    
    Ok(())
}

/// 查找 Star-Office-UI 的 state.json 文件
fn find_star_office_state_file(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    
    // 1. 检查 _vendor/Star-Office-UI-master/state.json（开发模式）
    let manifest_dir = option_env!("CARGO_MANIFEST_DIR").unwrap_or(".");
    let vendor_state = std::path::Path::new(manifest_dir)
        .join("..")
        .join("_vendor")
        .join("Star-Office-UI-master")
        .join("state.json");
    if vendor_state.exists() {
        return Ok(vendor_state);
    }
    
    // 2. 检查 resource_dir/state.json
    if let Ok(res_dir) = app.path().resource_dir() {
        let res_state = res_dir.join("Star-Office-UI-master").join("state.json");
        if res_state.exists() {
            return Ok(res_state);
        }
        let res_state2 = res_dir.join("resources").join("Star-Office-UI-master").join("state.json");
        if res_state2.exists() {
            return Ok(res_state2);
        }
    }
    
    // 3. 检查 exe 目录
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_default();
    let exe_state = exe_dir.join("Star-Office-UI-master").join("state.json");
    if exe_state.exists() {
        return Ok(exe_state);
    }
    
    Err("未找到 Star-Office-UI state.json".to_string())
}

/// 同步 OpenClaw 状态到龙虾办公室（供前端定时调用）
#[tauri::command]
pub async fn sync_openclaw_to_office(app: tauri::AppHandle) -> Result<(), String> {
    sync_office_state(&app)
}
'''

c = c.rstrip() + '\\n' + new_code

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('Done: rewritten office sync')
