import test from 'node:test'
import assert from 'node:assert/strict'

import { buildLocales } from '../src/locales/index.js'

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

test('runtime locale dictionaries have the same recursive key set as zh-CN', () => {
  const locales = buildLocales()
  const baseKeys = Object.keys(flatten(locales['zh-CN'])).sort()
  for (const lang of langs) {
    const keys = Object.keys(flatten(locales[lang])).sort()
    assert.deepEqual(keys, baseKeys, `${lang} runtime locale key set differs from zh-CN`)
  }
})
