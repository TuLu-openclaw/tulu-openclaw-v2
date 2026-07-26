/**
 * Locale catalog. Only shell translations are part of the startup graph;
 * page catalogs stay behind their dynamic route imports.
 */
import { SUPPORTED_LANGS } from './helper.js'
import common from './modules/common.js'
import sidebar from './modules/sidebar.js'
import instance from './modules/instance.js'
import security from './modules/security.js'
import kami from './modules/kami.js'
import chat from './modules/chat.js'

export const STARTUP_LOCALE_MODULES = Object.freeze({
  common,
  sidebar,
  instance,
  security,
  kami,
  chat,
})

export const LOCALE_MODULE_LOADERS = Object.freeze({
  dashboard: () => import('./modules/dashboard.js'),
  services: () => import('./modules/services.js'),
  settings: () => import('./modules/settings.js'),
  models: () => import('./modules/models.js'),
  agents: () => import('./modules/agents.js'),
  routeGraph: () => import('./modules/routeGraph.js'),
  agentDetail: () => import('./modules/agentDetail.js'),
  gateway: () => import('./modules/gateway.js'),
  communication: () => import('./modules/communication.js'),
  channels: () => import('./modules/channels.js'),
  memory: () => import('./modules/memory.js'),
  cron: () => import('./modules/cron.js'),
  usage: () => import('./modules/usage.js'),
  skills: () => import('./modules/skills.js'),
  chatDebug: () => import('./modules/chat-debug.js'),
  setup: () => import('./modules/setup.js'),
  about: () => import('./modules/about.js'),
  ext: () => import('./modules/ext.js'),
  logs: () => import('./modules/logs.js'),
  assistant: () => import('./modules/assistant.js'),
  toast: () => import('./modules/toast.js'),
  modal: () => import('./modules/modal.js'),
  engagement: () => import('./modules/engagement.js'),
  engine: () => import('./modules/engine.js'),
  music: () => import('./modules/music.js'),
  openclawSetup: () => import('./modules/openclaw-setup.js'),
  verify: () => import('./modules/verify.js'),
  tvbox: () => import('./modules/tvbox.js'),
  movieTool: () => import('./modules/movie-tool.js'),
  xingshuChat: () => import('./modules/xingshuChat.js'),
  channelLabels: () => import('./modules/channelLabels.js'),
  lobsterOffice: () => import('./modules/lobsterOffice.js'),
})

const ROUTE_LOCALE_MODULES = Object.freeze({
  '/dashboard': ['dashboard'],
  '/chat': ['engagement'],
  '/chat-debug': ['chatDebug'],
  '/services': ['services'],
  '/logs': ['logs'],
  '/models': ['models'],
  '/agents': ['agents'],
  '/route-graph': ['routeGraph'],
  '/agency-agents': ['agents'],
  '/agent-detail': ['agentDetail'],
  '/gateway': ['gateway'],
  '/memory': ['memory'],
  '/skills': ['skills'],
  '/miaogu-verify': ['verify'],
  '/weiyan-verify': ['verify'],
  '/movie-tool': ['movieTool'],
  '/music-player': ['music'],
  '/xingshu-chat': ['xingshuChat'],
  '/lobster-office': ['lobsterOffice'],
  '/security': [],
  '/about': ['about'],
  '/assistant': ['assistant'],
  '/setup': ['setup', 'openclawSetup'],
  '/channels': ['channels', 'channelLabels'],
  '/cron': ['cron'],
  '/usage': ['usage'],
  '/communication': ['communication'],
  '/settings': ['settings'],
  '/extensions': ['ext'],
})

const _modulePromises = new Map()

export function buildLocales(modules = STARTUP_LOCALE_MODULES) {
  const result = Object.fromEntries(SUPPORTED_LANGS.map(lang => [lang, {}]))
  for (const [mod, entries] of Object.entries(modules)) {
    for (const lang of SUPPORTED_LANGS) {
      result[lang][mod] = buildLocaleModule(entries, lang)
    }
  }
  return result
}

export function buildLocaleModule(entries, lang) {
  const result = {}
  for (const [key, translations] of Object.entries(entries)) {
    result[key] = translations[lang] || translations['zh-CN'] || key
  }
  return result
}

export function getRouteLocaleModules(routePath) {
  if (routePath.startsWith('/h/')) return ['engine']
  return ROUTE_LOCALE_MODULES[routePath] || []
}

export async function loadLocaleModule(name) {
  if (STARTUP_LOCALE_MODULES[name]) return STARTUP_LOCALE_MODULES[name]
  const loader = LOCALE_MODULE_LOADERS[name]
  if (!loader) throw new Error(`Unknown locale module: ${name}`)
  if (!_modulePromises.has(name)) {
    _modulePromises.set(name, loader().then(mod => mod.default))
  }
  return _modulePromises.get(name)
}

export async function buildAllLocales() {
  const modules = { ...STARTUP_LOCALE_MODULES }
  await Promise.all(Object.keys(LOCALE_MODULE_LOADERS).map(async name => {
    modules[name] = await loadLocaleModule(name)
  }))
  return buildLocales(modules)
}
