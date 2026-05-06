import re

filepath = r"C:\Users\User\tulu-openclaw-v2\src-tauri\src\commands\assistant.rs"
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Find the boundaries: from "fn add_url(" to the line before "async fn scan_html_recursive"
# We need to replace: add_url, scan_text, url_decode_str, try_decode_str
# Keep: scan_html_recursive, scan_js_files, scan_iframes, scan_meta, probe_paths

# Find start: "    fn add_url("
start_marker = "    fn add_url("
start_idx = content.find(start_marker)
if start_idx == -1:
    print("ERROR: Could not find start marker")
    exit(1)

# Find end: the line before "    #[async_recursion::async_recursion]"
# which marks the start of scan_html_recursive
end_marker = "    #[async_recursion::async_recursion]"
end_idx = content.find(end_marker, start_idx)
if end_idx == -1:
    print("ERROR: Could not find end marker")
    exit(1)

# Also need to replace scan_js_strings function
# Find it: "    fn scan_js_strings("
js_start_marker = "    fn scan_js_strings("
js_start_idx = content.find(js_start_marker)
if js_start_idx == -1:
    print("ERROR: Could not find scan_js_strings")
    exit(1)

# Find end of scan_js_strings: the line before "    async fn scan_js_files("
js_end_marker = "    async fn scan_js_files("
js_end_idx = content.find(js_start_marker)
# Actually find the end by looking for the next function definition after scan_js_strings
# scan_js_strings ends with "    }" followed by a blank line and then "    async fn scan_js_files("
# Let me find "    async fn scan_js_files(" after scan_js_strings
js_end_search = content.find("    async fn scan_js_files(", js_start_idx)
if js_end_search == -1:
    print("ERROR: Could not find scan_js_files")
    exit(1)

# The replacement for add_url through try_decode_str (before scan_html_recursive)
new_funcs = r'''    fn add_url(
        u: &str,
        src: &str,
        results: &mut Vec<serde_json::Value>,
        seen: &mut std::collections::HashSet<String>,
    ) {
        let u = u.trim();
        if u.is_empty() || u.len() > 4096 {
            return;
        }
        if !u.starts_with("http") {
            return;
        }
        if seen.contains(u) {
            return;
        }
        seen.insert(u.to_string());
        results.push(serde_json::json!({ "url": u, "from": src }));
    }

    fn url_decode_str(s: &str) -> String {
        urlencoding::decode(s)
            .map(|r| r.into_owned())
            .unwrap_or_else(|_| s.to_string())
    }

    /// 深度解码：URL解码 + base64解码（递归，最多3层）
    fn deep_decode(
        s: &str,
        src: &str,
        results: &mut Vec<serde_json::Value>,
        seen: &mut std::collections::HashSet<String>,
        depth: usize,
    ) {
        if depth == 0 || s.is_empty() {
            return;
        }
        let url_decoded = url_decode_str(s);
        if url_decoded != s {
            scan_text(&url_decoded, &format!("{} (url-decode)", src), results, seen);
            if depth > 1 {
                deep_decode(&url_decoded, &format!("{} (url-decode^2)"), results, seen, depth - 1);
            }
        }
        if s.len() >= 16 {
            if let Ok(bytes) =
                base64::Engine::decode(&base64::engine::general_purpose::STANDARD, s)
            {
                if let Ok(s2) = String::from_utf8(bytes) {
                    if s2.len() > 4 && is_printable(&s2) {
                        scan_text(&s2, &format!("{} (base64)"), results, seen);
                        deep_decode(&s2, &format!("{} (base64-deep)"), results, seen, depth - 1);
                    }
                }
            }
        }
    }

    fn is_printable(s: &str) -> bool {
        s.chars()
            .filter(|c| c.is_control() && *c != '\n' && *c != '\r' && *c != '\t')
            .count()
            < s.len() / 4
    }

    /// 扫描文本中的视频 URL（增强版：query string解码 + 多格式 + RTMP）
    fn scan_text(
        text: &str,
        src: &str,
        results: &mut Vec<serde_json::Value>,
        seen: &mut std::collections::HashSet<String>,
    ) {
        // 1. m3u8 URL
        if let Ok(re) = regex::Regex::new(r#"https?://[^"'\s<>\\]+\.m3u8[^"'\s<>\\]*"#) {
            for m in re.find_iter(text) {
                add_url(m.as_str(), src, results, seen);
            }
        }
        // 2. 双引号包裹
        if let Ok(re) = regex::Regex::new(r#""(https?://[^"\\]+\.m3u8[^"\\]*)""#) {
            for c in re.captures_iter(text) {
                if let Some(v) = c.get(1) {
                    add_url(v.as_str(), src, results, seen);
                }
            }
        }
        // 3. 单引号包裹
        if let Ok(re) = regex::Regex::new(r#"'+(https?://[^'\\]+\.m3u8[^'\\]*)'+"#) {
            for c in re.captures_iter(text) {
                if let Some(v) = c.get(1) {
                    add_url(v.as_str(), src, results, seen);
                }
            }
        }
        // 4. mp4/flv/webm 直链
        if let Ok(re) = regex::Regex::new(r#"https?://[^"'\s<>\\]+\.(?:mp4|flv|webm|ts)[^"'\s<>\\]*"#)
        {
            for m in re.find_iter(text) {
                let u = m.as_str();
                if u.len() > 20
                    && !u.contains(".js")
                    && !u.contains(".css")
                    && !u.contains(".png")
                    && !u.contains(".jpg")
                {
                    add_url(u, src, results, seen);
                }
            }
        }
        // 5. Query string 编码的 URL
        if let Ok(re) = regex::Regex::new(
            r#"(?:url|src|href|video|stream|link|source|m3u8|file)=(https?%3A[^&"'\s<>]+)"#,
        ) {
            for c in re.captures_iter(text) {
                if let Some(v) = c.get(1) {
                    let decoded = url_decode_str(v.as_str());
                    scan_text(&decoded, &format!("{} (query-param)"), results, seen);
                }
            }
        }
        // 6. RTMP URL
        if let Ok(re) = regex::Regex::new(r#"rtmp://[^"'\s<>\\]+"#) {
            for m in re.find_iter(text) {
                add_url(m.as_str(), &format!("{} (rtmp)"), results, seen);
            }
        }
    }

    /// 深度 JS 扫描：字符串提取 + 模式匹配 + 拼接检测 + 配置对象
    fn scan_js_deep(
        js: &str,
        src: &str,
        results: &mut Vec<serde_json::Value>,
        seen: &mut std::collections::HashSet<String>,
    ) {
        // 1. eval/Function/setTimeout/atob 包裹
        for pat in &[
            r#"eval\s*\(\s*["']([^"']+)["']\s*\)"#,
            r#"Function\s*\(\s*["']([^"']+)["']\s*\)"#,
            r#"setTimeout\s*\(\s*["']([^"']+)"#,
            r#"atob\s*\(\s*["']([^"']+)["']\s*\)"#,
        ] {
            if let Ok(re) = regex::Regex::new(pat) {
                for c in re.captures_iter(js) {
                    if let Some(s_m) = c.get(1) {
                        let v = s_m.as_str();
                        scan_text(v, src, results, seen);
                        deep_decode(v, src, results, seen, 3);
                    }
                }
            }
        }

        // 2. JSON.parse 解析数组/对象
        if let Ok(re) = regex::Regex::new(r#"JSON\.parse\s*\(\s*["']([^"']+)["']\s*\)"#) {
            for c in re.captures_iter(js) {
                if let Some(s_m) = c.get(1) {
                    let decoded = url_decode_str(s_m.as_str());
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&decoded) {
                        extract_urls_from_json(&parsed, src, results, seen);
                    }
                }
            }
        }

        // 3. 模板字符串
        if let Ok(re) = regex::Regex::new(r#"``([^`]+)``"#) {
            for c in re.captures_iter(js) {
                if let Some(s_m) = c.get(1) {
                    scan_text(&url_decode_str(s_m.as_str()), src, results, seen);
                }
            }
        }

        // 4. 长 base64 字符串
        if let Ok(re) = regex::Regex::new(r#"["']([A-Za-z0-9+/=_\-]{40,})["']"#) {
            for c in re.captures_iter(js) {
                if let Some(s_m) = c.get(1) {
                    deep_decode(s_m.as_str(), src, results, seen, 2);
                }
            }
        }

        // 5. 字符串拼接 URL（host + "/live.m3u8"）
        if let Ok(re) = regex::Regex::new(
            r#"["'](https?://[^"']+)["']\s*\+\s*["']([^"']*(?:\.m3u8|/live|/stream|/play)[^"']*)["']"#,
        ) {
            for c in re.captures_iter(js) {
                if let (Some(a), Some(b)) = (c.get(1), c.get(2)) {
                    let url = format!("{}{}", a.as_str(), b.as_str());
                    add_url(&url, &format!("{} (concat)"), results, seen);
                }
            }
        }

        // 6. 配置对象中的 URL
        if let Ok(re) = regex::Regex::new(
            r#"(?:sources?|src|url|stream|hls|video|file|playurl|streamurl|videoUrl|playUrl)\s*[:=]\s*["'](https?://[^"']+\.m3u8[^"']*)["']"#,
        ) {
            for c in re.captures_iter(js) {
                if let Some(v) = c.get(1) {
                    add_url(v.as_str(), &format!("{} (config)"), results, seen);
                }
            }
        }

        // 7. fetch/XMLHttpRequest URL
        if let Ok(re) = regex::Regex::new(
            r#"(?:fetch|XMLHttpRequest|axios\.get|axios\.post|\$\.ajax|\$\.get)\s*\(\s*["'](https?://[^"']+)"#,
        ) {
            for c in re.captures_iter(js) {
                if let Some(v) = c.get(1) {
                    scan_text(v.as_str(), &format!("{} (fetch)"), results, seen);
                }
            }
        }

        // 8. WebSocket URL
        if let Ok(re) = regex::Regex::new(r#"wss?://[^"'\s<>\\]+"#) {
            for m in re.find_iter(js) {
                add_url(m.as_str(), &format!("{} (ws)"), results, seen);
            }
        }

        // 9. new URL() 构造
        if let Ok(re) = regex::Regex::new(r#"new\s+URL\s*\(\s*["'](https?://[^"']+)"#) {
            for c in re.captures_iter(js) {
                if let Some(v) = c.get(1) {
                    scan_text(v.as_str(), &format!("{} (new-URL)"), results, seen);
                }
            }
        }

        // 10. 所有含视频关键词的字符串字面量
        if let Ok(re) = regex::Regex::new(r#""([^"]{15,})""#) {
            for c in re.captures_iter(js) {
                if let Some(v) = c.get(1) {
                    let s = v.as_str();
                    if s.contains("m3u8")
                        || s.contains("/live")
                        || s.contains("/stream")
                        || s.contains("/play")
                    {
                        scan_text(s, &format!("{} (str-lit)"), results, seen);
                        deep_decode(s, &format!("{} (str-lit-deep)"), results, seen, 2);
                    }
                }
            }
        }
        if let Ok(re) = regex::Regex::new(r#"([^']{15,})'"#) {
            for c in re.captures_iter(js) {
                if let Some(v) = c.get(1) {
                    let s = v.as_str();
                    if s.contains("m3u8")
                        || s.contains("/live")
                        || s.contains("/stream")
                        || s.contains("/play")
                    {
                        scan_text(s, &format!("{} (str-lit)"), results, seen);
                        deep_decode(s, &format!("{} (str-lit-deep)"), results, seen, 2);
                    }
                }
            }
        }
    }

    /// 从 JSON 值递归提取 URL
    fn extract_urls_from_json(
        val: &serde_json::Value,
        src: &str,
        results: &mut Vec<serde_json::Value>,
        seen: &mut std::collections::HashSet<String>,
    ) {
        match val {
            serde_json::Value::String(s) => {
                scan_text(s, src, results, seen);
            }
            serde_json::Value::Array(arr) => {
                for item in arr {
                    extract_urls_from_json(item, src, results, seen);
                }
            }
            serde_json::Value::Object(map) => {
                for (_k, v) in map {
                    extract_urls_from_json(v, src, results, seen);
                }
            }
            _ => {}
        }
    }

'''

# Replace the section from add_url to try_decode_str (before scan_html_recursive)
new_content = content[:start_idx] + new_funcs + content[end_idx:]

# Now replace scan_js_strings with scan_js_deep calls
# Find scan_js_strings definition and replace it
js_start_marker2 = "    fn scan_js_strings("
js_start_idx2 = new_content.find(js_start_marker2)
if js_start_idx2 == -1:
    print("ERROR: Could not find scan_js_strings in new content")
    exit(1)

# Find the end of scan_js_strings function (matching braces)
brace_count = 0
js_func_start = new_content.find("{", js_start_idx2)
i = js_func_start
for i in range(js_func_start, len(new_content)):
    if new_content[i] == '{':
        brace_count += 1
    elif new_content[i] == '}':
        brace_count -= 1
        if brace_count == 0:
            break
js_func_end = i + 1

# Replace scan_js_strings with scan_js_deep (which is already defined above)
# We just need to remove the old scan_js_strings definition
# and update the call sites
old_js_func = new_content[js_start_idx2:js_func_end]
new_content = new_content[:js_start_idx2] + new_content[js_func_end:]

# Update call sites: scan_js_strings -> scan_js_deep
new_content = new_content.replace("scan_js_strings(script,", "scan_js_deep(script,")
new_content = new_content.replace("scan_js_strings(&js_text, this_src,", "scan_js_deep(&js_text, this_src,")

# Also need to update scan_html_recursive to call scan_js_deep instead of scan_js_strings
# The replace above should handle it

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("SUCCESS: Replaced sniffing functions")
print(f"  - Removed: add_url, scan_text, url_decode_str, try_decode_str, scan_js_strings")
print(f"  - Added: add_url(enhanced), url_decode_str, deep_decode, is_printable, scan_text(enhanced), scan_js_deep, extract_urls_from_json")
print(f"  - Updated: scan_js_strings calls -> scan_js_deep")
