path = 'C:/Users/User/tulu-openclaw-v2/src-tauri/src/commands/assistant.rs'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

# Fix the broken replace line
old = r'let file_url = format!("file:///{}", tmp_file.display().to_string().replace("\\", "/").replace("\", "/"));'
new = 'let path_str = tmp_file.to_string_lossy().replace(\'\\\\\', "/");\n    let file_url = format!("file:///{}", path_str);'

if old in c:
    c = c.replace(old, new)
    print('Fixed broken replace line')
else:
    # Try finding the line differently
    import re
    pattern = r'let file_url = format!\("file:///\{\}", tmp_file\.display\(\)\.to_string\(\)\.replace\(.*?\)\);'
    match = re.search(pattern, c)
    if match:
        replacement = 'let path_str = tmp_file.to_string_lossy().replace(\'\\\\\', "/");\n    let file_url = format!("file:///{}", path_str);'
        c = c[:match.start()] + replacement + c[match.end():]
        print('Fixed via regex')
    else:
        print('ERROR: Could not find file_url line')

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
