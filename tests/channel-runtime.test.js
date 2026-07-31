import test from 'node:test'
import assert from 'node:assert/strict'

import { formatRuntimeAge, getChannelRuntimeSummary, normalizeChannelRuntimeStatus } from '../src/lib/channel-runtime.js'

test('missing runtime RPC data is unsupported without hiding configured state', () => {
  const status = normalizeChannelRuntimeStatus(null)
  assert.equal(status.supported, false)
  assert.equal(getChannelRuntimeSummary(status, 'telegram', { enabled: true }).state, 'unsupported')
})

test('account errors take precedence and activity timestamps are summarized', () => {
  const status = normalizeChannelRuntimeStatus({
    channelAccounts: {
      telegram: [
        { accountId: 'a', connected: true, lastInboundAt: 100 },
        { accountId: 'b', lastError: 'token invalid', lastOutboundAt: 200 },
      ],
    },
  })
  const summary = getChannelRuntimeSummary(status, 'telegram')
  assert.equal(summary.state, 'error')
  assert.equal(summary.lastError, 'token invalid')
  assert.equal(summary.lastInboundAt, 100)
  assert.equal(summary.lastOutboundAt, 200)
})

test('runtime age formatting is compact and locale independent', () => {
  const now = 10 * 60 * 60 * 1000
  assert.equal(formatRuntimeAge(now - 30_000, now), '<1m')
  assert.equal(formatRuntimeAge(now - 5 * 60_000, now), '5m')
  assert.equal(formatRuntimeAge(now - 3 * 60 * 60_000, now), '3h')
})

test('runtime summaries accept canonical and legacy channel aliases', () => {
  const status = normalizeChannelRuntimeStatus({
    channelAccounts: { dingtalk: [{ connected: true }] },
  })
  assert.equal(getChannelRuntimeSummary(status, 'dingtalk-connector').state, 'connected')
})
