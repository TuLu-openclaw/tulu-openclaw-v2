import test from 'node:test'
import assert from 'node:assert/strict'

import { humanizeError, humanizeErrorText, redactErrorDetails } from '../src/lib/humanize-error.js'

test('humanizeError returns a stable object and classifies common failures', () => {
  const result = humanizeError(new Error('Gateway is not running'), 'Connection failed')
  assert.equal(result.kind, 'gatewayDown')
  assert.equal(result.message.startsWith('Connection failed'), true)
  assert.equal(result.action.route, '/services')
  assert.equal(String(result), '[object Object]')
  assert.equal(typeof humanizeErrorText(result.raw, 'Connection failed'), 'string')
  assert.equal(humanizeError('Gateway 未就绪').kind, 'gatewayDown')
})

test('error details redact credentials in headers, JSON, query strings, and URLs', () => {
  const raw = redactErrorDetails('Authorization: Bearer sk-live apiKey="secret-a" https://user:secret-b@example.com/x?token=secret-c')
  assert.equal(raw.includes('sk-live'), false)
  assert.equal(raw.includes('secret-a'), false)
  assert.equal(raw.includes('secret-b'), false)
  assert.equal(raw.includes('secret-c'), false)
  assert.equal(raw.match(/\[REDACTED\]/g).length, 4)
})

test('raw technical details are bounded', () => {
  const result = humanizeError('x'.repeat(500), 'Failed')
  assert.equal(result.raw.length, 243)
  assert.equal(result.raw.endsWith('...'), true)
})
