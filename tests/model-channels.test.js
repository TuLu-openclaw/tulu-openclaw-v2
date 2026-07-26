import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyModelChannelPatchPlan,
  createModelChannelPatchPlan,
  credentialEnvName,
  maskCredential,
  maskSensitiveFields,
  parseModelChannelBundle,
  summarizeModelChannelPatchPlan,
} from '../src/lib/model-channels.js'

const current = {
  untouchedRoot: { keep: true },
  models: {
    mode: 'merge',
    unknownModelsField: 7,
    providers: {
      alpha: {
        baseUrl: 'https://old.example/v1',
        api: 'openai-completions',
        apiKey: '${ALPHA_KEY}',
        unknownProviderField: 'keep',
        models: [{ id: 'old', latency: 123 }, { id: 'same', latency: 456, unknownModelField: true }],
      },
      beta: { baseUrl: 'http://localhost:11434', api: 'ollama', models: [{ id: 'local' }], keep: true },
    },
  },
}

function bundle(overrides = {}) {
  return {
    schemaVersion: 1,
    channels: [{
      id: 'alpha-channel',
      label: 'Alpha',
      unknownChannelField: 'roundtrip',
      provider: {
        id: 'alpha',
        baseUrl: 'https://new.example/v1/',
        apiType: 'openai-completions',
        credential: { $env: 'ALPHA_KEY' },
        models: [{ id: 'same', name: 'Same' }, { id: 'new', vendorMeta: 9 }],
        unknownProviderFieldFromImport: 'preserve',
      },
    }],
    deleteProviderIds: [],
    ...overrides,
  }
}

test('Hermes-compatible environment names are extracted without exposing SecretRef values', () => {
  assert.equal(credentialEnvName('$OPENAI_API_KEY'), 'OPENAI_API_KEY')
  assert.equal(credentialEnvName('${OPENAI_API_KEY}'), 'OPENAI_API_KEY')
  assert.equal(credentialEnvName({ $env: 'OPENAI_API_KEY' }), 'OPENAI_API_KEY')
  assert.equal(credentialEnvName({ source: 'env', id: 'OPENAI_API_KEY' }), 'OPENAI_API_KEY')
  assert.equal(credentialEnvName({ provider: 'environment', key: 'OPENAI_API_KEY' }), 'OPENAI_API_KEY')
  assert.equal(credentialEnvName({ source: 'vault', id: 'credential-1' }), null)
  assert.equal(credentialEnvName('sk-plaintext'), null)
})

test('credentials remain references and plaintext credentials are rejected', () => {
  const parsed = parseModelChannelBundle(bundle())
  assert.deepEqual(parsed.channels[0].provider.credential, { $env: 'ALPHA_KEY' })
  assert.throws(() => parseModelChannelBundle(bundle({
    channels: [{ ...bundle().channels[0], provider: { ...bundle().channels[0].provider, credential: 'sk-plaintext-secret' } }],
  })), /plaintext credentials/)
  assert.throws(() => parseModelChannelBundle(bundle({
    channels: [{ ...bundle().channels[0], provider: { ...bundle().channels[0].provider, credential: { value: 'sk-hidden-plaintext' } } }],
  })), /not an embedded credential value/)
  const env = parseModelChannelBundle(bundle({
    channels: [{ ...bundle().channels[0], provider: { ...bundle().channels[0].provider, credential: '${ALPHA_KEY}' } }],
  }))
  assert.equal(env.channels[0].provider.credential, '${ALPHA_KEY}')
})

test('unknown fields survive parsing and targeted patch application', () => {
  const parsed = parseModelChannelBundle(bundle())
  assert.equal(parsed.channels[0].unknownChannelField, 'roundtrip')
  assert.equal(parsed.channels[0].provider.unknownProviderFieldFromImport, 'preserve')
  const next = applyModelChannelPatchPlan(current, createModelChannelPatchPlan(current, parsed))
  assert.deepEqual(next.untouchedRoot, { keep: true })
  assert.equal(next.models.unknownModelsField, 7)
  assert.equal(next.models.providers.alpha.unknownProviderField, 'keep')
  assert.equal(next.models.providers.alpha.unknownProviderFieldFromImport, 'preserve')
  assert.equal(next.models.providers.alpha.models[0].unknownModelField, true)
  assert.equal(next.models.providers.alpha.models[0].latency, 456)
  assert.equal(next.models.providers.alpha.models[1].vendorMeta, 9)
})

test('patch changes only the target provider', () => {
  const next = applyModelChannelPatchPlan(current, createModelChannelPatchPlan(current, bundle()))
  assert.deepEqual(next.models.providers.beta, current.models.providers.beta)
  assert.notDeepEqual(next.models.providers.alpha, current.models.providers.alpha)
  assert.deepEqual(current.models.providers.alpha.models.map(model => model.id), ['old', 'same'])
})

test('delete operation removes only the named provider', () => {
  const parsed = parseModelChannelBundle({ schemaVersion: 1, channels: [], deleteProviderIds: ['alpha'] })
  const next = applyModelChannelPatchPlan(current, createModelChannelPatchPlan(current, parsed))
  assert.equal(next.models.providers.alpha, undefined)
  assert.deepEqual(next.models.providers.beta, current.models.providers.beta)
})

test('duplicate channel, provider, and model ids are rejected', () => {
  const channel = bundle().channels[0]
  assert.throws(() => parseModelChannelBundle(bundle({ channels: [channel, channel] })), /duplicate channel id/)
  assert.throws(() => parseModelChannelBundle(bundle({
    channels: [channel, { ...channel, id: 'other-channel' }],
  })), /duplicate provider id/)
  assert.throws(() => parseModelChannelBundle(bundle({
    channels: [{ ...channel, provider: { ...channel.provider, models: [{ id: 'same' }, { id: 'same' }] } }],
  })), /duplicate model id/)
})

test('invalid URLs, API types, and field types are rejected', () => {
  const channel = bundle().channels[0]
  assert.throws(() => parseModelChannelBundle(bundle({
    channels: [{ ...channel, provider: { ...channel.provider, baseUrl: 'file:///tmp/key' } }],
  })), /http or https/)
  assert.throws(() => parseModelChannelBundle(bundle({
    channels: [{ ...channel, provider: { ...channel.provider, apiType: 'vendor-private-api' } }],
  })), /supported API type/)
  assert.throws(() => parseModelChannelBundle(bundle({
    channels: [{ ...channel, enabled: 'yes' }],
  })), /enabled: must be a boolean/)
  assert.throws(() => parseModelChannelBundle(bundle({
    channels: [{ ...channel, provider: { ...channel.provider, models: 'not-an-array' } }],
  })), /models: must be an array/)
})

test('sensitive masking hides plaintext and SecretRef details but preserves env references', () => {
  assert.equal(maskCredential('sk-1234567890-secret'), 'sk-***ret')
  assert.equal(maskCredential('${ALPHA_KEY}'), '${ALPHA_KEY}')
  assert.equal(maskCredential({ provider: 'vault', id: 'credential-1' }), '[SecretRef]')
  assert.deepEqual(maskSensitiveFields({ apiKey: 'abcdefghijk', nested: { accessToken: { $env: 'TOKEN' }, safe: 'shown' } }), {
    apiKey: 'abc***ijk',
    nested: { accessToken: '[SecretRef]', safe: 'shown' },
  })
})

test('preview summary never exposes credential object internals', () => {
  const plan = createModelChannelPatchPlan(current, bundle())
  const summary = summarizeModelChannelPatchPlan(plan)
  assert.equal(summary[0].credential, '[SecretRef]')
  assert.equal(JSON.stringify(summary).includes('ALPHA_KEY'), false)
  assert.equal(summary[0].modelCount, 2)
})

test('legacy provider import preserves environment and SecretRef credentials', () => {
  const env = parseModelChannelBundle({ providers: { legacy: { baseUrl: 'https://legacy.example/v1', api: 'openai-completions', apiKey: '$LEGACY_KEY', models: [] } } })
  assert.equal(env.channels[0].provider.credential, '$LEGACY_KEY')
  const ref = parseModelChannelBundle({ models: { providers: { legacy: { baseUrl: 'https://legacy.example/v1', api: 'openai-completions', apiKey: { source: 'env', id: 'LEGACY_KEY' }, models: [] } } } })
  assert.deepEqual(ref.channels[0].provider.credential, { source: 'env', id: 'LEGACY_KEY' })
})
