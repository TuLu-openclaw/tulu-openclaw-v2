/**
 * 屠戮影视 v3.0 - 全网影视 + TVBox JSON API
 * 支持 CMS API + TVBox JSON 格式 + 多仓聚合
 * 2026-04-18 v3.0
 */
import '../style/movie-tool.css'

// ─── 内置 CMS 视频源 ────────────────────────────
const VOD_SOURCES = [
  { key: 'bfzy',   name: '暴风资源', api: 'https://bfzyapi.com/api.php',              type: 'cms',  color: '#e50914', logo: '🎬' },
  { key: 'lziapi', name: '量子资源', api: 'https://cj.lziapi.com/api.php',             type: 'cms',  color: '#7b2dff', logo: '🔮' },
  { key: 'xsd',    name: '星之尘',   api: 'https://xsd.sdzyapi.com/api.php',            type: 'cms',  color: '#00a8e8', logo: '✨' },
  { key: 'tyys',   name: '天涯资源', api: 'https://tyyszy.com/api.php',                type: 'cms',  color: '#f5a623', logo: '🌙' },
  { key: 'zyku',   name: '1080资源', api: 'https://api.1080zyku.com/inc/api_mac10.php', type: '1080', color: '#ff6b35', logo: '📺' },
]

// ─── 内置 TVBox JSON API ───────────────────────
// 使用 cdn.statically.io 代理 GitHub
const TVBOX_BUILTIN = [
  { key: 'fongmi',    name: 'FongMi',    url: 'https://cdn.statically.io/gh/FongMi/CatVodSpider/main/json/b.json',        note: '推荐' },
  { key: 'hjd',       name: 'HJD TVBox', url: 'https://cdn.statically.io/gh/hjdhnx/Dr_TVBox/main/json/api.json',          note: '' },
  { key: 'cattorn',   name: 'Cat TVBox', url: 'https://cdn.statically.io/gh/CatTornado/TVBox/main/json/api.json',          note: '' },
  { key: 'sunpolar',  name: 'SunPolar',  url: 'https://cdn.statically.io/gh/SunPolar/TVBox/main/json/api.json',            note: '' },
  { key: 'imdgo',     name: 'imDgo',    url: 'https://cdn.statically.io/gh/imDgo/TVBox/main/json/api.json',              note: '' },
  { key: 'q215',      name: 'q215 TVBox',url: 'https://cdn.statically.io/gh/q215813905/TVBox/main/json/api.json',         note: '' },
  { key: '173799616', name: '173仓',     url: 'https://cdn.statically.io/gh/173799616/TVBox/master/json/api.json',        note: '' },
  { key: '7wf',       name: '7尿壶',     url: 'https://cdn.statically.io/gh/7尿壶/TVBox/main/json/apijson.json',         note: '' },
  { key: 'yyfxz',     name: '业余打发',  url: 'https://cdn.statically.io/gh/yyfxz/qqtv/main/qq.json',                  note: '' },
]
  { key: 'xsd',    name: '星之尘',   api: 'https://xsd.sdzyapi.com/api.php',            type: 'cms',  color: '#00a8e8', logo: '✨' },
  { key: 'tyys',   name: '天涯资源', api: 'https://tyyszy.com/api.php',                type: 'cms',  color: '#f5a623', logo: '🌙' },
  { key: 'zyku',   name: '1080资源', api: 'https://api.1080zyku.com/inc/api_mac10.php', type: '1080', color: '#ff6b35', logo: '📺' },
]
const TV_SOURCES = [
  { key: 'zdir',  name: 'zdir聚合', url: 'http://zdir.kebedd69.repl.co/public/live.txt' },
  { key: 'jukan', name: '聚看影视',  url: 'http://home.jundie.top:81/Cat/tv/live.txt' },
  { key: 'ftyyy', name: 'Ftyyy',    url: 'http://ftyyy.tk/live.txt' },
  { key: 'rihou', name: 'rihou',    url: 'http://rihou.cc:555/gggg.nzk' },
]
const VOD_CATS = [
  { id: 'movie',       label: '电影',   typeId: '1',  emoji: '🎬', color: '#e50914' },
  { id: 'tv',          label: '剧集',   typeId: '2',  emoji: '📺', color: '#7b2dff' },
  { id: 'variety',     label: '综艺',   typeId: '3',  emoji: '🎭', color: '#f5a623' },
  { id: 'anime',       label: '动漫',   typeId: '4',  emoji: '🐱', color: '#00c853' },
  { id: 'documentary', label: '纪录片', typeId: '21', emoji: '🎙️', color: '#00a8e8' },
  { id: 'short',       label: '短剧',   typeId: '5',  emoji: '🔥', color: '#ff6b35' },
]
const K_FAV = 'tulu_vod_fav', K_HIST = 'tulu_vod_hist', K_SEARCH = 'tulu_vod_search'
const K_CUSTOM_TVBOX = 'tulu_custom_tvbox'
const K_ACTIVE_MODE = 'tulu_active_mode'
const K_ACTIVE_TVBOX = 'tulu_active_tvbox'
const K_CMS_IDX = 'tulu_cms_idx'

let _s = { view: 'home', cmsIdx: 0, detail: null, favs: [], hist: [], results: [], banners: [], tvboxConfig: null, customTvbox: [], activeTvboxKey: null }
let _el = null, _player = null, _tvCache = {}, _tvboxCache = {}

const $ = s => _el?.querySelector(s)
const $$ = s => [...(_el?.querySelectorAll(s) || [])]
const esc = s => String(s ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) } }
const spin = () => '<div class="m-spinner"><div class="m-spinner-ring"></div></div>'

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw new Error(r.status)
  return r.text()
}
async function fetchJSON(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) })
  if (!r.ok) throw new Error(r.status)
  return r.json()
}
const trim = s => (s || '').trim()

function parseDl(dl) {
  if (!dl) return []
  return [...dl.querySelectorAll('dd')].map(dd => ({
    flag: dd.getAttribute('flag') || '',
    urls: (dd.textContent || '').split('$$$').filter(Boolean),
  }))
}

function parseXml(txt) {
  try {
    const doc = new DOMParser().parseFromString(txt, 'text/xml')
    return [...doc.querySelectorAll('video')].map(v => ({
      id:       trim(v.querySelector('id')?.textContent),
      name:     trim(v.querySelector('name')?.textContent),
      pic:      trim(v.querySelector('pic')?.textContent),
      type:     trim(v.querySelector('type')?.textContent),
      year:     trim(v.querySelector('year')?.textContent),
      area:     trim(v.querySelector('area')?.textContent),
      actor:    trim(v.querySelector('actor')?.textContent),
      director: trim(v.querySelector('director')?.textContent),
      des:      trim(v.querySelector('des')?.textContent),
      dl:       parseDl(v.querySelector('dl')),
    }))
  } catch { return [] }
}

function parse1080Dl(v) {
  let urls = []
  for (let i = 1; i <= 200; i++) {
    const u = v['vod_' + i + '_url'] || v['url_' + i]
    const n = v['vod_' + i + '_name'] || ('第' + i + '集')
    if (u) urls.push(n + '$$' + u)
    else if (i > 10) break
  }
  if (!urls.length) {
    const str = v.vod_play_url || v.play_url || ''
    if (str) return str.split('$$$').map((s, i) => {
      const [n, u] = s.split('$')
      return { flag: '1080P', urls: [u ? (n || '线路' + (i + 1)) + '$$' + u : s] }
    })
  }
  return urls.length ? [{ flag: '1080P', urls }] : []
}

function parse1080(json) {
  try {
    const list = json.list || json.data || []
    return list.map(v => ({
      id:       v.id || v.vod_id || '',
      name:     v.name || v.title || v.vod_name || '',
      pic:      v.pic || v.thumb || v.vod_pic || '',
      type:     v.type || v.vod_type || '',
      year:     v.year || v.vod_year || '',
      area:     v.area || v.vod_area || '',
      actor:    v.actor || v.vod_actor || '',
      director: v.director || v.vod_director || '',
      des:      v.des || v.content || v.vod_content || '',
      dl:       parse1080Dl(v),
    }))
  } catch { return [] }
}

// ─── 解析：TVBox JSON ───────────────────────────
function parseTvboxList(config) {
  const result = []
  for (const cat of (config?.list || [])) {
    const catName = cat.name || '未分类'
    for (const v of (cat.list || [])) {
      result.push({
        id:       v.id || v.vod_id || v.player_id || '',
        name:     v.name || v.title || v.vod_name || '',
        pic:      v.pic || v.thumb || v.vod_pic || '',
        type:     v.type || v.vod_type || catName,
        year:     v.year || v.vod_year || '',
        area:     v.area || v.vod_area || '',
        actor:    v.actor || v.vod_actor || '',
        director: v.director || v.vod_director || '',
        des:      v.des || v.content || v.vod_content || v.vod_blurb || '',
        dl:       parseTvboxDl(v),
        _cat:     catName,
      })
    }
  }
  return result
}

function parseTvboxDl(v) {
  const playFrom = v.vod_play_from || v.play_from || ''
  const playUrl  = v.vod_play_url  || v.play_url  || ''
  if (!playUrl) return []
  const flags = playFrom.split('$$$')
  const urlGroups = playUrl.split('$$$')
  const result = []
  flags.forEach((flag, fi) => {
    const urls = (urlGroups[fi] || urlGroups[0] || '').split('#').filter(Boolean)
    if (urls.length) result.push({ flag: flag.trim() || '默认', urls: urls.map(u => { const [n, url] = u.split('$'); return (n || '') + '$' + url }) })
  })
  return result
}

// ─── 本地存储 ─────────────────────────────────
const getFavs = () => { try { return JSON.parse(localStorage.getItem(K_FAV) || '[]') } catch { return [] } }
const getHist = () => { try { return JSON.parse(localStorage.getItem(K_HIST) || '[]') } catch { return [] } }
const getSearchHist = () => { try { return JSON.parse(localStorage.getItem(K_SEARCH) || '[]') } catch { return [] } }
const saveFavs = a => localStorage.setItem(K_FAV, JSON.stringify(a))
const saveHist = a => localStorage.setItem(K_HIST, JSON.stringify(a))
const saveSearchHist = a => localStorage.setItem(K_SEARCH, JSON.stringify(a))
const getCustomTvbox = () => { try { return JSON.parse(localStorage.getItem(K_CUSTOM_TVBOX) || '[]') } catch { return [] } }
const saveCustomTvbox = a => localStorage.setItem(K_CUSTOM_TVBOX, JSON.stringify(a))
const getActiveMode = () => localStorage.getItem(K_ACTIVE_MODE) || 'cms'
const setActiveMode = m => localStorage.setItem(K_ACTIVE_MODE, m)
const getActiveTvboxKey = () => localStorage.getItem(K_ACTIVE_TVBOX) || ''
const setActiveTvboxKey = k => localStorage.setItem(K_ACTIVE_TVBOX, k)
const getCmsIdx = () => Number(localStorage.getItem(K_CMS_IDX) || 0)
const setCmsIdx = i => localStorage.setItem(K_CMS_IDX, String(i))

function toggleFav(video, srcIdx) {
  const src = VOD_SOURCES[srcIdx]; let favs = getFavs()
  const i = favs.findIndex(f => f.id === video.id && f.key === (src?.key || video.key))
  if (i >= 0) favs.splice(i, 1); else favs.unshift({ ...video, key: src?.key || video.key, name: src?.name || video.name, logo: src?.logo || video.logo || '📺', srcIdx, addedAt: Date.now() })
  saveFavs(favs); _s.favs = favs; return i < 0
}

function addHist(video, epInfo) {
  let hist = getHist().filter(h => !(h.id === video.id && h.key === VOD_SOURCES[_s.cmsIdx]?.key))
  hist.unshift({ ...video, key: VOD_SOURCES[_s.cmsIdx]?.key || video.key, srcIdx: _s.cmsIdx, epInfo, updatedAt: Date.now() })
  saveHist(hist.slice(0, 50)); _s.hist = hist
}

// ─── 加载 TVBox API ───────────────────────────
async function loadTvboxApi(api) {
  if (_tvboxCache[api.key]) return _tvboxCache[api.key]
  try {
    const txt = await fetchText(api.url)
    const config = JSON.parse(txt)
    _tvboxCache[api.key] = config
    return config
  } catch (e) { console.warn('[movie-tool] TVBox load failed:', api.name, e.message); return null }
}

async function getVideos(srcIdx, typeId, page = 1) {
  const src = VOD_SOURCES[srcIdx]
  const url = src.api + '?ac=videolist&t=' + typeId + '&pg=' + page
  return src.type === '1080' ? parse1080(await fetchJSON(url)) : parseXml(await fetchText(url))
}

async function getDetail(srcIdx, id) {
  const src = VOD_SOURCES[srcIdx]
  const url = src.api + '?ac=detail&ids=' + id
  const r = src.type === '1080' ? parse1080(await fetchJSON(url)) : parseXml(await fetchText(url))
  return r[0] || null
}

async function getRecommend(srcIdx) {
  const src = VOD_SOURCES[srcIdx]
  const url = src.api + '?ac=videolist&t=1&pg=1'
  return (src.type === '1080' ? parse1080(await fetchJSON(url)) : parseXml(await fetchText(url))).slice(0, 12)
}

// ─── TVBox 视频操作 ───────────────────────────
const CAT_TYPEIDS = { movie: '1', tv: '2', variety: '3', anime: '4', short: '5', documentary: '21' }

async function getVideosByTvbox(catId, page = 1) {
  const config = _s.tvboxConfig
  if (!config) return []
  const typeId = CAT_TYPEIDS[catId] || catId
  const all = parseTvboxList(config)
  if (typeId === 'all') return all.slice((page - 1) * 30, page * 30)
  return all.filter(v => (v.type || '').includes(typeId)).slice((page - 1) * 30, page * 30)
}

async function getDetailByTvbox(id) {
  const config = _s.tvboxConfig
  if (!config) return null
  return parseTvboxList(config).find(v => v.id === id) || null
}

async function searchTvbox(kw) {
  const config = _s.tvboxConfig
  if (!config) return []
  const q = kw.toLowerCase()
  return parseTvboxList(config).filter(v =>
    (v.name && v.name.toLowerCase().includes(q)) ||
    (v.actor && v.actor.toLowerCase().includes(q)) ||
    (v.des && v.des.toLowerCase().includes(q))
  )
}

async function searchAll(kw) {
  const results = []
  const isCms = getActiveMode() === 'cms'

  if (isCms) {
    // CMS 全源并发搜索
    const tasks = VOD_SOURCES.map(async (src, i) => {
      try {
        const url = src.api + '?ac=videolist&t=1&pg=1'
        const r = src.type === '1080' ? parse1080(await fetchJSON(url)) : parseXml(await fetchText(url))
        return r.filter(v => v.name.includes(kw) || (v.actor && v.actor.includes(kw))).map(v => ({ ...v, _src: i, _kind: 'cms' }))
      } catch { return [] }
    })
    results.push(...(await Promise.allSettled(tasks)).flatMap(r => r.status === 'fulfilled' ? r.value : []))
  } else {
    // TVBox JSON 搜索
    if (_s.tvboxConfig) {
      try { results.push(...(await searchTvbox(kw)).map(v => ({ ...v, _src: 0, _kind: 'tvbox' }))) } catch {}
    }
    // 自定义 TVBox API 搜索
    for (const api of _s.customTvbox) {
      try {
        const config = await loadTvboxApi(api)
        if (config) results.push(...parseTvboxList(config).filter(v => (v.name && v.name.includes(kw)) || (v.actor && v.actor.includes(kw))).map(v => ({ ...v, _src: api.key, _kind: 'custom' })))
      } catch {}
    }
  }
  return results
}

// ─── 播放器 ───────────────────────────────────
function play(url, container, start = 0) {
  destroyPlayer()
  if (!url) { container.innerHTML = '<div style="color:#fff;padding:40px;text-align:center">播放地址无效</div>'; return }
  if (url.includes('.m3u8')) playHls(url, container, start)
  else if (url.includes('.mp4')) playMp4(url, container, start)
  else playIframe(url, container)
}

function playHls(url, container, start) {
  container.innerHTML = '<video id="m-video" controls autoplay playsinline style="width:100%;height:100%;background:#000"></video>'
  const el = document.getElementById('m-video')
  import('https://cdn.jsdelivr.net/npm/hls.js@1.5.0/dist/hls.min.js').then(() => {
    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      const h = new Hls({ startPosition: start }); h.loadSource(url); h.attachMedia(el)
      h.on(Hls.Events.MANIFEST_PARSED, () => el.play())
      _player = { destroy: () => h.destroy() }
    }
  }).catch(() => {})
}

function playMp4(url, container, start) {
  container.innerHTML = '<video id="m-video" controls autoplay playsinline style="width:100%;height:100%;background:#000"><source src="' + esc(url) + '" type="video/mp4"></video>'
  const el = document.getElementById('m-video')
  if (start > 0) el.addEventListener('loadedmetadata', () => { el.currentTime = start }, { once: true })
  _player = { destroy: () => { try { el.pause(); el.src = '' } catch {} } }
}

function playIframe(url, container) {
  container.innerHTML = '<iframe src="' + esc(url) + '" allow="autoplay; fullscreen" allowfullscreen style="width:100%;height:100%;border:none;background:#000"></iframe>'
  _player = { destroy: () => {} }
}

function destroyPlayer() { if (_player) { try { _player.destroy() } catch {} _player = null } }

// ─── 本地存储 ─────────────────────────────────
const getFavs = () => { try { return JSON.parse(localStorage.getItem(K_FAV) || '[]') } catch { return [] } }
const getHist = () => { try { return JSON.parse(localStorage.getItem(K_HIST) || '[]') } catch { return [] } }
const getSearchHist = () => { try { return JSON.parse(localStorage.getItem(K_SEARCH) || '[]') } catch { return [] } }
const saveFavs = a => localStorage.setItem(K_FAV, JSON.stringify(a))
const saveHist = a => localStorage.setItem(K_HIST, JSON.stringify(a))
const saveSearchHist = a => localStorage.setItem(K_SEARCH, JSON.stringify(a))

function toggleFav(video, srcIdx) {
  const src = VOD_SOURCES[srcIdx]; let favs = getFavs()
  const i = favs.findIndex(f => f.id === video.id && f.key === src.key)
  if (i >= 0) favs.splice(i, 1); else favs.unshift({ ...video, key: src.key, name: src.name, logo: src.logo, srcIdx, addedAt: Date.now() })
  saveFavs(favs); _s.favs = favs; return i < 0
}

function addHist(video, epInfo) {
  let hist = getHist().filter(h => !(h.id === video.id && h.key === VOD_SOURCES[_s.cmsIdx]?.key))
  hist.unshift({ ...video, key: VOD_SOURCES[_s.cmsIdx]?.key || video.key, srcIdx: _s.cmsIdx, epInfo, updatedAt: Date.now() })
  saveHist(hist.slice(0, 50)); _s.hist = hist
}

// ─── 路由 ─────────────────────────────────────
function route() {
  const m = window.location.hash.match(/#\/movie-tool(?:\/([^/]+))?(?:\/(.+))?/)
  return { view: m?.[1] || 'home', param: m?.[2] || '' }
}
function navTo(view, param) {
  window.location.hash = param ? '#/movie-tool/' + view + '/' + param : '#/movie-tool/' + view
  handleRoute({ view, param })
}
function handleRoute(r) {
  _s.view = r.view || 'home'; const p = r.param || ''
  switch (_s.view) {
    case 'home':   renderHome(); break
    case 'search': renderSearch(p); break
    case 'detail': { const [id, si] = p.split('/').concat([0]).slice(0, 2); renderDetail(id, Number(si)) }; break
    case 'play':   { const [id, si] = p.split('/').concat([0]).slice(0, 2); renderPlayer(id, Number(si)) }; break
    case 'my':     renderMy(); break
    case 'live':   renderLive(); break
    case 'api':    renderApiManage(); break
    default:       renderHome()
  }
}

export default function render(container) {
  _el = document.createElement('div'); _el.className = 'm-root'
  ;(container || document.body).appendChild(_el)
  _s.favs = getFavs(); _s.hist = getHist()
  _s.customTvbox = getCustomTvbox()
  _s.cmsIdx = getCmsIdx()
  initTvbox()
  window.addEventListener('hashchange', () => handleRoute(route()))
  handleRoute(route())
}

async function initTvbox() {
  const mode = getActiveMode()
  if (mode !== 'tvbox') return
  const key = getActiveTvboxKey()
  const builtIn = TVBOX_BUILTIN.find(a => a.key === key)
  if (builtIn) {
    const config = await loadTvboxApi(builtIn)
    if (config) { _s.tvboxConfig = config; _s.activeTvboxKey = key; return }
  }
  for (const api of _s.customTvbox) {
    if (api.key === key) {
      const config = await loadTvboxApi(api)
      if (config) { _s.tvboxConfig = config; _s.activeTvboxKey = key; return }
    }
  }
  if (!_s.tvboxConfig) { setActiveMode('cms') }
}

// ─── 首页 ─────────────────────────────────────
async function renderHome() {
  const mode = getActiveMode()
  const modeLabel = mode === 'cms' ? '📺 CMS' : '🔗 ' + (TVBOX_BUILTIN.find(a => a.key === _s.activeTvboxKey)?.name || 'TVBox')
  _el.innerHTML = '<div class="m-navbar"><div class="m-logo">🎬 <span>屠戮影视</span></div><div class="m-navbar-btns"><button class="m-icon-btn" id="btn-api" title="数据源设置">⚙️</button><button class="m-icon-btn" id="btn-my" title="我的">❤️</button><button class="m-icon-btn" id="btn-live" title="电视直播">📡</button><button class="m-icon-btn" id="btn-src" title="切换源">' + modeLabel + '</button></div></div><div class="m-scroll"><div class="m-home" id="m-home">' + spin() + '</div></div>'
  $('#btn-api')?.addEventListener('click', () => navTo('api'))
  $('#btn-my')?.addEventListener('click', () => navTo('my'))
  $('#btn-live')?.addEventListener('click', () => navTo('live'))
  $('#btn-src')?.addEventListener('click', () => showModePicker())

  let banners = []
  if (mode === 'cms') {
    try { banners = await getRecommend(_s.cmsIdx); _s.banners = banners } catch {}
  }

  const cats = await Promise.all(VOD_CATS.map(async cat => {
    try {
      const data = mode === 'cms'
        ? await getVideos(_s.cmsIdx, cat.typeId, 1)
        : await getVideosByTvbox(cat.id, 1)
      return { cat, data: data.slice(0, 6) }
    } catch { return { cat, data: [] } }
  }))
  buildHomeHtml(banners, cats)
}

function buildHomeHtml(banners, cats) {
  const home = $('#m-home'); if (!home) return
  let bh = ''
  if (banners.length) {
    bh = '<div class="m-banner" id="m-banner"><div class="m-banner-track" id="m-banner-track">' +
      banners.map((v, i) => '<div class="m-banner-slide' + (i === 0 ? ' active' : '') + '" data-i="' + i + '" data-id="' + esc(v.id) + '" data-si="' + _s.cmsIdx + '"><div class="m-banner-pic" style="background-image:url(\'' + esc(v.pic) + '\')" onerror="this.style.background=\'linear-gradient(135deg,#1a1a2e,#16213e)\';this.innerHTML=\'<span style=color:#fff;font-size:40px>🎬</span>\'"></div><div class="m-banner-grad"></div><div class="m-banner-info"><div class="m-banner-title">' + esc(v.name) + '</div><div class="m-banner-meta">' + esc(v.type || '') + ' · ' + esc(v.year || '') + '</div></div></div>').join('') +
      '</div><div class="m-banner-dots" id="m-banner-dots">' +
      banners.map((_, i) => '<span class="m-dot' + (i === 0 ? ' active' : '') + '" data-i="' + i + '"></span>').join('') + '</div></div>'
  }
  const catsHtml = cats.map(({ cat, data }) =>
    '<div class="m-cat"><div class="m-cat-hdr"><span class="m-cat-title">' + cat.emoji + ' ' + cat.label + '</span><span class="m-cat-more" data-cat="' + cat.id + '">更多 ›</span></div><div class="m-card-grid">' + data.map(v => card(v, _s.cmsIdx)).join('') + '</div></div>'
  ).join('')
  home.innerHTML = bh + '<div class="m-quick-live" id="m-go-live"><span>📡</span> 电视直播 <span class="m-arrow">›</span></div>' + catsHtml

  let bi = 0
  const goBanner = idx => {
    $$('.m-dot').forEach((d, i) => d.classList.toggle('active', i === idx))
    $$('.m-banner-slide').forEach((s, i) => s.classList.toggle('active', i === idx)); bi = idx
  }
  const bt = setInterval(() => goBanner((bi + 1) % _s.banners.length), 4000)
  $$('.m-dot').forEach(d => d.addEventListener('click', () => { clearInterval(bt); goBanner(Number(d.dataset.i)) }))
  $$('.m-banner-slide').forEach(s => s.addEventListener('click', e => { if (e.target.closest('.m-banner-info')) navTo('detail', s.dataset.id + '/' + s.dataset.si) }))
  $$('.m-card').forEach(c => c.addEventListener('click', () => navTo('detail', c.dataset.id + '/' + c.dataset.si)))
  $$('.m-cat-more').forEach(b => b.addEventListener('click', () => navTo('search', '')))
  $('#m-go-live')?.addEventListener('click', () => navTo('live'))
}

function card(v, srcIdx) {
  const src = VOD_SOURCES[srcIdx]
  return '<div class="m-card" data-id="' + esc(v.id) + '" data-si="' + srcIdx + '"><div class="m-card-pic"><img src="' + esc(v.pic) + '" loading="lazy" onerror="this.style.opacity=0;this.parentElement.innerHTML=\'<span class=m-card-ph>🎬</span>\'" /><div class="m-card-hover">▶</div><span class="m-card-src" style="background:' + src.color + '">' + esc(src.logo) + '</span></div><div class="m-card-title">' + esc(v.name) + '</div><div class="m-card-meta">' + esc(v.year || '') + ' · ' + esc(v.type || '') + '</div></div>'
}

// ─── 数据源切换 ────────────────────────────────
function showModePicker() {
  const ov = document.createElement('div'); ov.className = 'm-overlay'
  const mode = getActiveMode()
  const activeKey = _s.activeTvboxKey || getActiveTvboxKey()
  const allTvbox = [
    ...TVBOX_BUILTIN.map(a => ({ key: a.key, label: '🔗 ' + a.name, note: a.note || '' })),
    ..._s.customTvbox.map(a => ({ key: a.key, label: '🛠️ ' + a.name, note: a.url.length > 40 ? '...' + a.url.slice(-40) : a.url }))
  ]
  ov.innerHTML = '<div class="m-src-picker"><div class="m-src-title">切换数据源模式</div><div class="m-src-list">' +
    '<div class="m-src-item' + (mode === 'cms' ? ' active' : '') + '" data-mode="cms"><span class="m-src-name">📺 CMS 模式</span><span class="m-src-desc">内置5大影视源</span>' + (mode === 'cms' ? '<span class="m-src-check">✓</span>' : '') + '</div>' +
    allTvbox.map(m => '<div class="m-src-item' + (mode === 'tvbox' && m.key === activeKey ? ' active' : '') + '" data-mode="tvbox" data-key="' + esc(m.key) + '"><span class="m-src-name">' + esc(m.label) + '</span><span class="m-src-desc">' + esc(m.note) + '</span>' + (mode === 'tvbox' && m.key === activeKey ? '<span class="m-src-check">✓</span>' : '') + '</div>').join('') +
    '</div><div style="padding:12px 16px 8px;border-top:1px solid #333"><input id="m-api-url" placeholder="输入 TVBox JSON API 地址添加自定义源..." style="width:100%;background:#1a1a2e;border:1px solid #333;color:#fff;border-radius:8px;padding:8px 12px;font-size:13px;box-sizing:border-box"/></div><div style="padding:0 16px 16px"><button id="m-api-add" style="width:100%;background:#e50914;color:#fff;border:none;border-radius:8px;padding:10px;font-size:14px;cursor:pointer">添加并使用</button></div><div class="m-src-cancel">取消</div></div>'
  document.body.appendChild(ov)
  ov.addEventListener('click', e => { if (e.target === ov || e.target.classList.contains('m-src-cancel')) ov.remove() })
  $$('.m-src-item[data-mode]').forEach(item => item.addEventListener('click', async () => {
    const m = item.dataset.mode
    const k = item.dataset.key || ''
    setActiveMode(m)
    if (m === 'tvbox' && k) {
      setActiveTvboxKey(k)
      _s.tvboxConfig = null
      const api = TVBOX_BUILTIN.find(a => a.key === k) || _s.customTvbox.find(a => a.key === k)
      if (api) { _s.tvboxConfig = await loadTvboxApi(api); _s.activeTvboxKey = k }
    } else {
      _s.tvboxConfig = null
    }
    ov.remove()
    renderHome()
  }))
  $('#m-api-add')?.addEventListener('click', async () => {
    const url = $('#m-api-url')?.value.trim()
    if (!url) return
    const key = 'ct_' + Date.now()
    const api = { key, name: '自定义-' + (_s.customTvbox.length + 1), url }
    const config = await loadTvboxApi(api)
    if (config) {
      const apis = getCustomTvbox(); apis.push(api); saveCustomTvbox(apis)
      _s.customTvbox = apis
      setActiveMode('tvbox'); setActiveTvboxKey(key)
      _s.tvboxConfig = config; _s.activeTvboxKey = key
      ov.remove(); renderHome()
    } else {
      alert('API 地址无效或加载失败，请检查后重试')
    }
  })
}

// ─── 搜索页 ───────────────────────────────────
function renderSearch(kw) {
  kw = kw || ''
  _el.innerHTML = '<div class="m-navbar"><button class="m-back" id="m-back">‹</button><div class="m-search-bar"><input id="m-sinput" placeholder="搜索电影、剧集、综艺、动漫..." value="' + esc(kw) + '" /><button id="m-sbtn">🔍</button></div></div><div class="m-scroll"><div class="m-search"><div class="m-sect" id="m-sect-hist"><div class="m-sect-hdr"><span>搜索历史</span><button class="m-txt-btn" id="m-clr-hist">清除</button></div><div class="m-histags" id="m-histags"></div></div><div class="m-type-filter" id="m-type-filter"></div><div id="m-results">' + (kw ? spin() : '<div class="m-empty">输入关键词搜索全网视频</div>') + '</div></div></div>'
  const input = $('#m-sinput'), btn = $('#m-sbtn')
  const doSearch = debounce(async () => {
    const q = input.value.trim(); if (!q) return
    const res = await searchAll(q); _s.results = res; renderResults(res)
    const sh = [q, ...getSearchHist().filter(s => s !== q)].slice(0, 30); saveSearchHist(sh); renderHist()
  }, 600)
  btn.addEventListener('click', doSearch)
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch() })
  $('#m-back')?.addEventListener('click', () => navTo('home'))
  $('#m-clr-hist')?.addEventListener('click', () => { saveSearchHist([]); renderHist() })
  renderHist(); renderTypeFilter(); if (kw) setTimeout(doSearch, 100)
}

function renderHist() {
  const el = $('#m-histags'); if (!el) return
  const h = getSearchHist(), parent = $('#m-sect-hist')
  if (!h.length) { parent && (parent.style.display = 'none'); return }
  parent && (parent.style.display = '')
  el.innerHTML = h.map(q => '<span class="m-histag" data-q="' + esc(q) + '">' + esc(q) + ' ×</span>').join('')
  $$('.m-histag').forEach(t => t.addEventListener('click', () => { $('#m-sinput').value = t.dataset.q; $('#m-sinput').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })) }))
}

function renderTypeFilter() {
  const el = $('#m-type-filter'); if (!el) return
  el.innerHTML = '<button class="m-type-btn active" data-type="all">全部</button>' +
    VOD_CATS.map(c => '<button class="m-type-btn" data-type="' + c.id + '">' + c.emoji + ' ' + c.label + '</button>').join('')
}

function renderResults(results) {
  const el = $('#m-results'); if (!el) return
  if (!results.length) { el.innerHTML = '<div class="m-empty">未找到相关结果</div>'; return }
  el.innerHTML = '<div class="m-card-grid">' + results.map(v => card(v, v._src ?? 0)).join('') + '</div>'
  $$('.m-card').forEach(c => c.addEventListener('click', () => navTo('detail', c.dataset.id + '/' + c.dataset.si)))
}

// ─── 详情页 ───────────────────────────────────
async function renderDetail(id, srcIdx) {
  srcIdx = srcIdx || 0
  _el.innerHTML = '<div class="m-detail" id="m-detail">' + spin() + '</div>'; _s.cmsIdx = srcIdx
  let video = null
  const mode = getActiveMode()
  if (mode === 'tvbox' && _s.tvboxConfig) {
    video = await getDetailByTvbox(id)
    if (!video) { video = parseTvboxList(_s.tvboxConfig).find(v => v.id === id) || null }
  }
  if (!video) {
    for (const idx of [srcIdx, 0, 1, 2, 3, 4]) {
      if (idx >= VOD_SOURCES.length) break
      try { video = await getDetail(idx, id); if (video) { _s.cmsIdx = idx; break } } catch {}
    }
  }
  if (!video) { $('#m-detail').innerHTML = '<div class="m-empty">加载失败，请返回重试</div>'; return }
  _s.detail = video
  const isFav = getFavs().some(f => f.id === video.id && f.key === (VOD_SOURCES[_s.cmsIdx]?.key || video.key))
  buildDetailHtml(video, isFav); bindDetailEvents(video)
}

function buildDetailHtml(v, isFav) {
  const isSeries = v.dl?.length > 0 && v.dl[0].urls?.length > 0
  const allEps = []
  if (isSeries) {
    v.dl.forEach(dd => {
      const flag = dd.flag || '默认'
      ;(dd.urls || []).forEach(u => {
        const [n, u2] = u.split('$')
        if (u2) allEps.push({ name: n || '', url: u2, flag })
      })
    })
  }
  const firstUrl = isSeries ? (allEps[0]?.url || '') : (v.dl?.[0]?.urls?.[0]?.split('$')?.[1] || '')

  const metaItems = [v.year, v.area, v.type].filter(Boolean).map(s => '<span>' + esc(s) + '</span>').join(' · ')

  $('#m-detail').innerHTML =
    '<div class="m-det-hero" style="background:linear-gradient(to bottom,rgba(10,10,20,0.2) 0%,#0a0a0f 100%),url(\'' + esc(v.pic) + '\') center/cover"><div class="m-det-hero-cnt"><button class="m-back" id="m-back">‹ 返回</button><div class="m-det-info"><h1 class="m-det-title">' + esc(v.name) + '</h1><div class="m-det-meta">' + metaItems + '</div><div class="m-det-btns"><button class="m-btn-primary" id="m-play-first"' + (!firstUrl ? ' disabled' : '') + '>▶ ' + (isSeries ? '播放第1集' : '播放') + '</button><button class="m-btn-secondary' + (isFav ? ' m-btn-faved' : '') + '" id="m-fav">' + (isFav ? '❤️ 已收藏' : '🤍 收藏') + '</button></div></div></div></div>' +
    '<div class="m-det-body">' +
    (v.des ? '<div class="m-det-desc"><div class="m-det-label">简介</div><p>' + esc(v.des) + '</p></div>' : '') +
    (v.actor    ? '<div class="m-det-row"><span class="m-det-lbl">主演：</span>' + esc(v.actor) + '</div>' : '') +
    (v.director ? '<div class="m-det-row"><span class="m-det-lbl">导演：</span>' + esc(v.director) + '</div>' : '') +
    (isSeries ? '<div class="m-det-eps"><div class="m-det-label">选集 ' + (allEps.length ? '(' + allEps.length + '集)' : '') + '</div><div class="m-ep-grid">' + (allEps.length ? allEps.map((ep, i) => '<div class="m-ep" data-url="' + esc(ep.url) + '" data-name="' + esc(ep.name || '') + '" data-flag="' + esc(ep.flag) + '">' + esc(ep.name || (i + 1)) + '</div>').join('') : '<div class="m-empty">暂无剧集信息</div>') + '</div></div>' : '') +
    '</div>'
}

function bindDetailEvents(video) {
  $('#m-back')?.addEventListener('click', () => navTo('home'))
  const isSeries = video.dl?.length > 0 && video.dl[0].urls?.length > 0
  $('#m-play-first')?.addEventListener('click', () => {
    if (isSeries && video.dl?.[0]?.urls?.[0]) {
      const [n, u] = video.dl[0].urls[0].split('$')
      navTo('play', video.id + '/' + _s.cmsIdx + '?ep=' + encodeURIComponent(n || '') + '&url=' + encodeURIComponent(u || ''))
    } else {
      const url = video.dl?.[0]?.urls?.[0]?.split('$')?.[1] || ''
      navTo('play', video.id + '/' + _s.cmsIdx + '?url=' + encodeURIComponent(url))
    }
  })
  $('#m-fav')?.addEventListener('click', () => {
    const added = toggleFav(video, _s.cmsIdx)
    const btn = $('#m-fav')
    if (btn) { btn.textContent = added ? '❤️ 已收藏' : '🤍 收藏'; btn.classList.toggle('m-btn-faved', added) }
  })
  $$('.m-ep').forEach(ep => ep.addEventListener('click', () => navTo('play', video.id + '/' + _s.cmsIdx + '?ep=' + encodeURIComponent(ep.dataset.name) + '&url=' + encodeURIComponent(ep.dataset.url))))
}

// ─── 播放器页 ─────────────────────────────────
function renderPlayer(id, srcIdx) {
  srcIdx = srcIdx || 0; _s.cmsIdx = srcIdx
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '')
  const epName = params.get('ep') || '', videoUrl = decodeURIComponent(params.get('url') || '')
  _el.innerHTML = '<div class="m-player-page"><div class="m-player-topbar"><button class="m-back" id="m-back">‹ 返回</button><span class="m-player-title" id="m-player-title">' + esc(epName || '正在加载...') + '</span></div><div class="m-player-wrap" id="m-player-wrap">' + spin() + '</div></div>'
  $('#m-back')?.addEventListener('click', () => history.back())
  if (videoUrl) play(videoUrl, $('#m-player-wrap')); else $('#m-player-wrap').innerHTML = '<div class="m-empty">播放地址无效</div>'
}

// ─── 我的（收藏/历史）─────────────────────────
function renderMy() {
  const favs = getFavs(), hist = getHist()
  _el.innerHTML = '<div class="m-navbar"><button class="m-back" id="m-back">‹</button><div class="m-logo">❤️ 我的</div></div><div class="m-scroll"><div class="m-my" id="m-my"><div class="m-my-tabs"><button class="m-tab active" data-tab="fav">收藏 (' + favs.length + ')</button><button class="m-tab" data-tab="hist">历史 (' + hist.length + ')</button></div><div id="m-my-content">' + spin() + '</div></div></div>'
  $('#m-back')?.addEventListener('click', () => navTo('home'))
  $$('.m-tab').forEach(t => t.addEventListener('click', () => {
    $$('.m-tab').forEach(tab => tab.classList.toggle('active', tab === t))
    renderMyTab(t.dataset.tab, favs, hist)
  }))
  renderMyTab('fav', favs, hist)
}

function renderMyTab(tab, favs, hist) {
  const el = $('#m-my-content'); if (!el) return
  const list = tab === 'fav' ? favs : hist
  if (!list.length) { el.innerHTML = '<div class="m-empty">' + (tab === 'fav' ? '暂无收藏' : '暂无观看历史') + '</div>'; return }
  el.innerHTML = '<div class="m-card-grid">' + list.map(v => card(v, v.srcIdx ?? 0)).join('') + '</div>'
  $$('.m-card').forEach(c => c.addEventListener('click', () => navTo('detail', c.dataset.id + '/' + c.dataset.si)))
}

// ─── 电视直播 ─────────────────────────────────
async function renderLive() {
  _el.innerHTML = '<div class="m-navbar"><button class="m-back" id="m-back">‹</button><div class="m-logo">📡 电视直播</div></div><div class="m-scroll"><div class="m-live" id="m-live">' + spin() + '</div></div>'
  $('#m-back')?.addEventListener('click', () => navTo('home'))
  const cats = await loadTvSource(0)
  buildLiveHtml(cats)
}

async function loadTvSource(idx) {
  if (_tvCache[idx]) return _tvCache[idx]
  const src = TV_SOURCES[idx]
  try {
    const txt = await fetchText(src.url)
    _tvCache[idx] = txt.includes('#EXTM3U') ? parseM3u(txt) : parseNzk(txt)
  } catch { _tvCache[idx] = []
  return _tvCache[idx]
}

function parseNzk(txt) {
  const lines = txt.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  const cats = []; let cur = null
  for (const line of lines) {
    if (line.includes('#genre#')) { cur = { name: line.replace('#genre#', '').trim(), chs: [] }; cats.push(cur) }
    else if (line.includes(',')) {
      const parts = line.split(',')
      const n2 = parts[0]; const u = parts.slice(1).join(',')
      if (n2 && u && (u.startsWith('http') || u.startsWith('//'))) {
        const ch = { name: n2.trim(), url: u.startsWith('//') ? 'https:' + u : u }
        if (cur) cur.chs.push(ch); else cats.push({ name: '未分类', chs: [ch] })
      }
    }
  }
  return cats
}

function parseM3u(txt) {
  const lines = txt.split('\n'); const cats = []; let cur = null
  for (const line of lines) {
    const lt = line.trim()
    if (lt.startsWith('#EXTINF:')) { const g = lt.match(/"([^"]+)"/)?.[1] ?? '未分类'; cur = { name: g, chs: [] }; cats.push(cur) }
    else if (lt.startsWith('http')) { if (cur) { if (!cur.chs.find(c => c.url === lt)) cur.chs.push({ name: cur.name, url: lt }) } }
  }
  return cats
}

function buildLiveHtml(cats) {
  const el = document.getElementById('m-live'); if (!el) return
  if (!cats.length) { el.innerHTML = '<div class=m-empty>暂无可用直播源</div>'; return }
  el.innerHTML = '<div class=m-live-cats>' + cats.map(cat => '<div class=m-live-cat><div class=m-live-cat-name>' + esc(cat.name) + '</div><div class=m-live-chs>' + cat.chs.map(ch => '<div class=m-live-ch data-url=' + esc(ch.url) + '>' + esc(ch.name) + '</div>').join('') + '</div></div>').join('') + '</div>'
  el.querySelectorAll('.m-live-ch').forEach(ch => ch.addEventListener('click', () => {
    const url = ch.dataset.url
    const title = ch.textContent
    const newEl = document.createElement('div')
    newEl.className = 'm-player-page'
    newEl.innerHTML = '<div class=m-player-topbar><button class=m-back id=m-back-new>‹ 返回</button><span class=m-player-title>' + esc(title) + '</span></div><div class=m-player-wrap id=m-player-wrap></div>'
    _el.innerHTML = ''
    _el.appendChild(newEl)
    newEl.querySelector('#m-back-new')?.addEventListener('click', () => renderLive())
    play(url, newEl.querySelector('#m-player-wrap'))
  }))
}

// ─── API 数据源管理页 ─────────────────────────
function renderApiManage() {
  const mode = getActiveMode()
  const activeKey = _s.activeTvboxKey || getActiveTvboxKey()
  const custom = getCustomTvbox()

  _el.innerHTML = '<div class="m-navbar"><button class="m-back" id="m-back">‹</button><div class="m-logo">⚙️ 数据源管理</div></div><div class="m-scroll"><div class="m-api-page" id="m-api-page">' + spin() + '</div></div>'
  $('#m-back')?.addEventListener('click', () => navTo('home'))

  const el = $('#m-api-page')
  const modeBlock = '<div class="m-api-section"><div class="m-api-section-title">当前模式</div><div class="m-mode-btns"><button class="m-mode-btn' + (mode === 'cms' ? ' active' : '') + '" id="btn-cms-mode">📺 CMS 模式</button><button class="m-mode-btn' + (mode === 'tvbox' ? ' active' : '') + '" id="btn-tvbox-mode">🔗 TVBox JSON</button></div><div class="m-api-hint">' + (mode === 'cms' ? '使用内置5大影视资源接口' : '使用 TVBox JSON 格式接口') + '</div></div>'

  const cmsBlock = '<div class="m-api-section"><div class="m-api-section-title">CMS 视频源</div>' + VOD_SOURCES.map(s => '<div class="m-api-item"><span class="m-api-item-logo" style="background:' + s.color + '">' + s.logo + '</span><span class="m-api-item-name">' + esc(s.name) + '</span><span class="m-api-item-status">内置</span></div>').join('') + '</div>'

  const tvboxBlock = '<div class="m-api-section"><div class="m-api-section-title">TVBox JSON 内置源</div>' + TVBOX_BUILTIN.map(a => '<div class="m-api-item' + (mode === 'tvbox' && a.key === activeKey ? ' active' : '') + '" data-key="' + esc(a.key) + '"><span class="m-api-item-logo">🔗</span><span class="m-api-item-name">' + esc(a.name) + '</span><span class="m-api-item-status">' + (a.note || '内置') + '</span></div>').join('') + '</div>'

  const customBlock = '<div class="m-api-section"><div class="m-api-section-title">自定义 TVBox 接口 <span style="font-size:12px;color:#888">(' + custom.length + '个)</span></div>' + (custom.length ? custom.map(a => '<div class="m-api-item"><span class="m-api-item-logo">🛠️</span><span class="m-api-item-name">' + esc(a.name) + '</span><span class="m-api-item-url" style="font-size:11px;color:#666;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(a.url) + '</span><button class="m-api-del" data-key="' + esc(a.key) + '">删除</button></div>').join('') : '<div style="color:#666;font-size:13px;padding:8px 0">暂无自定义接口</div>') + '<div style="margin-top:12px;display:flex;gap:8px"><input id="m-api-name" placeholder="名称（选填）" style="width:120px;background:#1a1a2e;border:1px solid #333;color:#fff;border-radius:8px;padding:8px 10px;font-size:13px"/><input id="m-api-url-input" placeholder="输入 TVBox JSON API 地址..." style="flex:1;background:#1a1a2e;border:1px solid #333;color:#fff;border-radius:8px;padding:8px 10px;font-size:13px"/><button id="m-api-add-btn" style="background:#e50914;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:13px;white-space:nowrap">添加</button></div></div>'

  el.innerHTML = modeBlock + cmsBlock + tvboxBlock + customBlock

  // 模式切换
  $('#btn-cms-mode')?.addEventListener('click', () => { setActiveMode('cms'); renderApiManage() })
  $('#btn-tvbox-mode')?.addEventListener('click', () => { setActiveMode('tvbox'); renderApiManage() })

  // TVBox 内置源点击
  $$('.m-api-item[data-key]').forEach(item => item.addEventListener('click', async () => {
    const key = item.dataset.key
    setActiveMode('tvbox'); setActiveTvboxKey(key)
    _s.tvboxConfig = null
    const api = TVBOX_BUILTIN.find(a => a.key === key) || custom.find(a => a.key === key)
    if (api) { _s.tvboxConfig = await loadTvboxApi(api); _s.activeTvboxKey = key }
    renderApiManage()
  }))

  // 添加自定义接口
  $('#m-api-add-btn')?.addEventListener('click', async () => {
    const name = $('#m-api-name')?.value.trim() || ''
    const url = $('#m-api-url-input')?.value.trim()
    if (!url) return
    const key = 'ct_' + Date.now()
    const api = { key, name: name || '自定义-' + (custom.length + 1), url }
    const config = await loadTvboxApi(api)
    if (config) {
      const apis = getCustomTvbox(); apis.push(api); saveCustomTvbox(apis)
      _s.customTvbox = apis
      setActiveMode('tvbox'); setActiveTvboxKey(key)
      _s.tvboxConfig = config; _s.activeTvboxKey = key
      renderApiManage()
    } else {
      alert('API 地址无效或加载失败，请检查后重试')
    }
  })

  // 删除自定义接口
  $$('.m-api-del').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation()
    const key = btn.dataset.key
    const apis = getCustomTvbox().filter(a => a.key !== key)
    saveCustomTvbox(apis); _s.customTvbox = apis
    if (getActiveTvboxKey() === key) {
      setActiveMode('cms'); _s.tvboxConfig = null
    }
    renderApiManage()
  }))
}
