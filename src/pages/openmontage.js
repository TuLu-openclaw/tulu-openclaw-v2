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
        <div>Git ${yes(s.gitAvailable)}</div>
        <div>Python ${yes(s.pythonAvailable)}</div>
        <div>Node.js ${yes(s.nodeAvailable)}</div>
        <div>npm ${yes(s.npmAvailable)}</div>
        <div>uv ${yes(s.uvAvailable)}</div>
        <div>FFmpeg ${yes(s.ffmpegAvailable)}</div>
      </div>
      <div class="om-note">FFmpeg 缺失不影响安装，但会影响本地视频渲染/转码。后续完整测试时一起处理。</div>
    </div>

    <div class="om-section">
      <h2>可执行操作</h2>
      <div class="om-actions">
        <button class="btn btn-primary" data-action="install" ${_loading ? 'disabled' : ''}>${s.installed ? '更新 / 修复安装' : '安装 OpenMontage'}</button>
        <button class="btn btn-secondary" data-action="install-nodeps" ${_loading ? 'disabled' : ''}>只克隆源码</button>
        <button class="btn btn-secondary" data-action="open-folder" ${!s.installed || _loading ? 'disabled' : ''}>打开目录</button>
        <button class="btn btn-secondary" data-action="refresh" ${_loading ? 'disabled' : ''}>刷新状态</button>
      </div>
      <div class="om-note">安装位置：<code>${esc(s.path || '')}</code></div>
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
