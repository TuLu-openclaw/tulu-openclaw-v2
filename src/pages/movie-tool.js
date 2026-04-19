/**
 * 屠戮影视 - 影视点播 + 电视直播
 * VOD: 多源聚合（暴风/量子/天涯/星之尘/1080）
 * TV: 多源直播（zdir/聚看/小聚合等M3U源）
 * 基于 TVAPP (youhunwl/TVAPP) 影视仓框架分析
 * 2026-04-13 v8
 */

import '../style/movie-tool.css'


// ── HTML 转义（防止 XSS）───────────────────────────────
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const VOD_SOURCES = [
  { key: 'bfzy',   name: '🌺暴风资源', api: 'https://bfzyapi.com/api.php/provide/vod',       type: 'tvbox' },
  { key: 'lziapi', name: '🌺量子资源', api: 'https://cj.lziapi.com/api.php/provide/vod',    type: 'tvbox' },
  { key: 'xsd',    name: '🌺星之尘',  api: 'https://xsd.sdzyapi.com/api.php/provide/vod',   type: 'tvbox' },
  { key: 'zyku',   name: '🌺1080资源', api: 'https://api.1080zyku.com/inc/api_mac10.php',   type: '1080' },
  { key: 'tyys',   name: '🌺天涯资源', api: 'https://tyyszy.com/api.php/provide/vod',      type: 'tvbox' },
]

const TV_SOURCES = [
  { key: 'zdir',  name: '📺zdir聚合',  api: 'http://zdir.kebedd69.repl.co/public/live.txt' },
  { key: 'jukan', name: '📺聚看影视',   api: 'http://home.jundie.top:81/Cat/tv/live.txt' },
  { key: 'xh',    name: '📺小聚合',     api: 'http://jiexi.bulisite.top/m3u.php' },
  { key: 'ftyy',  name: '📺Ftyyy',     api: 'http://ftyyy.tk/live.txt' },
  { key: 'rihou', name: '📺rihou',     api: 'http://rihou.cc:555/gggg.nzk' },
]

// ── TVBox JSON API（通过 cdn.statically.io 代理 GitHub）────────────────────────
// ── TVBox CDN 多镜像（statically.io 挂了时自动回退）──────────
function tvboxMirrors(url) {
  if (!url || !url.includes('cdn.statically.io')) return [url];
  const parts = url.split('gh/');
  const path = parts[1] || '';
  return [
    url,
    'https://ghproxy.com/https://raw.githubusercontent.com/' + path,
    'https://mirror.ghproxy.com/https://raw.githubusercontent.com/' + path,
  ].filter(Boolean);
}

const TVBOX_BUILTIN = [
  { key: 'fongmi',    name: '🌺FongMi',    url: 'https://cdn.statically.io/gh/FongMi/CatVodSpider/main/json/b.json',        note: '推荐' },
  { key: 'hjd',       name: '🌺HJD TVBox', url: 'https://cdn.statically.io/gh/hjdhnx/Dr_TVBox/main/json/api.json',          note: '' },
  { key: 'cattorn',   name: '🌺Cat TVBox', url: 'https://cdn.statically.io/gh/CatTornado/TVBox/main/json/api.json',          note: '' },
  { key: 'sunpolar',  name: '🌺SunPolar',  url: 'https://cdn.statically.io/gh/SunPolar/TVBox/main/json/api.json',            note: '' },
  { key: 'imdgo',     name: '🌺imDgo',    url: 'https://cdn.statically.io/gh/imDgo/TVBox/main/json/api.json',              note: '' },
  { key: 'q215',      name: '🌺q215 TVBox',url: 'https://cdn.statically.io/gh/q215813905/TVBox/main/json/api.json',         note: '' },
  { key: '173799616', name: '🌺173仓',     url: 'https://cdn.statically.io/gh/173799616/TVBox/master/json/api.json',        note: '' },
  { key: '7wf',       name: '🌺7尿壶',     url: 'https://cdn.statically.io/gh/7尿壶/TVBox/main/json/apijson.json',         note: '' },
  { key: 'yyfxz',     name: '🌺业余打发',  url: 'https://cdn.statically.io/gh/yyfxz/qqtv/main/qq.json',                  note: '' },
]
const KEY_CUSTOM_TVBOX = 'tulu_custom_tvbox'
const KEY_ACTIVE_TVBOX = 'tulu_active_tvbox'
let _tvboxCache = {}
let _customTvbox = []

function getCustomTvbox() {
  try { return JSON.parse(localStorage.getItem(KEY_CUSTOM_TVBOX) || '[]') } catch { return [] }
}
function saveCustomTvbox(a) { try { localStorage.setItem(KEY_CUSTOM_TVBOX, JSON.stringify(a)) } catch {} }
function getActiveTvboxKey() { try { return localStorage.getItem(KEY_ACTIVE_TVBOX) || '' } catch { return '' } }
function setActiveTvboxKey(k) { try { localStorage.setItem(KEY_ACTIVE_TVBOX, k) } catch {} }

// 加载 TVBox API 配置（同时支持 JSON 和 XML，自动检测格式）
async function loadTvboxConfig(api) {
  if (_tvboxCache[api.key]) return _tvboxCache[api.key]
  try {
    const resp = await fetch(api.url, { signal: AbortSignal.timeout(20000) })
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    const text = await resp.text()
    let config
    try { config = JSON.parse(text) }
    catch { config = parseXml(text) }  // XML 格式兜底
    // 检测是否有效（必须有 list 数组或 total > 0）
    if (!config || (!(Array.isArray(config.list) ? config.list.length : config.list?.length) && !config.total)) {
      console.warn('[movie-tool] TVBox config invalid or empty:', api.name, config)
      return null
    }
    _tvboxCache[api.key] = config
    return config
  } catch (e) { console.warn('[movie-tool] TVBox load failed:', api.name, e.message); return null }
}

// ── 解析 CMS 扁平格式（量子/暴风等 CMS API）───────────────────────────────
// CMS API: config.list 是视频数组，不是分类数组
function parseCMSList(config) {
  const result = []
  for (const v of (config?.list || [])) {
    const dl = parseTvboxDl(v)
    result.push({
      vod_id:       v.vod_id || v.id || v.player_id || '',
      vod_name:     v.vod_name || v.name || v.title || '',
      vod_pic:      v.vod_pic || v.pic || v.thumb || '',
      type_name:    v.type_name || '',
      vod_actor:    v.vod_actor || v.actor || '',
      vod_director: v.vod_director || v.director || '',
      vod_blurb:    v.vod_content || v.content || v.des || '',
      vod_year:     v.vod_year || v.year || '',
      vod_area:     v.vod_area || v.area || '',
      _dl:          dl,
      _cat:         v.type_name || '',
    })
  }
  return result
}

// ── 解析 TVBox 嵌套分类格式 ─────────────────────────────────────────────────
function parseTvboxList(config) {
  const result = []
  for (const cat of (config?.list || [])) {
    const catName = cat.name || '未分类'
    for (const v of (cat.list || [])) {
      const dl = parseTvboxDl(v)
      result.push({
        vod_id:     v.id || v.vod_id || v.player_id || '',
        vod_name:   v.name || v.title || v.vod_name || '',
        vod_pic:    v.pic || v.thumb || v.vod_pic || '',
        type_name:  catName,
        vod_actor:  v.actor || v.vod_actor || '',
        vod_director: v.director || v.vod_director || '',
        vod_blurb:  v.des || v.content || v.vod_content || v.vod_blurb || '',
        vod_year:   v.year || v.vod_year || '',
        vod_area:   v.area || v.vod_area || '',
        _dl:        dl,
        _cat:       catName,
      })
    }
  }
  return result
}

// ── 统一解析入口（自动检测格式）──────────────────────────────────────────────
function parseVideoList(config) {
  if (!config) return []
  const first = config.list?.[0]
  // TVBox 嵌套格式：第一个分类对象的 list 属性是数组
  if (first && Array.isArray(first.list)) return parseTvboxList(config)
  // CMS 扁平格式（量子/暴风等）：直接是视频数组
  return parseCMSList(config)
}

function parseTvboxDl(v) {
  const playFrom = v.vod_play_from || v.play_from || ''
  const playUrl  = v.vod_play_url  || v.play_url  || ''
  if (!playUrl) return []
  const flags   = playFrom.split('$$$')
  const urlGrps = playUrl.split('$$$')
  const result  = []
  flags.forEach((flag, fi) => {
    const urls = (urlGrps[fi] || urlGrps[0] || '').split('#').filter(Boolean)
    if (urls.length) result.push({
      flag: flag.trim() || '默认',
      urls: urls.map(u => { const [n, url] = u.split('$'); return (n || '') + '$' + url })
    })
  })
  return result
}

// TVBox 列表搜索
function searchTvboxList(config, kw) {
  const q = kw.toLowerCase()
  return parseVideoList(config).filter(v =>
    v.vod_name.toLowerCase().includes(q) ||
    (v.vod_actor && v.vod_actor.toLowerCase().includes(q))
  )
}

// ── 获取当前活跃 TVBox 源（内置优先，自定义次之）
function getActiveTvbox() {
  const key = getActiveTvboxKey()
  return TVBOX_BUILTIN.find(a => a.key === key) || _customTvbox.find(a => a.key === key) || null
}

function getTvboxSourceName(api) {
  const b = TVBOX_BUILTIN.find(a => a.key === api.key)
  return b ? b.name : (api.name || '自定义')
}

// 初始化自定义 TVBox 列表
_customTvbox = getCustomTvbox()

// 每个 VOD 源的分类映射（CMS type_id 体系各异，必须按源区分）
// key: source key, value: { movie, tv, variety, anime, short } 对应的 type_id
const VOD_TYPE_MAP = {
  bfzy:   { movie: 20, tv: 30, variety: 45, anime: 39, short: 58 },  // 暴风资源
  lziapi: { movie: 1,  tv: 2,  variety: 3,  anime: 4,  short: 6  },  // 量子资源
  xsd:    { movie: 1,  tv: 2,  variety: 3,  anime: 4,  short: 0  },  // 星之尘
  zyku:   { movie: 1,  tv: 2,  variety: 3,  anime: 4,  short: 0  },  // 1080资源
  tyys:   { movie: 1,  tv: 2,  variety: 3,  anime: 4,  short: 0  },  // 天涯资源
}

const VOD_CATEGORIES = [
  { id: 'movie',   name: '电影' },
  { id: 'tv',      name: '电视剧' },
  { id: 'variety', name: '综艺' },
  { id: 'anime',   name: '动漫' },
  { id: 'short',   name: '短剧' },
]

const HLS_CDN = './hls.min.js'
const KEY_SEARCH = 'tulu_vod_search'
const KEY_PLAY   = 'tulu_vod_play'

let cat = 'movie'
let src = 0
let tvSrc = 0
let page = 1
let query = ''
let tvCache = {}
let playingEp = null
let _el = null
let _viewStack = []
let _tvboxMode = false  // true = TVBox JSON 模式

// ── 历史记录 ──
function getSearchHistory() {
  try { return JSON.parse(localStorage.getItem(KEY_SEARCH) || '[]') } catch { return [] }
}
function saveSearchHistory(list) { try { localStorage.setItem(KEY_SEARCH, JSON.stringify(list)) } catch {} }
function addSearchHistory(q) {
  if (!q) return
  let h = getSearchHistory().filter(s => s !== q)
  h.unshift(q)
  saveSearchHistory(h.slice(0, 20))
}
function clearSearchHistory() { saveSearchHistory([]) }

function getPlayHistory() {
  try { return JSON.parse(localStorage.getItem(KEY_PLAY) || '[]') } catch { return [] }
}
function savePlayHistory(list) { try { localStorage.setItem(KEY_PLAY, JSON.stringify(list)) } catch {} }
function upsertPlayHistory(item) {
  let h = getPlayHistory().filter(s => !(s.id === item.id && s.source === item.source))
  h.unshift({ ...item, updatedAt: Date.now() })
  savePlayHistory(h.slice(0, 30))
}
function updatePlayProgress(id, source, progress) {
  let h = getPlayHistory()
  let idx = h.findIndex(s => s.id === id && s.source === source)
  if (idx >= 0) { h[idx].progress = progress; h[idx].updatedAt = Date.now() }
  savePlayHistory(h)
}
function clearPlayHistory() { savePlayHistory([]) }

// ── 网络请求 ──
// ── XML 解析（CMS 格式影视接口）─────────────────────────────
function parseXml(raw) {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(raw, 'text/xml')
    const list = []
    // 同时支持 <item>（RSS格式）和 <video>（量子CMS格式）
    for (const item of doc.querySelectorAll('item, video')) {
      const vod = {}
      for (const child of item.children) vod[child.nodeName] = child.textContent
      if (Object.keys(vod).length) list.push(vod)
    }
    return { list, total: list.length }
  } catch { return { list: [], total: 0 } }
}

// ── 网络请求（优先 Rust 后端代理，绕过 WebView CORS 限制） ──

// 尝试通过 Tauri Rust 后端请求（vod_fetch 命令）
async function vodApiFetch(url) {
  try {
    // 优先使用 Rust 后端（绕过 CORS）
    try {
      const { invoke } = await import('@tauri-apps/api/core').catch(() => ({}))
      if (invoke) {
        const text = await invoke('vod_fetch', { url }).catch(() => null)
        if (text && text.trim()) return JSON.parse(text)
      }
    } catch { /* 降级到浏览器 */ }
    // 降级：直接 fetch（桌面端 WebView 可能不过滤 CORS）
    const resp = await fetch(url, {
      signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined,
      credentials: 'include'
    })
    if (resp.ok) {
      const txt = await resp.text()
      try { return JSON.parse(txt) } catch { return null }
    }
    return { list: [], total: 0 }
  } catch { return { list: [], total: 0 } }
}

// 普通请求（非 JSON）
async function webFetch(url) {
  const resp = await fetch(url, {
    signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined,
    credentials: 'include',
    headers: { 'Referer': 'https://claw.qt.cool/' }
  })
  if (!resp.ok) throw new Error('HTTP ' + resp.status)
  return resp.text()
}

// 通用 JSON 获取（自动降级）
async function fetchJSON(url) {
  let json = await vodApiFetch(url)
  if (json) return json
  // Rust 后端失败，降级到浏览器 fetch
  let text
  try { text = await webFetch(url) } catch { return { list: [], total: 0 } }
  try { return JSON.parse(text) } catch { try { return parseXml(text) } catch { return { list: [], total: 0 } } }
}

// ── NZK 解析 ──
function parseNzk(raw) {
  const lines = raw.split('\n').map(l => l.replace(/\r$/, '').trim()).filter(l => l)
  const categories = []
  let currentCat = null
  for (const line of lines) {
    if (line.includes('#genre#')) {
      currentCat = { name: line.replace('#genre#', '').trim(), channels: [] }
      categories.push(currentCat)
    } else if (line.includes(',') && currentCat) {
      const idx = line.indexOf(',')
      const chName = line.slice(0, idx).trim()
      const chUrl = line.slice(idx + 1).trim()
      if (chName && chUrl && (chUrl.startsWith('http') || chUrl.startsWith('//'))) {
        currentCat.channels.push({ name: chName, url: chUrl.startsWith('//') ? 'https:' + chUrl : chUrl })
      }
    }
  }
  return categories
}

// ── M3U 转 NZK（TVAPP convertM3uToNormal 算法）──────────────────────────────
function convertM3uToNormal(m3u) {
  try {
    const lines = m3u.split('\n'), parts = []
    let currentGroup = '', TV = ''
    for (const line of lines) {
      if (line.startsWith('#EXTINF:')) {
        const g = line.split('"')[1]?.trim() || '未分类'
        TV = line.split('"')[2]?.substring(1) || ''
        if (currentGroup !== g) { currentGroup = g; parts.push('\n' + currentGroup + ',#genre#\n') }
      } else if (line.startsWith('http')) {
        parts.push(TV + '\,' + line.split(',')[0] + '\n')
      }
    }
    return parts.join('').trim()
  } catch (e) { return m3u }
}

// ── 自动检测格式加载 TV 源 ──────────────────────────────────────────────────
async function loadTvSource(idx) {
  if (tvCache[idx]) return tvCache[idx]
  try {
    const text = await fetch(TV_SOURCES[idx].api, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.text())
    const isM3u = text.includes('#EXTM3U') || text.includes('group-title')
    tvCache[idx] = isM3u ? parseNzk(convertM3uToNormal(text)) : parseNzk(text)
  } catch (e) { tvCache[idx] = [] }
  return tvCache[idx]
}

/**
 * 渲染入口 — 接收路由容器，将自身挂载到容器内
 * 不再直接 appendChild(document.body)，避免被路由的 innerHTML='' 清除
 */
export default function render(container) {
  // 如果传入了容器（路由环境），渲染到容器内；否则降级到 body
  const root = container || document.body
  const el = document.createElement('div')
  el.className = 'tvbox-root'
  _el = el
  _viewStack = []
  root.appendChild(el)
  initApp(el)
  return el
}

function initApp(el) {
  el.innerHTML = `
    <nav class="tvbox-navbar">
      <div class="tvbox-brand">
        <div class="tvbox-brand-icon">🎬</div>
        <div>
          <div class="tvbox-brand-name">屠戮影视</div>
        </div>
      </div>

      <div class="tvbox-search-wrap">
        <div class="tvbox-search-box">
          <span class="tvbox-search-icon">🔍</span>
          <input class="tvbox-search-input" type="text" id="t-search" placeholder="搜索电影、剧集、综艺、动漫..." autocomplete="off" />
          <button class="tvbox-search-btn" id="t-search-btn">搜索</button>
        </div>
      </div>

      <div class="tvbox-mode-tabs">
        <button class="tvbox-mode-tab active" data-mode="vod">📺 影视点播</button>
        <button class="tvbox-mode-tab" data-mode="live">📡 电视直播</button>
        <button class="tvbox-mode-tab" data-mode="tvboxjson">🔗 TVBox JSON</button>
        <button class="tvbox-mode-tab" data-mode="crawl">🌐 网站爬虫</button>
      </div>
    </nav>

    <div class="tvbox-catbar" id="t-catbar">
      <span class="tvbox-catbar-label">分类</span>
    </div>

    <div class="tvbox-srcbar" id="t-srcbar">
      <span class="tvbox-srcbar-label">源</span>
    </div>

    <div class="tvbox-content" id="t-content">
      <div class="tvbox-loading">
        <div class="tvbox-loading-icon"></div>
        <span class="tvbox-loading-text">加载中...</span>
      </div>
    </div>

    <div id="t-history-panel" style="display:none; position:fixed; top:120px; left:50%; transform:translateX(-50%); width:460px; max-width:90vw; background:var(--bg-elevated); border:1px solid var(--border); border-radius:12px; z-index:100; padding:12px 14px; box-shadow:0 16px 48px rgba(0,0,0,.7)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:12px;font-weight:600;color:var(--text-secondary)">搜索历史</span>
        <button id="t-clear-history" style="background:none;border:none;color:var(--text-muted);font-size:11px;cursor:pointer;padding:2px 6px;border-radius:4px;border:1px solid var(--border)">清除</button>
      </div>
      <div id="t-history-tags" style="display:flex;flex-wrap:wrap;gap:7px"></div>
    </div>

    <div class="tvbox-player-overlay" id="t-player-overlay" style="display:none">
      <div class="tvbox-player-box">
        <div class="tvbox-player-hdr">
          <span class="tvbox-player-title" id="t-player-title">播放中</span>
          <button class="tvbox-player-close" id="t-player-close">✕</button>
        </div>
        <div class="tvbox-player-body" id="t-player-body">
          <div class="tvbox-player-loading">正在加载播放器...</div>
        </div>
        <div class="tvbox-player-foot">
          <a href="#" class="tvbox-open-ext" id="t-ext-link" target="_blank" rel="noopener">↗ 外部打开</a>
        </div>
      </div>
    </div>
  `

  const searchInput = el.querySelector('#t-search')
  const searchBtn   = el.querySelector('#t-search-btn')

  searchBtn.addEventListener('click', () => doSearch(searchInput.value))
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(searchInput.value) })
  searchInput.addEventListener('focus', () => showSearchHistory())
  searchInput.addEventListener('blur', () => setTimeout(() => el.querySelector('#t-history-panel').style.display = 'none', 200))
  el.querySelector('#t-clear-history').addEventListener('click', e => { e.stopPropagation(); clearSearchHistory(); renderSearchHistory() })
  el.querySelector('#t-player-close').addEventListener('click', closePlayer)
  el.querySelector('#t-player-overlay').addEventListener('click', e => { if (e.target === el.querySelector('#t-player-overlay')) closePlayer() })

  // 模式切换（vod / live / tvboxjson）
  let mode = 'vod'
  el.querySelectorAll('.tvbox-mode-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const newMode = btn.dataset.mode
      if (newMode === mode) return
      mode = newMode
      el.querySelectorAll('.tvbox-mode-tab').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      page = 1; query = ''; searchInput.value = ''; hideHistory(); _viewStack = []
      if (mode === 'live') {
        el.querySelector('#t-catbar').innerHTML = '<span class="tvbox-catbar-label">分类</span><button class="tvbox-cat-chip active">全部频道</button>'
        el.querySelector('#t-catbar').querySelector('.tvbox-cat-chip').addEventListener('click', () => {})
        renderSrcBar()
      } else if (mode === 'tvboxjson') {
        el.querySelector('#t-catbar').innerHTML = '<span class="tvbox-catbar-label">分类</span><button class="tvbox-cat-chip active">全部</button>'
        renderTvboxSrcTabs()
      } else if (mode === 'crawl') {
        el.querySelector('#t-catbar').innerHTML = '<span class="tvbox-catbar-label">网站爬虫</span>'
        el.querySelector('#t-srcbar').innerHTML = ''
        showCrawlInput()
      } else {
        renderCatBar()
        renderSrcBar()
      }
      if (mode === 'live') loadLive()
      else if (mode === 'tvboxjson') loadTvboxList()
      else if (mode === 'crawl') { /* 等待用户输入 */ }
      else if (getPlayHistory().length > 0 && !query) showPlayHistory()
      else loadData()
    })
  })

  // API 管理按钮
  el.querySelector('#t-api-manage')?.addEventListener('click', showApiManage)

  // 链接输入按钮
  el.querySelector('#t-url-input')?.addEventListener('click', showUrlInput)

  renderCatBar(); renderSrcBar()
  if (getPlayHistory().length > 0 && !query) showPlayHistory()
  else loadData()

  function doSearch(q) {
    query = q.trim()
    if (!query) return
    addSearchHistory(query)
    page = 1
    hideHistory()
    _viewStack = []
    loadData()
  }

  function showSearchHistory() {
    const h = getSearchHistory()
    const wrap = el.querySelector('#t-history')
    if (!h.length) { wrap.style.display = 'none'; return }
    wrap.style.display = 'block'
    renderSearchHistory()
  }

  function renderSearchHistory() {
    const tags = el.querySelector('#t-history-tags')
    tags.innerHTML = getSearchHistory().map(s =>
      '<span class="tvbox-history-tag" data-q="' + s + '">' + s + '</span>'
    ).join('')
    tags.querySelectorAll('.tvbox-history-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        searchInput.value = tag.dataset.q
        doSearch(tag.dataset.q)
      })
    })
  }

  function hideHistory() { el.querySelector('#t-history-panel').style.display = 'none' }

  function showPlayHistory() {
    const h = getPlayHistory().slice(0, 12)
    const content = el.querySelector('#t-content')
    if (!h.length) { loadData(); return }

    let html = '<div class="tvbox-section-title"><span>📜</span>最近播放 <button class="tvbox-clear-btn" id="t-clear-play" style="margin-left:auto">清除全部</button></div>'
    html += '<div style="display:flex;gap:10px;overflow-x:auto;padding:8px 0 16px;scrollbar-width:none"><style>.tvbox-hist-card{flex-shrink:0;width:100px;cursor:pointer}.tvbox-hist-card:hover .tvbox-card-inner{transform:translateY(-2px);border-color:var(--border-hover)}.tvbox-hist-pic{position:relative;aspect-ratio:2/3;background:var(--bg-elevated);border-radius:var(--radius-md);overflow:hidden;border:1px solid var(--border);margin-bottom:6px}.tvbox-hist-pic img{width:100%;height:100%;object-fit:cover;display:block}.tvbox-hist-name{font-size:11px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;padding:0 2px}.tvbox-hist-ep{font-size:10px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;padding:0 2px}</style>'
    h.forEach(item => {
      const pct = item.duration > 0 ? Math.round((item.progress / item.duration) * 100) : 0
      const resumeLabel = pct > 95 ? '已看完' : pct > 2 ? '续 ' + pct + '%' : ''
      html += '<div class="tvbox-hist-card" data-id="' + item.id + '" data-source="' + item.source + '" data-name="' + item.name + '" data-pic="' + item.pic + '" data-epname="' + (item.epName || '') + '" data-epurl="' + (item.epUrl || '') + '" data-progress="' + item.progress + '" data-duration="' + (item.duration || 0) + '">' +
        '<div class="tvbox-hist-pic">' +
          '<img src="' + escHtml(item.pic) + '" alt="' + escHtml(item.name) + '" onerror="this.style.display=\'none\';this.parentElement.innerHTML=\'<span style=display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:24px>🎬</span>\'" />' +
          (resumeLabel ? '<span style="position:absolute;top:5px;right:5px;background:rgba(16,185,129,.9);color:#fff;font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px">' + resumeLabel + '</span>' : '') +
          '<div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:rgba(255,255,255,.1)"><div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,var(--accent),#ec4899)"></div></div>' +
        '</div>' +
        '<div class="tvbox-hist-name">' + item.name + '</div>' +
        '<div class="tvbox-hist-ep">' + (item.epName || '') + '</div>' +
      '</div>'
    })
    html += '</div>'
    html += '<div class="tvbox-divider"></div>'
    html += '<div class="tvbox-section-header"><div class="tvbox-section-heading"><div class="tvbox-section-heading-dot"></div>影视列表</div></div>'
    content.innerHTML = html + '<div id="t-main-grid"></div><div id="t-pagination"></div>'

    content.querySelector('#t-clear-play')?.addEventListener('click', e => { e.stopPropagation(); clearPlayHistory(); loadData() })
    content.querySelectorAll('.tvbox-hist-card').forEach(card => {
      card.addEventListener('click', () => {
        const d = card.dataset
        const pct = d.duration > 0 ? Math.round((parseFloat(d.progress) / parseFloat(d.duration)) * 100) : 0
        openResumePlayer(d.name, d.pic, d.id, d.epname, d.epurl, pct > 2 ? parseFloat(d.progress) : 0)
      })
    })
    loadList()
  }

  function openResumePlayer(name, pic, id, epName, epUrl, progress) {
    const overlay = el.querySelector('#t-player-overlay')
    const body = el.querySelector('#t-player-body')
    el.querySelector('#t-player-title').textContent = name + (epName ? ' ' + epName : '')
    el.querySelector('#t-ext-link').href = epUrl || '#'
    body.innerHTML = '<div style="text-align:center;padding:40px;color:#6b6b8a">正在加载...</div>'
    overlay.style.display = 'flex'
    if (!epUrl || epUrl === '#' || epUrl === 'undefined') {
      body.innerHTML = '<div style="text-align:center;padding:40px"><p style="color:#6b6b8a">暂无播放地址</p></div>'
      return
    }
    const isM3u8 = epUrl.includes('.m3u8')
    const isMp4  = epUrl.includes('.mp4')
    if (isM3u8 || isMp4) loadVideoPlayer(epUrl, isM3u8, progress)
    else // URL 格式校验
        var safeEpUrl = epUrl && /^https?:\/\//i.test(epUrl) ? epUrl : '';
        body.innerHTML = '<div class="tvbox-iframe-wrap"><iframe src="' + safeEpUrl + '" allowfullscreen allow="autoplay; fullscreen" style="width:100%;height:100%;border:none"></iframe></div>'
  }

  function renderCatBar() {
    const container = el.querySelector('#t-catbar')
    const cats = VOD_CATEGORIES
    container.innerHTML = '<span class="tvbox-catbar-label">分类</span>' +
      cats.map(c => '<button class="tvbox-cat-chip' + (c.id === cat ? ' active' : '') + '" data-id="' + c.id + '">' + c.name + '</button>').join('')
    container.querySelectorAll('.tvbox-cat-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        cat = btn.dataset.id
        page = 1; query = ''; searchInput.value = ''; hideHistory(); _viewStack = []
        renderCatBar(); renderSrcBar()
        if (getPlayHistory().length > 0 && !query) showPlayHistory()
        else loadData()
      })
    })
  }

  function renderSrcBar() {
    const container = el.querySelector('#t-srcbar')
    const list = VOD_SOURCES
    container.innerHTML = '<span class="tvbox-srcbar-label">源</span>' +
      list.map((s, i) => '<button class="tvbox-src-chip' + (i === src ? ' active' : '') + '" data-idx="' + i + '">' +
        '<span class="tvbox-src-dot"></span>' + s.name + '</button>').join('')
    container.querySelectorAll('.tvbox-src-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        src = parseInt(btn.dataset.idx)
        page = 1; hideHistory(); renderSrcBar(); loadData()
      })
    })
  }

  function loadData() {
    const content = el.querySelector('#t-content')
    content.innerHTML = '<div class="tvbox-loading"><div class="tvbox-loading-icon"></div><span class="tvbox-loading-text">加载中...</span></div>'
    try {
      if (mode === 'live') loadLive()
      else if (mode === 'tvboxjson') { if (query) loadTvboxSearch(); else loadTvboxList() }
      else if (query) loadSearch()
      else if (getPlayHistory().length > 0 && page === 1 && !query) showPlayHistory()
      else loadList()
    } catch (e) {
      content.innerHTML = '<div class="tvbox-empty"><div class="tvbox-empty-icon">😵</div><div class="tvbox-empty-title">加载失败</div><div class="tvbox-empty-sub">' + escHtml(e.message) + '</div></div>'
    }
  }

  async function loadList() {
    const source = VOD_SOURCES[src]
    const typeMap = VOD_TYPE_MAP[source.key] || { movie: 1, tv: 2, variety: 3, anime: 4, short: 6 }
    const catObj = VOD_CATEGORIES.find(c => c.id === cat)
    const typeId = typeMap[cat] ?? 1
    let json = { list: [], total: 0 }
    try {
      try { json = await fetchJSON(source.api + '?ac=list&t=' + typeId + '&pg=' + page) } catch {}
      if (!json.total) { try { json = await fetchJSON(source.api + '?ac=list&t=' + typeId + '&pg=' + page) } catch {} }
      if (!json.list) { try { json = await fetchJsonp(source.api + '?ac=list&t=' + typeId + '&pg=' + page) } catch {} }
    } catch {}
    // 如果列表为空（该 typeId 无数据），尝试全量接口拉取
    if (!json.list || !json.list.length) {
      try { json = await fetchJSON(source.api + '?ac=list&pg=' + page) } catch {}
    }
    renderVodGrid(json.list || [], json.total || 0)
  }

  async function loadSearch() {
    const source = VOD_SOURCES[src]
    const q = encodeURIComponent(query)
    let json = { list: [], total: 0 }
    try {
      try { json = await fetchJSON(source.api + '?ac=detail&zm=' + q + '&pg=' + page) } catch {}
      if (!json.list?.length) { try { json = await fetchJSON(source.api + '?ac=detail&wd=' + q + '&pg=' + page) } catch {} }
      if (!json.list?.length) { try { json = await fetchJsonp(source.api + '?ac=detail&zm=' + q) } catch {} }
    } catch {}
    renderVodGrid(json.list || [], json.total || 0)
  }

  // ── TVBox JSON 模式 ──────────────────────────────
  async function loadTvboxList() {
    const content = el.querySelector('#t-content')
    content.innerHTML = '<div class="tvbox-loading">加载 TVBox JSON 数据...</div>'
    const api = getActiveTvbox()
    if (!api) {
      content.innerHTML = '<div class="tvbox-empty">请先选择一个 TVBox 数据源（内置源或自定义）</div><div style="text-align:center;margin-top:20px"><button id="t-add-tvbox-btn" style="background:#e50914;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:14px;cursor:pointer">添加自定义 TVBox API</button></div>'
      el.querySelector('#t-add-tvbox-btn')?.addEventListener('click', showApiManage)
      return
    }
    const config = await loadTvboxConfig(api)
    if (!config) {
      content.innerHTML = '<div class="tvbox-empty">TVBox JSON 加载失败，请检查网络或换用其他源。<br><br><button id="t-switch-src-btn" style="background:#333;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:13px;cursor:pointer">切换数据源</button></div>'
      el.querySelector('#t-switch-src-btn')?.addEventListener('click', renderTvboxSrcTabs)
      return
    }
    const all = parseVideoList(config)
    const filtered = cat !== 'all' ? all.filter(v => (v.type_name || '').includes(VOD_CATEGORIES.find(c => c.id === cat)?.name || cat)) : all
    const total = filtered.length
    const start = (page - 1) * 20
    renderVodGrid(filtered.slice(start, start + 20), total)
  }

  async function loadTvboxSearch() {
    const content = el.querySelector('#t-content')
    content.innerHTML = '<div class="tvbox-loading">搜索中...</div>'
    const api = getActiveTvbox()
    if (!api) { content.innerHTML = '<div class="tvbox-empty">请先选择一个 TVBox 数据源</div>'; return }
    const config = await loadTvboxConfig(api)
    if (!config) { content.innerHTML = '<div class="tvbox-empty">TVBox JSON 加载失败</div>'; return }
    const results = searchTvboxList(config, query)
    renderVodGrid(results, results.length)
  }

  function renderTvboxSrcTabs() {
    const container = el.querySelector('#t-src-tabs')
    const activeKey = getActiveTvboxKey()
    const custom = getCustomTvbox()
    const allSources = [...TVBOX_BUILTIN.map(a => ({ ...a, _isBuiltin: true })), ...custom.map(a => ({ ...a, _isBuiltin: false }))]
    container.innerHTML = allSources.map((s, i) =>
      '<button class="tvbox-tab ' + (s.key === activeKey || (i === 0 && !activeKey) ? 'active' : '') + '" data-key="' + s.key + '">' + s.name + '</button>'
    ).join('') +
    '<button class="tvbox-tab" id="t-add-custom-btn" style="color:#e50914;font-size:13px">＋ 自定义</button>'
    container.querySelectorAll('.tvbox-tab[data-key]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.key
        setActiveTvboxKey(key)
        _tvboxCache = {}  // 清除缓存，强制重新加载
        src = 0; page = 1
        container.querySelectorAll('.tvbox-tab').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        if (query) await loadTvboxSearch()
        else await loadTvboxList()
      })
    })
    el.querySelector('#t-add-custom-btn')?.addEventListener('click', showApiManage)
  }

  // ── API 管理弹窗 ───────────────────────────────
  function showApiManage() {
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center'
    const custom = getCustomTvbox()
    const activeKey = getActiveTvboxKey()
    overlay.innerHTML = '<div style="background:#1a1a2e;border-radius:16px;padding:24px;width:90%;max-width:500px;max-height:80vh;overflow-y:auto;color:#fff;font-family:sans-serif">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
        '<div style="font-size:16px;font-weight:bold">⚙️ TVBox API 管理</div>' +
        '<button id="t-api-close" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;padding:4px">✕</button>' +
      '</div>' +
      '<div style="margin-bottom:16px">' +
        '<div style="font-size:13px;color:#888;margin-bottom:8px">内置 TVBox JSON 源（点击切换）</div>' +
        TVBOX_BUILTIN.map(a => '<div class="tvbox-src-item' + (a.key === activeKey ? ' active' : '') + '" data-key="' + a.key + '" data-type="builtin" style="padding:10px 12px;background:' + (a.key === activeKey ? '#2a2a4a' : '#252540') + ';border-radius:8px;margin-bottom:6px;cursor:pointer;display:flex;justify-content:space-between;align-items:center">' +
          '<span>' + a.name + '</span><span style="font-size:12px;color:#888">' + (a.note || '') + '</span></div>').join('') +
      '</div>' +
      '<div style="margin-bottom:16px">' +
        '<div style="font-size:13px;color:#888;margin-bottom:8px">自定义 TVBox 接口 <span style="color:#e50914">(' + custom.length + ')</span></div>' +
        (custom.length ? custom.map(a => '<div style="padding:10px 12px;background:#252540;border-radius:8px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">' +
          '<div style="overflow:hidden"><div style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px">' + escHtml(a.name) + '</div>' +
          '<div style="font-size:11px;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px">' + escHtml(a.url) + '</div></div>' +
          '<button class="t-del-api" data-key="' + a.key + '" style="background:#e50914;color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;flex-shrink:0;margin-left:8px">删除</button></div>').join('') : '<div style="color:#555;font-size:13px;text-align:center;padding:12px">暂无自定义接口</div>') +
      '</div>' +
      '<div style="border-top:1px solid #333;padding-top:16px">' +
        '<div style="font-size:13px;color:#888;margin-bottom:8px">添加自定义 TVBox JSON API</div>' +
        '<input id="t-api-name" placeholder="名称（选填）" style="width:100%;background:#252540;border:1px solid #333;color:#fff;border-radius:8px;padding:8px 12px;font-size:13px;box-sizing:border-box;margin-bottom:8px;display:block"/>' +
        '<input id="t-api-url" placeholder="输入 TVBox JSON API 地址..." style="width:100%;background:#252540;border:1px solid #333;color:#fff;border-radius:8px;padding:8px 12px;font-size:13px;box-sizing:border-box;margin-bottom:8px;display:block"/>' +
        '<button id="t-api-add-btn" style="width:100%;background:#e50914;color:#fff;border:none;border-radius:8px;padding:10px;font-size:14px;cursor:pointer">添加并使用</button>' +
      '</div>' +
    '</div>'
    document.body.appendChild(overlay)
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
    el.querySelector('#t-api-close').addEventListener('click', () => overlay.remove())
    el.querySelectorAll('.tvbox-src-item[data-key]').forEach(item => item.addEventListener('click', async () => {
      const key = item.dataset.key
      setActiveTvboxKey(key)
      _tvboxCache = {}
      overlay.remove()
      await loadTvboxList()
      renderTvboxSrcTabs()
    }))
    el.querySelectorAll('.t-del-api').forEach(btn => btn.addEventListener('click', e => {
      e.stopPropagation()
      const key = btn.dataset.key
      const apis = getCustomTvbox().filter(a => a.key !== key)
      saveCustomTvbox(apis); _customTvbox = apis
      if (getActiveTvboxKey() === key) { setActiveTvboxKey(''); _tvboxCache = {} }
      overlay.remove()
      showApiManage()
    }))
    el.querySelector('#t-api-add-btn').addEventListener('click', async () => {
      const name = el.querySelector('#t-api-name')?.value.trim() || ''
      const url = el.querySelector('#t-api-url')?.value.trim()
      if (!url) return
      const key = 'ctv_' + Date.now()
      const api = { key, name: name || '自定义-' + (_customTvbox.length + 1), url }
      const config = await loadTvboxConfig(api)
      if (config) {
        const apis = getCustomTvbox(); apis.push(api); saveCustomTvbox(apis); _customTvbox = apis
        setActiveTvboxKey(key); _tvboxCache = {}
        overlay.remove()
        await loadTvboxList()
        renderTvboxSrcTabs()
      } else {
        alert('API 地址无效或加载失败，请检查后重试')
      }
    })
  }

  function fetchJsonp(url) {
    // 支持 CDN 镜像回退
    const mirrors = typeof tvboxMirrors === 'function' ? tvboxMirrors(url) : [url];
    let mirrorIdx = 0;
    function tryNext(errMsg) {
      if (mirrorIdx < mirrors.length) {
        const mirror = mirrors[mirrorIdx++];
        return new Promise((resolve, reject) => {
          const cbName = '__jsonp_cb_' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
          const script = document.createElement('script');
          script.src = mirror + (mirror.includes('?') ? '&' : '?') + 'callback=' + cbName;
          let settled = false;
          function cleanup() {
            if (settled) return;
            settled = true;
            try { delete window[cbName]; } catch(e) {}
            if (script.parentNode) script.parentNode.removeChild(script);
          }
          script.onerror = () => { cleanup(); tryNext('JSONP 请求失败').then(resolve).catch(reject); };
          window[cbName] = (data) => { cleanup(); resolve(data); };
          document.head.appendChild(script);
          setTimeout(() => { cleanup(); if (!settled) tryNext('JSONP 超时').then(resolve).catch(reject); }, 15000);
        });
      } else reject(new Error(errMsg || 'JSONP 请求失败'));
    }
    return tryNext();
  }

  function renderVodGrid(list, total) {
    const grid = el.querySelector('#t-main-grid')
    const pagination = el.querySelector('#t-pagination')
    if (!grid) return
    if (!list || !list.length) {
      grid.innerHTML = '<div class="tvbox-empty"><div class="tvbox-empty-icon">📭</div><div class="tvbox-empty-title">暂无数据</div><div class="tvbox-empty-sub">请尝试其他分类或关键词</div></div>'
      if (pagination) pagination.innerHTML = ''
      return
    }
    const history = getPlayHistory()
    const sourceName = VOD_SOURCES[src]?.name || ''
    const totalPages = Math.max(1, Math.ceil(total / 20))

    grid.innerHTML = '<div class="tvbox-grid">' + list.map(item => {
      const histItem = history.find(h => h.id == item.vod_id && h.source === sourceName)
      const pct = histItem && histItem.duration > 0 ? Math.round((histItem.progress / histItem.duration) * 100) : 0
      const resumeLabel = pct > 95 ? '已看完' : pct > 2 ? '续 ' + pct + '%' : ''
      return '<div class="tvbox-card" data-id="' + item.vod_id + '" data-source="' + sourceName + '" data-name="' + item.vod_name + '" data-pic="' + item.vod_pic + '">' +
        '<div class="tvbox-card-inner">' +
          '<div class="tvbox-card-pic">' +
            (item.vod_pic ? '<img src="' + escHtml(item.vod_pic) + '" alt="' + escHtml(item.vod_name) + '" onerror="this.style.display=\'none\';this.parentElement.innerHTML=\'<span class=tvbox-card-placeholder>🎬</span>\'" />' : '<span class="tvbox-card-placeholder">🎬</span>') +
            '<span class="tvbox-card-tag">' + escHtml(item.type_name || '影视') + '</span>' +
            (item.vod_score ? '<span class="tvbox-card-score">' + escHtml(item.vod_score) + '</span>' : '') +
            (resumeLabel ? '<span class="tvbox-resume-badge">' + resumeLabel + '</span>' : '') +
          '</div>' +
          '<div class="tvbox-card-info">' +
            '<div class="tvbox-card-title">' + item.vod_name + '</div>' +
            '<div class="tvbox-card-sub">' + (item.vod_actor || '未知主演') + '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    }).join('') + '</div>'

    if (pagination) pagination.innerHTML = totalPages > 1 ? renderPagination(page, totalPages) : ''

    grid.querySelectorAll('.tvbox-card').forEach(card => {
      card.addEventListener('click', () => {
        _viewStack.push('list')
        openDetail(card.dataset.id, card.dataset.name, card.dataset.source, card.dataset.pic)
      })
    })
    if (pagination) {
      pagination.querySelectorAll('.tvbox-page-btn[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
          page = parseInt(btn.dataset.page)
          hideHistory()
          loadData()
          el.querySelector('.tvbox-content').scrollTop = 0
        })
      })
    }
  }

  async function loadLive() {
    const source = TV_SOURCES[tvSrc]
    const content = el.querySelector('#t-content')
    content.innerHTML = '<div class="tvbox-loading"><div class="tvbox-loading-icon"></div><span class="tvbox-loading-text">正在加载直播频道...</span></div>'
    let cats = tvCache[tvSrc]
    if (!cats) {
      try {
        const text = await fetch(source.api, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.text())
        const isM3u = text.includes('#EXTM3U') || text.includes('group-title')
        cats = isM3u ? parseNzk(convertM3uToNormal(text)) : parseNzk(text)
        tvCache[tvSrc] = cats
      } catch (e) {
        content.innerHTML = '<div class="tvbox-empty"><div class="tvbox-empty-icon">📡</div><div class="tvbox-empty-title">加载失败</div><div class="tvbox-empty-sub">' + escHtml(e.message) + '</div></div>'
        return
      }
    }
    renderTvGrid(cats)
  }

  function renderTvGrid(categories) {
    const content = el.querySelector('#t-content')
    if (!categories || !categories.length) { content.innerHTML = '<div class="tvbox-empty"><div class="tvbox-empty-icon">📡</div><div class="tvbox-empty-title">暂无频道数据</div></div>'; return }
    content.innerHTML = categories.slice(0, 30).map(cat => {
      if (!cat.channels || !cat.channels.length) return ''
      const chHtml = cat.channels.slice(0, 80).map(ch =>
        '<div class="tvbox-live-card" data-url="' + escHtml(ch.url) + '" data-name="' + escHtml(ch.name) + '">' +
          '<span class="tvbox-live-icon">📺</span><span class="tvbox-live-name">' + escHtml(ch.name) + '</span>' +
        '</div>'
      ).join('')
      return '<div class="tvbox-cat-section">' +
        '<div class="tvbox-cat-heading">📺 ' + escHtml(cat.name) + ' <span class="tvbox-cat-heading-count">' + cat.channels.length + '</span></div>' +
        '<div class="tvbox-live-grid">' + chHtml + '</div>' +
      '</div>'
    }).join('')
    content.querySelectorAll('.tvbox-live-card').forEach(node => {
      node.addEventListener('click', () => {
        const url = node.dataset.url, name = node.dataset.name
        if (url && url !== '#') openPlayerTv(name, url)
        else alert('该频道暂无播放地址')
      })
    })
  }

  function openPlayerTv(name, url) {
    const overlay = el.querySelector('#t-player-overlay')
    const body = el.querySelector('#t-player-body')
    el.querySelector('#t-player-title').textContent = '📺 ' + name
    el.querySelector('#t-ext-link').href = url
    body.innerHTML = '<div class="tvbox-player-loading">正在加载...</div>'
    overlay.style.display = 'flex'
    const isM3u8 = url.includes('.m3u8')
    const isMp4  = url.includes('.mp4')
    if (isM3u8 || isMp4) loadVideoPlayer(url, isM3u8, 0)
    else {
      // URL 格式校验
      var safeUrl = url && /^https?:\/\//i.test(url) ? url : ''
      body.innerHTML = '<div class="tvbox-iframe-wrap"><iframe id="tv-iframe" src="' + safeUrl + '" allowfullscreen allow="autoplay; fullscreen" style="width:100%;height:100%;border:none"></iframe></div>'
      // 超时兜底：10 秒内 iframe 未触发 load 事件则显示错误
      setTimeout(() => {
        const iframe = document.getElementById('tv-iframe')
        if (iframe && iframe.style.display !== 'none') {
          body.innerHTML = '<div style="text-align:center;padding:40px"><p style="color:#6b6b8a;margin-bottom:14px">播放地址无效或已被防盗链</p><a href="' + safeUrl + '" target="_blank" class="tvbox-open-ext">↗ 在浏览器中打开</a></div>'
        }
      }, 10000)
    }
  }

  async function openDetail(id, name, sourceName, pic) {
    const source = VOD_SOURCES[src]
    const content = el.querySelector('#t-content')
    content.innerHTML = '<div class="tvbox-loading"><div class="tvbox-loading-icon"></div><span class="tvbox-loading-text">加载中...</span></div>'
    let json = { list: null }
    try { json = await fetchJSON(source.api + '?ac=detail&ids=' + id) } catch {}
    if (!json.list) { try { json = await fetchJsonp(source.api + '?ac=detail&ids=' + id) } catch {} }
    const item = json.list && json.list[0]
    if (!item) { content.innerHTML = '<div class="tvbox-empty">未找到该影片</div>'; return }
    showEpisodePicker(item, source.name)
  }

  function showEpisodePicker(item, sourceName) {
    const overlay = el.querySelector('#t-player-overlay')
    const body = el.querySelector('#t-player-body')
    el.querySelector('#t-player-title').textContent = item.vod_name
    el.querySelector('#t-ext-link').href = '#'
    const episodes = parsePlaylist(item.vod_play_from, item.vod_play_url)
    const hist = getPlayHistory().find(h => h.id == item.vod_id && h.source === sourceName)
    playingEp = null

    // 优先选择包含直接 m3u8 的源（lzm3u8 > liangzi 的 share/xxx）
    let preferredSi = 0
    if (episodes.length > 1) {
      const scored = episodes.map((e, i) => {
        const hasDirectM3u8 = e.urls.some(u => u.url.includes('.m3u8') && !u.url.includes('/share/'))
        const hasShare = e.urls.some(u => u.url.includes('/share/'))
        return { i, score: hasDirectM3u8 ? 2 : hasShare ? 1 : 0 }
      })
      scored.sort((a, b) => b.score - a.score)
      preferredSi = scored[0].i
    }

    const backBtn = '<div style="margin-bottom:12px"><button class="tvbox-back-btn" id="t-detail-back">← 返回列表</button></div>'
    const firstUrls = episodes[preferredSi]?.urls || []
    const siHtml = episodes.length > 1
      ? '<div style="margin-bottom:10px"><span style="font-size:12px;color:#666">选择源：</span>' +
          episodes.map((e, i) => '<button class="tvbox-tab' + (i===preferredSi?' active':'') + '" style="margin-right:6px;margin-bottom:6px" data-si="' + i + '">' + e.name + (i===preferredSi?' ★':'') + '</button>').join('') +
        '</div>'
      : ''

    body.innerHTML =
      backBtn +
      '<div class="tvbox-ep-info">' +
        '<img src="' + escHtml(item.vod_pic) + '" class="tvbox-ep-pic" onerror="this.style.display=\'none\'" />' +
        '<div class="tvbox-ep-desc">' + (item.vod_content || '暂无简介') + '</div>' +
      '</div>' +
      siHtml +
      '<div class="tvbox-ep-list-title">播放列表 ' + firstUrls.length + ' 集</div>' +
      '<div class="tvbox-ep-grid" id="t-ep-grid">' +
        firstUrls.map((ep, i) => {
          const isResume = hist && hist.epName === ep.name
          return '<button class="tvbox-ep-btn' + (isResume?' playing':'') + '" ' +
            'data-url="' + ep.url + '" data-name="' + item.vod_name + ' ' + ep.name + '" ' +
            'data-epname="' + ep.name + '" data-pic="' + item.vod_pic + '" ' +
            'data-id="' + item.vod_id + '" data-source="' + sourceName + '">' +
            (isResume?'▶ ':'') + ep.name + '</button>'
        }).join('') +
      '</div>'

    body.querySelector('#t-detail-back')?.addEventListener('click', () => {
      closePlayer()
      _viewStack.pop()
      if (query) loadSearch()
      else loadList()
    })

    body.querySelectorAll('[data-si]').forEach(btn => {
      btn.addEventListener('click', () => {
        const si = parseInt(btn.dataset.si)
        const eps = episodes[si]?.urls || []
        const grid = body.querySelector('#t-ep-grid')
        grid.innerHTML = eps.map((ep, i) =>
          '<button class="tvbox-ep-btn" data-url="' + escHtml(ep.url) + '" data-name="' + escHtml(item.vod_name + ' ' + ep.name) + '" ' +
            'data-epname="' + escHtml(ep.name) + '" data-pic="' + escHtml(item.vod_pic) + '" ' +
            'data-id="' + item.vod_id + '" data-source="' + sourceName + '">' + escHtml(ep.name) + '</button>'
        ).join('')
        bindEpBtns()
        body.querySelectorAll('[data-si]').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
      })
    })

    bindEpBtns()
    overlay.style.display = 'flex'

    function bindEpBtns() {
      body.querySelectorAll('.tvbox-ep-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          upsertPlayHistory({
            id: btn.dataset.id, name: btn.dataset.name, pic: btn.dataset.pic,
            source: btn.dataset.source, epName: btn.dataset.epname,
            epUrl: btn.dataset.url, progress: 0, duration: 0,
          })
          openPlayerVod(btn.dataset.name, btn.dataset.url, btn.dataset.id, btn.dataset.source, btn.dataset.epname, btn.dataset.pic)
        })
      })
    }
  }

  function openPlayerVod(name, url, id, source, epName, pic) {
    const overlay = el.querySelector('#t-player-overlay')
    const body = el.querySelector('#t-player-body')
    el.querySelector('#t-player-title').textContent = name
    el.querySelector('#t-ext-link').href = url
    playingEp = { id, source, epName, pic }
    body.innerHTML = '<div class="tvbox-player-loading">正在加载...</div>'
    overlay.style.display = 'flex'
    if (!url || url === '#') { body.innerHTML = '<div style="text-align:center;padding:40px"><p style="color:#6b6b8a">暂无播放地址</p></div>'; return }
    const isM3u8 = url.includes('.m3u8')
    const isMp4  = url.includes('.mp4')
    if (isM3u8 || isMp4) loadVideoPlayer(url, isM3u8, 0)
    else {
      body.innerHTML = '<div class="tvbox-iframe-wrap"><iframe id="tv-iframe" src="' + safeUrl(url) + '" allowfullscreen allow="autoplay; fullscreen" style="width:100%;height:100%;border:none"></iframe></div>'
      setTimeout(() => {
        const iframe = document.getElementById('tv-iframe')
        if (iframe && iframe.style.display !== 'none') {
          body.innerHTML = '<div style="text-align:center;padding:40px"><p style="color:#6b6b8a;margin-bottom:14px">播放地址无效或已被防盗链</p><a href="' + safeUrl(url) + '" target="_blank" class="tvbox-open-ext">↗ 在浏览器中打开</a></div>'
        }
      }, 10000)
    }
  }

  async function loadVideoPlayer(videoUrl, isM3u8, startProgress) {
    const body = el.querySelector('#t-player-body')
    if (isM3u8) {
      await ensureHls()
      if (window.Hls && window.Hls.isSupported()) {
        const wrap = document.createElement('div'); wrap.className = 'tvbox-video-wrap'
        const video = document.createElement('video'); video.controls = true
        wrap.appendChild(video)
        body.innerHTML = ''; body.appendChild(wrap)
        const hls = new window.Hls()
        window._movieHls = hls
        hls.loadSource(videoUrl)
        hls.attachMedia(video)
        let hlsTimedOut = false
        const hlsTimer = setTimeout(() => {
          if (!hlsTimedOut) { hlsTimedOut = true; hls.destroy(); window._movieHls = null
            body.innerHTML = '<div style="text-align:center;padding:40px"><p style="color:#6b6b8a;margin-bottom:14px">m3u8 加载超时（15秒）</p><a href="' + videoUrl + '" target="_blank" class="tvbox-open-ext">&#8599; 在浏览器中打开</a></div>'
          }
        }, 15000)
        hls.on(window.Hls.Events.ERROR, () => { hlsTimedOut = true; clearTimeout(hlsTimer); window._movieHls = null
          body.innerHTML = '<div style="text-align:center;padding:40px"><p style="color:#6b6b8a;margin-bottom:14px">m3u8 播放失败</p><a href="' + videoUrl + '" target="_blank" class="tvbox-open-ext">&#8599; 在浏览器中打开</a></div>' })
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => { clearTimeout(hlsTimer) })
        video.addEventListener('timeupdate', () => trackProgress(video))
        video.addEventListener('ended', () => markFinished())
        if (startProgress > 0) video.currentTime = startProgress
        video.play().catch(() => {})
      } else {
        body.innerHTML = '<div style="text-align:center;padding:40px"><p style="color:#6b6b8a;margin-bottom:14px">正在尝试播放...</p><a href="' + videoUrl + '" target="_blank" class="tvbox-open-ext">↗ 在浏览器中打开</a></div>'
      }
    } else {
      const wrap = document.createElement('div'); wrap.className = 'tvbox-video-wrap'
      const video = document.createElement('video'); video.controls = true
      wrap.appendChild(video)
      body.innerHTML = ''; body.appendChild(wrap)
      video.addEventListener('timeupdate', () => trackProgress(video))
      video.addEventListener('ended', () => markFinished())
      video.src = videoUrl
      if (startProgress > 0) video.currentTime = startProgress
      video.play().catch(() => {})
    }
  }

  function trackProgress(video) {
    if (!playingEp || !video.duration) return
    const pct = (video.currentTime / video.duration) * 100
    if (pct > 1) updatePlayProgress(playingEp.id, playingEp.source, video.currentTime)
  }

  function markFinished() {
    if (!playingEp) return
    updatePlayProgress(playingEp.id, playingEp.source, 999)
  }

  function ensureHls() {
    return new Promise(resolve => {
      if (window.Hls) { resolve(); return }
      const sc = document.createElement('script')
      sc.src = HLS_CDN
      sc.onload = () => resolve()
      sc.onerror = () => resolve()
      document.head.appendChild(sc)
    })
  }

  function closePlayer() {
    playingEp = null
    el.querySelector('#t-player-overlay').style.display = 'none'
    el.querySelector('#t-player-body').innerHTML = ''
    // 清理 HLS 实例，防止视频后台继续播放
    if (window._movieHls) {
      window._movieHls.destroy()
      window._movieHls = null
    }
  }

  function renderPagination(page, total) {
    if (total <= 1) return ''
    const prev = page > 1 ? page - 1 : 1
    const next = page < total ? page + 1 : total
    return '<div class="tvbox-pagination">' +
      '<button class="tvbox-page-btn" data-page="' + prev + '">◀ 上一页</button>' +
      '<span class="tvbox-page-info">第 ' + page + ' / ' + total + ' 页</span>' +
      '<button class="tvbox-page-btn" data-page="' + next + '">下一页 ▶</button>' +
    '</div>'
  }

  // ── 悬浮播放器（可拖拽/最小化/置顶）───────────────────────────────────
  let _floatState = null   // { wrap, title, pinned, minimized, h, w, x, y }

  function openFloatPlayer(name, url, id, source, epName, pic) {
    closeFloatPlayer()

    // 优先选择直接 m3u8（非 /share/ 的）
    const useUrl = pickDirectUrl(url)

    const wrap = document.createElement('div')
    wrap.className = 'tvbox-float-wrap'
    wrap.style.cssText = 'right:20px;bottom:80px;width:420px;'

    const isM3u8 = useUrl.includes('.m3u8')
    const isMp4  = useUrl.includes('.mp4')
    const canEmbed = isM3u8 || isMp4

    wrap.innerHTML = `
      <div class="tvbox-float-header">
        <span class="tvbox-float-title">${escHtml(name)}</span>
        <button class="tvbox-float-ctrl min-btn" id="_fmin" title="最小化">─</button>
        <button class="tvbox-float-ctrl pin-btn" id="_fpin" title="置顶">📌</button>
        <button class="tvbox-float-ctrl close" id="_fclose" title="关闭">✕</button>
      </div>
      <div class="tvbox-float-body" id="_fbody">
        ${canEmbed ? `<div class="tvbox-float-video-wrap" id="_fvid"></div>` :
          `<div style="aspect-ratio:16/9;background:#000;display:flex;align-items:center;justify-content:center;color:#6b6b8a;font-size:13px">
            <div style="text-align:center">
              <div style="margin-bottom:8px">⚠️ 非直链，无法直接播放</div>
              <div style="font-size:11px;color:#555">m3u8/MP4 直链才可播放</div>
            </div>
          </div>`}
      </div>
      <div class="tvbox-float-url-bar">
        <a href="${escHtml(useUrl)}" target="_blank" rel="noopener" id="_fext" title="${escHtml(useUrl)}">${escHtml(useUrl)}</a>
        <button class="tvbox-float-ctrl" id="_fcopy" title="复制链接" style="font-size:10px;width:22px;height:22px">📋</button>
      </div>`

    document.body.appendChild(wrap)
    _floatState = {
      wrap, pinned: false, minimized: false,
      h: wrap.offsetHeight, w: wrap.offsetWidth,
      x: window.innerWidth - 420 - 20,
      y: window.innerHeight - 80 - (canEmbed ? Math.round(420 * 9/16 + 120) : 120)
    }

    // 拖拽
    const hdr = wrap.querySelector('.tvbox-float-header')
    hdr.addEventListener('mousedown', onFloatDragStart)
    hdr.addEventListener('touchstart', onFloatDragStart, { passive: false })

    // 控制按钮
    wrap.querySelector('#_fclose').addEventListener('click', closeFloatPlayer)
    wrap.querySelector('#_fmin').addEventListener('click', () => toggleFloatMin())
    wrap.querySelector('#_fpin').addEventListener('click', () => toggleFloatPin())
    wrap.querySelector('#_fcopy')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(useUrl).catch(() => {})
    })

    // 播放视频
    if (canEmbed) {
      if (isM3u8) loadVideoIntoFloat(useUrl)
      else loadMp4IntoFloat(useUrl)
    }

    // ESC 关闭
    document.addEventListener('keydown', onFloatEsc)
  }

  function pickDirectUrl(url) {
    // url 可能是 "集名$url#集名$url" 或单个 url
    if (!url.includes('#') && !url.includes('$$$')) return url
    // 找第一个非 /share/ 的 m3u8
    const parts = url.split('#').filter(Boolean)
    for (const p of parts) {
      const idx = p.indexOf('$')
      const u = idx >= 0 ? p.slice(idx + 1) : p
      if (u.includes('.m3u8') && !u.includes('/share/')) return u
    }
    // 其次选第一个 m3u8
    for (const p of parts) {
      const idx = p.indexOf('$')
      const u = idx >= 0 ? p.slice(idx + 1) : p
      if (u.includes('.m3u8')) return u
    }
    // fallback 第一个 url
    const idx0 = parts[0].indexOf('$')
    return idx0 >= 0 ? parts[0].slice(idx0 + 1) : parts[0]
  }

  async function loadVideoIntoFloat(url) {
    await ensureHls()
    const vidWrap = document.querySelector('#_fvid')
    if (!vidWrap) return
    const video = document.createElement('video')
    video.controls = true
    vidWrap.appendChild(video)
    if (window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls()
      window._floatHls = hls
      hls.loadSource(url)
      hls.attachMedia(video)
      let timedOut = false
      const timer = setTimeout(() => {
        if (!timedOut) { timedOut = true; hls.destroy(); window._floatHls = null
          vidWrap.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#6b6b8a;font-size:13px">m3u8 加载超时（15秒）</div>'
        }
      }, 15000)
      hls.on(window.Hls.Events.ERROR, () => { clearTimeout(timer); window._floatHls = null
        vidWrap.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#f87171;font-size:13px">m3u8 播放失败</div>'
      })
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => clearTimeout(timer))
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url
    } else {
      vidWrap.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#6b6b8a;font-size:13px">浏览器不支持 HLS</div>'
    }
    video.play().catch(() => {})
  }

  function loadMp4IntoFloat(url) {
    const vidWrap = document.querySelector('#_fvid')
    if (!vidWrap) return
    const video = document.createElement('video')
    video.controls = true
    video.src = url
    vidWrap.appendChild(video)
    video.play().catch(() => {})
  }

  function toggleFloatMin() {
    if (!_floatState) return
    _floatState.minimized = !_floatState.minimized
    _floatState.wrap.classList.toggle('minimized', _floatState.minimized)
    _floatState.wrap.querySelector('#_fmin').textContent = _floatState.minimized ? '□' : '─'
  }

  function toggleFloatPin() {
    if (!_floatState) return
    _floatState.pinned = !_floatState.pinned
    _floatState.wrap.classList.toggle('pinned', _floatState.pinned)
    _floatState.wrap.style.zIndex = _floatState.pinned ? '9999999' : '99999'
    _floatState.wrap.querySelector('#_fpin').classList.toggle('pin-on', _floatState.pinned)
  }

  let _floatDrag = null

  function onFloatDragStart(e) {
    if (_floatState && _floatState.minimized) return
    e.preventDefault()
    const pt = e.touches ? e.touches[0] : e
    _floatDrag = {
      ox: pt.clientX, oy: pt.clientY,
      sx: _floatState ? _floatState.x : 0,
      sy: _floatState ? _floatState.y : 0
    }
    _floatState?.wrap.classList.add('dragging')
    document.addEventListener('mousemove', onFloatDragMove)
    document.addEventListener('mouseup', onFloatDragEnd)
    document.addEventListener('touchmove', onFloatDragMove, { passive: false })
    document.addEventListener('touchend', onFloatDragEnd)
  }

  function onFloatDragMove(e) {
    if (!_floatDrag) return
    e.preventDefault()
    const pt = e.touches ? e.touches[0] : e
    const dx = pt.clientX - _floatDrag.ox
    const dy = pt.clientY - _floatDrag.oy
    if (!_floatState) return
    _floatState.x = Math.max(0, Math.min(window.innerWidth - _floatState.w, _floatState.sx + dx))
    _floatState.y = Math.max(0, Math.min(window.innerHeight - _floatState.h, _floatState.sy + dy))
    _floatState.wrap.style.right = 'auto'
    _floatState.wrap.style.left = _floatState.x + 'px'
    _floatState.wrap.style.top = _floatState.y + 'px'
    _floatState.wrap.style.bottom = 'auto'
  }

  function onFloatDragEnd() {
    if (_floatState) _floatState.wrap.classList.remove('dragging')
    _floatDrag = null
    document.removeEventListener('mousemove', onFloatDragMove)
    document.removeEventListener('mouseup', onFloatDragEnd)
    document.removeEventListener('touchmove', onFloatDragMove)
    document.removeEventListener('touchend', onFloatDragEnd)
  }

  function onFloatEsc(e) {
    if (e.key === 'Escape') closeFloatPlayer()
  }

  function closeFloatPlayer() {
    if (window._floatHls) { window._floatHls.destroy(); window._floatHls = null }
    if (_floatState?.wrap) { _floatState.wrap.remove(); _floatState = null }
    document.removeEventListener('keydown', onFloatEsc)
    onFloatDragEnd()
  }

// ── 网站爬虫解析器 ───────────────────────────────────────────────

  // 爬虫模式状态
  let _crawlResults = []

  function showCrawlInput() {
    const content = el.querySelector('#t-content')
    content.innerHTML = `
      <div class="tvbox-crawl-panel">
        <div class="tvbox-crawl-header">
          <div class="tvbox-crawl-icon">🕷️</div>
          <div class="tvbox-crawl-title">网站爬虫</div>
          <div class="tvbox-crawl-sub">输入任意视频网站 URL，自动分析并提取可播放的视频链接</div>
        </div>
        <div class="tvbox-crawl-form">
          <input id="t-crawl-url" type="url" placeholder="https://example.com/video/123" />
          <button id="t-crawl-go" class="tvbox-crawl-btn">🔍 爬取</button>
        </div>
        <div class="tvbox-crawl-hint">
          <p>💡 支持：m3u8/mp4直链、视频详情页、播放器iframe嵌入</p>
        </div>
        <div id="t-crawl-status" class="tvbox-crawl-status"></div>
        <div id="t-crawl-results" class="tvbox-crawl-results"></div>
      </div>
    `

    const input = content.querySelector('#t-crawl-url')
    const btn = content.querySelector('#t-crawl-go')

    async function doCrawl() {
      const url = input.value.trim()
      if (!url) return
      if (!/^https?:/i.test(url)) {
        showCrawlStatus('❌ 请输入有效的 http/https URL', 'error')
        return
      }
      btn.disabled = true
      btn.textContent = '⏳ 爬取中...'
      showCrawlStatus('🔍 正在分析页面结构...', 'loading')
      _crawlResults = []
      const results = await crawlSite(url)
      _crawlResults = results
      btn.disabled = false
      btn.textContent = '🔍 爬取'
      renderCrawlResults(results)
    }

    btn.addEventListener('click', doCrawl)
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doCrawl() })
    setTimeout(() => input.focus(), 100)
  }

  function showCrawlStatus(msg, type) {
    const el2 = el.querySelector('#t-crawl-status')
    if (!el2) return
    el2.className = 'tvbox-crawl-status tvbox-crawl-status-' + (type || 'info')
    el2.textContent = msg
    el2.style.display = 'block'
  }

  async function crawlSite(url) {
    const results = []
    if (url.includes('.m3u8') || url.includes('.mp4')) {
      const name = url.split('/').pop().replace(/\.(m3u8|mp4)/i, '') || '直链视频'
      return [{ name, url, thumb: '', type: 'direct' }]
    }
    let html = ''
    try {
      html = await crawlFetch(url)
    } catch (e) {
      showCrawlStatus('❌ 页面获取失败: ' + e.message, 'error')
      return []
    }
    showCrawlStatus('📄 页面已获取，正在分析视频链接...', 'loading')

    const m3u8Links = extractM3u8(html, url)
    m3u8Links.forEach(item => results.push(item))

    const mp4Links = extractMp4(html, url)
    mp4Links.forEach(item => results.push(item))

    const iframes = extractIframes(html, url)
    for (const iframe of iframes) {
      showCrawlStatus('🔗 发现嵌入式播放器: ' + iframe.src, 'loading')
      try {
        const iframeHtml = await crawlFetch(iframe.src).catch(() => '')
        const frameM3u8 = extractM3u8(iframeHtml, iframe.src)
        frameM3u8.forEach(item => results.push(item))
        const frameMp4 = extractMp4(iframeHtml, iframe.src)
        frameMp4.forEach(item => results.push(item))
      } catch {}
    }

    const listItems = extractVideoList(html, url)
    listItems.forEach(item => results.push(item))

    const jsUrls = extractFromScript(html, url)
    jsUrls.forEach(item => results.push(item))

    const seen = new Set()
    return results.filter(r => {
      const key = r.url
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  async function crawlFetch(pageUrl) {
    try {
      const { invoke } = await import('@tauri-apps/api/core').catch(() => ({}))
      if (invoke) {
        const html = await invoke('fetch_page', { url: pageUrl }).catch(() => null)
        if (html) return html
      }
    } catch {}
    const resp = await fetch(pageUrl, {
      signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined,
      credentials: 'include',
      headers: { 'Accept': 'text/html,application/xhtml+xml,*/*', 'Accept-Language': 'zh-CN,zh;q=0.9' }
    })
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    return resp.text()
  }

  function extractM3u8(html, base) {
    const results = []
    const re = /(?:src|href|url|video|media)[\s"'=]*(\S+\.m3u8[^"'<>\s]*)/gi
    let m
    while ((m = re.exec(html)) !== null) {
      const raw = m[1].replace(/['"]/g, '').split('?')[0]
      const resolved = raw.startsWith('http') ? raw : new URL(raw, base).href
      if (resolved.includes('.m3u8')) {
        const name = raw.split('/').pop().replace('.m3u8', '') || 'M3U8 视频'
        results.push({ name, url: resolved, thumb: '', type: 'm3u8' })
      }
    }
    const jsonRe = /"(https?:[^"]+\.m3u8[^"]*)"/g
    while ((m = jsonRe.exec(html)) !== null) {
      const resolved = m[1].split('?')[0]
      if (resolved.includes('.m3u8')) {
        const name = resolved.split('/').pop().replace('.m3u8', '') || 'M3U8 视频'
        results.push({ name, url: resolved, thumb: '', type: 'm3u8' })
      }
    }
    return results
  }

  function extractMp4(html, base) {
    const results = []
    const re = /(?:src|href|url|video|media)[\s"'=]*(\S+\.mp4[^"'<>\s]*)/gi
    let m
    while ((m = re.exec(html)) !== null) {
      const raw = m[1].replace(/['"]/g, '').split('?')[0]
      const resolved = raw.startsWith('http') ? raw : new URL(raw, base).href
      if (resolved.includes('.mp4')) {
        const name = raw.split('/').pop().replace('.mp4', '') || 'MP4 视频'
        results.push({ name, url: resolved, thumb: '', type: 'mp4' })
      }
    }
    return results
  }

  function extractIframes(html, base) {
    const results = []
    const re = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi
    let m
    while ((m = re.exec(html)) !== null) {
      const src = m[1].trim()
      if (src && !src.startsWith('about:') && !src.startsWith('javascript:')) {
        const resolved = src.startsWith('http') ? src : new URL(src, base).href
        results.push({ src: resolved })
      }
    }
    const re2 = /<iframe[^>]+data-src=["']([^"']+)["'][^>]*>/gi
    while ((m = re2.exec(html)) !== null) {
      const src = m[1].trim()
      if (src) {
        const resolved = src.startsWith('http') ? src : new URL(src, base).href
        results.push({ src: resolved })
      }
    }
    return results
  }

  function extractVideoList(html, base) {
    const results = []
    const re = /<(?:a|div|li)[^>]+(?:href|data-url|data-src)[\s="']*([^"'<>\s]+)[^>]*>([^<]{2,60})/gi
    let m
    while ((m = re.exec(html)) !== null) {
      const rawUrl = m[1].trim()
      const title = m[2].replace(/<[^>]+>/g, '').trim()
      if (!rawUrl || !title || rawUrl.length < 5) continue
      const resolved = rawUrl.startsWith('http') ? rawUrl : new URL(rawUrl, base).href
      if (resolved.includes('.m3u8') || resolved.includes('.mp4') ||
          /player|video|play|watch|episode|detail/i.test(resolved)) {
        results.push({ name: title || resolved.split('/').pop(), url: resolved, thumb: '', type: 'link' })
      }
    }
    return results
  }

  function extractFromScript(html, base) {
    const results = []
    const jsonBlocks = html.match(/\{[^{}]{50,2000}"/g) || []
    jsonBlocks.forEach(block => {
      const m3u8Matches = block.match(/"'( ]+(https?:[^\s"')]{10,300}\.m3u8[^\s"')]*)/gi) || []
      m3u8Matches.forEach(raw => {
        const url = raw.replace(/["' >]/g, '').split('?')[0]
        if (url.includes('.m3u8') && url.startsWith('http')) {
          results.push({ name: url.split('/').pop().replace('.m3u8', ''), url, thumb: '', type: 'm3u8' })
        }
      })
    })
    return results
  }

  function renderCrawlResults(results) {
    const container = el.querySelector('#t-crawl-results')
    if (!results || results.length === 0) {
      container.innerHTML = '<div class="tvbox-empty"><div class="tvbox-empty-icon">🔍</div><div class="tvbox-empty-title">未找到视频</div><div class="tvbox-empty-sub">该页面无法提取视频链接，可能是非视频类网站或需要登录</div></div>'
      showCrawlStatus('', 'info')
      return
    }
    showCrawlStatus('✅ 找到 ' + results.length + ' 个可播放链接', 'success')
    container.innerHTML = '<div class="tvbox-grid">' + results.map((r, i) => {
      const typeIcon = r.type === 'direct' ? '🎬' : r.type === 'm3u8' ? '📺' : r.type === 'mp4' ? '🎞️' : '🔗'
      return '<div class="tvbox-card tvbox-crawl-card" data-index="' + i + '">' +
        '<div class="tvbox-card-inner">' +
          '<div class="tvbox-card-pic">' +
            '<span class="tvbox-card-placeholder" style="font-size:32px;display:flex;align-items:center;justify-content:center;width:100%;height:100%">' + typeIcon + '</span>' +
          '</div>' +
          '<div class="tvbox-card-info">' +
            '<div class="tvbox-card-title" style="font-size:12px;line-height:1.3">' + escHtml(r.name.slice(0, 40)) + '</div>' +
            '<div class="tvbox-card-sub">' + r.type.toUpperCase() + '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    }).join('') + '</div>'

    container.querySelectorAll('.tvbox-crawl-card').forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.index)
        const r = _crawlResults[idx]
        if (r) playCrawlVideo(r.name, r.url)
      })
    })
  }

  function playCrawlVideo(name, url) {
    const isM3u8 = url.includes('.m3u8')
    const isMp4 = url.includes('.mp4')
    if (isM3u8 || isMp4) {
      openFloatPlayer(name, url)
    } else {
      showCrawlStatus('🔗 正在抓取: ' + url, 'loading')
      crawlFetch(url).then(html => {
        const m3u8s = extractM3u8(html, url)
        const mp4s = extractMp4(html, url)
        if (m3u8s.length > 0) {
          openFloatPlayer(name, m3u8s[0].url)
        } else if (mp4s.length > 0) {
          openFloatPlayer(name, mp4s[0].url)
        } else {
          openFloatPlayer(name, url)
        }
        showCrawlStatus('', 'info')
      }).catch(e => {
        showCrawlStatus('❌ 抓取失败: ' + e.message, 'error')
        openFloatPlayer(name, url)
      })
    }
  }

// ── 链接输入解析器 ────────────────────────────────────────────────
  // ── 链接输入解析器 ────────────────────────────────────────────────
  function showUrlInput() {
    const existing = document.querySelector('.tvbox-url-overlay')
    if (existing) { existing.remove(); return }

    const overlay = document.createElement('div')
    overlay.className = 'tvbox-url-overlay'
    overlay.innerHTML = `
      <div class="tvbox-url-box">
        <div class="tvbox-url-title">🔗 链接解析播放</div>
        <div class="tvbox-url-err" id="_urlerr"></div>
        <div class="tvbox-url-row">
          <input id="_urlin" type="url" placeholder="粘贴视频页面 URL、m3u8 直链或分享页链接..." autofocus />
          <button class="tvbox-url-go" id="_urlgo">解析</button>
        </div>
        <div class="tvbox-url-hint">
          支持：<span>m3u8/MP4 直链</span>、<span>量子/暴风分享页</span>、<span>任意视频页 URL</span><br>
          提示：解析结果会尽可能提取直链 m3u8，无法提取时显示说明
        </div>
        <button class="tvbox-url-cancel" id="_urlcancel">取消</button>
      </div>`

    document.body.appendChild(overlay)

    const err = overlay.querySelector('#_urlerr')
    const inp = overlay.querySelector('#_urlin')

    function showErr(msg) {
      err.textContent = msg
      err.classList.add('show')
    }
    function clearErr() { err.classList.remove('show') }

    async function doUrlParse(rawUrl) {
      rawUrl = rawUrl.trim()
      if (!rawUrl) { showErr('请输入链接'); return }
      if (!/^https?:/i.test(rawUrl)) { showErr('仅支持 http/https 链接'); return }
      clearErr()

      // 直链直接播
      if (rawUrl.includes('.m3u8') || rawUrl.includes('.mp4')) {
        overlay.remove()
        openFloatPlayer('直链播放', rawUrl)
        return
      }

      // 量子/暴风分享页 → 尝试 Rust vod_fetch 提取详情
      const isLzShare = /\/share\//.test(rawUrl) || rawUrl.includes('v.lfthirtytwo.com') || rawUrl.includes('vip.lz-')
      if (isLzShare) {
        overlay.remove()
        openFloatPlayer('解析中', rawUrl)
        // 先尝试用 vod_fetch 找详情接口
        await tryExtractFromSharePage(rawUrl)
        return
      }

      // 其他页面 → 显示不支持
      overlay.remove()
      openFloatPlayer('无法解析', rawUrl)
    }

    overlay.querySelector('#_urlgo').addEventListener('click', () => doUrlParse(inp.value))
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') doUrlParse(inp.value) })
    overlay.querySelector('#_urlcancel').addEventListener('click', () => overlay.remove())
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
    inp.focus()
  }

  async function tryExtractFromSharePage(shareUrl) {
    // 从分享页 URL 反向推断 vod_id，调用详情接口
    // 分享页格式: https://v.lfthirtytwo.com/share/{hash}
    // 无法直接提取 hash → vod_id 映射，改用 iframe 尝试
    const vidWrap = document.querySelector('#_fvid')
    if (vidWrap) {
      vidWrap.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#6b6b8a;font-size:13px">⚠️ 分享页需浏览器打开防盗链</div>'
    }
    // 更新说明
    const urlBar = document.querySelector('.tvbox-float-url-bar')
    if (urlBar) {
      const a = urlBar.querySelector('a')
      if (a) a.href = shareUrl
    }
    // 尝试 iframe 播放（可能失败）
    if (vidWrap && !vidWrap.innerHTML.includes('iframe')) {
      const safeUrl = /^https?:\/[^\/]+/.test(shareUrl) ? shareUrl : ''
      const iframe = document.createElement('iframe')
      iframe.src = safeUrl
      iframe.style.cssText = 'width:100%;height:100%;border:none;background:#000'
      iframe.allow = 'autoplay; fullscreen'
      vidWrap.appendChild(iframe)
    }
  }

  function parsePlaylist(from, url) {
    if (!url) return []
    const sources = []
    url.split('$$$').forEach((part, i) => {
      const name = (from || '').split('$$$')[i] || ('源' + (i + 1))
      sources.push({
        name,
        urls: part.split('#').map(p => {
          const idx = p.indexOf('$')
          return idx >= 0
            ? { name: p.slice(0, idx) || '未知', url: p.slice(idx + 1) }
            : { name: '未知', url: p }
        }).filter(ep => ep.url)
      })
    })
    return sources
  }
}
