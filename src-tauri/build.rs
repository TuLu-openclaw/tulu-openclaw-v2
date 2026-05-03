fn main() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let src = std::path::Path::new(&manifest_dir)
        .join("..")
        .join("_vendor")
        .join("Star-Office-UI-master");
    let dst = std::path::Path::new(&manifest_dir)
        .join("resources")
        .join("Star-Office-UI-master");

    println!("cargo:warning=Star-Office-UI src: {} (exists: {})", src.display(), src.exists());
    println!("cargo:warning=Star-Office-UI dst: {} (exists: {})", dst.display(), dst.exists());

    if src.exists() {
        if !dst.exists() {
            match copy_dir_recursive(&src, &dst) {
                Ok(()) => println!("cargo:warning=Star-Office-UI copied OK"),
                Err(e) => println!("cargo:warning=Star-Office-UI copy FAILED: {}", e),
            }
        } else {
            println!("cargo:warning=Star-Office-UI dst already exists, skipping copy");
        }
    } else {
        println!("cargo:warning=Star-Office-UI src NOT FOUND");
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
