/**
 * Hermes Agent 引擎
 *
 * 集成 TuLuOpenClaw 的 Hermes Agent 对话引擎，作为第二个引擎插件。
 * 使用现有的 router + api + ws-client 基础设施。
 */
import { registerRoute, setDefaultRoute } from '../../router.js'
import './hermes.css'

// ==================== 引擎元数据 ====================
export const engineMeta = {
  id: 'hermes',
  name: 'Hermes',
  icon: '🔮',
  description: 'Hermes Agent — 新一代 AI 对话引擎',
}

// ==================== 路由注册 ====================
const ROUTES = [
  { path: '/hermes', loader: () => import('./pages/dashboard.js') },
  { path: '/hermes/dashboard', loader: () => import('./pages/dashboard.js') },
  { path: '/hermes/chat', loader: () => import('./pages/chat.js') },
  { path: '/hermes/setup', loader: () => import('./pages/setup.js') },
  { path: '/hermes/skills', loader: () => import('./pages/skills.js') },
  { path: '/hermes/channels', loader: () => import('./pages/channels.js') },
  { path: '/hermes/logs', loader: () => import('./pages/logs.js') },
  { path: '/hermes/memory', loader: () => import('./pages/memory.js') },
  { path: '/hermes/config', loader: () => import('./pages/config.js') },
]

// ==================== 引擎接口 ====================

export function getRoutes() {
  return ROUTES
}

export function getDefaultRoute() {
  return '/hermes/chat'
}

export async function boot() {
  for (const r of ROUTES) {
    registerRoute(r.path, r.loader)
  }
  setDefaultRoute(getDefaultRoute())
  console.log('[Hermes Engine] booted')
}

export function cleanup() {
  console.log('[Hermes Engine] cleaned up')
}