import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'
import { showUpgradeModal } from '../components/modal.js'
import { navigate } from '../router.js'

let _page = null
let _status = null
let _catalog = []
let _query = ''
let _loading = false
let _activePack = 'all'
let _refreshing = false
const _toolStateOverrides = new Map()

const ECOM_AGENT_SESSION = 'agent:ecom-mover'
const ECOM_AGENT_NAME = '电商专属工作流'

const CATEGORY_ZH = {
  devops: '运维管理',
  database: '数据处理',
  testing: '测试工具',
  generation: '内容生成',
  ecommerce: '电商工具',
  browser: '浏览器自动化',
  office: '办公文档',
  image: '图片设计',
  graphics: '图形图像',
  video: '视频制作',
  audio: '音频处理',
  music: '音乐制作',
  '3d': '3D / 建模',
  gamedev: '游戏开发',
  game: '游戏自动化',
  knowledge: '知识管理',
  'knowledge-management': '知识管理',
  search: '搜索研究',
  communication: '沟通协作',
  automation: '自动化',
  web: '网页工具',
  design: '设计工具',
  scientific: '科研计算',
  science: '科研计算',
  uncategorized: '未分类',
}

const SOURCE_ZH = {
  harness: '内置适配',
  public: '可安装工具',
  local: '推荐工具',
  official: '官方工具',
}

const TOOL_NAME_ZH = {
  blender: 'Blender 3D 建模与渲染',
  gimp: 'GIMP 图片编辑',
  inkscape: 'Inkscape 矢量设计',
  libreoffice: 'LibreOffice 办公文档',
  openrefine: 'OpenRefine 数据清洗',
  browser: '浏览器代码化操控',
  obsidian: 'Obsidian 知识库',
  zotero: 'Zotero 文献管理',
  joplin: 'Joplin 笔记管理',
  kdenlive: 'Kdenlive 视频剪辑',
  shotcut: 'Shotcut 视频剪辑',
  audacity: 'Audacity 音频处理',
  musescore: 'MuseScore 乐谱处理',
  'obs-studio': 'OBS 直播录制',
  comfyui: 'ComfyUI 图像工作流',
  ollama: 'Ollama 本地模型',
  n8n: 'n8n 自动化工作流',
  wiremock: 'WireMock 接口模拟',
  jumpserver: 'JumpServer 堡垒机管理',
  mailchimp: 'Mailchimp 营销管理',
  anygen: 'AnyGen 云端内容生成',
}

const TOOL_EXPLAIN = {
  blender: '用于 3D 建模、场景搭建、材质、灯光、动画和渲染。适合商品 3D 展示、短视频素材、模型检查和自动生成渲染图。需要本机安装 Blender。',
  gimp: '用于图片裁剪、抠图、批量压缩、格式转换、滤镜处理和主图素材加工。适合电商商品图、详情图、封面图处理。需要本机安装 GIMP。',
  inkscape: '用于 SVG 矢量图、Logo、图标、海报元素和可缩放设计稿处理。适合品牌素材、透明图标、矢量说明图。需要本机安装 Inkscape。',
  libreoffice: '用于 Word、Excel、PPT、PDF 之间的生成和转换，也能批量处理表格和文档。适合报价单、商品表、运营报表、说明书自动生成。需要 LibreOffice。',
  openrefine: '用于脏数据清洗、去重、批量改字段、导入导出表格。适合商品采集表、SKU 表、供应商表、价格表整理。需要 OpenRefine 服务运行。',
  browser: '用于代码级打开网页、读取 DOM、点击、填表、截图和验收页面状态。适合后台自动化、网页数据采集、店铺后台流程辅助。通常需要浏览器扩展或自动化后端。',
  obsidian: '用于本地知识库、笔记、素材库和长期资料管理。适合把产品资料、竞品分析、操作 SOP 沉淀成可检索知识库。',
  zotero: '用于文献、PDF、引用和资料管理。适合研究型资料整理、论文/报告资料库、引用导出。',
  joplin: '用于笔记、任务、附件、标签和同步管理。适合团队 SOP、商品资料、运营记录整理。',
  kdenlive: '用于视频剪辑项目生成、字幕、转场、导出和渲染。适合短视频批处理和模板化视频生产。需要 Kdenlive 或相关渲染后端。',
  shotcut: '用于视频剪辑、滤镜、时间线和导出。适合轻量短视频、商品展示视频、素材自动拼接。需要 Shotcut/MLT 后端。',
  audacity: '用于音频裁剪、降噪、合成、音量调整和导出。适合旁白、口播、音频素材处理。通常需要 sox 或音频后端。',
  comfyui: '用于 AI 图像工作流管理、节点流程、生成任务和素材输出。适合商品场景图、视觉素材生成。需要 ComfyUI 环境。',
  ollama: '用于本地大模型管理、模型列表、推理调用和离线 AI 能力。适合私有化问答、离线生成和低成本本地模型。需要 Ollama。',
  n8n: '用于自动化流程编排，连接表格、接口、消息、Webhook 和业务系统。适合电商数据同步、通知、定时任务。需要 n8n 服务。',
}

const CAPABILITY_PACKS = [
  {
    id: 'ecommerce',
    title: '电商经营能力包',
    icon: '🛒',
    subtitle: '选品资料、商品图、SKU 表、后台流程、标题卖点和上架前检查',
    bestFor: '适合淘宝、京东、拼多多、抖店、1688 搬运整理、商品资料加工、批量上新前准备。',
    userNeed: '如果你要处理商品资料、主图、详情图、价格表、SKU、竞品分析或店铺后台，就优先选这个。',
    includes: ['浏览器代码化操控', '图片处理', '表格清洗', '文档导出', '视频素材', '知识沉淀'],
    tools: ['browser', 'gimp', 'imagemagick', 'libreoffice', 'openrefine', 'kdenlive', 'shotcut', 'obsidian', 'joplin'],
    search: 'ecommerce browser image office video openrefine',
    agent: 'ecommerce',
    caution: '涉及上架、提交、删除、付款、批量发布时必须二次确认；工具只准备能力，最终操作由专属 Agent 分步执行。',
  },
  {
    id: 'browser',
    title: '浏览器自动化能力包',
    icon: '🌐',
    subtitle: '代码级打开网页、点击、填表、读取 DOM、截图、页面验收',
    bestFor: '适合后台管理、网页数据采集、表单录入、网页测试和需要保留登录态的操作。',
    userNeed: '如果你想让 Agent 像真人一样操作网页，但速度更快、更稳定，就选这个。',
    includes: ['CDP/DOM 自动化', '页面读取', '点击填表', '截图验收', '网页流程脚本化'],
    tools: ['browser', 'playwright', 'selenium', 'puppeteer', 'chrome', 'safari'],
    search: 'browser chrome playwright selenium puppeteer cdp web automation',
    agent: 'general',
    caution: '登录、提交、删除、付款等敏感动作必须人工确认；不同浏览器自动化工具依赖不同。',
  },
  {
    id: 'image',
    title: '图片设计能力包',
    icon: '🎨',
    subtitle: '主图、详情图、封面图、Logo、SVG、批量压缩和格式转换',
    bestFor: '适合商品图片、广告图、社媒封面、透明图、矢量图和批量图片处理。',
    userNeed: '如果你经常改图、批量压缩图片、做商品主图或生成素材图，就选这个。',
    includes: ['GIMP', 'Inkscape', 'ImageMagick 类工具', 'AI 图像工作流', '图片质量检查'],
    tools: ['gimp', 'inkscape', 'comfyui', 'krita', 'sketch', 'imagemagick'],
    search: 'image graphics design gimp inkscape comfyui krita',
    agent: 'general',
    caution: '部分工具需要安装本体软件；AI 生成图要注意版权和平台规则。',
  },
  {
    id: 'video',
    title: '视频制作能力包',
    icon: '🎬',
    subtitle: '短视频剪辑、字幕、转场、音频、封面、批量渲染和预览',
    bestFor: '适合商品短视频、口播视频、素材拼接、字幕生成、批量导出。',
    userNeed: '如果你要让 Agent 帮你做视频、剪素材、加字幕或批量渲染，就选这个。',
    includes: ['Kdenlive', 'Shotcut', 'OpenScreen', 'VideoCaptioner', 'Audacity', '预览矩阵'],
    tools: ['kdenlive', 'shotcut', 'openscreen', 'videocaptioner', 'audacity', 'obs-studio'],
    matrix: 'video-creation',
    search: 'video kdenlive shotcut caption audio obs',
    agent: 'general',
    caution: '视频渲染依赖本地软件和编码器，首次安装体积可能较大。',
  },
  {
    id: 'office',
    title: '办公文档能力包',
    icon: '📄',
    subtitle: 'Word、Excel、PPT、PDF、表格清洗、批量转换和报告生成',
    bestFor: '适合商品表、报价单、合同草稿、运营报表、PDF 转换、批量文档处理。',
    userNeed: '如果你要处理表格、文档、报表、PDF 或批量转换格式，就选这个。',
    includes: ['LibreOffice', 'OpenRefine', 'Calibre', '表格清洗', 'PDF/Office 转换'],
    tools: ['libreoffice', 'openrefine', 'calibre'],
    search: 'office document spreadsheet pdf libreoffice openrefine calibre',
    agent: 'general',
    caution: 'LibreOffice/OpenRefine 等需要本体软件或本地服务。',
  },
  {
    id: 'knowledge',
    title: '知识库与研究能力包',
    icon: '📚',
    subtitle: '资料沉淀、笔记、文献、网页收藏、知识检索和长期记忆',
    bestFor: '适合 SOP、竞品库、产品资料库、文献管理、客户资料和长期项目知识沉淀。',
    userNeed: '如果你希望 Agent 记住资料、管理笔记、整理文献和复用知识，就选这个。',
    includes: ['Obsidian', 'Joplin', 'Zotero', 'NotebookLM', '知识研究矩阵'],
    tools: ['obsidian', 'joplin', 'zotero', 'notebooklm'],
    matrix: 'knowledge-research',
    search: 'knowledge obsidian joplin zotero notebooklm research',
    agent: 'general',
    caution: '涉及私密资料时要确认同步位置和访问权限。',
  },
  {
    id: 'ai-local',
    title: '本地 AI 与工作流能力包',
    icon: '🧠',
    subtitle: '本地模型、AI 工作流、ComfyUI、Ollama、Dify、n8n 自动化',
    bestFor: '适合私有化 AI、低成本本地推理、图像生成工作流和业务自动化。',
    userNeed: '如果你想让 Agent 接入本地模型、自动化流程或 AI 生成工具，就选这个。',
    includes: ['Ollama', 'ComfyUI', 'Dify', 'n8n', 'Novita/Minimax 等 API'],
    tools: ['ollama', 'comfyui', 'dify-workflow', 'n8n', 'novita', 'minimax'],
    search: 'ai ollama comfyui dify n8n workflow generation',
    agent: 'general',
    caution: '本地 AI 可能占用显卡/内存，API 工具需要密钥。',
  },
]

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))
}

function cnCategory(value) {
  return CATEGORY_ZH[String(value || '').toLowerCase()] || value || '未分类'
}

function cnSource(value) {
  return SOURCE_ZH[String(value || '').toLowerCase()] || '可安装工具'
}

function toolKey(tool) {
  return String(tool?.name || tool?.displayName || '').toLowerCase()
}

function cnToolName(tool) {
  const key = toolKey(tool)
  return TOOL_NAME_ZH[key] || TOOL_NAME_ZH[tool?.displayName] || tool?.displayName || tool?.name || '未命名工具'
}

function cnRequires(text) {
  const value = String(text || '').trim()
  if (!value) return '暂无额外依赖说明。安装前会再次确认。'
  return value
    .replace(/installed with active database/ig, '已安装并有可用数据库')
    .replace(/running as a local web server/ig, '本机服务正在运行')
    .replace(/server running/ig, '服务正在运行')
    .replace(/or newer/ig, '或更新版本')
    .replace(/macOS for native Bonjour live capture/ig, 'macOS 原生 Bonjour 实时采集')
    .replace(/Python 3\.10\+/ig, '运行环境 3.10+')
    .replace(/ANYGEN_API_KEY/g, 'AnyGen API 密钥')
}

function explainInstallDifficulty(tool) {
  const req = String(tool?.requires || '').toLowerCase()
  const desc = String(tool?.description || '').toLowerCase()
  if (/api[_ -]?key|token|credential|secret/.test(req + desc)) return ['需要密钥', '需要先准备平台 API Key 或账号授权。']
  if (/running|server|local web server|service/.test(req)) return ['需要服务', '需要目标软件或本地服务先运行。']
  if (/blender|gimp|libreoffice|inkscape|kdenlive|shotcut|obs|zotero|joplin|openrefine|comfyui|ollama/.test(req + desc)) return ['需要本体', '需要安装对应软件本体，CLI 只是控制入口。']
  if (!req || req.includes('python')) return ['较简单', '通常只需要基础运行环境和工具包。']
  return ['需预检', '请先看依赖说明，安装日志会提示缺什么。']
}

function cnDescription(tool) {
  const key = toolKey(tool)
  if (TOOL_EXPLAIN[key]) return TOOL_EXPLAIN[key]
  const desc = String(tool?.description || '').trim()
  if (!desc) return '这个工具暂未提供详细中文说明。建议先交给 Agent 分析用途，再决定是否安装。'
  if (/^[\x00-\x7F\s.,;:()/_+\-—]+$/.test(desc)) {
    return `原始说明：${desc}。用途：这是一个可由星枢调用的专业工具；如果不确定怎么用，可以点“让 Agent 解释/使用”。`
  }
  return desc
}

function shortText(text, max = 180) {
  const value = String(text || '')
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function isCodeBrowserTool(tool) {
  const haystack = [tool?.name, tool?.displayName, tool?.category, tool?.description, tool?.entryPoint]
    .map(v => String(v || '').toLowerCase()).join(' ')
  return /browser|chrome|chromium|playwright|selenium|puppeteer|cdp|auto[- ]?browser|web[- ]?automation|domshell/.test(haystack)
}

function toolMatchesPack(tool, pack) {
  const haystack = [tool?.name, tool?.displayName, tool?.category, tool?.description, tool?.entryPoint]
    .map(v => String(v || '').toLowerCase()).join(' ')
  return pack.tools.some(name => haystack.includes(name.toLowerCase()))
}

function currentPack() {
  return CAPABILITY_PACKS.find(p => p.id === _activePack) || null
}

function applyToolState(tool) {
  const override = _toolStateOverrides.get(tool?.name)
  return override ? { ...tool, ...override } : tool
}

function applyToolStates(tools) {
  return (tools || []).map(applyToolState)
}

function rememberToolState(name, state) {
  if (!name) return
  _toolStateOverrides.set(name, { ...state, verifiedAt: Date.now() })
  _catalog = applyToolStates(_catalog)
  renderBodyNow()
}

async function recheckToolState(name) {
  if (!name) return
  try {
    await refresh(_query, { checkStatus: true })
  } catch (e) {
    console.warn('[cli-anything] tool state recheck failed:', e)
    const current = _toolStateOverrides.get(name) || {}
    _toolStateOverrides.set(name, { ...current, installState: 'verify-needed', needsRecheck: true })
    renderBodyNow()
  }
}

function filteredCatalog() {
  const pack = currentPack()
  const catalog = applyToolStates(_catalog)
  if (!pack) return catalog
  return catalog.filter(tool => toolMatchesPack(tool, pack))
}

function badge(text, kind = '') {
  return `<span class="ca-badge ${kind}">${esc(text)}</span>`
}

function buildAgentPrompt(tool = null, pack = null) {
  const target = tool ? `${tool.displayName || tool.name}（${tool.name}）` : pack ? `${pack.title}（${pack.subtitle}）` : 'CLI-Anything 工具中心'
  return `你是星枢 CLI-Anything 工具中枢专用 Agent。请和星枢面板深度协作，把外部专业软件通过 CLI 变成普通用户能直接使用的能力。

当前目标：${target}

售卖版工作规则：
1. 先用小白能听懂的话解释：这个能力干什么、适合谁、需要安装什么、会不会联网、风险是什么。
2. 使用 CLI-Anything 前必须先做环境检查：Python、pip、cli-hub、目标软件本体、目标 CLI entry point。
3. 默认关闭 analytics：运行 cli-hub / 子 CLI 时带 CLI_HUB_NO_ANALYTICS=1。
4. 安装任何工具前，先说明来源、安装命令、依赖、是否需要第三方软件、是否需要账号或 API Key。
5. 涉及删除、付款、发送消息、外部提交、批量写入、上架发布时必须二次确认。
6. 优先使用 JSON 输出；如果 CLI 不支持 JSON，要说明解析策略。
7. 失败时返回：命令、退出码、stdout/stderr 摘要、下一步修复建议。
8. 不要让用户直接面对复杂命令，除非用户明确要求；先给按钮式/步骤式方案。

请先给我：用途说明、适用场景、需要安装的工具、预计风险、下一步操作。`
}

function buildEcommercePrompt(tool = null, pack = null) {
  return `你是电商专属工作流 Agent，需要和星枢 CLI-Anything 工具中枢协同工作。

目标：${tool ? `${tool.displayName || tool.name}（${tool.name}）` : pack ? pack.title : '电商经营能力包'}
${tool ? `工具说明：${tool.description || ''}\n依赖：${tool.requires || '未声明'}\n` : ''}
${pack ? `能力包说明：${pack.subtitle}\n适合场景：${pack.bestFor}\n包含能力：${pack.includes.join('、')}\n` : ''}

电商售卖版规则：
1. 先识别任务类型：商品图处理、视频素材、标题/卖点、竞品数据、评论分析、SKU 表、店铺后台自动化。
2. 再选择 CLI 工具：图片用 GIMP/Inkscape/ComfyUI，视频用 Kdenlive/Shotcut/VideoCaptioner，表格文档用 LibreOffice/OpenRefine，知识资料用 Obsidian/Joplin/Zotero，后台网页优先浏览器自动化。
3. 每一步必须输出：输入文件、执行命令、输出文件、质量检查项、失败回滚方案。
4. 不允许未经确认就提交上架、删除商品、群发消息、付款、修改线上店铺。
5. 需要浏览器后台时，优先使用代码级操控浏览器能力，用 DOM/截图双重验收页面状态。
6. 对小白用户必须解释“为什么选这个工具”，不能只给英文工具名。

请先给我一套电商任务拆解清单，并说明要调用哪些 CLI 工具、是否需要先安装依赖。`
}

function getReadiness() {
  const status = _status || {}
  if (status.loading) return {
    tone: 'checking',
    title: '正在后台检测环境',
    desc: '工具列表已经可以查看；基础环境和工具引擎状态会在检测完成后自动刷新。',
    action: '先选择你要做的事',
  }
  if (status.cliHubAvailable && status.pythonAvailable && status.pipAvailable) return {
    tone: 'ready',
    title: '工具引擎已就绪',
    desc: '可以直接选择能力包，或安装具体工具交给 Agent 使用。',
    action: '选择能力包或搜索工具',
  }
  if (status.statusError) return {
    tone: 'attention',
    title: '环境检测未完成',
    desc: '页面可正常使用；如果安装失败，再点“重新检测”查看具体原因。',
    action: '先点一键准备工具引擎',
  }
  return {
    tone: 'attention',
    title: '需要先准备工具引擎',
    desc: '还没有检测到完整基础环境和工具引擎。工具说明可先看，安装前会再次确认。',
    action: '点击一键准备工具引擎',
  }
}

function renderHero() {
  const s = _status || {}
  const ready = getReadiness()
  const visibleTotal = filteredCatalog().length || _catalog.length
  return `
    <div class="ca-hero ca-hero-${ready.tone}">
      <div class="ca-hero-main">
        <div>
          <div class="ca-kicker">AI 工具中枢</div>
          <h1>选择任务，星枢自动准备工具</h1>
          <p>不用懂命令行。先选你要做什么，再由星枢检查环境、安装工具、交给 Agent 执行。</p>
        </div>
        <div class="ca-hero-actions">
          <button class="btn btn-primary" data-action="install" ${_loading ? 'disabled' : ''}>一键准备工具引擎</button>
          <button class="btn btn-secondary" data-action="refresh" ${_loading || _refreshing ? 'disabled' : ''}>${_refreshing ? '检测中…' : '重新检测'}</button>
        </div>
      </div>
      <div class="ca-readiness">
        <div class="ca-readiness-icon">${ready.tone === 'ready' ? '✓' : ready.tone === 'checking' ? '…' : '!'}</div>
        <div><strong>${esc(ready.title)}</strong><span>${esc(ready.desc)}</span></div>
        <em>${esc(ready.action)}</em>
      </div>
      <div class="ca-status-grid ca-status-compact">
        ${renderStatusCard('工具引擎', s.cliHubAvailable ? '可用' : s.loading ? '检测中' : '需准备', s.cliHubVersion || '负责安装和管理工具', s.cliHubAvailable ? 'ok' : s.loading ? 'info' : 'warn')}
        ${renderStatusCard('基础环境', s.pythonAvailable && s.pipAvailable ? '可用' : s.loading ? '检测中' : '需修复', '工具运行所需基础组件', s.pythonAvailable && s.pipAvailable ? 'ok' : s.loading ? 'info' : 'warn')}
        ${renderStatusCard('可选工具', `${visibleTotal} 个`, '先看用途，再决定是否安装', visibleTotal ? 'ok' : 'warn')}
        ${renderStatusCard('操作安全', '会确认', '安装/卸载/敏感操作前都会二次确认', 'ok')}
      </div>
      ${s.statusError ? `<div class="ca-inline-warning">检测提示：${esc(s.statusError)}。这不会阻塞页面使用。</div>` : ''}
    </div>
  `
}

function renderStatusCard(label, value, desc, state) {
  return `<div class="ca-status-card ${state}"><span>${esc(label)}</span><strong>${esc(value)}</strong><em>${esc(desc)}</em></div>`
}

function renderBodyNow() {
  const body = _page?.querySelector('#cli-anything-body')
  if (body) body.innerHTML = renderContent()
}

function userLog(modal, text) {
  modal.appendLog(text)
}

function appendDiagnostics(modal, title, raw) {
  const value = String(raw || '').trim()
  if (!value) return
  modal.appendHtmlLog(`<details class="ca-modal-diagnostics"><summary>${esc(title)}</summary><pre>${esc(value.slice(0, 8000))}</pre></details>`)
}

function summarizeInstallResult(res) {
  const steps = Array.isArray(res?.steps) ? res.steps : []
  const readable = steps
    .filter(step => !/analytics|setuptools|wheel|pip\s+\/\s+setuptools|cli-hub 版本/i.test(String(step)))
    .map(step => String(step).replace(/^完成：?s*/, ''))
  return readable.length ? readable.slice(0, 4) : ['工具引擎已准备完成']
}

function renderBeginnerGuide() {
  return `
    <div class="ca-section ca-guide-section">
      <div class="ca-section-title">
        <span>新手入口</span>
        <h2>先选任务，不要先研究工具</h2>
        <p>如果你不知道该装什么，就从下面 6 个任务入口开始。星枢会提示缺什么、能做什么、下一步点哪里。</p>
      </div>
      <div class="ca-decision-grid">
        <div><b>我要做电商</b><span>选“电商经营能力包”，它会组合浏览器、图片、表格、视频、知识库能力。</span></div>
        <div><b>我要自动操作网页</b><span>选“浏览器自动化能力包”，重点是 CDP/DOM/截图验收和后台流程辅助。</span></div>
        <div><b>我要处理图片</b><span>选“图片设计能力包”，适合商品主图、详情图、压缩、格式转换。</span></div>
        <div><b>我要做视频</b><span>选“视频制作能力包”，适合短视频、字幕、剪辑、音频、批量渲染。</span></div>
        <div><b>我要处理文档表格</b><span>选“办公文档能力包”，适合 Excel、PDF、报表、商品表、报价单。</span></div>
        <div><b>我要管理资料</b><span>选“知识库与研究能力包”，适合 SOP、资料库、笔记、文献和长期记忆。</span></div>
      </div>
    </div>
  `
}

function renderCapabilityPacks() {
  return `
    <div class="ca-section">
      <div class="ca-section-title">
        <span>任务入口</span>
        <h2>按用途选择能力</h2>
        <p>每个入口都会筛选相关工具，并给出安装前需要知道的依赖和风险。</p>
      </div>
      <div class="ca-pack-tabs">
        <button class="ca-pack-tab ${_activePack === 'all' ? 'active' : ''}" data-action="pack" data-pack="all">全部</button>
        ${CAPABILITY_PACKS.map(pack => `<button class="ca-pack-tab ${_activePack === pack.id ? 'active' : ''}" data-action="pack" data-pack="${esc(pack.id)}">${pack.icon} ${esc(pack.title)}</button>`).join('')}
      </div>
      <div class="ca-pack-grid">
        ${CAPABILITY_PACKS.map(renderPack).join('')}
      </div>
    </div>
  `
}

function renderPack(pack) {
  const active = _activePack === pack.id ? 'active' : ''
  return `
    <div class="ca-pack-card ${active}">
      <div class="ca-pack-head">
        <div class="ca-pack-icon">${pack.icon}</div>
        <div><strong>${esc(pack.title)}</strong><span>${esc(pack.subtitle)}</span></div>
      </div>
      <p>${esc(pack.bestFor)}</p>
      <div class="ca-user-need"><b>你什么时候需要它？</b><span>${esc(pack.userNeed)}</span></div>
      <div class="ca-chip-row">${pack.includes.map(item => badge(item)).join('')}</div>
      <div class="ca-caution">注意：${esc(pack.caution)}</div>
      <div class="ca-pack-actions">
        <button class="btn btn-primary" data-action="use-pack" data-pack="${esc(pack.id)}">查看推荐工具</button>
        ${pack.matrix ? `<button class="btn btn-secondary" data-action="matrix" data-name="${esc(pack.matrix)}" ${_status?.matrixAvailable ? '' : 'disabled'}>矩阵预检</button>` : ''}
        <button class="btn btn-secondary" data-action="pack-agent" data-pack="${esc(pack.id)}">交给 Agent 规划</button>
      </div>
    </div>
  `
}

function renderProtocol() {
  return `
    <details class="ca-advanced">
      <summary>高级：Agent 如何调用这些工具</summary>
      <div class="ca-protocol">
        <div class="ca-protocol-node hub"><span>准备工具</span><strong>搜索 / 安装 / 检测 / 诊断</strong><em>把外部专业软件变成可调用能力</em></div>
        <div class="ca-protocol-arrow">交给 →</div>
        <div class="ca-protocol-node agent"><span>执行任务</span><strong>通用 Agent + ${ECOM_AGENT_NAME}</strong><em>理解需求、选择工具、执行步骤、确认风险</em></div>
        <button class="btn btn-primary" data-action="open-ecom-agent">进入电商 Agent</button>
      </div>
    </details>
  `
}

function renderMatrix() {
  const matrices = [
    ['video-creation', '视频创作矩阵', '把字幕、剪辑、音频、封面、渲染串成完整视频流水线。'],
    ['image-design', '图像设计矩阵', '把生成图、修图、矢量素材、质量检查组合成设计流水线。'],
    ['3d-cad', '3D / CAD 矩阵', '把建模、渲染、CAD、模型检查组合起来。'],
    ['game-development', '游戏开发矩阵', '把游戏引擎、调试、资产处理和项目自动化组合起来。'],
    ['knowledge-research', '知识研究矩阵', '把笔记、文献、资料整理和检索组合起来。'],
  ]
  return `
    <details class="ca-advanced">
      <summary>高级：工作流预检</summary>
      <div class="ca-section ca-section-compact">
        <div class="ca-section-title"><span>高级预检</span><h2>按任务链检查缺什么</h2><p>适合高级自动化。新手可以先忽略这里，直接选择上面的任务入口。</p></div>
        <div class="ca-matrix-grid">
          ${matrices.map(([id, title, desc]) => `
            <div class="ca-matrix-card">
              <strong>${esc(title)}</strong>
              <span>${esc(desc)}</span>
              <button class="btn btn-secondary" data-action="matrix" data-name="${esc(id)}" ${_status?.matrixAvailable ? '' : 'disabled'}>预检</button>
            </div>`).join('')}
        </div>
      </div>
    </details>
  `
}

function renderCatalog() {
  const pack = currentPack()
  const tools = filteredCatalog()
  return `
    <div class="ca-section">
      <div class="ca-section-head">
        <div class="ca-section-title">
          <span>${pack ? pack.title : '工具列表'}</span>
          <h2>${pack ? '推荐先看这些工具' : '所有可用工具'}</h2>
          <p>${pack ? esc(pack.userNeed) : '先看用途和当前状态，再决定是否安装。不会静默执行安装。'}</p>
        </div>
        <form class="ca-search" data-action="search-form">
          <input id="ca-search-input" value="${esc(_query)}" placeholder="搜索：电商 / 浏览器 / 图片 / 视频 / 表格 / 文档" />
          <button class="btn btn-primary" type="submit">搜索</button>
        </form>
      </div>
      ${pack ? `<div class="ca-pack-summary"><b>这个入口包含：</b>${pack.includes.map(esc).join('、')}<br><b>使用前注意：</b>${esc(pack.caution)}</div>` : ''}
      <div class="ca-catalog">
        ${tools.length ? tools.map(renderTool).join('') : '<div class="ca-empty">没有找到匹配工具。请换个关键词，或回到“全部”查看推荐工具。</div>'}
      </div>
    </div>
  `
}

function describeInstallState(tool) {
  const state = tool?.installed ? 'installed' : tool?.installState || 'not-installed'
  if (state === 'installed') return [tool?.needsRecheck ? '需复查' : '已安装', tool?.needsRecheck ? 'warn' : 'ok']
  if (state === 'verify-needed') return ['需复查', 'warn']
  if (state === 'failed') return ['安装失败', 'bad']
  if (state === 'installing') return ['安装中', 'warn']
  return ['未安装', 'warn']
}

function toolActionLabel(tool) {
  return tool?.installed ? '重新安装' : '安装这个工具'
}

function confirmToolUninstall(tool, name) {
  const label = tool?.displayName || cnToolName(tool) || name
  return window.confirm([
    `即将卸载：${label}`,
    '这会移除星枢为该能力安装的控制入口；不会删除第三方软件本体，也不会删除用户数据。',
    '确认继续？',
  ].join('\n'))
}

function renderTool(tool) {
  const [difficulty, difficultyText] = explainInstallDifficulty(tool)
  const [installLabel, installTone] = describeInstallState(tool)
  const browserBadge = isCodeBrowserTool(tool) ? '<span class="ca-browser-badge">代码级操控浏览器</span>' : ''
  const uninstallButton = tool.installed ? `<button class="btn btn-secondary" data-action="uninstall-tool" data-name="${esc(tool.name)}">卸载</button>` : ''
  return `
    <div class="ca-tool-card">
      <div class="ca-tool-head">
        <div><strong>${esc(cnToolName(tool))}</strong><span>${esc(tool.name)} · ${esc(cnCategory(tool.category))}</span></div>
        <span class="ca-source">${esc(cnSource(tool.source))}</span>
      </div>
      <div class="ca-chip-row">${browserBadge}${badge(difficulty, difficulty === '较简单' ? 'ok' : 'warn')}${badge(installLabel, installTone)}</div>
      <p>${esc(shortText(cnDescription(tool), 260))}</p>
      <div class="ca-tool-explain"><b>小白解释：</b><span>${esc(difficultyText)}</span></div>
      <div class="ca-tool-meta"><b>需要什么：</b>${esc(cnRequires(tool.requires))}</div>
      <div class="ca-tool-meta"><b>命令入口：</b><code>${esc(tool.entryPoint || '安装后由星枢自动识别')}</code></div>
      <div class="ca-tool-actions">
        <button class="btn btn-primary" data-action="install-tool" data-name="${esc(tool.name)}">${toolActionLabel(tool)}</button>
        ${uninstallButton}
        <button class="btn btn-secondary" data-action="agent" data-name="${esc(tool.name)}">让 Agent 解释/使用</button>
        <button class="btn btn-secondary ca-ecom-btn" data-action="ecommerce" data-name="${esc(tool.name)}">交给电商 Agent</button>
      </div>
    </div>
  `
}

function renderContent() {
  return `
    <div class="cli-anything-page">
      ${renderHero()}
      ${renderBeginnerGuide()}
      ${renderCapabilityPacks()}
      ${renderProtocol()}
      ${renderMatrix()}
      ${renderCatalog()}
    </div>
  `
}

function findTool(name) {
  return applyToolState(_catalog.find(item => item.name === name) || null)
}

function findPack(id) {
  return CAPABILITY_PACKS.find(item => item.id === id) || null
}

async function loadStatus() {
  try {
    _status = await api.cliAnythingStatus()
  } catch (e) {
    console.warn('[cli-anything] status detection skipped:', e)
    _status = {
      ok: false,
      pythonAvailable: false,
      pipAvailable: false,
      cliHubAvailable: false,
      cliHubVersion: '',
      matrixAvailable: false,
      statusError: e?.message || String(e),
    }
  }
}

function normalizeSearchQuery(query) {
  const value = String(query || '').trim()
  const map = {
    电商: 'ecommerce browser image office openrefine',
    商城: 'ecommerce browser image office openrefine',
    商品: 'ecommerce image office browser',
    主图: 'image gimp product',
    详情图: 'image gimp',
    图片: 'image graphics gimp inkscape',
    图像: 'image graphics gimp inkscape',
    视频: 'video kdenlive shotcut caption',
    剪辑: 'video kdenlive shotcut',
    浏览器: 'browser chrome playwright cdp',
    网页: 'browser web automation',
    办公: 'office document libreoffice',
    表格: 'office spreadsheet openrefine',
    数据: 'data database openrefine',
    设计: 'design image graphics',
    文档: 'document office pdf libreoffice',
    知识库: 'knowledge obsidian joplin zotero',
    本地模型: 'ollama ai local',
  }
  return map[value] || value
}

function fallbackCatalog() {
  const base = [
    ['browser', '浏览器代码化操控', 'browser', '通过代码打开网页、点击、填表、读取 DOM、截图和验收页面状态。适合电商后台、网页采集、自动填表和网页测试。', 'Chrome / 自动化后端 / 可能需要浏览器扩展', 'cli-anything-browser'],
    ['gimp', 'GIMP 图片编辑', 'image', '处理商品主图、详情图、封面图、抠图、裁剪、批量压缩和格式转换。', 'GIMP 软件本体', 'cli-anything-gimp'],
    ['inkscape', 'Inkscape 矢量设计', 'image', '处理 SVG、Logo、图标、矢量海报和可缩放设计素材。', 'Inkscape 软件本体', 'cli-anything-inkscape'],
    ['libreoffice', 'LibreOffice 办公文档', 'office', '生成和转换 Word、Excel、PPT、PDF，适合商品表、报价单、报表和说明书。', 'LibreOffice 软件本体', 'cli-anything-libreoffice'],
    ['openrefine', 'OpenRefine 数据清洗', 'database', '清洗商品采集表、SKU 表、供应商表、价格表，支持去重、改字段和导出。', 'OpenRefine 本地服务', 'cli-anything-openrefine'],
    ['kdenlive', 'Kdenlive 视频剪辑', 'video', '处理短视频剪辑、字幕、转场、模板化视频和批量渲染。', 'Kdenlive / MLT 后端', 'cli-anything-kdenlive'],
    ['shotcut', 'Shotcut 视频剪辑', 'video', '轻量视频剪辑、素材拼接、滤镜和导出，适合商品展示视频。', 'Shotcut / MLT 后端', 'cli-anything-shotcut'],
    ['audacity', 'Audacity 音频处理', 'audio', '处理口播、旁白、降噪、音量调整、裁剪和音频导出。', 'sox 或音频处理后端', 'cli-anything-audacity'],
    ['obsidian', 'Obsidian 知识库', 'knowledge', '沉淀产品资料、竞品分析、SOP、素材库和长期项目知识。', 'Obsidian 本地库 / 可选插件', 'cli-anything-obsidian'],
    ['joplin', 'Joplin 笔记管理', 'knowledge', '管理笔记、附件、标签、任务和同步资料，适合团队 SOP。', 'Joplin 或其本地服务', 'cli-anything-joplin'],
    ['zotero', 'Zotero 文献管理', 'knowledge', '管理文献、PDF、引用和研究资料，适合报告和资料库。', 'Zotero 软件本体', 'cli-anything-zotero'],
    ['comfyui', 'ComfyUI 图像工作流', 'generation', '管理 AI 图像生成工作流，适合商品场景图和视觉素材生成。', 'ComfyUI 环境', 'cli-anything-comfyui'],
    ['ollama', 'Ollama 本地模型', 'ai', '管理本地模型、离线推理和私有化 AI 能力。', 'Ollama 软件本体', 'cli-anything-ollama'],
    ['n8n', 'n8n 自动化工作流', 'automation', '连接表格、接口、消息和业务系统，适合定时任务和数据同步。', 'n8n 服务', 'cli-anything-n8n'],
  ]
  return base.map(([name, displayName, category, description, requires, entryPoint]) => ({
    name,
    displayName,
    category,
    description,
    requires,
    entryPoint,
    source: 'local',
    installCmd: `cli-hub install ${name}`,
  }))
}

async function loadCatalog(query = _query) {
  const pack = currentPack()
  if (!_status?.cliHubAvailable) {
    const fallback = fallbackCatalog()
    _catalog = applyToolStates(pack ? fallback.filter(tool => toolMatchesPack(tool, pack)) : fallback)
    return
  }
  const finalQuery = query || pack?.search || ''
  const res = await api.cliAnythingCatalog(normalizeSearchQuery(finalQuery))
  _catalog = applyToolStates(res?.items || [])
}

async function refresh(query = _query, options = {}) {
  const body = _page?.querySelector('#cli-anything-body')
  if (!body) return
  const shouldCheckStatus = options.checkStatus !== false
  try {
    if (shouldCheckStatus) {
      _toolStateOverrides.clear()
      await loadStatus()
    }
    await loadCatalog(query)
    _refreshing = false
    body.innerHTML = renderContent()
  } catch (e) {
    const msg = e?.message || e
    console.warn('[cli-anything] refresh failed:', e)
    _catalog = _catalog.length ? _catalog : fallbackCatalog()
    if (!_status) {
      _status = { ok: false, statusError: msg, cliHubAvailable: false, pythonAvailable: false, pipAvailable: false, matrixAvailable: false }
    } else {
      _status = { ..._status, statusError: msg, loading: false }
    }
    _refreshing = false
    body.innerHTML = renderContent()
    toast('工具状态检测失败，页面已切换为离线推荐模式', 'warn', { duration: 5000 })
  }
}

function confirmToolInstall(tool, name) {
  const [difficulty, difficultyText] = explainInstallDifficulty(tool)
  const lines = [
    `即将安装：${tool?.displayName || cnToolName(tool) || name}`,
    `用途：${cnDescription(tool)}`,
    `安装难度：${difficulty} - ${difficultyText}`,
    `需要：${cnRequires(tool?.requires)}`,
    '说明：星枢只安装控制入口，不会静默安装第三方软件本体。',
  ]
  lines.push('', '确认继续安装？')
  return window.confirm(lines.join('\n'))
}

function openAgent(prompt, message, session = '') {
  try {
    localStorage.setItem('cliAnything.chatDraft', prompt)
    toast(message, 'success')
    if (session) location.hash = `#/chat?session=${encodeURIComponent(session)}`
    else navigate('/chat')
  } catch (e) {
    toast(e?.message || e, 'error', { duration: 6000 })
  }
}

async function selectPack(id) {
  _activePack = id
  _query = ''
  await refresh('', { checkStatus: false })
}

function bindEvents(page) {
  page.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-action="search-form"]')
    if (!form) return
    event.preventDefault()
    _activePack = 'all'
    _query = page.querySelector('#ca-search-input')?.value?.trim() || ''
    await refresh(_query, { checkStatus: false })
  })

  page.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-action]')
    if (!btn || _loading) return
    const action = btn.dataset.action
    if (action === 'refresh') {
      _refreshing = true
      _status = { ...(_status || {}), loading: true, statusError: '' }
      renderBodyNow()
      try {
        await refresh(_query, { checkStatus: true })
      } finally {
        _refreshing = false
      }
      return
    }
    if (action === 'pack' || action === 'use-pack') return selectPack(btn.dataset.pack || 'all')
    if (action === 'install') {
      const modal = showUpgradeModal('星枢工具引擎 · 一键准备')
      try {
        _loading = true
        modal.setProgress(10)
        userLog(modal, '正在检查基础环境…')
        userLog(modal, '不会静默安装系统软件；需要用户确认的步骤会明确提示。')
        const res = await api.cliAnythingInstall()
        modal.setProgress(85)
        summarizeInstallResult(res).forEach(step => userLog(modal, `完成：${step}`))
        appendDiagnostics(modal, '查看详细检测日志', (res?.steps || []).join('\n'))
        modal.setDone('工具引擎已准备完成')
        toast('工具引擎已准备完成', 'success')
      } catch (e) {
        const msg = e?.message || e
        modal.appendLog(`失败：${msg}`)
        modal.setError(`工具引擎准备失败：${msg}`)
        toast(msg, 'error', { duration: 8000 })
      } finally {
        _loading = false
        await refresh(_query, { checkStatus: false })
      }
    }
    if (action === 'install-tool') {
      const name = btn.dataset.name
      const tool = findTool(name)
      if (!confirmToolInstall(tool, name)) return
      const modal = showUpgradeModal(`安装工具：${cnToolName(tool) || name}`)
      try {
        _loading = true
        modal.setProgress(12)
        userLog(modal, `正在安装：${tool?.displayName || cnToolName(tool) || name}`)
        userLog(modal, `用途：${cnDescription(tool)}`)
        userLog(modal, `需要：${cnRequires(tool?.requires)}`)
        userLog(modal, '如果缺少第三方软件本体，安装结果会明确提示。')
        const res = await api.cliAnythingInstallTool(name)
        modal.setProgress(85)
        userLog(modal, res?.installed === false ? '正在复查安装结果…' : '安装完成，正在刷新工具状态…')
        appendDiagnostics(modal, '查看原始安装日志', res?.output || '')
        if (res?.installed === false) {
          rememberToolState(name, { installed: false, installState: 'failed' })
          throw new Error('安装后没有检测到可用状态。请查看高级诊断，或点击“重新安装”。')
        }
        rememberToolState(name, { installed: true, installState: 'installed', installedPackage: res?.installedPackage || name, needsRecheck: false })
        modal.setDone(`${cnToolName(tool) || name} 安装完成`)
        toast(`${cnToolName(tool) || name} 安装完成`, 'success')
      } catch (e) {
        const msg = e?.message || e
        modal.appendLog(`失败：${msg}`)
        modal.setError(`工具安装失败：${msg}`)
        toast(msg, 'error', { duration: 8000 })
      } finally {
        _loading = false
        await recheckToolState(name)
      }
    }
    if (action === 'uninstall-tool') {
      const name = btn.dataset.name
      const tool = findTool(name)
      if (!confirmToolUninstall(tool, name)) return
      const modal = showUpgradeModal(`卸载工具：${cnToolName(tool) || name}`)
      try {
        _loading = true
        modal.setProgress(20)
        userLog(modal, `正在卸载：${tool?.displayName || cnToolName(tool) || name}`)
        const res = await api.cliAnythingUninstallTool(name)
        modal.setProgress(90)
        userLog(modal, '正在复查卸载结果…')
        appendDiagnostics(modal, '查看原始卸载日志', res?.output || '')
        if (res?.installed) {
          rememberToolState(name, { installed: true, installState: 'installed', installedPackage: res?.installedPackage || name, needsRecheck: false })
          throw new Error(`卸载后仍检测到 ${res.installedPackage || name} 存在。请查看高级诊断后重试。`)
        }
        rememberToolState(name, { installed: false, installState: 'not-installed', installedPackage: '' })
        modal.setDone(`${cnToolName(tool) || name} 已卸载`)
        toast(`${cnToolName(tool) || name} 已卸载`, 'success')
      } catch (e) {
        const msg = e?.message || e
        modal.appendLog(`失败：${msg}`)
        modal.setError(`工具卸载失败：${msg}`)
        toast(msg, 'error', { duration: 8000 })
      } finally {
        _loading = false
        await recheckToolState(name)
      }
    }
    if (action === 'open-ecom-agent') {
      openAgent(buildEcommercePrompt(null, findPack('ecommerce')), '已切换到电商专属 Agent 协议通信', ECOM_AGENT_SESSION)
    }
    if (action === 'pack-agent') {
      const pack = findPack(btn.dataset.pack)
      const session = pack?.agent === 'ecommerce' ? ECOM_AGENT_SESSION : ''
      const prompt = pack?.agent === 'ecommerce' ? buildEcommercePrompt(null, pack) : buildAgentPrompt(null, pack)
      openAgent(prompt, `已把${pack?.title || '能力包'}交给 Agent 规划`, session)
    }
    if (action === 'agent') openAgent(buildAgentPrompt(findTool(btn.dataset.name)), '已生成工具说明和 Agent 使用提示')
    if (action === 'ecommerce') openAgent(buildEcommercePrompt(findTool(btn.dataset.name)), '已交给电商专属 Agent 内部联动', ECOM_AGENT_SESSION)
    if (action === 'matrix') {
      const name = btn.dataset.name
      const modal = showUpgradeModal(`工作流矩阵预检：${name}`)
      try {
        modal.setProgress(20)
        userLog(modal, '正在检查这条工作流缺少哪些工具…')
        const res = await api.cliAnythingMatrixPreflight(name)
        modal.setProgress(90)
        appendDiagnostics(modal, '查看原始预检结果', JSON.stringify(res?.output || {}, null, 2))
        modal.setDone('矩阵预检完成，请按缺口安装，不要盲目全量安装。')
      } catch (e) {
        const msg = e?.message || e
        modal.appendLog(`失败：${msg}`)
        modal.setError(`矩阵预检失败：${msg}`)
      }
    }
  })
}

async function renderInitialContent() {
  _status = {
    ok: false,
    pythonAvailable: false,
    pipAvailable: false,
    cliHubAvailable: false,
    cliHubVersion: '',
    matrixAvailable: false,
    loading: true,
  }
  _catalog = applyToolStates(fallbackCatalog())
  const body = _page?.querySelector('#cli-anything-body')
  if (body) body.innerHTML = renderContent()
}

export async function render() {
  _page = document.createElement('div')
  _page.innerHTML = '<div id="cli-anything-body"><div class="ca-working">正在打开工具中枢，请稍候…</div></div>'
  bindEvents(_page)
  setTimeout(() => {
    renderInitialContent()
    refresh('', { checkStatus: true }).catch(e => console.warn('[cli-anything] initial refresh failed:', e))
  }, 0)
  return _page
}

