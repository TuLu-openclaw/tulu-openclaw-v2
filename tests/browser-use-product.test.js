import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const page = fs.readFileSync(new URL('../src/pages/browser-use.js', import.meta.url), 'utf8')
const guard = fs.readFileSync(new URL('../src-tauri/resources/browser-use/browser_use_guard.py', import.meta.url), 'utf8')
const backend = fs.readFileSync(new URL('../src-tauri/src/commands/browser_use.rs', import.meta.url), 'utf8')
const api = fs.readFileSync(new URL('../src/lib/tauri-api.js', import.meta.url), 'utf8')
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
const sidebar = fs.readFileSync(new URL('../src/components/sidebar.js', import.meta.url), 'utf8')

test('browser-use is exposed as a customer-facing route', () => {
  assert.match(main, /registerRoute\('\/browser-use'/)
  assert.match(main, /browser-use\.css/)
  assert.match(sidebar, /route: '\/browser-use'/)
  assert.match(page, /客户使用教程/)
  assert.match(page, /故障排查/)
  assert.match(page, /安装并开始使用/)
  assert.match(page, /quick-start/)
  assert.doesNotMatch(page, /runtimeDir/)
})

test('browser-use install is pinned and isolated', () => {
  assert.match(backend, /BROWSER_USE_VERSION: &str = "0\.13\.6"/)
  assert.match(backend, /MCP_VERSION: &str = "1\.26\.0"/)
  assert.match(backend, /PLAYWRIGHT_BROWSERS_PATH/)
  assert.match(backend, /"tool"\.into\(\),\s*"run"\.into\(\),\s*"playwright"\.into\(\),\s*"install"\.into\(\),\s*"chromium"\.into\(\)/s)
  assert.match(backend, /fn isolated_browser_executable\(\)/)
  assert.match(backend, /\["executable_path"\]/)
  assert.match(backend, /fn profile_matches_runtime\(\)/)
  assert.match(guard, /args=\["-m", "browser_use\.mcp"\]/)
  assert.doesNotMatch(backend, /hermes::ensure_uv/)
  assert.match(backend, /fn ensure_uv\(\)/)
  assert.match(backend, /"venv"\.into\(\),\s*"--python"\.into\(\),\s*"3\.11"\.into\(\)/s)
  assert.doesNotMatch(page, /检查 Python 3\.11/)
  assert.match(backend, /join\("downloads"\)/)
  assert.match(backend, /join\("profile"\)/)
})

test('browser-use permissions are deny-by-default and private networks stay blocked', () => {
  assert.match(guard, /INTERACTION_TOOLS = \{"browser_click", "browser_type"\}/)
  assert.match(guard, /AUTONOMOUS_TOOLS = \{"retry_with_browser_use_agent"\}/)
  assert.match(guard, /if any\(not address\.is_global/)
  assert.match(guard, /Destination is outside the configured domain allowlist/)
  assert.match(backend, /mcpServers/)
  assert.match(backend, /XINGSHU_BROWSER_ALLOW_INTERACTION/)
  assert.match(backend, /XINGSHU_BROWSER_ALLOW_AUTONOMOUS/)
  assert.match(backend, /permissions\.allow_interaction/)
  assert.match(backend, /permissions\.allow_autonomous/)
  assert.match(backend, /registered: installed && runtime_ready && config_ready/)
  assert.match(backend, /runtime_health_error/)
  assert.match(backend, /Duration::from_secs\(45\)/)
  assert.match(backend, /MCP 与隔离 Chromium 健康检查超时/)
  assert.match(backend, /taskkill/)
  assert.match(backend, /process_group\(0\)/)
  assert.match(backend, /config_matches_runtime/)
  assert.match(guard, /async def health_check/)
  assert.match(guard, /await self\.upstream\.list_tools\(\)/)
  assert.match(guard, /READ_ONLY_TOOLS - upstream_names/)
  assert.match(guard, /await self\.upstream\.call_tool\("browser_get_state"/)
  assert.match(page, /权限状态/)
  assert.match(page, /隔离运行时与 MCP/)
  assert.match(page, /真实调用可用/)
  assert.match(page, /运行时未就绪/)
  assert.match(page, /运行时检查未通过，Gateway 未重新接入 browser-use/)
  assert.match(backend, /开启自主浏览器代理前必须至少配置一个域名白名单/)
})

test('browser-use operations allow the real health check to reach its terminal result', () => {
  const backendTimeout = Number(backend.match(/Duration::from_secs\((\d+)\)/)?.[1]) * 1000
  const timeoutFor = command => Number(api.match(new RegExp(`invoke\\('${command}'[^\\n]+?, (\\d+)\\)`))?.[1]
    || api.match(new RegExp(`cachedInvoke\\('${command}'[^\\n]+?, (\\d+)\\)`))?.[1])
  assert.equal(backendTimeout, 45000)
  for (const command of ['browser_use_status', 'browser_use_configure', 'browser_use_unregister']) {
    const frontendTimeout = timeoutFor(command)
    assert.ok(frontendTimeout > backendTimeout, `${command} timeout ${frontendTimeout} must exceed backend timeout ${backendTimeout}`)
  }
  assert.match(page, /正在检测 browser-use 运行状态/)
  assert.match(page, /void loadStatus\(\)/)
  assert.doesNotMatch(page, /await loadStatus\(\)\n  return page/)
})

test('browser-use has register, pause and complete uninstall paths', () => {
  assert.match(page, /browserUseConfigure/)
  assert.match(page, /browserUseUnregister/)
  assert.match(page, /browserUseUninstall/)
  assert.match(backend, /pub async fn browser_use_unregister/)
  assert.match(backend, /pub async fn browser_use_uninstall/)
  assert.match(backend, /fs::remove_dir_all\(&root\)/)
  assert.match(backend, /allow_interaction,\n            allow_autonomous,\n            allowed_domains/)
})
