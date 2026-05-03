#!/usr/bin/env python3
"""Fix global-builtin: Direct URL loading + transparent overlay button"""

path = 'C:/Users/User/tulu-openclaw-v2/src-tauri/src/commands/assistant.rs'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

# Find the function by signature
idx = c.find('open_global_builtin_window')
if idx < 0:
    print('Function not found!')
    exit(1)

# Find the start (look backwards for ///)
start = c.rfind('///', 0, idx)

# Find the end (matching brace)
brace_count = 0
in_fn = False
end_idx = idx
for i in range(idx, len(c)):
    if c[i] == '{':
        brace_count += 1
        in_fn = True
    elif c[i] == '}':
        brace_count -= 1
        if in_fn and brace_count == 0:
            end_idx = i + 1
            break

print(f'Replacing function at {start}-{end_idx} ({end_idx - start} chars)')

new_func = '''/// 全球内置窗口：直接加载外部 URL + 悬浮按钮 overlay
///
/// 架构：
/// - 主窗口：直接用 WebviewUrl::External 加载目标 URL（full browser speed）
/// - Overlay 窗口：透明悬浮按钮，通过 Tauri 事件与主窗口通信
#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn open_global_builtin_window(
    app: tauri::AppHandle,
    url: Option<String>,
) -> Result<(), String> {
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
    
    let target_url = url.unwrap_or_else(|| {
        "https://zh.stripcam.xxx/top/girls/curr".to_string()
    });
    
    // 清理非法 URL
    if target_url.starts_with("data:") || target_url.starts_with("file:") {
        return Err("禁止加载此类 URL".to_string());
    }
    
    let label = "global_builtin_main";
    let overlay_label = "global_builtin_overlay";
    
    // 如果已存在主窗口，直接显示并聚焦
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }
    
    // 创建主窗口（直接加载外部 URL，full browser speed）
    let main_window = WebviewWindowBuilder::new(
        &app,
        label,
        WebviewUrl::External(target_url.parse().map_err(|e: url::ParseError| e.to_string())?),
    )
    .title("全球内置")
    .inner_size(1200.0, 800.0)
    .center()
    .decorations(true)
    .resizable(true)
    .visible(true)
    .focused(true)
    .build()
    .map_err(|e| format!("创建主窗口失败: {}", e))?;
    
    // 创建悬浮按钮 overlay（透明、置顶）
    let _overlay_window = WebviewWindowBuilder::new(
        &app,
        overlay_label,
        WebviewUrl::App("global-builtin-overlay.html".into()),
    )
    .title("控制")
    .inner_size(60.0, 60.0)
    .position(10.0, 10.0)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .visible(true)
    .focused(false)
    .build()
    .map_err(|e| format!("创建 overlay 失败: {}", e))?;
    
    // 通知 overlay 主窗口已创建
    let _ = _overlay_window.emit("main_window_ready", serde_json::json!({
        "main_label": label,
        "target_url": target_url
    }));
    
    Ok(())
}

/// 提取页面中的 m3u8 链接（供前端调用）
#[tauri::command]
pub async fn fetch_page_m3u8(url: String) -> Result<Vec<String>, String> {
    use reqwest::Client;
    
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    
    let resp = client.get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;
    
    let body = resp.text().await.map_err(|e| e.to_string())?;
    
    // 正则提取 m3u8 链接
    let mut links = std::collections::HashSet::new();
    let re = regex::Regex::new(r#"https?://[^\s"'<>\[\]]+\.m3u8[^\s"'<>\[\]]*"#).unwrap();
    for cap in re.find_iter(&body) {
        links.insert(cap.as_str().to_string());
    }
    
    Ok(links.into_iter().collect())
}
'''

c = c[:start] + new_func + c[end_idx:]

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)

print('Done: replaced open_global_builtin_window')
