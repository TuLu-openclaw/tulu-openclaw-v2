export const HERMES_DIAGNOSTIC_ACTIONS = Object.freeze([
  'gateway_status',
  'doctor',
  'dump',
  'gateway_logs',
])

export function normalizeHermesDiagnosticResult(value, requestedAction = '') {
  const source = value && typeof value === 'object' ? value : {}
  const action = HERMES_DIAGNOSTIC_ACTIONS.includes(source.action)
    ? source.action
    : (HERMES_DIAGNOSTIC_ACTIONS.includes(requestedAction) ? requestedAction : '')
  return {
    action,
    success: source.success === true,
    exitCode: Number.isInteger(source.exitCode) ? source.exitCode : null,
    output: typeof source.output === 'string' ? source.output : '',
    truncated: source.truncated === true,
  }
}
