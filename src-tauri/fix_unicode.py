import sys
sys.stdout.reconfigure(encoding='utf-8')

p = r'C:\Users\User\tulu-openclaw-v2\src-tauri\src\commands\assistant.rs'
with open(p, 'r', encoding='utf-8') as f:
    c = f.read()

# Fix: replace literal \uXXXX sequences with actual characters
# The Python script wrote \u9f99 etc as literal text instead of actual chars
import re

def fix_unicode_escapes(text):
    # Replace \uXXXX with actual unicode char
    def replacer(m):
        code = m.group(1)
        try:
            return chr(int(code, 16))
        except:
            return m.group(0)
    return re.sub(r'\\u([0-9a-fA-F]{4})', replacer, text)

# Count occurrences before fix
count = len(re.findall(r'\\u[0-9a-fA-F]{4}', c))
print(f'Found {count} literal unicode escapes')

if count > 0:
    c = fix_unicode_escapes(c)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(c)
    print('Fixed!')
else:
    print('No fixes needed')
