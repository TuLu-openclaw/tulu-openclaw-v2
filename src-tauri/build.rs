fn main() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    sync_resource_dir(&manifest_dir, "Star-Office-UI-master");
    sync_resource_dir(&manifest_dir, "codex提示词");

    tauri_build::build()
}

fn sync_resource_dir(manifest_dir: &str, name: &str) {
    let src = std::path::Path::new(&manifest_dir)
        .join("..")
        .join("_vendor")
        .join(name);
    let dst = std::path::Path::new(&manifest_dir)
        .join("resources")
        .join(name);

    println!(
        "cargo:warning={} src: {} (exists: {})",
        name,
        src.display(),
        src.exists()
    );
    println!(
        "cargo:warning={} dst: {} (exists: {})",
        name,
        dst.display(),
        dst.exists()
    );

    if src.exists() {
        if !dst.exists() {
            match copy_dir_recursive(&src, &dst) {
                Ok(()) => println!("cargo:warning={} copied OK", name),
                Err(e) => println!("cargo:warning={} copy FAILED: {}", name, e),
            }
        } else {
            println!("cargo:warning={} dst already exists, skipping copy", name);
        }
    } else {
        println!("cargo:warning={} src NOT FOUND", name);
    }
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
