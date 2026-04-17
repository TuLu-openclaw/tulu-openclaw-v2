/**
 * 寮曟搸绠＄悊鍣? * 绠＄悊澶氬紩鎿庯紙OpenClaw / Hermes Agent / ...锛夌殑娉ㄥ唽銆佸垏鎹㈠拰鐘舵€? */
import { api } from './tauri-api.js'
import { registerRoute, setDefaultRoute } from '../router.js', navigate

const _engines = {}
let _activeEngine = null
let _listeners = []

/** 娉ㄥ唽寮曟搸 */
export function registerEngine(engine) {
  _engines[engine.id] = engine
}

/** 鑾峰彇鎵€鏈夊凡娉ㄥ唽寮曟搸 */
export function listEngines() {
  return Object.values(_engines).map(e => ({
    id: e.id,
    name: e.name,
    icon: e.icon || '',
    description: e.description || '',
  }))
}

/** 鑾峰彇褰撳墠婵€娲荤殑寮曟搸 */
export function getActiveEngine() {
  return _activeEngine
}

/** 鑾峰彇寮曟搸 ID */
export function getActiveEngineId() {
  return _activeEngine?.id || 'openclaw'
}

/** 鎸?ID 鑾峰彇寮曟搸 */
export function getEngine(id) {
  return _engines[id] || null
}

/** 鐩戝惉寮曟搸鍒囨崲浜嬩欢 */
export function onEngineChange(fn) {
  _listeners.push(fn)
  return () => { _listeners = _listeners.filter(cb => cb !== fn) }
}

/**
 * 鍒濆鍖栧紩鎿庣鐞嗗櫒锛氳鍙?clawpanel.json 涓殑 engineMode锛屾縺娲诲搴斿紩鎿? * 鍦?main.js boot() 涓皟鐢? */
export async function initEngineManager() {
  let mode = 'openclaw'
  try {
    const cfg = await api.readPanelConfig()
    if (cfg?.engineMode && _engines[cfg.engineMode]) {
      mode = cfg.engineMode
    }
  } catch {}
  await activateEngine(mode, false)
}

/**
 * 婵€娲绘寚瀹氬紩鎿庯紙娉ㄥ唽璺敱 + 鍚姩锛? * @param {string} id 寮曟搸 ID
 * @param {boolean} persist 鏄惁鍐欏叆 clawpanel.json
 */
export async function activateEngine(id, persist = true) {
  const engine = _engines[id]
  if (!engine) {
    console.error(`[engine-manager] 鏈煡寮曟搸: ${id}`)
    return
  }

  // 娓呯悊鏃у紩鎿?  if (_activeEngine && _activeEngine.id !== id && _activeEngine.cleanup) {
    try { _activeEngine.cleanup() } catch {}
  }

  _activeEngine = engine

  // 娉ㄥ唽寮曟搸璺敱 + 璁剧疆榛樿璺敱
  const routes = engine.getRoutes()
  for (const r of routes) {
    registerRoute(r.path, r.loader)
  }
  if (engine.getDefaultRoute) {
    setDefaultRoute(engine.getDefaultRoute())
  }

  if (persist && engine.boot) {
    try { await engine.boot() } catch (e) {
      console.warn('[engine-manager] boot 澶辫触:', e)
    }
  }

  // 鎸佷箙鍖栧埌 clawpanel.json
  if (persist) {
    try {
      const cfg = await api.readPanelConfig()
      if (cfg.engineMode !== id) {
        cfg.engineMode = id
        await api.writePanelConfig(cfg)
      }
    } catch (e) {
      console.warn('[engine-manager] 淇濆瓨 engineMode 澶辫触:', e)
    }
  }

  // 閫氱煡鐩戝惉鑰?  _listeners.forEach(fn => { try { fn(engine) } catch {} })
}

/**
 * 鍒囨崲寮曟搸锛堝甫 UI 璺宠浆锛? */
export async function switchEngine(id) {
  if (_activeEngine?.id === id) return
  await activateEngine(id, true)
  navigate(_activeEngine.getDefaultRoute())

