/**
 * Skills 页面
 * 本地扫描已安装 Skills + SkillHub SDK 技能商店
 */
import { api, invalidate } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'
import { t } from '../lib/i18n.js'

let _loadSeq = 0
let _activePage = null
let _lastSkillsData = []
let _lastAgents = []


function skillKey(value = '') {
  return String(value || '').trim().toLowerCase().replace(/^@[^/]+\//, '')
}

function getStoreSlug(item = {}) {
  return item.slug || item.name || item.id || item.display_name || item.displayName || ''
}

function getInstalledSkillKeys(skills = []) {
  const keys = new Set()
  ;(skills || []).forEach(skill => {
    ;[skill.name, skill.slug, skill.id, skill.display_name, skill.displayName].forEach(value => {
      const key = skillKey(value)
      if (key) keys.add(key)
    })
  })
  return keys
}

async function loadSkillAgentUsage() {
  try {
    const [agents, config] = await Promise.all([api.listAgents(), api.readOpenclawConfig().catch(() => null)])
    const usage = new Map()
    const list = Array.isArray(agents) ? agents : []
    const cfgAgents = config?.agents?.list || []
    list.forEach(agent => {
      const cfg = cfgAgents.find(item => item.id === agent.id) || {}
      const skills = Array.isArray(agent.skills) ? agent.skills : Array.isArray(cfg.skills) ? cfg.skills : []
      skills.forEach(name => {
        const key = skillKey(name)
        if (!key) return
        if (!usage.has(key)) usage.set(key, [])
        usage.get(key).push({ id: agent.id, name: agent.identityName || cfg.identity?.name || agent.id })
      })
    })
    return { agents: list, usage }
  } catch {
    return { agents: [], usage: new Map() }
  }
}

function agentOptionsHtml(agents = []) {
  return (agents || []).map(agent => `<option value="${esc(agent.id)}">${esc(agent.identityName || agent.id)}（${esc(agent.id)}）</option>`).join('')
}

function esc(str) {
  if (!str) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function render() {
  const page = document.createElement('div')
  page.className = 'page'
  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">${t('skills.title')}</h1>
      <p class="page-desc">${t('skills.desc')}</p>
    </div>
    <div class="tab-bar" id="skills-main-tabs">
      <div class="tab active" data-main-tab="installed">${t('skills.tabInstalled')}</div>
      <div class="tab" data-main-tab="store">${t('skills.tabStore')}</div>
      <div class="tab" data-main-tab="xingshu-center">${t('skills.xingshuCenter')}</div>
      <div class="tab" data-main-tab="xingshu-security">${t('skills.xingshuSecurity')}</div>
    </div>
    <div id="skills-tab-installed" class="config-section">
      <div class="stat-card loading-placeholder" style="height:96px"></div>
    </div>
    <div id="skills-tab-store" class="config-section" style="display:none">
      <div class="clawhub-toolbar" style="margin-bottom:var(--space-sm)">
        <input class="input clawhub-search-input" id="skill-store-search" placeholder="${t('skills.searchPlaceholder')}" type="text" style="flex:1">
        <button class="btn btn-primary btn-sm" data-action="store-search">${t('skills.search')}</button>
        <button class="btn btn-secondary btn-sm" data-action="open-xingshu-center">${t('skills.xingshuCenter')}</button>
      </div>
      <div id="store-results" class="clawhub-list" style="max-height:calc(100vh - 300px);overflow-y:auto">
        <div class="form-hint" style="padding:var(--space-xl);text-align:center">${t('skills.storeLoading')}</div>
      </div>
    </div>
    <div id="skills-tab-xingshu-center" class="config-section" style="display:none">
      <div class="stat-card" style="padding:var(--space-lg);display:grid;gap:10px">
        <h3 style="margin:0">${t('skills.xingshuCenter')}</h3>
        <p class="form-hint" style="margin:0">${t('skills.xingshuCenterDesc')}</p>
        <button class="btn btn-primary" data-action="open-xingshu-center">${t('skills.openInAppWindow')}</button>
      </div>
    </div>
    <div id="skills-tab-xingshu-security" class="config-section" style="display:none">
      <div class="stat-card" style="padding:var(--space-lg);display:grid;gap:10px">
        <h3 style="margin:0">${t('skills.xingshuSecurity')}</h3>
        <p class="form-hint" style="margin:0">${t('skills.xingshuSecurityDesc')}</p>
        <button class="btn btn-primary" data-action="open-xingshu-security">${t('skills.openInAppWindow')}</button>
      </div>
    </div>
  `
  bindEvents(page)
  _activePage = page
  loadSkills(page)
  return page
}

export function cleanup() {
  _loadSeq++
  _searchSeq++
  if (_searchTimer !== null) { clearTimeout(_searchTimer); _searchTimer = null }
  _activePage = null
}

async function loadSkills(page) {
  const el = page.querySelector('#skills-tab-installed')
  if (!el) return
  const seq = ++_loadSeq

  el.innerHTML = `<div class="skills-loading-panel">
    <div class="stat-card loading-placeholder" style="height:96px"></div>
    <div class="form-hint" style="margin-top:8px">${t('skills.loading')}</div>
  </div>`

  try {
    const [data, agentUsage] = await Promise.all([api.skillsList(), loadSkillAgentUsage()])
    if (seq !== _loadSeq || page !== _activePage || !page.isConnected) return
    renderSkills(el, data, agentUsage)
  } catch (e) {
    if (seq !== _loadSeq || page !== _activePage || !page.isConnected) return
    el.innerHTML = `<div class="skills-load-error">
      <div style="color:var(--error);margin-bottom:8px">${t('skills.loadFailed')}: ${esc(e?.message || e)}</div>
      <div class="form-hint" style="margin-bottom:10px">${t('skills.loadFailedHint')}</div>
      <button class="btn btn-secondary btn-sm" data-action="skill-retry">${t('skills.retry')}</button>
    </div>`
  }
}

function renderSkills(el, data, agentUsage = { agents: [], usage: new Map() }) {
  const skills = data?.skills || []
  _lastSkillsData = skills
  _lastAgents = agentUsage.agents || []
  const cliAvailable = data?.cliAvailable !== false
  const source = data?.source || ''
  const cliDiag = data?.diagnostic?.cli || null
  const eligible = skills.filter(s => s.eligible && !s.disabled)
  const missing = skills.filter(s => !s.eligible && !s.disabled && !s.blockedByAllowlist)
  const disabled = skills.filter(s => s.disabled)
  const blocked = skills.filter(s => s.blockedByAllowlist && !s.disabled)

  const summary = t('skills.summaryDetail', { eligible: eligible.length, missing: missing.length, disabled: disabled.length })

  el.innerHTML = `
    <div class="clawhub-toolbar">
      <input class="input clawhub-search-input" id="skill-filter-input" placeholder="${t('skills.filterPlaceholder')}" type="text">
      <select class="input input-sm" id="skills-bulk-agent" style="max-width:260px"><option value="">${t('skills.selectAgent')}</option>${agentOptionsHtml(_lastAgents)}</select>
      <button class="btn btn-primary btn-sm" data-action="skills-bulk-enable">${t('skills.bulkEnableForAgent')}</button>
      <button class="btn btn-secondary btn-sm" data-action="skills-bulk-uninstall" style="color:var(--error);border-color:var(--error)">${t('skills.bulkUninstall')}</button>
      <button class="btn btn-secondary btn-sm" data-action="skills-scan-diagnostics">${t('skills.scanDiagnostics')}</button>
      <button class="btn btn-secondary btn-sm" data-action="skill-retry">${t('skills.refresh')}</button>
    </div>

    <div class="skills-summary" style="margin-bottom:var(--space-lg);color:var(--text-secondary);font-size:var(--font-size-sm)">
      ${t('skills.summary', { total: skills.length, detail: summary })}
    </div>

    ${eligible.length ? `
    <div class="clawhub-panel" style="margin-bottom:var(--space-lg)">
      <div class="clawhub-panel-title" style="color:var(--success)">${t('skills.eligibleGroup')} (${eligible.length})</div>
      <div class="clawhub-list skills-scroll-area skills-trending-scroll" id="skills-eligible">
        ${eligible.map(s => renderSkillCard(s, 'eligible', agentUsage)).join('')}
      </div>
    </div>` : ''}

    ${missing.length ? `
    <div class="clawhub-panel" style="margin-bottom:var(--space-lg)">
      <div class="clawhub-panel-title" style="color:var(--warning);display:flex;align-items:center;gap:var(--space-sm)">
        <span>${t('skills.missingGroup')} (${missing.length})</span>
        <button class="btn btn-secondary btn-sm" data-action="skill-ai-fix" style="font-size:var(--font-size-xs);padding:2px 8px">${t('skills.aiFixBtn')}</button>
      </div>
      <div class="clawhub-list skills-scroll-area skills-installed-scroll" id="skills-missing">
        ${missing.map(s => renderSkillCard(s, 'missing', agentUsage)).join('')}
      </div>
    </div>` : ''}

    ${disabled.length ? `
    <div class="clawhub-panel" style="margin-bottom:var(--space-lg)">
      <div class="clawhub-panel-title" style="color:var(--text-tertiary)">${t('skills.disabledGroup')} (${disabled.length})</div>
      <div class="clawhub-list skills-scroll-area skills-search-scroll" id="skills-disabled">
        ${disabled.map(s => renderSkillCard(s, 'disabled', agentUsage)).join('')}
      </div>
    </div>` : ''}

    ${blocked.length ? `
    <div class="clawhub-panel" style="margin-bottom:var(--space-lg)">
      <div class="clawhub-panel-title" style="color:var(--text-tertiary)">${t('skills.blockedGroup')} (${blocked.length})</div>
      <div class="clawhub-list">
        ${blocked.map(s => renderSkillCard(s, 'blocked', agentUsage)).join('')}
      </div>
    </div>` : ''}

    ${!skills.length ? `
    <div class="clawhub-panel">
      <div class="clawhub-empty" style="text-align:center;padding:var(--space-xl)">
        <div style="margin-bottom:var(--space-sm)">${t('skills.noSkills')}</div>
        <div class="form-hint">${t('skills.noSkillsHint')}</div>
      </div>
    </div>` : ''}

    <div id="skill-detail-area"></div>
  `

  // 实时过滤
  const input = el.querySelector('#skill-filter-input')
  if (input) {
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase()
      el.querySelectorAll('.skill-card-item').forEach(card => {
        const name = (card.dataset.name || '').toLowerCase()
        const desc = (card.dataset.desc || '').toLowerCase()
        card.style.display = (!q || name.includes(q) || desc.includes(q)) ? '' : 'none'
      })
    })
  }
}

function renderSkillCard(skill, status, agentUsage = { agents: [], usage: new Map() }) {
  const emoji = skill.emoji || '📦'
  const name = skill.name || ''
  const desc = skill.description || ''
  const source = skill.bundled ? t('skills.bundled') : (skill.source || t('skills.custom'))
  const missingBins = skill.missing?.bins || []
  const missingEnv = skill.missing?.env || []
  const missingConfig = skill.missing?.config || []
  const installOpts = skill.install || []
  const usage = agentUsage.usage?.get(skillKey(name)) || []
  const usageText = usage.length ? usage.map(agent => agent.name || agent.id).join('、') : t('skills.noAgentUsage')
  const agentOptions = agentOptionsHtml(agentUsage.agents || [])

  let statusBadge = ''
  if (status === 'eligible') statusBadge = `<span class="clawhub-badge installed">${t('skills.eligible')}</span>`
  else if (status === 'missing') statusBadge = `<span class="clawhub-badge" style="background:rgba(245,158,11,0.14);color:#d97706">${t('skills.missingDeps')}</span>`
  else if (status === 'disabled') statusBadge = `<span class="clawhub-badge" style="background:rgba(107,114,128,0.14);color:#6b7280">${t('skills.disabled')}</span>`
  else if (status === 'blocked') statusBadge = `<span class="clawhub-badge" style="background:rgba(239,68,68,0.14);color:#ef4444">${t('skills.blocked')}</span>`

  let missingHtml = ''
  if (missingBins.length) missingHtml += `<div class="form-hint" style="margin-top:4px">${t('skills.missingCmd')}: ${missingBins.map(b => `<code>${esc(b)}</code>`).join(', ')}</div>`
  if (missingEnv.length) missingHtml += `<div class="form-hint" style="margin-top:4px">${t('skills.missingEnv')}: ${missingEnv.map(e => `<code>${esc(e)}</code>`).join(', ')} <span style="color:var(--text-tertiary);font-size:var(--font-size-xs)">${t('skills.missingEnvHint')}</span></div>`
  if (missingConfig.length) missingHtml += `<div class="form-hint" style="margin-top:4px">${t('skills.missingConfig')}: ${missingConfig.map(c => `<code>${esc(c)}</code>`).join(', ')} <span style="color:var(--text-tertiary);font-size:var(--font-size-xs)">${t('skills.missingConfigHint')}</span></div>`

  let installHtml = ''
  if (status === 'missing') {
    if (installOpts.length) {
      installHtml = `<div style="margin-top:6px">${installOpts.map(opt =>
        `<button class="btn btn-primary btn-sm" style="margin-right:6px;margin-top:4px" data-action="skill-install-dep" data-kind="${esc(opt.kind)}" data-install='${esc(JSON.stringify(opt))}' data-skill-name="${esc(name)}">${esc(opt.label)}</button>`
      ).join('')}</div>`
    } else if (missingBins.length && !missingEnv.length && !missingConfig.length) {
      installHtml = `<div class="form-hint" style="margin-top:6px;color:var(--text-tertiary);font-size:var(--font-size-xs)">${t('skills.noAutoInstall')}: ${missingBins.map(b => `<code>brew install ${esc(b)}</code> / <code>npm i -g ${esc(b)}</code>`).join(' / ')}</div>`
    }
  }

  return `
    <div class="clawhub-item skill-card-item" data-name="${esc(name)}" data-desc="${esc(desc)}">
      <div class="clawhub-item-main">
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:var(--font-size-xs);color:var(--text-tertiary)">
          <input type="checkbox" data-skill-select="${esc(name)}" ${skill.disabled || skill.blockedByAllowlist ? 'disabled' : ''}> ${t('skills.selectForBulk')}
        </label>
        <div class="clawhub-item-title">${emoji} ${esc(name)}</div>
        <div class="clawhub-item-meta">${esc(source)}${skill.homepage ? ` · <a href="${esc(skill.homepage)}" target="_blank" rel="noopener" style="color:var(--accent)">${esc(skill.homepage)}</a>` : ''}</div>
        <div class="clawhub-item-desc skill-full-desc">${esc(desc || t('skills.noDescription'))}</div>
        <div class="clawhub-item-meta">${t('skills.usedByAgents')}: ${esc(usageText)}</div>
        ${agentOptions ? `<div class="skill-agent-enable-row"><select class="input input-sm" data-skill-agent-select="${esc(name)}"><option value="">${t('skills.selectAgent')}</option>${agentOptions}</select><button class="btn btn-secondary btn-sm" data-action="skill-enable-agent" data-name="${esc(name)}">${t('skills.enableForAgent')}</button></div>` : ''}
        ${missingHtml}
        ${installHtml}
      </div>
      <div class="clawhub-item-actions">
        <button class="btn btn-secondary btn-sm" data-action="skill-info" data-name="${esc(name)}">${t('skills.detail')}</button>
        ${!skill.bundled ? `<button class="btn btn-sm" style="color:var(--error);border:1px solid var(--error);background:transparent;font-size:var(--font-size-xs)" data-action="skill-uninstall" data-name="${esc(name)}">${t('skills.uninstall')}</button>` : ''}
        ${statusBadge}
      </div>
    </div>
  `
}

async function handleInfo(page, name) {
  const detail = page.querySelector('#skill-detail-area')
  if (!detail) return
  detail.innerHTML = `<div class="form-hint" style="margin-top:var(--space-md)">${t('skills.loadingDetail')}</div>`
  detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  try {
    const skill = await api.skillsInfo(name)
    if (page !== _activePage || !page.isConnected || !detail.isConnected) return
    const s = skill || {}
    const reqs = s.requirements || {}
    const miss = s.missing || {}

    let reqsHtml = ''
    if (reqs.bins?.length) {
      reqsHtml += `<div style="margin-top:8px"><strong>${t('skills.reqBins')}:</strong> ${reqs.bins.map(b => {
        const ok = !(miss.bins || []).includes(b)
        return `<code style="color:var(--${ok ? 'success' : 'error'})">${ok ? '✓' : '✗'} ${esc(b)}</code>`
      }).join(' ')}</div>`
    }
    if (reqs.env?.length) {
      reqsHtml += `<div style="margin-top:4px"><strong>${t('skills.reqEnv')}:</strong> ${reqs.env.map(e => {
        const ok = !(miss.env || []).includes(e)
        return `<code style="color:var(--${ok ? 'success' : 'error'})">${ok ? '✓' : '✗'} ${esc(e)}</code>`
      }).join(' ')}</div>`
    }

    detail.innerHTML = `
      <div class="clawhub-detail-card">
        <div class="clawhub-detail-title">${esc(s.emoji || '📦')} ${esc(s.name || name)}</div>
        <div class="clawhub-detail-meta">
          ${t('skills.detailSource')}: ${esc(s.source || '')} · ${t('skills.detailPath')}: <code>${esc(s.filePath || '')}</code>
          ${s.homepage ? ` · <a href="${esc(s.homepage)}" target="_blank" rel="noopener">${esc(s.homepage)}</a>` : ''}
        </div>
        <div class="clawhub-detail-desc" style="margin-top:8px">${esc(s.description || '')}</div>
        ${reqsHtml}
        ${(s.install || []).length && !s.eligible ? `<div style="margin-top:8px"><strong>${t('skills.installOptions')}:</strong> ${s.install.map(i => `<span class="form-hint">→ ${esc(i.label)}</span>`).join(' ')}</div>` : ''}
      </div>
    `
  } catch (e) {
    if (page !== _activePage || !page.isConnected || !detail.isConnected) return
    detail.innerHTML = `<div style="color:var(--error);margin-top:var(--space-md)">${t('skills.detailLoadFailed')}: ${esc(e?.message || e)}</div>`
  }
}

async function handleInstallDep(page, btn) {
  const kind = btn.dataset.kind
  let spec
  try { spec = JSON.parse(btn.dataset.install) } catch { spec = {} }
  const skillName = btn.dataset.skillName || ''
  btn.disabled = true
  btn.textContent = t('skills.installing')
  try {
    await api.skillsInstallDep(kind, spec)
    if (page !== _activePage || !page.isConnected) return
    toast(t('skills.depInstalled', { name: skillName }), 'success')
    await loadSkills(page)
  } catch (e) {
    if (page !== _activePage || !page.isConnected || !btn.isConnected) return
    toast(`${t('skills.installFailed')}: ${e?.message || e}`, 'error')
    btn.disabled = false
    btn.textContent = spec.label || t('skills.retry')
  }
}

// ===== 技能商店（SkillHub SDK）=====
let _storeIndex = null // 缓存的全量索引
let _installedNames = new Set() // 已安装的 skill 名称
let _searchSeq = 0 // 搜索序列号，用于取消旧请求
let _searchTimer = null // 防抖定时器

async function loadStore(page) {
  const results = page.querySelector('#store-results')
  if (!results) return
  results.innerHTML = `<div class="form-hint" style="padding:var(--space-xl);text-align:center">${t('skills.storeLoading')}</div>`
  try {
    _storeIndex = await api.skillhubIndex()
    if (page !== _activePage || !page.isConnected || !results.isConnected) return
    // 获取已安装列表用于标记
    try {
      const data = await api.skillsList()
      if (page !== _activePage || !page.isConnected || !results.isConnected) return
      _installedNames = getInstalledSkillKeys(data?.skills || [])
    } catch { _installedNames = new Set() }
    if (page !== _activePage || !page.isConnected || !results.isConnected) return
    renderStoreItems(results, _storeIndex)
  } catch (e) {
    if (page !== _activePage || !page.isConnected || !results.isConnected) return
    results.innerHTML = `<div style="color:var(--error);padding:var(--space-lg);text-align:center">${t('skills.storeLoadFailed')}: ${esc(e?.message || e)}</div>`
  }
}

function renderStoreItems(el, items) {
  if (!items?.length) {
    el.innerHTML = `<div class="clawhub-empty" style="padding:var(--space-xl);text-align:center">${t('skills.noResults')}</div>`
    return
  }
  el.innerHTML = items.map(item => {
    const slug = item.slug || ''
    const name = item.display_name || item.displayName || item.name || slug
    const desc = item.summary || item.description || ''
    const installed = _installedNames.has(skillKey(slug)) || _installedNames.has(skillKey(name))
    return `
      <div class="clawhub-item store-item" data-slug="${esc(slug)}" data-name="${esc(name)}" data-desc="${esc(desc)}">
        <div class="clawhub-item-main">
          <div class="clawhub-item-title">📦 ${esc(name)}</div>
          <div class="clawhub-item-desc">${esc(desc)}</div>
          ${item.version ? `<div class="clawhub-item-meta">v${esc(item.version)}${item.author ? ` · ${esc(item.author)}` : ''}</div>` : ''}
        </div>
        <div class="clawhub-item-actions">
          ${installed
            ? `<span class="clawhub-badge installed">${t('skills.installed')}</span>`
            : `<button class="btn btn-primary btn-sm" data-action="store-install" data-slug="${esc(slug)}">${t('skills.install')}</button>`
          }
        </div>
      </div>
    `
  }).join('')
}

async function handleStoreSearch(page) {
  const input = page.querySelector('#skill-store-search')
  const results = page.querySelector('#store-results')
  if (!input || !results) return
  const q = input.value.trim().toLowerCase()

  // 防抖 300ms，清除上一个定时器
  if (_searchTimer !== null) { clearTimeout(_searchTimer); _searchTimer = null }

  // 递增序列号，用于在请求返回时判断是否已过时
  const seq = ++_searchSeq

  _searchTimer = setTimeout(async () => {
    _searchTimer = null
    if (seq !== _searchSeq || page !== _activePage || !page.isConnected || !results.isConnected) return // 期间有新搜索或页面已卸载，取消

    if (!q && _storeIndex) {
      renderStoreItems(results, _storeIndex)
      return
    }
    if (!q) return

    // 先调服务端搜索（获取API全量在线结果）
    results.innerHTML = `<div class="form-hint" style="padding:var(--space-sm)">${t('skills.searching')}</div>`
    try {
      const items = await api.skillhubSearch(input.value.trim())
      if (seq !== _searchSeq || page !== _activePage || !page.isConnected || !results.isConnected) return
      if (items && items.length > 0) {
        renderStoreItems(results, items)
        return
      }
    } catch (e) {
      console.warn('skillhubSearch failed, falling back to local filter', e)
    }

    // 服务端搜索无结果时回退到客户端过滤本地缓存
    if (_storeIndex && seq === _searchSeq && page === _activePage && page.isConnected && results.isConnected) {
      const filtered = _storeIndex.filter(item => {
        const slug = (item.slug || '').toLowerCase()
        const name = (item.display_name || item.displayName || item.name || '').toLowerCase()
        const desc = (item.summary || item.description || '').toLowerCase()
        const tags = (item.tags || []).join(' ').toLowerCase()
        return slug.includes(q) || name.includes(q) || desc.includes(q) || tags.includes(q)
      })
      if (seq === _searchSeq && page === _activePage && page.isConnected && results.isConnected) {
        renderStoreItems(results, filtered)
      }
    }
  }, 300) // 300ms 防抖
}

async function handleStoreInstall(page, btn) {
  const slug = btn.dataset.slug
  btn.disabled = true
  btn.textContent = t('skills.installing')
  try {
    await api.skillhubInstall(slug)
    const data = await api.skillsList()
    const installedKeys = getInstalledSkillKeys(data?.skills || [])
    if (!installedKeys.has(skillKey(slug))) throw new Error(t('skills.installVerifyFailed'))
    if (page !== _activePage || !page.isConnected || !btn.isConnected) return
    toast(t('skills.skillInstalled', { name: slug }), 'success')
    btn.textContent = t('skills.installed')
    btn.classList.remove('btn-primary')
    btn.classList.add('btn-secondary')
    _installedNames.add(skillKey(slug))
    loadSkills(page).catch(() => {})
  } catch (e) {
    if (page !== _activePage || !page.isConnected || !btn.isConnected) return
    toast(`${t('skills.installFailed')}: ${e?.message || e}`, 'error')
    btn.disabled = false
    btn.textContent = t('skills.install')
  }
}

async function handleEnableForAgent(page, btn) {
  const name = btn.dataset.name || ''
  const select = page.querySelector(`[data-skill-agent-select="${CSS.escape(name)}"]`)
  const agentId = select?.value || ''
  if (!name || !agentId) { toast(t('skills.selectAgentFirst'), 'warning'); return }
  btn.disabled = true
  btn.textContent = t('skills.enabling')
  try {
    const detail = await api.getAgentDetail(agentId).catch(() => ({}))
    const current = Array.isArray(detail?.skills) ? detail.skills : []
    const exists = current.some(item => skillKey(item) === skillKey(name))
    const next = exists ? current : [...current, name]
    await api.updateAgentConfig(agentId, { skills: next })
    invalidate('get_agent_detail', 'list_agents')
    toast(exists ? t('skills.alreadyEnabledForAgent') : t('skills.enabledForAgent'), 'success')
    await loadSkills(page)
  } catch (e) {
    toast(`${t('skills.enableForAgentFailed')}: ${e?.message || e}`, 'error')
  } finally {
    if (btn.isConnected) { btn.disabled = false; btn.textContent = t('skills.enableForAgent') }
  }
}

async function handleBulkEnableForAgent(page, btn) {
  const agentId = page.querySelector('#skills-bulk-agent')?.value || ''
  const selected = Array.from(page.querySelectorAll('[data-skill-select]:checked')).map(input => input.dataset.skillSelect).filter(Boolean)
  if (!agentId) { toast(t('skills.selectAgentFirst'), 'warning'); return }
  if (!selected.length) { toast(t('skills.selectSkillFirst'), 'warning'); return }
  btn.disabled = true
  btn.textContent = t('skills.enabling')
  try {
    const installedKeys = getInstalledSkillKeys(_lastSkillsData)
    const validSelected = selected.filter(name => installedKeys.has(skillKey(name)))
    if (validSelected.length !== selected.length) throw new Error(t('skills.bulkVerifyFailed'))
    const detail = await api.getAgentDetail(agentId).catch(() => ({}))
    const current = Array.isArray(detail?.skills) ? detail.skills : []
    const next = [...current]
    for (const name of validSelected) {
      if (!next.some(item => skillKey(item) === skillKey(name))) next.push(name)
    }
    await api.updateAgentConfig(agentId, { skills: next })
    invalidate('get_agent_detail', 'list_agents')
    const verify = await api.getAgentDetail(agentId).catch(() => ({}))
    const verified = Array.isArray(verify?.skills) ? verify.skills : []
    const missing = validSelected.filter(name => !verified.some(item => skillKey(item) === skillKey(name)))
    if (missing.length) throw new Error(t('skills.bulkAgentVerifyFailed', { names: missing.join(', ') }))
    toast(t('skills.bulkEnabledForAgent', { count: validSelected.length }), 'success')
    await loadSkills(page)
  } catch (e) {
    toast(`${t('skills.enableForAgentFailed')}: ${e?.message || e}`, 'error')
  } finally {
    if (btn.isConnected) { btn.disabled = false; btn.textContent = t('skills.bulkEnableForAgent') }
  }
}

async function handleScanDiagnostics() {
  try {
    const data = await api.skillsScanDiagnostics()
    const roots = (data.roots || []).map(root => `${root.supported ? '✓' : '!'} ${root.label}: ${root.path} (${root.exists ? '存在' : '未创建'}, SKILL.md=${root.skillMdCount || 0})`).join('\n')
    alert(`${t('skills.scanDiagnostics')}\n\n${roots}\n\n${t('skills.scanCount')}: ${data.scanCount || 0}`)
  } catch (e) {
    toast(`${t('skills.scanDiagnosticsFailed')}: ${e?.message || e}`, 'error')
  }
}

async function openXingshuSkillCenter() {
  try { await api.openXingshuSkillCenterWindow(); toast(t('skills.openedInAppWindow'), 'success') }
  catch (e) { toast(`${t('skills.openWindowFailed')}: ${e?.message || e}`, 'error') }
}

async function openXingshuSkillSecurity() {
  try { await api.openXingshuSkillSecurityWindow(); toast(t('skills.openedInAppWindow'), 'success') }
  catch (e) { toast(`${t('skills.openWindowFailed')}: ${e?.message || e}`, 'error') }
}

async function handleBulkUninstall(page, btn) {
  const selected = Array.from(page.querySelectorAll('[data-skill-select]:checked')).map(input => input.dataset.skillSelect).filter(Boolean)
  if (!selected.length) { toast(t('skills.selectSkillFirst'), 'warning'); return }
  const installedByKey = new Map((_lastSkillsData || []).map(skill => [skillKey(skill.name || skill.slug || skill.id || ''), skill]))
  const uninstallable = selected.filter(name => {
    const skill = installedByKey.get(skillKey(name))
    return skill && !skill.bundled
  })
  if (!uninstallable.length) { toast(t('skills.noUninstallableSelected'), 'warning'); return }
  if (!confirm(t('skills.confirmBulkUninstall', { count: uninstallable.length, names: uninstallable.join(', ') }))) return
  btn.disabled = true
  btn.textContent = t('skills.uninstalling')
  try {
    for (const name of uninstallable) {
      await api.skillsUninstall(name)
    }
    const data = await api.skillsList()
    const remaining = getInstalledSkillKeys(data?.skills || [])
    const failed = uninstallable.filter(name => remaining.has(skillKey(name)))
    if (failed.length) throw new Error(t('skills.bulkUninstallVerifyFailed', { names: failed.join(', ') }))
    toast(t('skills.bulkUninstalled', { count: uninstallable.length }), 'success')
    await loadSkills(page)
  } catch (e) {
    toast(`${t('skills.uninstallFailed')}: ${e?.message || e}`, 'error')
  } finally {
    if (btn.isConnected) { btn.disabled = false; btn.textContent = t('skills.bulkUninstall') }
  }
}

async function handleSkillUninstall(page, btn) {
  const name = btn.dataset.name
  if (!name) return
  if (!confirm(t('skills.confirmUninstall', { name }))) return
  btn.disabled = true
  btn.textContent = t('skills.uninstalling')
  try {
    await api.skillsUninstall(name)
    const data = await api.skillsList()
    const remaining = getInstalledSkillKeys(data?.skills || [])
    if (remaining.has(skillKey(name))) throw new Error(t('skills.uninstallVerifyFailed'))
    if (page !== _activePage || !page.isConnected || !btn.isConnected) return
    toast(t('skills.uninstalled', { name }), 'success')
    await loadSkills(page)
  } catch (e) {
    if (page !== _activePage || !page.isConnected || !btn.isConnected) return
    toast(`${t('skills.uninstallFailed')}: ${e?.message || e}`, 'error')
    btn.disabled = false
    btn.textContent = t('skills.uninstall')
  }
}

function bindEvents(page) {
  // 主 Tab 切换（已安装 / 搜索安装）
  page.querySelectorAll('#skills-main-tabs .tab').forEach(tab => {
    tab.onclick = () => {
      page.querySelectorAll('#skills-main-tabs .tab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      const key = tab.dataset.mainTab
      page.querySelector('#skills-tab-installed').style.display = key === 'installed' ? '' : 'none'
      page.querySelector('#skills-tab-store').style.display = key === 'store' ? '' : 'none'
      page.querySelector('#skills-tab-xingshu-center').style.display = key === 'xingshu-center' ? '' : 'none'
      page.querySelector('#skills-tab-xingshu-security').style.display = key === 'xingshu-security' ? '' : 'none'
      // 切到商店 tab 时加载全量索引
      if (key === 'store') loadStore(page)
    }
  })

  page.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]')
    if (!btn) return
    switch (btn.dataset.action) {
      case 'skill-retry':
        await loadSkills(page)
        break
      case 'skill-info':
        await handleInfo(page, btn.dataset.name)
        break
      case 'skill-install-dep':
        await handleInstallDep(page, btn)
        break
      case 'store-search':
        await handleStoreSearch(page)
        break
      case 'store-install':
        await handleStoreInstall(page, btn)
        break
      case 'skill-enable-agent':
        await handleEnableForAgent(page, btn)
        break
      case 'skill-uninstall':
        await handleSkillUninstall(page, btn)
        break
      case 'skills-bulk-enable':
        await handleBulkEnableForAgent(page, btn)
        break
      case 'skills-bulk-uninstall':
        await handleBulkUninstall(page, btn)
        break
      case 'skills-scan-diagnostics':
        await handleScanDiagnostics()
        break
      case 'open-xingshu-center':
        await openXingshuSkillCenter()
        break
      case 'open-xingshu-security':
        await openXingshuSkillSecurity()
        break
      case 'skill-ai-fix':
        window.location.hash = '#/assistant'
        setTimeout(() => {
          const skillBtn = document.querySelector('.ast-skill-card[data-skill="skills-manager"]')
          if (skillBtn) skillBtn.click()
        }, 500)
        break
    }
  })

  page.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && e.target?.id === 'skill-store-search') {
      e.preventDefault()
      await handleStoreSearch(page)
    }
  })
}
