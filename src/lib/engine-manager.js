/**
 * 引擎管理器
 * 管理多引擎（OpenClaw / Hermes Agent / ...）的注册、切换和状态
 */
import { api } from './tauri-api.js'
import { registerRoute, setDefaultRoute, navigate } from '../router.js'

const _engines = {}
let _activeEngine = null
let _listeners = []
let _switchPromise = Promise.resolve()
let _engineSetupChoice = null

/** 注册引擎 */
export function registerEngine(engine) {
  _engines[engine.id] = engine
}

/** 获取所有已注册引擎 */
export function listEngines() {
  return Object.values(_engines).map(e => ({
    id: e.id,
    name: e.name,
    icon: e.icon || '',
    description: e.description || '',
  }))
}

/** 获取当前激活的引擎 */
export function getActiveEngine() {
  return _activeEngine
}

/** 获取引擎 ID */
export function getActiveEngineId() {
  return _activeEngine?.id || 'openclaw'
}

/** 按 ID 获取引擎 */
export function getEngine(id) {
  return _engines[id] || null
}

/** Return whether the user has explicitly selected an engine. */
export function getEngineSetupState() {
  return {
    hasChoice: !!_engineSetupChoice,
    choice: _engineSetupChoice,
  }
}

export function resolveEngineSetup(config, registeredIds) {
  const cfg = config && typeof config === 'object' ? config : {}
  const ids = new Set(registeredIds)
  const explicit = typeof cfg.engineSetupChoice === 'string' && ids.has(cfg.engineSetupChoice)
    ? cfg.engineSetupChoice
    : null
  const deferred = cfg.engineMode === 'deferred'
  const configured = typeof cfg.engineMode === 'string' && ids.has(cfg.engineMode)
    ? cfg.engineMode
    : null
  const choice = deferred ? null : explicit
  return {
    mode: deferred ? 'openclaw' : (configured || choice || 'openclaw'),
    choice,
    hasChoice: !!choice,
    deferred,
  }
}

/** 监听引擎切换事件 */
export function onEngineChange(fn) {
  _listeners.push(fn)
  return () => { _listeners = _listeners.filter(cb => cb !== fn) }
}

/**
 * 初始化引擎管理器：读取 clawpanel.json 中的 engineMode，激活对应引擎
 * 在 main.js boot() 中调用
 */
export async function initEngineManager() {
  let setup = resolveEngineSetup(null, Object.keys(_engines))
  try {
    const cfg = await api.readPanelConfig()
    setup = resolveEngineSetup(cfg, Object.keys(_engines))
  } catch {}
  _engineSetupChoice = setup.choice
  await activateEngine(setup.mode, false)
}

/**
 * 激活指定引擎（注册路由 + 启动）
 * @param {string} id 引擎 ID
 * @param {boolean} persist 是否写入 clawpanel.json
 */
export async function activateEngine(id, persist = true) {
  const engine = _engines[id]
  if (!engine) {
    console.error(`[engine-manager] 未知引擎: ${id}`)
    return
  }

  // 清理旧引擎
  if (_activeEngine && _activeEngine.id !== id && _activeEngine.cleanup) {
    try { _activeEngine.cleanup() } catch {}
  }

  _activeEngine = engine

  // 注册引擎路由 + 设置默认路由
  const routes = engine.getRoutes()
  for (const r of routes) {
    registerRoute(r.path, r.loader)
  }
  if (engine.getDefaultRoute) {
    setDefaultRoute(engine.getDefaultRoute())
  }

  // Route navigation must not wait for provider/Gateway health checks.
  // Slow boot and config persistence continue in the background.
  if (engine.boot) {
    void withTimeout(Promise.resolve().then(() => engine.boot()), 15000, '引擎启动超时')
      .catch(e => console.warn('[engine-manager] boot 失败:', e))
  }

  if (persist) {
    void (async () => {
      try {
        const cfg = await api.readPanelConfig() || {}
        if (cfg.engineMode !== id || cfg.engineSetupChoice !== id) {
          cfg.engineMode = id
          cfg.engineSetupChoice = id
          await api.writePanelConfig(cfg)
        }
        _engineSetupChoice = id
      } catch (e) {
        console.warn('[engine-manager] 保存 engineMode 失败:', e)
      }
    })()
  }

  // 通知监听器 once. switchEngine used to broadcast the same transition twice.
  _listeners.slice().forEach(fn => { try { fn(engine) } catch {} })
}

/**
 * 切换引擎（带 UI 跳转）
 * @param {string} id 引擎 ID
 * @param {boolean} persist 是否写入 clawpanel.json
 */
export async function switchEngine(id, { navigateToDefault = true } = {}) {
  const transition = _switchPromise.then(async () => {
    if (_activeEngine?.id === id) {
      if (_engineSetupChoice !== id) await persistEngineChoice(id)
      return
    }
    await activateEngine(id, false)
    await persistEngineChoice(id)
    if (navigateToDefault && _activeEngine?.id === id) navigate(_activeEngine.getDefaultRoute())
  })
  _switchPromise = transition.catch(() => {})
  return transition
}

async function persistEngineChoice(id) {
  const cfg = await api.readPanelConfig() || {}
  if (cfg.engineMode !== id || cfg.engineSetupChoice !== id) {
    cfg.engineMode = id
    cfg.engineSetupChoice = id
    await api.writePanelConfig(cfg)
  }
  _engineSetupChoice = id
}

function withTimeout(promise, ms, message) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms) }),
  ]).finally(() => clearTimeout(timer))
}
