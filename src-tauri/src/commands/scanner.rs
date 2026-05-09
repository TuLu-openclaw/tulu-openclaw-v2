/// OpenClaw 文件扫描与清理命令
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::command;

/// OpenClaw 相关目录列表
fn openclaw_directories() -> Vec<(String, PathBuf)> {
    let mut dirs = Vec::new();
    
    // 主配置目录
    if let Some(openclaw_dir) = std::env::var("OPENCLAW_DIR").ok() {
        let path = PathBuf::from(openclaw_dir);
        if path.exists() {
            dirs.push(("主配置目录".to_string(), path));
        }
    }
    
    // 默认目录
    let default_dir = PathBuf::from(r"C:\Users\User\.openclaw");
    if default_dir.exists() {
        dirs.push(("OpenClaw 配置目录".to_string(), default_dir));
    }
    
    // npm 全局目录
    if let Ok(appdata) = std::env::var("APPDATA") {
        let npm_dir = PathBuf::from(appdata).join("npm");
        if npm_dir.exists() {
            dirs.push(("npm 全局目录".to_string(), npm_dir));
        }
    }

    dirs
}

/// 扫描结果
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub category: String,
    pub path: String,
    pub file_count: usize,
    pub total_size_bytes: u64,
    pub files: Vec<FileInfo>,
}

/// 文件信息
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub is_directory: bool,
    pub modified: Option<String>,
}

/// 扫描 OpenClaw 相关文件
#[command]
pub async fn scan_openclaw_files() -> Result<Vec<ScanResult>, String> {
    let mut results = Vec::new();
    
    for (category, dir_path) in openclaw_directories() {
        if !dir_path.exists() {
            continue;
        }
        
        let mut files = Vec::new();
        let mut total_size: u64 = 0;
        
        if let Ok(entries) = fs::read_dir(&dir_path) {
            for entry in entries.flatten() {
                let path = entry.path();
                let metadata = entry.metadata().ok();
                let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
                let modified = metadata.as_ref()
                    .and_then(|m| m.modified().ok())
                    .map(|t| {
                        let datetime: std::time::SystemTime = t;
                        let duration = datetime.duration_since(std::time::UNIX_EPOCH).ok();
                        duration.map(|d| {
                            let secs = d.as_secs();
                            let days = secs / 86400;
                            let years = days / 365;
                            let year = 1970 + years;
                            let remaining_days = days % 365;
                            let month = remaining_days / 30 + 1;
                            let day = remaining_days % 30 + 1;
                            format!("{}-{:02}-{:02}", year, month, day)
                        }).unwrap_or_else(|| "unknown".to_string())
                    });
                
                total_size += size;
                
                files.push(FileInfo {
                    name: entry.file_name().to_string_lossy().to_string(),
                    path: path.to_string_lossy().to_string(),
                    size_bytes: size,
                    is_directory: path.is_dir(),
                    modified,
                });
            }
        }
        
        if !files.is_empty() {
            results.push(ScanResult {
                category,
                path: dir_path.to_string_lossy().to_string(),
                file_count: files.len(),
                total_size_bytes: total_size,
                files,
            });
        }
    }
    
    Ok(results)
}

/// 删除指定文件/目录
#[command]
pub async fn delete_openclaw_file(path: String, is_directory: bool) -> Result<(), String> {
    let p = PathBuf::from(&path);
    
    // 安全检查：只允许删除 OpenClaw 相关目录
    let allowed_dirs = [
        PathBuf::from(r"C:\Users\User\.openclaw"),
        PathBuf::from(&std::env::var("OPENCLAW_DIR").unwrap_or_default()),
    ];
    let is_allowed = allowed_dirs.iter().any(|allowed| p.starts_with(allowed));
    if !is_allowed {
        return Err("安全限制：只能删除 OpenClaw 配置目录下的文件".to_string());
    }
    
    if !p.exists() {
        return Err("文件不存在".to_string());
    }
    
    if is_directory {
        fs::remove_dir_all(&p).map_err(|e| format!("删除目录失败: {}", e))?;
    } else {
        fs::remove_file(&p).map_err(|e| format!("删除文件失败: {}", e))?;
    }
    
    Ok(())
}