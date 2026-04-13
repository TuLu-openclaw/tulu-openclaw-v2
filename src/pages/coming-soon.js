/**
 * 全球内置 - 内置浏览器页面
 * 通过 iframe 在应用窗口内加载目标 URL
 * 处理 X-Frame-Options / CSP 拦截检测 + 兜底按钮
 */

const TARGET_URL = 'https://zh.stripcam.xxx/top/girls/current-month-asia-and-pacific'
const LOAD_TIMEOUT = 8000 // 8秒未触发 load 视为被拦截

export default function render(container) {
  const root = container || document.body
  root.innerHTML = ''

  // ── 样式 ──────────────────────────────────────────────
  const style = document.createElement('style')
  style.textContent = `
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .gb-wrap { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 500;
      display: flex; flex-direction: column;
      background: #0b0b14;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .gb-toolbar { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
      padding: 10px 16px;
      background: rgba(16, 16, 28, 0.97);
      border-bottom: 1px solid rgba(255,255,255,0.07); }
    .gb-toolbar-left { display: flex; align-items: center; gap: 10px; }
    .gb-icon { font-size: 18px; }
    .gb-title { font-size: 14px; font-weight: 600; color: #fff; }
    .gb-right { display: flex; align-items: center; gap: 8px; }
    .gb-status { font-size: 11px; color: #555; transition: color 0.3s; }
    .gb-status.ok { color: #22c55e; }
    .gb-status.fail { color: #ef4444; }
    .gb-status.loading { color: #f59e0b; }
    .gb-btn { cursor: pointer; background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      color: #888; font-size: 11px; padding: 4px 10px;
      border-radius: 6px; transition: background 0.2s; }
    .gb-btn:hover { background: rgba(255,255,255,0.1); }
    .gb-btn.ext { background: rgba(99,102,241,0.15);
      border-color: rgba(99,102,241,0.3); color: #8b8cf5; }
    .gb-btn.ext:hover { background: rgba(99,102,241,0.25); }
    .gb-body { flex: 1; position: relative; overflow: hidden; }
    .gb-iframe { width: 100%; height: 100%; border: none; display: block; }
    .gb-blocked { position: absolute; inset: 0; display: none;
      flex-direction: column; align-items: center; justify-content: center;
      background: #0f0f1a; padding: 40px 20px;
      text-align: center; gap: 14px; animation: fadeIn 0.3s ease; }
    .gb-blocked.show { display: flex; }
    .gb-blocked-icon { font-size: 44px; }
    .gb-blocked-title { font-size: 16px; font-weight: 700; color: #ef4444; }
    .gb-blocked-desc { font-size: 12px; color: #555; max-width: 340px; line-height: 1.7; }
    .gb-open-btn { display: inline-block; padding: 10px 28px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: #fff; border-radius: 10px; font-size: 14px; font-weight: 700;
      text-decoration: none; cursor: pointer; border: none;
      box-shadow: 0 4px 14px rgba(99,102,241,0.35); transition: opacity 0.2s; }
    .gb-open-btn:hover { opacity: 0.9; }
    .gb-loading { display: flex; flex-direction: column; align-items: center;
      justify-content: center; position: absolute; inset: 0;
      background: #0b0b14; gap: 16px; pointer-events: none; transition: opacity 0.4s; }
    .gb-loading.hidden { opacity: 0; pointer-events: none; }
    .gb-spinner { width: 36px; height: 36px; border: 3px solid rgba(99,102,241,0.2);
      border-top-color: #6366f1; border-radius: 50%;
      animation: spin 0.8s linear infinite; }
    .gb-loading-text { font-size: 12px; color: #555; }
    .gb-loading-url { font-size: 11px; color: #444; max-width: 80%;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `
  document.head.appendChild(style)

  // ── 主体结构 ──────────────────────────────────────────
  const wrap = document.createElement('div')
  wrap.className = 'gb-wrap'

  wrap.innerHTML =
    '<div class="gb-toolbar">' +
      '<div class="gb-toolbar-left">' +
        '<span class="gb-icon">🌐</span>' +
        '<span class="gb-title">全球内置</span>' +
      '</div>' +
      '<div class="gb-right">' +
        '<span class="gb-status" id="t-status">🔄 等待加载</span>' +
        '<button class="gb-btn" id="t-refresh">↻ 刷新</button>' +
        '<a class="gb-btn ext" id="t-open-ext" href="' + TARGET_URL + '" target="_blank" rel="noopener">↗ 外部打开</a>' +
      '</div>' +
    '</div>' +
    '<div class="gb-body" id="t-body">' +
      '<div class="gb-loading" id="t-loading">' +
        '<div class="gb-spinner"></div>' +
        '<div class="gb-loading-text">正在连接全球服务器...</div>' +
        '<div class="gb-loading-url">' + TARGET_URL + '</div>' +
      '</div>' +
      '<div class="gb-blocked" id="t-blocked">' +
        '<div class="gb-blocked-icon">⚠️</div>' +
        '<div class="gb-blocked-title">页面无法在应用内加载</div>' +
        '<div class="gb-blocked-desc">目标网站设置了安全策略（X-Frame-Options 或 CSP frame-ancestors），<br>不允许在 iframe 中嵌入。请使用下方按钮在浏览器中打开。</div>' +
        '<a class="gb-open-btn" href="' + TARGET_URL + '" target="_blank" rel="noopener">↗ 在浏览器中打开</a>' +
      '</div>' +
      '<iframe id="t-iframe" class="gb-iframe" allow="fullscreen"></iframe>' +
    '</div>'

  document.body.appendChild(wrap)

  const iframe = document.getElementById('t-iframe')
  const statusEl = document.getElementById('t-status')
  const loadingEl = document.getElementById('t-loading')
  const blockedEl = document.getElementById('t-blocked')
  const refreshBtn = document.getElementById('t-refresh')

  let loadTimer = null
  let loadFired = false

  function setStatus(text, cls) {
    statusEl.textContent = text
    statusEl.className = 'gb-status ' + (cls || '')
  }

  function showBlocked() {
    loadingEl.classList.add('hidden')
    iframe.style.display = 'none'
    blockedEl.classList.add('show')
    setStatus('⛔ 加载被拦截', 'fail')
  }

  function startLoad() {
    loadFired = false
    loadingEl.classList.remove('hidden')
    iframe.style.display = 'block'
    blockedEl.classList.remove('show')
    setStatus('🔄 加载中...', 'loading')
    clearTimeout(loadTimer)
    // 8秒未触发 load → 判定被拦截
    loadTimer = setTimeout(function() {
      if (!loadFired) showBlocked()
    }, LOAD_TIMEOUT)
  }

  iframe.addEventListener('load', function() {
    loadFired = true
    clearTimeout(loadTimer)
    // 通过 DOM 长度粗略判断页面是否真实渲染（被拦截时 iframe 文档为空）
    try {
      const doc = iframe.contentDocument
      if (doc && doc.body && doc.body.innerHTML.length > 100) {
        loadingEl.classList.add('hidden')
        setStatus('✅ 已加载', 'ok')
      } else {
        showBlocked()
      }
    } catch(e) {
      // 跨域无法访问 contentDocument → 可能是正常加载了外部页面
      loadingEl.classList.add('hidden')
      setStatus('✅ 已加载', 'ok')
    }
  })

  iframe.addEventListener('error', function() {
    loadFired = true
    clearTimeout(loadTimer)
    showBlocked()
  })

  refreshBtn.addEventListener('click', function() {
    startLoad()
    iframe.src = TARGET_URL + '?r=' + Date.now()
  })

  // 启动
  startLoad()
  iframe.src = TARGET_URL

  return root
}
