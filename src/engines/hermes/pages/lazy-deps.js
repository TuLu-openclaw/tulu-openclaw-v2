import { api } from '../../../lib/tauri-api.js'
import { icon } from '../../../lib/icons.js'
import { t } from '../../../lib/i18n.js'
import { toast } from '../../../components/toast.js'
import {
  canInstallWebExtra,
  canOpenDashboard,
  lazyDependencyState,
  normalizeDashboardProbe,
} from '../lib/lazy-deps-policy.js'

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function message(error) {
  return String(error?.message || error || '').replace(/^Error:\s*/, '')
}

async function openDashboard(url) {
  if (!url) return
  if (window.__TAURI_INTERNALS__ && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(url)) {
    await api.openGlobalBuiltinWindow()
    return
  }
  const win = window.open(url, '_blank', 'noopener,noreferrer')
  if (!win) throw new Error('popup blocked')
}

export function render() {
  const el = document.createElement('div')
  el.className = 'page hm-lazy-deps-page'
  el.dataset.engine = 'hermes'

  let hermes = null
  let probe = normalizeDashboardProbe(null)
  let busy = false
  let loading = true
  let error = ''

  function state() {
    return lazyDependencyState({ hermes, dashboard: probe })
  }

  function draw() {
    const current = state()
    const installAllowed = canInstallWebExtra(current, busy)
    const openAllowed = canOpenDashboard(current, busy)
    const statusClass = current.dashboardRunning ? 'hm-profile-badge--active' : ''

    el.innerHTML = `
      <div class="hm-hero">
        <div class="hm-hero-title">
          <div class="hm-hero-eyebrow">${esc(t('engine.lazyDepsEyebrow'))}</div>
          <h1 class="hm-hero-h1">${esc(t('engine.lazyDepsTitle'))}</h1>
          <div class="hm-hero-sub">${esc(t('engine.lazyDepsDesc'))}</div>
        </div>
        <div class="hm-hero-actions">
          <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-lazy-refresh" ${busy || loading ? 'disabled' : ''}>${icon('refresh-cw', 14)}${esc(t('engine.filesRefresh'))}</button>
          <button class="hm-btn hm-btn--cta hm-btn--sm" id="hm-lazy-install" ${installAllowed ? '' : 'disabled'}>${icon('download', 14)}${esc(busy ? t('engine.lazyDepsWorking') : t('engine.lazyDepsInstall'))}</button>
        </div>
      </div>
      ${error ? `<section class="hm-panel hm-lazy-error"><div class="hm-panel-body">${icon('alert-triangle', 16)}<span>${esc(error)}</span></div></section>` : ''}
      <section class="hm-panel hm-lazy-panel">
        <div class="hm-panel-header">
          <div>
            <div class="hm-panel-title">${esc(t('engine.lazyDepsStatus'))}</div>
            <div class="hm-muted">${esc(t('engine.lazyDepsStatusHint'))}</div>
          </div>
          <span class="hm-profile-badge ${statusClass}">${esc(loading ? t('engine.filesLoading') : current.dashboardRunning ? t('engine.lazyDepsRunning') : t('engine.lazyDepsNotRunning'))}</span>
        </div>
        <div class="hm-panel-body">
          <div class="hm-lazy-grid">
            <div class="hm-lazy-item"><span>${icon(current.hermesInstalled ? 'check-circle' : 'alert-triangle', 18)}<strong>${esc(t('engine.lazyDepsHermes'))}</strong></span><small>${esc(current.hermesInstalled ? t('engine.lazyDepsInstalled') : t('engine.lazyDepsMissing'))}</small></div>
            <div class="hm-lazy-item"><span>${icon(current.hermesConfigured ? 'check-circle' : 'alert-triangle', 18)}<strong>${esc(t('engine.lazyDepsConfig'))}</strong></span><small>${esc(current.hermesConfigured ? t('engine.lazyDepsConfigured') : t('engine.lazyDepsUnconfigured'))}</small></div>
            <div class="hm-lazy-item"><span>${icon(current.dashboardRunning ? 'check-circle' : 'package', 18)}<strong>${esc(t('engine.lazyDepsWeb'))}</strong></span><small>${esc(current.dashboardRunning ? t('engine.lazyDepsAvailable') : t('engine.lazyDepsMayNeedInstall'))}</small></div>
            <div class="hm-lazy-item"><span>${icon('bar-chart', 18)}<strong>${esc(t('engine.lazyDepsEndpoint'))}</strong></span><small><code>${esc(current.probe.url)}</code></small></div>
          </div>
          <div class="hm-lazy-actions">
            <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-lazy-open" ${openAllowed ? '' : 'disabled'}>${icon('monitor', 14)}${esc(t('engine.lazyDepsOpen'))}</button>
            <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-lazy-start" ${busy || current.dashboardRunning || !current.hermesInstalled ? 'disabled' : ''}>${icon('play', 14)}${esc(t('engine.lazyDepsStart'))}</button>
          </div>
        </div>
      </section>
      <section class="hm-panel hm-lazy-note"><div class="hm-panel-body"><strong>${esc(t('engine.lazyDepsSafetyTitle'))}</strong><span>${esc(t('engine.lazyDepsSafetyDesc'))}</span></div></section>
    `

    el.querySelector('#hm-lazy-refresh')?.addEventListener('click', load)
    el.querySelector('#hm-lazy-install')?.addEventListener('click', installWeb)
    el.querySelector('#hm-lazy-start')?.addEventListener('click', startDashboard)
    el.querySelector('#hm-lazy-open')?.addEventListener('click', async () => {
      try { await openDashboard(current.probe.url) } catch (err) { toast(`${t('engine.lazyDepsOpenFailed')}: ${message(err)}`, 'error') }
    })
  }

  async function load() {
    loading = true
    error = ''
    draw()
    try {
      const [info, status] = await Promise.all([api.checkHermes(), api.hermesDashboardProbe().catch(() => null)])
      hermes = info || null
      probe = normalizeDashboardProbe(status)
    } catch (err) {
      error = message(err) || t('engine.lazyDepsLoadFailed')
    } finally {
      loading = false
      draw()
    }
  }

  async function installWeb() {
    if (!canInstallWebExtra(state(), busy)) return
    busy = true
    error = ''
    draw()
    try {
      await api.installHermes('uv-tool', ['web'])
      toast(t('engine.lazyDepsInstalledToast'), 'success')
      await load()
    } catch (err) {
      error = message(err) || t('engine.lazyDepsInstallFailed')
      toast(error, 'error')
    } finally {
      busy = false
      draw()
    }
  }

  async function startDashboard() {
    if (busy || !state().hermesInstalled) return
    busy = true
    error = ''
    draw()
    try {
      const result = await api.hermesDashboardStart()
      probe = normalizeDashboardProbe(result)
      if (probe.running) await openDashboard(probe.url)
      else throw new Error(probe.detail || t('engine.lazyDepsStartFailed'))
    } catch (err) {
      error = message(err) || t('engine.lazyDepsStartFailed')
      toast(error, 'error')
    } finally {
      busy = false
      draw()
    }
  }

  draw()
  load()
  return el
}
