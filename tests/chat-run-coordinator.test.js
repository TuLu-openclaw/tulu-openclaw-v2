import test from 'node:test'
import assert from 'node:assert/strict'

import { ChatRunCoordinator } from '../src/lib/chat-run-coordinator.js'

test('queued messages remain bound to their original session', () => {
  const runs = new ChatRunCoordinator()
  runs.activateSession('agent:main:first')
  runs.enqueue('agent:main:first', 'first')
  runs.activateSession('agent:main:second')
  runs.enqueue('agent:main:second', 'second')

  assert.equal(runs.takeNext().text, 'second')
  assert.equal(runs.takeNext(), null)
  runs.activateSession('agent:main:first')
  assert.equal(runs.takeNext().text, 'first')
})

test('an async send context becomes stale after a session switch', () => {
  const runs = new ChatRunCoordinator()
  runs.activateSession('agent:main:first')
  const send = runs.beginSend('agent:main:first')
  assert.equal(runs.isCurrent(send), true)

  runs.activateSession('agent:main:second')
  assert.equal(runs.isCurrent(send), false)
})

test('run ownership prevents events from rendering into another session', () => {
  const runs = new ChatRunCoordinator()
  runs.activateSession('agent:main:first')
  const send = runs.beginSend('agent:main:first')

  assert.equal(runs.resolveEventSession('', 'run-1'), 'agent:main:first')
  runs.settleSend(send)
  runs.activateSession('agent:main:second')

  assert.equal(runs.resolveEventSession('', 'run-1'), 'agent:main:first')
  assert.equal(runs.shouldRender({ runId: 'run-1' }), false)
  assert.equal(runs.shouldRender({ explicitSessionKey: 'agent:main:second', runId: 'run-2' }), true)
})

test('sessionless events can use the latest send only while its session is still active', () => {
  const runs = new ChatRunCoordinator()
  runs.activateSession('agent:main:first')
  const send = runs.beginSend('agent:main:first')
  runs.settleSend(send)

  assert.equal(runs.resolveEventSession('', 'run-legacy'), 'agent:main:first')
  runs.activateSession('agent:main:second')
  assert.equal(runs.resolveEventSession('', 'run-after-switch'), '')
})

test('ambiguous sessionless events are rejected', () => {
  const runs = new ChatRunCoordinator()
  runs.activateSession('agent:main:first')
  runs.beginSend('agent:main:first')
  runs.beginSend('agent:main:background')

  assert.equal(runs.resolveEventSession('', 'run-1'), '')
  assert.equal(runs.shouldRender({ runId: 'run-1' }), false)
})

test('terminal run events are accepted only once', () => {
  const runs = new ChatRunCoordinator()
  assert.equal(runs.markTerminal('run-1'), true)
  assert.equal(runs.markTerminal('run-1'), false)
  assert.equal(runs.markTerminal(''), true)
})

test('a terminal run keeps its owner when a new session has a pending send', () => {
  const runs = new ChatRunCoordinator()
  runs.activateSession('agent:main:first')
  const oldSend = runs.beginSend('agent:main:first')
  assert.equal(runs.resolveEventSession('', 'run-old'), 'agent:main:first')
  runs.settleSend(oldSend)
  assert.equal(runs.markTerminal('run-old'), true)

  runs.activateSession('agent:main:second')
  runs.beginSend('agent:main:second')

  assert.equal(runs.resolveEventSession('', 'run-old'), 'agent:main:first')
  assert.equal(runs.shouldRender({ runId: 'run-old' }), false)
})

test('sessionless events for the latest active send still render', () => {
  const runs = new ChatRunCoordinator()
  runs.activateSession('agent:main:current')
  runs.beginSend('agent:main:current')

  assert.equal(runs.resolveEventSession('', 'run-current'), 'agent:main:current')
  assert.equal(runs.shouldRender({ runId: 'run-current' }), true)
})

test('an established run owner cannot be overwritten by a later payload session', () => {
  const runs = new ChatRunCoordinator()
  runs.activateSession('agent:main:first')
  runs.registerRun('run-1', 'agent:main:first')

  assert.equal(runs.resolveEventSession('agent:main:second', 'run-1'), 'agent:main:first')
  assert.equal(runs.shouldRender({ explicitSessionKey: 'agent:main:second', runId: 'run-1' }), true)
})
