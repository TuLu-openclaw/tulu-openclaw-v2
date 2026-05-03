#!/usr/bin/env python3
"""Replace the global builtin window function with direct URL loading"""

assistant_path = r'C:\Users\User\tulu-openclaw-v2\src-tauri\src\commands\assistant.rs'

with open(assistant_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the function to replace (by doc comment and closing brace pattern)
# The function starts at line 1119 (doc comment) and ends at line 1156 (closing brace})
# Find by searching for the unique pattern
start_idx = None
end_idx = None

for i, line in enumerate(lines):
    if '/// 全球内置窗口' in line or 'iframe' in line.lower():
        # Check if this is the right context
        if i > 1110 and i < 1125:
            start_idx = i
            break

# Find the end (the closing } of this function)
# It should be around line 1155
if start_idx is not None:
    brace_count = 0
    for i in range(start_idx, len(lines)):
        line = lines[i]
        brace_count += line.count('{') - line.count('}')
        if brace_count == 0 and '{' not in line and '}' in line:
            # Found closing brace
            # Make sure we're not in a nested struct
            end_idx = i
            break

print(f'Function found at lines {start_idx+1}-{end_idx+1}')

new_function = '''/// 全球内置窗口：直接加载外部 URL（full browser speed）
///
/// 架构：
/// - 主窗口：直接用 WebviewUrl::External 加载目标 URL（full browser speed）
/// - 悬浮提取按钮：通过前端的 openGlobalBuiltinWindow 调用 Rust fetch_live_sources
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
    
    let label = "global_builtin_window";
    
    // 如果已存在，直接显示并聚焦
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }
    
    // 创建主窗口（直接加载外部 URL，full browser speed + fully clickable）
    let _win = WebviewWindowBuilder::new(
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
    .map_err(|e| format!("创建窗口失败: {}", e))?;
    
    Ok(())
}
'''

# Replace lines (start_idx to end_idx inclusive)
new_lines = new_function.split('\n')
if new_lines[-1] == '':
    new_lines = new_lines[:-1]  # Remove trailing empty line

result = lines[:start_idx] + [l + '\n' for l in new_lines] + lines[end_idx+1:]

with open(assistant_path, 'w', encoding='utf-8') as f:
    f.writelines(result)

print(f'Done: replaced with {len(new_lines)} lines')
