import test from 'node:test'
import assert from 'node:assert/strict'

import {
  HERMES_DIAGNOSTIC_ACTIONS,
  normalizeHermesDiagnosticResult,
} from '../src/engines/hermes/lib/diagnostic-policy.js'

test('diagnostic actions expose only the supported read-only surface', () => {
  assert.deepEqual(HERMES_DIAGNOSTIC_ACTIONS, [
    'gateway_status',
    'doctor',
    'dump',
    'gateway_logs',
  ])
  assert.equal(HERMES_DIAGNOSTIC_ACTIONS.includes('doctor_fix'), false)
  assert.equal(HERMES_DIAGNOSTIC_ACTIONS.includes('dump_show_keys'), false)
  assert.equal(HERMES_DIAGNOSTIC_ACTIONS.includes('logs_follow'), false)
})

test('diagnostic results keep explicit success and bounded metadata', () => {
  assert.deepEqual(normalizeHermesDiagnosticResult({
    action: 'doctor',
    success: true,
    exitCode: 0,
    output: 'ok',
    truncated: true,
  }), {
    action: 'doctor',
    success: true,
    exitCode: 0,
    output: 'ok',
    truncated: true,
  })
})

test('diagnostic normalization never invents success or trusts unsupported actions', () => {
  assert.deepEqual(normalizeHermesDiagnosticResult({
    action: 'doctor_fix',
    success: 'yes',
    exitCode: '0',
    output: 42,
  }, 'gateway_status'), {
    action: 'gateway_status',
    success: false,
    exitCode: null,
    output: '',
    truncated: false,
  })
})
