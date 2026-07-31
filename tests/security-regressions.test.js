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
const commandModule = read('../src-tauri/src/commands/mod.rs')
const proxy = read('../src-tauri/src/commands/proxy.rs')
const tvbox = read('../src-tauri/src/commands/tvbox.rs')
const memory = read('../src-tauri/src/commands/memory.rs')
const agent = read('../src-tauri/src/commands/agent.rs')
const capability = JSON.parse(read('../src-tauri/capabilities/default.json'))
const playerCapability = JSON.parse(read('../src-tauri/capabilities/player.json'))
const remoteSkillCapability = JSON.parse(read('../src-tauri/capabilities/xingshu-skill-remote.json'))
const generatedCapabilities = JSON.parse(read('../src-tauri/gen/schemas/capabilities.json'))
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
  assert.match(assistant, /decrypt_cz_aes_payload/)
  assert.match(assistant, /Aes128CbcDec::new_from_slices/)
  assert.match(assistant, /extract_cz_iframe_url/)
  assert.match(assistant, /validate_public_http_url\(iframe\.as_str\(\)\)/)
  assert.match(assistant, /redirect\(reqwest::redirect::Policy::none\(\)\)/)
})

test('remote skill windows have no core IPC permission and sensitive commands verify the caller', () => {
  assert.deepEqual(remoteSkillCapability.permissions, [])
  assert.deepEqual(generatedCapabilities['xingshu-skill-remote'].permissions, [])
  for (const command of ['assistant_read_file', 'assistant_write_file', 'assistant_list_dir']) {
    const start = assistant.indexOf(`pub async fn ${command}`)
    const block = assistant.slice(start, assistant.indexOf('///', start + 40))
    assert.match(block, /window: tauri::WebviewWindow/)
    assert.match(block, /window\.label\(\) != "main"/)
  }
})

test('window navigation uses parsed native navigation and cannot target another window', () => {
  const start = assistant.indexOf('pub async fn navigate_window')
  const block = assistant.slice(start, assistant.indexOf('///', start + 40))
  assert.match(block, /window\.label\(\) != label/)
  assert.match(block, /url::Url::parse/)
  assert.match(block, /win\.navigate\(parsed\)/)
  assert.doesNotMatch(block, /win\.eval/)
})

test('privileged network commands reject non-public targets and invalid certificates', () => {
  const proxyStart = proxy.indexOf('pub async fn proxy_url')
  const proxyBlock = proxy.slice(proxyStart)
  const tvboxStart = tvbox.indexOf('pub async fn tvbox_req')
  const tvboxBlock = tvbox.slice(tvboxStart, tvbox.indexOf('/// Base64', tvboxStart))
  assert.match(commandModule, /validate_public_http_url/)
  assert.match(commandModule, /is_non_public_ip/)
  assert.match(proxyBlock, /validate_public_http_url\(&url\)\.await/)
  assert.match(proxyBlock, /build_http_client_no_redirect/)
  assert.match(tvboxBlock, /validate_public_http_url\(&url\)\.await/)
  assert.match(tvboxBlock, /redirect\(reqwest::redirect::Policy::none\(\)\)/)
  assert.match(assistant, /pub async fn fetch_live_sources[\s\S]*?validate_public_http_url\(&url\)\.await/)
  assert.match(assistant, /pub async fn fetch_live_sources[\s\S]*?redirect\(reqwest::redirect::Policy::none\(\)\)/)
  assert.doesNotMatch(assistant, /danger_accept_invalid_certs\(true\)/)
})

test('TVBox cookie reads reject empty or fuzzy domain enumeration', () => {
  assert.match(tvbox, /if domain\.is_empty\(\)/)
  assert.match(tvbox, /host\.eq_ignore_ascii_case\(&domain\)/)
  assert.doesNotMatch(tvbox, /domain\.is_empty\(\) \|\| k\.contains/)
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

test('frontend bundles do not use embedded passwords as authorization boundaries', () => {
  const about = read('../src/pages/about.js')
  const chat = read('../src/pages/xingshu-chat.js')
  assert.doesNotMatch(about, /type=["']password|projectUnlockButton|2552667173/)
  assert.doesNotMatch(movieTool, /input\.value\s*===\s*["'][^"']+["']/)
  assert.doesNotMatch(chat, /ADMIN_PASS|admin-login|saved\.admin/)
  assert.match(chat, /event\.type === 'role'/)
  assert.match(chat, /state\.admin = false/)
})
