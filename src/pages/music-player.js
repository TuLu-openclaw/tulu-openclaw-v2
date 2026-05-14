/**
 * 星枢音乐播放器 - 汽水音乐风格
 * 多平台聚合搜索 · 播放 · 下载
 */
import { t, initI18n } from '../lib/i18n.js'
import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'

// 初始化 i18n
initI18n()

let _rootEl = null

// ESC helper
function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }

// ===== 平台配置 =====
const PLATFORMS = {
  netease: { name: t('music.platformNetease'), icon: '🎵', color: '#e60026' },
  qq: { name: t('music.platformQQ'), icon: '🎶', color: '#31c27c' },
  kugou: { name: t('music.platformKugou'), icon: '🎧', color: '#2ca2f6' },
  kuwo: { name: t('music.platformKuwo'), icon: '🔊', color: '#ff6600' },
  migu: { name: t('music.platformMigu'), icon: '🎤', color: '#ff2d51' },
}

// ===== 状态管理 =====
const state = {
  activeTab: 'discover',
  query: '',
  searchResults: [],
  searchLoading: false,
  currentSong: null,
  currentUrl: '',
  playing: false,
  lyrics: '',
  queue: [],
  queueIndex: -1,
  playMode: 'order',
  favorites: loadFavorites(),
  history: loadHistory(),
  audioEl: null,
  progress: 0,
  duration: 0,
  volume: 1,
  bgColor: '#1a1a2e',
  downloadDir: null,
}

const STORAGE_KEYS = {
  favorites: 'xingsu_favorites',
  history: 'xingxu_history',
  downloadDir: 'xingxu_download_dir',
}

function loadFavorites() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.favorites) || '[]') } catch { return [] }
}
function saveFavorites() {
  localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(state.favorites))
}
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || '[]') } catch { return [] }
}
function saveHistory() {
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(state.history))
}
function loadDownloadDir() {
  return localStorage.getItem(STORAGE_KEYS.downloadDir) || null
}
function saveDownloadDir(dir) {
  localStorage.setItem(STORAGE_KEYS.downloadDir, dir)
}

// ===== 颜色提取 =====
function extractColor(imgEl) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  canvas.width = 1; canvas.height = 1
  ctx.drawImage(imgEl, 0, 0, 1, 1)
  const [r,g,b] = ctx.getImageData(0, 0, 1, 1).data
  return `rgb(${r},${g},${b})`
}
function getDominantColor(coverUrl) {
  return new Promise(resolve => {
    if (!coverUrl) { resolve('#1a1a2e'); return }
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.onload = () => { try { resolve(extractColor(img)) } catch { resolve('#1a1a2e') } }
    img.onerror = () => resolve('#1a1a2e')
    img.src = coverUrl
  })
}

// ===== API =====
async function doSearch() {
  if (!state.query.trim()) return
  state.searchLoading = true
  state.searchResults = []
  renderPage()

  try {
    const results = await api.musicSearchAll(state.query.trim())
    const all = []
    results.forEach(platform => {
      if (platform.success && platform.songs) {
        platform.songs.forEach(song => {
          all.push({ ...song, platform: platform.platform })
        })
      }
    })
    // 去重
    const seen = new Set()
    state.searchResults = all.filter(s => {
      const key = s.name + '|' + s.artist
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  } catch (e) {
    console.error('Search error:', e)
    state.searchResults = []
  } finally {
    state.searchLoading = false
    renderPage()
  }
}

async function playSong(song, addToHistory = true) {
  if (!song) return
  if (state.audioEl) state.audioEl.pause()

  state.currentSong = song
  state.playing = false
  state.lyrics = ''

  // 更新队列
  const existingIdx = state.queue.findIndex(s => s.id === song.id && s.platform === song.platform)
  if (existingIdx >= 0) {
    state.queue.splice(existingIdx, 1)
  }
  state.queue.unshift(song)
  if (state.queue.length > 100) state.queue.pop()
  state.queueIndex = 0

  if (addToHistory) addToHistory(song)

  try {
    const rawUrl = await api.musicGetPlayUrl(song.platform, song.id)

    // 过滤无效 URL
    if (!rawUrl || rawUrl === 'null' ||
        (rawUrl.includes('api.injahow.cn') && rawUrl.length < 100) ||
        rawUrl.includes('meting') && rawUrl.length < 100) {
      throw new Error(t('music.playErrorGeneral'))
    }

    // 网易云直链需要通过后端代理
    let playUrl = rawUrl
    if (song.platform === 'netease' && rawUrl.includes('music.163.com')) {
      try {
        playUrl = await api.musicProxyAudio(rawUrl, 'netease')
      } catch (proxyErr) {
        console.warn('Proxy failed, trying direct:', proxyErr)
        playUrl = rawUrl
      }
    }

    if (!state.audioEl) {
      state.audioEl = new Audio()
      state.audioEl.volume = state.volume
      state.audioEl.addEventListener('timeupdate', onTimeUpdate)
      state.audioEl.addEventListener('ended', onSongEnded)
      state.audioEl.addEventListener('loadedmetadata', onLoadedMetadata)
      state.audioEl.addEventListener('error', onAudioError)
    }

    state.currentUrl = playUrl
    state.audioEl.src = playUrl
    state.audioEl.play()
    state.playing = true

    // 歌词
    try {
      state.lyrics = await api.musicGetLyrics(song.platform, song.id)
    } catch { state.lyrics = '' }

    // 背景色
    if (song.cover) {
      state.bgColor = await getDominantColor(song.cover)
    }

    renderPage()
    toast(t('music.nowPlaying', { name: song.name, artist: song.artist }))
  } catch (e) {
    console.error('Play error:', e)
    toast(t('music.playError', { error: e?.message || e }), 'error')
  }
}

function addToHistory(song) {
  const existing = state.history.find(h => h.id === song.id && h.platform === song.platform)
  if (existing) state.history.splice(state.history.indexOf(existing), 1)
  state.history.unshift({ ...song, playedAt: Date.now() })
  if (state.history.length > 50) state.history.pop()
  saveHistory()
}

function togglePlay() {
  if (!state.audioEl) return
  if (state.playing) state.audioEl.pause()
  else state.audioEl.play()
  state.playing = !state.playing
  renderPage()
}

function onTimeUpdate() {
  if (!state.audioEl) return
  state.progress = state.audioEl.currentTime
  state.duration = state.audioEl.duration || 0
  updateProgressUI()
}

function onSongEnded() {
  if (state.playMode === 'loop') {
    state.audioEl.currentTime = 0
    state.audioEl.play()
  } else if (state.playMode !== 'single') {
    playNext()
  }
}

function onLoadedMetadata() {
  state.duration = state.audioEl.duration || 0
}

function onAudioError(e) {
  console.error('Audio error:', e)
  toast(t('music.playErrorGeneral'), 'error')
}

function playNext() {
  if (state.queue.length === 0) return
  if (state.playMode === 'random') {
    state.queueIndex = Math.floor(Math.random() * state.queue.length)
  } else {
    state.queueIndex = (state.queueIndex + 1) % state.queue.length
  }
  playSong(state.queue[state.queueIndex])
}

function playPrev() {
  if (state.queue.length === 0) return
  state.queueIndex = (state.queueIndex - 1 + state.queue.length) % state.queue.length
  playSong(state.queue[state.queueIndex])
}

function toggleFavorite(song) {
  const idx = state.favorites.findIndex(s => s.id === song.id && s.platform === song.platform)
  if (idx >= 0) {
    state.favorites.splice(idx, 1)
    toast(t('music.removeFav'))
  } else {
    state.favorites.unshift(song)
    toast(t('music.addFav'))
  }
  saveFavorites()
  renderPage()
}

function isFavorite(song) {
  return state.favorites.some(s => s.id === song.id && s.platform === song.platform)
}

async function downloadSong() {
  if (!state.currentSong) return

  let dir = state.downloadDir || loadDownloadDir()
  if (!dir) {
    toast(t('music.downloadNeedDir'), 'error')
    return
  }

  try {
    await api.musicSetDownloadDir(dir)
    const path = await api.musicDownloadSong(
      state.currentSong.platform,
      state.currentSong.id,
      state.currentSong.name,
      state.currentSong.artist
    )
    toast(t('music.downloadDone', { path }))
  } catch (e) {
    toast(t('music.downloadError', { error: e?.message || e }), 'error')
  }
}

// ===== 格式化 =====
function formatDuration(ms) {
  if (!ms) return '0:00'
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function parseLyrics(lrc) {
  if (!lrc) return []
  return lrc.split('\n').filter(Boolean).map(line => {
    const m = line.match(/\[(\d+):(\d+\.?\d*)\](.*)/)
    if (m) return { time: parseInt(m[1]) * 60 + parseFloat(m[2]), text: m[3].trim() }
    return { time: 0, text: line.replace(/^\[.*\]\s*/, '') }
  })
}

function formatTimeAgo(timestamp) {
  const diff = Date.now() - timestamp
  if (diff < 60000) return t('music.justNow')
  if (diff < 3600000) return t('music.minutesAgo', { n: Math.floor(diff / 60000) })
  if (diff < 86400000) return t('music.hoursAgo', { n: Math.floor(diff / 3600000) })
  return new Date(timestamp).toLocaleDateString()
}

// ===== 渲染 =====
function renderPage() {
  const scope = _rootEl || document
  const el = scope.querySelector('.music-player-page')
  if (!el) return

  el.innerHTML = `
    <div class="xingmu-container" style="--bg-color:${state.bgColor}">
      ${renderHeader()}
      ${renderMainContent()}
      ${renderMiniPlayer()}
    </div>
  `
  bindEvents()
  if (state.currentSong?.cover) setBackground(state.currentSong.cover)
}

function renderHeader() {
  return `
    <div class="xingmu-header">
      <div class="xingmu-tabs">
        <button class="xingmu-tab ${state.activeTab === 'discover' ? 'active' : ''}" data-tab="discover">${t('music.tabDiscover')}</button>
        <button class="xingmu-tab ${state.activeTab === 'my' ? 'active' : ''}" data-tab="my">${t('music.tabMy')}</button>
      </div>
      ${state.activeTab !== 'player' && state.currentSong ? `
        <button class="xingmu-player-btn" data-tab="player">
          <div class="xingmu-player-cover-small">
            ${state.currentSong?.cover
              ? `<img src="${esc(state.currentSong.cover)}" alt="">`
              : '<div class="xingmu-cover-placeholder">🎵</div>'}
          </div>
        </button>
      ` : ''}
    </div>
  `
}

function renderMainContent() {
  if (state.activeTab === 'player') return renderPlayerPage()
  return `<div class="xingmu-content">${state.activeTab === 'discover' ? renderDiscover() : renderMyPage()}</div>`
}

function renderDiscover() {
  return `
    <div class="xingmu-search">
      <input type="text" class="xingmu-search-input" placeholder="${t('music.searchPlaceholder')}" value="${esc(state.query)}" id="xingmu-search-input">
      <button class="xingmu-search-btn" id="xingmu-search-btn">🔍</button>
    </div>
    ${!state.query ? renderRecommendations() : renderSearchResults()}
  `
}

function renderRecommendations() {
  const recs = [
    { name: '孤勇者', artist: '陈奕迅', platform: 'netease', id: '1901371647', album: '单打独斗', duration: 298000, cover: '' },
    { name: '起风了', artist: '买辣椒也用券', platform: 'netease', id: '1842022081', album: '起风了', duration: 305000, cover: '' },
    { name: '漠河舞厅', artist: '柳爽', platform: 'netease', id: '1498195650', album: '漠河舞厅', duration: 268000, cover: '' },
    { name: '稻香', artist: '周杰伦', platform: 'netease', id: '18600163', album: '魔杰座', duration: 224000, cover: '' },
    { name: '晴天', artist: '周杰伦', platform: 'netease', id: '18600102', album: '叶惠美', duration: 267000, cover: '' },
  ]
  return `
    <div class="xingmu-section">
      <div class="xingmu-section-title">🔥 ${t('music.recTitle')}</div>
      <div class="xingmu-rec-grid">
        ${recs.map((s, i) => `
          <div class="xingmu-rec-card" data-rec-index="${i}">
            <div class="xingmu-rec-cover">🎵</div>
            <div class="xingmu-rec-name">${esc(s.name)}</div>
            <div class="xingmu-rec-artist">${esc(s.artist)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `
}

function renderSearchResults() {
  if (state.searchLoading) {
    return `<div class="xingmu-loading"><div class="xingmu-spinner"></div>${t('music.searching')}</div>`
  }
  if (state.searchResults.length === 0) {
    return `<div class="xingmu-empty">${t('music.noResults')}</div>`
  }
  return `<div class="xingmu-results">${state.searchResults.map((s, i) => renderSongCard(s, i)).join('')}</div>`
}

function renderSongCard(song, idx) {
  const isPlaying = state.currentSong?.id === song.id && state.currentSong?.platform === song.platform
  const isFav = isFavorite(song)
  const p = PLATFORMS[song.platform] || { name: song.platform, color: '#666' }
  return `
    <div class="xingmu-song-card ${isPlaying ? 'playing' : ''}" data-index="${idx}">
      <div class="xingmu-song-cover">
        ${song.cover
          ? `<img src="${esc(song.cover)}" alt="" loading="lazy">`
          : `<div class="xingmu-cover-placeholder">${p.icon || '🎵'}</div>`}
      </div>
      <div class="xingmu-song-info">
        <div class="xingmu-song-name">${esc(song.name)}</div>
        <div class="xingmu-song-artist">${esc(song.artist)}</div>
        <div class="xingmu-song-meta">
          <span class="xingmu-platform-tag" style="background:${p.color}">${p.name}</span>
          <span class="xingmu-duration">${formatDuration(song.duration)}</span>
        </div>
      </div>
      <div class="xingmu-song-actions">
        <button class="xingmu-action-btn xingmu-play-btn" data-index="${idx}" title="${t('music.togglePlay')}">${isPlaying && state.playing ? '⏸' : '▶'}</button>
        <button class="xingmu-action-btn xingmu-fav-btn ${isFav ? 'active' : ''}" data-index="${idx}" title="${t('music.like')}">${isFav ? '❤️' : '🤍'}</button>
      </div>
    </div>
  `
}

function renderMyPage() {
  return `
    <div class="xingmu-my">
      <div class="xingmu-section">
        <div class="xingmu-section-title">❤️ ${t('music.favTitle')}</div>
        ${state.favorites.length === 0
          ? `<div class="xingmu-empty">${t('music.emptyFav')}</div>`
          : `<div class="xingmu-results">${state.favorites.slice(0, 20).map((s, i) => renderSongCard(s, i)).join('')}</div>`}
      </div>
      <div class="xingmu-section">
        <div class="xingmu-section-title">🕐 ${t('music.historyTitle')}</div>
        ${state.history.length === 0
          ? `<div class="xingmu-empty">${t('music.emptyHistory')}</div>`
          : `<div class="xingmu-results">${state.history.slice(0, 20).map((s, i) => renderSongCard(s, i)).join('')}</div>`}
      </div>
    </div>
  `
}

function renderPlayerPage() {
  if (!state.currentSong) return `<div class="xingmu-empty">${t('music.emptyPlayer')}</div>`
  const song = state.currentSong
  const p = PLATFORMS[song.platform] || { name: song.platform, color: '#666' }
  const lyricLines = parseLyrics(state.lyrics)
  const currentLyricIndex = lyricLines.findIndex((l, i, arr) =>
    i < arr.length - 1 && state.progress >= l.time && state.progress < arr[i + 1].time
  )
  return `
    <div class="xingmu-player">
      <button class="xingmu-back-btn" data-tab="discover">← ${t('music.backBtn')}</button>
      <div class="xingmu-player-cover-wrap">
        <div class="xingmu-player-cover">
          ${song.cover
            ? `<img src="${esc(song.cover)}" alt="" id="xingmu-cover-img">`
            : `<div class="xingmu-cover-placeholder-lg">🎵</div>`}
        </div>
      </div>
      <div class="xingmu-player-info">
        <div class="xingmu-player-name">${esc(song.name)}</div>
        <div class="xingmu-player-artist">${esc(song.artist)} · ${esc(song.album || '')}</div>
      </div>
      ${lyricLines.length > 0 ? `
        <div class="xingmu-lyrics" id="xingmu-lyrics">
          ${lyricLines.map((l, i) => `
            <div class="xingmu-lyric-line ${i === currentLyricIndex ? 'active' : ''}" data-time="${l.time}">${esc(l.text)}</div>
          `).join('')}
        </div>
      ` : ''}
      <div class="xingmu-player-controls">
        <div class="xingmu-progress">
          <div class="xingmu-progress-bar" id="xingmu-progress-bar">
            <div class="xingmu-progress-fill" id="xingmu-progress-fill"></div>
          </div>
          <div class="xingmu-progress-time">
            <span id="xingmu-time-current">${formatDuration(state.progress * 1000)}</span>
            <span>/</span>
            <span id="xingmu-time-total">${formatDuration(state.duration * 1000)}</span>
          </div>
        </div>
        <div class="xingmu-controls">
          <button class="xingmu-ctrl-btn xingmu-mode-btn" id="xingmu-mode-btn" title="${t('music.modeOrder')}">${state.playMode === 'order' ? '🔁' : state.playMode === 'loop' ? '🔂' : '🔀'}</button>
          <button class="xingmu-ctrl-btn" id="xingmu-prev-btn" title="${t('music.prevTrack')}">⏮</button>
          <button class="xingmu-ctrl-btn xingmu-play-btn-lg" id="xingmu-toggle-btn">${state.playing ? '⏸' : '▶'}</button>
          <button class="xingmu-ctrl-btn" id="xingmu-next-btn" title="${t('music.nextTrack')}">⏭</button>
          <button class="xingmu-ctrl-btn" id="xingmu-fav-btn-lg" title="${t('music.like')}">${isFavorite(song) ? '❤️' : '🤍'}</button>
        </div>
        <div class="xingmu-actions">
          <button class="xingmu-action-btn-lg" id="xingmu-download-btn" title="${t('music.download')}">⬇ ${t('music.download')}</button>
        </div>
      </div>
    </div>
  `
}

function renderMiniPlayer() {
  if (!state.currentSong || state.activeTab === 'player') return ''
  const song = state.currentSong
  return `
    <div class="xingmu-mini-player" data-tab="player">
      <div class="xingmu-mini-cover">
        ${song.cover ? `<img src="${esc(song.cover)}" alt="">` : '<div class="xingmu-cover-placeholder-sm">🎵</div>'}
      </div>
      <div class="xingmu-mini-info">
        <div class="xingmu-mini-name">${esc(song.name)}</div>
        <div class="xingmu-mini-artist">${esc(song.artist)}</div>
      </div>
      <div class="xingmu-mini-controls">
        <button class="xingmu-ctrl-btn" id="xingmu-mini-toggle">${state.playing ? '⏸' : '▶'}</button>
        <button class="xingmu-ctrl-btn" id="xingmu-mini-next">⏭</button>
      </div>
      <div class="xingmu-mini-progress"><div class="xingmu-progress-fill" id="xingmu-mini-progress-fill"></div></div>
    </div>
  `
}

function setBackground(coverUrl) {
  const scope = _rootEl || document
  const container = scope.querySelector('.xingmu-container')
  if (!container || !coverUrl) return
  let bg = scope.querySelector('.xingmu-bg')
  if (!bg) { bg = document.createElement('div'); bg.className = 'xingmu-bg'; container.insertBefore(bg, container.firstChild) }
  bg.style.backgroundImage = `url(${coverUrl})`
}

function updateProgressUI() {
  const scope = _rootEl || document
  const fill = scope.querySelector('#xingmu-progress-fill')
  const miniFill = scope.querySelector('#xingmu-mini-progress-fill')
  const cur = scope.querySelector('#xingmu-time-current')
  const total = scope.querySelector('#xingmu-time-total')
  const pct = state.duration > 0 ? (state.progress / state.duration) * 100 : 0
  if (fill) fill.style.width = pct + '%'
  if (miniFill) miniFill.style.width = pct + '%'
  if (cur) cur.textContent = formatDuration(state.progress * 1000)
  if (total) total.textContent = formatDuration(state.duration * 1000)

  const lyricLines = scope.querySelectorAll('.xingmu-lyric-line')
  if (lyricLines.length > 0) {
    const lrc = parseLyrics(state.lyrics)
    let activeIdx = -1
    for (let i = 0; i < lrc.length; i++) {
      if (state.progress >= lrc[i].time) activeIdx = i
      else break
    }
    lyricLines.forEach((line, i) => line.classList.toggle('active', i === activeIdx))
  }
}

function bindEvents() {
  const scope = _rootEl || document

  // Tab 切换
  scope.querySelectorAll('.xingmu-tab').forEach(btn => {
    btn.addEventListener('click', () => { state.activeTab = btn.dataset.tab; renderPage() })
  })
  scope.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab) { state.activeTab = btn.dataset.tab; renderPage() }
    })
  })

  // 搜索
  const searchInput = scope.querySelector('#xingmu-search-input')
  const searchBtn = scope.querySelector('#xingmu-search-btn')
  searchInput?.addEventListener('keydown', e => { if (e.key === 'Enter') { state.query = searchInput.value; doSearch() } })
  searchBtn?.addEventListener('click', () => { state.query = searchInput?.value || ''; doSearch() })

  // 播放控制
  scope.querySelector('#xingmu-toggle-btn')?.addEventListener('click', togglePlay)
  scope.querySelector('#xingmu-mini-toggle')?.addEventListener('click', togglePlay)
  scope.querySelector('#xingmu-prev-btn')?.addEventListener('click', playPrev)
  scope.querySelector('#xingmu-next-btn')?.addEventListener('click', playNext)
  scope.querySelector('#xingmu-mini-next')?.addEventListener('click', playNext)

  // 播放模式
  scope.querySelector('#xingmu-mode-btn')?.addEventListener('click', () => {
    const modes = ['order', 'loop', 'random']
    const idx = modes.indexOf(state.playMode)
    state.playMode = modes[(idx + 1) % modes.length]
    renderPage()
  })

  // 喜欢按钮
  scope.querySelector('#xingmu-fav-btn-lg')?.addEventListener('click', () => {
    if (state.currentSong) toggleFavorite(state.currentSong)
  })

  // 下载
  scope.querySelector('#xingmu-download-btn')?.addEventListener('click', downloadSong)

  // 歌曲卡片播放
  scope.querySelectorAll('.xingmu-play-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      const idx = parseInt(btn.dataset.index)
      const results = state.searchResults.length > 0 ? state.searchResults : state.favorites.length > 0 ? state.favorites : state.history
      if (results[idx]) {
        state.queue = results.slice(idx).concat(results.slice(0, idx))
        state.queueIndex = 0
        playSong(results[idx])
      }
    })
  })

  // 歌曲卡片喜欢
  scope.querySelectorAll('.xingmu-fav-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      const idx = parseInt(btn.dataset.index)
      const results = state.searchResults.length > 0 ? state.searchResults : state.favorites.length > 0 ? state.favorites : state.history
      if (results[idx]) toggleFavorite(results[idx])
    })
  })

  // 推荐卡片
  scope.querySelectorAll('.xingmu-rec-card').forEach(card => {
    card.addEventListener('click', async () => {
      const recs = [
        { name: '孤勇者', artist: '陈奕迅', platform: 'netease', id: '1901371647', album: '单打独斗', duration: 298000, cover: '' },
        { name: '起风了', artist: '买辣椒也用券', platform: 'netease', id: '1842022081', album: '起风了', duration: 305000, cover: '' },
        { name: '漠河舞厅', artist: '柳爽', platform: 'netease', id: '1498195650', album: '漠河舞厅', duration: 268000, cover: '' },
        { name: '稻香', artist: '周杰伦', platform: 'netease', id: '18600163', album: '魔杰座', duration: 224000, cover: '' },
        { name: '晴天', artist: '周杰伦', platform: 'netease', id: '18600102', album: '叶惠美', duration: 267000, cover: '' },
      ]
      const idx = parseInt(card.dataset.recIndex)
      if (recs[idx]) {
        state.queue = [recs[idx]]
        state.queueIndex = 0
        playSong(recs[idx])
      }
    })
  })

  // 进度条点击
  scope.querySelector('#xingmu-progress-bar')?.addEventListener('click', e => {
    if (!state.audioEl || !state.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    state.audioEl.currentTime = pct * state.duration
  })

  // 键盘
  (_rootEl || document).addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return
    if (e.code === 'Space') { e.preventDefault(); togglePlay() }
    if (e.code === 'ArrowLeft' && state.audioEl) state.audioEl.currentTime = Math.max(0, state.audioEl.currentTime - 5)
    if (e.code === 'ArrowRight' && state.audioEl) state.audioEl.currentTime = Math.min(state.duration, state.audioEl.currentTime + 5)
  })
}

// ===== 导出 =====
export async function render(container) {
  if (container instanceof HTMLElement) {
    _rootEl = container
    container.className = 'music-player-page'
    renderPage()
    return
  }
  const el = document.createElement('div')
  el.className = 'music-player-page'
  _rootEl = el
  renderPage()
  return el
}

export default function MusicPlayerPage() {
  const el = document.createElement('div')
  el.className = 'music-player-page'
  _rootEl = el
  renderPage()
  return el
}
