import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const chatSource = await readFile(new URL('../src/pages/chat.js', import.meta.url), 'utf8')

test('chat and tool events gate UI changes on coordinator-resolved ownership', () => {
  assert.match(
    chatSource,
    /const eventSessionKey = _runCoordinator\.resolveEventSession\(payload\.sessionKey, runId\)/,
  )
  assert.match(chatSource, /if \(eventSessionKey !== _sessionKey\) \{/)
  assert.match(
    chatSource,
    /const renderInCurrentSession = Boolean\(eventSessionKey\)[\s\S]*?eventSessionKey === _sessionKey[\s\S]*?if \(mediaRefs\.length && renderInCurrentSession\)/,
  )
  assert.doesNotMatch(
    chatSource,
    /if \(payload\.sessionKey && payload\.sessionKey !== _sessionKey && _sessionKey\)/,
  )
})

test('status reactions cannot mutate the active UI without resolved ownership', () => {
  assert.match(
    chatSource,
    /if \(event === 'chat\.status_reaction' \|\| event === 'status_reaction'\) \{[\s\S]*?_runCoordinator\.resolveEventSession\([\s\S]*?if \(!eventSessionKey \|\| eventSessionKey !== _sessionKey\) return/,
  )
})
