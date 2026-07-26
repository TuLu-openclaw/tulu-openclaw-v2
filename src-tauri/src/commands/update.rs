use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::PathBuf;

/// 前端热更新目录 (~/.openclaw/星枢OpenClaw/web-update/)
pub fn update_dir() -> PathBuf {
    super::openclaw_dir()
        .join("星枢OpenClaw")
        .join("web-update")
}

/// 前端热更新由正式更新清单提供。旧版 GitHub 入口已停用，避免把内部源地址
/// 传播到客户端或用户可见错误。
/// 全量客户端更新：走屠戮自定义更新清单。
const FULL_UPDATE_MANIFEST_URL: &str =
    "http://124.220.22.11:9002/1772156650257000000//屠戮龙虾更新.txt";

fn platform_key() -> &'static str {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        "windows-x64"
    }
    #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
    {
        "windows-arm64"
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "macos-arm64"
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        "macos-x64"
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        "linux-x64"
    }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        "linux-arm64"
    }
    #[cfg(not(any(
        all(target_os = "windows", target_arch = "x86_64"),
        all(target_os = "windows", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "aarch64")
    )))]
    {
        "unknown"
    }
}

fn version_ge(current: &str, required: &str) -> bool {
    let parse = |s: &str| -> Vec<u32> {
        s.trim_start_matches('v')
            .split('.')
            .filter_map(|p| p.parse().ok())
            .collect()
    };
    let c = parse(current);
    let r = parse(required);
    for i in 0..r.len().max(c.len()) {
        let cv = c.get(i).copied().unwrap_or(0);
        let rv = r.get(i).copied().unwrap_or(0);
        if cv > rv {
            return true;
        }
        if cv < rv {
            return false;
        }
    }
    true
}

fn version_gt(left: &str, right: &str) -> bool {
    version_ge(left, right) && !version_ge(right, left)
}

fn hash_ok(bytes: &[u8], expected_hash: &str) -> Result<(), String> {
    if expected_hash.trim().is_empty() {
        return Ok(());
    }
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let actual = format!("{:x}", hasher.finalize());
    let expected = expected_hash
        .trim()
        .strip_prefix("sha256:")
        .unwrap_or(expected_hash.trim());
    if actual.eq_ignore_ascii_case(expected) {
        Ok(())
    } else {
        Err(format!("哈希校验失败: 期望 {expected}，实际 {actual}"))
    }
}

fn find_platform_entry(manifest: &Value, key: &str) -> Option<Value> {
    for field in ["platforms", "downloads", "assets"] {
        if let Some(obj) = manifest.get(field).and_then(|v| v.as_object()) {
            if let Some(v) = obj.get(key) {
                return Some(v.clone());
            }
        }
    }
    if let Some(arr) = manifest.get("assets").and_then(|v| v.as_array()) {
        let key_l = key.to_ascii_lowercase();
        for item in arr {
            let name = item
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            let platform = item
                .get("platform")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if platform == key_l || name.contains(&key_l) {
                return Some(item.clone());
            }
        }
    }
    None
}

fn entry_url_hash(entry: &Value) -> Result<(String, String, String), String> {
    if let Some(s) = entry.as_str() {
        return Ok((s.to_string(), String::new(), String::new()));
    }
    let url = entry
        .get("url")
        .and_then(|v| v.as_str())
        .or_else(|| entry.get("downloadUrl").and_then(|v| v.as_str()))
        .or_else(|| entry.get("browser_download_url").and_then(|v| v.as_str()))
        .ok_or("清单中当前平台缺少 url")?
        .to_string();
    let hash = entry
        .get("hash")
        .and_then(|v| v.as_str())
        .or_else(|| entry.get("sha256").and_then(|v| v.as_str()))
        .unwrap_or("")
        .to_string();
    let name = entry
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    Ok((url, hash, name))
}

/// 旧版前端热更新入口已停用。正式更新由受管清单提供，避免客户端携带源码仓库地址。
#[tauri::command]
pub async fn check_frontend_update() -> Result<Value, String> {
    Ok(serde_json::json!({
        "source": "managed",
        "platform": platform_key(),
        "currentVersion": env!("CARGO_PKG_VERSION"),
        "latestVersion": "",
        "hasUpdate": false,
        "compatible": true,
        "updateReady": update_dir().join("index.html").exists(),
        "manifest": { "version": "", "url": "", "hash": "", "assetName": "", "changelog": "" }
    }))
}

/// 下载并解压前端热更新包。GitHub 访问慢，超时延长到 10 分钟。
#[tauri::command]
pub async fn download_frontend_update(url: String, expected_hash: String) -> Result<Value, String> {
    if url.trim().is_empty() {
        return Err("缺少前端热更新下载地址".into());
    }
    let client =
        super::build_http_client(std::time::Duration::from_secs(600), Some("星枢OpenClaw"))
            .map_err(|e| format!("HTTP 客户端错误: {e}"))?;
    let resp = client
        .get(&url)
        .header("User-Agent", "XingShuOpenClaw")
        .send()
        .await
        .map_err(|e| format!("下载失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("下载失败: HTTP {}", resp.status()));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("读取数据失败: {e}"))?;
    hash_ok(bytes.as_ref(), &expected_hash)?;

    let dir = update_dir();
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("清理旧更新失败: {e}"))?;
    }
    fs::create_dir_all(&dir).map_err(|e| format!("创建更新目录失败: {e}"))?;

    let cursor = std::io::Cursor::new(bytes.as_ref());
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("解压失败: {e}"))?;
    let mut root_prefix: Option<String> = None;
    for i in 0..archive.len() {
        let name = archive
            .by_index(i)
            .map_err(|e| format!("读取压缩条目失败: {e}"))?
            .name()
            .replace('\\', "/");
        if name.ends_with("index.html") {
            root_prefix = name.strip_suffix("index.html").map(|s| s.to_string());
            break;
        }
    }
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("读取压缩条目失败: {e}"))?;
        let mut name = file.name().replace('\\', "/");
        if let Some(prefix) = &root_prefix {
            if !prefix.is_empty() && name.starts_with(prefix) {
                name = name[prefix.len()..].to_string();
            }
        }
        if name.is_empty() {
            continue;
        }
        let target = dir.join(&name);
        if file.name().ends_with('/') {
            fs::create_dir_all(&target).map_err(|e| format!("创建子目录失败: {e}"))?;
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("创建父目录失败: {e}"))?;
            }
            let mut buf = Vec::new();
            file.read_to_end(&mut buf)
                .map_err(|e| format!("读取文件内容失败: {e}"))?;
            fs::write(&target, &buf).map_err(|e| format!("写入文件失败: {e}"))?;
        }
    }
    fs::write(dir.join(".version"), env!("CARGO_PKG_VERSION")).ok();
    Ok(
        serde_json::json!({ "success": true, "files": archive.len(), "path": dir.to_string_lossy() }),
    )
}

/// 检查全量客户端更新：只走屠戮自定义清单，自动匹配当前平台安装包。
#[tauri::command]
pub async fn check_full_app_update() -> Result<Value, String> {
    let client = super::build_http_client(std::time::Duration::from_secs(60), Some("星枢OpenClaw"))
        .map_err(|e| format!("HTTP 客户端错误: {e}"))?;
    let resp = client
        .get(FULL_UPDATE_MANIFEST_URL)
        .send()
        .await
        .map_err(|e| format!("请求全量更新清单失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("全量更新清单返回 {}", resp.status()));
    }
    let manifest: Value = resp
        .json()
        .await
        .map_err(|e| format!("解析全量更新清单失败: {e}"))?;
    let latest = manifest
        .get("version")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim_start_matches('v')
        .to_string();
    let current = env!("CARGO_PKG_VERSION");
    let key = platform_key();
    let entry = find_platform_entry(&manifest, key)
        .ok_or_else(|| format!("全量更新清单缺少当前平台 {key} 的下载项"))?;
    let (url, hash, name) = entry_url_hash(&entry)?;
    Ok(serde_json::json!({
        "source": "custom-full",
        "manifestUrl": FULL_UPDATE_MANIFEST_URL,
        "platform": key,
        "currentVersion": current,
        "latestVersion": latest,
        "hasUpdate": !latest.is_empty() && version_gt(&latest, current),
        "manifest": manifest,
        "asset": { "url": url, "hash": hash, "name": name }
    }))
}

/// 下载全量安装包到桌面并自动打开安装包。
#[tauri::command]
pub async fn download_full_app_update(
    url: String,
    expected_hash: String,
    filename: Option<String>,
) -> Result<Value, String> {
    if url.trim().is_empty() {
        return Err("缺少全量安装包下载地址".into());
    }
    let client =
        super::build_http_client(std::time::Duration::from_secs(900), Some("星枢OpenClaw"))
            .map_err(|e| format!("HTTP 客户端错误: {e}"))?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("下载安装包失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("下载安装包失败: HTTP {}", resp.status()));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("读取安装包失败: {e}"))?;
    hash_ok(bytes.as_ref(), &expected_hash)?;
    let desktop = dirs::desktop_dir()
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
    let name = filename
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| {
            let ext = if cfg!(target_os = "windows") {
                "exe"
            } else if cfg!(target_os = "macos") {
                "dmg"
            } else {
                "AppImage"
            };
            format!(
                "星枢OpenClaw-{}-{}.{}",
                env!("CARGO_PKG_VERSION"),
                platform_key(),
                ext
            )
        });
    let path = desktop.join(name.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_"));
    fs::write(&path, bytes.as_ref()).map_err(|e| format!("写入桌面安装包失败: {e}"))?;
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer").arg(&path).spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&path).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&path).spawn();
    }
    Ok(serde_json::json!({ "success": true, "path": path.to_string_lossy(), "size": bytes.len() }))
}

#[tauri::command]
pub fn rollback_frontend_update() -> Result<Value, String> {
    let dir = update_dir();
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("回退失败: {e}"))?;
    }
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub fn get_update_status() -> Result<Value, String> {
    let dir = update_dir();
    let ready = dir.join("index.html").exists();
    let update_version = if ready {
        fs::read_to_string(dir.join(".version")).unwrap_or_default()
    } else {
        String::new()
    };
    Ok(
        serde_json::json!({ "currentVersion": env!("CARGO_PKG_VERSION"), "platform": platform_key(), "updateReady": ready, "updateVersion": update_version, "updateDir": dir.to_string_lossy() }),
    )
}

/// 根据文件扩展名推断 MIME 类型
pub fn mime_from_path(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "application/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "wasm" => "application/wasm",
        _ => "application/octet-stream",
    }
}
