import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildSystemDiagnosticReport,
  classifyDiagnosticError,
} from '../src/lib/system-diagnostics.js'

function healthyInput() {
  return {
    appState: { openclawReady: true, gatewayReady: true, gatewayHealth: 'running', gatewayForeign: false },
    wsClient: { connected: true, gatewayReady: true, sessionKey: 'secret-session' },
    node: { installed: true, version: '24.1.0', executable: 'C:\\Users\\private\\node.exe' },
    services: [{
      label: 'ai.openclaw.gateway',
      running: true,
      cli_installed: true,
      owned_by_current_instance: true,
      pid: 1234,
      argv: ['openclaw', '--token', 'secret'],
    }],
    config: {
      gateway: {
        port: 18789,
        mode: 'local',
        auth: { mode: 'token', token: 'super-secret-token' },
      },
      models: { providers: { private: { apiKey: 'secret-key' } } },
    },
    version: { current: '2026.7.1', recommended: '2026.7.1', panel_version: '4.4.6', is_recommended: true },
    connectFrame: { params: { auth: { token: 'secret' }, device: { privateKey: 'secret' } } },
  }
}

test('builds a healthy report from a finite safe projection', () => {
  const report = buildSystemDiagnosticReport(healthyInput())
  assert.equal(report.status, 'ok')
  assert.equal(report.summary.error, 0)
  assert.equal(report.summary.warning, 0)
  assert.equal(report.checks.length, 9)
  assert.equal(report.findings.length, 0)

  const json = JSON.stringify(report)
  assert.doesNotMatch(json, /super-secret|secret-session|secret-key|privateKey|1234|argv|C:\\\\Users/i)
  assert.match(json, /2026\.7\.1/)
})

test('reports actionable runtime findings without executable commands', () => {
  const report = buildSystemDiagnosticReport({
    appState: { openclawReady: false, gatewayHealth: 'offline' },
    wsClient: { connected: false, gatewayReady: false },
    node: { installed: false },
    services: [],
    config: { gateway: { port: 18789 } },
  })

  assert.equal(report.status, 'error')
  assert.deepEqual(report.findings.map(item => item.code), [
    'openclaw_not_ready',
    'node_missing',
    'cli_missing',
    'gateway_offline',
    'authentication_missing',
  ])
  assert.deepEqual(report.findings.map(item => item.action?.route), [
    '/setup', '/setup', '/setup', '/services', '/security',
  ])
  assert.doesNotMatch(JSON.stringify(report), /command|shell|sudo|--fix|strict-ssl/i)
})

test('distinguishes foreign, degraded, disconnected and handshake states', () => {
  const foreign = buildSystemDiagnosticReport({
    appState: { openclawReady: true, gatewayHealth: 'foreign', gatewayForeign: true },
    services: [{ running: true, cli_installed: true, owned_by_current_instance: false }],
    node: { installed: true },
    config: { gateway: { auth: { token: { source: 'env', id: 'PRIVATE_TOKEN' } } } },
  })
  assert.equal(foreign.checks.find(item => item.id === 'gateway').code, 'gateway_foreign')
  assert.equal(foreign.checks.find(item => item.id === 'websocket').code, 'websocket_disconnected')

  const handshake = buildSystemDiagnosticReport({
    appState: { openclawReady: true, gatewayHealth: 'running', gatewayReady: true },
    services: [{ running: true, cli_installed: true }],
    wsClient: { connected: true, gatewayReady: false },
    node: { installed: true },
    config: { gateway: { auth: { token: 'secret' } } },
  })
  assert.equal(handshake.checks.find(item => item.id === 'websocket').code, 'websocket_handshake_incomplete')
})

test('normalizes raw failures to finite error codes and drops their text', () => {
  const report = buildSystemDiagnosticReport({
    appState: {},
    nodeError: 'Permission denied at C:\\Users\\private\\node.exe token=secret',
    servicesError: '401 unauthorized Bearer secret',
    configError: 'Unexpected token at C:\\Users\\private\\openclaw.json',
    connectFrameError: 'API key super-secret rejected',
    versionError: 'fetch failed https://private.example/token=secret',
  })

  assert.equal(report.checks.find(item => item.id === 'node').code, 'permission_error')
  assert.equal(report.checks.find(item => item.id === 'cli').code, 'authentication_error')
  assert.equal(report.checks.find(item => item.id === 'config').code, 'invalid_data_error')
  assert.equal(report.checks.find(item => item.id === 'device').code, 'authentication_error')
  assert.equal(report.checks.find(item => item.id === 'version').code, 'network_error')
  assert.doesNotMatch(JSON.stringify(report), /private|super-secret|Bearer|unexpected token/i)
})

test('error classifier keeps common categories deterministic', () => {
  assert.equal(classifyDiagnosticError('request timed out'), 'network_error')
  assert.equal(classifyDiagnosticError('permission denied EACCES'), 'permission_error')
  assert.equal(classifyDiagnosticError('ENOENT no such file'), 'not_found_error')
  assert.equal(classifyDiagnosticError('invalid json syntax'), 'invalid_data_error')
  assert.equal(classifyDiagnosticError('unknown provider explosion'), 'internal_error')
  assert.equal(classifyDiagnosticError(''), 'unknown_error')
})
