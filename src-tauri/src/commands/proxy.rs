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

/// 用 PowerShell 的 Invoke-WebRequest 发请求，支持 Cookie 维护登录态。
/// 返回 HTML 内容供 iframe srcdoc 渲染，并返回 Set-Cookie 供前端注入。
fn fetch_with_powershell(url: &str, cookie: Option<&str>) -> ProxyResponse {
    use std::process::Command;

    let cookie_arg = cookie
        .filter(|c| !c.is_empty())
        .map(|c| format!("; 'Cookie'='{}'", c.replace("'", "''")))
        .unwrap_or_default();

    let ps_script = format!(
        r#"$headers = @{{'Accept'='text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';'Accept-Language'='zh-CN,zh;q=0.9'}}{}; $r = iwr '{}' -UserAgent 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' -Headers $headers -TimeoutSec 20 -UseBasicParsing -ErrorAction Stop; $sc = $r.Headers['Set-Cookie']; ConvertTo-Json @{{ok=$true; status=$r.StatusCode; contentType=$r.Headers['Content-Type']; html=$r.Content; setCookie=$sc}} -Compress"#,
        cookie_arg,
        url.replace("'", "''")
    );

    match Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps_script])
        .output()
    {
        Ok(result) => {
            if result.status.success() {
                let stdout = String::from_utf8_lossy(&result.stdout);
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&stdout) {
                    let set_cookie = parsed
                        .get("setCookie")
                        .and_then(|v| v.as_str())
                        .filter(|s| !s.is_empty())
                        .map(String::from);
                    return ProxyResponse {
                        ok: parsed.get("ok").and_then(|v| v.as_bool()).unwrap_or(false),
                        status: parsed.get("status").and_then(|v| v.as_u64()).unwrap_or(0) as u16,
                        content_type: parsed
                            .get("contentType")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        html: parsed
                            .get("html")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        set_cookie,
                        error: None,
                    };
                }
            }
            let stderr = String::from_utf8_lossy(&result.stderr);
            ProxyResponse {
                ok: false,
                status: 0,
                content_type: None,
                html: None,
                set_cookie: None,
                error: Some(format!("PowerShell error: {}", stderr)),
            }
        }
        Err(e) => ProxyResponse {
            ok: false,
            status: 0,
            content_type: None,
            html: None,
            set_cookie: None,
            error: Some(format!("Failed to run PowerShell: {}", e)),
        },
    }
}

/// 代为请求目标 URL，支持 Cookie 维护会话。
/// 前端 iframe 通过 srcdoc 加载返回的 HTML。
#[tauri::command]
pub async fn proxy_url(url: String, cookie: Option<String>) -> Result<ProxyResponse, String> {
    Ok(fetch_with_powershell(&url, cookie.as_deref()))
}
