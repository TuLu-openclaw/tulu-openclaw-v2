import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  STARTUP_LOCALE_MODULES,
  buildAllLocales,
  buildLocales,
  getRouteLocaleModules,
  loadLocaleModule,
} from '../src/locales/index.js'

const allLangs = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'vi', 'es', 'pt', 'ru', 'fr', 'de']
const langs = allLangs.filter(lang => lang !== 'zh-CN' && lang !== 'zh-TW')

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
    for (const lang of allLangs) {
      assert.ok(entry[lang] || entry['zh-CN'], `dashboard entry is missing ${lang} and fallback`)
    }
  }
})

test('setup and about page translation keys exist and render for every supported language', async () => {
  const setupSource = fs.readFileSync(new URL('../src/pages/setup.js', import.meta.url), 'utf8')
  const aboutSource = fs.readFileSync(new URL('../src/pages/about.js', import.meta.url), 'utf8')
  const [setup, about] = await Promise.all([
    loadLocaleModule('setup'),
    loadLocaleModule('about'),
  ])

  for (const [namespace, pageSource, catalog] of [
    ['setup', setupSource, setup],
    ['about', aboutSource, about],
  ]) {
    const keys = [...pageSource.matchAll(new RegExp(`t\\('${namespace}\\.([A-Za-z0-9_]+)'`, 'g'))]
      .map(match => match[1])
    for (const key of new Set(keys)) {
      assert.ok(catalog[key], `${namespace}.${key} is missing from its locale module`)
      for (const lang of allLangs) {
        const text = catalog[key][lang]
        assert.equal(typeof text, 'string', `${namespace}.${key} is missing ${lang}`)
        assert.ok(text.trim(), `${namespace}.${key} is empty for ${lang}`)
        assert.notEqual(text, `${namespace}.${key}`, `${namespace}.${key} leaks its raw key for ${lang}`)
      }
    }
  }
})

test('new setup source and version controls have explicit translations in all languages', async () => {
  const setup = await loadLocaleModule('setup')
  const requiredKeys = [
    'sourceLabel',
    'sourceOfficialLabel',
    'sourceChineseLabel',
    'versionLabel',
    'versionChoiceHint',
    'showAllVersions',
    'hideAllVersions',
    'showAllVersionsCount',
    'versionGroupSuggested',
    'versionGroupRecentStable',
    'versionGroupHistory',
    'versionGroupPreview',
    'versionTagRecommended',
    'versionTagLatest',
    'versionTagPreview',
    'versionTagStable',
    'versionTagRepublish',
    'versionTagChineseRevision',
    'versionDownloadDataUnavailable',
    'latestVersionHint',
    'previewVersionHint',
    'recommended',
    'recommendedVersionHint',
    'customVersionHint',
    'noVersions',
    'versionLoadFailed',
    'installPathLabel',
    'installPathPlaceholder',
    'installPathHint',
  ]
  for (const key of requiredKeys) {
    for (const lang of allLangs) {
      assert.ok(setup[key][lang]?.trim(), `setup.${key} is missing explicit ${lang} text`)
    }
  }
})
