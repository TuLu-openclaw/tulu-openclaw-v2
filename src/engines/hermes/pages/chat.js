/**
 * Hermes Agent 对话页面
 * 通过 /v1/runs + SSE 事件流驱动，支持工具调用可视化和流式文本
 * 支持多会话管理、/xxx 快捷指令
 */
import { t } from '../../../lib/i18n.js'
import { api } from '../../../lib/tauri-api.js'
import { PROVIDER_PRESETS } from '../../../lib/model-presets.js'

const STORAGE_KEY = 'hermes_chat_sessions'
const FILE_ACCESS_KEY = 'hermes_chat_file_access'
const SLASH_COMMANDS = [
  { cmd: '/help',    desc: '显示可用命令' },
  { cmd: '/status',  desc: '查看 Agent 状态' },
  { cmd: '/memory',  desc: '管理记忆' },
  { cmd: '/skills',  desc: '查看技能列表' },
  { cmd: '/clear',   desc: '清空当前会话' },
  { cmd: '/new',     desc: '新建会话' },
]

const TOOL_ICONS = {
  web_search: '🔍', browse: '🌐', web_browse: '🌐', google: '🔍',
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
function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

// Lazy Tauri event listen (avoid top-level await for vite build)
let _listenFn = null
async function tauriListen(event, cb) {
  if (!_listenFn) {
    const mod = await import('@tauri-apps/api/event')
    _listenFn = mod.listen
  }
  return _listenFn(event, cb)
}

// --- Session persistence ---
function loadSessions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function saveSessions(sessions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}
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
  let currentModel = ''       // 当前模型名
  let modelList = []          // 已获取的模型列表
  let showModelDropdown = false
  let fileAccessEnabled = localStorage.getItem(FILE_ACCESS_KEY) === 'true'

  // 流式状态
  let pendingText = ''       // 累积的 delta 文本
  let activeTools = []       // 当前活跃的工具调用 [{ name, status, detail, input, output, error }]
  let unlisteners = []       // Tauri 事件监听取消函数
  let lastSSEActivity = Date.now()
  let reconnectAttempts = 0
  const MAX_RECONNECT = 3
  const SSE_TIMEOUT_MS = 30000
  let heartbeatTimer = null
  let reconnectToast = null
  let toolProgress = { total: 0, done: 0 }
  let pendingImages = []
  let quotedMsgId = null

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
    // Load current model config
    try {
      const cfg = await api.hermesReadConfig()
      if (cfg?.model) currentModel = cfg.model
      if (cfg?.base_url && cfg?.api_key) {
        // Pre-fetch model list for quick switch
        try {
          const base = cfg.base_url.replace(/\/+$/, '').replace(/\/(chat\/completions|completions|responses|messages|models)\/?$/, '')
          const resp = await fetch(base + '/models', { headers: { 'Authorization': `Bearer ${cfg.api_key}` }, signal: AbortSignal.timeout(8000) })
          if (resp.ok) {
            const data = await resp.json()
            modelList = (data.data || []).map(m => m.id).filter(Boolean).sort()
          }
        } catch (_) {}
      }
    } catch (_) {}
    draw()
  }

  // --- 工具调用卡片渲染 ---
  function formatToolData(data) {
    if (!data) return ''
    if (typeof data === 'string') {
      // 尝试解析 JSON 以美化显示
      try { const obj = JSON.parse(data); return JSON.stringify(obj, null, 2) } catch { return data }
    }
    return JSON.stringify(data, null, 2)
  }

  function renderToolCard(t, collapsed = true) {
    if (!t) return ''
    const icon = toolIcon(t.name)
    const statusCls = t.status === 'complete' ? 'done' : t.status === 'error' ? 'err' : 'active'
    const statusText = t.status === 'complete' ? '✓ 完成' : t.status === 'error' ? '✗ 失败' : '⟳ 运行中'
    const detail = t.detail && t.detail !== '失败' && t.detail !== '完成' ? ` — ${escHtml(t.detail)}` : ''
    const inputStr = formatToolData(t.input)
    const outputStr = formatToolData(t.output)
    const errorStr = t.error ? (typeof t.error === 'string' ? t.error : JSON.stringify(t.error)) : ''
    // fallback: 用 raw 快照显示原始事件数据
    const rawStr = (!inputStr && !outputStr && !errorStr) ? formatToolData(t._raw || t._rawCompleted) : ''
    const hasDetails = inputStr || outputStr || errorStr || rawStr
    const cardId = 'tc-' + genId()
    let detailsHtml = ''
    if (hasDetails) {
      detailsHtml = `<div class="hm-tool-details" id="${cardId}-details" style="${collapsed ? 'display:none' : ''}">
        ${inputStr ? `<div class="hm-tool-section"><div class="hm-tool-section-label">输入</div><pre class="hm-tool-pre">${escHtml(inputStr)}</pre></div>` : ''}
        ${errorStr ? `<div class="hm-tool-section hm-tool-section-err"><div class="hm-tool-section-label">错误</div><pre class="hm-tool-pre">${escHtml(errorStr)}</pre></div>` : ''}
        ${outputStr ? `<div class="hm-tool-section"><div class="hm-tool-section-label">输出</div><pre class="hm-tool-pre">${escHtml(outputStr)}</pre></div>` : ''}
        ${rawStr ? `<div class="hm-tool-section"><div class="hm-tool-section-label">详情</div><pre class="hm-tool-pre">${escHtml(rawStr)}</pre></div>` : ''}
      </div>`
    }
    return `<div class="hm-tool-card ${statusCls}" data-tool-card="${cardId}">
      <div class="hm-tool-card-header">${icon} <span class="hm-tool-name">${escHtml(t.name || 'tool')}</span><span class="hm-tool-status">${statusText}${detail}</span>${hasDetails ? `<span class="hm-tool-toggle">▶</span>` : ''}</div>
      ${detailsHtml}
    </div>`
  }

  // --- 增量更新流式区域（避免全量 draw 导致闪烁）---
  function updateStreamArea() {
    const msgsEl = el.querySelector('#hm-chat-msgs')
    if (!msgsEl) return
    let streamEl = msgsEl.querySelector('.hm-stream-area')
    if (!streaming) {
      if (streamEl) streamEl.remove()
      return
    }
    if (!streamEl) {
      streamEl = document.createElement('div')
      streamEl.className = 'hm-stream-area'
      msgsEl.appendChild(streamEl)
    }
    const toolsHtml = (activeTools || []).map(t => renderToolCard(t, false)).join('')
    const textHtml = pendingText
      ? `<div class="hermes-chat-msg assistant"><div class="hermes-chat-bubble assistant">${mdToHtml(pendingText)}</div></div>`
      : (activeTools.length === 0 ? `<div class="hermes-chat-msg assistant"><div class="hermes-chat-bubble assistant"><span class="hermes-chat-typing">${t('engine.chatThinking')}</span></div></div>` : '')
    const toolStatus = toolProgress.total > 0 ? '<div class=wx-stream-status>🔄 正在执行 ' + toolProgress.done + ' / ' + toolProgress.total + ' 个工具...</div>' : ''
    streamEl.innerHTML = toolStatus + toolsHtml + textHtml
    msgsEl.scrollTop = msgsEl.scrollHeight
  }

  // --- Draw ---
  function draw() {
    const cur = active()
    const msgs = cur?.messages || []
    const title = sessionTitle(cur)
    el.innerHTML = `
      <div class="hm-chat-wx">
        <!-- 侧边栏 -->
        <div class="hm-chat-sidebar wx-sidebar">
          <div class="wx-sidebar-header">
            <div class="wx-sidebar-logo">🌾</div>
            <div class="wx-sidebar-info">
              <div class="wx-sidebar-name">Hermes</div>
              <div class="wx-sidebar-sub">AI Agent</div>
            </div>
          </div>
          <div class="wx-sidebar-sessions">
            ${sessions.map(s => `
              <div class="wx-session-item ${s.id === activeId ? 'active' : ''}" data-sid="${s.id}">
                <div class="wx-session-avatar">${s.id === activeId ? '💬' : '🗣️'}</div>
                <div class="wx-session-body">
                  <div class="wx-session-title" data-idx="${s.id}">${escHtml(sessionTitle(s))}</div>
                  <div class="wx-session-time">${s.updated ? formatTime(s.updated) : ''}</div>
                </div>
                <button class="wx-session-del" data-del="${s.id}" title="删除会话">X</button>
              </div>
            `).join('')}
          </div>
          <div class="wx-sidebar-footer">
            <button class="wx-icon-btn wx-new-btn" title="${t('engine.chatNewSession')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M12 5v14M5 12h14"/></svg>
            </button>
            <a href="#/h/dashboard" class="wx-icon-btn" title="${t('engine.dashModelConfig')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
            </a>
          </div>
        </div>

        <!-- 主聊天区 -->
        <div class="hm-chat-main wx-main">
          <!-- 顶部栏 -->
          <div class="wx-chat-topbar">
            <div class="wx-topbar-title">${escHtml(title)}</div>
            <div class="wx-topbar-right">
              <div class="wx-model-chip" id="hm-chat-model" title="${t('engine.configModel')}">
                🤖 ${escHtml(currentModel)}
              </div>
              ${modelList.length ? `
                <div class="wx-model-dropdown" id="wx-model-dd">
                  ${modelList.map(m => `<div class="wx-model-opt${m === currentModel ? ' active' : ''}" data-model="${escHtml(m)}">${escHtml(m)}</div>`).join('')}
                </div>
              ` : ''}
            </div>
          </div>

          <!-- 消息区 -->
          <div class="wx-messages" id="hm-chat-msgs">
            ${msgs.length === 0 ? `
              <div class="wx-empty-hint">
                <div class="wx-empty-icon">💬</div>
                <div>${t('engine.chatEmptyHint')}</div>
              </div>
            ` : ''}
            ${msgs.map(m => renderMessage(m)).join('')}
          </div>

          <!-- 输入区 -->
          <div class="wx-input-area">
            ${!gwOnline ? `<div class="wx-gw-offline">${t('engine.chatGatewayOffline')}</div>` : ''}
            <div class="wx-input-toolbar">
              <button class="wx-toolbar-btn" id="hm-file-access-btn" title="${fileAccessEnabled ? t('engine.fileAccessOn') : t('engine.fileAccessOff')}">
                📎 <span>${t('engine.fileAccess')}</span>
              </button>
              <button class="wx-toolbar-btn" id="wx-img-upload-btn" title="上传图片">IMG</button>
              <input type="file" id="wx-img-input" accept="image/*" multiple style="display:none" />
            </div>
            <div id="wx-img-preview" style="padding:4px 8px;gap:4px;display:flex;flex-wrap:wrap;"></div>
            <div class="wx-input-row">
              <textarea id="hm-chat-input" class="wx-input" rows="1" placeholder="${t('engine.chatPlaceholder')}" ${!gwOnline ? 'disabled' : ''}></textarea>
              <button class="wx-send-btn" id="hm-chat-send-btn" ${!gwOnline || streaming ? 'disabled' : ''}>${streaming ? '<span class="wx-sending">发送中</span>' : '发送'}</button>
            </div>
          </div>
        </div>
      </div>
    `
    bind()
    if (streaming) updateStreamArea()
    scrollToBottom()
  }

  // ── WeChat 风格消息渲染 ───────────────────────────────
  function renderMessage(m) {
    if (!m) return ''
    const isUser = m.role === 'user'
    if (m.role === 'tool-summary') {
      if (!Array.isArray(m.tools)) return ''
      return `<div class="wx-tool-summary">${m.tools.map(t => renderToolCard(t, true)).join('')}</div>`
    }
    const avatar = isUser
      ? `<div class="wx-avatar wx-avatar-me">🐰</div>`
      : `<div class="wx-avatar wx-avatar-ai">🤖</div>`
    const bubble = isUser
      ? `<div class="wx-bubble wx-bubble-me"><div class="wx-bubble-content">${escHtml(m.content)}</div></div>`
      : `<div class="wx-bubble wx-bubble-ai"><div class="wx-bubble-content">${mdToHtml(m.content)}</div></div>`
    return `<div class="wx-msg-row ${isUser ? 'wx-msg-me' : 'wx-msg-ai'}">${isUser ? '' : avatar}${bubble}${isUser ? avatar : ''}</div>`
  }

  // ── 流式区域更新（微信气泡风格）────────────────────────
  function updateStreamArea() {
    const msgsEl = el.querySelector('#hm-chat-msgs')
    if (!msgsEl) return
    let streamEl = msgsEl.querySelector('.wx-stream-area')
    if (!streaming) {
      if (streamEl) streamEl.remove()
      return
    }
    if (!streamEl) {
      streamEl = document.createElement('div')
      streamEl.className = 'wx-stream-area'
      msgsEl.appendChild(streamEl)
    }
    const toolsHtml = (activeTools || []).map(t => renderToolCard(t, false)).join('')
    let textHtml = ''
    if (pendingText) {
      textHtml = `<div class="wx-msg-row wx-msg-ai"><div class="wx-avatar wx-avatar-ai">🤖</div><div class="wx-bubble wx-bubble-ai"><div class="wx-bubble-content">${mdToHtml(pendingText)}</div></div></div>`
    } else if (activeTools.length === 0) {
      textHtml = `<div class="wx-msg-row wx-msg-ai"><div class="wx-avatar wx-avatar-ai">🤖</div><div class="wx-bubble wx-bubble-ai wx-typing-bubble"><div class="wx-bubble-content"><span class="wx-dots"><span></span><span></span><span></span></span></div></div></div>`
    }
    streamEl.innerHTML = toolsHtml + textHtml
    msgsEl.scrollTop = msgsEl.scrollHeight
  }

  // ── 工具卡片（微信卡片风格）───────────────────────────
  function renderToolCard(t, compact) {
    if (!t) return ''
    const cardId = 'tc_' + Math.random().toString(36).slice(2, 8)
    const icon = toolIcon(t.name || '')
    const statusText = t.status === 'active' ? '⏳ ' : (t.error ? '❌ ' : '✅ ')
    const statusCls = t.error ? 'err' : (t.status === 'active' ? 'active' : 'ok')
    const detail = t.detail ? ` — ${escHtml(String(t.detail).slice(0, 60))}` : ''
    const hasDetails = !!(t.input || t.output || t.error)
    let detailsHtml = ''
    if (hasDetails) {
      detailsHtml = `<div class="hm-tool-details" style="display:none">
        ${t.input ? `<div class="hm-tool-detail-row"><span class="hm-tool-detail-label">输入:</span><pre class="hm-tool-detail-pre">${escHtml(typeof t.input === 'string' ? t.input : JSON.stringify(t.input, null, 2))}</pre></div>` : ''}
        ${t.output ? `<div class="hm-tool-detail-row"><span class="hm-tool-detail-label">输出:</span><pre class="hm-tool-detail-pre">${escHtml(String(t.output).slice(0, 2000))}</pre></div>` : ''}
        ${t.error ? `<div class="hm-tool-detail-row"><span class="hm-tool-detail-label">错误:</span><pre class="hm-tool-detail-pre hm-tool-error">${escHtml(t.error)}</pre></div>` : ''}
      </div>`
    }
    if (compact) {
      return `<div class="wx-tool-chip wx-tool-${statusCls}">${icon} ${escHtml(t.name || 'tool')}${t.error ? ' ❌' : ' ✅'}</div>`
    }
    return `<div class="wx-tool-card wx-tool-${statusCls}" data-tool-card="${cardId}">
      <div class="wx-tool-header">${icon} <span class="wx-tool-name">${escHtml(t.name || 'tool')}</span><span class="wx-tool-status">${statusText}${detail}</span>${hasDetails ? `<span class="wx-tool-toggle">▶</span>` : ''}</div>
      ${detailsHtml}
    </div>`
  }

  // ── 侧边栏时间格式化 ──────────────────────────────────
  function formatTime(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    const now = new Date()
    const diff = now - d
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
    if (d.toDateString() === now.toDateString()) {
      return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
    }
    return `${d.getMonth()+1}/${d.getDate()}`
  }

  function renderSlashMenu() {
    const cmds = SLASH_COMMANDS.filter(c => !slashFilter || c.cmd.includes(slashFilter))
    if (!cmds.length) return ''
    return `<div class="hm-slash-menu">${cmds.map(c =>
      `<div class="hm-slash-item" data-cmd="${c.cmd}"><span class="hm-slash-cmd">${c.cmd}</span><span class="hm-slash-desc">${c.desc}</span></div>`
    ).join('')}</div>`
  }

  function scrollToBottom() {
    const msgsEl = el.querySelector('#hm-chat-msgs')
    if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight
  }

  // 事件委托：工具卡片展开/折叠（对静态和动态流式卡片都生效）
  el.addEventListener('click', (e) => {
    const header = e.target.closest('.hm-tool-card-header')
    if (!header) return
    const card = header.closest('.hm-tool-card')
    const details = card?.querySelector('.hm-tool-details')
    const toggle = header.querySelector('.hm-tool-toggle')
    if (details) {
      const open = details.style.display !== 'none'
      details.style.display = open ? 'none' : 'block'
      if (toggle) toggle.textContent = open ? '▶' : '▼'
    }
  })

  function bind() {
    // Model quick-switch (微信顶栏 chip 风格)
    const modelChip = el.querySelector('#hm-chat-model')
    const modelDd = el.querySelector('#wx-model-dd')
    modelChip?.addEventListener('click', (e) => {
      e.stopPropagation()
      showModelDropdown = !showModelDropdown
      if (modelDd) modelDd.style.display = showModelDropdown ? 'block' : 'none'
    })
    el.querySelectorAll('.wx-model-opt').forEach(opt => {
      opt.addEventListener('click', async () => {
        const m = opt.dataset.model
        if (m && m !== currentModel) {
          try { await api.hermesUpdateModel(m); currentModel = m } catch (_) {}
        }
        showModelDropdown = false
        if (modelDd) modelDd.style.display = 'none'
        draw()
      })
    })
    document.addEventListener('click', (e) => {
      if (showModelDropdown && modelChip && !modelChip.contains(e.target) && modelDd && !modelDd.contains(e.target)) {
        showModelDropdown = false
        if (modelDd) modelDd.style.display = 'none'
      }
    })
    // File access toggle
    el.querySelector('#hm-file-access-btn')?.addEventListener('click', () => {
      fileAccessEnabled = !fileAccessEnabled
      localStorage.setItem(FILE_ACCESS_KEY, fileAccessEnabled ? 'true' : 'false')
      draw()
    })

    // Session sidebar
    el.querySelector('.wx-new-btn')?.addEventListener('click', () => { newSession(); draw() })
    el.querySelectorAll('.wx-session-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const delBtn = e.target.closest('.wx-session-del')
        if (delBtn) {
          e.stopPropagation()
          const sid = delBtn.dataset.del
          if (!sid || !confirm('删除该会话？')) return
          sessions = sessions.filter(s => s.id !== sid)
          if (activeId === sid) { activeId = sessions[0]?.id || null }
          saveSessions(sessions)
          draw()
          return
        }
        activeId = item.dataset.sid
        loadDraft()
        draw()
      })

      // Double-click to rename
      item.querySelector('.wx-session-title')?.addEventListener('dblclick', (e) => {
        e.stopPropagation()
        const titleEl = e.currentTarget
        titleEl.contentEditable = true
        titleEl.focus()
        const range = document.createRange()
        range.selectNodeContents(titleEl)
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
        const finish = () => {
          const sid = item.dataset.sid
          const newTitle = titleEl.textContent.trim()
          const sess = sessions.find(s => s.id === sid)
          if (sess && newTitle) { sess.title = newTitle; saveSessions(sessions) }
          titleEl.contentEditable = false
          titleEl.removeEventListener('blur', finish)
          titleEl.removeEventListener('keydown', onKey)
        }
        const onKey = (ev) => {
          if (ev.key === 'Enter') { ev.preventDefault(); titleEl.blur() }
          if (ev.key === 'Escape') {
            titleEl.textContent = sessionTitle(sessions.find(s => s.id === item.dataset.sid))
            titleEl.blur()
          }
        }
        titleEl.addEventListener('blur', finish)
        titleEl.addEventListener('keydown', onKey)
      })
    })

    // ── 图片上传 ──
    el.querySelector('#wx-img-input')?.addEventListener('change', (e) => {
      const files = e.target.files
      if (!files) return
      const preview = el.querySelector('#wx-img-preview')
      Array.from(files).forEach(file => {
        const reader = new FileReader()
        reader.onload = (ev) => {
          pendingImages.push({ name: file.name, dataUrl: ev.target.result })
          const thumb = document.createElement('div')
          thumb.className = 'wx-img-thumb'
          thumb.innerHTML = '<img src="' + ev.target.result + '" /><span class="wx-img-remove" data-idx="' + (pendingImages.length - 1) + '">×</span>'
          thumb.querySelector('.wx-img-remove')?.addEventListener('click', () => {
            const idx = parseInt(thumb.querySelector('.wx-img-remove').dataset.idx)
            pendingImages.splice(idx, 1)
            thumb.remove()
          })
          preview?.appendChild(thumb)
        }
        reader.readAsDataURL(file)
      })
      e.target.value = ''
    })

    // ── 搜索 ──
    el.querySelector('#wx-search-btn')?.addEventListener('click', () => {
      const bar = el.querySelector('#wx-search-bar')
      if (bar) bar.style.display = bar.style.display === 'none' ? 'flex' : 'none'
      if (bar?.style.display === 'flex') el.querySelector('#wx-search-input')?.focus()
    })
    el.querySelector('#wx-search-clear')?.addEventListener('click', () => {
      const inp = el.querySelector('#wx-search-input')
      if (inp) inp.value = ''
      highlightSearch(null)
    })
    el.querySelector('#wx-search-input')?.addEventListener('input', (e) => {
      highlightSearch(e.target.value.trim() || null)
    })
    function highlightSearch(q) {
      document.querySelectorAll('.wx-search-hl').forEach(hl => {
        const p = hl.parentNode
        while (hl.firstChild) p.insertBefore(hl.firstChild, hl)
        p.removeChild(hl)
      })
      if (!q) return
      document.querySelectorAll('.wx-bubble-content').forEach(bubble => {
        const html = bubble.innerHTML
        const idx = html.toLowerCase().indexOf(q.toLowerCase())
        if (idx >= 0) {
          bubble.innerHTML = html.slice(0, idx) + '<mark class=wx-search-hl>' + html.slice(idx, idx + q.length) + '</mark>' + html.slice(idx + q.length)
        }
      })
    }

    // ── 消息操作（事件委托） ──
    el.querySelector('#hm-chat-msgs')?.addEventListener('click', (e) => {
      const msgRow = e.target.closest('.wx-msg-row')
      if (!msgRow) return
      const bubble = msgRow.querySelector('.wx-bubble-content')
      const text = bubble?.textContent || ''
      const msgId = msgRow.dataset.msgId
      if (e.target.closest('.wx-msg-action-reply')) setQuote(msgId, text)
      else if (e.target.closest('.wx-msg-action-copy')) navigator.clipboard.writeText(text).catch(() => {})
    })

    // ── Ctrl+Z 撤销快捷键 ──
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        const tag = document.activeElement?.tagName
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); undoLast() }
      }
    })

    loadDraft()

    // Slash menu clicks
    el.querySelectorAll('.hm-slash-item').forEach(item => {
      item.addEventListener('click', () => {
        const input = el.querySelector('#hm-chat-input')
        if (input) { input.value = item.dataset.cmd + ' '; input.focus() }
        showSlash = false
        draw()
      })
    })

    // Send
    el.querySelector('#hm-chat-send-btn')?.addEventListener('click', sendMessage)
    const input = el.querySelector('#hm-chat-input')
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
        if (e.key === 'Escape') { showSlash = false; draw() }
      })
      input.addEventListener('input', () => {
        input.style.height = 'auto'
        input.style.height = Math.min(input.scrollHeight, 120) + 'px'
        const val = input.value
        if (val.startsWith('/') && !val.includes(' ')) {
          showSlash = true; slashFilter = val
          const parent = input.closest('.wx-input-area')
          if (parent) {
            const existing = parent.querySelector('.hm-slash-menu')
            if (existing) existing.remove()
            const cmds = SLASH_COMMANDS.filter(c => c.cmd.includes(val))
            if (cmds.length) {
              const div = document.createElement('div')
              div.className = 'hm-slash-menu'
              div.innerHTML = cmds.map(c =>
                `<div class="hm-slash-item" data-cmd="${c.cmd}"><span class="hm-slash-cmd">${c.cmd}</span><span class="hm-slash-desc">${c.desc}</span></div>`
              ).join('')
              div.querySelectorAll('.hm-slash-item').forEach(item => {
                item.addEventListener('click', () => {
                  input.value = item.dataset.cmd + ' '
                  input.focus()
                  showSlash = false
                  div.remove()
                })
              })
              parent.prepend(div)
            }
          }
        } else if (showSlash) {
          showSlash = false
          el.querySelector('.hm-slash-menu')?.remove()
        }
      })
      input.focus()
    }
  }

  // --- 清理事件监听 ---
  function cleanupListeners() {
    for (const fn of unlisteners) fn()
    unlisteners = []
  }

  // --- 设置 Tauri 事件监听 ---
  async function setupRunListeners() {
    cleanupListeners()
    const u1 = await tauriListen('hermes-run-delta', (e) => {
      lastSSEActivity = Date.now(); reconnectAttempts = 0
      pendingText += e.payload?.delta || ''
      updateStreamArea()
    })
    const u2 = await tauriListen('hermes-run-tool', (e) => {
      lastSSEActivity = Date.now(); reconnectAttempts = 0
      const evt = e.payload || {}
      const evtType = evt.event || ''
      const toolName = evt.tool || evt.tool_name || evt.name || 'tool'
      const preview = evt.preview || evt.detail || evt.message || ''
      // 提取 input/output 时兼容多种字段名
      const extractData = (obj, keys) => {
        for (const k of keys) {
          if (obj[k] != null && obj[k] !== '') return obj[k]
        }
        return null
      }
      // 构建去掉元字段后的 raw 快照，作为 fallback
      const rawSnapshot = (exclude) => {
        const copy = {}
        for (const [k, v] of Object.entries(evt)) {
          if (!exclude.includes(k) && v != null && v !== '') copy[k] = v
        }
        return Object.keys(copy).length ? copy : null
      }
      if (evtType === 'tool.started') {
        if (!toolName || toolName === 'tool') {
          // 无效工具名，跳过（防止渲染崩溃）
          console.warn('[Hermes] tool.started with invalid name:', evt)
        } else {
          activeTools.push({ name: toolName, status: 'active', detail: preview, input: inputData, output: null, error: null, _raw: rawSnapshot(['event', 'tool', 'tool_name', 'name']) })
        }
      } else if (evtType === 'tool.completed') {
        const t = activeTools.find(t => t.name === toolName && t.status === 'active')
        if (t) {
          t.status = evt.error ? 'error' : 'complete'
          t.detail = evt.error ? '失败' : (evt.duration ? `${evt.duration}s` : '完成')
          t.output = extractData(evt, ['output', 'result', 'content', 'data', 'response'])
          if (evt.error) t.error = typeof evt.error === 'string' ? evt.error : JSON.stringify(evt.error)
          // 合并 started 时可能没有的 input
          if (!t.input) t.input = extractData(evt, ['input', 'args', 'arguments', 'parameters', 'params'])
          t._rawCompleted = rawSnapshot(['event', 'tool', 'tool_name', 'name', 'error', 'duration'])
        }
      } else if (evtType === 'tool.error') {
        const t = activeTools.find(t => t.name === toolName && t.status === 'active')
        if (t) {
          t.status = 'error'
          t.detail = preview || '失败'
          t.error = evt.error || preview || '未知错误'
        }
      } else if (evtType === 'tool.progress') {
        const t = activeTools.find(t => t.name === toolName && t.status === 'active')
        if (t && preview) t.detail = preview
      }
      updateStreamArea()
    })
    const u3 = await tauriListen('hermes-run-done', (e) => {
      stopHB(); hideToast()
      const cur = active()
      if (!cur) return
      const output = e.payload?.output || pendingText || '(empty)'
      // 存储工具摘要（含输入输出详情）
      if (activeTools.length > 0) {
        const validTools = activeTools.filter(t => t && t.name)
        if (validTools.length > 0) {
          cur.messages.push({ role: 'tool-summary', tools: validTools.map(t => ({
            name: t.name, status: t.status, detail: t.detail,
            input: t.input, output: t.output, error: t.error,
            _raw: t._raw, _rawCompleted: t._rawCompleted
          })) })
        }
      }
      cur.messages.push({ role: 'assistant', content: output })
      streaming = false
      pendingText = ''
      activeTools = []
      saveSessions(sessions)
      cleanupListeners()
      draw()
    })
    const u4 = await tauriListen('hermes-run-error', (e) => {
      stopHB(); hideToast()
      const cur = active()
      if (!cur) return
      const err = e.payload?.error || 'unknown error'
      cur.messages.push({ role: 'assistant', content: `⚠️ Agent 运行失败: ${escHtml(err)}` })
      streaming = false
      pendingText = ''
      activeTools = []
      saveSessions(sessions)
      cleanupListeners(); updateTP(0, 0)
      draw()
    })
    unlisteners.push(u1, u2, u3, u4)
  }

  async function sendMessage() {
    const input = el.querySelector('#hm-chat-input')
    const text = input?.value?.trim()
    if (!text || streaming) return

    const cur = active()
    if (!cur) return

    // 本地命令处理（不走 Gateway）
    if (text === '/clear') {
      cur.messages = []; cur.title = ''
      saveSessions(sessions)
      input.value = ''; draw(); return
    }
    if (text === '/new') {
      newSession(); input.value = ''; draw(); return
    }
    if (text === '/help') {
      cur.messages.push({ role: 'user', content: text })
      cur.messages.push({ role: 'assistant', content:
        '**可用命令：**\n' +
        '`/help` — 显示此帮助\n' +
        '`/status` — 查看 Gateway 状态\n' +
        '`/memory` — 管理 Agent 记忆\n' +
        '`/skills` — 查看可用技能\n' +
        '`/clear` — 清空当前会话\n' +
        '`/new` — 新建会话\n\n' +
        '直接输入问题即可与 Hermes Agent 对话。'
      })
      saveSessions(sessions)
      input.value = ''; draw(); return
    }
    if (text === '/status') {
      input.value = ''
      cur.messages.push({ role: 'user', content: text })
      try {
        const info = await api.checkHermes()
        const gw = info?.gatewayRunning ? '✅ 运行中' : '❌ 未运行'
        const model = info?.model || '-'
        const port = info?.gatewayPort || 8642
        cur.messages.push({ role: 'assistant', content:
          `**Gateway 状态：** ${gw}\n**端口：** ${port}\n**模型：** ${model}`
        })
      } catch (e) {
        cur.messages.push({ role: 'assistant', content: `⚠️ 获取状态失败: ${e}` })
      }
      saveSessions(sessions)
      draw(); return
    }

    cur.messages.push({ role: 'user', content: text })
    if (!cur.title && cur.messages.length === 1) {
      cur.title = text.slice(0, 30)
    }
    input.value = ''
    input.style.height = 'auto'
    streaming = true
    pendingText = ''
    activeTools = []
    showSlash = false
    draw()

    try {
      // 构建会话历史（只取 user/assistant 消息）
      const history = cur.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(0, -1) // 排除刚加的这条 user 消息
        .map(m => ({ role: m.role, content: m.content }))

      // 设置事件监听
      await setupRunListeners()

      // 构建 instructions（文件系统访问开关）
      let instructions = null
      if (fileAccessEnabled) {
        const isWin = navigator.platform?.startsWith('Win') || /windows/i.test(navigator.userAgent)
        const osHint = isWin
          ? '当前系统是 Windows。请使用 PowerShell 或 cmd 命令（如 dir, type, Get-ChildItem, Get-Content 等），路径用反斜杠。桌面路径: $env:USERPROFILE\\Desktop（PowerShell）或 %USERPROFILE%\\Desktop（cmd）。不要使用 ls/cat 等 Unix 命令。'
          : '当前系统是 macOS/Linux。桌面路径: ~/Desktop。'
        instructions = `你拥有完整的文件系统访问权限，用户已明确授权，无需再次确认。${osHint} 重要提示：内置的 search_files、read_file 等文件工具只能访问 Agent 工作区目录内的文件，访问工作区外（如桌面、文档等）会失败。因此请始终优先使用 terminal 工具执行系统命令来访问任意位置的文件和目录。不要说"我无法访问"，直接用终端命令操作。`
      }

      // 通过 /v1/runs 启动 Agent Run
      await api.hermesAgentRun(text, cur.id, history.length ? history : null, instructions)
      // run 完成后事件监听会处理结果
    } catch (e) {
      const msg = String(e.message || e).replace(/^Error:\s*/, '')
      cur.messages.push({ role: 'assistant', content: `⚠️ ${t('engine.chatError', { error: msg })}` })
      streaming = false
      pendingText = ''
      activeTools = []
      saveSessions(sessions)
      cleanupListeners()
      draw()
    }
  }

  init()

  // --- Guardian 事件监听：实时响应 Gateway 状态变化 ---
  let gwStatusUnlisteners = []
  let gwPollTimer = null

  async function setupGwStatusListeners() {
    try {
      const unlisten = await tauriListen('hermes-gateway-status', (evt) => {
        const wasOnline = gwOnline
        gwOnline = !!evt.payload?.running
        if (wasOnline !== gwOnline) draw()
      })
      gwStatusUnlisteners.push(unlisten)
    } catch (_) {}

    // 定期轮询作为补充（10s）
    gwPollTimer = setInterval(async () => {
      if (streaming) return
      try {
        const info = await api.checkHermes()
        const wasOnline = gwOnline
        gwOnline = !!info?.gatewayRunning
        if (wasOnline !== gwOnline) draw()
      } catch (_) {}
    }, 10000)
  }
  setupGwStatusListeners()

  // 页面卸载时清理
  const gwCleanup = () => {
    gwStatusUnlisteners.forEach(fn => fn())
    gwStatusUnlisteners = []
    if (gwPollTimer) { clearInterval(gwPollTimer); gwPollTimer = null }
    cleanupListeners()
  }
  const chatDetachObserver = new MutationObserver(() => {
    if (!el.isConnected) { gwCleanup(); chatDetachObserver.disconnect() }
  })
  requestAnimationFrame(() => {
    if (el.parentNode) chatDetachObserver.observe(el.parentNode, { childList: true })
  })

  return el
}
