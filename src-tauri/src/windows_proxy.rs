//! Windows 系统代理注册表读取工具
//! 读取 HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings
//! 提供给 reqwest 使用，让 Rust HTTP 请求自动走系统代理

/// 读取 Windows 系统代理配置
/// 返回 proxy_url 格式如 "http://host:port"，或 None（无代理/直连）
#[cfg(target_os = "windows")]
pub fn get_windows_proxy() -> Option<String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let internet_settings = hkcu
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")
        .ok()?;

    // ProxyEnable: 0=关闭, 1=开启
    let proxy_enable: u32 = internet_settings.get_value("ProxyEnable").ok()?;

    if proxy_enable == 0 {
        return None;
    }

    // ProxyServer: "host:port" 或 "scheme=host:port" 格式
    let proxy_server: String = internet_settings.get_value("ProxyServer").ok()?;

    if proxy_server.is_empty() {
        return None;
    }

    // 转换格式为 reqwest 能识别的 proxy URL
    // 格式1: "host:port" → "http://host:port"
    // 格式2: "ftp=host:port;http=host:port;https=host:port" → 优先使用 https，否则 http
    if proxy_server.contains('=') {
        // 多协议格式，解析 http/https
        for part in proxy_server.split(';') {
            let part = part.trim();
            if part.starts_with("http=") || part.starts_with("https=") {
                if let Some(hostport) = part.strip_prefix("https=") {
                    return Some(format!("http://{}", hostport));
                }
                if let Some(hostport) = part.strip_prefix("http=") {
                    return Some(format!("http://{}", hostport));
                }
            }
        }
        // fallback 到第一个非空段
        if let Some(first) = proxy_server.split(';').next() {
            let hostport = first.trim().trim_start_matches(|c: char| !c.is_ascii_alphanumeric());
            if !hostport.is_empty() {
                return Some(format!("http://{}", hostport));
            }
        }
        return None;
    }

    // 格式3: "host:port" → 添加 http:// 前缀
    Some(format!("http://{}", proxy_server))
}

/// 构建使用 Windows 系统代理的 reqwest Client
#[cfg(target_os = "windows")]
pub fn build_proxy_client() -> Option<reqwest::Client> {
    use std::time::Duration;

    let proxy_url = get_windows_proxy()?;

    // 如果有 Windows 代理设置，通过环境变量让 reqwest 使用
    // 但直接传 proxy 参数更可靠
    if let Ok(proxy) = reqwest::Proxy::http(&proxy_url) {
        if let Ok(client) = reqwest::Client::builder()
            .proxy(proxy)
            .timeout(Duration::from_secs(10))
            .build()
        {
            return Some(client);
        }
    }

    // fallback: 尝试 https 代理
    if let Ok(proxy) = reqwest::Proxy::https(&proxy_url) {
        if let Ok(client) = reqwest::Client::builder()
            .proxy(proxy)
            .timeout(Duration::from_secs(10))
            .build()
        {
            return Some(client);
        }
    }

    None
}

// =============================================================================
// 非 Windows 平台：直接返回 None，让调用方 fallback 到其他方案
// =============================================================================

#[cfg(not(target_os = "windows"))]
pub fn get_windows_proxy() -> Option<String> {
    None
}

#[cfg(not(target_os = "windows"))]
pub fn build_proxy_client() -> Option<reqwest::Client> {
    None
}
