fn main() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    sync_resource_dir(&manifest_dir, "Star-Office-UI-master");
    sync_resource_dir(&manifest_dir, "codex提示词");
    sync_runtime_dir(&manifest_dir);

    tauri_build::build()
}

fn sync_runtime_dir(manifest_dir: &str) {
    let src_root = std::path::Path::new(&manifest_dir)
        .join("..")
        .join("_vendor")
        .join("runtime");
    let dst_root = std::path::Path::new(&manifest_dir)
        .join("resources")
        .join("runtime");
    let target_key = detect_runtime_target_key();
    let src = src_root.join(&target_key);
    let dst = dst_root.join(&target_key);

    println!(
        "cargo:warning=runtime target: {} src: {} (exists: {})",
        target_key,
        src.display(),
        src.exists()
    );
    println!(
        "cargo:warning=runtime dst: {} (exists: {})",
        dst.display(),
        dst.exists()
    );

    if src.exists() {
        if dst_root.exists() {
            let _ = std::fs::remove_dir_all(&dst_root);
        }
        std::fs::create_dir_all(&dst_root).ok();
        match copy_dir_recursive(&src, &dst) {
            Ok(()) => {
                if !dir_has_files(&dst) {
                    panic!("runtime copy produced no files for {}", target_key);
                }
                let sentinel = dst_root.join(".runtime-ready");
                std::fs::write(&sentinel, target_key.as_bytes())
                    .expect("failed to write runtime resource sentinel");
                println!("cargo:warning=runtime synced OK for {}", target_key);
            }
            Err(e) => panic!("runtime copy FAILED for {}: {}", target_key, e),
        }
    } else {
        panic!("runtime src NOT FOUND for {}", target_key);
    }
}

fn dir_has_files(path: &std::path::Path) -> bool {
    let Ok(entries) = std::fs::read_dir(path) else {
        return false;
    };
    for entry in entries.flatten() {
        let entry_path = entry.path();
        if entry_path.is_file() || (entry_path.is_dir() && dir_has_files(&entry_path)) {
            return true;
        }
    }
    false
}

fn detect_runtime_target_key() -> String {
    let target = std::env::var("TARGET").unwrap_or_default();
    if target.contains("windows") && target.starts_with("x86_64") {
        return "windows-x64".to_string();
    }
    if target.contains("windows") && target.starts_with("aarch64") {
        return "windows-arm64".to_string();
    }
    if target.contains("apple-darwin") && target.starts_with("x86_64") {
        return "macos-x64".to_string();
    }
    if target.contains("apple-darwin") && target.starts_with("aarch64") {
        return "macos-arm64".to_string();
    }
    if target.contains("linux") && target.starts_with("x86_64") {
        return "linux-x64".to_string();
    }
    if target.contains("linux") && target.starts_with("aarch64") {
        return "linux-arm64".to_string();
    }
    "windows-x64".to_string()
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
        match copy_dir_recursive(&src, &dst) {
            Ok(()) => println!("cargo:warning={} synced OK", name),
            Err(e) => println!("cargo:warning={} copy FAILED: {}", name, e),
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
