import test from 'node:test'
import assert from 'node:assert/strict'

import { WsClient } from '../src/lib/ws-client.js'

class OpenSocket {
  static OPEN = 1
  constructor() {
    this.readyState = OpenSocket.OPEN
    this.sent = []
  }
  send(value) { this.sent.push(JSON.parse(value)) }
}

test('request forwards timeout options after waiting for reconnect', async () => {
  const client = new WsClient({ invoke: async () => ({}) })
  client._intentionalClose = false
  client._reconnectAttempts = 1

  const promise = client.request('chat.history', { sessionKey: 'agent:main:test' }, { timeoutMs: 9876 })
  client._ws = new OpenSocket()
  client._gatewayReady = true
  client._readyCallbacks[0]({}, 'agent:main:test')

  await Promise.resolve()
  const frame = client._ws.sent[0]
  assert.equal(frame.method, 'chat.history')
  const pending = client._pending.get(frame.id)
  assert.ok(pending)
  clearTimeout(pending.timer)
  client._handleMessage({ type: 'res', id: frame.id, ok: true, payload: { messages: [] } })
  assert.deepEqual(await promise, { messages: [] })
})

test('disconnect rejects and clears every pending request', async () => {
  const client = new WsClient({ invoke: async () => ({}) })
  client._ws = new OpenSocket()
  client._gatewayReady = true

  const promise = client.request('chat.send', { sessionKey: 'agent:main:test' })
  assert.equal(client._pending.size, 1)
  client.disconnect()
  await assert.rejects(promise, /连接已断开/)
  assert.equal(client._pending.size, 0)
})
