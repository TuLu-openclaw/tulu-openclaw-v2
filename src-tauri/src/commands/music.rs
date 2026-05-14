// Music Backend - Multi-platform music search, play URL fetching, and download
// Platforms: NetEase, QQ, Kugou, Kuwo, Migu
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ============================================================================
// Data Structures
// ============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MusicSong {
    pub id: String,
    pub name: String,
    pub artist: String,
    pub album: String,
    pub duration: u64,
    pub platform: String,
    pub cover: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MusicSearchResult {
    pub songs: Vec<MusicSong>,
    pub platform: String,
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MusicDownloadConfig {
    pub default_dir: Option<String>,
    pub auto_cover: bool,
    pub auto_lyrics: bool,
}

const CONFIG_FILE: &str = "music-download-config.json";

// ============================================================================
// Config Management
// ============================================================================

fn get_config_path() -> PathBuf {
    let config_dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("tulu-openclaw");
    std::fs::create_dir_all(&config_dir).ok();
    config_dir.join(CONFIG_FILE)
}

fn load_config() -> MusicDownloadConfig {
    let path = get_config_path();
    if let Ok(content) = std::fs::read_to_string(&path) {
        if let Ok(config) = serde_json::from_str(&content) {
            return config;
        }
    }
    MusicDownloadConfig {
        default_dir: None,
        auto_cover: true,
        auto_lyrics: true,
    }
}

fn save_config(config: &MusicDownloadConfig) -> Result<(), String> {
    let path = get_config_path();
    let content =
        serde_json::to_string_pretty(config).map_err(|e| format!("Serialize config error: {e}"))?;
    std::fs::write(&path, content).map_err(|e| format!("Write config error: {e}"))?;
    Ok(())
}

// ============================================================================
// Platform Search APIs
// ============================================================================

// NetEase Cloud Music
async fn search_netease(client: &reqwest::Client, query: &str, limit: u32) -> Result<Vec<MusicSong>, String> {
    let url = format!(
        "https://music.163.com/api/search/get?s={}&type=1&limit={}&offset=0",
        urlencoding::encode(query),
        limit
    );

    let resp = client
        .get(&url)
        .header("Referer", "https://music.163.com")
        .header("User-Agent", "Mozilla/5.0")
        .send()
        .await
        .map_err(|e| format!("NetEase network error: {e}"))?;

    let data: serde_json::Value = resp.json().await.map_err(|e| format!("NetEase parse error: {e}"))?;

    let songs = data
        .pointer("/result/songs")
        .and_then(|s| s.as_array())
        .map_or(vec![], |arr| arr.iter().collect::<Vec<_>>());

    let results: Vec<MusicSong> = songs
        .iter()
        .map(|s| {
            let artists = s
                .pointer("/artists")
                .and_then(|a| a.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|a| a.get("name").and_then(|n| n.as_str()))
                        .collect::<Vec<_>>()
                        .join("/")
                })
                .unwrap_or_default();

            let cover = s
                .pointer("/album/picUrl")
                .and_then(|v| v.as_str())
                .map(|u| format!("{}?param=300y300", u));

            MusicSong {
                id: s.get("id").and_then(|v| v.as_i64()).unwrap_or(0).to_string(),
                name: s.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                artist: artists,
                album: s
                    .pointer("/album/name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                duration: s.get("duration").and_then(|v| v.as_i64()).unwrap_or(0) as u64,
                platform: "netease".to_string(),
                cover,
                url: None,
            }
        })
        .collect();

    Ok(results)
}

// QQ Music
async fn search_qq(client: &reqwest::Client, query: &str, limit: u32) -> Result<Vec<MusicSong>, String> {
    let url = format!(
        "https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w={}&format=json&p=1&n={}",
        urlencoding::encode(query),
        limit
    );

    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0")
        .send()
        .await
        .map_err(|e| format!("QQ network error: {e}"))?;

    let data: serde_json::Value = resp.json().await.map_err(|e| format!("QQ parse error: {e}"))?;

    let list = data
        .pointer("/data/song/list")
        .and_then(|s| s.as_array())
        .map_or(vec![], |arr| arr.iter().collect::<Vec<_>>());

    let results: Vec<MusicSong> = list
        .iter()
        .map(|s| {
            let singers = s
                .pointer("/singer")
                .and_then(|a| a.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|a| a.get("name").and_then(|n| n.as_str()))
                        .collect::<Vec<_>>()
                        .join("/")
                })
                .unwrap_or_default();

            let songmid = s.get("songmid").and_then(|v| v.as_str()).unwrap_or("");
            let cover = if !songmid.is_empty() {
                Some(format!(
                    "https://y.gtimg.cn/music/photo_new/T002R300x300M000{}.jpg",
                    songmid
                ))
            } else {
                None
            };

            MusicSong {
                id: s.get("songmid").or(s.get("songid")).and_then(|v| v.as_str()).unwrap_or("").to_string(),
                name: s.get("songname").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                artist: singers,
                album: s.get("albumname").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                duration: (s.get("interval").and_then(|v| v.as_i64()).unwrap_or(0) * 1000) as u64,
                platform: "qq".to_string(),
                cover,
                url: None,
            }
        })
        .collect();

    Ok(results)
}

// Kugou Music
async fn search_kugou(client: &reqwest::Client, query: &str, limit: u32) -> Result<Vec<MusicSong>, String> {
    let url = format!(
        "https://songsearch.kugou.com/song_search_v2?keyword={}&page=1&pagesize={}",
        urlencoding::encode(query),
        limit
    );

    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0")
        .send()
        .await
        .map_err(|e| format!("Kugou network error: {e}"))?;

    let data: serde_json::Value = resp.json().await.map_err(|e| format!("Kugou parse error: {e}"))?;

    let lists = data
        .pointer("/data/lists")
        .and_then(|s| s.as_array())
        .map_or(vec![], |arr| arr.iter().collect::<Vec<_>>());

    let results: Vec<MusicSong> = lists
        .iter()
        .map(|s| {
            MusicSong {
                id: s.get("FileHash").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                name: s.get("SongName").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                artist: s.get("SingerName").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                album: s.get("AlbumName").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                duration: parse_duration(s.get("Duration").and_then(|v| v.as_str())),
                platform: "kugou".to_string(),
                cover: None,
                url: None,
            }
        })
        .collect();

    Ok(results)
}

// Kuwo Music
async fn search_kuwo(client: &reqwest::Client, query: &str, limit: u32) -> Result<Vec<MusicSong>, String> {
    let url = format!(
        "https://search.kuwo.cn/r.s?all={}&ft=music&rn={}&rformat=json&encoding=utf8",
        urlencoding::encode(query),
        limit
    );

    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0")
        .header("Referer", "https://www.kuwo.cn")
        .send()
        .await
        .map_err(|e| format!("Kuwo network error: {e}"))?;

    let text = resp.text().await.map_err(|e| format!("Kuwo parse error: {e}"))?;
    let data: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("Kuwo JSON error: {e}"))?;

    let abslist = data
        .pointer("/abslist")
        .and_then(|s| s.as_array())
        .map_or(vec![], |arr| arr.iter().collect::<Vec<_>>());

    let results: Vec<MusicSong> = abslist
        .iter()
        .map(|s| {
            let rid = s
                .get("MUSICRID")
                .and_then(|v| v.as_str())
                .map(|r| r.replace("MUSIC_", ""))
                .unwrap_or_default();

            MusicSong {
                id: rid,
                name: s.get("SONGNAME").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                artist: s.get("ARTIST").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                album: s.get("ALBUM").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                duration: parse_duration(s.get("DURATION").and_then(|v| v.as_str())),
                platform: "kuwo".to_string(),
                cover: None,
                url: None,
            }
        })
        .collect();

    Ok(results)
}

// Migu Music
async fn search_migu(client: &reqwest::Client, query: &str, limit: u32) -> Result<Vec<MusicSong>, String> {
    let url = format!(
        "https://m.music.migu.cn/migu/remoting/scr_search_tag?keyword={}&type=2&rows={}",
        urlencoding::encode(query),
        limit
    );

    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0")
        .header("Referer", "https://music.migu.cn")
        .send()
        .await
        .map_err(|e| format!("Migu network error: {e}"))?;

    let text = resp.text().await.map_err(|e| format!("Migu read error: {e}"))?;

    // Skip HTML responses (API changed)
    if text.trim().starts_with('<') {
        return Err("Migu search API has been discontinued".to_string());
    }

    let data: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Migu parse error: {e}"))?;

    let musics = data
        .get("musics")
        .and_then(|s| s.as_array())
        .map_or(vec![], |arr| arr.iter().collect::<Vec<_>>());

    let results: Vec<MusicSong> = musics
        .iter()
        .map(|s| {
            let cover = s
                .get("albumImgs")
                .and_then(|a| a.as_array())
                .and_then(|arr| arr.first())
                .and_then(|img| img.get("img"))
                .and_then(|v| v.as_str())
                .map(|u| format!("{}?param=300y300", u));

            MusicSong {
                id: s.get("copyrightId").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                name: s.get("songName").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                artist: s.get("singerName").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                album: s.get("albumName").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                duration: 0,
                platform: "migu".to_string(),
                cover,
                url: None,
            }
        })
        .collect();

    Ok(results)
}

fn parse_duration(s: Option<&str>) -> u64 {
    if let Some(d) = s {
        let parts: Vec<&str> = d.split(':').collect();
        if parts.len() == 2 {
            let min: u64 = parts[0].parse().unwrap_or(0);
            let sec: u64 = parts[1].parse().unwrap_or(0);
            return min * 60 * 1000 + sec * 1000;
        }
    }
    0
}

// ============================================================================
// Play URL Fetching
// ============================================================================

async fn fetch_meting_url(client: &reqwest::Client, id: &str, source: &str) -> Option<String> {
    let urls = [
        format!("https://api.injahow.cn/meting/?type=url&id={}&source={}", id, source),
        format!("https://meting.yanyanlong.com/api/meting?type=url&id={}&source={}", id, source),
    ];

    for url in &urls {
        let resp = match client.get(url).send().await {
            Ok(r) => r,
            Err(_) => continue,
        };
        if !resp.status().is_success() {
            continue;
        }

        if let Ok(body) = resp.bytes().await {
            if body.is_empty() {
                continue;
            }
            if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&body) {
                let obj = json.as_object();
                if let Some(final_url) = obj.and_then(|o| o.get("finalUrl")).and_then(|v| v.as_str()) {
                    if !final_url.is_empty() && !final_url.contains("api.injahow.cn") {
                        return Some(final_url.to_string());
                    }
                }
                if let Some(audio_url) = obj.and_then(|o| o.get("url")).and_then(|v| v.as_str()) {
                    if !audio_url.is_empty() && !audio_url.contains("api.injahow.cn") && !audio_url.contains("meting") {
                        return Some(audio_url.to_string());
                    }
                }
            }
        }
    }
    None
}

async fn get_netease_url(client: &reqwest::Client, id: &str) -> Option<String> {
    if let Some(url) = fetch_meting_url(client, id, "netease").await {
        return Some(url);
    }
    Some(format!("https://music.163.com/song/media/outer/url?id={}", id))
}

async fn get_qq_url(client: &reqwest::Client, mid: &str) -> Option<String> {
    fetch_meting_url(client, mid, "tencent").await
}

async fn get_kugou_url(client: &reqwest::Client, hash: &str) -> Option<String> {
    fetch_meting_url(client, hash, "kugou").await
}

async fn get_kuwo_url(client: &reqwest::Client, rid: &str) -> Option<String> {
    fetch_meting_url(client, rid, "kuwo").await
}

async fn get_migu_url(client: &reqwest::Client, cid: &str) -> Option<String> {
    fetch_meting_url(client, cid, "migu").await
}

// ============================================================================
// Tauri Commands
// ============================================================================

#[tauri::command]
pub async fn music_search_all(
    query: String,
    platforms: Option<Vec<String>>,
    limit: Option<u32>,
) -> Result<Vec<MusicSearchResult>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let query = query.trim().to_string();
    if query.is_empty() {
        return Err("Query cannot be empty".to_string());
    }

    let limit = limit.unwrap_or(20);
    let default_platforms = vec![
        "netease".to_string(),
        "qq".to_string(),
        "kugou".to_string(),
        "kuwo".to_string(),
        "migu".to_string(),
    ];
    let target_platforms = platforms.unwrap_or(default_platforms);

    let mut results: Vec<MusicSearchResult> = Vec::new();

    for platform in &target_platforms {
        let songs = match platform.as_str() {
            "netease" => match search_netease(&client, &query, limit).await {
                Ok(s) => s,
                Err(e) => {
                    results.push(MusicSearchResult {
                        songs: vec![],
                        platform: platform.clone(),
                        success: false,
                        error: Some(e),
                    });
                    continue;
                }
            },
            "qq" => match search_qq(&client, &query, limit).await {
                Ok(s) => s,
                Err(e) => {
                    results.push(MusicSearchResult {
                        songs: vec![],
                        platform: platform.clone(),
                        success: false,
                        error: Some(e),
                    });
                    continue;
                }
            },
            "kugou" => match search_kugou(&client, &query, limit).await {
                Ok(s) => s,
                Err(e) => {
                    results.push(MusicSearchResult {
                        songs: vec![],
                        platform: platform.clone(),
                        success: false,
                        error: Some(e),
                    });
                    continue;
                }
            },
            "kuwo" => match search_kuwo(&client, &query, limit).await {
                Ok(s) => s,
                Err(e) => {
                    results.push(MusicSearchResult {
                        songs: vec![],
                        platform: platform.clone(),
                        success: false,
                        error: Some(e),
                    });
                    continue;
                }
            },
            "migu" => match search_migu(&client, &query, limit).await {
                Ok(s) => s,
                Err(e) => {
                    results.push(MusicSearchResult {
                        songs: vec![],
                        platform: platform.clone(),
                        success: false,
                        error: Some(e),
                    });
                    continue;
                }
            },
            _ => {
                results.push(MusicSearchResult {
                    songs: vec![],
                    platform: platform.clone(),
                    success: false,
                    error: Some("Unknown platform".to_string()),
                });
                continue;
            }
        };

        results.push(MusicSearchResult {
            songs,
            platform: platform.clone(),
            success: true,
            error: None,
        });
    }

    Ok(results)
}

#[tauri::command]
pub async fn music_get_play_url(
    platform: String,
    id: String,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let url = match platform.as_str() {
        "netease" => get_netease_url(&client, &id).await,
        "qq" => get_qq_url(&client, &id).await,
        "kugou" => get_kugou_url(&client, &id).await,
        "kuwo" => get_kuwo_url(&client, &id).await,
        "migu" => get_migu_url(&client, &id).await,
        _ => None,
    };

    url.ok_or_else(|| "Failed to get play URL".to_string())
}

/// Proxy audio requests with proper headers to bypass CORS/restrictions.
/// Returns the audio data as base64 encoded string.
#[tauri::command]
pub async fn music_proxy_audio(url: String, platform: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let mut req = client.get(&url);

    match platform.as_str() {
        "netease" => {
            req = req
                .header("Referer", "https://music.163.com")
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
        }
        "qq" => {
            req = req
                .header("Referer", "https://y.qq.com")
                .header("User-Agent", "Mozilla/5.0");
        }
        "kugou" => {
            req = req
                .header("Referer", "https://www.kugou.com")
                .header("User-Agent", "Mozilla/5.0");
        }
        "kuwo" => {
            req = req
                .header("Referer", "https://www.kuwo.cn")
                .header("User-Agent", "Mozilla/5.0");
        }
        "migu" => {
            req = req
                .header("Referer", "https://music.migu.cn")
                .header("User-Agent", "Mozilla/5.0");
        }
        _ => {
            req = req.header("User-Agent", "Mozilla/5.0");
        }
    }

    let resp = req.send().await.map_err(|e| format!("Proxy request error: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Proxy returned status: {}", resp.status()));
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Read audio data error: {e}"))?;

    let encoded = base64_encode(&bytes);
    let mime = if url.contains(".flac") || url.contains("flac") {
        "audio/flac"
    } else {
        "audio/mpeg"
    };

    Ok(format!("data:{};base64,{}", mime, encoded))
}

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    let mut buffer: u32 = 0;
    let mut bits = 0;

    for &byte in data {
        buffer = (buffer << 8) | (byte as u32);
        bits += 8;

        while bits >= 6 {
            bits -= 6;
            result.push(CHARS[(buffer >> bits) as usize] as char);
        }
    }

    if bits > 0 {
        result.push(CHARS[(buffer << (6 - bits)) as usize] as char);
    }

    while result.len() % 4 != 0 {
        result.push('=');
    }

    result
}

#[tauri::command]
pub async fn music_download_song(
    platform: String,
    id: String,
    name: String,
    artist: String,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let config = load_config();
    let download_dir = if let Some(dir) = config.default_dir {
        PathBuf::from(dir)
    } else {
        dirs::audio_dir().unwrap_or_else(|| {
            let mut p = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
            p.push("Music");
            p
        })
    };

    let clean_name = name
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace() || *c == '-' || *c == '_')
        .collect::<String>()
        .trim()
        .to_string();
    let clean_artist = artist
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace() || *c == '-' || *c == '_')
        .collect::<String>()
        .trim()
        .to_string();

    let filename = format!("{} - {}.mp3", clean_artist, clean_name);
    let mut filepath = download_dir.join(&filename);

    let mut counter = 1;
    while filepath.exists() {
        let new_filename = format!("{} - {} ({}).mp3", clean_artist, clean_name, counter);
        filepath = download_dir.join(&new_filename);
        counter += 1;
    }

    let play_url = match platform.as_str() {
        "netease" => get_netease_url(&client, &id).await,
        "qq" => get_qq_url(&client, &id).await,
        "kugou" => get_kugou_url(&client, &id).await,
        "kuwo" => get_kuwo_url(&client, &id).await,
        "migu" => get_migu_url(&client, &id).await,
        _ => None,
    }
    .ok_or_else(|| "Failed to get play URL for download".to_string())?;

    let response = client
        .get(&play_url)
        .send()
        .await
        .map_err(|e| format!("Download request error: {e}"))?;

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Download read error: {e}"))?;

    if let Some(parent) = filepath.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    std::fs::write(&filepath, &bytes).map_err(|e| format!("Save file error: {e}"))?;

    Ok(filepath.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn music_set_download_dir(path: String) -> Result<(), String> {
    let mut config = load_config();
    config.default_dir = Some(path);
    save_config(&config)
}

#[tauri::command]
pub async fn music_get_download_dir() -> Result<Option<String>, String> {
    let config = load_config();
    Ok(config.default_dir)
}

#[tauri::command]
pub async fn music_get_lyrics(
    platform: String,
    id: String,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    match platform.as_str() {
        "netease" => {
            let url = format!("https://music.163.com/api/song/lyric?id={}&lv=1", id);
            let resp = client
                .get(&url)
                .header("Referer", "https://music.163.com")
                .header("User-Agent", "Mozilla/5.0")
                .send()
                .await
                .map_err(|e| format!("Network error: {e}"))?;

            let data: serde_json::Value = resp.json().await.map_err(|e| format!("Parse error: {e}"))?;

            Ok(data
                .pointer("/lrc/lyric")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string())
        }
        "qq" => {
            let url = format!(
                "https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid={}&format=json",
                id
            );
            let resp = client
                .get(&url)
                .header("User-Agent", "Mozilla/5.0")
                .send()
                .await
                .map_err(|e| format!("Network error: {e}"))?;

            let data: serde_json::Value = resp.json().await.map_err(|e| format!("Parse error: {e}"))?;

            Ok(data
                .get("lyric")
                .and_then(|v| v.as_str())
                .map(|l| {
                    if l.starts_with("ey") {
                        if let Ok(decoded) = base64_decode(l) {
                            return String::from_utf8(decoded).unwrap_or_default();
                        }
                    }
                    l.to_string()
                })
                .unwrap_or_default())
        }
        _ => Ok("".to_string()),
    }
}

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    let input = input.as_bytes();
    let mut output = Vec::new();

    let mut buffer: u32 = 0;
    let mut bits = 0;

    for &byte in input {
        if byte == b'=' {
            break;
        }
        let mut value = byte as usize;
        for (i, &c) in CHARS.iter().enumerate() {
            if c == byte {
                value = i;
                break;
            }
        }

        buffer = (buffer << 6) | (value as u32);
        bits += 6;

        if bits >= 8 {
            bits -= 8;
            output.push((buffer >> bits) as u8);
            buffer &= (1 << bits) - 1;
        }
    }

    Ok(output)
}
