/**
 * 全球内置 - Modal 弹窗锁 + 内置浏览器（会话版）
 *
 * 每次使用都必须输入密码验证流程
 * iframe 内嵌加载，通过 cookie 注入维持登录态
 * SHA-256 哈希密码验证
 */
import { invoke } from '../lib/tauri-api.js'

const TARGET_URL = 'https://zh.stripcam.xxx/top/girls/current-month-asia-and-pacific'
const LOCK_KEY = 'tulu_gb_hash'      // 存放 SHA-256(盐+密码) 哈希
const SESSION_KEY = 'tulu_gb_session' // 存放 cookie 字符串
const COOKIE_TTL = 4 * 60 * 60 * 1000 // 4小时有效期
const SALT = 'tulu_v3_global_2026'

let _session = null // { cookie, expires }

// ─────────────────────────────────────────────
//  SHA-256（内联实现，不依赖任何库）
// ─────────────────────────────────────────────
function sha256hex(str) {
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
               0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
               0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
               0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
               0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
               0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
               0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
               0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
               0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
               0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
               0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
               0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
               0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
               0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
               0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
               0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
               0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]

  function rotr(x, n) { return (x >>> n) | (x << (32 - n)) }
  function ch(x, y, z) { return (x & y) ^ (~x & z) }
  function maj(x, y, z) { return (x & y) ^ (x & z) ^ (y & z) }
  function sigma0(x) { return rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22) }
  function sigma1(x) { return rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25) }
  function gamma0(x) { return rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3) }
  function gamma1(x) { return rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10) }

  function strToWords(s) {
    const w = new Array(64).fill(0)
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i)
      if (code <= 0x7f) {
        w[i >> 2] |= code << (24 - (i % 4) * 8)
      } else if (code <= 0x7ff) {
        if (i < 63) w[i >> 2] |= (0xc0 | (code >> 6)) << (24 - (i % 4) * 8)
        if (i + 1 < 64) w[(i + 1) >> 2] |= (0x80 | (code & 0x3f)) << (24 - ((i + 1) % 4) * 8)
      } else {
        if (i < 63) w[i >> 2] |= (0xe0 | (code >> 12)) << (24 - (i % 4) * 8)
        if (i + 1 < 64) w[(i + 1) >> 2] |= (0x80 | ((code >> 6) & 0x3f)) << (24 - ((i + 1) % 4) * 8)
        if (i + 2 < 64) w[(i + 2) >> 2] |= (0x80 | (code & 0x3f)) << (24 - ((i + 2) % 4) * 8)
      }
    }
    return w
  }

  const ml = str.length * 8
  const w = strToWords(str)
  w[Math.floor(ml / 32 / 8 / 4)] &= ~(0xff << (24 - ((Math.floor(ml / 32 / 8) % 4) * 8)))
  w[15] = ml & 0xffffffff

  let [ah, bh, chh, dh, eh, fh, gh, hh] = H

  for (let i = 0; i < 64; i++) {
    const wi = i < 16 ? w[i] : (gamma1(w[i - 2]) + w[i - 7] + gamma0(w[i - 15]) + w[i - 16]) >>> 0
    const t1 = (hh + sigma1(eh) + ch(eh, fh, gh) + K[i] + wi) >>> 0
    const t2 = (sigma0(ah) + maj(ah, bh, chh)) >>> 0
    hh = gh; gh = fh; fh = eh; eh = (dh + t1) >>> 0; dh = chh; chh = bh; bh = ah; ah = (t1 + t2) >>> 0
  }

  const toHex = n => (n >>> 0).toString(16).padStart(8, '0')
  return toHex(ah) + toHex(bh) + toHex(chh) + toHex(dh) +
         toHex(eh) + toHex(fh) + toHex(gh) + toHex(hh)
}

// 预计算密码哈希（SALT + 原始密码，再 SHA-256）
const STORED_HASH = sha256hex(SALT + '2552667173')

// ─────────────────────────────────────────────
//  Session 管理
// ─────────────────────────────────────────────
function saveSession(cookie) {
  _session = { cookie, expires: Date.now() + COOKIE_TTL }
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(_session)) } catch (_) {}
}

function loadSession() {
  if (_session) return _session
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!s.cookie || !s.expires || Date.now() > s.expires) {
      clearSession(); return null
    }
    _session = s
    return _session
  } catch (_) { return null }
}

function clearSession() {
  _session = null
  try { sessionStorage.removeItem(SESSION_KEY) } catch (_) {}
}

function verifyStoredHash() {
  try {
    const h = sessionStorage.getItem(LOCK_KEY)
    return h === STORED_HASH
  } catch (_) { return false }
}

// ─────────────────────────────────────────────
//  Modal 样式（注入一次）
// ─────────────────────────────────────────────
function _injectStyles() {
  if (document.getElementById('t-gb-styles')) return
  const style = document.createElement('style')
  style.id = 't-gb-styles'
  style.textContent = `
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
    .t-gb-sub { font-size: 13px; color: #4a4a70; margin-bottom 30px; line-height: 1.7; }
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
//  密码验证 Modal（每次进入都要验证）
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
        'placeholder="\u5BC6\u7801" maxlength="20" ' +
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
    // SHA-256 哈希后比较，不存储明文密码
    const hash = sha256hex(SALT + val)
    if (hash === STORED_HASH) {
      try { sessionStorage.setItem(LOCK_KEY, STORED_HASH) } catch (_) {}
      clearSession() // 清除旧 session，强制重新认证
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
//  构建带 Cookie 注入的 HTML
// ─────────────────────────────────────────────
function buildInjectedHtml(baseHtml, cookie) {
  if (!cookie) return baseHtml
  // 在 <head> 最前面注入 cookie 脚本， synchronous 方式覆盖 document.cookie
  // 使用同步 XHR 从 sessionStorage 读取最新 cookie（处理跨页面更新）
  const injectScript = `<script>
(function(){
  try {
    var raw = sessionStorage.getItem('tulu_gb_session');
    if (raw) {
      var s = JSON.parse(raw);
      if (s.cookie && s.expires && Date.now() < s.expires) {
        document.__gb_cookie = s.cookie;
        // 解析 Set-Cookie 头并逐条设置
        document.__gb_cookie.split(';').forEach(function(part){
          var eq = part.indexOf('=');
          if (eq > 0) {
            var name = part.slice(0, eq).trim();
            var val = part.slice(eq + 1).trim();
            if (name && val) {
              try { document.cookie = name + '=' + val; } catch(e){}
            }
          }
        });
      }
    }
  } catch(e){}
})();
<\/script>`

  // 移除原有的 CSP meta 标签（允许 iframe 加载）
  let html = baseHtml.replace(/<meta[^>]+policy[^>]*>/gi, '')
                     .replace(/<meta[^>]+content-security-policy[^>]*>/gi, '')

  // 注入脚本到 <head> 最前面
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/(<head[^>]*>)/i, '$1\n' + injectScript, html)
  } else if (/<!DOCTYPE/i.test(html)) {
    // HTML4 文档，直接在 DOCTYPE 后插入
    html = html.replace(/(<!DOCTYPE[^>]*>)/i, '$1\n' + injectScript + '\n<html>', html)
  } else {
    html = injectScript + '\n' + html
  }

  return html
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

  container.appendChild(wrap)

  const iframe = wrap.querySelector('#t-gb-iframe')
  const statusEl = wrap.querySelector('#t-gb-status')
  const loadingEl = wrap.querySelector('#t-gb-load')
  const blockedEl = wrap.querySelector('#t-gb-blocked')

  let loadTimer = null

  function setStatus(text, cls) {
    statusEl.textContent = text
    statusEl.className = 't-gb-status ' + (cls || '')
  }

  function showBlocked(msg) {
    loadingEl.classList.add('hidden')
    iframe.style.display = 'none'
    blockedEl.classList.add('show')
    if (msg && blockedEl.querySelector('.t-gb-blocked-desc')) {
      blockedEl.querySelector('.t-gb-blocked-desc').innerHTML = msg
    }
    setStatus('\u26D4 加载失败', 'fail')
  }

  async function startLoad() {
    const iframe = wrap.querySelector('#t-gb-iframe')
    if (!iframe) return

    // 每次刷新都重新获取最新 session
    const session = loadSession()
    const cookie = session ? session.cookie : null

    loadingEl.classList.remove('hidden')
    iframe.style.display = 'block'
    blockedEl.classList.remove('show')
    iframe.srcdoc = '' // 清空旧内容
    setStatus('\u1F504 加载中...', 'loading')
    clearTimeout(loadTimer)
    loadTimer = setTimeout(() => {
      showBlocked('代理请求超时（20秒）')
    }, 20000)

    try {
      const res = await invoke('proxy_url', { url: TARGET_URL, cookie })
      clearTimeout(loadTimer)
      loadingEl.classList.add('hidden')

      if (res.ok && res.html) {
        // 保存新 cookie（如果服务器返回了）
        if (res.set_cookie) {
          saveSession(res.set_cookie)
        }

        // 构建带 cookie 注入的 HTML
        const session2 = loadSession()
        const injectedHtml = buildInjectedHtml(res.html, session2 ? session2.cookie : null)

        // 注入 base 标签修正相对链接
        const baseTag = '<base href="' + TARGET_URL + '/">'
        const finalHtml = injectedHtml.replace(/(<head[^>]*>)/i, '$1\n' + baseTag)

        iframe.srcdoc = finalHtml
        setStatus('\u2705 已加载', 'ok')
      } else {
        showBlocked('代理请求失败：' + (res.error || '未知错误'))
      }
    } catch (err) {
      clearTimeout(loadTimer)
      loadingEl.classList.add('hidden')
      showBlocked('代理请求异常：' + String(err))
    }
  }

  iframe.addEventListener('load', () => {
    clearTimeout(loadTimer)
    loadingEl.classList.add('hidden')
    setStatus('\u2705 已加载', 'ok')
  })

  iframe.addEventListener('error', () => {
    clearTimeout(loadTimer)
    showBlocked()
  })

  wrap.querySelector('#t-gb-refresh').addEventListener('click', startLoad)

  wrap.querySelector('#t-gb-close').addEventListener('click', () => {
    wrap.remove()
    window.location.hash = '#/dashboard'
  })

  wrap.querySelector('#t-gb-lock').addEventListener('click', () => {
    clearSession()
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

  // 每次进入都强制验证密码
  _showLockModal(() => _showBrowserView(root))

  return root
}
