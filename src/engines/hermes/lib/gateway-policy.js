const GATEWAY_ACTIONS = new Set(['start', 'stop', 'restart', 'status'])

export function validateGatewayAction(action) {
  const value = String(action || '').trim()
  return { valid: GATEWAY_ACTIONS.has(value), value }
}

export function gatewayRuntime(profile) {
  const gatewayStatus = profile?.gatewayStatus || null
  const state = String(gatewayStatus?.state || (profile?.gatewayRunning ? 'running' : 'stopped'))
  const running = typeof gatewayStatus?.running === 'boolean' ? gatewayStatus.running : !!profile?.gatewayRunning
  const multiplexRole = String(gatewayStatus?.multiplexRole || 'single')
  return { state, running, multiplexRole, gatewayStatus }
}

export function gatewayActions(profile, busy = false) {
  const runtime = gatewayRuntime(profile)
  return {
    running: runtime.running,
    state: runtime.state,
    multiplexRole: runtime.multiplexRole,
    canStart: !busy && !runtime.running,
    canStop: !busy && runtime.running,
    canRestart: !busy && runtime.running,
    canInspect: !busy,
  }
}
