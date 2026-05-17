import re

content = open(r'C:\Users\User\tulu-openclaw-v2\src\engines\hermes\pages\chat.js', encoding='utf-8').read()

# Find all id="xxx" in the template (inside draw())
ids_in_html = set(re.findall(r'id="([^"]+)"', content))

# Find all querySelector/getElementById calls in JS
ids_in_js = set(re.findall(r'querySelector\([\'"]#([^\'"]+)[\'"]\)', content))
ids_in_js.update(re.findall(r'getElementById\([\'"]#?([^\'"]+)[\'"]\)', content))

print('=== IDs referenced in JS but missing from HTML ===')
missing = ids_in_js - ids_in_html
for m in sorted(missing):
    print(f'  {m}')

print()
print('=== IDs in HTML but no handler in JS ===')
unused = ids_in_html - ids_in_js
for u in sorted(unused):
    print(f'  {u}')
