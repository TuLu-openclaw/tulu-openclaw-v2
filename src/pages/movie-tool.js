/**
 * 屠戮影视 - 重写版
 * VOD 点播（电影/剧集/综艺/动漫/短剧）+ TV 直播
 * 2026-04-12 重写，测试后可用接口
 */

import '../style/movie-tool.css'

// ──────────────────────────────────────────────
// VOD 接口（影视点播）— 测试后可用
// ──────────────────────────────────────────────
const VOD_SOURCES = [
  {
    name: '量子资源',
    api: 'https://cj.lziapi.com/api.php/provide/vod',
  },
]

// ──────────────────────────────────────────────
// TV 直播接口 — 测试后可用
// ──────────────────────────────────────────────
const TV_SOURCES = [
  { name: '南风',    url: 'http://120.46.39.251/tvbox/tvboxqq/南风/api.json' },
  { name: '欧歌',    url: 'http://120.46.39.251/tvbox/tvboxqq/欧歌/api.json' },
  { name: '天微',    url: 'http://120.46.39.251/tvbox/tvboxqq/天微/api.json' },
  { name: '戏曲音乐',  url: 'http://120.46.39.251/tvbox/tvboxqq/戏曲音乐/api.json' },
  { name: '少儿频道',  url: 'http://120.46.39.251/tvbox/tvboxqq/少儿频道/api.json' },
  { name: '小米',    url: 'http://120.46.39.251/tvbox/tvboxqq/小米/api.json' },
  { name: '王二小',  url: 'http://120.46.39.251/tvbox/tvboxqq/王二小/api.json' },
  { name: '小虎斑',  url: 'http://120.46.39.251/tvbox/tvboxqq/小虎斑/api.json' },
  { name: '饭太硬',  url: 'http://120.46.39.251/tvbox/tvboxqq/饭太硬/api.json' },
  { name: '肥猫',    url: 'http://120.46.39.251/tvbox/tvboxqq/肥猫/api.json' },
  { name: '潇洒',    url: 'http://120.46.39.251/tvbox/tvboxqq/潇洒/api.json' },
  { name: '摸鱼儿',  url: 'http://120.46.39.251/tvbox/tvboxqq/摸鱼儿/api.json' },
  { name: '香雅情',  url: 'http://120.46.39.251/tvbox/tvboxqq/香雅情/api.json' },
  { name: 'OK直播', url: 'http://ok321.top/tv' },
]

// ──────────────────────────────────────────────
// 点播分类
// ──────────────────────────────────────────────
const CATEGORIES = [
  { id: 'movie',   name: '电影',   typeId: '1' },
  { id: 'tv',      name: '电视剧', typeId: '2' },
  { id: 'variety', name: '综艺',   typeId: '3' },
  { id: 'anime',   name: '动漫',   typeId: '4' },
  { id: 'short',   name: '短剧',   typeId: '5' },
  { id: 'live',    name: '电视直播', typeId: '' },
]

const HLS_CDN = './hls.min.js'
const MAX_SEARCH_HISTORY = 20
const MAX_PLAY_HISTORY = 30
const KEY_SEARCH = 'tulu_vod_search'
const KEY_PLAY   = 'tulu_vod_play'

// ──────────────────────────────────────────────
// 全局状态
// ──────────────────────────────────────────────
let cat = 'movie'
let src = 0
let page = 1
let query = ''
let tvCache = {}
let playingEp = null
let _el = null

// ──────────────────────────────────────────────
// 工具函数
// ──────────────────────────────────────────────
function getSearchHistory() {
  try { return JSON.parse(localStorage.getItem(KEY_SEARCH) || '[]') } catch { return [] }
}
function saveSearchHistory(list) {
  localStorage.setItem(KEY_SEARCH, JSON.stringify(list))
}
function addSearchHistory(q) {
  if (!q) return
  let h = getSearchHistory().filter(s => s !== q)
  h.unshift(q)
  saveSearchHistory(h.slice(0, MAX_SEARCH_HISTORY))
}
function clearSearchHistory() { saveSearchHistory([]) }

function getPlayHistory() {
  try { return JSON.parse(localStorage.getItem(KEY_PLAY) || '[]') } catch { return [] }
}
function savePlayHistory(list) {
  localStorage.setItem(KEY_PLAY, JSON.stringify(list))
}
function upsertPlayHistory(item) {
  let h = getPlayHistory().filter(s => !(s.id === item.id && s.source === item.source))
  h.unshift({ ...item, updatedAt: Date.now() })
  savePlayHistory(h.slice(0, MAX_PLAY_HISTORY))
}
function updatePlayProgress(id, source, progress) {
  let h = getPlayHistory()
  let idx = h.findIndex(s => s.id === id && s.source === source)
  if (idx >= 0) { h[idx].progress = progress; h[idx].updatedAt = Date.now() }
  savePlayHistory(h)
}
function clearPlayHistory() { savePlayHistory([]) }

async function fetchJSON(url) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!resp.ok) throw new Error('HTTP ' + resp.status)
  return resp.json()
}

// ──────────────────────────────────────────────
// 主渲染入口
// ──────────────────────────────────────────────
export default function render() {
  const el = document.createElement('div')
  el.className = 'tvbox-page-root'
  _el = el

  el.innerHTML = `
    <div class="tvbox-toolbar">
      <div class="tvbox-toolbar-top">
        <div class="tvbox-logo">🎬 屠戮影视</div>
      </div>
      <div class="tvbox-search">
        <input type="text" id="t-search" placeholder="搜索电影、剧集、综艺、动漫..." />
        <button class="tvbox-search-btn" id="t-search-btn">🔍</button>
      </div>
      <div class="tvbox-tabs-wrap" id="t-cat-tabs"></div>
      <div id="t-src-tabs-wrap">
        <div class="tvbox-tabs-wrap" id="t-src-tabs"></div>
      </div>
      <div class="tvbox-history" id="t-history" style="display:none">
        <div class="tvbox-history-label">
          搜索历史
          <button class="tvbox-history-clear" id="t-clear-history">清除</button>
        </div>
        <div class="tvbox-history-tags" id="t-history-tags"></div>
      </div>
    </div>
    <div class="tvbox-content" id="t-content">
      <div class="tvbox-loading">加载中...</div>
    </div>

    <div class="tvbox-player-overlay" id="t-player-overlay" style="display:none">
      <div class="tvbox-player-box">
        <div class="tvbox-player-header">
          <span class="tvbox-player-title" id="t-player-title">播放中</span>
          <button class="tvbox-player-close" id="t-player-close">✕</button>
        </div>
        <div class="tvbox-player-body" id="t-player-body">
          <div class="tvbox-player-loading">正在加载播放器...</div>
        </div>
        <div class="tvbox-player-url-bar">
          <a href="#" class="tvbox-open-ext" id="t-ext-link" target="_blank" rel="noopener">↗ 外部打开</a>
        </div>
      </div>
    </div>
  `

  document.body.appendChild(el)

  const searchInput = el.querySelector('#t-search')
  const searchBtn   = el.querySelector('#t-search-btn')

  searchBtn.addEventListener('click', () => doSearch(searchInput.value))
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(searchInput.value) })
  searchInput.addEventListener('focus', () => showSearchHistory())
  searchInput.addEventListener('blur', () => setTimeout(() => el.querySelector('#t-history').style.display = 'none', 200))
  el.querySelector('#t-clear-history').addEventListener('click', e => { e.stopPropagation(); clearSearchHistory(); renderSearchHistory() })
  el.querySelector('#t-player-close').addEventListener('click', closePlayer)
  el.querySelector('#t-player-overlay').addEventListener('click', e => { if (e.target === el.querySelector('#t-player-overlay')) closePlayer() })

  renderCatTabs()
  renderSrcTabs()
  if (getPlayHistory().length > 0 && cat !== 'live') showPlayHistory()
  else loadData()

  return el

  // ── 搜索 ──
  function doSearch(q) {
    query = q.trim()
    if (!query) return
    addSearchHistory(query)
    page = 1
    hideHistory()
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

  function hideHistory() {
    el.querySelector('#t-history').style.display = 'none'
  }

  // ── 播放历史 ──
  function showPlayHistory() {
    const h = getPlayHistory().slice(0, 12)
    const content = el.querySelector('#t-content')
    if (!h.length) { loadData(); return }

    let html = '<div style="margin-bottom:16px">'
    html += '<div class="tvbox-history-label" style="color:#555;font-size:11px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">最近播放 <button class="tvbox-history-clear" id="t-clear-play" style="float:right">清除全部</button></div>'
    html += '<div class="tvbox-grid">'
    h.forEach(item => {
      const pct = item.duration > 0 ? Math.round((item.progress / item.duration) * 100) : 0
      const resumeLabel = pct > 95 ? '已看完' : pct > 2 ? '续▶ ' + pct + '%' : ''
      html += '<div class="tvbox-card has-resume" data-id="' + item.id + '" data-source="' + item.source + '" data-name="' + item.name + '" data-pic="' + item.pic + '" data-epname="' + (item.epName || '') + '" data-epurl="' + (item.epUrl || '') + '" data-progress="' + item.progress + '" data-duration="' + (item.duration || 0) + '">' +
        '<div class="tvbox-pic">' +
          '<img src="' + item.pic + '" alt="' + item.name + '" onerror="this.style.display=\'none\';this.parentElement.innerHTML=\'<span class=tvbox-placeholder>🎬</span>\'" />' +
          (resumeLabel ? '<span class="tvbox-resume-badge">' + resumeLabel + '</span>' : '') +
        '</div>' +
        '<div class="tvbox-info"><div class="tvbox-title">' + item.name + '</div><div class="tvbox-sub">' + (item.epName || '') + '</div></div>' +
      '</div>'
    })
    html += '</div></div>'
    content.innerHTML = html

    content.querySelector('#t-clear-play')?.addEventListener('click', e => { e.stopPropagation(); clearPlayHistory(); loadData() })
    content.querySelectorAll('.tvbox-card.has-resume').forEach(card => {
      card.addEventListener('click', () => {
        const d = card.dataset
        openResumePlayer(d.name, d.pic, d.id, d.epname, d.epurl, parseFloat(d.progress), parseFloat(d.duration))
      })
    })
  }

  function openResumePlayer(name, pic, id, epName, epUrl, progress, duration) {
    const overlay = el.querySelector('#t-player-overlay')
    const body = el.querySelector('#t-player-body')
    el.querySelector('#t-player-title').textContent = name + (epName ? ' ' + epName : '')
    el.querySelector('#t-ext-link').href = epUrl || '#'
    body.innerHTML = '<div style="text-align:center;padding:40px;color:#6b6b8a">正在加载...</div>'
    overlay.style.display = 'flex'
    if (!epUrl || epUrl === '#') { body.innerHTML = '<div style="text-align:center;padding:40px"><p style="color:#6b6b8a">暂无播放地址</p></div>'; return }
    const isM3u8 = epUrl.includes('.m3u8')
    const isMp4  = epUrl.includes('.mp4')
    if (isM3u8 || isMp4) loadVideoPlayer(epUrl, isM3u8, progress)
    else body.innerHTML = '<div class="tvbox-iframe-wrap"><iframe src="' + epUrl + '" allowfullscreen allow="autoplay; fullscreen" style="width:100%;height:100%;border:none"></iframe></div>'
  }

  // ── 分类 Tab ──
  function renderCatTabs() {
    const container = el.querySelector('#t-cat-tabs')
    container.innerHTML = CATEGORIES.map(c =>
      '<button class="tvbox-tab ' + (c.id === cat ? 'active' : '') + '" data-id="' + c.id + '">' + c.name + '</button>'
    ).join('')
    container.querySelectorAll('.tvbox-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        cat = btn.dataset.id
        page = 1
        query = ''
        searchInput.value = ''
        hideHistory()
        renderCatTabs()
        renderSrcTabs()
        if (cat === 'live') loadData()
        else if (getPlayHistory().length > 0 && !query) showPlayHistory()
        else loadData()
      })
    })
  }

  // ── 源 Tab ──
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

  // ── 主加载 ──
  function loadData() {
    const content = el.querySelector('#t-content')
    content.innerHTML = '<div class="tvbox-loading">加载中...</div>'
    try {
      if (cat === 'live') loadLive()
      else if (query) loadSearch()
      else loadList()
    } catch (e) {
      content.innerHTML = '<div class="tvbox-empty">加载失败: ' + e.message + '</div>'
    }
  }

  // ── VOD 列表 ──
  async function loadList() {
    const source = VOD_SOURCES[src]
    const catObj = CATEGORIES.find(c => c.id === cat)
    const json = await fetchJSON(source.api + '?ac=list&t=' + catObj.typeId + '&pg=' + page)
    renderVodGrid(json.list || [], json.total || 0)
  }

  // ── VOD 搜索 — 尝试 zm= 再尝试 wd= ──
  async function loadSearch() {
    const source = VOD_SOURCES[src]
    const q = encodeURIComponent(query)
    let json = { list: [], total: 0 }
    try { json = await fetchJSON(source.api + '?ac=detail&zm=' + q + '&pg=' + page) } catch {}
    if (!json.list || json.list.length === 0) {
      try { json = await fetchJSON(source.api + '?ac=detail&wd=' + q + '&pg=' + page) } catch {}
    }
    renderVodGrid(json.list || [], json.total || 0)
  }

  // ── VOD 网格 ──
  function renderVodGrid(list, total) {
    const content = el.querySelector('#t-content')
    if (!list.length) { content.innerHTML = '<div class="tvbox-empty">暂无数据，请尝试其他分类</div>'; return }
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
          '<img src="' + item.vod_pic + '" alt="' + item.vod_name + '" onerror="this.style.display=\'none\';this.parentElement.innerHTML=\'<span class=tvbox-placeholder>🎬</span>\'" />' +
          '<span class="tvbox-tag">' + (item.type_name || '影视') + '</span>' +
          (item.vod_score ? '<span class="tvbox-score">' + item.vod_score + '</span>' : '') +
          (resumeLabel ? '<span class="tvbox-resume-badge">' + resumeLabel + '</span>' : '') +
        '</div>' +
        '<div class="tvbox-info"><div class="tvbox-title">' + item.vod_name + '</div><div class="tvbox-sub">' + (item.vod_actor || '未知主演') + '</div></div>' +
      '</div>'
    }).join('')
    html += '</div>'
    if (totalPages > 1) html += renderPagination(page, totalPages)
    content.innerHTML = html

    content.querySelectorAll('.tvbox-card').forEach(card => {
      card.addEventListener('click', () => openDetail(card.dataset.id, card.dataset.name, card.dataset.source, card.dataset.pic))
    })
    content.querySelectorAll('.tvbox-page-btn[data-page]').forEach(btn => {
      btn.addEventListener('click', () => { page = parseInt(btn.dataset.page); hideHistory(); loadData() })
    })
  }

  // ── TV 直播加载 ──
  async function loadLive() {
    const source = TV_SOURCES[src]
    const content = el.querySelector('#t-content')
    content.innerHTML = '<div class="tvbox-loading">正在加载 ' + source.name + '...</div>'
    let data = tvCache[src]
    if (!data) {
      try {
        data = await fetchJSON(source.url)
        tvCache[src] = data
      } catch (e) {
        content.innerHTML = '<div class="tvbox-empty">加载失败: ' + e.message + '<br><br>接口: ' + source.url + '</div>'
        return
      }
    }
    renderTvGrid(data)
  }

  // ── TV 网格渲染 — 支持多种 JSON 格式 ──
  function renderTvGrid(data) {
    const content = el.querySelector('#t-content')
    if (!data || (Array.isArray(data) && data.length === 0)) {
      content.innerHTML = '<div class="tvbox-empty">该接口暂无数据</div>'
      return
    }

    // 格式A: 分类格式 [{name:"央视频道",channels:[{name:"CCTV1",url:"..."}]}]
    if (Array.isArray(data) && data[0] && data[0].channels) {
      content.innerHTML = data.filter(cat => cat.name && cat.channels && cat.channels.length).slice(0, 20).map(cat => {
        let chHtml = cat.channels.slice(0, 48).map(ch =>
          '<div class="tvbox-ch-item" data-url="' + (ch.url || ch.play_url || '#') + '" data-name="' + (ch.name || ch.title || '未知') + '">' +
            '<span>📺</span><span class="tvbox-ch-name">' + (ch.name || ch.title || '未知') + '</span>' +
          '</div>'
        ).join('')
        return '<div class="tvbox-cat-block">' +
          '<div class="tvbox-cat-title">' + cat.name + '</div>' +
          '<div class="tvbox-ch-grid">' + chHtml + '</div>' +
        '</div>'
      }).join('')
      bindTvItems()
      return
    }

    // 格式B: 扁平数组 [{name:"CCTV1",url:"..."}]
    if (Array.isArray(data) && data[0] && data[0].name && (data[0].url || data[0].play_url)) {
      const grouped = {}
      data.forEach(ch => {
        const u = ch.url || ch.play_url
        if (!u) return
        const group = (ch.name || '未知').slice(0, 2)
        if (!grouped[group]) grouped[group] = []
        grouped[group].push(ch)
      })
      content.innerHTML = Object.entries(grouped).slice(0, 20).map(([gname, channels]) => {
        let chHtml = channels.slice(0, 48).map(ch =>
          '<div class="tvbox-ch-item" data-url="' + (ch.url || ch.play_url) + '" data-name="' + (ch.name || '未知') + '">' +
            '<span>📺</span><span class="tvbox-ch-name">' + (ch.name || '未知') + '</span>' +
          '</div>'
        ).join('')
        return '<div class="tvbox-cat-block">' +
          '<div class="tvbox-cat-title">' + gname + '</div>' +
          '<div class="tvbox-ch-grid">' + chHtml + '</div>' +
        '</div>'
      }).join('')
      bindTvItems()
      return
    }

    // 格式C: {urls:[...]} 包裹格式
    if (data.urls && Array.isArray(data.urls)) {
      renderTvGrid(data.urls)
      return
    }

    content.innerHTML = '<div class="tvbox-empty">数据格式不支持，尝试其他接口</div>'
  }

  function bindTvItems() {
    const content = el.querySelector('#t-content')
    content.querySelectorAll('.tvbox-ch-item').forEach(node => {
      node.addEventListener('click', () => {
        const url = node.dataset.url
        if (url && url !== '#') openPlayerTv(node.dataset.name, url)
        else alert('该频道暂无播放地址')
      })
    })
  }

  // ── TV 播放器 ──
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
    else body.innerHTML = '<div class="tvbox-iframe-wrap"><iframe src="' + url + '" allowfullscreen allow="autoplay; fullscreen" style="width:100%;height:100%;border:none"></iframe></div>'
  }

  // ── 影片详情 ──
  async function openDetail(id, name, sourceName, pic) {
    const source = VOD_SOURCES[src]
    const content = el.querySelector('#t-content')
    content.innerHTML = '<div class="tvbox-loading">加载中...</div>'
    let json
    try { json = await fetchJSON(source.api + '?ac=detail&ids=' + id) } catch { json = { list: null } }
    const item = json.list && json.list[0]
    if (!item) { content.innerHTML = '<div class="tvbox-empty">未找到该影片</div>'; return }
    showEpisodePicker(item, source.name)
  }

  // ── 选集 ──
  function showEpisodePicker(item, sourceName) {
    const overlay = el.querySelector('#t-player-overlay')
    const body = el.querySelector('#t-player-body')
    el.querySelector('#t-player-title').textContent = item.vod_name
    el.querySelector('#t-ext-link').href = '#'
    const episodes = parsePlaylist(item.vod_play_from, item.vod_play_url)
    const hist = getPlayHistory().find(h => h.id == item.vod_id && h.source === sourceName)
    playingEp = null

    const firstUrls = episodes[0]?.urls || []
    const siHtml = episodes.length > 1
      ? '<div style="margin-bottom:10px"><span class="tvbox-ep-list-title">选择源：</span>' +
          episodes.map((e, i) => '<button class="tvbox-tab ' + (i===0?'active':'') + '" style="margin-right:6px;margin-bottom:6px" data-si="' + i + '">' + e.name + '</button>').join('') +
        '</div>'
      : ''

    body.innerHTML =
      '<div class="tvbox-ep-info">' +
        '<img src="' + item.vod_pic + '" class="tvbox-ep-pic" onerror="this.style.display=\'none\'" />' +
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

    body.querySelectorAll('[data-si]').forEach(btn => {
      btn.addEventListener('click', () => {
        const si = parseInt(btn.dataset.si)
        const eps = episodes[si]?.urls || []
        const grid = body.querySelector('#t-ep-grid')
        grid.innerHTML = eps.map((ep, i) =>
          '<button class="tvbox-ep-btn" data-url="' + ep.url + '" data-name="' + item.vod_name + ' ' + ep.name + '" ' +
            'data-epname="' + ep.name + '" data-pic="' + item.vod_pic + '" ' +
            'data-id="' + item.vod_id + '" data-source="' + sourceName + '">' + ep.name + '</button>'
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

  // ── VOD 播放器 ──
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
    else body.innerHTML = '<div class="tvbox-iframe-wrap"><iframe src="' + url + '" allowfullscreen allow="autoplay; fullscreen" style="width:100%;height:100%;border:none"></iframe></div>'
  }

  // ── 视频播放器（HLS/mp4）─
  async function loadVideoPlayer(videoUrl, isM3u8, startProgress) {
    const body = el.querySelector('#t-player-body')
    if (isM3u8) {
      await ensureHls()
      if (window.Hls && window.Hls.isSupported()) {
        const wrap = document.createElement('div')
        wrap.className = 'tvbox-video-wrap'
        const video = document.createElement('video')
        video.controls = true
        wrap.appendChild(video)
        body.innerHTML = ''
        body.appendChild(wrap)
        const hls = new window.Hls()
        hls.loadSource(videoUrl)
        hls.attachMedia(video)
        hls.on(window.Hls.Events.ERROR, () => {
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
      const wrap = document.createElement('div')
      wrap.className = 'tvbox-video-wrap'
      const video = document.createElement('video')
      video.controls = true
      wrap.appendChild(video)
      body.innerHTML = ''
      body.appendChild(wrap)
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

  // ── 解析播放列表 ──
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
