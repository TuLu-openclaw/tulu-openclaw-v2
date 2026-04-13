import '../style/movie-tool.css';

const URL = 'https://zh.stripcam.xxx/top/girls/current-month-asia-and-pacific'
const LOCK_KEY = 'tulu_comingsoon_locked'
const CORRECT_PWD = '2552667173'

/**
 * 渲染入口 — 接收路由容器，渲染到容器内部
 */
export default function render(container) {
  const root = container || document.body

  function doRender() {
    if (localStorage.getItem(LOCK_KEY) !== '1') {
      renderLockScreen(root)
      return
    }
    renderUnlockedPage(root)
  }

  doRender()
  return root
}

// =============================================
//  锁屏页面
// =============================================
function renderLockScreen(root) {
  root.innerHTML =
    '<style>' +
      '@keyframes lockPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }' +
      '@keyframes lockShake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-6px)} 40%,80%{transform:translateX(6px)} }' +
      '.lock-screen { min-height:100vh;display:flex;align-items:center;justify-content:center;' +
        'background:linear-gradient(135deg,#0a0a1a 0%,#1a1a2e 50%,#0a0a1a 100%);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif }' +
      '.lock-box { text-align:center;padding:48px 40px;background:rgba(255,255,255,0.03);' +
        'border:1px solid rgba(255,255,255,0.08);border-radius:20px;backdrop-filter:blur(20px);' +
        'box-shadow:0 24px 80px rgba(0,0,0,0.5);width:360px;max-width:90vw }' +
      '.lock-icon { font-size:72px;margin-bottom:20px;display:inline-block;animation:lockPulse 2s ease-in-out infinite }' +
      '.lock-title { font-size:22px;font-weight:700;color:#fff;margin-bottom:8px }' +
      '.lock-sub { font-size:13px;color:#666;margin-bottom:32px }' +
      '.lock-input-wrap { position:relative;margin-bottom:16px }' +
      '.lock-input { width:100%;padding:14px 16px;box-sizing:border-box;background:rgba(255,255,255,0.05);' +
        'border:1px solid rgba(255,255,255,0.1);border-radius:12px;color:#fff;font-size:15px;outline:none;' +
        'transition:border-color 0.2s;text-align:center;letter-spacing:4px }' +
      '.lock-input:focus { border-color:rgba(99,102,241,0.6) }' +
      '.lock-error { font-size:12px;color:#ef4444;margin-bottom:12px;min-height:16px;animation:lockShake 0.4s ease }' +
      '.lock-btn { width:100%;padding:14px;border:none;border-radius:12px;background:linear-gradient(135deg,#6366f1,#8b5cf6);' +
        'color:#fff;font-size:15px;font-weight:700;cursor:pointer;transition:opacity 0.2s;box-shadow:0 4px 14px rgba(99,102,241,0.35) }' +
      '.lock-btn:hover { opacity:0.9 }' +
      '.lock-btn:active { transform:scale(0.98) }' +
      '.lock-footer { margin-top:24px;font-size:11px;color:#444 }' +
    '</style>' +
    '<div class="lock-screen">' +
      '<div class="lock-box">' +
        '<div class="lock-icon">&#x1F512;</div>' +
        '<div class="lock-title">&#x5F85;&#x5F00;&#x653E;&#x529F;&#x80FD;</div>' +
        '<div class="lock-sub">&#x8BF7;&#x8F93;&#x5165;&#x8BBF;&#x95EE;&#x5BC6;&#x7801;</div>' +
        '<div class="lock-input-wrap">' +
          '<input type="password" id="t-lock-pwd" class="lock-input" placeholder="&#x5BC6;&#x7801;" maxlength="20" autocomplete="off" />' +
        '</div>' +
        '<div class="lock-error" id="t-lock-err"></div>' +
        '<button class="lock-btn" id="t-lock-btn">&#x89E3;&#x9501;&#x8FDB;&#x5165;</button>' +
        '<div class="lock-footer">&#x5C0F;&#x63D0;&#x793A;&#xFF1A;&#x5BC6;&#x7801;&#x4E3A;&#x6388;&#x6743;&#x7801;&#xFF0C;&#x8BF7;&#x8054;&#x7CFB; QQ&#xFF1A;2552667173</div>' +
      '</div>' +
    '</div>'

  var input = root.querySelector('#t-lock-pwd')
  var btn = root.querySelector('#t-lock-btn')
  var err = root.querySelector('#t-lock-err')

  function tryUnlock() {
    if (input.value === CORRECT_PWD) {
      localStorage.setItem(LOCK_KEY, '1')
      doRender()
    } else {
      err.textContent = '密码错误，请重试'
      err.style.animation = 'none'
      void err.offsetWidth
      err.style.animation = 'lockShake 0.4s ease'
      input.value = ''
      input.focus()
    }
  }

  btn.addEventListener('click', tryUnlock)
  input.addEventListener('keydown', function(e) { if (e.key === 'Enter') tryUnlock() })
  setTimeout(function() { input.focus() }, 100)

  function doRender() {
    root.innerHTML = ''
    renderUnlockedPage(root)
  }
}

// =============================================
//  解锁后的 iframe 页面
// =============================================
function renderUnlockedPage(root) {
  root.innerHTML =
    '<style>' +
      '.coming-wrap { display:flex;flex-direction:column;height:100vh;background:#0d0d1a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif }' +
      '.coming-toolbar { padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:space-between;flex-shrink:0 }' +
      '.coming-toolbar-left { display:flex;align-items:center;gap:10px }' +
      '.coming-icon { font-size:20px }' +
      '.coming-title { font-size:15px;font-weight:600;color:#fff }' +
      '.coming-badge { font-size:10px;background:rgba(34,197,94,0.15);color:#22c55e;padding:2px 8px;border-radius:10px;border:1px solid rgba(34,197,94,0.3) }' +
      '.coming-lock-btn { cursor:pointer;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.25);' +
        'color:#ef4444;padding:5px 12px;border-radius:6px;font-size:12px }' +
      '.coming-content { flex:1;position:relative;overflow:hidden }' +
      '.coming-iframe { width:100%;height:100%;border:none;display:block }' +
      '.coming-fallback { position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'background:#12121a;padding:40px 20px;text-align:center }' +
      '.coming-fallback-icon { font-size:48px;margin-bottom:16px }' +
      '.coming-fallback-title { font-size:15px;color:#ef4444;font-weight:600;margin-bottom:10px }' +
      '.coming-fallback-desc { font-size:13px;color:#555;margin-bottom:20px }' +
      '.coming-open-btn { display:inline-block;padding:10px 24px;background:linear-gradient(135deg,#6366f1,#8b5cf6);' +
        'color:#fff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;cursor:pointer;border:none }' +
    '</style>' +
    '<div class="coming-wrap">' +
      '<div class="coming-toolbar">' +
        '<div class="coming-toolbar-left">' +
          '<span class="coming-icon">&#x1F512;</span>' +
          '<span class="coming-title">&#x5F85;&#x5F00;&#x653E;&#x529F;&#x80FD;</span>' +
          '<span class="coming-badge">&#x5DF2;&#x89E3;&#x9501;</span>' +
        '</div>' +
        '<button class="coming-lock-btn" id="t-lock-logout">&#x1F512; &#x9501;&#x5B9A;</button>' +
      '</div>' +
      '<div class="coming-content" id="t-content">' +
        '<iframe id="coming-iframe" class="coming-iframe" src="' + URL + '" allow="fullscreen"></iframe>' +
        '<div class="coming-fallback" id="t-fallback" style="display:none">' +
          '<div class="coming-fallback-icon">&#x1F310;</div>' +
          '<div class="coming-fallback-title">&#x94FE;&#x63A5;&#x5DF2;&#x88AB;&#x62E6;&#x622A;</div>' +
          '<div class="coming-fallback-desc">&#x76EE;&#x6807;&#x7F51;&#x7AD9;&#x8BBE;&#x7F6E;&#x4E86; X-Frame-Options &#x6216; CSP &#x4FDD;&#x62A4;&#xFF0C;&#x65E0;&#x6CD5;&#x5728; iframe &#x5185;&#x90E8;&#x52A0;&#x8F7D;</div>' +
          '<a class="coming-open-btn" href="' + URL + '" target="_blank" rel="noopener">&#x1F517; &#x5728;&#x6D4F;&#x89C8;&#x5668;&#x4E2D;&#x6253;&#x5F00;</a>' +
        '</div>' +
      '</div>' +
    '</div>'

  var iframe = root.querySelector('#coming-iframe')
  var fallback = root.querySelector('#t-fallback')

  // 8 秒后若 iframe 未触发 load 事件，显示 fallback
  var timer = setTimeout(function() {
    iframe.style.display = 'none'
    fallback.style.display = 'flex'
  }, 8000)

  iframe.addEventListener('load', function() {
    clearTimeout(timer)
  })
  iframe.addEventListener('error', function() {
    clearTimeout(timer)
    iframe.style.display = 'none'
    fallback.style.display = 'flex'
  })

  root.querySelector('#t-lock-logout').addEventListener('click', function() {
    localStorage.removeItem(LOCK_KEY)
    root.innerHTML = ''
    renderLockScreen(root)
  })
}
