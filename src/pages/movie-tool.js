/**
 * 屠戮影视 - 完整 TVBox 风格
 * 支持：电视直播 + 电影/电视剧/综艺/动漫点播
 */

const VOD_API = 'https://api.mmkkapi.com/api.php/provide/vod'

// 引入 hls.js（m3u8 流媒体播放）
const HLS_JS = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js'

// 点播数据源（备用）
const VOD_SOURCES = [
  { name: '🥬影视仓库', api: 'https://api.mmkkapi.com/api.php/provide/vod', icon: '🎬' },
  { name: '🥒备用线路', api: 'https://w接口1.com/api.php/provide/vod', icon: '🎞️' },
]

// 直播 TVBox 源
const TV_SOURCES = [
  { name: '💫林中小屋', url: 'https://gitee.com/lzxw66/lzxw9/raw/master/Ace', icon: '🏠' },
  { name: '🐼肥猫', url: 'http://肥猫.com/', icon: '🐱' },
  { name: '🤓OK', url: 'https://10352.kstore.vip/tv', icon: '✅' },
  { name: '🐂王二小', url: 'https://9280.kstore.vip/newwex.json', icon: '🐂' },
  { name: '👽饭太硬', url: 'https://www.饭太硬.com/tv', icon: '👽' },
  { name: '👿小米', url: 'https://cnb.cool/xiaomideyun/xiaomideyun/-/git/raw/main/mi.json', icon: '👿' },
  { name: '🍎南风', url: 'https://gh-proxy.com/https://raw.githubusercontent.com/yoursmile66/TVBox/main/XC.json', icon: '🍎' },
  { name: '🍅香雅情', url: 'https://gh-proxy.com/https://raw.githubusercontent.com/xyq254245/xyqonlinerule/main/XYQTVBox.json', icon: '🍅' },
  { name: '🌈欧歌', url: 'https://欧歌.v.nxog.top/m/', icon: '🌈' },
  { name: '⚪PG', url: 'https://www.252035.xyz/p/jsm.json', icon: '⚪' },
  { name: '🌱真心', url: 'https://www.252035.xyz/z/FongMi.json', icon: '🌱' },
]

const CLASSES = [
  { id: 'movie', name: '电影', icon: '🎬' },
  { id: 'tv', name: '电视剧', icon: '📺' },
  { id: 'variety', name: '综艺', icon: '🎭' },
  { id: 'anime', name: '动漫', icon: '🅰️' },
  { id: 'short', name: '短剧', icon: '🎯' },
  { id: 'live', name: '电视直播', icon: '📡' },
]

export default function render(el) {
  injectStyles(el)

  el.innerHTML = `
    <div class="vm-page">
      <div class="vm-sidebar">
        <div class="vm-logo">🎬 屠戮影视</div>
        <div class="vm-classes" id="vm-classes"></div>
        <div class="vm-sources" id="vm-sources"></div>
      </div>
      <div class="vm-main">
        <div class="vm-toolbar">
          <div class="vm-search-box">
            <input type="text" id="vm-search-input" placeholder="搜索电影、电视剧、综艺..." class="vm-search-input">
            <button id="vm-search-btn" class="vm-btn vm-btn-primary">🔍</button>
          </div>
          <div class="vm-source-tabs" id="vm-source-tabs"></div>
        </div>
        <div id="vm-content" class="vm-content">
          <div class="vm-loading" id="vm-loading">加载中...</div>
          <div class="vm-grid" id="vm-grid"></div>
          <div class="vm-pagination" id="vm-pagination"></div>
        </div>
      </div>
      <div class="vm-player-overlay" id="vm-player-overlay" style="display:none">
        <div class="vm-player-box">
          <div class="vm-player-header">
            <span id="vm-player-title">播放中</span>
            <button class="vm-player-close" id="vm-player-close">✕</button>
          </div>
          <div class="vm-player-body" id="vm-player-body">
            <div class="vm-player-loading">正在加载播放器...</div>
          </div>
          <div class="vm-player-url-bar" id="vm-player-url-bar"></div>
        </div>
      </div>
    </div>
  `

  injectStyles(el)

  let currentClass = 'movie'
  let currentSourceIdx = 0
  let currentPage = 1
  let cachedTvConfig = null
  let searchQuery = ''

  // 渲染分类
  function renderClasses() {
    const container = el.querySelector('#vm-classes')
    container.innerHTML = CLASSES.map(c => `
      <div class="vm-class-item ${c.id === currentClass ? 'active' : ''}" data-id="${c.id}">
        <span class="vm-class-icon">${c.icon}</span>
        <span class="vm-class-name">${c.name}</span>
      </div>
    `).join('')
    container.querySelectorAll('.vm-class-item').forEach(item => {
      item.addEventListener('click', () => {
        currentClass = item.dataset.id
        currentPage = 1
        searchQuery = ''
        el.querySelector('#vm-search-input').value = ''
        renderClasses()
        loadContent()
      })
    })
  }

  // 渲染源标签
  function renderSourceTabs() {
    const container = el.querySelector('#vm-source-tabs')
    if (currentClass === 'live') {
      container.innerHTML = TV_SOURCES.map((s, i) => `
        <button class="vm-source-tab ${i === currentSourceIdx ? 'active' : ''}" data-idx="${i}">${s.icon} ${s.name}</button>
      `).join('')
      container.querySelectorAll('.vm-source-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          currentSourceIdx = parseInt(btn.dataset.idx)
          renderSourceTabs()
          loadContent()
        })
      })
    } else {
      container.innerHTML = VOD_SOURCES.map((s, i) => `
        <button class="vm-source-tab ${i === currentSourceIdx ? 'active' : ''}" data-idx="${i}">${s.icon} ${s.name}</button>
      `).join('')
      container.querySelectorAll('.vm-source-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          currentSourceIdx = parseInt(btn.dataset.idx)
          renderSourceTabs()
          loadContent()
        })
      })
    }
  }

  // 加载内容
  async function loadContent() {
    const loading = el.querySelector('#vm-loading')
    const grid = el.querySelector('#vm-grid')
    const pagination = el.querySelector('#vm-pagination')
    loading.style.display = 'block'
    grid.innerHTML = ''
    pagination.innerHTML = ''

    try {
      if (currentClass === 'live') {
        await loadLiveTv()
      } else {
        if (searchQuery) {
          await loadVodSearch()
        } else {
          await loadVodList()
        }
      }
    } catch (e) {
      grid.innerHTML = `<div class="vm-empty">加载失败: ${e.message}</div>`
    } finally {
      loading.style.display = 'none'
    }
  }

  // 电视直播
  async function loadLiveTv() {
    const source = TV_SOURCES[currentSourceIdx]
    const grid = el.querySelector('#vm-grid')
    const loading = el.querySelector('#vm-loading')

    loading.textContent = `正在加载 ${source.name}...`

    if (cachedTvConfig && currentSourceIdx === this._lastTvIdx) {
      renderTvGrid(cachedTvConfig)
      return
    }

    try {
      const resp = await fetch(source.url, { signal: AbortSignal.timeout(15000) })
      if (!resp.ok) throw new Error('HTTP ' + resp.status)
      const data = await resp.json()
      cachedTvConfig = data
      this._lastTvIdx = currentSourceIdx
      renderTvGrid(data)
    } catch (e) {
      el.querySelector('#vm-grid').innerHTML = `<div class="vm-empty">加载失败: ${e.message}</div>`
    }
  }

  function renderTvGrid(data) {
    const grid = el.querySelector('#vm-grid')
    const seen = new Set()
    const categories = []
    for (const cls of data) {
      if (cls.name && !seen.has(cls.name)) {
        seen.add(cls.name)
        categories.push(cls)
      }
    }
    // 只显示前12个分类
    const display = categories.slice(0, 12)
    grid.innerHTML = display.map(cat => `
      <div class="vm-cat-block">
        <div class="vm-cat-title">${cat.name}</div>
        <div class="vm-ch-grid">
          ${(cat.channels || []).slice(0, 24).map(ch => `
            <div class="vm-ch-item" data-url="${ch.url || ch.play_url || '#'}" data-name="${ch.name || ch.title || '未知'}">
              <span class="vm-ch-icon">📺</span>
              <span class="vm-ch-name">${ch.name || ch.title || '未知'}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')

    grid.querySelectorAll('.vm-ch-item').forEach(item => {
      item.addEventListener('click', () => {
        const url = item.dataset.url
        const name = item.dataset.name
        if (url && url !== '#') playUrl(name, url)
        else alert('该频道暂无播放地址')
      })
    })
  }

  // 点播列表
  async function loadVodList() {
    const source = VOD_SOURCES[currentSourceIdx]
    const loading = el.querySelector('#vm-loading')
    loading.textContent = `正在加载 ${source.name}...`

    const typeMap = { movie: '1', tv: '2', variety: '3', anime: '4', short: '5' }
    const typeId = typeMap[currentClass] || '1'
    const url = `${source.api}?ac=list&t=${typeId}&pg=${currentPage}`

    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    const json = await resp.json()

    if (json.code !== 1 && json.list) throw new Error(json.msg || '接口返回异常')
    const list = json.list || []
    const total = json.total || list.length
    const totalPages = Math.ceil(total / 20) || 1

    renderVodGrid(list)
    renderPagination(currentPage, totalPages)
  }

  // 点播搜索
  async function loadVodSearch() {
    const source = VOD_SOURCES[currentSourceIdx]
    const loading = el.querySelector('#vm-loading')
    loading.textContent = `正在搜索 "${searchQuery}"...`

    const url = `${source.api}?ac=detail&wd=${encodeURIComponent(searchQuery)}&pg=${currentPage}`
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    const json = await resp.json()

    const list = json.list || []
    const total = json.total || list.length
    const totalPages = Math.ceil(total / 20) || 1

    renderVodGrid(list)
    renderPagination(currentPage, totalPages)
  }

  function renderVodGrid(list) {
    const grid = el.querySelector('#vm-grid')
    if (!list || list.length === 0) {
      grid.innerHTML = '<div class="vm-empty">暂无数据，请尝试其他分类或关键词</div>'
      return
    }
    grid.innerHTML = list.map(item => `
      <div class="vm-card" data-id="${item.vod_id}" data-name="${item.vod_name}">
        <div class="vm-card-pic" style="background:#1a1a2e">
          <img src="${item.vod_pic}" alt="${item.vod_name}" onerror="this.style.display='none'; this.parentElement.innerHTML='<span style=font-size:2rem>🎬</span>'" loading="lazy">
          <span class="vm-card-tag">${typeLabel(item.type_name)}</span>
          <span class="vm-card-score">${item.vod_score || '?'}</span>
        </div>
        <div class="vm-card-info">
          <div class="vm-card-title">${item.vod_name}</div>
          <div class="vm-card-sub">${item.vod_actor || '未知主演'}</div>
        </div>
      </div>
    `).join('')

    grid.querySelectorAll('.vm-card').forEach(card => {
      card.addEventListener('click', () => openVodDetail(card.dataset.id, card.dataset.name))
    })
  }

  async function openVodDetail(id, name) {
    const source = VOD_SOURCES[currentSourceIdx]
    const url = `${source.api}?ac=detail&ids=${id}`
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!resp.ok) { alert('获取详情失败'); return }
    const json = await resp.json()
    const item = json.list && json.list[0]
    if (!item) { alert('未找到该影片'); return }

    // 显示选集弹层
    showEpisodePicker(item)
  }

  function showEpisodePicker(item) {
    const overlay = el.querySelector('#vm-player-overlay')
    const body = el.querySelector('#vm-player-body')
    const header = el.querySelector('#vm-player-title')
    const urlBar = el.querySelector('#vm-player-url-bar')

    header.textContent = item.vod_name
    const episodes = parsePlaylist(item.vod_play_from, item.vod_play_url)
    const playUrls = episodes[0]?.urls || []

    body.innerHTML = `
      <div class="vm-ep-info">
        <img src="${item.vod_pic}" class="vm-ep-pic" onerror="this.style.display='none'">
        <div class="vm-ep-desc">${item.vod_content || '暂无简介'}</div>
      </div>
      <div class="vm-ep-list">
        <div class="vm-ep-list-title">播放列表 ${playUrls.length}集</div>
        <div class="vm-ep-grid">
          ${playUrls.map((ep, i) => `
            <button class="vm-ep-btn" data-url="${ep.url}" data-name="${item.vod_name} ${ep.name}">${ep.name}</button>
          `).join('')}
        </div>
      </div>
    `

    body.querySelectorAll('.vm-ep-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        playUrl(btn.dataset.name, btn.dataset.url)
      })
    })

    urlBar.innerHTML = ''
    overlay.style.display = 'flex'
  }

  function parsePlaylist(from, url) {
    // 格式如: mgtv$1_1|xxx$$$mgtv$1_2|xxx
    if (!url) return []
    const sources = []
    const parts = url.split('$$$')
    const froms = (from || '').split('$$$')
    parts.forEach((part, i) => {
      const name = froms[i] || `源${i + 1}`
      const urls = part.split('#').map(p => {
        const [n, u] = p.split('$')
        return { name: n || '未知', url: u || '' }
      }).filter(ep => ep.url)
      sources.push({ name, urls })
    })
    return sources
  }

  function playUrl(name, url) {
    if (!url || url === '#') { alert('暂无播放地址'); return }
    const overlay = el.querySelector('#vm-player-overlay')
    const body = el.querySelector('#vm-player-body')
    const header = el.querySelector('#vm-player-title')
    const urlBar = el.querySelector('#vm-player-url-bar')
    header.textContent = name
    body.innerHTML = '<div class="vm-player-loading">正在加载播放器...</div>'
    urlBar.innerHTML = `<a href="${url}" target="_blank" class="vm-open-external">↗ 外部打开</a>`

    // 动态加载 hls.js
    function ensureHls() {
      return new Promise((resolve) => {
        if (window.Hls) { resolve(); return }
        const sc = document.createElement('script')
        sc.src = HLS_JS
        sc.onload = () => resolve()
        sc.onerror = () => resolve() // 加载失败也继续
        document.head.appendChild(sc)
      })
    }

    async function initPlayer() {
      await ensureHls()
      const isM3u8 = url.includes('.m3u8')

      if (isM3u8 && window.Hls && window.Hls.isSupported()) {
        // hls.js 播放 m3u8
        const video = document.createElement('video')
        video.id = 'vm-video'
        video.controls = true
        video.style = 'width:100%;height:100%;background:#000;border-radius:8px'
        video.setAttribute('allowfullscreen', true)
        body.innerHTML = ''
        body.appendChild(video)
        const hls = new window.Hls({ autoStartLoad: true })
        hls.loadSource(url)
        hls.attachMedia(video)
        hls.on(window.Hls.Events.ERROR, (evt, data) => {
          if (data.fatal) {
            // 致命错误，尝试外部播放
            body.innerHTML = `<div style="text-align:center;padding:40px">
              <p style="color:#8b8b9e;margin-bottom:16px">m3u8 流媒体播放失败，自动跳转外部播放...</p>
              <button class="vm-btn vm-btn-primary" onclick="window.open('${url}','_blank')">↗ 在浏览器中打开</button>
            </div>`
          }
        })
        video.play().catch(() => {})
      } else if (isM3u8 && video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari 原生支持 m3u8
        const video = document.createElement('video')
        video.id = 'vm-video'
        video.controls = true
        video.style = 'width:100%;height:100%;background:#000;border-radius:8px'
        video.setAttribute('allowfullscreen', true)
        body.innerHTML = ''
        body.appendChild(video)
        video.src = url
        video.play().catch(() => {})
      } else {
        // MP4/M3U 直链 → iframe 或 video 标签
        const isMp4 = url.includes('.mp4')
        if (isMp4) {
          const video = document.createElement('video')
          video.id = 'vm-video'
          video.controls = true
          video.style = 'width:100%;height:100%;background:#000;border-radius:8px'
          video.setAttribute('allowfullscreen', true)
          video.src = url
          body.innerHTML = ''
          body.appendChild(video)
          video.play().catch(() => {})
        } else {
          // 其他类型用 iframe + 外部备用
          body.innerHTML = `
            <div class="vm-iframe-wrap">
              <iframe id="vm-iframe" src="${url}" allowfullscreen allow="autoplay; fullscreen" style="width:100%;height:100%;border:none"></iframe>
            </div>
            <div style="text-align:center;padding:12px">
              <button class="vm-btn vm-btn-primary" onclick="window.open('${url}','_blank')">↗ 在浏览器中打开（推荐）</button>
            </div>
          `
        }
      }
    }

    initPlayer()
    overlay.style.display = 'flex'
  }

  // 分页
  function renderPagination(page, total) {
    const container = el.querySelector('#vm-pagination')
    if (total <= 1) return
    const prev = page > 1 ? page - 1 : 1
    const next = page < total ? page + 1 : total
    container.innerHTML = `
      <button class="vm-page-btn" data-page="${prev}">◀ 上一页</button>
      <span class="vm-page-info">第 ${page} / ${total} 页</span>
      <button class="vm-page-btn" data-page="${next}">下一页 ▶</button>
    `
    container.querySelectorAll('.vm-page-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPage = parseInt(btn.dataset.page)
        loadContent()
      })
    })
  }

  function typeLabel(t) {
    const map = { '1': '电影', '2': '剧集', '3': '综艺', '4': '动漫', '5': '短剧' }
    return map[t] || t || '影视'
  }

  // 搜索
  el.querySelector('#vm-search-btn').addEventListener('click', () => {
    searchQuery = el.querySelector('#vm-search-input').value.trim()
    currentPage = 1
    loadContent()
  })
  el.querySelector('#vm-search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      searchQuery = el.querySelector('#vm-search-input').value.trim()
      currentPage = 1
      loadContent()
    }
  })

  // 关闭播放
  el.querySelector('#vm-player-close').addEventListener('click', () => {
    const overlay = el.querySelector('#vm-player-overlay')
    overlay.style.display = 'none'
    const body = el.querySelector('#vm-player-body')
    body.innerHTML = '<div class="vm-player-loading">加载中...</div>'
  })
  el.querySelector('#vm-player-overlay').addEventListener('click', e => {
    if (e.target === el.querySelector('#vm-player-overlay')) {
      el.querySelector('#vm-player-overlay').style.display = 'none'
    }
  })

  // 初始化
  renderClasses()
  renderSourceTabs()
  loadContent()
}

function injectStyles(stylesEl) {
  if (stylesEl.querySelector('#vm-styles')) return
  const s = document.createElement('style')
  s.id = 'vm-styles'
  s.textContent = `
    .vm-page { display: flex; height: 100%; background: var(--bg-primary, #0f0f1a); color: var(--text-primary, #e2e2f0); overflow: hidden; }
    .vm-sidebar { width: 160px; min-width: 160px; background: #0f0f1a; border-right: 1px solid rgba(255,255,255,.06); display: flex; flex-direction: column; overflow-y: auto; }
    .vm-logo { padding: 18px 16px 12px; font-size: 15px; font-weight: 700; color: #a78bfa; border-bottom: 1px solid rgba(255,255,255,.06); letter-spacing: 1px; }
    .vm-classes { padding: 8px 0; flex: 1; }
    .vm-class-item { display: flex; align-items: center; gap: 8px; padding: 10px 16px; cursor: pointer; font-size: 13px; color: #8b8b9e; transition: all .15s; border-left: 3px solid transparent; }
    .vm-class-item:hover { background: rgba(167,139,250,.08); color: #c4b5fd; }
    .vm-class-item.active { background: rgba(167,139,250,.12); color: #a78bfa; border-left-color: #a78bfa; }
    .vm-class-icon { font-size: 14px; }
    .vm-sources { padding: 8px; border-top: 1px solid rgba(255,255,255,.06); }
    .vm-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    .vm-toolbar { padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,.06); display: flex; gap: 12px; align-items: center; flex-wrap: wrap; background: rgba(15,15,26,.5); }
    .vm-search-box { display: flex; gap: 6px; flex: 1; min-width: 200px; }
    .vm-search-input { flex: 1; padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.05); color: var(--text-primary, #e2e2f0); font-size: 13px; }
    .vm-search-input:focus { outline: none; border-color: #a78bfa; }
    .vm-btn { padding: 8px 14px; border-radius: 8px; border: none; cursor: pointer; font-size: 13px; transition: all .15s; }
    .vm-btn-primary { background: #7c3aed; color: #fff; }
    .vm-btn-primary:hover { background: #6d28d9; }
    .vm-source-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
    .vm-source-tab { padding: 5px 12px; border-radius: 16px; border: 1px solid rgba(255,255,255,.1); background: transparent; color: #8b8b9e; font-size: 12px; cursor: pointer; transition: all .15s; }
    .vm-source-tab:hover { border-color: #a78bfa; color: #a78bfa; }
    .vm-source-tab.active { background: #7c3aed; color: #fff; border-color: #7c3aed; }
    .vm-content { flex: 1; overflow-y: auto; padding: 16px; }
    .vm-loading { text-align: center; padding: 60px; color: #8b8b9e; font-size: 14px; }
    .vm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 14px; }
    .vm-empty { text-align: center; padding: 80px 20px; color: #8b8b9e; font-size: 14px; }
    .vm-card { cursor: pointer; border-radius: 10px; overflow: hidden; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.06); transition: all .2s; }
    .vm-card:hover { transform: translateY(-3px); border-color: rgba(167,139,250,.4); box-shadow: 0 8px 24px rgba(0,0,0,.4); }
    .vm-card-pic { position: relative; aspect-ratio: 2/3; background: #1a1a2e; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .vm-card-pic img { width: 100%; height: 100%; object-fit: cover; }
    .vm-card-tag { position: absolute; top: 6px; left: 6px; background: rgba(0,0,0,.7); color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 4px; }
    .vm-card-score { position: absolute; bottom: 6px; right: 6px; background: rgba(234,179,8,.85); color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 600; }
    .vm-card-info { padding: 8px 10px; }
    .vm-card-title { font-size: 12px; font-weight: 600; color: #e2e2f0; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .vm-card-sub { font-size: 10px; color: #6b6b80; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .vm-cat-block { margin-bottom: 16px; }
    .vm-cat-title { font-size: 13px; font-weight: 600; color: #a78bfa; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid rgba(167,139,250,.2); }
    .vm-ch-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; }
    .vm-ch-item { display: flex; align-items: center; gap: 6px; padding: 7px 10px; border-radius: 8px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.06); cursor: pointer; font-size: 12px; color: #8b8b9e; transition: all .15s; overflow: hidden; }
    .vm-ch-item:hover { background: rgba(124,58,237,.2); border-color: rgba(124,58,237,.4); color: #c4b5fd; }
    .vm-ch-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .vm-pagination { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 16px; }
    .vm-page-btn { padding: 7px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.05); color: #a78bfa; font-size: 12px; cursor: pointer; }
    .vm-page-btn:hover { background: rgba(124,58,237,.2); }
    .vm-page-info { font-size: 12px; color: #6b6b80; }
    .vm-player-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.88); z-index: 9999; display: flex; align-items: center; justify-content: center; }
    .vm-player-box { background: #13131f; border-radius: 14px; width: 92vw; max-width: 860px; max-height: 88vh; display: flex; flex-direction: column; overflow: hidden; border: 1px solid rgba(255,255,255,.08); }
    .vm-player-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; background: #0f0f1a; border-bottom: 1px solid rgba(255,255,255,.06); font-size: 13px; color: #e2e2f0; font-weight: 600; }
    .vm-player-close { background: none; border: none; color: #8b8b9e; font-size: 16px; cursor: pointer; padding: 4px 8px; border-radius: 4px; }
    .vm-player-close:hover { background: rgba(255,255,255,.08); color: #e2e2f0; }
    .vm-player-body { flex: 1; overflow-y: auto; padding: 16px; }
    .vm-iframe-wrap { width: 100%; aspect-ratio: 16/9; background: #000; border-radius: 8px; overflow: hidden; }
    .vm-player-loading { text-align: center; padding: 40px; color: #8b8b9e; }
    .vm-player-url-bar { padding: 10px 16px; background: #0f0f1a; border-top: 1px solid rgba(255,255,255,.06); text-align: center; }
    .vm-open-external { color: #a78bfa; font-size: 12px; text-decoration: none; }
    .vm-open-external:hover { text-decoration: underline; }
    .vm-ep-info { display: flex; gap: 14px; margin-bottom: 16px; }
    .vm-ep-pic { width: 80px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }
    .vm-ep-desc { font-size: 12px; color: #8b8b9e; line-height: 1.6; max-height: 80px; overflow: hidden; }
    .vm-ep-list-title { font-size: 12px; color: #a78bfa; margin-bottom: 10px; font-weight: 600; }
    .vm-ep-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: 6px; }
    .vm-ep-btn { padding: 6px 4px; border-radius: 6px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.04); color: #8b8b9e; font-size: 11px; cursor: pointer; transition: all .15s; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .vm-ep-btn:hover { background: rgba(124,58,237,.2); border-color: rgba(124,58,237,.5); color: #c4b5fd; }
  `
  stylesEl.appendChild(s)
}
