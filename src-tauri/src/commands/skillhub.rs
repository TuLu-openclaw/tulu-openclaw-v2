//! SkillHub SDK — 纯 HTTP + zip 操作，不依赖 Tauri 框架。
//! 供 skills.rs Tauri 命令层薄包装调用。

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const COS_BASE: &str = "https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com";
const API_BASE: &str = "https://clawhub.ai/api/v1";
const INDEX_TTL: Duration = Duration::from_secs(600); // 10 分钟缓存

// ── 数据结构 ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillHubItem {
    pub slug: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default, alias = "displayName")]
    pub display_name: Option<String>,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub categories: Option<Vec<String>>,
    #[serde(default)]
    pub homepage: Option<String>,
    #[serde(default)]
    pub downloads: Option<u64>,
    #[serde(default)]
    pub stars: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    #[serde(default)]
    results: Vec<SkillHubItem>,
}

#[derive(Debug, Deserialize)]
struct IndexResponse {
    #[serde(default)]
    skills: Vec<SkillHubItem>,
}

// ── 全量索引缓存 ──────────────────────────────────────────

static INDEX_CACHE: Mutex<Option<(Instant, Vec<SkillHubItem>)>> = Mutex::new(None);

// ── HTTP 客户端 ──────────────────────────────────────────

fn client() -> Result<reqwest::Client, String> {
    super::build_http_client(Duration::from_secs(30), Some("星枢OpenClaw-SkillHub/1.0"))
}

// ── 公开接口 ──────────────────────────────────────────────

/// 搜索 SkillHub
pub async fn search(query: &str, limit: u32) -> Result<Vec<SkillHubItem>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }
    let url = format!(
        "{}/search?q={}&limit={}",
        API_BASE,
        urlencoding::encode(q),
        limit
    );
    let resp = client()?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("SkillHub 搜索请求失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("SkillHub 搜索失败: HTTP {}", resp.status()));
    }
    let data: SearchResponse = resp
        .json()
        .await
        .map_err(|e| format!("SkillHub 搜索结果解析失败: {e}"))?;
    Ok(data.results)
}

/// 拉取全量索引（带 10 分钟内存缓存）
pub async fn fetch_index() -> Result<Vec<SkillHubItem>, String> {
    // 命中缓存
    if let Ok(guard) = INDEX_CACHE.lock() {
        if let Some((ts, ref items)) = *guard {
            if ts.elapsed() < INDEX_TTL {
                return Ok(items.clone());
            }
        }
    }
    // 拉取远程索引
    let url = format!("{}/skills.json", COS_BASE);
    let resp = client()?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("拉取技能索引失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("拉取技能索引失败: HTTP {}", resp.status()));
    }
    let data: IndexResponse = resp
        .json()
        .await
        .map_err(|e| format!("解析技能索引失败: {e}"))?;
    let items = data.skills;
    // 写入缓存
    if let Ok(mut guard) = INDEX_CACHE.lock() {
        *guard = Some((Instant::now(), items.clone()));
    }
    Ok(items)
}

/// 下载 Skill zip（COS 镜像优先，回退主站 API）
pub async fn download_zip(slug: &str) -> Result<Vec<u8>, String> {
    let c = client()?;
    // 1. 优先 COS 镜像（国内 CDN）
    let cos_url = format!("{}/skills/{}.zip", COS_BASE, slug);
    match c.get(&cos_url).send().await {
        Ok(resp) if resp.status().is_success() => {
            return resp
                .bytes()
                .await
                .map(|b| b.to_vec())
                .map_err(|e| format!("COS 下载读取失败: {e}"));
        }
        _ => {}
    }
    // 2. 回退主站 API
    let api_url = format!("{}/download?slug={}", API_BASE, urlencoding::encode(slug));
    let resp = c
        .get(&api_url)
        .send()
        .await
        .map_err(|e| format!("主站下载请求失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("下载失败: HTTP {}", resp.status()));
    }
    resp.bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| format!("下载读取失败: {e}"))
}

/// 下载并安装 Skill：zip → 解压到 skills_dir/{slug}/
pub async fn install(slug: &str, skills_dir: &Path) -> Result<PathBuf, String> {
    validate_slug(slug)?;
    let target_dir = skills_dir.join(slug);
    let zip_bytes = download_zip(slug).await?;
    extract_zip(&zip_bytes, &target_dir)?;
    Ok(target_dir)
}

// ── 内部工具 ──────────────────────────────────────────────

/// 校验 slug 安全性
fn validate_slug(slug: &str) -> Result<(), String> {
    if slug.is_empty() {
        return Err("Skill slug 不能为空".into());
    }
    if slug.contains("..") || slug.contains('/') || slug.contains('\\') {
        return Err(format!("无效的 Skill slug: {slug}"));
    }
    Ok(())
}

/// 将 zip 字节解压到目标目录
fn extract_zip(zip_bytes: &[u8], target_dir: &Path) -> Result<(), String> {
    use std::io::Cursor;
    use zip::ZipArchive;

    // 清理旧目录
    if target_dir.exists() {
        std::fs::remove_dir_all(target_dir).map_err(|e| format!("清理旧目录失败: {e}"))?;
    }
    std::fs::create_dir_all(target_dir).map_err(|e| format!("创建目录失败: {e}"))?;

    let reader = Cursor::new(zip_bytes);
    let mut archive = ZipArchive::new(reader).map_err(|e| format!("打开 zip 失败: {e}"))?;

    // 收集所有文件名，检测是否都在同一个顶层目录下（常见的 zip 打包方式）
    let names: Vec<String> = (0..archive.len())
        .filter_map(|i| archive.by_index_raw(i).ok().map(|f| f.name().to_string()))
        .collect();
    let strip_prefix = detect_single_root_dir(&names);

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("读取 zip 条目失败: {e}"))?;

        let raw_name = file.name().to_string();
        // 安全检查：防止路径穿越
        if raw_name.contains("..") {
            continue;
        }

        // 如果 zip 内有单一根目录，剥掉它
        let relative = if let Some(ref prefix) = strip_prefix {
            match raw_name.strip_prefix(prefix.as_str()) {
                Some(rest) if !rest.is_empty() => rest.to_string(),
                _ => continue, // 跳过根目录本身
            }
        } else {
            raw_name.clone()
        };

        if relative.is_empty() {
            continue;
        }

        let out_path = target_dir.join(&relative);
        if file.is_dir() {
            std::fs::create_dir_all(&out_path).ok();
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            let mut outfile = std::fs::File::create(&out_path)
                .map_err(|e| format!("创建文件失败 {relative}: {e}"))?;
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("写入文件失败 {relative}: {e}"))?;
        }
    }
    Ok(())
}

// ── anbeime/skill 技能商店数据 ────────────────────────────

#[derive(Debug, Deserialize)]
struct AnbeimeSkillsFile {
    #[serde(default)]
    skills: Vec<AnbeimeSkill>,
}

#[derive(Debug, Deserialize)]
struct AnbeimeSkill {
    pub name: String,
    pub description: String,
    pub link: String,
    pub category: String,
    pub source: String,
}

#[derive(Debug, Deserialize)]
struct AnbeimeLocalFile {
    #[serde(default)]
    #[allow(dead_code)]
    metadata: serde_json::Value,
    #[serde(default)]
    categories: serde_json::Value,
    #[serde(default)]
    highlights: Vec<serde_json::Value>,
}

static ANBEIME_STORE_CACHE: Mutex<Option<(Instant, serde_json::Value)>> = Mutex::new(None);
const ANBEIME_STORE_TTL: Duration = Duration::from_secs(3600); // 1h

/// 从 anbeime/skill GitHub 仓库拉取技能商店数据（243 个技能 + 14 种分类 + 星级评分）
pub async fn fetch_anbeime_store() -> Result<serde_json::Value, String> {
    if let Ok(guard) = ANBEIME_STORE_CACHE.lock() {
        if let Some((ts, ref data)) = *guard {
            if ts.elapsed() < ANBEIME_STORE_TTL {
                return Ok(data.clone());
            }
        }
    }

    let c = client()?;
    let base = "https://raw.githubusercontent.com/anbeime/skill/main/data";

    // 拉取官方技能（182个）
    let official: AnbeimeSkillsFile = c
        .get(format!("{base}/skills.json"))
        .send()
        .await
        .map_err(|e| format!("拉取官方技能列表失败: {e}"))?
        .json()
        .await
        .map_err(|e| format!("解析官方技能失败: {e}"))?;

    // 拉取本地技能（61个，带分类和评分）
    let local: AnbeimeLocalFile = c
        .get(format!("{base}/local_skills.json"))
        .send()
        .await
        .map_err(|e| format!("拉取本地技能列表失败: {e}"))?
        .json()
        .await
        .map_err(|e| format!("解析本地技能失败: {e}"))?;

    // 分类元数据（emoji + 描述）
    let cat_meta: Vec<(&str, &str, &str)> = vec![
        ("内容创作与发布", "📝", "内容创作、采集、格式化、多平台发布"),
        ("视频创作", "🎬", "视频创作、剪辑、二创、反推分析"),
        ("电商与营销", "🛒", "电商带货、视频营销、文案创作"),
        ("PPT与演示", "📊", "智能PPT生成、视觉增强、路演视频"),
        ("语音与音频", "🎙️", "语音合成、TTS、ASR语音转文字"),
        ("数字人与视频配音", "🤖", "数字人口播、音频驱动视频配音"),
        ("文档与分析", "📄", "论文分析、合同审核、股票分析"),
        ("智能体协作", "🤝", "多智能体团队协作与会议"),
        ("产品与项目管理", "💼", "产品经理工具包、销售AI助手"),
        ("设计与可视化", "🎨", "前端设计、流程图、3D插画"),
        ("文档处理", "📑", "Word/Excel/PPT/PDF格式处理（系统内置）"),
        ("技能管理", "🔧", "技能发现、创建与管理（系统内置）"),
        ("财务分析", "💰", "财务建模、市场研究报告"),
        ("文化创作", "🎭", "古诗词、文学艺术创作"),
    ];

    // 构建分类查找表
    let cat_meta_map: std::collections::HashMap<&str, (&str, &str)> = cat_meta
        .iter()
        .map(|(n, e, d)| (*n, (*e, *d)))
        .collect();

    // 源组织 emoji 映射
    let org_emoji: std::collections::HashMap<&str, &str> = [
        ("anthropics", "🏛️"),
        ("vercel-labs", "▲"),
        ("cloudflare", "☁️"),
        ("trailofbits", "🔐"),
        ("huggingface-projects", "🤗"),
        ("google-labs", "🔬"),
        ("stripe", "💳"),
        ("supabase", "⚡"),
        ("expo", "📱"),
        ("sentry", "🐛"),
        ("better-auth", "🔑"),
        ("remotion", "🎥"),
        ("inngest", "⚙️"),
        ("tinybird", "🐦"),
        ("anthropic", "🏛️"),
    ]
    .iter()
    .cloned()
    .collect();

    // 构建官方技能列表
    let official_skills: Vec<serde_json::Value> = official
        .skills
        .iter()
        .map(|s| {
            let org = s.name.split('/').next().unwrap_or(&s.name);
            let org_e = org_emoji.get(org).copied().unwrap_or("📦");
            serde_json::json!({
                "name": s.name,
                "description": s.description,
                "link": s.link,
                "category": s.category,
                "source": s.source,
                "stars": 4,
                "org": org,
                "orgEmoji": org_e,
                "type": "official"
            })
        })
        .collect();

    // 构建本地技能列表
    let mut local_skills: Vec<serde_json::Value> = Vec::new();
    if let Some(categories) = local.categories.as_object() {
        let highlights = &local.highlights;
        for (cat_name, cat_data) in categories {
            if let Some(skill_names) = cat_data.get("skills").and_then(|s| s.as_array()) {
                let cat_e = cat_meta_map
                    .get(cat_name.as_str())
                    .map(|(e, _)| *e)
                    .unwrap_or("📦");
                for sn in skill_names {
                    if let Some(s) = sn.as_str() {
                        let hl = highlights
                            .iter()
                            .find(|h| h.get("name").and_then(|n| n.as_str()) == Some(s));
                        let desc = hl
                            .and_then(|h| h.get("description").and_then(|d| d.as_str()))
                            .unwrap_or(s);
                        let stars = hl
                            .and_then(|h| h.get("rating").and_then(|r| r.as_u64()))
                            .unwrap_or(3) as u32;
                        local_skills.push(serde_json::json!({
                            "name": s,
                            "description": desc,
                            "link": format!("https://github.com/anbeime/skill/tree/main/skills/{s}"),
                            "category": cat_name,
                            "source": "本地技能库",
                            "stars": stars,
                            "org": "local",
                            "orgEmoji": "🇨🇳",
                            "type": "local",
                            "emoji": cat_e
                        }));
                    }
                }
            }
        }
    }

    // 构建全量分类统计
    let all_categories: Vec<serde_json::Value> = cat_meta
        .iter()
        .map(|(name, emoji, desc)| {
            let oc = official_skills
                .iter()
                .filter(|s| s["category"].as_str() == Some(name))
                .count();
            let lc = local_skills
                .iter()
                .filter(|s| s["category"].as_str() == Some(name))
                .count();
            serde_json::json!({
                "name": name, "emoji": emoji, "description": desc,
                "count": oc + lc, "officialCount": oc, "localCount": lc
            })
        })
        .collect();

    let total = official_skills.len() + local_skills.len();
    let result = serde_json::json!({
        "official": official_skills,
        "local": local_skills,
        "total": total,
        "officialCount": official_skills.len(),
        "localCount": local_skills.len(),
        "categories": all_categories,
        "highlights": local.highlights,
        "updatedAt": chrono::Utc::now().to_rfc3339(),
    });

    if let Ok(mut guard) = ANBEIME_STORE_CACHE.lock() {
        *guard = Some((Instant::now(), result.clone()));
    }
    Ok(result)
}

/// 检测 zip 是否有单一顶层目录（如 `skill-name/...`），返回要剥掉的前缀
fn detect_single_root_dir(names: &[String]) -> Option<String> {
    let mut root: Option<String> = None;
    for name in names {
        let first_segment = name.split('/').next().unwrap_or("");
        if first_segment.is_empty() {
            continue;
        }
        match &root {
            None => root = Some(format!("{}/", first_segment)),
            Some(existing) => {
                if !name.starts_with(existing.as_str()) {
                    return None; // 多个顶层目录
                }
            }
        }
    }
    root
}
