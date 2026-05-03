path = 'C:/Users/User/tulu-openclaw-v2/src-tauri/src/commands/assistant.rs'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

# Find the end of the file to append the new function
new_func = '''

/// 更新龙虾办公室状态（写入 Star-Office-UI 的 state.json）
#[tauri::command]
pub async fn update_office_state(state: String, detail: String) -> Result<(), String> {
    // 查找 Star-Office-UI 的 state.json
    let candidates = [
        // _vendor/Star-Office-UI-master/state.json（开发模式）
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .map(|p| p.join("..").join("..").join("..").join("..").join("_vendor").join("Star-Office-UI-master").join("state.json"))
            .unwrap_or_default(),
        // resource_dir/state.json
        // 安装目录/state.json
    ];
    
    // 也检查固定的 vendor 路径
    let manifest_dir = option_env!("CARGO_MANIFEST_DIR").unwrap_or(".");
    let vendor_state = std::path::Path::new(manifest_dir).join("..").join("_vendor").join("Star-Office-UI-master").join("state.json");
    
    let state_file = if vendor_state.exists() {
        vendor_state
    } else {
        // 尝试查找
        let mut found = None;
        for c in &candidates {
            let resolved = c.canonicalize().unwrap_or_else(|_| c.clone());
            if resolved.exists() {
                found = Some(resolved);
                break;
            }
        }
        found.ok_or_else(|| "未找到 Star-Office-UI state.json".to_string())?
    };
    
    // 读取现有状态
    let mut state_data: serde_json::Value = if state_file.exists() {
        let content = std::fs::read_to_string(&state_file).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    
    // 更新状态
    state_data["state"] = serde_json::Value::String(state.clone());
    state_data["detail"] = serde_json::Value::String(detail.clone());
    state_data["updated_at"] = serde_json::Value::String(chrono::Utc::now().to_rfc3339());
    
    // 验证状态值
    let valid_states = ["idle", "writing", "researching", "executing", "syncing", "error", "receiving", "replying"];
    if !valid_states.contains(&state.as_str()) {
        return Err(format!("无效状态: {}，有效值: {:?}", state, valid_states));
    }
    
    // 写入文件
    let json_str = serde_json::to_string_pretty(&state_data).map_err(|e| e.to_string())?;
    std::fs::write(&state_file, json_str).map_err(|e| e.to_string())?;
    
    Ok(())
}
'''

# Check if chrono is available, if not add it to the function
# Actually, let's use std::time instead of chrono to avoid adding dependencies
new_func = new_func.replace(
    'chrono::Utc::now().to_rfc3339()',
    'std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs().to_string()).unwrap_or_default()'
)

# Append to file
c = c.rstrip() + '\n' + new_func

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('Done: added update_office_state')
