import test from 'node:test'
import assert from 'node:assert/strict'
import { parse as parseYaml } from 'yaml'

import {
  HERMES_CHANNEL_PLATFORMS,
  buildHermesChannelEnvUpdates,
  hermesChannelPlatformsWithLegacySecrets,
  hermesChannelSavePlatforms,
  mergeHermesChannelConfig,
  normalizeHermesChannelRuntime,
  parseHermesChannelConfig,
} from '../src/engines/hermes/lib/channel-config-policy.js'

const CASES = {
  telegram: { form: { botToken: 'tg-secret', replyToMode: 'all' }, yamlKey: 'reply_to_mode', yamlValue: 'all', envKey: 'TELEGRAM_BOT_TOKEN' },
  discord: { form: { token: 'dc-secret', allowedChannels: 'a, b' }, yamlKey: 'allowed_channels', yamlValue: ['a', 'b'], envKey: 'DISCORD_BOT_TOKEN' },
  slack: { form: { botToken: 'slack-secret', webhookPath: '/events' }, yamlKey: 'webhook_path', yamlValue: '/events', envKey: 'SLACK_BOT_TOKEN' },
  feishu: { form: { appId: 'cli_1', appSecret: 'secret', domain: 'lark' }, yamlKey: 'domain', yamlValue: 'lark', envKey: 'FEISHU_APP_SECRET' },
  dingtalk: { form: { clientId: 'ding-id', clientSecret: 'secret', allowFrom: 'u1, u2' }, yamlKey: 'allowed_users', yamlValue: ['u1', 'u2'], envKey: 'DINGTALK_CLIENT_SECRET' },
  teams: { form: { clientId: 'teams-id', clientSecret: 'secret', tenantId: 'tenant', port: '3978' }, yamlKey: 'port', yamlValue: 3978, envKey: 'TEAMS_CLIENT_SECRET' },
  google_chat: { form: { projectId: 'project', subscriptionName: 'sub', serviceAccountJson: '{"private_key":"x"}' }, yamlKey: 'project_id', yamlValue: 'project', envKey: 'GOOGLE_CHAT_SERVICE_ACCOUNT_JSON' },
  irc: { form: { server: 'irc.example.test', port: '6697', serverPassword: 'secret', useTls: true }, yamlKey: 'server', yamlValue: 'irc.example.test', envKey: 'IRC_SERVER_PASSWORD' },
  line: { form: { channelAccessToken: 'line-secret', channelSecret: 'secret', publicUrl: 'https://line.example.test/hook' }, yamlKey: 'public_url', yamlValue: 'https://line.example.test/hook', envKey: 'LINE_CHANNEL_SECRET' },
  simplex: { form: { wsUrl: 'wss://simplex.example.test/ws', allowFrom: 'alice, bob' }, yamlKey: 'ws_url', yamlValue: 'wss://simplex.example.test/ws', envKey: 'SIMPLEX_WS_URL' },
}

test('exports exactly the ten supported Hermes channel platforms', () => {
  assert.deepEqual([...HERMES_CHANNEL_PLATFORMS], Object.keys(CASES))
})

test('all ten platforms map form fields to structured YAML and environment updates', () => {
  for (const [platform, example] of Object.entries(CASES)) {
    const yaml = mergeHermesChannelConfig('', platform, { enabled: true, ...example.form })
    const config = parseYaml(yaml)
    assert.equal(config.platforms[platform].enabled, true, platform)
    assert.deepEqual(config.platforms[platform].extra[example.yamlKey], example.yamlValue, platform)

    const updates = buildHermesChannelEnvUpdates(platform, example.form)
    assert.ok(updates[example.envKey], `${platform}: ${example.envKey}`)
    const parsed = parseHermesChannelConfig(yaml, updates)
    assert.equal(parsed[platform].enabled, true, platform)
  }
})

test('merge preserves unrelated top-level, platform, entry, and extra fields', () => {
  const yaml = `
model:
  provider: keep
platforms:
  telegram:
    enabled: false
    entry_unknown: keep-entry
    extra:
      unknown_option:
        nested: keep-extra
  discord:
    enabled: true
    extra:
      untouched: keep-platform
`
  const merged = parseYaml(mergeHermesChannelConfig(yaml, 'telegram', {
    enabled: true,
    dmPolicy: 'pair',
    allowFrom: ' 1001, 1002\n1001 ',
  }))

  assert.equal(merged.model.provider, 'keep')
  assert.equal(merged.platforms.discord.extra.untouched, 'keep-platform')
  assert.equal(merged.platforms.telegram.entry_unknown, 'keep-entry')
  assert.equal(merged.platforms.telegram.extra.unknown_option.nested, 'keep-extra')
  assert.deepEqual(merged.platforms.telegram.extra.allow_from, ['1001', '1002'])
})

test('credentials never land in YAML, including credentials already stored there', () => {
  const existing = `
platforms:
  telegram:
    token: old-token
    extra: { unknown: keep }
  slack:
    extra:
      app_token: old-app-token
      signing_secret: old-signing-secret
`
  const telegram = mergeHermesChannelConfig(existing, 'telegram', { enabled: true, botToken: 'new-token', replyToMode: 'first' })
  const slack = mergeHermesChannelConfig(telegram, 'slack', { enabled: true, botToken: 'xoxb', appToken: 'xapp', signingSecret: 'sign', webhookPath: '/events' })
  const config = parseYaml(slack)

  assert.equal(config.platforms.telegram.token, undefined)
  assert.equal(config.platforms.slack.extra.app_token, undefined)
  assert.equal(config.platforms.slack.extra.signing_secret, undefined)
  assert.doesNotMatch(slack, /new-token|xoxb|xapp|old-app-token|old-signing-secret/)
  assert.equal(config.platforms.telegram.extra.unknown, 'keep')
})

test('legacy YAML credentials can be migrated to env before removal', () => {
  const source = `
platforms:
  telegram:
    token: legacy-token
    extra:
      reply_to_mode: first
  slack:
    token: legacy-bot
    extra:
      app_token: legacy-app
      signing_secret: legacy-signing
`
  assert.deepEqual(hermesChannelPlatformsWithLegacySecrets(source), ['telegram', 'slack'])
  const forms = parseHermesChannelConfig(source, {})
  assert.equal(forms.telegram.botToken, 'legacy-token')
  assert.equal(forms.slack.botToken, 'legacy-bot')
  assert.equal(forms.slack.appToken, 'legacy-app')
  assert.equal(forms.slack.signingSecret, 'legacy-signing')

  const env = {
    ...buildHermesChannelEnvUpdates('telegram', forms.telegram),
    ...buildHermesChannelEnvUpdates('slack', forms.slack),
  }
  const merged = mergeHermesChannelConfig(
    mergeHermesChannelConfig(source, 'telegram', forms.telegram),
    'slack',
    forms.slack,
  )
  assert.equal(env.TELEGRAM_BOT_TOKEN, 'legacy-token')
  assert.equal(env.SLACK_BOT_TOKEN, 'legacy-bot')
  assert.equal(env.SLACK_APP_TOKEN, 'legacy-app')
  assert.equal(env.SLACK_SIGNING_SECRET, 'legacy-signing')
  assert.doesNotMatch(merged, /legacy-token|legacy-bot|legacy-app|legacy-signing/)
  assert.deepEqual(hermesChannelPlatformsWithLegacySecrets(merged), [])
  assert.deepEqual(hermesChannelSavePlatforms(source, new Set(['line'])), ['line', 'telegram', 'slack'])
})

test('empty passwords mean preserve the existing environment value', () => {
  assert.deepEqual(buildHermesChannelEnvUpdates('irc', {
    server: 'irc.example.test',
    serverPassword: '   ',
    nickservPassword: '',
  }), { IRC_SERVER: 'irc.example.test' })
  assert.deepEqual(buildHermesChannelEnvUpdates('telegram', { botToken: '' }), {})
})

test('parse overlays environment credentials and normalizes CSV display values', () => {
  const parsed = parseHermesChannelConfig(`
platforms:
  telegram:
    enabled: true
    extra:
      allow_from: ["1001", "1002"]
`, { TELEGRAM_BOT_TOKEN: 'env-token' })

  assert.equal(parsed.telegram.botToken, 'env-token')
  assert.equal(parsed.telegram.allowFrom, '1001, 1002')
  assert.equal(parsed.discord.enabled, false)
})

test('rejects unsupported platforms and invalid policy values', () => {
  assert.throws(() => mergeHermesChannelConfig('', 'matrix', {}), /Unsupported Hermes channel platform/)
  assert.throws(() => buildHermesChannelEnvUpdates('matrix', {}), /Unsupported Hermes channel platform/)
  assert.throws(() => mergeHermesChannelConfig('', 'telegram', { dmPolicy: 'sometimes' }), /dmPolicy/)
  assert.throws(() => mergeHermesChannelConfig('', 'telegram', { groupPolicy: 'pair' }), /groupPolicy/)
  assert.throws(() => mergeHermesChannelConfig('', 'telegram', { replyToMode: 'later' }), /replyToMode/)
})

test('rejects invalid ports and URLs', () => {
  for (const port of ['0', '65536', '3.14', 'abc']) {
    assert.throws(() => mergeHermesChannelConfig('', 'teams', { port }), /teams\.port/)
  }
  assert.throws(() => mergeHermesChannelConfig('', 'teams', { serviceUrl: 'ftp://example.test' }), /teams\.serviceUrl/)
  assert.throws(() => mergeHermesChannelConfig('', 'line', { publicUrl: 'not a url' }), /line\.publicUrl/)
  assert.throws(() => mergeHermesChannelConfig('', 'simplex', { wsUrl: 'https://example.test' }), /simplex\.wsUrl/)
})

test('environment mapping covers booleans, CSV values, URLs, and ports', () => {
  assert.deepEqual(buildHermesChannelEnvUpdates('line', {
    channelAccessToken: 'token',
    channelSecret: 'secret',
    port: '8080',
    publicUrl: 'https://line.example.test/hook',
    allowFrom: 'u1, u2\nu1',
    allowedGroups: ['g1', 'g2'],
    allowAllUsers: true,
  }), {
    LINE_CHANNEL_ACCESS_TOKEN: 'token',
    LINE_CHANNEL_SECRET: 'secret',
    LINE_PORT: '8080',
    LINE_PUBLIC_URL: 'https://line.example.test/hook',
    LINE_ALLOWED_USERS: 'u1,u2',
    LINE_ALLOWED_GROUPS: 'g1,g2',
    LINE_ALLOW_ALL_USERS: 'true',
  })
})

test('normalizes native gateway platform runtime without inferring health', () => {
  const runtime = normalizeHermesChannelRuntime({
    gatewayState: 'degraded',
    updatedAt: '2026-07-24T13:50:00Z',
    platforms: {
      telegram: { state: 'connected', updatedAt: '2026-07-24T13:50:00Z' },
      discord: { state: 'retrying', errorCode: 'network', errorMessage: 'timeout' },
      slack: { state: 'fatal', errorCode: 'auth', errorMessage: 'invalid token' },
      irc: { state: 'unexpected-future-state' },
    },
  })

  assert.equal(runtime.gatewayState, 'degraded')
  assert.equal(runtime.platforms.telegram.status, 'connected')
  assert.equal(runtime.platforms.discord.status, 'connecting')
  assert.equal(runtime.platforms.slack.status, 'failed')
  assert.equal(runtime.platforms.slack.errorCode, 'auth')
  assert.equal(runtime.platforms.irc.status, 'unknown')
  assert.equal(runtime.platforms.line.status, 'unknown')
})

test('uses native process detection to reject residual connected snapshots', () => {
  const runtime = normalizeHermesChannelRuntime({
    gatewayState: 'running',
    processDetected: false,
    platforms: {
      telegram: { state: 'connected' },
      discord: { state: 'disabled' },
    },
  })
  assert.equal(runtime.processDetected, false)
  assert.equal(runtime.gatewayState, 'stopped')
  assert.equal(runtime.platforms.telegram.status, 'stopped')
  assert.equal(runtime.platforms.discord.status, 'disabled')
})

test('does not infer stale connectivity from an old gateway timestamp', () => {
  const runtime = normalizeHermesChannelRuntime({
    gatewayState: 'running',
    updatedAt: '2026-07-24T13:40:00Z',
    platforms: { telegram: { state: 'connected' } },
  })
  assert.equal(runtime.platforms.telegram.status, 'connected')
})

test('rejects malformed YAML and non-mapping roots', () => {
  assert.throws(() => parseHermesChannelConfig('platforms: [', {}), /Invalid Hermes channel YAML/)
  assert.throws(() => mergeHermesChannelConfig('- item', 'telegram', {}), /root must be a mapping/)
})
