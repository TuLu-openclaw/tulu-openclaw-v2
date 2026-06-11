import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildLocales } from '../src/locales/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const srcRoot = path.join(repoRoot, 'src')
const locales = buildLocales()
const fallback = locales['zh-CN']

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (['node_modules', 'dist', 'target'].includes(name)) continue
      walk(full, files)
    } else if (/\.(js|mjs|jsx|ts|tsx)$/.test(name)) {
      files.push(full)
    }
  }
  return files
}

function resolveKey(dict, key) {
  let cur = dict
  for (const part of key.split('.')) {
    if (!cur || typeof cur !== 'object' || !(part in cur)) return undefined
    cur = cur[part]
  }
  return typeof cur === 'string' ? cur : undefined
}

function collectLiteralTranslationKeys() {
  const keys = []
  const callRe = /\bt\(\s*(['"])((?:\\.|(?!\1).)+)\1/g
  for (const file of walk(srcRoot)) {
    const rel = path.relative(repoRoot, file).replace(/\\/g, '/')
    const text = readFileSync(file, 'utf8')
    let match
    while ((match = callRe.exec(text))) {
      const key = match[2]
      if (!key || key.includes('${') || key.endsWith('.')) continue
      keys.push({ key, file: rel })
    }
  }
  return keys
}

test('all literal i18n keys resolve in zh-CN fallback', () => {
  const missing = collectLiteralTranslationKeys()
    .filter(({ key }) => !resolveKey(fallback, key))
    .map(({ key, file }) => `${key} (${file})`)

  assert.deepEqual(missing, [])
})
