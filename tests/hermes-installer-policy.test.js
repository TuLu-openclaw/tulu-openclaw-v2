import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const rust = fs.readFileSync(new URL('../src-tauri/src/commands/hermes.rs', import.meta.url), 'utf8')
const api = fs.readFileSync(new URL('../src/lib/tauri-api.js', import.meta.url), 'utf8')
const setup = fs.readFileSync(new URL('../src/engines/hermes/pages/setup.js', import.meta.url), 'utf8')
const dashboard = fs.readFileSync(new URL('../src/engines/hermes/pages/dashboard.js', import.meta.url), 'utf8')
const assistant = fs.readFileSync(new URL('../src/pages/assistant.js', import.meta.url), 'utf8')
const productSources = [rust, api, setup, dashboard, assistant].join('\n')

test('Hermes install and update use the upstream supported installer', () => {
  assert.match(rust, /HERMES_WINDOWS_INSTALLER_URL[\s\S]*hermes-agent\.nousresearch\.com\/install\.ps1/)
  assert.match(rust, /HERMES_UNIX_INSTALLER_URL[\s\S]*hermes-agent\.nousresearch\.com\/install\.sh/)
  assert.match(rust, /HERMES_WINDOWS_INSTALLER_SHA256/)
  assert.match(rust, /HERMES_UNIX_INSTALLER_SHA256/)
  assert.match(rust, /run_official_hermes_installer\(&app, None\)\.await/)
  assert.match(rust, /run_official_hermes_installer\([\s\S]*target_ref\.as_str\(\)/)
  assert.match(rust, /"-SkipSetup", "-NonInteractive", "-HermesHome"/)
  assert.match(rust, /"-InstallDir"/)
})

test('Hermes official venv is preferred while legacy uv installs remain discoverable', () => {
  assert.match(rust, /hermes_install_dir\(\)[\s\S]*join\("venv"\)[\s\S]*join\("Scripts"\)/)
  assert.match(rust, /fn uv_tools_hermes_dir\(\)/)
  assert.match(rust, /hermes_managed_python_path\(\)[\s\S]*uv_tools_hermes_dir\(\)/)
  assert.match(rust, /hermes_managed_cli_path\(\)/)
})

test('Hermes uninstall delegates to the upstream CLI before compatibility cleanup', () => {
  assert.match(rust, /hermes_managed_cli_path\(\)[\s\S]*arg\("uninstall"\)\.arg\("--yes"\)/)
  assert.match(rust, /if clean_config \{\s*cmd\.arg\("--full"\)/)
  assert.match(rust, /发现 Hermes 官方安装目录，但缺少可执行入口/)
})

test('deprecated Hermes Git wheel installation commands are absent from product sources', () => {
  assert.doesNotMatch(productSources, /git\+https:\/\/github\.com\/NousResearch\/hermes-agent/)
  assert.doesNotMatch(productSources, /uv tool install[^\n]*hermes-agent/i)
  assert.doesNotMatch(rust, /install_via_uv_(?:tool|pip)/)
})

test('frontend requests the official installer and allows the backend install budget', () => {
  assert.match(api, /installHermes: \(method = 'official'/)
  assert.match(api, /invoke\('install_hermes',[\s\S]*1900000\)/)
  assert.match(api, /invoke\('update_hermes',[\s\S]*1900000\)/)
  assert.match(setup, /installHermes\('official'/)
  assert.match(dashboard, /installHermes\('official'/)
})
