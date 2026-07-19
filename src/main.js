/**
 * 星枢OpenClaw 入口
 */

// 模块已加载，取消 splash 超时回退（防止假阳性的 "页面加载失败" 提示）
if (window._splashTimer) { clearTimeout(window._splashTimer); window._splashTimer = null }

import { registerRoute, initRouter, navigate, setDefaultRoute } from './router.js'
import { renderSidebar, openMobileSidebar } from './components/sidebar.js'
import { initTheme } from './lib/theme.js'
import { detectOpenclawStatus, isOpenclawReady, isUpgrading, isGatewayRunning, isGatewayForeign, onGatewayChange, startGatewayPoll, boostGatewayPolling, onGuardianGiveUp, resetAutoRestart, loadActiveInstance, getActiveInstance, onInstanceChange, getGatewayHealthState, refreshGatewayStatus } from './lib/app-state.js'
import { wsClient } from './lib/ws-client.js'
import { api, checkBackendHealth, isBackendOnline, isTauriRuntime, onBackendStatusChange } from './lib/tauri-api.js'
import { version as APP_VERSION } from '../package.json'
import { statusIcon } from './lib/icons.js'
import { isForeignGatewayError, showGatewayConflictGuidance } from './lib/gateway-ownership.js'
import { escapeHtml } from './lib/html-utils.js'

import { initI18n, t } from './lib/i18n.js'
import { initEngineManager, registerEngine } from './lib/engine-manager.js'
import { engineMeta as hermesMeta, getRoutes as getHermesRoutes, getDefaultRoute as getHermesDefaultRoute, boot as hermesBoot, cleanup as hermesCleanup } from './engines/hermes/index.js'
import { engineMeta as openclawMeta, getRoutes as getOpenclawRoutes, getDefaultRoute as getOpenclawDefaultRoute, boot as openclawBoot, cleanup as openclawCleanup } from './engines/openclaw/index.js'

// 注册 OpenClaw 引擎
registerEngine({
  id: openclawMeta.id,
  name: openclawMeta.name,
  icon: openclawMeta.icon,
  description: openclawMeta.description,
  getRoutes: getOpenclawRoutes,
  getDefaultRoute: getOpenclawDefaultRoute,
  boot: openclawBoot,
  cleanup: openclawCleanup,
})

// 注册 Hermes 引擎
registerEngine({
  id: hermesMeta.id,
  name: hermesMeta.name,
  icon: hermesMeta.icon,
  description: hermesMeta.description,
  getRoutes: getHermesRoutes,
  getDefaultRoute: getHermesDefaultRoute,
  boot: hermesBoot,
  cleanup: hermesCleanup,
})

// 样式
import './style/variables.css'
import './style/reset.css'
import './style/layout.css'
import './style/components.css'
import './style/pages.css'
import './style/chat.css'
import './style/agents.css'
import './style/debug.css'
import './style/assistant.css'
import './style/agency-agents.css'
import './style/openmontage.css'
import './style/cli-anything.css'
import './style/browser-use.css'
import './style/ai-drawer.css'
import './styles/music-player.css'
import './styles/xingshu-chat.css'
import './engines/hermes/style/hermes.css'
import './engines/hermes/style/skills-hub.css'

// 初始化主题 + 国际化
initTheme()
initI18n()

async function openGatewayConflict(error = null) {
  const services = await api.getServicesStatus().catch(() => [])
  const gw = services?.find?.(s => s.label === 'ai.openclaw.gateway') || services?.[0] || null
  await showGatewayConflictGuidance({ error, service: gw })
}

// === 访问密码保护（Web + 桌面端通用） ===
const isTauri = isTauriRuntime()

async function checkAuth() {
  if (isTauri) {
    // 桌面端：读 星枢OpenClaw.json，检查密码配置
    try {
      const { api } = await import('./lib/tauri-api.js')
      const cfg = await api.readPanelConfig()
      if (!cfg.accessPassword) return { ok: true }
      if (sessionStorage.getItem('星枢OpenClaw_authed') === '1') return { ok: true }
      // 默认密码：直接传给登录页，避免二次读取
      const defaultPw = (cfg.mustChangePassword && cfg.accessPassword) ? cfg.accessPassword : null
      return { ok: false, defaultPw }
    } catch { return { ok: true } }
  }
  // Web 模式
  try {
    const resp = await fetch('/__api/auth_check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const data = await resp.json()
    if (!data.required || data.authenticated) return { ok: true }
    return { ok: false, defaultPw: data.defaultPassword || null }
  } catch { return { ok: true } }
}

const _logoSvg = `<svg class="login-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
  <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
  <path d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"/>
</svg>`

export function _hideSplash() {
  const splash = document.getElementById('splash')
  if (splash) { splash.classList.add('hide'); setTimeout(() => splash.remove(), 500) }
}

// === 后端离线检测（Web 模式） ===
let _backendRetryTimer = null

function showBackendDownOverlay() {
  if (document.getElementById('backend-down-overlay')) return
  _hideSplash()
  const overlay = document.createElement('div')
  overlay.id = 'backend-down-overlay'
  overlay.innerHTML = `
    <div class="login-card" style="text-align:center">
      ${_logoSvg}
      <div class="login-title" style="color:var(--error,#ef4444)">${t('common.backendDownTitle')}</div>
      <div class="login-desc" style="line-height:1.8">
        ${t('common.backendDownDesc')}<br>
        <span style="font-size:12px;color:var(--text-tertiary)">${t('common.backendDownHint')}</span>
      </div>
      <div style="background:var(--bg-tertiary);border-radius:var(--radius-md,8px);padding:14px 18px;margin:16px 0;text-align:left;font-family:var(--font-mono,monospace);font-size:12px;line-height:1.8;user-select:all;color:var(--text-secondary)">
        <div style="color:var(--text-tertiary);margin-bottom:4px"># ${t('common.devMode')}</div>
        npm run dev<br>
        <div style="color:var(--text-tertiary);margin-top:8px;margin-bottom:4px"># ${t('common.prodMode')}</div>
        npm run preview
      </div>
      <button class="login-btn" id="btn-backend-retry" style="margin-top:8px">
        <span id="backend-retry-text">${t('common.checkAgain')}</span>
      </button>
      <div id="backend-retry-status" style="font-size:12px;color:var(--text-tertiary);margin-top:12px"></div>
      <div style="margin-top:16px;font-size:11px;color:#aaa">
        <a href="https://qm.qq.com/q/JAxVNbg2I4" target="_blank" rel="noopener" style="color:#aaa;text-decoration:none">${t('sidebar.feedbackGroup')}: 916149901</a>
        <span style="margin:0 6px">&middot;</span>v${APP_VERSION}
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  let retrying = false
  const btn = overlay.querySelector('#btn-backend-retry')
  const statusEl = overlay.querySelector('#backend-retry-status')
  const textEl = overlay.querySelector('#backend-retry-text')

  btn.addEventListener('click', async () => {
    if (retrying) return
    retrying = true
    btn.disabled = true
    textEl.textContent = t('common.checking')
    statusEl.textContent = ''

    const ok = await checkBackendHealth()
    if (ok) {
      statusEl.textContent = t('common.backendConnectedLoading')
      statusEl.style.color = 'var(--success,#22c55e)'
      overlay.classList.add('hide')
      setTimeout(() => { overlay.remove(); location.reload() }, 600)
    } else {
      statusEl.textContent = t('common.backendStillDown')
      statusEl.style.color = 'var(--error,#ef4444)'
      textEl.textContent = t('common.checkAgain')
      btn.disabled = false
      retrying = false
    }
  })

  // 自动轮询：每 5 秒检测一次
  if (_backendRetryTimer) clearInterval(_backendRetryTimer)
  _backendRetryTimer = setInterval(async () => {
    const ok = await checkBackendHealth()
    if (ok) {
      clearInterval(_backendRetryTimer)
      _backendRetryTimer = null
      statusEl.textContent = t('common.backendConnectedLoading')
      statusEl.style.color = 'var(--success,#22c55e)'
      overlay.classList.add('hide')
      setTimeout(() => { overlay.remove(); location.reload() }, 600)
    }
  }, 5000)
}

/**
 * Kami 验证内置模块3次加载失败时的 Fallback 弹窗
 * 确保用户至少能看到一个可操作的界面
 */
function showKamiFallbackModal() {
  _hideSplash()
  const overlay = document.createElement('div')
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:100000;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif'
  overlay.innerHTML = `
    <div style="background:#1a1a2e;border-radius:16px;padding:36px;width:380px;max-width:90vw;box-shadow:0 24px 80px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.08)">
      <div style="text-align:center;margin-bottom:28px">
        <div style="font-size:48px;margin-bottom:12px">🔐</div>
        <div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:6px">${t('kami.title')}</div>
        <div style="font-size:12px;color:#666">${t('kami.subtitle')}</div>
        <div id="kami-fb-notice" style="margin-top:12px;padding:10px 12px;background:rgba(99,102,241,0.1);border-radius:8px;font-size:12px;color:#a5b4fc;line-height:1.6;display:none"></div>
      </div>
      <div style="margin-bottom:16px">
        <div style="color:#888;font-size:12px;margin-bottom:8px">${t('kami.licenseKey')}</div>
        <input id="kami-fb-input" type="password" placeholder="${t('kami.licensePlaceholder')}" autocomplete="off" autofocus
          style="width:100%;padding:12px 14px;box-sizing:border-box;background:#16213e;border:1px solid rgba(99,102,241,0.3);border-radius:10px;color:#fff;font-size:14px;outline:none"
        />
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <label style="display:flex;align-items:center;cursor:pointer;user-select:none">
          <input id="kami-fb-remember" type="checkbox" style="width:15px;height:15px;margin-right:8px;accent-color:#6366f1;cursor:pointer" />
          <span style="font-size:12px;color:#888">${t('kami.rememberKey')}</span>
        </label>
        <a href="https://qm.qq.com/q/FF8D891UWc" target="_blank" style="font-size:11px;color:#6366f1;text-decoration:none">${t('kami.buyKey')} →</a>
      </div>
      <button id="kami-fb-btn" style="width:100%;padding:13px;font-size:15px;font-weight:700;color:#fff;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;border-radius:10px;cursor:pointer;box-shadow:0 4px 14px rgba(99,102,241,0.35)">${t('kami.verifyButton')}</button>
      <div id="kami-fb-error" style="margin-top:12px;text-align:center;font-size:12px;color:#ef4444;min-height:16px"></div>
    </div>
  `
  document.body.appendChild(overlay)

  // 动态 import kami.js（独立于模块加载失败的环境）
  import('./lib/kami.js').then(async ({ login, saveKami, markVerified, getNotice }) => {
    const inputEl = document.getElementById('kami-fb-input')
    const rememberEl = document.getElementById('kami-fb-remember')
    const btnEl = document.getElementById('kami-fb-btn')
    const errorEl = document.getElementById('kami-fb-error')
    const noticeEl = document.getElementById('kami-fb-notice')

    // 异步拉取远程公告
    getNotice().then(text => {
      if (text && text.trim()) {
        noticeEl.textContent = text
        noticeEl.style.display = 'block'
      }
    }).catch(() => {})

    async function doVerify() {
      const kami = inputEl.value.trim()
      if (!kami) { errorEl.textContent = t('kami.emptyKey'); return }
      btnEl.disabled = true
      btnEl.textContent = t('kami.verifying')
      errorEl.textContent = ''

      const result = await login(kami)
      if (result.success) {
        if (rememberEl.checked) saveKami(kami)
        markVerified(kami, result.time)
        overlay.innerHTML = `<div style="text-align:center;padding:40px;color:#22c55e;font-size:18px;font-weight:700">✅ ${t('kami.successTitle')}，${t('kami.enteringApp')}</div>`
        setTimeout(() => overlay.remove(), 800)
        setTimeout(() => location.reload(), 1000)
      } else {
        errorEl.textContent = result.error || t('kami.genericFailure')
        btnEl.disabled = false
        btnEl.textContent = t('kami.verifyButton')
      }
    }

    btnEl.addEventListener('click', doVerify)
    inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') doVerify() })
  }).catch(err => {
    const fallbackErrorEl = document.getElementById('kami-fb-error')
    if (fallbackErrorEl) fallbackErrorEl.textContent = t('kami.moduleLoadFailed')
    console.error('[kami-fallback] kami.js 加载失败:', err)
  })
}

let _loginFailCount = 0
const CAPTCHA_THRESHOLD = 3
const PW_CHANGE_SESSION_KEY = '星枢OpenClaw_must_change_pw'

function _genCaptcha() {
  const a = Math.floor(Math.random() * 20) + 1
  const b = Math.floor(Math.random() * 20) + 1
  return { q: `${a} + ${b} = ?`, a: a + b }
}

function showLoginOverlay(defaultPw) {
  const hasDefault = !!defaultPw
  const overlay = document.createElement('div')
  overlay.id = 'login-overlay'
  let _captcha = _loginFailCount >= CAPTCHA_THRESHOLD ? _genCaptcha() : null
  const securityLabel = t('sidebar.security')
  const accessPasswordField = '<code style="background:rgba(99,102,241,.1);padding:1px 5px;border-radius:3px;font-size:10px">accessPassword</code>'
  const resetPath = '<code style="background:rgba(99,102,241,.1);padding:2px 6px;border-radius:3px;font-size:10px;word-break:break-all">~/.openclaw/星枢OpenClaw.json</code>'
  overlay.innerHTML = `
    <div class="login-card">
      ${_logoSvg}
      <div class="login-title">星枢OpenClaw</div>
      <div class="login-desc">${hasDefault
        ? `${t('security.firstLoginHint')}<br><span style="font-size:12px;color:#6366f1;font-weight:600">${t('security.firstLoginChangeHint', { security: securityLabel })}</span>`
        : (isTauri ? t('security.appLocked') : t('security.loginPrompt'))}</div>
      <form id="login-form">
        <input class="login-input" type="${hasDefault ? 'text' : 'password'}" id="login-pw" placeholder="${t('security.accessPasswordPlaceholder')}" autocomplete="current-password" autofocus value="${hasDefault ? defaultPw : ''}" />
        <div id="login-captcha" style="display:${_captcha ? 'block' : 'none'};margin-bottom:10px">
          <div style="font-size:12px;color:#888;margin-bottom:6px">${t('security.captchaPrompt')}<strong id="captcha-q" style="color:var(--text-primary,#333)">${_captcha ? _captcha.q : ''}</strong></div>
          <input class="login-input" type="number" id="login-captcha-input" placeholder="${t('security.captchaPlaceholder')}" style="text-align:center" />
        </div>
        <button class="login-btn" type="submit">${t('security.loginAction')}</button>
        <div class="login-error" id="login-error"></div>
      </form>
      ${!hasDefault ? `<details class="login-forgot" style="margin-top:16px;text-align:center">
        <summary style="font-size:11px;color:#aaa;cursor:pointer;list-style:none;user-select:none">${t('security.forgotPassword')}</summary>
        <div style="margin-top:8px;font-size:11px;color:#888;line-height:1.8;text-align:left;background:rgba(0,0,0,.03);border-radius:8px;padding:10px 14px">
          ${isTauri
            ? `${t('security.resetPasswordLocal', { field: accessPasswordField })}<br>${resetPath}`
            : `${t('security.resetPasswordRemote', { field: accessPasswordField })}<br>${resetPath}`
          }
        </div>
      </details>` : ''}
      <div style="margin-top:${hasDefault ? '20' : '12'}px;font-size:11px;color:#aaa;text-align:center">
        <a href="https://qm.qq.com/q/JAxVNbg2I4" target="_blank" rel="noopener" style="color:#aaa;text-decoration:none">${t('sidebar.feedbackGroup')}: 916149901</a>
        <span style="margin:0 6px">·</span>v${APP_VERSION}
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  _hideSplash()

  return new Promise((resolve) => {
    overlay.querySelector('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const pw = overlay.querySelector('#login-pw').value
      const btn = overlay.querySelector('.login-btn')
      const errEl = overlay.querySelector('#login-error')
      btn.disabled = true
      btn.textContent = t('security.loginSubmitting')
      errEl.textContent = ''
      // 验证码校验
      if (_captcha) {
        const captchaVal = parseInt(overlay.querySelector('#login-captcha-input')?.value)
        if (captchaVal !== _captcha.a) {
          errEl.textContent = t('security.wrongCaptcha')
          _captcha = _genCaptcha()
          const qEl = overlay.querySelector('#captcha-q')
          if (qEl) qEl.textContent = _captcha.q
          overlay.querySelector('#login-captcha-input').value = ''
          btn.disabled = false
          btn.textContent = t('security.loginAction')
          return
        }
      }
      try {
        if (isTauri) {
          // 桌面端：本地比对密码
          const { api } = await import('./lib/tauri-api.js')
          const cfg = await api.readPanelConfig()
          if (pw !== cfg.accessPassword) {
            _loginFailCount++
            if (_loginFailCount >= CAPTCHA_THRESHOLD && !_captcha) {
              _captcha = _genCaptcha()
              const cEl = overlay.querySelector('#login-captcha')
              if (cEl) { cEl.style.display = 'block'; cEl.querySelector('#captcha-q').textContent = _captcha.q }
            }
            errEl.textContent = `${t('security.loginWrongPassword')}${_loginFailCount >= CAPTCHA_THRESHOLD ? '' : ` (${_loginFailCount}/${CAPTCHA_THRESHOLD})`}`
            btn.disabled = false
            btn.textContent = t('security.loginAction')
            return
          }
          sessionStorage.setItem('星枢OpenClaw_authed', '1')
          // 同步建立 web session（WEB_ONLY_CMDS 需要 cookie 认证）
          try {
            await fetch('/__api/auth_login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ password: pw }),
            })
          } catch {}
          overlay.classList.add('hide')
          setTimeout(() => overlay.remove(), 400)
          if (cfg.accessPassword === '123456') {
            sessionStorage.setItem(PW_CHANGE_SESSION_KEY, '1')
          }
          resolve()
        } else {
          // Web 模式：调后端
          const resp = await fetch('/__api/auth_login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pw }),
          })
          const data = await resp.json()
          if (!resp.ok) {
            _loginFailCount++
            if (_loginFailCount >= CAPTCHA_THRESHOLD && !_captcha) {
              _captcha = _genCaptcha()
              const cEl = overlay.querySelector('#login-captcha')
              if (cEl) { cEl.style.display = 'block'; cEl.querySelector('#captcha-q').textContent = _captcha.q }
            }
            errEl.textContent = (data.error || t('security.loginFailed')) + (_loginFailCount >= CAPTCHA_THRESHOLD ? '' : ` (${_loginFailCount}/${CAPTCHA_THRESHOLD})`)
            btn.disabled = false
            btn.textContent = t('security.loginAction')
            return
          }
          overlay.classList.add('hide')
          setTimeout(() => overlay.remove(), 400)
          if (data.mustChangePassword || data.defaultPassword === '123456') {
            sessionStorage.setItem(PW_CHANGE_SESSION_KEY, '1')
          }
          resolve()
        }
      } catch (err) {
        errEl.textContent = `${t('common.networkError')}: ${err.message || err}`
        btn.disabled = false
        btn.textContent = t('security.loginAction')
      }
    })
  })
}

// 全局 401 拦截：API 返回 401 时弹出登录
window.__星枢OpenClaw_show_login = async function() {
  if (document.getElementById('login-overlay')) return
  await showLoginOverlay()
  location.reload()
}

const sidebar = document.getElementById('sidebar')
const content = document.getElementById('content')

async function boot() {
  // 初始化引擎管理器（加载上次选中的引擎）
  try { await initEngineManager() } catch (e) { console.warn('[boot] initEngineManager 失败:', e) }

  // 先注册所有路由，立即渲染 UI（不等后端检测）
  registerRoute('/dashboard', () => import('./pages/dashboard.js'))
  registerRoute('/chat', () => import('./pages/chat.js'))
  registerRoute('/chat-debug', () => import('./pages/chat-debug.js'))
  registerRoute('/services', () => import('./pages/services.js'))
  registerRoute('/logs', () => import('./pages/logs.js'))
  registerRoute('/models', () => import('./pages/models.js'))
  registerRoute('/agents', () => import('./pages/agents.js'))
  registerRoute('/agency-agents', () => import('./pages/agency-agents.js'))
  registerRoute('/agent-detail', () => import('./pages/agent-detail.js'))
  registerRoute('/gateway', () => import('./pages/gateway.js'))
  registerRoute('/memory', () => import('./pages/memory.js'))
  registerRoute('/skills', () => import('./pages/skills.js'))
  registerRoute('/miaogu-verify', () => import('./pages/miaogu-verify.js'))
  registerRoute('/weiyan-verify', () => import('./pages/weiyan-verify.js'))
  registerRoute('/movie-tool', () => import('./pages/movie-tool.js'))
  registerRoute('/openmontage', () => import('./pages/openmontage.js'))
  registerRoute('/cli-anything', () => import('./pages/cli-anything.js'))
  registerRoute('/browser-use', () => import('./pages/browser-use.js'))
  registerRoute('/music-player', () => import('./pages/music-player.js'))
  registerRoute('/xingshu-chat', () => import('./pages/xingshu-chat.js'))
  registerRoute('/xingshu-skill-center', () => import('./pages/xingshu-skill-center.js'))
  registerRoute('/xingshu-skill-security', () => import('./pages/xingshu-skill-security.js'))
// ── 龙虾办公室状态同步 ─────────────────────────────────
// 供所有页面调用的全局函数，写入 localStorage 供龙虾窗口轮询
const LOBSTER_PHASE_PRESETS = {
  ack: { state: 'ack', emoji: '🟡', messageKey: 'chat.lobsterPresetAck' },
  thinking: { state: 'thinking', emoji: '💭', messageKey: 'chat.lobsterPresetThinking' },
  planning: { state: 'planning', emoji: '🧭', messageKey: 'chat.lobsterPresetPlanning' },
  syncing: { state: 'syncing', emoji: '🔄', messageKey: 'chat.lobsterPresetSyncing' },
  tool: { state: 'tool', emoji: '🛠️', messageKey: 'chat.lobsterPresetTool' },
  working: { state: 'working', emoji: '🔴', messageKey: 'chat.lobsterPresetWorking' },
  verifying: { state: 'verifying', emoji: '🔍', messageKey: 'chat.lobsterPresetVerifying' },
  streaming: { state: 'streaming', emoji: '✍️', messageKey: 'chat.lobsterPresetStreaming' },
  done: { state: 'done', emoji: '🟢', messageKey: 'chat.lobsterPresetDone' },
  idle: { state: 'idle', emoji: '🟢', messageKey: 'chat.lobsterPresetIdle' },
}
let _lobsterPhaseOverrides = {}
let _lobsterOfficeSyncTimer = null
let _lobsterOfficeLastPayload = null

function mapLobsterStateToOfficeState(state = '', phase = '') {
  const value = String(state || phase || '').toLowerCase()
  return ({
    ack: 'executing',
    queued: 'executing',
    working: 'executing',
    tool: 'executing',
    executing: 'executing',
    thinking: 'researching',
    planning: 'researching',
    researching: 'researching',
    streaming: 'writing',
    writing: 'writing',
    finalizing: 'syncing',
    verifying: 'syncing',
    syncing: 'syncing',
    receiving: 'receiving',
    replying: 'replying',
    done: 'idle',
    idle: 'idle',
    aborted: 'error',
    error: 'error',
  })[value] || 'executing'
}

function queueOfficeStateSync(payload) {
  if (!isTauriRuntime || !payload) return
  _lobsterOfficeLastPayload = payload
  clearTimeout(_lobsterOfficeSyncTimer)
  _lobsterOfficeSyncTimer = setTimeout(() => {
    const latest = _lobsterOfficeLastPayload
    _lobsterOfficeSyncTimer = null
    _lobsterOfficeLastPayload = null
    if (!latest) return
    const officeState = mapLobsterStateToOfficeState(latest.state, latest.phase)
    const detail = latest.message || latest.phase || latest.state || ''
    api.updateOfficeState(officeState, detail).catch(() => {})
  }, 250)
}

async function loadLobsterPhaseOverrides() {
  try {
    const cfg = await api.readOpenclawConfig()
    const sr = cfg?.messages?.statusReactions || {}
    _lobsterPhaseOverrides = {
      ack: sr.ack || '',
      thinking: sr.thinking || '',
      tool: sr.tool || '',
      working: sr.working || '',
      done: sr.done || '',
    }
    window.__lobsterPhaseOverrides = _lobsterPhaseOverrides
  } catch {
    _lobsterPhaseOverrides = window.__lobsterPhaseOverrides || {}
  }
}

function getLobsterPhaseEmoji(phase, fallback) {
  return _lobsterPhaseOverrides?.[phase] || window.__lobsterPhaseOverrides?.[phase] || fallback || ''
}

function normalizeLobsterDetail(detail = {}) {
  const phase = detail?.phase || ''
  const preset = LOBSTER_PHASE_PRESETS[phase] || null
  const state = preset?.state || detail?.state || 'working'
  const emoji = detail?.emoji || getLobsterPhaseEmoji(phase, preset?.emoji) || ''
  const message = detail?.message || (preset?.messageKey ? t(preset.messageKey) : '')
  return { phase, state, emoji, message }
}

function hasActiveLobsterAgentState() {
  try {
    const payload = JSON.parse(localStorage.getItem('lobsterState') || 'null')
    return ['ack', 'thinking', 'planning', 'tool', 'working', 'verifying', 'streaming', 'syncing', 'error'].includes(payload?.phase || payload?.state)
  } catch { return false }
}

window.updateLobsterState = function(state, message, extra = {}) {
  try {
    const payload = {
      state: state,
      message: message || '',
      emoji: extra?.emoji || '',
      phase: extra?.phase || '',
      ts: Date.now()
    }
    localStorage.setItem('lobsterState', JSON.stringify(payload))
    queueOfficeStateSync(payload)
    try {
      window.__lobsterBroadcast ||= new BroadcastChannel('lobster-office-state')
      window.__lobsterBroadcast.postMessage(payload)
    } catch {}
  } catch (e) {}
}

// 监听路由变化，认为一次路由变化 = 一次工作周期开始
window.addEventListener('hashchange', () => {
  const route = location.hash.replace('#', '') || location.pathname
  if (route && route !== '/' && !hasActiveLobsterAgentState()) {
    window.updateLobsterState('working', t('chat.lobsterRouteNavigating', { route }), { phase: 'working', emoji: '🔴' })
  }
})

// AI 消息发送时通知龙虾（通过自定义事件）
window.addEventListener('lobster-work-start', e => {
  const detail = normalizeLobsterDetail(e.detail || {})
  window.updateLobsterState(detail.state, detail.message || t('chat.lobsterPresetWorking'), { phase: detail.phase, emoji: detail.emoji })
})
window.addEventListener('lobster-work-end', () => {
  const detail = normalizeLobsterDetail({ phase: 'done' })
  window.updateLobsterState('idle', detail.message, { phase: detail.phase, emoji: detail.emoji })
})
  registerRoute('/lobster-office', () => import('./pages/lobster-office.js'))
  registerRoute('/coming-soon', () => import('./pages/coming-soon.js'))
  registerRoute('/security', () => import('./pages/security.js'))
  registerRoute('/about', () => import('./pages/about.js'))
  registerRoute('/assistant', () => import('./pages/assistant.js'))
  registerRoute('/setup', () => import('./pages/setup.js'))
  registerRoute('/channels', () => import('./pages/channels.js'))
  registerRoute('/cron', () => import('./pages/cron.js'))
  registerRoute('/usage', () => import('./pages/usage.js'))
  registerRoute('/communication', () => import('./pages/communication.js'))
  registerRoute('/settings', () => import('./pages/settings.js'))

  renderSidebar(sidebar)
  initRouter()

  // 移动端顶栏（汉堡菜单 + 标题）
  const mainCol = document.getElementById('main-col')
  const topbar = document.createElement('div')
  topbar.className = 'mobile-topbar'
  topbar.id = 'mobile-topbar'
  topbar.innerHTML = `
    <button class="mobile-hamburger" id="btn-mobile-menu">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
    <span class="mobile-topbar-title">星枢OpenClaw</span>
  `
  topbar.querySelector('.mobile-hamburger').addEventListener('click', openMobileSidebar)
  mainCol.prepend(topbar)

  // 隐藏启动加载屏
  const splash = document.getElementById('splash')
  if (splash) {
    splash.classList.add('hide')
    setTimeout(() => splash.remove(), 500)
  }

  // 默认密码提醒横幅
  if (sessionStorage.getItem(PW_CHANGE_SESSION_KEY) === '1') {
    const banner = document.createElement('div')
    banner.id = 'pw-change-banner'
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:10px 20px;display:flex;align-items:center;justify-content:center;gap:12px;font-size:13px;font-weight:500;box-shadow:0 2px 8px rgba(0,0,0,0.15)'
    banner.innerHTML = `
      <span>${statusIcon('warn', 14)} ${t('common.defaultPasswordBanner')}</span>
      <a id="pw-change-banner-link" href="#/security" style="color:#fff;background:rgba(255,255,255,0.2);padding:4px 14px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:600">${t('common.goSecurity')}</a>
      <button id="pw-change-banner-close" style="background:none;border:none;color:rgba(255,255,255,0.7);cursor:pointer;font-size:16px;padding:0 4px;margin-left:4px">&times;</button>
    `
    banner.querySelector('#pw-change-banner-link')?.addEventListener('click', () => {
      banner.remove()
      sessionStorage.removeItem(PW_CHANGE_SESSION_KEY)
    })
    banner.querySelector('#pw-change-banner-close')?.addEventListener('click', () => banner.remove())
    document.body.prepend(banner)
  }

  // Tauri 模式：确保 web session 存在（页面刷新后 cookie 可能丢失），然后加载实例和检测状态
  const ensureWebSession = isTauri
    ? api.readPanelConfig().then(cfg => {
        if (cfg.accessPassword) {
          return fetch('/__api/auth_login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: cfg.accessPassword }),
          }).catch(() => {})
        }
      }).catch(() => {})
    : Promise.resolve()

  ensureWebSession.then(() => loadLobsterPhaseOverrides()).then(() => loadActiveInstance()).then(() => detectOpenclawStatus()).then(() => {
    // 重新渲染侧边栏（检测完成后 isOpenclawReady 状态已更新）
    renderSidebar(sidebar)
    if (!isOpenclawReady()) {
      setDefaultRoute('/setup')
      navigate('/setup')
    } else {
      if (window.location.hash === '#/setup') navigate('/dashboard')
      setupGatewayBanner()
      startGatewayPoll()

      // 应用启动后立即启动 WebSocket 连接，不依赖 chat 页面触发。
      // Gateway 冷启动期间 ws-client 会自动重试；这样首页/dashboard/services 不会一直停在“初始化中”。
      autoConnectWebSocket()

      // 监听 Gateway 状态变化，自动连接；不要在短暂 offline/starting 时主动 disconnect。
      // 之前这里一旦轮询误判未运行就 intentionalClose，导致首页/dashboard/services 停在“初始化中”；
      // 进入 chat 页后 connectGateway() 重新打开连接，所以看起来必须手动切到 chat 才成功。
      onGatewayChange((running, foreign, state = {}) => {
        if (running || (!foreign && !state.userStopped)) {
          autoConnectWebSocket()
        } else if (foreign || state.userStopped) {
          wsClient.disconnect()
        }
        // 通知龙虾办公室：Gateway 状态变化（实时联动）
        window.dispatchEvent(new CustomEvent(running ? 'lobster-work-start' : 'lobster-work-end', {
          detail: { state: running ? 'syncing' : 'idle', message: running ? t('common.gatewayConnected') : t('common.gatewayDisconnected'), phase: running ? 'syncing' : 'idle' }
        }))
      })

      // 守护放弃时，弹出恢复选项
      if (isTauriRuntime()) {
        import('@tauri-apps/api/event').then(async ({ listen }) => {
          await listen('guardian-event', (e) => {
            if (e.payload?.kind === 'give_up') showGuardianRecovery()
          })
        }).catch(() => {})
        api.guardianStatus().then(status => {
          if (status?.giveUp) showGuardianRecovery()
        }).catch(() => {})
      } else {
        onGuardianGiveUp(() => {
          showGuardianRecovery()
        })
      }

      // 实例切换时，重连 WebSocket + 重新检测状态
      onInstanceChange(async () => {
        wsClient.disconnect()
        await detectOpenclawStatus()
        if (isGatewayRunning()) autoConnectWebSocket()
      })
    }

    // 全局监听后台任务完成/失败事件，自动刷新安装状态和侧边栏
    if (isTauriRuntime()) {
      import('@tauri-apps/api/event').then(async ({ listen }) => {
        const refreshAfterTask = async () => {
          // 清除 API 缓存，确保拿到最新状态
          const { invalidate } = await import('./lib/tauri-api.js')
          invalidate('check_installation', 'get_services_status', 'get_version_info')
          await detectOpenclawStatus()
          renderSidebar(sidebar)
          // 如果安装完成后变为就绪，跳转到仪表盘
          if (isOpenclawReady() && window.location.hash === '#/setup') {
            navigate('/dashboard')
          }
          // 如果卸载后变为未就绪，跳转到 setup
          if (!isOpenclawReady() && !isUpgrading()) {
            setDefaultRoute('/setup')
            navigate('/setup')
          }
        }
        await listen('upgrade-done', refreshAfterTask)
        await listen('upgrade-error', refreshAfterTask)
      }).catch(() => {})
    }
  })
}

async function autoConnectWebSocket() {
  try {
    const inst = getActiveInstance()
    console.debug(`[main] 自动连接 WebSocket (实例: ${inst.name})...`)
    const config = await api.readOpenclawConfig()
    const port = config?.gateway?.port || 18789
    const authConfig = config?.gateway?.auth || {}
    const rawToken = authConfig.token ?? config?.gateway?.authToken
    const token = (typeof rawToken === 'string') ? rawToken : ''
    const password = authConfig.mode === 'password' && typeof authConfig.password === 'string'
      ? authConfig.password
      : ''

    let host
    const inst2 = getActiveInstance()
    if (inst2.type !== 'local' && inst2.endpoint) {
      try {
        const url = new URL(inst2.endpoint)
        host = `${url.hostname}:${inst2.gatewayPort || port}`
      } catch {
        host = isTauriRuntime() ? `127.0.0.1:${port}` : location.host
      }
    } else {
      host = isTauriRuntime() ? `127.0.0.1:${port}` : location.host
    }

    // 启动时优先直连，避免被预修复流程阻塞；握手失败后再走 ws-client 内置自动修复
    boostGatewayPolling()
    wsClient.connect(host, { mode: authConfig.mode || 'token', token, password })
    console.debug(`[main] WebSocket 连接已启动 -> ${host}`)

    // 非阻塞后台修补：仅用于提升后续稳定性，不阻塞首连速度
    queueMicrotask(async () => {
      let needReload = false
      try {
        const pairResult = await api.autoPairDevice()
        console.debug('[main] 后台设备配对 + origins 检查完成:', pairResult)
        if (typeof pairResult === 'object' && pairResult.changed) {
          needReload = true
        } else if (typeof pairResult === 'string' && pairResult !== '设备已配对') {
          needReload = true
        }
      } catch (pairErr) {
        console.warn('[main] autoPairDevice 失败（后台非致命）:', pairErr)
      }

      try {
        const patched = await api.patchModelVision()
        if (patched) {
          console.debug('[main] 已为模型添加 vision 支持')
          needReload = true
        }
      } catch (visionErr) {
        console.warn('[main] patchModelVision 失败（后台非致命）:', visionErr)
      }

      if (needReload && !wsClient.gatewayReady) {
        try {
          boostGatewayPolling()
          await api.reloadGateway()
          console.debug('[main] Gateway 已后台重载，准备重新连接')
          wsClient.reconnect()
        } catch (reloadErr) {
          console.warn('[main] reloadGateway 失败（后台非致命）:', reloadErr)
        }
      }
    })
  } catch (e) {
    console.error('[main] 自动连接 WebSocket 失败:', e)
  }
}

function getGatewayBannerSnapshot(running, foreign = false) {
  const state = getGatewayHealthState()
  const wsInfo = typeof wsClient?.getConnectionInfo === 'function' ? wsClient.getConnectionInfo() : {}
  const health = state?.health || 'unknown'
  const handshakeLabel = wsInfo.gatewayReady ? t('dashboard.handshakeComplete') : t('dashboard.handshakePending')
  const wsLabel = wsInfo.connected ? t('dashboard.wsConnected') : t('dashboard.wsDisconnected')
  const reconnectLabel = wsInfo.reconnectState || 'idle'
  const phase = wsInfo.status || (wsInfo.gatewayReady ? t('dashboard.gatewayConnectionReady') : wsInfo.connected ? t('dashboard.waitingHandshake') : t('dashboard.notConnected'))
  const phaseDetail = wsInfo.statusDetail || ''

  if (foreign || state?.foreign) {
    return {
      tone: 'warning',
      text: t('dashboard.foreignGatewayBanner'),
      detail: t('dashboard.gatewayForeignDetail', { ws: wsLabel, phase }),
    }
  }

  if (!running && health !== 'recovering') {
    return {
      tone: 'info',
      text: t('dashboard.controlUINotRunning'),
      detail: t('dashboard.gatewayStoppedDetail', { ws: wsLabel, handshake: handshakeLabel }),
    }
  }

  if (health === 'recovering') {
    return {
      tone: 'warning',
      text: t('dashboard.gatewayRecoveringBanner'),
      detail: t('dashboard.gatewayRecoveringDetail', { phase, reconnect: reconnectLabel }),
    }
  }

  if (health === 'starting') {
    return {
      tone: 'info',
      text: t('dashboard.gatewayStartingBanner'),
      detail: t('dashboard.gatewayStartingDetail', { phase, ws: wsLabel, handshake: handshakeLabel }),
    }
  }

  if (health === 'degraded') {
    return {
      tone: 'warning',
      text: t('dashboard.gatewayDegradedBanner'),
      detail: phaseDetail
        ? t('dashboard.gatewayDegradedDetailWithReason', { phase, ws: wsLabel, handshake: handshakeLabel, reason: phaseDetail, reconnect: reconnectLabel })
        : t('dashboard.gatewayDegradedDetail', { phase, ws: wsLabel, handshake: handshakeLabel, reconnect: reconnectLabel }),
    }
  }

  return {
    tone: 'success',
    text: t('dashboard.gatewayRunningBanner'),
    detail: t('dashboard.gatewayRunningDetail', { phase, ws: wsLabel, handshake: handshakeLabel }),
  }
}

function setupGatewayBanner() {
  const banner = document.getElementById('gw-banner')
  if (!banner) return

  let updateScheduled = false
  function scheduleUpdate() {
    if (updateScheduled) return
    updateScheduled = true
    setTimeout(() => {
      updateScheduled = false
      update(isGatewayRunning(), isGatewayForeign())
    }, 120)
  }

  async function update(running, foreign = false) {
    const dismissed = sessionStorage.getItem('gw-banner-dismissed') === '1'
    await refreshGatewayStatus().catch(() => {})
    const snapshot = getGatewayBannerSnapshot(running, foreign)

    if (dismissed && snapshot.tone === 'success') {
      banner.classList.add('gw-banner-hidden')
      return
    }
    if (snapshot.tone === 'success') {
      banner.classList.add('gw-banner-hidden')
      return
    }

    banner.classList.remove('gw-banner-hidden')

    if (foreign) {
      banner.innerHTML = `
        <div class="gw-banner-content" style="flex-wrap:wrap;gap:8px">
          <span class="gw-banner-icon">${statusIcon('warning', 16)}</span>
          <div style="display:flex;flex-direction:column;gap:4px">
            <span>${snapshot.text}</span>
            <span style="font-size:11px;opacity:0.75">${escapeHtml(snapshot.detail)}</span>
          </div>
          <button class="btn btn-sm btn-secondary" id="btn-gw-claim" style="margin-left:auto">${t('dashboard.claimGateway')}</button>
          <a class="btn btn-sm btn-ghost" href="#/services">${t('sidebar.services')}</a>
          <button class="gw-banner-close" id="btn-gw-dismiss" title="${t('common.close')}">&times;</button>
        </div>
      `
      banner.querySelector('#btn-gw-dismiss')?.addEventListener('click', () => {
        banner.classList.add('gw-banner-hidden')
        sessionStorage.setItem('gw-banner-dismissed', '1')
      })
      banner.querySelector('#btn-gw-claim')?.addEventListener('click', async (e) => {
        const btn = e.target
        btn.disabled = true
        btn.textContent = t('common.processing')
        try {
          await api.claimGateway()
          await refreshGatewayStatus()
          update(isGatewayRunning(), isGatewayForeign())
        } catch (err) {
          btn.disabled = false
          btn.textContent = t('dashboard.claimGateway')
          console.error('[banner] claim failed:', err)
        }
      })
      return
    }

    banner.innerHTML = `
      <div class="gw-banner-content">
        <span class="gw-banner-icon">${statusIcon(snapshot.tone, 16)}</span>
        <div style="display:flex;flex-direction:column;gap:4px">
          <span>${snapshot.text}</span>
          <span style="font-size:11px;opacity:0.75">${escapeHtml(snapshot.detail)}</span>
        </div>
        <button class="btn btn-sm btn-secondary" id="btn-gw-start" style="margin-left:auto">${t('dashboard.startBtn')}</button>
        <a class="btn btn-sm btn-ghost" href="#/services">${t('sidebar.services')}</a>
        <button class="gw-banner-close" id="btn-gw-dismiss" title="${t('common.close')}">&times;</button>
      </div>
    `
    banner.querySelector('#btn-gw-dismiss')?.addEventListener('click', () => {
      banner.classList.add('gw-banner-hidden')
      sessionStorage.setItem('gw-banner-dismissed', '1')
    })
    banner.querySelector('#btn-gw-start')?.addEventListener('click', async (e) => {
      const btn = e.target
      btn.disabled = true
      btn.classList.add('btn-loading')
      btn.textContent = t('dashboard.starting')
      boostGatewayPolling()
      try {
        await api.startService('ai.openclaw.gateway')
      } catch (err) {
        if (isForeignGatewayError(err)) {
          await openGatewayConflict(err)
          update(false)
          return
        }
        const errMsg = (err.message || String(err)).slice(0, 120)
        banner.innerHTML = `
          <div class="gw-banner-content" style="flex-wrap:wrap">
            <span class="gw-banner-icon">${statusIcon('info', 16)}</span>
            <span>${t('dashboard.startFail')}</span>
            <a class="btn btn-sm btn-ghost" href="#/services" style="margin-left:auto">${t('sidebar.services')}</a>
            <a class="btn btn-sm btn-ghost" href="#/logs">${t('sidebar.logs')}</a>
          </div>
          <div style="font-size:11px;opacity:0.7;margin-top:4px;font-family:monospace;word-break:break-all">${escapeHtml(errMsg)}</div>
        `
        return
      }

      const t0 = Date.now()
      while (Date.now() - t0 < 45000) {
        try {
          await refreshGatewayStatus().catch(() => {})
          const state = getGatewayHealthState()
          const info = typeof wsClient?.getConnectionInfo === 'function' ? wsClient.getConnectionInfo() : {}
          if (state.running && info.gatewayReady) {
            update(true)
            return
          }
        } catch {}
        const sec = Math.floor((Date.now() - t0) / 1000)
        btn.textContent = `${t('dashboard.starting')} ${sec}s`
        await new Promise(r => setTimeout(r, 1000))
      }

      let logHint = ''
      try {
        const logs = await api.readLogTail('gateway', 5)
        if (logs?.trim()) logHint = `<div style="font-size:12px;margin-top:4px;opacity:0.8;font-family:monospace;white-space:pre-wrap">${escapeHtml(logs.trim().split('\n').slice(-3).join('\n'))}</div>`
      } catch {}
      banner.innerHTML = `
        <div class="gw-banner-content">
          <span class="gw-banner-icon">${statusIcon('info', 16)}</span>
          <span>${t('dashboard.startTimeout')}</span>
          <a class="btn btn-sm btn-ghost" href="#/services" style="margin-left:auto">${t('sidebar.services')}</a>
          <a class="btn btn-sm btn-ghost" href="#/logs">${t('sidebar.logs')}</a>
        </div>
        ${logHint}
      `
    })
  }

  update(isGatewayRunning(), isGatewayForeign())
  onGatewayChange(update)
  wsClient.onStatusChange(() => {
    scheduleUpdate()
    refreshGatewayStatus().catch(() => {})
  })
  wsClient.onReady(() => {
    scheduleUpdate()
    refreshGatewayStatus().catch(() => {})
  })
}

function showGuardianRecovery() {
  const banner = document.getElementById('gw-banner')
  if (!banner) return
  banner.classList.remove('gw-banner-hidden')
  banner.innerHTML = `
    <div class="gw-banner-content" style="flex-wrap:wrap;gap:8px">
      <span class="gw-banner-icon">${statusIcon('warn', 16)}</span>
      <span>${t('dashboard.guardianFailed')}</span>
      <button class="btn btn-sm btn-primary" id="btn-gw-recover-fix" style="margin-left:auto">${t('dashboard.autoFix')}</button>
      <button class="btn btn-sm btn-secondary" id="btn-gw-recover-restart">${t('dashboard.retryStart')}</button>
      <a class="btn btn-sm btn-ghost" href="#/logs">${t('sidebar.logs')}</a>
    </div>
  `
  banner.querySelector('#btn-gw-recover-fix')?.addEventListener('click', async (e) => {
    const btn = e.target
    btn.disabled = true
    btn.textContent = t('dashboard.fixing')
    // 弹出修复弹窗
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `
      <div class="modal" style="max-width:560px">
        <div class="modal-title">${t('dashboard.fixModalTitle')}</div>
        <div style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:12px">
          ${t('dashboard.fixModalDesc')}
        </div>
        <div id="fix-log" style="font-family:var(--font-mono);font-size:11px;background:var(--bg-tertiary);padding:12px;border-radius:var(--radius-md);max-height:300px;overflow-y:auto;white-space:pre-wrap;line-height:1.6;color:var(--text-secondary)">${t('dashboard.fixRunning')}\n</div>
        <div id="fix-status" style="margin-top:12px;font-size:var(--font-size-sm);font-weight:600"></div>
        <div class="modal-actions" style="margin-top:16px">
          <button class="btn btn-secondary btn-sm" id="fix-close" style="display:none">${t('common.close')}</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)
    const logEl = overlay.querySelector('#fix-log')
    const statusEl = overlay.querySelector('#fix-status')
    const closeBtn = overlay.querySelector('#fix-close')
    closeBtn.onclick = () => overlay.remove()

    try {
      const result = await api.doctorFix()
      const output = result?.stdout || result?.output || JSON.stringify(result, null, 2)
      logEl.textContent = output || t('dashboard.fixDoneNoOutput')
      logEl.scrollTop = logEl.scrollHeight
      if (result?.errors) {
        statusEl.innerHTML = `<span style="color:var(--warning)">${t('dashboard.fixDoneWarning')}${escapeHtml(String(result.errors).slice(0, 200))}</span>`
      } else {
        statusEl.innerHTML = `<span style="color:var(--success)">${t('dashboard.fixDoneRestarting')}</span>`
        resetAutoRestart()
        try {
          await api.startService('ai.openclaw.gateway')
          statusEl.innerHTML = `<span style="color:var(--success)">${t('dashboard.fixDoneRestarted')}</span>`
        } catch (err) {
          if (isForeignGatewayError(err)) await openGatewayConflict(err)
          statusEl.innerHTML = `<span style="color:var(--warning)">${t('dashboard.fixDoneRestartFail')}</span>`
        }
      }
    } catch (err) {
      logEl.textContent += '\n❌ ' + (err.message || String(err))
      statusEl.innerHTML = `<span style="color:var(--error)">${t('dashboard.fixFailed')}${escapeHtml(String(err.message || err).slice(0, 200))}</span>`
    }
    closeBtn.style.display = ''
    btn.textContent = t('dashboard.autoFix')
    btn.disabled = false
  })
  banner.querySelector('#btn-gw-recover-restart')?.addEventListener('click', async (e) => {
    const btn = e.target
    btn.disabled = true
    btn.textContent = t('dashboard.fixing')
    resetAutoRestart()
    try {
      await api.startService('ai.openclaw.gateway')
      btn.textContent = t('dashboard.startSent')
    } catch (err) {
      if (isForeignGatewayError(err)) await openGatewayConflict(err)
      btn.textContent = t('dashboard.retryStart')
      btn.disabled = false
    }
  })
}

// === 全局版本更新检测 ===
const UPDATE_CHECK_INTERVAL = 30 * 60 * 1000 // 30 分钟
let _updateCheckTimer = null

async function checkGlobalUpdate() {
  const banner = document.getElementById('update-banner')
  if (!banner) return

  try {
    const info = await api.checkFrontendUpdate().catch(() => ({}))
    const fullInfo = isTauriRuntime() ? await api.checkFullAppUpdate().catch(() => null) : null
    const hasFrontendUpdate = !!info.hasUpdate
    const hasFullUpdate = !!fullInfo?.hasUpdate
    if (!hasFrontendUpdate && !hasFullUpdate) return

    const ver = info.latestVersion || fullInfo?.latestVersion || info.manifest?.version || ''
    if (!ver) return

    // 用户已忽略过该版本，不再打扰
    const dismissed = localStorage.getItem('星枢OpenClaw_update_dismissed')
    if (dismissed === ver) return

    // 热更新已下载并重载过，不再重复提示同一前端版本；但不能挡住全量更新提示
    const hotApplied = localStorage.getItem('星枢OpenClaw_hot_update_applied')
    if (hasFrontendUpdate && !hasFullUpdate && hotApplied === ver) return

    const changelog = info.manifest?.changelog || ''
    const isWeb = !isTauriRuntime()

    banner.classList.remove('update-banner-hidden')
    banner.innerHTML = `
      <div class="update-banner-content">
        <div class="update-banner-text">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span class="update-banner-ver">${t('about.versionAvailable', { version: ver })}</span>
          ${changelog ? `<span class="update-banner-changelog">· ${changelog}</span>` : ''}
        </div>
        ${isWeb
          ? `<button class="btn btn-sm" id="btn-update-show-cmd">${t('about.updateMethod')}</button>
             <a class="btn btn-sm" href="https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases" target="_blank" rel="noopener">${t('about.releaseNotes')}</a>`
          : `${hasFrontendUpdate ? `<button class="btn btn-sm" id="btn-update-hot">${t('about.hotUpdate')}</button>` : ''}
             ${hasFullUpdate ? `<button class="btn btn-sm" id="btn-update-full">${t('about.fullInstaller')}</button>` : ''}
             <a class="btn btn-sm" href="https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases" target="_blank" rel="noopener">${t('about.releaseNotes')}</a>`
        }
        <button class="update-banner-close" id="btn-update-dismiss" title="${t('about.dismissVersion')}">✕</button>
      </div>
    `

    // 关闭按钮：记住忽略的版本
    banner.querySelector('#btn-update-dismiss')?.addEventListener('click', () => {
      localStorage.setItem('星枢OpenClaw_update_dismissed', ver)
      banner.classList.add('update-banner-hidden')
    })

    // Web 模式：显示更新命令弹窗
    banner.querySelector('#btn-update-show-cmd')?.addEventListener('click', () => {
      const overlay = document.createElement('div')
      overlay.className = 'modal-overlay'
      overlay.innerHTML = `
        <div class="modal" style="max-width:480px">
          <div class="modal-title">${t('about.updateToVersion', { version: ver })}</div>
          <div style="font-size:var(--font-size-sm);line-height:1.8">
            <p style="margin-bottom:12px">${t('about.runOnServer')}</p>
            <pre style="background:var(--bg-tertiary);padding:12px 16px;border-radius:var(--radius-md);font-family:var(--font-mono);font-size:var(--font-size-xs);overflow-x:auto;white-space:pre-wrap;user-select:all">cd /opt/tulu-openclaw-v2
git pull origin main
npm install
npm run build
sudo systemctl restart xingshu-chat
sudo systemctl reload nginx</pre>
            <p style="margin-top:12px;color:var(--text-tertiary);font-size:var(--font-size-xs)">
              ${t('about.updateCommandHint')}
            </p>
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary btn-sm" data-action="close">${t('common.close')}</button>
          </div>
        </div>
      `
      document.body.appendChild(overlay)
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove() })
      overlay.querySelector('[data-action="close"]').onclick = () => overlay.remove()
      overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') overlay.remove() })
    })

    // Tauri 热更新按钮
    banner.querySelector('#btn-update-hot')?.addEventListener('click', async () => {
      const btn = banner.querySelector('#btn-update-hot')
      if (!btn) return
      btn.disabled = true
      btn.textContent = t('about.downloading')
      try {
        const result = await api.downloadFrontendUpdate(info.manifest?.url || '', info.manifest?.hash || '')
        localStorage.setItem('星枢OpenClaw_hot_update_applied', ver)
        const desktopZip = result?.desktopZip || ''
        // 下载完成 → 添加「打开ZIP」按钮（ZIP已自动打开）
        const btnGroup = btn.parentElement
        if (desktopZip && btnGroup) {
          const openBtn = document.createElement('button')
          openBtn.className = 'btn btn-sm'
          openBtn.textContent = '📂 ' + t('about.openZip')
          openBtn.onclick = async () => {
            try {
              await api.openDesktopZip(desktopZip)
            } catch (e) {
              console.error('Open desktop update ZIP failed:', e)
              const { toast } = await import('./components/toast.js')
              toast(t('about.openZipFailed') + (e?.message || e), 'error')
            }
          }
          btnGroup.insertBefore(openBtn, btn)
        }
        btn.textContent = '🔄 ' + t('about.reloadApp')
        btn.disabled = false
        btn.onclick = () => window.location.reload()
      } catch (e) {
        btn.textContent = t('about.downloadFailedShort')
        btn.disabled = false
        const { toast } = await import('./components/toast.js')
        toast(t('about.downloadFailed') + (e.message || e), 'error')
      }
    })
  } catch {
    // 检查失败静默忽略
  }
}

function startUpdateChecker() {
  // 启动后 5 秒检查一次
  setTimeout(checkGlobalUpdate, 5000)
  // 之后每 30 分钟检查一次
  _updateCheckTimer = setInterval(checkGlobalUpdate, UPDATE_CHECK_INTERVAL)

  // 龙虾办公室状态同步（每30秒）
  if (isTauri) {
    setInterval(() => {
      api.syncOpenclawToOffice().catch(() => {})
    }, 30000)
    // 启动时立即同步一次
    api.syncOpenclawToOffice().catch(() => {})
  }
}

// 启动：先检查后端 → 认证 → 加载应用
;(async () => {
  // Web 模式：先检测后端是否在线（不在线则显示提示，不加载应用）
  if (!isTauri) {
    const backendOk = await checkBackendHealth()
    if (!backendOk) {
      showBackendDownOverlay()
      return
    }
  }

  // === 微验卡密验证（启动时必须通过，失败时循环重试，最多3次内置模块，之后显示 fallback）===
  let kamiVerified = false
  let kamiFailCount = 0
  while (!kamiVerified) {
    try {
      const { showKamiVerifyModal } = await import('./components/kami-modal.js')
      await showKamiVerifyModal()
      kamiVerified = true
    } catch (err) {
      kamiFailCount++
      console.error(`[kami] 验证模块加载失败 (${kamiFailCount}/3):`, err)
      if (kamiFailCount >= 3) {
        // 3次失败后显示 fallback，确保用户至少能看到一个可操作的界面
        showKamiFallbackModal()
        kamiVerified = true
      } else {
        await new Promise(r => setTimeout(r, 1000))
      }
    }
  }

  const auth = await checkAuth()
  if (!auth.ok) await showLoginOverlay(auth.defaultPw)

  try {
    await boot()
  } catch (bootErr) {
    console.error('[main] boot() 失败:', bootErr)
    _hideSplash()
    const app = document.getElementById('app')
    if (app) app.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:20px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
        <div style="font-size:48px;margin-bottom:16px">⚠️</div>
        <div style="font-size:18px;font-weight:600;margin-bottom:8px;color:#18181b">${t('common.pageLoadFailed')}</div>
        <div style="font-size:13px;color:#71717a;max-width:400px;line-height:1.6;margin-bottom:16px">${String(bootErr?.message || bootErr).replace(/</g,'&lt;')}</div>
        <button id="boot-reload-btn" style="padding:8px 20px;border-radius:8px;border:none;background:#6366f1;color:#fff;font-size:13px;cursor:pointer">${t('common.reloadRetry')}</button>
        <div style="margin-top:24px;font-size:11px;color:#a1a1aa">${t('common.pageLoadFailedHint')}<br><a href="https://github.com/qingchencloud/星枢OpenClaw/issues" target="_blank" style="color:#6366f1">GitHub Issues</a></div>
      </div>`
    app.querySelector('#boot-reload-btn')?.addEventListener('click', () => location.reload())
  }
  startUpdateChecker()

  // 初始化全局 AI 助手浮动按钮（延迟加载，不阻塞启动）
  setTimeout(async () => {
    const { initAIFab, registerPageContext, openAIDrawerWithError } = await import('./components/ai-drawer.js')
    initAIFab()

    // 注册各页面上下文提供器
    const formatGatewayContextStatus = (gw) => {
      if (gw.foreign) return t('common.gatewayForeign')
      if (gw.health === 'running') return t('common.gatewayReady')
      if (gw.health === 'degraded') return t('common.gatewayDegraded')
      if (gw.health === 'recovering') return t('common.gatewayRecovering')
      return t('common.notRunning')
    }
    const boolLabel = (value) => value ? t('common.yes') : t('common.no')
    const connectedLabel = (value) => value ? t('common.connected') : t('common.notConnected')
    const installedLabel = (value) => value ? t('common.installed') : t('common.notInstalled')

    registerPageContext('/chat-debug', async () => {
      const { isOpenclawReady, getGatewayHealthState } = await import('./lib/app-state.js')
      const { wsClient } = await import('./lib/ws-client.js')
      const { api } = await import('./lib/tauri-api.js')
      const lines = [`## ${t('common.systemDiagnosticsSnapshot')}`]
      const gw = getGatewayHealthState()
      const gwLabel = formatGatewayContextStatus(gw)
      lines.push(`- OpenClaw: ${boolLabel(isOpenclawReady())}`)
      lines.push(`- Gateway: ${gwLabel}`)
      lines.push(`- WebSocket: ${connectedLabel(wsClient.connected)}`)
      try {
        const node = await api.checkNode()
        lines.push(`- Node.js: ${node?.version || t('common.unknown')}`)
      } catch {}
      try {
        const ver = await api.getVersionInfo()
        const current = ver?.current || '?'
        const recommended = ver?.recommended || '?'
        const latest = ver?.latest || '?'
        const ahead = ver?.ahead_of_recommended ? ` / ${t('common.currentAheadRecommended')}` : ''
        lines.push(`- ${t('common.version')}: ${t('common.current')} ${current} / ${t('common.recommended')} ${recommended} / ${t('common.latest')} ${latest}${ahead}`)
      } catch {}
      return { detail: lines.join('\n') }
    })

    registerPageContext('/services', async () => {
      const { getGatewayHealthState } = await import('./lib/app-state.js')
      const { api } = await import('./lib/tauri-api.js')
      const lines = [`## ${t('common.serviceStatus')}`]
      const gw = getGatewayHealthState()
      const gwLabel = formatGatewayContextStatus(gw)
      lines.push(`- Gateway: ${gwLabel}`)
      try {
        const svc = await api.getServicesStatus()
        if (svc?.[0]) {
          lines.push(`- CLI: ${installedLabel(svc[0].cli_installed)}`)
          lines.push(`- PID: ${svc[0].pid || t('common.none')}`)
        }
      } catch {}
      return { detail: lines.join('\n') }
    })

    registerPageContext('/gateway', async () => {
      const { api } = await import('./lib/tauri-api.js')
      try {
        const config = await api.readOpenclawConfig()
        const gw = config?.gateway || {}
        const lines = [`## ${t('common.gatewayConfig')}`]
        lines.push(`- ${t('common.port')}: ${gw.port || 18789}`)
        lines.push(`- ${t('common.mode')}: ${gw.mode || 'local'}`)
        lines.push(`- Token: ${gw.auth?.token ? t('common.configured') : t('common.notConfigured')}`)
        if (gw.controlUi?.allowedOrigins) lines.push(`- Origins: ${JSON.stringify(gw.controlUi.allowedOrigins)}`)
        return { detail: lines.join('\n') }
      } catch { return null }
    })

    registerPageContext('/setup', () => {
      return { detail: t('common.setupContextHelp') }
    })

    // 挂到全局，供安装/升级失败时调用
    window.__openAIDrawerWithError = openAIDrawerWithError
  }, 500)
})()
