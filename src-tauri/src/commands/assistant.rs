use base64::{engine::general_purpose, Engine as _};
/// AI 助手工具命令
/// 提供终端执行、文件读写、目录列表等能力
/// 仅在用户主动开启工具后由 AI 调用
#[cfg(target_os = "windows")]
#[allow(unused_imports)]
use std::os::windows::process::CommandExt;
use std::path::PathBuf;

/// 审计日志：记录 AI 助手的敏感操作（exec / read / write）
fn audit_log(action: &str, detail: &str) {
    let log_dir = super::openclaw_dir().join("logs");
    let _ = std::fs::create_dir_all(&log_dir);
    let log_path = log_dir.join("assistant-audit.log");
    let ts = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    let line = format!("[{ts}] [{action}] {detail}\n");
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .and_then(|mut f| std::io::Write::write_all(&mut f, line.as_bytes()));
}

/// 屠戮OpenClaw 数据目录（~/.openclaw/屠戮OpenClaw/）
fn data_dir() -> PathBuf {
    super::openclaw_dir().join("屠戮OpenClaw")
}

/// 确保数据目录及子目录存在，返回目录路径
#[tauri::command]
pub async fn assistant_ensure_data_dir() -> Result<String, String> {
    let base = data_dir();
    let subdirs = ["images", "sessions", "cache"];
    for sub in &subdirs {
        let dir = base.join(sub);
        tokio::fs::create_dir_all(&dir)
            .await
            .map_err(|e| format!("创建目录 {} 失败: {e}", dir.display()))?;
    }
    Ok(base.to_string_lossy().to_string())
}

/// 保存图片（base64 → 文件），返回文件路径
#[tauri::command]
pub async fn assistant_save_image(id: String, data: String) -> Result<String, String> {
    let dir = data_dir().join("images");
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("创建目录失败: {e}"))?;

    // data 可能包含 data:image/xxx;base64, 前缀
    let pure_b64 = if let Some(pos) = data.find(",") {
        &data[pos + 1..]
    } else {
        &data
    };

    // 从 data URI 提取扩展名
    let ext = if data.starts_with("data:image/png") {
        "png"
    } else if data.starts_with("data:image/gif") {
        "gif"
    } else if data.starts_with("data:image/webp") {
        "webp"
    } else {
        "jpg"
    };

    let filename = format!("{}.{}", id, ext);
    let filepath = dir.join(&filename);

    let bytes = general_purpose::STANDARD
        .decode(pure_b64)
        .map_err(|e| format!("base64 解码失败: {e}"))?;

    tokio::fs::write(&filepath, &bytes)
        .await
        .map_err(|e| format!("写入图片失败: {e}"))?;

    Ok(filepath.to_string_lossy().to_string())
}

/// 加载图片（文件 → base64 data URI）
#[tauri::command]
pub async fn assistant_load_image(id: String) -> Result<String, String> {
    let dir = data_dir().join("images");

    // 尝试各种扩展名
    let mut found: Option<PathBuf> = None;
    for ext in &["jpg", "png", "gif", "webp", "jpeg"] {
        let path = dir.join(format!("{}.{}", id, ext));
        if path.exists() {
            found = Some(path);
            break;
        }
    }

    let filepath = found.ok_or_else(|| format!("图片 {} 不存在", id))?;
    let bytes = tokio::fs::read(&filepath)
        .await
        .map_err(|e| format!("读取图片失败: {e}"))?;

    let ext = filepath
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpg");
    let mime = match ext {
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "image/jpeg",
    };

    let b64 = general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}

/// 删除图片文件
#[tauri::command]
pub async fn assistant_delete_image(id: String) -> Result<(), String> {
    let dir = data_dir().join("images");
    for ext in &["jpg", "png", "gif", "webp", "jpeg"] {
        let path = dir.join(format!("{}.{}", id, ext));
        if path.exists() {
            tokio::fs::remove_file(&path)
                .await
                .map_err(|e| format!("删除图片失败: {e}"))?;
        }
    }
    Ok(())
}

// ── AI 助手工具 ──

/// 执行 shell 命令，返回 stdout + stderr
#[tauri::command]
pub async fn assistant_exec(command: String, cwd: Option<String>) -> Result<String, String> {
    let work_dir = cwd.unwrap_or_else(|| {
        dirs::home_dir()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
    });

    audit_log("EXEC", &format!("cmd={command} cwd={work_dir}"));

    let output;

    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        output = tokio::process::Command::new("cmd")
            .args(["/c", &command])
            .current_dir(&work_dir)
            .env("PATH", super::enhanced_path())
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .await
            .map_err(|e| format!("执行失败: {e}"))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        output = tokio::process::Command::new("sh")
            .args(["-c", &command])
            .current_dir(&work_dir)
            .env("PATH", super::enhanced_path())
            .output()
            .await
            .map_err(|e| format!("执行失败: {e}"))?;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let code = output.status.code().unwrap_or(-1);

    let mut result = String::new();
    if !stdout.is_empty() {
        result.push_str(&stdout);
    }
    if !stderr.is_empty() {
        if !result.is_empty() {
            result.push('\n');
        }
        result.push_str("[stderr] ");
        result.push_str(&stderr);
    }
    if result.is_empty() {
        result = format!("(命令已执行，退出码: {code})");
    } else if code != 0 {
        result.push_str(&format!("\n(退出码: {code})"));
    }

    // 限制输出长度
    if result.len() > 10000 {
        result.truncate(10000);
        result.push_str("\n...(输出已截断)");
    }

    Ok(result)
}

/// 读取文件内容
#[tauri::command]
pub async fn assistant_read_file(path: String) -> Result<String, String> {
    audit_log("READ", &path);
    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("读取文件失败 {path}: {e}"))?;

    if content.len() > 50000 {
        Ok(format!(
            "{}...\n(文件内容已截断，共 {} 字节)",
            &content[..50000],
            content.len()
        ))
    } else {
        Ok(content)
    }
}

/// 写入文件
#[tauri::command]
pub async fn assistant_write_file(path: String, content: String) -> Result<String, String> {
    audit_log("WRITE", &format!("{path} ({} bytes)", content.len()));
    if let Some(parent) = PathBuf::from(&path).parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("创建目录失败: {e}"))?;
    }

    tokio::fs::write(&path, &content)
        .await
        .map_err(|e| format!("写入文件失败 {path}: {e}"))?;

    Ok(format!("已写入 {} ({} 字节)", path, content.len()))
}

/// 获取系统信息（OS、架构、主目录、主机名）
#[tauri::command]
pub async fn assistant_system_info() -> Result<String, String> {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let home = dirs::home_dir()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let hostname = std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "unknown".into());
    let shell = if cfg!(target_os = "windows") {
        "powershell / cmd"
    } else if cfg!(target_os = "macos") {
        "zsh (macOS default)"
    } else {
        "bash / sh"
    };

    Ok(format!(
        "OS: {}\nArch: {}\nHome: {}\nHostname: {}\nShell: {}\nPath separator: {}",
        os,
        arch,
        home,
        hostname,
        shell,
        std::path::MAIN_SEPARATOR
    ))
}

/// 列出运行中的进程（按名称过滤）
#[tauri::command]
pub async fn assistant_list_processes(filter: Option<String>) -> Result<String, String> {
    let output;
    #[cfg(target_os = "windows")]
    {
        output = tokio::process::Command::new("powershell")
            .args(["-NoProfile", "-Command",
                "Get-Process | Select-Object Id, ProcessName, CPU, WorkingSet64 | Sort-Object ProcessName | Format-Table -AutoSize | Out-String -Width 200"])
            
            .output()
            .await;
    }
    #[cfg(not(target_os = "windows"))]
    {
        output = tokio::process::Command::new("ps")
            .args(["aux", "--sort=-%mem"])
            .output()
            .await;
    }

    let output = output.map_err(|e| format!("获取进程列表失败: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    if let Some(f) = filter {
        let f_lower = f.to_lowercase();
        let lines: Vec<&str> = stdout
            .lines()
            .filter(|line| {
                let lower = line.to_lowercase();
                lower.contains(&f_lower)
                    || lower.starts_with("id")
                    || lower.starts_with("user")
                    || lower.contains("---")
            })
            .collect();
        if lines.len() <= 2 {
            return Ok(format!("未找到匹配 '{}' 的进程", f));
        }
        Ok(lines.join("\n"))
    } else {
        // 无过滤时限制输出行数
        let lines: Vec<&str> = stdout.lines().take(80).collect();
        Ok(lines.join("\n"))
    }
}

/// 检测端口是否在监听
#[tauri::command]
pub async fn assistant_check_port(port: u16) -> Result<String, String> {
    use std::time::Duration;

    let addr = format!("127.0.0.1:{}", port);
    let result = std::net::TcpStream::connect_timeout(
        &addr.parse().map_err(|e| format!("地址解析失败: {e}"))?,
        Duration::from_secs(2),
    );

    match result {
        Ok(_stream) => {
            // 尝试获取占用进程信息
            let process_info = get_port_process(port).await;
            Ok(format!(
                "端口 {} 已被占用（正在监听）{}",
                port, process_info
            ))
        }
        Err(_) => Ok(format!("端口 {} 未被占用（空闲）", port)),
    }
}

async fn get_port_process(port: u16) -> String {
    let output;
    #[cfg(target_os = "windows")]
    {
        output = tokio::process::Command::new("powershell")
            .args(["-NoProfile", "-Command",
                &format!("Get-NetTCPConnection -LocalPort {} -ErrorAction SilentlyContinue | Select-Object OwningProcess | ForEach-Object {{ (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName }}", port)])
            
            .output()
            .await;
    }
    #[cfg(not(target_os = "windows"))]
    {
        output = tokio::process::Command::new("lsof")
            .args(["-i", &format!(":{}", port), "-t"])
            .output()
            .await;
    }

    match output {
        Ok(o) => {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if s.is_empty() {
                String::new()
            } else {
                format!("\n占用进程: {}", s)
            }
        }
        Err(_) => String::new(),
    }
}

/// 联网搜索（DuckDuckGo HTML）
#[tauri::command]
pub async fn assistant_web_search(
    query: String,
    max_results: Option<usize>,
) -> Result<String, String> {
    let max = max_results.unwrap_or(5);
    let url = format!(
        "https://html.duckduckgo.com/html/?q={}",
        urlencoding::encode(&query)
    );

    let client = super::build_http_client(
        std::time::Duration::from_secs(10),
        Some("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"),
    )
    .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

    let html = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("搜索请求失败: {e}"))?
        .text()
        .await
        .map_err(|e| format!("读取搜索结果失败: {e}"))?;

    // 解析搜索结果
    let mut results = Vec::new();
    let re_result = regex::Regex::new(
        r#"class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)</a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)</a>"#
    ).unwrap();

    let re_strip_tags = regex::Regex::new(r"<[^>]+>").unwrap();

    for cap in re_result.captures_iter(&html) {
        if results.len() >= max {
            break;
        }
        let raw_url = &cap[1];
        let title = re_strip_tags.replace_all(&cap[2], "").trim().to_string();
        let snippet = re_strip_tags.replace_all(&cap[3], "").trim().to_string();

        // 解码 DuckDuckGo 的重定向 URL
        let final_url = if let Some(pos) = raw_url.find("uddg=") {
            let encoded = &raw_url[pos + 5..];
            let end = encoded.find('&').unwrap_or(encoded.len());
            urlencoding::decode(&encoded[..end])
                .unwrap_or_else(|_| encoded[..end].into())
                .to_string()
        } else {
            raw_url.to_string()
        };

        if !title.is_empty() && !final_url.is_empty() {
            results.push((title, final_url, snippet));
        }
    }

    if results.is_empty() {
        return Ok(format!("搜索「{}」未找到相关结果。", query));
    }

    let mut output = format!("搜索「{}」找到 {} 条结果：\n\n", query, results.len());
    for (i, (title, url, snippet)) in results.iter().enumerate() {
        output.push_str(&format!(
            "{}. **{}**\n   {}\n   {}\n\n",
            i + 1,
            title,
            url,
            snippet
        ));
    }
    Ok(output)
}

/// 通过 PowerShell iwr 代理 HTTP 请求（绕过 WebView CORS 限制，继承系统网络和代理设置）
#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn vod_fetch(url: String, _timeout_secs: Option<u64>) -> Result<String, String> {
    use std::process::Command;
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL 必须以 http:// 或 https:// 开头".into());
    }
    let escaped = url.replace("'", "''");
    // 正确处理 GBK 编码 + gzip/deflate 自动解压，用 Base64 传输避免编码问题
    let ps = format!(
        r#"try {{
            Add-Type -AssemblyName System.IO.Compression
            $req = [System.Net.WebRequest]::Create('{}')
            $req.UserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            $req.Accept = 'application/json, text/plain, */*'
            $req.Timeout = 30000
            $resp = $req.GetResponse()
            $rs = $resp.GetResponseStream()
            $ms = [System.IO.MemoryStream]::new()
            if ($resp.ContentEncoding -and $resp.ContentEncoding.ToLower().Contains('gzip')) {{
                $gz = [System.IO.Compression.GZipStream]::new($rs, [System.IO.Compression.CompressionMode]::Decompress)
                $gz.CopyTo($ms)
                $gz.Close()
            }} else {{
                $rs.CopyTo($ms)
            }}
            $rs.Close(); $resp.Close()
            $bytes = $ms.ToArray()
            $ms.Close()
            # ── 编码处理：用 UTF-8 直接输出，绕过控制台编码问题
            [System.Console]::OutputEncoding = [System.Text.Encoding]::UTF8
            $OutputEncoding = [System.Text.Encoding]::UTF8
            $textUtf8 = [System.Text.Encoding]::UTF8.GetString($bytes)
            $ffc = ($textUtf8.ToCharArray() | Where-Object {{ [int]$_ -eq 0xFFFD }} | Measure-Object).Count
            if ($ffc -gt 0) {{
                # 含乱码 → GBK 字节序列，用 [Console] 输出绕过编码
                $gbk = [System.Text.Encoding]::GetEncoding('GBK')
                $decoded = $gbk.GetString($bytes)
                [System.Console]::Out.Flush()
                [System.Console]::Out.NewLine = ''
                [System.Console]::Out.Write($decoded)
            }} else {{
                [System.Console]::Out.Flush()
                [System.Console]::Out.NewLine = ''
                [System.Console]::Out.Write($textUtf8)
            }}
        }} catch {{
            Write-Output ('VOD_ERROR:' + $_.Exception.Message)
        }}"#,
        escaped
    );
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output()
        .map_err(|e| format!("PowerShell 执行失败: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !output.status.success() || stdout.contains("VOD_ERROR:") {
        let msg = if stdout.starts_with("VOD_ERROR:") {
            stdout.trim_start_matches("VOD_ERROR:").trim()
        } else {
            stderr.trim()
        };
        return Err(format!("vod_fetch failed: {}", msg));
    }
    Ok(stdout)
}

/// 抓取 URL 内容（通过 Jina Reader API）
#[tauri::command]
pub async fn assistant_fetch_url(url: String) -> Result<String, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL 必须以 http:// 或 https:// 开头".into());
    }

    let jina_url = format!("https://r.jina.ai/{}", url);
    let client = super::build_http_client(std::time::Duration::from_secs(15), Some("Mozilla/5.0"))
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

    let content = client
        .get(&jina_url)
        .header("Accept", "text/plain")
        .send()
        .await
        .map_err(|e| format!("抓取失败: {e}"))?
        .text()
        .await
        .map_err(|e| format!("读取内容失败: {e}"))?;

    if content.len() > 100_000 {
        Ok(format!(
            "{}\n\n[内容已截断，超过 100KB 限制]",
            &content[..100_000]
        ))
    } else if content.is_empty() {
        Ok("（页面内容为空）".into())
    } else {
        Ok(content)
    }
}

/// 爬虫用：抓取任意网页 HTML
#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn fetch_page(url: String) -> Result<String, String> {
    use std::process::Command;
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL 必须以 http:// 或 https:// 开头".into());
    }
    let escaped = url.replace("'", "''");
    let ps = format!(
        r#"try {{
            [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
            $r = Invoke-WebRequest '{}' -UserAgent 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' -Headers @{{'Accept'='text/html,application/xhtml+xml,*/*'}}
            $bytes = [System.Text.Encoding]::GetEncoding('UTF-8').GetBytes($r.Content)
            Write-Output ([System.Text.Encoding]::UTF8.GetString($bytes))
        }} catch {{
            Write-Output ('FETCH_ERROR:' + $_.Exception.Message)
 }}"#,
        escaped
    );
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output()
        .map_err(|e| format!("PowerShell 执行失败: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    if !output.status.success() || stdout.contains("FETCH_ERROR:") {
        return Err(format!("fetch_page failed: {stdout}"));
    }
    Ok(stdout.trim().to_string())
}

/// 使用 WebView2/Edge 渲染 JS 页面，提取视频 URL（用于 JS 动态渲染站）
/// 策略：Edge headless + Chrome DevTools Protocol (CDP)
#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn fetch_page_js(url: String) -> Result<String, String> {
    use std::process::Command;
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL 必须以 http:// 或 https:// 开头".into());
    }

    // Edge 通常在这里
    let msedge_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Windows\System32\msedge.exe",
    ];
    let msedge_exe = msedge_paths.iter().find(|p| std::path::Path::new(p).exists());
    let browser_exe = msedge_exe.copied().unwrap_or("");

    // 用 CDP 的提取脚本
    let extract_js = r#"
(function() {
    var r = [];
    var seen = new Set();
    function add(u, n, t) {
        if (!u || seen.has(u)) return;
        seen.add(u);
        r.push({url: u, name: n || u.split('/').pop().replace(/\.[^.]+$/,''), type: t || 'unknown'});
    }
    // video / source
    document.querySelectorAll('video').forEach(function(v) {
        add(v.src, 'video.src', 'video');
        v.querySelectorAll('source').forEach(function(s) { add(s.src, 'source.src', 'video'); });
    });
    // a[href] with m3u8/mp4
    document.querySelectorAll('a[href]').forEach(function(a) {
        var h = a.getAttribute('href');
        if (h && (h.includes('.m3u8') || h.includes('.mp4'))) add(h, a.textContent.trim().slice(0,40) || 'link', 'a.href');
    });
    // data-url / data-src
    document.querySelectorAll('[data-url]').forEach(function(el) { add(el.getAttribute('data-url'), 'data-url', 'data-url'); });
    document.querySelectorAll('[data-src]').forEach(function(el) { add(el.getAttribute('data-src'), 'data-src', 'data-src'); });
    document.querySelectorAll('[data-play]').forEach(function(el) { add(el.getAttribute('data-play'), 'data-play', 'data-play'); });
    // script text with m3u8/mp4
    var scripts = document.querySelectorAll('script');
    for (var i=0; i<scripts.length; i++) {
        var txt = scripts[i].textContent;
        var m;
        var re = /(?:https?:)?[^\s\"\'<>]+\.(?:m3u8|mp4)[^\s\"\'<>]*/gi;
        while ((m = re.exec(txt)) !== null) { add(m[0], 'script.m3u8mp4', 'script'); }
        // player_xxxx = {...}
        var pm = txt.match(/var\s+\w+\s*=\s*(\{[^;]+\})/gi);
        if (pm) {
            for (var j=0; j<pm.length; j++) {
                var u = (pm[j].match(/"url"\s*:\s*"([^"]+)"/) || ['',''])[1];
                if (u) {
                    u = u.replace(/\\\//g,'/').replace(/\\u([0-9a-f]{2})/gi, function(_,h){return String.fromCharCode(parseInt(h,16));});
                    add(u, 'player.var', 'player');
                }
            }
        }
    }
    // iframe src
    document.querySelectorAll('iframe').forEach(function(f) {
        var s = f.src;
        if (s && !s.startsWith('about:') && !s.startsWith('javascript:')) add(s, 'iframe.src', 'iframe');
        var ds = f.getAttribute('data-src');
        if (ds) add(ds, 'iframe.data-src', 'iframe');
    });
    return JSON.stringify(r);
})()"#;

    // Base64 编码避免转义问题
    let extract_b64 = base64::engine::general_purpose::STANDARD.encode(extract_js);

    let ps = format!(
        r#"
$ErrorActionPreference = 'SilentlyContinue'
$json = ""

# Edge DevTools Protocol - 启动临时用户目录避免冲突
$tmpDir = Join-Path $env:TEMP ([IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

$dbgPort = {port}
$userDirArg = "--user-data-dir=`"$tmpDir`""

# 启动 Edge headless + CDP
$proc = Start-Process '{browser}' -ArgumentList "--headless=new","--no-sandbox","--disable-gpu","--remote-debugging-port=$dbgPort",$userDirArg,'{url}' -PassThru -WindowStyle Hidden

Start-Sleep 3

try {{
    # CDP: 获取 target 列表
    $jsonUrl = "http://localhost:$dbgPort/json"
    $resp = Invoke-RestMethod $jsonUrl -TimeoutSec 5 -ErrorAction Stop
    if (-not $resp) {{ throw "CDP: 无法获取 target" }}

    $target = ($resp | Select-Object -First 1)
    if (-not $target.id) {{ throw "CDP: 未找到 target id" }}

    # CDP WebSocket URL
    $wsUrl = $target.webSocketDebuggerUrl
    if (-not $wsUrl) {{ throw "CDP: 未获取 websocket URL" }}

    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = [Threading.CancellationToken]::None
    $ws.ConnectAsync($wsUrl, $ct).Wait(5000)
    if ($ws.State -ne 'Open') {{ throw "CDP: websocket 连接失败" }}

    # 启用 Runtime
    $ws.SendAsync([ArraySegment[byte]][Text.Encoding]::UTF8.GetBytes('{{"id":1,"method":"Runtime.enable"}}'), 'Text', $true, $ct).Wait(1000)

    # 等 JS 执行
    Start-Sleep -Seconds 3

    # 执行提取脚本
    $scriptB64 = '{extract_b64}'
    $evalCmd = '{{"id":10,"method":"Runtime.evaluate","params":{{"expression":"eval(atob(`\"" + $scriptB64 + "`\"))","returnByValue":true}}}}'
    $ws.SendAsync([ArraySegment[byte]][Text.Encoding]::UTF8.GetBytes($evalCmd), 'Text', $true, $ct).Wait(5000)

    # 读取结果
    $buf = [byte[]]::new(16384)
    $result = $ws.ReceiveAsync([ArraySegment[byte]]$buf, $ct).Wait(8000)
    if ($result.Count -gt 0) {{
        $json = [Text.Encoding]::UTF8.GetString($buf, 0, $result.Count)
    }}

    $ws.CloseAsync('NormalClosure', '', $ct).Wait(1000)

    if ($json -match 'JS_OK:') {{
        $json = ($json -split 'JS_OK:')[1]
        Write-Output ("JS_OK:" + $json)
    }} elseif ($json -match '"result":{{"value":') {{
        Write-Output ("JS_OK:" + ($json -split '"value":')[1].TrimEnd('}}'))
    }} else {{
        Write-Output "JS_EMPTY"
    }}
}} catch {{
    Write-Output ("JS_ERROR:" + $_.Exception.Message)
}} finally {{
    if ($proc -and -not $proc.HasExited) {{ Stop-Process $proc.Id -Force -ErrorAction SilentlyContinue }}
    Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
}}
"#,
        browser = browser_exe,
        url = url,
        port = 9222,
        extract_b64 = extract_b64
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("PowerShell 执行失败: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !output.status.success() {
        return Err(format!("fetch_page_js 失败: {}", stderr.trim()));
    }

    let out = stdout.trim();
    if let Some(pos) = out.find("JS_OK:") {
        let json_str = &out[pos + 7..];
        Ok(json_str.to_string())
    } else if out.starts_with("JS_EMPTY") {
        Ok("[]".to_string())
    } else if out.starts_with("JS_ERROR:") {
        Err(format!("fetch_page_js 错误: {}", &out[9..].trim()))
    } else {
        Err(format!("fetch_page_js 未返回有效结果: {}", out))
    }
}

/// 打开独立播放器窗口（新窗口，不影响主界面）
#[tauri::command]
pub async fn open_player_window(url: String, title: String, resume: f64) -> Result<String, String> {
    if url.is_empty() {
        return Err("视频URL不能为空".into());
    }
    // 获取 exe 所在目录，找 player.html
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("获取程序路径失败: {}", e))?;
    let base_dir = exe_path.parent()
        .ok_or_else(|| String::from("无法获取程序目录"))?;

    // 优先找 src/player.html（开发目录）
    let dev_html = base_dir.join("src").join("player.html");
    let html_path = if dev_html.exists() {
        dev_html
    } else {
        let root_html = base_dir.join("player.html");
        if root_html.exists() { root_html }
        else { base_dir.join("player.html") }
    };

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;

        if !html_path.exists() {
            Command::new("cmd")
                .args(["/c", "start", "", &url])
                .creation_flags(0x08000000)
                .spawn()
                .map_err(|e| format!("打开链接失败: {}", e))?;
            return Ok("ok (外部浏览器)".into());
        }

        let encoded_url = url.replace('&', "%26").replace('?', "%3f");
        let file_url = format!(
            "file:///{}/player.html?url={}&title={}&resume={}",
            html_path.to_string_lossy().replace('\\', "/"),
            encoded_url.replace("/", "%2f"),
            title.replace("/", "%2f").replace(" ", "%20"),
            resume
        );

        Command::new("cmd")
            .args(["/c", "start", "", &file_url])
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|e| format!("打开播放器失败: {}", e))?;
        Ok("ok".into())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (html_path, url, title, resume);
        Err("open_player_window 仅支持 Windows 平台".into())
    }
}

/// 列出目录内容
#[tauri::command]
pub async fn assistant_list_dir(path: String) -> Result<String, String> {
    let mut entries = tokio::fs::read_dir(&path)
        .await
        .map_err(|e| format!("读取目录失败 {path}: {e}"))?;

    let mut items = Vec::new();
    while let Some(entry) = entries.next_entry().await.map_err(|e| format!("{e}"))? {
        let meta = entry.metadata().await.ok();
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);

        if is_dir {
            items.push(format!("[DIR]  {}/", name));
        } else {
            items.push(format!("[FILE] {} ({} bytes)", name, size));
        }

        if items.len() >= 200 {
            items.push("...(已截断)".into());
            break;
        }
    }

    items.sort();
    Ok(items.join("\n"))
}
