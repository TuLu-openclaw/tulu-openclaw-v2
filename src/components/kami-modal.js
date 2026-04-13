// =============================================
//  微验卡密验证弹框组件
//  功能：卡密输入 + 公告栏 + 记住卡密 + 显隐密码 + 验证状态
// =============================================

import { login, revalidate, getStoredKami, saveKami, markVerified, getLastVerifiedTime, getNotice, KAMI_CONFIG } from '../lib/kami.js'
import { _hideSplash } from '../main.js'

const STORAGE_REMEMBER = 'tulu_kami_remember'

let _currentResolve = null
let _modalEl = null
let _verifyTimer = null
let _pendingKami = null

// =============================================
//  定时重验（5分钟一次）
// =============================================
function startPeriodicCheck(kami) {
  if (_verifyTimer) clearInterval(_verifyTimer)
  _pendingKami = kami
  _verifyTimer = setInterval(async function() {
    if (!_pendingKami) return
    var result = await revalidate(_pendingKami)
    if (!result.success) showBlockOverlay()
  }, KAMI_CONFIG.checkIntervalMs)
}

function stopPeriodicCheck() {
  if (_verifyTimer) {
    clearInterval(_verifyTimer)
    _verifyTimer = null
  }
  _pendingKami = null
}

// =============================================
//  全局拦截遮罩（验证失败时）
// =============================================
function showBlockOverlay() {
  stopPeriodicCheck()
  var existing = document.getElementById('kami-block-overlay')
  if (existing) existing.remove()

  var overlay = document.createElement('div')
  overlay.id = 'kami-block-overlay'
  overlay.style.cssText =
    'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;' +
    'background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif'

  overlay.innerHTML =
    '<div style="text-align:center;max-width:400px;padding:40px">' +
      '<div style="font-size:64px;margin-bottom:20px">&#x1F512;</div>' +
      '<div style="font-size:22px;font-weight:700;color:#ef4444;margin-bottom:12px">验证失败</div>' +
      '<div style="font-size:15px;color:#999;margin-bottom:8px">' + KAMI_CONFIG.errorMessage + '</div>' +
      '<div style="font-size:12px;color:#555;margin-bottom:32px">卡密验证已失效，请重新验证</div>' +
      '<button id="kami-block-retry" style="padding:12px 36px;font-size:15px;font-weight:600;color:#fff;' +
        'background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;border-radius:10px;' +
        'cursor:pointer;box-shadow:0 4px 14px rgba(99,102,241,0.4)">重新验证</button>' +
    '</div>'

  document.body.appendChild(overlay)
  document.getElementById('kami-block-retry').addEventListener('click', function() {
    overlay.remove()
    showKamiModal()
  })
}

// =============================================
//  构建弹框 HTML（不使用模板字符串，避免 Vite 解析 emoji 报错）
// =============================================
function buildModalHTML(initialKami, showPw, remembered, noticeText) {
  var pwType = showPw ? 'text' : 'password'
  var toggleTitle = showPw ? '隐藏密码' : '显示密码'
  var checkedAttr = remembered ? 'checked' : ''
  var inputVal = initialKami ? ' value="' + initialKami + '"' : ''

  // 公告区域（始终存在，动态内容由 JS 填充）
  var noticeHTML =
    '<div id="kami-announcement" style="' +
      'background:rgba(99,102,241,0.08);' +
      'border:1px solid rgba(99,102,241,0.2);' +
      'border-radius:8px;padding:10px 14px;margin-bottom:20px;' +
      'font-size:13px;color:#a5b4fc;line-height:1.6;' +
      'display:flex;align-items:flex-start;gap:8px">' +
      '<span style="flex-shrink:0;margin-top:1px">&#x1F4E3;</span>' +
      '<span id="kami-notice-text">' + (noticeText || '验证通过后即可使用全部功能，卡密问题请联系 QQ：2552667173') + '</span>' +
    '</div>'

  return '<style>@keyframes spin{to{transform:rotate(360deg)}}</style>' +
    '<div style="' +
      'background:#1a1a2e;border-radius:16px;padding:36px;width:380px;max-width:90vw;' +
      'box-shadow:0 24px 80px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.08)">' +

      noticeHTML +

      '<div style="text-align:center;margin-bottom:28px">' +
        '<div style="font-size:48px;margin-bottom:12px">&#x1F510;</div>' +
        '<div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:6px">屠戮授权验证</div>' +
        '<div style="font-size:12px;color:#666">请输入卡密以继续使用</div>' +
      '</div>' +

      '<div style="margin-bottom:16px">' +
        '<div style="color:#888;font-size:12px;margin-bottom:8px">卡密</div>' +
        '<div style="position:relative">' +
          '<input id="kami-input" type="' + pwType + '" placeholder="请输入卡密" autocomplete="off"' + inputVal +
            ' style="width:100%;padding:12px 44px 12px 14px;box-sizing:border-box;' +
              'background:#16213e;border:1px solid rgba(99,102,241,0.3);border-radius:10px;' +
              'color:#fff;font-size:14px;outline:none;transition:border-color 0.2s">' +
          '<button id="kami-toggle-vis" title="' + toggleTitle + '"' +
            ' style="position:absolute;right:10px;top:50%;transform:translateY(-50%);' +
              'background:none;border:none;color:#666;cursor:pointer;font-size:16px;padding:4px;line-height:1">' +
            (showPw ? '&#x1F648;' : '&#x1F441;') +
          '</button>' +
        '</div>' +
      '</div>' +

      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">' +
        '<label style="display:flex;align-items:center;cursor:pointer;user-select:none">' +
          '<input id="kami-remember" type="checkbox" ' + checkedAttr +
            ' style="width:15px;height:15px;margin-right:8px;accent-color:#6366f1;cursor:pointer">' +
          '<span style="font-size:12px;color:#888">记住卡密</span>' +
        '</label>' +
        '<a href="http://wpa.qq.com/msgrd?v=3&uin=2552667173&site=qq&menu=yes" target="_blank" rel="noopener"' +
          ' style="font-size:11px;color:#6366f1;text-decoration:none">购买卡密 &#x2192;</a>' +
      '</div>' +

      '<button id="kami-verify-btn" style="' +
        'width:100%;padding:13px;font-size:15px;font-weight:700;color:#fff;' +
        'background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;border-radius:10px;' +
        'cursor:pointer;transition:opacity 0.2s;box-shadow:0 4px 14px rgba(99,102,241,0.35)">验证卡密</button>' +

      '<div id="kami-error" style="margin-top:12px;text-align:center;font-size:12px;color:#ef4444;min-height:16px"></div>' +

      '<div style="margin-top:20px;text-align:center">' +
        '<a href="http://wpa.qq.com/msgrd?v=3&uin=2552667173&site=qq&menu=yes" target="_blank" rel="noopener"' +
          ' style="font-size:11px;color:#555;text-decoration:none">屠戮官方 &middot; 卡密系统</a>' +
      '</div>' +
    '</div>'
}

// =============================================
//  显示弹框
// =============================================
async function showKamiModal(isRetry) {
  _hideSplash()
  if (_modalEl) _modalEl.remove()

  var storedKami = getStoredKami()
  var remembered = localStorage.getItem(STORAGE_REMEMBER) === 'true'
  var initialKami = (!isRetry && remembered) ? (storedKami || '') : ''
  var showPw = (!isRetry && remembered)

  // 先用空公告占位，异步填充
  _modalEl = document.createElement('div')
  _modalEl.id = 'kami-verify-overlay'
  _modalEl.style.cssText =
    'position:fixed;top:0;left:0;right:0;bottom:0;z-index:100000;' +
    'background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
    'backdrop-filter:blur(8px)'

  _modalEl.innerHTML = buildModalHTML(initialKami, showPw, remembered, null)
  document.body.appendChild(_modalEl)

  // 异步获取并填充真实公告
  getNotice().then(function(noticeText) {
    var el = document.getElementById('kami-notice-text')
    if (el && noticeText) el.textContent = noticeText
  }).catch(function() { /* 网络失败则保留默认文案 */ })

  var inputEl = document.getElementById('kami-input')
  var toggleBtn = document.getElementById('kami-toggle-vis')
  var rememberEl = document.getElementById('kami-remember')
  var verifyBtn = document.getElementById('kami-verify-btn')
  var errorEl = document.getElementById('kami-error')

  if (initialKami) inputEl.value = initialKami
  setTimeout(function() { inputEl.focus() }, 50)

  // 密码显隐切换
  var isPasswordVisible = !showPw
  toggleBtn.addEventListener('click', function() {
    isPasswordVisible = !isPasswordVisible
    inputEl.type = isPasswordVisible ? 'text' : 'password'
    toggleBtn.innerHTML = isPasswordVisible ? '&#x1F648;' : '&#x1F441;'
    toggleBtn.title = isPasswordVisible ? '隐藏密码' : '显示密码'
  })

  inputEl.addEventListener('focus', function() {
    inputEl.style.borderColor = 'rgba(99,102,241,0.7)'
  })
  inputEl.addEventListener('blur', function() {
    inputEl.style.borderColor = 'rgba(99,102,241,0.3)'
  })

  // 验证
  async function doVerify() {
    var kami = inputEl.value.trim()
    if (!kami) {
      errorEl.textContent = '请输入卡密'
      return
    }

    var remember = rememberEl.checked
    localStorage.setItem(STORAGE_REMEMBER, remember ? 'true' : 'false')
    if (!remember) localStorage.removeItem('tulu_kami')

    verifyBtn.disabled = true
    verifyBtn.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.7s linear infinite;vertical-align:middle;margin-right:8px"></span>验证中...'
    verifyBtn.style.cssText += ';opacity:0.7;cursor:not-allowed'
    errorEl.textContent = ''

    var result = await login(kami)

    if (result.success) {
      if (remember) saveKami(kami)
      markVerified(kami, result.time)
      _pendingKami = kami

      var card = _modalEl.querySelector('div[style*="background:#1a1a2e"]')
      if (card) {
        card.innerHTML =
          '<div style="text-align:center;padding:40px 0">' +
            '<div style="font-size:56px;margin-bottom:16px">&#x2705;</div>' +
            '<div style="font-size:18px;font-weight:700;color:#22c55e;margin-bottom:10px">验证成功</div>' +
            '<div style="font-size:13px;color:#888">正在进入应用...</div>' +
          '</div>'
      }

      setTimeout(function() {
        if (_modalEl) { _modalEl.remove(); _modalEl = null }
        startPeriodicCheck(kami)
        if (_currentResolve) {
          var r = _currentResolve; _currentResolve = null; r()
        }
      }, 1000)
    } else {
      errorEl.textContent = result.error || '验证失败，卡密无效或已过期'
      verifyBtn.disabled = false
      verifyBtn.innerHTML = '验证卡密'
      verifyBtn.style.cssText =
        'width:100%;padding:13px;font-size:15px;font-weight:700;color:#fff;' +
        'background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;border-radius:10px;' +
        'cursor:pointer;transition:opacity 0.2s;box-shadow:0 4px 14px rgba(99,102,241,0.35)'
    }
  }

  verifyBtn.addEventListener('click', doVerify)
  inputEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doVerify()
  })
}

// =============================================
//  外部调用入口
// =============================================
export function showKamiVerifyModal() {
  return new Promise(function(resolve) {
    _currentResolve = resolve
    showKamiModal(false)
  })
}

export function showKamiRetryModal() {
  if (_modalEl) _modalEl.remove()
  _modalEl = null
  return new Promise(function(resolve) {
    _currentResolve = resolve
    showKamiModal(true)
  })
}

export function destroyKamiModal() {
  stopPeriodicCheck()
  if (_modalEl) { _modalEl.remove(); _modalEl = null }
  var block = document.getElementById('kami-block-overlay')
  if (block) block.remove()
}
