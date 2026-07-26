import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const rust = readFileSync(new URL('../src-tauri/src/commands/config.rs', import.meta.url), 'utf8')
const service = readFileSync(new URL('../src-tauri/src/commands/service.rs', import.meta.url), 'utf8')
const setup = readFileSync(new URL('../src/pages/setup.js', import.meta.url), 'utf8')
const locales = readFileSync(new URL('../src/locales/modules/setup.js', import.meta.url), 'utf8')
const diagnosis = readFileSync(new URL('../src/lib/error-diagnosis.js', import.meta.url), 'utf8')
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')

test('Node requirement comes from OpenClaw metadata with verified release fallbacks', () => {
  assert.match(rust, /read_package_json_field\(path, "\/engines\/node"\)/)
  assert.match(rust, /const OPENCLAW_NODE_22_19_VERSION_FLOOR: &str = "2026\.6\.5"/)
  assert.match(rust, /const OPENCLAW_NODE_22_19_REQUIREMENT: &str = ">=22\.19\.0"/)
  assert.match(rust, /const OPENCLAW_NODE_7_1_VERSION_FLOOR: &str = "2026\.7\.1"/)
  assert.match(rust, />=22\.22\.3 <23 \|\| >=24\.15\.0 <25 \|\| >=25\.9\.0/)
})

test('Node detection reports compatibility and required version on every path', () => {
  assert.match(rust, /fn populate_node_detection_result\(/)
  assert.match(rust, /"compatible"\.into\(\), Value::Bool\(compatible\)/)
  assert.match(rust, /"requiredVersion"\.into\(\)/)
  assert.match(rust, /populate_node_detection_result\(&mut result, ver, path, detected_from\)/)
  assert.match(rust, /populate_node_detection_result\(&mut result, ver, node_dir, detected_from\)/)
})

test('unsupported Node versions cannot pass setup, npm install, or Gateway startup', () => {
  assert.match(setup, /nodeRes\.value\?\.compatible !== false/)
  assert.match(setup, /const nodeOk = node\.installed && node\.compatible !== false/)
  assert.match(setup, /result\.installed && result\.compatible !== false/)
  assert.match(rust, /ensure_target_node_runtime_compatible_for_npm\(ver\)\?;/)
  assert.match(
    service,
    /async fn start_service_impl_internal\(label: &str\)[\s\S]*?ensure_node_runtime_compatible\(\)\?;/,
  )
  assert.equal((service.match(/ensure_node_runtime_compatible\(\)\?;/g) || []).length, 1)
})

test('setup guidance and diagnostics use version-specific compatibility guidance', () => {
  assert.ok(readme.includes('OpenClaw `2026.7.1+`'))
  assert.ok(!readme.includes('| Node.js | 18+ |'))
  for (const source of [locales, diagnosis]) {
    assert.doesNotMatch(source, /Node(?:\.js)? 18(?:\+| or newer| 或更高版本)/)
  }
  for (const key of [
    'nodeVersionUnsupported',
    'nodeUpgradeHint',
    'nodeUnsupportedTitle',
    'promptNodeUnsupported',
  ]) {
    assert.ok(locales.includes(`${key}:`), `missing setup locale key: ${key}`)
  }
})
