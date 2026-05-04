use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::PathBuf;

/// 前端热更新目录 (~/.openclaw/屠戮OpenClaw/web-update/)
pub fn update_dir() -> PathBuf {
    super::openclaw_dir()
        .join("屠戮OpenClaw")
        .join("web-update")
}

/// 更新清单 URL（自建远控更新服务器）
const LATEST_JSON_URL: &str = "http://221.0.81.162:9002/1772156650257000000/屠戮龙虾更新.txt";

/// 检查前端是否有新版本可用
#[tauri::command]
pub async fn check_frontend_update() -> Result<Value, String> {
    let client = super::build_http_client(std::time::Duration::from_secs(10), Some("屠戮OpenClaw"))
        .map_err(|e| format!("HTTP 客户端错误: {e}"))?;

    let resp = client
        .get(LATEST_JSON_URL)
        .send()
        .await
        .map_err(|e| format!("请求失败: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("服务器返回 {}", resp.status()));
    }

    let manifest: Value = resp.json().await.map_err(|e| format!("解析失败: {e}"))?;

    let latest = manifest
        .get("version")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let current = env!("CARGO_PKG_VERSION");

    // 检查最低兼容的 app 版本（前端可能依赖较新的 Rust 后端命令）
    let min_app = manifest
        .get("minAppVersion")
        .and_then(|v| v.as_str())
        .unwrap_or("0.0.0");

    let compatible = version_ge(current, min_app);
    let remote_newer = !latest.is_empty() && compatible && version_gt(&latest, current);
    let update_ready = remote_newer && update_dir().join("index.html").exists();
    let has_update = remote_newer && !update_ready;

    Ok(serde_json::json!({
        "currentVersion": current,
        "latestVersion": latest,
        "hasUpdate": has_update,
        "compatible": compatible,
        "updateReady": update_ready,
        "manifest": manifest
    }))
}

/// 下载并解压前端更新包
#[tauri::command]
pub async fn download_frontend_update(url: String, expected_hash: String) -> Result<Value, String> {
    let client =
        super::build_http_client(std::time::Duration::from_secs(120), Some("屠戮OpenClaw"))
            .map_err(|e| format!("HTTP 客户端错误: {e}"))?;

    let resp = client
        .get(&url)
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

    // 校验 SHA-256
    if !expected_hash.is_empty() {
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        let hash = format!("{:x}", hasher.finalize());
        let expected = expected_hash
            .strip_prefix("sha256:")
            .unwrap_or(&expected_hash);
        if hash != expected {
            return Err(format!("哈希校验失败: 期望 {}，实际 {}", expected, hash));
        }
    }

    // 清理旧更新，解压新包
    let dir = update_dir();
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("清理旧更新失败: {e}"))?;
    }
    fs::create_dir_all(&dir).map_err(|e| format!("创建更新目录失败: {e}"))?;

    let cursor = std::io::Cursor::new(bytes.as_ref());
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("解压失败: {e}"))?;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("读取压缩条目失败: {e}"))?;

        let name = file.name().to_string();
        let target = dir.join(&name);

        if name.ends_with('/') {
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

    Ok(serde_json::json!({
        "success": true,
        "files": archive.len(),
        "path": dir.to_string_lossy()
    }))
}

/// 回退前端更新（删除热更新目录，下次启动使用内嵌资源）
#[tauri::command]
pub fn rollback_frontend_update() -> Result<Value, String> {
    let dir = update_dir();
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("回退失败: {e}"))?;
    }
    Ok(serde_json::json!({ "success": true }))
}

/// 获取当前热更新状态
#[tauri::command]
pub fn get_update_status() -> Result<Value, String> {
    let dir = update_dir();
    let ready = dir.join("index.html").exists();

    // 尝试读取已下载更新的版本信息
    let update_version = if ready {
        dir.join(".version")
            .exists()
            .then(|| fs::read_to_string(dir.join(".version")).ok())
            .flatten()
            .unwrap_or_default()
    } else {
        String::new()
    };

    Ok(serde_json::json!({
        "currentVersion": env!("CARGO_PKG_VERSION"),
        "updateReady": ready,
        "updateVersion": update_version,
        "updateDir": dir.to_string_lossy()
    }))
}

/// 简单的语义化版本比较：current >= required
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

/// GitHub 仓库信息
const GITHUB_OWNER: &str = "TuLu-openclaw";
const GITHUB_REPO: &str = "tulu-openclaw-v2";

/// 检查 GitHub Release 是否有新版本
#[tauri::command]
pub async fn check_app_update() -> Result<Value, String> {
    let client = super::build_http_client(std::time::Duration::from_secs(15), Some("屠戮OpenClaw"))
        .map_err(|e| format!("HTTP 客户端错误: {e}"))?;

    let url = format!(
        "https://api.github.com/repos/{owner}/{repo}/releases/latest",
        owner = GITHUB_OWNER,
        repo = GITHUB_REPO
    );

    let resp = client
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("请求 GitHub 失败: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("GitHub API 返回 {}: {}", status, body));
    }

    let release: Value = resp
        .json()
        .await
        .map_err(|e| format!("解析 GitHub 响应失败: {e}"))?;

    let tag = release
        .get("tag_name")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let latest_version = tag.trim_start_matches('v');
    let current_version = env!("CARGO_PKG_VERSION");
    let has_update = !latest_version.is_empty() && version_gt(latest_version, current_version);

    // 收集所有平台的下载链接
    let mut assets = Vec::new();
    if let Some(arr) = release.get("assets").and_then(|v| v.as_array()) {
        for asset in arr {
            let name = asset.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let download_url = asset
                .get("browser_download_url")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let size = asset.get("size").and_then(|v| v.as_i64()).unwrap_or(0);
            if !download_url.is_empty() {
                assets.push(serde_json::json!({
                    "name": name,
                    "url": download_url,
                    "size": size
                }));
            }
        }
    }

    // 匹配当前平台的最佳安装包
    let platform_asset = find_platform_asset(&assets);

    let release_notes = release
        .get("body")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let published_at = release
        .get("published_at")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    Ok(serde_json::json!({
        "hasUpdate": has_update,
        "currentVersion": current_version,
        "latestVersion": latest_version,
        "tagName": tag,
        "releaseNotes": release_notes,
        "publishedAt": published_at,
        "assets": assets,
        "platformAsset": platform_asset,
        "htmlUrl": release.get("html_url").and_then(|v| v.as_str()).unwrap_or("")
    }))
}

/// 根据当前平台匹配最佳安装包
fn find_platform_asset(assets: &[Value]) -> Option<Value> {
    let is_windows = cfg!(target_os = "windows");
    let is_macos = cfg!(target_os = "macos");
    let is_linux = cfg!(target_os = "linux");
    let is_arm = cfg!(target_arch = "aarch64");

    for asset in assets {
        let name = asset.get("name").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
        if is_windows && name.ends_with("-setup.exe") {
            if is_arm && name.contains("arm64") {
                return Some(asset.clone());
            } else if !is_arm && !name.contains("arm64") {
                return Some(asset.clone());
            }
        }
        if is_macos && name.ends_with(".dmg") {
            if is_arm && name.contains("arm64") {
                return Some(asset.clone());
            } else if !is_arm && name.contains("intel") {
                return Some(asset.clone());
            }
        }
        if is_linux && (name.ends_with(".appimage") || name.ends_with(".deb")) {
            return Some(asset.clone());
        }
    }
    None
}

/// 下载应用安装包到临时目录
#[tauri::command]
pub async fn download_app_update(url: String, filename: String) -> Result<Value, String> {
    let client =
        super::build_http_client(std::time::Duration::from_secs(600), Some("屠戮OpenClaw"))
            .map_err(|e| format!("HTTP 客户端错误: {e}"))?;

    let resp = client
        .get(&url)
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

    // 保存到临时目录
    let temp_dir = std::env::temp_dir().join("tulu-openclaw-update");
    fs::create_dir_all(&temp_dir).map_err(|e| format!("创建临时目录失败: {e}"))?;
    let file_path = temp_dir.join(&filename);
    fs::write(&file_path, &bytes).map_err(|e| format!("写入文件失败: {e}"))?;

    Ok(serde_json::json!({
        "success": true,
        "path": file_path.to_string_lossy(),
        "size": bytes.len()
    }))
}

/// 启动安装包并退出当前应用
#[tauri::command]
pub async fn launch_installer_and_exit(app: tauri::AppHandle, installer_path: String) -> Result<(), String> {
    let path = std::path::Path::new(&installer_path);
    if !path.exists() {
        return Err(format!("安装包不存在: {}", installer_path));
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new(path)
            .arg("/S") // NSIS 静默安装
            .spawn()
            .map_err(|e| format!("启动安装包失败: {e}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| format!("启动安装包失败: {e}"))?;
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        Command::new("chmod")
            .args(["+x", &installer_path])
            .spawn()
            .map_err(|e| format!("设置权限失败: {e}"))?;
        Command::new(path)
            .spawn()
            .map_err(|e| format!("启动安装包失败: {e}"))?;
    }

    // 退出当前应用
    app.exit(0);
    Ok(())
}

/// 根据文件扩展名推断 MIME 类型
pub fn mime_from_path(path: &str) -> &'static str {
    match path.rsplit('.').next().unwrap_or("") {
        "html" => "text/html",
        "js" | "mjs" => "application/javascript",
        "css" => "text/css",
        "json" => "application/json",
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
