import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'
import { showUpgradeModal } from '../components/modal.js'
import { navigate } from '../router.js'

let _page = null
let _status = null
let _catalog = []
let _query = ''
let _loading = false

const ECOM_AGENT_SESSION = 'agent:ecom-mover'
const ECOM_AGENT_NAME = '电商专属工作流'
const TOOL_NAME_ZH = {
  JumpServer: '堡垒机管理',
  OpenRefine: '数据清洗',
  'CC Switch': '编码工具配置管理',
  WireMock: '接口模拟服务',
  NSLogger: '苹果日志采集',
  AnyGen: '云端内容生成',
}
const CATEGORY_ZH = {
  devops: '运维',
  database: '数据库',
  testing: '测试',
  generation: '生成',
  ecommerce: '电商',
  browser: '浏览器',
  office: '办公',
  image: '图像',
  video: '视频',
  uncategorized: '未分类',
}
const SOURCE_ZH = {
  harness: '内置适配',
  public: '公开命令',
  local: '本地命令',
  official: '官方工具',
}

function isCodeBrowserTool(tool) {
  const haystack = [
    tool?.name,
    tool?.displayName,
    tool?.category,
    tool?.description,
    tool?.entryPoint,
  ].map(v => String(v || '').toLowerCase()).join(' ')
  return /browser|chrome|chromium|playwright|selenium|puppeteer|cdp|auto[- ]?browser|web[- ]?automation/.test(haystack)
}

function browserControlBadge(tool) {
  if (!isCodeBrowserTool(tool)) return ''
  return '<div class="ca-browser-badge">代码级操控浏览器 · 电商专属 Agent 必用</div>'
}

function cnCategory(value) {
  return CATEGORY_ZH[String(value || '').toLowerCase()] || value || '未分类'
}

function cnSource(value) {
  return SOURCE_ZH[String(value || '').toLowerCase()] || value || '内置适配'
}

function cnToolName(tool) {
  return TOOL_NAME_ZH[tool?.displayName] || TOOL_NAME_ZH[tool?.name] || tool?.displayName || tool?.name || '未命名工具'
}

function cnRequires(text) {
  const value = String(text || '').trim()
  if (!value) return '未声明'
  return value
    .replace(/installed with active database/ig, '已安装并有可用数据库')
    .replace(/running as a local web server/ig, '本机服务正在运行')
    .replace(/or newer/ig, '或更新版本')
    .replace(/server running/ig, '服务正在运行')
    .replace(/macOS for native Bonjour live capture/ig, 'macOS 原生 Bonjour 实时采集')
    .replace(/Python 3\.10\+/ig, 'Python 3.10+')
    .replace(/ANYGEN_API_KEY/g, 'AnyGen API 密钥')
}

function cnDescription(tool) {
  const name = tool?.displayName || tool?.name || ''
  const desc = String(tool?.description || '').trim()
  const known = {
    JumpServer: '通过 JumpServer 接口管理资产、用户、权限、会话、账号和审计日志。',
    OpenRefine: '把 OpenRefine 接入 Agent 流程，用于数据导入、清洗、检查、导出和操作历史回滚。',
    'CC Switch': '管理 AI 编程工具配置，检查供应商、技能、MCP 服务、用量统计和代理设置。',
    WireMock: '管理 HTTP 模拟服务：创建桩、检查请求、录制流量并维护测试场景。',
    NSLogger: '采集、解析、筛选、导出并镜像 iOS / macOS 日志。',
    AnyGen: '通过 AnyGen 云接口生成文档、幻灯片、网站等内容。',
  }
  if (known[name]) return known[name]
  if (!desc) return '该工具暂未提供中文说明。请先查看依赖和入口，再交给 Agent 判断是否适合当前任务。'
  if (/^[\x00-\x7F\s.,;:()/_+\-—]+$/.test(desc)) {
    return '该工具来自 CLI-Anything 目录，原始说明为英文。星枢会保留入口和依赖信息，具体用途请交给专属 Agent 进一步判断。'
  }
  return desc
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))
}

function badge(ok, yes = '可用', no = '缺失') {
  return `<span class="ca-badge ${ok ? 'ok' : 'warn'}">${ok ? yes : no}</span>`
}

function shortText(text, max = 120) {
  const value = String(text || '')
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function buildAgentPrompt(tool = null) {
  const target = tool ? `${tool.displayName || tool.name}（${tool.name}）` : 'CLI-Anything 工具中心'
  return `你是星枢 CLI-Anything 工具中枢专用 Agent。请和当前星枢面板深度协作，目标是把外部专业软件通过 CLI 变成可控工具，而不是让新手直接面对命令行。

当前任务目标：${target}

工作规则：
1. 先确认用户真实目标，区分“安装工具”“调用工具完成任务”“生成工作流”“排查依赖”。
2. 使用 CLI-Anything 前必须先做环境检查：Python、pip、cli-hub、目标软件本体、目标 CLI entry point。
3. 默认关闭 analytics：运行 cli-hub / 子 CLI 时带 CLI_HUB_NO_ANALYTICS=1。
4. 安装任何工具前，先向用户说明来源、安装命令、依赖、是否需要第三方软件、是否会联网。
5. 涉及删除、付款、发送消息、外部提交、批量写入时必须二次确认。
6. 优先要求 JSON 输出；如果 CLI 不支持 JSON，要说明解析策略。
7. 失败时返回：命令、退出码、stdout/stderr 摘要、下一步修复建议。

可用协作方式：
- 星枢面板负责安装/搜索/预检。
- Agent 负责拆解任务、选择工具、组织命令、解释结果。
- 对电商任务，必须和“电商专属工作流 Agent”协同：商品资料、图片处理、标题生成、上架检查、竞品/评价分析都要形成可追踪步骤。

请先用新手能看懂的话问我：我要处理的软件/平台是什么、目标产物是什么、是否允许安装依赖。`
}

function buildEcommercePrompt(tool = null) {
  return `你是电商专属工作流 Agent，现在需要和星枢 CLI-Anything 工具中枢协同工作。

协同目标：用 CLI-Anything 把外部工具能力接入电商流水线，减少手工点击，提高批量处理速度。
${tool ? `候选工具：${tool.displayName || tool.name}（${tool.name}）\n用途：${tool.description || ''}\n依赖：${tool.requires || '未声明'}\n` : ''}

电商工作流要求：
1. 先识别任务类型：商品图处理、视频素材、标题/卖点、竞品数据、评论分析、表格清洗、店铺后台自动化。
2. 再选择 CLI 工具：图片类优先 GIMP/Imagemagick 类，视频类优先 Kdenlive/Shotcut/VideoCaptioner，文档表格优先 LibreOffice/OpenRefine，知识资料优先 Obsidian/Joplin/Zotero。
3. 每一步都输出：输入文件、执行命令、输出文件、质量检查项、失败回滚方案。
4. 不允许未经确认就提交上架、删除商品、群发消息、付款或修改线上店铺。
5. 需要浏览器后台时，必须优先选择标注“代码级操控浏览器”的工具（CDP / Playwright / Selenium / Puppeteer / Chrome 自动化），用于打开网页、点击、填表、截图、读取 DOM 和验收页面状态。
6. 需要本地专业软件时，交给 CLI-Anything 工具中枢；工具中枢只准备能力，最终编排由电商专属 Agent 内部完成。

请先给我一套“电商任务拆解清单”，并说明你要调用哪些 CLI 工具、是否需要先安装依赖。`
}

function renderProtocolLink() {
  return `
    <div class="ca-protocol">
      <div class="ca-protocol-node hub">
        <span>工具中枢</span>
        <strong>安装 / 搜索 / 预检 CLI 工具</strong>
        <em>只负责把外部软件能力准备好；其中“代码级操控浏览器”是电商后台自动化的关键能力</em>
      </div>
      <div class="ca-protocol-arrow">协议通信 →</div>
      <div class="ca-protocol-node agent">
        <span>专属 Agent</span>
        <strong>${ECOM_AGENT_NAME}</strong>
        <em>内部编排商品资料、图片、标题、上架检查、子 Agent 协作</em>
      </div>
      <button class="btn btn-primary" data-action="open-ecom-agent">进入专属 Agent</button>
    </div>
  `
}

function renderStatus() {
  const s = _status || {}
  return `
    <div class="ca-hero">
      <div class="ca-hero-main">
        <div>
          <div class="ca-kicker">CLI-Anything · Agent 原生工具中枢</div>
          <h1>AI 工具中枢</h1>
          <p>这里不是单独的英文工具列表，而是给 Agent 准备工具能力的中转站。普通工具由星枢安装和预检；电商任务通过协议交给已创建的“${ECOM_AGENT_NAME}”做内部联动和任务编排。</p>
        </div>
        <div class="ca-hero-actions">
          <button class="btn btn-primary" data-action="install" ${_loading ? 'disabled' : ''}>自动安装 / 修复依赖</button>
          <button class="btn btn-secondary" data-action="refresh" ${_loading ? 'disabled' : ''}>刷新状态</button>
        </div>
      </div>
      ${renderProtocolLink()}
    </div>

    <div class="ca-grid">
      <div class="ca-card primary"><span>CLI-Hub</span><strong>${s.cliHubAvailable ? '已安装' : '未安装'}</strong><em>${esc(s.cliHubVersion || s.cliHubPath || '')}</em></div>
      <div class="ca-card"><span>Python</span><strong>${s.pythonAvailable ? '可用' : '缺失'}</strong><em>${esc(s.pythonVersion || s.pythonPath || '')}</em></div>
      <div class="ca-card"><span>pip</span><strong>${s.pipAvailable ? '可用' : '缺失'}</strong><em>自动补齐 pip / wheel / setuptools</em></div>
      <div class="ca-card"><span>工具总数</span><strong>${Number(s.catalogTotal || 0)}</strong><em>${Number(s.harnessCount || 0)} 原生 · ${Number(s.publicCount || 0)} 公开 CLI</em></div>
      <div class="ca-card ${s.matrixAvailable ? 'safe' : ''}"><span>工作流矩阵</span><strong>${s.matrixAvailable ? '可用' : '需修复'}</strong><em>${s.matrixAvailable ? '支持 matrix preflight/install 能力包' : '请点击自动安装 / 修复依赖获取 GitHub 最新版'}</em></div>
      <div class="ca-card safe"><span>隐私</span><strong>Analytics 关闭</strong><em>所有命令默认 CLI_HUB_NO_ANALYTICS=1</em></div>
    </div>
  `
}

function renderGuide() {
  return `
    <div class="ca-section">
      <h2>新手使用步骤</h2>
      <div class="ca-steps">
        <div><b>1. 自动安装</b><span>点击“自动安装 / 修复依赖”，星枢会检测 Python、修复 pip，并安装/升级 cli-anything-hub。</span></div>
        <div><b>2. 搜索工具</b><span>输入“视频、图片、办公、浏览器、表格、电商”等中文关键词，星枢会把工具用途转成新手能看懂的中文说明。</span></div>
        <div><b>3. 查看依赖</b><span>每个工具会显示 requires。很多 CLI 需要目标软件本体，例如 GIMP/Blender/LibreOffice。</span></div>
        <div><b>4. 安装工具</b><span>点击工具卡片的安装按钮，星枢会显示安装日志；失败会保留错误原因，方便 Agent 修复。</span></div>
        <div><b>5. 协议联动</b><span>电商任务不要在工具卡片里硬做；工具中枢通过协议把候选工具、依赖和任务目标交给“${ECOM_AGENT_NAME}”内部联动。</span></div>
        <div><b>6. 浏览器操控</b><span>凡是能用代码打开网页、点击、填表、截图、读取 DOM、走 CDP/Playwright/Selenium 的工具，都会标注“代码级操控浏览器”，电商专属 Agent 优先使用。</span></div>
      </div>
    </div>

    <div class="ca-section ca-examples">
      <h2>示例提示词</h2>
      <div><code>帮我搜索适合批量处理商品图的 CLI 工具，并给出安装方案。</code></div>
      <div><code>用 CLI-Anything 联动电商 Agent，把一批商品图压缩、裁切、生成主图检查报告。</code></div>
      <div><code>查找视频字幕/剪辑相关工具，安装后给我生成一个短视频处理流水线。</code></div>
      <div><code>帮我把 LibreOffice / OpenRefine 接入表格清洗流程，用 JSON 输出每一步结果。</code></div>
    </div>
  `
}

function renderMatrix() {
  const matrices = [
    ['video-creation', '视频创作矩阵', '字幕、剪辑、生成、渲染、视频流水线'],
    ['image-design', '图像设计矩阵', '图片生成、编辑、批处理、素材检查'],
    ['3d-cad', '3D / CAD 矩阵', 'FreeCAD、Blender、建模与导出'],
    ['game-development', '游戏开发矩阵', 'Godot、调试、资产与项目自动化'],
    ['knowledge-research', '知识研究矩阵', 'Obsidian、Joplin、Zotero、资料整理'],
  ]
  return `
    <div class="ca-section">
      <h2>工作流矩阵</h2>
      <p class="ca-note">矩阵不是单个工具，而是一组面向任务的能力包。先预检，再按缺口安装，避免一口气装一堆无关依赖。</p>
      <div class="ca-matrix-grid">
        ${matrices.map(([id, title, desc]) => `
          <div class="ca-matrix-card">
            <strong>${esc(title)}</strong>
            <span>${esc(desc)}</span>
            <button class="btn btn-secondary" data-action="matrix" data-name="${esc(id)}" ${_status?.matrixAvailable ? '' : 'disabled'}>预检 ${esc(id)}</button>
          </div>
        `).join('')}
      </div>
    </div>
  `
}

function renderCatalog() {
  return `
    <div class="ca-section">
      <div class="ca-section-head">
        <div><h2>工具搜索与安装</h2><p>支持 CLI-Hub 原生工具和公开 CLI。搜索结果最多显示 80 个；带“代码级操控浏览器”标识的工具，是电商专属 Agent 处理后台页面、商品采集、自动填表和截图验收时优先使用的能力。</p></div>
        <form class="ca-search" data-action="search-form">
          <input id="ca-search-input" value="${esc(_query)}" placeholder="搜索：视频 / 图片 / 浏览器 / 办公 / 表格 / 电商" />
          <button class="btn btn-primary" type="submit">搜索</button>
        </form>
      </div>
      <div class="ca-catalog">
        ${_catalog.length ? _catalog.map(renderTool).join('') : '<div class="ca-empty">暂无工具列表。请先安装 CLI-Hub，或点击搜索。</div>'}
      </div>
    </div>
  `
}

function renderTool(tool) {
  return `
    <div class="ca-tool-card">
      <div class="ca-tool-head">
        <div><strong>${esc(cnToolName(tool))}</strong><span>${esc(tool.name)} · ${esc(cnCategory(tool.category))}</span></div>
        <span class="ca-source">${esc(cnSource(tool.source))}</span>
      </div>
      ${browserControlBadge(tool)}
      <p>${esc(shortText(cnDescription(tool), 180))}</p>
      <div class="ca-tool-meta"><b>依赖：</b>${esc(cnRequires(tool.requires))}</div>
      <div class="ca-tool-meta"><b>命令入口：</b><code>${esc(tool.entryPoint || '')}</code></div>
      <div class="ca-tool-actions">
        <button class="btn btn-primary" data-action="install-tool" data-name="${esc(tool.name)}">安装工具</button>
        <button class="btn btn-secondary" data-action="agent" data-name="${esc(tool.name)}">交给通用 Agent</button>
        <button class="btn btn-secondary ca-ecom-btn" data-action="ecommerce" data-name="${esc(tool.name)}">交给电商专属 Agent</button>
      </div>
    </div>
  `
}

function renderContent() {
  return `
    <div class="cli-anything-page">
      ${renderStatus()}
      ${renderGuide()}
      ${renderMatrix()}
      ${renderCatalog()}
    </div>
  `
}

function findTool(name) {
  return _catalog.find(item => item.name === name) || null
}

async function loadStatus() {
  _status = await api.cliAnythingStatus()
}

function normalizeSearchQuery(query) {
  const value = String(query || '').trim()
  const map = {
    电商: 'ecommerce',
    商城: 'ecommerce',
    商品: 'ecommerce',
    图片: 'image',
    图像: 'image',
    视频: 'video',
    剪辑: 'video',
    浏览器: 'browser',
    网页: 'browser',
    办公: 'office',
    表格: 'office',
    数据: 'data',
    设计: 'design',
    文档: 'document',
  }
  return map[value] || value
}

async function loadCatalog(query = _query) {
  if (!_status?.cliHubAvailable) {
    _catalog = []
    return
  }
  const res = await api.cliAnythingCatalog(normalizeSearchQuery(query || ''))
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
    body.innerHTML = `<div class="ca-error">CLI-Anything 状态加载失败：${esc(e?.message || e)}</div>`
  }
}

function confirmToolInstall(tool, name) {
  const lines = [
    `即将安装 CLI 工具：${tool?.displayName || name}（${name}）`,
    `来源：${tool?.source || 'harness'}`,
    `分类：${tool?.category || '未声明'}`,
    `依赖：${tool?.requires || '未声明'}`,
    `入口：${tool?.entryPoint || '未声明'}`,
  ]
  if (tool?.installCmd) lines.push(`安装命令：${tool.installCmd}`)
  lines.push('', 'cli-hub install 可能执行 pip / npm / uv 或其他 shell 安装命令。请确认你允许星枢继续安装该工具。')
  return window.confirm(lines.join('\n'))
}

function openAgent(prompt, message, session = '') {
  try {
    localStorage.setItem('cliAnything.chatDraft', prompt)
    toast(message, 'success')
    if (session) {
      location.hash = `#/chat?session=${encodeURIComponent(session)}`
    } else {
      navigate('/chat')
    }
  } catch (e) {
    toast(e?.message || e, 'error', { duration: 6000 })
  }
}

function bindEvents(page) {
  page.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-action="search-form"]')
    if (!form) return
    event.preventDefault()
    _query = page.querySelector('#ca-search-input')?.value?.trim() || ''
    await refresh(_query)
  })

  page.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-action]')
    if (!btn || _loading) return
    const action = btn.dataset.action
    if (action === 'refresh') return refresh(_query)
    if (action === 'install') {
      const modal = showUpgradeModal('CLI-Anything 自动安装 / 修复依赖')
      try {
        _loading = true
        modal.setProgress(10)
        modal.appendLog('开始检测 Python、pip、setuptools、wheel 和 cli-anything-hub。')
        modal.appendLog('隐私保护：安装和调用默认关闭 CLI-Hub analytics。')
        const res = await api.cliAnythingInstall()
        modal.setProgress(85)
        ;(res?.steps || []).forEach(step => modal.appendLog(`完成：${step}`))
        modal.setDone('CLI-Anything 工具中心依赖已准备完成')
        toast('CLI-Anything 依赖已准备完成', 'success')
      } catch (e) {
        const msg = e?.message || e
        modal.appendLog(`失败：${msg}`)
        modal.setError(`CLI-Anything 安装失败：${msg}`)
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
        modal.appendLog(`依赖：${tool?.requires || '未声明'}`)
        modal.appendLog('即将通过 cli-hub install 安装。第三方软件本体不会被静默安装，缺失时会在日志里提示。')
        const res = await api.cliAnythingInstallTool(name)
        modal.setProgress(85)
        modal.appendLog(res?.output || '安装命令执行完成')
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
    if (action === 'open-ecom-agent') {
      openAgent(buildEcommercePrompt(), '已切换到电商专属 Agent 协议通信', ECOM_AGENT_SESSION)
    }
    if (action === 'agent') {
      openAgent(buildAgentPrompt(findTool(btn.dataset.name)), '已生成 CLI-Anything Agent 联动提示词')
    }
    if (action === 'ecommerce') {
      openAgent(buildEcommercePrompt(findTool(btn.dataset.name)), '已交给电商专属 Agent 内部联动', ECOM_AGENT_SESSION)
    }
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
  _page.innerHTML = '<div id="cli-anything-body"><div class="ca-working">正在加载 CLI-Anything 工具中心…</div></div>'
  bindEvents(_page)
  setTimeout(() => refresh(''), 0)
  return _page
}
