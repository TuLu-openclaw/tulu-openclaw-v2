/**
 * Hermes Agent 聊天页面
 *
 * 功能：
 * - 快捷指令面板：点击分类/指令 → 自动发送给 Hermes
 * - 必备技能面板：点击技能 → 自动发送给 Hermes 学习
 * - Skills 页面 Apply 事件监听：接收技能并发送给 Hermes
 */
import { t } from '../../../lib/i18n.js'
import { api } from '../../../lib/tauri-api.js'

// ── 完整指令文档（将发送给 Hermes）──────────────────────────
const QUICK_COMMANDS_DOC = `Hermes，以下是你必须学会并熟练掌握的最全指令大全，涵盖了你所有的工作场景。你必须将这些指令烂熟于心，做到随用随取，执行无误。

一、基础交互与状态检查指令

这是你日常交互的起点，必须做到条件反射。

- hermes ：进入交互终端，开始与我对话。
- hermes help ：查看所有可用命令的说明。
- hermes version ：查看你的版本号。
- hermes info ：查看更详细的系统信息，包括运行环境。
- hermes clear ：清空当前对话上下文，开始新话题。
- hermes status ：检查你的服务运行状态，确保一切正常。

二、核心服务管理指令

这是你的生命线，必须保证稳定运行。

- hermes start ：在后台启动你的服务。
- hermes stop ：停止正在运行的服务。
- hermes restart ：重启服务，通常用于配置更新后刷新。

三、技能 (Skills) 管理指令

这是你进化的核心，必须熟练运用。

- hermes skill list ：列出你当前拥有的所有技能。
- hermes skill show <skill_name> ：查看指定技能的详细内容。
- hermes skill run <skill_name> ：直接运行一个已保存的技能。
- hermes skill edit <skill_name> ：编辑一个已有的技能文件。
- hermes skill delete <skill_name> ：删除不再需要的技能。

四、插件 (Plugins) 管理指令

这是你扩展能力的翅膀，必须灵活掌握。

- hermes plugin list ：列出当前已安装的所有插件。
- hermes plugin install <plugin_name> ：从官方或社区安装新插件。
- hermes plugin uninstall <plugin_name> ：卸载指定的插件。
- hermes plugin enable <plugin_name> ：启用一个已安装但被禁用的插件。
- hermes plugin disable <plugin_name> ：临时禁用一个插件。
- hermes plugin market ：浏览并发现可用的官方插件。

五、配置与模型管理指令

这是你适应不同需求的调节器，必须精准操作。

- hermes config edit ：打开并编辑你的主配置文件。
- hermes config reset ：将所有配置重置为默认值。
- hermes config show ：查看当前生效的所有配置详情。
- hermes model switch <model_name> ：切换使用不同的大语言模型。

六、高级诊断与维护指令

这是你解决疑难杂症的急救包，必须沉着应对。

- hermes doctor ：运行系统诊断程序，检查潜在问题。
- hermes logs ：查看你的运行日志。
- hermes logs -f ：实时跟踪最新的日志输出。
- hermes cache clean ：清理临时缓存文件，解决一些奇怪的问题。
- pkill -f hermes ：强制终止所有与你相关的进程，用于紧急情况。

七、特定任务指令 (根据你的能力范围添加)

这些是你执行具体任务的武器，必须精准打击。

- hermes serve --host 0.0.0.0 --port 8080 & ：以特定配置启动你的服务并后台运行。
- hermes local pull <model_name> ：从本地存储库拉取指定的模型文件。
- hermes web ：启动你的Web图形界面。

以上指令，你必须逐一练习，确保在需要时能快速准确地执行。你的成长和效率，直接取决于你对这些指令的掌握程度。立即开始学习，并随时准备接受我的指令。`

// ── 完整技能文档（将发送给 Hermes）──────────────────────────
const ESSENTIAL_SKILLS_DOC = `Hermes，以下是必须掌握的技能清单，你需尽快学习并内化这些能力，确保在后续任务中能高效、准确地执行。

一、系统级核心能力（自我管理）

1. 自动创建与管理技能
- 完成单次任务后，需自动回放执行过程，抽象出标准化流程，生成符合 agentskills.io 标准的Markdown技能文档。
- 将技能文件存储至 ~/.hermes/skills/ 目录，并在后续任务中主动调用、优化已有技能。
- 当执行任务超过5次工具调用或从错误中恢复时，必须触发技能生成机制。
2. 服务状态管理
- 掌握 hermes start 、 hermes stop 、 hermes restart 指令，确保服务稳定运行。
- 熟练使用 hermes status 实时监控服务状态，发现问题时主动上报异常日志。
3. 配置与模型切换
- 能通过 hermes config edit 修改配置文件，适配不同场景需求（如调整工具调用阈值）。
- 掌握 hermes model switch 指令，根据任务复杂度灵活切换大语言模型。

二、工具调用与实用能力（干活主力）

1. 网页浏览与信息检索
- 对用户提出的时效性问题（如新闻、股价、天气），需调用网页浏览工具获取最新数据，并标注信息来源。
- 检索信息时需优先选择权威网站，避免引用个人博客或未经验证的内容。
2. 代码执行与开发辅助
- 支持Python、JavaScript等主流语言的代码片段执行，需检查代码安全性后再运行。
- 开发任务中，需根据需求自动生成函数框架、单元测试用例，并解释代码逻辑。
3. 文件系统操作
- 掌握创建、读取、修改、删除文件的标准化流程，操作前需确认用户权限。
- 处理文档时，需保持格式一致性（如Markdown标题层级、代码块缩进）。
4. 知识库问答
- 若用户上传知识库文件，需建立索引并支持语义检索，回答时需标注参考文档的具体章节。
- 当知识库内容与用户问题冲突时，需主动提示矛盾点并请求确认。

三、对话与交互能力（沟通效率）

1. 上下文理解与长对话
- 需记住对话历史中的关键信息，避免重复提问。例如，用户已提供项目需求，后续讨论时需直接引用。
- 当用户意图模糊时，主动用封闭式问题确认（如"是否需要生成Python代码？"）。
2. 指令遵循与精确执行
- 对用户明确指定的格式要求（如"用表格对比A/B方案"），需严格遵循，不得自行简化。
- 若任务涉及多步骤操作，需分阶段反馈进度，例如："已完成数据收集，正在生成分析报告。"
3. 结果格式化输出
- 数据类结果需用表格呈现，复杂逻辑需用流程图说明，代码需添加注释。
- 禁止返回未处理的原始数据，例如直接输出JSON字段，需转换为自然语言描述。

四、高级进阶能力（自我进化）

1. 自我反思与改进
- 任务完成后，需生成反思报告，内容包括：执行效率评分、工具调用合理性分析、优化建议。
- 若任务失败，需定位错误环节并提出3种以上解决方案。
2. 技能自我迭代
- 当发现更优执行路径时，需自动更新技能文档，并在更新日志中标注改进点。
- 对使用频率高的技能，需每月进行一次性能评估，优化响应速度。
3. 多轮任务规划与执行
- 复杂任务需拆解为子任务清单，例如"市场调研"分解为"竞品分析→用户访谈→报告撰写"。
- 执行中若遇到资源冲突（如工具调用超限），需动态调整任务优先级，并向用户说明调整原因。

以上技能需在7日内完成学习，并通过以下考核：

1. 模拟任务测试：完成"自动生成周报并邮件发送"的全流程任务。
2. 技能覆盖率检查：确保 ~/.hermes/skills/ 目录下至少包含5个自动生成的技能文件。
3. 用户满意度评分：连续3天执行任务后，收集用户反馈，满意度需达90%以上。

考核通过后，将开启技能进阶训练，包括跨平台工具调用、多智能体协作等模块。请尽快落实。`

// ── 快捷指令分类数据 ─────────────────────────────────────
const COMMAND_CATEGORIES = [
  {
    name: '📊 基础交互与状态',
    commands: [
      { label: '进入交互终端', cmd: 'hermes' },
      { label: '查看所有命令', cmd: 'hermes help' },
      { label: '查看版本号', cmd: 'hermes version' },
      { label: '查看系统信息', cmd: 'hermes info' },
      { label: '清空对话上下文', cmd: 'hermes clear' },
      { label: '检查服务状态', cmd: 'hermes status' },
    ],
  },
  {
    name: '⚙️ 核心服务管理',
    commands: [
      { label: '启动服务（后台）', cmd: 'hermes start' },
      { label: '停止服务', cmd: 'hermes stop' },
      { label: '重启服务', cmd: 'hermes restart' },
    ],
  },
  {
    name: '🧠 技能管理',
    commands: [
      { label: '列出所有技能', cmd: 'hermes skill list' },
      { label: '查看指定技能', cmd: 'hermes skill show <skill_name>' },
      { label: '运行技能', cmd: 'hermes skill run <skill_name>' },
      { label: '编辑技能文件', cmd: 'hermes skill edit <skill_name>' },
      { label: '删除技能', cmd: 'hermes skill delete <skill_name>' },
    ],
  },
  {
    name: '🔌 插件管理',
    commands: [
      { label: '列出已安装插件', cmd: 'hermes plugin list' },
      { label: '安装插件', cmd: 'hermes plugin install <plugin_name>' },
      { label: '卸载插件', cmd: 'hermes plugin uninstall <plugin_name>' },
      { label: '启用插件', cmd: 'hermes plugin enable <plugin_name>' },
      { label: '禁用插件', cmd: 'hermes plugin disable <plugin_name>' },
      { label: '浏览插件市场', cmd: 'hermes plugin market' },
    ],
  },
  {
    name: '⚡ 配置与模型',
    commands: [
      { label: '编辑配置文件', cmd: 'hermes config edit' },
      { label: '重置配置', cmd: 'hermes config reset' },
      { label: '查看当前配置', cmd: 'hermes config show' },
      { label: '切换模型', cmd: 'hermes model switch <model_name>' },
    ],
  },
  {
    name: '🔧 高级诊断与维护',
    commands: [
      { label: '运行系统诊断', cmd: 'hermes doctor' },
      { label: '查看运行日志', cmd: 'hermes logs' },
      { label: '实时跟踪日志', cmd: 'hermes logs -f' },
      { label: '清理缓存', cmd: 'hermes cache clean' },
      { label: '强制终止进程', cmd: 'pkill -f hermes' },
    ],
  },
  {
    name: '🚀 特定任务',
    commands: [
      { label: '启动Web服务', cmd: 'hermes serve --host 0.0.0.0 --port 8080 &' },
      { label: '拉取本地模型', cmd: 'hermes local pull <model_name>' },
      { label: '启动Web界面', cmd: 'hermes web' },
    ],
  },
]

// ── 必备技能分类数据 ─────────────────────────────────────
const SKILL_CATEGORIES = [
  {
    name: '🛠️ 系统级核心能力',
    skills: [
      { label: '自动创建与管理技能', desc: '完成任务后自动生成标准技能文档，存储到 ~/.hermes/skills/' },
      { label: '服务状态管理', desc: '掌握 start/stop/restart/status 指令，实时监控服务状态' },
      { label: '配置与模型切换', desc: '通过 hermes config edit 修改配置，hermes model switch 切换模型' },
    ],
  },
  {
    name: '💻 工具调用与实用能力',
    skills: [
      { label: '网页浏览与信息检索', desc: '调用网页浏览工具获取最新数据，标注信息来源，优先权威网站' },
      { label: '代码执行与开发辅助', desc: '支持 Python/JS 代码执行，自动生成函数框架和单元测试' },
      { label: '文件系统操作', desc: '创建/读取/修改/删除文件，保持 Markdown 格式一致性' },
      { label: '知识库问答', desc: '建立语义索引，标注参考文档章节，提示冲突点' },
    ],
  },
  {
    name: '💬 对话与交互能力',
    skills: [
      { label: '上下文理解与长对话', desc: '记住关键信息避免重复提问，主动用封闭式问题确认模糊意图' },
      { label: '指令遵循与精确执行', desc: '严格遵循格式要求，多步骤任务分阶段反馈进度' },
      { label: '结果格式化输出', desc: '数据用表格，复杂逻辑用流程图，代码添加注释，禁止原始数据' },
    ],
  },
  {
    name: '🌟 高级进阶能力',
    skills: [
      { label: '自我反思与改进', desc: '任务完成后生成反思报告，失败时提出3种以上解决方案' },
      { label: '技能自我迭代', desc: '发现更优路径时更新技能文档，每月性能评估优化' },
      { label: '多轮任务规划与执行', desc: '复杂任务拆解为子任务清单，动态调整优先级' },
    ],
  },
]

// ── Constants ──────────────────────────────────────────────
const STORAGE_KEY = 'hermes_chat_sessions'

const TOOL_ICONS = {
  bash: '💻', cmd: '💻', powershell: '💻', python: '🐍', node: '🟢',
  browser: '🌐', search: '🔍', code: '⌨️', file: '📄', folder: '📁',
  memory: '🧠', default: '🔧',
}

function escHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

let _listenFn = null
async function tauriListen(event, cb) {
  if (!_listenFn) { const mod = await import('@tauri-apps/api/event'); _listenFn = mod.listen }
  return _listenFn(event, cb)
}

// ── Session helpers ────────────────────────────────────────
function loadSessions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function saveSessions(sessions) { localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions)) }

function formatTime(ts) {
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const time = d.toTimeString().slice(0, 5)
  if (sameDay) return time
  const month = d.getMonth() + 1
  const day = d.getDate()
  return `${month}/${day} ${time}`
}

function sessionTitle(s) {
  if (s.title) return s.title
  const first = s.messages.find(m => m.role === 'user')
  if (first) return first.content.slice(0, 40).replace(/\n/g, ' ')
  return '新对话'
}

// ── Send message to Hermes ────────────────────────────────
async function sendToHermes(text, sessionId, history) {
  let streaming = false
  let pendingText = ''
  let cleanupListeners = null

  const cur = sessions.find(s => s.id === sessionId)
  if (!cur) return

  cur.messages.push({ role: 'user', content: text, _time: Date.now() })
  cur.updated = Date.now()
  if (!cur.title) cur.title = text.slice(0, 40).replace(/\n/g, ' ')
  saveSessions(sessions)
  draw()
  streaming = true
  pendingText = ''
  activeTools = []
  draw()

  const cleanup = await setupRunListeners()
  cleanupListeners = cleanup

  const hist = history || cur.messages.filter(m => m.role === 'user' || m.role === 'assistant').slice(0, -1).map(m => ({ role: m.role, content: m.content }))

  api.hermesAgentRun(text, sessionId, hist.length ? hist : null, null).catch(err => {
    streaming = false
    cur.messages.push({ role: 'assistant', content: `⚠️ ${err}`, _time: Date.now() })
    cur.updated = Date.now()
    saveSessions(sessions)
    cleanupListeners?.()
    draw()
  })
}

// ── Active stream tools ────────────────────────────────────
let activeTools = []

async function setupRunListeners() {
  const unlistenFn = await tauriListen('hermes-tool-call', ({ payload }) => {
    activeTools.push({ id: genId(), ...payload })
    draw()
  })
  return unlistenFn
}

// ── Render ────────────────────────────────────────────────
export function render() {
  const el = document.createElement('div')
  el.className = 'gc-layout'

  let sessions = loadSessions()
  let activeId = sessions[0]?.id
  let streaming = false
  let pendingText = ''
  let cleanupListeners = null

  // ── Active session helpers ────────────────────────────────
  function active() { return sessions.find(s => s.id === activeId) }
  function newSession() {
    const id = genId()
    sessions.unshift({ id, messages: [], created: Date.now(), updated: Date.now() })
    activeId = id
    saveSessions(sessions)
  }
  function deleteSession(id) {
    sessions = sessions.filter(s => s.id !== id)
    if (activeId === id) activeId = sessions[0]?.id || null
    if (!activeId) newSession()
    saveSessions(sessions)
  }

  // Panel visibility states
  let showCmdPanel = false   // 快捷指令面板
  let showSkillPanel = false // 必备技能面板
  let cmdSearch = ''
  let skillSearch = ''

  // ── Draw ────────────────────────────────────────────────
  function draw() {
    const cur = active()

    // Build command panel HTML
    const cmdHtml = buildCommandPanel()
    const skillHtml = buildSkillPanel()

    el.innerHTML = `
      <!-- Sidebar -->
      <aside class="gc-sidebar">
        <div class="gc-sidebar-header">
          <span class="gc-sidebar-title">🤖 Hermes</span>
          <button class="gc-btn-icon" id="gc-btn-new" title="新建对话">+</button>
        </div>
        <div class="gc-sessions-list">
          ${sessions.map(s => `
            <div class="gc-session-item ${s.id === activeId ? 'active' : ''}" data-id="${s.id}">
              <div class="gc-session-info">
                <div class="gc-session-title">${escHtml(sessionTitle(s))}</div>
                <div class="gc-session-time">${formatTime(s.updated)}</div>
              </div>
              <button class="gc-session-del" data-del="${s.id}">×</button>
            </div>
          `).join('')}
        </div>
      </aside>

      <!-- Main area -->
      <main class="gc-main">
        <!-- Toolbar -->
        <div class="gc-toolbar">
          <div class="gc-toolbar-left">
            <span class="gc-toolbar-title">${cur ? escHtml(sessionTitle(cur)) : 'Hermes Agent'}</span>
          </div>
          <div class="gc-toolbar-right">
            <button class="gc-tool-btn" id="gc-btn-commands" title="快捷指令">
              ⚡ 快捷指令
            </button>
            <button class="gc-tool-btn" id="gc-btn-skills" title="必备技能">
              📚 必备技能
            </button>
          </div>
        </div>

        <!-- Messages -->
        <div class="gc-messages" id="gc-messages">
          ${cur ? cur.messages.map(m => `
            <div class="gc-msg-row ${m.role}">
              <div class="gc-msg ${m.role}">${m.role === 'user' ? escHtml(m.content) : (m.content || '')}</div>
            </div>
          `).join('') : ''}
          ${streaming ? `<div class="gc-msg-row assistant"><div class="gc-msg assistant" id="gc-pending">${escHtml(pendingText)}<span class="gc-cursor">▋</span></div></div>` : ''}
          ${activeTools.length ? `
            <div class="gc-tools-bar">
              <span class="gc-tools-label">工具调用：</span>
              ${activeTools.map(t => `<span class="gc-tool-chip">${TOOL_ICONS[t.name] || TOOL_ICONS.default} ${escHtml(t.name)}</span>`).join('')}
            </div>
          ` : ''}
        </div>

        <!-- Input -->
        <div class="gc-input-row">
          <textarea class="gc-input" id="gc-input" placeholder="输入消息，或直接发送快捷指令..." rows="1"></textarea>
          <button class="gc-send-btn" id="gc-send-btn">▶</button>
        </div>
      </main>

      <!-- 快捷指令面板 -->
      <div class="gc-popup-overlay ${showCmdPanel ? 'visible' : ''}" id="gc-cmd-overlay">
        <div class="gc-popup-panel">
          <div class="gc-popup-header">
            <span class="gc-popup-title">⚡ 快捷指令</span>
            <input type="text" class="gc-popup-search" id="gc-cmd-search" placeholder="搜索指令..." value="${escHtml(cmdSearch)}">
            <button class="gc-popup-close" id="gc-cmd-close">×</button>
          </div>
          <div class="gc-popup-body" id="gc-cmd-body">
            ${cmdHtml}
          </div>
          <div class="gc-popup-footer">
            <button class="gc-btn gc-btn-primary" id="gc-cmd-send-all">发送全部指令给 Hermes</button>
            <button class="gc-btn gc-btn-secondary" id="gc-cmd-cancel">取消</button>
          </div>
        </div>
      </div>

      <!-- 必备技能面板 -->
      <div class="gc-popup-overlay ${showSkillPanel ? 'visible' : ''}" id="gc-skill-overlay">
        <div class="gc-popup-panel">
          <div class="gc-popup-header">
            <span class="gc-popup-title">📚 必备技能</span>
            <input type="text" class="gc-popup-search" id="gc-skill-search" placeholder="搜索技能..." value="${escHtml(skillSearch)}">
            <button class="gc-popup-close" id="gc-skill-close">×</button>
          </div>
          <div class="gc-popup-body" id="gc-skill-body">
            ${skillHtml}
          </div>
          <div class="gc-popup-footer">
            <button class="gc-btn gc-btn-primary" id="gc-skill-send-all">发送全部技能给 Hermes</button>
            <button class="gc-btn gc-btn-secondary" id="gc-skill-cancel">取消</button>
          </div>
        </div>
      </div>
    `

    bind()
    scrollBottom()
  }

  function buildCommandPanel() {
    const q = cmdSearch.toLowerCase()
    const filtered = COMMAND_CATEGORIES.map(cat => ({
      ...cat,
      commands: cat.commands.filter(c => !q || c.label.toLowerCase().includes(q) || c.cmd.toLowerCase().includes(q))
    })).filter(cat => cat.commands.length > 0)

    if (filtered.length === 0) return `<div class="gc-popup-empty">没有匹配的指令</div>`
    return filtered.map(cat => `
      <div class="gc-cmd-cat">
        <div class="gc-cmd-cat-name">${cat.name}</div>
        ${cat.commands.map(c => `
          <div class="gc-cmd-item" data-cmd="${escHtml(c.cmd)}">
            <span class="gc-cmd-label">${escHtml(c.label)}</span>
            <code class="gc-cmd-cmd">${escHtml(c.cmd)}</code>
            <button class="gc-cmd-send" data-cmd="${escHtml(c.cmd)}">发送</button>
          </div>
        `).join('')}
      </div>
    `).join('')
  }

  function buildSkillPanel() {
    const q = skillSearch.toLowerCase()
    const filtered = SKILL_CATEGORIES.map(cat => ({
      ...cat,
      skills: cat.skills.filter(s => !q || s.label.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q))
    })).filter(cat => cat.skills.length > 0)

    if (filtered.length === 0) return `<div class="gc-popup-empty">没有匹配的技能</div>`
    return filtered.map(cat => `
      <div class="gc-skill-cat">
        <div class="gc-skill-cat-name">${cat.name}</div>
        ${cat.skills.map(s => `
          <div class="gc-skill-item">
            <div class="gc-skill-info">
              <div class="gc-skill-label">${escHtml(s.label)}</div>
              <div class="gc-skill-desc">${escHtml(s.desc)}</div>
            </div>
            <button class="gc-skill-send" data-label="${escHtml(s.label)}" data-desc="${escHtml(s.desc)}">发送</button>
          </div>
        `).join('')}
      </div>
    `).join('')
  }

  function scrollBottom() {
    const m = el.querySelector('#gc-messages')
    if (m) m.scrollTop = m.scrollHeight
  }

  // ── Bind ────────────────────────────────────────────────
  function bind() {
    // New session
    el.querySelector('#gc-btn-new')?.addEventListener('click', () => {
      newSession()
      draw()
    })

    // Session click
    el.querySelectorAll('.gc-session-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('gc-session-del')) {
          e.stopPropagation()
          const id = e.currentTarget.dataset.del
          deleteSession(id)
          draw()
          return
        }
        activeId = item.dataset.id
        draw()
      })
    })

    // Send button
    el.querySelector('#gc-send-btn')?.addEventListener('click', async () => {
      const input = el.querySelector('#gc-input')
      if (!input?.value.trim()) return
      const text = input.value.trim()
      input.value = ''
      input.style.height = 'auto'
      streaming = true
      pendingText = ''
      activeTools = []
      cleanupListeners?.()
      const cleanup = await setupRunListeners()
      cleanupListeners = cleanup
      const cur = active()
      if (!cur) { newSession(); draw() }
      sendToHermes(text, activeId).catch(() => {})
    })

    // Input Enter to send
    const input = el.querySelector('#gc-input')
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        el.querySelector('#gc-send-btn')?.click()
      }
    })
    // Auto-resize textarea
    input?.addEventListener('input', () => {
      input.style.height = 'auto'
      input.style.height = Math.min(input.scrollHeight, 150) + 'px'
    })

    // ── 快捷指令按钮 ────────────────────────────────────
    el.querySelector('#gc-btn-commands')?.addEventListener('click', () => {
      showCmdPanel = true
      showSkillPanel = false
      draw()
      el.querySelector('#gc-cmd-search')?.focus()
    })

    // ── 必备技能按钮 ───────────────────────────────────
    el.querySelector('#gc-btn-skills')?.addEventListener('click', () => {
      showSkillPanel = true
      showCmdPanel = false
      draw()
      el.querySelector('#gc-skill-search')?.focus()
    })

    // ── 快捷指令面板 ────────────────────────────────────
    el.querySelector('#gc-cmd-close')?.addEventListener('click', () => {
      showCmdPanel = false
      draw()
    })
    el.querySelector('#gc-cmd-cancel')?.addEventListener('click', () => {
      showCmdPanel = false
      draw()
    })
    el.querySelector('#gc-cmd-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'gc-cmd-overlay') { showCmdPanel = false; draw() }
    })
    el.querySelector('#gc-cmd-search')?.addEventListener('input', (e) => {
      cmdSearch = e.target.value
      const body = el.querySelector('#gc-cmd-body')
      if (body) body.innerHTML = buildCommandPanel()
      bindCmdItems()
    })
    el.querySelector('#gc-cmd-send-all')?.addEventListener('click', () => {
      showCmdPanel = false
      streaming = true; pendingText = ''; activeTools = []
      cleanupListeners?.()
      const cleanup = setupRunListeners().then(fn => { cleanupListeners = fn })
      newSession()
      sendToHermes(QUICK_COMMANDS_DOC, activeId).catch(() => {})
      draw()
    })

    // ── 必备技能面板 ────────────────────────────────────
    el.querySelector('#gc-skill-close')?.addEventListener('click', () => {
      showSkillPanel = false
      draw()
    })
    el.querySelector('#gc-skill-cancel')?.addEventListener('click', () => {
      showSkillPanel = false
      draw()
    })
    el.querySelector('#gc-skill-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'gc-skill-overlay') { showSkillPanel = false; draw() }
    })
    el.querySelector('#gc-skill-search')?.addEventListener('input', (e) => {
      skillSearch = e.target.value
      const body = el.querySelector('#gc-skill-body')
      if (body) body.innerHTML = buildSkillPanel()
      bindSkillItems()
    })
    el.querySelector('#gc-skill-send-all')?.addEventListener('click', () => {
      showSkillPanel = false
      streaming = true; pendingText = ''; activeTools = []
      cleanupListeners?.()
      cleanupListeners = null
      newSession()
      sendToHermes(ESSENTIAL_SKILLS_DOC, activeId).catch(() => {})
      draw()
    })

    // Bind command item send buttons (after panel is drawn)
    bindCmdItems()
    bindSkillItems()
  }

  function bindCmdItems() {
    el.querySelectorAll('.gc-cmd-send').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const cmd = btn.dataset.cmd
        if (!cmd) return
        showCmdPanel = false
        newSession()
        streaming = true; pendingText = ''; activeTools = []
        cleanupListeners?.()
        cleanupListeners = null
        draw()
        sendToHermes(cmd, activeId).catch(() => {})
      })
    })
    // Click on item row also sends
    el.querySelectorAll('.gc-cmd-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.gc-cmd-send')) return
        const cmd = item.dataset.cmd
        if (!cmd) return
        showCmdPanel = false
        newSession()
        streaming = true; pendingText = ''; activeTools = []
        cleanupListeners?.()
        cleanupListeners = null
        draw()
        sendToHermes(cmd, activeId).catch(() => {})
      })
    })
  }

  function bindSkillItems() {
    el.querySelectorAll('.gc-skill-send').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const label = btn.dataset.label
        const desc = btn.dataset.desc
        const text = `请学习以下技能：\n\n【技能名称】${label}\n\n【技能说明】${desc}`
        showSkillPanel = false
        streaming = true; pendingText = ''; activeTools = []
        cleanupListeners?.()
        cleanupListeners = null
        draw()
        sendToHermes(text, activeId).catch(() => {})
      })
    })
  }

  // ── Skills page event: apply skill to Hermes chat ───────
  window.addEventListener('hermes-skill-apply', (e) => {
    const { name, content } = e.detail || {}
    if (!content) return
    const cur = active()
    if (!cur) { newSession() }
    const id = activeId
    const sess = sessions.find(s => s.id === id)
    if (sess) {
      sess.messages.push({ role: 'user', content, _time: Date.now() })
      sess.updated = Date.now()
      if (!sess.title) sess.title = `技能: ${name || content.slice(0, 28)}`
      saveSessions(sessions)
    }
    streaming = true; pendingText = ''; activeTools = []
    cleanupListeners?.()
    cleanupListeners = null
    draw()
    sendToHermes(content, id).catch(() => {})
  })

  // Init
  if (!sessions.length) newSession()
  draw()

  return el
}
