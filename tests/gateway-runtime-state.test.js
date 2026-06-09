import test from 'node:test'
import assert from 'node:assert/strict'

import {
  classifyGatewayRuntime,
  renderGatewayStartFailureDiagnosisHtml,
} from '../src/lib/gateway-runtime-state.js'

test('Gateway 状态机只把握手完成视为 ready', () => {
  const runtime = classifyGatewayRuntime({
    service: { running: true, owned_by_current_instance: true },
    gatewayState: { running: true, health: 'running' },
    wsInfo: { connected: true, gatewayReady: false, reconnectState: 'idle' },
  })

  assert.equal(runtime.ready, false)
  assert.equal(runtime.phase, 'ws_connected_not_ready')
  assert.equal(runtime.recommendedAction, 'reconnect')
})

test('Gateway 端口空闲且未运行时建议启动', () => {
  const runtime = classifyGatewayRuntime({
    service: { running: false },
    gatewayState: { running: false, health: 'offline' },
    wsInfo: { connected: false, gatewayReady: false, reconnectState: 'idle' },
  })

  assert.equal(runtime.ready, false)
  assert.equal(runtime.phase, 'stopped')
  assert.equal(runtime.recommendedAction, 'start')
})

test('Gateway 启动失败诊断渲染包含端口空闲但启动失败场景', () => {
  const html = renderGatewayStartFailureDiagnosisHtml({
    processRunning: false,
    openclawReady: false,
    cliInstalled: true,
    port: 18789,
    endpointListening: false,
    previousStartSucceeded: true,
    fatalLogDetected: false,
    hasGatewayConfig: true,
    hasToken: false,
    mainIssue: 'process_exited_or_not_spawned',
    summary: 'Gateway 当前未运行，端口空闲，历史上曾正常启动，未发现明显致命日志。',
    startError: 'Gateway 启动超时，请查看 gateway.err.log',
  }, (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;'),
  (key) => key)

  assert.match(html, /Gateway 进程/)
  assert.match(html, /未运行/)
  assert.match(html, /端口 18789/)
  assert.match(html, /空闲，未监听/)
  assert.match(html, /进程未被拉起或启动后立即退出/)
})
