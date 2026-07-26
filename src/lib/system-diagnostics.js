const SAFE_ROUTES = new Set(['/setup', '/services', '/logs', '/models', '/security'])
const VALID_STATUS = new Set(['ok', 'warning', 'error', 'unknown'])

function safeText(value, maxLength = 80) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text || text.length > maxLength) return null
  if (/bearer\s+|api.?key|token|password|secret|[a-z]:[\\/]|\/users\/|\/home\//i.test(text)) return null
  return text
}

function safePort(value) {
  const port = Number(value)
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null
}

function safeAction(route) {
  return SAFE_ROUTES.has(route) ? Object.freeze({ kind: 'navigate', route }) : null
}

function check(id, scope, status, code, options = {}) {
  const normalizedStatus = VALID_STATUS.has(status) ? status : 'unknown'
  const result = {
    id,
    scope,
    status: normalizedStatus,
    code,
  }
  const action = safeAction(options.route)
  if (action) result.action = action
  if (options.details && typeof options.details === 'object') result.details = Object.freeze({ ...options.details })
  return Object.freeze(result)
}

export function classifyDiagnosticError(error) {
  const raw = typeof error === 'string' ? error : (error?.message || String(error || ''))
  const value = raw.toLowerCase()
  if (!value) return 'unknown_error'
  if (/permission denied|access is denied|eacces|eperm|拒绝访问|权限不足/.test(value)) return 'permission_error'
  if (/timeout|timed out|etimedout|econnreset|econnrefused|enotfound|network|fetch failed|连接|超时|网络/.test(value)) return 'network_error'
  if (/not found|not recognized|enoent|no such file|找不到/.test(value)) return 'not_found_error'
  if (/parse|invalid json|syntax|unexpected token|配置.*损坏/.test(value)) return 'invalid_data_error'
  if (/unauthorized|forbidden|api.?key|invalid (?:key|token|password)|(?:token|password) (?:expired|missing|rejected)|\b401\b|\b403\b|认证失败|密钥无效/.test(value)) return 'authentication_error'
  return 'internal_error'
}

export function buildSystemDiagnosticReport(input = {}) {
  const appState = input.appState || {}
  const ws = input.wsClient || {}
  const gatewayHealth = safeText(appState.gatewayHealth, 24) || 'unknown'
  const service = Array.isArray(input.services)
    ? (input.services.find(item => item?.label === 'ai.openclaw.gateway') || input.services[0] || null)
    : null
  const gatewayRunning = service?.running === true || appState.gatewayReady === true
  const gatewayForeign = appState.gatewayForeign === true || (service?.running === true && service?.owned_by_current_instance === false)
  const config = input.config && typeof input.config === 'object' ? input.config : null
  const gateway = config?.gateway && typeof config.gateway === 'object' ? config.gateway : null
  const auth = gateway?.auth && typeof gateway.auth === 'object' ? gateway.auth : null
  const token = auth?.token ?? gateway?.authToken
  const password = auth?.mode === 'password' ? auth?.password : null
  const authConfigured = Boolean(token || password)
  const checks = []

  checks.push(check(
    'openclaw',
    'runtime',
    appState.openclawReady === true ? 'ok' : 'error',
    appState.openclawReady === true ? 'openclaw_ready' : 'openclaw_not_ready',
    { route: appState.openclawReady === true ? null : '/setup' },
  ))

  if (input.nodeError) {
    checks.push(check('node', 'runtime', 'error', classifyDiagnosticError(input.nodeError), { route: '/setup' }))
  } else {
    const installed = input.node?.installed === true
    checks.push(check('node', 'runtime', installed ? 'ok' : 'error', installed ? 'node_ready' : 'node_missing', {
      route: installed ? null : '/setup',
      details: installed ? { version: safeText(input.node?.version, 40) } : undefined,
    }))
  }

  if (input.servicesError) {
    checks.push(check('cli', 'runtime', 'error', classifyDiagnosticError(input.servicesError), { route: '/setup' }))
  } else {
    const cliInstalled = service?.cli_installed !== false && Boolean(service)
    checks.push(check('cli', 'runtime', cliInstalled ? 'ok' : 'error', cliInstalled ? 'cli_ready' : 'cli_missing', {
      route: cliInstalled ? null : '/setup',
    }))
  }

  if (gatewayForeign) {
    checks.push(check('gateway', 'gateway', 'error', 'gateway_foreign', { route: '/services' }))
  } else if (!gatewayRunning) {
    checks.push(check('gateway', 'gateway', 'error', 'gateway_offline', { route: '/services' }))
  } else if (gatewayHealth !== 'running') {
    checks.push(check('gateway', 'gateway', 'warning', 'gateway_degraded', {
      route: '/services',
      details: { health: gatewayHealth },
    }))
  } else {
    checks.push(check('gateway', 'gateway', 'ok', 'gateway_ready'))
  }

  if (!gatewayRunning) {
    checks.push(check('websocket', 'gateway', 'unknown', 'websocket_not_tested'))
  } else if (ws.connected !== true) {
    checks.push(check('websocket', 'gateway', 'warning', 'websocket_disconnected', {
      route: '/services',
      details: { port: safePort(gateway?.port) || 18789 },
    }))
  } else if (ws.gatewayReady !== true) {
    checks.push(check('websocket', 'gateway', 'warning', 'websocket_handshake_incomplete', { route: '/security' }))
  } else {
    checks.push(check('websocket', 'gateway', 'ok', 'websocket_ready'))
  }

  if (input.configError) {
    checks.push(check('config', 'configuration', 'error', classifyDiagnosticError(input.configError), { route: '/setup' }))
  } else if (!config) {
    checks.push(check('config', 'configuration', 'error', 'config_missing', { route: '/setup' }))
  } else {
    checks.push(check('config', 'configuration', 'ok', 'config_readable', {
      details: {
        gatewayPort: safePort(gateway?.port),
        gatewayMode: safeText(gateway?.mode, 24) || 'local',
      },
    }))
    checks.push(check('authentication', 'configuration', authConfigured ? 'ok' : 'warning', authConfigured ? 'authentication_configured' : 'authentication_missing', {
      route: authConfigured ? null : '/security',
      details: authConfigured ? { secretRef: typeof token === 'object' || typeof password === 'object' } : undefined,
    }))
  }

  if (input.connectFrameError) {
    checks.push(check('device', 'security', 'error', classifyDiagnosticError(input.connectFrameError), { route: '/security' }))
  } else if (input.connectFrame) {
    checks.push(check('device', 'security', 'ok', 'device_identity_ready'))
  } else {
    checks.push(check('device', 'security', 'unknown', 'device_identity_not_tested'))
  }

  if (input.versionError) {
    checks.push(check('version', 'runtime', 'warning', classifyDiagnosticError(input.versionError), { route: '/logs' }))
  } else if (input.version) {
    checks.push(check('version', 'runtime', input.version.is_recommended ? 'ok' : 'warning', input.version.is_recommended ? 'version_supported' : 'version_review_needed', {
      route: input.version.is_recommended ? null : '/setup',
      details: {
        current: safeText(input.version.current, 40),
        recommended: safeText(input.version.recommended, 40),
        panel: safeText(input.version.panel_version, 40),
      },
    }))
  } else {
    checks.push(check('version', 'runtime', 'unknown', 'version_not_detected'))
  }

  const summary = { ok: 0, warning: 0, error: 0, unknown: 0 }
  for (const item of checks) summary[item.status] += 1
  const status = summary.error > 0 ? 'error' : summary.warning > 0 ? 'warning' : summary.unknown > 0 ? 'unknown' : 'ok'
  const findings = checks.filter(item => item.status === 'error' || item.status === 'warning')

  return Object.freeze({
    status,
    summary: Object.freeze(summary),
    checks: Object.freeze(checks),
    findings: Object.freeze(findings),
  })
}
