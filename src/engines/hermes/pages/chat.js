/**
 * Hermes Agent 聊天页面 - 全新顶级版
 * 
 * 功能最全、体验最佳的聊天室风格 UI
 * 
 * 特性：
 * - 💎 现代简洁的界面设计
 * - 🧠 模型一键切换
 * - 📎 文件/图片/视频上传
 * - ⚡ 快捷指令面板
 * - ✏️ 双击会话名称重命名
 * - 📊 会话管理
 * - 🔄 工具调用显示
 * - 📤 对话导出
 */
import { t } from '../../../lib/i18n.js'
import { api } from '../../../lib/tauri-api.js'

// ── Helpers ────────────────────────────────────────────────
function escHtml(s) { 
  return (s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;') 
}
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,8) }

function formatTime(ts) {
  const d = new Date(ts), now = new Date()
  const same = d.toDateString() === now.toDateString()
  const time = d.toTimeString().slice(0,5)
  if (same) return time
  return `${d.getMonth()+1}/${d.getDate()} ${time}`
}

function formatFileSize(bytes) {
  if (!bytes || bytes < 1024) return bytes + ' B'
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB'
  return (bytes/1024/1024).toFixed(1) + ' MB'
}

// ── Markdown renderer ──────────────────────────────────────────
function renderMd(text) {
  if (!text) return ''
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="code-block" data-lang="$1"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="hl-inline">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^\- (.+)$/gm, '<li>$1</li>')
    .replace(/\n/g, '<br>')
}

// ── Constants ──────────────────────────────────────────────
const STORAGE_KEY = 'hermes_chat_v2_sessions'
const TOOL_ICONS = {
  bash:'💻', cmd:'💻', powershell:'💻', python:'🐍', node:'🟢',
  browser:'🌐', search:'🔍', code:'⌨️', file:'📄', folder:'📁',
  memory:'🧠', default:'🔧',
}

// ── Model presets ──────────────────────────────────────
const MODEL_PRESETS = [
  { label:'GPT-4o', value:'gpt-4o' },
  { label:'Claude 3.5 Sonnet', value:'claude-3.5-sonnet' },
  { label:'Gemini 2.0 Flash', value:'gemini-2.0-flash' },
  { label:'DeepSeek V3', value:'deepseek-v3' },
  { label:'Qwen Max', value:'qwen-max' },
  { label:'自定义...', value:'custom' },
]

// ── Storage helpers ────────────────────────────────────────
function loadSessions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } 
  catch { return [] }
}
function saveSessions(sess) { localStorage.setItem(STORAGE_KEY, JSON.stringify(sess)) }

function sessionTitle(s) {
  if (s.title) return s.title
  const first = s.messages?.find(m => m.role === 'user')
  if (first) return first.content.slice(0, 35).replace(/\n/g, ' ').trim()
  return '新对话'
}

// ── Quick commands ──────────────────────────────────
const COMMAND_CATEGORIES = [
  { name:'📊 基础交互', commands:[
    { l:'进入交互终端', c:'hermes' },{ l:'查看所有命令', c:'hermes help' },
    { l:'查看版本号', c:'hermes version' },{ l:'查看系统信息', c:'hermes info' },
    { l:'清空对话', c:'hermes clear' },{ l:'检查状态', c:'hermes status' },
  ]},
  { name:'⚙️ 服务管理', commands:[
    { l:'启动服务', c:'hermes start' },{ l:'停止服务', c:'hermes stop' },
    { l:'重启服务', c:'hermes restart' },
  ]},
  { name:'🧠 技能管理', commands:[
    { l:'列出技能', c:'hermes skill list' },{ l:'查看技能', c:'hermes skill show <name>' },
    { l:'运行技能', c:'hermes skill run <name>' },{ l:'删除技能', c:'hermes skill delete <name>' },
  ]},
  { name:'🔌 插件管理', commands:[
    { l:'列出插件', c:'hermes plugin list' },{ l:'安装插件', c:'hermes plugin install <name>' },
    { l:'卸载插件', c:'hermes plugin uninstall <name>' },
  ]},
  { name:'⚡ 配置模型', commands:[
    { l:'编辑配置', c:'hermes config edit' },{ l:'查看配置', c:'hermes config show' },
    { l:'切换模型', c:'hermes model switch <name>' },
  ]},
  { name:'🔧 诊断维护', commands:[
    { l:'系统诊断', c:'hermes doctor' },{ l:'查看日志', c:'hermes logs' },
    { l:'清理缓存', c:'hermes cache clean' },
  ]},
]

// ── Export ────────────────────────────────────────────
export function render() {
  const el = document.createElement('div')
  el.className = 'hc-layout'

  // ── State ─────────────────────────────────────────────
  let sessions = loadSessions()
  let activeId = sessions[0]?.id || null
  let streaming = false
  let pendingText = ''
  let activeTools = []
  let attachFiles = []
  
  // UI state
  let showModelPanel = false
  let showCmdPanel = false
  let showContextPanel = false
  let editingTitleId = null
  let cmdSearch = ''
  let currentModel = 'gpt-4o'
  let contextTab = 'attach'
  
  let _listenFn = null
  async function tauriListen(event, cb) {
    if (!_listenFn) { const m = await import('@tauri-apps/api/event'); _listenFn = m.listen }
    return _listenFn(event, cb)
  }

  // ── Session helpers ────────────────────────────────
  function active() { return sessions.find(s => s.id === activeId) }
  function newSession() {
    const id = genId()
    sessions.unshift({ id, messages:[], created:Date.now(), updated:Date.now() })
    activeId = id
    attachFiles = []
    saveSessions(sessions)
  }
  function deleteSession(id) {
    sessions = sessions.filter(s => s.id !== id)
    if (activeId === id) { activeId = sessions[0]?.id || null; if (!activeId) newSession() }
    saveSessions(sessions)
  }
  function renameSession(id, title) {
    const s = sessions.find(s => s.id === id)
    if (s) { s.title = title.trim() || s.title; s.updated = Date.now(); saveSessions(sessions) }
  }
  function clearSession() {
    const cur = active()
    if (cur) { cur.messages = []; cur.updated = Date.now(); saveSessions(sessions) }
  }

  // ── Send to Hermes ────────────────────────────────
  async function sendToHermes(text) {
    const cur = active()
    if (!cur) newSession()
    const id = activeId
    
    // Handle attachments
    let content = text
    if (attachFiles.length > 0) {
      const files = attachFiles.map(a => 
        a.type?.startsWith('image/') 
          ? `![${a.name}](${a.dataUrl})` 
          : `[${a.name}](${a.path || a.name})`
      ).join('\n')
      content = `${text}\n\n附件:\n${files}`
    }

    cur.messages.push({role:'user', content, _time:Date.now(), files:attachFiles})
    cur.updated = Date.now()
    if (!cur.title) cur.title = text.slice(0,35).replace(/\n/g,' ').trim()
    saveSessions(sessions)
    
    // Add empty assistant message for streaming
    cur.messages.push({role:'assistant', content:'', _time:Date.now()})
    pendingMsgIndex = cur.messages.length - 1
    
    attachFiles = []
    streaming = true; pendingText = ''; activeTools = []
    cleanupListeners?.()
    cleanupListeners = null
    draw()
    scrollBottom()
    
    cleanupListeners = await setupRunListeners()
    const hist = cur.messages.slice(0,-2).map(m => ({role:m.role, content:m.content}))
    
    try {
      await api.hermesAgentRun(text, id, hist.length ? hist : null, null)
    } catch (err) {
      streaming = false
      if (pendingMsgIndex >= 0) {
        cur.messages[pendingMsgIndex].content = `⚠️ ${err}`
      } else {
        cur.messages.push({role:'assistant', content:`⚠️ ${err}`, _time:Date.now()})
      }
      cur.updated = Date.now()
      saveSessions(sessions)
      cleanupListeners?.()
      cleanupListeners = null
      draw()
    }
  }
  
  // ── Stream response handlers ─────────────────────────────
  let pendingMsgIndex = -1
  
  async function setupRunListeners() {
    const unlistenTool = await tauriListen('hermes-run-tool', ({payload}) => {
      // Tool call events from SSE
      const tool = payload.delta?.name || payload.name || 'tool'
      activeTools.push({id:genId(), name:tool, input:payload.delta?.input || payload.input})
      draw()
    })
    
    const unlistenDelta = await tauriListen('hermes-run-delta', ({payload}) => {
      // Streaming text tokens
      pendingText += payload.delta || ''
      const cur = active()
      if (cur && pendingMsgIndex >= 0) {
        cur.messages[pendingMsgIndex].content = pendingText
        draw()
        scrollBottom()
      }
    })
    
    const unlistenDone = await tauriListen('hermes-run-done', ({payload}) => {
      // Run completed - finalize message
      streaming = false
      const cur = active()
      if (cur && pendingMsgIndex >= 0) {
        cur.messages[pendingMsgIndex].content = payload.output || pendingText
        cur.updated = Date.now()
        saveSessions(sessions)
      }
      cleanupListeners?.()
      cleanupListeners = null
      draw()
    })
    
    const unlistenError = await tauriListen('hermes-run-error', ({payload}) => {
      // Run failed
      streaming = false
      const cur = active()
      if (cur) {
        cur.messages.push({role:'assistant', content:`⚠️ ${payload.error || '未知错误'}`, _time:Date.now()})
        cur.updated = Date.now()
        saveSessions(sessions)
      }
      cleanupListeners?.()
      cleanupListeners = null
      draw()
    })
    
    return () => {
      unlistenTool(); unlistenDelta(); unlistenDone(); unlistenError()
    }
  }

  function scrollBottom() {
    setTimeout(() => { 
      const m = el.querySelector('.hc-messages')
      if (m) m.scrollTop = m.scrollHeight 
    }, 20)
  }

  // ── File handlers ────────────────────────────────
  async function handleFileSelect(type) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : '*/*'
    input.multiple = true
    input.onchange = async (e) => {
      const files = Array.from(e.target.files || [])
      for (const f of files) {
        const reader = new FileReader()
        reader.onload = () => {
          attachFiles.push({ name:f.name, size:f.size, type:f.type, dataUrl:reader.result })
          draw()
        }
        if (f.type.startsWith('image/')) {
          reader.readAsDataURL(f)
        } else {
          reader.readAsText(f)
        }
      }
    }
    input.click()
  }

  // ── Render ──────────────────────────────────────────
  function draw() {
    const cur = active()
    el.innerHTML = `
    <div class="hc-layout ${showContextPanel ? 'hc-has-context' : ''}">
      <!-- Sidebar -->
      <aside class="hc-sidebar">
        <div class="hc-sidebar-header">
          <div class="hc-logo"><span>🤖</span><span>Hermes</span></div>
          <button class="hc-icon-btn" data-action="new" title="新建对话">+</button>
        </div>
        <input class="hc-search" placeholder="🔍 搜索对话...">
        <div class="hc-session-list">
          ${sessions.map(s => `<div class="hc-session-item ${s.id === activeId ? 'hc-active' : ''}" data-id="${s.id}">
            <div class="hc-session-icon">💬</div>
            <div class="hc-session-info">
              <div class="hc-session-title" data-dbl="1">${escHtml(sessionTitle(s))}</div>
              <div class="hc-session-meta">${formatTime(s.updated)} · ${s.messages?.length||0}条</div>
            </div>
            <button class="hc-session-del" data-del="${s.id}">×</button>
          </div>`).join('')}
        </div>
        <div class="hc-sidebar-footer">
          <div class="hc-footer-item" data-goto="dashboard"><span>📊</span>仪表盘</div>
          <div class="hc-footer-item" data-goto="skills"><span>🧠</span>技能中心</div>
        </div>
      </aside>

      <!-- Main -->
      <main class="hc-main">
        <!-- Top bar -->
        <div class="hc-topbar">
          <div class="hc-topbar-left">
            ${editingTitleId === activeId ? `
              <input class="hc-title-edit" id="hc-title-input" value="${escHtml(sessionTitle(cur||{}))}">
            ` : `
              <span class="hc-title-display" id="hc-title-display" title="双击重命名">${escHtml(sessionTitle(cur||{}))}</span>
            `}
          </div>
          <div class="hc-topbar-right">
            <!-- Model picker -->
            <div class="hc-model-picker">
              <button class="hc-model-btn" id="hc-model-btn">
                <span>🧠</span><span id="hc-model-name">${currentModel}</span><span>▾</span>
              </button>
              <div class="hc-model-dropdown ${showModelPanel ? 'hc-open' : ''}">
                ${MODEL_PRESETS.map(m => `<div class="hc-model-opt" data-model="${m.value}">
                  <span>${m.label}</span>
                  ${currentModel === m.value ? '<span>✓</span>' : ''}
                </div>`).join('')}
              </div>
            </div>
            <button class="hc-icon-btn" data-action="cmd" title="快捷指令">⚡</button>
            <button class="hc-icon-btn" data-action="attach" title="附件">📎</button>
            <button class="hc-icon-btn" data-action="clear" title="清空">🗑️</button>
            <button class="hc-icon-btn" data-action="export" title="导出">📤</button>
          </div>
        </div>

        <!-- Messages -->
        <div class="hc-messages">
          ${cur?.messages?.length ? cur.messages.map((m,i) => buildMsg(m,i)).join('') : buildEmpty()}
          ${streaming ? buildPending() : ''}
          ${activeTools.length ? buildTools() : ''}
        </div>

        <!-- Input -->
        <div class="hc-input-area">
          ${attachFiles.length ? `<div class="hc-attach-bar">
            ${attachFiles.map((f,i) => `<div class="hc-attach-chip">
              ${f.type?.startsWith('image/') ? '🖼️' : f.type?.startsWith('video/') ? '🎬' : '📎'}
              <span>${f.name}</span>
              <button data-rm="${i}">×</button>
            </div>`).join('')}
          </div>` : ''}
          <div class="hc-input-row">
            <div class="hc-input-tools">
              <button class="hc-tool-btn" data-upload="file" title="文件">📎</button>
              <button class="hc-tool-btn" data-upload="image" title="图片">🖼️</button>
              <button class="hc-tool-btn" data-upload="video" title="视频">🎬</button>
            </div>
            <textarea class="hc-input" id="hc-input" placeholder="输入消息... (Enter发送, Shift+Enter换行)" rows="1"></textarea>
            <button class="hc-send-btn" data-action="send">▶</button>
          </div>
        </div>
      </main>

      <!-- Context panel -->
      ${showContextPanel ? `<aside class="hc-context-panel">
        <div class="hc-ctx-tabs">
          <button class="hc-ctx-tab ${contextTab==='attach'?'active':''}" data-tab="attach">📎</button>
          <button class="hc-ctx-tab ${contextTab==='cmd'?'active':''}" data-tab="cmd">⚡</button>
          <button class="hc-ctx-tab ${contextTab==='skill'?'active':''}" data-tab="skill">🧠</button>
          <button class="hc-ctx-close" data-action="ctx-close">×</button>
        </div>
        <div class="hc-ctx-body">${buildCtxBody()}</div>
      </aside>` : ''}

      <!-- Command popup -->
      ${showCmdPanel ? `<div class="hc-popup-overlay" id="hc-popup-overlay">
        <div class="hc-popup-panel">
          <div class="hc-popup-header">
            <span>⚡ 快捷指令</span>
            <input class="hc-popup-search" id="hc-popup-search" placeholder="搜索..." value="${escHtml(cmdSearch)}">
            <button class="hc-popup-close" data-action="popup-close">×</button>
          </div>
          <div class="hc-popup-body">${buildCmdPanel()}</div>
          <div class="hc-popup-footer">
            <button class="hc-btn-primary" data-action="send-all">发送全部</button>
            <button class="hc-btn-secondary" data-action="popup-cancel">取消</button>
          </div>
        </div>
      </div>` : ''}
    `
    bind()
    scrollBottom()
  }

  // ── Builders ───────────────────────────────────────
  function buildMsg(m, i) {
    if (m.role === 'user') {
      const att = m.files?.length ? m.files.map(f => 
        f.type?.startsWith('image/') && f.dataUrl 
          ? `<img class="hc-msg-img" src="${f.dataUrl}">` 
          : `<div class="hc-msg-file">📎 ${f.name}</div>`
      ).join('') : ''
      return `<div class="hc-msg-row hc-user"><div class="hc-bubble hc-bubble-me">${att}<div class="hc-msg-text">${escHtml(m.content)}</div></div><div class="hc-avatar">🧑</div></div>`
    }
    return `<div class="hc-msg-row hc-ai"><div class="hc-avatar">🤖</div><div class="hc-bubble hc-bubble-ai"><div class="hc-msg-text">${renderMd(m.content)}</div></div></div>`
  }

  function buildPending() {
    return `<div class="hc-msg-row hc-ai"><div class="hc-avatar">🤖</div><div class="hc-bubble hc-bubble-ai"><div class="hc-msg-text">${escHtml(pendingText)}<span class="hc-cursor">▋</span></div></div></div>`
  }

  function buildTools() {
    return `<div class="hc-tools">${activeTools.map(t => `<span class="hc-tool-chip">${TOOL_ICONS[t.name]||'🔧'} ${t.name}</span>`).join('')}</div>`
  }

  function buildEmpty() {
    return `<div class="hc-empty"><div class="hc-empty-icon">🤖</div><div class="hc-empty-title">开始与 Hermes 对话</div><div class="hc-empty-sub">发送消息或使用快捷指令</div><div class="hc-empty-actions">
      <button class="hc-quick-btn" data-qcmd="hermes help">📖 帮助</button>
      <button class="hc-quick-btn" data-qcmd="hermes status">🔍 状态</button>
      <button class="hc-quick-btn" data-qcmd="hermes skill list">🧠 技能</button>
    </div></div>`
  }

  function buildCtxBody() {
    if (contextTab === 'attach') {
      return `<div class="hc-ctx-section">
        <div class="hc-ctx-title">📎 上传附件</div>
        <div class="hc-ctx-btns">
          <button data-upload="file">📎 文件</button>
          <button data-upload="image">🖼️ 图片</button>
          <button data-upload="video">🎬 视频</button>
        </div>
        ${attachFiles.length ? `<div class="hc-ctx-files">${attachFiles.map((f,i) => `<div class="hc-ctx-file"><span>${f.type?.startsWith('image/')?'🖼️':f.type?.startsWith('video/')?'🎬':'📎'}</span><span>${f.name}</span><span>${formatFileSize(f.size)}</span><button data-rm="${i}">×</button></div>`).join('')}</div>` : '<div class="hc-ctx-empty">暂无附件</div>'}
      </div>`
    } else if (contextTab === 'cmd') {
      return `<div class="hc-ctx-section"><div class="hc-ctx-title">⚡ 快捷指令</div>${COMMAND_CATEGORIES.map(cat => `<div class="hc-ctx-cat"><div class="hc-ctx-cat-name">${cat.name}</div>${cat.commands.map(cmd => `<div class="hc-ctx-cmd" data-cmd="${escHtml(cmd.c)}"><span>${cmd.l}</span><code>${cmd.c}</code></div>`).join('')}</div>`).join('')}</div>`
    } else {
      return `<div class="hc-ctx-section"><div class="hc-ctx-title">🧠 必备技能</div>${SKILLS.map(s => `<div class="hc-ctx-skill" data-lab="${s.l}" data-desc="${s.d}"><div>${s.l}</div><div>${s.d}</div></div>`).join('')}</div>`
    }
  }

  const SKILLS = [
    {l:'自动创建技能',d:'完成后自动生成技能文档'},
    {l:'服务状态管理',d:'掌握start/stop/restart指令'},
    {l:'配置与模型切换',d:'config edit和model switch'},
    {l:'网页浏览检索',d:'获取最新数据并标注来源'},
    {l:'代码执行开发',d:'Python/JS代码执行和测试'},
    {l:'文件系统操作',d:'创建读取修改删除文件'},
    {l:'知识库问答',d:'语义索引和引用标注'},
    {l:'上下文理解',d:'记住关键信息避免重复'},
    {l:'结果格式化',d:'表格/流程图/代码注释'},
    {l:'自我反思改进',d:'任务后生成反思报告'},
  ]

  function buildCmdPanel() {
    const q = cmdSearch.toLowerCase()
    const filtered = COMMAND_CATEGORIES.map(cat => ({
      ...cat, commands: cat.commands.filter(c => !q || c.l.toLowerCase().includes(q) || c.c.toLowerCase().includes(q))
    })).filter(cat => cat.commands.length > 0)
    if (!filtered.length) return '<div class="hc-popup-empty">无匹配指令</div>'
    return filtered.map(cat => `<div class="hc-popup-cat"><div class="hc-popup-cat-name">${cat.name}</div>${cat.commands.map(cmd => `<div class="hc-popup-item" data-cmd="${escHtml(cmd.c)}"><span>${escHtml(cmd.l)}</span><code>${escHtml(cmd.c)}</code><button>发送</button></div>`).join('')}</div>`).join('')
  }

  // ── Bind ──────────────────────────────────────────────
  function bind() {
    // New session
    el.querySelector('[data-action="new"]')?.addEventListener('click', () => { newSession(); draw() })
    
    // Session click
    el.querySelectorAll('.hc-session-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.hc-session-del')) {
          if (confirm('确定删除此对话?')) deleteSession(e.target.dataset.del)
          draw()
          return
        }
        activeId = item.dataset.id; attachFiles = []; draw()
      })
    })

    // Double-click rename
    el.querySelectorAll('[data-dbl="1"]').forEach(t => {
      t.addEventListener('dblclick', () => { editingTitleId = activeId; draw() })
    })
    el.querySelector('#hc-title-display')?.addEventListener('dblclick', () => { editingTitleId = activeId; draw() })
    el.querySelector('#hc-title-input')?.addEventListener('blur', function() {
      if (this.value.trim()) renameSession(editingTitleId, this.value)
      editingTitleId = null; draw()
    })

    // Send
    el.querySelector('[data-action="send"]')?.addEventListener('click', handleSend)
    el.querySelector('#hc-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } })
    el.querySelector('#hc-input')?.addEventListener('input', function() { this.style.height='auto'; this.style.height = Math.min(this.scrollHeight,200)+'px' })

    // Model picker - real backend call
    el.querySelector('#hc-model-btn')?.addEventListener('click', (e) => { e.stopPropagation(); showModelPanel = !showModelPanel; draw() })
    el.querySelectorAll('.hc-model-opt').forEach(opt => {
      opt.addEventListener('click', async () => {
        const model = opt.dataset.model
        try {
          const result = await api.hermesUpdateModel(model)
          currentModel = model
          showModelPanel = false
          alert(`模型已切换为 ${model}: ${result}`)
          draw()
        } catch (err) {
          alert(`切换模型失败: ${err}`)
        }
      })
    })

    // Toolbar buttons
    el.querySelector('[data-action="cmd"]')?.addEventListener('click', () => { showCmdPanel = true; draw() })
    el.querySelector('[data-action="attach"]')?.addEventListener('click', () => { showContextPanel = !showContextPanel; contextTab = 'attach'; draw() })
    el.querySelector('[data-action="clear"]')?.addEventListener('click', () => { if (confirm('确定清空当前对话?')) clearSession(); draw() })
    el.querySelector('[data-action="export"]')?.addEventListener('click', exportChat)

    // File upload buttons
    el.querySelectorAll('[data-upload]').forEach(btn => {
      btn.addEventListener('click', () => handleFileSelect(btn.dataset.upload))
    })

    // Remove attachment
    el.querySelectorAll('[data-rm]').forEach(btn => {
      btn.addEventListener('click', () => { attachFiles.splice(parseInt(btn.dataset.rm), 1); draw() })
    })

    // Context panel tabs
    el.querySelectorAll('.hc-ctx-tab').forEach(tab => {
      tab.addEventListener('click', () => { contextTab = tab.dataset.tab; draw() })
    })
    el.querySelector('[data-action="ctx-close"]')?.addEventListener('click', () => { showContextPanel = false; draw() })

    // Command popup
    el.querySelector('#hc-popup-overlay')?.addEventListener('click', (e) => { if (e.target.id === 'hc-popup-overlay') { showCmdPanel = false; draw() } })
    el.querySelector('[data-action="popup-close"]')?.addEventListener('click', () => { showCmdPanel = false; draw() })
    el.querySelector('[data-action="popup-cancel"]')?.addEventListener('click', () => { showCmdPanel = false; draw() })
    el.querySelector('[data-action="send-all"]')?.addEventListener('click', sendAllCommands)
    el.querySelector('#hc-popup-search')?.addEventListener('input', function() { cmdSearch = this.value; draw() })

    // Command items
    el.querySelectorAll('[data-cmd]').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.closest('button')) return
        sendToHermes(item.dataset.cmd)
        showCmdPanel = false
      })
    })

    // Quick commands
    el.querySelectorAll('[data-qcmd]').forEach(btn => {
      btn.addEventListener('click', () => { if (!sessions.length) newSession(); sendToHermes(btn.dataset.qcmd) })
    })

    // Context panel commands/skills
    el.querySelectorAll('.hc-ctx-cmd').forEach(item => {
      item.addEventListener('click', () => sendToHermes(item.dataset.cmd))
    })
    el.querySelectorAll('.hc-ctx-skill').forEach(item => {
      item.addEventListener('click', () => sendToHermes(`请学习技能：${item.dataset.lab}\n\n${item.dataset.desc}`))
    })
  }

  async function handleSend() {
    const input = el.querySelector('#hc-input')
    const text = input?.value.trim()
    if (!text && !attachFiles.length) return
    input.value = ''
    input.style.height = 'auto'
    if (!sessions.length) newSession()
    sendToHermes(text)
  }

  async function sendAllCommands() {
    const cmds = COMMAND_CATEGORIES.flatMap(c => c.commands).map(c => c.c).join('\n')
    sendToHermes(`以下是快捷指令大全，请学会这些指令：\n\n${cmds}`)
    showCmdPanel = false
  }

  function exportChat() {
    const cur = active()
    if (!cur) return
    const text = cur.messages.map(m => 
      `${m.role === 'user' ? '🧑' : '🤖'} ${m.content}`
    ).join('\n\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${cur.title || 'chat'}-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Init
  if (!sessions.length) newSession()
  draw()
  return el
}