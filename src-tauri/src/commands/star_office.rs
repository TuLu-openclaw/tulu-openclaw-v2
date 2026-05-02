use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use chrono::Utc;

const WINDOW_LABEL: &str = "star_office_window";
const DATA_DIR: &str = "star-office-data";
const STATE_FILE: &str = "state.json";
const AGENTS_FILE: &str = "agents-state.json";
const ASSETS_FILE: &str = "asset-positions.json";
const ASSET_DEFAULTS_FILE: &str = "asset-defaults.json";
const JOIN_KEYS_FILE: &str = "join-keys.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfficeState {
    pub state: String,
    pub detail: String,
    pub progress: i32,
    #[serde(rename = "updated_at")]
    pub updated_at: String,
    #[serde(rename = "ttl_seconds", skip_serializing_if = "Option::is_none")]
    pub ttl_seconds: Option<i32>,
}

impl Default for OfficeState {
    fn default() -> Self {
        OfficeState {
            state: "idle".into(),
            detail: "等待任务中...".into(),
            progress: 0,
            updated_at: Utc::now().to_rfc3339(),
            ttl_seconds: Some(300),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub role: String,
    pub avatar: String,
    pub status: String,
    pub joined_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetPosition {
    pub id: String,
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JoinKey {
    pub key: String,
    pub role: String,
    pub used: bool,
    pub created_at: String,
}

pub struct StarOfficeState {
    office_state: Mutex<OfficeState>,
    agents: Mutex<Vec<Agent>>,
    asset_positions: Mutex<Vec<AssetPosition>>,
    join_keys: Mutex<Vec<JoinKey>>,
    data_dir: PathBuf,
}

impl StarOfficeState {
    fn new(data_dir: PathBuf) -> Self {
        let state = Self::load_state(&data_dir);
        let agents = Self::load_agents(&data_dir);
        let asset_positions = Self::load_asset_positions(&data_dir);
        let join_keys = Self::load_join_keys(&data_dir);
        StarOfficeState {
            office_state: Mutex::new(state),
            agents: Mutex::new(agents),
            asset_positions: Mutex::new(asset_positions),
            join_keys: Mutex::new(join_keys),
            data_dir,
        }
    }

    fn data_dir(&self) -> &PathBuf {
        &self.data_dir
    }

    fn ensure_data_dir(&self) -> std::io::Result<()> {
        fs::create_dir_all(&self.data_dir)
    }

    // --- State ---
    fn load_state(data_dir: &PathBuf) -> OfficeState {
        let path = data_dir.join(STATE_FILE);
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(s) = serde_json::from_str::<OfficeState>(&content) {
                    return s;
                }
            }
        }
        OfficeState::default()
    }

    fn save_state(&self, state: &OfficeState) -> std::io::Result<()> {
        let path = self.data_dir().join(STATE_FILE);
        let content = serde_json::to_string_pretty(state).unwrap();
        fs::write(path, content)
    }

    // --- Agents ---
    fn load_agents(data_dir: &PathBuf) -> Vec<Agent> {
        let path = data_dir.join(AGENTS_FILE);
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(a) = serde_json::from_str::<Vec<Agent>>(&content) {
                    return a;
                }
            }
        }
        Vec::new()
    }

    fn save_agents(&self, agents: &[Agent]) -> std::io::Result<()> {
        let path = self.data_dir().join(AGENTS_FILE);
        let content = serde_json::to_string_pretty(agents).unwrap();
        fs::write(path, content)
    }

    // --- Asset Positions ---
    fn load_asset_positions(data_dir: &PathBuf) -> Vec<AssetPosition> {
        let path = data_dir.join(ASSETS_FILE);
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(a) = serde_json::from_str::<Vec<AssetPosition>>(&content) {
                    return a;
                }
            }
        }
        Vec::new()
    }

    fn save_asset_positions(&self, positions: &[AssetPosition]) -> std::io::Result<()> {
        let path = self.data_dir().join(ASSETS_FILE);
        let content = serde_json::to_string_pretty(positions).unwrap();
        fs::write(path, content)
    }

    // --- Join Keys ---
    fn load_join_keys(data_dir: &PathBuf) -> Vec<JoinKey> {
        let path = data_dir.join(JOIN_KEYS_FILE);
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(k) = serde_json::from_str::<Vec<JoinKey>>(&content) {
                    return k;
                }
            }
        }
        Vec::new()
    }

    fn save_join_keys(&self, keys: &[JoinKey]) -> std::io::Result<()> {
        let path = self.data_dir().join(JOIN_KEYS_FILE);
        let content = serde_json::to_string_pretty(keys).unwrap();
        fs::write(path, content)
    }
}

// ============ Tauri Commands ============

/// 打开龙虾办公室独立窗口
#[tauri::command]
pub async fn open_star_office_window(app: AppHandle) -> Result<String, String> {
    if let Some(existing) = app.get_webview_window(WINDOW_LABEL) {
        let _ = existing.close();
    }
    WebviewWindowBuilder::new(
        &app,
        WINDOW_LABEL,
        WebviewUrl::App("/star-office".into()),
    )
    .title("🦞 龙虾办公室")
    .inner_size(960.0, 640.0)
    .min_inner_size(720.0, 480.0)
    .resizable(true)
    .decorations(true)
    .center()
    .build()
    .map_err(|e| format!("创建龙虾办公室窗口失败: {}", e))?;
    Ok("ok".into())
}

/// 获取办公室状态
#[tauri::command]
pub fn get_star_office_status(state: State<'_, StarOfficeState>) -> Result<OfficeState, String> {
    let s = state.office_state.lock().map_err(|e| e.to_string())?;
    Ok(s.clone())
}

/// 设置办公室状态
#[tauri::command]
pub fn set_star_office_state(
    state: State<'_, StarOfficeState>,
    new_state: String,
    detail: String,
    progress: i32,
) -> Result<OfficeState, String> {
    let mut s = state.office_state.lock().map_err(|e| e.to_string())?;
    s.state = new_state;
    s.detail = detail;
    s.progress = progress;
    s.updated_at = Utc::now().to_rfc3339();
    state.save_state(&s).map_err(|e| e.to_string())?;
    Ok(s.clone())
}

/// 获取所有 Agent
#[tauri::command]
pub fn get_star_office_agents(state: State<'_, StarOfficeState>) -> Result<Vec<Agent>, String> {
    let agents = state.agents.lock().map_err(|e| e.to_string())?;
    Ok(agents.clone())
}

/// 批准 Agent 加入
#[tauri::command]
pub fn approve_star_office_agent(
    state: State<'_, StarOfficeState>,
    agent_id: String,
) -> Result<Vec<Agent>, String> {
    let mut agents = state.agents.lock().map_err(|e| e.to_string())?;
    if let Some(agent) = agents.iter_mut().find(|a| a.id == agent_id) {
        agent.status = "active".into();
    }
    state.save_agents(&agents).map_err(|e| e.to_string())?;
    Ok(agents.clone())
}

/// 拒绝/移除 Agent
#[tauri::command]
pub fn reject_star_office_agent(
    state: State<'_, StarOfficeState>,
    agent_id: String,
) -> Result<Vec<Agent>, String> {
    let mut agents = state.agents.lock().map_err(|e| e.to_string())?;
    agents.retain(|a| a.id != agent_id);
    state.save_agents(&agents).map_err(|e| e.to_string())?;
    Ok(agents.clone())
}

/// Agent 主动离开
#[tauri::command]
pub fn leave_star_office_agent(
    state: State<'_, StarOfficeState>,
    agent_id: String,
) -> Result<(), String> {
    let mut agents = state.agents.lock().map_err(|e| e.to_string())?;
    agents.retain(|a| a.id != agent_id);
    state.save_agents(&agents).map_err(|e| e.to_string())?;
    Ok(())
}

/// Agent 申请加入（通过邀请码）
#[tauri::command]
pub fn join_star_office_agent(
    state: State<'_, StarOfficeState>,
    key: String,
    name: String,
    role: String,
) -> Result<Agent, String> {
    let mut keys = state.join_keys.lock().map_err(|e| e.to_string())?;
    let key_entry = keys.iter_mut().find(|k| k.key == key && !k.used);
    if key_entry.is_none() {
        return Err("邀请码无效或已使用".into());
    }
    let key_entry = key_entry.unwrap();
    key_entry.used = true;
    state.save_join_keys(&keys).map_err(|e| e.to_string())?;

    let mut agents = state.agents.lock().map_err(|e| e.to_string())?;
    let agent = Agent {
        id: format!("agent_{}", Utc::now().timestamp_millis()),
        name,
        role: if role.is_empty() { key_entry.role.clone() } else { role },
        avatar: "guest_role_1.png".into(),
        status: "active".into(),
        joined_at: Utc::now().to_rfc3339(),
    };
    agents.push(agent.clone());
    state.save_agents(&agents).map_err(|e| e.to_string())?;
    Ok(agent)
}

/// 生成新的邀请码
#[tauri::command]
pub fn create_star_office_invite(
    state: State<'_, StarOfficeState>,
    role: String,
) -> Result<String, String> {
    let key = format!("{:08x}", rand_simple());
    let mut keys = state.join_keys.lock().map_err(|e| e.to_string())?;
    let new_key = JoinKey {
        key: key.clone(),
        role: role.clone(),
        used: false,
        created_at: Utc::now().to_rfc3339(),
    };
    keys.push(new_key);
    state.save_join_keys(&keys).map_err(|e| e.to_string())?;
    Ok(key)
}

/// 获取资产位置列表
#[tauri::command]
pub fn get_star_office_asset_positions(
    state: State<'_, StarOfficeState>,
) -> Result<Vec<AssetPosition>, String> {
    let positions = state.asset_positions.lock().map_err(|e| e.to_string())?;
    Ok(positions.clone())
}

/// 保存资产位置
#[tauri::command]
pub fn save_star_office_asset_positions(
    state: State<'_, StarOfficeState>,
    positions: Vec<AssetPosition>,
) -> Result<(), String> {
    let mut p = state.asset_positions.lock().map_err(|e| e.to_string())?;
    *p = positions;
    state.save_asset_positions(&p).map_err(|e| e.to_string())?;
    Ok(())
}

/// 获取昨日备忘录
#[tauri::command]
pub fn get_star_office_yesterday_memo() -> Result<String, String> {
    // 读取昨日的备忘录文件
    let workspace = dirs::data_local_dir()
        .unwrap_or_default()
        .join("openclaw")
        .join("workspace");
    let yesterday = chrono::Local::now()
        .checked_sub_signed(chrono::Duration::days(1))
        .map(|d| d.format("%Y-%m-%d").to_string())
        .unwrap_or_default();
    let memo_path = workspace.join("memory").join(format!("{}.md", yesterday));
    if memo_path.exists() {
        fs::read_to_string(&memo_path)
            .map_err(|e| e.to_string())
    } else {
        Ok(String::new())
    }
}

/// 获取资产默认配置
#[tauri::command]
pub fn get_star_office_asset_defaults(
    state: State<'_, StarOfficeState>,
) -> Result<serde_json::Value, String> {
    let path = state.data_dir().join(ASSET_DEFAULTS_FILE);
    if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(serde_json::json!({}))
    }
}

/// 获取运行时配置
#[tauri::command]
pub fn get_star_office_runtime_config(
    state: State<'_, StarOfficeState>,
) -> Result<serde_json::Value, String> {
    let path = state.data_dir().join("runtime-config.json");
    if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(serde_json::json!({}))
    }
}

// 简单随机数（不依赖rand crate）
fn rand_simple() -> u32 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .subsec_nanos();
    nanos.wrapping_mul(1103515245).wrapping_add(12345)
}

/// 注册 StarOfficeState 到 app
pub fn register_state(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_default()
        .join(DATA_DIR);
    fs::create_dir_all(&data_dir)?;
    let state = StarOfficeState::new(data_dir);
    app.manage(state);
    Ok(())
}
