/**
 * Hermes Agent 记忆管理页面 — 对话式自动记忆 + 手动编辑双模式
 * 支持：对话式记忆聊天、自动摘要更新、记忆健康度分析、关键词提取
 */
import { t } from '../../../lib/i18n.js'
import { api } from '../../../lib/tauri-api.js'

function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function mdToHtml(text) {
  return (text || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, '<br>')
}
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }
function formatDate(ts) {
  if (!ts) return '未知'
  const d = new Date(ts), now = new Date(), diff = now - d
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前'
  if (diff < 604800000) return Math.floor(diff / 86400000) + ' 天前'
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0')
}
function wordCount(text) { return text ? text.trim().split(/\s+/).length : 0 }
function extractTopics(text) {
  const keywords = ['项目', '工作', '朋友', '家人', '偏好', '习惯', '技术', '学习', '旅行', '健康', '编程', 'AI', '游戏', '音乐', '电影', '书籍']
  return keywords.filter(k => text.includes(k))
}
function detectSections(text) {
  const sections = []
  const regex = /^#{1,3}\s+(.+)$/gm
  let m
  while ((m = regex.exec(text)) !== null) sections.push(m[1])
  return sections
}

let _listenFn = null
async function tauriListen(event, cb) {
  if (!_listenFn) { const mod = await import('@tauri-apps/api/event'); _listenFn = mod.listen }
  return _listenFn(event, cb)
}

const SYSTEM_PROMPT = `你是爱羽的记忆管理助手。你的职责是：
1. 当用户告诉你关于他们自己的事情时，自动总结关键信息写入 MEMORY.md
2. 用 ## 标题 组织不同类别（工作、偏好、人物、项目等）
3. 保持记忆简洁，每个条目不超过一句话
4. 如果用户要求查看记忆，给出清晰摘要
5. 只说实话，不编造信息
6. 如果用户说的内容与现有记忆矛盾，更新它而不是重复

当前 MEMORY.md 内容会提供给你作为上下文。`

export function render() {
  const el = document.createElement('div')
  el.className = 'hermes-memory-page hm-memory-v2'

  let mode = 'chat' // 'chat' | 'edit' | 'insights'
  let memoryContent = ''
  let userContent = ''
  let chatMessages = []
  let pendingText = ''
  let streaming = false
  let activeTools = []
  let loading = true
  let saving = false
  let gwOnline = false
  let currentModel = ''
  let modelList = []
  let showModelDropdown = false
  let unlisteners = []
  let lastSSEActivity = Date.now()
  let toolProgress = { total: 0, done: 0 }
  let pendingImages = []

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
    await loadAll()
  }

  async function loadAll() {
    loading = true; draw()
    try {
      const [mem, usr] = await Promise.all([
        api.hermesMemoryRead('memory'),
        api.hermesMemoryRead('user'),
      ])
      memoryContent = mem || ''
      userContent = usr || ''
    } catch (e) { console.error('Failed to load memory:', e) }
    loading = false; draw()
  }

  function saveDraft() {
    const inp = el.querySelector('#hm-chat-input')
    if (!inp) return
    sessionStorage.setItem('hermes_mem_draft', inp.value)
  }
  function loadDraft() {
    const inp = el.querySelector('#hm-chat-input')
    if (!inp) return
    const d = sessionStorage.getItem('hermes_mem_draft')
    if (d) { inp.value = d; inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 100) + 'px' }
  }
  function clearDraft() { sessionStorage.removeItem('hermes_mem_draft') }

  function updateMemTP(done, total) {
    toolProgress.done = done; toolProgress.total = total
    const fill = el?.querySelector('#hm-tool-fill')
    const txt = el?.querySelector('#hm-tool-progress-text')
    const bar = el?.querySelector('#hm-tool-progress')
    if (!bar) return
    if (total === 0) { bar.style.display = 'none'; return }
    bar.style.display = 'flex'
    if (fill) fill.style.width = (total > 0 ? Math.round(done / total * 100) : 0) + '%'
    if (txt) txt.textContent = done + ' / ' + total
    if (done >= total) setTimeout(() => { if (bar) bar.style.display = 'none' }, 800)
  }

  function renderToolCard(t) {
    if (!t) return ''
    const icon = t.name?.includes('memory') || t.name?.includes('write') ? '📝' : (t.name?.includes('read') ? '📖' : '🔧')
    const statusText = t.status === 'active' ? '◃ ' : (t.error ? '✗ ' : '✓ ')
    const statusCls = t.error ? 'err' : (t.status === 'active' ? 'active' : 'ok')
    const inputStr = t.input ? (typeof t.input === 'string' ? t.input : JSON.stringify(t.input, null, 2)) : ''
    const outputStr = t.output ? String(t.output).slice(0, 500) : ''
    const errorStr = t.error ? (typeof t.error === 'string' ? t.error : JSON.stringify(t.error)) : ''
    return '<div class="wx-tool-card wx-tool-' + statusCls + '">' +
      '<div class="hm-tool-card-header">' + icon + ' <span class="hm-tool-name">' + escHtml(t.name || 'tool') + '</span>' +
      '<span class="hm-tool-status">' + statusText + escHtml((errorStr || outputStr || '').slice(0, 80)) + '</span></div>' +
      (inputStr ? '<div class="hm-tool-details"><div class="hm-tool-section"><div class="hm-tool-section-label">输入</div><pre class="hm-tool-pre">' + escHtml(inputStr.slice(0, 300)) + '</pre></div></div>' : '') +
      '</div>'
  }

  function updateStreamArea() {
    const area = el.querySelector('#hm-mem-stream')
    if (!area) return
    if (!streaming) { area.innerHTML = ''; return }
    const toolsHtml = activeTools.map(t => renderToolCard(t)).join('')
    let textHtml = pendingText
      ? '<div class="hm-mem-stream-text">' + mdToHtml(pendingText) + '</div>'
      : '<div class="hm-mem-typing"><span class="wx-dots"><span></span><span></span><span></span></span> 思考中...</div>'
    area.innerHTML = toolsHtml + textHtml
    area.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  function addChatMsg(role, content, tools) {
    chatMessages.push({ role, content, tools: tools || null, ts: Date.now() })
    draw()
  }

  async function doMemoryChat(userText) {
    cleanupListeners()
    streaming = true; pendingText = ''; activeTools = []; toolProgress = { total: 0, done: 0 }; lastSSEActivity = Date.now(); updateStreamArea()
    const msgsEl = el.querySelector('#hm-chat-msgs')
    if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight

    let sseUrl, apiKey
    try {
      const cfg = await api.hermesReadConfig()
      if (!cfg?.base_url || !cfg?.api_key) throw new Error('no config')
      sseUrl = cfg.base_url.replace(/\/+$/, '') + '/v1/runs'
      apiKey = cfg.api_key
    } catch {
      streaming = false; pendingText = ''; activeTools = []; updateStreamArea()
      addChatMsg('assistant', '⚠️ 未配置 Hermes API，请先在设置中配置连接')
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
        activeTools.push({ _tmpId: pendingToolId, name: payload?.name || 'tool', input: payload?.input, status: 'active' })
        updateStreamArea()
      }
    })
    const onRunDone = await tauriListen('hermes-run-finished', async ({ payload }) => {
      if (!streaming) return
      streaming = false
      const finalText = payload?.text || payload?.content || pendingText || ''
      const finalTools = [...activeTools]
      cleanupListeners(); pendingText = ''; activeTools = []; updateStreamArea()
      addChatMsg('user', userText)
      if (finalText.trim()) addChatMsg('assistant', finalText, finalTools)
      // Refresh memory after agent update
      try {
        const mem = await api.hermesMemoryRead('memory')
        memoryContent = mem || ''
      } catch (_) {}
      draw()
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
            updateMemTP(doneCount, activeTools.length)
          }
          updateStreamArea()
        }
      }
    })
    const onError = await tauriListen('hermes-run-error', ({ payload }) => {
      streaming = false; pendingText = ''; activeTools = []
      cleanupListeners(); updateStreamArea()
      addChatMsg('assistant', '✗ 连接错误: ' + (payload?.error || '未知错误'))
    })
    unlisteners = [onRunDelta, onRunTool, onRunDone, onToolUpdate, onError]

    const history = chatMessages.slice(-10).map(m => ({ role: m.role, content: m.content }))
    const systemWithMem = SYSTEM_PROMPT + '\n\n=== 当前 MEMORY.md 内容 ===\n' + (memoryContent || '(空)') + '\n=== USER.md 内容 ===\n' + (userContent || '(空)')

    try {
      const body = { message: userText, stream: true, system_prompt: systemWithMem, ...(history.length ? { history } : {}) }
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
              pendingText = textBuffer; updateStreamArea()
            }
            if (parsed.done || parsed.status === 'done') {
              streaming = false
              const finalText = parsed.text || pendingText
              const finalTools = [...activeTools]
              cleanupListeners(); pendingText = ''; activeTools = []; updateStreamArea()
              addChatMsg('user', userText)
              if (finalText.trim()) addChatMsg('assistant', finalText, finalTools)
              try { const mem = await api.hermesMemoryRead('memory'); memoryContent = mem || '' } catch (_) {}
              draw()
            }
          } catch (_) {}
        }
        lastSSEActivity = Date.now()
      }
    } catch (err) {
      streaming = false; pendingText = ''; activeTools = []
      cleanupListeners(); updateStreamArea()
      addChatMsg('assistant', '✗ 请求失败: ' + err.message)
    }
  }

  function cleanupListeners() {
    unlisteners.forEach(fn => { try { fn() } catch (_) {} })
    unlisteners = []
  }

  async function sendMessage() {
    const input = el.querySelector('#hm-chat-input')
    if (!input || streaming) return
    const text = input.value.trim()
    if (!text) return
    input.value = ''; input.style.height = 'auto'; clearDraft()
    await doMemoryChat(text)
  }

  // ── Memory Health Stats ──────────────────────────────────────
  function memoryStats() {
    const wc = wordCount(memoryContent)
    const topics = extractTopics(memoryContent)
    const sections = detectSections(memoryContent)
    const userWc = wordCount(userContent)
    const age = memoryContent ? formatDate(Date.now() - memoryContent.length * 1000) : '未知'
    return { wc, topics, sections, userWc, age }
  }

  // ── Draw ─────────────────────────────────────────────────────
  function draw() {
    const stats = memoryStats()
    const insightsHtml = mode === 'insights' ? `
      <div class="hm-insights-panel">
        <div class="hm-insight-card">
          <div class="hm-insight-label">记忆规模</div>
          <div class="hm-insight-value">${stats.wc} <span class="hm-insight-unit">词</span></div>
        </div>
        <div class="hm-insight-card">
          <div class="hm-insight-label">USER 规模</div>
          <div class="hm-insight-value">${stats.userWc} <span class="hm-insight-unit">词</span></div>
        </div>
        <div class="hm-insight-card">
          <div class="hm-insight-label">已识别主题</div>
          <div class="hm-insight-topics">${stats.topics.length > 0 ? stats.topics.map(t => '<span class="hm-topic-tag">' + t + '</span>').join('') : '<span style="color:#888">暂无</span>'}</div>
        </div>
        <div class="hm-insight-card" style="grid-column:1/-1">
          <div class="hm-insight-label">章节结构</div>
          <div class="hm-insight-sections">${stats.sections.length > 0 ? stats.sections.map(s => '<div class="hm-section-item">📌 ' + escHtml(s) + '</div>').join('') : '<div style="color:#888;font-size:12px">无章节标题（建议用 ## 标题 组织记忆）</div>'}</div>
        </div>
        ${memoryContent ? '<div class="hm-insight-card" style="grid-column:1/-1"><div class="hm-insight-label">内容预览</div><div class="hm-insight-preview markdown-body">' + mdToHtml(memoryContent.slice(0, 500)) + (memoryContent.length > 500 ? '...' : '') + '</div></div>' : ''}
        <div class="hm-insight-actions">
          <button class="btn btn-sm" id="hm-auto-summarize">🧠 智能摘要</button>
          <button class="btn btn-sm btn-secondary" id="hm-import-chat">📥 导入聊天记录</button>
        </div>
      </div>` : ''

    const chatHtml = mode === 'chat' ? `
      <div class="hm-chat-messages" id="hm-chat-msgs">
        ${chatMessages.length === 0 ? `<div class="hm-chat-empty">
          <div class="hm-chat-empty-icon">🧠</div>
          <div class="hm-chat-empty-title">记忆对话</div>
          <div class="hm-chat-empty-hint">告诉我关于你的事情，我会自动帮你更新记忆。<br>比如说："我最近在学 Rust"，"我喜欢深色主题"</div>
        </div>` : chatMessages.map(m => `
          <div class="hm-msg-row ${m.role === 'user' ? 'hm-msg-me' : 'hm-msg-ai'}">
            ${m.role === 'ai' ? '<div class="wx-avatar wx-avatar-ai">🤖</div>' : ''}
            <div class="wx-bubble ${m.role === 'user' ? 'wx-bubble-me' : 'wx-bubble-ai'}">
              <div class="wx-bubble-content">${m.role === 'ai' ? mdToHtml(m.content) : escHtml(m.content)}</div>
              ${m.tools && m.tools.length > 0 ? '<div class="hm-tool-summary">' + m.tools.map(t => renderToolCard(t)).join('') + '</div>' : ''}
            </div>
            ${m.role === 'user' ? '<div class="wx-avatar wx-avatar-me">🐰</div>' : ''}
          </div>`).join('')}
        ${streaming ? '<div class="hm-msg-row hm-msg-ai" id="hm-mem-stream-row"><div class="wx-avatar wx-avatar-ai">🤖</div><div class="wx-bubble wx-bubble-ai"><div class="wx-bubble-content" id="hm-mem-stream"></div></div></div>' : ''}
      </div>
      <div class="hm-chat-input-area">
        <div class="wx-tool-progress" id="hm-tool-progress" style="display:none"><div class="wx-tool-progress-bar"><div class="wx-tool-progress-fill" id="hm-tool-fill"></div></div><div class="wx-tool-progress-text" id="hm-tool-progress-text">0 / 0</div></div>
        <div class="hm-input-wrap">
          <textarea id="hm-chat-input" class="wx-chat-input" rows="1" placeholder="告诉我关于你的事情，我会自动更新记忆..." ${streaming ? 'disabled' : ''}></textarea>
          <button id="hm-chat-send-btn" class="wx-send-btn" ${streaming || !gwOnline ? 'disabled' : ''}>${streaming ? '发送中...' : '发送'}</button>
        </div>
      </div>` : ''

    const editSections = [
      { key: 'memory', title: 'MEMORY.md — 长期记忆', icon: '📝', content: memoryContent },
      { key: 'user',   title: 'USER.md — 用户资料',   icon: '👤', content: userContent },
    ]
    const editHtml = mode === 'edit' ? editSections.map(s => `
      <div class="hm-edit-section">
        <div class="hm-edit-section-header">
          <span class="hm-edit-section-icon">${s.icon}</span>
          <span class="hm-edit-section-title">${s.title}</span>
        </div>
        <div class="hm-edit-wrap">
          <textarea class="hm-memory-editor" id="hm-editor-${s.key}" placeholder="在此编辑...">${escHtml(s.content)}</textarea>
          <div class="hm-edit-actions">
            <span class="hm-edit-wc">${wordCount(s.content)} 词</span>
            <button class="btn btn-sm btn-primary" data-save="${s.key}">💾 保存</button>
          </div>
        </div>
      </div>`).join('') : ''

    el.innerHTML = `
      <div class="hm-mem-layout">
        <div class="hm-mem-sidebar">
          <div class="hm-mem-sidebar-header">
            <div class="hm-mem-sidebar-logo">🧠</div>
            <div class="hm-mem-sidebar-title">记忆中心</div>
          </div>
          <div class="hm-mem-mode-tabs">
            <button class="hm-tab ${mode === 'chat' ? 'active' : ''}" data-mode="chat">💬 对话</button>
            <button class="hm-tab ${mode === 'edit' ? 'active' : ''}" data-mode="edit">📝 编辑</button>
            <button class="hm-tab ${mode === 'insights' ? 'active' : ''}" data-mode="insights">📊 洞察</button>
          </div>
          <div class="hm-mem-sidebar-stats">
            <div class="hm-stat-row"><span class="hm-stat-label">记忆词数</span><span class="hm-stat-val">${stats.wc}</span></div>
            <div class="hm-stat-row"><span class="hm-stat-label">USER 词数</span><span class="hm-stat-val">${stats.userWc}</span></div>
            <div class="hm-stat-row"><span class="hm-stat-label">主题标签</span><span class="hm-stat-val">${stats.topics.length}</span></div>
            <div class="hm-stat-row"><span class="hm-stat-label">Gateway</span><span class="hm-stat-val" style="color:${gwOnline ? '#4caf50' : '#f44336'}">${gwOnline ? '🟢 在线' : '🔴 离线'}</span></div>
          </div>
          <div class="hm-mem-model-row">
            <div class="wx-model-chip" id="hm-chat-model" title="点击切换模型">🤖 ${escHtml(currentModel) || '未设置'}</div>
          </div>
          ${modelList.length ? '<div class="wx-model-dropdown" id="wx-model-dd" style="display:' + (showModelDropdown ? 'block' : 'none') + '">' + modelList.map(m => '<div class="wx-model-opt' + (m === currentModel ? ' active' : '') + '" data-model="' + escHtml(m) + '">' + escHtml(m) + '</div>').join('') + '</div>' : ''}
          <div class="hm-mem-sidebar-footer">
            <button class="btn btn-sm" id="hm-mem-refresh">🔄 刷新</button>
          </div>
        </div>
        <div class="hm-mem-main">
          <div class="hm-mem-main-toolbar">
            <div class="hm-toolbar-title">${mode === 'chat' ? '记忆对话' : mode === 'edit' ? '手动编辑' : '记忆洞察'}</div>
          </div>
          <div class="hm-mem-content">
            ${loading ? '<div class="hm-loading">加载中...</div>' : (mode === 'chat' ? chatHtml : mode === 'edit' ? editHtml : insightsHtml)}
          </div>
        </div>
      </div>
    `
    bind()
  }

  function bind() {
    // Mode tabs
    el.querySelectorAll('.hm-tab').forEach(btn => {
      btn.addEventListener('click', () => { mode = btn.dataset.mode; draw() })
    })

    // Refresh
    el.querySelector('#hm-mem-refresh')?.addEventListener('click', loadAll)

    // Chat input
    const input = el.querySelector('#hm-chat-input')
    input?.addEventListener('input', () => {
      input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 100) + 'px'; saveDraft()
    })
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
    })
    el.querySelector('#hm-chat-send-btn')?.addEventListener('click', sendMessage)

    // Edit save buttons
    el.querySelectorAll('[data-save]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.save
        const textarea = el.querySelector('#hm-editor-' + key)
        if (!textarea) return
        saving = true; draw()
        try {
          await api.hermesMemoryWrite(key, textarea.value)
          if (key === 'memory') memoryContent = textarea.value
          else userContent = textarea.value
        } catch (e) { alert('保存失败: ' + e.message) }
        saving = false; draw()
      })
    })

    // Insights actions
    el.querySelector('#hm-auto-summarize')?.addEventListener('click', () => {
      if (memoryContent.length < 50) { alert('记忆内容太少，无法摘要'); return }
      mode = 'chat'; draw()
      setTimeout(() => doMemoryChat('请阅读当前的 MEMORY.md 内容，然后给出优化建议（不超过200字），包括：1) 缺少的重要分类 2) 矛盾或过时的信息 3) 格式优化建议。不要修改文件，只给建议。'), 100)
    })
    el.querySelector('#hm-import-chat')?.addEventListener('click', () => {
      const hist = sessionStorage.getItem('hermes_recent_chat')
      if (!hist) { alert('没有可导入的聊天记录'); return }
      mode = 'chat'; draw()
      try {
        const msgs = JSON.parse(hist)
        const summary = msgs.slice(-5).map(m => m.role + ': ' + m.content.slice(0, 200)).join('\n')
        setTimeout(() => doMemoryChat('以下是最近的聊天记录，请提取其中关于用户的重要信息并更新到 MEMORY.md：\n\n' + summary), 100)
      } catch (_) { alert('导入失败') }
    })

    // Model selector
    el.querySelector('#hm-chat-model')?.addEventListener('click', (e) => {
      e.stopPropagation(); showModelDropdown = !showModelDropdown
      const dd = el.querySelector('#wx-model-dd'); if (dd) dd.style.display = showModelDropdown ? 'block' : 'none'
    })
    el.querySelector('#wx-model-dd')?.addEventListener('click', async (e) => {
      const opt = e.target.closest('.wx-model-opt')
      if (!opt) return
      const model = opt.dataset.model
      if (!model) return
      try { await api.hermesSetConfig({ model }); currentModel = model; showModelDropdown = false; draw() } catch (_) {}
    })
    document.addEventListener('click', () => { if (showModelDropdown) { showModelDropdown = false; const dd = el.querySelector('#wx-model-dd'); if (dd) dd.style.display = 'none' } })

    // Auto-scroll chat
    const msgsEl = el.querySelector('#hm-chat-msgs')
    if (msgsEl) {
      const observer = new MutationObserver(() => { msgsEl.scrollTop = msgsEl.scrollHeight })
      observer.observe(msgsEl, { childList: true, subtree: true })
    }

    loadDraft()
  }

  init()
  return el
}
