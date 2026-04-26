/**
 * Hermes provider registry (frontend mirror).
 *
 * The authoritative data lives in Rust at
 *   `src-tauri/src/commands/hermes_providers.rs::ALL_PROVIDERS`
 * and is exposed via the Tauri command `hermes_list_providers`.
 *
 * This module:
 *   1. Loads the 22 providers once per session (cached)
 *   2. Groups them by auth type and region for UI rendering
 *   3. Provides small lookup helpers (by id, by model, etc.)
 *
 * Never hardcode provider data here — always call `loadHermesProviders()`
 * so we stay in sync with the Rust side.
 */

import { api } from '../../../lib/tauri-api.js'

// Auth type constants (must match Rust side)
export const AUTH_API_KEY = 'api_key'
export const AUTH_OAUTH_DEVICE = 'oauth_device_code'
export const AUTH_OAUTH_EXTERNAL = 'oauth_external'
export const AUTH_EXTERNAL_PROCESS = 'external_process'

// Transport constants
export const TRANSPORT_OPENAI_CHAT = 'openai_chat'
export const TRANSPORT_ANTHROPIC = 'anthropic_messages'
export const TRANSPORT_GOOGLE = 'google_gemini'
export const TRANSPORT_CODEX = 'codex_responses'

// China-region provider ids (for UI sub-grouping). Everything else is
// considered "International" by default.
const CN_PROVIDER_IDS = new Set(['zai', 'kimi-coding', 'alibaba', 'minimax-cn', 'xiaomi'])

// Aggregator ids (also tagged via `isAggregator` on the data).
const AGGREGATOR_IDS = new Set([
  'openrouter',
  'ai-gateway',
  'opencode-zen',
  'opencode-go',
  'kilocode',
  'huggingface',
  'nous',
])

let _cached = null
let _loadPromise = null

/**
 * Fetch the full provider list from Rust (cached for the session).
 * Call this once at module load or at first use.
 */
export async function loadHermesProviders() {
  if (_cached) return _cached
  if (_loadPromise) return _loadPromise
  _loadPromise = api.hermesListProviders().then(list => {
    _cached = list || []
    return _cached
  }).catch(() => {
    _cached = []
    return _cached
  })
  return _loadPromise
}

/** Return all providers as a flat array. */
export async function getAllProviders() {
  return loadHermesProviders()
}

/** Return a single provider by id, or null. */
export async function getProviderById(id) {
  const list = await loadHermesProviders()
  return list.find(p => p.id === id) || null
}

/** Return all models for a given provider id. */
export async function getModelsForProvider(providerId) {
  const p = await getProviderById(providerId)
  return p?.models || []
}

/**
 * Return providers grouped for UI rendering:
 *   { international: Provider[], china: Provider[] }
 * China vs international is determined by the `cn` field on the provider.
 */
export async function getGroupedProviders() {
  const list = await loadHermesProviders()
  const international = []
  const china = []
  for (const p of list) {
    if (CN_PROVIDER_IDS.has(p.id)) {
      china.push(p)
    } else {
      international.push(p)
    }
  }
  return { international, china }
}

/** Infer the best-guess provider id from a base URL string. */
export async function inferProviderByBaseUrl(baseUrl) {
  if (!baseUrl) return null
  const normalized = baseUrl.replace(/\/$/, '').toLowerCase()
  const list = await loadHermesProviders()
  for (const p of list) {
    const pUrl = (p.base_url || '').replace(/\/$/, '').toLowerCase()
    if (pUrl && normalized.includes(pUrl)) return p.id
  }
  return null
}

/** Return all models across all providers that match a filter. */
export async function searchModels(query, limit = 20) {
  const q = (query || '').toLowerCase().trim()
  if (!q) return []
  const list = await loadHermesProviders()
  const hits = []
  for (const p of list) {
    for (const m of (p.models || [])) {
      const id = (m.id || '').toLowerCase()
      const name = (m.name || '').toLowerCase()
      if (id.includes(q) || name.includes(q) || id === q) {
        hits.push({ ...m, provider: p.id, providerName: p.name })
      }
    }
  }
  return hits.slice(0, limit)
}
