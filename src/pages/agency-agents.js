/**
 * AI 专家库 — 内置 Agency Agents
 */
import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'
import { showConfirm } from '../components/modal.js'
import { t } from '../lib/i18n.js'

let _activePage = null
let _state = { data: null, query: '', division: 'all' }

const DIVISION_LABELS = {
  academic: '学术研究',
  design: '设计体验',
  engineering: '工程开发',
  finance: '财务金融',
  'game-development': '游戏开发',
  gis: 'GIS 地理空间',
  marketing: '营销增长',
  'paid-media': '付费投放',
  product: '产品管理',
  'project-management': '项目管理',
  sales: '销售增长',
  security: '安全攻防',
  'spatial-computing': '空间计算',
  specialized: '专门领域',
  support: '支持运营',
  testing: '测试质量',
}

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[c]))
}

function divisionLabel(value) {
  return DIVISION_LABELS[value] || value || '未分类'
}

function filteredAgents() {
  const data = _state.data
  if (!data) return []
  const q = _state.query.trim().toLowerCase()
  return (data.agents || []).filter(agent => {
    if (_state.division !== 'all' && agent.division !== _state.division) return false
    if (!q) return true
    const hay = `${agent.name || ''} ${agent.description || ''} ${agent.vibe || ''} ${agent.division || ''}`.toLowerCase()
    return hay.includes(q)
  })
}

function renderStats(data) {
  const installed = (data.agents || []).filter(a => a.installed).length
  const divisions = Object.keys(data.divisions || {}).length
  return `
    <div class="agency-stats">
      <div class="stat-card"><div class="stat-value">${data.total || 0}</div><div class="stat-label">全部专家</div></div>
      <div class="stat-card"><div class="stat-value">${installed}</div><div class="stat-label">已安装</div></div>
      <div class="stat-card"><div class="stat-value">${divisions}</div><div class="stat-label">专业分类</div></div>
      <div class="stat-card"><div class="stat-value">MIT</div><div class="stat-label">可商用授权</div></div>
    </div>
  `
}

function renderDivisionOptions(data) {
  const entries = Object.entries(data.divisions || {})
  return `<option value="all">全部分类</option>${entries.map(([key, info]) => (
    `<option value="${esc(key)}">${esc(divisionLabel(key))}（${Number(info?.count || 0)}）</option>`
  )).join('')}`
}

function renderAgentCard(agent) {
  return `
    <div class="agency-card" data-id="${esc(agent.id)}">
      <div class="agency-card-head">
        <div class="agency-avatar">${esc(agent.emoji || '🤖')}</div>
        <div class="agency-title-wrap">
          <div class="agency-name">${esc(agent.name)}</div>
          <div class="agency-id">${esc(agent.id)}</div>
        </div>
        <span class="badge ${agent.installed ? 'badge-success' : 'badge-secondary'}">${agent.installed ? '已安装' : '未安装'}</span>
      </div>
      <div class="agency-desc">${esc(agent.description)}</div>
      ${agent.vibe ? `<div class="agency-vibe">${esc(agent.vibe)}</div>` : ''}
      <div class="agency-meta">
        <span>${esc(divisionLabel(agent.division))}</span>
        <span>${esc(agent.sourceFile || '')}</span>
      </div>
      <div class="agency-actions">
        <button class="btn btn-sm btn-secondary" data-action="detail" data-id="${esc(agent.id)}">预览</button>
        <button class="btn btn-sm btn-primary" data-action="install" data-id="${esc(agent.id)}">${agent.installed ? '重新安装' : '安装'}</button>
      </div>
    </div>
  `
}

function renderList(page) {
  const data = _state.data
  if (!data) return
  const list = filteredAgents()
  const container = page.querySelector('#agency-list')
  const count = page.querySelector('#agency-count')
  if (count) count.textContent = `当前显示 ${list.length} / ${data.total || 0}`
  container.innerHTML = list.length
    ? list.map(renderAgentCard).join('')
    : '<div class="clawhub-empty" style="padding:var(--space-xl);text-align:center;color:var(--text-tertiary)">没有匹配的专家</div>'
}

async function refresh(page) {
  const content = page.querySelector('#agency-content')
  content.innerHTML = '<div class="stat-card loading-placeholder" style="height:120px"></div>'
  try {
    const data = await api.agencyAgentsList()
    _state.data = data
    content.innerHTML = `
      ${renderStats(data)}
      <div class="clawhub-toolbar agency-toolbar">
        <input class="input" id="agency-search" placeholder="搜索专家、岗位、能力..." value="${esc(_state.query)}" style="flex:1">
        <select class="input input-sm" id="agency-division">${renderDivisionOptions(data)}</select>
        <button class="btn btn-secondary btn-sm" data-action="refresh">刷新</button>
        <button class="btn btn-primary btn-sm" data-action="install-division">安装当前分类</button>
        <button class="btn btn-primary btn-sm" data-action="install-all">安装全部</button>
      </div>
      <div class="agency-count" id="agency-count"></div>
      <div class="agency-grid" id="agency-list"></div>
      <div id="agency-detail"></div>
    `
    const select = page.querySelector('#agency-division')
    select.value = _state.division
    page.querySelector('#agency-search').addEventListener('input', e => {
      _state.query = e.target.value || ''
      renderList(page)
    })
    select.addEventListener('change', e => {
      _state.division = e.target.value || 'all'
      renderList(page)
    })
    renderList(page)
  } catch (e) {
    content.innerHTML = `<div style="color:var(--error);padding:20px">AI 专家库加载失败：${esc(e?.message || e)}</div>`
  }
}

async function installOne(page, id) {
  try {
    const overwrite = await showConfirm(`安装/更新专家「${id}」？已存在时会覆盖内置 SOUL/AGENTS/IDENTITY 文件。`)
    if (!overwrite) return
    const res = await api.agencyAgentInstall(id, true)
    toast(`已安装 ${res?.name || id}`, 'success')
    await refresh(page)
  } catch (e) {
    toast(`安装失败：${e?.message || e}`, 'error')
  }
}

async function installBulk(page, division = null) {
  const label = division ? `「${divisionLabel(division)}」分类` : '全部 217 个专家'
  const ok = await showConfirm(`确认安装 ${label}？已存在的专家会备份在 OpenClaw 配置外，请谨慎覆盖。`)
  if (!ok) return
  try {
    const res = await api.agencyAgentsInstallBulk(division, true)
    toast(`安装完成：新增/更新 ${res?.installed || 0}，跳过 ${res?.skipped || 0}`, res?.success === false ? 'warning' : 'success')
    await refresh(page)
  } catch (e) {
    toast(`批量安装失败：${e?.message || e}`, 'error')
  }
}

async function showDetail(id) {
  const mount = _activePage?.querySelector('#agency-detail')
  if (!mount) return
  mount.innerHTML = '<div class="modal-backdrop"><div class="modal-card"><div class="skeleton" style="height:260px"></div></div></div>'
  try {
    const data = await api.agencyAgentDetail(id)
    const agent = data.agent || {}
    const files = data.files || {}
    mount.innerHTML = `
      <div class="modal-backdrop" data-action="close-detail">
        <div class="modal-card agency-detail-modal" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h3>${esc(agent.emoji || '🤖')} ${esc(agent.name || id)}</h3>
            <button class="btn btn-sm btn-secondary" data-action="close-detail">关闭</button>
          </div>
          <p class="form-hint">${esc(agent.description || '')}</p>
          <div class="agency-detail-files">
            ${Object.entries(files).map(([name, content]) => `
              <details ${name === 'IDENTITY.md' ? 'open' : ''}>
                <summary>${esc(name)}</summary>
                <pre>${esc(String(content || '').slice(0, 12000))}</pre>
              </details>
            `).join('')}
          </div>
          <div class="modal-actions">
            <button class="btn btn-primary" data-action="install" data-id="${esc(id)}">安装这个专家</button>
          </div>
        </div>
      </div>
    `
  } catch (e) {
    mount.innerHTML = `<div class="modal-backdrop" data-action="close-detail"><div class="modal-card"><div style="color:var(--error)">预览失败：${esc(e?.message || e)}</div></div></div>`
  }
}

function bindEvents(page) {
  page.addEventListener('click', async e => {
    const target = e.target.closest('[data-action]')
    if (!target) return
    const action = target.dataset.action
    const id = target.dataset.id
    if (action === 'refresh') await refresh(page)
    else if (action === 'install') await installOne(page, id)
    else if (action === 'detail') await showDetail(id)
    else if (action === 'close-detail') page.querySelector('#agency-detail').innerHTML = ''
    else if (action === 'install-all') await installBulk(page, null)
    else if (action === 'install-division') await installBulk(page, _state.division === 'all' ? null : _state.division)
  })
}

export async function render() {
  const page = document.createElement('div')
  page.className = 'page agency-page'
  _activePage = page
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">AI 专家库</h1>
        <p class="page-desc">内置 217 个行业专家 Agent，覆盖工程、安全、营销、电商、销售、设计等场景。</p>
      </div>
    </div>
    <div class="page-content" id="agency-content"></div>
  `
  bindEvents(page)
  refresh(page)
  return page
}

export function cleanup() {
  _activePage = null
}
