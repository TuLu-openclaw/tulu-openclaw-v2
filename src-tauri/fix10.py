#!/usr/bin/env python3
"""Embed overlay HTML in Rust via base64 data URL"""
import re
import base64

overlay_html_path = 'C:/Users/User/tulu-openclaw-v2/public/global-builtin-overlay.html'
rust_path = 'C:/Users/User/tulu-openclaw-v2/src-tauri/src/commands/assistant.rs'

with open(overlay_html_path, 'r', encoding='utf-8') as f:
    html_content = f.read()

# Base64 encode for data URL
b64 = base64.b64encode(html_content.encode('utf-8')).decode('ascii')

rust_embed = f'''
const GLOBAL_BUILTIN_OVERLAY_HTML: &str = include_str!("../../../public/global-builtin-overlay.html");
'''

# Read Rust file
with open(rust_path, 'r', encoding='utf-8') as f:
    c = f.read()

# Remove old GLOBAL_BUILTIN_HTML if exists
if 'const GLOBAL_BUILTIN_HTML: &str = include_str!' in c:
    idx = c.find('const GLOBAL_BUILTIN_HTML: &str = include_str!')
    start = c.rfind('\\n\\n', 0, idx)
    if start < 0:
        start = c.rfind('\\n', 0, idx)
    end = c.find(';', idx) + 1
    c = c[:start] + c[end:]
    print('Removed old GLOBAL_BUILTIN_HTML')

# Add new constant before the first pub async fn
first_fn = c.find('pub async fn')
if first_fn > 0:
    c = c[:first_fn] + rust_embed + '\\n\\n' + c[first_fn:]
    print('Added GLOBAL_BUILTIN_OVERLAY_HTML')

# Update WebviewUrl::App to use data URL via base64
# Using base64::Engine
old_line = 'WebviewUrl::App("global-builtin-overlay.html".into())'
new_line = '''WebviewUrl::External(
        format!(
            "data:text/html;charset=utf-8;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(&GLOBAL_BUILTIN_OVERLAY_HTML)
        ).parse().unwrap()
    )'''
c = c.replace(old_line, new_line)
print('Updated WebviewUrl to use base64 data URL')

with open(rust_path, 'w', encoding='utf-8') as f:
    f.write(c)

print('Done')
