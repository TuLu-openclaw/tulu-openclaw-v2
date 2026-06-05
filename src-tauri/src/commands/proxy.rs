use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ProxyResponse {
    pub ok: bool,
    pub status: u16,
    pub content_type: Option<String>,
    pub html: Option<String>,
    pub error: Option<String>,
    pub set_cookie: Option<String>,
}

/// 代为请求目标 URL，支持 Cookie 维护会话。
/// 前端 iframe 通过 srcdoc 加载返回的 HTML。
///
/// 注意：售卖版普通功能路径禁止 PowerShell。旧实现使用 Invoke-WebRequest，
/// 在页面刷新/代理 iframe 场景下会频繁拉起 powershell.exe；这里改为 Rust HTTP 客户端。
#[tauri::command]
pub async fn proxy_url(url: String, cookie: Option<String>) -> Result<ProxyResponse, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Ok(ProxyResponse {
            ok: false,
            status: 0,
            content_type: None,
            html: None,
            error: Some("URL 必须以 http:// 或 https:// 开头".into()),
            set_cookie: None,
        });
    }

    let client = super::build_http_client(
        std::time::Duration::from_secs(20),
        Some("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"),
    )
    .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))?;

    let mut req = client
        .get(&url)
        .header(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .header("Accept-Language", "zh-CN,zh;q=0.9");

    if let Some(cookie) = cookie.as_deref().filter(|c| !c.trim().is_empty()) {
        req = req.header("Cookie", cookie);
    }

    match req.send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let content_type = resp
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .map(String::from);
            let set_cookie = resp
                .headers()
                .get(reqwest::header::SET_COOKIE)
                .and_then(|v| v.to_str().ok())
                .map(String::from);
            let html = resp.text().await.ok();
            Ok(ProxyResponse {
                ok: (200..400).contains(&status),
                status,
                content_type,
                html,
                error: None,
                set_cookie,
            })
        }
        Err(e) => Ok(ProxyResponse {
            ok: false,
            status: 0,
            content_type: None,
            html: None,
            error: Some(format!("HTTP request failed: {e}")),
            set_cookie: None,
        }),
    }
}
