use serde_json::{json, Value};
use std::fs;
#[cfg(target_os = "windows")]
use std::os::windows::fs::MetadataExt;
use std::path::Component;
use std::path::{Path, PathBuf};

#[derive(Default)]
struct SourceStats {
    files: u64,
    bytes: u64,
    links: u64,
}

#[tauri::command]
pub fn preflight_portable_migration(target_root: String) -> Result<Value, String> {
    let target = normalize_target(&target_root)?;
    preflight_impl(&target, &super::openclaw_dir())
}

fn preflight_impl(target: &Path, source: &Path) -> Result<Value, String> {
    let mut blockers = Vec::new();
    let mut warnings = vec!["目标磁盘可用空间尚未验证，当前版本不会执行迁移".to_string()];

    if !source.is_dir() {
        blockers.push("OpenClaw 源目录不存在或不是目录".to_string());
    }
    if source.exists() {
        reject_link_root(source, "OpenClaw 源目录", &mut blockers);
    }
    if target.exists() {
        reject_link_root(target, "目标目录", &mut blockers);
    }
    reject_link_ancestors(target, "目标目录", &mut blockers);
    reject_overlap(target, source, &mut blockers);
    if target.is_file() {
        blockers.push("目标路径是文件".to_string());
    } else if target.is_dir() && directory_has_entries(target)? {
        blockers.push("目标目录不是空目录".to_string());
    }

    let stats = if source.is_dir() {
        scan_source(source)?
    } else {
        SourceStats::default()
    };
    if stats.links > 0 {
        blockers.push(format!("源目录包含 {} 个符号链接或重解析项", stats.links));
    }
    if stats.files == 0 && source.is_dir() {
        warnings.push("OpenClaw 源目录为空".to_string());
    }

    Ok(json!({
        "ready": blockers.is_empty(),
        "readOnly": true,
        "source": source.to_string_lossy(),
        "target": target.to_string_lossy(),
        "files": stats.files,
        "bytes": stats.bytes,
        "links": stats.links,
        "freeSpaceVerified": false,
        "blockers": blockers,
        "warnings": warnings,
    }))
}

fn normalize_target(raw: &str) -> Result<PathBuf, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("便携迁移目标目录不能为空".to_string());
    }
    super::resolve_configured_path(trimmed).ok_or_else(|| "无法解析便携迁移目标目录".to_string())
}

fn reject_link_root(path: &Path, label: &str, blockers: &mut Vec<String>) {
    if fs::symlink_metadata(path)
        .map(|metadata| is_link_or_reparse(&metadata))
        .unwrap_or(false)
    {
        blockers.push(format!("{label}不能是符号链接或重解析项"));
    }
}

fn reject_link_ancestors(path: &Path, label: &str, blockers: &mut Vec<String>) {
    let mut current = Some(path);
    while let Some(candidate) = current {
        if candidate.exists()
            && fs::symlink_metadata(candidate)
                .map(|metadata| is_link_or_reparse(&metadata))
                .unwrap_or(false)
        {
            let message = format!("{label}不能位于符号链接或重解析目录中");
            if !blockers.contains(&message) {
                blockers.push(message);
            }
            return;
        }
        current = candidate.parent();
    }
}

fn reject_overlap(target: &Path, source: &Path, blockers: &mut Vec<String>) {
    let target_cmp = comparable_path(target);
    let source_cmp = comparable_path(source);
    if target_cmp.starts_with(&source_cmp) || source_cmp.starts_with(&target_cmp) {
        blockers.push("目标目录与 OpenClaw 源目录重叠".to_string());
    }
}

fn comparable_path(path: &Path) -> PathBuf {
    let cleaned = clean_path(path);
    let mut ancestor = cleaned.as_path();
    let mut tail = Vec::new();
    while !ancestor.exists() {
        if let Some(name) = ancestor.file_name() {
            tail.push(name.to_os_string());
        }
        let Some(parent) = ancestor.parent() else {
            break;
        };
        ancestor = parent;
    }
    let mut resolved = ancestor
        .canonicalize()
        .unwrap_or_else(|_| ancestor.to_path_buf());
    for name in tail.into_iter().rev() {
        resolved.push(name);
    }
    #[cfg(target_os = "windows")]
    {
        return PathBuf::from(resolved.to_string_lossy().to_lowercase());
    }
    #[cfg(not(target_os = "windows"))]
    resolved
}

fn clean_path(path: &Path) -> PathBuf {
    let mut cleaned = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                cleaned.pop();
            }
            other => cleaned.push(other.as_os_str()),
        }
    }
    cleaned
}

fn is_link_or_reparse(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(target_os = "windows")]
    {
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        return metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0;
    }
    #[cfg(not(target_os = "windows"))]
    false
}

fn directory_has_entries(path: &Path) -> Result<bool, String> {
    fs::read_dir(path)
        .map_err(|e| format!("读取目标目录失败: {e}"))
        .map(|mut entries| entries.next().is_some())
}

fn scan_source(root: &Path) -> Result<SourceStats, String> {
    let mut stats = SourceStats::default();
    let mut pending = vec![root.to_path_buf()];
    while let Some(dir) = pending.pop() {
        for entry in fs::read_dir(&dir).map_err(|e| format!("读取源目录失败: {e}"))? {
            let entry = entry.map_err(|e| format!("读取源目录项失败: {e}"))?;
            let metadata = fs::symlink_metadata(entry.path())
                .map_err(|e| format!("读取源目录项元数据失败: {e}"))?;
            if is_link_or_reparse(&metadata) {
                stats.links += 1;
            } else if metadata.is_dir() {
                pending.push(entry.path());
            } else if metadata.is_file() {
                stats.files += 1;
                stats.bytes = stats.bytes.saturating_add(metadata.len());
            }
        }
    }
    Ok(stats)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "xingshu-portable-{label}-{}-{}",
            std::process::id(),
            rand::random::<u64>()
        ))
    }

    #[test]
    fn preflight_is_read_only_and_reports_source_size() {
        let root = temp_root("stats");
        let source = root.join("source");
        let target = root.join("target");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("config.json"), b"12345").unwrap();

        let result = preflight_impl(&target, &source).unwrap();
        assert_eq!(result["ready"], true);
        assert_eq!(result["readOnly"], true);
        assert_eq!(result["files"], 1);
        assert_eq!(result["bytes"], 5);
        assert_eq!(result["freeSpaceVerified"], false);
        assert!(!target.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn preflight_blocks_overlapping_and_nonempty_targets() {
        let root = temp_root("blocked");
        let source = root.join("source");
        fs::create_dir_all(source.join("nested")).unwrap();
        fs::write(source.join("nested").join("keep"), b"x").unwrap();
        let overlapping = preflight_impl(&source.join("portable"), &source).unwrap();
        assert_eq!(overlapping["ready"], false);

        let target = root.join("target");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("occupied"), b"x").unwrap();
        let occupied = preflight_impl(&target, &source).unwrap();
        assert_eq!(occupied["ready"], false);
        fs::remove_dir_all(root).unwrap();
    }
}
