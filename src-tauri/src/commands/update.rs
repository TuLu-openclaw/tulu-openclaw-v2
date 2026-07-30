use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
#[cfg(test)]
use std::path::{Component, Path};

/// 前端热更新目录 (~/.openclaw/星枢OpenClaw/web-update/)
pub fn update_dir() -> PathBuf {
    super::openclaw_dir()
        .join("星枢OpenClaw")
        .join("web-update")
}

/// The release pipeline must inject a trusted HTTPS manifest URL. Builds without
/// one fail closed instead of falling back to an insecure embedded endpoint.
const FULL_UPDATE_MANIFEST_URL: Option<&str> = option_env!("XINGSHU_FULL_UPDATE_MANIFEST_URL");

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
        return Err("更新清单缺少 SHA-256 摘要，已拒绝下载".into());
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

fn validate_update_url(raw: &str) -> Result<(), String> {
    let url = reqwest::Url::parse(raw.trim()).map_err(|_| "更新地址不是有效 URL".to_string())?;
    if url.scheme() != "https" || url.host_str().is_none() {
        return Err("更新地址必须使用 HTTPS".into());
    }
    Ok(())
}

fn validate_final_update_url(expected: &str, actual: &reqwest::Url) -> Result<(), String> {
    validate_update_url(actual.as_str())?;
    let trusted =
        reqwest::Url::parse(expected.trim()).map_err(|_| "受信更新地址不是有效 URL".to_string())?;
    if trusted.host_str() != actual.host_str()
        || trusted.port_or_known_default() != actual.port_or_known_default()
    {
        return Err("更新请求被重定向到非受信主机，已拒绝继续".into());
    }
    Ok(())
}

fn full_update_manifest_url() -> Result<&'static str, String> {
    let url = FULL_UPDATE_MANIFEST_URL
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "此构建未配置受信 HTTPS 更新清单，自动更新已安全停用".to_string())?;
    validate_update_url(url)?;
    Ok(url)
}

#[cfg(test)]
fn safe_archive_path(root: &Path, raw_name: &str) -> Result<PathBuf, String> {
    let normalized = raw_name.replace('\\', "/");
    let relative = Path::new(&normalized);
    let has_drive_prefix = normalized
        .as_bytes()
        .get(1)
        .is_some_and(|value| *value == b':');
    if normalized.is_empty()
        || normalized.starts_with('/')
        || normalized.contains('\0')
        || has_drive_prefix
    {
        return Err(format!("压缩包包含非法路径: {raw_name}"));
    }
    if relative.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err(format!("压缩包路径越界: {raw_name}"));
    }
    Ok(root.join(relative))
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
        return Err(format!("更新清单条目缺少 SHA-256 摘要: {s}"));
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
    if hash.trim().is_empty() {
        return Err(format!("更新清单条目缺少 SHA-256 摘要: {url}"));
    }
    validate_update_url(&url)?;
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
    let _ = (url, expected_hash);
    Err("前端热更新尚未接入签名清单，已安全停用；请使用受信的完整安装包升级".into())
}

/// 检查全量客户端更新：只走屠戮自定义清单，自动匹配当前平台安装包。
#[tauri::command]
pub async fn check_full_app_update() -> Result<Value, String> {
    let manifest_url = full_update_manifest_url()?;
    let client = super::build_http_client(std::time::Duration::from_secs(60), Some("星枢OpenClaw"))
        .map_err(|e| format!("HTTP 客户端错误: {e}"))?;
    let resp = client
        .get(manifest_url)
        .send()
        .await
        .map_err(|e| format!("请求全量更新清单失败: {e}"))?;
    validate_final_update_url(manifest_url, resp.url())?;
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
        "manifestUrl": manifest_url,
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
    validate_update_url(&url)?;
    let manifest_url = full_update_manifest_url()?;
    let client =
        super::build_http_client(std::time::Duration::from_secs(900), Some("星枢OpenClaw"))
            .map_err(|e| format!("HTTP 客户端错误: {e}"))?;
    let manifest_resp = client
        .get(manifest_url)
        .send()
        .await
        .map_err(|e| format!("重新验证更新清单失败: {e}"))?
        .error_for_status()
        .map_err(|e| format!("重新验证更新清单失败: {e}"))?;
    validate_final_update_url(manifest_url, manifest_resp.url())?;
    let manifest: Value = manifest_resp
        .json()
        .await
        .map_err(|e| format!("解析更新清单失败: {e}"))?;
    let trusted_entry = find_platform_entry(&manifest, platform_key())
        .ok_or_else(|| format!("更新清单缺少当前平台 {}", platform_key()))?;
    let (trusted_url, trusted_hash, _) = entry_url_hash(&trusted_entry)?;
    let normalize_hash = |value: &str| {
        value
            .trim()
            .strip_prefix("sha256:")
            .unwrap_or(value.trim())
            .to_ascii_lowercase()
    };
    if url.trim() != trusted_url || normalize_hash(&expected_hash) != normalize_hash(&trusted_hash)
    {
        return Err("下载参数与受信更新清单不一致，已拒绝安装".into());
    }
    let resp = client
        .get(&trusted_url)
        .send()
        .await
        .map_err(|e| format!("下载安装包失败: {e}"))?;
    validate_final_update_url(&trusted_url, resp.url())?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_hash_is_mandatory() {
        assert!(hash_ok(b"release", "").is_err());
    }

    #[test]
    fn update_urls_must_use_https() {
        assert!(validate_update_url("http://updates.example/release.zip").is_err());
        assert!(validate_update_url("file:///tmp/release.zip").is_err());
        assert!(validate_update_url("https://updates.example/release.zip").is_ok());
    }

    #[test]
    fn update_redirects_must_stay_on_the_trusted_host() {
        let expected = "https://updates.example.test/releases/latest.json";
        let same_host = reqwest::Url::parse("https://updates.example.test/v1/latest.json").unwrap();
        let other_host = reqwest::Url::parse("https://cdn.example.test/latest.json").unwrap();
        let downgraded = reqwest::Url::parse("http://updates.example.test/latest.json").unwrap();
        assert!(validate_final_update_url(expected, &same_host).is_ok());
        assert!(validate_final_update_url(expected, &other_host).is_err());
        assert!(validate_final_update_url(expected, &downgraded).is_err());
    }

    #[test]
    fn archive_paths_cannot_escape_the_staging_directory() {
        let root = Path::new("staging");
        assert!(safe_archive_path(root, "assets/app.js").is_ok());
        for unsafe_name in [
            "../outside",
            "assets/../../outside",
            "/absolute",
            "C:/outside",
        ] {
            assert!(
                safe_archive_path(root, unsafe_name).is_err(),
                "accepted unsafe archive path: {unsafe_name}"
            );
        }
    }
}
