/**
 * 影视工具页面
 * 对接 饭太硬 / 肥猫 / 王小二 等TVBox标准接口
 * 支持影视搜索、播放、源切换
 */
import { t } from '../lib/i18n.js'

// 默认影视接口
const DEFAULT_APIS = [
  { name: '饭太硬', url: 'http://www.饭太硬.com/tv', type: 'tvbox' },
  { name: '肥猫', url: 'http://肥猫.com', type: 'tvbox' },
  { name: '王小二', url: 'https://9280.kstore.vip/wex.json', type: 'tvbox' },
]

let _currentApiIndex = 0
let _currentSites = []
let _currentCategory = 'all'
let _searchResults = []
let _playingUrl = null
let _player = null

export function renderMovieTool(el) {
  _currentApiIndex = 0
  _currentSites = []
  _currentCategory = 'all'
  _searchResults = []
  _playingUrl = null

  el.innerHTML = `
    <div class="page-header">
      <div class="page-title">${icon('movie', 20)} 影视工具</div>
      <div class="page-desc">支持多个影视接口 · 搜索全网高清影视</div>
    </div>
    <div class="movie-container">
      <div class="movie-sidebar">
        <div class="movie-api-selector">
          <div class="movie-api-label">选择影视源</div>
          <div class="movie-api-list" id="movie-api-list"></div>
        </div>
        <div class="movie-category-label">分类</div>
        <div class="movie-categories" id="movie-categories"></div>
      </div>
      <div class="movie-main">
        <div class="movie-search-bar">
          <input type="text" id="movie-search-input" class="movie-search-input" placeholder="搜索电影、电视剧、综艺...">
          <button class="btn btn-primary" id="movie-search-btn">搜索</button>
        </div>
        <div class="movie-results" id="movie-results">
          <div class="movie-empty">
            <div style="font-size:48px;margin-bottom:12px">🎬</div>
            <div style="color:var(--text-secondary)">输入关键词搜索影视内容</div>
            <div style="color:var(--text-tertiary);font-size:var(--font-size-xs);margin-top:8px">支持电影、电视剧、综艺、短剧等</div>
          </div>
        </div>
        <div class="movie-player-area" id="movie-player-area" style="display:none">
          <div class="movie-player-header">
            <span id="movie-playing-title"></span>
            <button class="btn btn-secondary btn-sm" onclick="closeMoviePlayer()">关闭</button>
          </div>
          <div class="movie-player-wrapper" id="movie-player-wrapper">
            <video id="movie-video-player" controls playsinline style="width:100%;height:100%;background:#000;border-radius:0 0 var(--radius-md) var(--radius-md)"></video>
          </div>
        </div>
      </div>
    </div>
  `

  injectMovieStyle()
  renderApiSelector(el)
  loadApi(0)

  // 绑定搜索事件
  el.querySelector('#movie-search-btn')?.addEventListener('click', doMovieSearch)
  el.querySelector('#movie-search-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doMovieSearch()
  })
}

// 渲染API选择器
function renderApiSelector(el) {
  const list = el.querySelector('#movie-api-list')
  if (!list) return
  list.innerHTML = DEFAULT_APIS.map((api, i) => `
    <div class="movie-api-item ${i === _currentApiIndex ? 'active' : ''}" data-index="${i}" onclick="switchMovieApi(${i})">
      <span class="movie-api-dot"></span>
      <span>${api.name}</span>
    </div>
  `).join('')
}

// 切换API
window.switchMovieApi = function(index) {
  _currentApiIndex = index
  _currentSites = []
  _currentCategory = 'all'
  const list = document.querySelector('#movie-api-list')
  list?.querySelectorAll('.movie-api-item').forEach((el, i) => {
    el.classList.toggle('active', i === index)
  })
  loadApi(index)
}

// 加载API配置
async function loadApi(index) {
  const api = DEFAULT_APIS[index]
  if (!api) return

  const resultsEl = document.querySelector('#movie-results')
  const catEl = document.querySelector('#movie-categories')
  if (resultsEl) resultsEl.innerHTML = '<div class="movie-loading">加载中...</div>'
  if (catEl) catEl.innerHTML = ''

  try {
    // 获取主配置（可能是JSON或HTML）
    const resp = await fetchWithTimeout(api.url, 8000)
    const text = await resp.text()

    let sites = []
    let categories = []

    if (api.type === 'tvbox') {
      // TVBox标准格式：直接是站点列表JSON
      // 或者需要从HTML中解析jsdelivr CDN链接
      if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
        const data = JSON.parse(text)
        sites = parseSitesFromTvBoxJson(data)
      } else {
        // HTML页面，尝试找JSON URL
        const jsonUrl = extractJsonUrlFromHtml(text)
        if (jsonUrl) {
          const jsonResp = await fetchWithTimeout(jsonUrl, 8000)
          const jsonText = await jsonResp.text()
          try {
            const data = JSON.parse(jsonText)
            sites = parseSitesFromTvBoxJson(data)
          } catch {
            sites = []
          }
        }
      }
    }

    _currentSites = sites
    categories = ['all', ...new Set(sites.map(s => s.type || '其他'))]

    renderCategories(categories)
    renderSiteInfo(sites.length)
  } catch(e) {
    const resultsEl = document.querySelector('#movie-results')
    if (resultsEl) {
      resultsEl.innerHTML = `
        <div class="movie-empty">
          <div style="font-size:48px;margin-bottom:12px">❌</div>
          <div style="color:var(--text-secondary)">接口加载失败</div>
          <div style="color:var(--text-tertiary);font-size:var(--font-size-xs);margin-top:8px">${api.name} - ${e.message}</div>
        </div>
      `
    }
  }
}

// 从TVBox JSON解析站点
function parseSitesFromTvBoxJson(data) {
  const sites = []
  // 标准TVBox格式：{ sites: [...] } 或 直接是数组
  const siteArray = data.sites || data || []
  for (const s of siteArray) {
    if (!s.key || !s.name) continue
    sites.push({
      key: s.key,
      name: s.name,
      api: s.api || '',
      type: s.type || 1,
      searchable: s.searchable === 1,
      changeable: s.changeable === 1,
      ext: s.ext || '',
      playerType: s.playerType || 1,
    })
  }
  return sites
}

// 从HTML中提取JSON URL（饭太硬等导航页）
function extractJsonUrlFromHtml(html) {
  // 常见的TVBox仓库CDN提取模式
  const patterns = [
    /https?:\/\/raw\.githubusercontent\.com\/[^\s"']+\.json/gi,
    /https?:\/\/cdn\.jsdelivr\.net\/[^\s"']+\.json/gi,
    /https?:\/\/[^\s"']+\.(json|txt)[^\s"']*/gi,
  ]
  for (const pat of patterns) {
    const match = html.match(pat)
    if (match) {
      // 返回找到的最后一个（通常是配置）
      return match[match.length - 1]
    }
  }
  // 尝试直接在HTML中找JSON
  const jsonMatch = html.match(/\{[^{}]*"sites"\s*:[^}]+\}/)
  if (jsonMatch) return null // 已在调用处处理
  return null
}

// 渲染分类
function renderCategories(categories) {
  const catEl = document.querySelector('#movie-categories')
  if (!catEl) return
  catEl.innerHTML = categories.map(cat => `
    <div class="movie-cat-item ${cat === _currentCategory ? 'active' : ''}" data-cat="${cat}" onclick="switchMovieCat('${cat}')">
      ${cat === 'all' ? '全部' : cat}
    </div>
  `).join('')
}

window.switchMovieCat = function(cat) {
  _currentCategory = cat
  document.querySelectorAll('.movie-cat-item').forEach(el => {
    el.classList.toggle('active', el.dataset.cat === cat)
  })
}

// 搜索
async function doMovieSearch() {
  const query = document.querySelector('#movie-search-input')?.value?.trim()
  if (!query) return

  const resultsEl = document.querySelector('#movie-results')
  if (!resultsEl) return

  resultsEl.innerHTML = '<div class="movie-loading">搜索中...</div>'

  const api = DEFAULT_APIS[_currentApiIndex]
  if (!api) return

  try {
    const sites = _currentSites.filter(s => s.searchable || s.quickSearch === 1)
    if (sites.length === 0) {
      // 尝试直接用主URL搜索
      resultsEl.innerHTML = `
        <div class="movie-empty">
          <div style="font-size:48px;margin-bottom:12px">🔍</div>
          <div style="color:var(--text-secondary)">该接口不支持搜索</div>
          <div style="color:var(--text-tertiary);font-size:var(--font-size-xs);margin-top:8px">请切换其他影视源</div>
        </div>
      `
      return
    }

    // 使用第一个可搜索站点
    const site = sites[0]
    const searchUrl = buildSearchUrl(site, query)
    if (!searchUrl) {
      resultsEl.innerHTML = '<div class="movie-empty"><div style="font-size:48px">❌</div><div style="color:var(--text-secondary)">搜索失败</div></div>'
      return
    }

    const resp = await fetchWithTimeout(searchUrl, 10000)
    const text = await resp.text()
    const results = parseSearchResults(text, site)

    if (results.length === 0) {
      resultsEl.innerHTML = `
        <div class="movie-empty">
          <div style="font-size:48px;margin-bottom:12px">😔</div>
          <div style="color:var(--text-secondary)">未找到「${query}」相关结果</div>
        </div>
      `
      return
    }

    _searchResults = results
    renderSearchResults(results)
  } catch(e) {
    resultsEl.innerHTML = `
      <div class="movie-empty">
        <div style="font-size:48px;margin-bottom:12px">❌</div>
        <div style="color:var(--text-secondary)">搜索异常</div>
        <div style="color:var(--text-tertiary);font-size:var(--font-size-xs);margin-top:8px">${e.message}</div>
      </div>
    `
  }
}

// 构建搜索URL
function buildSearchUrl(site, query) {
  // TVBox标准搜索接口
  if (site.api && site.api.startsWith('csp_')) {
    // 通用爬虫接口格式
    return `${site.ext}?kw=${encodeURIComponent(query)}&quick=${encodeURIComponent(query)}`
  }
  // 直接API
  if (site.api) {
    return `${site.api}/search?wd=${encodeURIComponent(query)}`
  }
  return null
}

// 解析搜索结果
function parseSearchResults(text, site) {
  try {
    const data = JSON.parse(text)
    // 标准格式：{ list: [...] } 或 { results: [...] }
    const list = data.list || data.results || data.data || []
    return list.map(item => ({
      id: item.id || item.vod_id || item.id,
      title: item.title || item.name || item.vod_name || '未知',
      cover: item.cover || item.pic || item.thumb || '',
      remark: item.remark || item.update || '',
      year: item.year || '',
      type: item.type || item.vod_type || '',
    }))
  } catch {
    return []
  }
}

// 渲染搜索结果
function renderSearchResults(results) {
  const resultsEl = document.querySelector('#movie-results')
  if (!resultsEl) return

  resultsEl.innerHTML = results.slice(0, 60).map(item => `
    <div class="movie-card" onclick="playMovie('${encodeURIComponent(item.title)}', '${encodeURIComponent(item.cover)}')">
      <div class="movie-card-cover" style="background-image:url('${item.cover}')">
        ${item.remark ? `<span class="movie-card-tag">${item.remark}</span>` : ''}
      </div>
      <div class="movie-card-title">${item.title}</div>
    </div>
  `).join('')
}

// 播放
window.playMovie = async function(title, cover) {
  title = decodeURIComponent(title)
  cover = decodeURIComponent(cover)

  const playerArea = document.querySelector('#movie-player-area')
  const resultsEl = document.querySelector('#movie-results')
  const titleEl = document.querySelector('#movie-playing-title')

  if (playerArea) playerArea.style.display = ''
  if (titleEl) titleEl.textContent = title
  if (resultsEl) resultsEl.style.display = 'none'

  // 尝试获取播放地址（使用默认搜索到的站点）
  const sites = _currentSites.filter(s => s.changeable || s.searchable)
  let playUrl = null

  for (const site of sites.slice(0, 3)) {
    try {
      const searchUrl = buildSearchUrl(site, title)
      if (!searchUrl) continue
      const resp = await fetchWithTimeout(searchUrl, 8000)
      const text = await resp.text()
      const results = parseSearchResults(text, site)
      const match = results.find(r => r.title === title || r.title.includes(title))
      if (match && match.id) {
        // 尝试获取详情/播放页
        const detailUrl = `${site.api}${site.api.endsWith('/') ? '' : '/'}detail?id=${match.id}`
        const detailResp = await fetchWithTimeout(detailUrl, 8000)
        const detailText = await detailResp.text()
        const detailData = JSON.parse(detailText)
        const detail = detailData.list?.[0] || detailData.results?.[0] || detailData
        playUrl = detail.vod_play_url || detail.play_url || detail.url || null
        if (playUrl) break
      }
    } catch {}
  }

  if (!playUrl) {
    // 显示提示让用户复制链接到播放器
    const playerWrapper = document.querySelector('#movie-player-wrapper')
    if (playerWrapper) {
      playerWrapper.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;color:var(--text-secondary)">
          <div style="font-size:48px;margin-bottom:12px">📺</div>
          <div style="margin-bottom:12px">暂无法自动播放，请联系作者获取播放源</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-tertiary)">如需播放功能，建议使用喵咕验证获取完整影视接口</div>
        </div>
      `
    }
    return
  }

  // 解析播放源（TVBox格式："第1集$url#第2集$url2"）
  const sources = []
  if (typeof playUrl === 'string') {
    for (const part of playUrl.split('#')) {
      const [name, url] = part.split('$')
      if (name && url) sources.push({ name: name.trim(), url: url.trim() })
    }
  }

  if (sources.length === 0) {
    const playerWrapper = document.querySelector('#movie-player-wrapper')
    if (playerWrapper) {
      playerWrapper.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:300px;color:var(--text-secondary)">
          <div style="font-size:48px;margin-bottom:12px">📺</div>
          <div>暂无播放源</div>
        </div>
      `
    }
    return
  }

  // 显示集数选择器
  const playerWrapper = document.querySelector('#movie-player-wrapper')
  if (playerWrapper) {
    playerWrapper.innerHTML = `
      <div class="movie-source-list">
        <div class="movie-source-label">选择剧集</div>
        <div class="movie-source-items">
          ${sources.map((s, i) => `
            <div class="movie-source-item ${i === 0 ? 'active' : ''}" data-url="${s.url}" onclick="selectSource(this, '${s.url}')">${s.name}</div>
          `).join('')}
        </div>
      </div>
      <video id="movie-video-player" controls playsinline style="width:100%;flex:1;background:#000;min-height:300px"></video>
    `
  }

  // 自动播放第一集
  playSource(sources[0].url)
}

window.selectSource = function(el, url) {
  el.parentElement?.querySelectorAll('.movie-source-item').forEach(item => {
    item.classList.remove('active')
  })
  el.classList.add('active')
  playSource(url)
}

function playSource(url) {
  const video = document.querySelector('#movie-video-player')
  if (!video) return

  // 处理不同格式
  if (url.includes('.m3u8')) {
    // HLS
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url
    } else {
      // 需要hls.js但不想引入依赖，直接给链接
      video.src = url
    }
  } else if (url.includes('.mp4')) {
    video.src = url
  } else {
    video.src = url
  }

  video.play().catch(() => {})
}

window.closeMoviePlayer = function() {
  const playerArea = document.querySelector('#movie-player-area')
  const resultsEl = document.querySelector('#movie-results')
  const video = document.querySelector('#movie-video-player')

  if (video) {
    video.pause()
    video.src = ''
  }
  if (playerArea) playerArea.style.display = 'none'
  if (resultsEl) resultsEl.style.display = ''
}

function renderSiteInfo(count) {
  const resultsEl = document.querySelector('#movie-results')
  if (!resultsEl) return
  resultsEl.innerHTML = `
    <div class="movie-empty">
      <div style="font-size:48px;margin-bottom:12px">🎬</div>
      <div style="color:var(--text-secondary)">已加载 ${count} 个影视源</div>
      <div style="color:var(--text-tertiary);font-size:var(--font-size-xs);margin-top:8px">输入关键词搜索影视内容</div>
    </div>
  `
}

async function fetchWithTimeout(url, timeoutMs = 8000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      mode: 'cors',
    })
    clearTimeout(timer)
    return resp
  } catch (e) {
    clearTimeout(timer)
    throw e
  }
}

function icon(name, size = 16) {
  const icons = {
    movie: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="${size}" height="${size}"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>`,
  }
  return icons[name] || ''
}

function injectMovieStyle() {
  if (document.getElementById('movie-tool-style')) return
  const s = document.createElement('style')
  s.id = 'movie-tool-style'
  s.textContent = `
    .movie-container { display: flex; height: calc(100vh - 120px); overflow: hidden; }
    .movie-sidebar { width: 160px; flex-shrink: 0; border-right: 1px solid var(--border); padding: 16px 12px; overflow-y: auto; }
    .movie-main { flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
    .movie-api-selector { margin-bottom: 20px; }
    .movie-api-label { font-size: var(--font-size-xs); color: var(--text-tertiary); font-weight: 600; margin-bottom: 8px; text-transform: uppercase; letter-spacing: .5px; }
    .movie-api-list { display: flex; flex-direction: column; gap: 4px; }
    .movie-api-item { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 6px; cursor: pointer; font-size: var(--font-size-sm); color: var(--text-secondary); transition: all .15s; }
    .movie-api-item:hover { background: var(--bg-secondary); color: var(--text-primary); }
    .movie-api-item.active { background: var(--accent,#6366f1); color: #fff; }
    .movie-api-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .6; }
    .movie-api-item.active .movie-api-dot { opacity: 1; background: #fff; }
    .movie-category-label { font-size: var(--font-size-xs); color: var(--text-tertiary); font-weight: 600; margin-bottom: 8px; text-transform: uppercase; letter-spacing: .5px; }
    .movie-categories { display: flex; flex-direction: column; gap: 2px; }
    .movie-cat-item { padding: 5px 8px; border-radius: 6px; cursor: pointer; font-size: var(--font-size-xs); color: var(--text-secondary); transition: all .15s; }
    .movie-cat-item:hover { background: var(--bg-secondary); color: var(--text-primary); }
    .movie-cat-item.active { background: var(--bg-secondary); color: var(--accent,#6366f1); font-weight: 600; }
    .movie-search-bar { display: flex; gap: 8px; }
    .movie-search-input { flex: 1; padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-secondary); color: var(--text-primary); font-size: var(--font-size-sm); }
    .movie-search-input:focus { outline: none; border-color: var(--accent,#6366f1); }
    .movie-results { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; flex: 1; overflow-y: auto; }
    .movie-card { cursor: pointer; border-radius: var(--radius-md); overflow: hidden; background: var(--bg-secondary); border: 1px solid var(--border); transition: transform .15s; }
    .movie-card:hover { transform: translateY(-2px); border-color: var(--accent,#6366f1); }
    .movie-card-cover { height: 160px; background-size: cover; background-position: center; background-color: var(--bg-tertiary); position: relative; }
    .movie-card-tag { position: absolute; bottom: 4px; left: 4px; background: rgba(0,0,0,.7); color: #fff; font-size: 10px; padding: 2px 5px; border-radius: 3px; }
    .movie-card-title { padding: 8px; font-size: var(--font-size-xs); color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; }
    .movie-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 0; color: var(--text-secondary); }
    .movie-loading { display: flex; align-items: center; justify-content: center; padding: 48px 0; color: var(--text-tertiary); }
    .movie-player-area { display: flex; flex-direction: column; gap: 8px; }
    .movie-player-header { display: flex; justify-content: space-between; align-items: center; font-size: var(--font-size-sm); font-weight: 600; color: var(--text-primary); }
    .movie-player-wrapper { display: flex; flex-direction: column; gap: 8px; background: #000; border-radius: var(--radius-md); overflow: hidden; min-height: 300px; }
    .movie-source-list { background: var(--bg-secondary); padding: 10px 12px; }
    .movie-source-label { font-size: var(--font-size-xs); color: var(--text-tertiary); margin-bottom: 6px; }
    .movie-source-items { display: flex; flex-wrap: wrap; gap: 4px; max-height: 100px; overflow-y: auto; }
    .movie-source-item { padding: 3px 8px; border-radius: 4px; font-size: 11px; background: var(--bg-tertiary); color: var(--text-secondary); cursor: pointer; border: 1px solid transparent; }
    .movie-source-item:hover { border-color: var(--accent,#6366f1); color: var(--text-primary); }
    .movie-source-item.active { background: var(--accent,#6366f1); color: #fff; }
    .btn { padding: 7px 16px; border-radius: var(--radius-md); font-size: var(--font-size-sm); font-weight: 600; cursor: pointer; border: none; transition: all .2s; display: inline-flex; align-items: center; gap: 6px; }
    .btn-primary { background: linear-gradient(135deg,#6366f1,#8b5cf6); color: #fff; }
    .btn-primary:hover { opacity: 0.9; }
    .btn-secondary { background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border); }
    .btn-secondary:hover { background: var(--bg-secondary); }
    .btn-sm { padding: 4px 10px; font-size: 11px; }
  `
  document.head.appendChild(s)
}
