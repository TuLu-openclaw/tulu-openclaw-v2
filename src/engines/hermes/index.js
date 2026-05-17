/**
 * Hermes Gateway 状态守护
 * - 轮询 checkHermes / hermesHealthCheck
 * - 断开后自动重启（用户主动停止除外）
 * - 对外暴露状态监听，供 UI 做实时动态展示
 */
import { api, invalidate } from '../../lib/tauri-api.js'
import { t } from '../../lib/i18n.js'
import {
  evaluateAutoRestartAttempt,
  shouldResetAutoRestartCount,
} from '../../lib/gateway-guardian-policy.js'

const HERMES_POLL_INTERVAL = 15000
const HERMES_OFFLINE_THRESHOLD = 3

// Hermes 状态
let _ready = false
let _running = false
let _listeners = []
let _pollTimer = null
let _health = null
let _lastCheckAt = 0
let _stopCount = 0
let _userStopped = false
let _autoRestartCount = 0
let _lastRestartTime = 0
let _gatewayRunningSince = 0
let _gatewayStatus = 'unknown' // running | degraded | offline | recovering | unknown
let _checkInFlight = false

function emitState() {
  const payload = {
    ready: _ready,
    running: _running,
    health: _health,
    lastCheckAt: _lastCheckAt,
    autoRestartCount: _autoRestartCount,
    userStopped: _userStopped,
    status: _gatewayStatus,
  }
  _listeners.forEach(fn => { try { fn(payload) } catch (_) {} })
}

async function tryAutoRestart() {
  if (_userStopped || !_ready) return
  const now = Date.now()
  const decision = evaluateAutoRestartAttempt({
    now,
    lastRestartTime: _lastRestartTime,
    autoRestartCount: _autoRestartCount,
  })
  if (decision.action === 'cooldown' || decision.action === 'give_up') return
  _autoRestartCount = decision.autoRestartCount
  _lastRestartTime = decision.lastRestartTime
  _gatewayStatus = 'recovering'
  emitState()
  try {
    await api.hermesGatewayAction('start')
  } catch (_) {}
}

function setRunning(nextRunning) {
  const changed = _running !== !!nextRunning
  _running = !!nextRunning
  if (_running) {
    _stopCount = 0
    _gatewayStatus = _health ? 'running' : 'degraded'
    if (!_gatewayRunningSince) _gatewayRunningSince = Date.now()
    if (shouldResetAutoRestartCount({
      autoRestartCount: _autoRestartCount,
      runningSince: _gatewayRunningSince,
      now: Date.now(),
    })) {
      _autoRestartCount = 0
    }
  } else {
    _gatewayRunningSince = 0
  }
  if (changed) {
    emitState()
    if (!_running) tryAutoRestart()
  }
}

async function detectHermesStatus() {
  if (_checkInFlight) return _ready
  _checkInFlight = true
  try {
    invalidate('check_hermes')
    const info = await api.checkHermes()
    _ready = !!info?.installed && !!info?.configExists
    const gatewayRunning = !!info?.gatewayRunning

    if (gatewayRunning) {
      _stopCount = 0
      _health = await api.hermesHealthCheck().catch(() => null)
      _gatewayStatus = _health ? 'running' : 'degraded'
      setRunning(true)
    } else {
      _health = null
      _stopCount += 1
      _gatewayStatus = _stopCount >= HERMES_OFFLINE_THRESHOLD ? 'offline' : 'degraded'
      if (_stopCount >= HERMES_OFFLINE_THRESHOLD || !_running) setRunning(false)
    }
  } catch (_) {
    _ready = false
    _health = null
    _stopCount += 1
    _gatewayStatus = _stopCount >= HERMES_OFFLINE_THRESHOLD ? 'offline' : 'degraded'
    if (_stopCount >= HERMES_OFFLINE_THRESHOLD) setRunning(false)
  } finally {
    _lastCheckAt = Date.now()
    _checkInFlight = false
  }
  emitState()
  return _ready
}

function startPoll() {
  if (_pollTimer) return
  _pollTimer = setInterval(detectHermesStatus, HERMES_POLL_INTERVAL)
}

function stopPoll() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null }
}

export const engineMeta = {
  id: 'hermes',
  name: 'Hermes Agent',
  description: 'Hermes AI Agent with tool-calling capabilities',
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
}

export async function detect() {
  await detectHermesStatus()
  return { installed: _ready, ready: _ready }
}

export async function boot() {
  await detectHermesStatus()
  startPoll()
}

export function cleanup() {
  stopPoll()
}

export function setUserStopped(v) {
  _userStopped = !!v
}

export function resetAutoRestart() {
  _userStopped = false
  _autoRestartCount = 0
  _lastRestartTime = 0
  _gatewayRunningSince = 0
}

export function getGatewayState() {
  return {
    ready: _ready,
    running: _running,
    health: _health,
    lastCheckAt: _lastCheckAt,
    autoRestartCount: _autoRestartCount,
    userStopped: _userStopped,
    status: _gatewayStatus,
  }
}

export function getNavItems() {
    // 未就绪时显示 Setup 菜单
    if (!_ready) {
      return [{
        section: '',
        items: [
          { route: '/h/setup', label: t('sidebar.setup'), icon: 'setup' },
          { route: '/assistant', label: t('sidebar.assistant'), icon: 'assistant' },
        ]
      }, {
        section: '',
        items: [
          { route: '/settings', label: t('sidebar.settings'), icon: 'settings' },
          { route: '/about', label: t('sidebar.about'), icon: 'about' },
        ]
      }]
    }
    // 就绪后显示完整菜单
    return [{
      section: t('sidebar.sectionMonitor'),
      items: [
        { route: '/h/dashboard', label: t('sidebar.dashboard'), icon: 'dashboard' },
        { route: '/h/chat', label: t('sidebar.chat'), icon: 'chat' },
        { route: '/h/sessions', label: t('sidebar.sessions'), icon: 'inbox' },
        { route: '/h/logs', label: t('sidebar.logs'), icon: 'logs' },
        { route: '/h/usage', label: t('sidebar.usage'), icon: 'bar-chart' },
      ]
    }, {
      section: t('sidebar.sectionManage'),
      items: [
        { route: '/h/skills', label: t('sidebar.skills'), icon: 'skills' },
        { route: '/h/memory', label: t('sidebar.memory'), icon: 'memory' },
        { route: '/h/cron', label: t('sidebar.cron'), icon: 'clock' },
        { route: '/h/extensions', label: t('sidebar.extensions'), icon: 'package' },
      ]
    }, {
      section: '',
      items: [
        { route: '/assistant', label: t('sidebar.assistant'), icon: 'assistant' },
        { route: '/settings', label: t('sidebar.settings'), icon: 'settings' },
        { route: '/about', label: t('sidebar.about'), icon: 'about' },
      ]
    }]
}

export function getRoutes() {
    return [
      // Hermes 专属页面（/h/ 前缀）
      { path: '/h/setup', loader: () => import('./pages/setup.js') },
      { path: '/h/dashboard', loader: () => import('./pages/dashboard.js') },
      { path: '/h/chat', loader: () => import('./pages/chat.js') },
      { path: '/h/sessions', loader: () => import('./pages/sessions.js') },
      { path: '/h/logs', loader: () => import('./pages/logs.js') },
      { path: '/h/usage', loader: () => import('./pages/usage.js') },
      { path: '/h/skills', loader: () => import('./pages/skills.js') },
      { path: '/h/memory', loader: () => import('./pages/memory.js') },
      { path: '/h/cron', loader: () => import('./pages/cron.js') },
      { path: '/h/extensions', loader: () => import('./pages/extensions.js') },
      { path: '/h/services', loader: () => import('./pages/services.js') },
      { path: '/h/config', loader: () => import('./pages/config.js') },
      { path: '/h/channels', loader: () => import('./pages/channels.js') },
      { path: '/h/env', loader: () => import('./pages/env-editor.js') },
      // 共用页面（引擎无关）
      { path: '/assistant', loader: () => import('../../pages/assistant.js') },
      { path: '/settings', loader: () => import('../../pages/settings.js') },
      { path: '/about', loader: () => import('../../pages/about.js') },
    ]
}

export function getSetupRoute() { return '/h/setup' }
export function getDefaultRoute() { return '/h/dashboard' }

export function isReady() { return _ready }
export function isGatewayRunning() { return _running }
export function isGatewayForeign() { return false }

export function onStateChange(fn) {
  _listeners.push(fn)
  return () => { _listeners = _listeners.filter(cb => cb !== fn) }
}

export function onReadyChange(fn) {
  _listeners.push(fn)
  return () => { _listeners = _listeners.filter(cb => cb !== fn) }
}

export function isFeatureAvailable() { return true }

export default {
  ...engineMeta,
  detect,
  boot,
  cleanup,
  getNavItems,
  getRoutes,
  getSetupRoute,
  getDefaultRoute,
  isReady,
  isGatewayRunning,
  isGatewayForeign,
  onStateChange,
  onReadyChange,
  isFeatureAvailable,
  setUserStopped,
  resetAutoRestart,
  getGatewayState,
}
