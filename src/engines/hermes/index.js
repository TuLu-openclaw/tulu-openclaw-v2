/**
 * Hermes Agent 引擎
 *
 * 集成 ClawPanel 的 Hermes Agent 对话引擎，作为第二个引擎插件。
 * 使用 existing 的 router + api + ws-client 基础设施。
 */
import { registerRoute, setDefaultRoute } from '../../router.js'
import { api } from '../../lib/tauri-api.js'
import './hermes.css'

// ==================== 引擎元数据 ====================
export const engineMeta = {
  id: 'hermes',
  name: 'Hermes Agent',
  icon: '🤖',
  description: 'Hermes Agent — 新一代 AI 对话引擎',
}

// ==================== 路由注册 ====================
const ROUTES = [
  // 主页 / 默认
  { path: '/hermes', loader: () => import('./pages/dashboard.js') },
  { path: '/hermes/dashboard', loader: () => import('./pages/dashboard.js') },
  // 核心功能
  { path: '/hermes/chat', loader: () => import('./pages/chat.js') },
  { path: '/hermes/setup', loader: () => import('./pages/setup.js') },
  { path: '/hermes/skills', loader: () => import('./pages/skills.js') },
  // 运维功能
  { path: '/hermes/channels', loader: () => import('./pages/channels.js') },
  { path: '/hermes/logs', loader: () => import('./pages/logs.js') },
  { path: '/hermes/memory', loader: () => import('./pages/memory.js') },
  { path: '/hermes/config', loader: () => import('./pages/config.js') },
]

// ==================== 引擎接口 ====================

/** 返回所有路由 */
export function getRoutes() {
  return ROUTES
}

/** 返回默认路由 */
export function getDefaultRoute() {
  return '/hermes/chat'
}

/**
 * 启动 Hermes 引擎
 * 注册所有路由，设置默认路由
 */
export async function boot() {
  for (const r of ROUTES) {
    registerRoute(r.path, r.loader)
  }
  setDefaultRoute(getDefaultRoute())
  console.log('[Hermes Engine] booted')
}

/** 清理引擎 */
export function cleanup() {
  console.log('[Hermes Engine] cleaned up')
}
