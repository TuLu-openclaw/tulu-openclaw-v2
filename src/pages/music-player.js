/**
 * 音乐播放器 — 多平台聚合搜索 + 免费播放 + 下载
 * 数据源：网易云 / QQ音乐 / 酷狗 / 酷我 / 咪咕
 */
import { t } from '../lib/i18n.js'
import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'

function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }

// ===== 平台 API =====
const PLATFORMS = {
  netease: { name: '网易云', icon: '🎵', color: '#e60026', search: searchNetease, play: playNetease },
  qq: { name: 'QQ音乐', icon: '🎶', color: '#31c27c', search: searchQQ, play: playQQ },
  kugou: { name: '酷狗', icon: '🎧', color: '#2ca2f6', search: searchKugou, play: playKugou },
  kuwo: { name: '酷我', icon: '🔊', color: '#ff6600', search: searchKuwo, play: playKuwo },
  migu: { name: '咪咕', icon: '🎤', color: '#ff2d51', search: searchMigu, play: playMigu },
}

// NetEase Cloud Music
async function searchNetease(q, limit = 20) {
  try {
    const r = await fetch(`https://music.163.com/api/search/get?s=${encodeURIComponent(q)}&type=1&limit=${limit}&offset=0`, {
      headers: { 'Referer': 'https://music.163.com', 'User-Agent': 'Mozilla/5.0' }
    })
    const d = await r.json()
    return (d.result?.songs || []).map(s => ({
      id: s.id, name: s.name, artist: (s.artists || []).map(a => a.name).join('/'),
      album: s.album?.name || '', duration: s.duration, platform: 'netease',
      cover: s.album?.picUrl ? s.album.picUrl + '?param=300y300' : '',
    }))
  } catch { return [] }
}

async function playNetease(id) {
  // Multiple API sources for free playback
  const urls = [
    `https://music.163.com/song/media/outer/url?id=${id}.mp3`,
    `https://api.injahow.cn/meting/?type=url&id=${id}&source=netease`,
    `https://api.paugram.com/netease/?id=${id}`,
  ]
  for (const url of urls) {
    try {
      const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000) })
      if (r.ok || r.status === 200 || r.status === 302) return url
    } catch {}
  }
  return urls[0] // fallback
}

// QQ Music
async function searchQQ(q, limit = 20) {
  try {
    const r = await fetch(`https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=${encodeURIComponent(q)}&format=json&p=1&n=${limit}`)
    const d = await r.json()
    return (d.data?.song?.list || []).map(s => ({
      id: s.songmid || s.songid, name: s.songname, artist: (s.singer || []).map(a => a.name).join('/'),
      album: s.albumname || '', duration: s.interval * 1000, platform: 'qq',
      cover: `https://y.gtimg.cn/music/photo_new/T002R300x300M000${s.albummid}.jpg`,
    }))
  } catch { return [] }
}

async function playQQ(mid) {
  return `https://api.injahow.cn/meting/?type=url&id=${mid}&source=tencent`
}

// Kugou
async function searchKugou(q, limit = 20) {
  try {
    const r = await fetch(`https://songsearch.kugou.com/song_search_v2?keyword=${encodeURIComponent(q)}&page=1&pagesize=${limit}`)
    const d = await r.json()
    return (d.data?.lists || []).map(s => ({
      id: s.FileHash, name: s.SongName, artist: s.SingerName,
      album: s.AlbumName || '', duration: s.Duration * 1000, platform: 'kugou',
      cover: '',
    }))
  } catch { return [] }
}

async function playKugou(hash) {
  return `https://api.injahow.cn/meting/?type=url&id=${hash}&source=kugou`
}

// Kuwo
async function searchKuwo(q, limit = 20) {
  try {
    const r = await fetch(`https://search.kuwo.cn/r.s?all=${encodeURIComponent(q)}&ft=music&rn=${limit}&rformat=json&encoding=utf8`)
    const text = await r.text()
    const d = JSON.parse(text)
    return (d.abslist || []).map(s => ({
      id: s.MUSICRID?.replace('MUSIC_', ''), name: s.SONGNAME, artist: s.ARTIST,
      album: s.ALBUM || '', duration: parseInt(s.DURATION) * 1000, platform: 'kuwo',
      cover: '',
    }))
  } catch { return [] }
}

async function playKuwo(rid) {
  return `https://api.injahow.cn/meting/?type=url&id=${rid}&source=kuwo`
}

// Migu
async function searchMigu(q, limit = 20) {
  try {
    const r = await fetch(`https://m.music.migu.cn/migu/remoting/scr_search_tag?keyword=${encodeURIComponent(q)}&type=2&rows=${limit}`)
    const d = await r.json()
    return (d.musics || []).map(s => ({
      id: s.copyrightId, name: s.songName, artist: s.singerName,
      album: s.albumName || '', duration: 0, platform: 'migu',
      cover: s.albumImgs?.[0]?.img || '',
    }))
  } catch { return [] }
}

async function playMigu(cid) {
  return `https://api.injahow.cn/meting/?type=url&id=${cid}&source=migu`
}

// ===== 歌词获取 =====
async function fetchLyrics(song) {
  if (song.platform === 'netease') {
    try {
      const r = await fetch(`https://music.163.com/api/song/lyric?id=${song.id}&lv=1`)
      const d = await r.json()
      return d.lrc?.lyric || ''
    } catch {}
  }
  if (song.platform === 'qq') {
    try {
      const r = await fetch(`https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${song.id}&format=json`)
      const d = await r.json()
      return d.lyric ? atob(d.lyric) : ''
    } catch {}
  }
  return ''
}

// ===== 全网聚合搜索 =====
async function searchAll(q) {
  const results = await Promise.allSettled(
    Object.entries(PLATFORMS).map(([key, p]) => p.search(q, 8))
  )
  const all = []
  results.forEach(r => {
    if (r.status === 'fulfilled') all.push(...r.value)
  })
  // Deduplicate by name+artist
  const seen = new Set()
  return all.filter(s => {
    const k = s.name + '|' + s.artist
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// ===== 页面 =====
export default function MusicPlayerPage() {
  const el = document.createElement('div')
  el.className = 'music-player-page'
  let query = ''
  let results = []
  let loading = false
  let currentSong = null
  let currentUrl = ''
  let playing = false
  let lyrics = ''
  let activePlatform = 'all'
  let audioEl = null

  function draw() {
    el.innerHTML = `
      <div class="mp-container">
        <div class="mp-header">
          <div class="mp-header-left">
            <span class="mp-icon">🎵</span>
            <div>
              <h1 class="mp-title">音乐播放器</h1>
              <div class="mp-subtitle">多平台聚合搜索 · 免费播放 · 高品质下载</div>
            </div>
          </div>
          <div class="mp-platform-tabs">
            <button class="mp-ptab ${activePlatform === 'all' ? 'active' : ''}" data-p="all">全部</button>
            ${Object.entries(PLATFORMS).map(([k, p]) => `
              <button class="mp-ptab ${activePlatform === k ? 'active' : ''}" data-p="${k}" style="--pc:${p.color}">
                ${p.icon} ${p.name}
              </button>
            `).join('')}
          </div>
        </div>

        <div class="mp-search-bar">
          <input type="text" class="mp-search-input" id="mp-search" placeholder="搜索歌曲、歌手、专辑..." value="${esc(query)}" autofocus>
          <button class="mp-search-btn" id="mp-search-btn">🔍 搜索</button>
        </div>

        <div class="mp-body">
          <div class="mp-results">
            ${loading ? '<div class="mp-loading"><div class="mp-spinner"></div>搜索中...</div>' : ''}
            ${!loading && results.length === 0 && query ? '<div class="mp-empty">未找到相关歌曲</div>' : ''}
            ${!loading && results.length === 0 && !query ? `
              <div class="mp-welcome">
                <div class="mp-welcome-icon">🎵</div>
                <div class="mp-welcome-title">搜索你想听的音乐</div>
                <div class="mp-welcome-desc">支持网易云、QQ音乐、酷狗、酷我、咪咕五大平台聚合搜索</div>
              </div>
            ` : ''}
            ${!loading ? results.map((s, i) => renderSong(s, i)).join('') : ''}
          </div>

          ${currentSong ? renderPlayer() : ''}
        </div>
      </div>
    `
    bindEvents()
  }

  function renderSong(song, idx) {
    const isActive = currentSong && currentSong.id === song.id && currentSong.platform === song.platform
    const p = PLATFORMS[song.platform]
    return `
      <div class="mp-song ${isActive ? 'is-active' : ''}" data-idx="${idx}">
        <div class="mp-song-cover">
          ${song.cover ? `<img src="${esc(song.cover)}" alt="" loading="lazy">` : `<div class="mp-song-cover-placeholder">${p?.icon || '🎵'}</div>`}
        </div>
        <div class="mp-song-info">
          <div class="mp-song-name">${esc(song.name)}</div>
          <div class="mp-song-artist">${esc(song.artist)}</div>
          <div class="mp-song-album">${esc(song.album)}</div>
        </div>
        <div class="mp-song-platform">
          <span class="mp-platform-badge" style="background:${p?.color || '#666'}">${p?.icon || '🎵'} ${p?.name || song.platform}</span>
        </div>
        <div class="mp-song-duration">${formatDuration(song.duration)}</div>
        <div class="mp-song-actions">
          <button class="mp-play-btn" data-idx="${idx}" title="播放">▶</button>
          <button class="mp-download-btn" data-idx="${idx}" title="下载">⬇</button>
        </div>
      </div>
    `
  }

  function renderPlayer() {
    return `
      <div class="mp-player" id="mp-player">
        <div class="mp-player-cover">
          ${currentSong.cover ? `<img src="${esc(currentSong.cover)}" alt="">` : '<div class="mp-player-cover-placeholder">🎵</div>'}
          ${playing ? '<div class="mp-vinyl-spin"></div>' : ''}
        </div>
        <div class="mp-player-info">
          <div class="mp-player-name">${esc(currentSong.name)}</div>
          <div class="mp-player-artist">${esc(currentSong.artist)} · ${esc(currentSong.album)}</div>
          <div class="mp-player-controls">
            <button class="mp-ctrl-btn" id="mp-prev" title="上一首">⏮</button>
            <button class="mp-ctrl-btn mp-ctrl-play" id="mp-toggle" title="${playing ? '暂停' : '播放'}">${playing ? '⏸' : '▶'}</button>
            <button class="mp-ctrl-btn" id="mp-next" title="下一首">⏭</button>
            <button class="mp-ctrl-btn" id="mp-download" title="下载">⬇</button>
          </div>
          <div class="mp-progress">
            <div class="mp-progress-bar"><div class="mp-progress-fill" id="mp-progress-fill"></div></div>
            <div class="mp-progress-time"><span id="mp-time-current">0:00</span> / <span id="mp-time-total">${formatDuration(currentSong.duration)}</span></div>
          </div>
        </div>
        ${lyrics ? `<div class="mp-lyrics" id="mp-lyrics">${parseLyrics(lyrics)}</div>` : ''}
      </div>
    `
  }

  function bindEvents() {
    el.querySelector('#mp-search')?.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch() })
    el.querySelector('#mp-search-btn')?.addEventListener('click', doSearch)
    el.querySelectorAll('.mp-ptab').forEach(btn => {
      btn.addEventListener('click', () => { activePlatform = btn.dataset.p; draw() })
    })
    el.querySelectorAll('.mp-play-btn').forEach(btn => {
      btn.addEventListener('click', () => playSong(parseInt(btn.dataset.idx)))
    })
    el.querySelectorAll('.mp-download-btn').forEach(btn => {
      btn.addEventListener('click', () => downloadSong(parseInt(btn.dataset.idx)))
    })
    el.querySelector('#mp-toggle')?.addEventListener('click', togglePlay)
    el.querySelector('#mp-download')?.addEventListener('click', () => {
      if (currentSong) downloadSong(results.indexOf(currentSong))
    })
  }

  async function doSearch() {
    const input = el.querySelector('#mp-search')
    query = input?.value?.trim() || ''
    if (!query) return
    loading = true
    draw()
    try {
      if (activePlatform === 'all') {
        results = await searchAll(query)
      } else {
        const p = PLATFORMS[activePlatform]
        results = p ? await p.search(query) : []
      }
    } catch (e) {
      results = []
      toast('搜索失败: ' + (e?.message || e), 'error')
    } finally {
      loading = false
      draw()
    }
  }

  async function playSong(idx) {
    const song = results[idx]
    if (!song) return
    currentSong = song
    const p = PLATFORMS[song.platform]
    try {
      currentUrl = await p.play(song.id)
      if (!audioEl) {
        audioEl = new Audio()
        audioEl.addEventListener('timeupdate', updateProgress)
        audioEl.addEventListener('ended', () => { playing = false; draw() })
        audioEl.addEventListener('error', () => toast('播放失败，尝试下一个源...', 'error'))
      }
      audioEl.src = currentUrl
      audioEl.play()
      playing = true
      lyrics = await fetchLyrics(song)
      draw()
      toast(`正在播放: ${song.name} - ${song.artist}`)
    } catch (e) {
      toast('播放失败: ' + (e?.message || e), 'error')
    }
  }

  async function downloadSong(idx) {
    const song = results[idx]
    if (!song) return
    const p = PLATFORMS[song.platform]
    try {
      const url = await p.play(song.id)
      const a = document.createElement('a')
      a.href = url
      a.download = `${song.artist} - ${song.name}.mp3`
      a.target = '_blank'
      document.body.appendChild(a)
      a.click()
      a.remove()
      toast(`开始下载: ${song.name}`)
    } catch (e) {
      toast('下载失败: ' + (e?.message || e), 'error')
    }
  }

  function togglePlay() {
    if (!audioEl) return
    if (playing) { audioEl.pause(); playing = false }
    else { audioEl.play(); playing = true }
    draw()
  }

  function updateProgress() {
    if (!audioEl) return
    const fill = el.querySelector('#mp-progress-fill')
    const cur = el.querySelector('#mp-time-current')
    if (fill) fill.style.width = (audioEl.currentTime / (audioEl.duration || 1)) * 100 + '%'
    if (cur) cur.textContent = formatTime(audioEl.currentTime)
  }

  function parseLyrics(lrc) {
    return lrc.split('\n').filter(Boolean).map(line => {
      const m = line.match(/\[(\d+):(\d+\.?\d*)\](.*)/)
      if (m) {
        const time = parseInt(m[1]) * 60 + parseFloat(m[2])
        return `<div class="mp-lyric-line" data-time="${time}">${esc(m[3])}</div>`
      }
      return `<div class="mp-lyric-line">${esc(line)}</div>`
    }).join('')
  }

  function formatDuration(ms) {
    if (!ms) return ''
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  function formatTime(s) {
    return `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`
  }

  draw()
  return el
}
