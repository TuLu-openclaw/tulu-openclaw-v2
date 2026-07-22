import test from 'node:test'
import assert from 'node:assert/strict'

import { isVisibleStoredMessage } from '../src/lib/message-db.js'

test('legacy tool-only rows are not considered visible chat history', () => {
  assert.equal(isVisibleStoredMessage({ role: 'assistant', tools: [{ name: 'exec' }] }), false)
  assert.equal(isVisibleStoredMessage({ role: 'assistant', content: '', tools: [{ output: 'private' }] }), false)
})

test('stored text and media remain visible', () => {
  assert.equal(isVisibleStoredMessage({ content: 'answer' }), true)
  assert.equal(isVisibleStoredMessage({ attachments: [{ category: 'image' }] }), true)
  assert.equal(isVisibleStoredMessage({ files: [{ name: 'report.pdf' }] }), true)
})
