import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const channels = read('../src/pages/channels.js')
const movieTool = read('../src/pages/movie-tool.js')
const hermesSetup = read('../src/engines/hermes/pages/setup.js')
const models = read('../src/pages/models.js')
const update = read('../src-tauri/src/commands/update.rs')
const assistant = read('../src-tauri/src/commands/assistant.rs')
const memory = read('../src-tauri/src/commands/memory.rs')
const agent = read('../src-tauri/src/commands/agent.rs')
const capability = JSON.parse(read('../src-tauri/capabilities/default.json'))
const playerCapability = JSON.parse(read('../src-tauri/capabilities/player.json'))
const ci = read('../.github/workflows/ci.yml')
const players = [
  read('../src/player.html'),
  read('../src-tauri/player.html'),
  read('../src-tauri/resources/player.html'),
]

test('update chain fails closed on insecure metadata and archive paths', () => {
  assert.match(update, /option_env!\("XINGSHU_FULL_UPDATE_MANIFEST_URL"\)/)
  assert.match(update, /更新地址必须使用 HTTPS/)
  assert.match(update, /更新清单缺少 SHA-256 摘要/)
  assert.match(update, /Component::ParentDir/)
  assert.match(update, /前端热更新尚未接入签名清单/)
  assert.match(update, /下载参数与受信更新清单不一致/)
  assert.match(update, /validate_final_update_url\(manifest_url, resp\.url\(\)\)/)
  assert.match(update, /validate_final_update_url\(&trusted_url, resp\.url\(\)\)/)
  assert.match(update, /更新请求被重定向到非受信主机，已拒绝继续/)
  assert.doesNotMatch(update, /http:\/\/124\.220\.22\.11/)
})

test('channel verification renders backend values as text', () => {
  const block = channels.slice(channels.indexOf('btnVerify.onclick'), channels.indexOf('// 保存按钮'))
  assert.match(block, /document\.createTextNode/)
  assert.match(block, /failure\.textContent/)
  assert.doesNotMatch(block, /resultEl\.innerHTML\s*=/)
})

test('remote provider labels are escaped before HTML rendering', () => {
  assert.match(hermesSetup, /\$\{esc\(preset\.name\)\}/)
  assert.match(hermesSetup, /esc\(preset\.apiKeyEnvVars\[0\]\)/)
})

test('explicit HTML toasts remain limited to the escaped model diagnostic', () => {
  assert.equal((models.match(/html:\s*true/g) || []).length, 1)
  assert.match(models, /escapeHtml\(modelId\)/)
})

test('packaged players avoid remote-title innerHTML and development bridges', () => {
  for (const player of players) {
    assert.match(player, /appendCardLabel/)
    assert.match(player, /strong\.textContent/)
    assert.doesNotMatch(player, /btn\.innerHTML\s*=/)
    assert.doesNotMatch(player, /http:\/\/localhost:1420\/player-bridge\.html/)
    assert.match(player, /resolvePlaybackTarget/)
    assert.match(player, /invoke\('cz_resolve_play_url'/)
    assert.doesNotMatch(player, /invoke\('vod_fetch'/)
  }
})

test('factory resolver is host restricted and does not interpolate URLs into PowerShell', () => {
  assert.match(assistant, /validate_cz_play_page_url/)
  assert.match(assistant, /host\.eq_ignore_ascii_case\("4kcz\.com"\)/)
  assert.match(assistant, /parsed\.path\(\)\.starts_with\("\/v_play\/"\)/)
  assert.match(assistant, /url_b64/)
  assert.doesNotMatch(assistant, /ArgumentList[^\n]+\{url\}/)
})

test('arbitrary shell execution is restricted to the trusted main window', () => {
  const start = assistant.indexOf('pub async fn assistant_exec')
  const block = assistant.slice(start, assistant.indexOf('///', start + 40))
  assert.match(block, /window: tauri::WebviewWindow/)
  assert.match(block, /window\.label\(\) != "main"/)
  assert.match(block, /EXEC_BLOCKED/)
})

test('the trusted player is bundled at the same app path used by Tauri', () => {
  assert.match(assistant, /src\/player\.html\?url=/)
  assert.ok(!capability.windows.includes('player_window_*'))
  assert.ok(playerCapability.windows.includes('player_window_*'))
  assert.ok(!playerCapability.permissions.some(permission => permission.startsWith('shell:')))
  assert.ok(!playerCapability.permissions.some(permission => permission.startsWith('dialog:')))
  assert.ok(!playerCapability.permissions.some(permission => permission.startsWith('autostart:')))
})

test('factory playback opens the trusted player even when an episode remains unresolved', () => {
  assert.match(movieTool, /resolvedForStandalone = \/4kcz\\\.com\\\/v_play/)
})

test('release builds depend on all validation jobs and use lockfile installs', () => {
  assert.match(ci, /tags: \['v\*'\]/)
  assert.match(ci, /needs: \[lint, rust-check, frontend, e2e, security\]/)
  assert.doesNotMatch(ci, /run: npm install/)
  assert.match(ci, /npm run tauri build -- --target/)
  assert.doesNotMatch(ci, /cargo build --release/)
})

test('memory and agent workspace paths reject symlink escapes', () => {
  assert.match(memory, /fs::symlink_metadata/)
  assert.match(memory, /resolved\.starts_with\(&root\)/)
  assert.match(memory, /resolved_parent\.starts_with\(&root\)/)
  assert.match(memory, /target\.exists\(\).*confined_existing_path/s)
  assert.match(agent, /fs::symlink_metadata/)
  assert.match(agent, /confined_workspace_existing_path/)
  assert.match(agent, /resolved\.starts_with\(&root\)/)
  assert.match(agent, /resolved_parent\.starts_with\(&canonical_root\)/)
  assert.match(agent, /target\.exists\(\).*confined_workspace_existing_path/s)
  assert.match(agent, /let path = confined_workspace_existing_path\(&workspace, &path\)/)
  assert.match(agent, /let path = confined_workspace_write_path\(&dir, &dir\.join\(&name\)\)/)
})
