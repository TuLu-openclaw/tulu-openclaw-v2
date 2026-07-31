import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

import { getRoutes } from '../src/engines/openclaw/index.js'

const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
const sidebar = fs.readFileSync(new URL('../src/components/sidebar.js', import.meta.url), 'utf8')

test('OpenClaw engine is the single owner of OpenClaw route registration', () => {
  assert.doesNotMatch(main, /registerRoute\s*\(/)

  const paths = getRoutes().map(route => route.path)
  assert.equal(new Set(paths).size, paths.length, 'OpenClaw route paths must be unique')
})

test('every OpenClaw sidebar route resolves through the engine route table', () => {
  const openclawSidebar = sidebar.slice(
    sidebar.indexOf('function NAV_ITEMS_OPENCLAW()'),
    sidebar.indexOf('function NAV_ITEMS_HERMES()'),
  )
  const sidebarPaths = [...openclawSidebar.matchAll(/route: '([^']+)'/g)].map(match => match[1])
  const enginePaths = new Set(getRoutes().map(route => route.path))

  assert.ok(sidebarPaths.length > 0, 'OpenClaw sidebar routes must be discoverable')
  for (const path of sidebarPaths) {
    assert.ok(enginePaths.has(path), `sidebar route ${path} is missing from the OpenClaw engine`)
  }
})

test('direct-only OpenClaw pages remain registered', () => {
  const enginePaths = new Set(getRoutes().map(route => route.path))
  for (const path of ['/', '/agent-detail', '/xingshu-chat', '/xingshu-skill-center', '/xingshu-skill-security']) {
    assert.ok(enginePaths.has(path), `direct route ${path} must remain available`)
  }
})
