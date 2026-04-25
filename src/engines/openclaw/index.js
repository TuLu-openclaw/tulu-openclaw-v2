/**
 * OpenClaw 引擎入口
 * 复用 tulu-openclaw 现有的所有路由和页面
 */
import { registerRoute, setDefaultRoute } from '../../router.js'

export const engineMeta = {
  id: 'openclaw',
  name: 'OpenClaw',
  icon: '⚡',
  description: 'OpenClaw AI Agent 引擎',
}

const ROUTES = [
  { path: '/dashboard', loader: () => import('../../pages/dashboard.js') },
  { path: '/agents', loader: () => import('../../pages/agents.js') },
  { path: '/agent/:id', loader: () => import('../../pages/agent-detail.js') },
  { path: '/chat', loader: () => import('../../pages/chat.js') },
  { path: '/logs', loader: () => import('../../pages/logs.js') },
  { path: '/skills', loader: () => import('../../pages/skills.js') },
  { path: '/settings', loader: () => import('../../pages/settings.js') },
  { path: '/extensions', loader: () => import('../../pages/extensions.js') },
  { path: '/models', loader: () => import('../../pages/models.js') },
  { path: '/channels', loader: () => import('../../pages/channels.js') },
  { path: '/services', loader: () => import('../../pages/services.js') },
  { path: '/gateway', loader: () => import('../../pages/gateway.js') },
  { path: '/cron', loader: () => import('../../pages/cron.js') },
  { path: '/usage', loader: () => import('../../pages/usage.js') },
  { path: '/memory', loader: () => import('../../pages/memory.js') },
  { path: '/communication', loader: () => import('../../pages/communication.js') },
  { path: '/security', loader: () => import('../../pages/security.js') },
  { path: '/setup', loader: () => import('../../pages/setup.js') },
  { path: '/about', loader: () => import('../../pages/about.js') },
  { path: '/assistant', loader: () => import('../../pages/assistant.js') },
  { path: '/coming-soon', loader: () => import('../../pages/coming-soon.js') },
  { path: '/communication', loader: () => import('../../pages/communication.js') },
  { path: '/tvbox', loader: () => import('../../pages/tvbox.js') },
  { path: '/movie-tool', loader: () => import('../../pages/movie-tool.js') },
  { path: '/miaogu-verify', loader: () => import('../../pages/miaogu-verify.js') },
  { path: '/weiyan-verify', loader: () => import('../../pages/weiyan-verify.js') },
]

export function getRoutes() {
  return ROUTES
}

export function getDefaultRoute() {
  return '/dashboard'
}

export async function boot() {
  for (const r of ROUTES) {
    registerRoute(r.path, r.loader)
  }
  setDefaultRoute(getDefaultRoute())
  console.log('[OpenClaw Engine] booted')
}

export function cleanup() {
  console.log('[OpenClaw Engine] cleaned up')
}
