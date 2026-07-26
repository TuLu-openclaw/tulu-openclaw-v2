import { api } from '../../../lib/tauri-api.js'
import { icon } from '../../../lib/icons.js'
import { t } from '../../../lib/i18n.js'
import { showConfirm } from '../../../components/modal.js'
import { toast } from '../../../components/toast.js'
import { gatewayActions, validateGatewayAction } from '../lib/gateway-policy.js'

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
  el.className = 'page hm-gateways-page'
  el.dataset.engine = 'hermes'

  let profiles = []
  let active = 'default'
  let loading = true
  let busy = ''
  let error = ''
  const details = new Map()

  function draw() {
    el.innerHTML = `
      <div class="hm-hero">
        <div class="hm-hero-title">
          <div class="hm-hero-eyebrow">${esc(t('engine.gatewaysEyebrow'))}</div>
          <h1 class="hm-hero-h1">${esc(t('engine.gatewaysTitle'))}</h1>
          <div class="hm-hero-sub">${esc(t('engine.gatewaysDesc'))}</div>
        </div>
        <div class="hm-hero-actions">
          <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-gateways-refresh" ${loading || busy ? 'disabled' : ''}>${icon('refresh-cw', 14)}${esc(t('engine.gatewaysRefresh'))}</button>
        </div>
      </div>

      ${error ? `<section class="hm-panel" style="margin-bottom:16px"><div class="hm-panel-body" style="color:var(--hm-error)">${esc(error)}</div></section>` : ''}

      <section class="hm-panel">
        <div class="hm-panel-header">
          <div>
            <div class="hm-panel-title">${esc(t('engine.gatewaysListTitle'))}</div>
            <div class="hm-muted" style="margin-top:4px">${esc(t('engine.gatewaysCount').replace('{n}', profiles.length))}</div>
          </div>
          <div class="hm-panel-actions"><span class="hm-muted">${esc(t('engine.profilesActive'))}: <strong>${esc(active)}</strong></span></div>
        </div>
        <div class="hm-panel-body" style="display:grid;gap:10px">
          ${loading ? `<div class="hm-muted">${esc(t('engine.gatewaysLoading'))}</div>` : ''}
          ${!loading && !profiles.length ? `<div class="hm-muted">${esc(t('engine.gatewaysEmpty'))}</div>` : ''}
          ${profiles.map(profile => {
            const name = profile.name || ''
            const working = busy === name
            const policy = gatewayActions(profile, working)
            const detail = details.get(name)
            return `
              <article class="hm-profile-row" data-profile="${esc(name)}">
                <div class="hm-profile-main">
                  <div class="hm-profile-name">
                    <strong>${esc(name)}</strong>
                    ${name === active ? `<span class="hm-profile-badge hm-profile-badge--active">${esc(t('engine.profilesActiveTag'))}</span>` : ''}
                  </div>
                  <div class="hm-profile-meta">
                    <span><span class="status-dot ${policy.running ? 'running' : 'stopped'}"></span>${esc(policy.running ? t('engine.gatewaysRunning') : t('engine.gatewaysStopped'))}</span>
                    <span>${esc(t('engine.profilesModel'))}: ${esc(profile.model || t('engine.profilesNotConfigured'))}</span>
                  </div>
                  ${detail ? `<pre class="hm-gateway-detail">${esc(detail)}</pre>` : ''}
                </div>
                <div class="hm-profile-actions">
                  ${policy.canStart ? `<button class="hm-btn hm-btn--cta hm-btn--sm" data-action="start">${icon('play', 14)}${esc(t('engine.gatewaysStart'))}</button>` : ''}
                  ${policy.canStop ? `<button class="hm-btn hm-btn--ghost hm-btn--sm" data-action="stop">${icon('stop', 14)}${esc(t('engine.gatewaysStop'))}</button>` : ''}
                  <button class="btn-icon" data-action="restart" title="${esc(t('engine.gatewaysRestart'))}" aria-label="${esc(t('engine.gatewaysRestart'))}" ${policy.canRestart ? '' : 'disabled'}>${icon('refresh-cw', 15)}</button>
                  <button class="btn-icon" data-action="status" title="${esc(t('engine.gatewaysInspect'))}" aria-label="${esc(t('engine.gatewaysInspect'))}" ${policy.canInspect ? '' : 'disabled'}>${icon('info', 15)}</button>
                </div>
              </article>`
          }).join('')}
        </div>
      </section>
    `

    el.querySelector('#hm-gateways-refresh')?.addEventListener('click', load)
    el.querySelectorAll('.hm-profile-row').forEach(row => {
      const name = row.dataset.profile
      row.querySelectorAll('[data-action]').forEach(button => {
        button.addEventListener('click', () => runAction(name, button.dataset.action))
      })
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
      error = cleanError(err) || t('engine.gatewaysLoadFailed')
    } finally {
      loading = false
      draw()
    }
  }

  async function runAction(name, requestedAction) {
    const { valid, value: action } = validateGatewayAction(requestedAction)
    if (!valid) return
    if (action === 'stop' || action === 'restart') {
      const key = action === 'stop' ? 'engine.gatewaysStopConfirm' : 'engine.gatewaysRestartConfirm'
      const confirmed = await showConfirm(t(key).replace('{name}', name))
      if (!confirmed) return
    }

    busy = name
    error = ''
    draw()
    try {
      const output = await api.hermesProfileGatewayAction(name, action)
      if (action === 'status') {
        details.set(name, output || t('engine.gatewaysNoStatus'))
      } else {
        details.delete(name)
        await load()
        toast(t(`engine.gateways${action[0].toUpperCase()}${action.slice(1)}Success`).replace('{name}', name), 'success')
      }
    } catch (err) {
      error = cleanError(err)
      toast(error || t('engine.gatewaysOperationFailed'), 'error')
    } finally {
      busy = ''
      draw()
    }
  }

  draw()
  load()
  return el
}
