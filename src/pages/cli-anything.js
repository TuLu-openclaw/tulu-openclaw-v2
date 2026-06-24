import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'
import { showUpgradeModal } from '../components/modal.js'
import { navigate } from '../router.js'

let _page = null
let _status = null
let _catalog = []
let _query = ''
let _loading = false

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
5. 需要浏览器后台时，交给浏览器深控/CDP 模块；需要本地专业软件时，交给 CLI-Anything 工具中枢。

请先给我一套“电商任务拆解清单”，并说明你要调用哪些 CLI 工具、是否需要先安装依赖。`
}

function renderStatus() {
  const s = _status || {}
  return `
    <div class="ca-hero">
      <div>
        <div class="ca-kicker">CLI-Anything · Agent-Native Software Hub</div>
        <h1>AI 工具中枢</h1>
        <p>把 Blender、GIMP、LibreOffice、Obsidian、Kdenlive、FreeCAD 等专业软件变成 Agent 可调用的命令行能力。星枢负责安装、预检、日志和新手引导，Agent 负责拆解任务和调用工具。</p>
      </div>
      <div class="ca-hero-actions">
        <button class="btn btn-primary" data-action="install" ${_loading ? 'disabled' : ''}>自动安装 / 修复依赖</button>
        <button class="btn btn-secondary" data-action="refresh" ${_loading ? 'disabled' : ''}>刷新状态</button>
      </div>
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
        <div><b>2. 搜索工具</b><span>输入 video、image、office、browser、obsidian、blender、ecommerce 等关键词，查看工具用途和依赖。</span></div>
        <div><b>3. 查看依赖</b><span>每个工具会显示 requires。很多 CLI 需要目标软件本体，例如 GIMP/Blender/LibreOffice。</span></div>
        <div><b>4. 安装工具</b><span>点击工具卡片的安装按钮，星枢会显示安装日志；失败会保留错误原因，方便 Agent 修复。</span></div>
        <div><b>5. 联动 Agent</b><span>点击“交给 Agent”或“电商工作流”，自动填入详细提示词，让 Agent 按安全步骤调用工具。</span></div>
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
        <div><h2>工具搜索与安装</h2><p>支持 CLI-Hub 原生工具和公开 CLI。搜索结果最多显示 80 个，避免新手被长列表淹没。</p></div>
        <form class="ca-search" data-action="search-form">
          <input id="ca-search-input" value="${esc(_query)}" placeholder="搜索：video / image / browser / office / obsidian / ecommerce" />
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
        <div><strong>${esc(tool.displayName || tool.name)}</strong><span>${esc(tool.name)} · ${esc(tool.category || 'uncategorized')}</span></div>
        <span class="ca-source">${esc(tool.source || 'harness')}</span>
      </div>
      <p>${esc(shortText(tool.description, 180))}</p>
      <div class="ca-tool-meta"><b>依赖：</b>${esc(tool.requires || '未声明')}</div>
      <div class="ca-tool-meta"><b>入口：</b><code>${esc(tool.entryPoint || '')}</code></div>
      <div class="ca-tool-actions">
        <button class="btn btn-primary" data-action="install-tool" data-name="${esc(tool.name)}">安装工具</button>
        <button class="btn btn-secondary" data-action="agent" data-name="${esc(tool.name)}">交给 Agent</button>
        <button class="btn btn-secondary" data-action="ecommerce" data-name="${esc(tool.name)}">电商工作流</button>
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

async function loadCatalog(query = _query) {
  if (!_status?.cliHubAvailable) {
    _catalog = []
    return
  }
  const res = await api.cliAnythingCatalog(query || '')
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
    if (action === 'agent') {
      openAgent(buildAgentPrompt(findTool(btn.dataset.name)), '已生成 CLI-Anything Agent 联动提示词')
    }
    if (action === 'ecommerce') {
      openAgent(buildEcommercePrompt(findTool(btn.dataset.name)), '已生成电商工作流 Agent 协同提示词', 'agent:ecom-mover')
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
