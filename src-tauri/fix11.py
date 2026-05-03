#!/usr/bin/env python3
path = r'C:\Users\User\tulu-openclaw-v2\src-tauri\src\commands\assistant.rs'
with open(path, 'rb') as f:
    c = f.read()

# File has: html");\r\n\\n\\npub (CRLF, then literal \n\n, then pub)
bad = b'html");\r\n\\n\\npub'
good = b'html");\r\n\r\npub'
c2 = c.replace(bad, good)
if c2 != c:
    print(f'Replaced!')
else:
    print('Not found')
    idx = c.find(b'include_str')
    print(f'Context: {c[idx:idx+80]}')
with open(path, 'wb') as f:
    f.write(c2)
