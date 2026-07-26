import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = fs.readFileSync(path.join(root, 'src-tauri/src/commands/hermes.rs'), 'utf8')

test('Hermes API Server keys use the operating system CSPRNG', () => {
  assert.match(source, /use rand::\{rngs::OsRng, RngCore\};/)
  assert.match(source, /let mut bytes = \[0_u8; 32\];/)
  assert.match(source, /OsRng\.fill_bytes\(&mut bytes\);/)
  assert.match(source, /String::with_capacity\(bytes\.len\(\) \* 2\)/)
})

test('Hermes configuration preserves strong API Server keys and rejects legacy placeholders', () => {
  assert.match(source, /fn hermes_api_server_key_is_usable\(value: &str\) -> bool/)
  assert.match(source, /hermes_env_value\(existing_env, "API_SERVER_KEY"\)/)
  assert.match(source, /resolve_hermes_api_server_key\(&existing_env\)/)
  assert.doesNotMatch(source, /\("API_SERVER_KEY"\.into\(\), "clawpanel-local"\.into\(\)\)/)
})

test('Hermes repairs API Server authentication before every gateway start', () => {
  const startBranch = source.slice(
    source.indexOf('"start" => {'),
    source.indexOf('#[cfg(target_os = "windows")]', source.indexOf('"start" => {')),
  )

  assert.match(startBranch, /ensure_api_server_enabled\(&app\)\?;/)
  assert.match(startBranch, /ensure_hermes_api_server_runtime_env\(\)\?;/)
  assert.match(source, /write_hermes_file_transactionally\(&env_path, &merged, "\.env"\)\?;/)
  assert.match(source, /Permissions::from_mode\(0o600\)/)
})
