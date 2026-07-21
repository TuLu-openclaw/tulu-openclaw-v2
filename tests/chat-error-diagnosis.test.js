import test from 'node:test'
import assert from 'node:assert/strict'

import { diagnoseChatError } from '../src/lib/chat-error-diagnosis.js'

test('turns failed internal searches into an actionable message without leaking the command', () => {
  const raw = "Exec failed: `search 'private terms' in C:\\Users\\User\\workspace` (exit 1)"
  const result = diagnoseChatError(raw)
  assert.equal(result.kind, 'internal_search_empty')
  assert.match(result.message, /没有找到匹配内容/)
  assert.doesNotMatch(result.message, /private terms|C:\\Users|Exec failed|search/)
})

test('keeps the exit code but removes internal command details for generic failures', () => {
  const result = diagnoseChatError("Command failed: `$env:SECRET | private-tool` exited with code 7")
  assert.equal(result.kind, 'internal_command_failed')
  assert.match(result.message, /错误代码 7/)
  assert.doesNotMatch(result.message, /SECRET|private-tool/)
})

test('provides specific guidance for common user-actionable failures', () => {
  assert.equal(diagnoseChatError('401 unauthorized: invalid API key').kind, 'authentication')
  assert.equal(diagnoseChatError('request timed out with ECONNRESET').kind, 'network')
  assert.equal(diagnoseChatError('permission denied (EACCES)').kind, 'permission_denied')
})

test('specific missing-command and permission diagnoses win over generic command failure', () => {
  assert.equal(diagnoseChatError('Command failed: missing-tool is not recognized as a command, exited with code 1').kind, 'command_missing')
  assert.equal(diagnoseChatError('Exec failed: permission denied (EACCES), exited with code 1').kind, 'permission_denied')
})

test('provider and network diagnoses keep precedence even when wrapped as command failures', () => {
  assert.equal(diagnoseChatError('Command failed: provider returned 401 unauthorized, exited with code 1').kind, 'authentication')
  assert.equal(diagnoseChatError('Command failed: quota exceeded 429 payment required, exited with code 1').kind, 'quota')
  assert.equal(diagnoseChatError('Command failed: socket hang up ECONNRESET, exited with code 1').kind, 'network')
})

test('redacts long stack traces and preserves short safe provider messages', () => {
  assert.equal(diagnoseChatError(`Error at C:\\Users\\User\\secret.js\n${'x'.repeat(300)}`).kind, 'internal_details')
  assert.deepEqual(diagnoseChatError('模型暂时不可用，请稍后重试'), {
    kind: 'plain',
    message: '模型暂时不可用，请稍后重试',
  })
})
