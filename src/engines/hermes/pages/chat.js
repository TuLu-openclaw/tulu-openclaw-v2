/**
 * Hermes Agent 对话页面 v3
 * 全新简洁大气聊天室 UI
 * Enter 发送 / Shift+Enter 换行
 * 支持多会话、流式输出、工具调用卡片、日志关联
 */
import { t } from '../../../lib/i18n.js'
import { api } from '../../../lib/tauri-api.js'

const STORAGE_KEY = 'hermes_chat_sessions'
const TOOL_ICONS = {
  web_search: '🔍', browse: '🌐', google: '🔍',
  code: '💻', execute_code: '💻', run_code: '💻', python: '🐍',
  terminal: '⌨️', shell: '⌨️', bash: '⌨️', command: '⌨️',
  file: '📁', read_file: '📁', write_file: '📝',
  memory: '🧠', recall: '🧠',
  default: '🔧',
}
function toolIcon(name) {
  const n = (name || '').toLowerCase()
  for (const [k, v] of Object.entries(TOOL_ICONS)) {
    if (n.includes(k)) return v
  }
  return TOOL_ICONS.default
}

function mdToHtml(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, '<br>')
}
function escHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

let _listenFn = null
async function tauriListen(event, cb) {
  if (!_listenFn) { const mod = await import('@tauri-apps/api/event'); _listenFn = mod.listen }
  return _listenFn(event, cb)
}

function loadSessions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function saveSessions(sessions) { localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions)) }

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts), now = new Date()
  const diff = now - d
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (d.toDateString() === now.toDateString()) return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
  return `${d.getMonth()+1}/${d.getDate()}`
}
function sessionTitle(s) {
  if (s?.title) return s.title
  const first = s?.messages?.find(m => m.role === 'user')
  return first ? first.content.slice(0, 28) : t('engine.chatNewSession')
}

export function render() {
  const el = document.createElement('div')
  el.className = 'page hermes-chat-page'

  // ── State ──────────────────────────────────────────────
  let sessions = loadSessions()
  let activeId = sessions[0]?.id || null
  let streaming = false
  let gwOnline = false
  let pendingText = ''
  let activeTools = []
  let unlisteners = []
  let pendingImages = []
  let reconnectAttempts = 0
  const MAX_RECONNECT = 3

  function active() { return sessions.find(s => s.id === activeId) }

  function newSession() {
    const s = { id: genId(), title: '', messages: [], createdAt: Date.now(), updated: Date.now() }
    sessions.unshift(s)
    activeId = s.id
    saveSessions(sessions)
  }
  if (!sessions.length) newSession()

  // ── Init ───────────────────────────────────────────────
  async function init() {
    try {
      const info = await api.checkHermes()
      gwOnline = !!info?.gatewayRunning
    } catch (_) {}
    draw()
    startGwPoll()
  }

  // ── Gateway polling ────────────────────────────────────
  let gwPollTimer = null
  function startGwPoll() {
    gwPollTimer = setInterval(async () => {
      if (streaming) return
      try {
        const info = await api.checkHermes()
        const was = gwOnline
        gwOnline = !!info?.gatewayRunning
        if (was !== gwOnline) updateGwStatus()
      } catch (_) {}
    }, 12000)
  }

  function updateGwStatus() {
    const badge = el.querySelector('#gc-gw-badge')
    const input = el.querySelector('#gc-input')
    const sendBtn = el.querySelector('#gc-send-btn')
    if (badge) badge.className = gwOnline ? 'gc-gw-badge online' : 'gc-gw-badge offline'
    if (badge) badge.textContent = gwOnline ? '🟢 在线' : '🔴 离线'
    if (input) input.disabled = !gwOnline || streaming
    if (sendBtn) sendBtn.disabled = !gwOnline || streaming
    const offline = el.querySelector('#gc-offline-msg')
    if (offline) offline.style.display = gwOnline ? 'none' : 'block'
  }

  // ── Tool card ──────────────────────────────────────────
  function renderToolCard(t) {
    if (!t) return ''
    const icon = toolIcon(t.name)
    const statusText = t.status === 'complete' ? '✅' : t.status === 'error' ? '❌' : '⏳'
    const statusCls = t.error ? 'err' : t.status === 'complete' ? 'ok' : 'active'
    const detail = t.detail ? ` — ${escHtml(String(t.detail).slice(0, 80))}` : ''
    const hasDetails = !!(t.input || t.output || t.error)
    const detailsHtml = hasDetails ? `<div class="gc-tool-details" style="display:none">
      ${t.input ? `<div class="gc-tool-row"><span class="gc-tool-label">输入</span><pre class="gc-tool-pre">${escHtml(typeof t.input === 'string' ? t.input : JSON.stringify(t.input, null, 2))}</pre></div>` : ''}
      ${t.error ? `<div class="gc-tool-row gc-tool-error"><span class="gc-tool-label">错误</span><pre class="gc-tool-pre">${escHtml(String(t.error))}</pre></div>` : ''}
      ${t.output ? `<div class="gc-tool-row"><span class="gc-tool-label">输出</span><pre class="gc-tool-pre">${escHtml(String(t.output).slice(0, 2000))}</pre></div>` : ''}
    </div>` : ''
    return `<div class="gc-tool-card ${statusCls}">
      <div class="gc-tool-header">${icon} <span class="gc-tool-name">${escHtml(t.name || 'tool')}</span> <span class="gc-tool-status">${statusText}${detail}</span>${hasDetails ? '<span class="gc-tool-toggle">▶</span>' : ''}</div>
      ${detailsHtml}
    </div>`
  }

  // ── Message render ──────────────────────────────────────
  function renderMsg(m) {
    if (!m) return ''
    if (m.role === 'tool-summary') {
      if (!Array.isArray(m.tools)) return ''
      return `<div class="gc-tool-summary">${m.tools.map(t => renderToolCard(t)).join('')}</div>`
    }
    const isUser = m.role === 'user'
    const avatar = isUser ? '🐰' : '🤖'
    const bubbleClass = isUser ? 'gc-bubble-me' : 'gc-bubble-ai'
    const content = isUser ? escHtml(m.content || '') : mdToHtml(m.content || '')
    const time = m._time ? `<span class="gc-msg-time">${formatTime(m._time)}</span>` : ''
    return `<div class="gc-msg-row ${isUser ? 'gc-msg-me' : 'gc-msg-ai'}">
      ${isUser ? '' : `<div class="gc-avatar">${avatar}</div>`}
      <div class="gc-bubble ${bubbleClass}"><div class="gc-bubble-content">${content}</div>${time}</div>
      ${isUser ? `<div class="gc-avatar">${avatar}</div>` : ''}
    </div>`
  }

  // ── Stream area ─────────────────────────────────────────
  function updateStreamArea() {
    const msgsEl = el.querySelector('#gc-messages')
    if (!msgsEl) return
    let streamEl = msgsEl.querySelector('.gc-stream-area')
    if (!streaming) { streamEl?.remove(); return }
    if (!streamEl) {
      streamEl = document.createElement('div')
      streamEl.className = 'gc-stream-area'
      msgsEl.appendChild(streamEl)
    }
    const toolsHtml = activeTools.map(t => renderToolCard(t)).join('')
    let textHtml = ''
    if (pendingText) {
      textHtml = `<div class="gc-msg-row gc-msg-ai"><div class="gc-avatar">🤖</div><div class="gc-bubble gc-bubble-ai"><div class="gc-bubble-content">${mdToHtml(pendingText)}</div></div></div>`
    } else if (!activeTools.length) {
      textHtml = `<div class="gc-msg-row gc-msg-ai"><div class="gc-avatar">🤖</div><div class="gc-bubble gc-bubble-ai gc-typing"><div class="gc-bubble-content"><span class="gc-dots"><span></span><span></span><span></span></span></div></div></div>`
    }
    streamEl.innerHTML = toolsHtml + textHtml
    msgsEl.scrollTop = msgsEl.scrollHeight
  }

  // ── Draw ───────────────────────────────────────────────
  function draw() {
    const cur = active()
    const msgs = cur?.messages || []
    const title = sessionTitle(cur)

    el.innerHTML = `
      <div class="gc-layout">
        <!-- 侧边栏 -->
        <aside class="gc-sidebar">
          <div class="gc-sidebar-top">
            <div class="gc-logo">🌾 <span>Hermes</span></div>
            <button class="gc-icon-btn" id="gc-btn-new" title="${t('engine.chatNewSession')}">+ 新对话</button>
          </div>
          <div class="gc-session-list" id="gc-session-list">
            ${sessions.map(s => `
              <div class="gc-session-item ${s.id === activeId ? 'active' : ''}" data-sid="${s.id}">
                <div class="gc-session-icon">${s.id === activeId ? '💬' : '🗣️'}</div>
                <div class="gc-session-info">
                  <div class="gc-session-title" data-sid="${s.id}">${escHtml(sessionTitle(s))}</div>
                  <div class="gc-session-meta">${s.messages.length}条 · ${formatTime(s.updated || s.createdAt)}</div>
                </div>
                <button class="gc-session-del" data-sid="${s.id}" title="删除">×</button>
              </div>
            `).join('')}
          </div>
          <div class="gc-sidebar-bottom">
            <a href="#/h/logs" class="gc-sidebar-link">📋 运行日志</a>
            <a href="#/h/memory" class="gc-sidebar-link">🧠 记忆管理</a>
            <a href="#/h/dashboard" class="gc-sidebar-link">⚙️ 设置</a>
          </div>
        </aside>

        <!-- 主聊天区 -->
        <main class="gc-main">
          <!-- 顶栏 -->
          <div class="gc-topbar">
            <div class="gc-topbar-title" id="gc-topbar-title">${escHtml(title)}</div>
            <div class="gc-topbar-right">
              <span class="gc-gw-badge ${gwOnline ? 'online' : 'offline'}" id="gc-gw-badge">${gwOnline ? '🟢 在线' : '🔴 离线'}</span>
            </div>
          </div>

          <!-- 消息区 -->
          <div class="gc-messages" id="gc-messages">
            ${msgs.length === 0 ? `
              <div class="gc-empty">
                <div class="gc-empty-icon">💬</div>
                <div class="gc-empty-text">${t('engine.chatEmptyHint')}</div>
                <div class="gc-empty-sub">输入消息开始对话，支持 /help 查看命令</div>
              </div>
            ` : ''}
            ${msgs.map(m => renderMsg(m)).join('')}
          </div>

          <!-- 离线提示 -->
          <div id="gc-offline-msg" class="gc-offline-msg" style="display:${gwOnline?'none':'flex'}">
            Gateway 未连接，请确保 Hermes 后台服务已启动
          </div>

          <!-- 工具栏 -->
          <div class="gc-toolbar">
            <button class="gc-tool-btn" id="gc-btn-logs" title="运行日志">📋</button>
            <button class="gc-tool-btn" id="gc-btn-img" title="发送图片">🖼️</button>
            <input type="file" id="gc-img-input" accept="image/*" multiple style="display:none" />
            <div id="gc-img-preview" class="gc-img-preview"></div>
          </div>

          <!-- 输入区 -->
          <div class="gc-input-area">
            <textarea id="gc-input" class="gc-input" rows="1" placeholder="${t('engine.chatPlaceholder')}" ${!gwOnline || streaming ? 'disabled' : ''}></textarea>
            <button class="gc-send-btn" id="gc-send-btn" ${!gwOnline || streaming ? 'disabled' : ''}>
              ${streaming ? '⟳' : '发送'}
            </button>
          </div>
        </main>
      </div>
    `

    bind()
    updateStreamArea()
    scrollBottom()
  }

  function scrollBottom() {
    const m = el.querySelector('#gc-messages')
    if (m) m.scrollTop = m.scrollHeight
  }

  // ── Bind events ─────────────────────────────────────────
  function bind() {
    // 新建会话
    el.querySelector('#gc-btn-new')?.addEventListener('click', () => {
      newSession()
      draw()
    })

    // 会话项点击 + 删除
    el.querySelectorAll('.gc-session-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('gc-session-del')) {
          e.stopPropagation()
          const sid = e.target.dataset.sid
          if (!confirm('删除该会话？')) return
          sessions = sessions.filter(s => s.id !== sid)
          if (activeId === sid) activeId = sessions[0]?.id || null
          if (!sessions.length) newSession()
          saveSessions(sessions)
          draw()
          return
        }
        activeId = item.dataset.sid
        draw()
      })

      // 双击重命名
      item.querySelector('.gc-session-title')?.addEventListener('dblclick', (e) => {
        e.stopPropagation()
        const titleEl = e.currentTarget
        titleEl.contentEditable = true
        titleEl.focus()
        const range = document.createRange()
        range.selectNodeContents(titleEl)
        window.getSelection().removeAllRanges()
        window.getSelection().addRange(range)
        const finish = () => {
          const sid = titleEl.dataset.sid
          const s = sessions.find(x => x.id === sid)
          if (s) { s.title = titleEl.textContent.trim() || s.title; saveSessions(sessions) }
          titleEl.contentEditable = false
        }
        titleEl.onblur = finish
        titleEl.onkeydown = (ev) => {
          if (ev.key === 'Enter') { ev.preventDefault(); titleEl.blur() }
          if (ev.key === 'Escape') { titleEl.textContent = sessionTitle(sessions.find(x => x.id === titleEl.dataset.sid)); titleEl.blur() }
        }
      })
    })

    // 图片上传
    el.querySelector('#gc-btn-img')?.addEventListener('click', () => el.querySelector('#gc-img-input')?.click())
    el.querySelector('#gc-img-input')?.addEventListener('change', (e) => {
      const files = e.target.files
      if (!files) return
      const preview = el.querySelector('#gc-img-preview')
      Array.from(files).forEach(file => {
        const reader = new FileReader()
        reader.onload = (ev) => {
          pendingImages.push({ name: file.name, dataUrl: ev.target.result })
          const thumb = document.createElement('div')
          thumb.className = 'gc-img-thumb'
          thumb.innerHTML = `<img src="${ev.target.result}" /><span class="gc-img-remove" data-idx="${pendingImages.length - 1}">×</span>`
          thumb.querySelector('.gc-img-remove')?.addEventListener('click', () => {
            const idx = parseInt(thumb.querySelector('.gc-img-remove').dataset.idx)
            pendingImages.splice(idx, 1)
            thumb.remove()
          })
          preview?.appendChild(thumb)
        }
        reader.readAsDataURL(file)
      })
      e.target.value = ''
    })

    // 日志按钮
    el.querySelector('#gc-btn-logs')?.addEventListener('click', () => { window.location.hash = '#/h/logs' })

    // 工具卡片展开/折叠（事件委托）
    el.addEventListener('click', (e) => {
      const header = e.target.closest('.gc-tool-header')
      if (!header) return
      const card = header.closest('.gc-tool-card')
      const details = card?.querySelector('.gc-tool-details')
      const toggle = header.querySelector('.gc-tool-toggle')
      if (details) {
        const open = details.style.display !== 'none'
        details.style.display = open ? 'none' : 'block'
        if (toggle) toggle.textContent = open ? '▶' : '▼'
      }
    })

    // ── 核心：输入框 Enter 发送 ──────────────────────────
    const input = el.querySelector('#gc-input')
    const sendBtn = el.querySelector('#gc-send-btn')

    if (input) {
      // textarea 自动高度
      input.addEventListener('input', () => {
        input.style.height = 'auto'
        input.style.height = Math.min(input.scrollHeight, 140) + 'px'
      })

      // Enter 发送（不用 keydown，用 keyup 避免事件捕获问题）
      input.addEventListener('keyup', (e) => {
        if (e.key !== 'Enter') return
        if (e.shiftKey) return  // Shift+Enter 换行
        e.preventDefault()
        doSend()
      })

      input.focus()
    }

    // 发送按钮
    sendBtn?.addEventListener('click', () => { if (!streaming && gwOnline) doSend() })
  }

  // ── Send ─────────────────────────────────────────────────
  async function doSend() {
    const input = el.querySelector('#gc-input')
    if (!input) return
    const text = input.value.trim()
    if (!text || streaming) return

    const cur = active()
    if (!cur) return

    // 本地命令
    if (text === '/clear') { cur.messages = []; cur.title = ''; saveSessions(sessions); input.value = ''; draw(); return }
    if (text === '/new') { newSession(); input.value = ''; draw(); return }
    if (text === '/help') {
      cur.messages.push({ role: 'user', content: text, _time: Date.now() })
      cur.messages.push({ role: 'assistant', content: `**可用命令：**\n/clear — 清空会话\n/new — 新建会话\n/help — 显示此帮助\n/status — Gateway 状态` })
      cur.updated = Date.now()
      saveSessions(sessions)
      input.value = ''
      draw()
      return
    }
    if (text === '/status') {
      cur.messages.push({ role: 'user', content: text, _time: Date.now() })
      try {
        const info = await api.checkHermes()
        cur.messages.push({ role: 'assistant', content: `**Gateway：** ${info?.gatewayRunning ? '✅ 在线' : '❌ 离线'}\n**端口：** ${info?.gatewayPort || '-'}\n**模型：** ${info?.model || '-'}` })
      } catch (e) {
        cur.messages.push({ role: 'assistant', content: `⚠️ 获取状态失败: ${e}` })
      }
      cur.updated = Date.now()
      saveSessions(sessions)
      input.value = ''
      draw()
      return
    }

    // 正常消息
    cur.messages.push({ role: 'user', content: text, _time: Date.now() })
    if (!cur.title) cur.title = text.slice(0, 28)
    cur.updated = Date.now()
    input.value = ''
    input.style.height = 'auto'
    pendingImages = []
    el.querySelector('#gc-img-preview').innerHTML = ''
    streaming = true
    pendingText = ''
    activeTools = []
    draw()

    try {
      await setupRunListeners()
      const history = cur.messages.filter(m => m.role === 'user' || m.role === 'assistant').slice(0, -1).map(m => ({ role: m.role, content: m.content }))
      await api.hermesAgentRun(text, cur.id, history.length ? history : null, null)
    } catch (e) {
      const msg = String(e.message || e).replace(/^Error:\s*/, '')
      cur.messages.push({ role: 'assistant', content: `⚠️ ${t('engine.chatError', { error: msg })}`, _time: Date.now() })
      streaming = false
      pendingText = ''
      activeTools = []
      cur.updated = Date.now()
      saveSessions(sessions)
      cleanupListeners()
      draw()
    }
  }

  // ── SSE listeners ───────────────────────────────────────
  async function setupRunListeners() {
    cleanupListeners()
    const u1 = await tauriListen('hermes-run-delta', (e) => {
      pendingText += e.payload?.delta || ''
      updateStreamArea()
    })
    const u2 = await tauriListen('hermes-run-tool', (e) => {
      const evt = e.payload || {}
      const type = evt.event || ''
      const name = evt.tool || evt.tool_name || evt.name || 'tool'
      const preview = evt.preview || evt.detail || ''
      const getData = (obj, keys) => { for (const k of keys) { if (obj[k] != null && obj[k] !== '') return obj[k] } return null }
      if (type === 'tool.started' && name && name !== 'tool') {
        activeTools.push({ name, status: 'active', detail: preview, input: null, output: null, error: null })
      } else if (type === 'tool.completed') {
        const t2 = activeTools.find(t => t.name === name && t.status === 'active')
        if (t2) {
          t2.status = evt.error ? 'error' : 'complete'
          t2.detail = evt.error ? '失败' : (evt.duration ? `${evt.duration}s` : '完成')
          t2.output = getData(evt, ['output', 'result', 'content'])
          if (evt.error) t2.error = typeof evt.error === 'string' ? evt.error : JSON.stringify(evt.error)
          if (!t2.input) t2.input = getData(evt, ['input', 'args'])
        }
      } else if (type === 'tool.error') {
        const t2 = activeTools.find(t => t.name === name && t.status === 'active')
        if (t2) { t2.status = 'error'; t2.detail = preview || '失败'; t2.error = evt.error || preview }
      } else if (type === 'tool.progress') {
        const t2 = activeTools.find(t => t.name === name && t.status === 'active')
        if (t2 && preview) t2.detail = preview
      }
      updateStreamArea()
    })
    const u3 = await tauriListen('hermes-run-done', (e) => {
      const cur = active()
      if (!cur) return
      const output = e.payload?.output || pendingText || '(empty)'
      if (activeTools.length) {
        const valid = activeTools.filter(t => t && t.name)
        if (valid.length) cur.messages.push({ role: 'tool-summary', tools: valid })
      }
      cur.messages.push({ role: 'assistant', content: output, _time: Date.now() })
      streaming = false; pendingText = ''; activeTools = []
      cur.updated = Date.now()
      saveSessions(sessions)
      cleanupListeners()
      draw()
    })
    const u4 = await tauriListen('hermes-run-error', (e) => {
      const cur = active()
      if (!cur) return
      cur.messages.push({ role: 'assistant', content: `⚠️ 运行错误: ${escHtml(e.payload?.error || 'unknown')}`, _time: Date.now() })
      streaming = false; pendingText = ''; activeTools = []
      cur.updated = Date.now()
      saveSessions(sessions)
      cleanupListeners()
      draw()
    })
    unlisteners.push(u1, u2, u3, u4)
  }

  function cleanupListeners() { for (const fn of unlisteners) fn(); unlisteners = [] }

  // ── Cleanup ─────────────────────────────────────────────
  const obs = new MutationObserver(() => { if (!el.isConnected) { cleanupListeners(); if (gwPollTimer) clearInterval(gwPollTimer); obs.disconnect() } })
  requestAnimationFrame(() => { if (el.parentNode) obs.observe(el.parentNode, { childList: true }) })

  init()
  return el
}
