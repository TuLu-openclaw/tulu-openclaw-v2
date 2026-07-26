import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const gateway = readFileSync(new URL('../src/pages/gateway.js', import.meta.url), 'utf8')
const services = readFileSync(new URL('../src/pages/services.js', import.meta.url), 'utf8')

test('gateway passes the loaded gateway config into event binding', () => {
  assert.match(gateway, /bindConfigEvents\(el, gw\)/)
  assert.match(gateway, /function bindConfigEvents\(el, gw\)/)
  assert.doesNotMatch(gateway, /function bindConfigEvents\(el\) \{[\s\S]*?gw\.auth/)
})

test('services waits until the router mounts the page before initial loading', () => {
  assert.match(services, /setTimeout\(\(\) => \{\s*loadAll\(page\)/)
  assert.match(services, /if \(!page\?\.isConnected\) return/)
})
