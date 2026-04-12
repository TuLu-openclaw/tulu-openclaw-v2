const KAMI_ANNOUNCEMENT = ''

/**
 * 微验卡密验证弹框组件
 * 功能：卡密输入 + 记住卡密 + 显示/隐藏密码 + 验证状态
 */

import { login, revalidate, getStoredKami, saveKami, clearStoredKami, markVerified, getLastVerifiedTime, KAMI_CONFIG } from '../lib/kami.js'
import { _hideSplash } from '../main.js'

const STORAGE_REMEMBER = 'tulu_kami_remember'

let _currentResolve = null
let _modalEl = null
let _verifyTimer = null
let _pendingKami = null  // 验证中但尚未成功的卡密
let _lastCheckTime = 0

/**
 * 5分钟定时重验
 */
function startPeriodicCheck(kami) {
  if (_verifyTimer) clearInterval(_verifyTimer)
  _lastCheckTime = Date.now()
  _pendingKami = kami
  _verifyTimer = setInterval(async () => {
    if (!_pendingKami) return
    // 后台静默重验，失败才弹窗
    const result = await revalidate(_pendingKami)
    if (!result.success) {
      showBlockOverlay()
    }
  }, KAMI_CONFIG.checkIntervalMs)
}

function stopPeriodicCheck() {
  if (_verifyTimer) {
    clearInterval(_verifyTimer)
    _verifyTimer = null
  }
  _pendingKami = null
}

/**
 * 全局拦截遮罩（验证失败时显示）
 */
function showBlockOverlay() {
  stopPeriodicCheck()
  if (document.getElementById('kami-block-overlay')) return

  // 移除可能存在的其他遮罩
  const existing = document.getElementById('kami-block-overlay')
  if (existing) existing.remove()

  const overlay = document.createElement('div')
  overlay.id = 'kami-block-overlay'
  overlay.style.cssText = `
    position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;
    background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif
  `
  overlay.innerHTML = `
    <div style="text-align:center;max-width:400px;padding:40px">
      <div style="font-size:64px;margin-bottom:20px">🔒</div>
      <div style="font-size:22px;font-weight:700;color:#ef4444;margin-bottom:12px">验证失败</div>
      <div style="font-size:15px;color:#999;margin-bottom:8px">${KAMI_CONFIG.errorMessage}</div>
      <div style="font-size:12px;color:#555;margin-bottom:32px">您的卡密验证已失效，请重新验证</div>
      <button id="kami-block-retry" style="
        padding:12px 36px;font-size:15px;font-weight:600;color:#fff;
        background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;border-radius:10px;
        cursor:pointer;box-shadow:0 4px 14px rgba(99,102,241,0.4)
      ">重新验证</button>
    </div>
  `
  document.body.appendChild(overlay)

  overlay.querySelector('#kami-block-retry').addEventListener('click', () => {
    overlay.remove()
    showKamiModal()
  })
}

/**
 * 显示卡密输入弹框
 * @param {boolean} isRetry - 是否为重试模式（清空输入框）
 */
function showKamiModal(isRetry = false) {
  _hideSplash()  // 立即隐藏启动遮罩，确保弹窗可见
  if (_modalEl) _modalEl.remove()

  const storedKami = getStoredKami()
  const remembered = localStorage.getItem(STORAGE_REMEMBER) === 'true'
  const initialKami = (isRetry || !remembered) ? '' : (storedKami || '')
  const showInitialPw = isRetry || !remembered ? false : true

  _modalEl = document.createElement('div')
  _modalEl.id = 'kami-verify-overlay'
  _modalEl.style.cssText += ';z-index:100000'
  _modalEl.style.cssText = `
    position:fixed;top:0;left:0;right:0;bottom:0;z-index:100000;
    background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    backdrop-filter:blur(8px)
  `

  _modalEl.innerHTML = `
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    <div style="
      background:#1a1a2e;border-radius:16px;padding:36px;width:380px;max-width:90vw;
      box-shadow:0 24px 80px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.08)
    ">
      ${KAMI_ANNOUNCEMENT ? `
      <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:8px;padding:10px 12px;margin-bottom:20px;font-size:12px;color:#a5b4fc;line-height:1.6">
        📢 ${KAMI_ANNOUNCEMENT}
      </div>` : ''}
      <div style="text-align:center;margin-bottom:28px">
        <div style="font-size:48px;margin-bottom:12px">🔐</div>
        <div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:6px">屠戮授权验证</div>
        <div style="font-size:12px;color:#666">请输入卡密以继续使用</div>
      </div>

      <div style="margin-bottom:16px">
        <div style="color:#888;font-size:12px;margin-bottom:8px">卡密</div>
        <div style="position:relative">
          <input id="kami-input" type="${showInitialPw ? 'text' : 'password'}" placeholder="请输入卡密" autocomplete="off" autofocus
            style="
              width:100%;padding:12px 44px 12px 14px;box-sizing:border-box;
              background:#16213e;border:1px solid rgba(99,102,241,0.3);border-radius:10px;
              color:#fff;font-size:14px;outline:none;transition:border-color 0.2s
            "
          />
          <button id="kami-toggle-vis" title="${showInitialPw ? '隐藏密码' : '显示密码'}"
            style="
              position:absolute;right:10px;top:50%;transform:translateY(-50%);
              background:none;border:none;color:#666;cursor:pointer;font-size:16px;padding:4px;line-height:1
            "
          >${showInitialPw ? '🙈' : '👁️'}</button>
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <label style="display:flex;align-items:center;cursor:pointer;user-select:none">
          <input id="kami-remember" type="checkbox" ${remembered ? 'checked' : ''}
            style="width:15px;height:15px;margin-right:8px;accent-color:#6366f1;cursor:pointer"
          />
          <span style="font-size:12px;color:#888">记住卡密</span>
        </label>
        <a href="http://wpa.qq.com/msgrd?v=3&uin=2552667173&site=qq&menu=yes" target="_blank" rel="noopener"
          style="font-size:11px;color:#6366f1;text-decoration:none"
        >购买卡密 →</a>
      </div>

      <button id="kami-verify-btn" style="
        width:100%;padding:13px;font-size:15px;font-weight:700;color:#fff;
        background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;border-radius:10px;
        cursor:pointer;transition:opacity 0.2s;box-shadow:0 4px 14px rgba(99,102,241,0.35)
      ">验证卡密</button>

      <div id="kami-error" style="
        margin-top:12px;text-align:center;font-size:12px;color:#ef4444;
        min-height:16px
      "></div>

      <div style="margin-top:20px;text-align:center">
        <a href="http://wpa.qq.com/msgrd?v=3&uin=2552667173&site=qq&menu=yes" target="_blank" rel="noopener"
          style="font-size:11px;color:#555;text-decoration:none"
        >屠戮官方 · 卡密系统</a>
      </div>
    </div>
  `

  document.body.appendChild(_modalEl)

  const inputEl = _modalEl.querySelector('#kami-input')
  const toggleBtn = _modalEl.querySelector('#kami-toggle-vis')
  const rememberEl = _modalEl.querySelector('#kami-remember')
  const verifyBtn = _modalEl.querySelector('#kami-verify-btn')
  const errorEl = _modalEl.querySelector('#kami-error')

  // 如果有初始卡密值，自动填充
  if (initialKami) {
    inputEl.value = initialKami
  }

  // 自动聚焦
  setTimeout(() => inputEl.focus(), 50)

  // 显示/隐藏密码切换
  let isPasswordVisible = !showInitialPw
  toggleBtn.addEventListener('click', () => {
    isPasswordVisible = !isPasswordVisible
    inputEl.type = isPasswordVisible ? 'text' : 'password'
    toggleBtn.textContent = isPasswordVisible ? '🙈' : '👁️'
    toggleBtn.title = isPasswordVisible ? '隐藏密码' : '显示密码'
  })

  // 输入框样式聚焦
  inputEl.addEventListener('focus', () => {
    inputEl.style.borderColor = 'rgba(99,102,241,0.7)'
  })
  inputEl.addEventListener('blur', () => {
    inputEl.style.borderColor = 'rgba(99,102,241,0.3)'
  })

  // 验证按钮
  async function doVerify() {
    const kami = inputEl.value.trim()
    if (!kami) {
      errorEl.textContent = '请输入卡密'
      return
    }

    // 记住选项
    const remember = rememberEl.checked
    localStorage.setItem(STORAGE_REMEMBER, remember ? 'true' : 'false')
    if (!remember) {
      localStorage.removeItem('tulu_kami')
    }

    verifyBtn.disabled = true
    verifyBtn.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.7s linear infinite;vertical-align:middle;margin-right:8px"></span>验证中...'
    verifyBtn.style.cssText += ';opacity:0.7;cursor:not-allowed'
    errorEl.textContent = ''

    const result = await login(kami)

    if (result.success) {
      // 验证成功
      if (remember) saveKami(kami)
      markVerified(kami, result.time)
      _pendingKami = kami

      _modalEl.querySelector('div[style*="background:#1a1a2e"]').innerHTML = `
        <div style="text-align:center;padding:20px 0">
          <div style="font-size:48px;margin-bottom:12px">✅</div>
          <div style="font-size:16px;font-weight:700;color:#22c55e;margin-bottom:8px">验证成功</div>
          <div style="font-size:12px;color:#888">正在进入应用...</div>
        </div>
      `

      setTimeout(() => {
        if (_modalEl) { _modalEl.remove(); _modalEl = null }
        startPeriodicCheck(kami)
        if (_currentResolve) { const resolve = _currentResolve; _currentResolve = null; resolve() }
      }, 800)
    } else {
      errorEl.textContent = result.error || '验证失败，卡密无效或已过期'
      verifyBtn.disabled = false
      verifyBtn.innerHTML = '验证卡密'
      verifyBtn.style.cssText = 'width:100%;padding:13px;font-size:15px;font-weight:700;color:#fff;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;border-radius:10px;cursor:pointer;transition:opacity 0.2s;box-shadow:0 4px 14px rgba(99,102,241,0.35)'
    }
  }

  verifyBtn.addEventListener('click', doVerify)
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doVerify()
  })
}

/**
 * 显示卡密验证弹框（外部调用入口）
 * @returns {Promise<void>} 验证成功后resolve
 */
export function showKamiVerifyModal() {
  return new Promise((resolve) => {
    _currentResolve = resolve
    showKamiModal()
  })
}

/**
 * 显示重试验证框（失败后重试）
 */
export function showKamiRetryModal() {
  if (_modalEl) _modalEl.remove()
  _modalEl = null
  return new Promise((resolve) => {
    _currentResolve = resolve
    showKamiModal(true)
  })
}

/**
 * 销毁弹框（应用正常运行时外部可调用）
 */
export function destroyKamiModal() {
  stopPeriodicCheck()
  if (_modalEl) { _modalEl.remove(); _modalEl = null }
  const block = document.getElementById('kami-block-overlay')
  if (block) block.remove()
}
