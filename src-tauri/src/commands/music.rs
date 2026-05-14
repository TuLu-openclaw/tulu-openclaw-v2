use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// 歌曲搜索结果
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Song {
    pub id: String,
    pub name: String,
    pub artist: String,
    pub album: String,
    #[serde(default)]
    pub duration: u64,
    #[serde(default)]
    pub cover: String,
}

/// 平台搜索结果
#[derive(Debug, Serialize, Deserialize)]
pub struct PlatformSearchResult {
    pub platform: String,
    pub success: bool,
    #[serde(default)]
    pub songs: Vec<Song>,
    #[serde(default)]
    pub error: String,
}

/// 搜索结果聚合
#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResults {
    #[serde(default)]
    pub results: Vec<PlatformSearchResult>,
}

/// 下载目录状态
static DOWNLOAD_DIR: std::sync::RwLock<Option<PathBuf>> = std::sync::RwLock::new(None);

fn get_download_dir() -> Option<PathBuf> {
    DOWNLOAD_DIR.read().ok()?.clone()
}

fn set_download_dir_impl(path: Option<PathBuf>) {
    if let Ok(mut guard) = DOWNLOAD_DIR.write() {
        *guard = path;
    }
}

// ========================
// 搜索 API
// ========================

/// 多平台聚合搜索
#[tauri::command]
pub async fn music_search_all(
    query: String,
    platforms: Option<Vec<String>>,
    limit: Option<u32>,
) -> Result<Vec<PlatformSearchResult>, String> {
    let limit = limit.unwrap_or(20) as usize;
    let platforms = platforms.unwrap_or_else(|| {
        vec![
            "netease".into(),
            "qq".into(),
            "kugou".into(),
            "kuwo".into(),
            "migu".into(),
        ]
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let futures: Vec<_> = platforms.into_iter().map(|platform| async move {
        match platform.as_str() {
            "netease" => search_netease(&client, &query, limit).await,
            "qq" => search_qq(&client, &query, limit).await,
            "kugou" => search_kugou(&client, &query, limit).await,
            "kuwo" => search_kuwo(&client, &query, limit).await,
            "migu" => search_migu(&client, &query, limit).await,
            _ => PlatformSearchResult {
                platform,
                success: false,
                songs: vec![],
                error: "Unknown platform".into(),
            },
        }
    }).collect();

    use futures_util::future::join_all;
    let results = join_all(futures).await;
    Ok(results)
}

/// 网易云音乐搜索
async fn search_netease(client: &reqwest::Client, query: &str, limit: usize) -> PlatformSearchResult {
    let url = format!(
        "https://music.163.com/api/search/get?s={}&type=1&limit={}",
        urlencoding::encode(query),
        limit
    );

    match client
        .get(&url)
        .header("Referer", "https://music.163.com/")
        .send()
        .await
    {
        Ok(resp) => {
            if let Ok(data) = resp.json::<serde_json::Value>().await {
                let songs: Vec<Song> = data
                    .get("result")
                    .and_then(|r| r.get("songs"))
                    .and_then(|songs| songs.as_array())
                    .map(|list| {
                        list.iter()
                            .filter_map(|s| {
                                let id = s.get("id")?.to_string();
                                let name = s.get("name")?.as_str()?.to_string();
                                let artist = s
                                    .get("artists")
                                    .and_then(|a| a.as_array())
                                    .and_then(|artists| artists.first())
                                    .and_then(|a| a.get("name"))
                                    .and_then(|n| n.as_str())
                                    .unwrap_or("未知")
                                    .to_string();
                                let album = s
                                    .get("album")
                                    .and_then(|a| a.get("name"))
                                    .and_then(|n| n.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                let duration = s.get("duration").and_then(|d| d.as_u64()).unwrap_or(0);
                                let cover = s
                                    .get("album")
                                    .and_then(|a| a.get("picUrl"))
                                    .and_then(|p| p.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                Some(Song {
                                    id,
                                    name,
                                    artist,
                                    album,
                                    duration,
                                    cover,
                                })
                            })
                            .collect()
                    })
                    .unwrap_or_default();

                return PlatformSearchResult {
                    platform: "netease".into(),
                    success: true,
                    songs,
                    error: String::new(),
                };
            }
            PlatformSearchResult {
                platform: "netease".into(),
                success: false,
                songs: vec![],
                error: "Parse error".into(),
            }
        }
        Err(e) => PlatformSearchResult {
            platform: "netease".into(),
            success: false,
            songs: vec![],
            error: e.to_string(),
        },
    }
}

/// QQ音乐搜索
async fn search_qq(client: &reqwest::Client, query: &str, limit: usize) -> PlatformSearchResult {
    let url = format!(
        "https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w={}&format=json&p=1&n={}",
        urlencoding::encode(query),
        limit
    );

    match client
        .get(&url)
        .header("Referer", "https://y.qq.com/")
        .send()
        .await
    {
        Ok(resp) => {
            if let Ok(data) = resp.json::<serde_json::Value>().await {
                let songs: Vec<Song> = data
                    .get("data")
                    .and_then(|d| d.get("song"))
                    .and_then(|s| s.get("list"))
                    .and_then(|l| l.as_array())
                    .map(|list| {
                        list.iter()
                            .filter_map(|s| {
                                let id = s.get("songid")?.to_string();
                                let name = s.get("songname")?.as_str()?.to_string();
                                let singer = s
                                    .get("singer")
                                    .and_then(|s| s.as_array())
                                    .and_then(|s| s.first())
                                    .and_then(|s| s.get("name"))
                                    .and_then(|n| n.as_str())
                                    .unwrap_or("未知")
                                    .to_string();
                                let album = s
                                    .get("albumname")
                                    .and_then(|a| a.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                let duration = s
                                    .get("interval")
                                    .and_then(|d| d.as_u64())
                                    .map(|d| d * 1000)
                                    .unwrap_or(0);
                                let cover = s
                                    .get("albumpic_small")
                                    .and_then(|p| p.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                Some(Song {
                                    id,
                                    name,
                                    artist: singer,
                                    album,
                                    duration,
                                    cover,
                                })
                            })
                            .collect()
                    })
                    .unwrap_or_default();

                return PlatformSearchResult {
                    platform: "qq".into(),
                    success: true,
                    songs,
                    error: String::new(),
                };
            }
            PlatformSearchResult {
                platform: "qq".into(),
                success: false,
                songs: vec![],
                error: "Parse error".into(),
            }
        }
        Err(e) => PlatformSearchResult {
            platform: "qq".into(),
            success: false,
            songs: vec![],
            error: e.to_string(),
        },
    }
}

/// 酷狗搜索
async fn search_kugou(client: &reqwest::Client, query: &str, limit: usize) -> PlatformSearchResult {
    let url = format!(
        "https://songsearch.kugou.com/song_search_v2?keyword={}&page=1&pagesize={}",
        urlencoding::encode(query),
        limit
    );

    match client.get(&url).send().await {
        Ok(resp) => {
            if let Ok(data) = resp.json::<serde_json::Value>().await {
                let songs: Vec<Song> = data
                    .get("data")
                    .and_then(|d| d.get("lists"))
                    .and_then(|l| l.as_array())
                    .map(|list| {
                        list.iter()
                            .filter_map(|s| {
                                let id = s.get("FileHash")?.as_str()?.to_string();
                                let name = s.get("SongName")?.as_str()?.to_string();
                                let artist = s
                                    .get(" singer_str")
                                    .and_then(|a| a.as_str())
                                    .unwrap_or("未知")
                                    .to_string();
                                let album = s
                                    .get("AlbumName")
                                    .and_then(|a| a.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                let duration = s
                                    .get("Duration")
                                    .and_then(|d| d.as_str())
                                    .and_then(|s| s.parse::<f64>().ok())
                                    .map(|d| (d * 1000.0) as u64)
                                    .unwrap_or(0);
                                let cover = s.get("Img").and_then(|p| p.as_str()).unwrap_or("").to_string();
                                Some(Song {
                                    id,
                                    name,
                                    artist,
                                    album,
                                    duration,
                                    cover,
                                })
                            })
                            .collect()
                    })
                    .unwrap_or_default();

                return PlatformSearchResult {
                    platform: "kugou".into(),
                    success: true,
                    songs,
                    error: String::new(),
                };
            }
            PlatformSearchResult {
                platform: "kugou".into(),
                success: false,
                songs: vec![],
                error: "Parse error".into(),
            }
        }
        Err(e) => PlatformSearchResult {
            platform: "kugou".into(),
            success: false,
            songs: vec![],
            error: e.to_string(),
        },
    }
}

/// 酷我搜索
async fn search_kuwo(client: &reqwest::Client, query: &str, limit: usize) -> PlatformSearchResult {
    let url = format!(
        "https://search.kuwo.cn/r.s?all={}&ft=music&rn={}&rformat=json&encoding=utf8",
        urlencoding::encode(query),
        limit
    );

    match client.get(&url).send().await {
        Ok(resp) => {
            if let Ok(text) = resp.text().await {
                if let Ok(data) = serde_json::from_str::<serde_json::Value>(&text) {
                    let songs: Vec<Song> = data
                        .get("abslist")
                        .and_then(|l| l.as_array())
                        .map(|list| {
                            list.iter()
                                .filter_map(|s| {
                                    let id = s.get("musicrid")?.as_str()?.to_string();
                                    let name = s.get("songname")?.as_str()?.to_string();
                                    let artist = s
                                        .get("artist")
                                        .and_then(|a| a.as_str())
                                        .unwrap_or("未知")
                                        .to_string();
                                    let album = s.get("album").and_then(|a| a.as_str()).unwrap_or("").to_string();
                                    let duration = s
                                        .get("duration")
                                        .and_then(|d| d.as_str())
                                        .and_then(|s| s.parse::<f64>().ok())
                                        .map(|d| d as u64)
                                        .unwrap_or(0);
                                    let cover = s.get("pic")?.as_str()?.to_string();
                                    Some(Song {
                                        id,
                                        name,
                                        artist,
                                        album,
                                        duration,
                                        cover,
                                    })
                                })
                                .collect()
                        })
                        .unwrap_or_default();

                    return PlatformSearchResult {
                        platform: "kuwo".into(),
                        success: true,
                        songs,
                        error: String::new(),
                    };
                }
            }
            PlatformSearchResult {
                platform: "kuwo".into(),
                success: false,
                songs: vec![],
                error: "Parse error".into(),
            }
        }
        Err(e) => PlatformSearchResult {
            platform: "kuwo".into(),
            success: false,
            songs: vec![],
            error: e.to_string(),
        },
    }
}

/// 咪咕搜索
async fn search_migu(client: &reqwest::Client, query: &str, limit: usize) -> PlatformSearchResult {
    let url = format!(
        "https://msearch.gl.ciwww.com/search?keyword={}&pageSize={}",
        urlencoding::encode(query),
        limit
    );

    match client.get(&url).send().await {
        Ok(resp) => {
            if let Ok(data) = resp.json::<serde_json::Value>().await {
                let songs: Vec<Song> = data
                    .get("data")
                    .and_then(|d| d.get("songList"))
                    .and_then(|l| l.as_array())
                    .map(|list| {
                        list.iter()
                            .filter_map(|s| {
                                let id = s.get("copyrightId")?.as_str()?.to_string();
                                let name = s.get("songName")?.as_str()?.to_string();
                                let artist = s
                                    .get("singerName")
                                    .and_then(|n| n.as_str())
                                    .unwrap_or("未知")
                                    .to_string();
                                let album = s
                                    .get("albumName")
                                    .and_then(|n| n.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                let duration = s
                                    .get("interval")
                                    .and_then(|d| d.as_str())
                                    .and_then(|s| s.parse::<f64>().ok())
                                    .map(|d| d as u64)
                                    .unwrap_or(0);
                                let cover = s
                                    .get("smallPic")
                                    .and_then(|p| p.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                Some(Song {
                                    id,
                                    name,
                                    artist,
                                    album,
                                    duration,
                                    cover,
                                })
                            })
                            .collect()
                    })
                    .unwrap_or_default();

                return PlatformSearchResult {
                    platform: "migu".into(),
                    success: true,
                    songs,
                    error: String::new(),
                };
            }
            PlatformSearchResult {
                platform: "migu".into(),
                success: false,
                songs: vec![],
                error: "Parse error".into(),
            }
        }
        Err(e) => PlatformSearchResult {
            platform: "migu".into(),
            success: false,
            songs: vec![],
            error: e.to_string(),
        },
    }
}

// ========================
// 播放 URL 获取（多级 fallback）
// ========================

#[tauri::command]
pub async fn music_get_play_url(platform: String, id: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    match platform.as_str() {
        "netease" => get_netease_url(&client, &id).await,
        "qq" => get_qq_url(&client, &id).await,
        "kugou" => get_kugou_url(&client, &id).await,
        "kuwo" => get_kuwo_url(&client, &id).await,
        "migu" => get_migu_url(&client, &id).await,
        _ => Err("Unknown platform".into()),
    }
}

/// 网易云：多级 fallback 获取播放 URL
async fn get_netease_url(client: &reqwest::Client, id: &str) -> Result<String, String> {
    // 方法1: 尝试 meting API (api.injahow.cn)
    if let Ok(url) = fetch_meting_url(client, id, "netease").await {
        if is_valid_url(&url) {
            return Ok(url);
        }
    }

    // 方法2: 尝试备用 meting API
    if let Ok(url) = fetch_meting_url_backup(client, id, "netease").await {
        if is_valid_url(&url) {
            return Ok(url);
        }
    }

    // 方法3: 网易云直链（需要代理 header）
    let direct_url = format!("https://music.163.com/song/media/outer/url?id={}", id);

    // 返回直链，让前端通过 music_proxy_audio 代理
    Ok(direct_url)
}

/// 通用 meting API
async fn fetch_meting_url(client: &reqwest::Client, id: &str, platform: &str) -> Result<String, String> {
    let url = format!(
        "https://api.injahow.cn/meting/?id={}&type={}&source={}",
        id, "song", platform
    );

    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let text = resp.text().await.map_err(|e| e.to_string())?;

    // 解析 JSON
    if let Ok(data) = serde_json::from_str::<serde_json::Value>(&text) {
        if let Some(url) = data.get("url").and_then(|u| u.as_str()) {
            if !url.is_empty() && url != "null" {
                return Ok(url.to_string());
            }
        }
    }

    Err("Meting API returned empty".into())
}

/// 备用 meting API
async fn fetch_meting_url_backup(
    client: &reqwest::Client,
    id: &str,
    platform: &str,
) -> Result<String, String> {
    let url = format!(
        "https://meting.yanyanlong.com/api?Id={}&type=song&r=mp3",
        id
    );

    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let text = resp.text().await.map_err(|e| e.to_string())?;

    if let Ok(data) = serde_json::from_str::<serde_json::Value>(&text) {
        if let Some(url) = data.get("url").and_then(|u| u.as_str()) {
            if !url.is_empty() && url != "null" {
                return Ok(url.to_string());
            }
        }
    }

    Err("Backup meting API failed".into())
}

/// QQ 音乐 URL
async fn get_qq_url(client: &reqwest::Client, id: &str) -> Result<String, String> {
    // 方法1: meting
    if let Ok(url) = fetch_meting_url(client, id, "qq").await {
        if is_valid_url(&url) {
            return Ok(url);
        }
    }

    // 方法2: 备用
    if let Ok(url) = fetch_meting_url_backup(client, id, "qq").await {
        if is_valid_url(&url) {
            return Ok(url);
        }
    }

    Err("QQ: No playable URL found".into())
}

/// 酷狗 URL
async fn get_kugou_url(client: &reqwest::Client, id: &str) -> Result<String, String> {
    // 酷狗的 hash 搜索
    let search_url = format!("https://www.kugou.com/yy/index.php?r=play/getdata&hash={}", id);

    match client
        .get(&search_url)
        .header("Referer", "https://www.kugou.com/")
        .send()
        .await
    {
        Ok(resp) => {
            if let Ok(data) = resp.json::<serde_json::Value>().await {
                if let Some(url) = data
                    .get("data")
                    .and_then(|d| d.get("play_url"))
                    .and_then(|u| u.as_str())
                {
                    if !url.is_empty() {
                        return Ok(url.to_string());
                    }
                }
            }
        }
        Err(_) => {}
    }

    // Fallback: meting
    if let Ok(url) = fetch_meting_url(client, id, "kugou").await {
        if is_valid_url(&url) {
            return Ok(url);
        }
    }

    Err("Kugou: No playable URL found".into())
}

/// 酷我 URL
async fn get_kuwo_url(client: &reqwest::Client, id: &str) -> Result<String, String> {
    // 酷我cid格式转换
    let cid = id.replace("MUSIC_", "");

    let url = format!(
        "https://player.kuwo.cn/webmusic/st/getNewMuiseByRid?rid={}&type=convert_url&format=mp3",
        cid
    );

    match client.get(&url).send().await {
        Ok(resp) => {
            if let Ok(text) = resp.text().await {
                // 解析 <url>...</url> 格式
                if let Some(start) = text.find("<url>") {
                    if let Some(end) = text.find("</url>") {
                        let url = &text[start + 5..end];
                        if !url.is_empty() {
                            return Ok(url.to_string());
                        }
                    }
                }
            }
        }
        Err(_) => {}
    }

    // Fallback: meting
    if let Ok(url) = fetch_meting_url(client, id, "kuwo").await {
        if is_valid_url(&url) {
            return Ok(url);
        }
    }

    Err("Kuwo: No playable URL found".into())
}

/// 咪咕 URL
async fn get_migu_url(client: &reqwest::Client, id: &str) -> Result<String, String> {
    let url = format!(
        "https://app.c.neter.me:3309/v1/song/getSongUrlByCopyrightId?copyrightId={}&type=mp3",
        id
    );

    match client.get(&url).send().await {
        Ok(resp) => {
            if let Ok(data) = resp.json::<serde_json::Value>().await {
                if let Some(data_obj) = data.get("data").and_then(|d| d.as_object()) {
                    for (_, v) in data_obj {
                        if let Some(url) = v.get("url").and_then(|u| u.as_str()) {
                            if !url.is_empty() {
                                return Ok(url.to_string());
                            }
                        }
                    }
                }
            }
        }
        Err(_) => {}
    }

    // Fallback: meting
    if let Ok(url) = fetch_meting_url(client, id, "migu").await {
        if is_valid_url(&url) {
            return Ok(url);
        }
    }

    Err("Migu: No playable URL found".into())
}

/// 判断 URL 是否有效
fn is_valid_url(url: &str) -> bool {
    if url.is_empty() || url == "null" || url == "undefined" {
        return false;
    }
    if url.starts_with("https://api.injahow.cn") && url.len() < 100 {
        return false;
    }
    url.starts_with("http")
}

// ========================
// 音频代理（解决 CORS）
// ========================

#[tauri::command]
pub async fn music_proxy_audio(url: String, platform: String) -> Result<String, String> {
    if !is_valid_url(&url) {
        return Err("Invalid URL".into());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    // 根据平台设置 Referer
    let referer = match platform.as_str() {
        "netease" => "https://music.163.com/",
        "qq" => "https://y.qq.com/",
        "kugou" => "https://www.kugou.com/",
        "kuwo" => "https://www.kuwo.cn/",
        "migu" => "https://www.migu.cn/",
        _ => "",
    };

    let mut req = client.get(&url);
    if !referer.is_empty() {
        req = req.header("Referer", referer);
    }
    req = req.header(
        "User-Agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    );

    match req.send().await {
        Ok(resp) => {
            let status = resp.status();
            if status.is_success() {
                let ct = resp
                    .headers()
                    .get("content-type")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("audio/mpeg")
                    .to_string();
                match resp.bytes().await {
                    Ok(bytes) => {
                        if ct.contains("audio") || bytes.len() > 1024 {
                            let b64 = base64_encode(&bytes);
                            return Ok(format!("data:{};base64,{}", ct, b64));
                        }
                    }
                    Err(_) => {}
                }
            }
            Err(format!("Failed to fetch audio: {}", status))
        }
        Err(e) => Err(e.to_string()),
    }
}

fn base64_encode(data: &[u8]) -> String {
    const ALPHABET: &[u8] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    for chunk in data.chunks(3) {
        let b = match chunk.len() {
            1 => [chunk[0], 0, 0],
            2 => [chunk[0], chunk[1], 0],
            _ => [chunk[0], chunk[1], chunk[2]],
        };
        result.push(ALPHABET[(b[0] >> 2) as usize] as char);
        result.push(ALPHABET[((b[0] & 0x03) << 4 | b[1] >> 4) as usize] as char);
        if chunk.len() > 1 {
            result.push(ALPHABET[((b[1] & 0x0f) << 2 | b[2] >> 6) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(ALPHABET[(b[2] & 0x3f) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

// ========================
// 歌词获取
// ========================

#[tauri::command]
pub async fn music_get_lyrics(platform: String, id: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    match platform.as_str() {
        "netease" => get_netease_lyrics(&client, &id).await,
        "qq" => get_qq_lyrics(&client, &id).await,
        "kugou" => get_kugou_lyrics(&client, &id).await,
        "kuwo" => get_kuwo_lyrics(&client, &id).await,
        "migu" => get_migu_lyrics(&client, &id).await,
        _ => Err("Unknown platform".into()),
    }
}

async fn get_netease_lyrics(client: &reqwest::Client, id: &str) -> Result<String, String> {
    let url = format!("https://music.163.com/api/song/lyric?id={}&lv=1", id);

    match client
        .get(&url)
        .header("Referer", "https://music.163.com/")
        .send()
        .await
    {
        Ok(resp) => {
            if let Ok(data) = resp.json::<serde_json::Value>().await {
                // 优先尝试翻译歌词
                let lrc = data
                    .get("tlyric")
                    .and_then(|t| t.get("lyric"))
                    .and_then(|l| l.as_str())
                    .or_else(|| {
                        data.get("lrc")
                            .and_then(|l| l.get("lyric"))
                            .and_then(|l| l.as_str())
                    });

                if let Some(lyrics) = lrc {
                    if !lyrics.is_empty() {
                        return Ok(lyrics.to_string());
                    }
                }
            }
            Err("No lyrics found".into())
        }
        Err(e) => Err(e.to_string()),
    }
}

async fn get_qq_lyrics(client: &reqwest::Client, id: &str) -> Result<String, String> {
    let url = format!(
        "https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid={}&format=json",
        id
    );

    match client
        .get(&url)
        .header("Referer", "https://y.qq.com/")
        .header("User-Agent", "Mozilla/5.0")
        .send()
        .await
    {
        Ok(resp) => {
            if let Ok(text) = resp.text().await {
                // QQ 返回的是 JSONP 格式
                if let Some(start) = text.find("({") {
                    if let Some(end) = text.rfind("})") {
                        let json_str = &text[start + 1..end + 1];
                        if let Ok(data) = serde_json::from_str::<serde_json::Value>(json_str) {
                            if let Some(lyrics) = data.get("lyric").and_then(|l| l.as_str()) {
                                // QQ 的歌词是 Base64 编码的
                                use base64::Engine;
                                if let Ok(decoded) =
                                    base64::engine::general_purpose::STANDARD.decode(lyrics)
                                {
                                    if let Ok(text) = String::from_utf8(decoded) {
                                        return Ok(text);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Err("No lyrics found".into())
        }
        Err(e) => Err(e.to_string()),
    }
}

async fn get_kugou_lyrics(client: &reqwest::Client, id: &str) -> Result<String, String> {
    let url = format!("https://www.kugou.com/yy/index.php?r=play/getdata&hash={}", id);

    match client
        .get(&url)
        .header("Referer", "https://www.kugou.com/")
        .send()
        .await
    {
        Ok(resp) => {
            if let Ok(data) = resp.json::<serde_json::Value>().await {
                if let Some(lyrics) = data
                    .get("data")
                    .and_then(|d| d.get("lyrics"))
                    .and_then(|l| l.as_str())
                {
                    return Ok(lyrics.to_string());
                }
            }
            Err("No lyrics found".into())
        }
        Err(e) => Err(e.to_string()),
    }
}

async fn get_kuwo_lyrics(client: &reqwest::Client, id: &str) -> Result<String, String> {
    let cid = id.replace("MUSIC_", "");
    let url = format!(
        "https://player.kuwo.cn/webmusic/st/getLyricByRid?rid={}&type=json",
        cid
    );

    match client.get(&url).send().await {
        Ok(resp) => {
            if let Ok(data) = resp.json::<serde_json::Value>().await {
                if let Some(lyrics) = data.get("lyc").and_then(|l| l.as_str()) {
                    return Ok(lyrics.to_string());
                }
            }
            Err("No lyrics found".into())
        }
        Err(e) => Err(e.to_string()),
    }
}

async fn get_migu_lyrics(client: &reqwest::Client, id: &str) -> Result<String, String> {
    let url = format!(
        "https://app.c.neter.me:3309/v1/song/getLrcByCopyrightId?copyrightId={}",
        id
    );

    match client.get(&url).send().await {
        Ok(resp) => {
            if let Ok(data) = resp.json::<serde_json::Value>().await {
                if let Some(lyrics) = data.get("data").and_then(|d| d.as_str()) {
                    if !lyrics.is_empty() {
                        return Ok(lyrics.to_string());
                    }
                }
            }
            Err("No lyrics found".into())
        }
        Err(e) => Err(e.to_string()),
    }
}

// ========================
// 下载
// ========================

#[tauri::command]
pub async fn music_download_song(
    platform: String,
    id: String,
    name: String,
    artist: String,
) -> Result<String, String> {
    let download_dir = get_download_dir().ok_or("Download directory not set")?;

    // 获取播放 URL
    let play_url = music_get_play_url(platform.clone(), id.clone()).await?;

    // 获取歌词
    let lyrics = music_get_lyrics(platform.clone(), id.clone())
        .await
        .unwrap_or_default();

    // 构建文件名
    let safe_name = sanitize_filename(&name);
    let safe_artist = sanitize_filename(&artist);
    let base_name = format!("{} - {}", safe_artist, safe_name);

    // 下载音频
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let referer = match platform.as_str() {
        "netease" => "https://music.163.com/",
        "qq" => "https://y.qq.com/",
        "kugou" => "https://www.kugou.com/",
        "kuwo" => "https://www.kuwo.cn/",
        "migu" => "https://www.migu.cn/",
        _ => "",
    };

    let mut req = client.get(&play_url);
    if !referer.is_empty() {
        req = req.header("Referer", referer);
    }

    let audio_bytes = req
        .send()
        .await
        .map_err(|e| format!("Failed to download audio: {}", e))?
        .bytes()
        .await
        .map_err(|e| format!("Failed to read audio data: {}", e))?;

    // 保存音频
    let audio_path = download_dir.join(format!("{}.mp3", base_name));
    tokio::fs::write(&audio_path, &audio_bytes)
        .await
        .map_err(|e| format!("Failed to save audio: {}", e))?;

    // 保存歌词
    if !lyrics.is_empty() {
        let lrc_path = download_dir.join(format!("{}.lrc", base_name));
        let _ = tokio::fs::write(&lrc_path, lyrics).await;
    }

    Ok(audio_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn music_set_download_dir(path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !path.is_dir() {
        tokio::fs::create_dir_all(&path)
            .await
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    set_download_dir_impl(Some(path));
    Ok(())
}

#[tauri::command]
pub async fn music_get_download_dir() -> Result<Option<String>, String> {
    Ok(get_download_dir().map(|p| p.to_string_lossy().to_string()))
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' || c == '(' || c == ')' {
                c
            } else {
                '_'
            }
        })
        .collect()
}
