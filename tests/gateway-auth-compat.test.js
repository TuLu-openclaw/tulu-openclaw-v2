import assert from 'node:assert/strict'
import test from 'node:test'

const originalWindow = globalThis.window
const originalLocation = globalThis.location
const originalWebSocket = globalThis.WebSocket
const originalSetTimeout = globalThis.setTimeout
const originalClearTimeout = globalThis.clearTimeout

const invokeCalls = []
const sockets = []

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 3

  constructor(url) {
    this.url = url
    this.readyState = FakeWebSocket.CONNECTING
    this.sent = []
    sockets.push(this)
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  send(data) {
    this.sent.push(data)
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED
  }
}

globalThis.window = {
  __TAURI_INTERNALS__: true,
  location: { hostname: 'tauri.localhost', protocol: 'http:', host: 'tauri.localhost' },
}
globalThis.location = globalThis.window.location
globalThis.WebSocket = FakeWebSocket
globalThis.setTimeout = (fn, delay) => ({ fn, delay })
globalThis.clearTimeout = () => {}

const fakeInvoke = async (cmd, args) => {
  invokeCalls.push({ cmd, args })
  if (cmd === 'create_connect_frame') {
    return { type: 'req', id: 'connect-test', method: 'connect', params: args }
  }
  return {}
}

const { WsClient } = await import(`../src/lib/ws-client.js?test=${Date.now()}`)

function createClient() {
  return new WsClient({ invoke: fakeInvoke })
}

function reset() {
  invokeCalls.length = 0
  sockets.length = 0
}

function cleanup(client) {
  client._intentionalClose = true
  client._stopPing()
  client._stopHeartbeat()
  client._clearChallengeTimer()
  client._clearReconnectTimer()
  client._closeWs()
}

test('token remains URL-compatible and is included in signed connect frame', async () => {
  reset()
  const client = createClient()
  client.connect('127.0.0.1:18789', 'token value')
  assert.equal(sockets[0].url, 'ws://127.0.0.1:18789/ws?token=token%20value')
  sockets[0].open()
  client._handleMessage({ type: 'event', event: 'connect.challenge', payload: { nonce: 'nonce-token' } })
  await Promise.resolve()
  assert.deepEqual(invokeCalls.at(-1), {
    cmd: 'create_connect_frame',
    args: {
      nonce: 'nonce-token',
      gatewayToken: 'token value',
      gatewayPassword: '',
      minProtocol: 3,
      maxProtocol: 4,
    },
  })
  cleanup(client)
})

test('password is sent only in connect auth and never exposed in WebSocket URL', async () => {
  reset()
  const client = createClient()
  client.connect('127.0.0.1:18789', { mode: 'password', password: 'secret password' })
  assert.equal(sockets[0].url, 'ws://127.0.0.1:18789/ws')
  assert.equal(client.getConnectionInfo().url.includes('secret'), false)
  sockets[0].open()
  client._handleMessage({ type: 'event', event: 'connect.challenge', payload: { nonce: 'nonce-password' } })
  await Promise.resolve()
  assert.equal(invokeCalls.at(-1).args.gatewayToken, '')
  assert.equal(invokeCalls.at(-1).args.gatewayPassword, 'secret password')
  cleanup(client)
})

test('password changes create a new connection even though URL is unchanged', () => {
  reset()
  const client = createClient()
  client.connect('127.0.0.1:18789', { mode: 'password', password: 'old' })
  client.connect('127.0.0.1:18789', { mode: 'password', password: 'new' })
  assert.equal(sockets.length, 2)
  assert.equal(client._password, 'new')
  cleanup(client)
})

test('missing challenge nonce never invokes connect frame generation', async () => {
  reset()
  const client = createClient()
  client.connect('127.0.0.1:18789', { mode: 'password', password: 'secret' })
  sockets[0].open()
  client._handleMessage({ type: 'event', event: 'connect.challenge', payload: {} })
  await Promise.resolve()
  assert.equal(invokeCalls.some((call) => call.cmd === 'create_connect_frame'), false)
  cleanup(client)
})

test.after(() => {
  globalThis.window = originalWindow
  globalThis.location = originalLocation
  globalThis.WebSocket = originalWebSocket
  globalThis.setTimeout = originalSetTimeout
  globalThis.clearTimeout = originalClearTimeout
})
