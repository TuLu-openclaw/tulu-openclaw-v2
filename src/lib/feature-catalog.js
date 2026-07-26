/**
 * Cross-engine capability catalog.
 * Keep protocol assumptions in one place so pages never hard-code versions.
 */
export const FEATURE_CATALOG = Object.freeze({
  'gateway.backendSelfPair': { engine: 'openclaw', minVersion: '2026.3.2', description: 'Backend gateway pairing without a device payload' },
  'chat.replyRunGuard': { engine: 'openclaw', minVersion: '2026.5.4', description: 'Concurrent chat sends are guarded by the gateway' },
  'sessions.truncation': { engine: 'openclaw', minVersion: '2026.5.4', description: 'Session list exposes pagination metadata' },
  'models.probeStatus': { engine: 'openclaw', minVersion: '2026.5.2', description: 'Model status exposes auth and availability reasons' },
  'channels.runtimeState': { engine: 'openclaw', minVersion: '2026.5.2', description: 'Channel runtime state is normalized' },
  'memory.dreaming': { engine: 'openclaw', minVersion: '2026.4.11', description: 'Memory dreaming workflow is available' },
  'hermes.profiles': { engine: 'hermes', minVersion: '0.8.0', description: 'Hermes profiles are supported' },
  'hermes.gateways': { engine: 'hermes', minVersion: '0.8.0', description: 'Hermes multi-gateway management is supported' },
  'hermes.files': { engine: 'hermes', minVersion: '0.9.0', description: 'Hermes file workspace is supported' },
  'hermes.kanban': { engine: 'hermes', minVersion: '0.10.0', description: 'Hermes kanban orchestration is supported' },
  'voice.localStt': { engine: 'openclaw', minVersion: '2026.7.0', description: 'Local speech recognition adapter is available' },
})

export const KERNEL_FLOOR = Object.freeze({ openclaw: '2026.3.2', hermes: '0.8.0' })
export const KERNEL_TARGET = Object.freeze({
  openclaw: { official: '2026.7.1', chinese: '2026.7.1-zh.2' },
  hermes: { default: '0.13.0' },
})
