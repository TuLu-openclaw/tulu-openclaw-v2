import { t } from './i18n.js'

const RAW_MAX = 240
const PATTERNS = [
  ['gatewayDown', /(gateway(?:\s+is)?[^a-z]*(not[^a-z]*(running|ready|reachable)|down|offline)|gateway[^a-z]*未(启动|运行|就绪))/i],
  ['network', /(failed to fetch|networkerror|enetunreach|econnreset|econnrefused|ehostunreach|fetch failed|connection refused|connection reset|getaddrinfo|dns error|no route to host|backend service is not running|后端服务未运行)/i],
  ['permission', /(permission denied|eacces|operation not permitted|access is denied|拒绝访问|无权限|权限不足|forbidden)/i],
  ['auth', /(\b401\b|unauthori[sz]ed|invalid (api[_ ]?key|token|credentials)|authentication[^a-z]*(failed|required)|身份验证|未授权)/i],
  ['rateLimit', /(\b429\b|too many requests|rate[_ ]?limit|quota[^a-z]*(exceeded|reached)|超过.*配额)/i],
  ['timeout', /(timeout|timed out|deadline exceeded|超时)/i],
  ['notFound', /(\b404\b|not found|does not exist|未找到|不存在|no such)/i],
  ['busy', /(\b5\d\d\b|service unavailable|server error|internal server|temporarily unavailable|busy|繁忙)/i],
]

const ACTIONS = {
  gatewayDown: { labelKey: 'common.settings', route: '/services' },
  permission: { labelKey: 'common.settings', route: '/settings' },
  auth: { labelKey: 'common.settings', route: '/models' },
}

export function redactErrorDetails(value) {
  return String(value || '')
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/([?&](?:api_?key|token|access_token|secret|password)=)[^&#\s]+/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|token|access[_-]?token|client[_-]?secret|password)\s*["']?\s*[:=]\s*["'])[^"'\s,;}]+/gi, '$1[REDACTED]')
    .replace(/(https?:\/\/[^\s/@:]+:)[^\s/@]+@/gi, '$1[REDACTED]@')
}

function toRawString(error) {
  if (error == null) return ''
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message || error.stack || String(error)
  if (typeof error === 'object') {
    if (typeof error.message === 'string') return error.message
    if (typeof error.error === 'string') return error.error
    try { return JSON.stringify(error) } catch { return String(error) }
  }
  return String(error)
}

function translatedReason(kind) {
  if (kind === 'network') return t('common.networkError')
  if (kind === 'gatewayDown') return t('common.gatewayDisconnected')
  return ''
}

export function humanizeError(error, context = '') {
  const raw = redactErrorDetails(toRawString(error)).trim()
  const kind = PATTERNS.find(([, pattern]) => pattern.test(raw))?.[0] || 'generic'
  const reason = translatedReason(kind)
  const base = String(context || '').trim() || t('common.error')
  const result = {
    message: reason && reason !== base ? `${base}: ${reason}` : base,
    raw: raw.length > RAW_MAX ? `${raw.slice(0, RAW_MAX)}...` : raw,
    kind,
  }
  const action = ACTIONS[kind]
  if (action) result.action = { label: t(action.labelKey), route: action.route }
  return result
}

export function humanizeErrorText(error, context = '') {
  return humanizeError(error, context).message
}
