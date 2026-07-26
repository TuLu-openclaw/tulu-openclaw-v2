import test from 'node:test'
import assert from 'node:assert/strict'

import { gatewayActions, gatewayRuntime, validateGatewayAction } from '../src/engines/hermes/lib/gateway-policy.js'

test('profile gateway actions use a strict lifecycle allowlist', () => {
  for (const action of ['start', 'stop', 'restart', 'status']) {
    assert.deepEqual(validateGatewayAction(action), { valid: true, value: action })
  }
  for (const action of ['', 'install', 'uninstall', 'start --all']) {
    assert.equal(validateGatewayAction(action).valid, false)
  }
})

test('gateway controls reflect running and busy state', () => {
  assert.deepEqual(gatewayActions({ gatewayRunning: false }), {
    running: false,
    state: 'stopped',
    multiplexRole: 'single',
    canStart: true,
    canStop: false,
    canRestart: false,
    canInspect: true,
  })
  assert.deepEqual(gatewayActions({ gatewayRunning: true }, true), {
    running: true,
    state: 'running',
    multiplexRole: 'single',
    canStart: false,
    canStop: false,
    canRestart: false,
    canInspect: false,
  })
})

test('gateway runtime prefers structured status when present', () => {
  const profile = {
    gatewayRunning: false,
    gatewayStatus: {
      running: true,
      state: 'draining',
      multiplexRole: 'multiplexer',
    },
  }

  assert.deepEqual(gatewayRuntime(profile), {
    running: true,
    state: 'draining',
    multiplexRole: 'multiplexer',
    gatewayStatus: profile.gatewayStatus,
  })
  assert.equal(gatewayActions(profile).canRestart, true)
})
