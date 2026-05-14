/**
 * 汽水音乐播放器 - 全新重构版
 * 风格参考: 汽水音乐 (ByteDance)
 * 
 * 特点:
 * - 沉浸式大封面 UI
 * - 发现/我的/播放页 tab 切换
 * - 迷你播放器
 * - 上下滑动切歌
 * - 动态背景氛围色
 * - 收藏/历史/播放队列
 * - 多平台支持 (NetEase/QQ/Kugou/Kuwo/Migu)
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
  // 当前视图
  activeTab: 'discover', // discover | my | player
  // 搜索
  query: '',
  searchResults: {},
  searchLoading: false,
  // 播放
  currentSong: null,
  currentUrl: '',
  playing: false,
  lyrics: '',
  // 播放列表
  queue: [],
  queueIndex: -1,
  playMode: 'order', // order | loop | random
  // 收藏/历史
  favorites: loadFavorites(),
  history: loadHistory(),
  // 音频
  audioEl: null,
  progress: 0,
  duration: 0,
  volume: 1,
  // 背景色
  bgColor: '#1a1a2e',
}

// 本地存储 key
const STORAGE_KEYS = {
  favorites: 'qishui_favorites',
  history: 'qishui_history',
  downloadDir: 'qishui_download_dir',
}

function loadFavorites() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.favorites) || '[]')
  } catch { return [] }
}

function saveFavorites() {
  localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(state.favorites))
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || '[]')
  } catch { return [] }
}

function saveHistory() {
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(state.history))
}

// ===== 颜色提取 =====
function extractColor(imgEl) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  canvas.width = 1
  canvas.height = 1
  ctx.drawImage(imgEl, 0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return `rgb(${r},${g},${b})`
}

function getDominantColor(coverUrl) {
  return new Promise(resolve => {
    if (!coverUrl) {
      resolve('#1a1a2e')
      return
    }
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.onload = () => {
      try {
        resolve(extractColor(img))
      } catch {
        resolve('#1a1a2e')
      }
    }
    img.onerror = () => resolve('#1a1a2e')
    img.src = coverUrl
  })
}

// ===== API 调用 =====
async function doSearch() {
  if (!state.query.trim()) return
  
  state.searchLoading = true
  state.searchResults = {}
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
    const deduped = all.filter(s => {
      const key = s.name + '|' + s.artist
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    
    state.searchResults = { all: deduped }
  } catch (e) {
    console.error('Search error:', e)
    state.searchResults = { all: [] }
  } finally {
    state.searchLoading = false
    renderPage()
  }
}

async function playSong(song, addToHistory = true) {
  if (!song) return
  
  const wasPlaying = state.playing
  if (wasPlaying) {
    state.audioEl?.pause()
  }
  
  state.currentSong = song
  state.playing = false
  state.lyrics = ''
  
  // 更新队列
  if (!state.queue.find(s => s.id === song.id && s.platform === song.platform)) {
    state.queue.unshift(song)
    if (state.queue.length > 100) state.queue.pop()
  }
  state.queueIndex = 0
  
  // 添加到历史
  if (addToHistory) {
    addToHistoryFn(song)
  }
  
  // 获取播放链接
  try {
    const rawUrl = await api.musicGetPlayUrl(song.platform, song.id)
    
    if (!rawUrl || rawUrl.startsWith('https://api.injahow.cn') || rawUrl.startsWith('https://meting')) {
      throw new Error(t('music.playError', { error: 'No playable URL found' }))
    }
    
    // 网易云直链需要通过后端代理（带 Referer header）才能在浏览器播放
    if (song.platform === 'netease' && rawUrl.includes('music.163.com')) {
      try {
        state.currentUrl = await api.musicProxyAudio(rawUrl, 'netease')
      } catch (proxyErr) {
        console.warn('Netease proxy failed, trying direct URL:', proxyErr)
        state.currentUrl = rawUrl
      }
    } else {
      state.currentUrl = rawUrl
    }
    
    if (!state.audioEl) {
      state.audioEl = new Audio()
      state.audioEl.volume = state.volume
      state.audioEl.addEventListener('timeupdate', onTimeUpdate)
      state.audioEl.addEventListener('ended', onSongEnded)
      state.audioEl.addEventListener('loadedmetadata', onLoadedMetadata)
      state.audioEl.addEventListener('error', onAudioError)
    }
    
    state.audioEl.src = state.currentUrl
    state.audioEl.play()
    state.playing = true
    
    // 获取歌词
    try {
      state.lyrics = await api.musicGetLyrics(song.platform, song.id)
    } catch (e) {
      state.lyrics = ''
    }
    
    // 提取背景色
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

function addToHistoryFn(song) {
  const existing = state.history.find(h => h.id === song.id && h.platform === song.platform)
  if (existing) {
    state.history.splice(state.history.indexOf(existing), 1)
  }
  state.history.unshift({
    ...song,
    playedAt: Date.now()
  })
  if (state.history.length > 50) state.history.pop()
  saveHistory()
}

function togglePlay() {
  if (!state.audioEl) return
  if (state.playing) {
    state.audioEl.pause()
  } else {
    state.audioEl.play()
  }
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
  toast(t('music.playErrorToast'), 'error')
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
  
  try {
    let downloadDir = await api.musicGetDownloadDir()
    
    if (!downloadDir) {
      downloadDir = null
    }
    
    const result = await api.musicDownloadSong(
      state.currentSong.platform,
      state.currentSong.id,
      state.currentSong.name,
      state.currentSong.artist
    )
    
    toast(t('music.downloadDone', { path: result }))
  } catch (e) {
    toast(t('music.downloadFailed', { error: e?.message || e }), 'error')
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
    if (m) {
      return {
        time: parseInt(m[1]) * 60 + parseFloat(m[2]),
        text: m[3].trim()
      }
    }
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
    <div class="qishui-container" style="--bg-color:${state.bgColor}">
      ${renderHeader()}
      ${renderMainContent()}
      ${renderMiniPlayer()}
    </div>
  `
  
  bindEvents()
  
  if (state.currentSong?.cover) {
    setBackground(state.currentSong.cover)
  }
}

function renderHeader() {
  return `
    <div class="qishui-header">
      <div class="qishui-tabs">
        <button class="qishui-tab ${state.activeTab === 'discover' ? 'active' : ''}" data-tab="discover">
          ${t('music.tabDiscover')}
        </button>
        <button class="qishui-tab ${state.activeTab === 'my' ? 'active' : ''}" data-tab="my">
          ${t('music.tabMy')}
        </button>
      </div>
      ${state.activeTab !== 'player' ? `
        <button class="qishui-player-btn" data-tab="player">
          <div class="qishui-player-cover-small">
            ${state.currentSong?.cover 
              ? `<img src="${esc(state.currentSong.cover)}" alt="">` 
              : '<div class="qishui-cover-placeholder">🎵</div>'}
          </div>
        </button>
      ` : ''}
    </div>
  `
}

function renderMainContent() {
  if (state.activeTab === 'player') {
    return renderPlayerPage()
  }
  
  return `
    <div class="qishui-content">
      ${state.activeTab === 'discover' ? renderDiscover() : renderMyPage()}
    </div>
  `
}

function renderDiscover() {
  return `
    <div class="qishui-search">
      <input type="text" class="qishui-search-input" 
             placeholder="${t('music.searchPlaceholder')}" 
             value="${esc(state.query)}"
             id="qishui-search-input">
      <button class="qishui-search-btn" id="qishui-search-btn">🔍</button>
    </div>
    
    ${!state.query ? renderRecommendations() : renderSearchResults()}
  `
}

function renderRecommendations() {
  const recs = [
    { name: '孤勇者', artist: '陈奕迅', platform: 'netease', id: '1901371647' },
    { name: '起风了', artist: '买辣椒也用券', platform: 'netease', id: '1842022081' },
    { name: '漠河舞厅', artist: '柳爽', platform: 'netease', id: '1498195650' },
    { name: '稻香', artist: '周杰伦', platform: 'netease', id: '18600163' },
    { name: '晴天', artist: '周杰伦', platform: 'netease', id: '18600102' },
  ]
  
  return `
    <div class="qishui-section">
      <div class="qishui-section-title">🔥 ${t('music.recTitle')}</div>
      <div class="qishui-rec-grid">
        ${recs.map((s, i) => `
          <div class="qishui-rec-card" data-rec-index="${i}">
            <div class="qishui-rec-cover">🎵</div>
            <div class="qishui-rec-name">${esc(s.name)}</div>
            <div class="qishui-rec-artist">${esc(s.artist)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `
}

function renderSearchResults() {
  if (state.searchLoading) {
    return `<div class="qishui-loading"><div class="qishui-spinner"></div>${t('music.searching')}</div>`
  }
  
  const results = state.searchResults?.all || []
  
  if (results.length === 0) {
    return `<div class="qishui-empty">${t('music.noResults')}</div>`
  }
  
  return `
    <div class="qishui-results">
      ${results.map((s, i) => renderSongCard(s, i)).join('')}
    </div>
  `
}

function renderSongCard(song, idx) {
  const isPlaying = state.currentSong?.id === song.id && state.currentSong?.platform === song.platform
  const isFav = isFavorite(song)
  const p = PLATFORMS[song.platform] || { name: song.platform, color: '#666' }
  
  return `
    <div class="qishui-song-card ${isPlaying ? 'playing' : ''}" data-index="${idx}">
      <div class="qishui-song-cover">
        ${song.cover 
          ? `<img src="${esc(song.cover)}" alt="" loading="lazy">` 
          : `<div class="qishui-cover-placeholder">${p.icon || '🎵'}</div>`}
      </div>
      <div class="qishui-song-info">
        <div class="qishui-song-name">${esc(song.name)}</div>
        <div class="qishui-song-artist">${esc(song.artist)}</div>
        <div class="qishui-song-meta">
          <span class="qishui-platform-tag" style="background:${p.color}">${p.name}</span>
          <span class="qishui-duration">${formatDuration(song.duration)}</span>
        </div>
      </div>
      <div class="qishui-song-actions">
        <button class="qishui-action-btn qishui-play-btn" data-index="${idx}" title="${t('music.togglePlay')}">
          ${isPlaying && state.playing ? '⏸' : '▶'}
        </button>
        <button class="qishui-action-btn qishui-fav-btn ${isFav ? 'active' : ''}" data-index="${idx}" title="${t('music.like')}">
          ${isFav ? '❤️' : '🤍'}
        </button>
      </div>
    </div>
  `
}

function renderMyPage() {
  return `
    <div class="qishui-my">
      <div class="qishui-section">
        <div class="qishui-section-title">❤️ ${t('music.favTitle')}</div>
        ${state.favorites.length === 0 
          ? `<div class="qishui-empty">${t('music.emptyFav')}</div>`
          : `<div class="qishui-results">
              ${state.favorites.slice(0, 20).map((s, i) => renderSongCard(s, i)).join('')}
            </div>`}
      </div>
      
      <div class="qishui-section">
        <div class="qishui-section-title">🕐 ${t('music.historyTitle')}</div>
        ${state.history.length === 0
          ? `<div class="qishui-empty">${t('music.emptyHistory')}</div>`
          : `<div class="qishui-results">
              ${state.history.slice(0, 20).map((s, i) => renderSongCard(s, i)).join('')}
            </div>`}
      </div>
    </div>
  `
}

function renderPlayerPage() {
  if (!state.currentSong) {
    return `<div class="qishui-empty">${t('music.emptyPlayer')}</div>`
  }
  
  const song = state.currentSong
  const p = PLATFORMS[song.platform] || { name: song.platform, color: '#666' }
  const lyricLines = parseLyrics(state.lyrics)
  const currentLyricIndex = lyricLines.findIndex((l, i, arr) => 
    i < arr.length - 1 && state.progress >= l.time && state.progress < arr[i + 1].time
  )
  
  return `
    <div class="qishui-player">
      <button class="qishui-back-btn" data-tab="discover">← ${t('music.backBtn')}</button>
      
      <div class="qishui-player-cover-wrap">
        <div class="qishui-player-cover">
          ${song.cover 
            ? `<img src="${esc(song.cover)}" alt="" id="qishui-cover-img">` 
            : `<div class="qishui-cover-placeholder-lg">🎵</div>`}
        </div>
      </div>
      
      <div class="qishui-player-info">
        <div class="qishui-player-name">${esc(song.name)}</div>
        <div class="qishui-player-artist">${esc(song.artist)} · ${esc(song.album)}</div>
      </div>
      
      ${lyricLines.length > 0 ? `
        <div class="qishui-lyrics" id="qishui-lyrics">
          ${lyricLines.map((l, i) => `
            <div class="qishui-lyric-line ${i === currentLyricIndex ? 'active' : ''}" data-time="${l.time}">
              ${esc(l.text)}
            </div>
          `).join('')}
        </div>
      ` : ''}
      
      <div class="qishui-player-controls">
        <div class="qishui-progress">
          <div class="qishui-progress-bar" id="qishui-progress-bar">
            <div class="qishui-progress-fill" id="qishui-progress-fill"></div>
          </div>
          <div class="qishui-progress-time">
            <span id="qishui-time-current">0:00</span>
            <span>/</span>
            <span id="qishui-time-total">${formatDuration(state.duration)}</span>
          </div>
        </div>
        
        <div class="qishui-controls">
          <button class="qishui-ctrl-btn qishui-mode-btn" id="qishui-mode-btn" title="${t('music.modeOrder')}">
            ${state.playMode === 'order' ? '🔁' : state.playMode === 'loop' ? '🔂' : '🔀'}
          </button>
          <button class="qishui-ctrl-btn" id="qishui-prev-btn" title="${t('music.prevTrack')}">⏮</button>
          <button class="qishui-ctrl-btn qishui-play-btn-lg" id="qishui-toggle-btn">
            ${state.playing ? '⏸' : '▶'}
          </button>
          <button class="qishui-ctrl-btn" id="qishui-next-btn" title="${t('music.nextTrack')}">⏭</button>
          <button class="qishui-ctrl-btn" id="qishui-fav-btn-lg" title="喜欢">
            ${isFavorite(song) ? '❤️' : '🤍'}
          </button>
        </div>
        
        <div class="qishui-actions">
          <button class="qishui-action-btn-lg" id="qishui-download-btn" title="${t('music.download')}">⬇ ${t('music.download')}</button>
          <button class="qishui-action-btn-lg" id="qishui-queue-btn" title="${t('music.queue')}">📜</button>
        </div>
      </div>
    </div>
  `
}

function renderMiniPlayer() {
  if (!state.currentSong || state.activeTab === 'player') return ''
  
  const song = state.currentSong
  
  return `
    <div class="qishui-mini-player" data-tab="player">
      <div class="qishui-mini-cover">
        ${song.cover 
          ? `<img src="${esc(song.cover)}" alt="">` 
          : '<div class="qishui-cover-placeholder-sm">🎵</div>'}
      </div>
      <div class="qishui-mini-info">
        <div class="qishui-mini-name">${esc(song.name)}</div>
        <div class="qishui-mini-artist">${esc(song.artist)}</div>
      </div>
      <div class="qishui-mini-controls">
        <button class="qishui-ctrl-btn" id="qishui-mini-toggle">${state.playing ? '⏸' : '▶'}</button>
        <button class="qishui-ctrl-btn" id="qishui-mini-next">⏭</button>
      </div>
      <div class="qishui-mini-progress">
        <div class="qishui-progress-fill" id="qishui-mini-progress-fill"></div>
      </div>
    </div>
  `
}

function setBackground(coverUrl) {
  const scope = _rootEl || document
  const container = scope.querySelector('.qishui-container')
  if (!container || !coverUrl) return
  
  let bg = scope.querySelector('.qishui-bg')
  if (!bg) {
    bg = document.createElement('div')
    bg.className = 'qishui-bg'
    container.insertBefore(bg, container.firstChild)
  }
  bg.style.backgroundImage = `url(${coverUrl})`
}

function updateProgressUI() {
  const scope = _rootEl || document
  const fill = scope.querySelector('#qishui-progress-fill')
  const miniFill = scope.querySelector('#qishui-mini-progress-fill')
  const cur = scope.querySelector('#qishui-time-current')
  const total = scope.querySelector('#qishui-time-total')
  
  const pct = state.duration > 0 ? (state.progress / state.duration) * 100 : 0
  
  if (fill) fill.style.width = pct + '%'
  if (miniFill) miniFill.style.width = pct + '%'
  if (cur) cur.textContent = formatDuration(state.progress * 1000)
  if (total) total.textContent = formatDuration(state.duration * 1000)
  
  const lyricLines = scope.querySelectorAll('.qishui-lyric-line')
  if (lyricLines.length > 0) {
    const lrc = parseLyrics(state.lyrics)
    let activeIdx = -1
    for (let i = 0; i < lrc.length; i++) {
      if (state.progress >= lrc[i].time) {
        activeIdx = i
      } else {
        break
      }
    }
    lyricLines.forEach((line, i) => {
      line.classList.toggle('active', i === activeIdx)
    })
  }
}

function bindEvents() {
  const scope = _rootEl || document
  
  // Tab 切换
  scope.querySelectorAll('.qishui-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeTab = btn.dataset.tab
      renderPage()
    })
  })
  
  // 播放页按钮
  scope.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab) {
        state.activeTab = btn.dataset.tab
        renderPage()
      }
    })
  })
  
  // 搜索
  const searchInput = scope.querySelector('#qishui-search-input')
  const searchBtn = scope.querySelector('#qishui-search-btn')
  
  searchInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      state.query = searchInput.value
      doSearch()
    }
  })
  
  searchBtn?.addEventListener('click', () => {
    state.query = searchInput?.value || ''
    doSearch()
  })
  
  // 播放/暂停按钮
  const toggleBtn = scope.querySelector('#qishui-toggle-btn')
  toggleBtn?.addEventListener('click', togglePlay)
  
  const miniToggle = scope.querySelector('#qishui-mini-toggle')
  miniToggle?.addEventListener('click', togglePlay)
  
  // 上一首/下一首
  scope.querySelector('#qishui-prev-btn')?.addEventListener('click', playPrev)
  scope.querySelector('#qishui-next-btn')?.addEventListener('click', playNext)
  scope.querySelector('#qishui-mini-next')?.addEventListener('click', playNext)
  
  // 播放模式
  scope.querySelector('#qishui-mode-btn')?.addEventListener('click', () => {
    const modes = ['order', 'loop', 'random']
    const idx = modes.indexOf(state.playMode)
    state.playMode = modes[(idx + 1) % modes.length]
    renderPage()
  })
  
  // 喜欢按钮
  scope.querySelector('#qishui-fav-btn-lg')?.addEventListener('click', () => {
    if (state.currentSong) toggleFavorite(state.currentSong)
  })
  
  // 下载
  scope.querySelector('#qishui-download-btn')?.addEventListener('click', downloadSong)
  
  // 歌曲卡片点击
  scope.querySelectorAll('.qishui-play-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      const idx = parseInt(btn.dataset.index)
      const results = state.searchResults?.all || state.favorites || state.history
      if (results[idx]) {
        state.queue = results.slice(idx, idx + 1).concat(results.slice(0, idx))
        state.queueIndex = 0
        playSong(results[idx])
      }
    })
  })
  
  // 喜欢卡片按钮
  scope.querySelectorAll('.qishui-fav-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      const idx = parseInt(btn.dataset.index)
      const results = state.searchResults?.all || state.favorites || state.history
      if (results[idx]) {
        toggleFavorite(results[idx])
      }
    })
  })
  
  // 推荐卡片点击
  scope.querySelectorAll('.qishui-rec-card').forEach(card => {
    card.addEventListener('click', async () => {
      const recs = [
        { name: '孤勇者', artist: '陈奕迅', platform: 'netease', id: '1901371647' },
        { name: '起风了', artist: '买辣椒也用券', platform: 'netease', id: '1842022081' },
        { name: '漠河舞厅', artist: '柳爽', platform: 'netease', id: '1498195650' },
        { name: '稻香', artist: '周杰伦', platform: 'netease', id: '18600163' },
        { name: '晴天', artist: '周杰伦', platform: 'netease', id: '18600102' },
      ]
      const idx = parseInt(card.dataset.recIndex)
      if (recs[idx]) {
        try {
          const results = await api.musicSearchAll(recs[idx].name)
          const all = []
          results.forEach(p => {
            if (p.success) all.push(...p.songs)
          })
          const song = all.find(s => s.name === recs[idx].name) || all[0]
          if (song) {
            state.queue = [song]
            state.queueIndex = 0
            playSong(song)
          }
        } catch (e) {
          console.error('Error:', e)
        }
      }
    })
  })
  
  // 进度条点击
  const progressBar = scope.querySelector('#qishui-progress-bar')
  progressBar?.addEventListener('click', e => {
    if (!state.audioEl || !state.duration) return
    const rect = progressBar.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    state.audioEl.currentTime = pct * state.duration
  })
  
  // 键盘快捷键
  (_rootEl || document).addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return
    
    switch (e.code) {
      case 'Space':
        e.preventDefault()
        togglePlay()
        break
      case 'ArrowLeft':
        if (state.audioEl) state.audioEl.currentTime = Math.max(0, state.audioEl.currentTime - 5)
        break
      case 'ArrowRight':
        if (state.audioEl) state.audioEl.currentTime = Math.min(state.duration, state.audioEl.currentTime + 5)
        break
    }
  })
}

// ===== export =====
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
  
  renderPage()
  
  return el
}
