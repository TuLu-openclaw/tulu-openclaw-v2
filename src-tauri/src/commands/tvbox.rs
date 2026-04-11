use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::RwLock;
use tauri::command;
use once_cell::sync::Lazy;

static COOKIE_STORE: Lazy<RwLock<HashMap<String, String>>> =
    Lazy::new(|| RwLock::new(HashMap::new()));
static LOCAL_STORE: Lazy<RwLock<HashMap<String, String>>> =
    Lazy::new(|| RwLock::new(HashMap::new()));

#[derive(Debug, Serialize, Deserialize)]
pub struct ReqResult {
    pub code: u16,
    pub content: String,
    pub headers: HashMap<String, String>,
    #[serde(rename = "cookie")]
    pub cookie: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CryptoResult {
    pub code: i32,
    pub content: String,
}

/// HTTP GET/POST 请求（TVBox req() 接口）
#[command]
pub async fn tvbox_req(
    url: String,
    method: String,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    timeout: Option<u64>,
) -> Result<ReqResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout.unwrap_or(30)))
        .build()
        .map_err(|e| e.to_string())?;

    let mut header_map = HeaderMap::new();
    header_map.insert(
        reqwest::header::USER_AGENT,
        HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"),
    );
    header_map.insert(
        reqwest::header::ACCEPT,
        HeaderValue::from_static("*/*"),
    );

    if let Some(hdrs) = headers {
        for (k, v) in hdrs {
            if let (Ok(name), Ok(val)) = (
                HeaderName::try_from(k.as_str()),
                HeaderValue::try_from(v.as_str()),
            ) {
                header_map.insert(name, val);
            }
        }
    }

    let resp = if method.to_uppercase() == "POST" {
        client.post(&url).headers(header_map).body(body.unwrap_or_default()).send().await
    } else {
        client.get(&url).headers(header_map).send().await
    }.map_err(|e| e.to_string())?;

    let status = resp.status().as_u16();
    let mut resp_headers = HashMap::new();
    for (k, v) in resp.headers() {
        if let Ok(val) = v.to_str() {
            resp_headers.insert(k.to_string(), val.to_string());
        }
    }

    let cookie = resp.headers()
        .get("set-cookie")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    if let Some(ck) = &cookie {
        if let Ok(mut store) = COOKIE_STORE.write() {
            for pair in ck.split(';') {
                if let Some(eq) = pair.find('=') {
                    let (k, v) = (&pair[..eq], pair[eq + 1..].trim());
                    if !k.is_empty() {
                        store.insert(k.to_string(), v.to_string());
                    }
                }
            }
        }
    }

    let body = resp.text().await.map_err(|e| e.to_string())?;

    Ok(ReqResult {
        code: status,
        content: body,
        headers: resp_headers,
        cookie,
    })
}

/// Base64 编码
#[command]
pub fn tvbox_base64_encode(input: String) -> CryptoResult {
    use base64::Engine;
    CryptoResult {
        code: 0,
        content: base64::engine::general_purpose::STANDARD.encode(input.as_bytes()),
    }
}

/// Base64 解码
#[command]
pub fn tvbox_base64_decode(input: String) -> CryptoResult {
    use base64::Engine;
    match base64::engine::general_purpose::STANDARD.decode(&input) {
        Ok(bytes) => CryptoResult {
            code: 0,
            content: String::from_utf8_lossy(&bytes).to_string(),
        },
        Err(_) => CryptoResult { code: 1, content: String::new() },
    }
}

/// 保存本地数据
#[command]
pub fn tvbox_store_set(key: String, value: String) -> Result<(), String> {
    LOCAL_STORE
        .write()
        .map(|mut s| {
            s.insert(key, value);
        })
        .map_err(|e| e.to_string())
}

/// 读取本地数据
#[command]
pub fn tvbox_store_get(key: String) -> Result<Option<String>, String> {
    LOCAL_STORE
        .read()
        .map(|s| s.get(&key).cloned())
        .map_err(|e| e.to_string())
}

/// 获取所有存储的 key
#[command]
pub fn tvbox_store_keys() -> Result<Vec<String>, String> {
    LOCAL_STORE
        .read()
        .map(|s| s.keys().cloned().collect())
        .map_err(|e| e.to_string())
}

/// 清除指定 key
#[command]
pub fn tvbox_store_del(key: String) -> Result<(), String> {
    LOCAL_STORE
        .write()
        .map(|mut s| {
            s.remove(&key);
        })
        .map_err(|e| e.to_string())
}

/// 获取保存的 cookie
#[command]
pub fn tvbox_cookie_get(domain: String) -> Result<String, String> {
    COOKIE_STORE
        .read()
        .map(|s| {
            s.iter()
                .filter(|(k, _)| domain.is_empty() || k.contains(&domain))
                .map(|(k, v)| format!("{}={}", k, v))
                .collect::<Vec<_>>()
                .join("; ")
        })
        .map_err(|e| e.to_string())
}

/// MD5（简化实现，16字节 hex 输出）
#[command]
pub fn tvbox_md5(input: String) -> CryptoResult {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    input.hash(&mut h);
    let a = h.finish();
    let mut h2 = DefaultHasher::new();
    a.hash(&mut h2);
    let b = h2.finish();
    let hex = format!("{:016x}{:016x}", a, b);
    CryptoResult { code: 0, content: hex }
}
