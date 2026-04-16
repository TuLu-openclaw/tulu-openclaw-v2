/**
 * OpenClaw 默认引擎
 *
 * 提供 OpenClaw 主 UI 的引擎接口。
 * 路由已在 main.js 中通过 registerRoute 注册，这里提供引擎元数据。
 */
export const engineMeta = {
  id: 'openclaw',
  name: 'OpenClaw',
  icon: '🪶',
  description: 'TuLu OpenClaw 主界面',
}

// OpenClaw 的主要路由（与 sidebar.js NAV_ITEMS_FULL 对应）
const ROUTES = [
  { path: '/', loader: () => import('../../pages/dashboard.js') },
  { path: '/dashboard', loader: () => import('../../pages/dashboard.js') },
  { path: '/assistant', loader: () => import('../../pages/assistant.js') },
  { path: '/chat', loader: () => import('../../pages/chat.js') },
  { path: '/services', loader: () => import('../../pages/services.js') },
  { path: '/logs', loader: () => import('../../pages/logs.js') },
  { path: '/models', loader: () => import('../../pages/models.js') },
  { path: '/agents', loader: () => import('../../pages/agents.js') },
  { path: '/gateway', loader: () => import('../../pages/gateway.js') },
  { path: '/channels', loader: () => import('../../pages/channels.js') },
  { path: '/communication', loader: () => import('../../pages/communication.js') },
  { path: '/security', loader: () => import('../../pages/security.js') },
  { path: '/memory', loader: () => import('../../pages/memory.js') },
  { path: '/cron', loader: () => import('../../pages/cron.js') },
  { path: '/usage', loader: () => import('../../pages/usage.js') },
  { path: '/skills', loader: () => import('../../pages/skills.js') },
  { path: '/settings', loader: () => import('../../pages/settings.js') },
  { path: '/chat-debug', loader: () => import('../../pages/chat-debug.js') },
  { path: '/about', loader: () => import('../../pages/about.js') },
  { path: '/setup', loader: () => import('../../pages/setup.js') },
]

/** 返回所有路由 */
export function getRoutes() {
  return ROUTES
}

/** 返回默认路由 */
export function getDefaultRoute() {
  return '/dashboard'
}

/**
 * 启动 OpenClaw 引擎（路由已由 main.js 注册，无需重复注册）
 */
export async function boot() {
  // OpenClaw 路由已在 main.js 中通过 registerRoute 注册
  // 此处无需额外操作
}

/**
 * 清理 OpenClaw 引擎
 */
export async function cleanup() {
  // 清理工作（如有）可在此添加
}
