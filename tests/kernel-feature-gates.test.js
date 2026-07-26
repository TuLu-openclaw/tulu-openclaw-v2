import test from 'node:test'
import assert from 'node:assert/strict'

import { buildKernelSnapshot, parseVersion, versionCompare, versionGte } from '../src/lib/kernel.js'

test('version parsing accepts date versions and localized suffixes', () => {
  assert.deepEqual(parseVersion('2026.7.1-zh.2'), [2026, 7, 1])
  assert.deepEqual(parseVersion('0.13-beta.1'), [0, 13, 0])
  assert.equal(parseVersion('nightly'), null)
})

test('version comparison is strict when either version is unknown', () => {
  assert.equal(versionCompare('2026.7.1', '2026.5.4'), 1)
  assert.equal(versionCompare('2026.5.4', '2026.5.4-zh.1'), 0)
  assert.equal(versionCompare('bad', '2026.5.4'), null)
  assert.equal(versionGte('bad', '2026.5.4'), false)
})

test('OpenClaw snapshot enables only capabilities supported by the kernel', () => {
  const oldKernel = buildKernelSnapshot('openclaw', '2026.5.2')
  assert.equal(oldKernel.aboveFloor, true)
  assert.equal(oldKernel.features.has('models.probeStatus'), true)
  assert.equal(oldKernel.features.has('chat.replyRunGuard'), false)
  assert.equal(oldKernel.features.has('hermes.profiles'), false)

  const currentKernel = buildKernelSnapshot('openclaw', '2026.7.1-zh.2', 4)
  assert.equal(currentKernel.variant, 'chinese')
  assert.equal(currentKernel.isLatest, true)
  assert.equal(currentKernel.protocol, 4)
  assert.equal(currentKernel.features.has('voice.localStt'), true)
})

test('unknown or below-floor versions fail closed', () => {
  assert.equal(buildKernelSnapshot('openclaw', null).aboveFloor, false)
  assert.equal(buildKernelSnapshot('openclaw', '2026.2.9').aboveFloor, false)
  assert.equal(buildKernelSnapshot('hermes', '0.7.9').features.size, 0)
})
