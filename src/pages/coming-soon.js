/**
 * 全球内置 - 密码锁 + 内置浏览器页面
 *
 * 功能：
 * 1. 首次访问显示密码锁（sessionStorage 持久化本次会话的解锁状态）
 * 2. 密码正确（2552667173）→ 加载 iframe 全屏显示目标 URL
 * 3. 密码错误 → 输入框抖动 + 错误提示
 * 4. 刷新页面不重新锁屏（sessionStorage）
 */

const TARGET_URL = 'https://zh.stripcam.xxx/top/girls/current-month-asia-and-pacific'
const LOCK_KEY = 'tulu_global_unlocked'
const CORRECT_PWD = '2552667173'
const LOAD_TIMEOUT = 8000

// ─────────────────────────────────────────────
//  锁屏视图
// ─────────────────────────────────────────────
function renderLockView(container, onUnlock) {
  container.innerHTML = ''

  const style = document.createElement('style')
  style.textContent = `
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes fadeIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
    @keyframes shake {
      0%,100% { transform: translateX(0); }
      15%,45%,75% { transform: translateX(-8px); }
      30%,60%,90% { transform: translateX(8px); }
    }
    @keyframes lockBounce {
      0%,100% { transform: scale(1); }
      40% { transform: scale(1.12); }
      70% { transform: scale(0.95); }
    }
    .gb-lock { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 500;
      display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, #0a0a1a 0%, #111128 50%, #0a0a1a 100%);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      animation: fadeIn 0.35s ease;
    }
    .gb-lock-card {
      text-align: center; padding: 48px 40px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 20px; backdrop-filter: blur(24px);
      box-shadow: 0 32px 80px rgba(0,0,0,0.55);
      width: 340px; max-width: 92vw;
      animation: fadeIn 0.4s ease;
    }
    .gb-lock-icon { font-size: 68px; display: inline-block; animation: lockBounce 2s ease infinite; margin-bottom: 20px; }
    .gb-lock-title { font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 6px; }
    .gb-lock-sub { font-size: 13px; color: #5a5a7a; margin-bottom: 32px; line-height: 1.6; }
    .gb-lock-input-wrap { position: relative; margin-bottom: 16px; }
    .gb-lock-input {
      width: 100%; box-sizing: border-box;
      padding: 15px 16px;
      background: rgba(255,255,255,0.05);
      border: 1.5px solid rgba(255,255,255,0.1);
      border-radius: 12px; color: #fff; font-size: 15px;
      outline: none; text-align: center;
      letter-spacing: 4px; transition: border-color 0.2s;
    }
    .gb-lock-input:focus { border-color: rgba(99,102,241,0.65); }
    .gb-lock-input.error { border-color: rgba(239,68,68,0.7); }
    .gb-lock-err { font-size: 12px; color: #ef4444; min-height: 18px; margin-bottom: 10px; }
    .gb-lock-btn {
      width: 100%; padding: 14px; border: none; border-radius: 12px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: #fff; font-size: 15px; font-weight: 700; cursor: pointer;
      transition: opacity 0.2s, transform 0.1s;
      box-shadow: 0 4px 16px rgba(99,102,241,0.38);
    }
    .gb-lock-btn:hover { opacity: 0.9; }
    .gb-lock-btn:active { transform: scale(0.98); }
    .gb-lock-footer { margin-top: 22px; font-size: 11px; color: #333348; }
  `
  document.head.appendChild(style)

  const wrap = document.createElement('div')
  wrap.className = 'gb-lock'
  wrap.innerHTML =
    '<div class="gb-lock-card">' +
      '<div class="gb-lock-icon">&#x1F512;</div>' +
      '<div class="gb-lock-title">&#x5F85;&#x5F00;&#x653E;&#x529F;&#x80FD;</div>' +
      '<div class="gb-lock-sub">&#x8BF7;&#x8F93;&#x5165;&#x8BBF;&#x95EE;&#x5BC6;&#x7801;&#x5B8C;&#x6210;&#x9A8C;&#x8BC1;</div>' +
      '<div class="gb-lock-input-wrap">' +
        '<input type="password" id="t-gl-pwd" class="gb-lock-input" placeholder="&#x5BC6;&#x7801;" maxlength="20" autocomplete="off" spellcheck="false" />' +
      '</div>' +
      '<div class="gb-lock-err" id="t-gl-err"></div>' +
      '<button class="gb-lock-btn" id="t-gl-btn">&#x89E3;&#x9501;&#x8FDB;&#x5165;</button>' +
      '<div class="gb-lock-footer">&#x5C0F;&#x63D0;&#x793A;&#xFF1A;&#x5BC6;&#x7801;&#x4E3A;&#x6388;&#x6743;&#x7801;&#xFF0C;&#x8BF7;&#x8054;&#x7CFB; QQ&#xFF1A;2552667173</div>' +
    '</div>'

  container.appendChild(wrap)

  const input = wrap.querySelector('#t-gl-pwd')
  const btn = wrap.querySelector('#t-gl-btn')
  const errEl = wrap.querySelector('#t-gl-err')

  function tryUnlock() {
    const val = input.value
    if (!val) {
      errEl.textContent = '请输入密码'
      return
    }
    if (val === CORRECT_PWD) {
      sessionStorage.setItem(LOCK_KEY, '1')
      onUnlock()
    } else {
      errEl.textContent = '密码错误，请重试'
      input.classList.add('error')
      input.style.animation = 'none'
      void input.offsetWidth
      input.style.animation = 'shake 0.5s ease'
      input.value = ''
      input.focus()
      setTimeout(() => input.classList.remove('error'), 600)
    }
  }

  btn.addEventListener('click', tryUnlock)
  input.addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock() })
  input.addEventListener('input', () => {
    errEl.textContent = ''
    input.classList.remove('error')
  })

  setTimeout(() => input.focus(), 120)
}

// ─────────────────────────────────────────────
//  内置浏览器视图（iframe）
// ─────────────────────────────────────────────
function renderBrowserView(container) {
  container.innerHTML = ''

  const style = document.createElement('style')
  style.textContent = `
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .gb-br { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 500;
      display: flex; flex-direction: column;
      background: #0b0b14;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .gb-br-bar { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
      padding: 9px 16px; background: rgba(14,14,24,0.97);
      border-bottom: 1px solid rgba(255,255,255,0.07); }
    .gb-br-left { display: flex; align-items: center; gap: 10px; }
    .gb-br-icon { font-size: 18px; }
    .gb-br-title { font-size: 14px; font-weight: 600; color: #fff; }
    .gb-br-badge { font-size: 10px; background: rgba(34,197,94,0.14); color: #22c55e;
      padding: 2px 7px; border-radius: 10px; border: 1px solid rgba(34,197,94,0.28); }
    .gb-br-right { display: flex; align-items: center; gap: 8px; }
    .gb-br-status { font-size: 11px; color: #555; transition: color 0.3s; }
    .gb-br-status.ok { color: #22c55e; }
    .gb-br-status.fail { color: #ef4444; }
    .gb-br-status.loading { color: #f59e0b; }
    .gb-br-btn { cursor: pointer; background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1); color: #888;
      font-size: 11px; padding: 4px 10px; border-radius: 6px;
      transition: background 0.2s; }
    .gb-br-btn:hover { background: rgba(255,255,255,0.1); }
    .gb-br-btn.ext { background: rgba(99,102,241,0.14);
      border-color: rgba(99,102,241,0.28); color: #8b8cf5; }
    .gb-br-btn.ext:hover { background: rgba(99,102,241,0.24); }
    .gb-br-btn.lock { background: rgba(239,68,68,0.12);
      border-color: rgba(239,68,68,0.25); color: #ef4444; }
    .gb-br-body { flex: 1; position: relative; overflow: hidden; }
    .gb-br-iframe { width: 100%; height: 100%; border: none; display: block; }
    .gb-br-load { position: absolute; inset: 0; display: flex;
      flex-direction: column; align-items: center; justify-content: center;
      background: #0b0b14; gap: 14px; pointer-events: none;
      transition: opacity 0.4s; }
    .gb-br-load.hidden { opacity: 0; pointer-events: none; }
    .gb-br-spin { width: 34px; height: 34px; border: 3px solid rgba(99,102,241,0.18);
      border-top-color: #6366f1; border-radius: 50%;
      animation: spin 0.8s linear infinite; }
    .gb-br-load-txt { font-size: 12px; color: #555; }
    .gb-br-load-url { font-size: 11px; color: #3a3a55; max-width: 80%;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .gb-br-blocked { position: absolute; inset: 0; display: none;
      flex-direction: column; align-items: center; justify-content: center;
      background: #0f0f1a; padding: 40px 20px; text-align: center;
      gap: 12px; animation: fadeIn 0.3s ease; }
    .gb-br-blocked.show { display: flex; }
    .gb-br-blocked-icon { font-size: 42px; }
    .gb-br-blocked-title { font-size: 15px; font-weight: 700; color: #ef4444; }
    .gb-br-blocked-desc { font-size: 12px; color: #4a4a65; max-width: 340px; line-height: 1.8; }
    .gb-br-open-btn { display: inline-block; padding: 9px 24px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: #fff; border-radius: 9px; font-size: 13px; font-weight: 700;
      text-decoration: none; cursor: pointer; border: none;
      box-shadow: 0 4px 14px rgba(99,102,241,0.33); transition: opacity 0.2s; }
    .gb-br-open-btn:hover { opacity: 0.9; }
  `
  document.head.appendChild(style)

  const wrap = document.createElement('div')
  wrap.className = 'gb-br'
  wrap.innerHTML =
    '<div class="gb-br-bar">' +
      '<div class="gb-br-left">' +
        '<span class="gb-br-icon">&#x1F310;</span>' +
        '<span class="gb-br-title">全球内置</span>' +
        '<span class="gb-br-badge">已解锁</span>' +
      '</div>' +
      '<div class="gb-br-right">' +
        '<span class="gb-br-status" id="t-br-status">&#x1F504; 等待加载</span>' +
        '<button class="gb-br-btn" id="t-br-refresh">&#x21BB; 刷新</button>' +
        '<button class="gb-br-btn lock" id="t-br-lock">&#x1F512; 锁定</button>' +
        '<a class="gb-br-btn ext" href="' + TARGET_URL + '" target="_blank" rel="noopener">&#x1F517; 外部</a>' +
      '</div>' +
    '</div>' +
    '<div class="gb-br-body" id="t-br-body">' +
      '<div class="gb-br-load" id="t-br-load">' +
        '<div class="gb-br-spin"></div>' +
        '<div class="gb-br-load-txt">正在连接全球服务器...</div>' +
        '<div class="gb-br-load-url">' + TARGET_URL + '</div>' +
      '</div>' +
      '<div class="gb-br-blocked" id="t-br-blocked">' +
        '<div class="gb-br-blocked-icon">&#x26A0;&#xFE0F;</div>' +
        '<div class="gb-br-blocked-title">页面无法在应用内加载</div>' +
        '<div class="gb-br-blocked-desc">目标网站设置了安全策略（X-Frame-Options 或 CSP），<br>不允许在 iframe 中嵌入。可在浏览器中打开。</div>' +
        '<a class="gb-br-open-btn" href="' + TARGET_URL + '" target="_blank" rel="noopener">&#x1F517; 在浏览器中打开</a>' +
      '</div>' +
      '<iframe id="t-br-iframe" class="gb-br-iframe" allow="fullscreen"></iframe>' +
    '</div>'

  container.appendChild(wrap)

  const iframe = wrap.querySelector('#t-br-iframe')
  const statusEl = wrap.querySelector('#t-br-status')
  const loadingEl = wrap.querySelector('#t-br-load')
  const blockedEl = wrap.querySelector('#t-br-blocked')

  let loadTimer = null
  let loadFired = false

  function setStatus(text, cls) {
    statusEl.textContent = text
    statusEl.className = 'gb-br-status ' + (cls || '')
  }

  function showBlocked() {
    loadingEl.classList.add('hidden')
    iframe.style.display = 'none'
    blockedEl.classList.add('show')
    setStatus('&#x26D4; 加载被拦截', 'fail')
  }

  function startLoad() {
    loadFired = false
    loadingEl.classList.remove('hidden')
    iframe.style.display = 'block'
    blockedEl.classList.remove('show')
    setStatus('&#x1F504; 加载中...', 'loading')
    clearTimeout(loadTimer)
    loadTimer = setTimeout(function() {
      if (!loadFired) showBlocked()
    }, LOAD_TIMEOUT)
  }

  iframe.addEventListener('load', function() {
    loadFired = true
    clearTimeout(loadTimer)
    try {
      const doc = iframe.contentDocument
      if (doc && doc.body && doc.body.innerHTML.length > 100) {
        loadingEl.classList.add('hidden')
        setStatus('&#x2705; 已加载', 'ok')
      } else {
        showBlocked()
      }
    } catch(e) {
      loadingEl.classList.add('hidden')
      setStatus('&#x2705; 已加载', 'ok')
    }
  })

  iframe.addEventListener('error', function() {
    loadFired = true
    clearTimeout(loadTimer)
    showBlocked()
  })

  wrap.querySelector('#t-br-refresh').addEventListener('click', function() {
    startLoad()
    iframe.src = TARGET_URL + '?r=' + Date.now()
  })

  wrap.querySelector('#t-br-lock').addEventListener('click', function() {
    sessionStorage.removeItem(LOCK_KEY)
    renderLockView(container, unlock)
  })

  startLoad()
  iframe.src = TARGET_URL
}

// ─────────────────────────────────────────────
//  主入口
// ─────────────────────────────────────────────
export default function render(container) {
  const root = container || document.body
  root.innerHTML = ''

  function unlock() {
    renderBrowserView(root)
  }

  if (sessionStorage.getItem(LOCK_KEY) === '1') {
    renderBrowserView(root)
  } else {
    renderLockView(root, unlock)
  }

  return root
}
