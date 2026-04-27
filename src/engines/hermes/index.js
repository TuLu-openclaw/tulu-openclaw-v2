/**
 * Hermes Agent 引擎
 */
import { t } from '../../lib/i18n.js'
import { api, invalidate } from '../../lib/tauri-api.js'

// Hermes 状态
let _ready = false
let _running = false
let _listeners = []
let _pollTimer = null

async function detectHermesStatus() {
  try {
    invalidate('check_hermes')
    const info = await api.checkHermes()
    _ready = !!info?.installed && !!info?.configExists
    _running = !!info?.gatewayRunning
  } catch (_) {
    _ready = false
    _running = false
  }
  _listeners.forEach(fn => { try { fn({ ready: _ready, running: _running }) } catch (_) {} })
  return _ready
}

function startPoll() {
  if (_pollTimer) return
  _pollTimer = setInterval(detectHermesStatus, 15000)
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
}
