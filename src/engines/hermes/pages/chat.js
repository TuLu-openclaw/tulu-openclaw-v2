/**
 * Hermes Chat — 高级聊天面板（Phase 4）。
 *
 * 布局对齐 `hermes-web-ui` 的 ChatPanel：
 *   ┌────────────────┬──────────────────────────────────────────────┐
 *   │ SessionList    │ Header: title · source · new-chat button     │
 *   │ (groups +      ├──────────────────────────────────────────────┤
 *   │  pinned +      │ MessageList (user / assistant / tool)        │
 *   │  live badge)   │                                              │
 *   │                ├──────────────────────────────────────────────┤
 *   │                │ ChatInput (textarea + slash menu + send)     │
 *   └────────────────┴──────────────────────────────────────────────┘
 *
 * 状态存放在 `chat-store.js`；本模块只负责 DOM 与事件交互。
 */
import { t } from '../../../lib/i18n.js'
import { api } from '../../../lib/tauri-api.js'
import { toast } from '../../../components/toast.js'
import { showConfirm } from '../../../components/modal.js'
import { getActiveEngineId } from '../../../lib/engine-manager.js'
import { runDualEngineCollab } from '../../../lib/collab-orchestrator.js'
import { getChatStore, getSourceLabel } from '../lib/chat-store.js'

const HERMES_COMMANDS_PROMPT = `Hermes，以下是你必须学会并熟练掌握的最全指令大全，涵盖了你所有的工作场景。你必须将这些指令烂熟于心，做到随用随取，执行无误。

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

const HERMES_SKILLS_PROMPT = `Hermes，以下是必须掌握的技能清单，你需尽快学习并内化这些能力，确保在后续任务中能高效、准确地执行。

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
- 当用户意图模糊时，主动用封闭式问题确认（如“是否需要生成Python代码？”）。
2. 指令遵循与精确执行
- 对用户明确指定的格式要求（如“用表格对比A/B方案”），需严格遵循，不得自行简化。
- 若任务涉及多步骤操作，需分阶段反馈进度，例如：“已完成数据收集，正在生成分析报告。”
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
- 复杂任务需拆解为子任务清单，例如“市场调研”分解为“竞品分析→用户访谈→报告撰写”。
- 执行中若遇到资源冲突（如工具调用超限），需动态调整任务优先级，并向用户说明调整原因。

以上技能需在7日内完成学习，并通过以下考核：

1. 模拟任务测试：完成“自动生成周报并邮件发送”的全流程任务。
2. 技能覆盖率检查：确保 ~/.hermes/skills/ 目录下至少包含5个自动生成的技能文件。
3. 用户满意度评分：连续3天执行任务后，收集用户反馈，满意度需达90%以上。

考核通过后，将开启技能进阶训练，包括跨平台工具调用、多智能体协作等模块。请尽快落实。`

const COLLAB_TASK_PRESETS = [
  {
    key: 'code-fix',
    name: '代码修复闭环',
    leadEngine: 'Hermes',
    supportEngine: 'OpenClaw',
    leadTask: '由 Hermes 负责阅读代码、定位问题、编写修复方案并输出补丁。',
    supportTask: '由 OpenClaw 负责执行构建、测试、运行验证，并返回失败日志或通过结论。',
    autoIterate: true,
    maxRounds: 3,
  },
  {
    key: 'ui-regression',
    name: 'UI 回归排查',
    leadEngine: 'Hermes',
    supportEngine: 'OpenClaw',
    leadTask: '由 Hermes 负责分析前端页面、路由、状态和渲染链路，提出修复并修改代码。',
    supportTask: '由 OpenClaw 负责跑构建、复测页面入口、补充日志和回归验证。',
    autoIterate: true,
    maxRounds: 3,
  },
  {
    key: 'diagnosis',
    name: '日志诊断协同',
    leadEngine: 'OpenClaw',
    supportEngine: 'Hermes',
    leadTask: '由 OpenClaw 负责抓取运行状态、日志、接口响应和系统环境信息。',
    supportTask: '由 Hermes 负责基于证据链做根因分析、假设收敛和修复建议。',
    autoIterate: true,
    maxRounds: 3,
  },
  {
    key: 'doc-plan',
    name: '方案/文档协同',
    leadEngine: 'Hermes',
    supportEngine: 'OpenClaw',
    leadTask: '由 Hermes 负责输出设计方案、文档草稿和结构化说明。',
    supportTask: '由 OpenClaw 负责核对实现可行性、命令可执行性和环境差异。',
    autoIterate: false,
    maxRounds: 2,
  },
]
const HERMES_COMMAND_OPTIONS = [
  ['hermes', '进入交互终端'],
  ['hermes help', '查看全部命令'],
  ['hermes version', '查看版本号'],
  ['hermes info', '查看系统信息'],
  ['hermes clear', '清空上下文'],
  ['hermes status', '检查服务状态'],
  ['hermes start', '后台启动服务'],
  ['hermes stop', '停止服务'],
  ['hermes restart', '重启服务'],
  ['hermes skill list', '列出技能'],
  ['hermes skill show <skill_name>', '查看技能详情'],
  ['hermes skill run <skill_name>', '运行技能'],
  ['hermes skill edit <skill_name>', '编辑技能'],
  ['hermes skill delete <skill_name>', '删除技能'],
  ['hermes plugin list', '列出插件'],
  ['hermes plugin install <plugin_name>', '安装插件'],
  ['hermes plugin uninstall <plugin_name>', '卸载插件'],
  ['hermes plugin enable <plugin_name>', '启用插件'],
  ['hermes plugin disable <plugin_name>', '禁用插件'],
  ['hermes plugin market', '浏览插件市场'],
  ['hermes config edit', '编辑主配置'],
  ['hermes config reset', '重置配置'],
  ['hermes config show', '查看当前配置'],
  ['hermes model switch <model_name>', '切换模型'],
  ['hermes doctor', '运行系统诊断'],
  ['hermes logs', '查看日志'],
  ['hermes logs -f', '实时跟踪日志'],
  ['hermes cache clean', '清理缓存'],
  ['pkill -f hermes', '强制终止进程'],
  ['hermes serve --host 0.0.0.0 --port 8080 &', '按指定端口启动服务'],
  ['hermes local pull <model_name>', '拉取本地模型'],
  ['hermes web', '启动 Web 界面'],
]

// ----------------------------------------------------------- helpers

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function sanitizeMarkdownUrl(url) {
  const raw = String(url || '').trim()
  if (!raw) return '#'
  if (raw.startsWith('#')) return raw
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  try {
    const u = new URL(raw, window.location.origin)
    if (['http:', 'https:', 'mailto:'].includes(u.protocol)) return raw
  } catch {}
  return '#'
}

/** 最小 Markdown → HTML（支持围栏代码、粗体/斜体、标题、列表、链接）。 */
function mdToHtml(text) {
  if (!text) return ''
  const blocks = []
  let out = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = blocks.push({ lang, code }) - 1
    return `\u0000CB_${idx}\u0000`
  })
  out = out
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/^#### (.+)$/gm, '<h5>$1</h5>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/^(?:\s*[-*]\s+(.+))(?:\n\s*[-*]\s+(.+))*/gm, (m) =>
      '<ul>' + m.trim().split(/\n\s*[-*]\s+/).map(li => `<li>${li.replace(/^[-*]\s+/, '')}</li>`).join('') + '</ul>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) =>
      `<a href="${escAttr(sanitizeMarkdownUrl(url))}" target="_blank" rel="noopener noreferrer">${label}</a>`)
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>')
  out = out.replace(/\u0000CB_(\d+)\u0000/g, (_, i) => {
    const { lang, code } = blocks[Number(i)]
    return `<pre class="hm-chat-code-block"><button type="button" class="hm-chat-code-copy" title="${escAttr(t('engine.chatCopyCode'))}">${escHtml(t('engine.chatCopyMessageShort'))}</button><code class="lang-${escHtml(lang)}">${escHtml(code)}</code></pre>`
  })
  return `<p>${out}</p>`
}

const markdownHtmlCache = new Map()

function renderMarkdownCached(text) {
  const key = String(text || '')
  if (!key) return ''
  if (markdownHtmlCache.has(key)) return markdownHtmlCache.get(key)
  const html = mdToHtml(key)
  if (markdownHtmlCache.size > 400) {
    const oldest = markdownHtmlCache.keys().next().value
    if (oldest !== undefined) markdownHtmlCache.delete(oldest)
  }
  markdownHtmlCache.set(key, html)
  return html
}

/** 将类 JSON 的工具输出美化显示；失败时回退为原始字符串。 */
function prettyJson(val) {
  if (val == null || val === '') return ''
  if (typeof val === 'string') {
    const s = val.trim()
    if (s.startsWith('{') || s.startsWith('[')) {
      try { return JSON.stringify(JSON.parse(s), null, 2) } catch {}
    }
    return val
  }
  try { return JSON.stringify(val, null, 2) } catch { return String(val) }
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (!Number.isFinite(d.getTime())) return ''
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

function sessionDisplayTitle(s) {
  return s.title || t('engine.chatNewSession')
}

/** 紧凑 Token 格式化：`1234567 → "1.2M"`、`12345 → "12.3k"`、`42 → "42"`。 */
function formatTokens(n) {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(Math.round(n))
}

/** USD 成本格式化：`0.0042 → "$0.0042"`、`0.51 → "$0.51"`、`12.3 → "$12.30"`。 */
function formatCost(usd) {
  if (typeof usd !== 'number' || !Number.isFinite(usd) || usd <= 0) return ''
  if (usd < 0.01) return '$' + usd.toFixed(4)
  if (usd < 1) return '$' + usd.toFixed(3)
  return '$' + usd.toFixed(2)
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {}
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

// ----------------------------------------------------------- icons

const ICONS = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="10" height="10"><polyline points="9 18 15 12 9 6"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M5 8h14"/><path d="M8 3h8v5l3 5H5l3-5z"/></svg>',
  spinner: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" stroke-linecap="round"><circle cx="12" cy="12" r="8" opacity="0.25"/><path d="M20 12a8 8 0 0 0-8-8"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" width="13" height="13"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="11" height="11"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="12" height="12" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" width="11" height="11"><polyline points="20 6 9 17 4 12"/></svg>',
  checkboxOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>',
  checkboxOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" opacity="0.18"/><polyline points="7 12 11 16 17 8"/></svg>',
  tool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="11" height="11"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
  sidebar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',
}

const SLASH_COMMANDS = [
  { cmd: '/help',    desc: 'chatSlashHelpDesc' },
  { cmd: '/status',  desc: 'chatSlashStatusDesc' },
  { cmd: '/memory',  desc: 'chatSlashMemoryDesc' },
  { cmd: '/skills',  desc: 'chatSlashSkillsDesc' },
  { cmd: '/clear',   desc: 'chatSlashClearDesc' },
  { cmd: '/new',     desc: 'chatSlashNewDesc' },
]

// ----------------------------------------------------------- rename modal

/**
 * Lightweight rename modal (used by sidebar context menu). Returns the new
 * title on confirm, or `null` on cancel. Mirrors `showConfirm`'s pattern
 * so we don't need Vue-style reactivity.
 */
function showRenameModal(current) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `
      <div class="modal hm-chat-rename-modal" style="max-width:420px">
        <div class="modal-title">${escHtml(t('engine.chatRenameSession'))}</div>
        <div class="modal-body">
          <input type="text" class="hm-input hm-chat-rename-input"
                 value="${escAttr(current || '')}"
                 placeholder="${escHtml(t('engine.chatEnterNewTitle'))}"/>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" data-act="cancel">${escHtml(t('common.cancel'))}</button>
          <button class="btn btn-primary btn-sm" data-act="ok">${escHtml(t('common.confirm'))}</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)
    const input = overlay.querySelector('.hm-chat-rename-input')
    input?.focus()
    input?.select()

    const close = (v) => { overlay.remove(); resolve(v) }
    const confirm = () => {
      const v = input?.value.trim() || ''
      if (!v) { input?.focus(); return }
      close(v)
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null)
    })
    overlay.querySelector('[data-act="cancel"]').onclick = () => close(null)
    overlay.querySelector('[data-act="ok"]').onclick = confirm
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); confirm() }
      else if (e.key === 'Escape') close(null)
    })
  })
}

// ----------------------------------------------------------- context menu

function showContextMenu(x, y, items) {
  const existing = document.querySelector('.hm-chat-ctxmenu')
  if (existing) existing.remove()
  const menu = document.createElement('div')
  menu.className = 'hm-chat-ctxmenu'
  menu.innerHTML = items.map((it, i) => `
    <button class="hm-chat-ctxmenu-item ${it.danger ? 'is-danger' : ''}" data-idx="${i}">
      ${it.icon || ''}<span>${escHtml(it.label)}</span>
    </button>
  `).join('')

  document.body.appendChild(menu)
  // Position + clamp to viewport.
  const rect = menu.getBoundingClientRect()
  const vw = window.innerWidth, vh = window.innerHeight
  menu.style.left = Math.min(x, vw - rect.width - 8) + 'px'
  menu.style.top = Math.min(y, vh - rect.height - 8) + 'px'

  const close = () => {
    menu.remove()
    document.removeEventListener('click', onDocClick, true)
    document.removeEventListener('keydown', onKey)
  }
  const onDocClick = (e) => {
    if (!menu.contains(e.target)) close()
  }
  const onKey = (e) => { if (e.key === 'Escape') close() }
  setTimeout(() => {
    document.addEventListener('click', onDocClick, true)
    document.addEventListener('keydown', onKey)
  }, 0)
  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('.hm-chat-ctxmenu-item')
    if (!btn) return
    const idx = Number(btn.dataset.idx)
    close()
    items[idx]?.action?.()
  })
}

// ----------------------------------------------------------- main render

export function render() {
  const el = document.createElement('div')
  el.className = 'hermes-chat-page'
  el.dataset.engine = 'hermes'

  const store = getChatStore()

  // Local UI-only state (not in store).
  let sidebarOpen = !window.matchMedia('(max-width: 768px)').matches
  const expandedToolIds = new Set()   // tool message ids (persist across redraws)
  let showSlash = false
  let slashFilter = ''
  let gwOnline = false
  let currentModel = ''
  const mobileQuery = window.matchMedia('(max-width: 720px)')

  // Input state must live outside the textarea DOM node because every draw()
  // rebuilds innerHTML. Without this, typing `/` would wipe the composed text
  // when the slash menu triggers a redraw.
  let inputValue = ''
  let inputFocused = false
  let inputCaret = 0                  // caret position restored after re-render
  let lastActiveSessionId = store.state.activeSessionId
  let forceScrollBottom = true
  let quickCommandMenuOpen = false
  let quickCommandQuery = ''

  // Multi-select for batch session deletion. When non-null, the sidebar
  // switches into "selection mode": a checkbox appears on every row and
  // selecting items doesn't switch sessions.
  let selectionMode = false
  const selected = new Set()

  // Profile switcher dropdown (for Hermes multi-profile / multi-agent).
  let profileMenuOpen = false

  // Session search modal state. `null` means closed.
  // { query: string, selectedIdx: number }
  let searchState = null

  let drawQueued = false
  function scheduleDraw() {
    if (drawQueued) return
    drawQueued = true
    requestAnimationFrame(() => {
      drawQueued = false
      draw()
    })
  }

  // --- initial session load + model meta ---
  Promise.allSettled([
    store.loadSessions(),
    store.loadProfiles(),
    api.checkHermes(),
  ]).then(results => {
    const info = results[2]?.status === 'fulfilled' ? results[2].value : null
    gwOnline = !!info?.gatewayRunning
    currentModel = info?.model || ''
    scheduleDraw()
  })

  // ----------------------------------------------------------- subscription

  // Store subscription → `draw()` on mutation. rAF-batched again here so page-
  // local bursts (especially streaming deltas + tool events) collapse into one
  // repaint per frame.
  const unsubscribe = store.subscribe(() => scheduleDraw())

  // Teardown + mount-observer are set up near the end of render() (after
  // `onGlobalKey` is defined). We avoid attaching a MutationObserver here
  // to prevent a double-teardown path.

  // ----------------------------------------------------------- rendering

  function renderSessionItem(s) {
    const isActive = s.id === store.state.activeSessionId
    const isLive = store.isSessionLive(s.id)
    const isPinned = store.state.pinned.has(s.id)
    const isSelected = selected.has(s.id)
    // IMPORTANT: outer wrapper is a `<div role="button">`, NOT a `<button>`.
    // Nesting a real <button class="hm-chat-session-del"> inside another
    // <button> is invalid HTML — the parser silently closes the outer
    // button at the inner button's start tag, hoisting the delete control
    // out of the row. That's why delete clicks did nothing in the wild.
    return `
      <div class="hm-chat-session-item ${isActive ? 'is-active' : ''} ${isLive ? 'is-live' : ''} ${isSelected ? 'is-selected' : ''}"
           role="button" tabindex="0"
           data-sid="${escAttr(s.id)}">
        ${selectionMode ? `
          <button class="hm-chat-session-check hm-chat-session-action ${isSelected ? 'is-on' : ''}"
                  data-sid-check="${escAttr(s.id)}"
                  aria-pressed="${isSelected ? 'true' : 'false'}"
                  title="${escHtml(t(isSelected ? 'engine.chatDeselect' : 'engine.chatSelect'))}">
            ${isSelected ? ICONS.checkboxOn : ICONS.checkboxOff}
          </button>
        ` : ''}
        <div class="hm-chat-session-main">
          <div class="hm-chat-session-title-row">
            ${isLive ? `<span class="hm-chat-session-spinner" aria-hidden="true">${ICONS.spinner}</span>` : ''}
            ${isPinned ? `<span class="hm-chat-session-pin" aria-hidden="true">${ICONS.pin}</span>` : ''}
            <span class="hm-chat-session-title" data-sid-rename="${escAttr(s.id)}" title="双击重命名会话">${escHtml(sessionDisplayTitle(s))}</span>
            ${isLive ? `<span class="hm-chat-session-live"><span class="hm-chat-live-dot"></span>${escHtml(t('engine.chatLive'))}</span>` : ''}
          </div>
          <div class="hm-chat-session-meta">
            ${s.model ? `<span class="hm-chat-session-model">${escHtml(s.model)}</span>` : ''}
            <span class="hm-chat-session-time">${escHtml(formatTime(s.updatedAt || s.createdAt))}</span>
          </div>
        </div>
        ${selectionMode ? '' : `
          <div class="hm-chat-session-actions" aria-label="${escAttr(t('engine.chatSessionActions'))}">
            <button class="hm-chat-session-menu hm-chat-session-action"
                    data-sid-menu="${escAttr(s.id)}"
                    title="${escHtml(t('engine.chatMoreActions'))}">
              ${ICONS.more}
            </button>
            <button class="hm-chat-session-del hm-chat-session-action"
                    data-sid-del="${escAttr(s.id)}"
                    title="${escHtml(t('engine.chatDeleteSession'))}">
              ${ICONS.trash}<span>${escHtml(t('engine.chatDeleteShort'))}</span>
            </button>
          </div>
        `}
      </div>
    `
  }

  function visibleSessionIds() {
    return store.state.sessions.map(s => s.id)
  }

  function renderProfileSwitcher() {
    const profiles = store.state.profiles || []
    const active = store.state.activeProfile || 'default'
    if (!profiles.length) {
      // Fallback: even when CLI doesn't expose profiles, surface the active
      // one so the user knows what they're talking to.
      return `
        <button class="hm-chat-profile-toggle" id="hm-chat-profile-toggle" type="button" disabled
                title="${escHtml(t('engine.chatProfileSingle'))}">
          ${ICONS.layers}
          <span class="hm-chat-profile-name">${escHtml(active)}</span>
        </button>
      `
    }
    return `
      <button class="hm-chat-profile-toggle ${profileMenuOpen ? 'is-open' : ''}" id="hm-chat-profile-toggle" type="button"
              aria-haspopup="menu" aria-expanded="${profileMenuOpen ? 'true' : 'false'}"
              title="${escHtml(t('engine.chatProfileTooltip'))}">
        ${ICONS.layers}
        <span class="hm-chat-profile-name">${escHtml(active)}</span>
        <span class="hm-chat-profile-caret">${ICONS.chevron}</span>
      </button>
      ${profileMenuOpen ? `
        <div class="hm-chat-profile-menu" role="menu">
          <div class="hm-chat-profile-menu-head">${escHtml(t('engine.chatProfileMenuHead'))}</div>
          ${profiles.map(p => `
            <button class="hm-chat-profile-item ${p.name === active ? 'is-active' : ''}"
                    role="menuitem"
                    data-profile="${escAttr(p.name)}"
                    ${store.state.streaming ? 'disabled' : ''}
                    title="${escHtml(p.model || '')}">
              <span class="hm-chat-profile-item-name">${escHtml(p.name)}</span>
              ${p.gatewayRunning ? `<span class="hm-chat-profile-item-badge">${escHtml(t('engine.chatProfileRunning'))}</span>` : ''}
              ${p.name === active ? `<span class="hm-chat-profile-item-active" aria-hidden="true">${ICONS.check}</span>` : ''}
            </button>
          `).join('')}
          <div class="hm-chat-profile-menu-foot">${escHtml(t('engine.chatProfileMenuFoot'))}</div>
        </div>
      ` : ''}
    `
  }

  function renderSidebar() {
    const { pinned, groups } = store.groupedSessions()
    const sessionsEmpty = store.state.sessions.length === 0
    const allIds = visibleSessionIds()
    const allSelected = selectionMode && allIds.length > 0 && allIds.every(id => selected.has(id))
    return `
      <aside class="hm-chat-sidebar ${sidebarOpen ? '' : 'is-collapsed'} ${selectionMode ? 'is-select-mode' : ''}">
        <div class="hm-chat-sidebar-profile">
          ${renderProfileSwitcher()}
        </div>
        <div class="hm-chat-sidebar-head">
          <span class="hm-chat-sidebar-title">${escHtml(t('engine.chatSessions'))}</span>
          <div class="hm-chat-sidebar-head-actions">
            <button class="hm-chat-select-toggle ${selectionMode ? 'is-active' : ''}" id="hm-chat-select-toggle"
                    title="${escHtml(t(selectionMode ? 'engine.chatExitSelect' : 'engine.chatBulkSelect'))}"
                    aria-pressed="${selectionMode ? 'true' : 'false'}">
              ${selectionMode ? ICONS.close : ICONS.check}
            </button>
            <button class="hm-chat-new-btn" title="${escHtml(t('engine.chatNewChat'))}" ${selectionMode ? 'disabled' : ''}>
              ${ICONS.plus}
            </button>
          </div>
        </div>
        ${selectionMode ? `
          <div class="hm-chat-bulkbar">
            <button class="hm-chat-bulkbar-select-all" id="hm-chat-bulk-select-all"
                    aria-pressed="${allSelected ? 'true' : 'false'}">
              ${allSelected ? ICONS.checkboxOn : ICONS.checkboxOff}
              <span>${escHtml(t(allSelected ? 'engine.chatSelectNone' : 'engine.chatSelectAll'))}</span>
            </button>
            <span class="hm-chat-bulkbar-count">${escHtml(t('engine.chatSelectedCount').replace('{n}', String(selected.size)))}</span>
            <button class="hm-chat-bulkbar-delete" id="hm-chat-bulk-delete" ${selected.size === 0 ? 'disabled' : ''}>
              ${ICONS.trash}<span>${escHtml(t('engine.chatBulkDelete'))}</span>
            </button>
          </div>
        ` : `<div class="hm-chat-sidebar-tip">${escHtml(t('engine.chatSessionManageHint'))}</div>`}
        <div class="hm-chat-sidebar-body">
          ${store.state.loading && sessionsEmpty ? `<div class="hm-chat-sidebar-loading">${escHtml(t('engine.chatLoading'))}</div>` : ''}
          ${!store.state.loading && sessionsEmpty ? `<div class="hm-chat-sidebar-empty">${escHtml(t('engine.chatNoSessions'))}</div>` : ''}
          ${pinned.length ? `
            <div class="hm-chat-group">
              <div class="hm-chat-group-head hm-chat-group-head--static">
                <span class="hm-chat-group-label">${escHtml(t('engine.chatPinned'))}</span>
                <span class="hm-chat-group-count">${pinned.length}</span>
              </div>
              ${pinned.map(renderSessionItem).join('')}
            </div>
          ` : ''}
          ${groups.map(g => {
            const isCollapsed = store.state.collapsed.has(g.source)
            return `
              <div class="hm-chat-group">
                <button class="hm-chat-group-head ${isCollapsed ? 'is-collapsed' : ''}" data-group="${escAttr(g.source)}">
                  <span class="hm-chat-group-arrow">${ICONS.chevron}</span>
                  <span class="hm-chat-group-label">${escHtml(g.label)}</span>
                  <span class="hm-chat-group-count">${g.sessions.length}</span>
                </button>
                ${!isCollapsed ? g.sessions.map(renderSessionItem).join('') : ''}
              </div>
            `
          }).join('')}
        </div>
      </aside>
    `
  }

  function renderToolMessage(m) {
    const expanded = expandedToolIds.has(m.id)
    const hasDetails = !!(m.toolArgs || m.toolResult)
    return `
      <div class="hm-chat-msg hm-chat-msg--tool" data-mid="${escAttr(m.id)}">
        <div class="hm-chat-tool-line ${hasDetails ? 'is-expandable' : ''}" data-tool-toggle="${escAttr(m.id)}">
          ${hasDetails
            ? `<span class="hm-chat-tool-chevron ${expanded ? 'is-open' : ''}">${ICONS.chevron}</span>`
            : `<span class="hm-chat-tool-icon">${ICONS.tool}</span>`}
          <span class="hm-chat-tool-name">${escHtml(m.toolName || 'tool')}</span>
          ${!expanded && m.toolPreview ? `<span class="hm-chat-tool-preview">${escHtml(m.toolPreview)}</span>` : ''}
          ${m.toolStatus === 'running' ? `<span class="hm-chat-tool-spinner"></span>` : ''}
          ${m.toolStatus === 'error' ? `<span class="hm-chat-tool-err">${escHtml(t('engine.chatErrorBadge'))}</span>` : ''}
        </div>
        ${expanded && hasDetails ? `
          <div class="hm-chat-tool-details">
            ${m.toolArgs ? `
              <div class="hm-chat-tool-section">
                <div class="hm-chat-tool-label">${escHtml(t('engine.chatArguments'))}</div>
                <pre class="hm-chat-tool-code">${escHtml(prettyJson(m.toolArgs))}</pre>
              </div>
            ` : ''}
            ${m.toolResult ? `
              <div class="hm-chat-tool-section">
                <div class="hm-chat-tool-label">${escHtml(t('engine.chatResult'))}</div>
                <pre class="hm-chat-tool-code">${escHtml(prettyJson(m.toolResult))}</pre>
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `
  }

  function renderMessage(m) {
    if (m.role === 'tool') return renderToolMessage(m)
    if (m.role === 'system') {
      return `
        <div class="hm-chat-msg hm-chat-msg--system" data-mid="${escAttr(m.id)}">
          <div class="hm-chat-msg-bubble">
            <div class="hm-chat-msg-content">${renderMarkdownCached(m.content)}</div>
          </div>
        </div>
      `
    }
    const isUser = m.role === 'user'
    const canCopy = !!(m.content || '').trim()
    return `
      <div class="hm-chat-msg hm-chat-msg--${escHtml(m.role)}" data-mid="${escAttr(m.id)}">
        <div class="hm-chat-msg-body">
          ${!isUser ? `<div class="hm-chat-msg-avatar" aria-hidden="true">H</div>` : ''}
          <div class="hm-chat-msg-content-wrap">
            <div class="hm-chat-msg-bubble">
              <div class="hm-chat-msg-content">${renderMarkdownCached(m.content)}${m.isStreaming && !m.content ? '<span class="hm-chat-streaming-dots"><span></span><span></span><span></span></span>' : ''}</div>
            </div>
            <div class="hm-chat-msg-footer">
              <span class="hm-chat-msg-time">${escHtml(formatTime(m.timestamp))}</span>
              ${canCopy ? `
                <button class="hm-chat-msg-copy" data-copy-mid="${escAttr(m.id)}" title="${escHtml(t('engine.chatCopyMessage'))}">
                  ${ICONS.copy}<span>${escHtml(t('engine.chatCopyMessageShort'))}</span>
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `
  }

  function renderLiveTools() {
    if (!store.state.streaming) return ''
    const tools = store.state.liveTools
    return `
      <div class="hm-chat-streaming">
        <div class="hm-chat-streaming-mark">
          <span class="hm-chat-streaming-pulse"></span>
          <span class="hm-chat-streaming-label">${escHtml(t('engine.chatThinking'))}</span>
        </div>
        ${tools.length ? `
          <div class="hm-chat-live-tools">
            ${tools.slice().reverse().map(tc => `
              <div class="hm-chat-live-tool">
                <span class="hm-chat-live-tool-icon">${ICONS.tool}</span>
                <span class="hm-chat-live-tool-name">${escHtml(tc.name)}</span>
                ${tc.preview ? `<span class="hm-chat-live-tool-preview">${escHtml(tc.preview)}</span>` : ''}
                ${tc.status === 'running' ? `<span class="hm-chat-tool-spinner"></span>` : ''}
                ${tc.status === 'error' ? `<span class="hm-chat-tool-err">${escHtml(t('engine.chatErrorBadge'))}</span>` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `
  }

  function renderMessages() {
    const s = store.activeSession()
    if (!s) {
      return `<div class="hm-chat-messages-empty">${escHtml(t('engine.chatNewSession'))}</div>`
    }
    if (store.state.loadingMessages) {
      return `
        <div class="hm-chat-messages-empty">
          <div class="hm-chat-empty-title">${escHtml(t('engine.chatLoadingMessages'))}</div>
          <div class="hm-chat-empty-sub">${escHtml(t('engine.chatLoadingMessagesSub'))}</div>
        </div>
      `
    }
    if (!s.messages.length && !store.state.streaming) {
      return `
        <div class="hm-chat-messages-empty">
          <div class="hm-chat-empty-title">${escHtml(t('engine.chatEmptyTitle'))}</div>
          <div class="hm-chat-empty-sub">${escHtml(t('engine.chatEmptySub'))}</div>
        </div>
      `
    }
    return s.messages.map(renderMessage).join('') + renderLiveTools()
  }

  function renderSlashMenu() {
    if (!showSlash) return ''
    const filtered = SLASH_COMMANDS.filter(c => !slashFilter || c.cmd.includes(slashFilter))
    if (!filtered.length) return ''
    return `
      <div class="hm-chat-slash-menu">
        ${filtered.map(c => `
          <button class="hm-chat-slash-item" data-cmd="${escAttr(c.cmd)}">
            <span class="hm-chat-slash-cmd">${escHtml(c.cmd)}</span>
            <span class="hm-chat-slash-desc">${escHtml(t('engine.' + c.desc))}</span>
          </button>
        `).join('')}
      </div>
    `
  }

  function renderQuickCommandMenu() {
    if (!quickCommandMenuOpen) return ''
    const q = quickCommandQuery.trim().toLowerCase()
    const filtered = HERMES_COMMAND_OPTIONS.filter(([cmd, desc]) => {
      if (!q) return true
      const hay = `${cmd} ${desc}`.toLowerCase()
      return hay.includes(q)
    })
    return `
      <div class="hm-chat-quick-command-menu" id="hm-chat-quick-command-menu">
        <div class="hm-chat-quick-command-head">
          <div class="hm-chat-quick-command-title">Hermes 快捷指令</div>
          <button type="button" class="hm-chat-quick-command-close" id="hm-chat-quick-command-close" title="关闭">${ICONS.close}</button>
        </div>
        <div class="hm-chat-quick-command-search-wrap">
          <input type="text" id="hm-chat-quick-command-search" class="hm-chat-quick-command-search"
                 placeholder="搜索命令或说明..." value="${escAttr(quickCommandQuery)}" />
        </div>
        <div class="hm-chat-quick-command-list">
          ${filtered.length ? filtered.map(([cmd, desc]) => `
            <button type="button" class="hm-chat-quick-command-item" data-quick-command="${escAttr(cmd)}">
              <span class="hm-chat-quick-command-item-main">
                <span class="hm-chat-quick-command-item-cmd">${escHtml(cmd)}</span>
                <span class="hm-chat-quick-command-item-desc">${escHtml(desc)}</span>
              </span>
              <span class="hm-chat-quick-command-item-send">发送</span>
            </button>
          `).join('') : `<div class="hm-chat-quick-command-empty">没有匹配的快捷指令</div>`}
        </div>
      </div>
    `
  }

  function renderCollabPicker() {
    if (!collabPickerOpen) return ''
    const mkBtn = (kind, value, current) => `
      <button type="button" class="hm-collab-picker-chip ${current === value ? 'is-active' : ''}" data-collab-${kind}="${escAttr(value)}">${escHtml(value)}</button>
    `
    const presetCards = COLLAB_TASK_PRESETS.map(preset => `
      <button type="button" class="hm-collab-picker-preset" data-collab-preset="${escAttr(preset.key)}">
        <span class="hm-collab-picker-preset-title">${escHtml(preset.name)}</span>
        <span class="hm-collab-picker-preset-meta">${escHtml(preset.leadEngine)} → ${escHtml(preset.supportEngine)} · ${preset.autoIterate ? '自动迭代' : '单轮'}</span>
      </button>
    `).join('')
    return `
      <div class="hm-collab-picker" id="hm-collab-picker">
        <div class="hm-collab-picker-head">
          <div class="hm-collab-picker-title">真协同配置面板</div>
          <button type="button" class="hm-collab-picker-close" id="hm-collab-picker-close" title="关闭">${ICONS.close}</button>
        </div>
        <div class="hm-collab-picker-group">
          <div class="hm-collab-picker-label">快捷预设</div>
          <div class="hm-collab-picker-preset-list">${presetCards}</div>
        </div>
        <div class="hm-collab-picker-group">
          <div class="hm-collab-picker-label">主导引擎</div>
          <div class="hm-collab-picker-row">
            ${mkBtn('lead', 'Hermes', collabLeadEngine)}
            ${mkBtn('lead', 'OpenClaw', collabLeadEngine)}
          </div>
        </div>
        <div class="hm-collab-picker-group">
          <div class="hm-collab-picker-label">协作引擎</div>
          <div class="hm-collab-picker-row">
            ${mkBtn('support', 'Hermes', collabSupportEngine)}
            ${mkBtn('support', 'OpenClaw', collabSupportEngine)}
          </div>
        </div>
        <div class="hm-collab-picker-group">
          <div class="hm-collab-picker-label">主导任务</div>
          <textarea id="hm-collab-lead-task" class="hm-chat-input" rows="3" placeholder="例如：由 Hermes 编写代码、修改文件、输出补丁">${escHtml(collabLeadTask)}</textarea>
        </div>
        <div class="hm-collab-picker-group">
          <div class="hm-collab-picker-label">协作任务</div>
          <textarea id="hm-collab-support-task" class="hm-chat-input" rows="3" placeholder="例如：由 OpenClaw 执行测试、构建验证、返回失败日志">${escHtml(collabSupportTask)}</textarea>
        </div>
        <div class="hm-collab-picker-group">
          <div class="hm-collab-picker-label">执行策略</div>
          <div class="hm-collab-picker-row" style="justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">
            <label style="display:flex;align-items:center;gap:8px;color:var(--text-secondary)">
              <input type="checkbox" id="hm-collab-auto-iterate" ${collabAutoIterate ? 'checked' : ''}>
              自动迭代
            </label>
            <label style="display:flex;align-items:center;gap:8px;color:var(--text-secondary)">
              最大轮数
              <input type="number" id="hm-collab-max-rounds" min="1" max="10" value="${Number(collabMaxRounds) || 3}" style="width:72px" class="form-input">
            </label>
          </div>
        </div>
        <div class="hm-collab-picker-actions">
          <button type="button" class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-collab-picker-cancel">取消</button>
          <button type="button" class="hm-btn hm-btn--primary hm-btn--sm" id="hm-collab-picker-apply">应用到协同模板</button>
          <button type="button" class="hm-btn hm-btn--primary hm-btn--sm" id="hm-collab-picker-run">直接启动真协同</button>
        </div>
      </div>
    `
  }

  function renderInput() {
    const collabPicker = renderCollabPicker()
    const active = store.activeSession()
    const streaming = store.state.streaming
    const placeholder = streaming
      ? t('engine.chatStreamingPlaceholder')
      : t('engine.chatInputPlaceholder')
    // NOTE: textarea is NOT disabled during streaming — the user should still
    // be able to compose the next message while the agent is thinking. The
    // Send button is hidden/swapped instead.
    // The keyboard shortcut hint now lives inside the placeholder so we
    // don't render a duplicate row beneath the textarea (the prior layout
    // looked like "套娃" — same hint shown twice). Slash menu still pops
    // up above when the user types `/`.
    //
    // Token usage strip — only when there's an active session with real
    // usage. Mirrors hermes-web-ui's input-top-bar (sans context-length
    // bar, which requires a server-side endpoint we don't have).
    const totalIn = active?.inputTokens || 0
    const totalOut = active?.outputTokens || 0
    const totalCache = (active?.cacheReadTokens || 0) + (active?.cacheWriteTokens || 0)
    const cost = active?.estimatedCostUsd
    const showUsage = !!active && (totalIn + totalOut + totalCache) > 0
    return `
      <div class="hm-chat-input-area">
        ${renderSlashMenu()}
        ${renderQuickCommandMenu()}
        ${collabPicker}
        <div class="hm-chat-quickbar">
          <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-chat-collab-run" title="打开双引擎真协同配置并执行">🦞⇄🤖 真协同</button>
          <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-chat-quick-command" title="选择并一键发送 Hermes 快捷指令">⚡ 快捷指令</button>
          <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-chat-quick-skills" title="一键发送必备技能清单给 Hermes">🧠 必备技能</button>
        </div>
        ${showUsage ? `
          <div class="hm-chat-usage-bar" title="${escAttr(t('engine.chatUsageTooltip'))}">
            <span class="hm-chat-usage-pill" data-kind="in">
              <span class="hm-chat-usage-label">${escHtml(t('engine.chatUsageIn'))}</span>
              <span class="hm-chat-usage-value">${formatTokens(totalIn)}</span>
            </span>
            <span class="hm-chat-usage-pill" data-kind="out">
              <span class="hm-chat-usage-label">${escHtml(t('engine.chatUsageOut'))}</span>
              <span class="hm-chat-usage-value">${formatTokens(totalOut)}</span>
            </span>
            ${totalCache > 0 ? `
              <span class="hm-chat-usage-pill" data-kind="cache">
                <span class="hm-chat-usage-label">${escHtml(t('engine.chatUsageCache'))}</span>
                <span class="hm-chat-usage-value">${formatTokens(totalCache)}</span>
              </span>` : ''}
            ${cost ? `
              <span class="hm-chat-usage-pill" data-kind="cost">
                <span class="hm-chat-usage-value">${escHtml(formatCost(cost))}</span>
              </span>` : ''}
          </div>` : ''}
        <div class="hm-chat-input-wrap ${streaming ? 'is-streaming' : ''}">
          <textarea id="hm-chat-input" class="hm-chat-input"
                    placeholder="${escAttr(placeholder)}"
                    rows="1">${escHtml(inputValue)}</textarea>
          <div class="hm-chat-input-actions">
            ${streaming
              ? `<button class="hm-chat-stop-btn" id="hm-chat-stop" title="${escHtml(t('engine.chatStop'))}">
                   ${ICONS.stop}
                 </button>`
              : `<button class="hm-chat-send-btn" id="hm-chat-send"
                         ${!active || !inputValue.trim() ? 'disabled' : ''}
                         title="${escHtml(t('engine.chatSend'))}">
                   ${ICONS.send}
                 </button>`}
          </div>
        </div>
      </div>
    `
  }

  function renderHeader() {
    const active = store.activeSession()
    const title = active ? sessionDisplayTitle(active) : t('engine.chatNewSession')
    const source = active?.source && active.source !== '__local__' ? getSourceLabel(active.source) : ''
    return `
      <header class="hm-chat-header">
        <div class="hm-chat-header-left">
          <button class="hm-chat-toggle-sidebar ${sidebarOpen ? '' : 'is-collapsed'}" id="hm-chat-toggle-sidebar"
                  aria-pressed="${sidebarOpen ? 'true' : 'false'}"
                  title="${escHtml(sidebarOpen ? t('engine.chatHideSessions') : t('engine.chatShowSessions'))}">
            ${ICONS.sidebar}
            <span>${escHtml(sidebarOpen ? t('engine.chatHideSessions') : t('engine.chatShowSessions'))}</span>
          </button>
          <div class="hm-chat-header-title-wrap">
            <span class="hm-chat-header-title" id="hm-chat-header-title" title="双击重命名当前会话">${escHtml(title)}</span>
            ${source ? `<span class="hm-chat-source-badge">${escHtml(source)}</span>` : ''}
          </div>
        </div>
        <div class="hm-chat-header-right">
          <div class="hm-chat-gw-status ${gwOnline ? 'is-online' : 'is-offline'}"
               title="${escHtml(gwOnline ? t('engine.chatGatewayOnline') : t('engine.chatGatewayOffline'))}">
            <span class="hm-chat-gw-dot"></span>
            <span class="hm-chat-gw-label">网关</span>
            <span class="hm-chat-gw-text">${escHtml(gwOnline ? t('engine.chatGatewayOnlineShort') : t('engine.chatGatewayOfflineShort'))}</span>
            ${currentModel ? `<span class="hm-chat-gw-model">${escHtml(currentModel)}</span>` : ''}
          </div>
          <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-chat-search-open"
                  title="${escHtml(t('engine.chatSearchShortcut'))}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
          <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-chat-copy-id"
                  ${!active ? 'disabled' : ''}
                  title="${escHtml(t('engine.chatCopySessionId'))}">
            ${ICONS.copy}
          </button>
          <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-chat-new-chat">
            ${ICONS.plus}<span>${escHtml(t('engine.chatNewChat'))}</span>
          </button>
        </div>
      </header>
    `
  }

  // ----------------------------------------------------------- draw

  function draw() {
    const scrollTop = el.querySelector('.hm-chat-messages')?.scrollTop
    const wasNearBottom = isMessagesNearBottom()
    const activeSessionId = store.state.activeSessionId
    const activeChanged = activeSessionId !== lastActiveSessionId
    if (activeChanged) {
      lastActiveSessionId = activeSessionId
      forceScrollBottom = true
    }

    el.innerHTML = `
      <div class="hm-chat-shell ${sidebarOpen ? '' : 'is-sidebar-collapsed'}">
        <div class="hm-chat-sidebar-backdrop" id="hm-chat-sidebar-backdrop"></div>
        ${renderSidebar()}
        <section class="hm-chat-main">
          ${renderHeader()}
          <div class="hm-chat-messages" id="hm-chat-messages">
            ${renderMessages()}
          </div>
          <button class="hm-chat-jump-bottom" id="hm-chat-jump-bottom" type="button">
            <span>↓</span>${escHtml(t('engine.chatJumpBottom'))}
          </button>
          ${renderInput()}
        </section>
      </div>
    `
    bind()

    // Restore / auto-scroll.
    const msgsEl = el.querySelector('.hm-chat-messages')
    if (msgsEl) {
      if (forceScrollBottom || wasNearBottom) {
        msgsEl.scrollTop = msgsEl.scrollHeight
        forceScrollBottom = false
      } else if (scrollTop != null) {
        msgsEl.scrollTop = scrollTop
      }
      updateJumpButton()
    }

    // Restore textarea focus + caret position after every redraw so typing
    // remains smooth even when store mutations trigger a full DOM rebuild.
    const input = el.querySelector('#hm-chat-input')
    if (input) {
      if (inputFocused) {
        input.focus()
        try {
          const pos = Math.min(inputCaret, inputValue.length)
          input.setSelectionRange(pos, pos)
        } catch { /* selection unsupported for the current state */ }
      }
      autoResize(input)
    }

    // Draw search modal on top if open.
    drawSearchModal()
  }

  function isMessagesNearBottom(threshold = 120) {
    const m = el.querySelector('.hm-chat-messages')
    if (!m) return true
    return m.scrollHeight - m.scrollTop - m.clientHeight < threshold
  }

  function updateJumpButton() {
    const btn = el.querySelector('#hm-chat-jump-bottom')
    if (!btn) return
    btn.classList.toggle('is-visible', !isMessagesNearBottom(180))
  }

  // ----------------------------------------------------------- event binding

  function toggleSelected(sid) {
    if (!sid) return
    if (selected.has(sid)) selected.delete(sid)
    else selected.add(sid)
    draw()
  }

  function bind() {
    // --- Sidebar header ---
    el.querySelector('.hm-chat-new-btn')?.addEventListener('click', () => {
      store.newChat()
    })
    el.querySelector('#hm-chat-toggle-sidebar')?.addEventListener('click', () => {
      sidebarOpen = !sidebarOpen
      draw()
    })
    el.querySelector('#hm-chat-sidebar-backdrop')?.addEventListener('click', () => {
      sidebarOpen = false
      draw()
    })
    const msgsEl = el.querySelector('#hm-chat-messages')
    msgsEl?.addEventListener('scroll', updateJumpButton)
    el.querySelector('#hm-chat-jump-bottom')?.addEventListener('click', () => {
      if (!msgsEl) return
      msgsEl.scrollTop = msgsEl.scrollHeight
      updateJumpButton()
    })

    // --- Group collapse ---
    el.querySelectorAll('.hm-chat-group-head[data-group]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Don't collapse when clicking static-header style.
        if (btn.classList.contains('hm-chat-group-head--static')) return
        const src = btn.dataset.group
        store.toggleCollapsed(src)
      })
    })

    // --- Session select ---
    el.querySelectorAll('.hm-chat-session-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.hm-chat-session-action')) return
        const sid = item.dataset.sid
        if (!sid) return
        if (selectionMode) {
          toggleSelected(sid)
          return
        }
        if (sid !== store.state.activeSessionId) {
          forceScrollBottom = true
          store.switchSession(sid)
          if (mobileQuery.matches) sidebarOpen = false
        }
      })
      item.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        if (e.target.closest('.hm-chat-session-action')) return
        e.preventDefault()
        const sid = item.dataset.sid
        if (!sid) return
        if (selectionMode) {
          toggleSelected(sid)
          return
        }
        if (sid !== store.state.activeSessionId) {
          forceScrollBottom = true
          store.switchSession(sid)
          if (mobileQuery.matches) sidebarOpen = false
        }
      })
      item.addEventListener('dblclick', async (e) => {
        if (e.target.closest('.hm-chat-session-action')) return
        const renameTarget = e.target.closest('[data-sid-rename]')
        const sid = renameTarget?.dataset.sidRename || item.dataset.sid
        if (!sid || selectionMode) return
        e.preventDefault()
        await renameSessionById(sid)
      })
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        const sid = item.dataset.sid
        openSessionContextMenu(e.clientX, e.clientY, sid)
      })
    })

    el.querySelector('#hm-chat-header-title')?.addEventListener('dblclick', async () => {
      const sid = store.state.activeSessionId
      if (!sid) return
      await renameSessionById(sid)
    })

    // --- Selection mode controls ---
    el.querySelector('#hm-chat-select-toggle')?.addEventListener('click', () => {
      selectionMode = !selectionMode
      if (!selectionMode) selected.clear()
      profileMenuOpen = false
      draw()
    })
    el.querySelectorAll('[data-sid-check]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        toggleSelected(btn.dataset.sidCheck)
      })
    })
    el.querySelector('#hm-chat-bulk-select-all')?.addEventListener('click', () => {
      const ids = visibleSessionIds()
      const allSelected = ids.length > 0 && ids.every(id => selected.has(id))
      if (allSelected) selected.clear()
      else for (const id of ids) selected.add(id)
      draw()
    })
    el.querySelector('#hm-chat-bulk-delete')?.addEventListener('click', async () => {
      if (selected.size === 0) return
      const ok = await showConfirm(t('engine.chatConfirmBulkDelete').replace('{n}', String(selected.size)))
      if (!ok) return
      const ids = Array.from(selected)
      const result = await store.bulkDeleteSessions(ids)
      selected.clear()
      const skipped = result.skipped.length
      const failed = result.failed.length
      const deleted = result.deleted.length
      if (deleted > 0 && failed === 0 && skipped === 0) {
        toast(t('engine.chatBulkDeleted').replace('{n}', String(deleted)), 'success')
      } else if (deleted > 0) {
        toast(t('engine.chatBulkPartial')
          .replace('{n}', String(deleted))
          .replace('{f}', String(failed + skipped)), 'success')
      } else {
        toast(t('engine.chatBulkFailed'), 'error')
      }
      if (failed === 0) selectionMode = false
      draw()
    })

    // --- Profile switcher ---
    el.querySelector('#hm-chat-profile-toggle')?.addEventListener('click', (e) => {
      const btn = e.currentTarget
      if (btn?.disabled) return
      profileMenuOpen = !profileMenuOpen
      draw()
    })
    el.querySelectorAll('[data-profile]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const name = btn.dataset.profile
        profileMenuOpen = false
        if (!name || name === store.state.activeProfile) {
          draw()
          return
        }
        if (store.state.streaming) {
          toast(t('engine.chatProfileSwitchBlocked'), 'error')
          draw()
          return
        }
        try {
          await store.switchProfile(name)
          toast(t('engine.chatProfileSwitched').replace('{name}', name), 'success')
        } catch (err) {
          toast((err?.message || String(err)), 'error')
        }
      })
    })

    el.querySelectorAll('.hm-chat-session-menu').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const sid = btn.dataset.sidMenu
        const rect = btn.getBoundingClientRect()
        openSessionContextMenu(rect.left, rect.bottom + 4, sid)
      })
    })

    // --- Session delete ---
    el.querySelectorAll('.hm-chat-session-del').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const sid = btn.dataset.sidDel
        const ok = await showConfirm(t('engine.chatConfirmDelete'))
        if (!ok) return
        try {
          await store.deleteSession(sid)
          toast(t('engine.chatSessionDeleted'), 'success')
        } catch (err) {
          const msg = err?.message === 'RUNNING_SESSION' ? t('engine.chatDeleteRunningBlocked') : (err?.message || err)
          toast(t('engine.chatDeleteFailed') + ': ' + msg, 'error')
        }
      })
    })

    el.querySelectorAll('[data-copy-mid]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const mid = btn.dataset.copyMid
        const s = store.activeSession()
        const msg = s?.messages.find(m => m.id === mid)
        if (!msg?.content) return
        const ok = await copyText(msg.content)
        toast(ok ? t('common.copied') : t('engine.chatCopyFailed'), ok ? 'success' : 'error')
      })
    })

    el.querySelectorAll('.hm-chat-code-copy').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const code = btn.closest('pre')?.querySelector('code')?.textContent || ''
        if (!code) return
        const ok = await copyText(code)
        toast(ok ? t('common.copied') : t('engine.chatCopyFailed'), ok ? 'success' : 'error')
      })
    })

    // --- Tool message expand ---
    el.querySelectorAll('[data-tool-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.toolToggle
        if (expandedToolIds.has(id)) expandedToolIds.delete(id)
        else expandedToolIds.add(id)
        draw()
      })
    })

    // --- Header actions ---
    el.querySelector('#hm-chat-new-chat')?.addEventListener('click', () => {
      forceScrollBottom = true
      store.newChat()
    })
    el.querySelector('#hm-chat-search-open')?.addEventListener('click', () => openSearch())
    el.querySelector('#hm-chat-copy-id')?.addEventListener('click', async () => {
      const s = store.activeSession()
      if (!s) return
      try {
        const ok = await copyText(s.id)
        toast(ok ? t('common.copied') : t('engine.chatCopyFailed'), ok ? 'success' : 'error')
      } catch { toast(t('engine.chatCopyFailed'), 'error') }
    })

    // --- Input ---
    //
    // We track the composed text in `inputValue` (outside the DOM) so it
    // survives redraws triggered by streaming updates or slash-menu toggles.
    // The textarea's `value` is authoritative only between events; on the
    // next draw() the markup re-seeds it from `inputValue`.
    const input = el.querySelector('#hm-chat-input')
    if (input) {
      // Event ordering: focus / blur → keydown → input. We update the state
      // on BOTH input (value) and selectionchange proxies (keydown/keyup) to
      // keep caret restore accurate.
      input.addEventListener('focus', () => { inputFocused = true })
      input.addEventListener('blur', () => { inputFocused = false })
      input.addEventListener('keyup', () => { inputCaret = input.selectionStart || 0 })
      input.addEventListener('click', () => { inputCaret = input.selectionStart || 0 })

      input.addEventListener('keydown', (e) => {
        if (e.isComposing || e.keyCode === 229) return
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          handleSend()
          return
        }
        if (e.key === 'Escape' && showSlash) {
          showSlash = false
          draw()
        }
      })

      input.addEventListener('input', () => {
        inputValue = input.value
        inputCaret = input.selectionStart || inputValue.length
        const wasShowing = showSlash
        if (inputValue.startsWith('/') && !inputValue.includes(' ')) {
          showSlash = true
          slashFilter = inputValue
        } else if (showSlash) {
          showSlash = false
        }
        // Only call draw() when the slash menu visibility actually changes —
        // otherwise a plain keystroke would trigger an expensive full rebuild.
        if (wasShowing !== showSlash || (showSlash && slashFilter !== inputValue)) {
          draw()
        } else {
          autoResize(input)
        }
      })
    }

    el.querySelector('#hm-chat-send')?.addEventListener('click', handleSend)
    el.querySelector('#hm-chat-collab-run')?.addEventListener('click', openCollabPicker)
    el.querySelectorAll('[data-collab-preset]').forEach(btn => {
      btn.addEventListener('click', () => applyCollabPreset(btn.dataset.collabPreset))
    })
    el.querySelector('#hm-collab-picker-close')?.addEventListener('click', closeCollabPicker)
    el.querySelector('#hm-collab-picker-cancel')?.addEventListener('click', closeCollabPicker)
    el.querySelector('#hm-collab-picker-apply')?.addEventListener('click', applyCollabPicker)
    el.querySelector('#hm-collab-picker-run')?.addEventListener('click', async () => {
      syncCollabPickerFields()
      closeCollabPicker()
      injectCollabTemplate()
      await runTrueCollab()
    })
    el.querySelectorAll('[data-collab-lead]').forEach(btn => {
      btn.addEventListener('click', () => {
        collabLeadEngine = btn.getAttribute('data-collab-lead') || 'Hermes'
        if (collabLeadEngine === collabSupportEngine) collabSupportEngine = collabLeadEngine === 'Hermes' ? 'OpenClaw' : 'Hermes'
        draw()
      })
    })
    el.querySelectorAll('[data-collab-support]').forEach(btn => {
      btn.addEventListener('click', () => {
        collabSupportEngine = btn.getAttribute('data-collab-support') || 'OpenClaw'
        if (collabSupportEngine === collabLeadEngine) collabLeadEngine = collabSupportEngine === 'Hermes' ? 'OpenClaw' : 'Hermes'
        draw()
      })
    })
    el.querySelector('#hm-chat-quick-command')?.addEventListener('click', () => {
      quickCommandMenuOpen = !quickCommandMenuOpen
      if (!quickCommandMenuOpen) quickCommandQuery = ''
      draw()
    })
    el.querySelector('#hm-chat-quick-command-close')?.addEventListener('click', () => {
      quickCommandMenuOpen = false
      quickCommandQuery = ''
      draw()
    })
    el.querySelector('#hm-chat-quick-command-search')?.addEventListener('input', (e) => {
      quickCommandQuery = e.target.value || ''
      draw()
    })
    el.querySelectorAll('[data-quick-command]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cmd = btn.dataset.quickCommand
        if (!cmd) return
        quickCommandMenuOpen = false
        quickCommandQuery = ''
        await sendPresetText(cmd)
      })
    })
    el.querySelector('#hm-chat-quick-skills')?.addEventListener('click', sendSkillsChecklist)
    el.querySelector('#hm-chat-stop')?.addEventListener('click', () => {
      store.stopStreaming()
      toast(t('engine.chatStopped'), 'success')
    })

    el.querySelectorAll('.hm-chat-slash-item').forEach(item => {
      item.addEventListener('click', () => {
        const cmd = item.dataset.cmd
        inputValue = cmd + ' '
        inputCaret = inputValue.length
        inputFocused = true
        showSlash = false
        draw()
      })
    })
  }

  function autoResize(input) {
    input.style.height = 'auto'
    input.style.height = Math.min(input.scrollHeight, 160) + 'px'
  }

  async function renameSessionById(sid) {
    const s = store.state.sessions.find(sess => sess.id === sid)
    if (!s) return
    const next = await showRenameModal(s.title)
    if (next == null) return
    const ok = await store.renameSession(sid, next)
    toast(ok ? t('engine.chatRenamed') : t('engine.chatRenameFailed'), ok ? 'success' : 'error')
    if (ok) draw()
  }

  function openSessionContextMenu(x, y, sid) {
    const s = store.state.sessions.find(sess => sess.id === sid)
    if (!s) return
    const isPinned = store.state.pinned.has(sid)
    showContextMenu(x, y, [
      {
        label: isPinned ? t('engine.chatUnpin') : t('engine.chatPin'),
        icon: ICONS.pin,
        action: () => store.togglePinned(sid),
      },
      {
        label: t('engine.chatRename'),
        action: async () => {
          await renameSessionById(sid)
        },
      },
      {
        label: t('engine.chatCopySessionId'),
        icon: ICONS.copy,
        action: async () => {
          try {
            const ok = await copyText(sid)
            toast(ok ? t('common.copied') : t('engine.chatCopyFailed'), ok ? 'success' : 'error')
          } catch { toast(t('engine.chatCopyFailed'), 'error') }
        },
      },
      {
        label: t('engine.chatDeleteSession'),
        icon: ICONS.trash,
        danger: true,
        action: async () => {
          const ok = await showConfirm(t('engine.chatConfirmDelete'))
          if (!ok) return
          try {
            await store.deleteSession(sid)
            toast(t('engine.chatSessionDeleted'), 'success')
          } catch (err) {
            const msg = err?.message === 'RUNNING_SESSION' ? t('engine.chatDeleteRunningBlocked') : (err?.message || err)
            toast(t('engine.chatDeleteFailed') + ': ' + msg, 'error')
          }
        },
      },
    ])
  }

  // ----------------------------------------------------------- slash handlers

  /**
   * Reset the composed input state and redraw. Called after a send, slash
   * command, or `/clear`, `/new` shortcut.
   */
  function resetInput() {
    inputValue = ''
    inputCaret = 0
    showSlash = false
    slashFilter = ''
  }

  async function sendPresetText(text) {
    if (!text) return
    try {
      window.dispatchEvent(new CustomEvent('lobster-work-start', { detail: { phase: 'ack', message: '收到 Hermes 预设任务' } }))
    } catch {}
    forceScrollBottom = true
    resetInput()
    draw()
    await store.sendMessage(text)
  }

  function openQuickCommandPicker() {
    quickCommandMenuOpen = true
    quickCommandQuery = ''
    draw()
  }

  function injectCollabTemplate() {
    try {
      window.dispatchEvent(new CustomEvent('lobster-work-start', { detail: { phase: 'thinking', message: '准备 Hermes 协同模板' } }))
    } catch {}
    const active = getActiveEngineId()
    const lead = collabLeadEngine || (active === 'hermes' ? 'Hermes' : 'OpenClaw')
    const peer = collabSupportEngine || (active === 'hermes' ? 'OpenClaw' : 'Hermes')
    inputValue = `# 双引擎协同任务\n\n[任务目标]\n- [在这里填写目标]\n\n[建议分配]\n- 主导引擎: ${lead}\n- 协作引擎: ${peer}\n\n[主导任务]\n- ${collabLeadTask || '[例如：由 Hermes 完成代码编写 / 方案设计 / 文档起草]'}\n\n[协作任务]\n- ${collabSupportTask || '[例如：由 OpenClaw 执行测试 / 跑构建 / 验证结果 / 补充修复]'}\n\n[执行策略]\n- 自动迭代: ${collabAutoIterate ? '开启' : '关闭'}\n- 最大轮数: ${collabMaxRounds}\n\n[主导引擎职责]\n- 拆解任务\n- 汇总结论\n- 输出最终结果\n\n[协作引擎职责]\n- 补充分析\n- 交叉验证\n- 处理分支子任务\n\n[执行规则]\n- 用户填写的主导引擎 / 协作引擎 / 主导任务 / 协作任务优先级最高\n- 必须明确谁主导、谁协作\n- 先给出执行计划，再开始执行\n- 最终只输出一份合并后的结果\n\n[最终输出要求]\n- 结果必须包含“执行计划 / 协同分工 / 最终结论”三个部分`
    inputCaret = inputValue.length
    inputFocused = true
    showSlash = false
    draw()
  }

  function injectAutoCollabTemplate() {
    try {
      window.dispatchEvent(new CustomEvent('lobster-work-start', { detail: { phase: 'thinking', message: '生成自动协同编排方案' } }))
    } catch {}
    const goal = (inputValue || '').trim()
    const active = getActiveEngineId()
    const preferredLead = active === 'hermes' ? 'Hermes' : 'OpenClaw'
    const preferredPeer = active === 'hermes' ? 'OpenClaw' : 'Hermes'
    const lowered = goal.toLowerCase()
    let mode = '通用任务'
    let extra = '请按通用复杂任务的方式，自动判断主导/协作关系并分工执行。'
    let leadDuties = ['拆解任务', '推进主线执行', '汇总结论', '输出最终结果']
    let peerDuties = ['补充分析', '交叉验证', '检查遗漏', '处理分支子任务']
    let riskHints = ['避免主导与协作职责重叠', '如结论不一致，必须说明冲突点', '最终只保留一份合并结果']
    if (/code|编码|编程|修复|bug|debug|脚本|开发|函数|接口|build|构建/.test(lowered)) {
      mode = '代码/工程任务'
      extra = '优先让更擅长工程落地的引擎主导，让协作引擎负责代码审查、边界条件和回归验证。'
      leadDuties = ['负责代码修改与实现路径选择', '推进构建、调试与修复主线', '整合最终变更说明']
      peerDuties = ['负责代码审查', '检查边界条件与潜在副作用', '补充回归验证建议']
      riskHints = ['避免只修表面现象而遗漏根因', '避免改动破坏现有构建链路', '输出中必须说明验证范围']
    } else if (/文档|README|说明|翻译|i18n|多语言|文案|总结/.test(goal)) {
      mode = '文档/多语言任务'
      extra = '优先让更擅长结构化表达的引擎主导，让协作引擎负责术语统一、漏项检查和风格校正。'
      leadDuties = ['负责整体结构设计', '统一主叙事与输出顺序', '完成最终文案定稿']
      peerDuties = ['检查术语一致性', '检查漏项与歧义', '修正语言风格与多语言偏差']
      riskHints = ['避免术语前后不一致', '避免翻译语义漂移', '如改动文档名称，需注意历史语义与品牌影响']
    } else if (/排查|故障|日志|异常|崩溃|诊断|why|error|trace/.test(lowered)) {
      mode = '排障/诊断任务'
      extra = '优先让更擅长诊断链路的引擎主导，让协作引擎负责交叉验证、假设枚举和根因收敛。'
      leadDuties = ['负责建立问题假设', '推进日志/链路诊断主线', '收敛根因并给出修复方向']
      peerDuties = ['枚举替代假设', '交叉验证证据链', '指出诊断盲区与误判风险']
      riskHints = ['避免把症状误判为根因', '避免忽略环境因素或配置差异', '输出中必须区分已证实与待验证项']
    }
    inputValue = `# 自动双引擎协同编排\n\n[任务类型]\n- ${mode}\n\n[当前引擎上下文]\n- 当前激活引擎: ${active}\n- 建议主导引擎: ${preferredLead}\n- 建议协作引擎: ${preferredPeer}\n\n[当前任务]\n${goal || '- [请在这里填写任务目标]'}\n\n[编排偏好]\n- ${extra}\n\n[建议主导职责]\n${leadDuties.map(x => `- ${x}`).join('\n')}\n\n[建议协作职责]\n${peerDuties.map(x => `- ${x}`).join('\n')}\n\n[风险点]\n${riskHints.map(x => `- ${x}`).join('\n')}\n\n[自动决策要求]\n1. 先判断哪个引擎更适合作为主导引擎，哪个更适合作为协作引擎；若当前激活引擎不适合主导，要明确说明原因。\n2. 输出结构化的“执行计划 / 主导职责 / 协作职责 / 风险点 / 协同复核”。\n3. 如需调用工具或拆分子任务，明确写出每一步由谁负责。\n4. 协同复核必须说明协作引擎验证了什么、补充了什么、否定了什么。\n5. 最终只输出一份合并后的完整结果。\n\n[期望输出结构]\n- 执行计划\n- 主导职责\n- 协作职责\n- 风险点\n- 协同复核\n- 最终结论`
    inputCaret = inputValue.length
    inputFocused = true
    showSlash = false
    draw()
  }

  function syncCollabPickerFields() {
    collabLeadTask = el.querySelector('#hm-collab-lead-task')?.value?.trim?.() || collabLeadTask || ''
    collabSupportTask = el.querySelector('#hm-collab-support-task')?.value?.trim?.() || collabSupportTask || ''
    collabAutoIterate = !!el.querySelector('#hm-collab-auto-iterate')?.checked
    const rounds = Number(el.querySelector('#hm-collab-max-rounds')?.value || collabMaxRounds || 3)
    collabMaxRounds = Number.isFinite(rounds) ? Math.max(1, Math.min(10, rounds)) : 3
  }

  function applyCollabPreset(presetKey) {
    const preset = COLLAB_TASK_PRESETS.find(item => item.key === presetKey)
    if (!preset) return
    collabLeadEngine = preset.leadEngine
    collabSupportEngine = preset.supportEngine
    collabLeadTask = preset.leadTask
    collabSupportTask = preset.supportTask
    collabAutoIterate = !!preset.autoIterate
    collabMaxRounds = Number(preset.maxRounds) || 3
    draw()
  }

  function openCollabPicker() {
    const rawGoal = (inputValue || '').trim()
    if (rawGoal && !/^#\s*(双引擎协同任务|自动双引擎协同编排)/.test(rawGoal)) {
      const active = getActiveEngineId()
      const lead = collabLeadEngine || (active === 'hermes' ? 'Hermes' : 'OpenClaw')
      const peer = collabSupportEngine || (active === 'hermes' ? 'OpenClaw' : 'Hermes')
      inputValue = `# 双引擎协同任务\n\n[任务目标]\n${rawGoal}\n\n[建议分配]\n- 主导引擎: ${lead}\n- 协作引擎: ${peer}\n\n[主导任务]\n- ${collabLeadTask || '[例如：由 Hermes 完成代码编写 / 方案设计 / 文档起草]'}\n\n[协作任务]\n- ${collabSupportTask || '[例如：由 OpenClaw 执行测试 / 跑构建 / 验证结果 / 补充修复]'}\n\n[执行策略]\n- 自动迭代: ${collabAutoIterate ? '开启' : '关闭'}\n- 最大轮数: ${collabMaxRounds}`
      inputCaret = inputValue.length
    }
    collabPickerOpen = true
    draw()
  }

  function closeCollabPicker() {
    collabPickerOpen = false
    draw()
  }

  function applyCollabPicker() {
    if (collabLeadEngine === collabSupportEngine) {
      toast('主导引擎和协作引擎不能相同', 'warning')
      return
    }
    syncCollabPickerFields()
    collabPickerOpen = false
    injectCollabTemplate()
  }

  async function runTrueCollab() {
    const goal = (inputValue || '').trim()
    if (!goal) {
      toast('请先输入任务目标，再发起真协同', 'warning')
      return
    }
    try {
      window.dispatchEvent(new CustomEvent('lobster-work-start', { detail: { phase: 'planning', message: '双引擎协同任务编排中' } }))
    } catch {}
    const text = `# 真正双引擎协同执行中\n\n任务：\n${goal}\n\n状态：\n- 将优先解析用户填写的主导引擎 / 协作引擎 / 主导任务 / 协作任务\n- 已开始请求 OpenClaw 与 Hermes 进入协同链路\n- 完成后将自动生成互审与收敛结果` 
    await store.sendMessage(text)
    try {
      const result = await runDualEngineCollab(goal, {
        autoIterate: collabAutoIterate,
        maxRounds: collabMaxRounds,
      })
      const summary = result.mode === 'pipeline'
        ? `${result.mergedPrompt}\n\n[系统抓取的串行闭环结果]\n## 主导引擎首轮产出\n${result.leadFirst?.text || '-'}\n\n## 协作引擎首轮验证/测试\n${result.supportVerify?.text || '-'}\n\n## 主导引擎修正后产出\n${result.leadFix?.text || '-'}\n\n## 协作引擎最终复测\n${result.supportRetest?.text || '-'}`
        : `${result.mergedPrompt}\n\n[系统抓取的协同原始结果]\n## OpenClaw 首轮\n${result.openclaw?.text || '-'}\n\n## Hermes 首轮\n${result.hermes?.text || '-'}\n\n## OpenClaw 复核 Hermes\n${result.openclawReview?.text || '-'}\n\n## Hermes 复核 OpenClaw\n${result.hermesReview?.text || '-'}${result.extraRounds?.length ? `\n\n## 额外自动迭代轮次\n${result.extraRounds.map(r => `### 第 ${r.round} 轮\n- OpenClaw:\n${r.openclaw?.text || '-'}\n- Hermes:\n${r.hermes?.text || '-'}`).join('\n\n')}` : ''}`
      await store.sendMessage(summary)
      try {
        window.dispatchEvent(new CustomEvent('lobster-work-start', { detail: { phase: 'verifying', message: '双引擎互审完成，等待最终收敛输出' } }))
      } catch {}
    } catch (e) {
      toast('双引擎真协同失败：' + (e?.message || e), 'error')
      try {
        window.dispatchEvent(new CustomEvent('lobster-work-start', { detail: { phase: 'done', message: '双引擎协同执行失败' } }))
      } catch {}
    }
  }

  async function sendSkillsChecklist() {
    await sendPresetText(HERMES_SKILLS_PROMPT)
  }

  async function handleSend() {
    const text = inputValue.trim()
    if (!text || store.state.streaming) return
    try {
      window.dispatchEvent(new CustomEvent('lobster-work-start', { detail: { phase: 'ack', message: text ? `收到 Hermes 任务：${text.slice(0, 32)}` : '收到 Hermes 任务' } }))
    } catch {}

    // Local slash commands short-circuit before going to the agent.
    if (text === '/clear') {
      store.clearActive()
      resetInput(); draw(); return
    }
    if (text === '/new') {
      store.newChat()
      resetInput(); draw(); return
    }
    if (text === '/help') {
      store.pushLocalUser(text)
      store.pushLocalAssistant(
        [
          `**${t('engine.chatSlashTitle')}**`,
          '',
          '`/help` — ' + t('engine.chatSlashHelpDesc'),
          '`/status` — ' + t('engine.chatSlashStatusDesc'),
          '`/memory` — ' + t('engine.chatSlashMemoryDesc'),
          '`/skills` — ' + t('engine.chatSlashSkillsDesc'),
          '`/clear` — ' + t('engine.chatSlashClearDesc'),
          '`/new` — ' + t('engine.chatSlashNewDesc'),
        ].join('\n')
      )
      resetInput(); draw(); return
    }
    if (text === '/status') {
      store.pushLocalUser(text)
      try {
        const info = await api.checkHermes()
        const gw = info?.gatewayRunning
          ? (gwOnline ? '✅ 已运行' : '🟡 运行中但未完全就绪')
          : '❌ 未运行'
        const port = info?.gatewayPort || 8642
        const model = info?.model || '—'
        store.pushLocalAssistant([
          `**${t('engine.chatSlashStatusTitle')}**`,
          '',
          `- ${t('engine.chatSlashGateway')}: ${gw}`,
          `- ${t('engine.chatSlashPort')}: \`${port}\``,
          `- ${t('engine.chatSlashModel')}: \`${model}\``,
        ].join('\n'))
      } catch (e) {
        store.pushLocalAssistant('⚠️ ' + (e?.message || e))
      }
      resetInput(); draw(); return
    }
    if (text === '/memory' || text === '/skills') {
      store.pushLocalUser(text)
      const target = text === '/memory' ? '/h/memory' : '/h/skills'
      store.pushLocalAssistant(
        t('engine.chatSlashRedirect').replace('{page}', `\`${target}\``)
      )
      window.location.hash = '#' + target
      resetInput(); draw(); return
    }

    // Normal user message → start agent run.
    forceScrollBottom = true
    resetInput()
    draw()
    await store.sendMessage(text)
  }

  // ----------------------------------------------------------- search modal
  //
  // Triggered by Ctrl/Cmd + K anywhere on the chat page (or header button).
  // Lives as a detached overlay rendered into `document.body` so it survives
  // the main chat redraws and is easy to dismiss with outside clicks.

  let searchOverlay = null
  let collabPickerOpen = false
  let collabLeadEngine = 'Hermes'
  let collabSupportEngine = 'OpenClaw'
  let collabLeadTask = ''
  let collabSupportTask = ''
  let collabAutoIterate = true
  let collabMaxRounds = 3

  function openSearch() {
    if (searchState) return
    searchState = { query: '', selectedIdx: 0 }
    draw()
  }

  function closeSearch() {
    searchState = null
    if (searchOverlay) {
      searchOverlay.remove()
      searchOverlay = null
    }
  }

  function searchResults() {
    if (!searchState) return []
    const q = searchState.query.trim()
    // Empty query → show recent sessions (first 15) so the modal isn't blank.
    if (!q) {
      return store.state.sessions.slice(0, 15).map(session => ({
        session,
        score: 0,
        snippet: session.title || t('engine.chatNewSession'),
      }))
    }
    return store.searchSessions(q, 20)
  }

  function drawSearchModal() {
    if (!searchState) {
      if (searchOverlay) { searchOverlay.remove(); searchOverlay = null }
      return
    }
    const results = searchResults()
    const idx = Math.min(searchState.selectedIdx, Math.max(0, results.length - 1))
    searchState.selectedIdx = idx

    if (!searchOverlay) {
      searchOverlay = document.createElement('div')
      searchOverlay.className = 'hm-chat-search-overlay'
      document.body.appendChild(searchOverlay)
    }

    searchOverlay.innerHTML = `
      <div class="hm-chat-search-panel" data-engine="hermes">
        <div class="hm-chat-search-head">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" class="hm-chat-search-icon">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" class="hm-chat-search-input" id="hm-chat-search-input"
                 value="${escAttr(searchState.query)}"
                 placeholder="${escAttr(t('engine.chatSearchPlaceholder'))}"/>
          <kbd class="hm-chat-search-kbd">Esc</kbd>
        </div>
        <div class="hm-chat-search-results" id="hm-chat-search-results">
          ${results.length === 0 ? `
            <div class="hm-chat-search-empty">${escHtml(t('engine.chatSearchEmpty'))}</div>
          ` : results.map((r, i) => {
            const s = r.session
            const src = s.source && s.source !== '__local__' ? getSourceLabel(s.source) : ''
            return `
              <button class="hm-chat-search-item ${i === idx ? 'is-active' : ''}" data-sid="${escAttr(s.id)}" data-idx="${i}">
                <div class="hm-chat-search-item-main">
                  <div class="hm-chat-search-item-title">
                    ${escHtml(s.title || t('engine.chatNewSession'))}
                    ${src ? `<span class="hm-chat-search-item-src">${escHtml(src)}</span>` : ''}
                  </div>
                  ${r.snippet && r.snippet !== s.title ? `
                    <div class="hm-chat-search-item-snippet">${escHtml(r.snippet)}</div>
                  ` : ''}
                </div>
                <div class="hm-chat-search-item-meta">
                  ${s.model ? `<span class="hm-chat-search-item-model">${escHtml(s.model)}</span>` : ''}
                  <span class="hm-chat-search-item-time">${escHtml(formatTime(s.updatedAt))}</span>
                </div>
              </button>
            `
          }).join('')}
        </div>
        <div class="hm-chat-search-foot">
          <span><kbd>↑</kbd> <kbd>↓</kbd> ${escHtml(t('engine.chatSearchNavigate'))}</span>
          <span><kbd>Enter</kbd> ${escHtml(t('engine.chatSearchOpen'))}</span>
        </div>
      </div>
    `

    const inputEl = searchOverlay.querySelector('#hm-chat-search-input')
    inputEl?.focus()
    try {
      const pos = searchState.query.length
      inputEl?.setSelectionRange(pos, pos)
    } catch {}

    inputEl?.addEventListener('input', () => {
      searchState.query = inputEl.value
      searchState.selectedIdx = 0
      drawSearchModal()
    })

    searchOverlay.addEventListener('mousedown', (e) => {
      if (e.target === searchOverlay) closeSearch()
    }, { once: true })

    searchOverlay.querySelectorAll('.hm-chat-search-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = btn.dataset.sid
        selectSearchResult(sid)
      })
      btn.addEventListener('mouseenter', () => {
        searchState.selectedIdx = Number(btn.dataset.idx)
        // Cheap class swap instead of full redraw.
        searchOverlay.querySelectorAll('.hm-chat-search-item').forEach(b =>
          b.classList.toggle('is-active', Number(b.dataset.idx) === searchState.selectedIdx))
      })
    })
  }

  function selectSearchResult(sid) {
    if (!sid) return
    forceScrollBottom = true
    store.switchSession(sid)
    if (mobileQuery.matches) sidebarOpen = false
    closeSearch()
  }

  // --- Global keyboard: Ctrl/Cmd+K opens search, keys navigate when open ---
  function onGlobalKey(e) {
    if (!el.isConnected) return
    const isMac = /Mac|iPhone|iPad/i.test(navigator.platform)
    const mod = isMac ? e.metaKey : e.ctrlKey
    if (mod && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault()
      if (searchState) closeSearch()
      else openSearch()
      return
    }
    if (!searchState) return
    if (e.key === 'Escape') {
      e.preventDefault()
      closeSearch()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const results = searchResults()
      if (!results.length) return
      searchState.selectedIdx = (searchState.selectedIdx + 1) % results.length
      drawSearchModal()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const results = searchResults()
      if (!results.length) return
      searchState.selectedIdx = (searchState.selectedIdx - 1 + results.length) % results.length
      drawSearchModal()
    } else if (e.key === 'Enter') {
      const results = searchResults()
      const hit = results[searchState.selectedIdx]
      if (hit) {
        e.preventDefault()
        selectSearchResult(hit.session.id)
      }
    }
  }
  document.addEventListener('keydown', onGlobalKey)

  // Close profile menu on outside click (capture so menu's own click handlers
  // still get to run before we close).
  function onGlobalClick(e) {
    if (!profileMenuOpen) return
    if (!el.isConnected) return
    const wrap = el.querySelector('.hm-chat-sidebar-profile')
    if (wrap && wrap.contains(e.target)) return
    profileMenuOpen = false
    draw()
  }
  document.addEventListener('click', onGlobalClick)

  // Detach the global listener + close modal on unmount. A single
  // MutationObserver watches our parent; when `el` is detached, we run the
  // full teardown (stream listeners, subscription, search modal, keydown).
  const teardown = () => {
    document.removeEventListener('keydown', onGlobalKey)
    document.removeEventListener('click', onGlobalClick)
    closeSearch()
    unsubscribe()
    store.detachStreamListeners()
  }
  const mountObserver = new MutationObserver(() => {
    if (!el.isConnected) { teardown(); mountObserver.disconnect() }
  })
  requestAnimationFrame(() => {
    if (el.parentNode) mountObserver.observe(el.parentNode, { childList: true })
  })

  // Seed the initial draw (before store load resolves).
  draw()
  return el
}
