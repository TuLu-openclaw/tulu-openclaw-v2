fn main() {
    // 复制 Star-Office-UI 到 resources 目录（打包时包含）
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let src = std::path::Path::new(&manifest_dir)
        .join("..")
        .join("_vendor")
        .join("Star-Office-UI-master");
    let dst = std::path::Path::new(&manifest_dir)
        .join("resources")
        .join("Star-Office-UI-master");
    if src.exists() && !dst.exists() {
        copy_dir_recursive(&src, &dst).ok();
    }
    tauri_build::build()
}

fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}
