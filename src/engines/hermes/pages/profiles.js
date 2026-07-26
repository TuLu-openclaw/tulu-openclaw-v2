import { api } from '../../../lib/tauri-api.js'
import { icon } from '../../../lib/icons.js'
import { t } from '../../../lib/i18n.js'
import { showConfirm, showModal } from '../../../components/modal.js'
import { toast } from '../../../components/toast.js'
import { getChatStore } from '../lib/chat-store.js'
import { gatewayRuntime } from '../lib/gateway-policy.js'
import { cloneSourceOptions, profileActions, validateProfileName } from '../lib/profile-policy.js'

const chatStore = getChatStore()

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function cleanError(error) {
  return String(error?.message || error || '').replace(/^Error:\s*/, '')
}

export function render() {
  const el = document.createElement('div')
  el.className = 'page hm-profiles-page'
  el.dataset.engine = 'hermes'

  let profiles = []
  let active = 'default'
  let loading = true
  let busy = ''
  let error = ''

  function draw() {
    el.innerHTML = `
      <div class="hm-hero">
        <div class="hm-hero-title">
          <div class="hm-hero-eyebrow">${esc(t('engine.profilesEyebrow'))}</div>
          <h1 class="hm-hero-h1">${esc(t('engine.profilesTitle'))}</h1>
          <div class="hm-hero-sub">${esc(t('engine.profilesDesc'))}</div>
        </div>
        <div class="hm-hero-actions">
          <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-profiles-refresh" ${loading || busy ? 'disabled' : ''}>${icon('refresh-cw', 14)}${esc(t('engine.profilesRefresh'))}</button>
          <button class="hm-btn hm-btn--cta hm-btn--sm" id="hm-profiles-create" ${loading || busy ? 'disabled' : ''}>${icon('plus-circle', 14)}${esc(t('engine.profilesCreate'))}</button>
        </div>
      </div>

      ${error ? `<section class="hm-panel" style="margin-bottom:16px"><div class="hm-panel-body" style="color:var(--hm-error)">${esc(error)}</div></section>` : ''}

      <section class="hm-panel">
        <div class="hm-panel-header">
          <div>
            <div class="hm-panel-title">${esc(t('engine.profilesListTitle'))}</div>
            <div class="hm-muted" style="margin-top:4px">${esc(t('engine.profilesCount').replace('{n}', profiles.length))}</div>
          </div>
          <div class="hm-panel-actions"><span class="hm-muted">${esc(t('engine.profilesActive'))}: <strong>${esc(active)}</strong></span></div>
        </div>
        <div class="hm-panel-body" style="display:grid;gap:10px">
          ${loading ? `<div class="hm-muted">${esc(t('engine.profilesLoading'))}</div>` : ''}
          ${!loading && !profiles.length ? `<div class="hm-muted">${esc(t('engine.profilesEmpty'))}</div>` : ''}
          ${profiles.map(profile => {
            const policy = profileActions(profile, active)
            const runtime = gatewayRuntime(profile)
            const name = profile.name || ''
            const working = busy === name
            return `
              <article class="hm-profile-row" data-profile="${esc(name)}">
                <div class="hm-profile-main">
                  <div class="hm-profile-name">
                    <strong>${esc(name)}</strong>
                    ${policy.isActive ? `<span class="hm-profile-badge hm-profile-badge--active">${esc(t('engine.profilesActiveTag'))}</span>` : ''}
                    ${policy.isDefault ? `<span class="hm-profile-badge">${esc(t('engine.profilesDefaultTag'))}</span>` : ''}
                  </div>
                  <div class="hm-profile-meta">
                    <span><span class="status-dot ${runtime.running ? 'running' : 'stopped'}"></span>${esc(runtime.running ? t('engine.profilesGatewayRunning') : t('engine.profilesGatewayStopped'))}</span>
                    <span>${esc(t('engine.profilesModel'))}: ${esc(profile.model || t('engine.profilesNotConfigured'))}</span>
                    ${profile.alias ? `<span>${esc(t('engine.profilesAlias'))}: ${esc(profile.alias)}</span>` : ''}
                  </div>
                </div>
                <div class="hm-profile-actions">
                  ${policy.canActivate ? `<button class="hm-btn hm-btn--ghost hm-btn--sm" data-action="activate" ${working ? 'disabled' : ''}>${icon('check-circle', 14)}${esc(t('engine.profilesActivate'))}</button>` : ''}
                  <button class="btn-icon" data-action="rename" title="${esc(t('engine.profilesRename'))}" aria-label="${esc(t('engine.profilesRename'))}" ${!policy.canRename || working ? 'disabled' : ''}>${icon('edit', 15)}</button>
                  <button class="btn-icon" data-action="delete" title="${esc(t('engine.profilesDelete'))}" aria-label="${esc(t('engine.profilesDelete'))}" ${!policy.canDelete || working ? 'disabled' : ''}>${icon('trash', 15)}</button>
                </div>
              </article>`
          }).join('')}
        </div>
      </section>
    `

    el.querySelector('#hm-profiles-refresh')?.addEventListener('click', load)
    el.querySelector('#hm-profiles-create')?.addEventListener('click', openCreate)
    el.querySelectorAll('.hm-profile-row').forEach(row => {
      const name = row.dataset.profile
      row.querySelector('[data-action="activate"]')?.addEventListener('click', () => activate(name))
      row.querySelector('[data-action="rename"]')?.addEventListener('click', () => openRename(name))
      row.querySelector('[data-action="delete"]')?.addEventListener('click', () => remove(name))
    })
  }

  async function load() {
    loading = true
    error = ''
    draw()
    try {
      const data = await api.hermesProfilesList()
      profiles = Array.isArray(data?.profiles) ? data.profiles : []
      active = data?.active || profiles.find(profile => profile.active)?.name || 'default'
    } catch (err) {
      error = cleanError(err) || t('engine.profilesLoadFailed')
    } finally {
      loading = false
      draw()
    }
  }

  async function runFor(name, action, successKey) {
    busy = name
    error = ''
    draw()
    try {
      await action()
      await chatStore.loadProfiles()
      await load()
      toast(t(successKey), 'success')
    } catch (err) {
      error = cleanError(err)
      toast(error || t('engine.profilesOperationFailed'), 'error')
    } finally {
      busy = ''
      draw()
    }
  }

  async function activate(name) {
    if (chatStore.state.streaming) {
      toast(t('engine.profilesSwitchBlocked'), 'warning')
      return
    }
    await runFor(name, () => chatStore.switchProfile(name), 'engine.profilesActivated')
  }

  function openCreate() {
    showModal({
      title: t('engine.profilesCreateTitle'),
      fields: [
        { name: 'name', label: t('engine.profilesName'), placeholder: 'coding' },
        {
          name: 'cloneFrom',
          label: t('engine.profilesCloneFrom'),
          type: 'select',
          options: cloneSourceOptions(profiles).map(option => ({
            value: option.value,
            label: option.label || t(`engine.${option.labelKey}`),
          })),
        },
      ],
      onConfirm: async values => {
        const result = validateProfileName(values.name)
        if (!result.valid || result.value === 'default') {
          toast(t('engine.profilesNameInvalid'), 'error')
          return
        }
        await runFor(result.value, () => api.hermesProfileCreate(result.value, values.cloneFrom), 'engine.profilesCreated')
      },
    })
  }

  function openRename(name) {
    showModal({
      title: t('engine.profilesRenameTitle'),
      fields: [{ name: 'newName', label: t('engine.profilesNewName'), value: name }],
      onConfirm: async values => {
        const result = validateProfileName(values.newName)
        if (!result.valid || result.value === 'default') {
          toast(t('engine.profilesNameInvalid'), 'error')
          return
        }
        if (result.value === name) return
        await runFor(name, () => api.hermesProfileRename(name, result.value), 'engine.profilesRenamed')
      },
    })
  }

  async function remove(name) {
    const confirmed = await showConfirm(t('engine.profilesDeleteConfirm').replace('{name}', name))
    if (!confirmed) return
    await runFor(name, () => api.hermesProfileDelete(name), 'engine.profilesDeleted')
  }

  draw()
  load()
  return el
}
