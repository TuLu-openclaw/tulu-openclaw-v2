/**
 * 影视大全 - TVBox 风格
 * 电视直播 + 电影/电视剧/综艺/动漫/短剧点播
 */

import '../style/movie-tool.css'

const API_BASE = 'https://api.mmkkapi.com/api.php/provide/vod'

const HLS_CDN = './hls.min.js'

const VOD_SOURCES = [
  { name: '🌺量子资源', api: 'https://cj.lziapi.com/api.php/provide/vod' },
  { name: '🌺暴风资源', api: 'https://bfzyapi.com/api.php/provide/vod' },
  { name: '🌺天涯资源', api: 'https://tyyszy.com/api.php/provide/vod' },
]

const TV_SOURCES = [
  { name: '💫林中小屋', url: 'https://gitee.com/lzxw66/lzxw9/raw/master/Ace' },
  { name: '🐼肥猫', url: 'http://肥猫.com/' },
  { name: '🤓OK', url: 'https://10352.kstore.vip/tv' },
  { name: '🐂王二小', url: 'https://9280.kstore.vip/newwex.json' },
  { name: '👽饭太硬', url: 'https://www.饭太硬.com/tv' },
  { name: '👿小米', url: 'https://cnb.cool/xiaomideyun/xiaomideyun/-/git/raw/main/mi.json' },
  { name: '🍎南风', url: 'https://gh-proxy.com/https://raw.githubusercontent.com/yoursmile66/TVBox/main/XC.json' },
  { name: '🍅香雅情', url: 'https://gh-proxy.com/https://raw.githubusercontent.com/xyq254245/xyqonlinerule/main/XYQTVBox.json' },
]

const CATEGORIES = [
  { id: 'movie',   name: '电影',   typeId: '1' },
  { id: 'tv',      name: '电视剧', typeId: '2' },
  { id: 'variety', name: '综艺',   typeId: '3' },
  { id: 'anime',   name: '动漫',   typeId: '4' },
  { id: 'short',   name: '短剧',   typeId: '5' },
  { id: 'live',    name: '电视直播', typeId: '' },
]

export default function render() {
  let cat = 'movie'
  let src = 0
  let page = 1
  let query = ''
  let tvCache = {}
  // 缓存搜索结果（搜索返回完整详情数据，直接复用）
  let searchCache = []

  const el = document.createElement('div')
  el.className = 'tvbox-page-root'

  el.innerHTML = `
    <div class="tvbox-page">
      <div class="tvbox-sidebar">
        <div class="tvbox-logo">🎬 影视大全</div>
        <div class="tvbox-cats" id="t-sidebar"></div>
        <div class="tvbox-sources" id="t-sources"></div>
      </div>
      <div class="tvbox-main">
        <div class="tvbox-toolbar">
          <div class="tvbox-search">
            <input type="text" id="t-search" placeholder="搜索影视..." />
            <button class="tvbox-page-btn" id="t-search-btn">🔍</button>
          </div>
          <div class="tvbox-src-tabs" id="t-src-tabs"></div>
        </div>
        <div class="tvbox-content" id="t-content">
          <div class="tvbox-loading" id="t-loading">加载中...</div>
        </div>
      </div>
    </div>
    <div class="tvbox-player-overlay" id="t-player-overlay" style="display:none">
      <div class="tvbox-player-box">
        <div class="tvbox-player-header">
          <span id="t-player-title">播放中</span>
          <button class="tvbox-player-close" id="t-player-close">✕</button>
        </div>
        <div class="tvbox-player-body" id="t-player-body">
          <div class="tvbox-player-loading">正在加载播放器...</div>
        </div>
        <div class="tvbox-player-url-bar" id="t-player-url-bar"></div>
      </div>
    </div>
  `

  // ── 分类侧边栏 ──
  function renderCats() {
    const sidebar = el.querySelector('#t-sidebar')
    sidebar.innerHTML = CATEGORIES.map(c => `
      <div class="tvbox-cat ${c.id === cat ? 'active' : ''}" data-id="${c.id}">
        <span>${c.name}</span>
      </div>
    `).join('')
    sidebar.querySelectorAll('.tvbox-cat').forEach(node => {
      node.addEventListener('click', () => {
        cat = node.dataset.id
        page = 1
        query = ''
        el.querySelector('#t-search').value = ''
        renderCats()
        renderSrcTabs()
        loadData()
      })
    })
  }

  // ── 源标签 ──
  function renderSrcTabs() {
    const container = el.querySelector('#t-src-tabs')
    const list = cat === 'live' ? TV_SOURCES : VOD_SOURCES
    container.innerHTML = list.map((s, i) => `
      <button class="tvbox-src-tab ${i === src ? 'active' : ''}" data-idx="${i}">${s.name}</button>
    `).join('')
    container.querySelectorAll('.tvbox-src-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        src = parseInt(btn.dataset.idx)
        page = 1
        renderSrcTabs()
        loadData()
      })
    })
  }

  // ── 加载数据 ──
  async function loadData() {
    const content = el.querySelector('#t-content')
    content.innerHTML = '<div class="tvbox-loading" id="t-loading">加载中...</div>'
    try {
      if (cat === 'live') await loadLive()
      else if (query) await loadSearch()
      else await loadList()
    } catch (e) {
      content.innerHTML = `<div class="tvbox-empty">加载失败: ${e.message}</div>`
    }
  }

  // ── 点播列表 ──
  async function loadList() {
    const source = VOD_SOURCES[src]
    const catObj = CATEGORIES.find(c => c.id === cat)
    const json = await fetchJSON(`${source.api}?ac=list&t=${catObj.typeId}&pg=${page}`)
    renderVodGrid(json.list || [], json.total || 0)
  }

  // ── 搜索 ──
  async function loadSearch() {
    const source = VOD_SOURCES[src]
    const json = await fetchJSON(`${source.api}?ac=detail&wd=${encodeURIComponent(query)}&pg=${page}`)
    searchCache = json.list || []
    renderVodGrid(json.list || [], json.total || 0)
  }

  // ── 点播网格 ──
  function renderVodGrid(list, total) {
    const content = el.querySelector('#t-content')
    if (!list.length) {
      content.innerHTML = '<div class="tvbox-empty">暂无数据</div>'
      return
    }
    const totalPages = Math.max(1, Math.ceil(total / 20))
    let html = '<div class="tvbox-grid">'
    html += list.map(function(item) {
      return '<div class="tvbox-card" data-id="' + String(item.vod_id) + '" data-name="' + String(item.vod_name || '').replace(/"/g, '&quot;') + '">' +
        '<div class="tvbox-pic">' +
        '<img src="' + String(item.vod_pic || '').replace(/"/g, '&quot;') + '" alt="' + String(item.vod_name || '').replace(/"/g, '&quot;') + '"' +
        ' onerror="this.style.display=\'none\';this.parentElement.innerHTML=\'<span class=tvbox-placeholder>🎬</span>\'" />' +
        '<span class="tvbox-tag">' + String(item.type_name || '影视').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>' +
        (item.vod_score ? '<span class="tvbox-score">' + String(item.vod_score).replace(/</g, '&lt;') + '</span>' : '') +
        '</div>' +
        '<div class="tvbox-info">' +
        '<div class="tvbox-title">' + String(item.vod_name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>' +
        '<div class="tvbox-sub">' + String(item.vod_actor || '未知主演').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>' +
        '</div></div>';
    }).join('')
    html += '</div>'
    html += renderPagination(page, totalPages)
    content.innerHTML = html
    var cards = content.querySelectorAll('.tvbox-card')
    cards.forEach(function(card, idx) {
      card._vodData = list[idx]
      card.addEventListener('click', function() {
        var id = card.dataset.id
        var cached = searchCache.find(function(item) { return String(item.vod_id) === String(id); })
        if (cached) { openDetailByItem(cached); return; }
        if (card._vodData) { openDetailByItem(card._vodData); return; }
        openDetail(id, card.dataset.name)
      })
    })
    content.querySelectorAll('.tvbox-page-btn[data-page]').forEach(function(btn) {
      btn.addEventListener('click', function() { page = parseInt(btn.dataset.page); loadData(); })
    })
  }

  // ── 电视直播 ──
  async function loadLive() {
    const source = TV_SOURCES[src]
    el.querySelector('#t-loading').textContent = `加载 ${source.name}...`
    let data = tvCache[src]
    if (!data) {
      const resp = await fetch(source.url, { signal: AbortSignal.timeout(15000) })
      if (!resp.ok) throw new Error('HTTP ' + resp.status)
      data = await resp.json()
      tvCache[src] = data
    }
    renderTvGrid(data)
  }

  function renderTvGrid(data) {
    const content = el.querySelector('#t-content')
    if (!Array.isArray(data)) { content.innerHTML = '<div class="tvbox-empty">数据格式异常</div>'; return }
    const seen = new Set()
    const cats = data.filter(c => c.name && !seen.has(c.name) && seen.add(c.name))
    content.innerHTML = cats.slice(0, 12).map(catData => `
      <div class="tvbox-cat-block">
        <div class="tvbox-cat-title">${catData.name}</div>
        <div class="tvbox-ch-grid">
          ${(catData.channels || []).slice(0, 24).map(ch => `
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
        if (url && url !== '#') openPlayer(node.dataset.name, url)
        else alert('该频道暂无播放地址')
      })
    })
  }

  // ── 直接用已有数据打开详情 ──
  function openDetailByItem(item) {
    showEpisodePicker(item)
  }

  // ── 详情 / 选集 ──
  async function openDetail(id, name) {
    // 搜索结果已有完整数据（含 vod_play_url），直接复用
    const cached = searchCache.find(function(item) { return String(item.vod_id) === String(id); });
    if (cached && cached.vod_play_url) {
      showEpisodePicker(cached);
      return;
    }
    // 从列表点进来的尝试从当前渲染的 DOM 里找（部分数据已有）
    var cardEl = document.querySelector('.tvbox-card[data-id="' + id + '"]');
    if (cardEl && cardEl._vodData) {
      showEpisodePicker(cardEl._vodData);
      return;
    }
    // 兜底：请求详情（先试 ids=，再试 id=）
    const source = VOD_SOURCES[src];
    var json;
    try {
      var res1 = await fetchJSON(source.api + '?ac=detail&ids=' + id);
      if (res1.list && res1.list[0]) json = res1;
    } catch (_) {}
    if (!json) {
      try {
        var res2 = await fetchJSON(source.api + '?ac=detail&id=' + id);
        if (res2.list && res2.list[0]) json = res2;
      } catch (_) {}
    }
    if (!json || !json.list || !json.list[0]) { alert('获取详情失败'); return; }
    showEpisodePicker(json.list[0]);
  }

  function showEpisodePicker(item) {
    const overlay = el.querySelector('#t-player-overlay')
    const body = el.querySelector('#t-player-body')
    el.querySelector('#t-player-title').textContent = item.vod_name
    el.querySelector('#t-player-url-bar').innerHTML = ''
    const episodes = parsePlaylist(item.vod_play_from, item.vod_play_url)
    const firstUrls = episodes[0]?.urls || []
    body.innerHTML = `
      <div class="tvbox-ep-info">
        <img src="${item.vod_pic}" class="tvbox-ep-pic" onerror="this.style.display='none'" />
        <div class="tvbox-ep-desc">${item.vod_content || '暂无简介'}</div>
      </div>
      <div class="tvbox-ep-list-title">播放列表 ${firstUrls.length} 集</div>
      <div class="tvbox-ep-grid">
        ${firstUrls.map(ep => `
          <button class="tvbox-ep-btn" data-url="${ep.url}" data-name="${item.vod_name} ${ep.name}">${ep.name}</button>
        `).join('')}
      </div>
    `
    body.querySelectorAll('.tvbox-ep-btn').forEach(btn => {
      btn.addEventListener('click', () => openPlayer(btn.dataset.name, btn.dataset.url))
    })
    overlay.style.display = 'flex'
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

  // ── 播放器 ──
  function openPlayer(name, url) {
    if (!url || url === '#') { alert('暂无播放地址'); return }
    const overlay = el.querySelector('#t-player-overlay')
    const body = el.querySelector('#t-player-body')
    el.querySelector('#t-player-title').textContent = name
    el.querySelector('#t-player-url-bar').innerHTML = `<a href="${url}" target="_blank" class="tvbox-open-ext">↗ 外部打开</a>`
    body.innerHTML = '<div class="tvbox-player-loading">正在加载播放器...</div>'
    const isM3u8 = url.includes('.m3u8')
    const isMp4 = url.includes('.mp4')
    if (isM3u8 || isMp4) loadVideoPlayer(url, isM3u8)
    else {
      body.innerHTML = `<div class="tvbox-iframe-wrap"><iframe src="${url}" allowfullscreen allow="autoplay; fullscreen" style="width:100%;height:100%;border:none;border-radius:8px"></iframe></div>`
    }
    overlay.style.display = 'flex'
  }

  async function loadVideoPlayer(videoUrl, isM3u8) {
    const body = el.querySelector('#t-player-body')
    if (isM3u8) {
      await ensureHls()
      if (window.Hls && window.Hls.isSupported()) {
        const wrap = document.createElement('div')
        wrap.className = 'tvbox-video-wrap'
        const video = document.createElement('video')
        video.controls = true
        video.style = 'width:100%;height:100%'
        wrap.appendChild(video)
        body.innerHTML = ''
        body.appendChild(wrap)
        const hls = new window.Hls()
        hls.loadSource(videoUrl)
        hls.attachMedia(video)
        hls.on(window.Hls.Events.ERROR, () => {
          body.innerHTML = `<div style="text-align:center;padding:40px"><p style="color:#6b6b80;margin-bottom:14px">m3u8 播放失败</p><a href="${videoUrl}" target="_blank" class="tvbox-open-ext">↗ 在浏览器中打开</a></div>`
        })
        video.play().catch(() => {})
      } else {
        body.innerHTML = `<div style="text-align:center;padding:40px"><p style="color:#6b6b80;margin-bottom:14px">正在尝试播放...</p><a href="${videoUrl}" target="_blank" class="tvbox-open-ext">↗ 在浏览器中打开</a></div>`
      }
    } else {
      const wrap = document.createElement('div')
      wrap.className = 'tvbox-video-wrap'
      const video = document.createElement('video')
      video.controls = true
      video.style = 'width:100%;height:100%'
      video.src = videoUrl
      wrap.appendChild(video)
      body.innerHTML = ''
      body.appendChild(wrap)
      video.play().catch(() => {})
    }
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

  // ── 分页 ──
  function renderPagination(page, total) {
    if (total <= 1) return ''
    const prev = page > 1 ? page - 1 : 1
    const next = page < total ? page + 1 : total
    return `<div class="tvbox-pagination"><button class="tvbox-page-btn" data-page="${prev}">◀ 上一页</button><span class="tvbox-page-info">第 ${page} / ${total} 页</span><button class="tvbox-page-btn" data-page="${next}">下一页 ▶</button></div>`
  }

  // ── 搜索 ──
  el.querySelector('#t-search-btn').addEventListener('click', doSearch)
  el.querySelector('#t-search').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch() })
  function doSearch() { query = el.querySelector('#t-search').value.trim(); page = 1; loadData() }

  // ── 关闭播放器 ──
  el.querySelector('#t-player-close').addEventListener('click', closePlayer)
  el.querySelector('#t-player-overlay').addEventListener('click', e => { if (e.target === el.querySelector('#t-player-overlay')) closePlayer() })
  function closePlayer() {
    el.querySelector('#t-player-overlay').style.display = 'none'
    el.querySelector('#t-player-body').innerHTML = ''
  }

  // ── 工具 ──
  async function fetchJSON(url) {
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    return resp.json()
  }

  // ── 启动 ──
  renderCats()
  renderSrcTabs()
  loadData()

  return el
}
