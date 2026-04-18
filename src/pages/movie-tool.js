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

// 加载 TVBox API 配置
async function loadTvboxConfig(api) {
  if (_tvboxCache[api.key]) return _tvboxCache[api.key]
  try {
    const resp = await fetch(api.url, { signal: AbortSignal.timeout(20000) })
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    const config = await resp.json()
    _tvboxCache[api.key] = config
    return config
  } catch (e) { console.warn('[movie-tool] TVBox load failed:', api.name, e.message); return null }
}

// 解析 TVBox JSON list → 标准化视频列表
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
  return parseTvboxList(config).filter(v =>
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

const VOD_CATEGORIES = [
  { id: 'movie',   name: '电影',   typeId: '1' },
  { id: 'tv',      name: '电视剧', typeId: '2' },
  { id: 'variety', name: '综艺',   typeId: '3' },
  { id: 'anime',   name: '动漫',   typeId: '4' },
  { id: 'short',   name: '短剧',   typeId: '5' },
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
    for (const item of doc.querySelectorAll('item')) {
      const vod = {}
      for (const child of item.children) vod[child.nodeName] = child.textContent
      list.push(vod)
    }
    return { list, total: list.length }
  } catch { return { list: [], total: 0 } }
}

// ── 网络请求 ──
async function fetchJSON(url) {
  const resp = await fetch(url, {
    signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined,
    headers: { 'Referer': 'https://claw.qt.cool/' }
  })
  if (!resp.ok) throw new Error('HTTP ' + resp.status)
  const text = await resp.text()
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
  el.className = 'tvbox-page-root'
  _el = el
  _viewStack = []
  root.appendChild(el)
  initApp(el)
  return el
}

function initApp(el) {
  el.innerHTML = `
    <div class="tvbox-toolbar">
      <div class="tvbox-toolbar-top">
        <div class="tvbox-logo">🎬 屠戮影视 <span style="font-size:11px;color:#888;font-weight:normal">v8</span></div>
        <div class="tvbox-src-switch" id="t-mode-switch">
          <button class="tvbox-mode-btn active" data-mode="vod">📺 影视点播</button>
          <button class="tvbox-mode-btn" data-mode="live">📡 电视直播</button>
          <button class="tvbox-mode-btn" data-mode="tvboxjson">🔗 TVBox JSON</button>
        </div>
        <button id="t-api-manage" title="TVBox API 管理" style="background:none;border:none;color:#888;cursor:pointer;font-size:16px;padding:4px 6px;border-radius:6px">⚙️</button>
      </div>
      <div class="tvbox-search">
        <input type="text" id="t-search" placeholder="搜索电影、剧集、综艺、动漫..." />
        <button class="tvbox-search-btn" id="t-search-btn">🔍</button>
      </div>
      <div class="tvbox-tabs-wrap" id="t-cat-tabs"></div>
      <div id="t-src-tabs-wrap"><div class="tvbox-tabs-wrap" id="t-src-tabs"></div></div>
      <div class="tvbox-history" id="t-history" style="display:none">
        <div class="tvbox-history-label">
          搜索历史
          <button class="tvbox-history-clear" id="t-clear-history">清除</button>
        </div>
        <div class="tvbox-history-tags" id="t-history-tags"></div>
      </div>
    </div>
    <div class="tvbox-content" id="t-content"><div class="tvbox-loading">加载中...</div></div>

    <div class="tvbox-player-overlay" id="t-player-overlay" style="display:none">
      <div class="tvbox-player-box">
        <div class="tvbox-player-header">
          <span class="tvbox-player-title" id="t-player-title">播放中</span>
          <button class="tvbox-player-close" id="t-player-close">✕</button>
        </div>
        <div class="tvbox-player-body" id="t-player-body"><div class="tvbox-player-loading">正在加载播放器...</div></div>
        <div class="tvbox-player-url-bar">
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
  searchInput.addEventListener('blur', () => setTimeout(() => el.querySelector('#t-history').style.display = 'none', 200))
  el.querySelector('#t-clear-history').addEventListener('click', e => { e.stopPropagation(); clearSearchHistory(); renderSearchHistory() })
  el.querySelector('#t-player-close').addEventListener('click', closePlayer)
  el.querySelector('#t-player-overlay').addEventListener('click', e => { if (e.target === el.querySelector('#t-player-overlay')) closePlayer() })

  // 模式切换（vod / live / tvboxjson）
  el.querySelectorAll('.tvbox-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode
      el.querySelectorAll('.tvbox-mode-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      page = 1; query = ''; searchInput.value = ''; hideHistory(); _viewStack = []
      if (mode === 'live') {
        el.querySelector('#t-cat-tabs').innerHTML = ''
        el.querySelector('#t-src-tabs-wrap').style.display = 'block'
        _tvboxMode = false
        renderSrcTabs()
      } else if (mode === 'tvboxjson') {
        el.querySelector('#t-cat-tabs').innerHTML = '<button class="tvbox-tab active" data-id="all">全部</button>'
        el.querySelector('#t-src-tabs-wrap').style.display = 'block'
        _tvboxMode = true
        src = 0
        renderTvboxSrcTabs()
      } else {
        _tvboxMode = false
        renderCatTabs()
        renderSrcTabs()
      }
      if (mode === 'live') loadData()
      else if (mode === 'tvboxjson') loadTvboxList()
      else if (getPlayHistory().length > 0) showPlayHistory()
      else loadData()
    })
  })

  // API 管理按钮
  el.querySelector('#t-api-manage').addEventListener('click', showApiManage)

  renderCatTabs()
  renderSrcTabs()
  if (getPlayHistory().length > 0 && cat !== 'live') showPlayHistory()
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

  function hideHistory() { el.querySelector('#t-history').style.display = 'none' }

  function showPlayHistory() {
    const h = getPlayHistory().slice(0, 12)
    const content = el.querySelector('#t-content')
    if (!h.length) { loadData(); return }

    let html = '<div class="tvbox-section-title">📜 最近播放 <button class="tvbox-history-clear" id="t-clear-play" style="float:right;font-size:11px">清除全部</button></div>'
    html += '<div class="tvbox-grid">'
    h.forEach(item => {
      const pct = item.duration > 0 ? Math.round((item.progress / item.duration) * 100) : 0
      const resumeLabel = pct > 95 ? '已看完' : pct > 2 ? '续▶ ' + pct + '%' : ''
      html += '<div class="tvbox-card' + (resumeLabel ? ' has-resume' : '') + '" data-id="' + item.id + '" data-source="' + item.source + '" data-name="' + item.name + '" data-pic="' + item.pic + '" data-epname="' + (item.epName || '') + '" data-epurl="' + (item.epUrl || '') + '" data-progress="' + item.progress + '" data-duration="' + (item.duration || 0) + '">' +
        '<div class="tvbox-pic">' +
          '<img src="' + escHtml(item.pic) + '" alt="' + escHtml(item.name) + '" onerror="this.style.display=\'none\';this.parentElement.innerHTML=\'<span class=tvbox-placeholder>🎬</span>\'" />' +
          (resumeLabel ? '<span class="tvbox-resume-badge">' + resumeLabel + '</span>' : '') +
        '</div>' +
        '<div class="tvbox-info"><div class="tvbox-title">' + item.name + '</div><div class="tvbox-sub">' + (item.epName || '') + '</div></div>' +
      '</div>'
    })
    html += '</div>'
    html += '<div class="tvbox-section-title" style="margin-top:20px">📺 影视列表</div>'
    content.innerHTML = html

    content.querySelector('#t-clear-play')?.addEventListener('click', e => { e.stopPropagation(); clearPlayHistory(); loadData() })
    content.querySelectorAll('.tvbox-card').forEach(card => {
      card.addEventListener('click', () => {
        const d = card.dataset
        const pct = d.duration > 0 ? Math.round((d.progress / d.duration) * 100) : 0
        openResumePlayer(d.name, d.pic, d.id, d.epname, d.epurl, pct > 2 ? parseFloat(d.progress) : 0)
      })
    })
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

  function renderCatTabs() {
    const container = el.querySelector('#t-cat-tabs')
    container.innerHTML = VOD_CATEGORIES.map(c =>
      '<button class="tvbox-tab ' + (c.id === cat ? 'active' : '') + '" data-id="' + c.id + '">' + c.name + '</button>'
    ).join('')
    container.querySelectorAll('.tvbox-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        cat = btn.dataset.id
        page = 1
        query = ''
        searchInput.value = ''
        hideHistory()
        _viewStack = []
        renderCatTabs()
        renderSrcTabs()
        if (cat === 'live') loadData()
        else if (getPlayHistory().length > 0 && !query) showPlayHistory()
        else loadData()
      })
    })
  }

  function renderSrcTabs() {
    const wrap = el.querySelector('#t-src-tabs-wrap')
    const container = el.querySelector('#t-src-tabs')
    const list = cat === 'live' ? TV_SOURCES : VOD_SOURCES
    wrap.style.display = 'block'
    container.innerHTML = list.map((s, i) =>
      '<button class="tvbox-tab ' + (i === src ? 'active' : '') + '" data-idx="' + i + '">' + s.name + '</button>'
    ).join('')
    container.querySelectorAll('.tvbox-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        src = parseInt(btn.dataset.idx)
        page = 1
        hideHistory()
        renderSrcTabs()
        loadData()
      })
    })
  }

  function loadData() {
    const content = el.querySelector('#t-content')
    content.innerHTML = '<div class="tvbox-loading">加载中...</div>'
    try {
      if (cat === 'live') loadLive()
      else if (_tvboxMode) { if (query) loadTvboxSearch(); else loadTvboxList() }
      else if (query) loadSearch()
      else loadList()
    } catch (e) {
      content.innerHTML = '<div class="tvbox-empty">加载失败: ' + e.message + '</div>'
    }
  }

  async function loadList() {
    const source = VOD_SOURCES[src]
    const catObj = VOD_CATEGORIES.find(c => c.id === cat)
    let json = { list: [], total: 0 }
    try { json = await fetchJSON(source.api + '?ac=list&t=' + catObj.typeId + '&pg=' + page) } catch {}
    if (!json.list) {
      try { json = await fetchJsonp(source.api + '?ac=list&t=' + catObj.typeId + '&pg=' + page) } catch {}
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
    const all = parseTvboxList(config)
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
    const content = el.querySelector('#t-content')
    if (!list || !list.length) {
      content.innerHTML = '<div class="tvbox-empty">暂无数据，请尝试其他分类或关键词搜索</div>'
      return
    }
    const history = getPlayHistory()
    const sourceName = VOD_SOURCES[src].name
    const totalPages = Math.max(1, Math.ceil(total / 20))

    let html = '<div class="tvbox-grid">'
    html += list.map(item => {
      const histItem = history.find(h => h.id == item.vod_id && h.source === sourceName)
      const pct = histItem && histItem.duration > 0 ? Math.round((histItem.progress / histItem.duration) * 100) : 0
      const resumeLabel = pct > 95 ? '已看完' : pct > 2 ? '续▶ ' + pct + '%' : ''
      return '<div class="tvbox-card' + (resumeLabel ? ' has-resume' : '') + '" data-id="' + item.vod_id + '" data-source="' + sourceName + '" data-name="' + item.vod_name + '" data-pic="' + item.vod_pic + '">' +
        '<div class="tvbox-pic">' +
          '<img src="' + escHtml(item.vod_pic) + '" alt="' + escHtml(item.vod_name) + '" onerror="this.style.display=\'none\';this.parentElement.innerHTML=\'<span class=tvbox-placeholder>🎬</span>\'" />' +
          '<span class="tvbox-tag">' + escHtml(item.type_name || '影视') + '</span>' +
          (item.vod_score ? '<span class="tvbox-score">' + escHtml(item.vod_score) + '</span>' : '') +
          (resumeLabel ? '<span class="tvbox-resume-badge">' + resumeLabel + '</span>' : '') +
        '</div>' +
        '<div class="tvbox-info"><div class="tvbox-title">' + item.vod_name + '</div><div class="tvbox-sub">' + (item.vod_actor || '未知主演') + '</div></div>' +
      '</div>'
    }).join('')
    html += '</div>'
    if (totalPages > 1) html += renderPagination(page, totalPages)
    content.innerHTML = html

    content.querySelectorAll('.tvbox-card').forEach(card => {
      card.addEventListener('click', () => {
        _viewStack.push('list')
        openDetail(card.dataset.id, card.dataset.name, card.dataset.source, card.dataset.pic)
      })
    })
    content.querySelectorAll('.tvbox-page-btn[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        page = parseInt(btn.dataset.page)
        hideHistory()
        loadData()
        el.querySelector('.tvbox-content').scrollTop = 0
      })
    })
  }

  async function loadLive() {
    const source = TV_SOURCES[src]
    const content = el.querySelector('#t-content')
    content.innerHTML = '<div class="tvbox-loading">正在加载直播频道...</div>'
    let raw = tvCache[src]
    if (!raw) {
      try {
        raw = await fetch(source.api, { signal: AbortSignal.timeout(20000) }).then(r => r.text())
        tvCache[src] = raw
      } catch (e) {
        content.innerHTML = '<div class="tvbox-empty">加载失败: ' + e.message + '</div>'
        return
      }
    }
    renderTvGrid(parseNzk(raw))
  }

  function renderTvGrid(categories) {
    const content = el.querySelector('#t-content')
    if (!categories || !categories.length) { content.innerHTML = '<div class="tvbox-empty">暂无频道数据</div>'; return }
    content.innerHTML = categories.slice(0, 30).map(cat => {
      if (!cat.channels || !cat.channels.length) return ''
      const chHtml = cat.channels.slice(0, 60).map(ch =>
        '<div class="tvbox-ch-item" data-url="' + escHtml(ch.url) + '" data-name="' + escHtml(ch.name) + '">' +
          '<span>📺</span><span class="tvbox-ch-name">' + escHtml(ch.name) + '</span>' +
        '</div>'
      ).join('')
      return '<div class="tvbox-cat-block">' +
        '<div class="tvbox-cat-title">' + escHtml(cat.name) + ' (' + cat.channels.length + ')</div>' +
        '<div class="tvbox-ch-grid">' + chHtml + '</div>' +
      '</div>'
    }).join('')
    content.querySelectorAll('.tvbox-ch-item').forEach(node => {
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
    else // URL 格式校验
        var safeUrl = url && /^https?:\/\//i.test(url) ? url : '';
        body.innerHTML = '<div class="tvbox-iframe-wrap"><iframe src="' + safeUrl + '" allowfullscreen allow="autoplay; fullscreen" style="width:100%;height:100%;border:none"></iframe></div>'
  }

  async function openDetail(id, name, sourceName, pic) {
    const source = VOD_SOURCES[src]
    const content = el.querySelector('#t-content')
    content.innerHTML = '<div class="tvbox-loading">加载中...</div>'
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

    const backBtn = '<div style="margin-bottom:12px"><button class="tvbox-back-btn" id="t-detail-back">← 返回列表</button></div>'
    const firstUrls = episodes[0]?.urls || []
    const siHtml = episodes.length > 1
      ? '<div style="margin-bottom:10px"><span style="font-size:12px;color:#666">选择源：</span>' +
          episodes.map((e, i) => '<button class="tvbox-tab' + (i===0?' active':'') + '" style="margin-right:6px;margin-bottom:6px" data-si="' + i + '">' + e.name + '</button>').join('') +
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
    else body.innerHTML = '<div class="tvbox-iframe-wrap"><iframe src="' + safeUrl(url) + '" allowfullscreen allow="autoplay; fullscreen" style="width:100%;height:100%;border:none"></iframe></div>'
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
        hls.on(window.Hls.Events.ERROR, () => {
          window._movieHls = null
          body.innerHTML = '<div style="text-align:center;padding:40px"><p style="color:#6b6b8a;margin-bottom:14px">m3u8 播放失败</p><a href="' + videoUrl + '" target="_blank" class="tvbox-open-ext">↗ 在浏览器中打开</a></div>'
        })
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
