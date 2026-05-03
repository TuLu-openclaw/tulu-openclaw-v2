path = 'C:/Users/User/tulu-openclaw-v2/src-tauri/src/commands/assistant.rs'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

# Fix 1: Make url parameter optional
c = c.replace(
    'pub async fn open_global_builtin_window(app: tauri::AppHandle, url: String)',
    'pub async fn open_global_builtin_window(app: tauri::AppHandle, url: Option<String>)'
)

# Fix 2: Add default URL + keep using data URL approach
old = "    let encoded_target = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(url.as_bytes());"
new = """    let target_url = url.unwrap_or_else(|| "https://zh.stripcam.xxx/top/girls/current-month-asia-and-pacific".to_string());
    let encoded_target = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(target_url.as_bytes());"""
c = c.replace(old, new)

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('Done: global-builtin fixed')
