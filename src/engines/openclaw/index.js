/**
 * OpenClaw 默认引擎
 *
 * 提供 OpenClaw 主 UI 的引擎接口和唯一的路由清单。
 */
export const engineMeta = {
  id: 'openclaw',
  name: 'OpenClaw',
  icon: '🪶',
  description: 'TuLu OpenClaw 主界面',
}

// OpenClaw 的全部页面路由。侧栏可以只展示其中一部分，但不能另行注册路由。
const ROUTES = [
  { path: '/', loader: () => import('../../pages/dashboard.js') },
  { path: '/dashboard', loader: () => import('../../pages/dashboard.js') },
  { path: '/assistant', loader: () => import('../../pages/assistant.js') },
  { path: '/chat', loader: () => import('../../pages/chat.js') },
  { path: '/chat-debug', loader: () => import('../../pages/chat-debug.js') },
  { path: '/services', loader: () => import('../../pages/services.js') },
  { path: '/logs', loader: () => import('../../pages/logs.js') },
  { path: '/models', loader: () => import('../../pages/models.js') },
  { path: '/agents', loader: () => import('../../pages/agents.js') },
  {
    path: '/route-graph',
    loader: () => Promise.all([
      import('../../pages/route-graph.js'),
      import('../../style/route-graph.css'),
    ]).then(([page]) => page),
  },
  { path: '/agency-agents', loader: () => import('../../pages/agency-agents.js') },
  { path: '/agent-detail', loader: () => import('../../pages/agent-detail.js') },
  { path: '/gateway', loader: () => import('../../pages/gateway.js') },
  { path: '/channels', loader: () => import('../../pages/channels.js') },
  { path: '/communication', loader: () => import('../../pages/communication.js') },
  { path: '/security', loader: () => import('../../pages/security.js') },
  { path: '/memory', loader: () => import('../../pages/memory.js') },
  { path: '/cron', loader: () => import('../../pages/cron.js') },
  { path: '/usage', loader: () => import('../../pages/usage.js') },
  { path: '/skills', loader: () => import('../../pages/skills.js') },
  { path: '/miaogu-verify', loader: () => import('../../pages/miaogu-verify.js') },
  { path: '/weiyan-verify', loader: () => import('../../pages/weiyan-verify.js') },
  { path: '/movie-tool', loader: () => import('../../pages/movie-tool.js') },
  { path: '/openmontage', loader: () => import('../../pages/openmontage.js') },
  { path: '/cli-anything', loader: () => import('../../pages/cli-anything.js') },
  { path: '/browser-use', loader: () => import('../../pages/browser-use.js') },
  { path: '/extensions', loader: () => import('../../pages/extensions.js') },
  { path: '/music-player', loader: () => import('../../pages/music-player.js') },
  { path: '/xingshu-chat', loader: () => import('../../pages/xingshu-chat.js') },
  { path: '/xingshu-skill-center', loader: () => import('../../pages/xingshu-skill-center.js') },
  { path: '/xingshu-skill-security', loader: () => import('../../pages/xingshu-skill-security.js') },
  { path: '/lobster-office', loader: () => import('../../pages/lobster-office.js') },
  { path: '/coming-soon', loader: () => import('../../pages/coming-soon.js') },
  { path: '/settings', loader: () => import('../../pages/settings.js') },
  { path: '/about', loader: () => import('../../pages/about.js') },
  { path: '/setup', loader: () => import('./pages/setup.js') },
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
 * 启动 OpenClaw 引擎
 */
export async function boot() {
  // 路由由 engine-manager 在激活引擎时注册。
}

/**
 * 清理 OpenClaw 引擎
 */
export async function cleanup() {
  // 清理工作（如有）可在此添加
}
