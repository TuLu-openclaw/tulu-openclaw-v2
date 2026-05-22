#!/usr/bin/env node
/**
 * 星枢聊天室 WebSocket + 文件服务端
 * - 默认仅监听 127.0.0.1:18888，由 Nginx 通过 WSS 反向代理，避免源站端口暴露
 * - 支持远程多人在线聊天、在线人数广播、文件/图片上传下载
 * - 文件写入磁盘，不常驻内存；默认单文件 20MB，默认 7 天自动清理
 *
 * 启动：npm run chat-server
 * 环境变量：
 *   XINGSHU_CHAT_PORT=18888
 *   XINGSHU_CHAT_HOST=127.0.0.1
 *   XINGSHU_CHAT_MAX_UPLOAD_MB=20
 *   XINGSHU_CHAT_RETENTION_DAYS=7
 *   XINGSHU_CHAT_UPLOAD_DIR=/data/xingshu-chat-uploads
 */
import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.XINGSHU_CHAT_PORT || 18888)
const HOST = process.env.XINGSHU_CHAT_HOST || '127.0.0.1'
const MAX_UPLOAD_MB = Number(process.env.XINGSHU_CHAT_MAX_UPLOAD_MB || 20)
const MAX_UPLOAD_BYTES = Math.max(1, MAX_UPLOAD_MB) * 1024 * 1024
const RETENTION_DAYS = Number(process.env.XINGSHU_CHAT_RETENTION_DAYS || 7)
const RETENTION_MS = Math.max(1, RETENTION_DAYS) * 24 * 60 * 60 * 1000
const UPLOAD_DIR = process.env.XINGSHU_CHAT_UPLOAD_DIR || path.join(__dirname, '..', 'runtime', 'xingshu-chat-uploads')
const SETTINGS_FILE = process.env.XINGSHU_CHAT_SETTINGS_FILE || path.join(UPLOAD_DIR, 'settings.json')
const ADMIN_PASS = process.env.XINGSHU_CHAT_ADMIN_PASS || '2552667173'
const DEV_PASS = process.env.XINGSHU_CHAT_DEV_PASS || '2552667173'
const clients = new Map()
const defaultSettings = {
  uploadEnabled: true,
  globalMute: false,
  roomMute: {},
  announcement: '欢迎来到星枢聊天室。请文明交流，售后问题进入「售后支持」。',
  roleByNick: {},
  fakeTotalOnline: null,
  fakeRoomOnline: {}
}
let settings = { ...defaultSettings }

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) settings = { ...defaultSettings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) }
  } catch (e) {
    console.warn('[xingshu-chat] failed to load settings:', e.message)
  }
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true })
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2))
  } catch (e) {
    console.warn('[xingshu-chat] failed to save settings:', e.message)
  }
}

fs.mkdirSync(UPLOAD_DIR, { recursive: true })
loadSettings()

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
}

function json(res, code, data) {
  cors(res)
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

function safeName(name = 'file') {
  const base = path.basename(String(name)).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 120)
  return base || 'file'
}

function safeHeaderName(name = 'file') {
  return safeName(name).replace(/[\r\n\"]/g, '_')
}

function contentType(name, fallback = 'application/octet-stream') {
  const ext = path.extname(name).toLowerCase()
  return {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8', '.pdf': 'application/pdf', '.zip': 'application/zip',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm'
  }[ext] || fallback
}

function cleanupUploads() {
  const now = Date.now()
  let removed = 0
  for (const file of fs.readdirSync(UPLOAD_DIR, { withFileTypes: true })) {
    if (!file.isFile()) continue
    const full = path.join(UPLOAD_DIR, file.name)
    try {
      const st = fs.statSync(full)
      if (now - st.mtimeMs > RETENTION_MS) {
        fs.unlinkSync(full)
        removed++
      }
    } catch {}
  }
  if (removed) console.log(`[xingshu-chat] cleanup removed ${removed} expired files`)
}
cleanupUploads()
setInterval(cleanupUploads, 24 * 60 * 60 * 1000).unref()

function acceptKey(key) {
  return crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
}

function encodeFrame(text) {
  const payload = Buffer.from(text)
  const len = payload.length
  if (len < 126) return Buffer.concat([Buffer.from([0x81, len]), payload])
  if (len < 65536) {
    const h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(len, 2)
    return Buffer.concat([h, payload])
  }
  const h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2)
  return Buffer.concat([h, payload])
}

function decodeFrameBatch(buffer) {
  const out = []
  let offset = 0
  while (offset + 2 <= buffer.length) {
    const b1 = buffer[offset], b2 = buffer[offset + 1]
    const opcode = b1 & 0x0f
    let len = b2 & 0x7f
    let pos = offset + 2
    if (len === 126) { if (pos + 2 > buffer.length) break; len = buffer.readUInt16BE(pos); pos += 2 }
    else if (len === 127) { if (pos + 8 > buffer.length) break; len = Number(buffer.readBigUInt64BE(pos)); pos += 8 }
    if (len > MAX_UPLOAD_BYTES * 2) { offset = buffer.length; break }
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
  return { frames: out, rest: buffer.subarray(offset) }
}

function send(socket, data) {
  if (!socket.destroyed) socket.write(encodeFrame(JSON.stringify(data)))
}

function broadcast(data, except = null) {
  for (const c of clients.values()) if (c.socket !== except) send(c.socket, data)
}

function publicSettings() {
  return {
    uploadEnabled: settings.uploadEnabled,
    globalMute: settings.globalMute,
    roomMute: settings.roomMute || {},
    announcement: settings.announcement || '',
    fakeTotalOnline: settings.fakeTotalOnline,
    fakeRoomOnline: settings.fakeRoomOnline || {}
  }
}

function effectiveRole(client) {
  if (client.role === 'developer') return 'developer'
  const byNick = settings.roleByNick?.[client.nick]
  if (byNick === 'developer' || byNick === 'admin' || byNick === 'user') return byNick
  return client.role === 'admin' ? 'admin' : 'user'
}

function canAdmin(client) {
  return effectiveRole(client) === 'admin' || effectiveRole(client) === 'developer'
}

function canDev(client) {
  return effectiveRole(client) === 'developer'
}

function onlinePayload() {
  const now = Date.now()
  const users = [...clients.values()].map(c => ({ id: c.id, nick: c.nick || '星枢用户', room: c.room || 'lobby', role: effectiveRole(c), last: now }))
  const realTotal = users.length
  const roomCounts = {}
  for (const u of users) roomCounts[u.room] = (roomCounts[u.room] || 0) + 1
  const displayRoomCounts = { ...roomCounts, ...(settings.fakeRoomOnline || {}) }
  return { type: 'online', total: realTotal, displayTotal: Number.isFinite(Number(settings.fakeTotalOnline)) ? Number(settings.fakeTotalOnline) : realTotal, roomCounts, displayRoomCounts, users, settings: publicSettings() }
}

async function readLimitedJson(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_UPLOAD_BYTES * 1.45 + 4096) throw new Error(`上传过大，限制 ${MAX_UPLOAD_MB}MB`)
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

async function handleUpload(req, res) {
  if (!settings.uploadEnabled) return json(res, 403, { ok: false, error: '管理员已关闭文件/图片上传' })
  try {
    const body = await readLimitedJson(req)
    const originalName = safeName(body.name || 'file')
    const mime = String(body.mime || contentType(originalName))
    const base64 = String(body.data || '').replace(/^data:[^,]+,/, '')
    const buffer = Buffer.from(base64, 'base64')
    if (!buffer.length) return json(res, 400, { ok: false, error: '空文件' })
    if (buffer.length > MAX_UPLOAD_BYTES) return json(res, 413, { ok: false, error: `文件超过 ${MAX_UPLOAD_MB}MB 限制` })
    const ext = path.extname(originalName)
    const stored = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${originalName || `file${ext || '.bin'}`}`
    const full = path.join(UPLOAD_DIR, stored)
    fs.writeFileSync(full, buffer)
    const file = { id: stored, name: originalName, size: buffer.length, mime, url: `/files/${encodeURIComponent(stored)}`, downloadUrl: `/download/${encodeURIComponent(stored)}`, uploadedAt: Date.now(), expiresInDays: RETENTION_DAYS }
    json(res, 200, { ok: true, file })
  } catch (e) {
    json(res, 400, { ok: false, error: e.message || String(e) })
  }
}

const server = http.createServer(async (req, res) => {
  cors(res)
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  if (url.pathname === '/health') return json(res, 200, { ok: true, service: 'xingshu-chat', online: clients.size, maxUploadMb: MAX_UPLOAD_MB, retentionDays: RETENTION_DAYS, settings: publicSettings() })
  if (url.pathname === '/upload' && req.method === 'POST') return handleUpload(req, res)
  if (url.pathname.startsWith('/files/') || url.pathname.startsWith('/download/')) {
    const isDownload = url.pathname.startsWith('/download/') || url.searchParams.get('download') === '1'
    const prefix = isDownload && url.pathname.startsWith('/download/') ? '/download/' : '/files/'
    const id = path.basename(decodeURIComponent(url.pathname.slice(prefix.length)))
    const full = path.join(UPLOAD_DIR, id)
    if (!fs.existsSync(full)) return json(res, 404, { ok: false, error: '文件不存在或已过期清理' })
    const name = safeHeaderName(id.replace(/^\d+-[a-f0-9]+-/, '') || id)
    res.writeHead(200, {
      'content-type': contentType(name),
      'content-disposition': `${isDownload ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`,
      'cache-control': 'public, max-age=86400',
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff'
    })
    fs.createReadStream(full).pipe(res)
    return
  }
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('XingShu Chat Server\n')
})

server.on('upgrade', (req, socket) => {
  if (!req.url.startsWith('/xingshu-chat')) return socket.destroy()
  const key = req.headers['sec-websocket-key']
  if (!key) return socket.destroy()
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${acceptKey(key)}`, '', ''].join('\r\n'))

  const id = crypto.randomUUID()
  const client = { id, socket, nick: '星枢用户', room: 'lobby', role: 'user', buffer: Buffer.alloc(0) }
  clients.set(id, client)
  send(socket, { type: 'hello', clientId: id, maxUploadMb: MAX_UPLOAD_MB, retentionDays: RETENTION_DAYS, role: effectiveRole(client), settings: publicSettings() })
  broadcast(onlinePayload())

  socket.on('data', chunk => {
    client.buffer = Buffer.concat([client.buffer, chunk])
    const decoded = decodeFrameBatch(client.buffer)
    client.buffer = decoded.rest
    for (const frame of decoded.frames) {
      if (frame.type === 'close') return socket.destroy()
      if (frame.type !== 'text') continue
      let msg
      try { msg = JSON.parse(frame.text) } catch { continue }
      if (msg.type === 'presence') {
        client.nick = String(msg.nick || client.nick).slice(0, 40)
        client.room = String(msg.room || client.room).slice(0, 40)
        client.role = effectiveRole(client)
        send(socket, { type: 'role', role: effectiveRole(client), settings: publicSettings() })
        broadcast(onlinePayload())
      } else if (msg.type === 'auth') {
        const want = msg.want === 'developer' ? 'developer' : 'admin'
        if (want === 'developer' && msg.password === DEV_PASS) client.role = 'developer'
        else if (msg.password === ADMIN_PASS) client.role = 'admin'
        else return send(socket, { type: 'error', error: '密码错误' })
        send(socket, { type: 'role', role: effectiveRole(client), settings: publicSettings(), roleByNick: canDev(client) ? settings.roleByNick : undefined })
        broadcast(onlinePayload())
      } else if (msg.type === 'message') {
        if ((settings.globalMute || settings.roomMute?.[client.room]) && !canAdmin(client)) return send(socket, { type: 'error', error: '当前已禁言' })
        const m = msg.message || {}
        broadcast({ type: 'message', message: { ...m, room: m.room || client.room, user: client.nick, role: effectiveRole(client) } }, socket)
      } else if (msg.type === 'settings-update') {
        if (!canAdmin(client)) return send(socket, { type: 'error', error: '权限不足' })
        if (typeof msg.uploadEnabled === 'boolean') settings.uploadEnabled = msg.uploadEnabled
        if (typeof msg.globalMute === 'boolean') settings.globalMute = msg.globalMute
        if (msg.roomMute && typeof msg.roomMute === 'object') settings.roomMute = { ...settings.roomMute, ...msg.roomMute }
        if (typeof msg.announcement === 'string') settings.announcement = msg.announcement.slice(0, 500)
        if (canDev(client)) {
          if (msg.roleByNick && typeof msg.roleByNick === 'object') settings.roleByNick = { ...settings.roleByNick, ...msg.roleByNick }
          if (Object.prototype.hasOwnProperty.call(msg, 'fakeTotalOnline')) settings.fakeTotalOnline = msg.fakeTotalOnline === null || msg.fakeTotalOnline === '' ? null : Number(msg.fakeTotalOnline)
          if (msg.fakeRoomOnline && typeof msg.fakeRoomOnline === 'object') settings.fakeRoomOnline = { ...settings.fakeRoomOnline, ...msg.fakeRoomOnline }
        }
        saveSettings()
        broadcast({ type: 'settings', settings: publicSettings(), roleByNick: canDev(client) ? settings.roleByNick : undefined })
        send(socket, { type: 'settings', settings: publicSettings(), roleByNick: canDev(client) ? settings.roleByNick : undefined })
        broadcast(onlinePayload())
      } else if (msg.type === 'kick') {
        if (canAdmin(client)) broadcast({ type: 'kick', target: msg.target })
      }
    }
  })
  socket.on('close', () => { clients.delete(id); broadcast(onlinePayload()) })
  socket.on('error', () => { clients.delete(id); broadcast(onlinePayload()) })
})

server.listen(PORT, HOST, () => {
  console.log('[xingshu-chat] listening')
  console.log(`[xingshu-chat] upload max ${MAX_UPLOAD_MB}MB, retention ${RETENTION_DAYS} days, dir ${UPLOAD_DIR}`)
})
