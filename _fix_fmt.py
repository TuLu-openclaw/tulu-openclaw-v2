f = r'C:\Users\User\tulu-openclaw-v2\src-tauri\src\commands\assistant.rs'
with open(f,'r',encoding='utf-8') as fh:
    c = fh.read()
fixes = [
    ('format!("{} (url-decode^2)")', 'format!("{} (url-decode^2)", src)'),
    ('format!("{} (base64)")', 'format!("{} (base64)", src)'),
    ('format!("{} (base64-deep)")', 'format!("{} (base64-deep)", src)'),
    ('format!("{} (query-param)")', 'format!("{} (query-param)", src)'),
    ('format!("{} (rtmp)")', 'format!("{} (rtmp)", src)'),
    ('format!("{} (concat)")', 'format!("{} (concat)", src)'),
    ('format!("{} (config)")', 'format!("{} (config)", src)'),
    ('format!("{} (fetch)")', 'format!("{} (fetch)", src)'),
    ('format!("{} (ws)")', 'format!("{} (ws)", src)'),
    ('format!("{} (new-URL)")', 'format!("{} (new-URL)", src)'),
    ('format!("{} (str-lit)")', 'format!("{} (str-lit)", src)'),
    ('format!("{} (str-lit-deep)")', 'format!("{} (str-lit-deep)", src)'),
]
count = 0
for old, new in fixes:
    n = c.count(old)
    c = c.replace(old, new)
    count += n
with open(f,'w',encoding='utf-8') as fh:
    fh.write(c)
print(f'Fixed {count} format string errors')
