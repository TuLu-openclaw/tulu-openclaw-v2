import test from 'node:test'
import assert from 'node:assert/strict'

import {
  belongsToHermesRun,
  canClaimHermesRun,
  hermesRunId,
  hermesRunSessionId,
} from '../src/engines/hermes/lib/run-event-policy.js'

test('extracts snake-case and legacy run event identifiers', () => {
  assert.equal(hermesRunId({ run_id: 'run-1' }), 'run-1')
  assert.equal(hermesRunId({ runId: 'run-2' }), 'run-2')
  assert.equal(hermesRunSessionId({ session_id: 'session-1' }), 'session-1')
  assert.equal(hermesRunSessionId({ sessionId: 'session-2' }), 'session-2')
})

test('started events can only claim their requested session', () => {
  assert.equal(canClaimHermesRun({ run_id: 'a', session_id: 'chat-a' }, 'chat-a'), true)
  assert.equal(canClaimHermesRun({ run_id: 'b', session_id: 'background' }, 'chat-a'), false)
  assert.equal(canClaimHermesRun({ run_id: 'legacy' }, 'chat-a'), false)
  assert.equal(canClaimHermesRun({}, 'chat-a'), false)
})

test('run events require an exact run owner and reject ambiguous payloads', () => {
  assert.equal(belongsToHermesRun({ run_id: 'run-a', session_id: 'chat-a' }, 'run-a', 'chat-a'), true)
  assert.equal(belongsToHermesRun({ run_id: 'run-b', session_id: 'chat-a' }, 'run-a', 'chat-a'), false)
  assert.equal(belongsToHermesRun({ session_id: 'chat-a' }, null, 'chat-a'), true)
  assert.equal(belongsToHermesRun({}, 'run-a', 'chat-a'), false)
})
