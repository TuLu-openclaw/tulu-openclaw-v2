import test from 'node:test'
import assert from 'node:assert/strict'

import { isInternalChatPayload, isInternalContentBlock } from '../src/lib/chat-visibility.js'

test('rejects reasoning and commentary lanes at every supported envelope level', () => {
  assert.equal(isInternalChatPayload({ isReasoning: true }), true)
  assert.equal(isInternalChatPayload({ message: { isReasoningSnapshot: true } }), true)
  assert.equal(isInternalChatPayload({ data: { message: { phase: 'commentary' } } }), true)
  assert.equal(isInternalChatPayload({ message: { contentType: 'thinking-delta' } }), true)
  assert.equal(isInternalChatPayload({
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'private plan', textSignature: '{"v":1,"phase":"commentary"}' }],
    },
  }), true)
})

test('does not classify normal assistant text as internal based on language or wording', () => {
  assert.equal(isInternalChatPayload({
    state: 'final',
    message: { role: 'assistant', content: 'I will explain the implementation in English.' },
  }), false)
})

test('rejects internal content blocks without rejecting visible text blocks', () => {
  for (const type of ['thinking', 'redacted_thinking', 'reasoning', 'analysis', 'commentary', 'thinking_delta']) {
    assert.equal(isInternalContentBlock({ type, text: 'private' }), true)
  }
  assert.equal(isInternalContentBlock({ type: 'text', text: 'visible' }), false)
  assert.equal(isInternalContentBlock({ type: 'output_text', text: 'visible' }), false)
  assert.equal(isInternalContentBlock({
    type: 'text',
    text: 'private plan',
    textSignature: '{"v":1,"phase":"commentary"}',
  }), true)
  assert.equal(isInternalContentBlock({
    type: 'text',
    text: 'visible answer',
    textSignature: '{"v":1,"phase":"final_answer"}',
  }), false)
})

test('keeps mixed messages while allowing commentary blocks to be removed separately', () => {
  assert.equal(isInternalChatPayload({
    role: 'assistant',
    content: [
      { type: 'text', text: 'private', textSignature: '{"v":1,"phase":"commentary"}' },
      { type: 'text', text: 'visible', textSignature: '{"v":1,"phase":"final_answer"}' },
    ],
  }), false)
})
