import re

with open('C:/Users/User/tulu-openclaw-v2/src-tauri/src/commands/assistant.rs', 'r', encoding='utf-8') as f:
    content = f.read()

# Find and replace the open_global_builtin_window function
old_pattern = r'/// 打开全球内置窗口.*?pub async fn open_global_builtin_window\(app: tauri::AppHandle, url: String\) -> Result<\(\), String> \{.*?Ok\(\(\)\)\n\}'

new_func = '''/// 全球内置 HTML 内容（编译时嵌入）
const GLOBAL_BUILTIN_HTML: &str = include_str!("../../../public/global-builtin.html");

/// 打开全球内置窗口（iframe 加载外部 URL + 密码验证 + 悬浮按钮）
#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn open_global_builtin_window(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let label = "global_builtin_window";
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    // 用 data URL 加载嵌入的 HTML
    let encoded_target = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(url.as_bytes());
    let html_with_param = GLOBAL_BUILTIN_HTML.replace("{{TARGET_URL}}", &encoded_target);
    let data_url = format!(
        "data:text/html;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(html_with_param.as_bytes())
    );
    let _win = tauri::WebviewWindowBuilder::new(
        &app,
        label,
        tauri::WebviewUrl::App(data_url.into()),
    )
    .title("全球内置")
    .inner_size(1100.0, 750.0)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}'''

# Use regex with DOTALL to match across lines
match = re.search(r'/// 打开全球内置窗口.*?Ok\(\(\)\)\s*\}', content, re.DOTALL)
if match:
    content = content[:match.start()] + new_func + content[match.end():]
    print(f"Replaced function at position {match.start()}")
else:
    print("ERROR: Could not find open_global_builtin_window function")
    import sys
    sys.exit(1)

with open('C:/Users/User/tulu-openclaw-v2/src-tauri/src/commands/assistant.rs', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
