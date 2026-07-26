import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const rust = readFileSync(new URL('../src-tauri/src/commands/config.rs', import.meta.url), 'utf8')
const ws = readFileSync(new URL('../src/lib/ws-client.js', import.meta.url), 'utf8')
const gatewayTests = readFileSync(new URL('./gateway-auth-compat.test.js', import.meta.url), 'utf8')

test('Gateway connect advertises an overlapping protocol range and treats mismatch as terminal', () => {
  assert.match(ws, /minProtocol:\s*3/)
  assert.match(ws, /maxProtocol:\s*4/)
  assert.match(ws, /PROTOCOL_MISMATCH/)
  assert.match(gatewayTests, /protocol mismatch is surfaced as a terminal actionable error/)
  assert.match(gatewayTests, /clientMinProtocol:\s*3, clientMaxProtocol:\s*4/)
})

test('legacy model API names normalize before request routing', () => {
  const start = rust.indexOf('fn normalize_model_api_type(raw: &str)')
  const end = rust.indexOf('fn normalize_base_url_for_api', start)
  assert.ok(start >= 0 && end > start, 'normalize_model_api_type implementation not found')
  const normalize = rust.slice(start, end)
  for (const rule of [
    /"anthropic" \| "anthropic-messages" => "anthropic-messages"/,
    /"google-gemini" \| "google-generative-ai" \| "google-generative" => "google-gemini"/,
    /"ollama" => "openai-completions"/,
    /"openai" \| "openai-completions" \| "openai-responses" \| "" => "openai-completions"/,
  ]) {
    assert.match(normalize, rule)
  }
  assert.ok((rust.match(/normalize_model_api_type\(/g) || []).length >= 6)
})
