import test from 'node:test'
import assert from 'node:assert/strict'

import {
  canConfigureOauth,
  defaultOauthModel,
  oauthAuthLabel,
  oauthProviderStatus,
  oauthProviders,
} from '../src/engines/hermes/lib/oauth-policy.js'

const providers = [
  { id: 'anthropic', name: 'Anthropic', authType: 'api_key', models: ['claude'] },
  { id: 'nous', name: 'Nous', authType: 'oauth_device_code', models: ['DeepHermes-3'], cliAuthHint: 'hermes auth login nous' },
  { id: 'openai-codex', name: 'OpenAI Codex', authType: 'oauth_external', models: ['gpt-5-codex'], cliAuthHint: 'hermes auth login openai-codex' },
]

test('oauthProviders returns only OAuth registry entries', () => {
  assert.deepEqual(oauthProviders(providers).map(provider => provider.id), ['nous', 'openai-codex'])
})

test('oauth provider status reflects current Hermes provider', () => {
  const status = oauthProviderStatus(providers[1], {
    configuredProvider: 'nous',
    providerConfigured: true,
    model: 'DeepHermes-3',
  })

  assert.equal(status.selected, true)
  assert.equal(status.command, 'hermes auth login nous')
  assert.equal(status.model, 'DeepHermes-3')
})

test('oauth configuration is gated by auth type and model', () => {
  assert.equal(canConfigureOauth(providers[0], 'claude'), false)
  assert.equal(canConfigureOauth(providers[1], ''), false)
  assert.equal(canConfigureOauth(providers[1], 'DeepHermes-3'), true)
  assert.equal(canConfigureOauth(providers[2], 'gpt-5-codex'), true)
})

test('oauth labels and default model degrade predictably', () => {
  assert.equal(oauthAuthLabel('oauth_device_code'), 'Device code')
  assert.equal(oauthAuthLabel('oauth_external'), 'External OAuth')
  assert.equal(oauthAuthLabel('unknown'), 'OAuth')
  assert.equal(defaultOauthModel(providers[1]), 'DeepHermes-3')
  assert.equal(defaultOauthModel({ models: [] }), '')
})
