/**
 * Hermes Agent 对话页面 - 微信风格（重写版 v2）
 */
import { t } from '../../../lib/i18n.js'
import { api } from '../../../lib/tauri-api.js'

const STORAGE_KEY = 'hermes_chat_sessions'
const FILE_ACCESS_KEY = 'hermes_chat_file_access'
const SLASH_COMMANDS = [
  { cmd: '/help',   desc: '显示可用命令' },
  { cmd: '/status', desc: '查看 Agent 状态' },
  { cmd: '/memory', desc: '管理记忆' },
  { cmd: '/skills', desc: '查看技能列表' },
  { cmd: '/clear',  desc: '清空当前会话' },
  { cmd: '/new',    desc: '新建会话' },
  { cmd: '/undo',   desc: '撤销上一条消息' },
]
const TOOL_ICONS = {
  web_search: '\uD83D\uDD0D', browse: '\uD83C\uDF10', web_browse: '\uD83C\uDF10', google: '\uD83D\uDD0D',
  code: '\uD83D\uDCBB', execute_code: '\uD83D\uDCBB', run_code: '\uD83D\uDCBB', python: '\uD83D\uDC0D',
  terminal: '\u2328\uFE0F', shell: '\u2328\uFE0F', bash: '\u2328\uFE0F', command: '\u2328\uFE0F',
  file: '\uD83D\uDCC1', read_file: '\uD83D\uDCC1', write_file: '\uD83D\uDDD2\uFE0F',
  memory: '\uD83E\uDDA0', recall: '\uD83E\uDDA0',
  default: '\uD83D\uDD27',
}
function toolIcon(name) {
  const n = (name || '').toLowerCase()
  for (const [k, v] of Object.entries(TOOL_ICONS)) { if (n.includes(k)) return v }
  return TOOL_ICONS.default
}
function mdToHtml(text) {
  return (text || '')
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
function sessionTitle(s) {
  if (s.title) return s.title
  const first = s.messages.find(m => m.role === 'user')
  return first ? first.content.slice(0, 30) : t('engine.chatNewSession')
}

export function render() {
  const el = document.createElement('div')
  el.className = 'page hermes-chat-page'

  let sessions = loadSessions()
  let activeId = sessions[0]?.id || null
  let streaming = false
  let gwOnline = false
  let showSlash = false
  let slashFilter = ''
  let currentModel = ''
  let modelList = []
  let showModelDropdown = false
  let fileAccessEnabled = localStorage.getItem(FILE_ACCESS_KEY) === 'true'
  let pendingText = ''
  let activeTools = []
  let unlisteners = []
  let lastSSEActivity = Date.now()
  let reconnectAttempts = 0
  const MAX_RECONNECT = 3
  const SSE_TIMEOUT_MS = 30000
  let heartbeatTimer = null
  let reconnectToast = null
  let toolProgress = { total: 0, done: 0 }
  let pendingImages = []
  let quotedMsgId = null
  let quotedText = null

  function active() { return sessions.find(s => s.id === activeId) }

  function newSession() {
    const s = { id: genId(), title: '', messages: [], createdAt: Date.now() }
    sessions.unshift(s)
    activeId = s.id
    saveSessions(sessions)
  }
  if (!sessions.length) newSession()

  async function init() {
    try {
      const info = await api.checkHermes()
      gwOnline = !!info?.gatewayRunning
    } catch (_) {}
    try {
      const cfg = await api.hermesReadConfig()
      if (cfg?.model) currentModel = cfg.model
      if (cfg?.base_url && cfg?.api_key) {
        try {
          const base = cfg.base_url.replace(/\/+$/, '').replace(/\/(chat\/completions|completions|responses|messages|models)\/?$/, '')
          const resp = await fetch(base + '/models', { headers: { 'Authorization': `Bearer ${cfg.api_key}` }, signal: AbortSignal.timeout(8000) })
          if (resp.ok) { const data = await resp.json(); modelList = (data.data || []).map(m => m.id).filter(Boolean).sort() }
        } catch (_) {}
      }
    } catch (_) {}
    draw()
  }

  function saveDraft() {
    const inp = el.querySelector('#hm-chat-input')
    if (!inp || !activeId) return
    sessionStorage.setItem('hermes_draft_' + activeId, inp.value)
  }
  function loadDraft() {
    const inp = el.querySelector('#hm-chat-input')
    if (!inp || !activeId) return
    const d = sessionStorage.getItem('hermes_draft_' + activeId)
    if (d) { inp.value = d; inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 120) + 'px' }
  }
  function clearDraft() { if (!activeId) return; sessionStorage.removeItem('hermes_draft_' + activeId) }

  function showToast(msg) {
    if (!reconnectToast) { reconnectToast = document.createElement('div'); reconnectToast.className = 'wx-reconnect-toast'; document.body.appendChild(reconnectToast) }
    reconnectToast.textContent = msg; reconnectToast.style.display = 'block'
  }
  function hideToast() { if (reconnectToast) reconnectToast.style.display = 'none' }

  function startHB() {
    stopHB()
    heartbeatTimer = setInterval(async () => {
      if (!streaming) { stopHB(); return }
      const elapsed = Date.now() - lastSSEActivity
      if (elapsed > SSE_TIMEOUT_MS && reconnectAttempts < MAX_RECONNECT) {
        reconnectAttempts++
        showToast('连接断开了，正在重连 (' + reconnectAttempts + '/' + MAX_RECONNECT + ')...')
        const cur2 = active()
        if (cur2 && cur2.messages.length > 0) {
          const lastUser = [...cur2.messages].reverse().find(m => m.role === 'user')
          if (lastUser) {
            const hist = cur2.messages.filter(m => m.role === 'user' || m.role === 'assistant').slice(0, -1).map(m => ({ role: m.role, content: m.content }))
            streaming = false; pendingText = ''; activeTools = []; cleanupListeners()
            await doSend(lastUser.content, hist, true)
          }
        }
      } else if (elapsed > SSE_TIMEOUT_MS && reconnectAttempts >= MAX_RECONNECT) {
        stopHB(); showToast('连接失败，请检查网络')
        setTimeout(hideToast, 3000)
        streaming = false; pendingText = ''; activeTools = []
        const cur2 = active()
        if (cur2) { cur2.messages.push({ role: 'assistant', content: '⚠️ 连接断开了，已尝试重连够够，请检查网络后重试。' }); saveSessions(sessions); draw() }
      }
    }, 15000)
  }
  function stopHB() { if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null } }

  function updateTP(done, total) {
    toolProgress.done = done; toolProgress.total = total
    const fill = el?.querySelector('#wx-tool-fill')
    const txt = el?.querySelector('#wx-tool-progress-text')
    const bar = el?.querySelector('#wx-tool-progress')
    if (!bar) return
    if (total === 0) { bar.style.display = 'none'; return }
    bar.style.display = 'flex'
    if (fill) fill.style.width = (total > 0 ? Math.round(done / total * 100) : 0) + '%'
    if (txt) txt.textContent = done + ' / ' + total
    if (done >= total) setTimeout(() => { if (bar) bar.style.display = 'none' }, 800)
  }

  function setQuote(msgId, text) {
    quotedMsgId = msgId; quotedText = text
    const inp = el.querySelector('#hm-chat-input')
    if (!inp) return
    const existing = el.querySelector('.wx-quote-bar')
    if (existing) existing.remove()
    if (!msgId) return
    const bar = document.createElement('div')
    bar.className = 'wx-quote-bar'
    bar.innerHTML = '<span>⇩ 引用</span><span class=wx-quote-bar-text>' + escHtml(text || '').slice(0, 80) + '</span><span class=wx-quote-close id=wx-qrm>×</span>'
    bar.querySelector('#wx-qrm')?.addEventListener('click', (e) => { e.stopPropagation(); setQuote(null, null); bar.remove() })
    inp.parentElement.prepend(bar)
  }

  function undoLast() {
    const cur2 = active()
    if (!cur2 || cur2.messages.length === 0) return
    const idx = [...cur2.messages].reverse().findIndex(m => m.role === 'user')
    if (idx === -1) return
    cur2.messages.splice(cur2.messages.length - 1 - idx, 1)
    saveSessions(sessions); draw()
  }

  function renderToolCard(t, collapsed) {
    if (!t) return ''
    const icon = toolIcon(t.name || '')
    const statusText = t.status === 'active' ? '◃ ' : (t.error ? '✗ ' : '✓ ')
    const statusCls = t.error ? 'err' : (t.status === 'active' ? 'active' : 'ok')
    const detail = t.detail ? ' — ' + escHtml(String(t.detail).slice(0, 80)) : ''
    const inputStr = t.input ? (typeof t.input === 'string' ? t.input : JSON.stringify(t.input, null, 2)) : ''
    const outputStr = t.output ? String(t.output).slice(0, 2000) : ''
    const errorStr = t.error ? (typeof t.error === 'string' ? t.error : JSON.stringify(t.error)) : ''
    const hasDetails = !!(inputStr || outputStr || errorStr)
    let detailsHtml = ''
    if (hasDetails) {
      detailsHtml = '<div class="hm-tool-details" style="display:' + (collapsed ? 'none' : 'block') + '">' +
        (inputStr ? '<div class="hm-tool-section"><div class="hm-tool-section-label">输入</div><pre class="hm-tool-pre">' + escHtml(inputStr) + '</pre></div>' : '') +
        (errorStr ? '<div class="hm-tool-section hm-tool-section-err"><div class="hm-tool-section-label">错误</div><pre class="hm-tool-pre">' + escHtml(errorStr) + '</pre></div>' : '') +
        (outputStr ? '<div class="hm-tool-section"><div class="hm-tool-section-label">输出</div><pre class="hm-tool-pre">' + escHtml(outputStr) + '</pre></div>' : '') +
        '</div>'
    }
    return '<div class="wx-tool-card wx-tool-' + statusCls + '">' +
      '<div class="hm-tool-card-header">' + icon + ' <span class="hm-tool-name">' + escHtml(t.name || 'tool') + '</span>' +
      '<span class="hm-tool-status">' + statusText + detail + '</span>' +
      (hasDetails ? '<span class="hm-tool-toggle">' + (collapsed ? '▼' : '▲') + '</span>' : '') + '</div>' + detailsHtml + '</div>'
  }

  function renderMessage(m) {
    if (!m) return ''
    const isUser = m.role === 'user'
    if (m.role === 'tool-summary') {
      if (!Array.isArray(m.tools)) return ''
      return '<div class="wx-tool-summary">' + m.tools.map(t => renderToolCard(t, true)).join('') + '</div>'
    }
    const msgId = 'mid_' + genId()
    const avatar = isUser ? '<div class="wx-avatar wx-avatar-me">🐰</div>' : '<div class="wx-avatar wx-avatar-ai">🤖</div>'
    const content = isUser ? escHtml(m.content) : mdToHtml(m.content)
    const imgHtml = (m._images && m._images.length > 0)
      ? '<div class="wx-msg-imgs">' + m._images.map(img => '<img src="' + img.dataUrl + '" style="max-width:120px;max-height:120px;border-radius:6px;margin-top:4px" />').join('') + '</div>'
      : ''
    const quoteHtml = m._quoted
      ? '<div class="wx-quote-bar" style="margin-bottom:4px;font-size:12px;color:#888"><span>⇩ 引用</span><span class=wx-quote-bar-text>' + escHtml(m._quoted.text || '').slice(0, 80) + '</span></div>'
      : ''
    const bubble = isUser
      ? '<div class="wx-bubble wx-bubble-me"><div class="wx-bubble-content">' + quoteHtml + content + imgHtml + '</div></div>'
      : '<div class="wx-bubble wx-bubble-ai"><div class="wx-bubble-content">' + quoteHtml + content + imgHtml + '</div></div>'
    const actions = '<div class="wx-msg-actions">' +
      '<button class="wx-msg-action-btn wx-msg-action-reply" title="引用回复">⇩ 回复</button>' +
      '<button class="wx-msg-action-btn wx-msg-action-copy" title="复制">📋 复制</button>' +
      '</div>'
    return '<div class="wx-msg-item" data-msg-id="' + msgId + '">' +
      '<div class="wx-msg-row ' + (isUser ? 'wx-msg-me' : 'wx-msg-ai') + '">' +
      (isUser ? '' : avatar) + bubble + (isUser ? avatar : '') + '</div>' + actions + '</div>'
  }

  function updateStreamArea() {
    const msgsEl = el.querySelector('#hm-chat-msgs')
    if (!msgsEl) return
    let streamEl = msgsEl.querySelector('.wx-stream-area')
    if (!streaming) { if (streamEl) streamEl.remove(); return }
    if (!streamEl) { streamEl = document.createElement('div'); streamEl.className = 'wx-stream-area'; msgsEl.appendChild(streamEl) }
    const toolsHtml = (activeTools || []).map(t => renderToolCard(t, false)).join('')
    let textHtml = ''
    if (pendingText) {
      textHtml = '<div class="wx-msg-row wx-msg-ai"><div class="wx-avatar wx-avatar-ai">🤖</div>' +
        '<div class="wx-bubble wx-bubble-ai"><div class="wx-bubble-content">' + mdToHtml(pendingText) + '</div></div></div>'
    } else if (activeTools.length === 0) {
      textHtml = '<div class="wx-msg-row wx-msg-ai"><div class="wx-avatar wx-avatar-ai">🤖</div>' +
        '<div class="wx-bubble wx-bubble-ai wx-typing-bubble"><div class="wx-bubble-content"><span class="wx-dots"><span></span><span></span><span></span></span></div></div></div>'
    }
    const toolStatus = toolProgress.total > 0
      ? '<div class="wx-stream-status">↻ 正在执行 ' + toolProgress.done + ' / ' + toolProgress.total + ' 个工具...</div>'
      : ''
    streamEl.innerHTML = toolStatus + toolsHtml + textHtml
    msgsEl.scrollTop = msgsEl.scrollHeight
  }

  function formatTime(ts) {
    if (!ts) return ''
    const d = new Date(ts), now = new Date(), diff = now - d
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
    if (d.toDateString() === now.toDateString()) return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0')
    return (d.getMonth() + 1) + '/' + d.getDate()
  }

  function highlightSearch(q) {
    document.querySelectorAll('.wx-search-hl').forEach(hl => { const p = hl.parentNode; while (hl.firstChild) p.insertBefore(hl.firstChild, hl); p.removeChild(hl) })
    if (!q) return
    document.querySelectorAll('.wx-bubble-content').forEach(bubble => {
      let html = bubble.innerHTML, lower = html.toLowerCase(), qLower = q.toLowerCase()
      let idx = 0, count = 0
      while ((idx = lower.indexOf(qLower, idx)) !== -1 && count < 50) {
        html = html.slice(0, idx) + '<mark class="wx-search-hl">' + html.slice(idx, idx + q.length) + '</mark>' + html.slice(idx + q.length)
        idx += q.length + 37; count++
      }
      bubble.innerHTML = html
    })
  }

  function cleanupListeners() {
    unlisteners.forEach(fn => { try { fn() } catch (_) {} })
    unlisteners = []
  }

  async function doSend(userText, history, isResume) {
    cleanupListeners()
    streaming = true; pendingText = ''; activeTools = []; toolProgress = { total: 0, done: 0 }; lastSSEActivity = Date.now(); reconnectAttempts = 0; startHB()
    updateStreamArea()
    setSendBtn(true)

    let sseUrl, apiKey
    try {
      const cfg = await api.hermesReadConfig()
      if (!cfg?.base_url || !cfg?.api_key) throw new Error('no config')
      sseUrl = cfg.base_url.replace(/\/+$/, '') + '/v1/runs'
      apiKey = cfg.api_key
    } catch {
      stopHB(); streaming = false; pendingText = ''; activeTools = []; updateStreamArea(); setSendBtn(false)
      const cur2 = active()
      if (cur2) { cur2.messages.push({ role: 'assistant', content: '⚠️ 未配置 Hermes API，请先配置连接' }); saveSessions(sessions); draw() }
      return
    }

    let toolIdCounter = 0
    let pendingToolId = null
    let textBuffer = ''

    const onRunDelta = await tauriListen('hermes-run-delta', ({ payload }) => {
      if (!streaming) return
      lastSSEActivity = Date.now()
      const delta = payload?.delta || payload?.text_delta || ''
      if (delta) { textBuffer += delta; pendingText = textBuffer; updateStreamArea() }
    })

    const onRunTool = await tauriListen('hermes-run-tool', ({ payload }) => {
      if (!streaming) return
      lastSSEActivity = Date.now()
      if (!activeTools.find(t => t._tmpId === pendingToolId)) {
        pendingToolId = ++toolIdCounter
        activeTools.push({ _tmpId: pendingToolId, name: payload?.name || 'tool', input: payload?.input, status: 'active', detail: '' })
        updateStreamArea()
      }
    })

    const onRunDone = await tauriListen('hermes-run-finished', async ({ payload }) => {
      if (!streaming) return
      lastSSEActivity = Date.now()
      stopHB()
      const cur2 = active()
      if (cur2) {
        const quoted = (quotedMsgId && quotedText) ? { id: quotedMsgId, text: quotedText } : null
        const imgCopy = pendingImages.length > 0 ? [...pendingImages] : undefined
        const finalText = payload?.text || payload?.content || pendingText || ''
        if (finalText.trim()) {
          cur2.messages.push({ role: 'user', content: userText, ...(imgCopy ? { _images: imgCopy } : {}), ...(quoted ? { _quoted: quoted } : {}) })
        }
        cur2.messages.push({ role: 'assistant', content: finalText })
        cur2.updated = Date.now()
        saveSessions(sessions)
      }
      streaming = false; pendingText = ''; activeTools = []; pendingImages = []; quotedMsgId = null; quotedText = null
      cleanupListeners(); updateStreamArea(); setSendBtn(false); draw()
    })

    const onToolUpdate = await tauriListen('hermes-tool-update', ({ payload }) => {
      if (!streaming) return
      lastSSEActivity = Date.now()
      if (activeTools.length > 0) {
        const tool = activeTools.find(t => t._tmpId === pendingToolId)
        if (tool) {
          if (payload?.status) tool.status = payload.status
          if (payload?.output) tool.output = payload.output
          if (payload?.error) tool.error = payload.error
          if (payload?.status === 'done' || payload?.status === 'completed') {
            tool.status = 'ok'; tool.done = true
            const doneCount = activeTools.filter(t => t.done || t.status === 'ok').length
            updateTP(doneCount, activeTools.length)
          }
          updateStreamArea()
        }
      }
    })

    const onError = await tauriListen('hermes-run-error', ({ payload }) => {
      stopHB()
      streaming = false; pendingText = ''; activeTools = []
      const cur2 = active()
      if (cur2) { cur2.messages.push({ role: 'assistant', content: '✗ SSE 连接错误: ' + (payload?.error || '未知错误') }); saveSessions(sessions); draw() }
      cleanupListeners(); updateStreamArea(); setSendBtn(false)
    })

const onTokenUsage = await tauriListen('hermes-token-usage', ({ payload }) => {
      if (!payload) return
      const statsEl = el.querySelector('#wx-token-stats')
      if (statsEl) {
        const inp = payload.input_tokens || 0, out = payload.output_tokens || 0, cost = payload.cost_usd || 0
        statsEl.innerHTML = '<span class="wx-token-badge">💰</span> 输入 ~' + inp + ' tokens / 输出 ~' + out + ' tokens / 约 ' + cost.toFixed(6) + ' USD'
        statsEl.style.display = 'block'
        setTimeout(() => { if (statsEl) statsEl.style.display = 'none' }, 12000)
      }
    })
    unlisteners = [onRunDelta, onRunTool, onRunDone, onToolUpdate, onError, onTokenUsage]

    try {
      const body = { message: userText, stream: true, ...(history.length ? { history } : {}) }
      const resp = await fetch(sseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      })
      if (!resp.ok) throw new Error('HTTP ' + resp.status)
      const reader = resp.body?.getReader()
      if (!reader) throw new Error('no stream body')
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]' || data === '') continue
          try {
            const parsed = JSON.parse(data)
            if (parsed.text_delta || parsed.delta?.text) {
              textBuffer += parsed.text_delta || parsed.delta.text
              pendingText = textBuffer
              updateStreamArea()
            }
            if (parsed.tool) {
              if (!activeTools.find(t => t._tmpId === pendingToolId)) {
                pendingToolId = ++toolIdCounter
                activeTools.push({ _tmpId: pendingToolId, name: parsed.tool.name || 'tool', input: parsed.tool.input, status: 'active', detail: '' })
                updateStreamArea()
              }
            }
            if (parsed.status === 'done' || parsed.done) {
              const finalText = parsed.text || pendingText
              const cur2 = active()
              if (cur2) {
                const quoted = (quotedMsgId && quotedText) ? { id: quotedMsgId, text: quotedText } : null
                const imgCopy = pendingImages.length > 0 ? [...pendingImages] : undefined
                if ((userText || '').trim()) {
                  cur2.messages.push({ role: 'user', content: userText, ...(imgCopy ? { _images: imgCopy } : {}), ...(quoted ? { _quoted: quoted } : {}) })
                }
                cur2.messages.push({ role: 'assistant', content: finalText })
                cur2.updated = Date.now()
                saveSessions(sessions)
              }
              streaming = false; pendingText = ''; activeTools = []; pendingImages = []; quotedMsgId = null; quotedText = null
              cleanupListeners(); updateStreamArea(); setSendBtn(false); draw()
            }
          } catch (_) {}
        }
        lastSSEActivity = Date.now()
      }
    } catch (err) {
      stopHB()
      streaming = false; pendingText = ''; activeTools = []
      const cur2 = active()
      if (cur2) { cur2.messages.push({ role: 'assistant', content: '✗ 请求失败: ' + err.message }); saveSessions(sessions); draw() }
      cleanupListeners(); updateStreamArea(); setSendBtn(false)
    }
  }

  async function sendMessage() {
    const input = el.querySelector('#hm-chat-input')
    if (!input || streaming || !gwOnline) return
    const text = input.value.trim()
    if (!text && pendingImages.length === 0) return
    const quoted = (quotedMsgId && quotedText) ? { id: quotedMsgId, text: quotedText } : null
    input.value = ''; input.style.height = 'auto'; clearDraft(); showSlash = false; el.querySelector('.hm-slash-menu')?.remove()
    el.querySelector('.wx-quote-bar')?.remove()
    const quotedPrefix = quoted ? '引用: ' + quoted.text.slice(0, 60) + '\n\n' : ''
    const cur = active()
    if (cur) {
      cur.messages.push({ role: 'user', content: quotedPrefix + text, _images: pendingImages.length > 0 ? [...pendingImages] : undefined, _quoted: quoted })
      cur.updated = Date.now(); saveSessions(sessions)
    }
    pendingImages = []; quotedMsgId = null; quotedText = null; draw()
    const history = (cur?.messages || []).filter(m => m.role === 'user' || m.role === 'assistant').slice(0, -1).map(m => ({ role: m.role, content: m.content }))
    await doSend(text, history, false)
  }

  function setSendBtn(loading) {
    const btn = el.querySelector('#hm-chat-send-btn')
    if (!btn) return
    btn.disabled = loading || !gwOnline
    btn.innerHTML = loading ? '<span class="wx-sending">发送中...</span>' : '发送'
  }

  function draw() {
    const cur = active()
    const msgs = cur?.messages || []
    const title = sessionTitle(cur)
    el.innerHTML =
      '<div class="hm-chat-wx">' +
        '<div class="hm-chat-sidebar wx-sidebar">' +
          '<div class="wx-sidebar-header">' +
            '<div class="wx-sidebar-logo">🌾</div>' +
            '<div class="wx-sidebar-info"><div class="wx-sidebar-name">Hermes</div><div class="wx-sidebar-sub">AI Agent</div></div>' +
          '</div>' +
          '<div class="wx-sidebar-sessions">' +
            sessions.map(s => '<div class="wx-session-item ' + (s.id === activeId ? 'active' : '') + '" data-sid="' + s.id + '">' +
              '<div class="wx-session-avatar">' + (s.id === activeId ? '💬' : '📣') + '</div>' +
              '<div class="wx-session-body"><div class="wx-session-title">' + escHtml(sessionTitle(s)) + '</div>' +
              '<div class="wx-session-time">' + (s.updated ? formatTime(s.updated) : '') + '</div></div></div>').join('') +
          '</div>' +
          '<div class="wx-sidebar-footer">' +
            '<button class="wx-icon-btn wx-new-btn" title="' + t('engine.chatNewSession') + '">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M12 5v14M5 12h14"/></svg>' +
            '</button>' +
            '<a href="#/h/dashboard" class="wx-icon-btn" title="' + t('engine.dashModelConfig') + '">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>' +
            '</a>' +
          '</div>' +
        '</div>' +
        '<div class="hm-chat-main wx-main">' +
          '<div class="wx-chat-topbar">' +
            '<div class="wx-topbar-title">' + escHtml(title) + '</div>' +
            '<div class="wx-topbar-right">' +
              '<div class="wx-model-chip" id="hm-chat-model" title="' + t('engine.configModel') + '">🤖 ' + escHtml(currentModel) + '</div>' +
              (modelList.length ? '<div class="wx-model-dropdown" id="wx-model-dd" style="display:' + (showModelDropdown ? 'block' : 'none') + '">' + modelList.map(m => '<div class="wx-model-opt' + (m === currentModel ? ' active' : '') + '" data-model="' + escHtml(m) + '">' + escHtml(m) + '</div>').join('') + '</div>' : '') +
            '</div>' +
          '</div>' +
          '<div class="wx-messages" id="hm-chat-msgs">' +
            (msgs.length === 0 ? '<div class="wx-empty-hint"><div class="wx-empty-icon">💬</div><div>' + t('engine.chatEmptyHint') + '</div></div>' : '') +
            msgs.map(m => renderMessage(m)).join('') +
          '</div>' +
          '<div class="wx-input-area">' +
            (!gwOnline ? '<div class="wx-gw-offline">' + t('engine.chatGatewayOffline') + '</div>' : '') +
            '<div class="wx-token-stats" id="wx-token-stats" style="display:none;font-size:11px;color:#888;padding:2px 8px;text-align:right"></div>' +
            '<div class="wx-tool-progress" id="wx-tool-progress" style="display:none"><div class="wx-tool-progress-bar"><div class="wx-tool-progress-fill" id="wx-tool-fill"></div></div><div class="wx-tool-progress-text" id="wx-tool-progress-text">0 / 0</div></div>' +
            '<div class="wx-img-preview" id="wx-img-preview"></div>' +
            '<div class="wx-input-toolbar">' +
              '<label class="wx-img-upload-btn" title="上传图片">🗂 <span>图片</span><input type="file" id="wx-img-input" accept="image/*" multiple style="display:none" /></label>' +
              '<button class="wx-toolbar-btn' + (fileAccessEnabled ? ' active' : '') + '" id="hm-file-access-btn" title="' + (fileAccessEnabled ? t('engine.fileAccessOn') : t('engine.fileAccessOff')) + '">📎 <span>' + t('engine.fileAccess') + '</span></button>' +
              '<button class="wx-toolbar-btn" id="wx-search-btn" title="搜索会话">🔍</button>' +
            '</div>' +
            '<div class="wx-search-bar" id="wx-search-bar" style="display:none">' +
              '<div class="wx-search-input-wrap">' +
                '<span style="color:#666;font-size:12px">🔍</span>' +
                '<input type="text" class="wx-search-input" id="wx-search-input" placeholder="搜索消息内容..." />' +
                '<span class="wx-search-clear" id="wx-search-clear" style="cursor:pointer;color:#999;display:none">×</span>' +
              '</div>' +
              '<div class="wx-search-count" id="wx-search-count" style="font-size:11px;color:#888;padding:2px 4px"></div>' +
            '</div>' +
            '<div class="wx-textarea-wrap">' +
              '<textarea id="hm-chat-input" class="wx-chat-input" rows="1" placeholder="输入消息，/ 开头使用快捷指令..."' +
                (pendingImages.length > 0 ? ' style="padding-bottom:52px"' : '') + '></textarea>' +
            '</div>' +
            '<div class="wx-send-row">' +
              '<div class="wx-slash-menu hm-slash-menu' + (showSlash ? '' : ' hidden') + '" id="hm-slash-menu">' +
                SLASH_COMMANDS.filter(c => !slashFilter || c.cmd.toLowerCase().includes(slashFilter.toLowerCase()) || c.desc.includes(slashFilter))
                  .map(c => '<div class="wx-slash-item" data-cmd="' + c.cmd + '"><span class="wx-slash-cmd">' + c.cmd + '</span><span class="wx-slash-desc">' + c.desc + '</span></div>').join('') +
                '</div>' +
              '<button id="hm-chat-send-btn" class="wx-send-btn" ' + (!gwOnline ? 'disabled title="' + t('engine.chatGatewayOffline') + '"' : '') + '>发送</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'

    // === bind() ===
    const input = el.querySelector('#hm-chat-input')
    const sendBtn = el.querySelector('#hm-chat-send-btn')

    input?.addEventListener('input', () => {
      const val = input.value
      if (val.startsWith('/')) { showSlash = true; slashFilter = val.slice(1); draw() } else { showSlash = false; el.querySelector('.hm-slash-menu')?.remove() }
      input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'
      const preview = el.querySelector('#wx-img-preview')
      if (preview) input.style.paddingBottom = preview.children.length > 0 ? '52px' : '8px'
      saveDraft()
    })

    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
      if (e.key === 'Escape') { showSlash = false; el.querySelector('.hm-slash-menu')?.classList.add('hidden') }
      if (e.ctrlKey && e.key === 'z') { undoLast() }
      if (e.ctrlKey && e.key === 'l') { const sbtn = el.querySelector('#wx-search-btn'); sbtn?.click() }
    })

    el.querySelector('.hm-slash-menu')?.addEventListener('click', (e) => {
      const item = e.target.closest('.wx-slash-item')
      if (item) { input.value = item.dataset.cmd + ' '; input.focus(); showSlash = false; el.querySelector('.hm-slash-menu')?.classList.add('hidden'); input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px' }
    })

    sendBtn?.addEventListener('click', sendMessage)

    el.querySelector('#wx-search-btn')?.addEventListener('click', () => {
      const bar = el.querySelector('#wx-search-bar')
      const si = el.querySelector('#wx-search-input')
      if (!bar) return
      if (bar.style.display === 'none') { bar.style.display = 'flex'; si?.focus() } else { bar.style.display = 'none'; highlightSearch('') }
    })

    el.querySelector('#wx-search-input')?.addEventListener('input', (e) => {
      const q = e.target.value.trim()
      highlightSearch(q)
      const count = document.querySelectorAll('.wx-search-hl').length
      const cntEl = el.querySelector('#wx-search-count')
      if (cntEl) cntEl.textContent = q ? (count > 0 ? '找到 ' + count + ' 处匹配' : '无匹配') : ''
      const clearBtn = el.querySelector('#wx-search-clear')
      if (clearBtn) clearBtn.style.display = q ? 'inline' : 'none'
    })

    el.querySelector('#wx-search-clear')?.addEventListener('click', () => {
      const si = el.querySelector('#wx-search-input')
      if (si) si.value = ''
      highlightSearch('')
      const cntEl = el.querySelector('#wx-search-count')
      if (cntEl) cntEl.textContent = ''
      const clearBtn = el.querySelector('#wx-search-clear')
      if (clearBtn) clearBtn.style.display = 'none'
    })

    el.querySelector('#wx-img-input')?.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || [])
      files.forEach(file => {
        const reader = new FileReader()
        reader.onload = (ev) => {
          const id = genId()
          pendingImages.push({ id, name: file.name, dataUrl: ev.target.result })
          const preview = el.querySelector('#wx-img-preview')
          if (preview) {
            const item = document.createElement('div'); item.className = 'wx-img-item'; item.dataset.id = id
            item.innerHTML = '<img src="' + ev.target.result + '" /><span class="wx-img-remove">×</span>'
            item.querySelector('.wx-img-remove')?.addEventListener('click', () => {
              pendingImages = pendingImages.filter(p => p.id !== id); item.remove()
              const remaining = el.querySelectorAll('.wx-img-item')
              if (input) input.style.paddingBottom = remaining.length > 0 ? '52px' : '8px'
            })
            preview.appendChild(item)
            if (input) input.style.paddingBottom = '52px'
          }
        }
        reader.readAsDataURL(file)
      })
      e.target.value = ''
    })

    el.querySelector('#hm-file-access-btn')?.addEventListener('click', async () => {
      fileAccessEnabled = !fileAccessEnabled
      localStorage.setItem(FILE_ACCESS_KEY, String(fileAccessEnabled))
      const btn = el.querySelector('#hm-file-access-btn')
      if (btn) { btn.classList.toggle('active', fileAccessEnabled); btn.title = fileAccessEnabled ? t('engine.fileAccessOn') : t('engine.fileAccessOff') }
      try { await api.hermesSetConfig({ file_access: fileAccessEnabled }) } catch (_) {}
    })

    el.querySelector('#hm-chat-model')?.addEventListener('click', (e) => {
      e.stopPropagation()
      showModelDropdown = !showModelDropdown
      const dd = el.querySelector('#wx-model-dd')
      if (dd) dd.style.display = showModelDropdown ? 'block' : 'none'
    })

    el.querySelector('#wx-model-dd')?.addEventListener('click', async (e) => {
      const opt = e.target.closest('.wx-model-opt')
      if (!opt) return
      const model = opt.dataset.model
      if (!model) return
      try {
        await api.hermesSetConfig({ model })
        currentModel = model; showModelDropdown = false
        const chip = el.querySelector('#hm-chat-model')
        if (chip) chip.innerHTML = '🤖 ' + escHtml(model)
        const dd = el.querySelector('#wx-model-dd')
        if (dd) dd.style.display = 'none'
        el.querySelectorAll('.wx-model-opt').forEach(o => o.classList.toggle('active', o.dataset.model === model))
      } catch (_) {}
    })

    document.addEventListener('click', () => { if (showModelDropdown) { showModelDropdown = false; const dd = el.querySelector('#wx-model-dd'); if (dd) dd.style.display = 'none' } })

    el.querySelector('.wx-sidebar-sessions')?.addEventListener('click', (e) => {
      const item = e.target.closest('.wx-session-item')
      if (!item) return
      const sid = item.dataset.sid
      if (sid === activeId) return
      activeId = sid; clearDraft(); pendingImages = []; quotedMsgId = null; quotedText = null
      el.querySelectorAll('.wx-session-item').forEach(el2 => el2.classList.toggle('active', el2.dataset.sid === sid))
      loadDraft(); draw()
    })

    el.querySelector('.wx-new-btn')?.addEventListener('click', () => { newSession(); pendingImages = []; quotedMsgId = null; quotedText = null; clearDraft(); draw() })

    el.querySelector('.wx-messages')?.addEventListener('click', (e) => {
      const replyBtn = e.target.closest('.wx-msg-action-reply')
      if (replyBtn) {
        const msgItem = replyBtn.closest('.wx-msg-item')
        const bubble = msgItem?.querySelector('.wx-bubble-content')
        if (bubble) { const text = bubble.textContent || ''; setQuote(msgItem.dataset.msgId, text.slice(0, 200)); input?.focus() }
      }
      const copyBtn = e.target.closest('.wx-msg-action-copy')
      if (copyBtn) {
        const msgItem = copyBtn.closest('.wx-msg-item')
        const bubble = msgItem?.querySelector('.wx-bubble-content')
        if (bubble) { navigator.clipboard?.writeText(bubble.textContent || '').catch(() => {}) }
      }
    })

    const msgsEl = el.querySelector('#hm-chat-msgs')
    if (msgsEl) {
      const observer = new MutationObserver(() => {
        msgsEl.scrollTop = msgsEl.scrollHeight
      })
      observer.observe(msgsEl, { childList: true, subtree: true })
    }

    // === init() ===
    init()
    loadDraft()

    return el
  }
}