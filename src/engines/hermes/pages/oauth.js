import { api } from '../../../lib/tauri-api.js'
import { icon } from '../../../lib/icons.js'
import { t } from '../../../lib/i18n.js'
import { toast } from '../../../components/toast.js'
import { loadHermesProviders } from '../lib/providers.js'
import {
  canConfigureOauth,
  defaultOauthModel,
  oauthAuthLabel,
  oauthProviderStatus,
  oauthProviders,
} from '../lib/oauth-policy.js'

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
  el.className = 'page hm-oauth-page'
  el.dataset.engine = 'hermes'

  let providers = []
  let hermesInfo = null
  let selectedId = ''
  let selectedModel = ''
  let loading = true
  let saving = false
  let error = ''

  const selectedProvider = () => providers.find(provider => provider.id === selectedId) || providers[0] || null

  function draw() {
    const provider = selectedProvider()
    const status = provider ? oauthProviderStatus(provider, hermesInfo || {}) : null
    const models = provider?.models || []
    const command = status?.command || ''
    const canApply = canConfigureOauth(provider, selectedModel) && !saving

    el.innerHTML = `
      <div class="hm-hero">
        <div class="hm-hero-title">
          <div class="hm-hero-eyebrow">${esc(t('engine.oauthEyebrow'))}</div>
          <h1 class="hm-hero-h1">${esc(t('engine.oauthTitle'))}</h1>
          <div class="hm-hero-sub">${esc(t('engine.oauthDesc'))}</div>
        </div>
        <div class="hm-hero-actions">
          <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-oauth-refresh" ${loading || saving ? 'disabled' : ''}>${icon('refresh-cw', 14)}${esc(t('engine.filesRefresh'))}</button>
          <button class="hm-btn hm-btn--cta hm-btn--sm" id="hm-oauth-apply" ${!canApply ? 'disabled' : ''}>${icon('check-circle', 14)}${esc(saving ? t('engine.oauthApplying') : t('engine.oauthApply'))}</button>
        </div>
      </div>

      ${error ? `<section class="hm-panel" style="margin-bottom:16px"><div class="hm-panel-body" style="color:var(--hm-error)">${esc(error)}</div></section>` : ''}

      <section class="hm-panel hm-oauth-shell">
        <div class="hm-panel-header">
          <div>
            <div class="hm-panel-title">${esc(t('engine.oauthProviders'))}</div>
            <div class="hm-muted">${esc(t('engine.oauthProvidersHint'))}</div>
          </div>
        </div>
        <div class="hm-panel-body hm-oauth-grid">
          <div class="hm-oauth-provider-list">
            ${loading ? `<div class="hm-muted hm-files-empty">${esc(t('engine.filesLoading'))}</div>` : ''}
            ${!loading && !providers.length ? `<div class="hm-muted hm-files-empty">${esc(t('engine.oauthEmpty'))}</div>` : ''}
            ${providers.map(item => {
              const itemStatus = oauthProviderStatus(item, hermesInfo || {})
              return `
                <button class="hm-oauth-provider ${item.id === provider?.id ? 'is-active' : ''}" data-provider="${esc(item.id)}">
                  <span>${icon(itemStatus.selected ? 'check-circle' : 'key', 16)}</span>
                  <span class="hm-oauth-provider-main">
                    <strong>${esc(item.name || item.id)}</strong>
                    <small>${esc(oauthAuthLabel(item.authType))}${itemStatus.selected ? ` · ${esc(t('engine.oauthCurrent'))}` : ''}</small>
                  </span>
                </button>
              `
            }).join('')}
          </div>

          <div class="hm-oauth-detail">
            ${provider ? `
              <div class="hm-oauth-detail-head">
                <div>
                  <div class="hm-panel-title">${esc(provider.name || provider.id)}</div>
                  <div class="hm-muted">${esc(provider.description || t('engine.oauthNoDescription'))}</div>
                </div>
                <span class="hm-profile-badge ${status?.selected ? 'hm-profile-badge--active' : ''}">${esc(status?.selected ? t('engine.oauthCurrent') : oauthAuthLabel(provider.authType))}</span>
              </div>

              <label class="hm-field">
                <span>${esc(t('engine.oauthLoginCommand'))}</span>
                <div class="hm-oauth-command-row">
                  <code>${esc(command || t('engine.oauthNoCommand'))}</code>
                  <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-oauth-copy" ${!command ? 'disabled' : ''}>${icon('copy', 14)}${esc(t('engine.oauthCopy'))}</button>
                </div>
              </label>

              <label class="hm-field">
                <span>${esc(t('engine.oauthModel'))}</span>
                <select class="hm-input" id="hm-oauth-model">
                  ${models.map(model => `<option value="${esc(model)}" ${model === selectedModel ? 'selected' : ''}>${esc(model)}</option>`).join('')}
                  ${!models.includes(selectedModel) && selectedModel ? `<option value="${esc(selectedModel)}" selected>${esc(selectedModel)}</option>` : ''}
                </select>
              </label>

              <div class="hm-oauth-note">
                <strong>${esc(t('engine.oauthFlowTitle'))}</strong>
                <span>${esc(t('engine.oauthFlowDesc'))}</span>
              </div>
            ` : `<div class="hm-muted hm-files-empty">${esc(t('engine.oauthEmpty'))}</div>`}
          </div>
        </div>
      </section>
    `

    el.querySelector('#hm-oauth-refresh')?.addEventListener('click', load)
    el.querySelector('#hm-oauth-apply')?.addEventListener('click', applyProvider)
    el.querySelector('#hm-oauth-copy')?.addEventListener('click', copyCommand)
    el.querySelector('#hm-oauth-model')?.addEventListener('change', event => {
      selectedModel = event.target.value
      draw()
    })
    el.querySelectorAll('.hm-oauth-provider').forEach(button => {
      button.addEventListener('click', () => selectProvider(button.dataset.provider || ''))
    })
  }

  function selectProvider(id) {
    selectedId = id
    const provider = selectedProvider()
    selectedModel = defaultOauthModel(provider)
    draw()
  }

  async function copyCommand() {
    const command = oauthProviderStatus(selectedProvider(), hermesInfo || {}).command
    if (!command) return
    try {
      await navigator.clipboard.writeText(command)
      toast(t('engine.oauthCopied'), 'success')
    } catch (err) {
      toast(`${t('engine.oauthCopyFailed')}: ${cleanError(err)}`, 'error')
    }
  }

  async function load() {
    loading = true
    error = ''
    draw()
    try {
      const [list, info] = await Promise.all([
        loadHermesProviders(),
        api.checkHermes(),
      ])
      providers = oauthProviders(list)
      hermesInfo = info || null
      if (!providers.find(provider => provider.id === selectedId)) {
        selectedId = hermesInfo?.configuredProvider && providers.find(provider => provider.id === hermesInfo.configuredProvider)
          ? hermesInfo.configuredProvider
          : providers[0]?.id || ''
      }
      selectedModel = selectedModel || hermesInfo?.model || defaultOauthModel(selectedProvider())
    } catch (err) {
      error = cleanError(err) || t('engine.oauthLoadFailed')
    } finally {
      loading = false
      draw()
    }
  }

  async function applyProvider() {
    const provider = selectedProvider()
    if (!canConfigureOauth(provider, selectedModel)) return
    saving = true
    error = ''
    draw()
    try {
      await api.configureHermes(provider.id, '', selectedModel, '', { preserveExistingKey: true })
      toast(t('engine.oauthApplied'), 'success')
      await load()
    } catch (err) {
      error = cleanError(err) || t('engine.oauthApplyFailed')
      toast(error, 'error')
    } finally {
      saving = false
      draw()
    }
  }

  draw()
  load()
  return el
}
