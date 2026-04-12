/**
 * 屠戮影视 - 影视点播 + 电视直播
 * - 搜索历史 (localStorage)
 * - 播放历史 (localStorage，含播放进度)
 * - 续播功能
 */

import '../style/movie-tool.css'

// ── VOD 接口（点播：电影/剧集/综艺/动漫/短剧）─
const VOD_SOURCES = [
  { name: '🌺量子资源', api: 'https://cj.lziapi.com/api.php/provide/vod' },
  { name: '🌺暴风资源', api: 'https://bfzyapi.com/api.php/provide/vod' },
  { name: '🌺天涯资源', api: 'https://tyyszy.com/api.php/provide/vod' },
]

// ── TV 直播源 ──
const TV_SOURCES = [
  { name: '💫OK',          url: 'https://10352.kstore.vip/tv' },
  { name: '💫真心',        url: 'https://tvbox.catvod.com/FongMi.json' },
  { name: '💫饭太硬',      url: 'https://www.饭太硬.com/tv' },
  { name: '💫肥猫',        url: 'http://肥猫.com/' },
  { name: '💫天天开心',    url: 'http://rihou.cc:55/' },
  { name: '💫小米',        url: 'https://mitvbox.xyz/小米/DEMO.json' },
  { name: '💫摸鱼儿',      url: 'http://我不是.摸鱼儿.com' },
  { name: '💫讴歌',        url: 'https://欧歌.v.nxog.top/m' },
  { name: '💫PG',          url: 'https://tvbox.catvod.com/jsm.json' },
  { name: '💫多多',        url: 'https://yydsys.top/duo' },
  { name: '💫南风',        url: 'https://gh-proxy.com/https://raw.githubusercontent.com/yoursmile66/TVBox/main/XC.json' },
  { name: '💫王二小',      url: 'https://9280.kstore.vip/newwex.json' },
  { name: '💫巧技',        url: 'http://cdn.qiaoji8.com/tvbox.json' },
  { name: '💫星辰',        url: 'https://fmbox.cc' },
  { name: '💫林中小屋',    url: 'https://8815.kstore.vip/tvbox/Ace' },
  { name: '💫潇洒',        url: 'https://9877.kstore.space/AnotherD/api.json' },
  { name: '💫单仓',        url: 'https://gh.llkk.cc/https://raw.githubusercontent.com/tushen6/Tomorrow/master/tvbox.json' },
  { name: '💫多仓',        url: 'https://gh.llkk.cc/https://raw.githubusercontent.com/tushen6/Tomorrow/master/lmw.json' },
  { name: '💫虎斑',        url: 'http://hb.小虎斑.site:25252/' },
]

// ── 点播分类 ──
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

// ── localStorage 键 ─
const KEY_SEARCH = 'tulu_search_history'
const KEY_PLAY   = 'tulu_play_history'

// ── 状态 ──
let cat = 'movie'
let src = 0
let page = 1
let query = ''
let tvCache = {}
let playingEp = null  // 当前播放集信息

// ── 工具函数 ──
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
  // item: { id, name, pic, source, epName, epUrl, progress, duration, updatedAt }
  let h = getPlayHistory().filter(s => !(s.id === item.id && s.source === item.source))
  h.unshift(item)
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

// ── 主渲染 ──
export default function render() {
  const el = document.createElement('div')
  el.className = 'tvbox-page-root'

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

  // ── 搜索 ──
  const searchInput = el.querySelector('#t-search')
  const searchBtn   = el.querySelector('#t-search-btn')

  searchBtn.addEventListener('click', () => doSearch(searchInput.value))
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(searchInput.value) })
  searchInput.addEventListener('focus', () => showSearchHistory())
  searchInput.addEventListener('blur', () => setTimeout(() => el.querySelector('#t-history').style.display = 'none', 200))

  el.querySelector('#t-clear-history').addEventListener('click', e => {
    e.stopPropagation()
    clearSearchHistory()
    renderSearchHistory()
  })

  // ── 播放器关闭 ──
  el.querySelector('#t-player-close').addEventListener('click', closePlayer)
  el.querySelector('#t-player-overlay').addEventListener('click', e => {
    if (e.target === el.querySelector('#t-player-overlay')) closePlayer()
  })

  // ── 初始化 ──
  renderCatTabs()
  renderSrcTabs()
  showPlayHistory()

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
    if (!h.length) { el.querySelector('#t-history').style.display = 'none'; return }
    el.querySelector('#t-history').style.display = 'block'
    renderSearchHistory()
  }

  function renderSearchHistory() {
    const tags = el.querySelector('#t-history-tags')
    tags.innerHTML = getSearchHistory().map(s =>
      `<span class="tvbox-history-tag" data-q="${s}">${s}</span>`
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
    if (!h.length) { loadData(); return }
    const content = el.querySelector('#t-content')
    let html = '<div style="margin-bottom:16px">'
    html += '<div class="tvbox-history-label" style="color:#555;font-size:11px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">最近播放 <button class="tvbox-history-clear" id="t-clear-play">清除全部</button></div>'
    html += '<div class="tvbox-grid">'
    h.forEach(item => {
      const pct = item.duration > 0 ? Math.round((item.progress / item.duration) * 100) : 0
      const resumeLabel = pct > 95 ? '已看完' : pct > 2 ? `续▶ ${pct}%` : ''
      html += `
        <div class="tvbox-card has-resume" data-id="${item.id}" data-source="${item.source}" data-name="${item.name}" data-pic="${item.pic}" data-epname="${item.epName || ''}" data-epurl="${item.epUrl || ''}" data-progress="${item.progress}" data-duration="${item.duration || 0}">
          <div class="tvbox-pic">
            <img src="${item.pic}" alt="${item.name}" onerror="this.style.display='none';this.parentElement.innerHTML='<span class=tvbox-placeholder>🎬</span>'" />
            ${resumeLabel ? `<span class="tvbox-resume-badge">${resumeLabel}</span>` : ''}
          </div>
          <div class="tvbox-info">
            <div class="tvbox-title">${item.name}</div>
            <div class="tvbox-sub">${item.epName || ''}</div>
          </div>
        </div>`
    })
    html += '</div></div>'
    // 下方加载正常内容
    content.innerHTML = html

    // 清除全部
    content.querySelector('#t-clear-play')?.addEventListener('click', e => {
      e.stopPropagation()
      clearPlayHistory()
      loadData()
    })

    // 点击历史卡片
    content.querySelectorAll('.tvbox-card.has-resume').forEach(card => {
      card.addEventListener('click', () => {
        const { id, source, name, pic, epname, epurl, progress, duration } = card.dataset
        const srcIdx = VOD_SOURCES.findIndex(s => s.name === source)
        if (srcIdx >= 0) src = srcIdx
        openResumePlayer(name, pic, id, epname, epurl, parseFloat(progress), parseFloat(duration))
      })
    })
  }

  // ── 续播播放器 ──
  function openResumePlayer(name, pic, id, epName, epUrl, progress, duration) {
    const overlay = el.querySelector('#t-player-overlay')
    const body = el.querySelector('#t-player-body')
    const title = el.querySelector('#t-player-title')
    const extLink = el.querySelector('#t-ext-link')
    title.textContent = name + (epName ? ` ${epName}` : '')
    extLink.href = epUrl || '#'
    body.innerHTML = `<div style="text-align:center;padding:40px;color:#6b6b8a;font-size:13px">正在加载...</div>`
    overlay.style.display = 'flex'
    if (!epUrl || epUrl === '#') {
      body.innerHTML = `<div style="text-align:center;padding:40px"><p style="color:#6b6b8a;margin-bottom:14px">暂无播放地址</p></div>`
      return
    }
    const isM3u8 = epUrl.includes('.m3u8')
    const isMp4  = epUrl.includes('.mp4')
    if (isM3u8 || isMp4) loadVideoPlayer(epUrl, isM3u8, progress)
    else body.innerHTML = `<div class="tvbox-iframe-wrap"><iframe src="${epUrl}" allowfullscreen allow="autoplay; fullscreen" style="width:100%;height:100%;border:none"></iframe></div>`
  }

  // ── 分类 Tab ──
  function renderCatTabs() {
    const container = el.querySelector('#t-cat-tabs')
    container.innerHTML = CATEGORIES.map(c => `
      <button class="tvbox-tab ${c.id === cat ? 'active' : ''}" data-id="${c.id}">${c.name}</button>
    `).join('')
    container.querySelectorAll('.tvbox-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        cat = btn.dataset.id
        page = 1
        query = ''
        searchInput.value = ''
        hideHistory()
        renderCatTabs()
        renderSrcTabs()
        if (cat === 'live') {
          // 直播直接加载
          loadData()
        } else if (getPlayHistory().length && !query) {
          showPlayHistory()
        } else {
          loadData()
        }
      })
    })
  }

  // ── 源 Tab ──
  function renderSrcTabs() {
    const wrap = el.querySelector('#t-src-tabs-wrap')
    const container = el.querySelector('#t-src-tabs')
    const list = cat === 'live' ? TV_SOURCES : VOD_SOURCES
    wrap.style.display = cat === 'live' ? 'block' : 'block'
    container.innerHTML = list.map((s, i) => `
      <button class="tvbox-tab ${i === src ? 'active' : ''}" data-idx="${i}">${s.name}</button>
    `).join('')
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

  // ── 加载数据 ──
  function loadData() {
    const content = el.querySelector('#t-content')
    content.innerHTML = '<div class="tvbox-loading">加载中...</div>'
    try {
      if (cat === 'live') loadLive()
      else if (query) loadSearch()
      else loadList()
    } catch (e) {
      content.innerHTML = `<div class="tvbox-empty">加载失败: ${e.message}</div>`
    }
  }

  // ── 点播列表 ──
  async function loadList() {
    const source = VOD_SOURCES[src]
    const catObj = CATEGORIES.find(c => c.id === cat)
    const json = await fetchJSON(`${source.api}?ac=list&t=${catObj.typeId}&pg=${page}`)
    renderVodGrid(json.list || [], json.total || 0, source.name)
  }

  // ── 搜索 ──
  async function loadSearch() {
    const source = VOD_SOURCES[src]
    const json = await fetchJSON(`${source.api}?ac=detail&wd=${encodeURIComponent(query)}&pg=${page}`)
    renderVodGrid(json.list || [], json.total || 0, source.name)
  }

  // ── 点播网格 ──
  function renderVodGrid(list, total, sourceName) {
    const content = el.querySelector('#t-content')
    if (!list.length) {
      content.innerHTML = '<div class="tvbox-empty">暂无数据</div>'
      return
    }
    // 标注历史记录中的项目
    const history = getPlayHistory()
    const totalPages = Math.max(1, Math.ceil(total / 20))
    let html = '<div class="tvbox-grid">'
    html += list.map(item => {
      const histItem = history.find(h => h.id == item.vod_id && h.source === sourceName)
      const pct = histItem && histItem.duration > 0 ? Math.round((histItem.progress / histItem.duration) * 100) : 0
      const resumeLabel = pct > 95 ? '已看完' : pct > 2 ? `续▶ ${pct}%` : ''
      return `
        <div class="tvbox-card ${resumeLabel ? 'has-resume' : ''}" data-id="${item.vod_id}" data-source="${sourceName}" data-name="${item.vod_name}" data-pic="${item.vod_pic}">
          <div class="tvbox-pic">
            <img src="${item.vod_pic}" alt="${item.vod_name}" onerror="this.style.display='none';this.parentElement.innerHTML='<span class=tvbox-placeholder>🎬</span>'" />
            <span class="tvbox-tag">${item.type_name || '影视'}</span>
            ${item.vod_score ? `<span class="tvbox-score">${item.vod_score}</span>` : ''}
            ${resumeLabel ? `<span class="tvbox-resume-badge">${resumeLabel}</span>` : ''}
          </div>
          <div class="tvbox-info">
            <div class="tvbox-title">${item.vod_name}</div>
            <div class="tvbox-sub">${item.vod_actor || '未知主演'}</div>
          </div>
        </div>`
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

  // ── 电视直播 ──
  async function loadLive() {
    const source = TV_SOURCES[src]
    const content = el.querySelector('#t-content')
    content.innerHTML = `<div class="tvbox-loading">加载 ${source.name}...</div>`
    let data = tvCache[src]
    if (!data) {
      try {
        const resp = await fetch(source.url, { signal: AbortSignal.timeout(15000) })
        if (!resp.ok) throw new Error('HTTP ' + resp.status)
        data = await resp.json()
        tvCache[src] = data
      } catch (e) {
        content.innerHTML = `<div class="tvbox-empty">加载失败: ${e.message}</div>`
        return
      }
    }
    renderTvGrid(data)
  }

  function renderTvGrid(data) {
    const content = el.querySelector('#t-content')
    if (!Array.isArray(data)) { content.innerHTML = '<div class="tvbox-empty">数据格式异常</div>'; return }
    const seen = new Set()
    const cats = data.filter(c => c.name && !seen.has(c.name) && seen.add(c.name))
    content.innerHTML = cats.slice(0, 16).map(catData => `
      <div class="tvbox-cat-block">
        <div class="tvbox-cat-title">${catData.name}</div>
        <div class="tvbox-ch-grid">
          ${(catData.channels || []).slice(0, 36).map(ch => `
            <div class="tvbox-ch-item" data-url="${ch.url || ch.play_url || '#'}" data-name="${ch.name || ch.title || '未知'}">
              <span>📺</span><span class="tvbox-ch-name">${ch.name || ch.title || '未知'}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')
    content.querySelectorAll('.tvbox-ch-item').forEach(node => {
      node.addEventListener('click', () => {
        const url = node.dataset.url
        if (url && url !== '#') openPlayerTv(node.dataset.name, url)
        else alert('该频道暂无播放地址')
      })
    })
  }

  // ── 直播播放器 ──
  function openPlayerTv(name, url) {
    const overlay = el.querySelector('#t-player-overlay')
    const body = el.querySelector('#t-player-body')
    const title = el.querySelector('#t-player-title')
    const extLink = el.querySelector('#t-ext-link')
    title.textContent = '📺 ' + name
    extLink.href = url
    body.innerHTML = '<div class="tvbox-player-loading">正在加载...</div>'
    overlay.style.display = 'flex'
    const isM3u8 = url.includes('.m3u8')
    const isMp4  = url.includes('.mp4')
    if (isM3u8 || isMp4) loadVideoPlayer(url, isM3u8, 0)
    else body.innerHTML = `<div class="tvbox-iframe-wrap"><iframe src="${url}" allowfullscreen allow="autoplay; fullscreen" style="width:100%;height:100%;border:none"></iframe></div>`
  }

  // ── 详情 / 选集 ──
  async function openDetail(id, name, sourceName, pic) {
    const source = VOD_SOURCES[src]
    const content = el.querySelector('#t-content')
    content.innerHTML = '<div class="tvbox-loading">加载中...</div>'
    let json
    try { json = await fetchJSON(`${source.api}?ac=detail&ids=${id}`) }
    catch { alert('获取详情失败'); loadData(); return }
    const item = json.list && json.list[0]
    if (!item) { alert('未找到该影片'); loadData(); return }
    showEpisodePicker(item, source.name)
  }

  function showEpisodePicker(item, sourceName) {
    const overlay = el.querySelector('#t-player-overlay')
    const body = el.querySelector('#t-player-body')
    const title = el.querySelector('#t-player-title')
    const extLink = el.querySelector('#t-ext-link')
    title.textContent = item.vod_name
    extLink.href = '#'
    const episodes = parsePlaylist(item.vod_play_from, item.vod_play_url)
    // 找上一次看到哪一集
    const hist = getPlayHistory().find(h => h.id == item.vod_id && h.source === sourceName)
    playingEp = null

    const firstUrls = episodes[0]?.urls || []
    body.innerHTML = `
      <div class="tvbox-ep-info">
        <img src="${item.vod_pic}" class="tvbox-ep-pic" onerror="this.style.display='none'" />
        <div class="tvbox-ep-desc">${item.vod_content || '暂无简介'}</div>
      </div>
      ${episodes.length > 1 ? `<div style="margin-bottom:10px"><span class="tvbox-ep-list-title">选择源：${episodes.map((e,i) => `<button class="tvbox-tab ${i===0?'active':''}" style="margin-right:6px;margin-bottom:6px" data-si="${i}">${e.name}</button>`).join('')}</span></div>` : ''}
      <div class="tvbox-ep-list-title">播放列表 ${firstUrls.length} 集</div>
      <div class="tvbox-ep-grid" id="t-ep-grid">
        ${firstUrls.map((ep, i) => {
          const isResume = hist && hist.epName === ep.name
          return `<button class="tvbox-ep-btn ${isResume ? 'playing' : ''}" data-url="${ep.url}" data-name="${item.vod_name} ${ep.name}" data-epname="${ep.name}" data-pic="${item.vod_pic}" data-id="${item.vod_id}" data-source="${sourceName}">${isResume ? '▶ ' : ''}${ep.name}</button>`
        }).join('')}
      </div>
    `

    // 切换源
    body.querySelectorAll('[data-si]').forEach(btn => {
      btn.addEventListener('click', () => {
        const si = parseInt(btn.dataset.si)
        const eps = episodes[si]?.urls || []
        const grid = body.querySelector('#t-ep-grid')
        grid.innerHTML = eps.map((ep, i) => `<button class="tvbox-ep-btn" data-url="${ep.url}" data-name="${item.vod_name} ${ep.name}" data-epname="${ep.name}" data-pic="${item.vod_pic}" data-id="${item.vod_id}" data-source="${sourceName}">${ep.name}</button>`).join('')
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
          // 记录到播放历史
          upsertPlayHistory({
            id: btn.dataset.id,
            name: btn.dataset.name,
            pic: btn.dataset.pic,
            source: btn.dataset.source,
            epName: btn.dataset.epname,
            epUrl: btn.dataset.url,
            progress: 0,
            duration: 0,
            updatedAt: Date.now()
          })
          openPlayerVod(btn.dataset.name, btn.dataset.url, btn.dataset.id, btn.dataset.source, btn.dataset.epname, btn.dataset.pic)
        })
      })
    }
  }

  // ── 点播播放器（含进度记录）─
  function openPlayerVod(name, url, id, source, epName, pic) {
    const overlay = el.querySelector('#t-player-overlay')
    const body = el.querySelector('#t-player-body')
    const title = el.querySelector('#t-player-title')
    const extLink = el.querySelector('#t-ext-link')
    title.textContent = name
    extLink.href = url
    playingEp = { id, source, epName, pic }
    body.innerHTML = '<div class="tvbox-player-loading">正在加载...</div>'
    overlay.style.display = 'flex'
    if (!url || url === '#') {
      body.innerHTML = `<div style="text-align:center;padding:40px"><p style="color:#6b6b8a">暂无播放地址</p></div>`
      return
    }
    const isM3u8 = url.includes('.m3u8')
    const isMp4  = url.includes('.mp4')
    if (isM3u8 || isMp4) loadVideoPlayer(url, isM3u8, 0)
    else body.innerHTML = `<div class="tvbox-iframe-wrap"><iframe src="${url}" allowfullscreen allow="autoplay; fullscreen" style="width:100%;height:100%;border:none"></iframe></div>`
  }

  // ── 视频播放器 ──
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
          body.innerHTML = `<div style="text-align:center;padding:40px"><p style="color:#6b6b80;margin-bottom:14px">m3u8 播放失败</p><a href="${videoUrl}" target="_blank" class="tvbox-open-ext">↗ 在浏览器中打开</a></div>`
        })
        // 进度记录
        video.addEventListener('timeupdate', () => trackProgress(video))
        video.addEventListener('ended', () => markFinished())
        if (startProgress > 0) video.currentTime = startProgress
        video.play().catch(() => {})
      } else {
        body.innerHTML = `<div style="text-align:center;padding:40px"><p style="color:#6b6b80;margin-bottom:14px">正在尝试播放...</p><a href="${videoUrl}" target="_blank" class="tvbox-open-ext">↗ 在浏览器中打开</a></div>`
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
    if (pct > 1) {
      updatePlayProgress(playingEp.id, playingEp.source, video.currentTime)
    }
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

  // ── 关闭播放器 ──
  function closePlayer() {
    playingEp = null
    el.querySelector('#t-player-overlay').style.display = 'none'
    el.querySelector('#t-player-body').innerHTML = ''
  }

  // ── 分页 ──
  function renderPagination(page, total) {
    if (total <= 1) return ''
    const prev = page > 1 ? page - 1 : 1
    const next = page < total ? page + 1 : total
    return `<div class="tvbox-pagination"><button class="tvbox-page-btn" data-page="${prev}">◀ 上一页</button><span class="tvbox-page-info">第 ${page} / ${total} 页</span><button class="tvbox-page-btn" data-page="${next}">下一页 ▶</button></div>`
  }

  // ── 解析播放列表 ──
  function parsePlaylist(from, url) {
    if (!url) return []
    const sources = []
    url.split('$$$').forEach((part, i) => {
      const name = (from || '').split('$$$')[i] || `源${i + 1}`
      sources.push({
        name,
        urls: part.split('#').map(p => {
          const [n, u] = p.split('$')
          return { name: n || '未知', url: u || '' }
        }).filter(ep => ep.url)
      })
    })
    return sources
  }
}
