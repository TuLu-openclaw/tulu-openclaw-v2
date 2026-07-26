import test from 'node:test'
import assert from 'node:assert/strict'

import {
  classifyOpenClawVersions,
  compareOpenClawVersions,
  isPreviewVersion,
  parseOpenClawVersion,
  versionKind,
} from '../src/lib/openclaw-version-ui.js'

test('classifies stable, preview, recommended and latest versions for beginners', () => {
  const versions = [
    '2026.7.1-2',
    '2026.7.1-1',
    '2026.7.1',
    '2026.7.2-beta.4',
    '2026.6.11',
  ]
  const groups = classifyOpenClawVersions(versions, '2026.7.1-2')
  assert.equal(groups.recommended, '2026.7.1-2')
  assert.equal(groups.latestStable, '2026.7.1-2')
  assert.deepEqual(groups.preview, ['2026.7.2-beta.4'])
  assert.deepEqual(groups.stable.slice(0, 3), ['2026.7.1-2', '2026.7.1-1', '2026.7.1'])
  assert.equal(versionKind('2026.7.1-2', groups), 'recommended')
  assert.equal(versionKind('2026.7.2-beta.4', groups), 'preview')
})

test('keeps Chinese revision and republish suffixes visible and ordered', () => {
  assert.ok(compareOpenClawVersions('2026.7.1-2', '2026.7.1-1') > 0)
  assert.ok(compareOpenClawVersions('2026.7.1-2-zh.2', '2026.7.1-2-zh.1') > 0)
  assert.notEqual(compareOpenClawVersions('2026.7.1-2', '2026.7.1-2-zh.1'), 0)
  assert.equal(parseOpenClawVersion('2026.7.1-2').republish, 2)
  assert.equal(parseOpenClawVersion('2026.7.1-2-zh.1').chineseRevision, 1)
})

test('recognizes preview channels without treating them as stable', () => {
  for (const version of ['2026.7.2-beta.4', '2026.7.1-nightly.20260726', '2026.7.1-rc.1', '2026.7.1-canary.1', '2026.7.1-dev.1']) {
    assert.equal(isPreviewVersion(version), true, version)
  }
  assert.equal(isPreviewVersion('2026.7.1-2-zh.1'), false)
})
