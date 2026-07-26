export function hermesRunId(payload) {
  return payload?.run_id || payload?.runId || payload?.id || null
}

export function hermesRunSessionId(payload) {
  return payload?.session_id || payload?.sessionId || null
}

export function canClaimHermesRun(payload, expectedSessionId) {
  const runId = hermesRunId(payload)
  const sessionId = hermesRunSessionId(payload)
  if (!runId) return false
  if (!expectedSessionId) return true
  return sessionId === expectedSessionId
}

export function belongsToHermesRun(payload, expectedRunId, expectedSessionId) {
  const runId = hermesRunId(payload)
  const sessionId = hermesRunSessionId(payload)
  if (runId) return Boolean(expectedRunId) && runId === expectedRunId
  if (sessionId && expectedSessionId) return sessionId === expectedSessionId
  return false
}
