import test from 'node:test'
import assert from 'node:assert/strict'

import {
  canInstallWebExtra,
  canOpenDashboard,
  lazyDependencyState,
  normalizeDashboardProbe,
} from '../src/engines/hermes/lib/lazy-deps-policy.js'

test('normalizeDashboardProbe supplies a stable local endpoint', () => {
  assert.deepEqual(normalizeDashboardProbe(null), {
    running: false,
    port: 8642,
    url: 'http://127.0.0.1:8642',
    state: 'offline',
    detail: '',
  })

  const probe = normalizeDashboardProbe({ running: true, port: 9000 })
  assert.equal(probe.url, 'http://127.0.0.1:9000')
  assert.equal(probe.state, 'running')

  const started = normalizeDashboardProbe({ started: true, port: 9119 })
  assert.equal(started.running, true)
  assert.equal(started.url, 'http://127.0.0.1:9119')
})

test('lazyDependencyState derives readiness from existing runtime truth', () => {
  const state = lazyDependencyState({
    hermes: { installed: true, configExists: true },
    dashboard: { running: false, port: 8642 },
  })

  assert.equal(state.ready, true)
  assert.equal(state.needsWebExtra, true)
  assert.equal(state.dashboardRunning, false)
})

test('actions are gated by install, runtime, and busy state', () => {
  const missing = lazyDependencyState({ hermes: {}, dashboard: null })
  assert.equal(canInstallWebExtra(missing), false)
  assert.equal(canOpenDashboard(missing), false)

  const running = lazyDependencyState({
    hermes: { installed: true, configExists: true },
    dashboard: { running: true, port: 8642 },
  })
  assert.equal(canInstallWebExtra(running), true)
  assert.equal(canInstallWebExtra(running, true), false)
  assert.equal(canOpenDashboard(running), true)
  assert.equal(canOpenDashboard(running, true), false)
})
