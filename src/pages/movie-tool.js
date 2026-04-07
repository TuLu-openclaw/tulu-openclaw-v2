/**
 * 影视工具页面
 * 支持多个公开 TVBox 接口的影视搜索和播放
 */

const TV_SOURCES = [
  { name: '💫林中小屋💫', url: 'https://gitee.com/lzxw66/lzxw9/raw/master/Ace', type: 'tvbox', icon: '🏠' },
  { name: '🐼肥猫🐼', url: 'http://肥猫.com/', type: 'tvbox', icon: '🐱' },
  { name: '🤓OK🤓', url: 'https://10352.kstore.vip/tv', type: 'tvbox', icon: '✅' },
  { name: '🐂王二小🐮', url: 'https://9280.kstore.vip/newwex.json', type: 'tvbox', icon: '🐂' },
  { name: '💫潇洒💫', url: 'https://9877.kstore.space/AnotherD/api.json', type: 'tvbox', icon: '💫' },
  { name: '😁天天开心😁', url: 'http://rihou.cc:55/天天开心', type: 'tvbox', icon: '😁' },
  { name: '🐟摸鱼儿🐟', url: 'http://我不是.摸鱼儿.com', type: 'tvbox', icon: '🐟' },
  { name: '🐂放牛娃😎', url: 'http://tvbox.王二小放牛娃.top', type: 'tvbox', icon: '🐂' },
  { name: '👽饭太硬👽', url: 'https://www.饭太硬.com/tv', type: 'tvbox', icon: '👽' },
  { name: '👿小米👿', url: 'https://cnb.cool/xiaomideyun/xiaomideyun/-/git/raw/main/mi.json', type: 'tvbox', icon: '👿' },
  { name: '🔮巧记🔮', url: 'http://cdn.qiaoji8.com/tvbox.json', type: 'tvbox', icon: '🔮' },
  { name: '🐯小虎斑🐯', url: 'http://hb.小虎斑.site:25252/仅供测试', type: 'tvbox', icon: '🐯' },
  { name: '🌈欧歌🌈', url: 'https://欧歌.v.nxog.top/m/', type: 'tvbox', icon: '🌈' },
  { name: '🍎南风🍎', url: 'https://gh-proxy.com/https://raw.githubusercontent.com/yoursmile66/TVBox/main/XC.json', type: 'tvbox', icon: '🍎' },
  { name: '🍅香雅情🍅', url: 'https://gh-proxy.com/https://raw.githubusercontent.com/xyq254245/xyqonlinerule/main/XYQTVBox.json', type: 'tvbox', icon: '🍅' },
  { name: '⚪PG⚪', url: 'https://www.252035.xyz/p/jsm.json', type: 'tvbox', icon: '⚪' },
  { name: '🌱真心🌱', url: 'https://www.252035.xyz/z/FongMi.json', type: 'tvbox', icon: '🌱' },
  { name: '📚教育📚', url: 'https://gitee.com/zybal/tv/raw/master/教育接口.json', type: 'tvbox', icon: '📚' },
  { name: '🌟影视仓VIP', url: 'https://gh.llkk.cc/https://raw.githubusercontent.com/tushen6/Tomorrow/master/tvbox.json', type: 'tvbox', icon: '🌟' },
]

export default function render(el) {
  el.innerHTML = `
    <div class="page-header">
      <div class="page-title">屠戮影视</div>
      <div class="page-desc">多个公开 TVBox 接口 · 影视搜索播放</div>
    </div>
    <div class="movie-container">
      <div class="movie-toolbar">
        <div class="movie-sources">
          ${TV_SOURCES.map((s, i) => `
            <button class="source-btn ${i === 0 ? 'active' : ''}" data-url="${s.url}" data-type="${s.type}" data-name="${s.name}">
              ${s.icon} ${s.name}
            </button>
          `).join('')}
        </div>
        <div class="movie-search-box">
          <input type="text" id="movie-search-input" placeholder="搜索电影、电视剧、综艺..." class="movie-search-input">
          <button id="movie-search-btn" class="btn btn-primary btn-sm">搜索</button>
        </div>
      </div>
      <div id="movie-status" class="movie-status"></div>
      <div id="movie-results" class="movie-results"></div>
    </div>
  `

  let activeSource = TV_SOURCES[0]
  let cachedConfig = null

  async function loadSource(source) {
    const statusEl = el.querySelector('#movie-status')
    const resultsEl = el.querySelector('#movie-results')
    statusEl.textContent = `正在加载 ${source.name} 数据...`
    statusEl.className = 'movie-status movie-status-loading'
    resultsEl.innerHTML = ''

    try {
      const resp = await fetch(source.url, { signal: AbortSignal.timeout(15000) })
      if (!resp.ok) throw new Error('HTTP ' + resp.status)
      const data = await resp.json()
      cachedConfig = data
      statusEl.textContent = `${source.name} 加载成功，共 ${data.length || 0} 个分类`
      statusEl.className = 'movie-status movie-status-ok'
      renderCategories(data, source)
    } catch (e) {
      statusEl.textContent = `${source.name} 加载失败：` + (e.message || e)
      statusEl.className = 'movie-status movie-status-error'
    }
  }

  function renderCategories(data, source) {
    const resultsEl = el.querySelector('#movie-results')
    if (source.type === 'tvbox') {
      // TVBox 格式
      const categories = []
      const seen = new Set()
      for (const cls of data) {
        if (cls.name && !seen.has(cls.name)) {
          seen.add(cls.name)
          categories.push(cls)
        }
      }
      resultsEl.innerHTML = categories.slice(0, 20).map(cat => `
        <div class="movie-category">
          <div class="movie-category-title">${cat.name || '未分类'}</div>
          <div class="movie-channels">
            ${(cat.channels || []).slice(0, 12).map(ch => `
              <button class="channel-btn" data-url="${ch.url || ch.play_url || '#'}" data-name="${ch.name || ch.title || '未知'}">
                ${ch.name || ch.title || '未知'}
              </button>
            `).join('')}
          </div>
        </div>
      `).join('') || '<div class="movie-empty">暂无数据</div>'

      resultsEl.querySelectorAll('.channel-btn').forEach(btn => {
        btn.addEventListener('click', () => playChannel(btn.dataset.name, btn.dataset.url))
      })
    } else {
      resultsEl.innerHTML = '<div class="movie-empty">不支持该接口格式</div>'
    }
  }

  async function playChannel(name, url) {
    if (!url || url === '#') {
      alert('该频道暂无播放地址')
      return
    }
    // 尝试用 Tauri 打开外部播放器
    try {
      const { open } = await import('@tauri-apps/plugin-shell')
      await open(url)
    } catch {
      window.open(url, '_blank')
    }
  }

  // 搜索功能
  el.querySelector('#movie-search-btn').addEventListener('click', () => doSearch())
  el.querySelector('#movie-search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch()
  })

  async function doSearch() {
    const q = el.querySelector('#movie-search-input').value.trim()
    if (!q) return
    if (!cachedConfig) {
      alert('请先选择一个数据源加载')
      return
    }
    const resultsEl = el.querySelector('#movie-results')
    const matches = []
    const seenUrls = new Set()

    for (const cat of cachedConfig) {
      for (const ch of (cat.channels || [])) {
        const n = (ch.name || ch.title || '').toLowerCase()
        if (n.includes(q.toLowerCase()) && !seenUrls.has(ch.url)) {
          seenUrls.add(ch.url)
          matches.push(ch)
        }
      }
    }

    if (matches.length === 0) {
      resultsEl.innerHTML = '<div class="movie-empty">未找到相关影视，请尝试其他关键词</div>'
      return
    }

    resultsEl.innerHTML = `
      <div class="movie-category">
        <div class="movie-category-title">搜索结果: ${q} (${matches.length}个)</div>
        <div class="movie-channels">
          ${matches.slice(0, 24).map(ch => `
            <button class="channel-btn" data-url="${ch.url || ch.play_url || '#'}" data-name="${ch.name || ch.title || '未知'}">
              ${ch.name || ch.title || '未知'}
            </button>
          `).join('')}
        </div>
      </div>
    `
    resultsEl.querySelectorAll('.channel-btn').forEach(btn => {
      btn.addEventListener('click', () => playChannel(btn.dataset.name, btn.dataset.url))
    })
  }

  // 切换源
  el.querySelectorAll('.source-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.source-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      activeSource = TV_SOURCES.find(s => s.url === btn.dataset.url)
      cachedConfig = null
      loadSource(activeSource)
    })
  })

  // 样式
  if (!document.getElementById('movie-tool-style')) {
    const style = document.createElement('style')
    style.id = 'movie-tool-style'
    style.textContent = `
      .movie-container { padding: 16px 24px; }
      .movie-toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 16px; }
      .movie-sources { display: flex; flex-wrap: wrap; gap: 6px; }
      .source-btn { padding: 6px 14px; border-radius: 20px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-secondary); font-size: var(--font-size-sm); cursor: pointer; transition: all .2s; }
      .source-btn:hover { border-color: var(--primary); color: var(--primary); }
      .source-btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }
      .movie-search-box { display: flex; gap: 8px; flex: 1; min-width: 200px; }
      .movie-search-input { flex: 1; padding: 6px 12px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); font-size: var(--font-size-sm); }
      .movie-search-input:focus { outline: none; border-color: var(--primary); }
      .movie-status { padding: 8px 12px; border-radius: var(--radius-md); font-size: var(--font-size-sm); margin-bottom: 12px; }
      .movie-status-loading { background: rgba(234,179,8,.1); color: #eab308; }
      .movie-status-ok { background: rgba(34,197,94,.1); color: #22c55e; }
      .movie-status-error { background: rgba(239,68,68,.1); color: #ef4444; }
      .movie-results { display: flex; flex-direction: column; gap: 16px; }
      .movie-category { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; }
      .movie-category-title { padding: 10px 14px; font-size: var(--font-size-sm); font-weight: 600; color: var(--text-primary); background: var(--bg-tertiary); border-bottom: 1px solid var(--border); }
      .movie-channels { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 14px; }
      .channel-btn { padding: 5px 12px; border-radius: 16px; border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-secondary); font-size: var(--font-size-xs); cursor: pointer; transition: all .2s; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .channel-btn:hover { border-color: var(--primary); color: var(--primary); background: rgba(99,102,241,.08); }
      .movie-empty { text-align: center; padding: 40px; color: var(--text-tertiary); font-size: var(--font-size-sm); }
    `
    document.head.appendChild(style)
  }

  // 默认加载第一个源
  loadSource(activeSource)
}
