import { parse, stringify } from 'yaml'

export const HERMES_CHANNEL_PLATFORMS = Object.freeze([
  'telegram',
  'discord',
  'slack',
  'feishu',
  'dingtalk',
  'teams',
  'google_chat',
  'irc',
  'line',
  'simplex',
])

const DM_POLICIES = new Set(['pair', 'open', 'allowlist', 'disabled'])
const GROUP_POLICIES = new Set(['open', 'allowlist', 'disabled'])
const TELEGRAM_REPLY_MODES = new Set(['off', 'first', 'all'])
const SECRET_FIELDS = {
  telegram: { botToken: 'TELEGRAM_BOT_TOKEN' },
  discord: { token: 'DISCORD_BOT_TOKEN' },
  slack: { botToken: 'SLACK_BOT_TOKEN', appToken: 'SLACK_APP_TOKEN', signingSecret: 'SLACK_SIGNING_SECRET' },
  feishu: { appId: 'FEISHU_APP_ID', appSecret: 'FEISHU_APP_SECRET' },
  dingtalk: { clientId: 'DINGTALK_CLIENT_ID', clientSecret: 'DINGTALK_CLIENT_SECRET' },
  teams: { clientId: 'TEAMS_CLIENT_ID', clientSecret: 'TEAMS_CLIENT_SECRET', tenantId: 'TEAMS_TENANT_ID' },
  google_chat: { serviceAccountJson: 'GOOGLE_CHAT_SERVICE_ACCOUNT_JSON' },
  irc: { serverPassword: 'IRC_SERVER_PASSWORD', nickservPassword: 'IRC_NICKSERV_PASSWORD' },
  line: { channelAccessToken: 'LINE_CHANNEL_ACCESS_TOKEN', channelSecret: 'LINE_CHANNEL_SECRET' },
  simplex: {},
}

const PLATFORM_FIELDS = {
  telegram: { replyToMode: 'reply_to_mode', guestMode: 'guest_mode', disableLinkPreviews: 'disable_link_previews' },
  discord: {
    freeResponseChannels: 'free_response_channels', allowedChannels: 'allowed_channels',
    ignoredChannels: 'ignored_channels', noThreadChannels: 'no_thread_channels', autoThread: 'auto_thread',
    reactions: 'reactions', threadRequireMention: 'thread_require_mention', historyBackfill: 'history_backfill',
    historyBackfillLimit: 'history_backfill_limit', replyToMode: 'reply_to_mode',
  },
  slack: { webhookPath: 'webhook_path' },
  feishu: {
    domain: 'domain', connectionMode: 'connection_mode', webhookPath: 'webhook_path',
    reactionNotifications: 'reaction_notifications', typingIndicator: 'typing_indicator',
    resolveSenderNames: 'resolve_sender_names',
  },
  dingtalk: {},
  teams: { port: 'port', serviceUrl: 'service_url' },
  google_chat: { projectId: 'project_id', subscriptionName: 'subscription_name' },
  irc: { server: 'server', port: 'port', nickname: 'nickname', channel: 'channel', useTls: 'use_tls' },
  line: {
    port: 'port', host: 'host', publicUrl: 'public_url', allowedGroups: 'allowed_groups',
    allowedRooms: 'allowed_rooms', slowResponseThreshold: 'slow_response_threshold',
  },
  simplex: { wsUrl: 'ws_url' },
}

const CSV_FIELDS = new Set([
  'allowFrom', 'groupAllowFrom', 'freeResponseChannels', 'allowedChannels', 'ignoredChannels',
  'noThreadChannels', 'allowedGroups', 'allowedRooms',
])
const BOOLEAN_FIELDS = new Set([
  'enabled', 'requireMention', 'allowAllUsers', 'guestMode', 'disableLinkPreviews', 'autoThread',
  'reactions', 'threadRequireMention', 'historyBackfill', 'typingIndicator', 'resolveSenderNames', 'useTls',
])

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function object(value) {
  return isObject(value) ? value : {}
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value)
}

function platformName(platform) {
  const value = String(platform ?? '').trim().toLowerCase()
  if (!HERMES_CHANNEL_PLATFORMS.includes(value)) throw new Error(`Unsupported Hermes channel platform: ${platform}`)
  return value
}

function parseConfig(yamlText) {
  let value
  try {
    value = String(yamlText ?? '').trim() ? parse(String(yamlText)) : {}
  } catch (error) {
    throw new Error(`Invalid Hermes channel YAML: ${error.message}`)
  }
  if (value == null) return {}
  if (!isObject(value)) throw new Error('Hermes channel YAML root must be a mapping')
  return value
}

function envValue(env, key) {
  const value = env?.[key]
  return value === undefined || value === null ? '' : String(value).trim()
}

function csvArray(value) {
  const source = Array.isArray(value) ? value : String(value ?? '').split(/[\n,]/)
  return [...new Set(source.map(item => String(item).trim()).filter(Boolean))]
}

function csvString(value) {
  return csvArray(value).join(', ')
}

function bool(value, fallback = false) {
  if (typeof value === 'boolean') return value
  const normalized = String(value ?? '').trim().toLowerCase()
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function camel(snake) {
  return snake.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

function readHomeChannel(form, entry) {
  const home = object(entry.home_channel)
  if (home.chat_id !== undefined) form.homeChannel = String(home.chat_id)
  if (home.name !== undefined) form.homeChannelName = String(home.name)
}

function envOverride(form, env, key, formKey, type = 'string') {
  const raw = envValue(env, key)
  if (!raw) return
  form[formKey] = type === 'boolean' ? bool(raw) : type === 'csv' ? csvString(raw) : raw
}

function readPlatform(config, platform, env) {
  const entry = object(object(config.platforms)[platform])
  const extra = object(entry.extra)
  const form = { enabled: entry.enabled === true }
  const legacySecrets = {
    telegram: { botToken: entry.token },
    discord: { token: entry.token },
    slack: { botToken: entry.token, appToken: extra.app_token, signingSecret: extra.signing_secret },
    feishu: { appId: extra.app_id, appSecret: extra.app_secret },
    dingtalk: { clientId: extra.client_id, clientSecret: extra.client_secret },
    teams: { clientId: extra.client_id, clientSecret: extra.client_secret, tenantId: extra.tenant_id },
    google_chat: { serviceAccountJson: extra.service_account_json },
    irc: { serverPassword: extra.server_password, nickservPassword: extra.nickserv_password },
    line: { channelAccessToken: extra.channel_access_token, channelSecret: extra.channel_secret },
    simplex: {},
  }[platform]
  for (const [formKey, value] of Object.entries(legacySecrets)) {
    if (typeof value === 'string' && value.trim()) form[formKey] = value.trim()
  }
  const allowKey = ['dingtalk', 'irc', 'line', 'simplex'].includes(platform) ? 'allowed_users' : 'allow_from'
  const groupKey = platform === 'dingtalk' ? 'allowed_chats' : 'group_allow_from'

  for (const [formKey, yamlKey] of Object.entries(PLATFORM_FIELDS[platform])) {
    if (extra[yamlKey] === undefined) continue
    form[formKey] = CSV_FIELDS.has(formKey) ? csvString(extra[yamlKey]) : extra[yamlKey]
  }
  if (extra.dm_policy !== undefined) form.dmPolicy = String(extra.dm_policy)
  if (extra.group_policy !== undefined) form.groupPolicy = String(extra.group_policy)
  if (extra.require_mention !== undefined) form.requireMention = bool(extra.require_mention)
  if (extra[allowKey] !== undefined) form.allowFrom = csvString(extra[allowKey])
  if (extra[groupKey] !== undefined) form.groupAllowFrom = csvString(extra[groupKey])
  readHomeChannel(form, entry)

  for (const [formKey, envKey] of Object.entries(SECRET_FIELDS[platform])) envOverride(form, env, envKey, formKey)

  const overrides = {
    telegram: { allowFrom: 'TELEGRAM_ALLOWED_USERS', groupAllowFrom: 'TELEGRAM_GROUP_ALLOWED_USERS', requireMention: 'TELEGRAM_REQUIRE_MENTION', replyToMode: 'TELEGRAM_REPLY_TO_MODE', guestMode: 'TELEGRAM_GUEST_MODE', disableLinkPreviews: 'TELEGRAM_DISABLE_LINK_PREVIEWS' },
    discord: { allowFrom: 'DISCORD_ALLOWED_USERS', requireMention: 'DISCORD_REQUIRE_MENTION', freeResponseChannels: 'DISCORD_FREE_RESPONSE_CHANNELS', allowedChannels: 'DISCORD_ALLOWED_CHANNELS', ignoredChannels: 'DISCORD_IGNORED_CHANNELS', noThreadChannels: 'DISCORD_NO_THREAD_CHANNELS', autoThread: 'DISCORD_AUTO_THREAD', reactions: 'DISCORD_REACTIONS', threadRequireMention: 'DISCORD_THREAD_REQUIRE_MENTION', historyBackfill: 'DISCORD_HISTORY_BACKFILL', historyBackfillLimit: 'DISCORD_HISTORY_BACKFILL_LIMIT', replyToMode: 'DISCORD_REPLY_TO_MODE', homeChannel: 'DISCORD_HOME_CHANNEL', homeChannelName: 'DISCORD_HOME_CHANNEL_NAME' },
    slack: { allowFrom: 'SLACK_ALLOWED_USERS', requireMention: 'SLACK_REQUIRE_MENTION' },
    feishu: { domain: 'FEISHU_DOMAIN', connectionMode: 'FEISHU_CONNECTION_MODE', webhookPath: 'FEISHU_WEBHOOK_PATH', allowFrom: 'FEISHU_ALLOWED_USERS', groupPolicy: 'FEISHU_GROUP_POLICY', requireMention: 'FEISHU_REQUIRE_MENTION' },
    dingtalk: { allowFrom: 'DINGTALK_ALLOWED_USERS', groupAllowFrom: 'DINGTALK_ALLOWED_CHATS', requireMention: 'DINGTALK_REQUIRE_MENTION' },
    teams: { port: 'TEAMS_PORT', serviceUrl: 'TEAMS_SERVICE_URL', allowFrom: 'TEAMS_ALLOWED_USERS', allowAllUsers: 'TEAMS_ALLOW_ALL_USERS', homeChannel: 'TEAMS_HOME_CHANNEL', homeChannelName: 'TEAMS_HOME_CHANNEL_NAME' },
    google_chat: { projectId: 'GOOGLE_CHAT_PROJECT_ID', subscriptionName: 'GOOGLE_CHAT_SUBSCRIPTION_NAME', allowFrom: 'GOOGLE_CHAT_ALLOWED_USERS', allowAllUsers: 'GOOGLE_CHAT_ALLOW_ALL_USERS', homeChannel: 'GOOGLE_CHAT_HOME_CHANNEL', homeChannelName: 'GOOGLE_CHAT_HOME_CHANNEL_NAME' },
    irc: { server: 'IRC_SERVER', port: 'IRC_PORT', nickname: 'IRC_NICKNAME', channel: 'IRC_CHANNEL', useTls: 'IRC_USE_TLS', allowFrom: 'IRC_ALLOWED_USERS', allowAllUsers: 'IRC_ALLOW_ALL_USERS', homeChannel: 'IRC_HOME_CHANNEL', homeChannelName: 'IRC_HOME_CHANNEL_NAME' },
    line: { port: 'LINE_PORT', host: 'LINE_HOST', publicUrl: 'LINE_PUBLIC_URL', allowFrom: 'LINE_ALLOWED_USERS', allowedGroups: 'LINE_ALLOWED_GROUPS', allowedRooms: 'LINE_ALLOWED_ROOMS', allowAllUsers: 'LINE_ALLOW_ALL_USERS', homeChannel: 'LINE_HOME_CHANNEL', slowResponseThreshold: 'LINE_SLOW_RESPONSE_THRESHOLD' },
    simplex: { wsUrl: 'SIMPLEX_WS_URL', allowFrom: 'SIMPLEX_ALLOWED_USERS', allowAllUsers: 'SIMPLEX_ALLOW_ALL_USERS', homeChannel: 'SIMPLEX_HOME_CHANNEL', homeChannelName: 'SIMPLEX_HOME_CHANNEL_NAME' },
  }[platform]
  for (const [formKey, envKey] of Object.entries(overrides)) {
    envOverride(form, env, envKey, formKey, BOOLEAN_FIELDS.has(formKey) ? 'boolean' : CSV_FIELDS.has(formKey) ? 'csv' : 'string')
  }
  return form
}

export function parseHermesChannelConfig(yamlText, envValues = {}) {
  const config = parseConfig(yamlText)
  return Object.fromEntries(HERMES_CHANNEL_PLATFORMS.map(platform => [platform, readPlatform(config, platform, envValues)]))
}

function validatePolicy(value, allowed, path) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!allowed.has(normalized)) throw new Error(`${path} must be one of: ${[...allowed].join(', ')}`)
  return normalized
}

function validatePort(value, path) {
  const raw = String(value ?? '').trim()
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 65535) throw new Error(`${path} must be an integer from 1 to 65535`)
  return Number(raw)
}

function validateUrl(value, path, protocols) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  let url
  try { url = new URL(raw) } catch { throw new Error(`${path} must be a valid URL`) }
  if (!protocols.includes(url.protocol)) throw new Error(`${path} must use ${protocols.join(' or ')}`)
  return raw
}

function normalizedForm(platform, form) {
  const result = { ...object(form) }
  if (Object.hasOwn(result, 'enabled')) result.enabled = bool(result.enabled)
  for (const key of BOOLEAN_FIELDS) if (Object.hasOwn(result, key)) result[key] = bool(result[key])
  for (const key of CSV_FIELDS) if (Object.hasOwn(result, key)) result[key] = csvArray(result[key])
  if (Object.hasOwn(result, 'dmPolicy')) result.dmPolicy = validatePolicy(result.dmPolicy, DM_POLICIES, 'dmPolicy')
  if (Object.hasOwn(result, 'groupPolicy')) result.groupPolicy = validatePolicy(result.groupPolicy, GROUP_POLICIES, 'groupPolicy')
  if (platform === 'telegram' && Object.hasOwn(result, 'replyToMode')) result.replyToMode = validatePolicy(result.replyToMode, TELEGRAM_REPLY_MODES, 'replyToMode')
  if (['teams', 'irc', 'line'].includes(platform) && Object.hasOwn(result, 'port')) result.port = validatePort(result.port, `${platform}.port`)
  if (platform === 'teams' && Object.hasOwn(result, 'serviceUrl')) result.serviceUrl = validateUrl(result.serviceUrl, 'teams.serviceUrl', ['http:', 'https:'])
  if (platform === 'line' && Object.hasOwn(result, 'publicUrl')) result.publicUrl = validateUrl(result.publicUrl, 'line.publicUrl', ['http:', 'https:'])
  if (platform === 'simplex' && Object.hasOwn(result, 'wsUrl')) result.wsUrl = validateUrl(result.wsUrl, 'simplex.wsUrl', ['ws:', 'wss:'])
  return result
}

function setExtra(entry, key, value) {
  if (!isObject(entry.extra)) entry.extra = {}
  if (value === '' || value === undefined || value === null) delete entry.extra[key]
  else entry.extra[key] = value
}

function setHome(entry, form) {
  if (!Object.hasOwn(form, 'homeChannel') && !Object.hasOwn(form, 'homeChannelName')) return
  const chatId = String(form.homeChannel ?? '').trim()
  if (!chatId) delete entry.home_channel
  else entry.home_channel = { ...object(entry.home_channel), chat_id: chatId, name: String(form.homeChannelName ?? '').trim() || chatId }
}

export function mergeHermesChannelConfig(yamlText, platform, form = {}) {
  const name = platformName(platform)
  const config = clone(parseConfig(yamlText))
  if (!isObject(config.platforms)) config.platforms = {}
  const entry = clone(object(config.platforms[name]))
  const normalized = normalizedForm(name, form)
  if (Object.hasOwn(normalized, 'enabled')) entry.enabled = normalized.enabled

  for (const key of ['token']) delete entry[key]
  const legacySecrets = {
    slack: ['app_token', 'signing_secret'], feishu: ['app_id', 'app_secret'], dingtalk: ['client_id', 'client_secret'],
    teams: ['client_id', 'client_secret', 'tenant_id'], google_chat: ['service_account_json'],
    irc: ['server_password', 'nickserv_password'], line: ['channel_access_token', 'channel_secret'],
  }[name] || []
  for (const key of legacySecrets) if (isObject(entry.extra)) delete entry.extra[key]

  for (const [formKey, yamlKey] of Object.entries(PLATFORM_FIELDS[name])) {
    if (Object.hasOwn(normalized, formKey)) setExtra(entry, yamlKey, normalized[formKey])
  }
  if (Object.hasOwn(normalized, 'dmPolicy')) setExtra(entry, 'dm_policy', normalized.dmPolicy)
  if (Object.hasOwn(normalized, 'groupPolicy')) setExtra(entry, 'group_policy', normalized.groupPolicy)
  if (Object.hasOwn(normalized, 'requireMention')) setExtra(entry, 'require_mention', normalized.requireMention)
  const allowKey = ['dingtalk', 'irc', 'line', 'simplex'].includes(name) ? 'allowed_users' : 'allow_from'
  const groupKey = name === 'dingtalk' ? 'allowed_chats' : 'group_allow_from'
  if (Object.hasOwn(normalized, 'allowFrom')) setExtra(entry, allowKey, normalized.allowFrom)
  if (Object.hasOwn(normalized, 'groupAllowFrom')) setExtra(entry, groupKey, normalized.groupAllowFrom)
  setHome(entry, normalized)
  config.platforms[name] = entry
  return stringify(config, { lineWidth: 0 })
}

function put(updates, key, value, type = 'string') {
  if (value === undefined || value === null) return
  updates[key] = type === 'boolean' ? (bool(value) ? 'true' : 'false') : type === 'csv' ? csvArray(value).join(',') : String(value).trim()
}

export function normalizeHermesChannelRuntime(runtime) {
  const source = object(runtime)
  const snapshotGatewayState = String(source.gatewayState ?? '').trim().toLowerCase() || 'unknown'
  const processDetected = typeof source.processDetected === 'boolean' ? source.processDetected : null
  const gatewayState = processDetected === false && ['running', 'starting', 'degraded', 'draining'].includes(snapshotGatewayState)
    ? 'stopped'
    : snapshotGatewayState
  const updatedAt = String(source.updatedAt ?? '').trim()
  const platforms = {}
  for (const platform of HERMES_CHANNEL_PLATFORMS) {
    const item = object(object(source.platforms)[platform])
    const upstreamState = String(item.state ?? '').trim().toLowerCase()
    let status = 'unknown'
    if (['connected', 'running', 'ready'].includes(upstreamState)) status = 'connected'
    else if (['connecting', 'starting', 'retrying'].includes(upstreamState)) status = 'connecting'
    else if (['fatal', 'failed', 'error', 'startup_failed'].includes(upstreamState)) status = 'failed'
    else if (['paused'].includes(upstreamState)) status = 'paused'
    else if (['disabled', 'disconnected', 'stopped'].includes(upstreamState)) status = upstreamState
    if (processDetected === false && status !== 'disabled') status = 'stopped'
    platforms[platform] = {
      status,
      upstreamState,
      errorCode: String(item.errorCode ?? '').trim(),
      errorMessage: String(item.errorMessage ?? '').trim(),
      updatedAt: String(item.updatedAt ?? '').trim(),
    }
  }
  return {
    gatewayState,
    processDetected,
    exitReason: String(source.exitReason ?? '').trim(),
    updatedAt,
    platforms,
  }
}

export function hermesChannelPlatformsWithLegacySecrets(yamlText) {
  const platforms = object(parseConfig(yamlText).platforms)
  return HERMES_CHANNEL_PLATFORMS.filter(platform => {
    const entry = object(platforms[platform])
    const extra = object(entry.extra)
    if (typeof entry.token === 'string' && entry.token.trim()) return true
    const legacyKeys = {
      slack: ['app_token', 'signing_secret'],
      feishu: ['app_id', 'app_secret'],
      dingtalk: ['client_id', 'client_secret'],
      teams: ['client_id', 'client_secret', 'tenant_id'],
      google_chat: ['service_account_json'],
      irc: ['server_password', 'nickserv_password'],
      line: ['channel_access_token', 'channel_secret'],
    }[platform] || []
    return legacyKeys.some(key => typeof extra[key] === 'string' && extra[key].trim())
  })
}

export function hermesChannelSavePlatforms(yamlText, dirtyPlatforms = []) {
  const dirty = [...dirtyPlatforms].map(platformName)
  return [...new Set([...dirty, ...hermesChannelPlatformsWithLegacySecrets(yamlText)])]
}

export function buildHermesChannelEnvUpdates(platform, form = {}) {
  const name = platformName(platform)
  const normalized = normalizedForm(name, form)
  const updates = {}
  for (const [formKey, envKey] of Object.entries(SECRET_FIELDS[name])) {
    const value = String(normalized[formKey] ?? '').trim()
    if (value) updates[envKey] = value
  }
  const envFields = {
    telegram: { allowFrom: 'TELEGRAM_ALLOWED_USERS', groupAllowFrom: 'TELEGRAM_GROUP_ALLOWED_USERS', requireMention: 'TELEGRAM_REQUIRE_MENTION', replyToMode: 'TELEGRAM_REPLY_TO_MODE', guestMode: 'TELEGRAM_GUEST_MODE', disableLinkPreviews: 'TELEGRAM_DISABLE_LINK_PREVIEWS' },
    discord: { allowFrom: 'DISCORD_ALLOWED_USERS', requireMention: 'DISCORD_REQUIRE_MENTION', freeResponseChannels: 'DISCORD_FREE_RESPONSE_CHANNELS', allowedChannels: 'DISCORD_ALLOWED_CHANNELS', ignoredChannels: 'DISCORD_IGNORED_CHANNELS', noThreadChannels: 'DISCORD_NO_THREAD_CHANNELS', autoThread: 'DISCORD_AUTO_THREAD', reactions: 'DISCORD_REACTIONS', threadRequireMention: 'DISCORD_THREAD_REQUIRE_MENTION', historyBackfill: 'DISCORD_HISTORY_BACKFILL', historyBackfillLimit: 'DISCORD_HISTORY_BACKFILL_LIMIT', replyToMode: 'DISCORD_REPLY_TO_MODE', homeChannel: 'DISCORD_HOME_CHANNEL', homeChannelName: 'DISCORD_HOME_CHANNEL_NAME' },
    slack: { allowFrom: 'SLACK_ALLOWED_USERS', requireMention: 'SLACK_REQUIRE_MENTION' },
    feishu: { domain: 'FEISHU_DOMAIN', connectionMode: 'FEISHU_CONNECTION_MODE', webhookPath: 'FEISHU_WEBHOOK_PATH', allowFrom: 'FEISHU_ALLOWED_USERS', groupPolicy: 'FEISHU_GROUP_POLICY', requireMention: 'FEISHU_REQUIRE_MENTION', reactionNotifications: 'FEISHU_REACTIONS' },
    dingtalk: { allowFrom: 'DINGTALK_ALLOWED_USERS', groupAllowFrom: 'DINGTALK_ALLOWED_CHATS', requireMention: 'DINGTALK_REQUIRE_MENTION' },
    teams: { port: 'TEAMS_PORT', serviceUrl: 'TEAMS_SERVICE_URL', allowFrom: 'TEAMS_ALLOWED_USERS', allowAllUsers: 'TEAMS_ALLOW_ALL_USERS', homeChannel: 'TEAMS_HOME_CHANNEL', homeChannelName: 'TEAMS_HOME_CHANNEL_NAME' },
    google_chat: { projectId: 'GOOGLE_CHAT_PROJECT_ID', subscriptionName: 'GOOGLE_CHAT_SUBSCRIPTION_NAME', allowFrom: 'GOOGLE_CHAT_ALLOWED_USERS', allowAllUsers: 'GOOGLE_CHAT_ALLOW_ALL_USERS', homeChannel: 'GOOGLE_CHAT_HOME_CHANNEL', homeChannelName: 'GOOGLE_CHAT_HOME_CHANNEL_NAME' },
    irc: { server: 'IRC_SERVER', port: 'IRC_PORT', nickname: 'IRC_NICKNAME', channel: 'IRC_CHANNEL', useTls: 'IRC_USE_TLS', allowFrom: 'IRC_ALLOWED_USERS', allowAllUsers: 'IRC_ALLOW_ALL_USERS', homeChannel: 'IRC_HOME_CHANNEL', homeChannelName: 'IRC_HOME_CHANNEL_NAME' },
    line: { port: 'LINE_PORT', host: 'LINE_HOST', publicUrl: 'LINE_PUBLIC_URL', allowFrom: 'LINE_ALLOWED_USERS', allowedGroups: 'LINE_ALLOWED_GROUPS', allowedRooms: 'LINE_ALLOWED_ROOMS', allowAllUsers: 'LINE_ALLOW_ALL_USERS', homeChannel: 'LINE_HOME_CHANNEL', slowResponseThreshold: 'LINE_SLOW_RESPONSE_THRESHOLD' },
    simplex: { wsUrl: 'SIMPLEX_WS_URL', allowFrom: 'SIMPLEX_ALLOWED_USERS', allowAllUsers: 'SIMPLEX_ALLOW_ALL_USERS', homeChannel: 'SIMPLEX_HOME_CHANNEL', homeChannelName: 'SIMPLEX_HOME_CHANNEL_NAME' },
  }[name]
  for (const [formKey, envKey] of Object.entries(envFields)) {
    if (!Object.hasOwn(normalized, formKey)) continue
    if (name === 'feishu' && formKey === 'reactionNotifications') put(updates, envKey, normalized[formKey] === 'off' ? false : true, 'boolean')
    else put(updates, envKey, normalized[formKey], BOOLEAN_FIELDS.has(formKey) ? 'boolean' : CSV_FIELDS.has(formKey) ? 'csv' : 'string')
  }
  return updates
}
