import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'

let _page = null
let _status = null
let _loading = false

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))
}

function yes(value) {
  return value ? '<span class="om-badge ok">可用</span>' : '<span class="om-badge warn">缺失</span>'
}

function modeBadge(value) {
  if (value === 'native') return '<span class="om-badge ok">原生完整模式</span>'
  if (value === 'windows-arm64-x64-node') return '<span class="om-badge ok">Windows ARM64 · x64 Node 模式</span>'
  if (value === 'windows-arm64-needs-x64-node') return '<span class="om-badge warn">需准备 x64 Node</span>'
  return `<span class="om-badge warn">${esc(value || '未知')}</span>`
}

function providerList(items = []) {
  if (!items.length) return '<div class="om-provider-empty">未检测到 OpenMontage TTS provider 文件</div>'
  return items.map(item => `
    <div class="om-provider ${item.available ? 'ok' : 'warn'}">
      <span>${esc(item.name)}</span>
      ${yes(item.available)}
    </div>
  `).join('')
}

function toolCheck(label, available, path, version) {
  return `
    <div class="om-tool ${available ? 'ok' : 'warn'}">
      <div class="om-tool-row"><span>${esc(label)}</span>${yes(available)}</div>
      <div class="om-tool-path">${available ? esc(path || version || '已从全局路径检测到') : '未在系统 PATH / 用户 PATH / 常见安装目录中找到'}</div>
    </div>
  `
}

function statusText() {
  if (!_status) return '检测中'
  return _status.installed ? '已连接' : '未安装'
}

function renderStatus() {
  const s = _status || {}
  return `
    <div class="om-grid">
      <div class="om-card primary">
        <div class="om-card-label">连接状态</div>
        <div class="om-card-value">${esc(statusText())}</div>
        <div class="om-card-meta">${esc(s.path || '')}</div>
      </div>
      <div class="om-card">
        <div class="om-card-label">Pipeline</div>
        <div class="om-card-value">${Number(s.pipelineCount || 0)}</div>
        <div class="om-card-meta">视频生产流水线模板</div>
      </div>
      <div class="om-card">
        <div class="om-card-label">版本</div>
        <div class="om-card-value small">${esc(s.commit || '未安装')}</div>
        <div class="om-card-meta">OpenMontage HEAD</div>
      </div>
      <div class="om-card ${s.completeOpenMontageReady ? 'primary' : 'danger'}">
        <div class="om-card-label">完整模式</div>
        <div class="om-card-value small">${s.completeOpenMontageReady ? '可用' : '未就绪'}</div>
        <div class="om-card-meta">渲染运行时 + OpenMontage TTS</div>
      </div>
      <div class="om-card danger">
        <div class="om-card-label">许可证</div>
        <div class="om-card-value small">AGPL-3.0</div>
        <div class="om-card-meta">外部连接器模式，不内置源码</div>
      </div>
    </div>

    <div class="om-section">
      <h2>完整 OpenMontage 能力</h2>
      <div class="om-capability">
        <div>
          <strong>平台</strong>
          <div class="om-note compact">${esc(s.os || '')} / ${esc(s.arch || '')}</div>
        </div>
        <div>
          <strong>渲染运行时</strong>
          <div>${modeBadge(s.runtimeMode)}</div>
          <div class="om-note compact">${s.renderRuntimePath ? esc(s.renderRuntimePath) : '使用系统原生 Node.js / npm'}</div>
        </div>
        <div>
          <strong>正式完成条件</strong>
          <div>${yes(s.completeOpenMontageReady)}</div>
          <div class="om-note compact">禁止用系统 TTS / FFmpeg 低配兜底冒充 OpenMontage 成片。</div>
        </div>
      </div>
      <div class="om-note">Windows ARM64 会自动准备 Windows x64 Node 运行时，让 Remotion 按 x64 链路工作；其他平台优先使用原生 Node.js。</div>
    </div>

    <div class="om-section">
      <h2>OpenMontage 配音 Provider</h2>
      <div class="om-providers">${providerList(s.ttsProviders || [])}</div>
      <div class="om-note">配音必须走 OpenMontage 的 TTS selector/provider：ElevenLabs、OpenAI、Google TTS、Doubao 或 Piper。没有可用 provider 时，应提示缺失，不能降级成本机系统 TTS。</div>
    </div>

    <div class="om-section">
      <h2>环境检测</h2>
      <div class="om-checks">
        ${toolCheck('Git', s.gitAvailable, s.gitPath, s.gitVersion)}
        ${toolCheck('Python', s.pythonAvailable, s.pythonPath, s.pythonVersion)}
        ${toolCheck('Node.js', s.nodeAvailable, s.nodePath, s.nodeVersion)}
        ${toolCheck('npm', s.npmAvailable, s.npmPath, s.npmVersion)}
        ${toolCheck('uv', s.uvAvailable, s.uvPath, s.uvVersion)}
        ${toolCheck('FFmpeg', s.ffmpegAvailable, s.ffmpegPath, s.ffmpegVersion)}
      </div>
      <div class="om-note">检测会读取当前进程 PATH、Windows 用户/系统全局 PATH、npm/Git/Node/WinGet 等常见安装目录。安装后无需重启应用也能重新扫描。</div>
    </div>

    <div class="om-section">
      <h2>可执行操作</h2>
      <div class="om-actions">
        <button class="btn btn-primary" data-action="install" ${_loading ? 'disabled' : ''}>${s.installed ? '更新 / 修复安装' : '安装 OpenMontage'}</button>
        <button class="btn btn-secondary" data-action="prepare-runtime" ${_loading ? 'disabled' : ''}>准备完整渲染运行时</button>
        <button class="btn btn-primary" data-action="open-studio" ${!s.installed || !s.remotionReady || !s.renderRuntimeReady || _loading ? 'disabled' : ''}>打开视频工作台</button>
        <button class="btn btn-secondary" data-action="install-nodeps" ${_loading ? 'disabled' : ''}>只克隆源码</button>
        <button class="btn btn-secondary" data-action="open-folder" ${!s.installed || _loading ? 'disabled' : ''}>打开目录</button>
        <button class="btn btn-secondary" data-action="refresh" ${_loading ? 'disabled' : ''}>刷新状态</button>
      </div>
      <div class="om-note">安装位置：<code>${esc(s.path || '')}</code></div>
    </div>

    <div class="om-section">
      <h2>怎么用</h2>
      <ol class="om-steps">
        <li>先点「更新 / 修复安装」，确保 Python 依赖、OpenMontage TTS 工具和 Remotion 依赖都已安装。</li>
        <li>如果是 Windows ARM64，点「准备完整渲染运行时」，系统会准备 x64 Node，让 Remotion 使用完整 x64 渲染链路。</li>
        <li>确认「完整模式」显示可用后，再点「打开视频工作台」，启动 OpenMontage 的 Remotion Studio：<code>http://localhost:3000</code>。</li>
        <li>配音必须配置 OpenMontage TTS provider；缺 key 时只提示缺失，不再用系统 TTS 冒充正式成片。</li>
        <li>示例需求：<code>用 OpenMontage 制作一个 60 秒产品宣传片，中文旁白，输出 mp4。</code></li>
      </ol>
    </div>
  `
}

async function loadStatus() {
  const body = _page?.querySelector('#openmontage-body')
  if (!body) return
  try {
    _status = await api.openmontageStatus()
    body.innerHTML = renderStatus()
  } catch (e) {
    body.innerHTML = `<div class="om-error">OpenMontage 状态检测失败：${esc(e?.message || e)}</div>`
  }
}

async function install(installDeps) {
  if (_loading) return
  _loading = true
  const body = _page.querySelector('#openmontage-body')
  body.innerHTML = `<div class="om-working">正在${installDeps ? '安装 OpenMontage 并初始化依赖' : '克隆 OpenMontage'}，请稍等…</div>`
  try {
    const res = await api.openmontageInstall(Boolean(_status?.installed), installDeps)
    toast.success(`OpenMontage 已准备完成：${res.commit || ''}`)
  } catch (e) {
    toast.error(`OpenMontage 安装失败：${e?.message || e}`)
  } finally {
    _loading = false
    await loadStatus()
  }
}

function bindEvents(page) {
  page.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-action]')
    if (!btn) return
    const action = btn.dataset.action
    if (action === 'refresh') await loadStatus()
    if (action === 'install') await install(true)
    if (action === 'prepare-runtime') {
      try {
        _loading = true
        const body = _page.querySelector('#openmontage-body')
        body.innerHTML = '<div class="om-working">正在准备完整 OpenMontage 渲染运行时，请稍等…</div>'
        const res = await api.openmontagePrepareRuntime()
        toast.success(`渲染运行时已准备：${res?.runtimeMode || ''}`)
      } catch (e) { toast.error(e?.message || e) }
      finally { _loading = false; await loadStatus() }
    }
    if (action === 'install-nodeps') await install(false)
    if (action === 'open-studio') {
      try {
        const res = await api.openmontageOpenStudio()
        toast.success(`视频工作台已启动：${res?.url || 'http://localhost:3000'}`)
      } catch (e) { toast.error(e?.message || e) }
    }
    if (action === 'open-folder') {
      try { await api.openmontageOpenFolder() } catch (e) { toast.error(e?.message || e) }
    }
  })
}

export async function render() {
  const page = document.createElement('div')
  page.className = 'page openmontage-page'
  page.innerHTML = `
    <div class="page-header om-hero">
      <div>
        <h1 class="page-title">OpenMontage 视频工厂</h1>
        <p class="page-desc">外部连接 OpenMontage：AI 视频生产、Remotion 合成、素材流水线与 Pipeline 模板。</p>
      </div>
      <a class="btn btn-secondary btn-sm" href="https://github.com/calesthio/OpenMontage" target="_blank" rel="noopener">查看上游</a>
    </div>
    <div class="om-license-warning">
      <strong>安全集成说明：</strong>OpenMontage 使用 AGPL-3.0。这里采用外部安装/连接器模式，不把 AGPL 源码内置进售卖版安装包。
    </div>
    <div id="openmontage-body"><div class="om-working">正在检测 OpenMontage 状态…</div></div>
  `
  _page = page
  bindEvents(page)
  await loadStatus()
  return page
}
