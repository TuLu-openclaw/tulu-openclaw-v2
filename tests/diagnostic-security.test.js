import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import { diagnoseInstallError, sanitizeInstallOutput } from '../src/lib/error-diagnosis.js'

test('Gateway credentials are assigned through DOM properties, not HTML interpolation', async () => {
  const source = await readFile(new URL('../src/pages/gateway.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /id="gw-(?:token|password|tailscale)"[^>]*value="\$\{/)
  assert.match(source, /querySelector\('#gw-token'\)\.value = _tokenDisplayStr/)
  assert.match(source, /querySelector\('#gw-password'\)\.value = typeof/)
  assert.match(source, /querySelector\('#gw-tailscale'\)\.value = typeof/)
})

test('Security load errors are rendered as text instead of interpolated HTML', async () => {
  const source = await readFile(new URL('../src/pages/security.js', import.meta.url), 'utf8')
  assert.match(source, /message\.textContent =/)
  assert.match(source, /container\.replaceChildren\(section\)/)
  assert.doesNotMatch(source, /innerHTML\s*=.*e(?:\?\.)?\.message/)
})

test('install output redacts credentials, private sources, and local paths', () => {
  const raw = 'https://user:secret@example.com/pkg?token=abc123 C:\\Users\\alice\\AppData\\Roaming\\npm https://github.com/TuLu-openclaw/tulu-openclaw-v2/releases npm_supersecrettoken123'
  const safe = sanitizeInstallOutput(raw)
  assert.doesNotMatch(safe, /user:secret|token=abc123|TuLu-openclaw|alice|npm_supersecrettoken123/i)
  assert.match(safe, /redacted/i)
})

test('setup installation keeps task state until verification and recovers false failures', async () => {
  const source = await readFile(new URL('../src/pages/setup.js', import.meta.url), 'utf8')
  const doneHandler = source.slice(source.indexOf("listen('upgrade-done'"), source.indexOf('// 后台任务失败'))
  const errorHandler = source.slice(source.indexOf("listen('upgrade-error'"), source.indexOf('// 先设置镜像源'))
  assert.match(doneHandler, /stopListeners\(\)/)
  assert.match(doneHandler, /verifyInstalledOpenclaw\(\)/)
  assert.ok(doneHandler.indexOf('verifyInstalledOpenclaw()') < doneHandler.indexOf('setUpgrading(false)'))
  assert.match(errorHandler, /verifyInstalledOpenclaw\(\)/)
  assert.match(errorHandler, /installRecovered/)
  const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8')
  assert.match(mainSource, /if \(isUpgrading\(\)\) return/)
})

test('install diagnoses never recommend disabling TLS, forced install, or sudo npm', () => {
  const cases = [
    'unable to get local issuer certificate while using proxy',
    'npm ERR! EEXIST file already exists',
    'Cannot find module native-binding',
    '/root/.npm/_logs error code 128 permission denied publickey',
  ]
  for (const raw of cases) {
    const result = diagnoseInstallError(raw)
    assert.doesNotMatch(result.command || '', /strict-ssl\s+false|npm\s+install[^\n]*--force|sudo\s+npm|npm\s+cache\s+clean\s+--force/i)
  }
})
