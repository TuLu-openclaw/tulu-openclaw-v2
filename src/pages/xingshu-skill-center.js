import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'
import { t } from '../lib/i18n.js'

function esc(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function skillKey(value = '') {
  return String(value || '').trim().toLowerCase().replace(/^@[^/]+\//, '')
}

function getSlug(item = {}) {
  return item.slug || item.name || item.id || item.display_name || item.displayName || ''
}

function getTitle(item = {}) {
  return item.display_name || item.displayName || item.name || item.slug || 'Skill'
}

let _items = []
let _installed = new Set()

export async function render() {
  const page = document.createElement('div')
  page.className = 'page'
  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">${t('skills.xingshuCenter')}</h1>
      <p class="page-desc">${t('skills.xingshuCenterDesc')}</p>
    </div>
    <div class="clawhub-toolbar" style="margin-bottom:var(--space-md)">
      <input class="input clawhub-search-input" id="xs-skill-search" placeholder="${t('skills.searchPlaceholder')}" type="text" style="flex:1">
      <button class="btn btn-secondary btn-sm" data-action="refresh">${t('skills.refresh')}</button>
    </div>
    <div id="xs-skill-list" class="clawhub-list"><div class="form-hint" style="padding:var(--space-xl);text-align:center">${t('skills.storeLoading')}</div></div>
    <div id="xs-skill-detail"></div>
  `
  bind(page)
  load(page)
  return page
}

async function load(page) {
  const list = page.querySelector('#xs-skill-list')
  try {
    const [items, installed] = await Promise.all([api.skillhubIndex(), api.skillsList().catch(() => ({ skills: [] }))])
    _items = Array.isArray(items) ? items : items?.skills || items?.items || []
    _installed = new Set((installed.skills || []).flatMap(skill => [skill.name, skill.slug, skill.id].filter(Boolean).map(skillKey)))
    renderItems(page, _items)
  } catch (e) {
    list.innerHTML = `<div style="color:var(--error);padding:var(--space-lg);text-align:center">${t('skills.storeLoadFailed')}: ${esc(e?.message || e)}</div>`
  }
}

function renderItems(page, items) {
  const list = page.querySelector('#xs-skill-list')
  if (!items.length) {
    list.innerHTML = `<div class="clawhub-empty" style="padding:var(--space-xl);text-align:center">${t('skills.noResults')}</div>`
    return
  }
  list.innerHTML = items.map(item => {
    const slug = getSlug(item)
    const installed = _installed.has(skillKey(slug)) || _installed.has(skillKey(item.name || ''))
    return `<div class="clawhub-item skill-card-item" data-slug="${esc(slug)}" data-title="${esc(getTitle(item))}" data-desc="${esc(item.summary || item.description || '')}">
      <div class="clawhub-item-main">
        <div class="clawhub-item-title">🧩 ${esc(getTitle(item))}</div>
        <div class="clawhub-item-desc">${esc(item.summary || item.description || t('skills.noDescription'))}</div>
        <div class="clawhub-item-meta">${esc(slug)}${item.version ? ` · v${esc(item.version)}` : ''}</div>
      </div>
      <div class="clawhub-item-actions">
        <button class="btn btn-secondary btn-sm" data-action="detail" data-slug="${esc(slug)}">${t('skills.detail')}</button>
        ${installed ? `<span class="clawhub-badge installed">${t('skills.installed')}</span>` : `<button class="btn btn-primary btn-sm" data-action="install" data-slug="${esc(slug)}">${t('skills.installToXingshu')}</button>`}
      </div>
    </div>`
  }).join('')
}

function showDetail(page, slug) {
  const item = _items.find(item => skillKey(getSlug(item)) === skillKey(slug)) || {}
  const detail = page.querySelector('#xs-skill-detail')
  detail.innerHTML = `<div class="clawhub-detail-card" style="margin-top:var(--space-md)">
    <div class="clawhub-detail-title">🧩 ${esc(getTitle(item))}</div>
    <div class="clawhub-detail-meta">Slug: <code>${esc(slug)}</code>${item.version ? ` · v${esc(item.version)}` : ''}${item.author ? ` · ${esc(item.author)}` : ''}</div>
    <div class="clawhub-detail-desc" style="margin-top:8px">${esc(item.description || item.summary || t('skills.noDescription'))}</div>
    <div style="margin-top:12px"><button class="btn btn-primary" data-action="install" data-slug="${esc(slug)}">${t('skills.installToXingshu')}</button></div>
  </div>`
  detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

async function install(page, btn) {
  const slug = btn.dataset.slug || ''
  btn.disabled = true
  btn.textContent = t('skills.installing')
  try {
    await api.xingshuSkillInstall(slug)
    const data = await api.skillsList()
    const keys = new Set((data.skills || []).flatMap(skill => [skill.name, skill.slug, skill.id].filter(Boolean).map(skillKey)))
    if (!keys.has(skillKey(slug))) throw new Error(t('skills.installVerifyFailed'))
    toast(t('skills.skillInstalled', { name: slug }), 'success')
    await load(page)
  } catch (e) {
    toast(`${t('skills.installFailed')}: ${e?.message || e}`, 'error')
    btn.disabled = false
    btn.textContent = t('skills.installToXingshu')
  }
}

function bind(page) {
  page.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]')
    if (!btn) return
    if (btn.dataset.action === 'refresh') await load(page)
    if (btn.dataset.action === 'detail') showDetail(page, btn.dataset.slug)
    if (btn.dataset.action === 'install') await install(page, btn)
  })
  page.querySelector('#xs-skill-search')?.addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase()
    renderItems(page, q ? _items.filter(item => `${getSlug(item)} ${getTitle(item)} ${item.summary || ''} ${item.description || ''}`.toLowerCase().includes(q)) : _items)
  })
}
