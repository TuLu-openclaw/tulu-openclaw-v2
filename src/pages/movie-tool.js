/**
 * 屠戮影视 - 影视点播 + 电视直播
 * VOD: 量子资源 (cj.lziapi.com)
 * TV: rihou.cc:555 (gggg.nzk)
 * 2026-04-12 v7
 */

import '../style/movie-tool.css'

const VOD_SOURCES = [
  { name: '量子资源', api: 'https://cj.lziapi.com/api.php/provide/vod' },
]

const TV_SOURCES = [
  { name: 'rihou 国内海外', api: 'http://rihou.cc:555/gggg.nzk' },
]

const CATEGORIES = [
  { id: 'movie',   name: '电影',   typeId: '1' },
  { id: 'tv',      name: '电视剧', typeId: '2' },
  { id: 'variety', name: '综艺',   typeId: '3' },
  { id: 'anime',   name: '动漫',   typeId: '4' },
  { id: 'short',   name: '短剧',   typeId: '5' },
  { id: 'live',    name: '电视直播', typeId: '' },
]

const HLS_CDN = './hls.min.js'
const KEY_SEARCH = 'tulu_vod_search'
const KEY_PLAY   = 'tulu_vod_play'

let cat = ''
let src = 0
let page = 1
let query = ''
let tvCache = {}
let playingEp = null
let _el = null
let _viewStack = []

// ── 历史记录 ──
function getSearchHistory() {
  try { return JSON.parse(localStorage.getItem(KEY_SEARCH) || '[]') } catch { return [] }
}
function saveSearchHistory(list) { localStorage.setItem(KEY_SEARCH, JSON.stringify(list)) }
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
function savePlayHistory(list) { localStorage.setItem(KEY_PLAY, JSON.stringify(list)) }
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
async function fetchJSON(url) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!resp.ok) throw new Error('HTTP ' + resp.status)
  return resp.json()
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

export default function render() {
  const el = document.createElement('div')
  el.className = 'tvbox-page-root'
  _el = el
  _viewStack = []
  document.body.appendChild(el)
  initApp(el)
  return el
}

function initApp(el) {
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
          '<img src="' + item.pic + '" alt="' + item.name + '" onerror="this.style.display=\'none\';this.parentElement.innerHTML=\'<span class=tvbox-placeholder>🎬</span>\'" />' +
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
    else body.innerHTML = '<div class="tvbox-iframe-wrap"><iframe src="' + epUrl + '" allowfullscreen allow="autoplay; fullscreen" style="width:100%;height:100%;border:none"></iframe></div>'
  }

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
      else if (query) loadSearch()
      else loadList()
    } catch (e) {
      content.innerHTML = '<div class="tvbox-empty">加载失败: ' + e.message + '</div>'
    }
  }

    async function loadList() {
    const source = VOD_SOURCES[src]
    const catObj = CATEGORIES.find(c => c.id === cat)
    let json = { list: [], total: 0 }
    // cat is empty = show all content using ac=detail (no type filter)
    if (!cat || cat === 'live') {
      // Show all VOD content without type filter
      try { json = await fetchJSON(source.api + '?ac=detail&pg=' + page) } catch {}
      if (!json.list) { try { json = await fetchJsonp(source.api + '?ac=detail&pg=' + page) } catch {} }
    } else {
      // Filter by specific category type
      try { json = await fetchJSON(source.api + '?ac=list&t=' + catObj.typeId + '&pg=' + page) } catch {}
      if (!json.list) { try { json = await fetchJsonp(source.api + '?ac=list&t=' + catObj.typeId + '&pg=' + page) } catch {} }
    }
    renderVodGrid(json.list || [], json.total || 0)
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
        '<div class="tvbox-ch-item" data-url="' + ch.url + '" data-name="' + ch.name + '">' +
          '<span>📺</span><span class="tvbox-ch-name">' + ch.name + '</span>' +
        '</div>'
      ).join('')
      return '<div class="tvbox-cat-block">' +
        '<div class="tvbox-cat-title">' + cat.name + ' (' + cat.channels.length + ')</div>' +
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
    else body.innerHTML = '<div class="tvbox-iframe-wrap"><iframe src="' + url + '" allowfullscreen allow="autoplay; fullscreen" style="width:100%;height:100%;border:none"></iframe></div>'
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
