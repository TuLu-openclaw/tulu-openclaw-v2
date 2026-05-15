//! SkillHub SDK — 纯 HTTP + zip 操作，不依赖 Tauri 框架。
//! 供 skills.rs Tauri 命令层薄包装调用。
//!
//! 多数据源聚合：
//!   1. anbeime/skill (243 官方+本地技能)
//!   2. buainoai/awesome-clawdbot-skills (565+ 社区技能)
//!   3. clawdbot-ai/awesome-openclaw-skills-zh (官方中文)
//!   4. GitHub Code Search (12万 SKILL.md，按需)

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const COS_BASE: &str = "https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com";
const API_BASE: &str = "https://clawhub.ai/api/v1"; // 保留：download_zip 还在用
const INDEX_TTL: Duration = Duration::from_secs(600); // 10 分钟缓存

// ── 数据结构 ──────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
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
    pub link: Option<String>,
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

static MULTI_SOURCE_CACHE: Mutex<Option<(Instant, Vec<SkillHubItem>)>> = Mutex::new(None);
const MULTI_SOURCE_TTL: Duration = Duration::from_secs(300);

// ── HTTP 客户端 ──────────────────────────────────────────

pub(crate) fn client() -> Result<reqwest::Client, String> {
    super::build_http_client_no_proxy(Duration::from_secs(30), Some("星枢OpenClaw-SkillHub/1.0"))
}

// ── 公开接口 ──────────────────────────────────────────────

/// 搜索技能（多源聚合：anbeime 243 + 本地 awesome-list 解析）
pub async fn search(query: &str, limit: u32) -> Result<Vec<SkillHubItem>, String> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return Ok(vec![]);
    }

    // 多源聚合搜索（anbeime + clawdbot + openclaw-zh）
    let all_items = fetch_multi_source_index().await?;

    let matched: Vec<SkillHubItem> = all_items
        .into_iter()
        .filter(|s| {
            let name = s.name.as_deref().unwrap_or("").to_lowercase();
            let desc = s.summary.as_deref().unwrap_or("").to_lowercase();
            let link = s.link.as_deref().unwrap_or("").to_lowercase();
            name.contains(&q) || desc.contains(&q) || link.contains(&q)
        })
        .take(limit as usize)
        .collect();

    Ok(matched)
}

/// 拉取全量索引（多源聚合，合并去重）
/// Fetch and parse multiple README sources for skill aggregation
pub async fn fetch_multi_source_index() -> Result<Vec<SkillHubItem>, String> {
    if let Ok(guard) = MULTI_SOURCE_CACHE.lock() {
        if let Some((ts, ref items)) = *guard {
            if ts.elapsed() < MULTI_SOURCE_TTL {
                return Ok(items.clone());
            }
        }
    }

    let sources = vec![
        ("https://raw.githubusercontent.com/buainoai/awesome-clawdbot-skills/main/README.md", "clawdbot"),
        ("https://raw.githubusercontent.com/clawdbot-ai/awesome-openclaw-skills-zh/main/README.md", "openclaw-zh"),
        ("https://raw.githubusercontent.com/anbeime/skill/main/README.md", "anbeime"),
    ];

    let client = client()?;
    let mut all_items: Vec<SkillHubItem> = Vec::new();
    let mut seen_slugs: std::collections::HashSet<String> = std::collections::HashSet::new();

    for (url, source_label) in sources {
        let fetch_start = Instant::now();
        let request = client.get(url).send();
        match tokio::time::timeout(Duration::from_secs(60), request).await {
            Ok(Ok(resp)) if resp.status().is_success() => {
                if let Ok(text) = resp.text().await {
                    let items = parse_readme_skills(&text, source_label);
                    for item in items {
                        if seen_slugs.insert(item.slug.clone()) {
                            all_items.push(item);
                        }
                    }
                }
            }
            Ok(Ok(resp)) => {
                eprintln!("[skillhub] source {} HTTP {}, skipping", source_label, resp.status());
            }
            Ok(Err(e)) => {
                eprintln!("[skillhub] source {} failed: {}, skipping", source_label, e);
            }
            Err(_) => {
                eprintln!("[skillhub] source {} timed out after 60s, skipping", source_label);
            }
        }
    }

    // Only error if all sources failed
    if all_items.is_empty() {
        return Err("所有技能源均无法访问，请检查网络连接".to_string());
    }

    // Cache result
    if let Ok(mut guard) = MULTI_SOURCE_CACHE.lock() {
        *guard = Some((Instant::now(), all_items.clone()));
    }

    Ok(all_items)
}

/// Parse skill links from README markdown
fn parse_readme_skills(readme: &str, source: &str) -> Vec<SkillHubItem> {
    let mut items = Vec::new();
    let re = regex::Regex::new(r"\[([^\]]+)\]\(https://github\.com/([^/]+)/([^/]+)/tree/main/skills/([^)]+)\)").ok();

    if let Some(re) = re {
        for cap in re.captures_iter(readme) {
            let name = &cap[1];
            let _link = &cap[0];
            let org = &cap[2];
            let repo = &cap[3];
            let slug_raw = &cap[4];

            let display_name = name.trim().to_string();
            let slug = slug_raw.replace(" ", "-").to_lowercase();

            items.push(SkillHubItem {
                slug: slug.clone(),
                name: Some(display_name.clone()),
                display_name: Some(display_name),
                summary: Some(format!("{} skill from {}", org, repo)),
                link: Some(format!("https://github.com/{}/{}/tree/main/skills/{}", org, repo, slug_raw)),
                homepage: Some(format!("https://github.com/{}/{}", org, repo)),
                tags: Some(vec![source.to_string()]),
                categories: None,
                author: Some(org.to_string()),
                version: None,
                description: None,
                downloads: None,
                stars: None,
            });
        }
    }
    items
}

pub async fn fetch_index() -> Result<Vec<SkillHubItem>, String> {
    if let Ok(guard) = INDEX_CACHE.lock() {
        if let Some((ts, ref items)) = *guard {
            if ts.elapsed() < Duration::from_secs(600) {
                return Ok(items.clone());
            }
        }
    }

    // 复用多源索引（10分钟缓存）
    fetch_multi_source_index().await
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

    // 拉取官方技能（独立 180s 超时保护）
    let official: Result<AnbeimeSkillsFile, String> = tokio::time::timeout(
        Duration::from_secs(180),
        async {
            let resp = c.get(format!("{base}/skills.json")).send().await
                .map_err(|e| format!("技能商店: 官方技能 fetch 失败: {e}"))?;
            resp.json().await
                .map_err(|e| format!("技能商店: 官方技能 JSON 解析失败: {e}"))
        }
    ).await
    .map_err(|e| format!("技能商店: 官方技能请求超时 (180s): {e}"))
    .and_then(|r| r);

    // 拉取本地技能（独立 180s 超时保护）
    let local: Result<AnbeimeLocalFile, String> = tokio::time::timeout(
        Duration::from_secs(180),
        async {
            let resp = c.get(format!("{base}/local_skills.json")).send().await
                .map_err(|e| format!("技能商店: 本地技能 fetch 失败: {e}"))?;
            resp.json().await
                .map_err(|e| format!("技能商店: 本地技能 JSON 解析失败: {e}"))
        }
    ).await
    .map_err(|e| format!("技能商店: 本地技能请求超时 (180s): {e}"))
    .and_then(|r| r);

    // 分类元数据（纯文本，无 emoji）
    let cat_meta: Vec<(&str, &str)> = vec![
        ("内容创作与发布", "内容创作、采集、格式化、多平台发布"),
        ("视频创作", "视频创作、剪辑、二创、反推分析"),
        ("电商与营销", "电商带货、视频营销、文案创作"),
        ("PPT与演示", "智能PPT生成、视觉增强、路演视频"),
        ("语音与音频", "语音合成、TTS、ASR语音转文字"),
        ("数字人与视频配音", "数字人口播、音频驱动视频配音"),
        ("文档与分析", "论文分析、合同审核、股票分析"),
        ("智能体协作", "多智能体团队协作与会议"),
        ("产品与项目管理", "产品经理工具包、销售AI助手"),
        ("设计与可视化", "前端设计、流程图、3D插画"),
        ("文档处理", "Word/Excel/PPT/PDF格式处理（系统内置）"),
        ("技能管理", "技能发现、创建与管理（系统内置）"),
        ("财务分析", "财务建模、市场研究报告"),
        ("文化创作", "古诗词、文学艺术创作"),
    ];

    // 构建官方技能列表（纯净数据，无额外装饰）
    let official_ok = official?;
    let official_skills: Vec<serde_json::Value> = official_ok
        .skills
        .iter()
        .map(|s| {
            serde_json::json!({
                "name": s.name,
                "description": s.description,
                "link": s.link,
                "category": s.category,
                "source": s.source,
                "type": "official"
            })
        })
        .collect();

    // 构建本地技能列表（纯净数据）
    let mut local_skills: Vec<serde_json::Value> = Vec::new();
    let local_data = local?;
    if let Some(categories) = local_data.categories.as_object() {
        let highlights = &local_data.highlights;
        for (cat_name, cat_data) in categories {
            if let Some(skill_names) = cat_data.get("skills").and_then(|s| s.as_array()) {
                for sn in skill_names {
                    if let Some(s) = sn.as_str() {
                        let hl = highlights
                            .iter()
                            .find(|h| h.get("name").and_then(|n| n.as_str()) == Some(s));
                        let desc = hl
                            .and_then(|h| h.get("description").and_then(|d| d.as_str()))
                            .unwrap_or(s);
                        local_skills.push(serde_json::json!({
                            "name": s,
                            "description": desc,
                            "link": format!("https://github.com/anbeime/skill/tree/main/skills/{s}"),
                            "category": cat_name,
                            "source": "本地技能库",
                            "type": "local"
                        }));
                    }
                }
            }
        }
    }

    // 构建分类统计
    let all_categories: Vec<serde_json::Value> = cat_meta
        .iter()
        .map(|(name, desc)| {
            let oc = official_skills
                .iter()
                .filter(|s| s["category"].as_str() == Some(name))
                .count();
            let lc = local_skills
                .iter()
                .filter(|s| s["category"].as_str() == Some(name))
                .count();
            serde_json::json!({
                "name": name, "description": desc,
                "count": oc + lc
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
        "updatedAt": chrono::Utc::now().to_rfc3339(),
    });

    if let Ok(mut guard) = ANBEIME_STORE_CACHE.lock() {
        *guard = Some((Instant::now(), result.clone()));
    }
    Ok(result)
}

/// 检测 zip 是否有单一顶层目录（如 `skill-name/...`），返回要剥掉的前缀
// ── 多源技能商店缓存 ───────────────────────────────────

static MULTI_SOURCE_STORE_CACHE: Mutex<Option<(Instant, serde_json::Value)>> = Mutex::new(None);
const MULTI_SOURCE_STORE_TTL: Duration = Duration::from_secs(600);

/// 多源并行拉取技能商店数据
///   源1: anbeime/skill (243 技能, 带分类)
///   源2: buainoai/awesome-clawdbot-skills README
///   源3: clawdbot-ai/awesome-openclaw-skills-zh README
///   各源独立超时、独立容错，合并去重
pub async fn fetch_multi_source_store() -> Result<serde_json::Value, String> {
    // 缓存命中
    if let Ok(guard) = MULTI_SOURCE_STORE_CACHE.lock() {
        if let Some((ts, ref data)) = *guard {
            if ts.elapsed() < MULTI_SOURCE_STORE_TTL {
                return Ok(data.clone());
            }
        }
    }

    // ── 源1: anbeime/skill ──
    let anbeime_fut = fetch_anbeime_store();

    // ── 源2+3: README 解析 ──
    let readme_sources = vec![
        ("https://raw.githubusercontent.com/buainoai/awesome-clawdbot-skills/main/README.md", "buainoai"),
        ("https://raw.githubusercontent.com/clawdbot-ai/awesome-openclaw-skills-zh/main/README.md", "clawdbot-zh"),
    ];

    let c = client()?;
    let readme_fut = async {
        let mut all_skills: Vec<serde_json::Value> = Vec::new();
        for (url, source) in readme_sources {
            let result = tokio::time::timeout(Duration::from_secs(180), c.get(url).send()).await;
            match result {
                Ok(Ok(resp)) if resp.status().is_success() => {
                    if let Ok(text) = resp.text().await {
                        let items = parse_readme_skills(&text, source);
                        for item in items {
                            let name = item.display_name.unwrap_or_else(|| item.slug.clone());
                            let fallback_name = item.name.clone().unwrap_or_else(|| name.clone());
                            all_skills.push(serde_json::json!({
                                "name": name,
                                "description": item.summary.unwrap_or(fallback_name),
                                "link": item.link.unwrap_or_else(|| format!("https://github.com/{}", item.slug)),
                                "category": "多源技能",
                                "source": source,
                                "type": "external"
                            }));
                        }
                    }
                }
                Ok(Ok(resp)) => eprintln!("[skillhub] store source {source} HTTP {}", resp.status()),
                Ok(Err(e)) => eprintln!("[skillhub] store source {source} fetch error: {e}"),
                Err(_) => eprintln!("[skillhub] store source {source} timed out"),
            }
        }
        all_skills
    };

    // ── 并行执行 ──
    let (anbeime_result, readme_skills) = futures_util::join!(anbeime_fut, readme_fut);

    // ── 合并 ──
    let mut result = match anbeime_result {
        Ok(data) => data,
        Err(e) => {
            eprintln!("[skillhub] anbeime store failed: {e}");
            serde_json::json!({
                "official": [],
                "local": [],
                "total": 0,
                "officialCount": 0,
                "localCount": 0,
                "categories": [],
                "updatedAt": chrono::Utc::now().to_rfc3339(),
            })
        }
    };

    // 去重 + 追加外部技能
    if !readme_skills.is_empty() {
        let existing: std::collections::HashSet<String> = result["official"]
            .as_array().unwrap_or(&vec![]).iter()
            .chain(result["local"].as_array().unwrap_or(&vec![]).iter())
            .filter_map(|s| s["name"].as_str().map(String::from))
            .collect();

        if let Some(local) = result["local"].as_array_mut() {
            for skill in readme_skills {
                if let Some(name) = skill["name"].as_str() {
                    if !existing.contains(name) {
                        local.push(skill);
                    }
                }
            }
        }
    }

    // 更新统计
    let official_count = result["official"].as_array().map(|a| a.len()).unwrap_or(0);
    let local_count = result["local"].as_array().map(|a| a.len()).unwrap_or(0);
    result["total"] = serde_json::json!(official_count + local_count);
    result["officialCount"] = serde_json::json!(official_count);
    result["localCount"] = serde_json::json!(local_count);
    result["updatedAt"] = serde_json::json!(chrono::Utc::now().to_rfc3339());

    // 缓存
    if let Ok(mut guard) = MULTI_SOURCE_STORE_CACHE.lock() {
        *guard = Some((Instant::now(), result.clone()));
    }
    Ok(result)
}

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
