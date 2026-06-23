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
      <div class="om-card danger">
        <div class="om-card-label">许可证</div>
        <div class="om-card-value small">AGPL-3.0</div>
        <div class="om-card-meta">外部连接器模式，不内置源码</div>
      </div>
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
        <button class="btn btn-primary" data-action="open-studio" ${!s.installed || !s.remotionReady || _loading ? 'disabled' : ''}>打开视频工作台</button>
        <button class="btn btn-secondary" data-action="install-nodeps" ${_loading ? 'disabled' : ''}>只克隆源码</button>
        <button class="btn btn-secondary" data-action="open-folder" ${!s.installed || _loading ? 'disabled' : ''}>打开目录</button>
        <button class="btn btn-secondary" data-action="refresh" ${_loading ? 'disabled' : ''}>刷新状态</button>
      </div>
      <div class="om-note">安装位置：<code>${esc(s.path || '')}</code></div>
    </div>

    <div class="om-section">
      <h2>怎么用</h2>
      <ol class="om-steps">
        <li>先点「更新 / 修复安装」，确保 Python 依赖和 Remotion 依赖都已安装。</li>
        <li>点「打开视频工作台」，会启动 OpenMontage 的 Remotion Studio：<code>http://localhost:3000</code>。</li>
        <li>要让 AI 帮你完整制作视频，点「打开目录」，把需求交给 OpenClaw / Codex / Cursor，让它读取 <code>AGENT_GUIDE.md</code> 和 <code>pipeline_defs</code> 后执行。</li>
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
