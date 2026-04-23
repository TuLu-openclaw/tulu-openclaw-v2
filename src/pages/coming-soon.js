/**
 * 全球内置 - Modal 弹窗锁 + 内置浏览器
 *
 * UX：点击侧边栏"全球内置"→ 弹出密码验证 Modal
 *    → 密码正确（2552667173）→ Modal 消失，显示内置浏览器
 *    → 刷新不重新锁（sessionStorage）
 *    → 内置浏览器通过 Tauri 后端代理加载，绕过 X-Frame-Options 限制
 */

import { invoke } from '../lib/tauri-api.js'

const TARGET_URL = 'https://zh.stripcam.xxx/top/girls/current-month-asia-and-pacific'
const LOCK_KEY = 'tulu_global_unlocked'
const CORRECT_PWD = '2552667173'
const LOAD_TIMEOUT = 15000

let _unlocked = false

// ─────────────────────────────────────────────
//  Modal 样式（注入一次）
// ─────────────────────────────────────────────
function _injectStyles() {
  if (document.getElementById('t-gb-styles')) return
  const style = document.createElement('style')
  style.id = 't-gb-styles'
  style.textContent = `
    /* 让 #content 成为 browser view 的定位参照 */
    #content { position: relative !important; }
    @keyframes tGbSpin { to { transform: rotate(360deg); } }
    @keyframes tGbFadeIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
    @keyframes tGbShake {
      0%,100% { transform: translateX(0); }
      15%,45%,75% { transform: translateX(-7px); }
      30%,60%,90% { transform: translateX(7px); }
    }
    @keyframes tGbPulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(99,102,241,0.4); }
      50% { box-shadow: 0 0 0 12px rgba(99,102,241,0); }
    }
    .t-gb-overlay {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 9000;
      background: rgba(6,6,18,0.82); backdrop-filter: blur(6px);
      display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: tGbFadeIn 0.25s ease;
    }
    .t-gb-modal {
      background: #0f0f24; border: 1px solid rgba(99,102,241,0.22);
      border-radius: 20px; padding: 44px 40px 36px;
      width: 360px; max-width: 92vw;
      box-shadow: 0 40px 90px rgba(0,0,0,0.7), 0 0 60px rgba(99,102,241,0.08);
      text-align: center; animation: tGbFadeIn 0.3s ease;
    }
    .t-gb-icon { font-size: 64px; margin-bottom: 18px; display: inline-block;
      animation: tGbPulse 2.4s ease infinite; }
    .t-gb-title { font-size: 22px; font-weight: 800; color: #fff; margin-bottom: 8px; }
    .t-gb-sub { font-size: 13px; color: #4a4a70; margin-bottom: 30px; line-height: 1.7; }
    .t-gb-input {
      width: 100%; box-sizing: border-box; padding: 14px 16px;
      background: rgba(255,255,255,0.05); border: 1.5px solid rgba(255,255,255,0.1);
      border-radius: 12px; color: #fff; font-size: 16px;
      outline: none; text-align: center; letter-spacing: 5px;
      transition: border-color 0.2s;
    }
    .t-gb-input:focus { border-color: rgba(99,102,241,0.6); }
    .t-gb-input.err { border-color: rgba(239,68,68,0.65); animation: tGbShake 0.45s ease; }
    .t-gb-err { font-size: 12px; color: #ef4444; min-height: 18px; margin: 8px 0 14px; }
    .t-gb-btn {
      width: 100%; padding: 14px; border: none; border-radius: 12px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: #fff; font-size: 15px; font-weight: 700; cursor: pointer;
      transition: opacity 0.2s, transform 0.1s;
      box-shadow: 0 4px 18px rgba(99,102,241,0.4);
    }
    .t-gb-btn:hover { opacity: 0.88; }
    .t-gb-btn:active { transform: scale(0.98); }
    .t-gb-footer { margin-top: 20px; font-size: 11px; color: #2e2e50; }

    /* 浏览器视图：相对于 #content 绝对定位，不覆盖侧边栏 */
    .t-gb-br {
      position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 10;
      display: flex; flex-direction: column;
      background: #0b0b14;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .t-gb-bar {
      flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
      padding: 8px 16px;
      background: rgba(14,14,24,0.96);
      border-bottom: 1px solid rgba(255,255,255,0.07);
    }
    .t-gb-bar-l { display: flex; align-items: center; gap: 10px; }
    .t-gb-bar-r { display: flex; align-items: center; gap: 8px; }
    .t-gb-title2 { font-size: 14px; font-weight: 700; color: #fff; }
    .t-gb-badge { font-size: 10px; background: rgba(34,197,94,0.14);
      color: #22c55e; padding: 2px 8px; border-radius: 10px;
      border: 1px solid rgba(34,197,94,0.28); }
    .t-gb-status { font-size: 11px; color: #555; transition: color 0.3s; }
    .t-gb-status.ok { color: #22c55e; }
    .t-gb-status.fail { color: #ef4444; }
    .t-gb-status.loading { color: #f59e0b; }
    .t-gb-btn2 {
      cursor: pointer; background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1); color: #888;
      font-size: 11px; padding: 4px 10px; border-radius: 6px;
      transition: background 0.2s;
    }
    .t-gb-btn2:hover { background: rgba(255,255,255,0.1); }
    .t-gb-btn2.ext { background: rgba(99,102,241,0.14);
      border-color: rgba(99,102,241,0.28); color: #8b8cf5; }
    .t-gb-btn2.ext:hover { background: rgba(99,102,241,0.24); }
    .t-gb-btn2.lock { background: rgba(239,68,68,0.12);
      border-color: rgba(239,68,68,0.25); color: #ef4444; }
    .t-gb-body { flex: 1; position: relative; overflow: hidden; }
    .t-gb-iframe { width: 100%; height: 100%; border: none; display: block; }
    .t-gb-load {
      position: absolute; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; background: #0b0b14;
      gap: 14px; transition: opacity 0.4s;
    }
    .t-gb-load.hidden { opacity: 0; pointer-events: none; }
    .t-gb-spin {
      width: 34px; height: 34px; border: 3px solid rgba(99,102,241,0.18);
      border-top-color: #6366f1; border-radius: 50%;
      animation: tGbSpin 0.8s linear infinite;
    }
    .t-gb-load-txt { font-size: 12px; color: #555; }
    .t-gb-load-url { font-size: 11px; color: #3a3a55; max-width: 80%;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .t-gb-blocked {
      position: absolute; inset: 0; display: none; flex-direction: column;
      align-items: center; justify-content: center; background: #0f0f1a;
      padding: 40px 20px; text-align: center; gap: 12px;
      animation: tGbFadeIn 0.3s ease;
    }
    .t-gb-blocked.show { display: flex; }
    .t-gb-blocked-icon { font-size: 42px; }
    .t-gb-blocked-title { font-size: 15px; font-weight: 700; color: #ef4444; }
    .t-gb-blocked-desc { font-size: 12px; color: #4a4a65; max-width: 340px; line-height: 1.8; }
    .t-gb-open-btn {
      display: inline-block; padding: 9px 24px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: #fff; border-radius: 9px; font-size: 13px; font-weight: 700;
      text-decoration: none; cursor: pointer; border: none;
      box-shadow: 0 4px 14px rgba(99,102,241,0.33); transition: opacity 0.2s;
    }
    .t-gb-open-btn:hover { opacity: 0.9; }
  `
  document.head.appendChild(style)
}

// ─────────────────────────────────────────────
//  密码验证 Modal
// ─────────────────────────────────────────────
function _showLockModal(onUnlock) {
  _injectStyles()

  const overlay = document.createElement('div')
  overlay.className = 't-gb-overlay'
  overlay.innerHTML =
    '<div class="t-gb-modal">' +
      '<div class="t-gb-icon">&#x1F512;</div>' +
      '<div class="t-gb-title">全球内置</div>' +
      '<div class="t-gb-sub">请输入访问密码完成验证</div>' +
      '<input type="password" class="t-gb-input" id="t-gb-pwd" ' +
        'placeholder="&#x5BC6;&#x7801;" maxlength="20" ' +
        'autocomplete="off" spellcheck="false" />' +
      '<div class="t-gb-err" id="t-gb-err"></div>' +
      '<button class="t-gb-btn" id="t-gb-btn">&#x89E3;&#x9501;&#x8FDB;&#x5165;</button>' +
      '<div class="t-gb-footer">&#x5BC6;&#x7801;&#x9A8C;&#x8BC1;&#x540E;&#x5373;&#x53EF;&#x8FDB;&#x5165;</div>' +
    '</div>'

  document.body.appendChild(overlay)

  const input = overlay.querySelector('#t-gb-pwd')
  const btn = overlay.querySelector('#t-gb-btn')
  const errEl = overlay.querySelector('#t-gb-err')

  function cleanup() { overlay.remove() }

  function tryUnlock() {
    const val = input.value
    if (!val) {
      errEl.textContent = '请输入密码'
      return
    }
    if (val === CORRECT_PWD) {
      try { sessionStorage.setItem(LOCK_KEY, '1') } catch (_) {}
      _unlocked = true
      cleanup()
      onUnlock()
    } else {
      errEl.textContent = '密码错误，请重试'
      input.classList.remove('err')
      void input.offsetWidth
      input.classList.add('err')
      input.value = ''
      input.focus()
    }
  }

  btn.addEventListener('click', tryUnlock)
  input.addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock() })
  input.addEventListener('input', () => {
    errEl.textContent = ''
    input.classList.remove('err')
  })

  setTimeout(() => input.focus(), 100)
}

// ─────────────────────────────────────────────
//  内置浏览器视图
// ─────────────────────────────────────────────
function _showBrowserView(container) {
  _injectStyles()

  const wrap = document.createElement('div')
  wrap.className = 't-gb-br'
  wrap.innerHTML =
    '<div class="t-gb-bar">' +
      '<div class="t-gb-bar-l">' +
        '<span style="font-size:18px">&#x1F310;</span>' +
        '<span class="t-gb-title2">全球内置</span>' +
        '<span class="t-gb-badge">已解锁</span>' +
      '</div>' +
      '<div class="t-gb-bar-r">' +
        '<span class="t-gb-status" id="t-gb-status">&#x1F504; 等待加载</span>' +
        '<button class="t-gb-btn2" id="t-gb-refresh">&#x21BB; 刷新</button>' +
        '<button class="t-gb-btn2" id="t-gb-close">&#x2716; 关闭</button>' +
        '<button class="t-gb-btn2 lock" id="t-gb-lock">&#x1F512; 锁定</button>' +
        '<a class="t-gb-btn2 ext" href="' + TARGET_URL + '" target="_blank" rel="noopener">&#x1F517; 外部</a>' +
      '</div>' +
    '</div>' +
    '<div class="t-gb-body" id="t-gb-body">' +
      '<div class="t-gb-load" id="t-gb-load">' +
        '<div class="t-gb-spin"></div>' +
        '<div class="t-gb-load-txt">正在连接全球服务器...</div>' +
        '<div class="t-gb-load-url">' + TARGET_URL + '</div>' +
      '</div>' +
      '<div class="t-gb-blocked" id="t-gb-blocked">' +
        '<div class="t-gb-blocked-icon">&#x26A0;&#xFE0F;</div>' +
        '<div class="t-gb-blocked-title">页面无法在应用内加载</div>' +
        '<div class="t-gb-blocked-desc">目标网站设置了安全策略，不允许在 iframe 中嵌入。<br>可在浏览器中打开。</div>' +
        '<a class="t-gb-open-btn" href="' + TARGET_URL + '" target="_blank" rel="noopener">&#x1F517; 在浏览器中打开</a>' +
      '</div>' +
      '<iframe id="t-gb-iframe" class="t-gb-iframe" allow="fullscreen"></iframe>' +
    '</div>'

  // 渲染到 #content 容器内（position: absolute 填满该区域）
  container.appendChild(wrap)

  const iframe = wrap.querySelector('#t-gb-iframe')
  const statusEl = wrap.querySelector('#t-gb-status')
  const loadingEl = wrap.querySelector('#t-gb-load')
  const blockedEl = wrap.querySelector('#t-gb-blocked')

  let loadTimer = null
  let loadFired = false

  function setStatus(text, cls) {
    statusEl.textContent = text
    statusEl.className = 't-gb-status ' + (cls || '')
  }

  function showBlocked(msg) {
    loadingEl.classList.add('hidden')
    iframe.style.display = 'none'
    blockedEl.classList.add('show')
    const descEl = blockedEl.querySelector('.t-gb-blocked-desc')
    if (descEl && msg) descEl.innerHTML = msg
    setStatus('\u26D4 加载失败', 'fail')
  }

  async function startLoad() {
    loadFired = false
    loadingEl.classList.remove('hidden')
    iframe.style.display = 'block'
    blockedEl.classList.remove('show')
    setStatus('\u1F504 加载中...', 'loading')
    clearTimeout(loadTimer)
    loadTimer = setTimeout(() => { if (!loadFired) showBlocked() }, LOAD_TIMEOUT)

    try {
      // 前端直接 fetch（跨平台兼容，不走 Rust invoke 避免 WebView2 网络限制）
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), LOAD_TIMEOUT)
      let res
      try {
        res = await fetch(TARGET_URL, { signal: controller.signal })
      } finally {
        clearTimeout(timeout)
      }
      loadFired = true
      clearTimeout(loadTimer)

      if (res.ok) {
        const html = await res.text()
        iframe.srcdoc = html
        loadingEl.classList.add('hidden')
        setStatus('\u2705 已加载', 'ok')
      } else {
        showBlocked('页面加载失败：HTTP ' + res.status)
      }
    } catch (err) {
      loadFired = true
      clearTimeout(loadTimer)
      showBlocked('加载异常：' + String(err))
    }
  }

  iframe.addEventListener('load', () => {
    // srcdoc 模式下 load 事件表示页面加载完成
    loadFired = true
    clearTimeout(loadTimer)
    loadingEl.classList.add('hidden')
    setStatus('\u2705 已加载', 'ok')
  })

  iframe.addEventListener('error', () => {
    loadFired = true
    clearTimeout(loadTimer)
    showBlocked()
  })

  wrap.querySelector('#t-gb-refresh').addEventListener('click', startLoad)

  // 关闭：返回仪表盘，移除 browser view
  wrap.querySelector('#t-gb-close').addEventListener('click', () => {
    wrap.remove()
    window.location.hash = '#/dashboard'
  })

  wrap.querySelector('#t-gb-lock').addEventListener('click', () => {
    _unlocked = false
    try { sessionStorage.removeItem(LOCK_KEY) } catch (_) {}
    wrap.remove()
    _showLockModal(() => _showBrowserView(container))
  })

  startLoad()
}

// ─────────────────────────────────────────────
//  主入口
// ─────────────────────────────────────────────
export default function render(container) {
  const root = container || document.body
  root.innerHTML = ''

  // 检查 sessionStorage 是否已解锁
  let unlocked = false
  try { unlocked = sessionStorage.getItem(LOCK_KEY) === '1' } catch (_) {}

  if (unlocked) {
    _unlocked = true
    _showBrowserView(root)
  } else {
    _showLockModal(() => _showBrowserView(root))
  }

  return root
}
