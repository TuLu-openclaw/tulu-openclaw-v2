const CHANNEL_SCHEMA_VERSION = 1

export const MODEL_CHANNEL_SCHEMA_VERSION = CHANNEL_SCHEMA_VERSION
export const MODEL_CHANNEL_API_TYPES = Object.freeze([
  'openai-completions',
  'openai-responses',
  'anthropic-messages',
  'google-generative-ai',
  'ollama',
])

const API_TYPES = new Set(MODEL_CHANNEL_API_TYPES)
const ENV_REFERENCE = /^\$(?:[A-Za-z_][A-Za-z0-9_]*|\{[A-Za-z_][A-Za-z0-9_]*\})$/
const SENSITIVE_KEYS = /(?:api[-_]?key|token|secret|password|credential|authorization)/i

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function fail(path, message) {
  throw new TypeError(`${path}: ${message}`)
}

function requireId(value, path) {
  if (typeof value !== 'string' || !value.trim()) fail(path, 'must be a non-empty string')
  const id = value.trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) fail(path, 'contains unsupported characters')
  return id
}

function normalizeUrl(value, path) {
  if (typeof value !== 'string' || !value.trim()) fail(path, 'must be a non-empty HTTP(S) URL')
  let url
  try { url = new URL(value.trim()) } catch { fail(path, 'must be a valid HTTP(S) URL') }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') fail(path, 'must use http or https')
  return value.trim().replace(/\/+$/, '')
}

function normalizeCredential(value, path) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'string') {
    if (!ENV_REFERENCE.test(value.trim())) fail(path, 'plaintext credentials are not accepted; use an environment reference or SecretRef')
    return value.trim()
  }
  if (!isRecord(value) || !Object.keys(value).length) fail(path, 'must be an environment reference or SecretRef object')
  const envName = value.$env
  const locator = value.id ?? value.name ?? value.key
  const validEnvRef = typeof envName === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(envName)
  const validNamedRef = typeof value.ref === 'string' && Boolean(value.ref.trim())
  const validStoreRef = (typeof value.source === 'string' || typeof value.provider === 'string')
    && typeof locator === 'string' && Boolean(locator.trim())
  if (!validEnvRef && !validNamedRef && !validStoreRef) {
    fail(path, 'must be a structured SecretRef, not an embedded credential value')
  }
  return clone(value)
}

function normalizeModels(models, path) {
  if (!Array.isArray(models)) fail(path, 'must be an array')
  const seen = new Set()
  return models.map((raw, index) => {
    const modelPath = `${path}[${index}]`
    const source = typeof raw === 'string' ? { id: raw } : raw
    if (!isRecord(source)) fail(modelPath, 'must be a model object or id string')
    const id = requireId(source.id, `${modelPath}.id`)
    if (seen.has(id)) fail(`${modelPath}.id`, `duplicate model id "${id}"`)
    seen.add(id)
    if (source.name !== undefined && typeof source.name !== 'string') fail(`${modelPath}.name`, 'must be a string')
    if (source.contextWindow !== undefined && (!Number.isInteger(source.contextWindow) || source.contextWindow <= 0)) {
      fail(`${modelPath}.contextWindow`, 'must be a positive integer')
    }
    if (source.metadata !== undefined && !isRecord(source.metadata)) fail(`${modelPath}.metadata`, 'must be an object')
    return { ...clone(source), id }
  })
}

function normalizeChannel(raw, index) {
  const path = `channels[${index}]`
  if (!isRecord(raw)) fail(path, 'must be an object')
  const id = requireId(raw.id, `${path}.id`)
  if (!isRecord(raw.provider)) fail(`${path}.provider`, 'must be an object')
  const provider = raw.provider
  const providerId = requireId(provider.id || id, `${path}.provider.id`)
  const apiType = provider.apiType ?? provider.api
  if (typeof apiType !== 'string' || !API_TYPES.has(apiType)) fail(`${path}.provider.apiType`, 'is not a supported API type')
  const credentialSource = Object.hasOwn(provider, 'credential') ? provider.credential : provider.apiKey
  if (raw.metadata !== undefined && !isRecord(raw.metadata)) fail(`${path}.metadata`, 'must be an object')
  if (provider.metadata !== undefined && !isRecord(provider.metadata)) fail(`${path}.provider.metadata`, 'must be an object')
  const normalized = {
    ...clone(raw),
    id,
    provider: {
      ...clone(provider),
      id: providerId,
      apiType,
      baseUrl: normalizeUrl(provider.baseUrl, `${path}.provider.baseUrl`),
      models: normalizeModels(provider.models ?? [], `${path}.provider.models`),
    },
  }
  delete normalized.provider.api
  delete normalized.provider.apiKey
  if (credentialSource !== undefined) normalized.provider.credential = normalizeCredential(credentialSource, `${path}.provider.credential`)
  else delete normalized.provider.credential
  if (raw.label !== undefined && typeof raw.label !== 'string') fail(`${path}.label`, 'must be a string')
  if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') fail(`${path}.enabled`, 'must be a boolean')
  return normalized
}

function legacyChannels(source) {
  const providers = source?.models?.providers ?? source?.providers
  if (!isRecord(providers)) return null
  return Object.entries(providers).map(([id, provider]) => {
    if (!isRecord(provider)) fail(`providers.${id}`, 'must be an object')
    const { api, apiKey, ...rest } = provider
    return {
      id,
      label: id,
      provider: {
        ...clone(rest),
        id,
        apiType: api,
        ...(apiKey !== undefined ? { credential: clone(apiKey) } : {}),
      },
    }
  })
}

export function parseModelChannelBundle(payload) {
  if (!isRecord(payload)) fail('bundle', 'must be an object')
  if (payload.schemaVersion !== undefined && payload.schemaVersion !== CHANNEL_SCHEMA_VERSION) {
    fail('bundle.schemaVersion', `unsupported version "${payload.schemaVersion}"`)
  }
  const rawChannels = Array.isArray(payload.channels) ? payload.channels : legacyChannels(payload)
  if (!rawChannels) fail('bundle.channels', 'must be an array')
  const channels = rawChannels.map(normalizeChannel)
  const channelIds = new Set()
  const providerIds = new Set()
  for (const channel of channels) {
    if (channelIds.has(channel.id)) fail('bundle.channels', `duplicate channel id "${channel.id}"`)
    if (providerIds.has(channel.provider.id)) fail('bundle.channels', `duplicate provider id "${channel.provider.id}"`)
    channelIds.add(channel.id)
    providerIds.add(channel.provider.id)
  }
  const deleteProviderIds = payload.deleteProviderIds ?? []
  if (!Array.isArray(deleteProviderIds)) fail('bundle.deleteProviderIds', 'must be an array')
  const normalizedDeletes = deleteProviderIds.map((id, index) => requireId(id, `bundle.deleteProviderIds[${index}]`))
  if (new Set(normalizedDeletes).size !== normalizedDeletes.length) fail('bundle.deleteProviderIds', 'contains duplicate ids')
  for (const id of normalizedDeletes) {
    if (providerIds.has(id)) fail('bundle.deleteProviderIds', `cannot delete and upsert provider "${id}"`)
  }
  return {
    schemaVersion: CHANNEL_SCHEMA_VERSION,
    channels,
    deleteProviderIds: normalizedDeletes,
    metadata: isRecord(payload.metadata) ? clone(payload.metadata) : {},
  }
}

function mergeModels(existingModels, incomingModels) {
  const existing = Array.isArray(existingModels) ? existingModels : []
  return incomingModels.map(model => {
    const previous = existing.find(item => (typeof item === 'string' ? item : item?.id) === model.id)
    return { ...(isRecord(previous) ? clone(previous) : {}), ...clone(model) }
  })
}

function providerPatch(channel, existing) {
  const source = channel.provider
  const reserved = new Set(['id', 'apiType', 'baseUrl', 'credential', 'models', 'metadata'])
  const extra = Object.fromEntries(Object.entries(source).filter(([key]) => !reserved.has(key)).map(([key, value]) => [key, clone(value)]))
  const patch = {
    ...extra,
    ...(isRecord(source.metadata) ? { metadata: clone(source.metadata) } : {}),
    baseUrl: source.baseUrl,
    api: source.apiType,
    models: mergeModels(existing?.models, source.models),
  }
  if (Object.hasOwn(source, 'credential')) patch.apiKey = clone(source.credential)
  return patch
}

export function createModelChannelPatchPlan(currentConfig, bundleInput) {
  const bundle = parseModelChannelBundle(bundleInput)
  const providers = isRecord(currentConfig?.models?.providers) ? currentConfig.models.providers : {}
  const operations = bundle.channels.map(channel => ({
    op: 'upsert-provider',
    providerId: channel.provider.id,
    channelId: channel.id,
    value: providerPatch(channel, providers[channel.provider.id]),
  }))
  operations.push(...bundle.deleteProviderIds.map(providerId => ({ op: 'delete-provider', providerId })))
  return { schemaVersion: CHANNEL_SCHEMA_VERSION, operations }
}

export function applyModelChannelPatchPlan(currentConfig, plan) {
  if (!isRecord(plan) || !Array.isArray(plan.operations)) fail('plan.operations', 'must be an array')
  const next = isRecord(currentConfig) ? clone(currentConfig) : {}
  if (!isRecord(next.models)) next.models = {}
  if (!isRecord(next.models.providers)) next.models.providers = {}
  for (const [index, operation] of plan.operations.entries()) {
    if (!isRecord(operation)) fail(`plan.operations[${index}]`, 'must be an object')
    const providerId = requireId(operation.providerId, `plan.operations[${index}].providerId`)
    if (operation.op === 'upsert-provider') {
      if (!isRecord(operation.value)) fail(`plan.operations[${index}].value`, 'must be an object')
      const existing = isRecord(next.models.providers[providerId]) ? next.models.providers[providerId] : {}
      next.models.providers[providerId] = { ...existing, ...clone(operation.value) }
    } else if (operation.op === 'delete-provider') {
      delete next.models.providers[providerId]
    } else {
      fail(`plan.operations[${index}].op`, 'is unsupported')
    }
  }
  return next
}

export function verifyModelChannelPatchReceipt(receipt, expectedConfig, operations) {
  if (!isRecord(receipt)) return { verified: false, mismatches: ['receipt'] }
  const expectedProviders = isRecord(expectedConfig?.models?.providers) ? expectedConfig.models.providers : {}
  const mismatches = []
  for (const operation of operations || []) {
    const providerId = operation?.providerId
    if (!providerId) continue
    if (operation.op === 'delete-provider') {
      if (Object.hasOwn(receipt, providerId)) mismatches.push(providerId)
      continue
    }
    if (!sameJsonValue(receipt[providerId], expectedProviders[providerId])) mismatches.push(providerId)
  }
  return { verified: mismatches.length === 0, mismatches }
}

function sameJsonValue(left, right) {
  return JSON.stringify(sortJsonValue(left)) === JSON.stringify(sortJsonValue(right))
}

function sortJsonValue(value) {
  if (Array.isArray(value)) return value.map(sortJsonValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortJsonValue(value[key])]))
}

export function maskSensitiveFields(value) {
  if (Array.isArray(value)) return value.map(maskSensitiveFields)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (SENSITIVE_KEYS.test(key) && item !== undefined && item !== null && item !== '') return [key, maskCredential(item)]
    return [key, maskSensitiveFields(item)]
  }))
}

export function credentialEnvName(value) {
  if (typeof value === 'string') {
    const match = value.trim().match(/^\$(?:([A-Za-z_][A-Za-z0-9_]*)|\{([A-Za-z_][A-Za-z0-9_]*)\})$/)
    return match ? (match[1] || match[2]) : null
  }
  if (!isRecord(value)) return null
  if (typeof value.$env === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value.$env)) return value.$env
  const source = String(value.source || value.provider || '').toLowerCase()
  const locator = value.id ?? value.name ?? value.key
  if ((source === 'env' || source === 'environment') && typeof locator === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(locator)) return locator
  return null
}

export function maskCredential(value) {
  if (typeof value === 'string' && ENV_REFERENCE.test(value.trim())) return value.trim()
  if (isRecord(value)) return '[SecretRef]'
  const text = String(value ?? '')
  if (!text) return ''
  if (text.length <= 8) return '********'
  return `${text.slice(0, 3)}***${text.slice(-3)}`
}

export function summarizeModelChannelPatchPlan(plan) {
  return plan.operations.map(operation => {
    if (operation.op === 'delete-provider') return { op: operation.op, providerId: operation.providerId }
    return {
      op: operation.op,
      providerId: operation.providerId,
      modelCount: Array.isArray(operation.value?.models) ? operation.value.models.length : 0,
      apiType: operation.value?.api,
      baseUrl: operation.value?.baseUrl,
      credential: Object.hasOwn(operation.value || {}, 'apiKey') ? maskCredential(operation.value.apiKey) : '(preserve existing)',
    }
  })
}
