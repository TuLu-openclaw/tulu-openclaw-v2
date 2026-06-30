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
  harness: 'CLI-Anything 原生适配',
  public: '公开第三方 CLI',
  local: '本地命令',
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
  return SOURCE_ZH[String(value || '').toLowerCase()] || value || 'CLI 工具'
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
  if (!value) return '未声明。安装前请先查看工具详情，星枢会在安装日志里提示缺失项。'
  return value
    .replace(/installed with active database/ig, '已安装并有可用数据库')
    .replace(/running as a local web server/ig, '本机服务正在运行')
    .replace(/server running/ig, '服务正在运行')
    .replace(/or newer/ig, '或更新版本')
    .replace(/macOS for native Bonjour live capture/ig, 'macOS 原生 Bonjour 实时采集')
    .replace(/Python 3\.10\+/ig, 'Python 3.10+')
    .replace(/ANYGEN_API_KEY/g, 'AnyGen API 密钥')
}

function explainInstallDifficulty(tool) {
  const req = String(tool?.requires || '').toLowerCase()
  const desc = String(tool?.description || '').toLowerCase()
  if (/api[_ -]?key|token|credential|secret/.test(req + desc)) return ['需要密钥', '需要先准备平台 API Key 或账号授权。']
  if (/running|server|local web server|service/.test(req)) return ['需要服务', '需要目标软件或本地服务先运行。']
  if (/blender|gimp|libreoffice|inkscape|kdenlive|shotcut|obs|zotero|joplin|openrefine|comfyui|ollama/.test(req + desc)) return ['需要本体', '需要安装对应软件本体，CLI 只是控制入口。']
  if (!req || req.includes('python')) return ['较简单', '通常只需要 Python 和 CLI 包。']
  return ['需预检', '请先看依赖说明，安装日志会提示缺什么。']
}

function cnDescription(tool) {
  const key = toolKey(tool)
  if (TOOL_EXPLAIN[key]) return TOOL_EXPLAIN[key]
  const desc = String(tool?.description || '').trim()
  if (!desc) return '这个工具暂未提供详细中文说明。建议先交给 Agent 分析用途，再决定是否安装。'
  if (/^[\x00-\x7F\s.,;:()/_+\-—]+$/.test(desc)) {
    return `原始说明：${desc}。简单理解：这是 CLI-Anything 生态里的专业工具，星枢会保留入口、依赖和安装信息；如果你不确定用途，可以点“让 Agent 解释/使用”。`
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

function filteredCatalog() {
  const pack = currentPack()
  if (!pack) return _catalog
  return _catalog.filter(tool => toolMatchesPack(tool, pack))
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

function renderHero() {
  const s = _status || {}
  return `
    <div class="ca-hero">
      <div class="ca-hero-main">
        <div>
          <div class="ca-kicker">星枢工具引擎 · CLI-Anything 内置生态</div>
          <h1>AI 工具生态中心</h1>
          <p>这里把复杂的专业软件 CLI 包装成“小白能选择的能力包”。用户不需要懂命令行，只要选择场景；星枢负责检测环境、安装工具、预检依赖，并把能力交给对应 Agent 使用。</p>
        </div>
        <div class="ca-hero-actions">
          <button class="btn btn-primary" data-action="install" ${_loading ? 'disabled' : ''}>一键准备工具引擎</button>
          <button class="btn btn-secondary" data-action="refresh" ${_loading ? 'disabled' : ''}>刷新状态</button>
        </div>
      </div>
      <div class="ca-status-grid">
        ${renderStatusCard('CLI-Hub', s.cliHubAvailable ? '已就绪' : '未安装', s.cliHubVersion || s.cliHubPath || '负责搜索、安装和管理 CLI 工具', s.cliHubAvailable ? 'ok' : 'warn')}
        ${renderStatusCard('Python', s.pythonAvailable ? '可用' : '缺失', s.pythonVersion || s.pythonPath || '工具引擎运行基础环境', s.pythonAvailable ? 'ok' : 'warn')}
        ${renderStatusCard('pip', s.pipAvailable ? '可用' : '需修复', '用于安装 CLI-Hub 和工具依赖', s.pipAvailable ? 'ok' : 'warn')}
        ${renderStatusCard('工具目录', `${Number(s.catalogTotal || 0)} 个`, `${Number(s.harnessCount || 0)} 原生适配 · ${Number(s.publicCount || 0)} 公开 CLI`, s.catalogTotal ? 'ok' : 'warn')}
        ${renderStatusCard('工作流矩阵', s.matrixAvailable ? '可预检' : '需修复', s.matrixAvailable ? '支持按任务链检查缺口' : '点击一键准备工具引擎获取最新版', s.matrixAvailable ? 'ok' : 'warn')}
        ${renderStatusCard('隐私策略', '默认关闭统计', '所有 cli-hub 调用注入 CLI_HUB_NO_ANALYTICS=1', 'ok')}
      </div>
    </div>
  `
}

function renderStatusCard(label, value, desc, state) {
  return `<div class="ca-status-card ${state}"><span>${esc(label)}</span><strong>${esc(value)}</strong><em>${esc(desc)}</em></div>`
}

function renderBeginnerGuide() {
  return `
    <div class="ca-section ca-guide-section">
      <div class="ca-section-title">
        <span>给小白看的选择方法</span>
        <h2>不知道选哪个？先看你要完成什么事</h2>
        <p>下面不是简单工具列表，而是按真实任务整理的能力包。每个能力包都说明用途、适合谁、包含什么、注意什么。</p>
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
        <span>能力包</span>
        <h2>完整功能不缩水，但用场景包装起来</h2>
        <p>能力包不会删掉底层工具，而是把一组相关 CLI 工具、依赖检查和 Agent 联动放到一起，方便小白判断自己需要哪一个。</p>
      </div>
      <div class="ca-pack-tabs">
        <button class="ca-pack-tab ${_activePack === 'all' ? 'active' : ''}" data-action="pack" data-pack="all">全部工具</button>
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
        <button class="btn btn-primary" data-action="use-pack" data-pack="${esc(pack.id)}">查看这个能力包</button>
        ${pack.matrix ? `<button class="btn btn-secondary" data-action="matrix" data-name="${esc(pack.matrix)}" ${_status?.matrixAvailable ? '' : 'disabled'}>矩阵预检</button>` : ''}
        <button class="btn btn-secondary" data-action="pack-agent" data-pack="${esc(pack.id)}">交给 Agent 规划</button>
      </div>
    </div>
  `
}

function renderProtocol() {
  return `
    <div class="ca-protocol">
      <div class="ca-protocol-node hub"><span>工具引擎</span><strong>搜索 / 安装 / 预检 / 诊断</strong><em>负责把外部专业软件变成 Agent 可调用能力</em></div>
      <div class="ca-protocol-arrow">能力注入 →</div>
      <div class="ca-protocol-node agent"><span>Agent 使用层</span><strong>通用 Agent + ${ECOM_AGENT_NAME}</strong><em>负责理解用户需求、选择工具、执行工作流和风险确认</em></div>
      <button class="btn btn-primary" data-action="open-ecom-agent">进入电商 Agent</button>
    </div>
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
    <div class="ca-section">
      <div class="ca-section-title"><span>工作流矩阵</span><h2>不是单个工具，而是一整条任务链</h2><p>矩阵适合高级自动化：先预检缺什么，再按缺口安装，避免给小白一次性装太多无关依赖。</p></div>
      <div class="ca-matrix-grid">
        ${matrices.map(([id, title, desc]) => `
          <div class="ca-matrix-card">
            <strong>${esc(title)}</strong>
            <span>${esc(desc)}</span>
            <button class="btn btn-secondary" data-action="matrix" data-name="${esc(id)}" ${_status?.matrixAvailable ? '' : 'disabled'}>预检 ${esc(id)}</button>
          </div>`).join('')}
      </div>
    </div>
  `
}

function renderCatalog() {
  const pack = currentPack()
  const tools = filteredCatalog()
  return `
    <div class="ca-section">
      <div class="ca-section-head">
        <div class="ca-section-title">
          <span>${pack ? pack.title : '完整工具目录'}</span>
          <h2>${pack ? '这个能力包推荐的工具' : '高级用户可搜索全部 CLI 工具'}</h2>
          <p>${pack ? esc(pack.userNeed) : '这里保留完整 CLI-Anything 工具生态，不降低功能完整性。小白优先用上面的能力包，高级用户可直接搜索具体工具。'}</p>
        </div>
        <form class="ca-search" data-action="search-form">
          <input id="ca-search-input" value="${esc(_query)}" placeholder="搜索：电商 / 浏览器 / 图片 / 视频 / 表格 / 文档" />
          <button class="btn btn-primary" type="submit">搜索</button>
        </form>
      </div>
      ${pack ? `<div class="ca-pack-summary"><b>包含能力：</b>${pack.includes.map(esc).join('、')}<br><b>注意事项：</b>${esc(pack.caution)}</div>` : ''}
      <div class="ca-catalog">
        ${tools.length ? tools.map(renderTool).join('') : '<div class="ca-empty">暂无匹配工具。请先点击“一键准备工具引擎”，或切换到“全部工具”搜索。</div>'}
      </div>
    </div>
  `
}

function describeInstallState(tool) {
  const state = tool?.installed ? 'installed' : tool?.installState || 'not-installed'
  if (state === 'installed') return ['已安装', 'ok']
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
    `即将卸载 CLI 工具：${label}（${name}）`,
    '这会移除对应 pip/npm harness 包；不会删除第三方软件本体，也不会删除用户数据。',
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
  return _catalog.find(item => item.name === name) || null
}

function findPack(id) {
  return CAPABILITY_PACKS.find(item => item.id === id) || null
}

async function loadStatus() {
  _status = await api.cliAnythingStatus()
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
    _catalog = pack ? fallback.filter(tool => toolMatchesPack(tool, pack)) : fallback
    return
  }
  const finalQuery = query || pack?.search || ''
  const res = await api.cliAnythingCatalog(normalizeSearchQuery(finalQuery))
  _catalog = res?.items || []
}

async function refresh(query = _query) {
  const body = _page?.querySelector('#cli-anything-body')
  if (!body) return
  try {
    await loadStatus()
    await loadCatalog(query)
    body.innerHTML = renderContent()
  } catch (e) {
    const msg = e?.message || e
    const timeoutHint = /timeout|超时|abort/i.test(String(msg)) ? '<p>已按 3 分钟页面级超时停止等待。工具中枢可能仍在后台初始化，请稍后点“重新检测”。</p>' : ''
    body.innerHTML = `<div class="ca-error">CLI-Anything 状态加载失败：${esc(msg)}${timeoutHint}<button class="btn btn-primary" data-action="refresh">重新检测</button></div>`
  }
}

function confirmToolInstall(tool, name) {
  const [difficulty, difficultyText] = explainInstallDifficulty(tool)
  const lines = [
    `即将安装 CLI 工具：${tool?.displayName || name}（${name}）`,
    `用途说明：${cnDescription(tool)}`,
    `安装难度：${difficulty} - ${difficultyText}`,
    `来源：${tool?.source || 'harness'}`,
    `分类：${tool?.category || '未声明'}`,
    `依赖：${tool?.requires || '未声明'}`,
    `入口：${tool?.entryPoint || '未声明'}`,
  ]
  if (tool?.installCmd) lines.push(`安装命令：${tool.installCmd}`)
  lines.push('', 'cli-hub install 可能执行 pip / npm / uv 或其他安装命令；第三方软件本体不会被星枢静默安装。请确认继续。')
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
  await refresh('')
}

function bindEvents(page) {
  page.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-action="search-form"]')
    if (!form) return
    event.preventDefault()
    _activePack = 'all'
    _query = page.querySelector('#ca-search-input')?.value?.trim() || ''
    await refresh(_query)
  })

  page.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-action]')
    if (!btn || _loading) return
    const action = btn.dataset.action
    if (action === 'refresh') return refresh(_query)
    if (action === 'pack' || action === 'use-pack') return selectPack(btn.dataset.pack || 'all')
    if (action === 'install') {
      const modal = showUpgradeModal('星枢工具引擎 · 一键准备')
      try {
        _loading = true
        modal.setProgress(10)
        modal.appendLog('开始检测 Python、pip、setuptools、wheel 和 cli-anything-hub。')
        modal.appendLog('售卖版策略：不静默安装系统级 Python；不隐藏第三方软件依赖；默认关闭 CLI-Hub analytics。')
        const res = await api.cliAnythingInstall()
        modal.setProgress(85)
        ;(res?.steps || []).forEach(step => modal.appendLog(`完成：${step}`))
        modal.setDone('工具引擎已准备完成')
        toast('工具引擎已准备完成', 'success')
      } catch (e) {
        const msg = e?.message || e
        modal.appendLog(`失败：${msg}`)
        modal.setError(`工具引擎准备失败：${msg}`)
        toast(msg, 'error', { duration: 8000 })
      } finally {
        _loading = false
        await refresh(_query)
      }
    }
    if (action === 'install-tool') {
      const name = btn.dataset.name
      const tool = findTool(name)
      if (!confirmToolInstall(tool, name)) return
      const modal = showUpgradeModal(`安装 CLI 工具：${name}`)
      try {
        _loading = true
        modal.setProgress(12)
        modal.appendLog(`工具：${tool?.displayName || name}`)
        modal.appendLog(`用途：${cnDescription(tool)}`)
        modal.appendLog(`依赖：${tool?.requires || '未声明'}`)
        modal.appendLog('即将通过 cli-hub install 安装。第三方软件本体不会被静默安装，缺失时会在日志里提示。')
        const res = await api.cliAnythingInstallTool(name)
        modal.setProgress(85)
        modal.appendLog(res?.output || '安装命令执行完成')
        if (res?.installed === false) {
          throw new Error('安装命令已执行，但未检测到工具已安装。请查看日志或点击“重新安装”。')
        }
        modal.setDone(`工具 ${name} 安装完成`)
        toast(`工具 ${name} 安装完成`, 'success')
      } catch (e) {
        const msg = e?.message || e
        modal.appendLog(`失败：${msg}`)
        modal.setError(`工具安装失败：${msg}`)
        toast(msg, 'error', { duration: 8000 })
      } finally {
        _loading = false
        await refresh(_query)
      }
    }
    if (action === 'uninstall-tool') {
      const name = btn.dataset.name
      const tool = findTool(name)
      if (!confirmToolUninstall(tool, name)) return
      const modal = showUpgradeModal(`卸载 CLI 工具：${name}`)
      try {
        _loading = true
        modal.setProgress(20)
        modal.appendLog(`准备卸载：${tool?.displayName || name}`)
        const res = await api.cliAnythingUninstallTool(name)
        modal.setProgress(90)
        modal.appendLog(res?.output || '卸载命令执行完成')
        if (res?.installed) {
          throw new Error(`卸载命令已执行，但仍检测到 ${res.installedPackage || name} 存在。请查看日志后重试。`)
        }
        modal.setDone(`工具 ${name} 已卸载`)
        toast(`工具 ${name} 已卸载`, 'success')
      } catch (e) {
        const msg = e?.message || e
        modal.appendLog(`失败：${msg}`)
        modal.setError(`工具卸载失败：${msg}`)
        toast(msg, 'error', { duration: 8000 })
      } finally {
        _loading = false
        await refresh(_query)
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
        modal.appendLog('正在执行 cli-hub matrix preflight --json。')
        const res = await api.cliAnythingMatrixPreflight(name)
        modal.setProgress(90)
        modal.appendLog(JSON.stringify(res?.output || {}, null, 2).slice(0, 6000))
        modal.setDone('矩阵预检完成，请按缺口安装，不要盲目全量安装。')
      } catch (e) {
        const msg = e?.message || e
        modal.appendLog(`失败：${msg}`)
        modal.setError(`矩阵预检失败：${msg}`)
      }
    }
  })
}

export async function render() {
  _page = document.createElement('div')
  _page.innerHTML = '<div id="cli-anything-body"><div class="ca-working">正在加载星枢工具生态中心…</div></div>'
  bindEvents(_page)
  setTimeout(() => refresh(''), 0)
  return _page
}
