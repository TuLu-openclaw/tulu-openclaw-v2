/**
 * 灞犳埉褰辫 - 褰辫鐐规挱 + 鐢佃鐩存挱
 * VOD: 澶氭簮鑱氬悎锛堟毚椋?閲忓瓙/澶╂动/鏄熶箣灏?1080锛? * TV: 澶氭簮鐩存挱锛坺dir/鑱氱湅/灏忚仛鍚堢瓑M3U婧愶級
 * 鍩轰簬 TVAPP (youhunwl/TVAPP) 褰辫浠撴鏋跺垎鏋? * 2026-04-13 v8
 */

import '../style/movie-tool.css'

// 鈹€鈹€ HTML 杞箟锛堥槻姝?XSS锛夆攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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
  { key: 'bfzy',   name: '馃尯鏆撮璧勬簮', api: 'https://bfzyapi.com/api.php/provide/vod',       type: 'tvbox' },
  { key: 'lziapi', name: '馃尯閲忓瓙璧勬簮', api: 'https://cj.lziapi.com/api.php/provide/vod',    type: 'tvbox' },
  { key: 'xsd',    name: '馃尯鏄熶箣灏?,  api: 'https://xsd.sdzyapi.com/api.php/provide/vod',   type: 'tvbox' },
  { key: 'zyku',   name: '馃尯1080璧勬簮', api: 'https://api.1080zyku.com/inc/api_mac10.php',   type: '1080' },
  { key: 'tyys',   name: '馃尯澶╂动璧勬簮', api: 'https://tyyszy.com/api.php/provide/vod',      type: 'tvbox' },
]

const TV_SOURCES = [
  { key: 'zdir',  name: '馃摵zdir鑱氬悎',  api: 'http://zdir.kebedd69.repl.co/public/live.txt' },
  { key: 'jukan', name: '馃摵鑱氱湅褰辫',   api: 'http://home.jundie.top:81/Cat/tv/live.txt' },
  { key: 'xh',    name: '馃摵灏忚仛鍚?,     api: 'http://jiexi.bulisite.top/m3u.php' },
  { key: 'ftyy',  name: '馃摵Ftyyy',     api: 'http://ftyyy.tk/live.txt' },
  { key: 'rihou', name: '馃摵rihou',     api: 'http://rihou.cc:555/gggg.nzk' },
]

// 鈹€鈹€ TVBox JSON API锛堥€氳繃 cdn.statically.io 浠ｇ悊 GitHub锛夆攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
// 鈹€鈹€ TVBox CDN 澶氶暅鍍忥紙statically.io 鎸備簡鏃惰嚜鍔ㄥ洖閫€锛夆攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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
  { key: 'fongmi',    name: '馃尯FongMi',    url: 'https://cdn.statically.io/gh/FongMi/CatVodSpider/main/json/b.json',        note: '鎺ㄨ崘' },
  { key: 'hjd',       name: '馃尯HJD TVBox', url: 'https://cdn.statically.io/gh/hjdhnx/Dr_TVBox/main/json/api.json',          note: '' },
  { key: 'cattorn',   name: '馃尯Cat TVBox', url: 'https://cdn.statically.io/gh/CatTornado/TVBox/main/json/api.json',          note: '' },
  { key: 'sunpolar',  name: '馃尯SunPolar',  url: 'https://cdn.statically.io/gh/SunPolar/TVBox/main/json/api.json',            note: '' },
  { key: 'imdgo',     name: '馃尯imDgo',    url: 'https://cdn.statically.io/gh/imDgo/TVBox/main/json/api.json',              note: '' },
  { key: 'q215',      name: '馃尯q215 TVBox',url: 'https://cdn.statically.io/gh/q215813905/TVBox/main/json/api.json',         note: '' },
  { key: '173799616', name: '馃尯173浠?,     url: 'https://cdn.statically.io/gh/173799616/TVBox/master/json/api.json',        note: '' },
  { key: '7wf',       name: '馃尯7灏垮６',     url: 'https://cdn.statically.io/gh/7灏垮６/TVBox/main/json/apijson.json',         note: '' },
  { key: 'yyfxz',     name: '馃尯涓氫綑鎵撳彂',  url: 'https://cdn.statically.io/gh/yyfxz/qqtv/main/qq.json',                  note: '' },
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

// 鍔犺浇 TVBox API 閰嶇疆锛堝悓鏃舵敮鎸?JSON 鍜?XML锛岃嚜鍔ㄦ娴嬫牸寮忥級
async function loadTvboxConfig(api) {
  if (_tvboxCache[api.key]) return _tvboxCache[api.key]
  try {
    const resp = await fetch(api.url, { signal: AbortSignal.timeout(20000) })
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    const text = await resp.text()
    let config
    try { config = JSON.parse(text) }
    catch { config = parseXml(text) }  // XML 鏍煎紡鍏滃簳
    // 妫€娴嬫槸鍚︽湁鏁堬紙蹇呴』鏈?list 鏁扮粍鎴?total > 0锛?    if (!config || (!(Array.isArray(config.list) ? config.list.length : config.list?.length) && !config.total)) {
      console.warn('[movie-tool] TVBox config invalid or empty:', api.name, config)
      return null
    }
    _tvboxCache[api.key] = config
    return config
  } catch (e) { console.warn('[movie-tool] TVBox load failed:', api.name, e.message); return null }
}

// 鈹€鈹€ 瑙ｆ瀽 CMS 鎵佸钩鏍煎紡锛堥噺瀛?鏆撮绛?CMS API锛夆攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
// CMS API: config.list 鏄棰戞暟缁勶紝涓嶆槸鍒嗙被鏁扮粍
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

// 鈹€鈹€ 瑙ｆ瀽 TVBox 宓屽鍒嗙被鏍煎紡 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function parseTvboxList(config) {
  const result = []
  for (const cat of (config?.list || [])) {
    const catName = cat.name || '鏈垎绫?
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

// 鈹€鈹€ 缁熶竴瑙ｆ瀽鍏ュ彛锛堣嚜鍔ㄦ娴嬫牸寮忥級鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function parseVideoList(config) {
  if (!config) return []
  const first = config.list?.[0]
  // TVBox 宓屽鏍煎紡锛氱涓€涓垎绫诲璞＄殑 list 灞炴€ф槸鏁扮粍
  if (first && Array.isArray(first.list)) return parseTvboxList(config)
  // CMS 鎵佸钩鏍煎紡锛堥噺瀛?鏆撮绛夛級锛氱洿鎺ユ槸瑙嗛鏁扮粍
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
      flag: flag.trim() || '榛樿',
      urls: urls.map(u => { const [n, url] = u.split('$'); return (n || '') + '$' + url })
    })
  })
  return result
}

// TVBox 鍒楄〃鎼滅储
function searchTvboxList(config, kw) {
  const q = kw.toLowerCase()
  return parseVideoList(config).filter(v =>
    v.vod_name.toLowerCase().includes(q) ||
    (v.vod_actor && v.vod_actor.toLowerCase().includes(q))
  )
}

// 鈹€鈹€ 鑾峰彇褰撳墠娲昏穬 TVBox 婧愶紙鍐呯疆浼樺厛锛岃嚜瀹氫箟娆′箣锛?function getActiveTvbox() {
  const key = getActiveTvboxKey()
  return TVBOX_BUILTIN.find(a => a.key === key) || _customTvbox.find(a => a.key === key) || null
}

function getTvboxSourceName(api) {
  const b = TVBOX_BUILTIN.find(a => a.key === api.key)
  return b ? b.name : (api.name || '鑷畾涔?)
}

// 鍒濆鍖栬嚜瀹氫箟 TVBox 鍒楄〃
_customTvbox = getCustomTvbox()

// 姣忎釜 VOD 婧愮殑鍒嗙被鏄犲皠锛圕MS type_id 浣撶郴鍚勫紓锛屽繀椤绘寜婧愬尯鍒嗭級
// key: source key, value: { movie, tv, variety, anime, short } 瀵瑰簲鐨?type_id
const VOD_TYPE_MAP = {
  bfzy:   { movie: 20, tv: 30, variety: 45, anime: 39, short: 58 },  // 鏆撮璧勬簮
  lziapi: { movie: 1,  tv: 2,  variety: 3,  anime: 4,  short: 6  },  // 閲忓瓙璧勬簮
  xsd:    { movie: 1,  tv: 2,  variety: 3,  anime: 4,  short: 0  },  // 鏄熶箣灏?  zyku:   { movie: 1,  tv: 2,  variety: 3,  anime: 4,  short: 0  },  // 1080璧勬簮
  tyys:   { movie: 1,  tv: 2,  variety: 3,  anime: 4,  short: 0  },  // 澶╂动璧勬簮
}

const VOD_CATEGORIES = [
  { id: 'movie',   name: '鐢靛奖' },
  { id: 'tv',      name: '鐢佃鍓? },
  { id: 'variety', name: '缁艰壓' },
  { id: 'anime',   name: '鍔ㄦ极' },
  { id: 'short',   name: '鐭墽' },
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
let _tvboxMode = false  // true = TVBox JSON 妯″紡

// 鈹€鈹€ 鍘嗗彶璁板綍 鈹€鈹€
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

// 鈹€鈹€ 缃戠粶璇锋眰 鈹€鈹€
// 鈹€鈹€ XML 瑙ｆ瀽锛圕MS 鏍煎紡褰辫鎺ュ彛锛夆攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function parseXml(raw) {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(raw, 'text/xml')
    const list = []
    // 鍚屾椂鏀寔 <item>锛圧SS鏍煎紡锛夊拰 <video>锛堥噺瀛怌MS鏍煎紡锛?    for (const item of doc.querySelectorAll('item, video')) {
      const vod = {}
      for (const child of item.children) vod[child.nodeName] = child.textContent
      if (Object.keys(vod).length) list.push(vod)
    }
    return { list, total: list.length }
  } catch { return { list: [], total: 0 } }
}

// 鈹€鈹€ 缃戠粶璇锋眰锛堜紭鍏?Rust 鍚庣浠ｇ悊锛岀粫杩?WebView CORS 闄愬埗锛?鈹€鈹€

// 灏濊瘯閫氳繃 Tauri Rust 鍚庣璇锋眰锛坴od_fetch 鍛戒护锛?async function vodApiFetch(url) {
  try {
    const { invoke } = window.__TAURI_INTERNALS__ || window.__TAURI__ || {}
    if (!invoke) return null
    const text = await invoke('vod_fetch', { url, timeoutSecs: 12 })
    if (!text || !text.trim()) return null
    return JSON.parse(text)
  } catch { return null }
}

// 鏍囧噯 fetch锛堝鐢級
async function webFetch(url) {
  const resp = await fetch(url, {
    signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined,
    headers: { 'Referer': 'https://claw.qt.cool/' }
  })
  if (!resp.ok) throw new Error('HTTP ' + resp.status)
  return resp.text()
}

// 閫氱敤 JSON 鑾峰彇锛堣嚜鍔ㄩ檷绾э級
async function fetchJSON(url) {
  let json = await vodApiFetch(url)
  if (json) return json
  // Rust 鍚庣澶辫触锛岄檷绾у埌娴忚鍣?fetch
  let text
  try { text = await webFetch(url) } catch { return { list: [], total: 0 } }
  try { return JSON.parse(text) } catch { try { return parseXml(text) } catch { return { list: [], total: 0 } } }
}

// 鈹€鈹€ NZK 瑙ｆ瀽 鈹€鈹€
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

// 鈹€鈹€ M3U 杞?NZK锛圱VAPP convertM3uToNormal 绠楁硶锛夆攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function convertM3uToNormal(m3u) {
  try {
    const lines = m3u.split('\n'), parts = []
    let currentGroup = '', TV = ''
    for (const line of lines) {
      if (line.startsWith('#EXTINF:')) {
        const g = line.split('"')[1]?.trim() || '鏈垎绫?
        TV = line.split('"')[2]?.substring(1) || ''
        if (currentGroup !== g) { currentGroup = g; parts.push('\n' + currentGroup + ',#genre#\n') }
      } else if (line.startsWith('http')) {
        parts.push(TV + '\,' + line.split(',')[0] + '\n')
      }
    }
    return parts.join('').trim()
  } catch (e) { return m3u }
}

// 鈹€鈹€ 鑷姩妫€娴嬫牸寮忓姞杞?TV 婧?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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
 * 娓叉煋鍏ュ彛 鈥?鎺ユ敹璺敱瀹瑰櫒锛屽皢鑷韩鎸傝浇鍒板鍣ㄥ唴
 * 涓嶅啀鐩存帴 appendChild(document.body)锛岄伩鍏嶈璺敱鐨?innerHTML='' 娓呴櫎
 */
export default function render(container) {
  // 濡傛灉浼犲叆浜嗗鍣紙璺敱鐜锛夛紝娓叉煋鍒板鍣ㄥ唴锛涘惁鍒欓檷绾у埌 body
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
        <div class="tvbox-brand-icon">馃幀</div>
        <div>
          <div class="tvbox-brand-name">灞犳埉褰辫</div>
        </div>
      </div>

      <div class="tvbox-search-wrap">
        <div class="tvbox-search-box">
          <span class="tvbox-search-icon">馃攳</span>
          <input class="tvbox-search-input" type="text" id="t-search" placeholder="鎼滅储鐢靛奖銆佸墽闆嗐€佺患鑹恒€佸姩婕?.." autocomplete="off" />
          <button class="tvbox-search-btn" id="t-search-btn">鎼滅储</button>
        </div>
      </div>

      <div class="tvbox-mode-tabs">
        <button class="tvbox-mode-tab active" data-mode="vod">馃摵 褰辫鐐规挱</button>
        <button class="tvbox-mode-tab" data-mode="live">馃摗 鐢佃鐩存挱</button>
        <button class="tvbox-mode-tab" data-mode="tvboxjson">馃敆 TVBox JSON</button>
      </div>
    </nav>

    <div class="tvbox-catbar" id="t-catbar">
      <span class="tvbox-catbar-label">鍒嗙被</span>
    </div>

    <div class="tvbox-srcbar" id="t-srcbar">
      <span class="tvbox-srcbar-label">婧?/span>
    </div>

    <div class="tvbox-content" id="t-content">
      <div class="tvbox-loading">
        <div class="tvbox-loading-icon"></div>
        <span class="tvbox-loading-text">鍔犺浇涓?..</span>
      </div>
    </div>

    <div id="t-history-panel" style="display:none; position:fixed; top:120px; left:50%; transform:translateX(-50%); width:460px; max-width:90vw; background:var(--bg-elevated); border:1px solid var(--border); border-radius:12px; z-index:100; padding:12px 14px; box-shadow:0 16px 48px rgba(0,0,0,.7)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:12px;font-weight:600;color:var(--text-secondary)">鎼滅储鍘嗗彶</span>
        <button id="t-clear-history" style="background:none;border:none;color:var(--text-muted);font-size:11px;cursor:pointer;padding:2px 6px;border-radius:4px;border:1px solid var(--border)">娓呴櫎</button>
      </div>
      <div id="t-history-tags" style="display:flex;flex-wrap:wrap;gap:7px"></div>
    </div>

    <div class="tvbox-player-overlay" id="t-player-overlay" style="display:none">
      <div class="tvbox-player-box">
        <div class="tvbox-player-hdr">
          <span class="tvbox-player-title" id="t-player-title">鎾斁涓?/span>
          <button class="tvbox-player-close" id="t-player-close">鉁?/button>
        </div>
        <div class="tvbox-player-body" id="t-player-body">
          <div class="tvbox-player-loading">姝ｅ湪鍔犺浇鎾斁鍣?..</div>
        </div>
        <div class="tvbox-player-foot">
          <a href="#" class="tvbox-open-ext" id="t-ext-link" target="_blank" rel="noopener">鈫?澶栭儴鎵撳紑</a>
        </div>
      </div>
    </div>
  `

  const searchInput = el.querySelector('#t-search')
  const searchBtn   = el.querySelector('#t-search-btn')

  searchBtn.addEventListener('click', () => doSearch(searchInput.value))
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(searchInput.value) })
  searchInput.addEventListener('focus', () => showSearchHistory())
  searchInput.addEventListener('blur', () => setTimeout(() => el.querySelector('#t-history-panel').style.display = 'none', 220))
  el.querySelector('#t-clear-history').addEventListener('click', e => { e.stopPropagation(); clearSearchHistory(); renderSearchHistory() })
  el.querySelector('#t-player-close').addEventListener('click', closePlayer)
  el.querySelector('#t-player-overlay').addEventListener('click', e => { if (e.target === el.querySelector('#t-player-overlay')) closePlayer() })

  // 妯″紡鍒囨崲锛坴od / live / tvboxjson锛?  let mode = 'vod'
  el.querySelectorAll('.tvbox-mode-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const newMode = btn.dataset.mode
      if (newMode === mode) return
      mode = newMode
      el.querySelectorAll('.tvbox-mode-tab').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      page = 1; query = ''; searchInput.value = ''; hideHistory(); _viewStack = []
      if (mode === 'live') {
        el.querySelector('#t-catbar').innerHTML = '<span class="tvbox-catbar-label">鍒嗙被</span><button class="tvbox-cat-chip active">鍏ㄩ儴棰戦亾</button>'
        el.querySelector('#t-catbar').querySelector('.tvbox-cat-chip').addEventListener('click', () => {})
        renderSrcBar()
      } else if (mode === 'tvboxjson') {
        el.querySelector('#t-catbar').innerHTML = '<span class="tvbox-catbar-label">鍒嗙被</span><button class="tvbox-cat-chip active">鍏ㄩ儴</button>'
        renderTvboxSrcTabs()
      } else {
        renderCatBar()
        renderSrcBar()
      }
      if (mode === 'live') loadLive()
      else if (mode === 'tvboxjson') loadTvboxList()
      else if (getPlayHistory().length > 0 && !query) showPlayHistory()
      else loadData()
    })
  })

  // API 绠＄悊鎸夐挳
  el.querySelector('#t-api-manage')?.addEventListener('click', showApiManage)

  // 閾炬帴杈撳叆鎸夐挳
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
    const panel = el.querySelector('#t-history-panel')
    if (!h.length) { panel.style.display = 'none'; return }
    panel.style.display = 'block'
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

  function hideHistory() { el.querySelector('#t-history-panel').style.display = 'none' }

  function showPlayHistory() {
    const h = getPlayHistory().slice(0, 12)
    const content = el.querySelector('#t-content')
    if (!h.length) { loadData(); return }

    let html = '<div class="tvbox-section-title"><span>馃摐</span>鏈€杩戞挱鏀?<button class="tvbox-clear-btn" id="t-clear-play" style="margin-left:auto">娓呴櫎鍏ㄩ儴</button></div>'
    html += '<div style="display:flex;gap:10px;overflow-x:auto;padding:8px 0 16px;scrollbar-width:none"><style>.tvbox-hist-card{flex-shrink:0;width:100px;cursor:pointer}.tvbox-hist-card:hover .tvbox-card-inner{transform:translateY(-2px);border-color:var(--border-hover)}.tvbox-hist-pic{position:relative;aspect-ratio:2/3;background:var(--bg-elevated);border-radius:var(--radius-md);overflow:hidden;border:1px solid var(--border);margin-bottom:6px}.tvbox-hist-pic img{width:100%;height:100%;object-fit:cover;display:block}.tvbox-hist-name{font-size:11px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;padding:0 2px}.tvbox-hist-ep{font-size:10px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;padding:0 2px}</style>'
    h.forEach(item => {
      const pct = item.duration > 0 ? Math.round((item.progress / item.duration) * 100) : 0
      const resumeLabel = pct > 95 ? '宸茬湅瀹? : pct > 2 ? '缁?' + pct + '%' : ''
      html += '<div class="tvbox-hist-card" data-id="' + item.id + '" data-source="' + item.source + '" data-name="' + item.name + '" data-pic="' + item.pic + '" data-epname="' + (item.epName || '') + '" data-epurl="' + (item.epUrl || '') + '" data-progress="' + item.progress + '" data-duration="' + (item.duration || 0) + '">' +
        '<div class="tvbox-hist-pic">' +
          '<img src="' + escHtml(item.pic) + '" alt="' + escHtml(item.name) + '" onerror="this.style.display=\'none\';this.parentElement.innerHTML=\'<span style=display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:24px>馃幀</span>\'" />' +
          (resumeLabel ? '<span style="position:absolute;top:5px;right:5px;background:rgba(16,185,129,.9);color:#fff;font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px">' + resumeLabel + '</span>' : '') +
          '<div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:rgba(255,255,255,.1)"><div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,var(--accent),#ec4899)"></div></div>' +
        '</div>' +
        '<div class="tvbox-hist-name">' + item.name + '</div>' +
        '<div class="tvbox-hist-ep">' + (item.epName || '') + '</div>' +
      '</div>'
    })
    html += '</div>'
    html += '<div class="tvbox-divider"></div>'
    html += '<div class="tvbox-section-header"><div class="tvbox-section-heading"><div class="tvbox-section-heading-dot"></div>褰辫鍒楄〃</div></div>'
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
    body.innerHTML = '<div class="tvbox-player-loading">姝ｅ湪鍔犺浇...</div>'
    overlay.style.display = 'flex'
    if (!epUrl || epUrl === '#' || epUrl === 'undefined') {
      body.innerHTML = '<div class="tvbox-player-loading">鏆傛棤鎾斁鍦板潃</div>'
      return
    }
    const isM3u8 = epUrl.includes('.m3u8')
    const isMp4  = epUrl.includes('.mp4')
    if (isM3u8 || isMp4) loadVideoPlayer(epUrl, isM3u8, progress)
    else {
      var safeEpUrl = /^https?:\/\//i.test(epUrl) ? epUrl : ''
      body.innerHTML = '<div class="tvbox-iframe-wrap"><iframe src="' + safeEpUrl + '" allowfullscreen allow="autoplay; fullscreen" style="width:100%;height:100%;border:none"></iframe></div>'
    }
  }

  // 鈹€鈹€ 娓叉煋鍒嗙被鏉★紙chip 椋庢牸锛夆攢鈹€
  function renderCatBar() {
    const container = el.querySelector('#t-catbar')
    const cats = VOD_CATEGORIES
    container.innerHTML = '<span class="tvbox-catbar-label">鍒嗙被</span>' +
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

  // 鈹€鈹€ 娓叉煋婧愰€夋嫨鏉★紙chip 椋庢牸锛夆攢鈹€
  function renderSrcBar() {
    const container = el.querySelector('#t-srcbar')
    const list = VOD_SOURCES
    container.innerHTML = '<span class="tvbox-srcbar-label">婧?/span>' +
      list.map((s, i) => '<button class="tvbox-src-chip' + (i === src ? ' active' : '') + '" data-idx="' + i + '">' +
        '<span class="tvbox-src-dot"></span>' + s.name + '</button>').join('')

    container.querySelectorAll('.tvbox-src-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        src = parseInt(btn.dataset.idx)
        page = 1; hideHistory(); renderSrcBar(); loadData()
      })
    })
  }

  // 鈹€鈹€ 涓诲姞杞藉叆鍙?鈹€鈹€
  function loadData() {
    const content = el.querySelector('#t-content')
    content.innerHTML = '<div class="tvbox-loading"><div class="tvbox-loading-icon"></div><span class="tvbox-loading-text">鍔犺浇涓?..</span></div>'
    try {
      if (mode === 'live') loadLive()
      else if (mode === 'tvboxjson') { if (query) loadTvboxSearch(); else loadTvboxList() }
      else if (query) loadSearch()
      else if (getPlayHistory().length > 0 && page === 1 && !query) showPlayHistory()
      else loadList()
    } catch (e) {
      content.innerHTML = '<div class="tvbox-empty"><div class="tvbox-empty-icon">馃樀</div><div class="tvbox-empty-title">鍔犺浇澶辫触</div><div class="tvbox-empty-sub">' + escHtml(e.message) + '</div></div>'
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
    if (!json.list || !json.list.length) { try { json = await fetchJSON(source.api + '?ac=list&pg=' + page) } catch {} }
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

  // 鈹€鈹€ TVBox JSON 妯″紡 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  async function loadTvboxList() {
    const content = el.querySelector('#t-content')
    content.innerHTML = '<div class="tvbox-loading">鍔犺浇 TVBox JSON 鏁版嵁...</div>'
    const api = getActiveTvbox()
    if (!api) {
      content.innerHTML = '<div class="tvbox-empty">璇峰厛閫夋嫨涓€涓?TVBox 鏁版嵁婧愶紙鍐呯疆婧愭垨鑷畾涔夛級</div><div style="text-align:center;margin-top:20px"><button id="t-add-tvbox-btn" style="background:#e50914;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:14px;cursor:pointer">娣诲姞鑷畾涔?TVBox API</button></div>'
      el.querySelector('#t-add-tvbox-btn')?.addEventListener('click', showApiManage)
      return
    }
    const config = await loadTvboxConfig(api)
    if (!config) {
      content.innerHTML = '<div class="tvbox-empty">TVBox JSON 鍔犺浇澶辫触锛岃妫€鏌ョ綉缁滄垨鎹㈢敤鍏朵粬婧愩€?br><br><button id="t-switch-src-btn" style="background:#333;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:13px;cursor:pointer">鍒囨崲鏁版嵁婧?/button></div>'
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
    content.innerHTML = '<div class="tvbox-loading">鎼滅储涓?..</div>'
    const api = getActiveTvbox()
    if (!api) { content.innerHTML = '<div class="tvbox-empty">璇峰厛閫夋嫨涓€涓?TVBox 鏁版嵁婧?/div>'; return }
    const config = await loadTvboxConfig(api)
    if (!config) { content.innerHTML = '<div class="tvbox-empty">TVBox JSON 鍔犺浇澶辫触</div>'; return }
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
    '<button class="tvbox-tab" id="t-add-custom-btn" style="color:#e50914;font-size:13px">锛?鑷畾涔?/button>'
    container.querySelectorAll('.tvbox-tab[data-key]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.key
        setActiveTvboxKey(key)
        _tvboxCache = {}  // 娓呴櫎缂撳瓨锛屽己鍒堕噸鏂板姞杞?        src = 0; page = 1
        container.querySelectorAll('.tvbox-tab').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        if (query) await loadTvboxSearch()
        else await loadTvboxList()
      })
    })
    el.querySelector('#t-add-custom-btn')?.addEventListener('click', showApiManage)
  }

  // 鈹€鈹€ API 绠＄悊寮圭獥 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  function showApiManage() {
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center'
    const custom = getCustomTvbox()
    const activeKey = getActiveTvboxKey()
    overlay.innerHTML = '<div style="background:#1a1a2e;border-radius:16px;padding:24px;width:90%;max-width:500px;max-height:80vh;overflow-y:auto;color:#fff;font-family:sans-serif">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
        '<div style="font-size:16px;font-weight:bold">鈿欙笍 TVBox API 绠＄悊</div>' +
        '<button id="t-api-close" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;padding:4px">鉁?/button>' +
      '</div>' +
      '<div style="margin-bottom:16px">' +
        '<div style="font-size:13px;color:#888;margin-bottom:8px">鍐呯疆 TVBox JSON 婧愶紙鐐瑰嚮鍒囨崲锛?/div>' +
        TVBOX_BUILTIN.map(a => '<div class="tvbox-src-item' + (a.key === activeKey ? ' active' : '') + '" data-key="' + a.key + '" data-type="builtin" style="padding:10px 12px;background:' + (a.key === activeKey ? '#2a2a4a' : '#252540') + ';border-radius:8px;margin-bottom:6px;cursor:pointer;display:flex;justify-content:space-between;align-items:center">' +
          '<span>' + a.name + '</span><span style="font-size:12px;color:#888">' + (a.note || '') + '</span></div>').join('') +
      '</div>' +
      '<div style="margin-bottom:16px">' +
        '<div style="font-size:13px;color:#888;margin-bottom:8px">鑷畾涔?TVBox 鎺ュ彛 <span style="color:#e50914">(' + custom.length + ')</span></div>' +
        (custom.length ? custom.map(a => '<div style="padding:10px 12px;background:#252540;border-radius:8px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">' +
          '<div style="overflow:hidden"><div style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px">' + escHtml(a.name) + '</div>' +
          '<div style="font-size:11px;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px">' + escHtml(a.url) + '</div></div>' +
          '<button class="t-del-api" data-key="' + a.key + '" style="background:#e50914;color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;flex-shrink:0;margin-left:8px">鍒犻櫎</button></div>').join('') : '<div style="color:#555;font-size:13px;text-align:center;padding:12px">鏆傛棤鑷畾涔夋帴鍙?/div>') +
      '</div>' +
      '<div style="border-top:1px solid #333;padding-top:16px">' +
        '<div style="font-size:13px;color:#888;margin-bottom:8px">娣诲姞鑷畾涔?TVBox JSON API</div>' +
        '<input id="t-api-name" placeholder="鍚嶇О锛堥€夊～锛? style="width:100%;background:#252540;border:1px solid #333;color:#fff;border-radius:8px;padding:8px 12px;font-size:13px;box-sizing:border-box;margin-bottom:8px;display:block"/>' +
        '<input id="t-api-url" placeholder="杈撳叆 TVBox JSON API 鍦板潃..." style="width:100%;background:#252540;border:1px solid #333;color:#fff;border-radius:8px;padding:8px 12px;font-size:13px;box-sizing:border-box;margin-bottom:8px;display:block"/>' +
        '<button id="t-api-add-btn" style="width:100%;background:#e50914;color:#fff;border:none;border-radius:8px;padding:10px;font-size:14px;cursor:pointer">娣诲姞骞朵娇鐢?/button>' +
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
      const api = { key, name: name || '鑷畾涔?' + (_customTvbox.length + 1), url }
      const config = await loadTvboxConfig(api)
      if (config) {
        const apis = getCustomTvbox(); apis.push(api); saveCustomTvbox(apis); _customTvbox = apis
        setActiveTvboxKey(key); _tvboxCache = {}
        overlay.remove()
        await loadTvboxList()
        renderTvboxSrcTabs()
      } else {
        alert('API 鍦板潃鏃犳晥鎴栧姞杞藉け璐ワ紝璇锋鏌ュ悗閲嶈瘯')
      }
    })
  }

  function fetchJsonp(url) {
    // 鏀寔 CDN 闀滃儚鍥為€€
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
          script.onerror = () => { cleanup(); tryNext('JSONP 璇锋眰澶辫触').then(resolve).catch(reject); };
          window[cbName] = (data) => { cleanup(); resolve(data); };
          document.head.appendChild(script);
          setTimeout(() => { cleanup(); if (!settled) tryNext('JSONP 瓒呮椂').then(resolve).catch(reject); }, 15000);
        });
      } else reject(new Error(errMsg || 'JSONP 璇锋眰澶辫触'));
    }
    return tryNext();
  }

  // 鈹€鈹€ 娓叉煋褰辫缃戞牸锛圥remium 绔栫増鍗＄墖锛夆攢鈹€
  function renderVodGrid(list, total) {
    const grid = el.querySelector('#t-main-grid')
    const pagination = el.querySelector('#t-pagination')
    if (!grid) return
    if (!list || !list.length) {
      grid.innerHTML = '<div class="tvbox-empty"><div class="tvbox-empty-icon">馃摥</div><div class="tvbox-empty-title">鏆傛棤鏁版嵁</div><div class="tvbox-empty-sub">璇峰皾璇曞叾浠栧垎绫绘垨鍏抽敭璇?/div></div>'
      if (pagination) pagination.innerHTML = ''
      return
    }
    const history = getPlayHistory()
    const sourceName = VOD_SOURCES[src]?.name || ''
    const totalPages = Math.max(1, Math.ceil(total / 20))

    grid.innerHTML = '<div class="tvbox-grid">' + list.map(item => {
      const histItem = history.find(h => h.id == item.vod_id && h.source === sourceName)
      const pct = histItem && histItem.duration > 0 ? Math.round((histItem.progress / histItem.duration) * 100) : 0
      const resumeLabel = pct > 95 ? '宸茬湅瀹? : pct > 2 ? '缁?' + pct + '%' : ''
      return '<div class="tvbox-card" data-id="' + item.vod_id + '" data-source="' + sourceName + '" data-name="' + item.vod_name + '" data-pic="' + item.vod_pic + '">' +
        '<div class="tvbox-card-inner">' +
          '<div class="tvbox-card-pic">' +
            (item.vod_pic ? '<img src="' + escHtml(item.vod_pic) + '" alt="' + escHtml(item.vod_name) + '" onerror="this.style.display=\'none\';this.parentElement.innerHTML=\'<span class=tvbox-card-placeholder>馃幀</span>\'" />' : '<span class="tvbox-card-placeholder">馃幀</span>') +
            '<span class="tvbox-card-tag">' + escHtml(item.type_name || '褰辫') + '</span>' +
            (item.vod_score ? '<span class="tvbox-card-score">' + escHtml(item.vod_score) + '</span>' : '') +
            (resumeLabel ? '<span class="tvbox-resume-badge">' + resumeLabel + '</span>' : '') +
          '</div>' +
          '<div class="tvbox-card-info">' +
            '<div class="tvbox-card-title">' + item.vod_name + '</div>' +
            '<div class="tvbox-card-sub">' + (item.vod_actor || '鏈煡涓绘紨') + '</div>' +
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

  // 鈹€鈹€ 鍔犺浇鐩存挱 鈹€鈹€
  async function loadLive() {
    const source = TV_SOURCES[tvSrc]
    const content = el.querySelector('#t-content')
    content.innerHTML = '<div class="tvbox-loading"><div class="tvbox-loading-icon"></div><span class="tvbox-loading-text">姝ｅ湪鍔犺浇鐩存挱棰戦亾...</span></div>'
    let cats = tvCache[tvSrc]
    if (!cats) {
      try {
        const text = await fetch(source.api, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.text())
        const isM3u = text.includes('#EXTM3U') || text.includes('group-title')
        cats = isM3u ? parseNzk(convertM3uToNormal(text)) : parseNzk(text)
        tvCache[tvSrc] = cats
      } catch (e) {
        content.innerHTML = '<div class="tvbox-empty"><div class="tvbox-empty-icon">馃摗</div><div class="tvbox-empty-title">鍔犺浇澶辫触</div><div class="tvbox-empty-sub">' + escHtml(e.message) + '</div></div>'
        return
      }
    }
    renderTvGrid(cats)
  }

  // 鈹€鈹€ 娓叉煋鐩存挱缃戞牸 鈹€鈹€
  function renderTvGrid(categories) {
    const content = el.querySelector('#t-content')
    if (!categories || !categories.length) { content.innerHTML = '<div class="tvbox-empty"><div class="tvbox-empty-icon">馃摗</div><div class="tvbox-empty-title">鏆傛棤棰戦亾鏁版嵁</div></div>'; return }
    content.innerHTML = categories.slice(0, 30).map(cat => {
      if (!cat.channels || !cat.channels.length) return ''
      const chHtml = cat.channels.slice(0, 80).map(ch =>
        '<div class="tvbox-live-card" data-url="' + escHtml(ch.url) + '" data-name="' + escHtml(ch.name) + '">' +
          '<span class="tvbox-live-icon">馃摵</span><span class="tvbox-live-name">' + escHtml(ch.name) + '</span>' +
        '</div>'
      ).join('')
      return '<div class="tvbox-cat-section">' +
        '<div class="tvbox-cat-heading">馃摵 ' + escHtml(cat.name) + ' <span class="tvbox-cat-heading-count">' + cat.channels.length + '</span></div>' +
        '<div class="tvbox-live-grid">' + chHtml + '</div>' +
      '</div>'
    }).join('')
    content.querySelectorAll('.tvbox-live-card').forEach(node => {
      node.addEventListener('click', () => {
        const url = node.dataset.url, name = node.dataset.name
        if (url && url !== '#') openPlayerTv(name, url)
        else alert('璇ラ閬撴殏鏃犳挱鏀惧湴鍧€')
      })
    })
  }

  function openPlayerTv(name, url) {
    const overlay = el.querySelector('#t-player-overlay')
    const body = el.querySelector('#t-player-body')
    el.querySelector('#t-player-title').textContent = '馃摵 ' + name
    el.querySelector('#t-ext-link').href = url
    body.innerHTML = '<div class="tvbox-player-loading">姝ｅ湪鍔犺浇...</div>'
    overlay.style.display = 'flex'
    const isM3u8 = url.includes('.m3u8')
    const isMp4  = url.includes('.mp4')
    if (isM3u8 || isMp4) loadVideoPlayer(url, isM3u8, 0)
    else {
      // URL 鏍煎紡鏍￠獙
      var safeUrl = url && /^https?:\/\//i.test(url) ? url : ''
      body.innerHTML = '<div class="tvbox-iframe-wrap"><iframe id="tv-iframe" src="' + safeUrl + '" allowfullscreen allow="autoplay; fullscreen" style="width:100%;height:100%;border:none"></iframe></div>'
      // 瓒呮椂鍏滃簳锛?0 绉掑唴 iframe 鏈Е鍙?load 浜嬩欢鍒欐樉绀洪敊璇?      setTimeout(() => {
        const iframe = document.getElementById('tv-iframe')
        if (iframe && iframe.style.display !== 'none') {
          body.innerHTML = '<div style="text-align:center;padding:40px"><p style="color:#6b6b8a;margin-bottom:14px">鎾斁鍦板潃鏃犳晥鎴栧凡琚槻鐩楅摼</p><a href="' + safeUrl + '" target="_blank" class="tvbox-open-ext">鈫?鍦ㄦ祻瑙堝櫒涓墦寮€</a></div>'
        }
      }, 10000)
    }
  }

  async function openDetail(id, name, sourceName, pic) {
    const source = VOD_SOURCES[src]
    const content = el.querySelector('#t-content')
    content.innerHTML = '<div class="tvbox-loading"><div class="tvbox-loading-icon"></div><span class="tvbox-loading-text">鍔犺浇涓?..</span></div>'
    let json = { list: null }
    try { json = await fetchJSON(source.api + '?ac=detail&ids=' + id) } catch {}
    if (!json.list) { try { json = await fetchJsonp(source.api + '?ac=detail&ids=' + id) } catch {} }
    const item = json.list && json.list[0]
    if (!item) { content.innerHTML = '<div class="tvbox-empty"><div class="tvbox-empty-icon">馃攳</div><div class="tvbox-empty-title">鏈壘鍒拌褰辩墖</div></div>'; return }
    showEpisodePicker(item, source.name)
  }

  // 鈹€鈹€ 鍓ч泦閫夌墖锛圥remium 璇︽儏椤碉級鈹€鈹€
  function showEpisodePicker(item, sourceName) {
    const overlay = el.querySelector('#t-player-overlay')
    const body = el.querySelector('#t-player-body')
    el.querySelector('#t-player-title').textContent = item.vod_name
    el.querySelector('#t-ext-link').href = '#'
    const episodes = parsePlaylist(item.vod_play_from, item.vod_play_url)
    const hist = getPlayHistory().find(h => h.id == item.vod_id && h.source === sourceName)
    playingEp = null

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

    const backBtn = '<button class="tvbox-detail-back" id="t-detail-back">鈫?杩斿洖鍒楄〃</button>'

    const infoHtml = '<div class="tvbox-detail-info">' +
      '<img src="' + escHtml(item.vod_pic) + '" class="tvbox-detail-pic" onerror="this.style.display=\'none\'" />' +
      '<div class="tvbox-detail-meta">' +
        '<div class="tvbox-detail-name">' + item.vod_name + '</div>' +
        '<div class="tvbox-detail-tags">' +
          (item.type_name ? '<span class="tvbox-detail-tag">' + item.type_name + '</span>' : '') +
          (item.vod_year ? '<span class="tvbox-detail-tag">' + item.vod_year + '</span>' : '') +
          (item.vod_area ? '<span class="tvbox-detail-tag">' + item.vod_area + '</span>' : '') +
        '</div>' +
        '<div class="tvbox-detail-desc">' + (item.vod_content || '鏆傛棤绠€浠?) + '</div>' +
      '</div>' +
    '</div>'

    const sourceSelectorHtml = episodes.length > 1
      ? '<div class="tvbox-source-selector">' +
          '<span class="tvbox-source-selector-label">閫夋嫨鎾斁婧?/span>' +
          '<div class="tvbox-source-tabs">' +
            episodes.map((e, i) => '<button class="tvbox-source-tab' + (i===preferredSi?' active':'') + '" data-si="' + i + '">' + e.name + '</button>').join('') +
          '</div>' +
        '</div>'
      : ''

    const firstUrls = episodes[preferredSi]?.urls || []

    body.innerHTML =
      backBtn + infoHtml + sourceSelectorHtml +
      '<div class="tvbox-episodes-title">鎾斁鍒楄〃 <span class="tvbox-episodes-count">' + firstUrls.length + ' 闆?/span></div>' +
      '<div class="tvbox-ep-grid" id="t-ep-grid">' +
        firstUrls.map(ep => {
          const isResume = hist && hist.epName === ep.name
          return '<button class="tvbox-ep-btn' + (isResume?' playing':'') + '" ' +
            'data-url="' + ep.url + '" data-name="' + item.vod_name + ' ' + ep.name + '" ' +
            'data-epname="' + ep.name + '" data-pic="' + item.vod_pic + '" ' +
            'data-id="' + item.vod_id + '" data-source="' + sourceName + '">' +
            (isResume?'鈻?':'') + ep.name + '</button>'
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
        grid.innerHTML = eps.map(ep =>
          '<button class="tvbox-ep-btn" data-url="' + escHtml(ep.url) + '" data-name="' + escHtml(item.vod_name + ' ' + ep.name) + '" ' +
            'data-epname="' + escHtml(ep.name) + '" data-pic="' + escHtml(item.vod_pic) + '" ' +
            'data-id="' + item.vod_id + '" data-source="' + sourceName + '">' + escHtml(ep.name) + '</button>'
        ).join('')
        bindEpBtns()
        body.querySelectorAll('[data-si]').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        body.querySelector('.tvbox-episodes-count').textContent = eps.length + ' 闆?
      })
    })

    bindEpBtns()
    overlay.style.display = 'flex'

    function bindEpBtns() {
      body.querySelectorAll('.tvbox-ep-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          upsertPlayHistory({ id: btn.dataset.id, name: btn.dataset.name, pic: btn.dataset.pic, source: btn.dataset.source, epName: btn.dataset.epname, epUrl: btn.dataset.url, progress: 0, duration: 0 })
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
    body.innerHTML = '<div class="tvbox-player-loading">姝ｅ湪鍔犺浇...</div>'
    overlay.style.display = 'flex'
    if (!url || url === '#') {
      body.innerHTML = '<div class="tvbox-player-loading">鏆傛棤鎾斁鍦板潃</div>'
      return
    }
    const isM3u8 = url.includes('.m3u8')
    const isMp4  = url.includes('.mp4')
    if (isM3u8 || isMp4) loadVideoPlayer(url, isM3u8, 0)
    else {
      var safeUrl = /^https?:\/\//i.test(url) ? url : ''
      body.innerHTML = '<div class="tvbox-iframe-wrap"><iframe id="tv-iframe" src="' + safeUrl + '" allowfullscreen allow="autoplay; fullscreen" style="width:100%;height:100%;border:none"></iframe></div>'
      setTimeout(() => {
        const iframe = document.getElementById('tv-iframe')
        if (iframe && iframe.style.display !== 'none') {
          body.innerHTML = '<div class="tvbox-player-loading">鎾斁鍦板潃鏃犳晥鎴栧凡琚槻鐩楅摼</div>'
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
            body.innerHTML = '<div style="text-align:center;padding:40px"><p style="color:#6b6b8a;margin-bottom:14px">m3u8 鍔犺浇瓒呮椂锛?5绉掞級</p><a href="' + videoUrl + '" target="_blank" class="tvbox-open-ext">&#8599; 鍦ㄦ祻瑙堝櫒涓墦寮€</a></div>'
          }
        }, 15000)
        hls.on(window.Hls.Events.ERROR, () => { hlsTimedOut = true; clearTimeout(hlsTimer); window._movieHls = null
          body.innerHTML = '<div style="text-align:center;padding:40px"><p style="color:#6b6b8a;margin-bottom:14px">m3u8 鎾斁澶辫触</p><a href="' + videoUrl + '" target="_blank" class="tvbox-open-ext">&#8599; 鍦ㄦ祻瑙堝櫒涓墦寮€</a></div>' })
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => { clearTimeout(hlsTimer) })
        video.addEventListener('timeupdate', () => trackProgress(video))
        video.addEventListener('ended', () => markFinished())
        if (startProgress > 0) video.currentTime = startProgress
        video.play().catch(() => {})
      } else {
        body.innerHTML = '<div style="text-align:center;padding:40px"><p style="color:#6b6b8a;margin-bottom:14px">姝ｅ湪灏濊瘯鎾斁...</p><a href="' + videoUrl + '" target="_blank" class="tvbox-open-ext">鈫?鍦ㄦ祻瑙堝櫒涓墦寮€</a></div>'
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
    // 娓呯悊 HLS 瀹炰緥锛岄槻姝㈣棰戝悗鍙扮户缁挱鏀?    if (window._movieHls) {
      window._movieHls.destroy()
      window._movieHls = null
    }
  }

  function renderPagination(page, total) {
    if (total <= 1) return ''
    const prev = page > 1 ? page - 1 : 1
    const next = page < total ? page + 1 : total
    return '<div class="tvbox-pagination">' +
      '<button class="tvbox-page-btn" data-page="' + prev + '">鈼€ 涓婁竴椤?/button>' +
      '<span class="tvbox-page-info">绗?' + page + ' / ' + total + ' 椤?/span>' +
      '<button class="tvbox-page-btn" data-page="' + next + '">涓嬩竴椤?鈻?/button>' +
    '</div>'
  }

  // 鈹€鈹€ 鎮诞鎾斁鍣紙鍙嫋鎷?鏈€灏忓寲/缃《锛夆攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  let _floatState = null   // { wrap, title, pinned, minimized, h, w, x, y }

  function openFloatPlayer(name, url, id, source, epName, pic) {
    closeFloatPlayer()

    // 浼樺厛閫夋嫨鐩存帴 m3u8锛堥潪 /share/ 鐨勶級
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
        <button class="tvbox-float-ctrl min-btn" id="_fmin" title="鏈€灏忓寲">鈹€</button>
        <button class="tvbox-float-ctrl pin-btn" id="_fpin" title="缃《">馃搶</button>
        <button class="tvbox-float-ctrl close" id="_fclose" title="鍏抽棴">鉁?/button>
      </div>
      <div class="tvbox-float-body" id="_fbody">
        ${canEmbed ? `<div class="tvbox-float-video-wrap" id="_fvid"></div>` :
          `<div style="aspect-ratio:16/9;background:#000;display:flex;align-items:center;justify-content:center;color:#6b6b8a;font-size:13px">
            <div style="text-align:center">
              <div style="margin-bottom:8px">鈿狅笍 闈炵洿閾撅紝鏃犳硶鐩存帴鎾斁</div>
              <div style="font-size:11px;color:#555">m3u8/MP4 鐩撮摼鎵嶅彲鎾斁</div>
            </div>
          </div>`}
      </div>
      <div class="tvbox-float-url-bar">
        <a href="${escHtml(useUrl)}" target="_blank" rel="noopener" id="_fext" title="${escHtml(useUrl)}">${escHtml(useUrl)}</a>
        <button class="tvbox-float-ctrl" id="_fcopy" title="澶嶅埗閾炬帴" style="font-size:10px;width:22px;height:22px">馃搵</button>
      </div>`

    document.body.appendChild(wrap)
    _floatState = {
      wrap, pinned: false, minimized: false,
      h: wrap.offsetHeight, w: wrap.offsetWidth,
      x: window.innerWidth - 420 - 20,
      y: window.innerHeight - 80 - (canEmbed ? Math.round(420 * 9/16 + 120) : 120)
    }

    // 鎷栨嫿
    const hdr = wrap.querySelector('.tvbox-float-header')
    hdr.addEventListener('mousedown', onFloatDragStart)
    hdr.addEventListener('touchstart', onFloatDragStart, { passive: false })

    // 鎺у埗鎸夐挳
    wrap.querySelector('#_fclose').addEventListener('click', closeFloatPlayer)
    wrap.querySelector('#_fmin').addEventListener('click', () => toggleFloatMin())
    wrap.querySelector('#_fpin').addEventListener('click', () => toggleFloatPin())
    wrap.querySelector('#_fcopy')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(useUrl).catch(() => {})
    })

    // 鎾斁瑙嗛
    if (canEmbed) {
      if (isM3u8) loadVideoIntoFloat(useUrl)
      else loadMp4IntoFloat(useUrl)
    }

    // ESC 鍏抽棴
    document.addEventListener('keydown', onFloatEsc)
  }

  function pickDirectUrl(url) {
    // url 鍙兘鏄?"闆嗗悕$url#闆嗗悕$url" 鎴栧崟涓?url
    if (!url.includes('#') && !url.includes('$$$')) return url
    // 鎵剧涓€涓潪 /share/ 鐨?m3u8
    const parts = url.split('#').filter(Boolean)
    for (const p of parts) {
      const idx = p.indexOf('$')
      const u = idx >= 0 ? p.slice(idx + 1) : p
      if (u.includes('.m3u8') && !u.includes('/share/')) return u
    }
    // 鍏舵閫夌涓€涓?m3u8
    for (const p of parts) {
      const idx = p.indexOf('$')
      const u = idx >= 0 ? p.slice(idx + 1) : p
      if (u.includes('.m3u8')) return u
    }
    // fallback 绗竴涓?url
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
          vidWrap.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#6b6b8a;font-size:13px">m3u8 鍔犺浇瓒呮椂锛?5绉掞級</div>'
        }
      }, 15000)
      hls.on(window.Hls.Events.ERROR, () => { clearTimeout(timer); window._floatHls = null
        vidWrap.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#f87171;font-size:13px">m3u8 鎾斁澶辫触</div>'
      })
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => clearTimeout(timer))
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url
    } else {
      vidWrap.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#6b6b8a;font-size:13px">娴忚鍣ㄤ笉鏀寔 HLS</div>'
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
    _floatState.wrap.querySelector('#_fmin').textContent = _floatState.minimized ? '鈻? : '鈹€'
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

  // 鈹€鈹€ 閾炬帴杈撳叆瑙ｆ瀽鍣?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  function showUrlInput() {
    const existing = document.querySelector('.tvbox-url-overlay')
    if (existing) { existing.remove(); return }

    const overlay = document.createElement('div')
    overlay.className = 'tvbox-url-overlay'
    overlay.innerHTML = `
      <div class="tvbox-url-box">
        <div class="tvbox-url-title">馃敆 閾炬帴瑙ｆ瀽鎾斁</div>
        <div class="tvbox-url-err" id="_urlerr"></div>
        <div class="tvbox-url-row">
          <input id="_urlin" type="url" placeholder="绮樿创瑙嗛椤甸潰 URL銆乵3u8 鐩撮摼鎴栧垎浜〉閾炬帴..." autofocus />
          <button class="tvbox-url-go" id="_urlgo">瑙ｆ瀽</button>
        </div>
        <div class="tvbox-url-hint">
          鏀寔锛?span>m3u8/MP4 鐩撮摼</span>銆?span>閲忓瓙/鏆撮鍒嗕韩椤?/span>銆?span>浠绘剰瑙嗛椤?URL</span><br>
          鎻愮ず锛氳В鏋愮粨鏋滀細灏藉彲鑳芥彁鍙栫洿閾?m3u8锛屾棤娉曟彁鍙栨椂鏄剧ず璇存槑
        </div>
        <button class="tvbox-url-cancel" id="_urlcancel">鍙栨秷</button>
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
      if (!rawUrl) { showErr('璇疯緭鍏ラ摼鎺?); return }
      if (!/^https?:/i.test(rawUrl)) { showErr('浠呮敮鎸?http/https 閾炬帴'); return }
      clearErr()

      // 鐩撮摼鐩存帴鎾?      if (rawUrl.includes('.m3u8') || rawUrl.includes('.mp4')) {
        overlay.remove()
        openFloatPlayer('鐩撮摼鎾斁', rawUrl)
        return
      }

      // 閲忓瓙/鏆撮鍒嗕韩椤?鈫?灏濊瘯 Rust vod_fetch 鎻愬彇璇︽儏
      const isLzShare = /\/share\//.test(rawUrl) || rawUrl.includes('v.lfthirtytwo.com') || rawUrl.includes('vip.lz-')
      if (isLzShare) {
        overlay.remove()
        openFloatPlayer('瑙ｆ瀽涓?, rawUrl)
        // 鍏堝皾璇曠敤 vod_fetch 鎵捐鎯呮帴鍙?        await tryExtractFromSharePage(rawUrl)
        return
      }

      // 鍏朵粬椤甸潰 鈫?鏄剧ず涓嶆敮鎸?      overlay.remove()
      openFloatPlayer('鏃犳硶瑙ｆ瀽', rawUrl)
    }

    overlay.querySelector('#_urlgo').addEventListener('click', () => doUrlParse(inp.value))
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') doUrlParse(inp.value) })
    overlay.querySelector('#_urlcancel').addEventListener('click', () => overlay.remove())
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
    inp.focus()
  }

  async function tryExtractFromSharePage(shareUrl) {
    // 浠庡垎浜〉 URL 鍙嶅悜鎺ㄦ柇 vod_id锛岃皟鐢ㄨ鎯呮帴鍙?    // 鍒嗕韩椤垫牸寮? https://v.lfthirtytwo.com/share/{hash}
    // 鏃犳硶鐩存帴鎻愬彇 hash 鈫?vod_id 鏄犲皠锛屾敼鐢?iframe 灏濊瘯
    const vidWrap = document.querySelector('#_fvid')
    if (vidWrap) {
      vidWrap.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#6b6b8a;font-size:13px">鈿狅笍 鍒嗕韩椤甸渶娴忚鍣ㄦ墦寮€闃茬洍閾?/div>'
    }
    // 鏇存柊璇存槑
    const urlBar = document.querySelector('.tvbox-float-url-bar')
    if (urlBar) {
      const a = urlBar.querySelector('a')
      if (a) a.href = shareUrl
    }
    // 灏濊瘯 iframe 鎾斁锛堝彲鑳藉け璐ワ級
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
      const name = (from || '').split('$$$')[i] || ('婧? + (i + 1))
      sources.push({
        name,
        urls: part.split('#').map(p => {
          const idx = p.indexOf('$')
          return idx >= 0
            ? { name: p.slice(0, idx) || '鏈煡', url: p.slice(idx + 1) }
            : { name: '鏈煡', url: p }
        }).filter(ep => ep.url)
      })
    })
    return sources
  }
}
