import { t } from '../lib/i18n.js'

/**
 * 星枢聊天室
 * 售卖版独立聊天室：多房间、管理面板、本地持久化、可连接服务器 WebSocket。
 */

const STORAGE_KEY = 'xingshu_chat_state_v1'
const DEFAULT_SERVER = 'wss://www.aiyu.jx.cn/xingshu-chat'
const ADMIN_PASS = '2552667173'

const ROOMS = [
  { id: 'lobby', nameKey: 'roomLobbyName', icon: '✨', descKey: 'roomLobbyDesc', levelKey: 'levelPublic' },
  { id: 'support', nameKey: 'roomSupportName', icon: '🛠️', descKey: 'roomSupportDesc', levelKey: 'levelPublic' },
  { id: 'vip', nameKey: 'roomVipName', icon: '💎', descKey: 'roomVipDesc', levelKey: 'levelMember' },
  { id: 'ai', nameKey: 'roomAiName', icon: '🤖', descKey: 'roomAiDesc', levelKey: 'levelPublic' },
  { id: 'movie', nameKey: 'roomMovieName', icon: '🎬', descKey: 'roomMovieDesc', levelKey: 'levelPublic' },
  { id: 'music', nameKey: 'roomMusicName', icon: '🎵', descKey: 'roomMusicDesc', levelKey: 'levelPublic' },
  { id: 'dev', nameKey: 'roomDevName', icon: '🧑‍💻', descKey: 'roomDevDesc', levelKey: 'levelDev' },
  { id: 'ops', nameKey: 'roomOpsName', icon: '🛰️', descKey: 'roomOpsDesc', levelKey: 'levelAdmin' },
  { id: 'admin', nameKey: 'roomAdminName', icon: '👑', descKey: 'roomAdminDesc', levelKey: 'levelAdministrator' },
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
  return new Date().toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit' })
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizeBannedWords(value) {
  if (!Array.isArray(value)) return [t('xingshuChat.defaultBannedAd'), t('xingshuChat.defaultBannedAbuse')]
  return value.map(word => String(word || '').trim()).filter(Boolean)
}

function normalizeMessages(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return seedMessages()
  return ROOMS.reduce((acc, room) => {
    const list = Array.isArray(value[room.id]) ? value[room.id] : []
    acc[room.id] = list
      .filter(item => item && typeof item === 'object')
      .slice(-500)
      .map(item => ({
        id: item.id || createId(),
        time: item.time || nowTime(),
        user: item.user || t('xingshuChat.userFallback'),
        text: String(item.text ?? ''),
        system: !!item.system,
        role: item.role || '',
      }))
    return acc
  }, {})
}

function getValidRoomId(roomId) {
  return ROOMS.some(room => room.id === roomId) ? roomId : 'lobby'
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return {
      activeRoom: getValidRoomId(saved.activeRoom),
      nickname: String(saved.nickname || t('xingshuChat.defaultNickname')),
      serverUrl: String(saved.serverUrl || DEFAULT_SERVER),
      admin: !!saved.admin,
      muted: !!saved.muted,
      messages: normalizeMessages(saved.messages),
      bannedWords: normalizeBannedWords(saved.bannedWords),
      announcement: String(saved.announcement || t('xingshuChat.defaultAnnouncementLong')),
    }
  } catch {
    return { activeRoom: 'lobby', nickname: t('xingshuChat.defaultNickname'), serverUrl: DEFAULT_SERVER, admin: false, muted: false, messages: seedMessages(), bannedWords: [t('xingshuChat.defaultBannedAd'), t('xingshuChat.defaultBannedAbuse')], announcement: t('xingshuChat.defaultAnnouncement'), }
  }
}

function seedMessages() {
  return {
    lobby: [{ id: createId(), system: true, user: t('xingshuChat.systemUser'), text: t('xingshuChat.seedLobby'), time: nowTime() }],
    support: [{ id: createId(), system: true, user: t('xingshuChat.supportBot'), text: t('xingshuChat.seedSupport'), time: nowTime() }],
    vip: [{ id: createId(), system: true, user: t('xingshuChat.vipButler'), text: t('xingshuChat.seedVip'), time: nowTime() }],
    ai: [], movie: [], music: [], dev: [], ops: [], admin: []
  }
}

let state = loadState()
let socket = null
let socketStatus = 'offline'
let rootEl = null

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function sendPresence() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  socket.send(JSON.stringify({ type: 'presence', nick: state.nickname, room: state.activeRoom }))
}

function normalizeServerError(error) {
  const text = String(error || '').trim()
  const known = {
    '密码错误': t('xingshuChat.serverErrorBadPassword'),
    '当前已禁言': t('xingshuChat.serverErrorMuted'),
    '权限不足': t('xingshuChat.serverErrorPermission'),
    'permission denied': t('xingshuChat.serverErrorPermission'),
  }
  return known[text] || text || t('xingshuChat.serverUnknownError')
}

function handleServerEvent(event) {
  if (!event || typeof event !== 'object') return false
  if (event.type === 'hello') {
    sendPresence()
    return true
  }
  if (event.type === 'message') {
    const m = event.message || {}
    addMessage(getValidRoomId(m.room || state.activeRoom), { user: m.user || t('xingshuChat.remoteUser'), role: m.role || '', text: m.text || '' })
    return true
  }
  if (event.type === 'error') {
    addMessage(state.activeRoom, { system: true, user: t('xingshuChat.serverUser'), text: normalizeServerError(event.error) })
    return true
  }
  if (event.type === 'settings') {
    const ann = event.settings?.announcement
    if (typeof ann === 'string') {
      state.announcement = ann
      saveState()
      render(rootEl)
    }
    return true
  }
  if (event.type === 'role' || event.type === 'online' || event.type === 'kick') return true
  return false
}

function addMessage(roomId, msg) {
  const room = roomId || state.activeRoom
  if (!state.messages[room]) state.messages[room] = []
  state.messages[room].push({ id: createId(), time: nowTime(), ...msg })
  if (state.messages[room].length > 500) state.messages[room] = state.messages[room].slice(-500)
  saveState()
  render(rootEl)
}

function renderRooms() {
  return ROOMS.map(room => `
    <button class="xs-room ${state.activeRoom === room.id ? 'active' : ''}" data-room="${room.id}">
      <span class="xs-room-icon">${room.icon}</span>
      <span class="xs-room-main"><b>${esc(t(`xingshuChat.${room.nameKey}`))}</b><small>${esc(t(`xingshuChat.${room.descKey}`))}</small></span>
      <span class="xs-room-level">${esc(t(`xingshuChat.${room.levelKey}`))}</span>
    </button>`).join('')
}

function renderMessages() {
  const list = state.messages[state.activeRoom] || []
  if (!list.length) return `<div class="xs-empty">${esc(t('xingshuChat.emptyRoom'))}</div>`
  return list.map(m => `
    <div class="xs-msg ${m.system ? 'system' : ''}">
      <div class="xs-avatar">${m.system ? '★' : esc((m.user || '?').slice(0, 1))}</div>
      <div class="xs-bubble">
        <div class="xs-meta"><b>${esc(m.user)}</b><span>${esc(m.time)}</span>${m.role ? `<em>${esc(m.role)}</em>` : ''}</div>
        <div class="xs-text">${formatMessageText(m.text)}</div>
      </div>
      ${state.admin && !m.system ? `<button class="xs-mini danger" data-del="${m.id}">${esc(t('xingshuChat.deleteMessage'))}</button>` : ''}
    </div>`).join('')
}

function activeRoom() {
  return ROOMS.find(r => r.id === state.activeRoom) || ROOMS[0]
}

function renderAdminPanel() {
  return `
    <div class="xs-admin-card">
      <div class="xs-card-title">👑 ${esc(t('xingshuChat.adminTitle'))}</div>
      ${state.admin ? `
        <div class="xs-admin-grid">
          <button class="xs-btn" data-action="announce">${esc(t('xingshuChat.editAnnouncement'))}</button>
          <button class="xs-btn danger" data-action="delete-announcement">${esc(t('xingshuChat.deleteAnnouncement'))}</button>
          <button class="xs-btn" data-action="mute">${esc(state.muted ? t('xingshuChat.unmuteAll') : t('xingshuChat.muteAll'))}</button>
          <button class="xs-btn danger" data-action="clear-room">${esc(t('xingshuChat.clearRoom'))}</button>
          <button class="xs-btn" data-action="export">${esc(t('xingshuChat.exportMessages'))}</button>
        </div>
        <label class="xs-label">${esc(t('xingshuChat.bannedWordsLabel'))}</label>
        <input class="xs-input" id="xs-banned" value="${esc(state.bannedWords.join('，'))}" />
        <button class="xs-btn full" data-action="save-banned">${esc(t('xingshuChat.saveBannedWords'))}</button>
      ` : `
        <div class="xs-muted">${esc(t('xingshuChat.adminUnlockHint'))}</div>
        <input class="xs-input" id="xs-admin-pass" type="password" placeholder="${esc(t('xingshuChat.adminPasswordPlaceholder'))}" />
        <button class="xs-btn full" data-action="admin-login">${esc(t('xingshuChat.unlockAdmin'))}</button>
      `}
    </div>`
}

function render(el) {
  if (!el) return
  rootEl = el
  const room = activeRoom()
  const ann = state.announcement
    ? `<div class="xs-announcement">📢 ${formatMessageText(state.announcement)}</div>`
    : `<div class="xs-announcement muted">📢 ${esc(t('xingshuChat.noAnnouncement'))}</div>`

  el.innerHTML = `
    <div class="xingshu-chat-page">
      <div class="xs-hero">
        <div>
          <div class="xs-eyebrow">${esc(t('xingshuChat.eyebrow'))}</div>
          <h1>${esc(t('xingshuChat.title'))}</h1>
          <p>${esc(t('xingshuChat.subtitle'))}</p>
        </div>
        <div class="xs-hero-actions">
          <span class="xs-status ${socketStatus === 'online' ? 'online' : ''}">${esc(t(`xingshuChat.status${socketStatus[0].toUpperCase()}${socketStatus.slice(1)}`))}</span>
          <button class="xs-btn glow" data-action="open-window">${esc(t('xingshuChat.openWindow'))}</button>
        </div>
      </div>
      <div class="xs-layout">
        <aside class="xs-sidebar">
          <div class="xs-profile">
            <label class="xs-label">${esc(t('xingshuChat.nicknameLabel'))}</label>
            <input id="xs-nick" class="xs-input" value="${esc(state.nickname)}" />
            <label class="xs-label">${esc(t('xingshuChat.serverLabel'))}</label>
            <input id="xs-server" class="xs-input" value="${esc(state.serverUrl)}" />
            <button class="xs-btn full" data-action="connect">${esc(t('xingshuChat.connectServer'))}</button>
          </div>
          <div class="xs-section-title">${esc(t('xingshuChat.roomList'))}</div>
          <div class="xs-room-list">${renderRooms()}</div>
        </aside>
        <main class="xs-main">
          <div class="xs-room-header"><div><h2>${room.icon} ${esc(t(`xingshuChat.${room.nameKey}`))}</h2><p>${esc(t(`xingshuChat.${room.descKey}`))}</p></div><span>${esc(t(`xingshuChat.${room.levelKey}`))}</span></div>
          ${ann}
          <div class="xs-messages" id="xs-messages">${renderMessages()}</div>
          <div class="xs-compose">
            <input id="xs-message" class="xs-input" placeholder="${esc(t('xingshuChat.messagePlaceholder'))}" ${state.muted && !state.admin ? 'disabled' : ''} />
            <button class="xs-btn glow" data-action="send" ${state.muted && !state.admin ? 'disabled' : ''}>${esc(t('xingshuChat.send'))}</button>
          </div>
        </main>
        <aside class="xs-tools">
          <div class="xs-card"><div class="xs-card-title">${esc(t('xingshuChat.roomCapabilities'))}</div>
            <ul class="xs-feature-list"><li>${esc(t('xingshuChat.featureRealtime'))}</li><li>${esc(t('xingshuChat.featureHistory'))}</li><li>${esc(t('xingshuChat.featureWebsocket'))}</li><li>${esc(t('xingshuChat.featureRoomOps'))}</li><li>${esc(t('xingshuChat.featureBannedWords'))}</li><li>${esc(t('xingshuChat.featureAdminDelete'))}</li></ul>
          </div>
          ${renderAdminPanel()}
        </aside>
      </div>
    </div>`
  wireEvents(el)
  setTimeout(() => document.getElementById('xs-messages')?.scrollTo({ top: 999999 }), 0)
}

function wireEvents(el) {
  el.querySelectorAll('[data-room]').forEach(btn => btn.onclick = () => { state.activeRoom = getValidRoomId(btn.dataset.room); saveState(); sendPresence(); render(el) })
  const nick = el.querySelector('#xs-nick')
  if (nick) nick.onchange = () => { state.nickname = nick.value.trim() || t('xingshuChat.defaultNickname'); saveState(); sendPresence() }
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
    if (pass === ADMIN_PASS) { state.admin = true; saveState(); addMessage('admin', { system: true, user: t('xingshuChat.systemUser'), text: t('xingshuChat.adminUnlocked') }) }
    else alert(t('xingshuChat.adminPasswordWrong'))
  }
  if (!state.admin) return alert(t('xingshuChat.adminRequired'))
  if (action === 'announce') {
    const text = prompt(t('xingshuChat.announcementPrompt'), state.announcement)
    if (text !== null) { state.announcement = text.trim(); saveState(); addMessage(state.activeRoom, { system: true, user: t('xingshuChat.announcementUser'), text: state.announcement || t('xingshuChat.announcementDeleted') }) }
  }
  if (action === 'delete-announcement') {
    if (confirm(t('xingshuChat.deleteAnnouncementConfirm'))) { state.announcement = ''; saveState(); addMessage(state.activeRoom, { system: true, user: t('xingshuChat.announcementUser'), text: t('xingshuChat.announcementDeleted') }) }
  }
  if (action === 'mute') { state.muted = !state.muted; saveState(); addMessage(state.activeRoom, { system: true, user: t('xingshuChat.managementUser'), text: state.muted ? t('xingshuChat.muteEnabledMessage') : t('xingshuChat.muteDisabledMessage') }) }
  if (action === 'clear-room') { if (confirm(t('xingshuChat.clearRoomConfirm'))) { state.messages[state.activeRoom] = []; saveState(); render(rootEl) } }
  if (action === 'export') exportMessages()
  if (action === 'save-banned') { state.bannedWords = (document.getElementById('xs-banned')?.value || '').split(/[，,]/).map(s => s.trim()).filter(Boolean); saveState(); alert(t('xingshuChat.saved')) }
}

function sendMessage() {
  const input = document.getElementById('xs-message')
  const text = input?.value?.trim()
  if (!text) return
  if (state.muted && !state.admin) return alert(t('xingshuChat.muted'))
  const hit = state.bannedWords.find(w => w && text.includes(w))
  if (hit) return alert(t('xingshuChat.bannedWordHit', { word: hit }))
  const payload = { room: state.activeRoom, user: state.nickname, text, time: nowTime() }
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'message', message: payload }))
  }
  addMessage(state.activeRoom, { user: state.nickname, role: state.admin ? t('xingshuChat.adminRole') : t('xingshuChat.userRole'), text })
  input.value = ''
}

function connectServer() {
  try { if (socket) socket.close() } catch {}
  socketStatus = 'connecting'; render(rootEl)
  try {
    socket = new WebSocket(state.serverUrl || DEFAULT_SERVER)
    socket.onopen = () => { socketStatus = 'online'; sendPresence(); addMessage(state.activeRoom, { system: true, user: t('xingshuChat.serverUser'), text: t('xingshuChat.serverConnected') }) }
    socket.onmessage = ev => {
      try {
        const event = JSON.parse(ev.data)
        if (!handleServerEvent(event)) {
          addMessage(event.room || state.activeRoom, { user: event.user || t('xingshuChat.remoteUser'), text: event.text || ev.data })
        }
      }
      catch { addMessage(state.activeRoom, { user: t('xingshuChat.serverUser'), text: ev.data }) }
    }
    socket.onerror = () => { socketStatus = 'offline'; addMessage(state.activeRoom, { system: true, user: t('xingshuChat.serverUser'), text: t('xingshuChat.serverNoResponse') }) }
    socket.onclose = () => { socketStatus = 'offline'; render(rootEl) }
  } catch (e) {
    socketStatus = 'offline'; addMessage(state.activeRoom, { system: true, user: t('xingshuChat.serverUser'), text: t('xingshuChat.connectFailed', { error: e.message }) })
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
  a.download = `${t('xingshuChat.exportFilePrefix')}-${t(`xingshuChat.${room.nameKey}`)}-${Date.now()}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

export { render }
export default { render }
