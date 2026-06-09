import { api } from './tauri-api.js'
import { wsClient } from './ws-client.js'

export function formatGatewayReconnectStateLabel(state, t, scope = 'services') {
  const key = String(state || 'idle').toLowerCase()
  const labels = {
    idle: t(`${scope}.reconnectIdle`),
    scheduled: t(`${scope}.reconnectScheduled`),
    attempting: t(`${scope}.reconnectAttempting`),
  }
  return labels[key] || t(`${scope}.reconnectUnknown`, { state: key })
}

export function classifyGatewayRuntime({ service, gatewayState = {}, wsInfo = {} } = {}) {
  const processRunning = !!service?.running || !!gatewayState?.running
  const foreign = !!gatewayState?.foreign || service?.owned_by_current_instance === false || service?.ownership === 'foreign'
  const wsConnected = !!wsInfo?.connected
  const gatewayReady = !!wsInfo?.gatewayReady
  const handshaking = !!wsInfo?.handshaking
  const connecting = !!wsInfo?.connecting
  const reconnectState = wsInfo?.reconnectState || 'idle'
  const health = gatewayState?.health || 'unknown'
  const intentionalClose = !!wsInfo?.intentionalClose

  let phase = 'unknown'
  let ready = false
  let degraded = false
  let recommendedAction = 'inspect'

  if (foreign) {
    phase = 'foreign'
    recommendedAction = 'resolve_foreign'
  } else if (gatewayReady) {
    phase = 'ready'
    ready = true
    recommendedAction = 'none'
  } else if (!processRunning) {
    phase = gatewayState?.recovering ? 'recovering' : 'stopped'
    recommendedAction = gatewayState?.recovering ? 'wait' : 'start'
  } else if (connecting || reconnectState === 'attempting') {
    phase = 'ws_connecting'
    degraded = true
    recommendedAction = 'wait'
  } else if (wsConnected && handshaking) {
    phase = 'handshaking'
    degraded = true
    recommendedAction = 'wait'
  } else if (wsConnected && !gatewayReady) {
    phase = 'ws_connected_not_ready'
    degraded = true
    recommendedAction = 'reconnect'
  } else if (reconnectState === 'scheduled') {
    phase = 'ws_reconnect_scheduled'
    degraded = true
    recommendedAction = 'wait_or_reconnect'
  } else if (health === 'recovering') {
    phase = 'recovering'
    degraded = true
    recommendedAction = 'wait'
  } else if (health === 'starting') {
    phase = 'process_starting'
    degraded = true
    recommendedAction = 'connect'
  } else if (health === 'degraded' || processRunning) {
    phase = 'process_running_ws_missing'
    degraded = true
    recommendedAction = intentionalClose ? 'connect' : 'reconnect'
  }

  return {
    ready,
    degraded,
    phase,
    recommendedAction,
    processRunning,
    foreign,
    wsConnected,
    gatewayReady,
    handshaking,
    connecting,
    reconnectState,
    health,
  }
}

function includesFatal(text) {
  return /\b(error|fatal|fail(?:ed|ure)?|panic|exception|eaddrinuse|permission denied|access is denied|找不到|拒绝|失败|错误|崩溃)\b/i.test(String(text || ''))
}

function includesSuccessfulStart(text) {
  return /(listening|started|gateway.+ready|server.+running|127\.0\.0\.1|18789|启动成功|监听|已启动|就绪)/i.test(String(text || ''))
}

function pickMainStartIssue({ startError, gatewayLog, gatewayErrLog, guardianLog, service, installation, config }) {
  const allLogs = [gatewayErrLog, gatewayLog, guardianLog].filter(Boolean).join('\n')
  const errorText = String(startError || '')
  if (service?.cli_installed === false || installation?.installed === false) return 'cli_missing'
  if (!config?.gateway) return 'config_missing_gateway'
  if (/token|auth|unauthorized|认证|令牌/i.test(errorText + '\n' + allLogs)) return 'auth_or_token'
  if (/EADDRINUSE|address already in use|端口.*占用/i.test(errorText + '\n' + allLogs)) return 'port_conflict'
  if (/permission denied|access is denied|权限|拒绝访问/i.test(errorText + '\n' + allLogs)) return 'permission'
  if (/timeout|超时/i.test(errorText)) return 'start_timeout'
  if (includesFatal(errorText + '\n' + gatewayErrLog)) return 'fatal_log'
  return 'process_exited_or_not_spawned'
}

export async function buildGatewayStartFailureDiagnosis({ label = 'ai.openclaw.gateway', startError = null } = {}) {
  const [servicesRes, installRes, configRes, gwLogRes, gwErrRes, guardianRes] = await Promise.allSettled([
    api.getServicesStatus(),
    api.checkInstallation(),
    api.readOpenclawConfig(),
    api.readLogTail('gateway', 160),
    api.readLogTail('gateway-err', 160),
    api.readLogTail('guardian', 120),
  ])

  const services = servicesRes.status === 'fulfilled' ? servicesRes.value : []
  const service = services?.find?.(s => s.label === label) || services?.[0] || null
  const installation = installRes.status === 'fulfilled' ? installRes.value : null
  const config = configRes.status === 'fulfilled' ? configRes.value : null
  const gatewayLog = gwLogRes.status === 'fulfilled' ? gwLogRes.value || '' : ''
  const gatewayErrLog = gwErrRes.status === 'fulfilled' ? gwErrRes.value || '' : ''
  const guardianLog = guardianRes.status === 'fulfilled' ? guardianRes.value || '' : ''
  const gatewayState = { running: !!service?.running, foreign: service?.owned_by_current_instance === false }
  const wsInfo = typeof wsClient?.getConnectionInfo === 'function' ? wsClient.getConnectionInfo() : {}
  const runtime = classifyGatewayRuntime({ service, gatewayState, wsInfo })
  const port = config?.gateway?.port || 18789
  const auth = config?.gateway?.auth || {}
  const rawToken = auth?.token ?? config?.gateway?.authToken
  const hasToken = !!(typeof rawToken === 'string' ? rawToken.trim() : rawToken)
  const fatalLogDetected = includesFatal(gatewayErrLog)
  const previousStartSucceeded = includesSuccessfulStart(gatewayLog) || includesSuccessfulStart(guardianLog)
  const mainIssue = pickMainStartIssue({ startError, gatewayLog, gatewayErrLog, guardianLog, service, installation, config })

  const diagnostics = {
    label,
    port,
    processRunning: !!service?.running,
    openclawReady: !!installation?.installed && service?.cli_installed !== false,
    cliInstalled: service?.cli_installed !== false,
    endpointListening: !!service?.running,
    portFree: !service?.running,
    previousStartSucceeded,
    fatalLogDetected,
    hasGatewayConfig: !!config?.gateway,
    hasToken,
    authMode: auth?.mode || (hasToken ? 'token' : 'unknown'),
    ownership: service?.ownership || null,
    pid: service?.pid || null,
    runtime,
    mainIssue,
    startError: startError ? String(startError?.message || startError) : '',
    gatewayLogTail: gatewayLog,
    gatewayErrLogTail: gatewayErrLog,
    guardianLogTail: guardianLog,
  }

  if (!diagnostics.processRunning && diagnostics.portFree && previousStartSucceeded && !fatalLogDetected) {
    diagnostics.summary = 'Gateway 当前未运行，端口空闲，历史上曾正常启动，未发现明显致命日志；更像是启动命令未成功拉起、进程启动后立即退出、或面板没有保持 Gateway 常驻。'
  } else if (!diagnostics.processRunning && diagnostics.portFree) {
    diagnostics.summary = 'Gateway 当前未运行且端口空闲；启动失败需要结合 CLI、配置、权限和日志继续定位。'
  } else if (diagnostics.processRunning && !diagnostics.runtime.gatewayReady) {
    diagnostics.summary = 'Gateway 进程/端口可见，但 WebSocket 握手尚未完成。'
  } else {
    diagnostics.summary = 'Gateway 状态需要进一步检查。'
  }

  return diagnostics
}

export function renderGatewayStartFailureDiagnosisHtml(d, escapeHtml, t) {
  const rows = [
    ['Gateway 进程', d.processRunning ? '运行中' : '未运行'],
    ['OpenClaw/CLI', d.openclawReady ? '可用' : (d.cliInstalled ? 'CLI 可用但配置可能未就绪' : 'CLI 未安装/不可用')],
    [`端口 ${d.port}`, d.endpointListening ? '正在监听' : '空闲，未监听'],
    ['历史启动记录', d.previousStartSucceeded ? '曾正常启动成功' : '未确认'],
    ['日志致命错误', d.fatalLogDetected ? '发现疑似 ERROR / fail' : '未发现明显 ERROR / fail'],
    ['Gateway 配置', d.hasGatewayConfig ? '存在' : '缺失 gateway 节点'],
    ['认证 Token', d.hasToken ? '已配置' : '缺失/未检测到'],
    ['主要异常点', issueLabel(d.mainIssue)],
  ]
  const rowHtml = rows.map(([k, v]) => `
    <tr><td style="padding:6px 10px;color:var(--text-secondary);border-bottom:1px solid var(--border)">${escapeHtml(k)}</td><td style="padding:6px 10px;border-bottom:1px solid var(--border)">${escapeHtml(v)}</td></tr>
  `).join('')
  const err = d.startError ? `<div style="margin-top:10px;color:var(--error);white-space:pre-wrap">${escapeHtml(d.startError)}</div>` : ''
  return `
    <div style="line-height:1.7">
      <div style="font-weight:700;margin-bottom:8px">诊断结论</div>
      <div style="margin-bottom:8px;color:var(--text-secondary)">${escapeHtml(d.summary || '')}</div>
      <table style="width:100%;border-collapse:collapse;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;overflow:hidden;font-size:12px"><tbody>${rowHtml}</tbody></table>
      ${err}
      <div style="margin-top:12px;color:var(--text-tertiary);font-size:12px">建议：先点“配置校准/一键修复”，再重试启动；如果仍失败，查看 gateway.err.log 与 guardian.log 的尾部日志。</div>
    </div>
  `
}

function issueLabel(issue) {
  const labels = {
    cli_missing: 'OpenClaw CLI 未安装或不可用',
    config_missing_gateway: 'openclaw.json 缺少 gateway 配置',
    auth_or_token: '认证/Token 相关异常',
    port_conflict: '端口冲突',
    permission: '权限不足或被系统拒绝',
    start_timeout: '启动超时但端口未监听',
    fatal_log: '日志中存在致命错误',
    process_exited_or_not_spawned: '进程未被拉起或启动后立即退出',
  }
  return labels[issue] || issue || '未知'
}
