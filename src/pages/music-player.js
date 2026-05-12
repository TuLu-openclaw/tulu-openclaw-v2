/**
 * 音乐播放器 — 多平台聚合搜索 + 免费播放 + 下载
 * 数据源：网易云 / QQ音乐 / 酷狗 / 酷我 / 咪咕
 * 模块化架构：AudioEngine / Player / Search / UI
 */
import { t } from '../lib/i18n.js'
import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'

function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }

// ===== 平台定义 =====
const PLATFORMS = {
  netease: { nameKey: 'platformNetease', icon: '🎵', color: '#e60026', search: searchNetease, play: playNetease },
  qq:       { nameKey: 'platformQQ',      icon: '🎶', color: '#31c27c', search: searchQQ,      play: playQQ      },
  kugou:   { nameKey: 'platformKugou',  icon: '🎧', color: '#2ca2f6', search: searchKugou,  play: playKugou   },
  kuwo:    { nameKey: 'platformKuwo',   icon: '🔊', color: '#ff6600', search: searchKuwo,   play: playKuwo    },
  migu:    { nameKey: 'platformMigu',   icon: '🎤', color: '#ff2d51', search: searchMigu,   play: playMigu    },
}

// ===== 默认推荐 =====
const DEFAULT_RECOMMENDATIONS = [
  { name: '孤勇者',       artist: '陈奕迅',        album: '陈奕迅',        platform: 'netease', id: 1901371647, cover: '' },
  { name: '起风了',       artist: '买辣椒也用券',  album: '起风了',        platform: 'netease', id: 1842022081, cover: '' },
  { name: '漠河舞厅',     artist: '柳爽',          album: '漠河舞厅',       platform: 'netease', id: 1498195650, cover: '' },
  { name: '稻香',         artist: '周杰伦',        album: '魔杰座',        platform: 'netease', id: 18600163,   cover: '' },
  { name: '晴天',         artist: '周杰伦',        album: '叶惠美',        platform: 'netease', id: 18600102,   cover: '' },
  { name: '告白气球',     artist: '周杰伦',        album: '周杰伦的床边故事', platform: 'netease', id: 41621589,   cover: '' },
  { name: '七里香',       artist: '周杰伦',        album: '七里香',        platform: 'netease', id: 18600116,   cover: '' },
  { name: '简单爱',       artist: '周杰伦',        album: '范特西',        platform: 'netease', id: 185960,     cover: '' },
  { name: '夜曲',         artist: '周杰伦',        album: '十一月的萧邦',   platform: 'netease', id: 18600131,   cover: '' },
  { name: '青花瓷',       artist: '周杰伦',        album: '我很忙',        platform: 'netease', id: 18600135,   cover: '' },
]

// ===== AudioEngine：隔离 audio 元素 =====
const AudioEngine = (() => {
  let audio = null
  let _bound = false

  function getAudio() {
    if (!audio) audio = new Audio()
    return audio
  }

  function bindEvents(onTimeUpdate, onEnded, onError) {
    if (_bound) return
    _bound = true
    const a = getAudio()
    a.addEventListener('timeupdate', onTimeUpdate)
    a.addEventListener('ended', onEnded)
    a.addEventListener('error', onError)
  }

  function play(url) { getAudio().src = url; return getAudio().play() }
  function pause() { getAudio().pause() }
  function resume() { return getAudio().play() }
  function stop() { getAudio().pause(); getAudio().src = '' }
  function getCurrentTime() { return getAudio().currentTime || 0 }
  function getDuration() { return getAudio().duration || 0 }
  function seek(time) { getAudio().currentTime = time }

  return { getAudio, bindEvents, play, pause, resume, stop, getCurrentTime, getDuration, seek }
})()

// ===== Player：播放编排 =====
const Player = (() => {
  let currentSong = null
  let currentUrl = ''
  let playing = false
  let _playCbs = []
  let _pauseCbs = []
  let _endCbs = []

  function onPlay(cb) { _playCbs.push(cb) }
  function onPause(cb) { _pauseCbs.push(cb) }
  function onEnd(cb) { _endCbs.push(cb) }
  function notifyPlay() { _playCbs.forEach(c => c(true)) }
  function notifyPause() { _playCbs.forEach(c => c(false)) }
  function notifyEnd() { _endCbs.forEach(c => c()) }

  function getSong() { return currentSong }
  function isPlaying() { return playing }
  function getUrl() { return currentUrl }

  async function load(song, url) {
    currentSong = song
    currentUrl = url
    playing = false
    try {
      await AudioEngine.play(url)
      playing = true
      notifyPlay()
    } catch (e) {
      playing = false
      notifyPause()
      throw e
    }
  }

  function pause() {
    AudioEngine.pause()
    playing = false
    notifyPause()
  }

  function resume() {
    AudioEngine.resume().then(() => { playing = true; notifyPlay() }).catch(() => {})
  }

  function toggle() {
    if (playing) pause()
    else resume()
    return playing
  }

  function stop() {
    AudioEngine.stop()
    playing = false
    currentSong = null
    currentUrl = ''
    notifyPause()
  }

  return { onPlay, onPause, onEnd, getSong, isPlaying, getUrl, load, pause, resume, toggle, stop }
})()

// ===== Search：多平台聚合 =====
async function searchAll(q, activePlatform) {
  if (activePlatform === 'all') {
    const settled = await Promise.allSettled(
      Object.entries(PLATFORMS).map(([key, p]) => p.search(q, 8)))
    const all = []
    settled.forEach(r => { if (r.status === 'fulfilled') all.push(...r.value) })
    return deduplicate(all)
  } else {
    const p = PLATFORMS[activePlatform]
    if (!p) return []
    const results = await p.search(q, 20)
    return Array.isArray(results) ? results : []
  }
}

function deduplicate(songs) {
  const seen = new Set()
  return songs.filter(s => {
    const k = (s.name || '') + '|' + (s.artist || '')
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// ===== 平台 API =====

async function searchNetease(q, limit = 20) {
  try {
    const results = await api.musicSearch(q.trim())
    if (Array.isArray(results) && results.length > 0) return results
  } catch {}
  try {
    const r = await fetch(`https://music.163.com/api/search/get?s=${encodeURIComponent(q)}&type=1&limit=${limit}&offset=0`, {
      headers: { 'Referer': 'https://music.163.com', 'User-Agent': navigator.userAgent }
    })
    if (!r.ok) throw new Error()
    const d = await r.json()
    return (d.result?.songs || []).map(s => ({
      id: s.id, name: s.name,
      artist: (s.artists || []).map(a => a.name).join('/'),
      album: s.album?.name || '',
      duration: s.duration || 0,
      platform: 'netease',
      cover: s.album?.picUrl ? s.album.picUrl + '?param=300y300' : '',
    }))
  } catch { return [] }
}

async function playNetease(id) {
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
  return urls[0]
}

async function searchQQ(q, limit = 20) {
  try {
    const r = await fetch(`https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=${encodeURIComponent(q)}&format=json&p=1&n=${limit}`)
    const d = await r.json()
    return (d.data?.song?.list || []).map(s => ({
      id: s.songmid || s.songid, name: s.songname,
      artist: (s.singer || []).map(a => a.name).join('/'),
      album: s.albumname || '', duration: (s.interval || 0) * 1000,
      platform: 'qq',
      cover: `https://y.gtimg.cn/music/photo_new/T002R300x300M000${s.albummid}.jpg`,
    }))
  } catch { return [] }
}

async function playQQ(mid) {
  return `https://api.injahow.cn/meting/?type=url&id=${mid}&source=tencent`
}

async function searchKugou(q, limit = 20) {
  try {
    const r = await fetch(`https://songsearch.kugou.com/song_search_v2?keyword=${encodeURIComponent(q)}&page=1&pagesize=${limit}`)
    const d = await r.json()
    return (d.data?.lists || []).map(s => ({
      id: s.FileHash, name: s.SongName,
      artist: s.SingerName,
      album: s.AlbumName || '', duration: (s.Duration || 0) * 1000,
      platform: 'kugou', cover: '',
    }))
  } catch { return [] }
}

async function playKugou(hash) {
  return `https://api.injahow.cn/meting/?type=url&id=${hash}&source=kugou`
}

async function searchKuwo(q, limit = 20) {
  try {
    const r = await fetch(`https://search.kuwo.cn/r.s?all=${encodeURIComponent(q)}&ft=music&rn=${limit}&rformat=json&encoding=utf8`)
    const text = await r.text()
    const d = JSON.parse(text)
    return (d.abslist || []).map(s => ({
      id: s.MUSICRID?.replace('MUSIC_', ''), name: s.SONGNAME,
      artist: s.ARTIST,
      album: s.ALBUM || '', duration: parseInt(s.DURATION || 0) * 1000,
      platform: 'kuwo', cover: '',
    }))
  } catch { return [] }
}

async function playKuwo(rid) {
  return `https://api.injahow.cn/meting/?type=url&id=${rid}&source=kuwo`
}

async function searchMigu(q, limit = 20) {
  try {
    const r = await fetch(`https://m.music.migu.cn/migu/remoting/scr_search_tag?keyword=${encodeURIComponent(q)}&type=2&rows=${limit}`)
    const d = await r.json()
    return (d.musics || []).map(s => ({
      id: s.copyrightId, name: s.songName,
      artist: s.singerName,
      album: s.albumName || '', duration: 0,
      platform: 'migu',
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

// ===== 工具函数 =====
function formatDuration(ms) {
  if (!ms) return ''
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function formatTime(s) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`
}

function parseLyrics(lrc) {
  if (!lrc) return ''
  return lrc.split('\n').filter(Boolean).map(line => {
    const m = line.match(/\[(\d+):(\d+\.?\d*)\](.*)/)
    if (m) {
      const time = parseInt(m[1]) * 60 + parseFloat(m[2])
      return `<div class="mp-lyric-line" data-time="${time}">${esc(m[3])}</div>`
    }
    return `<div class="mp-lyric-line">${esc(line)}</div>`
  }).join('')
}

// ===== 主页面组件 =====
export default function MusicPlayerPage() {
  let query = ''
  let results = []
  let loading = false
  let lyrics = ''
  let activePlatform = 'all'

  // DOM cache
  let dom = {}

  // Player callbacks
  Player.onEnd(() => updatePlayState(false))
  Player.onPlay(() => updatePlayState(true))
  Player.onPause(() => updatePlayState(false))

  function p(key) { return t(`music.${key}`) }

  function updateProgressUI() {
    if (!dom.progressFill || !dom.timeCurrent) return
    const duration = AudioEngine.getDuration()
    const current = AudioEngine.getCurrentTime()
    const pct = duration ? (current / duration) * 100 : 0
    if (dom.progressFill) dom.progressFill.style.width = pct + '%'
    if (dom.timeCurrent) dom.timeCurrent.textContent = formatTime(current)
  }

  function updatePlayState(isPlaying) {
    if (dom.toggleBtn) dom.toggleBtn.textContent = isPlaying ? '⏸' : '▶'
    if (dom.vinyl) dom.vinyl.className = isPlaying ? 'mp-vinyl-spin' : ''
  }

  function renderPage() {
    const currentSong = Player.getSong()
    const isPlaying = Player.isPlaying()

    const tabs = [
      `<button class="mp-ptab ${activePlatform === 'all' ? 'active' : ''}" data-p="all">${p('tabAll')}</button>`,
      ...Object.entries(PLATFORMS).map(([k, pl]) =>
        `<button class="mp-ptab ${activePlatform === k ? 'active' : ''}" data-p="${k}" style="--pc:${pl.color}">` +
        `${pl.icon} ${p(pl.nameKey)}</button>`
      )
    ].join('')

    const html = `
      <div class="mp-container">
        <div class="mp-header">
          <div class="mp-header-left">
            <span class="mp-icon">🎵</span>
            <div>
              <h1 class="mp-title">${p('pageTitle')}</h1>
              <div class="mp-subtitle">${p('pageSubtitle')}</div>
            </div>
          </div>
          <div class="mp-platform-tabs">${tabs}</div>
        </div>

        <div class="mp-search-bar">
          <input type="text" class="mp-search-input" id="mp-search"
            placeholder="${p('searchPlaceholder')}" value="${esc(query)}" autofocus>
          <button class="mp-search-btn" id="mp-search-btn">${p('searchBtn')}</button>
        </div>

        <div class="mp-body">
          <div class="mp-results" id="mp-results">
            ${loading ? `<div class="mp-loading"><div class="mp-spinner"></div>${p('loading')}</div>` : ''}
            ${!loading && results.length === 0 && query ? `<div class="mp-empty">${p('noResults')}</div>` : ''}
            ${!loading && results.length === 0 && !query ? renderRecommendations() : ''}
            ${!loading && results.length > 0 ? renderSongList() : ''}
          </div>
          ${currentSong ? renderPlayer(currentSong, isPlaying) : ''}
        </div>
      </div>
    `

    const el = document.createElement('div')
    el.className = 'music-player-page'
    el.innerHTML = html
    bindPageEvents(el)
    return el
  }

  function renderRecommendations() {
    return `
      <div class="mp-recommendations">
        <div class="mp-rec-header">${p('recTitle')}</div>
        <div class="mp-rec-grid">
          ${DEFAULT_RECOMMENDATIONS.map((s, i) => {
            const pl = PLATFORMS[s.platform]
            return `
              <div class="mp-rec-card" data-rec-idx="${i}">
                <div class="mp-rec-cover">
                  ${s.cover
                    ? `<img src="${esc(s.cover)}" alt="">`
                    : `<div class="mp-rec-placeholder">${pl?.icon || '🎵'}</div>`
                  }
                </div>
                <div class="mp-rec-info">
                  <div class="mp-rec-name">${esc(s.name)}</div>
                  <div class="mp-rec-artist">${esc(s.artist)}</div>
                </div>
                <button class="mp-rec-play" data-rec-idx="${i}" title="${p('play')}">▶</button>
              </div>
            `
          }).join('')}
        </div>
      </div>
    `
  }

  function renderSongList() {
    const currentSong = Player.getSong()
    return results.map((s, i) => {
      const pl = PLATFORMS[s.platform]
      const isActive = currentSong && currentSong.id === s.id && currentSong.platform === s.platform
      return `
        <div class="mp-song ${isActive ? 'is-active' : ''}" data-idx="${i}">
          <div class="mp-song-cover">
            ${s.cover
              ? `<img src="${esc(s.cover)}" alt="" loading="lazy">`
              : `<div class="mp-song-cover-placeholder">${pl?.icon || '🎵'}</div>`
            }
          </div>
          <div class="mp-song-info">
            <div class="mp-song-name">${esc(s.name)}</div>
            <div class="mp-song-artist">${esc(s.artist)}</div>
            <div class="mp-song-album">${esc(s.album)}</div>
          </div>
          <div class="mp-song-platform">
            <span class="mp-platform-badge" style="background:${pl?.color || '#666'}">${pl?.icon || '🎵'} ${pl ? p(pl.nameKey) : s.platform}</span>
          </div>
          <div class="mp-song-duration">${formatDuration(s.duration)}</div>
          <div class="mp-song-actions">
            <button class="mp-play-btn" data-idx="${i}" title="${p('play')}">▶</button>
            <button class="mp-download-btn" data-idx="${i}" title="${p('download')}">⬇</button>
          </div>
        </div>
      `
    }).join('')
  }

  function renderPlayer(song, isPlaying) {
    const pl = PLATFORMS[song.platform]
    const duration = AudioEngine.getDuration()
    const currentTime = AudioEngine.getCurrentTime()
    const pct = duration ? (currentTime / duration) * 100 : 0

    return `
      <div class="mp-player" id="mp-player">
        <div class="mp-player-cover">
          ${song.cover
            ? `<img src="${esc(song.cover)}" alt="">`
            : `<div class="mp-player-cover-placeholder">🎵</div>`
          }
          <div class="mp-vinyl-spin ${isPlaying ? '' : 'paused'}" id="mp-vinyl"></div>
        </div>
        <div class="mp-player-info">
          <div class="mp-player-name">${esc(song.name)}</div>
          <div class="mp-player-artist">${esc(song.artist)} · ${esc(song.album)}</div>
          <div class="mp-player-controls">
            <button class="mp-ctrl-btn" id="mp-prev" title="${p('prev')}">⏮</button>
            <button class="mp-ctrl-btn mp-ctrl-play" id="mp-toggle" title="${p('togglePlay')}">${isPlaying ? '⏸' : '▶'}</button>
            <button class="mp-ctrl-btn" id="mp-next" title="${p('next')}">⏭</button>
            <button class="mp-ctrl-btn" id="mp-download" title="${p('download')}">⬇</button>
          </div>
          <div class="mp-progress">
            <div class="mp-progress-bar" id="mp-progress-bar"><div class="mp-progress-fill" id="mp-progress-fill" style="width:${pct}%"></div></div>
            <div class="mp-progress-time">
              <span id="mp-time-current">${formatTime(currentTime)}</span> / <span>${formatDuration(song.duration || duration * 1000)}</span>
            </div>
          </div>
        </div>
        ${lyrics ? `<div class="mp-lyrics" id="mp-lyrics">${parseLyrics(lyrics)}</div>` : ''}
      </div>
    `
  }

  let _eventsBound = false
  function bindPageEvents(el) {
    if (_eventsBound) return
    _eventsBound = true

    dom = {
      toggleBtn: el.querySelector('#mp-toggle'),
      vinyl: el.querySelector('#mp-vinyl'),
      progressFill: el.querySelector('#mp-progress-fill'),
      progressBar: el.querySelector('#mp-progress-bar'),
      timeCurrent: el.querySelector('#mp-time-current'),
    }

    // 搜索
    el.querySelector('#mp-search')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') doSearch()
    })
    el.querySelector('#mp-search-btn')?.addEventListener('click', doSearch)

    // 平台切换
    el.querySelectorAll('.mp-ptab').forEach(btn => {
      btn.addEventListener('click', () => {
        activePlatform = btn.dataset.p
        renderResults()
      })
    })

    // 推荐歌曲播放
    el.addEventListener('click', e => {
      const recBtn = e.target.closest('.mp-rec-play')
      if (recBtn) playRecSong(parseInt(recBtn.dataset.recIdx))
    })

    // 播放器控制
    el.querySelector('#mp-toggle')?.addEventListener('click', () => Player.toggle())

    el.querySelector('#mp-prev')?.addEventListener('click', () => toast('暂不支持上一首', 'info'))

    el.querySelector('#mp-next')?.addEventListener('click', () => {
      const nextIdx = results.findIndex(s =>
        Player.getSong() && s.id === Player.getSong().id && s.platform === Player.getSong().platform
      ) + 1
      if (nextIdx < results.length) playSong(nextIdx)
      else toast('已到列表末尾', 'info')
    })

    el.querySelector('#mp-download')?.addEventListener('click', () => {
      const song = Player.getSong()
      if (song) downloadSong(results.indexOf(song))
    })

    // 进度条点击
    el.querySelector('#mp-progress-bar')?.addEventListener('click', e => {
      const bar = e.currentTarget
      const rect = bar.getBoundingClientRect()
      const pct = (e.clientX - rect.left) / rect.width
      const d = AudioEngine.getDuration()
      if (d) AudioEngine.seek(pct * d)
    })

    // AudioEngine 事件
    AudioEngine.bindEvents(
      () => updateProgressUI(),
      () => updatePlayState(false),
      () => toast(p('playErrorGeneral'), 'error')
    )
  }

  function renderResults() {
    const resultsEl = document.querySelector('.mp-results')
    if (!resultsEl) return

    if (loading) {
      resultsEl.innerHTML = `<div class="mp-loading"><div class="mp-spinner"></div>${p('loading')}</div>`
      return
    }
    if (results.length === 0 && query) {
      resultsEl.innerHTML = `<div class="mp-empty">${p('noResults')}</div>`
      return
    }
    if (results.length === 0 && !query) {
      resultsEl.innerHTML = renderRecommendations()
      bindResultButtons(resultsEl)
      return
    }
    resultsEl.innerHTML = renderSongList()
    bindResultButtons(resultsEl)
  }

  function bindResultButtons(el) {
    el.querySelectorAll('.mp-play-btn').forEach(btn => {
      btn.onclick = () => playSong(parseInt(btn.dataset.idx))
    })
    el.querySelectorAll('.mp-download-btn').forEach(btn => {
      btn.onclick = () => downloadSong(parseInt(btn.dataset.idx))
    })
  }

  async function doSearch() {
    const input = document.querySelector('#mp-search')
    query = input?.value?.trim() || ''
    if (!query) return
    loading = true
    renderResults()
    try {
      results = await searchAll(query, activePlatform)
    } catch (e) {
      results = []
      toast(p('searchError', { error: e?.message || e }), 'error')
    } finally {
      loading = false
      renderResults()
    }
  }

  async function playSong(idx) {
    const song = results[idx]
    if (!song) return
    const pl = PLATFORMS[song.platform]
    if (!pl) return
    try {
      const url = await pl.play(song.id)
      await Player.load(song, url)
      lyrics = await fetchLyrics(song)
      const pageEl = document.querySelector('.music-player-page')
      if (pageEl) {
        const newPage = renderPage()
        pageEl.replaceWith(newPage)
      }
      toast(p('nowPlaying', { name: song.name, artist: song.artist }))
    } catch (e) {
      toast(p('playError'), 'error')
    }
  }

  async function playRecSong(idx) {
    const song = DEFAULT_RECOMMENDATIONS[idx]
    if (!song) return
    const pl = PLATFORMS[song.platform]
    if (!pl) return
    try {
      const url = await pl.play(song.id)
      await Player.load(song, url)
      lyrics = await fetchLyrics(song)
      const pageEl = document.querySelector('.music-player-page')
      if (pageEl) {
        const newPage = renderPage()
        pageEl.replaceWith(newPage)
      }
      toast(p('nowPlaying', { name: song.name, artist: song.artist }))
    } catch (e) {
      toast(p('playError'), 'error')
    }
  }

  async function downloadSong(idx) {
    const song = results[idx]
    if (!song) return
    const pl = PLATFORMS[song.platform]
    if (!pl) return
    try {
      const url = await pl.play(song.id)
      const a = document.createElement('a')
      a.href = url
      a.download = `${song.artist} - ${song.name}.mp3`
      a.target = '_blank'
      document.body.appendChild(a)
      a.click()
      a.remove()
      toast(p('downloadStart', { name: song.name }))
    } catch (e) {
      toast(p('downloadError', { error: e?.message || e }), 'error')
    }
  }

  return renderPage()
}
