use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ProxyResponse {
    pub ok: bool,
    pub status: u16,
    pub content_type: Option<String>,
    pub html: Option<String>,
    pub error: Option<String>,
}

/// 用 PowerShell 的 `iwr` (Invoke-WebRequest) 发请求，继承系统所有网络设置
fn fetch_with_powershell(url: &str) -> ProxyResponse {
    use std::process::Command;

    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            &format!(
                r#"$r = iwr '{}' -UserAgent 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' -Headers @{{'Accept'='text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';'Accept-Language'='zh-CN,zh;q=0.9'}} -TimeoutSec 20 -UseBasicParsing -ErrorAction Stop; ConvertTo-Json @{{ok=$true; status=$r.StatusCode; contentType=$r.Headers['Content-Type']; html=$r.Content}} -Compress"#,
                url
            ),
        ])
        .output();

    match output {
        Ok(result) => {
            if result.status.success() {
                let stdout = String::from_utf8_lossy(&result.stdout);
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&stdout) {
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
                error: Some(format!("PowerShell error: {}", stderr)),
            }
        }
        Err(e) => ProxyResponse {
            ok: false,
            status: 0,
            content_type: None,
            html: None,
            error: Some(format!("Failed to run PowerShell: {}", e)),
        },
    }
}

/// 代为请求目标 URL，返回处理后的 HTML 供 iframe srcdoc 加载。
/// 专用于"全球内置"等必须内嵌第三方页面的场景。
#[tauri::command]
pub async fn proxy_url(url: String) -> Result<ProxyResponse, String> {
    Ok(fetch_with_powershell(&url))
}
