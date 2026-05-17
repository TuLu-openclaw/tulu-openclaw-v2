// ── Wex JSON 配置解析器 ───────────────────────────────────────────

  // Wex 配置状态
  let _wexConfig = null
  let _wexSources = []  // [{key, name, type, api, ext, searchable}]

  // 从 URL 加载 Wex 配置
  async function loadWexConfig(url) {
    try {
      const text = await crawlFetch(url)
      if (!text || text.length < 20) return { error: '配置内容为空' }
      const cfg = JSON.parse(text)
      if (!cfg.sites || !Array.isArray(cfg.sites)) {
        return { error: '无效的 Wex 配置（无 sites 字段）' }
      }
      _wexConfig = cfg
      _wexSources = cfg.sites.filter(s => s.key && s.name)
      return { ok: true, count: _wexSources.length, cfg }
    } catch (e) {
      return { error: '加载失败: ' + e.message }
    }
  }

  // 解析单个 Wex site → 标准化视频项
  function parseWexSite(site) {
    // type: 1=movie, 2=tv, 3=all
    const isVod = site.type === 1 || site.type === 3
    const isTv = site.type === 2 || site.type === 3
    return {
      key: site.key || '',
      name: site.name || '',
      api: site.api || '',
      ext: site.ext || '',
      type: site.type || 3,
      isVod,
      isTv,
      searchable: site.searchable === 1 || site.searchable === true,
      quickSearch: site.quickSearch === 1 || site.quickSearch === true,
      playerType: site.playerType || 1,
      changeable: site.changeable !== 0,
      // 将 ext 转为 searchUrl / detailUrl 备用
      _extUrl: site.ext || '',
    }
  }

  // 显示 Wex 配置管理面板
  function showWexPanel() {
    const content = el.querySelector('#t-content')
    const existing = _wexSources.length > 0

    content.innerHTML = `
      <div class="tvbox-wex-panel">
        <div class="tvbox-wex-header">
          <div class="tvbox-wex-icon">🧩</div>
          <div class="tvbox-wex-title">Wex 配置中心</div>
          <div class="tvbox-wex-sub">加载 Wex JSON 格式的影视配置，支持 78+ 影视站一键导入</div>
        </div>

        <div class="tvbox-wex-form">
          <input id="t-wex-url" type="url" placeholder="https://9280.kstore.vip/wex.json" value="" />
          <button id="t-wex-load" class="tvbox-wex-btn">📥 加载配置</button>
        </div>

        ${existing ? '<div id="t-wex-stats" class="tvbox-wex-stats"></div>' : ''}
        <div id="t-wex-status" class="tvbox-wex-status"></div>
        <div id="t-wex-source-list" class="tvbox-wex-source-list"></div>
      </div>
    `

    const input = content.querySelector('#t-wex-url')
    const btn = content.querySelector('#t-wex-load')

    // 如果已有配置，直接渲染
    if (existing) renderWexSources()

    async function doLoad() {
      const url = input.value.trim()
      if (!url) return
      if (!/^https?:\/\//i.test(url)) {
        showWexStatus('❌ 请输入有效的 http/https URL', 'error')
        return
      }
      btn.disabled = true
      btn.textContent = '⏳ 加载中...'
      showWexStatus('🔍 正在加载 Wex 配置...', 'loading')

      const result = await loadWexConfig(url)
      btn.disabled = false
      btn.textContent = '📥 加载配置'

      if (result.error) {
        showWexStatus('❌ ' + result.error, 'error')
      } else {
        showWexStatus(`✅ 加载成功！共 ${result.count} 个影视站`, 'success')
        renderWexSources()
      }
    }

    btn.addEventListener('click', doLoad)
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doLoad() })
    setTimeout(() => input.focus(), 100)
  }

  function showWexStatus(msg, type) {
    const el2 = el.querySelector('#t-wex-status')
    if (!el2) return
    el2.className = 'tvbox-wex-status tvbox-wex-status-' + (type || 'info')
    el2.textContent = msg
    el2.style.display = 'block'
  }

  function renderWexSources() {
    const container = el.querySelector('#t-wex-source-list')
    const statsEl = el.querySelector('#t-wex-stats')
    if (!container || !_wexSources.length) return

    // 统计
    const vodCount = _wexSources.filter(s => s.isVod).length
    const tvCount = _wexSources.filter(s => s.isTv).length
    if (statsEl) {
      statsEl.innerHTML = `<span>📺 影视 ${vodCount} 个</span>`
      statsEl.style.display = 'flex'
    }

    // 渲染卡片网格
    container.innerHTML = '<div class="tvbox-grid">' + _wexSources.map((s, i) => {
      const parsed = parseWexSite(s)
      const typeLabel = s.type === 1 ? '电影' : s.type === 2 ? '剧集' : '影视'
      const searchableBadge = parsed.searchable ? '🔍' : ''
      const favIcon = '❤️'
      return '<div class="tvbox-card tvbox-wex-card" data-index="' + i + '">' +
        '<div class="tvbox-card-inner">' +
          '<div class="tvbox-card-pic">' +
            '<span class="tvbox-card-placeholder" style="font-size:28px;display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:linear-gradient(135deg,#667eea22,#764ba222)">' +
              (parsed.searchable ? '🔍' : '🎬') +
            '</span>' +
          '</div>' +
          '<div class="tvbox-card-info">' +
            '<div class="tvbox-card-title" style="font-size:11px;line-height:1.3;word-break:break-all">' + escHtml(parsed.name.replace(/🐮|🍀|⬆️|⬇️|┃/g, ' ').trim().slice(0, 30)) + '</div>' +
            '<div class="tvbox-card-sub">' + typeLabel + ' ' + searchableBadge + '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    }).join('') + '</div>'

    container.querySelectorAll('.tvbox-wex-card').forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.index)
        const site = _wexSources[idx]
        if (site) openWexSiteSearch(site)
      })
    })
  }

  // 打开 Wex site 的搜索界面
  async function openWexSiteSearch(site) {
    const parsed = parseWexSite(site)
    // 切换到搜索模式，使用该 site 的 API
    currentView = 'search'
    _currentVodSource = null
    _currentWexSite = parsed

    const content = el.querySelector('#t-content')
    content.innerHTML = `
      <div class="tvbox-wex-search-header">
        <button class="tvbox-back-btn" id="t-wex-back">← 返回</button>
        <div class="tvbox-wex-site-name">${escHtml(parsed.name)}</div>
      </div>
      <div class="tvbox-search-box" style="padding:12px 16px">
        <input id="t-search" class="tvbox-search-input" type="text" placeholder="搜索 ${escHtml(parsed.name)}..." autocomplete="off" style="width:100%" />
      </div>
      <div id="t-main-grid" class="tvbox-grid" style="padding:8px 16px"></div>
      <div id="t-pagination" class="tvbox-pagination" style="padding:16px"></div>
    `

    // 绑定返回
    content.querySelector('#t-wex-back').addEventListener('click', () => {
      currentView = 'home'
      initApp(el)
    })

    // 绑定搜索
    const searchInput = content.querySelector('#t-search')
    let searchTimer = null
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer)
      searchTimer = setTimeout(() => {
        const q = searchInput.value.trim()
        if (q) wexSearch(parsed, q)
        else renderVodGrid([], 0)
      }, 500)
    })

    // 自动聚焦
    setTimeout(() => searchInput.focus(), 100)
  }

  // Wex 站点搜索
  async function wexSearch(site, q) {
    const grid = el.querySelector('#t-main-grid')
    if (!grid) return
    grid.innerHTML = '<div class="tvbox-loading">🔍 搜索中...</div>'

    try {
      let results = []

      // 方式1: 如果有 ext URL，尝试作为搜索接口
      if (site.ext) {
        const extUrl = buildWexSearchUrl(site.ext, q)
        if (extUrl) {
          try {
            const data = await crawlFetch(extUrl)
            if (data) {
              const parsed = parseWexSearchResult(data, site)
              if (parsed.length > 0) { results = parsed; renderVodGrid(results, results.length); return }
            }
          } catch {}
        }
      }

      // 方式2: 通用嗅探 - 抓取搜索结果页
      const searchUrl = buildWexSearchUrl(site.api + '?kw=' + encodeURIComponent(q), q) || (site.api + '/search?q=' + encodeURIComponent(q))
      try {
        const html = await crawlFetch(searchUrl)
        if (html) {
          const fromHtml = parseWexFromHtml(html, site, q)
          if (fromHtml.length > 0) { results = fromHtml; renderVodGrid(results, results.length); return }
        }
      } catch {}

      renderVodGrid([], 0)
    } catch (e) {
      grid.innerHTML = '<div class="tvbox-empty"><div class="tvbox-empty-icon">❌</div><div class="tvbox-empty-title">搜索失败</div><div class="tvbox-empty-sub">' + escHtml(e.message) + '</div></div>'
    }
  }

  // 构建 Wex 搜索 URL
  function buildWexSearchUrl(ext, q) {
    if (!ext) return null
    // ext 可能是：完整URL、相对路径、模板URL
    if (/^https?:\/\//i.test(ext)) {
      return ext.replace(/\{([^}]+)\}/g, (_, k) => k === 'wd' || k === 'keyword' || k === 'kw' ? encodeURIComponent(q) : q)
        .replace(/([?&])kw=([^&]+)/, '$1kw=' + encodeURIComponent(q))
        .replace(/([?&])wd=([^&]+)/, '$1wd=' + encodeURIComponent(q))
        .replace(/([?&])q=([^&]+)/, '$1q=' + encodeURIComponent(q))
        .replace(/([?&])search=([^&]+)/, '$1search=' + encodeURIComponent(q))
    }
    return null
  }

  // 解析 Wex 搜索结果（JSON格式）
  function parseWexSearchResult(data, site) {
    try {
      if (typeof data === 'string') data = JSON.parse(data)
      const list = data?.list || data?.data || data?.results || data?.vod || []
      return list.map(v => ({
        vod_id: v.vod_id || v.id || '',
        vod_name: v.vod_name || v.title || v.name || '',
        vod_pic: v.vod_pic || v.pic || v.thumb || '',
        type_name: v.type_name || '',
        vod_actor: v.vod_actor || v.actor || '',
        vod_director: v.vod_director || v.director || '',
        vod_blurb: v.vod_content || v.content || v.des || v.note || '',
        _dl: parseTvboxDl(v),
        _cat: v.type_name || '',
      }))
    } catch { return [] }
  }

  // 从 HTML 中解析 Wex 搜索结果
  function parseWexFromHtml(html, site, q) {
    const results = []
    // 匹配常见列表格式
    const patterns = [
      /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]{2,50})<\/a>/gi,
      /<div[^>]+class=["'][^"']*item[^"']*["'][^>]*>[\s\S]{0,500}?<img[^>]+src=["']([^"']+)["'][^>]*>[\s\S]{0,200}?<span[^>]*>([^<]{2,40})<\/span>/gi,
      /"vod_id"\s*:\s*(\d+)[^}]+"vod_name"\s*:\s*"([^"]+)"/gi,
      /data-id=["'](\d+)["'][^>]+data-title=["']([^"']+)["']/gi,
    ]
    const seen = new Set()

    patterns.forEach(re => {
      let m
      while ((m = re.exec(html)) !== null) {
        let url = m[1] || ''
        let title = (m[2] || m[3] || '').replace(/<[^>]+>/g, '').trim()
        if (!title || title.length < 2) continue
        const resolved = url.startsWith('http') ? url : new URL(url, site.api).href
        if (seen.has(resolved + title)) continue
        seen.add(resolved + title)
        results.push({
          vod_id: url.match(/\d+/)?.[0] || resolved,
          vod_name: title,
          vod_pic: m[0].match(/src=["']([^"']+)["']/)?.[1] || '',
          vod_actor: '',
          vod_director: '',
          vod_blurb: '',
          _dl: { urls: [{ name: '播放', url: resolved }] },
          _cat: '',
        })
      }
    })

    return results.slice(0, 30)
  }
