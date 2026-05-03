path = 'C:/Users/User/tulu-openclaw-v2/src-tauri/src/commands/assistant.rs'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

old = '''/// 全球内置 HTML 内容（编译时嵌入）
const GLOBAL_BUILTIN_HTML: &str = include_str!("../../../public/global-builtin.html");

/// 打开全球内置窗口（iframe 加载外部 URL + 密码验证 + 悬浮按钮）
#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn open_global_builtin_window(
    app: tauri::AppHandle,
    url: Option<String>,
) -> Result<(), String> {
    let label = "global_builtin_window";
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    // 用 data URL 加载嵌入的 HTML
    let target_url = url.unwrap_or_else(|| {
        "https://zh.stripcam.xxx/top/girls/current-month-asia-and-pacific".to_string()
    });
    let encoded_target =
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(target_url.as_bytes());
    let html_with_param = GLOBAL_BUILTIN_HTML.replace("{{TARGET_URL}}", &encoded_target);
    let data_url = format!(
        "data:text/html;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(html_with_param.as_bytes())
    );
    let _win = tauri::WebviewWindowBuilder::new(
        &app,
        label,
        tauri::WebviewUrl::External(data_url.parse().unwrap()),
    )
    .title("全球内置")
    .inner_size(1100.0, 750.0)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}'''

new = '''/// 全球内置 HTML 内容（编译时嵌入）
const GLOBAL_BUILTIN_HTML: &str = include_str!("../../../public/global-builtin.html");

/// 打开全球内置窗口（iframe 加载外部 URL + 密码验证 + 悬浮按钮）
#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn open_global_builtin_window(
    app: tauri::AppHandle,
    url: Option<String>,
) -> Result<(), String> {
    let label = "global_builtin_window";
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    let target_url = url.unwrap_or_else(|| {
        "https://zh.stripcam.xxx/top/girls/current-month-asia-and-pacific".to_string()
    });
    let encoded_target =
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(target_url.as_bytes());
    let html_with_param = GLOBAL_BUILTIN_HTML.replace("{{TARGET_URL}}", &encoded_target);
    // 写入临时文件，用 file:// URL 加载（WebviewUrl::External 不支持 data: URL）
    let tmp_dir = std::env::temp_dir().join("tulu_openclaw");
    std::fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
    let tmp_file = tmp_dir.join("global-builtin.html");
    std::fs::write(&tmp_file, &html_with_param).map_err(|e| e.to_string())?;
    let file_url = format!("file:///{}", tmp_file.display().to_string().replace("\\\\", "/").replace("\\", "/"));
    let _win = tauri::WebviewWindowBuilder::new(
        &app,
        label,
        tauri::WebviewUrl::External(file_url.parse().unwrap()),
    )
    .title("全球内置")
    .inner_size(1100.0, 750.0)
    .resizable(true)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}'''

c = c.replace(old, new)

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('Done')
