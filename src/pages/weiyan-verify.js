/**
 * 微验验证页面
 * 集成微验网络验证系统 (llua.cn)
 * appid=67696, appkey=sd47K5r8v7K0KsH0, rc4key=5361bf9449f83bd06d29325ee99d2d45, success=2552667173
 */
import { t } from '../lib/i18n.js'
import { api } from '../lib/tauri-api.js'

// 微验配置
const WEIYAN_CONFIG = {
  appid: '67696',
  appkey: 'sd47K5r8v7K0KsH0',
  rc4key: '5361bf9449f83bd06d29325ee99d2d45',
  success: '2552667173',
  apiUrl: 'https://llua.cn/api.php'
}

export function renderWeiyanVerify(el) {
  el.innerHTML = `
    <div class="page-header">
      <div class="page-title">${icon('verify', 20)} 微验验证</div>
      <div class="page-desc">微验网络验证系统 · 安全可靠的卡密验证解决方案</div>
    </div>
    <div class="verify-container">
      <div class="verify-card">
        <div class="verify-card-header">
          <span class="verify-badge">微验验证</span>
          <span class="verify-status online" id="wy-status">检测中...</span>
        </div>
        <div class="verify-card-body">
          <div class="wy-form">
            <div class="wy-form-group">
              <label>机器码</label>
              <input type="text" id="wy-machine-code" class="wy-input" placeholder="获取机器码中..." readonly>
            </div>
            <div class="wy-form-group">
              <label>卡密</label>
              <input type="text" id="wy-card-key" class="wy-input" placeholder="请输入卡密">
            </div>
            <div class="wy-form-actions">
              <button class="btn btn-primary" id="wy-btn-getmachine" onclick="getMachineCode()">获取机器码</button>
              <button class="btn btn-secondary" id="wy-btn-verify" onclick="doVerify()">验证卡密</button>
            </div>
            <div class="wy-result" id="wy-result"></div>
          </div>
          <div class="wy-info">
            <div class="wy-info-item">
              <span class="wy-info-label">接入说明</span>
              <span class="wy-info-value">使用卡密验证功能需要先获取机器码，然后使用卡密进行验证</span>
            </div>
            <div class="wy-info-item">
              <span class="wy-info-label">官方地址</span>
              <a href="https://llua.cn/" target="_blank" rel="noopener" class="wy-link">llua.cn</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  `

  injectWeiyanStyle()

  // 页面加载时自动获取机器码
  setTimeout(() => { if (window.getMachineCode) window.getMachineCode() }, 100)
  // 检测服务状态
  checkWeiyanStatus()
}

// 获取机器码
window.getMachineCode = async function() {
  const btn = document.getElementById('wy-btn-getmachine')
  const input = document.getElementById('wy-machine-code')
  if (!input) return
  try {
    btn && (btn.disabled = true)
    input.value = '获取中...'
    // 尝试通过Tauri获取机器码（CPU ID / 主板序列号等）
    if (window.__TAURI__) {
      const { invoke } = window.__TAURI__.core
      try {
        const machineId = await invoke('get_machine_id').catch(() => null)
        if (machineId) {
          input.value = machineId
          return
        }
      } catch {}
    }
    // 后备：使用浏览器指纹
    const fp = await getBrowserFingerprint()
    input.value = fp
  } catch(e) {
    input.value = '获取失败: ' + (e.message || String(e))
  } finally {
    btn && (btn.disabled = false)
  }
}

// 验证卡密
window.doVerify = async function() {
  const cardKey = document.getElementById('wy-card-key')?.value?.trim()
  const machineCode = document.getElementById('wy-machine-code')?.value?.trim()
  const resultEl = document.getElementById('wy-result')
  const btn = document.getElementById('wy-btn-verify')
  if (!cardKey || !machineCode) {
    resultEl.innerHTML = '<div class="wy-error">请填写卡密和机器码</div>'
    return
  }
  try {
    btn && (btn.disabled = true)
    resultEl.innerHTML = '<div class="wy-msg">验证中...</div>'

    // 调用微验API
    const params = new URLSearchParams({
      act: 'check',
      appid: WEIYAN_CONFIG.appid,
      appkey: WEIYAN_CONFIG.appkey,
      card: cardKey,
      machine: machineCode,
    })

    // RC4加密卡密
    const encryptedCard = rc4Encrypt(cardKey, WEIYAN_CONFIG.rc4key)
    params.set('card', encryptedCard)

    // 添加时间戳和签名
    const timestamp = Math.floor(Date.now() / 1000)
    params.set('time', timestamp)
    params.set('sign', md5(WEIYAN_CONFIG.appid + WEIYAN_CONFIG.appkey + timestamp))

    const resp = await fetch(WEIYAN_CONFIG.apiUrl + '?' + params.toString())
    const data = await resp.json().catch(() => ({ code: -1, msg: '网络错误' }))

    if (String(data.code) === WEIYAN_CONFIG.success) {
      resultEl.innerHTML = '<div class="wy-success">✅ 验证成功！卡密有效</div>'
    } else {
      resultEl.innerHTML = `<div class="wy-error">❌ 验证失败：${data.msg || '卡密无效或已过期'}</div>`
    }
  } catch(e) {
    resultEl.innerHTML = `<div class="wy-error">❌ 验证异常：${e.message}</div>`
  } finally {
    btn && (btn.disabled = false)
  }
}

// 检测微验服务状态
async function checkWeiyanStatus() {
  const statusEl = document.getElementById('wy-status')
  if (!statusEl) return
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const resp = await fetch('https://llua.cn/api.php?act=status&appid=' + WEIYAN_CONFIG.appid, {
      signal: controller.signal
    })
    clearTimeout(timeout)
    if (resp.ok) {
      statusEl.textContent = '服务正常'
      statusEl.className = 'verify-status online'
    } else {
      throw new Error('HTTP ' + resp.status)
    }
  } catch {
    statusEl.textContent = '服务异常'
    statusEl.className = 'verify-status offline'
  }
}

// 浏览器指纹
function getBrowserFingerprint() {
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || 'NA',
  ]
  return md5(components.join('|'))
}

// MD5
function md5(str) {
  function safeAdd(x, y) {
    const lsw = (x & 0xffff) + (y & 0xffff)
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16)
    return (msw << 16) | (lsw & 0xffff)
  }
  function bitRotateLeft(num, cnt) {
    return (num << cnt) | (num >>> (32 - cnt))
  }
  function md5cmn(q, a, b, x, s, t) {
    return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b)
  }
  function md5ff(a, b, c, d, x, s, t) {
    return md5cmn((b & c) | ((~b) & d), a, b, x, s, t)
  }
  function md5gg(a, b, c, d, x, s, t) {
    return md5cmn((b & d) | (c & (~d)), a, b, x, s, t)
  }
  function md5hh(a, b, c, d, x, s, t) {
    return md5cmn(b ^ c ^ d, a, b, x, s, t)
  }
  function md5ii(a, b, c, d, x, s, t) {
    return md5cmn(c ^ (b | (~d)), a, b, x, s, t)
  }
  function binlMD5(x, len) {
    x[len >> 5] |= 0x80 << (len % 32)
    x[(((len + 64) >>> 9) << 4) + 14] = len
    let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878
    for (let i = 0; i < x.length; i += 16) {
      const olda = a, oldb = b, oldc = c, oldd = d
      a = md5ff(a, b, c, d, x[i], 7, -680876936); d = md5ff(d, a, b, c, x[i + 1], 12, -389564586)
      c = md5ff(c, d, a, b, x[i + 2], 17, 606105819); b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330)
      a = md5ff(a, b, c, d, x[i + 4], 7, -176418897); d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426)
      c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341); b = md5ff(b, c, d, a, x[i + 7], 22, -45705983)
      a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416); d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417)
      c = md5ff(c, d, a, b, x[i + 10], 17, -42063); b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162)
      a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682); d = md5ff(d, a, b, c, x[i + 13], 12, -40341101)
      c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290); b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329)
      a = md5gg(a, b, c, d, x[i + 1], 5, -165796510); d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632)
      c = md5gg(c, d, a, b, x[i + 11], 14, 643717713); b = md5gg(b, c, d, a, x[i], 20, -373897302)
      a = md5gg(a, b, c, d, x[i + 5], 5, -701558691); d = md5gg(d, a, b, c, x[i + 10], 9, 38016083)
      c = md5gg(c, d, a, b, x[i + 15], 14, -660478335); b = md5gg(b, c, d, a, x[i + 4], 20, -405537848)
      a = md5gg(a, b, c, d, x[i + 9], 5, 568446438); d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690)
      c = md5gg(c, d, a, b, x[i + 3], 14, -187363961); b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501)
      a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467); d = md5gg(d, a, b, c, x[i + 2], 9, -51403784)
      c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473); b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734)
      a = md5hh(a, b, c, d, x[i + 5], 4, -378558); d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463)
      c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562); b = md5hh(b, c, d, a, x[i + 14], 23, -35309556)
      a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060); d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353)
      c = md5hh(c, d, a, b, x[i + 7], 16, -155497632); b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640)
      a = md5hh(a, b, c, d, x[i + 13], 4, 681279174); d = md5hh(d, a, b, c, x[i + 0], 11, -358537222)
      c = md5hh(c, d, a, b, x[i + 3], 16, -722521979); b = md5hh(b, c, d, a, x[i + 6], 23, 76029189)
      a = md5hh(a, b, c, d, x[i + 9], 4, -640364487); d = md5hh(d, a, b, c, x[i + 12], 11, -421815835)
      c = md5hh(c, d, a, b, x[i + 15], 16, 530742520); b = md5hh(b, c, d, a, x[i + 2], 23, -995338651)
      a = md5ii(a, b, c, d, x[i], 6, -198630844); d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415)
      c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905); b = md5ii(b, c, d, a, x[i + 5], 21, -57434055)
      a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571); d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606)
      c = md5ii(c, d, a, b, x[i + 10], 15, -1051523); b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799)
      a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359); d = md5ii(d, a, b, c, x[i + 15], 10, -30611744)
      c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380); b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649)
      a = md5ii(a, b, c, d, x[i + 4], 6, -145523070); d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379)
      c = md5ii(c, d, a, b, x[i + 2], 15, 718787259); b = md5ii(b, c, d, a, x[i + 9], 21, -343485551)
      a = safeAdd(a, olda); b = safeAdd(b, oldb); c = safeAdd(c, oldc); d = safeAdd(d, oldd)
    }
    return [a, b, c, d]
  }
  function binl2hex(binarray) {
    const hexTab = '0123456789abcdef'
    return String.fromCharCode(...Array.from(binarray).flatMap(b =>
      [hexTab[b >> 24 & 0xFF], hexTab[b >> 16 & 0xFF], hexTab[b >> 8 & 0xFF], hexTab[b & 0xFF]]
    ))
  }
  function str2binl(str) {
    const bin = []
    for (let i = 0; i < str.length * 8; i += 8) bin[i >> 5] |= (str.charCodeAt(i / 8) & 0xFF) << (i % 32)
    return bin
  }
  return binl2hex(binlMD5(str2binl(str), str.length * 8))
}

// RC4 加密
function rc4Encrypt(data, key) {
  let s = Array.from({ length: 256 }, (_, i) => i)
  let j = 0
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key.charCodeAt(i % key.length)) % 256
    ;[s[i], s[j]] = [s[j], s[i]]
  }
  let i = 0; j = 0
  return btoa(String.fromCharCode(...Array.from(data).map(c => {
    i = (i + 1) % 256
    j = (j + s[i]) % 256
    ;[s[i], s[j]] = [s[j], s[i]]
    return c.charCodeAt(0) ^ s[(s[i] + s[j]) % 256]
  })))
}

function injectWeiyanStyle() {
  if (document.getElementById('weiyan-page-style')) return
  const s = document.createElement('style')
  s.id = 'weiyan-page-style'
  s.textContent = `
    .verify-container { padding: 24px; max-width: 560px; margin: 0 auto; }
    .verify-card { background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--radius-lg); overflow: hidden; }
    .verify-card-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); background: var(--bg-tertiary); }
    .verify-badge { font-weight: 700; font-size: var(--font-size-md); color: var(--text-primary); }
    .verify-status { font-size: var(--font-size-xs); padding: 2px 8px; border-radius: 12px; }
    .verify-status.online { background: rgba(34,197,94,.15); color: #22c55e; }
    .verify-status.offline { background: rgba(239,68,68,.15); color: #ef4444; }
    .verify-card-body { padding: 24px 20px; }
    .wy-form { display: flex; flex-direction: column; gap: 14px; }
    .wy-form-group { display: flex; flex-direction: column; gap: 6px; }
    .wy-form-group label { font-size: var(--font-size-sm); font-weight: 600; color: var(--text-secondary); }
    .wy-input { padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-primary); color: var(--text-primary); font-size: var(--font-size-sm); }
    .wy-input:focus { outline: none; border-color: var(--accent, #6366f1); }
    .wy-form-actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .wy-result { margin-top: 4px; font-size: var(--font-size-sm); }
    .wy-success { padding: 8px 12px; background: rgba(34,197,94,.1); border: 1px solid rgba(34,197,94,.3); border-radius: var(--radius-md); color: #22c55e; }
    .wy-error { padding: 8px 12px; background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.3); border-radius: var(--radius-md); color: #ef4444; }
    .wy-msg { padding: 8px 12px; background: rgba(99,102,241,.1); border: 1px solid rgba(99,102,241,.3); border-radius: var(--radius-md); color: #6366f1; }
    .wy-info { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 10px; }
    .wy-info-item { display: flex; gap: 12px; font-size: var(--font-size-sm); }
    .wy-info-label { color: var(--text-tertiary); min-width: 70px; }
    .wy-info-value { color: var(--text-secondary); }
    .wy-link { color: var(--accent, #6366f1); text-decoration: none; }
    .wy-link:hover { text-decoration: underline; }
    .btn { padding: 7px 16px; border-radius: var(--radius-md); font-size: var(--font-size-sm); font-weight: 600; cursor: pointer; border: none; transition: all .2s; display: inline-flex; align-items: center; gap: 6px; }
    .btn-primary { background: linear-gradient(135deg,#6366f1,#8b5cf6); color: #fff; }
    .btn-primary:hover { opacity: 0.9; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary { background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border); }
    .btn-secondary:hover { background: var(--bg-secondary); }
    .btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
  `
  document.head.appendChild(s)
}

function icon(name, size = 16) {
  const icons = {
    'verify': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="${size}" height="${size}"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`,
  }
  return icons[name] || ''
}
