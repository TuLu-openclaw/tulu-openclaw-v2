/**
 * Skills 页面
 * 本地扫描已安装 Skills + SkillHub SDK 技能商店
 */
import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'
import { t } from '../lib/i18n.js'

let _loadSeq = 0

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
      <div class="tab" data-main-tab="skillstore">🏪 技能商店</div>
    </div>
    <div id="skills-tab-installed" class="config-section">
      <div class="stat-card loading-placeholder" style="height:96px"></div>
    </div>
    <div id="skills-tab-store" class="config-section" style="display:none">
      <div class="clawhub-toolbar" style="margin-bottom:var(--space-sm)">
        <input class="input clawhub-search-input" id="skill-store-search" placeholder="${t('skills.searchPlaceholder')}" type="text" style="flex:1">
        <button class="btn btn-primary btn-sm" data-action="store-search">${t('skills.search')}</button>
        <a class="btn btn-secondary btn-sm" href="https://skillhub.cloud.tencent.com" target="_blank" rel="noopener">${t('skills.browse')}</a>
      </div>
      <div id="store-results" class="clawhub-list" style="max-height:calc(100vh - 300px);overflow-y:auto">
        <div class="form-hint" style="padding:var(--space-xl);text-align:center">${t('skills.storeLoading')}</div>
      </div>
    </div>
    <div id="skills-tab-skillstore" class="config-section" style="display:none">
      <div id="oc-store-content"></div>
    </div>
  `
  bindEvents(page)
  loadSkills(page)
  return page
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
    const data = await api.skillsList()
    if (seq !== _loadSeq) return
    renderSkills(el, data)
  } catch (e) {
    if (seq !== _loadSeq) return
    el.innerHTML = `<div class="skills-load-error">
      <div style="color:var(--error);margin-bottom:8px">${t('skills.loadFailed')}: ${esc(e?.message || e)}</div>
      <div class="form-hint" style="margin-bottom:10px">${t('skills.loadFailedHint')}</div>
      <button class="btn btn-secondary btn-sm" data-action="skill-retry">${t('skills.retry')}</button>
    </div>`
  }
}

function renderSkills(el, data) {
  const skills = data?.skills || []
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
      <button class="btn btn-secondary btn-sm" data-action="skill-retry">${t('skills.refresh')}</button>
    </div>

    <div class="skills-summary" style="margin-bottom:var(--space-lg);color:var(--text-secondary);font-size:var(--font-size-sm)">
      ${t('skills.summary', { total: skills.length, detail: summary })}
    </div>

    ${eligible.length ? `
    <div class="clawhub-panel" style="margin-bottom:var(--space-lg)">
      <div class="clawhub-panel-title" style="color:var(--success)">${t('skills.eligibleGroup')} (${eligible.length})</div>
      <div class="clawhub-list skills-scroll-area skills-trending-scroll" id="skills-eligible">
        ${eligible.map(s => renderSkillCard(s, 'eligible')).join('')}
      </div>
    </div>` : ''}

    ${missing.length ? `
    <div class="clawhub-panel" style="margin-bottom:var(--space-lg)">
      <div class="clawhub-panel-title" style="color:var(--warning);display:flex;align-items:center;gap:var(--space-sm)">
        <span>${t('skills.missingGroup')} (${missing.length})</span>
        <button class="btn btn-secondary btn-sm" data-action="skill-ai-fix" style="font-size:var(--font-size-xs);padding:2px 8px">${t('skills.aiFixBtn')}</button>
      </div>
      <div class="clawhub-list skills-scroll-area skills-installed-scroll" id="skills-missing">
        ${missing.map(s => renderSkillCard(s, 'missing')).join('')}
      </div>
    </div>` : ''}

    ${disabled.length ? `
    <div class="clawhub-panel" style="margin-bottom:var(--space-lg)">
      <div class="clawhub-panel-title" style="color:var(--text-tertiary)">${t('skills.disabledGroup')} (${disabled.length})</div>
      <div class="clawhub-list skills-scroll-area skills-search-scroll" id="skills-disabled">
        ${disabled.map(s => renderSkillCard(s, 'disabled')).join('')}
      </div>
    </div>` : ''}

    ${blocked.length ? `
    <div class="clawhub-panel" style="margin-bottom:var(--space-lg)">
      <div class="clawhub-panel-title" style="color:var(--text-tertiary)">${t('skills.blockedGroup')} (${blocked.length})</div>
      <div class="clawhub-list">
        ${blocked.map(s => renderSkillCard(s, 'blocked')).join('')}
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

function renderSkillCard(skill, status) {
  const emoji = skill.emoji || '📦'
  const name = skill.name || ''
  const desc = skill.description || ''
  const source = skill.bundled ? t('skills.bundled') : (skill.source || t('skills.custom'))
  const missingBins = skill.missing?.bins || []
  const missingEnv = skill.missing?.env || []
  const missingConfig = skill.missing?.config || []
  const installOpts = skill.install || []

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
        <div class="clawhub-item-title">${emoji} ${esc(name)}</div>
        <div class="clawhub-item-meta">${esc(source)}${skill.homepage ? ` · <a href="${esc(skill.homepage)}" target="_blank" rel="noopener" style="color:var(--accent)">${esc(skill.homepage)}</a>` : ''}</div>
        <div class="clawhub-item-desc">${esc(desc)}</div>
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
    toast(t('skills.depInstalled', { name: skillName }), 'success')
    await loadSkills(page)
  } catch (e) {
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
    // 获取已安装列表用于标记
    try {
      const data = await api.skillsList()
      _installedNames = new Set((data?.skills || []).map(s => s.name))
    } catch { _installedNames = new Set() }
    renderStoreItems(results, _storeIndex)
  } catch (e) {
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
    const link = item.link || item.source || ''
    const installed = _installedNames.has(slug)
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
            : `<button class="btn btn-primary btn-sm" data-action="store-install" data-slug="${esc(slug)}" data-name="${esc(name)}" data-desc="${esc(desc)}" data-link="${esc(link)}">${t('skills.install')}</button>`
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
    if (seq !== _searchSeq) return // 期间有新搜索，取消

    if (!q && _storeIndex) {
      renderStoreItems(results, _storeIndex)
      return
    }
    if (!q) return

    // 客户端过滤已有索引
    if (_storeIndex) {
      const filtered = _storeIndex.filter(item => {
        const slug = (item.slug || '').toLowerCase()
        const name = (item.display_name || item.displayName || '').toLowerCase()
        const desc = (item.summary || item.description || '').toLowerCase()
        const tags = (item.tags || []).join(' ').toLowerCase()
        return slug.includes(q) || name.includes(q) || desc.includes(q) || tags.includes(q)
      })
      if (seq !== _searchSeq) return
      renderStoreItems(results, filtered)
      return
    }

    // 没有索引时走服务端搜索
    results.innerHTML = `<div class="form-hint" style="padding:var(--space-sm)">${t('skills.searching')}</div>`
    try {
      const items = await api.skillhubSearch(input.value.trim())
      if (seq !== _searchSeq) return // 期间有新搜索，丢弃结果
      renderStoreItems(results, items)
    } catch (e) {
      if (seq !== _searchSeq) return
      results.innerHTML = `<div style="color:var(--error);padding:var(--space-sm)">${t('skills.searchFailed')}: ${esc(e?.message || e)}</div>`
    }
  }, 300) // 300ms 防抖
}

async function handleStoreInstall(page, btn) {
  const slug = btn.dataset.slug
  const name = btn.dataset.name || slug
  const desc = btn.dataset.desc || ""
  const link = btn.dataset.link || ""
  btn.disabled = true
  btn.textContent = t('skills.installing')
  try {
    await api.skillhubInstallForEngine(name, desc, link, 'openclaw')
    toast(t('skills.skillInstalled', { name }), 'success')
    btn.textContent = t('skills.installed')
    btn.classList.remove('btn-primary')
    btn.classList.add('btn-secondary')
    _installedNames.add(slug)
    loadSkills(page).catch(() => {})
  } catch (e) {
    toast(`${t('skills.installFailed')}: ${e?.message || e}`, 'error')
    btn.disabled = false
    btn.textContent = t('skills.install')
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
    toast(t('skills.uninstalled', { name }), 'success')
    await loadSkills(page)
  } catch (e) {
    toast(`${t('skills.uninstallFailed')}: ${e?.message || e}`, 'error')
    btn.disabled = false
    btn.textContent = t('skills.uninstall')
  }
}

function bindEvents(page) {
  // 主 Tab 切换（已安装 / 搜索安装 / 技能商店）
  page.querySelectorAll('#skills-main-tabs .tab').forEach(tab => {
    tab.onclick = () => {
      page.querySelectorAll('#skills-main-tabs .tab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      const key = tab.dataset.mainTab
      page.querySelector('#skills-tab-installed').style.display = key === 'installed' ? '' : 'none'
      page.querySelector('#skills-tab-store').style.display = key === 'store' ? '' : 'none'
      page.querySelector('#skills-tab-skillstore').style.display = key === 'skillstore' ? '' : 'none'
      if (key === 'store') loadStore(page)
      if (key === 'skillstore') renderSkillStoreTab(page)
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
      case 'skill-uninstall':
        await handleSkillUninstall(page, btn)
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

// ===== 技能商店 (anbeime/skill) — OpenClaw 版本 =====

let _ocStoreData = null
let _ocStoreLoading = false
let _ocQuery = ''
let _ocFilterCat = ''
let _ocFilterType = 'all'

function starsStr(n) { return '⭐'.repeat(Math.min(n||0,5)) + '☆'.repeat(Math.max(0,5-(n||0))) }

async function renderSkillStoreTab(page) {
  const el = page.querySelector('#oc-store-content')
  if (!el) return
  if (_ocStoreLoading) return drawOCStore(el)
  if (!_ocStoreData) {
    _ocStoreLoading = true
    drawOCStore(el)
    try {
      _ocStoreData = await api.skillhubFetchStore()
    } catch (e) {
      _ocStoreData = null
    } finally {
      _ocStoreLoading = false
    }
  }
  drawOCStore(el)
}

function drawOCStore(el) {
  if (_ocStoreLoading) {
    el.innerHTML = '<div class="form-hint" style="padding:60px;text-align:center">🏪 正在加载技能商店...</div>'
    return
  }
  if (!_ocStoreData) {
    el.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-tertiary)">
      📡 技能商店加载失败<br><button class="btn btn-secondary btn-sm" id="oc-store-retry" style="margin-top:12px">重试</button>
    </div>`
    el.querySelector('#oc-store-retry')?.addEventListener('click', () => { _ocStoreData = null; renderSkillStoreTab(el.closest('.page')) })
    return
  }
  // 筛选
  let official = _ocStoreData.official || []
  let local = _ocStoreData.local || []
  if (_ocFilterType === 'official') local = []
  if (_ocFilterType === 'local') official = []
  if (_ocFilterCat) {
    official = official.filter(s => s.category === _ocFilterCat)
    local = local.filter(s => s.category === _ocFilterCat)
  }
  if (_ocQuery.trim()) {
    const q = _ocQuery.toLowerCase()
    official = official.filter(s => (s.name||'').toLowerCase().includes(q)||(s.description||'').toLowerCase().includes(q))
    local = local.filter(s => (s.name||'').toLowerCase().includes(q)||(s.description||'').toLowerCase().includes(q))
  }
  const all = [...official, ...local]
  const cats = _ocStoreData.categories || []

  el.innerHTML = `
    <div style="margin-bottom:12px;color:var(--text-secondary);font-size:12px;display:flex;align-items:center;gap:8px">
      <span style="background:linear-gradient(135deg,#f59e0b,#fbbf24);padding:2px 10px;border-radius:10px;color:#000;font-weight:700">243个技能</span>
      <span>182官方 + 61本地 · 14个分类</span>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <input type="text" class="input" id="oc-store-search" placeholder="搜索技能名称或描述..." value="${esc(_ocQuery)}" style="flex:1">
      <button class="btn btn-secondary btn-sm" id="oc-store-refresh">🔄</button>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:8px">
      <button class="btn btn-sm oc-type-chip" data-oc-type="all" style="font-size:11px;${_ocFilterType==='all'?'background:var(--accent);color:#fff':''}">全部</button>
      <button class="btn btn-sm oc-type-chip" data-oc-type="official" style="font-size:11px;${_ocFilterType==='official'?'background:var(--accent);color:#fff':''}">🏛️ 官方</button>
      <button class="btn btn-sm oc-type-chip" data-oc-type="local" style="font-size:11px;${_ocFilterType==='local'?'background:var(--accent);color:#fff':''}">🇨🇳 本地</button>
    </div>
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border)">
      <button class="btn btn-sm oc-cat-chip" data-oc-cat="" style="font-size:10px;${!_ocFilterCat?'background:var(--accent);color:#fff':''}">全部</button>
      ${cats.map(c => `<button class="btn btn-sm oc-cat-chip" data-oc-cat="${esc(c.name)}" style="font-size:10px;${_ocFilterCat===c.name?'background:var(--accent);color:#fff':''}">${esc(c.emoji||'')} ${esc(c.name)} (${c.count})</button>`).join('')}
    </div>
    <div style="margin-bottom:8px;font-size:12px;color:var(--text-tertiary)">${all.length} 个技能</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px">
      ${all.map(s => `
        <div class="clawhub-item oc-store-card" style="flex-direction:column;align-items:stretch;gap:6px;padding:14px">
          <div style="display:flex;justify-content:space-between">
            <span style="font-size:10px;color:var(--text-tertiary)">${esc(s.orgEmoji||'')} ${esc(s.org||'')}</span>
            <span class="clawhub-badge" style="font-size:9px;background:${s.type==='official'?'rgba(59,130,246,0.12)':'rgba(245,158,11,0.12)'};color:${s.type==='official'?'#60a5fa':'#fbbf24'}">${s.type==='official'?'官方':'本地'}</span>
          </div>
          <div style="font-weight:700;font-size:14px;color:var(--text-primary)">${esc(s.name.includes('/')?s.name.split('/').pop():s.name)}</div>
          <div style="font-size:12px;color:var(--text-tertiary);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(s.description||'')}</div>
          <div style="display:flex;gap:8px;align-items:center;font-size:11px">
            <span>${starsStr(s.stars||3)}</span>
            <span style="color:var(--text-tertiary)">📂 ${esc(s.category||'')}</span>
          </div>
          <div style="display:flex;gap:8px;margin-top:4px;padding-top:8px;border-top:1px solid var(--border)">
            <a href="${esc(s.link||'#')}" target="_blank" class="btn btn-sm" style="flex:1;font-size:11px;border:1px solid var(--border);text-align:center;text-decoration:none;color:var(--text-secondary);border-radius:8px">GitHub ↗</a>
            <button class="btn btn-primary btn-sm oc-install-btn" data-oc-name="${esc(s.name||'')}" data-oc-desc="${esc(s.description||'')}" data-oc-link="${esc(s.link||'')}" style="flex:1;font-size:11px">⬇ 安装到OpenClaw</button>
          </div>
        </div>
      `).join('')}
    </div>
  `

  // 绑定事件
  el.querySelector('#oc-store-search')?.addEventListener('input', (e) => { _ocQuery = e.target.value; drawOCStore(el) })
  el.querySelector('#oc-store-refresh')?.addEventListener('click', () => { _ocStoreData = null; renderSkillStoreTab(el.closest('.page')) })
  el.querySelectorAll('.oc-type-chip').forEach(b => b.addEventListener('click', () => { _ocFilterType = b.dataset.ocType; drawOCStore(el) }))
  el.querySelectorAll('.oc-cat-chip').forEach(b => b.addEventListener('click', () => { _ocFilterCat = b.dataset.ocCat; drawOCStore(el) }))
  el.querySelectorAll('.oc-install-btn').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true; b.textContent = '安装中...'
    try {
      await api.skillhubInstallForEngine(b.dataset.ocName, b.dataset.ocDesc, b.dataset.ocLink, 'openclaw')
      b.textContent = '✅ 已安装'
      b.classList.remove('btn-primary'); b.classList.add('btn-secondary')
    } catch (e) {
      b.textContent = '❌ 失败'
      setTimeout(() => { b.disabled = false; b.textContent = '⬇ 安装到OpenClaw' }, 2000)
    }
  }))
}
