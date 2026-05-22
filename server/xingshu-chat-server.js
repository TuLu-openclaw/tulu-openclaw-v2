#!/usr/bin/env node
/**
 * 星枢聊天室 WebSocket 服务端
 * 默认监听 18888，避免占用 OpenClaw Gateway 18789。
 * 启动：node server/xingshu-chat-server.js
 */
import http from 'node:http'
import crypto from 'node:crypto'

const PORT = Number(process.env.XINGSHU_CHAT_PORT || 18888)
const HOST = process.env.XINGSHU_CHAT_HOST || '0.0.0.0'
const clients = new Map()

function acceptKey(key) {
  return crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64')
}

function encodeFrame(text) {
  const payload = Buffer.from(text)
  const len = payload.length
  if (len < 126) return Buffer.concat([Buffer.from([0x81, len]), payload])
  if (len < 65536) {
    const h = Buffer.alloc(4)
    h[0] = 0x81; h[1] = 126; h.writeUInt16BE(len, 2)
    return Buffer.concat([h, payload])
  }
  const h = Buffer.alloc(10)
  h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2)
  return Buffer.concat([h, payload])
}

function decodeFrames(buffer) {
  const out = []
  let offset = 0
  while (offset + 2 <= buffer.length) {
    const b1 = buffer[offset]
    const b2 = buffer[offset + 1]
    const opcode = b1 & 0x0f
    let len = b2 & 0x7f
    let pos = offset + 2
    if (len === 126) { if (pos + 2 > buffer.length) break; len = buffer.readUInt16BE(pos); pos += 2 }
    else if (len === 127) { if (pos + 8 > buffer.length) break; len = Number(buffer.readBigUInt64BE(pos)); pos += 8 }
    const masked = !!(b2 & 0x80)
    let mask = null
    if (masked) { if (pos + 4 > buffer.length) break; mask = buffer.subarray(pos, pos + 4); pos += 4 }
    if (pos + len > buffer.length) break
    const payload = Buffer.from(buffer.subarray(pos, pos + len))
    if (masked && mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4]
    offset = pos + len
    if (opcode === 0x8) out.push({ type: 'close' })
    else if (opcode === 0x9) out.push({ type: 'ping', payload })
    else if (opcode === 0x1) out.push({ type: 'text', text: payload.toString('utf8') })
  }
  return out
}

function send(socket, data) {
  if (!socket.destroyed) socket.write(encodeFrame(JSON.stringify(data)))
}

function broadcast(data, except = null) {
  for (const c of clients.values()) {
    if (c.socket !== except) send(c.socket, data)
  }
}

function onlinePayload() {
  const now = Date.now()
  const users = [...clients.values()].map(c => ({
    id: c.id,
    nick: c.nick || '星枢用户',
    room: c.room || 'lobby',
    role: c.role || 'user',
    last: now
  }))
  return { type: 'online', total: users.length, users }
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, service: 'xingshu-chat', port: PORT, online: clients.size }))
    return
  }
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('XingShu Chat WebSocket Server. Use ws://HOST:18888/xingshu-chat')
})

server.on('upgrade', (req, socket) => {
  if (!req.url.startsWith('/xingshu-chat')) return socket.destroy()
  const key = req.headers['sec-websocket-key']
  if (!key) return socket.destroy()
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey(key)}`,
    '', ''
  ].join('\r\n'))

  const id = crypto.randomUUID()
  const client = { id, socket, nick: '星枢用户', room: 'lobby', role: 'user' }
  clients.set(id, client)
  send(socket, { type: 'hello', clientId: id, port: PORT })
  broadcast(onlinePayload())

  socket.on('data', chunk => {
    for (const frame of decodeFrames(chunk)) {
      if (frame.type === 'close') return socket.destroy()
      if (frame.type !== 'text') continue
      let msg
      try { msg = JSON.parse(frame.text) } catch { continue }
      if (msg.type === 'presence') {
        client.nick = msg.nick || client.nick
        client.room = msg.room || client.room
        client.role = msg.role || client.role
        broadcast(onlinePayload())
      } else if (msg.type === 'message') {
        const m = msg.message || {}
        broadcast({ type: 'message', message: { ...m, user: m.user || client.nick, role: m.role || client.role } })
      } else if (msg.type === 'kick') {
        const target = msg.target
        broadcast({ type: 'kick', target })
      }
    }
  })
  socket.on('close', () => { clients.delete(id); broadcast(onlinePayload()) })
  socket.on('error', () => { clients.delete(id); broadcast(onlinePayload()) })
})

server.listen(PORT, HOST, () => {
  console.log(`[xingshu-chat] listening on ws://${HOST}:${PORT}/xingshu-chat`)
  console.log('[xingshu-chat] health:', `http://${HOST}:${PORT}/health`)
})
