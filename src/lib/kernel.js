import { FEATURE_CATALOG, KERNEL_FLOOR, KERNEL_TARGET } from './feature-catalog.js'
import { wsClient } from './ws-client.js'
import { getActiveEngineId, onEngineChange } from './engine-manager.js'

let snapshot = null
let initialized = false
const listeners = new Set()

export function parseVersion(value) {
  const match = String(value || '').match(/^(\d+)\.(\d+)(?:\.(\d+))?/)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3] || 0)] : null
}

export function versionCompare(a, b) {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (!left || !right) return null
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1
  }
  return 0
}

export function versionGte(a, b) {
  const result = versionCompare(a, b)
  return result !== null && result >= 0
}

function detectVariant(version) {
  if (!version) return 'unknown'
  return /-zh(?:[.-]|$)/i.test(version) ? 'chinese' : 'official'
}

export function buildKernelSnapshot(engine, version, protocol = null) {
  const floor = KERNEL_FLOOR[engine] || '0.0.0'
  const variant = detectVariant(version)
  const target = KERNEL_TARGET[engine]?.[variant] || KERNEL_TARGET[engine]?.default || null
  const features = new Set()
  for (const [id, definition] of Object.entries(FEATURE_CATALOG)) {
    if (definition.engine === engine && versionGte(version, definition.minVersion)) features.add(id)
  }
  return Object.freeze({
    engine,
    version: version || null,
    variant,
    floor,
    target,
    protocol,
    aboveFloor: Boolean(version) && versionGte(version, floor),
    isLatest: Boolean(version) && (!target || versionGte(version, target)),
    features,
  })
}

export function getKernelSnapshot() { return snapshot }
export function hasFeature(featureId) {
  const definition = FEATURE_CATALOG[featureId]
  if (!definition) return true
  return Boolean(snapshot?.engine === definition.engine && snapshot.version && snapshot.features.has(featureId))
}
export function isAboveKernelFloor() { return snapshot?.aboveFloor ?? true }
export function onKernelChange(listener) {
  listeners.add(listener)
  if (snapshot) listener(snapshot)
  return () => listeners.delete(listener)
}

export function refreshKernelSnapshot() {
  const next = buildKernelSnapshot(getActiveEngineId(), wsClient.serverVersion, wsClient.negotiatedProtocol || null)
  const changed = !snapshot || snapshot.engine !== next.engine || snapshot.version !== next.version || snapshot.protocol !== next.protocol
  snapshot = next
  if (changed) listeners.forEach(listener => {
    try { listener(next) } catch (error) { console.warn('[kernel] listener failed', error) }
  })
  return next
}

export function initKernelGates() {
  if (initialized) return refreshKernelSnapshot()
  initialized = true
  const unsubscribeReady = wsClient.onReady(() => refreshKernelSnapshot())
  const unsubscribeEngine = onEngineChange(() => refreshKernelSnapshot())
  return () => {
    unsubscribeReady?.()
    unsubscribeEngine?.()
    initialized = false
  }
}

export function resetKernelSnapshotForTests() {
  snapshot = null
  initialized = false
  listeners.clear()
}
