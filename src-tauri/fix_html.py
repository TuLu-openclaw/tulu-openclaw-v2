import sys

path = 'C:/Users/User/tulu-openclaw-v2/public/global-builtin.html'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

old = "var TARGET = 'https://zh.stripcam.xxx/top/girls/current-month-asia-and-pacific';"
new = "var TARGET = atob('{{TARGET_URL}}');"

if old in c:
    c = c.replace(old, new)
    print("Replaced TARGET URL with placeholder")
else:
    print("ERROR: old text not found")
    sys.exit(1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print("Done")
