path = 'C:/Users/User/tulu-openclaw-v2/src-tauri/src/commands/assistant.rs'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

old = """    for p in &dev_candidates {
        let resolved = p.canonicalize().unwrap_or_else(|_| p.clone());
        if resolved.join("backend").join("app.py").exists() {
            return Some(resolved);
        }
    }
    None
}"""

new = """    for p in &dev_candidates {
        let resolved = p.canonicalize().unwrap_or_else(|_| p.clone());
        if resolved.join("backend").join("app.py").exists() {
            return Some(resolved);
        }
    }
    // 3. 同时检查 resource_dir/resources/Star-Office-UI-master（Tauri 可能保留 resources/ 前缀）
    if let Ok(res_dir) = app.path().resource_dir() {
        let candidate = res_dir.join("resources").join("Star-Office-UI-master");
        if candidate.join("backend").join("app.py").exists() {
            return Some(candidate);
        }
    }
    // 4. 安装目录下的 Star-Office-UI-master（NSIS 自定义安装路径）
    let install_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_default();
    let install_candidate = install_dir.join("Star-Office-UI-master");
    if install_candidate.join("backend").join("app.py").exists() {
        return Some(install_candidate);
    }
    None
}"""

c = c.replace(old, new)

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('Done')
