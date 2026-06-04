/**
 * 星枢影视 - 影视点播 + 电视直播
 * VOD: 多源聚合（暴风/星之尘/天涯/饭太稀/肥猫）
 * TV: 多源直播（繁星/聚浪等M3U源）
 * 基于 TVAPP (youhunwl/TVAPP) 影视仓框架分析
 * 2026-04-13 v8
 */

import '../style/movie-tool.css'
import { t, getLang } from '../lib/i18n.js'

function mt(key, params) {
  return t('movieTool.' + key, params)
}

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

function normalizeHttpUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    return parsed.href
  } catch {
    return ''
  }
}

function isDirectVideoUrl(url) {
  return /\.(m3u8|mp4|mpd)(?:[?#]|$)/i.test(String(url || ''))
}

const VOD_SOURCES = [
  { key: 'lzzy',   name: '🌺量子资源', api: 'https://cj.lziapi.com/api.php/provide/vod',       type: 'tvbox' },
  { key: 'bfzy',   name: '🌺暴风资源', api: 'https://bfzyapi.com/api.php/provide/vod',       type: 'tvbox' },
  { key: 'xsd',    name: '🌺星之尘',  api: 'https://xsd.sdzyapi.com/api.php/provide/vod',   type: 'tvbox' },
  { key: 'tyys',   name: '🌺天涯资源', api: 'https://tyyszy.com/api.php/provide/vod',      type: 'tvbox' },
]

const TV_SOURCES = [
  { key: 'fanming', name: '📺繁星直播', api: 'https://live.fanmingming.com/live.txt' },
  { key: 'julan',   name: '📺聚浪TV',   api: 'http://julan.ml/live.txt' },
]

// ── TVBox JSON API（通过 cdn.jsdelivr.net 代理 GitHub）───────────────────────
// ── TVBox CDN 多镜像（jsdelivr 挂了时自动回退）──────────
function tvboxMirrors(url) {
  if (!url || !url.includes('cdn.jsdelivr.net')) return [url];
  // https://cdn.jsdelivr.net/gh/user/repo@branch/path → 提取 user/repo@branch 和 path
  const match = url.match(/cdn\.jsdelivr\.net\/gh\/([^@]+)\/(.+)/);
  if (!match) return [url];
  const repoPart = match[1]; // user/repo@branch
  const path = match[2];
  return [
    url,
    'https://ghproxy.com/https://raw.githubusercontent.com/' + repoPart + '/' + path,
    'https://mirror.ghproxy.com/https://raw.githubusercontent.com/' + repoPart + '/' + path,
  ].filter(Boolean);
}

const TVBOX_BUILTIN = [
  { key: 'fongmi',    name: '🌺FongMi',    url: 'https://cdn.jsdelivr.net/gh/FongMi/CatVodSpider@main/json/b.json',        note: '推荐' },
  { key: 'hjd',       name: '🌺HJD TVBox', url: 'https://cdn.jsdelivr.net/gh/hjdhnx/Dr_TVBox@main/json/api.json',          note: '' },
  { key: 'cattorn',   name: '🌺Cat TVBox', url: 'https://cdn.jsdelivr.net/gh/CatTornado/TVBox@main/json/api.json',          note: '' },
  { key: 'sunpolar',  name: '🌺SunPolar',  url: 'https://cdn.jsdelivr.net/gh/SunPolar/TVBox@main/json/api.json',            note: '' },
  { key: 'imdgo',     name: '🌺imDgo',    url: 'https://cdn.jsdelivr.net/gh/imDgo/TVBox@main/json/api.json',              note: '' },
  { key: 'q215',      name: '🌺q215 TVBox',url: 'https://cdn.jsdelivr.net/gh/q215813905/TVBox@main/json/api.json',         note: '' },
  { key: '173799616', name: '🌺173仓',     url: 'https://cdn.jsdelivr.net/gh/173799616/TVBox@master/json/api.json',        note: '' },
  { key: '7wf',       name: '🌺7尿壶',     url: 'https://cdn.jsdelivr.net/gh/7%E5%B0%BF%E5%A3%B6/TVBox@main/json/apijson.json', note: '' },
  { key: 'yyfxz',     name: '🌺业余打发',  url: 'https://cdn.jsdelivr.net/gh/yyfxz/qqtv@main/qq.json',                  note: '' },
  { key: '240584984', name: '🌺240仓',     url: 'https://cdn.jsdelivr.net/gh/240584984/TVBox@master/json/TVBox.json',      note: '' },
  { key: 'gaomingxu', name: '🌺高命续',    url: 'https://cdn.jsdelivr.net/gh/gaomingxu/TVBox@main/json.json',             note: '' },
  { key: '881014',    name: '🌺881仓',    url: 'https://cdn.jsdelivr.net/gh/881014/TVBox@main/TVBox.json',              note: '' },
  { key: 'kvymin',    name: '🌺KvyMin',   url: 'https://cdn.jsdelivr.net/gh/kvymin/TVBox@main/json/api.json',            note: '' },
  { key: 'mochi',     name: '🌺Mochi',    url: 'https://cdn.jsdelivr.net/gh/dmdql037/TVBox_Mochi@main/json/bili.json',    note: '' },
  { key: 'laoe',      name: '🌺老鹅',     url: 'https://cdn.jsdelivr.net/gh/laoe/TVBox@main/json/api.json',              note: '' },
  { key: 'wxtvbox',   name: '🌺WxtvBox',  url: 'https://cdn.jsdelivr.net/gh/s情妖/TVBox@main/json.json',                note: '' },
  { key: 'dd520',     name: '🌺DD520',    url: 'https://cdn.jsdelivr.net/gh/dd520666/TVBox@main/json/api.json',         note: '' },
  { key: 'tvcloud',   name: '🌺TVCloud', url: 'https://cdn.jsdelivr.net/gh/Guovin/TV@main/json/gq.json',              note: '' },
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
// ── Wex JSON 配置加载───────────────────────────────
async function loadWexConfig(api) {
  if (_tvboxCache[api.key]) return _tvboxCache[api.key]
  try {
    const resp = await fetch(api.url, { signal: AbortSignal.timeout(15000) })
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    const text = await resp.text()
    let config
    try { config = JSON.parse(text) }
    catch { config = null }
    if (!config || !(config.list || config.urls || Array.isArray(config))) {
      console.warn('[movie-tool] Wex config invalid:', api.name)
      return null
    }
    _tvboxCache[api.key] = config
    return config
  } catch (e) { console.warn('[movie-tool] Wex load failed:', e.message); return null }
}

async function loadTvboxConfig(api) {
  if (api.type === 'wex') return loadWexConfig(api)
  if (_tvboxCache[api.key]) return _tvboxCache[api.key]

  // ── 优先：直接 fetch（Tauri WebView 无 CORS 限制）──────────
  try {
    const resp = await fetch(api.url, {
      signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined,
      credentials: 'include'
    })
    if (resp.ok) {
      const text = await resp.text()
      let config
      try { config = JSON.parse(text) }
      catch { config = parseXml(text) }
      if (isValidMovieConfig(config)) {
        _tvboxCache[api.key] = config
        return config
      }
    }
  } catch { /* 降级到 Tauri 后端 */ }

  // ── 降级：Tauri 后端代理（绕过 CORS）────────────────
  try {
    const { invoke } = await import('@tauri-apps/api/core').catch(() => ({}))
    if (invoke) {
      const text = await Promise.race([
        invoke('vod_fetch', { url: api.url }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('vod_fetch timeout')), 20000))
      ])
      if (text && typeof text === 'string') {
        let config
        try { config = JSON.parse(text) }
        catch { config = parseXml(text) }
        if (isValidMovieConfig(config)) {
          _tvboxCache[api.key] = config
          return config
        }
      }
    }
  } catch { /* 降级到直接 fetch */ }

  // ── 最终降级：直接 fetch（网络问题兜底）─────────────
  try {
    const resp = await fetch(api.url, { signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined })
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    const text = await resp.text()
    let config
    try { config = JSON.parse(text) }
    catch { config = parseXml(text) }
    if (!isValidMovieConfig(config)) {
      console.warn('[movie-tool] TVBox config invalid or empty:', api.name, config)
      return null
    }
    _tvboxCache[api.key] = config
    return config
  } catch (e) { console.warn('[movie-tool] TVBox load failed:', api.name, e.message); return null }
}

function isValidMovieConfig(config) {
  if (!config) return false
  if (Array.isArray(config.sites) && config.sites.length) return true
  if (Array.isArray(config.list) && config.list.length) return true
  if (config.total) return true
  return false
}

function normalizeCmsApiBase(api) {
  if (!api || typeof api !== 'string') return ''
  let base = api.trim()
  if (!/^https?:\/\//i.test(base)) return ''
  base = base.replace(/\/?$/, '')
  if (/\/api\.php\/provide\/vod\/?$/i.test(base)) return base
  if (/\/api\.php\/?$/i.test(base)) return base.replace(/\/api\.php\/?$/i, '/api.php/provide/vod')
  if (/\/provide\/vod\/?$/i.test(base)) return base
  return base
}

function getSearchableTvboxSites(config) {
  const sites = Array.isArray(config?.sites) ? config.sites : []
  return sites
    .filter(site => site && site.api && site.searchable !== 0 && (site.type === 1 || site.type === 3 || site.type == null))
    .map(site => ({ ...site, api: normalizeCmsApiBase(site.api) }))
    .filter(site => site.api)
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
async function searchTvboxList(config, kw, api = null) {
  const q = (kw || '').toLowerCase()
  const local = parseVideoList(config).filter(v =>
    v.vod_name.toLowerCase().includes(q) ||
    (v.vod_actor && v.vod_actor.toLowerCase().includes(q))
  )
  if (local.length) return local

  const directApis = api?.api ? [{ name: api.name || '当前源', api: normalizeCmsApiBase(api.api) }] : []
  const targets = [...directApis, ...getSearchableTvboxSites(config)].filter(s => s.api).slice(0, 16)
  if (!targets.length) return []

  const merged = []
  const seen = new Set()
  for (const site of targets) {
    const urls = [
      site.api + '?ac=videolist&wd=' + encodeURIComponent(kw) + '&pg=1',
      site.api + '?ac=videolist&zm=' + encodeURIComponent(kw) + '&pg=1',
      site.api + '?ac=list&wd=' + encodeURIComponent(kw) + '&pg=1',
      site.api + '?ac=detail&wd=' + encodeURIComponent(kw),
    ]
    for (const url of urls) {
      let list = []
      try { list = parseVideoList(await fetchJSON(url)) } catch {}
      if (!list.length) { try { list = parseVideoList(await fetchJsonp(url)) } catch {} }
      if (list.length) {
        for (const item of list) {
          const key = (item.vod_id || item.vod_name || Math.random().toString()) + '|' + site.api
          if (!seen.has(key)) {
            seen.add(key)
            merged.push({ ...item, _srcName: site.name || api?.name || 'TVBox', _tvboxApi: site.api })
          }
        }
        break
      }
    }
    if (merged.length >= 80) break
  }
  return merged
}

// ── 获取当前活跃 TVBox 源（内置优先，自定义次之）
function getActiveTvbox() {
  const key = getActiveTvboxKey()
  return TVBOX_BUILTIN.find(a => a.key === key) || _customTvbox.find(a => a.key === key) || TVBOX_BUILTIN[0] || null
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
  bfzy:   { movie: 20, tv: 30, variety: 27, anime: 25, short: 28 },  // 暴风资源
  xsd:    { movie: 6,  tv: 7,  variety: 16, anime: 25, short: 28 },   // 星之尘（实际typeId从6开始，非1）
  tyys:   { movie: 6,  tv: 7,  variety: 16, anime: 25, short: 28 },   // 天涯资源
}

const VOD_CATEGORIES = [
  { id: 'movie',   nameKey: 'categoryMovie', name: '电影' },
  { id: 'tv',      nameKey: 'categoryTv', name: '电视剧' },
  { id: 'variety', nameKey: 'categoryVariety', name: '综艺' },
  { id: 'anime',   nameKey: 'categoryAnime', name: '动漫' },
  { id: 'short',   nameKey: 'categoryShort', name: '短剧' },
]

function categoryName(category) {
  return category?.nameKey ? mt(category.nameKey) : (category?.name || mt('uncategorized'))
}

// 自适应分类缓存：{ sourceKey: [{ id: 'movie', name: '电影', typeId: 1 }, ...] }
let _catCache = {}

const HLS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js'
const KEY_SEARCH = 'tulu_vod_search'
const KEY_PLAY   = 'tulu_vod_play'

let cat = 'movie'
let src = 0
let tvSrc = 0
let page = 1
let query = ''
let tvCache = {}
const _sourceHealth = {}
let _currentTypeId = null  // 当前选中分类的 typeId（自适应分类用）
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
  // 用 id + source + epName 三元组区分同一部剧的不同集数
  let h = getPlayHistory().filter(s => !(
    s.id === item.id && s.source === item.source && s.epName === item.epName
  ))
  h.unshift({ ...item, updatedAt: Date.now() })
  savePlayHistory(h.slice(0, 50))
}
function updatePlayProgress(id, source, progress, epName, duration) {
  let h = getPlayHistory()
  let idx = h.findIndex(s => s.id === id && s.source === source && (epName == null || s.epName === epName))
  if (idx >= 0) {
    h[idx].progress = progress
    if (typeof duration === 'number' && duration > 0) h[idx].duration = duration
    h[idx].updatedAt = Date.now()
  }
  savePlayHistory(h)
}
function clearPlayHistory() { savePlayHistory([]) }

// ── 监听独立播放器窗口的消息（Tauri event + postMessage fallback） ──
let _playerEventUnlisten = null
async function setupPlayerEventListener() {
  if (_playerEventUnlisten) return
  try {
    const { listen } = await import('@tauri-apps/api/event').catch(() => ({}))
    if (listen) {
      _playerEventUnlisten = await listen('player-event', (e) => {
        handlePlayerMessage(e.payload)
      })
    }
  } catch(e) {}
}
function handlePlayerMessage(d) {
  if (!d || d.type !== 'playerProgress' && d.type !== 'playerEnded') return
  const { id, source, epName } = d.playbackCtx || {}
  if (!id || !source) return
  if (d.type === 'playerProgress') {
    updatePlayProgress(id, source, Number(d.currentTime) || 0, epName, Number(d.duration) || 0)
  } else if (d.type === 'playerEnded') {
    updatePlayProgress(id, source, 999, epName, Number(d.duration) || 0)
  }
}
// postMessage fallback（保留给 web 模式或其他不适用 Tauri event 的场景）
window.addEventListener('message', (e) => {
  const d = e.data
  if (!d || d.type !== 'playerProgress' && d.type !== 'playerEnded') return
  handlePlayerMessage(d)
})
// 初始化 Tauri event listener
setupPlayerEventListener()

function exportFavorites() {
  const data = getPlayHistory()
  if (!data.length) { alert(mt('favoritesEmpty')); return }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'tulu_favorites.json' })
  a.click()
}
function importFavorites() {
  const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' })
  inp.addEventListener('change', () => {
    const f = inp.files[0]; if (!f) return
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const arr = JSON.parse(e.target.result)
        if (!Array.isArray(arr)) throw new Error('not array')
        const existing = getPlayHistory()
        const merged = [...arr.reverse(), ...existing]
        const seen = new Set(); const deduped = merged.filter(s => { if (seen.has(s.id + '|' + s.source)) return false; seen.add(s.id + '|' + s.source); return true }).slice(0, 30)
        savePlayHistory(deduped)
        alert(mt('favoritesImportSuccess', { count: deduped.length }))
        loadData()
      } catch { alert(mt('favoritesImportInvalid')) }
    }
    reader.readAsText(f)
  })
  inp.click()
}

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

// 优先直接 fetch，失败走 Tauri Rust 后端，再失败走 CORS 代理
async function vodApiFetch(url, signal) {
  // ── 方式1: Tauri Rust 后端代理（绕过 CORS，Tauri 2.x 必须走这里）────────
  try {
    const { invoke } = await import('@tauri-apps/api/core').catch(() => ({}))
    if (invoke) {
      const ctrl = new AbortController()
      const tid = setTimeout(() => ctrl.abort(), 5000) // 5秒超时，不等20秒
      const text = await Promise.race([
        invoke('vod_fetch', { url }),
        new Promise(resolve => setTimeout(() => resolve(null), 4500))
      ]).catch(e => { clearTimeout(tid); return null })
      clearTimeout(tid)
      if (text && typeof text === 'string' && text.trim()) {
        try { console.info('[vodApiFetch] Tauri后端成功:', url.slice(0, 80)); return JSON.parse(text) } catch(e) { console.warn('[vodApiFetch] Tauri JSON解析失败:', e.message); return null }
      }
    } else { console.warn('[vodApiFetch] Tauri API 不可用') }
  } catch (e) { console.warn('[vodApiFetch] Tauri降级异常:', e.message) }

  // ── 方式2: CORS 代理（allorigins → corsproxy.io）───────────────────────
  const proxies = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
  ]
  for (const proxy of proxies) {
    try {
      const resp = await fetch(proxy + encodeURIComponent(url), { signal: AbortSignal.timeout ? AbortSignal.timeout(3500) : undefined })
      if (resp.ok) {
        const txt = await resp.text()
        try { console.info('[vodApiFetch] 代理成功:', proxy.slice(0, 30), url.slice(0, 50)); return JSON.parse(txt) } catch(e) { console.warn('[vodApiFetch] 代理JSON解析失败:', proxy, e.message) }
      }
    } catch (e) { console.warn('[vodApiFetch] 代理异常:', proxy, e.message) }
  }

  // ── 方式3: 直接 fetch（最后兜底，5秒超时）─────────────────────────────
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(3500) : undefined })
    if (resp.ok) {
      const txt = await resp.text()
      try { console.info('[vodApiFetch] 直接fetch成功(兜底):', url.slice(0, 80)); return JSON.parse(txt) } catch { return null }
    }
  } catch (e) { console.warn('[vodApiFetch] 直接fetch异常(兜底):', e.message, url.slice(0, 80)) }

  return { list: [], total: 0 }
}

// 普通请求（非 JSON）
async function webFetch(url) {
  const resp = await fetch(url, {
    signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined,
    credentials: 'include',
    headers: { 'Referer': 'https://claw.qt.cool/' }
  })
  if (!resp.ok) throw new Error('HTTP ' + resp.status)
  return resp.text()
}

// 通用 JSON 获取（自动降级）
async function fetchJSON(url, signal) {
  let json = await vodApiFetch(url, signal)
  if (json) return json
  // Rust 后端失败，降级到浏览器 fetch
  let text
  try { text = await webFetch(url) } catch { return { list: [], total: 0 } }
  try { return JSON.parse(text) } catch { try { return parseXml(text) } catch { return { list: [], total: 0 } } }
}

function movieNameMatches(item, kw) {
  const q = String(kw || '').trim().toLowerCase()
  if (!q) return true
  const name = String(item?.vod_name || item?.name || item?.title || '').toLowerCase()
  if (!name) return false
  return name.includes(q)
}

function filterSearchResults(list, kw) {
  const exact = (list || []).filter(item => movieNameMatches(item, kw))
  return exact
}

function getVodSourceBase(itemSrcKey, itemApi) {
  if (itemApi) return itemApi.replace(/\/api\.php.*$/, '')
  const key = itemSrcKey || VOD_SOURCES[src]?.key
  const s = VOD_SOURCES.find(s => s.key === key)
  return s?.api ? s.api.replace(/\/api\.php.*$/, '') : ''
}

function fixPosterUrl(url, itemSrcKey, itemApi) {
  if (!url) return ''
  const raw = String(url || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('//')) return 'https:' + raw
  const base = getVodSourceBase(itemSrcKey, itemApi)
  return base ? base + (raw.startsWith('/') ? raw : '/' + raw) : raw
}

function buildPicCandidates(url, itemSrcKey, itemApi) {
  const raw = String(url || '').trim()
  if (!raw) return []
  const base = getVodSourceBase(itemSrcKey, itemApi)
  const direct = fixPosterUrl(raw, itemSrcKey, itemApi)
  const candidates = [direct]
  if (base && raw.startsWith('/')) candidates.push(base + raw)
  if (base && !/^https?:\/\//i.test(raw) && !raw.startsWith('//')) candidates.push(base + '/' + raw.replace(/^\/+/, ''))
  if (/^https?:\/\//i.test(raw)) {
    const strip = raw.replace(/^https?:\/\//i, '')
    candidates.push('https://images.weserv.nl/?url=' + encodeURIComponent(strip))
    candidates.push('https://proxy.this.im/image?url=' + encodeURIComponent(raw))
  }
  return [...new Set(candidates.filter(Boolean))]
}

function posterFallback(img, placeholder = '🎬') {
  if (!img) return
  const next = img.dataset.posterCands ? img.dataset.posterCands.split('||').filter(Boolean) : []
  if (next.length) {
    img.dataset.posterCands = next.slice(1).join('||')
    img.src = next[0]
    return
  }
  if (img.parentElement) img.parentElement.innerHTML = '<span class="tvbox-card-placeholder">' + placeholder + '</span>'
}

function renderPosterImg(url, alt, itemSrcKey, itemApi, placeholder = '🎬') {
  const candidates = buildPicCandidates(url, itemSrcKey, itemApi)
  if (!candidates.length) return '<span class="tvbox-card-placeholder">' + placeholder + '</span>'
  const first = candidates[0]
  return '<img src="' + escHtml(first) + '" data-poster-cands="' + escHtml(candidates.slice(1).join('||')) + '" alt="' + escHtml(alt || '') + '" loading="lazy" decoding="async" referrerpolicy="no-referrer" crossorigin="anonymous" onerror="window.__tuluPosterFallback && window.__tuluPosterFallback(this, \'' + placeholder + '\')" />'
}

function normalizeVodItem(item, source) {
  const name = item?.vod_name || item?.name || item?.title || item?.vod_title || ''
  const pic = item?.vod_pic || item?.pic || item?.thumb || item?.cover || item?.poster || item?.image || item?.img || ''
  return {
    ...item,
    vod_id: item?.vod_id || item?.id || item?.player_id || name,
    vod_name: name,
    vod_pic: pic,
    type_name: item?.type_name || item?.type || item?.class || '影视',
    vod_actor: item?.vod_actor || item?.actor || item?.stars || '',
    vod_content: item?.vod_content || item?.content || item?.desc || item?.des || item?.vod_blurb || '',
    _srcKey: item?._srcKey || source?.key || VOD_SOURCES[src]?.key,
    _srcName: item?._srcName || source?.name || VOD_SOURCES[src]?.name,
    _api: item?._api || source?.api || '',
  }
}

if (typeof window !== 'undefined') window.__tuluPosterFallback = posterFallback


async function fetchJSONFast(url, signal) {
  const tasks = []
  tasks.push(fetchJSON(url, signal))
  tasks.push(webFetch(url).then(text => {
    try { return JSON.parse(text) } catch { try { return parseXml(text) } catch { return { list: [], total: 0 } } }
  }).catch(() => ({ list: [], total: 0 })))
  const timeout = new Promise(resolve => setTimeout(() => resolve({ list: [], total: 0, _timeout: true }), 4500))
  const first = await Promise.race([...tasks.map(p => p.then(j => (j?.list?.length || j?.total) ? j : null).catch(() => null)), timeout])
  if (first) return first
  const settled = await Promise.allSettled(tasks)
  for (const r of settled) if (r.status === 'fulfilled' && r.value) return r.value
  return { list: [], total: 0 }
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
  // 全局调试状态
  window._tuluMovieDebug = { status: mt('debugInitializing'), api: '', error: '' }
  initApp(el)
  return el
}

function initApp(el) {
  el.innerHTML = `
    <nav class="tvbox-navbar">
      <div class="tvbox-brand">
        <div class="tvbox-brand-icon">🎬</div>
        <div>
          <div class="tvbox-brand-name">${escHtml(mt('appTitle'))}</div>
          <div id="t-debug-status" style="font-size:10px;color:var(--text-muted);margin-top:2px"></div>
        </div>
      </div>

      <div class="tvbox-search-wrap">
        <div class="tvbox-search-box">
          <span class="tvbox-search-icon">🔍</span>
          <input class="tvbox-search-input" type="text" id="t-search" placeholder="${escHtml(mt('searchPlaceholder'))}" autocomplete="off" />
          <button class="tvbox-search-btn" id="t-search-btn">${escHtml(mt('searchButton'))}</button>
        </div>
      </div>

      <div class="tvbox-mode-tabs">
        <button class="tvbox-mode-tab active" data-mode="vod">📺 ${escHtml(mt('vodMode'))}</button>
        <button class="tvbox-mode-tab" data-mode="live">📡 ${escHtml(mt('liveMode'))}</button>
        <button class="tvbox-mode-tab" data-mode="tvboxjson">🔗 ${escHtml(mt('tvboxJsonMode'))}</button>
        <button class="tvbox-mode-tab" data-mode="crawl">🌐 ${escHtml(mt('crawlMode'))}</button>
      </div>
    </nav>

    <div class="tvbox-catbar" id="t-catbar">
      <span class="tvbox-catbar-label">${escHtml(mt('categoryLabel'))}</span>
    </div>

    <div class="tvbox-srcbar" id="t-srcbar">
      <span class="tvbox-srcbar-label">${escHtml(mt('sourceLabel'))}</span>
    </div>

    <div class="tvbox-content" id="t-content">
      <div class="tvbox-loading">
        <div class="tvbox-loading-icon"></div>
        <span class="tvbox-loading-text">${escHtml(mt('loading'))}</span>
      </div>
    </div>

    <div id="t-history-panel" style="display:none; position:fixed; top:120px; left:50%; transform:translateX(-50%); width:460px; max-width:90vw; background:var(--bg-elevated); border:1px solid var(--border); border-radius:12px; z-index:100; padding:12px 14px; box-shadow:0 16px 48px rgba(0,0,0,.7)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:12px;font-weight:600;color:var(--text-secondary)">${escHtml(mt('searchHistory'))}</span>
        <button id="t-clear-history" style="background:none;border:none;color:var(--text-muted);font-size:11px;cursor:pointer;padding:2px 6px;border-radius:4px;border:1px solid var(--border)">${escHtml(mt('clear'))}</button>
      </div>
      <div id="t-history-tags" style="display:flex;flex-wrap:wrap;gap:7px"></div>
    </div>

    <div class="tvbox-player-overlay" id="t-player-overlay" style="display:none">
      <div class="tvbox-player-box">
        <div class="tvbox-player-hdr">
          <span class="tvbox-player-title" id="t-player-title">${escHtml(mt('playing'))}</span>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="tvbox-player-mini" id="t-player-mini" title="${escHtml(mt('minimizeToFloat'))}">─</button>
            <button class="tvbox-player-close" id="t-player-close">✕</button>
          </div>
        </div>
        <div class="tvbox-player-body" id="t-player-body">
          <div class="tvbox-player-loading">${escHtml(mt('loadingPlayer'))}</div>
        </div>
        <div class="tvbox-player-foot">
          <a href="#" class="tvbox-open-ext" id="t-ext-link" target="_blank" rel="noopener">${escHtml(mt('openExternal'))}</a>
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
  el.querySelector('#t-player-mini').addEventListener('click', () => {
    const ep = playingEp
    const title = document.querySelector('#t-player-title')?.textContent || ep?.epName || mt('playing')
    closePlayer()
    if (ep?.epUrl) {
      // 查找当前剧集的历史进度
      const sp = (() => {
        const hist = getPlayHistory().find(h => h.id === ep.id && h.source === ep.source && h.epName === ep.epName)
        return (hist && hist.progress > 0 && hist.progress < 999) ? hist.progress : 0
      })()
      openFloatPlayer(title, ep.epUrl, ep.id, ep.source, ep.epName, ep.pic, ep.allUrls || [], sp, ep.allEps || null)
    }
  })
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
        el.querySelector('#t-catbar').innerHTML = '<span class="tvbox-catbar-label">' + escHtml(mt('categoryLabel')) + '</span><button class="tvbox-cat-chip active">' + escHtml(mt('allChannels')) + '</button>'
        el.querySelector('#t-catbar').querySelector('.tvbox-cat-chip').addEventListener('click', () => {})
        renderSrcBar()
      } else if (mode === 'tvboxjson') {
        el.querySelector('#t-catbar').innerHTML = '<span class="tvbox-catbar-label">' + escHtml(mt('categoryLabel')) + '</span><button class="tvbox-cat-chip active">' + escHtml(mt('all')) + '</button>'
        renderTvboxSrcTabs()
      } else if (mode === 'crawl') {
        el.querySelector('#t-catbar').innerHTML = '<span class="tvbox-catbar-label">' + escHtml(mt('crawlMode')) + '</span>'
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
    // 搜索只搜当前选中的 API 资源，避免其他源的模糊结果混入当前界面
    loadData()
  }

  function showSearchHistory() {
    const h = getSearchHistory()
    const wrap = el.querySelector('#t-history-panel')
    if (!h.length) { wrap.style.display = 'none'; return }
    wrap.style.display = 'block'
    renderSearchHistory()
  }

  function renderSearchHistory() {
    const tags = el.querySelector('#t-history-tags')
    tags.innerHTML = getSearchHistory().map(s =>
      '<span class="tvbox-history-tag" data-q="' + escHtml(s) + '">' + escHtml(s) + '</span>'
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

    let html = '<div class="tvbox-section-title"><span>📜</span>' + escHtml(mt('recentPlayback')) + ' ' +
      '<button id="_h-import" class="tvbox-clear-btn" style="margin-left:8px">📥 ' + escHtml(mt('import')) + '</button>' +
      '<button id="_h-export" class="tvbox-clear-btn" style="margin-left:4px">📤 ' + escHtml(mt('export')) + '</button>' +
      '<button id="t-clear-play" class="tvbox-clear-btn" style="margin-left:auto">' + escHtml(mt('clearAll')) + '</button></div>'
    html += '<div style="display:flex;gap:10px;overflow-x:auto;padding:8px 0 16px;scrollbar-width:none"><style>.tvbox-hist-card{flex-shrink:0;width:100px;cursor:pointer}.tvbox-hist-card:hover .tvbox-card-inner{transform:translateY(-2px);border-color:var(--border-hover)}.tvbox-hist-pic{position:relative;aspect-ratio:2/3;background:var(--bg-elevated);border-radius:var(--radius-md);overflow:hidden;border:1px solid var(--border);margin-bottom:6px}.tvbox-hist-pic img{width:100%;height:100%;object-fit:cover;display:block}.tvbox-hist-name{font-size:11px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;padding:0 2px}.tvbox-hist-ep{font-size:10px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;padding:0 2px}</style>'
    h.forEach((item, i) => {
      const source = [...VOD_SOURCES, ...TVBOX_BUILTIN].find(s => s.key === item._srcKey || s.name === item.source)
      const srcKey = source?.key || item.source
      const srcApi = source?.api || source?.url || ''
      const posterHtml = renderPosterImg(item.pic, item.name, srcKey, srcApi, '🎬')
      const pct = item.duration > 0 ? Math.round((item.progress / item.duration) * 100) : 0
      const resumeLabel = pct > 95 ? mt('watched') : pct > 2 ? mt('resumePercent', { percent: pct }) : ''
      html += '<div class="tvbox-hist-card" data-hi="' + i + '" data-progress="' + escHtml(item.progress || 0) + '" data-duration="' + escHtml(item.duration || 0) + '">' +
        '<div class="tvbox-hist-pic">' +
        posterHtml +
          (resumeLabel ? '<span style="position:absolute;top:5px;right:5px;background:rgba(16,185,129,.9);color:#fff;font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px">' + escHtml(resumeLabel) + '</span>' : '') +
          '<div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:rgba(255,255,255,.1)"><div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,var(--accent),#ec4899)"></div></div>' +
        '</div>' +
        '<div class="tvbox-hist-name">' + escHtml(item.name) + '</div>' +
        '<div class="tvbox-hist-ep">' + escHtml(item.epName || '') + '</div>' +
      '</div>'
    })
    html += '</div>'
    html += '<div class="tvbox-divider"></div>'
    html += '<div class="tvbox-section-header"><div class="tvbox-section-heading"><div class="tvbox-section-heading-dot"></div>' + escHtml(mt('movieList')) + '</div></div>'
    content.innerHTML = html + '<div id="t-main-grid"></div><div id="t-pagination"></div>'

    content.querySelector('#t-clear-play')?.addEventListener('click', e => { e.stopPropagation(); clearPlayHistory(); loadData() })
    content.querySelector('#_h-import')?.addEventListener('click', e => { e.stopPropagation(); importFavorites() })
    content.querySelector('#_h-export')?.addEventListener('click', e => { e.stopPropagation(); exportFavorites() })
    content.querySelectorAll('.tvbox-hist-card').forEach(card => {
      card.addEventListener('click', () => {
        const d = card.dataset
        const item = h[parseInt(d.hi)] || {}
        const pct = d.duration > 0 ? Math.round((parseFloat(d.progress) / parseFloat(d.duration)) * 100) : 0
        const progress = pct > 2 ? parseFloat(d.progress) : 0
        // 续播提示
        if (progress > 0) {
          const mins = Math.floor(progress / 60)
          const secs = Math.round(progress % 60)
          openResumePlayer(item.name, item.pic, item.id, item.source, item.epName, item.epUrl, progress, item.allUrls, item.allEps)
          // 显示续播提示
          try {
            const body = document.querySelector('#t-player-body')
            if (body) {
              const existing = body.querySelector('.tvbox-resume-tip')
              if (existing) existing.remove()
              const tip = document.createElement('div')
              tip.className = 'tvbox-resume-tip'
              tip.style.cssText = 'text-align:center;padding:8px;color:var(--accent);font-size:13px;cursor:pointer'
              tip.textContent = '▶ ' + mt('resumeFrom', { minutes: mins, seconds: secs })
              tip.addEventListener('click', () => {
                tip.remove()
                openResumePlayer(item.name, item.pic, item.id, item.source, item.epName, item.epUrl, progress, item.allUrls, item.allEps)
              })
              body.insertBefore(tip, body.firstChild)
              setTimeout(() => tip.remove(), 5000)
            }
          } catch {}
        } else {
          openResumePlayer(item.name, item.pic, item.id, item.source, item.epName, item.epUrl, 0, item.allUrls, item.allEps)
        }
      })
    })
    loadList()
  }

  function openResumePlayer(name, pic, id, source, epName, epUrl, progress, allUrls, allEps) {
    if (!epUrl || epUrl === '#' || epUrl === 'undefined') return
    // 先隐藏旧播放器浮层，再打开独立窗口
    const overlay = el.querySelector('#t-player-overlay')
    if (overlay) overlay.style.display = 'none'
    const urls = Array.isArray(allUrls) && allUrls.length ? allUrls : [epUrl]
    openPlayerVod(name, epUrl, id, source || 'vod_history', epName, pic, urls, progress, allEps || [])
  }

  // 从源 API 获取自适应分类列表
  async function fetchSourceCategories(sourceKey) {
    if (_catCache[sourceKey]) return _catCache[sourceKey]
    const source = VOD_SOURCES.find(s => s.key === sourceKey)
    if (!source) return VOD_CATEGORIES.map(c => ({ ...c, typeId: 1 }))
    try {
      const json = await fetchJSON(source.api + '?ac=config')
      if (json?.class && Array.isArray(json.class)) {
        const cats = json.class.map(cls => ({
          id: String(cls.type_id || cls.typeId || ''),
          name: cls.type_name || cls.name || mt('unnamed'),
          typeId: Number(cls.type_id || cls.typeId || 1),
        })).filter(c => c.typeId > 0)
        if (cats.length > 0) {
          _catCache[sourceKey] = cats
          return cats
        }
      }
    } catch {}
    // 回退到默认分类（用 typeId=1 试）
    const fallback = VOD_CATEGORIES.map(c => ({ ...c, typeId: (VOD_TYPE_MAP[sourceKey] || {})[c.id] || 1 }))
    _catCache[sourceKey] = fallback
    return fallback
  }

  async function renderCatBar(wait = false) {
    const container = el.querySelector('#t-catbar')
    const source = VOD_SOURCES[src]
    const currentSourceKey = source.key
    let cats = _catCache[source.key] || VOD_CATEGORIES.map(c => ({ ...c, typeId: (VOD_TYPE_MAP[source.key] || {})[c.id] || 1 }))
    const paint = (freshCats) => {
      if (src >= VOD_SOURCES.length || VOD_SOURCES[src].key !== currentSourceKey) return
      cats = freshCats && freshCats.length ? freshCats : cats
      if (_currentTypeId == null) {
        const preferred = cats.find(c => c.id === cat) || cats[0]
        if (preferred) { cat = preferred.id; _currentTypeId = preferred.typeId }
      }
      container.innerHTML = '<span class="tvbox-catbar-label">' + escHtml(mt('categoryLabel')) + '</span>' +
        cats.map(c => '<button class="tvbox-cat-chip' + (String(c.typeId) === String(_currentTypeId) ? ' active' : '') + '" data-typeid="' + escHtml(c.typeId) + '" data-catid="' + escHtml(c.id) + '" title="' + escHtml(categoryName(c)) + '">' + escHtml(categoryName(c)) + '</button>').join('')
      container.querySelectorAll('.tvbox-cat-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          cat = btn.dataset.catid
          _currentTypeId = parseInt(btn.dataset.typeid)
          page = 1; query = ''; searchInput.value = ''; hideHistory(); _viewStack = []
          renderCatBar(); renderSrcBar()
          loadData()
        })
      })
    }
    container.innerHTML = '<span class="tvbox-catbar-label">' + escHtml(mt('categoryLabel')) + '</span><span style="color:var(--text-tertiary);font-size:12px">⏳ ' + escHtml(mt('syncingCategories')) + '</span>'
    const promise = fetchSourceCategories(source.key).then(paint).catch(() => paint(cats))
    if (wait) await promise
    else promise
  }

  function renderSrcBar() {
    const container = el.querySelector('#t-srcbar')
    const list = VOD_SOURCES
    container.innerHTML = '<span class="tvbox-srcbar-label">' + escHtml(mt('sourceLabel')) + '</span>' +
      list.map((s, i) => '<button class="tvbox-src-chip' + (i === src ? ' active' : '') + '" data-idx="' + i + '">' +
        '<span class="tvbox-src-dot' + (_sourceHealth[s.api] > 5000 ? ' tvbox-src-warn' : '') + '"></span>' +
        s.name + (_sourceHealth[s.api] > 5000 ? ' ⚠️' : '') + '</button>').join('')
    container.querySelectorAll('.tvbox-src-chip').forEach(btn => {
      btn.addEventListener('click', async () => {
        src = parseInt(btn.dataset.idx)
        _currentTypeId = null  // 切换源时重置typeId，让新源的分类自适应
        cat = 'movie'           // 切回默认分类
        query = ''
        searchInput.value = ''
        page = 1
        hideHistory()
        renderSrcBar()
        await renderCatBar(true)
        loadData()
      })
    })
  }

  async function loadData() {
    const content = el.querySelector('#t-content')
    content.innerHTML = '<div class="tvbox-loading"><div class="tvbox-loading-icon"></div><span class="tvbox-loading-text">' + escHtml(mt('loading')) + '</span></div>'
    try {
      if (mode === 'live') loadLive()
      else if (mode === 'tvboxjson') { if (query) await loadTvboxSearch(); else await loadTvboxList() }
      else if (query) await searchAllSources(query)
      else if (getPlayHistory().length > 0 && page === 1 && !query) { await showPlayHistory(); return }
      else await loadList()
    } catch (e) {
      content.innerHTML = '<div class="tvbox-empty"><div class="tvbox-empty-icon">😵</div><div class="tvbox-empty-title">' + escHtml(mt('loadFailed')) + '</div><div class="tvbox-empty-sub">' + escHtml(e.message) + '</div></div>'
    }
  }

  // 更新调试面板（界面可见状态）
function setDebug(msg, detail) {
  const el = document.querySelector('#t-debug-status')
  if (!el) return
  el.textContent = new Date().toLocaleTimeString('zh-CN') + ' ' + msg
  console.info('[DEBUG]', msg, detail || '')
}

  async function loadList() {
    const content = el.querySelector('#t-content')
    const source = VOD_SOURCES[src]
    // 自适应分类：优先用当前缓存的 typeId，否则用旧映射
    let typeId = _currentTypeId
    if (typeId == null) {
      const typeMap = VOD_TYPE_MAP[source.key] || { movie: 1, tv: 2, variety: 3, anime: 4, short: 6 }
      typeId = typeMap[cat] ?? 1
    }
    setDebug(mt('debugLoading'), source.name + ' cat=' + cat + ' typeId=' + typeId)
    let json = { list: [], total: 0 }
    const t0 = Date.now()
    try {
      try {
        json = await fetchJSONFast(source.api + '?ac=list&t=' + typeId + '&pg=' + page)
        _sourceHealth[source.api] = Date.now() - t0
        setDebug(mt('debugApiReturned'), 'total=' + json.total + ' list.len=' + (json.list?.length || 0) + ' (' + _sourceHealth[source.api] + 'ms)')
      } catch (e) { setDebug(mt('debugFirstError'), e.message) }
      if (!json.total && !json.list?.length) { try { json = await fetchJSONFast(source.api + '?ac=list&t=' + typeId + '&pg=' + page) } catch {} }
      if (!json.list) { try { json = await fetchJsonp(source.api + '?ac=list&t=' + typeId + '&pg=' + page) } catch {} }
    } catch (e) { setDebug(mt('debugAllMethodsError'), e.message) }
    if (!json.list || !json.list.length) {
      setDebug(mt('debugTypeIdEmpty'), '')
      try { json = await fetchJSONFast(source.api + '?ac=list&pg=' + page) } catch {}
    }
    const count = json.list?.length || 0
    // 标记超时源（>5s）
    if (_sourceHealth[source.api] > 5000) renderSrcBar()
    setDebug(mt('debugResultCount', { count: json.total || count }), 'list.len=' + count)
    const normalized = (json.list || []).map(item => normalizeVodItem(item, source))
    renderVodGrid(normalized, json.total || count)
  }

  // 全源并发搜索（所有 VOD CMS 源同时搜，哪个源先返回就先渲染）
  async function searchAllSources(q) {
    const content = el.querySelector('#t-content')
    const qe = encodeURIComponent(q)
    const perSourceTimeout = 10000
    const seen = new Set()
    const merged = []
    let finished = 0
    let succeeded = 0
    let renderedAny = false
    content.innerHTML = '<div id="t-main-grid"><div class="tvbox-loading"><div class="tvbox-loading-icon"></div><span class="tvbox-loading-text">' + escHtml(mt('searchingImmediate')) + '</span></div></div><div id="t-pagination"></div>'
    setDebug(mt('debugGlobalSearchRunning'), mt('debugSourceProgress', { done: 0, total: VOD_SOURCES.length }))

    const tasks = VOD_SOURCES.map(async (source) => {
      const ctrl = new AbortController()
      const tid = setTimeout(() => ctrl.abort(), perSourceTimeout)
      try {
        let json = { list: [] }
        try { json = await fetchJSONFast(source.api + '?ac=videolist&wd=' + qe + '&pg=1', ctrl.signal) } catch {}
        if (!json.list?.length) { try { json = await fetchJSONFast(source.api + '?ac=videolist&zm=' + qe + '&pg=1', ctrl.signal) } catch {} }
        if (!json.list?.length) { try { json = await fetchJSONFast(source.api + '?ac=detail&wd=' + qe, ctrl.signal) } catch {} }
        const items = (json.list || []).map(item => normalizeVodItem(item, source))
        let added = 0
        for (const item of items) {
          if (!movieNameMatches(item, q)) continue
          const key = (item.vod_name || item.vod_id || Math.random().toString()).trim()
          if (!seen.has(key)) {
            seen.add(key)
            merged.push(item)
            added++
          }
        }
        if (added > 0) {
          succeeded++
          renderedAny = true
          renderVodGrid(merged, merged.length)
        }
      } catch (e) {
        console.warn('[movie] 搜索源失败:', source.name, e?.message || e)
      } finally {
        clearTimeout(tid)
        finished++
        setDebug(mt('debugGlobalSearchRunning'), mt('debugSourceDisplayed', { done: finished, total: VOD_SOURCES.length, count: merged.length }))
      }
    })

    await Promise.allSettled(tasks)
    if (!renderedAny) renderVodGrid([], 0)
    setDebug(mt('debugGlobalSearchDone'), mt('debugSourceMatched', { done: succeeded, total: VOD_SOURCES.length, count: merged.length }))
  }

  async function loadSearch() {
    const source = VOD_SOURCES[src]
    const q = encodeURIComponent(query)
    let json = { list: [], total: 0 }
    try {
      // 优先 videolist（CMS标准搜索接口）
      try { json = await fetchJSONFast(source.api + '?ac=videolist&wd=' + q + '&pg=' + page) } catch {}
      if (!json.list?.length) { try { json = await fetchJSONFast(source.api + '?ac=videolist&zm=' + q + '&pg=' + page) } catch {} }
      if (!json.list?.length) { try { json = await fetchJsonp(source.api + '?ac=videolist&wd=' + q) } catch {} }
    } catch {}
    const count = json.list?.length || 0
    if (!count) {
      // 兜底：直接 fetch 搜索（部分源搜索接口不同）
      try { json = await fetchJSONFast(source.api + '?ac=detail&wd=' + q) } catch {}
    }
    const filtered = filterSearchResults((json.list || []).map(item => normalizeVodItem(item, source)), query)
    const total = filtered.length
    setDebug(total > 0 ? mt('exactResultCount', { count: total }) : mt('noSearchResult'), 'list.len=' + (json.list?.length || 0) + ' filtered=' + total)
    renderVodGrid(filtered, total)
  }

  // ── TVBox JSON 模式 ──────────────────────────────
  async function loadTvboxList() {
    const content = el.querySelector('#t-content')
    content.innerHTML = '<div class="tvbox-loading">' + escHtml(mt('loadingTvboxJson')) + '</div>'
    const api = getActiveTvbox()
    if (!api) {
      content.innerHTML = '<div class="tvbox-empty">' + escHtml(mt('selectTvboxSourceFirstDetailed')) + '</div><div style="text-align:center;margin-top:20px"><button id="t-add-tvbox-btn" style="background:#e50914;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:14px;cursor:pointer">' + escHtml(mt('addCustomTvboxApi')) + '</button></div>'
      el.querySelector('#t-add-tvbox-btn')?.addEventListener('click', showApiManage)
      return
    }
    const config = await loadTvboxConfig(api)
    if (!config) {
      content.innerHTML = '<div class="tvbox-empty">' + escHtml(mt('tvboxJsonLoadFailedDetailed')) + '<br><br><button id="t-switch-src-btn" style="background:#333;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:13px;cursor:pointer">' + escHtml(mt('switchSource')) + '</button></div>'
      el.querySelector('#t-switch-src-btn')?.addEventListener('click', renderTvboxSrcTabs)
      return
    }
    const all = parseVideoList(config)
    const filtered = cat !== 'all' ? all.filter(v => (v.type_name || '').includes(VOD_CATEGORIES.find(c => c.id === cat)?.name || cat)) : all
    const total = filtered.length
    const start = (page - 1) * 20
    renderVodGrid(filtered.slice(start, start + 20).map(item => normalizeVodItem(item, { key: getActiveTvboxKey(), name: getActiveTvbox()?.name || 'TVBox', api: getActiveTvbox()?.url || '' })), total)
  }

  async function loadTvboxSearch() {
    const content = el.querySelector('#t-content')
    content.innerHTML = '<div class="tvbox-loading">' + escHtml(mt('searching')) + '</div>'
    const api = getActiveTvbox()
    if (!api) { content.innerHTML = '<div class="tvbox-empty">' + escHtml(mt('selectTvboxSourceFirst')) + '</div>'; return }
    const config = await loadTvboxConfig(api)
    if (!config) { content.innerHTML = '<div class="tvbox-empty">' + escHtml(mt('tvboxJsonLoadFailed')) + '</div>'; return }
    const results = filterSearchResults((await searchTvboxList(config, query, api)).map(item => normalizeVodItem(item, { key: getActiveTvboxKey(), name: getActiveTvbox()?.name || 'TVBox', api: getActiveTvbox()?.url || '' })), query)
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
    '<button class="tvbox-tab" id="t-add-custom-btn" style="color:#e50914;font-size:13px">＋ ' + escHtml(mt('custom')) + '</button>'
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
        '<div style="font-size:16px;font-weight:bold">⚙️ ' + escHtml(mt('tvboxApiManageTitle')) + '</div>' +
        '<button id="t-api-close" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;padding:4px">✕</button>' +
      '</div>' +
      '<div style="margin-bottom:16px">' +
        '<div style="font-size:13px;color:#888;margin-bottom:8px">' + escHtml(mt('builtinTvboxJsonSources')) + '</div>' +
        TVBOX_BUILTIN.map(a => '<div class="tvbox-src-item' + (a.key === activeKey ? ' active' : '') + '" data-key="' + a.key + '" data-type="builtin" style="padding:10px 12px;background:' + (a.key === activeKey ? '#2a2a4a' : '#252540') + ';border-radius:8px;margin-bottom:6px;cursor:pointer;display:flex;justify-content:space-between;align-items:center">' +
          '<span>' + a.name + '</span><span style="font-size:12px;color:#888">' + (a.note || '') + '</span></div>').join('') +
      '</div>' +
      '<div style="margin-bottom:16px">' +
        '<div style="font-size:13px;color:#888;margin-bottom:8px">' + escHtml(mt('customTvboxApiCount', { count: custom.length })) + '</div>' +
        (custom.length ? custom.map(a => '<div style="padding:10px 12px;background:#252540;border-radius:8px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">' +
          '<div style="overflow:hidden"><div style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px">' + escHtml(a.name) + '</div>' +
          '<div style="font-size:11px;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px">' + escHtml(a.url) + '</div></div>' +
          '<button class="t-del-api" data-key="' + a.key + '" style="background:#e50914;color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;flex-shrink:0;margin-left:8px">' + escHtml(mt('delete')) + '</button></div>').join('') : '<div style="color:#555;font-size:13px;text-align:center;padding:12px">' + escHtml(mt('noCustomApi')) + '</div>') +
      '</div>' +
      '<div style="border-top:1px solid #333;padding-top:16px">' +
        '<div style="font-size:13px;color:#888;margin-bottom:8px">' + escHtml(mt('addCustomTvboxJsonApi')) + '</div>' +
        '<input id="t-api-name" placeholder="' + escHtml(mt('apiNamePlaceholder')) + '" style="width:100%;background:#252540;border:1px solid #333;color:#fff;border-radius:8px;padding:8px 12px;font-size:13px;box-sizing:border-box;margin-bottom:8px;display:block"/>' +
        '<input id="t-api-url" placeholder="' + escHtml(mt('apiUrlPlaceholder')) + '" style="width:100%;background:#252540;border:1px solid #333;color:#fff;border-radius:8px;padding:8px 12px;font-size:13px;box-sizing:border-box;margin-bottom:8px;display:block"/>' +
        '<button id="t-api-add-btn" style="width:100%;background:#e50914;color:#fff;border:none;border-radius:8px;padding:10px;font-size:14px;cursor:pointer">' + escHtml(mt('addAndUse')) + '</button>' +
      '</div>' +
    '</div>'
    document.body.appendChild(overlay)
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
    overlay.querySelector('#t-api-close').addEventListener('click', () => overlay.remove())
    overlay.querySelectorAll('.tvbox-src-item[data-key]').forEach(item => item.addEventListener('click', async () => {
      const key = item.dataset.key
      setActiveTvboxKey(key)
      _tvboxCache = {}
      overlay.remove()
      await loadTvboxList()
      renderTvboxSrcTabs()
    }))
    overlay.querySelectorAll('.tvbox-src-item[data-type="builtin"]').forEach(item => {
      item.addEventListener('contextmenu', e => {
        e.preventDefault()
        const key = item.dataset.key
        const src = TVBOX_BUILTIN.find(a => a.key === key)
        if (src?.url) {
          navigator.clipboard?.writeText(src.url).catch(() => {})
          const orig = item.style.background
          item.style.background = '#3a3a6a'
          setTimeout(() => { item.style.background = orig }, 300)
        }
      })
    })
    overlay.querySelectorAll('.t-del-api').forEach(btn => btn.addEventListener('click', e => {
      e.stopPropagation()
      const key = btn.dataset.key
      const apis = getCustomTvbox().filter(a => a.key !== key)
      saveCustomTvbox(apis); _customTvbox = apis
      if (getActiveTvboxKey() === key) { setActiveTvboxKey(''); _tvboxCache = {} }
      overlay.remove()
      showApiManage()
    }))
    overlay.querySelector('#t-api-add-btn').addEventListener('click', async () => {
      const name = overlay.querySelector('#t-api-name')?.value.trim() || ''
      const url = overlay.querySelector('#t-api-url')?.value.trim()
      if (!url) return
      const key = 'ctv_' + Date.now()
      const api = { key, name: name || mt('customSourceName', { number: _customTvbox.length + 1 }), url }
      const config = await loadTvboxConfig(api)
      if (config) {
        const apis = getCustomTvbox(); apis.push(api); saveCustomTvbox(apis); _customTvbox = apis
        setActiveTvboxKey(key); _tvboxCache = {}
        overlay.remove()
        await loadTvboxList()
        renderTvboxSrcTabs()
      } else {
        alert(mt('invalidTvboxApi'))
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
    const root = _el // 用全局根元素（initApp 里设置的 _el）
    if (!root) { console.warn('[renderVodGrid] _el 全局根元素不存在!'); return }
    let grid = root.querySelector('#t-main-grid')
    let pagination = root.querySelector('#t-pagination')
    // 保证 grid 和 pagination 存在（initApp/renderHistory 等可能用 innerHTML 替换了 content 区域）
    if (!grid || !pagination) {
      let content = root.querySelector('#t-content')
      if (!content) { content = root.appendChild(Object.assign(document.createElement('div'), { id: 't-content' })) }
      grid = content.querySelector('#t-main-grid')
      if (!grid) { grid = content.appendChild(Object.assign(document.createElement('div'), { id: 't-main-grid' })) }
      pagination = content.querySelector('#t-pagination')
      if (!pagination) { pagination = content.appendChild(Object.assign(document.createElement('div'), { id: 't-pagination' })) }
      // 清除残留的加载中状态
      content.innerHTML = ''
      content.appendChild(grid)
      content.appendChild(pagination)
      console.info('[renderVodGrid] 修复: 重建grid/pagination并清除loading完成')
    }
    console.info('[renderVodGrid] 收到: list.len=', list?.length, 'total=', total)
    if (!list || !list.length) {
      grid.innerHTML = '<div class="tvbox-empty"><div class="tvbox-empty-icon">📭</div><div class="tvbox-empty-title">' + escHtml(mt('noData')) + '</div><div class="tvbox-empty-sub">' + escHtml(mt('tryOtherCategoryOrKeyword')) + '</div></div>'
      if (pagination) pagination.innerHTML = ''
      return
    }
    const history = getPlayHistory()
    const sourceName = VOD_SOURCES[src]?.name || ''
    const totalPages = Math.max(1, Math.ceil(total / 20))

    grid.innerHTML = '<div class="tvbox-grid">' + list.map(item => {
      const itemSourceName = item._srcName || sourceName
      const itemApi = item._tvboxApi || item._api || ''
      const histItem = history.find(h => h.id == item.vod_id && h.source === itemSourceName)
      const pct = histItem && histItem.duration > 0 ? Math.round((histItem.progress / histItem.duration) * 100) : 0
      const resumeLabel = pct > 95 ? mt('watched') : pct > 2 ? mt('resumePercent', { percent: pct }) : ''
      return '<div class="tvbox-card" data-id="' + escHtml(item.vod_id) + '" data-source="' + escHtml(itemSourceName) + '" data-api="' + escHtml(itemApi) + '" data-name="' + escHtml(item.vod_name) + '" data-pic="' + escHtml(item.vod_pic) + '">' +
        '<div class="tvbox-card-inner">' +
          '<div class="tvbox-card-pic">' +
            renderPosterImg(item.vod_pic, item.vod_name, item._srcKey, itemApi) +
            '<span class="tvbox-card-tag">' + escHtml(item.type_name || mt('videoTypeFallback')) + '</span>' +
            (item.vod_score ? '<span class="tvbox-card-score">' + escHtml(item.vod_score) + '</span>' : '') +
            (resumeLabel ? '<span class="tvbox-resume-badge">' + escHtml(resumeLabel) + '</span>' : '') +
          '</div>' +
          '<div class="tvbox-card-info">' +
            '<div class="tvbox-card-title">' + escHtml(item.vod_name) + '</div>' +
            '<div class="tvbox-card-sub">' + escHtml(item.vod_actor || itemSourceName || mt('unknownActor')) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    }).join('') + '</div>'

    if (pagination) pagination.innerHTML = totalPages > 1 ? renderPagination(page, totalPages) : ''

    grid.querySelectorAll('.tvbox-card').forEach(card => {
      card.addEventListener('click', () => {
        _viewStack.push('list')
        openDetail(card.dataset.id, card.dataset.name, card.dataset.source, card.dataset.pic, card.dataset.api)
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
    content.innerHTML = '<div class="tvbox-loading"><div class="tvbox-loading-icon"></div><span class="tvbox-loading-text">' + escHtml(mt('loadingLiveChannels')) + '</span></div>'
    let cats = tvCache[tvSrc]
    if (!cats) {
      try {
        const text = await fetch(source.api, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.text())
        const isM3u = text.includes('#EXTM3U') || text.includes('group-title')
        cats = isM3u ? parseNzk(convertM3uToNormal(text)) : parseNzk(text)
        tvCache[tvSrc] = cats
      } catch (e) {
        content.innerHTML = '<div class="tvbox-empty"><div class="tvbox-empty-icon">📡</div><div class="tvbox-empty-title">' + escHtml(mt('loadFailed')) + '</div><div class="tvbox-empty-sub">' + escHtml(e.message) + '</div></div>'
        return
      }
    }
    renderTvGrid(cats)
  }

  function renderTvGrid(categories) {
    const content = el.querySelector('#t-content')
    if (!categories || !categories.length) { content.innerHTML = '<div class="tvbox-empty"><div class="tvbox-empty-icon">📡</div><div class="tvbox-empty-title">' + escHtml(mt('noChannelData')) + '</div></div>'; return }
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
        else alert(mt('channelNoPlaybackUrl'))
      })
    })
  }

  function openPlayerTv(name, url) {
    const overlay = el.querySelector('#t-player-overlay')
    const body = el.querySelector('#t-player-body')
    el.querySelector('#t-player-title').textContent = '📺 ' + name
    el.querySelector('#t-ext-link').href = url
    body.innerHTML = '<div class="tvbox-player-loading">' + escHtml(mt('loading')) + '</div>'
    overlay.style.display = 'flex'
    const isM3u8 = url.includes('.m3u8')
    const isMp4  = url.includes('.mp4')
    if (isM3u8 || isMp4) loadVideoPlayer(url, isM3u8, 0, playingEp?.allUrls || [])
    else {
      // URL 格式校验
      var safeUrl = url && /^https?:\/\//i.test(url) ? url : ''
      body.innerHTML = '<div class="tvbox-iframe-wrap"><iframe id="tv-iframe" src="' + safeUrl + '" allowfullscreen allow="autoplay; fullscreen" style="width:100%;height:100%;border:none"></iframe></div>'
      // 超时兜底：10 秒内 iframe 未触发 load 事件则显示错误
      setTimeout(() => {
        const iframe = document.getElementById('tv-iframe')
        if (iframe && iframe.style.display !== 'none') {
          body.innerHTML = '<div style="text-align:center;padding:40px"><p style="color:#6b6b8a;margin-bottom:14px">' + escHtml(mt('playbackAddressInvalid')) + '</p><a href="' + safeUrl + '" target="_blank" class="tvbox-open-ext">' + escHtml(mt('openInBrowser')) + '</a></div>'
        }
      }, 10000)
    }
  }

  async function openDetail(id, name, sourceName, pic, sourceApi = '') {
    const source = sourceApi ? { name: sourceName || 'TVBox', api: sourceApi } : (VOD_SOURCES.find(s => s.name === sourceName) || VOD_SOURCES[src])
    const content = el.querySelector('#t-content')
    content.innerHTML = '<div class="tvbox-loading"><div class="tvbox-loading-icon"></div><span class="tvbox-loading-text">' + escHtml(mt('loading')) + '</span></div>'
    const detailId = String(id || '').trim()
    if (!source?.api || !detailId) {
      content.innerHTML = '<div class="tvbox-empty">' + escHtml(mt('movieNotFound')) + '</div>'
      return
    }
    let json = { list: null }
    try { json = await fetchJSON(source.api + '?ac=detail&ids=' + encodeURIComponent(detailId)) } catch {}
    if (!json.list?.length) { try { json = await fetchJsonp(source.api + '?ac=detail&ids=' + encodeURIComponent(detailId)) } catch {} }
    const item = json.list && json.list[0]
    if (!item && name) {
      const alt = await searchDetailFallback(source, name)
      if (alt) return showEpisodePicker(alt, source.name)
    }
    if (!item) { content.innerHTML = '<div class="tvbox-empty">' + escHtml(mt('movieNotFound')) + '</div>'; return }
    await showEpisodePicker(item, source.name)
  }

  async function showEpisodePicker(item, sourceName) {
    const warmup = warmUpEpisodeSources(item).catch(() => {})
    const overlay = el.querySelector('#t-player-overlay')
    const body = el.querySelector('#t-player-body')
    el.querySelector('#t-player-title').textContent = item.vod_name
    el.querySelector('#t-ext-link').href = '#'
    const episodes = parsePlaylist(item.vod_play_from, item.vod_play_url)
    const hist = getPlayHistory().find(h => h.id == item.vod_id && h.source === sourceName)
    playingEp = null

    // ── 豆瓣评分异步获取 ───────────────────────────────
    let doubanRating = ''
    try {
      const controller = AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined
      const r = await fetch('https://api.douban.com/v2/movie/search?q=' + encodeURIComponent(item.vod_name), controller ? { signal: controller } : undefined)
      const d = await r.json().catch(() => null)
      const score = d?.subjects?.[0]?.rating?.average
      if (score && score > 0) doubanRating = mt('doubanRating', { score })
    } catch {}

    // 优先选择包含直接 m3u8 的源
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

    const backBtn = '<div style="margin-bottom:12px"><button class="tvbox-back-btn" id="t-detail-back">' + escHtml(mt('backToList')) + '</button></div>'
    const firstUrls = episodes[preferredSi]?.urls || []
    const siHtml = episodes.length > 1
      ? '<div style="margin-bottom:10px"><span style="font-size:12px;color:#666">' + escHtml(mt('selectSource')) + '</span>' +
          episodes.map((e, i) => '<button class="tvbox-tab' + (i===preferredSi?' active':'') + '" style="margin-right:6px;margin-bottom:6px" data-si="' + i + '">' + e.name + (i===preferredSi?' ★':'') + '</button>').join('') +
        '</div>'
      : ''

    const sourceForPic = VOD_SOURCES.find(s => s.name === sourceName) || {}
    const picCands = buildPicCandidates(item.vod_pic, sourceForPic.key, sourceForPic.api || '')
    body.innerHTML =
      backBtn +
      '<div class="tvbox-ep-info">' +
        renderPosterImg(item.vod_pic, item.vod_name, sourceForPic.key || item._srcKey, sourceForPic.api || item._api || '').replace('<img ', '<img class="tvbox-ep-pic" ') +
        (doubanRating ? '<div style="color:#f5c518;font-size:14px;margin:4px 0">' + doubanRating + '</div>' : '') +
        '<div class="tvbox-ep-desc">' + (item.vod_content || mt('noDescription')) + '</div>' +
      '</div>' +
      siHtml +
      '<div class="tvbox-ep-list-title">' + escHtml(mt('episodeListCount', { count: firstUrls.length })) + '</div>' +
      '<div class="tvbox-ep-grid" id="t-ep-grid">' +
        firstUrls.map((ep, i) => {
          const isResume = hist && hist.epName === ep.name
          return '<button class="tvbox-ep-btn' + (isResume?' playing':'') + '" ' +
            'data-url="' + escHtml(ep.url) + '" data-name="' + escHtml(item.vod_name + ' ' + ep.name) + '" ' +
            'data-epname="' + escHtml(ep.name) + '" data-pic="' + escHtml(item.vod_pic) + '" ' +
            'data-id="' + escHtml(item.vod_id) + '" data-source="' + escHtml(sourceName) + '">' +
            (isResume?'▶ ':'') + escHtml(ep.name) + '</button>'
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
            'data-id="' + escHtml(item.vod_id) + '" data-source="' + escHtml(sourceName) + '">' + escHtml(ep.name) + '</button>'
        ).join('')
        body.querySelectorAll('[data-si]').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
      })
    })

    overlay.style.display = 'flex'

    // 使用事件委托，避免重复绑定监听器
    const epGrid = body.querySelector('#t-ep-grid')
    epGrid.addEventListener('click', e => {
      const btn = e.target.closest('.tvbox-ep-btn')
      if (!btn) return
      const epUrl = btn.dataset.url
      const hist = getPlayHistory().find(h => h.id == btn.dataset.id && h.source === btn.dataset.source && h.epName === btn.dataset.epname)
      const sp = (hist && hist.progress > 0 && hist.progress < 999) ? parseFloat(hist.progress) : 0
      // 获取当前显示的源的 si（从 active 的 [data-si] 按钮获取）
      const activeSiBtn = body.querySelector('[data-si].active')
      const si = activeSiBtn ? parseInt(activeSiBtn.dataset.si) : preferredSi
      // 保存当前线路的完整剧集上下文，保证从历史续播也能切集/切线路
      const allUrls = (episodes[si]?.urls || []).map(e => e.url)
      const allEps = (episodes[si]?.urls || []).map(e => ({ epName: e.name, url: e.url }))
      upsertPlayHistory({
        id: btn.dataset.id, name: btn.dataset.name, pic: btn.dataset.pic,
        source: btn.dataset.source, epName: btn.dataset.epname,
        epUrl: epUrl, progress: sp, duration: hist?.duration || 0,
        allUrls, allEps,
      })
      openPlayerVod(btn.dataset.name, epUrl, btn.dataset.id, btn.dataset.source, btn.dataset.epname, btn.dataset.pic, allUrls, sp, allEps)
    })
  }

  async function openPlayerVod(name, url, id, source, epName, pic, fallbackUrls, startProgress, allEps) {
    // 优先使用独立 Tauri 窗口播放；失败时回退到内嵌播放器并给出可见反馈。
    if (!url || url === '#') return
    playingEp = { id, source, epName, pic, epUrl: url, allUrls: fallbackUrls || [], allEps: allEps || null }
    const resume = (typeof startProgress === 'number' && startProgress > 0 && startProgress < 999) ? startProgress : 0
    const opened = await openStandalonePlayer({
      url, title: name, resume,
      allEps: allEps || [],
      allUrls: fallbackUrls || [url],
      playbackCtx: { id, source, epName },
      pic,
    })
    if (!opened) showEmbeddedPlayerFallback(name, url, resume, fallbackUrls || [url], allEps || [])
  }

  async function openStandalonePlayer({ url, title, resume, allEps, allUrls, playbackCtx, pic }) {
    try {
      const { invoke } = await import('@tauri-apps/api/core').catch(() => ({}))
      if (!invoke) throw new Error(mt('standaloneApiUnavailable'))
      await invoke('open_player_window', {
        url, title, resume,
        lang: getLang(),
        allEps: JSON.stringify(allEps || []),
        allUrls: JSON.stringify(allUrls || [url]),
        playbackCtx: JSON.stringify(playbackCtx || {}),
        pic: pic || '',
      })
      return true
    } catch (e) {
      console.warn('[movie] 独立播放器打开失败，回退内嵌播放:', e?.message || e)
      return false
    }
  }

  function showEmbeddedPlayerFallback(name, url, resume, fallbackUrls, allEps) {
    const overlay = el.querySelector('#t-player-overlay')
    const title = el.querySelector('#t-player-title')
    const body = el.querySelector('#t-player-body')
    if (!overlay || !body) {
      alert(mt('playerOpenFailedRetry'))
      return
    }
    if (title) title.textContent = name || mt('playbackTitleFallback')
    overlay.style.display = 'flex'
    body.innerHTML = '<div style="text-align:center;padding:40px"><p style="color:#f6c177;margin-bottom:14px">' + escHtml(mt('standaloneFallbackNotice')) + '</p></div>'
    loadVideoPlayer(url, isDirectVideoUrl(url), resume || 0, fallbackUrls || [url], allEps || [])
  }

  async function loadVideoPlayer(videoUrl, isM3u8, startProgress, fallbackUrls, allEps) {
    const body = el.querySelector('#t-player-body')
    const fallbackArr = (fallbackUrls && fallbackUrls.length) ? fallbackUrls : []
    const episodeArr = Array.isArray(allEps) ? allEps : []
    const fallbackUrlsAreEpisodes = fallbackArr.length > 0 && episodeArr.length > 0 && fallbackArr.every(u => getFallbackEpisodeByUrl(u, episodeArr))
    let lineIdx = 0  // 当前尝试的地址索引（0=主URL；可能是线路或剧集）
    let errCount = 0
    const MAX_ERR = 3

    function getFallbackEpisodeByUrl(epUrl, eps = episodeArr) {
      if (!epUrl || !eps || !eps.length) return null
      return eps.find(ep => ep && ep.url === epUrl) || null
    }

    function syncEmbeddedEpisodeContext(nextUrl) {
      if (!fallbackUrlsAreEpisodes || !playingEp) return
      const ep = getFallbackEpisodeByUrl(nextUrl)
      if (!ep) return
      const nextEpName = ep.epName || ep.name || playingEp.epName
      playingEp = { ...playingEp, epName: nextEpName, epUrl: nextUrl }
      const titleEl = el.querySelector('#t-player-title')
      if (titleEl && nextEpName) titleEl.textContent = nextEpName
      upsertPlayHistory({
        id: playingEp.id, name: titleEl?.textContent || nextEpName || mt('playingTitleFallback'), pic: playingEp.pic || '',
        source: playingEp.source, epName: playingEp.epName, epUrl: nextUrl, progress: 0, duration: 0,
        allUrls: playingEp.allUrls || fallbackArr || [], allEps: playingEp.allEps || episodeArr || [],
        updated: Date.now()
      })
      el.querySelector('#t-ext-link')?.setAttribute('href', nextUrl)
    }

    function fallbackTargetText() { return fallbackUrlsAreEpisodes ? mt('fallbackTargetEpisode') : mt('fallbackTargetLine') }

    function showOtip(vid, msg) {
      let tip = document.getElementById('_ttip')
      if (!tip) { tip = Object.assign(document.createElement('div'), { id: '_ttip' }); tip.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.7);color:#fff;padding:8px 16px;border-radius:8px;font-size:16px;pointer-events:none;z-index:100' }
      tip.textContent = msg; if (!document.body.contains(tip)) vid.parentElement.appendChild(tip)
      clearTimeout(showOtip._t); showOtip._t = setTimeout(() => tip.remove(), 1200)
    }

    function addPipBtn(vid) {
      if (!document.pictureInPictureEnabled) return
      const pip = Object.assign(document.createElement('button'), { textContent: '📺 PiP', title: '画中画' })
      pip.style.cssText = 'position:absolute;top:8px;right:180px;z-index:10;background:rgba(30,30,50,0.9);color:#fff;border:1px solid #444;border-radius:4px;padding:4px 8px;font-size:12px;cursor:pointer'
      pip.addEventListener('click', () => { vid.requestPictureInPicture().catch(() => {}) }, { once: true })
      return pip
    }

    function addTouchGesture(vid) {
      let tx = 0, ty = 0, tt = 0, startVol = 1
      vid.addEventListener('touchstart', e => {
        tx = e.touches[0].clientX; ty = e.touches[0].clientY; tt = vid.currentTime; startVol = vid.volume
      }, { passive: true })
      vid.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - tx
        const dy = e.changedTouches[0].clientY - ty
        const pct = dx / vid.offsetWidth
        if (Math.abs(pct) > 0.04) {
          vid.currentTime = Math.max(0, Math.min(vid.duration, tt + pct * 60))
          showOtip(vid, (pct > 0 ? '＋' : '－') + Math.round(Math.abs(pct) * 60) + 's')
        } else if (Math.abs(dy) > 30) {
          vid.volume = Math.max(0, Math.min(1, startVol - dy / 300))
          showOtip(vid, '🔊 ' + Math.round(vid.volume * 100) + '%')
        }
      }, { passive: true })
    }

    async function tryNextLine(failedUrl) {
      lineIdx++
      const next = fallbackArr.find((u, i) => i >= lineIdx && u !== failedUrl)
      if (!next) return false
      lineIdx = fallbackArr.indexOf(next)
      await tryPlay(next, next.includes('.m3u8') || next.includes('.mp4'), 0)
      return true
    }

    function renderPlaybackError(url, message) {
      body.innerHTML = '<div style="text-align:center;padding:40px"><p style="color:#6b6b8a;margin-bottom:14px">' + escHtml(message || mt('playbackFailed')) + '</p><a href="' + escHtml(url) + '" target="_blank" class="tvbox-open-ext">' + escHtml(mt('openInBrowser')) + '</a></div>'
    }

    async function tryPlay(url, isM3u8, sp) {
      syncEmbeddedEpisodeContext(url)
      if (!url || url === '#') { body.innerHTML = '<div style="text-align:center;padding:40px"><p style="color:#6b6b8a">' + escHtml(mt('noPlaybackUrl')) + '</p></div>'; return }

      if (isM3u8) {
        await ensureHls()
        if (window.Hls && window.Hls.isSupported()) {
          const wrap = document.createElement('div'); wrap.className = 'tvbox-video-wrap'
          const video = document.createElement('video'); video.controls = true
          wrap.appendChild(video)
          body.innerHTML = ''; body.appendChild(wrap)
          const hls = new window.Hls({ autoStartLoad: true, startLevel: -1 })
          window._movieHls = hls
          hls.loadSource(url)
          hls.attachMedia(video)
          let hlsTimedOut = false
          const hlsTimer = setTimeout(async () => {
            if (!hlsTimedOut) { hlsTimedOut = true; hls.destroy(); window._movieHls = null
              renderPlaybackError(url, mt('m3u8TimeoutSwitching', { target: fallbackTargetText() }))
              const switched = await tryNextLine(url)
              if (!switched) renderPlaybackError(url, mt('allFallbackUnavailable', { target: fallbackTargetText() }))
            }
          }, 15000)
          hls.on(window.Hls.Events.ERROR, async (evt, data) => {
            clearTimeout(hlsTimer)
            if (data.fatal) {
              errCount++
              if (errCount < MAX_ERR && (data.type === window.Hls.ErrorTypes.NETWORK_ERROR || data.type === window.Hls.ErrorTypes.MEDIA_ERROR)) {
                console.warn('[HLS] 可恢复错误，尝试恢复 (#' + errCount + '):', data.type, data.details)
                hls.startLoad(); return
              }
              hlsTimedOut = true; hls.destroy(); window._movieHls = null
              renderPlaybackError(url, mt('playbackInterruptedSwitching', { reason: errCount >= MAX_ERR ? mt('multipleRetriesFailed') : data.details, target: fallbackTargetText() }))
              const switched = await tryNextLine(url)
              if (!switched) renderPlaybackError(url, mt('allFallbackUnavailable', { target: fallbackTargetText() }))
            }
          })
          hls.on(window.Hls.Events.MANIFEST_PARSED, () => { clearTimeout(hlsTimer); hls.currentLevel = -1 })
          const pipBtn = addPipBtn(video); if (pipBtn) wrap.appendChild(pipBtn)
          addTouchGesture(video)
          video.addEventListener('timeupdate', () => trackProgress(video))
          video.addEventListener('ended', () => markFinished())
          if (sp > 0) video.currentTime = sp
          video.play().catch(() => {})
        } else {
          const wrap = document.createElement('div'); wrap.className = 'tvbox-video-wrap'; wrap.style.position = 'relative'
          const video = document.createElement('video'); video.controls = true; video.style.width = '100%'; video.style.maxHeight = '70vh'
          video.src = url
          const pipBtn = addPipBtn(video); if (pipBtn) wrap.appendChild(pipBtn)
          addTouchGesture(video)
          video.addEventListener('error', async () => {
            const switched = await tryNextLine(url)
            if (!switched) renderPlaybackError(url, mt('allFallbackUnavailable', { target: fallbackTargetText() }))
          })
          wrap.appendChild(video)
          body.innerHTML = ''; body.appendChild(wrap)
          if (sp > 0) video.currentTime = sp
          video.play().catch(() => {})
        }
      } else {
        const wrap = document.createElement('div'); wrap.className = 'tvbox-video-wrap'
        const video = document.createElement('video'); video.controls = true
        wrap.appendChild(video)
        body.innerHTML = ''; body.appendChild(wrap)
        const pipBtn = addPipBtn(video); if (pipBtn) wrap.appendChild(pipBtn)
        addTouchGesture(video)
        video.addEventListener('timeupdate', () => trackProgress(video))
        video.addEventListener('ended', () => markFinished())
        video.addEventListener('error', async () => {
          const switched = await tryNextLine(url)
          if (!switched) renderPlaybackError(url, mt('allFallbackUnavailable', { target: fallbackTargetText() }))
        })
        video.src = url
        if (sp > 0) video.currentTime = sp
        video.play().catch(() => {})
      }
    }

    // 先尝试主URL
    tryPlay(videoUrl, isM3u8, startProgress)
  }

  function trackProgress(video) {
    if (!playingEp || !video.duration) return
    const pct = (video.currentTime / video.duration) * 100
    if (pct > 1) updatePlayProgress(playingEp.id, playingEp.source, video.currentTime, playingEp.epName)
  }

  function markFinished() {
    if (!playingEp) return
    updatePlayProgress(playingEp.id, playingEp.source, 999, playingEp.epName)
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
    const vid = document.querySelector('#t-player-body video') || document.querySelector('#t-player-body .tvbox-video-wrap video')
    if (vid && vid.duration > 0 && playingEp) {
      updatePlayProgress(playingEp.id, playingEp.source, vid.currentTime, playingEp.epName)
    }
    playingEp = null
    el.querySelector('#t-player-overlay').style.display = 'none'
    el.querySelector('#t-player-body').innerHTML = ''
    if (window._movieHls) { window._movieHls.destroy(); window._movieHls = null }
  }

  function renderPagination(page, total) {
    if (total <= 1) return ''
    const prev = page > 1 ? page - 1 : 1
    const next = page < total ? page + 1 : total
    return '<div class="tvbox-pagination">' +
      '<button class="tvbox-page-btn" data-page="' + prev + '">◀ ' + escHtml(mt('prevPage')) + '</button>' +
      '<span class="tvbox-page-info">' + escHtml(mt('pageInfo', { page, total })) + '</span>' +
      '<button class="tvbox-page-btn" data-page="' + next + '">' + escHtml(mt('nextPage')) + ' ▶</button>' +
    '</div>'
  }

  // ── 悬浮播放器（可拖拽/最小化/置顶）───────────────────────────────────
  let _floatState = null   // { wrap, title, pinned, minimized, h, w, x, y }

  function saveFloatState() {
    if (!_floatState) return
    try {
      localStorage.setItem('float_x', _floatState.x)
      localStorage.setItem('float_y', _floatState.y)
      localStorage.setItem('float_w', _floatState.w)
      localStorage.setItem('float_h', _floatState.h)
      localStorage.setItem('float_pinned', _floatState.pinned ? '1' : '0')
    } catch(e) {}
  }

  function loadFloatState() {
    try {
      const x = parseInt(localStorage.getItem('float_x'))
      const y = parseInt(localStorage.getItem('float_y'))
      const w = parseInt(localStorage.getItem('float_w'))
      const h = parseInt(localStorage.getItem('float_h'))
      const pinned = localStorage.getItem('float_pinned') === '1'
      if (!isNaN(x) && !isNaN(y)) return { x, y, w: w || 420, h: h || 300, pinned }
    } catch(e) {}
    return null
  }

  
  async function openFloatPlayer(name, url, id, source, epName, pic, allUrls, startProgress, allEps) {
    // 优先使用独立 Tauri 窗口播放；失败时回退到内嵌播放器并给出可见反馈。
    if (!url || url === '#') return
    const useUrl = pickDirectUrl(url)
    const resume = (typeof startProgress === 'number' && startProgress > 0 && startProgress < 999) ? startProgress : 0
    playingEp = { id, source, epName, epUrl: useUrl, pic, allUrls: allUrls || [], allEps: allEps || [] }
    const opened = await openStandalonePlayer({
      url: useUrl, title: name, resume,
      allEps: allEps || [],
      allUrls: allUrls || [useUrl],
      playbackCtx: { id, source, epName },
      pic,
    })
    if (!opened) showEmbeddedPlayerFallback(name, useUrl, resume, allUrls || [useUrl], allEps || [])
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

  function renderFloatPlaybackError(url, message) {
    const safeUrl = normalizeHttpUrl(url) || url || '#'
    return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:8px;color:#f87171;font-size:13px;text-align:center;padding:12px">' +
      '<div>' + escHtml(message || mt('playbackFailed')) + '</div>' +
      (safeUrl && safeUrl !== '#' ? '<a href="' + escHtml(safeUrl) + '" target="_blank" rel="noopener" style="color:#a78bfa;text-decoration:none">' + escHtml(mt('openInBrowser')) + '</a>' : '') +
    '</div>'
  }

  function getFloatEpisodeByUrl(url) {
    if (!_floatState?.epList || !url) return null
    return _floatState.epList.find(ep => ep.url === url) || null
  }

  function switchFloatEpisode(nextUrl, resumeProgress = 0) {
    if (!_floatState || !nextUrl) return
    const vid = document.querySelector('#_fvid video')
    if (vid && vid.duration > 0 && playingEp) updatePlayProgress(playingEp.id, playingEp.source, vid.currentTime, playingEp.epName, vid.duration)
    if (window._floatHls) { window._floatHls.destroy(); window._floatHls = null }
    const ep = getFloatEpisodeByUrl(nextUrl)
    _floatState.currentUrl = nextUrl
    if (playingEp) playingEp = { ...playingEp, epName: ep?.epName || ep?.name || playingEp.epName, epUrl: nextUrl }
    if (playingEp?.id && playingEp?.source) {
      upsertPlayHistory({
        id: playingEp.id, name: _floatState.title || playingEp.epName || '播放中', pic: playingEp.pic || '',
        source: playingEp.source, epName: playingEp.epName, epUrl: nextUrl, progress: 0, duration: 0,
        allUrls: playingEp.allUrls || _floatState.allUrls || [], allEps: playingEp.allEps || [],
      })
    }
    const vidWrap = document.getElementById('_fvid'); if (vidWrap) vidWrap.innerHTML = ''
    const isM3u8 = nextUrl.includes('.m3u8'); const isMp4 = nextUrl.includes('.mp4')
    if (isM3u8 || isMp4) { if (isM3u8) loadVideoIntoFloat(nextUrl, resumeProgress); else loadMp4IntoFloat(nextUrl, resumeProgress) }
    else if (vidWrap) vidWrap.innerHTML = renderFloatPlaybackError(nextUrl, mt('notDirectVideoUrl'))
  }

  async function loadVideoIntoFloat(url, resumeProgress = 0) {
    await ensureHls()
    const vidWrap = document.querySelector('#_fvid')
    if (!vidWrap) return
    if (window._floatHls) { window._floatHls.destroy(); window._floatHls = null }
    const video = document.createElement('video')
    video.controls = true
    vidWrap.appendChild(video)
    if (window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls()
      window._floatHls = hls
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        const levels = hls.levels || []
        hls.currentLevel = -1
        if (resumeProgress > 0) {
          video.addEventListener('loadedmetadata', () => {
            video.currentTime = Math.min(resumeProgress, video.duration)
          }, { once: true })
        }
      })

      let timedOut = false
      let errCount = 0
      const MAX_ERR = 3
      const clearLoadTimer = () => { clearTimeout(timer) }
      const timer = setTimeout(() => {
        if (!timedOut) { timedOut = true; hls.destroy(); window._floatHls = null
          vidWrap.innerHTML = renderFloatPlaybackError(url, mt('m3u8Timeout'))
        }
      }, 15000)
      hls.on(window.Hls.Events.ERROR, (evt, data) => {
        if (data.fatal) {
          errCount++
          if (errCount < MAX_ERR && (data.type === window.Hls.ErrorTypes.NETWORK_ERROR || data.type === window.Hls.ErrorTypes.MEDIA_ERROR)) {
            console.warn('[FloatHLS] 可恢复错误，尝试恢复 (#' + errCount + '):', data.type, data.details)
            hls.startLoad(); return
          }
          clearLoadTimer()
          timedOut = true; hls.destroy(); window._floatHls = null
          vidWrap.innerHTML = renderFloatPlaybackError(url, mt('playbackInterrupted', { reason: errCount >= MAX_ERR ? mt('multipleRetriesFailed') : data.details }))
        }
      })
      hls.on(window.Hls.Events.MANIFEST_PARSED, clearLoadTimer)
      setupFloatControls(video, hls)
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url
      if (resumeProgress > 0) {
        video.addEventListener('loadedmetadata', () => {
          video.currentTime = Math.min(resumeProgress, video.duration)
        }, { once: true })
      }
      const nativeTimer = setTimeout(() => {
        vidWrap.innerHTML = renderFloatPlaybackError(url, mt('m3u8Timeout'))
      }, 15000)
      video.addEventListener('loadedmetadata', () => clearTimeout(nativeTimer), { once: true })
      video.addEventListener('error', () => {
        clearTimeout(nativeTimer)
        vidWrap.innerHTML = renderFloatPlaybackError(url, mt('playbackFailed'))
      })
      setupFloatControls(video, null)
    } else {
      vidWrap.innerHTML = renderFloatPlaybackError(url, mt('browserUnsupportedHls'))
    }
  }

  function loadMp4IntoFloat(url, resumeProgress = 0) {
    const vidWrap = document.querySelector('#_fvid')
    if (!vidWrap) return
    const video = document.createElement('video')
    video.controls = true
    vidWrap.appendChild(video)
    video.src = url
    if (resumeProgress > 0) {
      video.addEventListener('loadedmetadata', () => {
        video.currentTime = Math.min(resumeProgress, video.duration)
      }, { once: true })
    }
    const loadTimer = setTimeout(() => {
      vidWrap.innerHTML = renderFloatPlaybackError(url, mt('mp4Timeout'))
    }, 15000)
    video.addEventListener('loadedmetadata', () => clearTimeout(loadTimer), { once: true })
    video.addEventListener('error', () => {
      clearTimeout(loadTimer)
      vidWrap.innerHTML = renderFloatPlaybackError(url, mt('playbackFailed'))
    })
    setupFloatControls(video, null)
  }

  // ── 悬浮播放器完整控制条 ──────────────────────────────
  function setupFloatControls(video, hls) {
    const ctrl = document.getElementById('_fctrl')
    if (!ctrl) return
    const playBtn = document.getElementById('_fplay')
    const prevBtn = document.getElementById('_fprev')
    const nextBtn = document.getElementById('_fnext')
    const muteBtn = document.getElementById('_fmute')
    const volWrap = document.getElementById('_fvol')
    const volFill = document.getElementById('_fvolfill')
    const speedBtn = document.getElementById('_fspeed')
    const pipBtn = document.getElementById('_fsp')
    const epBtn = document.getElementById('_fep')
    const seek = document.getElementById('_fseek')
    const fill = document.getElementById('_ffill')
    const thumb = document.getElementById('_fthumb')
    const curT = document.getElementById('_fcur')
    const totT = document.getElementById('_ftot')

    const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3]
    let speedIdx = 2 // 默认 1x
    let _dragging = false
    let _vol = 1

    function fmt(s) {
      s = Math.floor(s)
      return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
    }
    function updateTime() {
      if (!video.duration || !isFinite(video.duration)) return
      const pct = (video.currentTime / video.duration) * 100
      if (fill) fill.style.width = pct + '%'
      if (thumb) thumb.style.left = pct + '%'
      if (curT) curT.textContent = fmt(video.currentTime)
      if (totT) totT.textContent = fmt(video.duration)
    }
    function updateVol() {
      if (volFill) volFill.style.width = (_vol * 100) + '%'
    }

    playBtn?.addEventListener('click', () => {
      if (video.paused) video.play().catch(() => {})
      else video.pause()
    })
    video.addEventListener('play', () => { if (playBtn) playBtn.textContent = '⏸' })
    video.addEventListener('pause', () => { if (playBtn) playBtn.textContent = '▶' })
    video.addEventListener('ended', () => {
      if (playBtn) playBtn.textContent = '▶'
      // 自动下一集
      if (_floatState?.allUrls && _floatState.allUrls.length > 1) {
        const idx = _floatState.allUrls.indexOf(_floatState.currentUrl)
        if (idx >= 0 && idx < _floatState.allUrls.length - 1) {
          const next = _floatState.allUrls[idx + 1]
          switchFloatEpisode(next, 0)
        }
      }
    })
    video.addEventListener('timeupdate', () => {
      updateTime()
      if (!_dragging && playingEp) {
        const pct = (video.currentTime / video.duration) * 100
        if (pct > 1) updatePlayProgress(playingEp.id, playingEp.source, video.currentTime, playingEp.epName, video.duration)
      }
    })

    // 进度条拖拽
    seek?.addEventListener('mousedown', e => {
      _dragging = true
      const rect = seek.getBoundingClientRect()
      video.currentTime = Math.max(0, Math.min(video.duration, (e.clientX - rect.left) / rect.width * video.duration))
      updateTime()
    })
    document.addEventListener('mousemove', e => {
      if (!_dragging || !seek) return
      const rect = seek.getBoundingClientRect()
      video.currentTime = Math.max(0, Math.min(video.duration, (e.clientX - rect.left) / rect.width * video.duration))
      updateTime()
    })
    document.addEventListener('mouseup', () => { _dragging = false })

    // 上一集/下一集
    prevBtn?.addEventListener('click', () => {
      if (!_floatState?.allUrls) return
      const idx = _floatState.allUrls.indexOf(_floatState.currentUrl)
      if (idx > 0) {
        const prev = _floatState.allUrls[idx - 1]
        switchFloatEpisode(prev, 0)
      }
    })
    nextBtn?.addEventListener('click', () => {
      if (!_floatState?.allUrls) return
      const idx = _floatState.allUrls.indexOf(_floatState.currentUrl)
      if (idx >= 0 && idx < _floatState.allUrls.length - 1) {
        const next = _floatState.allUrls[idx + 1]
        switchFloatEpisode(next, 0)
      }
    })

    // 静音
    muteBtn?.addEventListener('click', () => {
      if (video.muted || _vol === 0) {
        video.muted = false; video.volume = _vol > 0 ? _vol : 1
        if (muteBtn) muteBtn.textContent = '🔊'
      } else {
        video.muted = true
        if (muteBtn) muteBtn.textContent = '🔇'
      }
    })
    volWrap?.addEventListener('click', e => {
      const rect = volWrap.getBoundingClientRect()
      _vol = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      video.volume = _vol; video.muted = false
      updateVol()
      if (muteBtn) muteBtn.textContent = '🔊'
    })

    // 倍速
    speedBtn?.addEventListener('click', () => {
      speedIdx = (speedIdx + 1) % SPEEDS.length
      const s = SPEEDS[speedIdx]
      video.playbackRate = s
      if (speedBtn) speedBtn.textContent = s + 'x'
    })

    // 画中画
    pipBtn?.addEventListener('click', () => {
      if (document.pictureInPictureEnabled) video.requestPictureInPicture().catch(() => {})
    })

    // 选集
    epBtn?.addEventListener('click', () => showFloatEpPicker())

    // 双击全屏
    video.addEventListener('dblclick', () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      else video.requestFullscreen().catch(() => {})
    })

    updateTime(); updateVol()
  }

  function showFloatEpPicker() {
    if (!_floatState?.epList) return
    const existing = document.getElementById('_fepmenu')
    if (existing) { existing.remove(); return }
    const menu = document.createElement('div')
    menu.id = '_fepmenu'
    menu.style.cssText = 'position:absolute;bottom:100%;left:50%;transform:translateX(-50%);background:rgba(20,20,35,0.96);border:1px solid #444;border-radius:8px;padding:6px 0;z-index:999999;min-width:160px;max-height:220px;overflow-y:auto'
    _floatState.epList.forEach(ep => {
      const btn = document.createElement('button')
      btn.textContent = ep.epName || ep.name || ep.url
      btn.style.cssText = 'display:block;width:100%;text-align:left;padding:6px 12px;background:none;border:none;color:' + (ep.url === _floatState.currentUrl ? '#e74c3c' : '#ccc') + ';font-size:12px;cursor:pointer'
      btn.addEventListener('click', () => {
        switchFloatEpisode(ep.url, 0)
        menu.remove()
      })
      menu.appendChild(btn)
    })
    document.getElementById('_fep')?.parentElement?.appendChild(menu)
    document.addEventListener('click', () => menu.remove(), { once: true })
  }

  function buildQualityMenu(hls, video) {
    const levels = hls.levels || []
    if (levels.length <= 1) return
    const qBtn = document.getElementById('_fspeed')
    if (!qBtn) return
    let menu = null
    const closeMenu = () => {
      if (!menu) return
      menu.remove()
      menu = null
    }
    qBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      if (menu) { closeMenu(); return }
      menu = document.createElement('div')
      menu.style.cssText = 'position:absolute;bottom:100%;right:0;background:rgba(20,20,35,0.96);border:1px solid #444;border-radius:6px;padding:4px 0;z-index:999999;min-width:80px'
      levels.forEach((lv, i) => {
        const label = lv.height ? lv.height + 'p' : 'Level ' + i
        const btn = document.createElement('button')
        btn.textContent = (hls.currentLevel === i ? '✅ ' : '') + label
        btn.style.cssText = 'display:block;width:100%;text-align:left;padding:5px 10px;background:none;border:none;color:#ccc;font-size:11px;cursor:pointer'
        btn.addEventListener('click', () => { hls.currentLevel = i; menu?.querySelectorAll('button').forEach(b => b.textContent = b.textContent.replace(/^✅ /, '')); btn.textContent = '✅ ' + label; closeMenu() })
        menu.appendChild(btn)
      })
      const autoBtn = document.createElement('button')
      autoBtn.textContent = (hls.currentLevel === -1 ? '✅ ' : '') + '🔀 ' + mt('autoQuality')
      autoBtn.style.cssText = 'display:block;width:100%;text-align:left;padding:5px 10px;background:none;border:none;color:#ccc;font-size:11px;cursor:pointer'
      autoBtn.addEventListener('click', () => { hls.currentLevel = -1; menu?.querySelectorAll('button').forEach(b => b.textContent = b.textContent.replace(/^✅ /, '')); autoBtn.textContent = '✅ 🔀 ' + mt('autoQuality'); closeMenu() })
      menu.appendChild(autoBtn)
      qBtn.parentElement?.appendChild(menu)
      document.addEventListener('click', closeMenu, { once: true })
    })
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

  // 拖拽
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
    if (_floatState) {
      _floatState.wrap.classList.remove('dragging')
      saveFloatState()
    }
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
    // 保存当前播放进度
    const vid = document.querySelector('#_fvid video') || document.querySelector('.tvbox-float-video-wrap video')
    if (vid && vid.duration > 0 && playingEp) {
      updatePlayProgress(playingEp.id, playingEp.source, vid.currentTime, playingEp.epName)
    }
    if (window._floatHls) { window._floatHls.destroy(); window._floatHls = null }
    if (_floatState?.wrap) { _floatState.wrap.remove(); _floatState = null }
    document.removeEventListener('keydown', onFloatEsc)
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
          <div class="tvbox-crawl-title">${mt('crawlPlayerTitle')}</div>
          <div class="tvbox-crawl-sub">${mt('crawlPlayerSubtitle')}</div>
        </div>
        <div class="tvbox-crawl-form" style="margin-bottom:8px">
          <input id="t-crawl-url" type="url" placeholder="${mt('crawlUrlPlaceholder')}" />
          <button id="t-crawl-go" class="tvbox-crawl-btn" style="background:#e74c3c">🔬 ${mt('deepSniff')}</button>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--text-secondary)">
            <input id="t-crawl-auto" type="checkbox" style="width:15px;height:15px" checked />
            🚀 ${mt('crawlAutoplay')}
          </label>
          <button id="t-crawl-urlbtn" class="tvbox-tab" style="font-size:12px;padding:2px 10px">📋 ${mt('directUrlInput')}</button>
        </div>
        <div class="tvbox-crawl-hint">
          <p>${mt('crawlSupportHint')}</p>
        </div>
        <div id="t-crawl-status" class="tvbox-crawl-status"></div>
        <div id="t-crawl-results" class="tvbox-crawl-results"></div>
      </div>
    `

    const input = content.querySelector('#t-crawl-url')
    const btn   = content.querySelector('#t-crawl-go')
    const autoPlay = content.querySelector('#t-crawl-auto')

    async function doCrawl() {
      const url = normalizeHttpUrl(input.value)
      if (!url) {
        showCrawlStatus(mt('invalidHttpUrl'), 'error')
        return
      }
      input.value = url
      btn.disabled = true
      btn.textContent = autoPlay.checked ? `⏳ ${mt('sniffAndPlayLoading')}` : `⏳ ${mt('sniffingLoading')}`
      showCrawlStatus(autoPlay.checked ? `🚀 ${mt('sniffAndPlayStatus')}` : `🔍 ${mt('deepSniffStatus')}`, 'loading')
      _crawlResults = []
      let autoPlayed = false
      const results = await crawlSite(url, autoPlay.checked ? (name, u) => {
        if (autoPlayed) return
        autoPlayed = true
        // 第一个可用链接 → 直接播放（独立窗口）
        showCrawlStatus(mt('crawlPlayableFound', { name }), 'success')
        btn.disabled = false; btn.textContent = `🔬 ${mt('deepSniff')}`
        playCrawlVideo(name, u, 0, [], [u])
      } : null)
      _crawlResults = results
      btn.disabled = false
      btn.textContent = `🔬 ${mt('deepSniff')}`
      if (!autoPlay.checked || !results.length) renderCrawlResults(results)
    }

    btn.addEventListener('click', doCrawl)
    content.querySelector('#t-crawl-urlbtn')?.addEventListener('click', showUrlInput)
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

  // ── 缩略图提取 ─────────────────────────────────────
  function extractThumb(html) {
    const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    if (og && og[1]) return og[1]
    const twitter = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
    if (twitter && twitter[1]) return twitter[1]
    return ''
  }

  // ── DASH / MPD 检测 ─────────────────────────────────
  function extractDash(html, base) {
    const results = []
    const mpdLinks = html.match(/["']([^"']+\.mpd[^"']*)["']/gi) || []
    mpdLinks.forEach(raw => {
      const url = raw.replace(/['">]/g, '')
      if (url.startsWith('http')) results.push({ name: 'DASH manifest', url, thumb: '', type: 'dash' })
    })
    // init.mp4 + seg*.m4s 模式
    const segMatches = html.match(/["']([^"']*init\.mp4[^"']*)["']/gi) || []
    segMatches.forEach(raw => {
      const url = raw.replace(/['">]/g, '')
      if (url.startsWith('http')) results.push({ name: 'M4S片段视频', url, thumb: '', type: 'm4s' })
    })
    return results
  }

  // ── 站点指纹策略记忆 ────────────────────────────────
  const CRAWL_FP_KEY = (domain) => 'crawl_fp_' + domain
  function getSiteStrategy(domain) {
    try { return JSON.parse(localStorage.getItem(CRAWL_FP_KEY(domain)) || 'null') } catch { return null }
  }
  function saveSiteStrategy(domain, strat) {
    try { localStorage.setItem(CRAWL_FP_KEY(domain), JSON.stringify(strat)) } catch {}
  }

  // crawlSite: 爬取URL的视频链接
  // onFirstMatch(url, name): 每条策略首次找到结果时的回调（用于自动播放模式）
  async function crawlSite(url, onFirstMatch) {
    url = normalizeHttpUrl(url)
    if (!url) return []
    if (isDirectVideoUrl(url)) {
      const name = url.split('/').pop().replace(/\.(m3u8|mp4|mpd)/i, '') || mt('directVideo')
      const results = [{ name, url, thumb: '', type: 'direct' }]
      onFirstMatch?.(name, url)
      return results
    }

    // 云盘检测
    const panDomains = ['pan.baidu.com', 'yun.baidu.com', 'wangpan.cn', 'uc.cn', 'quark.cn']
    if (panDomains.some(d => url.includes(d))) {
      showCrawlStatus(mt('cloudLinkDetected'), 'loading')
      try {
        const resp = await fetch('https://api.pan666.cn/?url=' + encodeURIComponent(url), { signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined })
        const json = await resp.json().catch(() => null)
        if (json && json.url) { const cloudName = mt('cloudDirectLink'); onFirstMatch?.(cloudName, json.url); return [{ name: cloudName, url: json.url, thumb: '', type: 'direct' }] }
      } catch {}
      return [{ name: mt('cloudPendingParse'), url, thumb: '', type: 'cloud' }]
    }

    let html = ''
    try { html = await crawlFetch(url) } catch (e) { showCrawlStatus(mt('pageFetchFailed', { msg: e.message }), 'error'); return [] }

    const thumb = extractThumb(html)
    let domain = ''
    try { domain = new URL(url).hostname.replace(/\./g, '_') } catch {}
    const siteStrat = domain ? getSiteStrategy(domain) : null

    const strategies = [
      { name: 'm3u8正则', fn: () => extractM3u8(html, url, thumb) },
      { name: 'mp4正则',  fn: () => extractMp4(html, url) },
      { name: 'DASH检测', fn: () => extractDash(html, url) },
      { name: 'iframe递归', fn: async () => {
        const iframes = extractIframes(html, url)
        const found = []
        for (const iframe of iframes.slice(0, 3)) {
          try {
            const frameHtml = await crawlFetch(iframe.src).catch(() => '')
            const fi = extractM3u8(frameHtml, iframe.src, thumb)
            const fp = extractMp4(frameHtml, iframe.src)
            fi.forEach(i => { i.thumb = i.thumb || thumb; found.push(i) })
            fp.forEach(i => { i.thumb = i.thumb || thumb; found.push(i) })
            const nested = extractIframes(frameHtml, iframe.src).slice(0, 3)
            for (const n of nested) {
              try {
                const nHtml = await crawlFetch(n.src).catch(() => '')
                extractM3u8(nHtml, n.src, thumb).forEach(i => { i.thumb = i.thumb || thumb; found.push(i) })
                extractMp4(nHtml, n.src).forEach(i => { i.thumb = i.thumb || thumb; found.push(i) })
              } catch {}
            }
          } catch {}
        }
        return found
      }},
      { name: 'CMS播放页JS提取', fn: async () => {
        // 如果 URL 本身就是播放页（ruvodplay/play/vodplay），直接用当前页HTML提取
        let playUrl = ''
        let playHtml = ''
        const isPlayPage = /(ruvodplay|play|vodplay)\/\d+/i.test(url)
        if (isPlayPage) {
          playUrl = url
          playHtml = html
        } else {
          // 从详情页HTML中找播放页链接
          const playPageMatch = html.match(/href=["'](\/[^"']*\/ruvodplay\/\d+[^"']*)["']/i)
            || html.match(/href=["'](\/[^"']*\/play\/\d+[^"']*)["']/i)
            || html.match(/href=["'](\/[^"']*\/vodplay\/\d+[^"']*)["']/i)
          if (!playPageMatch) return []
          playUrl = playPageMatch[1].replace(/[?#].*$/, '')
          if (!playUrl) return []
          let base = ''
          try { base = new URL(url).origin } catch {}
          playUrl = playUrl.startsWith('http') ? playUrl : base + playUrl
          playHtml = await crawlFetch(playUrl).catch(() => '')
          if (!playHtml) return []
        }
        // 把 \/ 替换成 /（JS转义）
        const fixed = playHtml.replace(/\\\//g, '/')
        // 找 var player_aaaa = {...} 或类似JS变量
        const playerVars = fixed.match(/var\s+player_\w+\s*=\s*(\{[^;]+\});?/i)
          || fixed.match(/player(?:_\w+)?\s*=\s*(\{[^;]+\});?/i)
          || fixed.match(/"url"\s*:\s*"([^"]+)"/i)
        const found = []
        if (playerVars) {
          const jsonStr = playerVars[1] || playerVars[0]
          // 尝试提取 vod_data.url 或直接 url 字段
          const m3u8Match = jsonStr.match(/"url"\s*:\s*"([^"]+\.m3u8[^"]*)"/i)
            || jsonStr.match(/"(https?:[^"\\]+\.m3u8[^"\\]*)"/i)
            || jsonStr.match(/"vod_data"\s*:\s*\{[^}]+\}/i)
          if (m3u8Match) {
            let vodDataStr = m3u8Match[0]
            // 提取 vod_data 对象
            const vodUrlMatch = vodDataStr.match(/"url"\s*:\s*"([^"]+)"/i)
            if (vodUrlMatch) {
              let videoUrl = vodUrlMatch[1].replace(/\\/g, '')
              // 反转义 JS Unicode 转义 \u3a \\u3a → :
              try { videoUrl = JSON.parse('"' + videoUrl + '"') } catch {}
              if (videoUrl && (videoUrl.includes('.m3u8') || videoUrl.includes('.mp4'))) {
                const name = playUrl.split('/').pop().replace(/\.html/i, '') || 'CMS视频'
                found.push({ name, url: videoUrl, thumb, type: videoUrl.includes('.m3u8') ? 'm3u8' : 'mp4' })
              }
            }
          }
        }
        // 也直接从页面HTML找m3u8/mp4（转义或未转义）
        const directM3u8 = fixed.match(/"(https?:[^"\\]+\.m3u8[^"\\]*)"/i) || []
        const directMp4 = fixed.match(/"(https?:[^"\\]+\.mp4[^"\\]*)"/i) || []
        ;[...directM3u8, ...directMp4].forEach(raw => {
          const u = raw.replace(/[\\"]/g, '').split('?')[0]
          if (u.startsWith('http') && (u.includes('.m3u8') || u.includes('.mp4'))) {
            found.push({ name: u.split('/').pop().replace(/\.(m3u8|mp4).*/i, '') || '视频', url: u, thumb, type: u.includes('.m3u8') ? 'm3u8' : 'mp4' })
          }
        })
        return found
      }},
      { name: '列表提取', fn: () => extractVideoList(html, url) },
      { name: '脚本解析', fn: () => extractFromScript(html, url) },
      // 策略6：JS渲染（用 Edge headless + CDP 渲染后提取）
      { name: 'JS渲染提取', fn: async () => {
        const { invoke } = await import('@tauri-apps/api/core').catch(() => ({}))
        if (!invoke) return []
        try {
          const result = await invoke('fetch_page_js', { url })
          if (!result || result === '[]' || !result.startsWith('[')) return []
          const arr = JSON.parse(result)
          if (!Array.isArray(arr)) return []
          return arr.filter(r => r && r.url).map(r => ({
            name: r.name || r.url.split('/').pop().replace(/\.[^.]+$/, '') || 'JS视频',
            url: r.url,
            thumb: r.thumb || '',
            type: r.url.includes('.m3u8') ? 'm3u8' : (r.url.includes('.mp4') ? 'mp4' : r.type || 'unknown')
          }))
        } catch { return [] }
      }},
    ]

    // 已通知自动播放的 url 集合（防重复）
    const notifiedUrls = new Set()
    function notifyMatch(item) {
      if (!item?.url || notifiedUrls.has(item.url)) return
      notifiedUrls.add(item.url)
      onFirstMatch?.(item.name, item.url)
    }

    const allResults = []
    const settled = await Promise.allSettled(strategies.map(async (s, i) => {
      showCrawlStatus(mt('crawlStrategyRunning', { current: i + 1, total: strategies.length, name: s.name }), 'loading')
      const r = await s.fn()
      showCrawlStatus(mt('crawlStrategyDone', { current: i + 1, total: strategies.length, name: s.name, count: Array.isArray(r) ? r.length : 0 }), 'loading')
      // 自动播放：每条策略首次找到结果立即通知
      if (onFirstMatch && Array.isArray(r) && r.length > 0) notifyMatch(r[0])
      return r
    }))

    settled.forEach((p, i) => {
      if (p.status === 'fulfilled' && Array.isArray(p.value)) {
        p.value.forEach(item => { item.thumb = item.thumb || thumb; allResults.push(item) })
        if (p.value.length > 0 && domain && !siteStrat) saveSiteStrategy(domain, strategies[i].name)
      }
    })

    const seen = new Set()
    return allResults.filter(r => {
      if (!r.url) return false
      if (seen.has(r.url)) return false
      seen.add(r.url)
      return true
    })
  }

  // User-Agent 随机池（防反爬）
  const CRAWL_UAS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ]
  const CRAWL_TIMEOUT = 10000  // 10秒超时
  const CRAWL_RETRIES = 2     // 最多重试2次

  async function crawlFetch(pageUrl, depth = 0) {
    const ua = CRAWL_UAS[Math.floor(Math.random() * CRAWL_UAS.length)]
    const headers = { 'Accept': 'text/html,application/xhtml+xml,*/*', 'Accept-Language': 'zh-CN,zh;q=0.9', 'User-Agent': ua }

    async function _doFetch(signal) {
      // ── 优先：Tauri Rust 后端代理（CORS 穿透）────────
      try {
        const { invoke } = await import('@tauri-apps/api/core').catch(() => ({}))
        if (invoke) {
          const html = await invoke('fetch_page', { url: pageUrl }).catch(() => null)
          if (html) return html
        }
      } catch {}
      // ── 降级：浏览器 fetch ───────────────────────
      const resp = await fetch(pageUrl, { signal, credentials: 'include', headers })
      if (!resp.ok) throw new Error('HTTP ' + resp.status)
      return resp.text()
    }

    // 尝试 fetch，带超时
    let lastErr
    for (let i = 0; i <= CRAWL_RETRIES; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 1000)) // 重试前等1秒
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), CRAWL_TIMEOUT)
        const html = await _doFetch(controller.signal)
        clearTimeout(timer)
        return html
      } catch (e) {
        lastErr = e
        if (e.name === 'AbortError') lastErr = new Error(mt('requestTimeoutSeconds', { seconds: CRAWL_TIMEOUT / 1000 }))
      }
    }
    throw lastErr || new Error(mt('fetchFailed'))
  }

  function extractM3u8(html, base, baseThumb) {
    const results = []
    // 1) 页面直接 URL
    const re = /(?:src|href|url|video|media)[\s"'=]*(\S+\.m3u8[^"'<>\s]*)/gi
    let m
    while ((m = re.exec(html)) !== null) {
      const raw = m[1].replace(/['"]/g, '').split('?')[0]
      const resolved = raw.startsWith('http') ? raw : new URL(raw, base).href
      if (resolved.includes('.m3u8')) {
        const name = raw.split('/').pop().replace('.m3u8', '') || mt('m3u8Video')
        results.push({ name, url: resolved, thumb: baseThumb || '', type: 'm3u8' })
      }
    }
    // 2) JSON 字符串
    const jsonRe = /"(https?:[^"]+\.m3u8[^"]*)"/gi
    while ((m = jsonRe.exec(html)) !== null) {
      const resolved = m[1].split('?')[0]
      if (resolved.includes('.m3u8')) {
        const name = resolved.split('/').pop().replace('.m3u8', '').split(/[,&?]/)[0] || mt('m3u8Video')
        results.push({ name, url: resolved, thumb: baseThumb || '', type: 'm3u8' })
      }
    }
    // 3) M3U8 多分辨率变体（#EXT-X-STREAM-INF）
    if (html.includes('#EXTM3U') && html.includes('#EXT-X-STREAM-INF')) {
      const lines = html.split('\n')
      let curRes = '', curBw = '', curUrl = ''
      for (const line of lines) {
        const l = line.trim()
        if (l.startsWith('#EXT-X-STREAM-INF:')) {
          const bw = l.match(/BANDWIDTH=(\d+)/)?.[1]
          const res = l.match(/RESOLUTION=([^,]+)/)?.[1] || ''
          curBw = bw ? Math.round(parseInt(bw) / 1000) + 'k' : ''
          curRes = res ? res.replace('x', 'p ') : ''
        } else if (l && !l.startsWith('#')) {
          curUrl = l.startsWith('http') ? l : new URL(l, base).href
          const label = (curRes + ' ' + curBw).trim() || mt('streamLabel')
          results.push({ name: '[' + label + '] ' + (curUrl.split('/').pop().replace('.m3u8', '') || 'M3U8'), url: curUrl, thumb: baseThumb || '', type: 'm3u8' })
          curUrl = ''
        }
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
    // 预处理：把 JavaScript 转义的 \/ 和 \u 替换成正常字符
    const fixed = html.replace(/\\\//g, '/').replace(/\\u([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    // ── 1. 从 <script> 块中提取 JS 变量赋值的 URL ──────────
    const varPatterns = [
      /(?:var|let|const)\s+\w+\s*=\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi,
      /(?:player|video|src|media|videoUrl|video_url|playUrl|play_url)\s*[=:]\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi,
      /url\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi,
    ]
    const varRe = /(?:var|let|const)\s+\w+\s*=\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']|player\.src\s*=\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)|video\.src\s*=\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)/gi
    // 通用：寻找包含 m3u8/mp4 的赋值语句或对象属性
    const scriptBlocks = fixed.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || []
    scriptBlocks.forEach(block => {
      const lines = block.replace(/<\/script>/i, '').replace(/<script[^>]*>/i, '')
      const matches = lines.match(/["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/g) || []
      matches.forEach(raw => {
        const url = raw.replace(/["' >]/g, '').split('?')[0]
        if (url.startsWith('http')) {
          const type = url.includes('.m3u8') ? 'm3u8' : 'mp4'
          const name = decodeURIComponent(url.split('/').pop().replace(/\.(m3u8|mp4)/i, '')) || (type === 'm3u8' ? 'M3U8' : 'MP4') + ' 视频'
          results.push({ name, url, thumb: '', type })
        }
      })
    })
    // ── 2. JSON 块中提取 m3u8/mp4 ──────────────────────
    const jsonBlocks = fixed.match(/\{[^{}]{50,50000}\}/g) || []
    jsonBlocks.forEach(block => {
      const m3u8Matches = block.match(/"(https?:[^"]+\.m3u8[^"]*)"/gi) || []
      const mp4Matches = block.match(/"(https?:[^"]+\.mp4[^"]*)"/gi) || []
      ;[...m3u8Matches, ...mp4Matches].forEach(raw => {
        const url = raw.replace(/["' >]/g, '').split('?')[0]
        if (url.startsWith('http')) {
          const type = url.includes('.m3u8') ? 'm3u8' : 'mp4'
          const name = decodeURIComponent(url.split('/').pop().replace(/\.(m3u8|mp4)/i, '')) || (type === 'm3u8' ? 'M3U8' : 'MP4') + ' 视频'
          results.push({ name, url, thumb: '', type })
        }
      })
    })
    return results
  }

  function renderCrawlResults(results) {
    const container = el.querySelector('#t-crawl-results')
    if (!results || results.length === 0) {
      container.innerHTML = `<div class="tvbox-empty"><div class="tvbox-empty-icon">🔍</div><div class="tvbox-empty-title">${mt('crawlNoVideoTitle')}</div><div class="tvbox-empty-sub">${mt('crawlNoVideoSubtitle')}</div></div>`
      showCrawlStatus('', 'info')
      return
    }
    showCrawlStatus(mt('crawlPlayableCount', { count: results.length }), 'success')

    // 导出按钮
    const exportBar = '<div style="display:flex;gap:10px;margin-bottom:16px">' +
      `<button id="_crawl-export-json" class="tvbox-crawl-btn" style="flex:1">📥 ${mt('exportJson')}</button>` +
      `<button id="_crawl-export-m3u" class="tvbox-crawl-btn" style="flex:1">📄 ${mt('exportM3u')}</button></div>`
    container.innerHTML = exportBar + '<div class="tvbox-grid">' + results.map((r, i) => {
      const typeIcon = { direct: '🎬', m3u8: '📺', mp4: '🎞️', dash: '📡', m4s: '🎞️', cloud: '☁️', link: '🔗' }[r.type] || '📺'
      const picHtml = r.thumb
        ? '<img src="' + escHtml(r.thumb) + '" alt="' + escHtml(r.name) + '" loading="lazy" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display=\'none\';this.parentElement.innerHTML=\'<span style=font-size:32px;display:flex;align-items:center;justify-content:center;width:100%;height:100%>' + typeIcon + '</span>\'" />'
        : '<span style="font-size:32px;display:flex;align-items:center;justify-content:center;width:100%;height:100%">' + typeIcon + '</span>'
      return '<div class="tvbox-card tvbox-crawl-card" data-index="' + i + '">' +
        '<div class="tvbox-card-inner">' +
          '<div class="tvbox-card-pic"><div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:8px">' + picHtml + '</div></div>' +
          '<div class="tvbox-card-info">' +
            '<div class="tvbox-card-title" style="font-size:12px;line-height:1.3">' + escHtml(r.name.slice(0, 40)) + '</div>' +
            '<div class="tvbox-card-sub">' + r.type.toUpperCase() + '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    }).join('') + '</div>'

    // JSON 导出
    container.querySelector('#_crawl-export-json')?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' })
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'crawl_results.json' })
      a.click()
    })
    // M3U 导出
    container.querySelector('#_crawl-export-m3u')?.addEventListener('click', () => {
      const m3u = '#EXTM3U\n' + results.filter(r => r.url.includes('.m3u8') || r.url.includes('.mp4')).map(r => '#EXTINF:-1,' + r.name + '\n' + r.url).join('\n')
      const blob = new Blob([m3u], { type: 'audio/x-mpegurl' })
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'crawl_results.m3u' })
      a.click()
    })

    container.querySelectorAll('.tvbox-crawl-card').forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.index)
        const r = _crawlResults[idx]
        if (r) playCrawlVideo(r.name, r.url, 0, [], [r.url])
      })
    })
  }

  // playCrawlVideo: 独立窗口播放（不影响主界面，支持继续播放）
  async function playCrawlVideo(name, url, resume = 0, allEps, allUrls) {
    // 从历史记录读进度
    if (resume === 0) {
      try {
        const h = getPlayHistory().filter(s => s.source === 'crawl')
        const prev = h.find(s => s.epUrl === url || s.url === url)
        if (prev && prev.progress > 0 && prev.progress < 999) resume = prev.progress
      } catch {}
    }
    const ctx = { id: url, source: 'crawl', epName: name }
    const { invoke } = await import('@tauri-apps/api/core').catch(() => ({}))
    if (invoke) {
      try {
        await invoke('open_player_window', {
          url, title: name, resume,
          lang: getLang(),
          allEps: JSON.stringify(allEps || []),
          allUrls: JSON.stringify(allUrls || [url]),
          playbackCtx: JSON.stringify(ctx),
          pic: '',
        })
      } catch {
        openPlayerVod(name, url, 'crawl', 'crawl', name, '', [url], resume, [])
      }
    } else {
      openPlayerVod(name, url, 'crawl', 'crawl', name, '', [url], resume, [])
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
        <div class="tvbox-url-title">🔗 ${mt('urlParserTitle')}</div>
        <div class="tvbox-url-err" id="_urlerr"></div>
        <div class="tvbox-url-row">
          <input id="_urlin" type="url" placeholder="${mt('urlParserPlaceholder')}" autofocus />
          <button class="tvbox-url-go" id="_urlgo">${mt('parse')}</button>
        </div>
        <div class="tvbox-url-hint">
          ${mt('urlParserHint')}
        </div>
        <button class="tvbox-url-cancel" id="_urlcancel">${mt('cancel')}</button>
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
      const parsedUrl = normalizeHttpUrl(rawUrl)
      if (!parsedUrl) { showErr(mt('invalidHttpLink')); return }
      inp.value = parsedUrl
      clearErr()
      const goBtn = overlay.querySelector('#_urlgo')
      goBtn.disabled = true
      goBtn.textContent = mt('parsing')

      try {
        // 直链直接播
        if (isDirectVideoUrl(parsedUrl)) {
          overlay.remove()
          openFloatPlayer(mt('directPlayback'), parsedUrl, parsedUrl, 'url_input', mt('directPlayback'), '', [parsedUrl], 0)
          return
        }

        // 量子/暴风分享页 → 尝试 Rust vod_fetch 提取详情
        const isLzShare = /\/share\//.test(parsedUrl) || parsedUrl.includes('v.lfthirtytwo.com') || parsedUrl.includes('vip.lz-')
        if (isLzShare) {
          overlay.remove()
          openFloatPlayer(mt('parsing'), parsedUrl, parsedUrl, 'share_page', mt('parsing'), '', [parsedUrl], 0)
          // 先尝试用 vod_fetch 找详情接口
          await tryExtractFromSharePage(parsedUrl)
          return
        }

        // 其他页面 → 尝试复用爬虫解析，避免“无法解析”假播放旧状态
        showErr(mt('parsingPageWait'))
        const results = await crawlSite(parsedUrl, null)
        const playable = results.filter(r => r?.url && (isDirectVideoUrl(r.url) || r.type !== 'cloud'))
        if (playable.length) {
          const first = playable[0]
          overlay.remove()
          playCrawlVideo(first.name || mt('parseResult'), first.url, 0, [], playable.map(r => r.url))
          return
        }
        showErr(mt('noPlayableUrlDeepSniffHint'))
      } finally {
        if (document.body.contains(overlay)) {
          goBtn.disabled = false
          goBtn.textContent = mt('parse')
        }
      }
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
      vidWrap.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#6b6b8a;font-size:13px">${mt('sharePageBrowserRequired')}</div>`
    }
    // 更新说明
    const urlBar = document.querySelector('.tvbox-float-url-bar')
    if (urlBar) {
      const a = urlBar.querySelector('a')
      if (a) a.href = shareUrl
    }
    // 尝试 iframe 播放（可能失败）
    if (vidWrap && !vidWrap.innerHTML.includes('iframe')) {
      const safeUrl = normalizeHttpUrl(shareUrl)
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

  async function searchDetailFallback(source, keyword) {
    const q = encodeURIComponent(keyword)
    const urls = [
      source.api + '?ac=videolist&wd=' + q + '&pg=1',
      source.api + '?ac=videolist&zm=' + q + '&pg=1',
      source.api + '?ac=list&wd=' + q + '&pg=1',
      source.api + '?ac=detail&wd=' + q,
    ]
    for (const url of urls) {
      try {
        const json = await fetchJSON(url)
        const item = json?.list?.find?.(v => String(v.vod_name || '').includes(keyword)) || json?.list?.[0]
        if (item) return item
      } catch {}
      try {
        const jsonp = await fetchJsonp(url)
        const item = jsonp?.list?.find?.(v => String(v.vod_name || '').includes(keyword)) || jsonp?.list?.[0]
        if (item) return item
      } catch {}
    }
    return null
  }

  async function warmUpEpisodeSources(item) {
    const urls = []
    const from = String(item?.vod_play_from || '').split('$$$')
    const play = String(item?.vod_play_url || '').split('$$$')
    for (let i = 0; i < Math.min(from.length, play.length); i++) {
      const part = play[i] || ''
      const first = part.split('#').find(Boolean) || ''
      const idx = first.indexOf('$')
      if (idx >= 0) urls.push(first.slice(idx + 1))
    }
    const ping = urls.slice(0, 3).filter(Boolean).map(url => fetch(url, { method: 'HEAD', signal: AbortSignal.timeout ? AbortSignal.timeout(3000) : undefined }).catch(() => null))
    await Promise.allSettled(ping)
  }
}
