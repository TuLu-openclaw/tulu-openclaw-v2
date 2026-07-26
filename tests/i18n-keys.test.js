import test from 'node:test'
import assert from 'node:assert/strict'

import {
  STARTUP_LOCALE_MODULES,
  buildAllLocales,
  buildLocales,
  getRouteLocaleModules,
  loadLocaleModule,
} from '../src/locales/index.js'

const langs = ['en', 'de', 'es', 'fr', 'pt', 'ja', 'ko']

function flatten(value, prefix = '', out = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out)
    }
  } else {
    out[prefix] = value
  }
  return out
}

test('startup locale dictionaries contain only shell-critical catalogs', () => {
  assert.deepEqual(
    Object.keys(buildLocales()['zh-CN']).sort(),
    Object.keys(STARTUP_LOCALE_MODULES).sort(),
  )
  assert.equal(buildLocales()['zh-CN'].dashboard, undefined)
})

test('runtime locale dictionaries have the same recursive key set as zh-CN', async () => {
  const locales = await buildAllLocales()
  const baseKeys = Object.keys(flatten(locales['zh-CN'])).sort()
  for (const lang of langs) {
    const keys = Object.keys(flatten(locales[lang])).sort()
    assert.deepEqual(keys, baseKeys, `${lang} runtime locale key set differs from zh-CN`)
  }
})

test('route locale mapping keeps page catalogs behind their routes', () => {
  assert.deepEqual(getRouteLocaleModules('/dashboard'), ['dashboard'])
  assert.deepEqual(getRouteLocaleModules('/setup'), ['setup', 'openclawSetup'])
  assert.deepEqual(getRouteLocaleModules('/h/dashboard'), ['engine'])
  assert.deepEqual(getRouteLocaleModules('/extensions'), ['ext'])
  assert.deepEqual(getRouteLocaleModules('/route-graph'), ['routeGraph'])
  assert.deepEqual(getRouteLocaleModules('/security'), [])
})

test('locale module loading is deduplicated and preserves all languages', async () => {
  const [first, second] = await Promise.all([
    loadLocaleModule('dashboard'),
    loadLocaleModule('dashboard'),
  ])
  assert.equal(first, second)
  for (const entry of Object.values(first)) {
    for (const lang of ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'vi', 'es', 'pt', 'ru', 'fr', 'de']) {
      assert.ok(entry[lang] || entry['zh-CN'], `dashboard entry is missing ${lang} and fallback`)
    }
  }
})
