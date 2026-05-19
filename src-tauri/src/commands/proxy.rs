use serde::{Deserialize, Serialize};
use reqwest::header::{ACCEPT, ACCEPT_LANGUAGE, CONTENT_TYPE, COOKIE, SET_COOKIE, USER_AGENT};

#[derive(Debug, Serialize, Deserialize)]
pub struct ProxyResponse {
    pub ok: bool,
    pub status: u16,
    pub content_type: Option<String>,
    pub html: Option<String>,
    pub error: Option<String>,
    pub set_cookie: Option<String>,
}

/// 代为请求目标 URL，支持 Cookie 维护登录态。
/// 返回 HTML 内容供 iframe srcdoc 渲染，并返回 Set-Cookie 供前端注入。
async fn fetch_with_http_client(url: &str, cookie: Option<&str>) -> ProxyResponse {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return ProxyResponse {
            ok: false,
            status: 0,
            content_type: None,
            html: None,
            error: Some("URL 必须以 http:// 或 https:// 开头".into()),
            set_cookie: None,
        };
    }

    let client = match super::build_http_client(
        std::time::Duration::from_secs(20),
        Some("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"),
    ) {
        Ok(c) => c,
        Err(e) => {
            return ProxyResponse {
                ok: false,
                status: 0,
                content_type: None,
                html: None,
                error: Some(format!("HTTP client error: {e}")),
                set_cookie: None,
            };
        }
    };

    let mut req = client
        .get(url)
        .header(ACCEPT, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header(ACCEPT_LANGUAGE, "zh-CN,zh;q=0.9")
        .header(USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36");

    if let Some(cookie) = cookie.filter(|c| !c.trim().is_empty()) {
        req = req.header(COOKIE, cookie);
    }

    match req.send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let content_type = resp
                .headers()
                .get(CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .map(String::from);
            let set_cookie = resp
                .headers()
                .get_all(SET_COOKIE)
                .iter()
                .filter_map(|v| v.to_str().ok())
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join("; ");
            let html = match resp.text().await {
                Ok(text) => Some(text),
                Err(e) => {
                    return ProxyResponse {
                        ok: false,
                        status,
                        content_type,
                        html: None,
                        set_cookie: if set_cookie.is_empty() { None } else { Some(set_cookie) },
                        error: Some(format!("读取响应失败: {e}")),
                    };
                }
            };

            ProxyResponse {
                ok: (200..400).contains(&status),
                status,
                content_type,
                html,
                set_cookie: if set_cookie.is_empty() { None } else { Some(set_cookie) },
                error: None,
            }
        }
        Err(e) => ProxyResponse {
            ok: false,
            status: 0,
            content_type: None,
            html: None,
            set_cookie: None,
            error: Some(format!("请求失败: {e}")),
        },
    }
}

/// 代为请求目标 URL，支持 Cookie 维护会话。
/// 前端 iframe 通过 srcdoc 加载返回的 HTML。
#[tauri::command]
pub async fn proxy_url(url: String, cookie: Option<String>) -> Result<ProxyResponse, String> {
    Ok(fetch_with_http_client(&url, cookie.as_deref()).await)
}
