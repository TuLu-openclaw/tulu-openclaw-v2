import sys
sys.stdout.reconfigure(encoding='utf-8')
content = open(r'C:\Users\User\tulu-openclaw-v2\src\engines\hermes\pages\chat.js', encoding='utf-8').read()
lines = content.split('\n')
for i, l in enumerate(lines, 1):
    stripped = l.strip()
    keywords = ['model', 'match', 'engine', 'config', 'default', 'currentModel', 'setModel']
    if any(k in stripped.lower() for k in keywords):
        preview = stripped[:180].replace('\r','')
        print(f'{i}: {preview}')
