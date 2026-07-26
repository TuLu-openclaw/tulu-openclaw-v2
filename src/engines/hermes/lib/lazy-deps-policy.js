export function normalizeDashboardProbe(result) {
  const value = result && typeof result === 'object' ? result : {}
  const port = Number(value.port || 8642)
  const running = value.running === true || value.started === true
  const safePort = Number.isFinite(port) && port > 0 ? port : 8642
  return {
    running,
    port: safePort,
    url: value.url || `http://127.0.0.1:${safePort}`,
    state: value.state || (running ? 'running' : 'offline'),
    detail: value.detail || value.error || value.log_tail || '',
  }
}

export function lazyDependencyState({ hermes, dashboard }) {
  const info = hermes && typeof hermes === 'object' ? hermes : {}
  const probe = normalizeDashboardProbe(dashboard)
  const installed = info.installed === true
  const configured = info.configExists === true
  return {
    hermesInstalled: installed,
    hermesConfigured: configured,
    dashboardRunning: probe.running,
    ready: installed && configured,
    needsWebExtra: installed && !probe.running,
    probe,
  }
}

export function canInstallWebExtra(state, busy = false) {
  return Boolean(state?.hermesInstalled && !busy)
}

export function canOpenDashboard(state, busy = false) {
  return Boolean(state?.dashboardRunning && state?.probe?.url && !busy)
}
