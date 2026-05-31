/**
 * 星枢聊天室
 * 售卖版独立聊天室：多房间、管理面板、本地持久化、可连接服务器 WebSocket。
 */

const STORAGE_KEY = 'xingshu_chat_state_v1'
const DEFAULT_SERVER = 'wss://www.aiyu.jx.cn/xingshu-chat'
const ADMIN_PASS = '2552667173'

const ROOMS = [
  { id: 'lobby', name: '星枢大厅', icon: '✨', desc: '所有用户默认大厅，适合公告、交流和新手接待', level: '公开' },
  { id: 'support', name: '售后支持', icon: '🛠️', desc: '卡密、安装、启动失败、更新问题集中处理', level: '公开' },
  { id: 'vip', name: 'VIP 贵宾室', icon: '💎', desc: '售卖版用户专属服务与优先响应', level: '会员' },
  { id: 'ai', name: 'AI 协同室', icon: '🤖', desc: 'OpenClaw / Hermes / 模型配置讨论', level: '公开' },
  { id: 'movie', name: '影视资源室', icon: '🎬', desc: '影视源、直播源、播放器体验反馈', level: '公开' },
  { id: 'music', name: '音乐交流室', icon: '🎵', desc: '音乐播放器、歌单、下载体验交流', level: '公开' },
  { id: 'dev', name: '开发者房间', icon: '🧑‍💻', desc: '二开、插件、接口、部署与问题排查', level: '开发' },
  { id: 'ops', name: '服务器运维', icon: '🛰️', desc: '远程实例、服务器、网关和网络状态', level: '管理' },
  { id: 'admin', name: '管理控制室', icon: '👑', desc: '公告、禁言、清屏、导出、房间治理', level: '管理员' },
]

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]))
}

function formatMessageText(text) {
  const safe = esc(text)
  return safe.replace(/(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi, (raw) => {
    const href = raw.startsWith('www.') ? `https://${raw}` : raw
    return `<a class="xs-link" href="${href}" target="_blank" rel="noopener noreferrer">${raw}</a>`
  })
}

function nowTime() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })
}

function getValidRoomId(roomId) {
  return ROOMS.some(room => room.id === roomId) ? roomId : 'lobby'
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return {
      activeRoom: getValidRoomId(saved.activeRoom),
      nickname: saved.nickname || '星枢用户',
      serverUrl: saved.serverUrl || DEFAULT_SERVER,
      admin: !!saved.admin,
      muted: !!saved.muted,
      messages: saved.messages || seedMessages(),
      bannedWords: saved.bannedWords || ['广告刷屏', '恶意辱骂'],
      announcement: saved.announcement || '欢迎来到星枢聊天室。请文明交流，售后问题请进入「售后支持」。',
    }
  } catch {
    return { activeRoom: 'lobby', nickname: '星枢用户', serverUrl: DEFAULT_SERVER, admin: false, muted: false, messages: seedMessages(), bannedWords: ['广告刷屏', '恶意辱骂'], announcement: '欢迎来到星枢聊天室。', }
  }
}

function seedMessages() {
  return {
    lobby: [{ id: crypto.randomUUID(), system: true, user: '系统', text: '星枢聊天室已就绪：多房间、公告、禁言、清屏、导出、服务器连接预留全部启用。', time: nowTime() }],
    support: [{ id: crypto.randomUUID(), system: true, user: '客服助手', text: '这里处理卡密、安装包、启动失败、更新失败等问题。', time: nowTime() }],
    vip: [{ id: crypto.randomUUID(), system: true, user: 'VIP 管家', text: 'VIP 房间已开启，管理员可发布专属公告。', time: nowTime() }],
    ai: [], movie: [], music: [], dev: [], ops: [], admin: []
  }
}

let state = loadState()
let socket = null
let socketStatus = '离线'
let rootEl = null

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function addMessage(roomId, msg) {
  const room = roomId || state.activeRoom
  if (!state.messages[room]) state.messages[room] = []
  state.messages[room].push({ id: crypto.randomUUID(), time: nowTime(), ...msg })
  if (state.messages[room].length > 500) state.messages[room] = state.messages[room].slice(-500)
  saveState()
  render(rootEl)
}

function renderRooms() {
  return ROOMS.map(room => `
    <button class="xs-room ${state.activeRoom === room.id ? 'active' : ''}" data-room="${room.id}">
      <span class="xs-room-icon">${room.icon}</span>
      <span class="xs-room-main"><b>${esc(room.name)}</b><small>${esc(room.desc)}</small></span>
      <span class="xs-room-level">${esc(room.level)}</span>
    </button>`).join('')
}

function renderMessages() {
  const list = state.messages[state.activeRoom] || []
  if (!list.length) return '<div class="xs-empty">这个房间还没有消息，发第一条吧。</div>'
  return list.map(m => `
    <div class="xs-msg ${m.system ? 'system' : ''}">
      <div class="xs-avatar">${m.system ? '★' : esc((m.user || '?').slice(0, 1))}</div>
      <div class="xs-bubble">
        <div class="xs-meta"><b>${esc(m.user)}</b><span>${esc(m.time)}</span>${m.role ? `<em>${esc(m.role)}</em>` : ''}</div>
        <div class="xs-text">${formatMessageText(m.text)}</div>
      </div>
      ${state.admin && !m.system ? `<button class="xs-mini danger" data-del="${m.id}">删除</button>` : ''}
    </div>`).join('')
}

function activeRoom() {
  return ROOMS.find(r => r.id === state.activeRoom) || ROOMS[0]
}

function renderAdminPanel() {
  return `
    <div class="xs-admin-card">
      <div class="xs-card-title">👑 管理权限</div>
      ${state.admin ? `
        <div class="xs-admin-grid">
          <button class="xs-btn" data-action="announce">编辑公告</button>
          <button class="xs-btn danger" data-action="delete-announcement">删除公告</button>
          <button class="xs-btn" data-action="mute">${state.muted ? '解除全员禁言' : '全员禁言'}</button>
          <button class="xs-btn danger" data-action="clear-room">清空当前房间</button>
          <button class="xs-btn" data-action="export">导出聊天记录</button>
        </div>
        <label class="xs-label">违禁词管理</label>
        <input class="xs-input" id="xs-banned" value="${esc(state.bannedWords.join('，'))}" />
        <button class="xs-btn full" data-action="save-banned">保存违禁词</button>
      ` : `
        <div class="xs-muted">输入管理密码解锁公告、禁言、清屏、删消息、导出等权限。</div>
        <input class="xs-input" id="xs-admin-pass" type="password" placeholder="管理密码" />
        <button class="xs-btn full" data-action="admin-login">解锁管理面板</button>
      `}
    </div>`
}

function render(el) {
  if (!el) return
  rootEl = el
  const room = activeRoom()
  const ann = state.announcement
    ? `<div class="xs-announcement">📢 ${formatMessageText(state.announcement)}</div>`
    : `<div class="xs-announcement muted">📢 当前暂无公告</div>`

  el.innerHTML = `
    <div class="xingshu-chat-page">
      <div class="xs-hero">
        <div>
          <div class="xs-eyebrow">售卖版 · 独立聊天室</div>
          <h1>星枢聊天室</h1>
          <p>多房间、管理员控制、公告、禁言、清屏、导出、本地持久化，默认通过域名 WSS 安全中继连接。</p>
        </div>
        <div class="xs-hero-actions">
          <span class="xs-status ${socketStatus === '在线' ? 'online' : ''}">${socketStatus}</span>
          <button class="xs-btn glow" data-action="open-window">打开独立窗口</button>
        </div>
      </div>
      <div class="xs-layout">
        <aside class="xs-sidebar">
          <div class="xs-profile">
            <label class="xs-label">昵称</label>
            <input id="xs-nick" class="xs-input" value="${esc(state.nickname)}" />
            <label class="xs-label">服务器地址</label>
            <input id="xs-server" class="xs-input" value="${esc(state.serverUrl)}" />
            <button class="xs-btn full" data-action="connect">连接服务器</button>
          </div>
          <div class="xs-section-title">房间列表</div>
          <div class="xs-room-list">${renderRooms()}</div>
        </aside>
        <main class="xs-main">
          <div class="xs-room-header"><div><h2>${room.icon} ${esc(room.name)}</h2><p>${esc(room.desc)}</p></div><span>${esc(room.level)}</span></div>
          ${ann}
          <div class="xs-messages" id="xs-messages">${renderMessages()}</div>
          <div class="xs-compose">
            <input id="xs-message" class="xs-input" placeholder="输入消息，Enter 发送..." ${state.muted && !state.admin ? 'disabled' : ''} />
            <button class="xs-btn glow" data-action="send" ${state.muted && !state.admin ? 'disabled' : ''}>发送</button>
          </div>
        </main>
        <aside class="xs-tools">
          <div class="xs-card"><div class="xs-card-title">房间能力</div>
            <ul class="xs-feature-list"><li>全房间实时消息</li><li>本地历史记录</li><li>服务器 WebSocket 预留</li><li>房间级清屏/导出</li><li>敏感词拦截</li><li>管理员删消息</li></ul>
          </div>
          ${renderAdminPanel()}
        </aside>
      </div>
    </div>`
  wireEvents(el)
  setTimeout(() => document.getElementById('xs-messages')?.scrollTo({ top: 999999 }), 0)
}

function wireEvents(el) {
  el.querySelectorAll('[data-room]').forEach(btn => btn.onclick = () => { state.activeRoom = getValidRoomId(btn.dataset.room); saveState(); render(el) })
  const nick = el.querySelector('#xs-nick')
  if (nick) nick.onchange = () => { state.nickname = nick.value.trim() || '星枢用户'; saveState() }
  const server = el.querySelector('#xs-server')
  if (server) server.onchange = () => { state.serverUrl = server.value.trim() || DEFAULT_SERVER; saveState() }
  const msg = el.querySelector('#xs-message')
  if (msg) msg.onkeydown = e => { if (e.key === 'Enter') sendMessage() }
  el.querySelectorAll('[data-action]').forEach(btn => btn.onclick = () => handleAction(btn.dataset.action))
  el.querySelectorAll('[data-del]').forEach(btn => btn.onclick = () => {
    const arr = state.messages[state.activeRoom] || []
    state.messages[state.activeRoom] = arr.filter(m => m.id !== btn.dataset.del)
    saveState(); render(el)
  })
}

async function handleAction(action) {
  if (action === 'send') return sendMessage()
  if (action === 'connect') return connectServer()
  if (action === 'open-window') return openStandalone()
  if (action === 'admin-login') {
    const pass = document.getElementById('xs-admin-pass')?.value
    if (pass === ADMIN_PASS) { state.admin = true; saveState(); addMessage('admin', { system: true, user: '系统', text: '管理员权限已解锁。' }) }
    else alert('管理密码错误')
  }
  if (!state.admin) return alert('需要管理员权限')
  if (action === 'announce') {
    const text = prompt('输入新公告', state.announcement)
    if (text !== null) { state.announcement = text.trim(); saveState(); addMessage(state.activeRoom, { system: true, user: '公告', text: state.announcement || '管理员已删除公告。' }) }
  }
  if (action === 'delete-announcement') {
    if (confirm('确定删除当前公告？')) { state.announcement = ''; saveState(); addMessage(state.activeRoom, { system: true, user: '公告', text: '管理员已删除公告。' }) }
  }
  if (action === 'mute') { state.muted = !state.muted; saveState(); addMessage(state.activeRoom, { system: true, user: '管理', text: state.muted ? '已开启全员禁言。' : '已解除全员禁言。' }) }
  if (action === 'clear-room') { if (confirm('确定清空当前房间？')) { state.messages[state.activeRoom] = []; saveState(); render(rootEl) } }
  if (action === 'export') exportMessages()
  if (action === 'save-banned') { state.bannedWords = (document.getElementById('xs-banned')?.value || '').split(/[，,]/).map(s => s.trim()).filter(Boolean); saveState(); alert('已保存') }
}

function sendMessage() {
  const input = document.getElementById('xs-message')
  const text = input?.value?.trim()
  if (!text) return
  if (state.muted && !state.admin) return alert('当前已开启全员禁言')
  const hit = state.bannedWords.find(w => w && text.includes(w))
  if (hit) return alert(`消息包含违禁词：${hit}`)
  const payload = { room: state.activeRoom, user: state.nickname, text, time: nowTime() }
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload))
  addMessage(state.activeRoom, { user: state.nickname, role: state.admin ? '管理员' : '用户', text })
  input.value = ''
}

function connectServer() {
  try { if (socket) socket.close() } catch {}
  socketStatus = '连接中'; render(rootEl)
  try {
    socket = new WebSocket(state.serverUrl || DEFAULT_SERVER)
    socket.onopen = () => { socketStatus = '在线'; addMessage(state.activeRoom, { system: true, user: '服务器', text: '已连接星枢服务器。' }) }
    socket.onmessage = ev => {
      try { const m = JSON.parse(ev.data); addMessage(m.room || state.activeRoom, { user: m.user || '远程用户', text: m.text || ev.data }) }
      catch { addMessage(state.activeRoom, { user: '服务器', text: ev.data }) }
    }
    socket.onerror = () => { socketStatus = '离线'; addMessage(state.activeRoom, { system: true, user: '服务器', text: '服务器暂未响应，已切换本地聊天室模式。' }) }
    socket.onclose = () => { socketStatus = '离线'; render(rootEl) }
  } catch (e) {
    socketStatus = '离线'; addMessage(state.activeRoom, { system: true, user: '服务器', text: `连接失败：${e.message}` })
  }
}

async function openStandalone() {
  try {
    const { api } = await import('../lib/tauri-api.js')
    await api.openXingshuChatWindow()
  } catch {
    window.open(`${location.origin}${location.pathname}#/xingshu-chat?window=1`, '_blank', 'width=1280,height=820')
  }
}

function exportMessages() {
  const room = activeRoom()
  const data = (state.messages[state.activeRoom] || []).map(m => `[${m.time}] ${m.user}: ${m.text}`).join('\n')
  const blob = new Blob([data], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `星枢聊天室-${room.name}-${Date.now()}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

export { render }
export default { render }
