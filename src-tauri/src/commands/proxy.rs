use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ProxyResponse {
    pub ok: bool,
    pub status: u16,
    pub content_type: Option<String>,
    pub html: Option<String>,
    pub error: Option<String>,
}

/// 读取 Windows 系统代理（Internet Options → LAN 设置）
fn get_windows_system_proxy() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        // 检查是否启用代理
        let output = Command::new("reg")
            .args([
                "query",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings",
                "/v",
                "ProxyEnable",
            ])
            .output()
            .ok()?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        if !stdout.contains("0x1") {
            return None;
        }

        // 读取代理服务器地址
        let output2 = Command::new("reg")
            .args([
                "query",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings",
                "/v",
                "ProxyServer",
            ])
            .output()
            .ok()?;

        let stdout2 = String::from_utf8_lossy(&output2.stdout);
        // 格式: ProxyServer    REG_SZ    127.0.0.1:7890
        for line in stdout2.lines() {
            if let Some(value) = line.split("REG_SZ").nth(1) {
                let proxy = value.trim();
                if !proxy.is_empty() {
                    return Some(format!("http://{}", proxy));
                }
            }
        }
        None
    }
    #[cfg(not(target_os = "windows"))]
    {
        None
    }
}

/// 代为请求目标 URL，返回处理后的 HTML 供 iframe srcdoc 加载。
/// 专用于"全球内置"等必须内嵌第三方页面的场景。
#[tauri::command]
pub async fn proxy_url(url: String) -> Result<ProxyResponse, String> {
    Ok(proxy_url_impl(&url).await)
}

async fn proxy_url_impl(url: &str) -> ProxyResponse {
    use std::time::Duration;

    let mut builder = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .gzip(true)
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        );

    // 尝试应用 Windows 系统代理（让 Rust 能访问外网）
    if let Some(proxy_url) = get_windows_system_proxy() {
        if let Ok(proxy) = reqwest::Proxy::all(&proxy_url) {
            builder = builder.proxy(proxy);
        }
    }

    let client = match builder.build() {
        Ok(c) => c,
        Err(e) => {
            return ProxyResponse {
                ok: false,
                status: 0,
                content_type: None,
                html: None,
                error: Some(format!("HTTP client error: {}", e)),
            }
        }
    };

    let response = match client.get(url).send().await {
        Ok(r) => r,
        Err(e) => {
            return ProxyResponse {
                ok: false,
                status: 0,
                content_type: None,
                html: None,
                error: Some(format!("Request failed: {}", e)),
            }
        }
    };

    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let html = match response.text().await {
        Ok(text) => text,
        Err(e) => {
            return ProxyResponse {
                ok: false,
                status,
                content_type,
                html: None,
                error: Some(format!("Failed to read response body: {}", e)),
            }
        }
    };

    ProxyResponse {
        ok: true,
        status,
        content_type,
        html: Some(html),
        error: None,
    }
}
