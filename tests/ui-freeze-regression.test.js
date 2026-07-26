import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const sidebar = fs.readFileSync(new URL('../src/components/sidebar.js', import.meta.url), 'utf8')
const chat = fs.readFileSync(new URL('../src/pages/chat.js', import.meta.url), 'utf8')

test('sidebar binds the immediate kernel subscription only once', () => {
  assert.match(sidebar, /let _kernelSubscriptionBound = false/)
  assert.match(sidebar, /if \(!_kernelSubscriptionBound\) \{[\s\S]*?_kernelSubscriptionBound = true[\s\S]*?onKernelChange\(/)
  assert.doesNotMatch(sidebar, /if \(_kernelUnsubscribe\) _kernelUnsubscribe\(\)/)
})

test('engine switch callbacks do not navigate or render the sidebar a second time', () => {
  assert.doesNotMatch(sidebar, /switchEngine\(eid\)\.then\(\(\) => \{[\s\S]*?navigate\(getActiveEngine\(\)\.getDefaultRoute\(\)\)/)
  assert.doesNotMatch(sidebar, /switchEngine\('hermes'\)\.then\(\(\) => \{[\s\S]*?navigate\('\/h\/setup'\)/)
})

test('chat cleanup invalidates pending work and stops every page-owned loop', () => {
  assert.match(chat, /let _pageGeneration = 0/)
  assert.match(chat, /export function cleanup\(\) \{[\s\S]*?_pageGeneration \+= 1/)
  assert.match(chat, /export function cleanup\(\) \{[\s\S]*?clearInterval\(_replyStatusTimer\)/)
  assert.match(chat, /export function cleanup\(\) \{[\s\S]*?clearTimeout\(_runtimeStatusSyncTimer\)/)
  assert.match(chat, /export function cleanup\(\) \{[\s\S]*?stopTypewriter\(\)/)
})
