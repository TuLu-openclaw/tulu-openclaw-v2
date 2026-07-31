import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveEngineSetup } from '../src/lib/engine-manager.js'

const engines = ['openclaw', 'hermes']

test('legacy engineMode remains active without being treated as an explicit choice', () => {
  assert.deepEqual(resolveEngineSetup({ engineMode: 'hermes' }, engines), {
    mode: 'hermes',
    choice: null,
    hasChoice: false,
    deferred: false,
  })
})

test('explicit engine choice is tracked independently from the active mode', () => {
  assert.deepEqual(resolveEngineSetup({ engineMode: 'openclaw', engineSetupChoice: 'openclaw' }, engines), {
    mode: 'openclaw',
    choice: 'openclaw',
    hasChoice: true,
    deferred: false,
  })
})

test('deferred setup boots safely without claiming a user choice', () => {
  assert.deepEqual(resolveEngineSetup({ engineMode: 'deferred', engineSetupChoice: 'hermes' }, engines), {
    mode: 'openclaw',
    choice: null,
    hasChoice: false,
    deferred: true,
  })
})

test('unknown engine values fail closed to OpenClaw', () => {
  assert.deepEqual(resolveEngineSetup({ engineMode: 'unknown', engineSetupChoice: 'unknown' }, engines), {
    mode: 'openclaw',
    choice: null,
    hasChoice: false,
    deferred: false,
  })
})
