export function normalizeChannelRuntimeStatus(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { supported: false, partial: false, warnings: [], channelAccounts: {}, channels: {} }
  }
  return {
    supported: true,
    partial: raw.partial === true,
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter(Boolean).map(String) : [],
    channelAccounts: normalizeAccounts(raw.channelAccounts),
    channels: plainObject(raw.channels),
  }
}

export function getChannelRuntimeSummary(status, channelId, configured = null) {
  const normalized = status?.supported === true || status?.supported === false
    ? status
    : normalizeChannelRuntimeStatus(status)
  const channel = String(channelId || '')
  const normalizedAccounts = normalizeAccounts(normalized.channelAccounts)
  const accounts = channelAliases(channel).flatMap(alias => normalizedAccounts[alias] || [])
  const states = accounts.map(account => account.state)
  let state = 'unsupported'
  if (normalized.supported) {
    if (states.includes('error')) state = 'error'
    else if (states.includes('connected')) state = 'connected'
    else if (states.includes('running')) state = 'running'
    else if (states.includes('configured')) state = 'configured'
    else if (states.includes('disabled')) state = 'disabled'
    else state = configured?.enabled === false ? 'disabled' : 'configured'
  }
  return {
    supported: normalized.supported === true,
    state,
    accounts,
    lastError: accounts.find(account => account.lastError)?.lastError || '',
    lastInboundAt: latest(accounts, 'lastInboundAt'),
    lastOutboundAt: latest(accounts, 'lastOutboundAt'),
  }
}

function channelAliases(channel) {
  if (channel === 'dingtalk-connector' || channel === 'dingtalk') return ['dingtalk-connector', 'dingtalk']
  if (channel === 'openclaw-weixin' || channel === 'weixin') return ['openclaw-weixin', 'weixin']
  return [channel]
}

export function formatRuntimeAge(value, now = Date.now()) {
  const ts = Number(value)
  if (!Number.isFinite(ts) || ts <= 0) return ''
  const seconds = Math.floor(Math.max(0, now - ts) / 1000)
  if (seconds < 45) return '<1m'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

function normalizeAccounts(value) {
  const result = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result
  for (const [channel, accounts] of Object.entries(value)) {
    if (!Array.isArray(accounts)) continue
    result[channel] = accounts.filter(account => account && typeof account === 'object').map(account => ({
      ...account,
      accountId: String(account.accountId || 'default'),
      lastError: account.lastError ? String(account.lastError) : '',
      state: account.lastError
        ? 'error'
        : account.enabled === false
          ? 'disabled'
          : account.connected === true || account.linked === true
            ? 'connected'
            : account.running === true
              ? 'running'
              : account.configured === true
                ? 'configured'
                : 'missing',
    }))
  }
  return result
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {}
}

function latest(accounts, key) {
  return accounts.reduce((max, account) => {
    const value = Number(account?.[key])
    return Number.isFinite(value) && value > max ? value : max
  }, 0) || null
}
