use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ProxyResponse {
    pub ok: bool,
    pub status: u16,
    pub content_type: Option<String>,
    pub html: Option<String>,
    pub error: Option<String>,
}

/// 代为请求目标 URL，返回处理后的 HTML 供 iframe srcdoc 加载。
/// 专用于"全球内置"等必须内嵌第三方页面的场景。
#[tauri::command]
pub async fn proxy_url(url: String) -> Result<ProxyResponse, String> {
    Ok(proxy_url_impl(&url).await)
}

async fn proxy_url_impl(url: &str) -> ProxyResponse {
    use std::time::Duration;

    let client = match super::build_http_client(
        Duration::from_secs(20),
        Some(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ),
    ) {
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
