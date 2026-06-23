use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

const AGENCY_MANIFEST: &str = include_str!("../../resources/agency-agents/manifest.json");
const RESOURCE_ROOT: &str = "agency-agents/openclaw";
const AGENT_FILES: &[&str] = &["SOUL.md", "AGENTS.md", "IDENTITY.md"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgencyAgentManifestItem {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub emoji: String,
    #[serde(default)]
    pub vibe: String,
    #[serde(default)]
    pub color: String,
    pub division: String,
    pub source_file: String,
    #[serde(default)]
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgencyManifest {
    pub name: String,
    pub source: String,
    #[serde(default)]
    pub upstream_commit: Option<String>,
    pub generated_at: String,
    pub total: usize,
    pub divisions: Value,
    pub agents: Vec<AgencyAgentManifestItem>,
}

fn manifest() -> Result<AgencyManifest, String> {
    serde_json::from_str(AGENCY_MANIFEST).map_err(|e| format!("解析 AI 专家库清单失败: {e}"))
}

fn agency_resource_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(dir) = app.path().resource_dir().map(|dir| dir.join(RESOURCE_ROOT)) {
        if dir.is_dir() {
            return Ok(dir);
        }
    }

    let dev_dir = std::env::current_dir()
        .map_err(|e| format!("读取当前目录失败: {e}"))?
        .join("src-tauri")
        .join("resources")
        .join(RESOURCE_ROOT);
    if dev_dir.is_dir() {
        return Ok(dev_dir);
    }

    Err("未找到内置 AI 专家库资源".to_string())
}

fn safe_agent_id(id: &str) -> Result<String, String> {
    let trimmed = id.trim();
    if trimmed.is_empty() || trimmed.len() > 96 {
        return Err("Agent ID 长度不合法".to_string());
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return Err("Agent ID 只能包含小写字母、数字和横线".to_string());
    }
    Ok(trimmed.to_string())
}

fn find_manifest_agent(id: &str) -> Result<AgencyAgentManifestItem, String> {
    let id = safe_agent_id(id)?;
    manifest()?
        .agents
        .into_iter()
        .find(|agent| agent.id == id)
        .ok_or_else(|| format!("AI 专家「{id}」不存在"))
}

fn copy_agent_workspace(src: &Path, dest: &Path, overwrite: bool) -> Result<u64, String> {
    fs::create_dir_all(dest).map_err(|e| format!("创建 Agent 工作区失败: {e}"))?;
    let mut copied = 0;
    for file in AGENT_FILES {
        let from = src.join(file);
        if !from.is_file() {
            return Err(format!("内置专家资源缺少 {file}"));
        }
        let to = dest.join(file);
        if to.exists() && !overwrite {
            continue;
        }
        fs::copy(&from, &to).map_err(|e| format!("复制 {file} 失败: {e}"))?;
        copied += 1;
    }
    Ok(copied)
}

fn ensure_agent_config_entry(
    agent: &AgencyAgentManifestItem,
    overwrite: bool,
) -> Result<bool, String> {
    let mut config = super::config::load_openclaw_json()?;
    if config.get("agents").is_none() {
        config
            .as_object_mut()
            .ok_or("配置格式错误")?
            .insert("agents".to_string(), serde_json::json!({}));
    }
    if config["agents"].get("list").is_none() {
        config["agents"]
            .as_object_mut()
            .ok_or("agents 格式错误")?
            .insert("list".to_string(), serde_json::json!([]));
    }
    let list = config["agents"]["list"]
        .as_array_mut()
        .ok_or("agents.list 格式错误")?;

    let workspace = super::openclaw_dir()
        .join("agents")
        .join(&agent.id)
        .join("workspace")
        .to_string_lossy()
        .to_string();

    if let Some(existing) = list
        .iter_mut()
        .find(|item| item.get("id").and_then(|v| v.as_str()) == Some(agent.id.as_str()))
    {
        if overwrite {
            if let Some(obj) = existing.as_object_mut() {
                obj.insert("workspace".to_string(), Value::String(workspace));
                obj.insert(
                    "identity".to_string(),
                    serde_json::json!({ "name": agent.name, "emoji": agent.emoji }),
                );
            }
            super::config::save_openclaw_json(&config)?;
            return Ok(true);
        }
        return Ok(false);
    }

    list.push(serde_json::json!({
        "id": agent.id,
        "workspace": workspace,
        "identity": { "name": agent.name, "emoji": agent.emoji }
    }));
    super::config::save_openclaw_json(&config)?;
    Ok(true)
}

fn installed_agent_ids() -> Result<std::collections::HashSet<String>, String> {
    let config = super::config::load_openclaw_json()?;
    let ids = config
        .get("agents")
        .and_then(|a| a.get("list"))
        .and_then(|l| l.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("id").and_then(|v| v.as_str()).map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    Ok(ids)
}

#[tauri::command]
pub async fn agency_agents_list() -> Result<Value, String> {
    let manifest = manifest()?;
    let installed = installed_agent_ids().unwrap_or_default();
    let agents: Vec<Value> = manifest
        .agents
        .into_iter()
        .map(|agent| {
            serde_json::json!({
                "id": agent.id,
                "slug": agent.slug,
                "name": agent.name,
                "description": agent.description,
                "emoji": agent.emoji,
                "vibe": agent.vibe,
                "color": agent.color,
                "division": agent.division,
                "sourceFile": agent.source_file,
                "installed": installed.contains(&agent.id),
            })
        })
        .collect();
    Ok(serde_json::json!({
        "name": manifest.name,
        "source": manifest.source,
        "upstreamCommit": manifest.upstream_commit,
        "generatedAt": manifest.generated_at,
        "total": manifest.total,
        "divisions": manifest.divisions,
        "agents": agents,
    }))
}

#[tauri::command]
pub async fn agency_agent_detail(app: tauri::AppHandle, id: String) -> Result<Value, String> {
    let agent = find_manifest_agent(&id)?;
    let root = agency_resource_root(&app)?;
    let dir = root.join(&agent.id);
    let mut files = serde_json::Map::new();
    for file in AGENT_FILES {
        let content = fs::read_to_string(dir.join(file))
            .map_err(|e| format!("读取内置专家 {file} 失败: {e}"))?;
        files.insert((*file).to_string(), Value::String(content));
    }
    Ok(serde_json::json!({ "agent": agent, "files": files }))
}

#[tauri::command]
pub async fn agency_agent_install(
    app: tauri::AppHandle,
    id: String,
    overwrite: Option<bool>,
) -> Result<Value, String> {
    let overwrite = overwrite.unwrap_or(false);
    let agent = find_manifest_agent(&id)?;
    let root = agency_resource_root(&app)?;
    let src = root.join(&agent.id);
    let dest = super::openclaw_dir()
        .join("agents")
        .join(&agent.id)
        .join("workspace");
    let copied = copy_agent_workspace(&src, &dest, overwrite)?;
    let config_changed = ensure_agent_config_entry(&agent, overwrite)?;
    let _ = super::config::do_reload_gateway(&app).await;
    Ok(serde_json::json!({
        "success": true,
        "id": agent.id,
        "name": agent.name,
        "copied": copied,
        "configChanged": config_changed,
        "workspace": dest.to_string_lossy(),
    }))
}

#[tauri::command]
pub async fn agency_agents_install_bulk(
    app: tauri::AppHandle,
    division: Option<String>,
    overwrite: Option<bool>,
) -> Result<Value, String> {
    let overwrite = overwrite.unwrap_or(false);
    let selected_division = division
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());
    let root = agency_resource_root(&app)?;
    let manifest = manifest()?;
    let mut installed = 0u64;
    let mut copied = 0u64;
    let mut skipped = 0u64;
    let mut errors: Vec<Value> = Vec::new();

    for agent in manifest.agents.into_iter().filter(|agent| {
        selected_division
            .as_ref()
            .map(|division| &agent.division == division)
            .unwrap_or(true)
    }) {
        let src = root.join(&agent.id);
        let dest = super::openclaw_dir()
            .join("agents")
            .join(&agent.id)
            .join("workspace");
        match copy_agent_workspace(&src, &dest, overwrite).and_then(|count| {
            ensure_agent_config_entry(&agent, overwrite).map(|changed| (count, changed))
        }) {
            Ok((count, changed)) => {
                copied += count;
                if changed {
                    installed += 1;
                } else {
                    skipped += 1;
                }
            }
            Err(e) => errors.push(serde_json::json!({ "id": agent.id, "error": e })),
        }
    }

    let _ = super::config::do_reload_gateway(&app).await;
    Ok(serde_json::json!({
        "success": errors.is_empty(),
        "installed": installed,
        "skipped": skipped,
        "copied": copied,
        "errors": errors,
    }))
}
