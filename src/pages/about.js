/**
 * 关于页面
 * 版本信息、项目链接、相关项目、系统环境
 */
import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'
import { showUpgradeModal, showConfirm } from '../components/modal.js'
import { setUpgrading } from '../lib/app-state.js'
import { icon, statusIcon } from '../lib/icons.js'
import { t, getLang } from '../lib/i18n.js'
import { getActiveEngineId } from '../lib/engine-manager.js'
import { getGatewayState as getHermesGatewayState } from '../engines/hermes/index.js'

export async function render() {
  const page = document.createElement('div')
  page.className = 'page'

  page.innerHTML = `
    <div class="page-header" style="display:flex;align-items:center;gap:16px">
      <img src="/images/logo-brand.png" alt="屠戮OpenClaw" style="height:48px;width:auto">
      <div>
        <h1 class="page-title" style="margin:0">屠戮OpenClaw</h1>
        <p class="page-desc" style="margin:0">${t('about.subtitle')} · <a style="color:var(--text-secondary)">联系QQ：2552667173</a></p>
      </div>
    </div>
    <div class="stat-cards" id="version-cards">
      <div class="stat-card loading-placeholder"></div>
      <div class="stat-card loading-placeholder"></div>
      <div class="stat-card loading-placeholder"></div>
    </div>
    <div class="config-section">
      <div class="config-section-title">${t('about.sectionCommunity')}</div>
      <div id="community-section"></div>
    </div>
    <div class="config-section">
      <div class="config-section-title">${t('about.sectionProjects')}</div>
      <div id="projects-list"></div>
    </div>
    <div class="config-section">
      <div class="config-section-title">${t('about.sectionContribute')}</div>
      <div id="contribute-section"></div>
    </div>
    <div class="config-section">
      <div class="config-section-title">${t('about.sectionLinks')}</div>
      <div id="links-list"></div>
    </div>
    <div class="config-section">
      <div class="config-section-title">${t('about.sectionAboutUs')}</div>
      <div id="company-section"></div>
    </div>
    <div class="config-section" style="color:var(--text-tertiary);font-size:var(--font-size-xs)">
      <p>${t('about.techStack')}</p>
      <p style="margin-top:8px">${t('about.copyright')}</p>
    </div>
  `

  if (getActiveEngineId() === 'hermes') {
    loadHermesData(page)
  } else {
    loadData(page)
  }
  renderCommunity(page)
  renderProjects(page)
  renderContribute(page)
  renderLinks(page)
  renderCompany(page)
  return page
}

async function loadHermesData(page) {
  const cards = page.querySelector('#version-cards')
  try {
    const [hermesInfo, pythonInfo] = await Promise.all([
      api.checkHermes().catch(() => null),
      api.checkPython().catch(() => null),
    ])

    const panelVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.0'

    let panelUpdateHtml = `<span style="color:var(--text-tertiary)">${t('about.checkingUpdate')}</span>`
    checkNewVersion(cards, panelVersion)

    const installed = !!hermesInfo?.installed
    const hermesGatewayState = getHermesGatewayState()
    const hermesStatus = hermesGatewayState?.status || (hermesInfo?.gatewayRunning ? 'running' : 'offline')
    const hermesStatusText = hermesStatus === 'running'
      ? t('about.gatewayReady')
      : hermesStatus === 'degraded'
        ? t('about.gatewayDegraded')
        : hermesStatus === 'recovering'
          ? t('about.gatewayRecovering')
          : t('about.gatewayStopped')
    const hermesStatusColor = hermesStatus === 'running'
      ? 'var(--success)'
      : hermesStatus === 'degraded' || hermesStatus === 'recovering'
        ? 'var(--warning)'
        : 'var(--text-tertiary)'
    const hermesStatusDot = hermesStatus === 'running'
      ? '●'
      : hermesStatus === 'degraded'
        ? '◐'
        : hermesStatus === 'recovering'
          ? '◌'
          : '○'
    const version = hermesInfo?.hermesVersion || hermesInfo?.version || ''
    const model = hermesInfo?.model || ''
    const port = hermesInfo?.gatewayPort || 8642
    const pyVer = pythonInfo?.version || ''
    const pyPath = pythonInfo?.path || ''

    const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    const btnSm = 'padding:2px 8px;font-size:var(--font-size-xs)'

    cards.innerHTML = `
      <div class="stat-card">
        <div class="stat-card-header"><span class="stat-card-label">屠戮OpenClaw</span></div>
        <div class="stat-card-value">${panelVersion}</div>
        <div class="stat-card-meta" id="panel-update-meta" style="display:flex;align-items:center;gap:8px">${panelUpdateHtml}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header"><span class="stat-card-label">Hermes Agent</span></div>
        <div class="stat-card-value">${installed ? (version || t('about.installed')) : t('about.notInstalled')}</div>
        <div class="stat-card-meta" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="color:${hermesStatusColor}">${hermesStatusDot} Gateway ${hermesStatusText}${hermesStatus === 'offline' ? '' : ` · :${port}`}</span>
          ${model ? `<span style="color:var(--text-secondary)">${t('engine.dashModel')}: ${esc(model)}</span>` : ''}
          ${!installed ? `<a class="btn btn-primary btn-sm" href="#/h/setup" style="${btnSm}">${t('about.hermesSetup')}</a>` : ''}
          ${installed ? `
            <button class="btn btn-secondary btn-sm" id="btn-hermes-config" style="${btnSm}">${t('about.hermesConfig')}</button>
            <button class="btn btn-secondary btn-sm" id="btn-hermes-upgrade" style="${btnSm}">${t('about.hermesUpgrade')}</button>
            <button class="btn btn-danger btn-sm" id="btn-hermes-uninstall" style="${btnSm}">${t('about.hermesUninstall')}</button>
          ` : ''}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header"><span class="stat-card-label">Python</span></div>
        <div class="stat-card-value" style="font-size:var(--font-size-sm)">${pyVer || t('about.notInstalled')}</div>
        <div class="stat-card-meta" style="word-break:break-all">${esc(pyPath)}</div>
      </div>
    `

    // Hermes 管理按钮事件
    if (installed) {
      cards.querySelector('#btn-hermes-config')?.addEventListener('click', async () => {
        try {
          const cfg = await api.hermesReadConfig()
          const maskedKey = cfg.api_key ? cfg.api_key.slice(0, 6) + '••••' + cfg.api_key.slice(-4) : t('about.notSet')
          const overlay = showContentModal({
            title: `Hermes Agent ${t('about.hermesConfig')}`,
            width: 480,
            content: `
              <div style="display:grid;gap:12px;font-size:13px;line-height:1.6">
                <div style="display:flex;gap:8px"><span style="color:var(--text-tertiary);min-width:90px">${t('engine.configProvider')}:</span><span style="word-break:break-all">${esc(cfg.provider || '-')}</span></div>
                <div style="display:flex;gap:8px"><span style="color:var(--text-tertiary);min-width:90px">Base URL:</span><span style="word-break:break-all">${esc(cfg.base_url || '-')}</span></div>
                <div style="display:flex;gap:8px"><span style="color:var(--text-tertiary);min-width:90px">API Key:</span><span style="font-family:monospace">${esc(maskedKey)}</span></div>
                <div style="display:flex;gap:8px"><span style="color:var(--text-tertiary);min-width:90px">${t('engine.configModel')}:</span><span style="word-break:break-all">${esc(cfg.model_raw || cfg.model || '-')}</span></div>
                <div style="display:flex;gap:8px"><span style="color:var(--text-tertiary);min-width:90px">${t('about.hermesConfigFile')}:</span><span style="color:${cfg.config_exists ? 'var(--success)' : 'var(--warning)'}">${cfg.config_exists ? '✓' : '✗'}</span></div>
              </div>
            `,
            buttons: [
              { label: t('about.hermesGoSetup'), className: 'btn btn-primary btn-sm', id: 'btn-goto-setup' },
            ],
          })
          overlay.querySelector('#btn-goto-setup')?.addEventListener('click', () => {
            overlay.close()
            window.location.hash = '#/h/setup'
          })
        } catch (e) {
          toast(t('common.loadFailed') + ': ' + (e.message || e), 'error')
        }
      })

      cards.querySelector('#btn-hermes-upgrade')?.addEventListener('click', async () => {
        const confirmed = await showConfirm(t('about.hermesUpgradeConfirm'))
        if (!confirmed) return

        const modal = showUpgradeModal(t('about.hermesUpgrade') + ' Hermes Agent')
        modal.setProgressLabels({
          preparing: t('about.upgrading'),
          downloading: t('about.upgrading'),
          installing: t('about.upgrading'),
          done: t('about.hermesUpgradeOk', { version: '' }),
        })
        modal.setProgress(10)

        let unlisten = null
        try {
          const { listen } = await import('@tauri-apps/api/event')
          unlisten = await listen('hermes-install-log', (e) => {
            modal.appendLog(String(e.payload))
          })
        } catch (_) {}

        modal.setProgress(20)
        try {
          const ver = await api.updateHermes()
          modal.setProgress(100)
          modal.setDone(t('about.hermesUpgradeOk', { version: ver || '' }))
          modal.onClose(() => loadHermesData(page))
        } catch (e) {
          modal.appendLog(`❌ ${e.message || e}`)
          modal.setError(t('about.hermesUpgradeFail', { error: e.message || e }))
          modal.onClose(() => loadHermesData(page))
        } finally {
          if (unlisten) unlisten()
        }
      })

      cards.querySelector('#btn-hermes-uninstall')?.addEventListener('click', async () => {
        const confirmed = await showConfirm(t('about.hermesUninstallConfirm'))
        if (!confirmed) return
        const cleanConfig = await showConfirm(t('about.hermesUninstallCleanConfig'))

        const modal = showUpgradeModal(t('about.hermesUninstall') + ' Hermes Agent')
        modal.setProgressLabels({
          preparing: t('about.uninstalling'),
          downloading: t('about.uninstalling'),
          installing: t('about.uninstalling'),
          done: t('about.hermesUninstallOk'),
        })
        modal.appendLog('🗑️ ' + t('about.uninstalling'))
        if (cleanConfig) modal.appendLog('📁 ' + t('about.hermesUninstallCleanConfigHint'))
        modal.setProgress(30)

        try {
          const result = await api.uninstallHermes(cleanConfig)
          modal.appendLog('✅ ' + (result || t('about.hermesUninstallOk')))
          modal.setProgress(100)
          modal.setDone(t('about.hermesUninstallOk'))
          modal.onClose(() => loadHermesData(page))
        } catch (e) {
          modal.appendLog(`❌ ${e.message || e}`)
          modal.setError(t('about.hermesUninstallFail', { error: e.message || e }))
          modal.onClose(() => loadHermesData(page))
        }
      })
    }
  } catch {
    cards.innerHTML = `<div class="stat-card"><div class="stat-card-label">${t('common.loadFailed')}</div></div>`
  }
}

async function loadData(page) {
  const cards = page.querySelector('#version-cards')
  try {
    const [version, install] = await Promise.all([
      api.getVersionInfo(),
      api.checkInstallation(),
    ])

    // 尝试从 Tauri API 获取 屠戮OpenClaw 自身版本号，失败则 fallback
    let panelVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.0'
    try {
      const { getVersion } = await import('@tauri-apps/api/app')
      panelVersion = await getVersion()
    } catch {
      // 非 Tauri 环境或 API 不可用，使用构建时注入的版本号
    }

    // 异步检查前端热更新
    let panelUpdateHtml = `<span style="color:var(--text-tertiary)">${t('about.checkingUpdate')}</span>`
    checkHotUpdate(cards, panelVersion)

    const isInstalled = !!version.current
    const sourceLabel = version.source === 'official' ? t('about.official') : version.source === 'chinese' ? t('about.chinese') : t('about.unknownSource')
    const btnSm = 'padding:2px 8px;font-size:var(--font-size-xs)'
    const hasRecommended = !!version.recommended
    const aheadOfRecommended = isInstalled && hasRecommended && !!version.ahead_of_recommended
    const driftFromRecommended = isInstalled && hasRecommended && !version.is_recommended && !aheadOfRecommended
    const policyRiskHint = aheadOfRecommended
      ? t('about.policyAhead', { current: version.current, recommended: version.recommended })
      : t('about.policyDefault')

    cards.innerHTML = `
      <div class="stat-card">
        <div class="stat-card-header"><span class="stat-card-label">屠戮OpenClaw</span></div>
        <div class="stat-card-value">${panelVersion}</div>
        <div class="stat-card-meta" id="panel-update-meta" style="display:flex;align-items:center;gap:8px">${panelUpdateHtml}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header"><span class="stat-card-label">OpenClaw · ${sourceLabel}</span></div>
        <div class="stat-card-value">${version.current || t('about.notInstalled')}</div>
        <div class="stat-card-meta" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${isInstalled && hasRecommended
            ? (aheadOfRecommended
              ? `<span style="color:var(--warning,#f59e0b)">${t('about.aheadOfRecommended', { ver: version.recommended })}</span>
                 <button class="btn btn-primary btn-sm" id="btn-apply-recommended" style="${btnSm}">${t('about.rollbackToRecommended')}</button>`
              : driftFromRecommended
              ? `<span style="color:var(--accent)">${t('about.recommendedStable', { ver: version.recommended })}</span>
                 <button class="btn btn-primary btn-sm" id="btn-apply-recommended" style="${btnSm}">${t('about.switchToRecommended')}</button>`
              : `<span style="color:var(--success)">${t('about.isRecommended')}</span>`)
            : ''}
          ${version.latest_update_available && version.latest ? `<span style="color:var(--text-tertiary)">${t('about.latestUpstream', { ver: version.latest })}</span>` : ''}
          <button class="btn btn-${isInstalled ? 'secondary' : 'primary'} btn-sm" id="btn-version-mgmt" style="${btnSm}">
            ${isInstalled ? t('about.switchVersion') : t('about.installOpenclaw')}
          </button>
          ${isInstalled ? `<button class="btn btn-secondary btn-sm" id="btn-uninstall" style="${btnSm};color:var(--error)">${t('about.uninstall')}</button>` : ''}
        </div>
        <div style="margin-top:8px;font-size:var(--font-size-xs);color:var(--text-tertiary);line-height:1.6">
          ${policyRiskHint}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card-header"><span class="stat-card-label">${t('about.installPath')}</span></div>
        <div class="stat-card-value" style="font-size:var(--font-size-sm);word-break:break-all">${install.path || t('common.unknown')}</div>
        <div class="stat-card-meta">${install.installed ? t('about.configExists') : t('about.configNotFound')}</div>
      </div>
    `

    const applyRecommendedBtn = cards.querySelector('#btn-apply-recommended')
    if (applyRecommendedBtn && version.recommended) {
      applyRecommendedBtn.onclick = () => doInstall(page, aheadOfRecommended ? t('about.rollbackToRecommendedStable') : t('about.switchToRecommendedStable'), version.source, version.recommended)
    }

    // 版本管理 / 安装
    const versionMgmtBtn = cards.querySelector('#btn-version-mgmt')
    if (versionMgmtBtn) {
      versionMgmtBtn.onclick = () => showVersionPicker(page, version)
    }

    // 卸载
    const uninstallBtn = cards.querySelector('#btn-uninstall')
    if (uninstallBtn) {
      uninstallBtn.onclick = async () => {
        const confirmed = await showConfirm(t('about.confirmUninstall'))
        if (!confirmed) return
        const modal = showUpgradeModal(t('about.uninstallTitle'))
        modal.onClose(() => loadData(page))
        modal.appendLog(t('about.uninstallStarting'))
        let unlistenLog, unlistenProgress, unlistenDone, unlistenError
        const cleanup = () => { unlistenLog?.(); unlistenProgress?.(); unlistenDone?.(); unlistenError?.() }
        try {
          if (window.__TAURI_INTERNALS__) {
            const { listen } = await import('@tauri-apps/api/event')
            unlistenLog = await listen('upgrade-log', (e) => modal.appendLog(e.payload))
            unlistenProgress = await listen('upgrade-progress', (e) => modal.setProgress(e.payload))
            unlistenDone = await listen('upgrade-done', (e) => { cleanup(); modal.setDone(typeof e.payload === 'string' ? e.payload : t('about.uninstallDone')) })
            unlistenError = await listen('upgrade-error', (e) => { cleanup(); modal.setError(t('about.uninstallFailed') + (e.payload || t('common.unknown'))) })
            await api.uninstallOpenclaw(false)
            modal.appendLog(t('about.uninstallTaskStarted'))
          } else {
            const msg = await api.uninstallOpenclaw(false)
            modal.setDone(typeof msg === 'string' ? msg : t('about.uninstallDone'))
            cleanup()
          }
        } catch (e) {
          cleanup()
          modal.setError(t('about.uninstallFailed') + (e?.message || e))
        }
      }
    }
  } catch {
    cards.innerHTML = `<div class="stat-card"><div class="stat-card-label">${t('common.loadFailed')}</div></div>`
  }
}

/**
 * 版本选择器弹窗 — 选择版本（汉化版/原版）+ 版本号
 */
async function showVersionPicker(page, currentVersion) {
  const isInstalled = !!currentVersion.current
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="modal-title">${isInstalled ? t('about.switchVersion') : t('about.installOpenclaw')}</div>
      <div style="display:flex;flex-direction:column;gap:16px;margin:16px 0">
        <div>
          <label style="font-size:var(--font-size-sm);color:var(--text-secondary);display:block;margin-bottom:8px">${t('about.versionLabel')}</label>
          <div style="display:flex;gap:8px">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 12px;border-radius:8px;border:1px solid var(--border);font-size:var(--font-size-sm);flex:1;justify-content:center;transition:all .15s" id="lbl-official">
              <input type="radio" name="oc-source" value="official" ${currentVersion.source !== 'chinese' ? 'checked' : ''} style="accent-color:var(--primary)">
              ${t('about.official')}
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 12px;border-radius:8px;border:1px solid var(--border);font-size:var(--font-size-sm);flex:1;justify-content:center;transition:all .15s" id="lbl-chinese">
              <input type="radio" name="oc-source" value="chinese" ${currentVersion.source === 'chinese' ? 'checked' : ''} style="accent-color:var(--primary)">
              ${t('about.chinese')}
            </label>
          </div>
        </div>
        <div>
          <label style="font-size:var(--font-size-sm);color:var(--text-secondary);display:block;margin-bottom:8px">${t('about.selectVersion')}</label>
          <select id="oc-version-select" class="input" style="width:100%;padding:8px 12px;font-size:var(--font-size-sm)">
            <option value="">${t('common.loading')}</option>
          </select>
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--text-tertiary);line-height:1.6;padding:10px 12px;border-radius:8px;background:var(--bg-tertiary)">
          ${t('about.versionPickerHint')}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;min-height:18px">
          <div id="oc-action-hint" style="font-size:var(--font-size-xs);color:var(--text-tertiary)"></div>
          <div id="nightly-toggle" style="display:none"></div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary btn-sm" data-action="cancel">${t('common.cancel')}</button>
        <button class="btn btn-primary btn-sm" data-action="confirm" disabled id="oc-confirm-btn">${isInstalled ? t('about.btnSwitch') : t('about.btnInstall')}</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  const select = overlay.querySelector('#oc-version-select')
  const confirmBtn = overlay.querySelector('#oc-confirm-btn')
  const hintEl = overlay.querySelector('#oc-action-hint')
  const radios = overlay.querySelectorAll('input[name="oc-source"]')
  const lblChinese = overlay.querySelector('#lbl-chinese')
  const lblOfficial = overlay.querySelector('#lbl-official')

  const close = () => overlay.remove()
  overlay.querySelector('[data-action="cancel"]').onclick = close
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close() })

  let versionsCache = {}
  let currentSelect = currentVersion.source === 'chinese' ? 'chinese' : 'official'

  function updateRadioStyle() {
    const sel = currentSelect
    lblChinese.style.borderColor = sel !== 'official' ? 'var(--primary)' : 'var(--border)'
    lblChinese.style.background = sel !== 'official' ? 'var(--primary-bg, rgba(99,102,241,0.06))' : ''
    lblOfficial.style.borderColor = sel === 'official' ? 'var(--primary)' : 'var(--border)'
    lblOfficial.style.background = sel === 'official' ? 'var(--primary-bg, rgba(99,102,241,0.06))' : ''
  }

  function updateHint() {
    const targetSource = currentSelect
    const targetVer = select.value
    if (!targetVer || targetVer === '') { hintEl.textContent = ''; confirmBtn.disabled = true; return }
    const targetTag = select.selectedIndex === 0 ? t('about.tagRecommended') : t('about.tagNeedTest')

    const sameSource = targetSource === currentVersion.source

    if (!isInstalled) {
      confirmBtn.textContent = t('about.btnInstall')
      hintEl.textContent = t('about.hintInstall', { source: targetSource === 'official' ? t('about.official') : targetSource === 'chinese' ? t('about.chinese') : t('about.unknownSource'), ver: targetVer, tag: targetTag })
      confirmBtn.disabled = false
      return
    }

    if (!sameSource) {
      confirmBtn.textContent = t('about.btnSwitch')
      hintEl.innerHTML = `${t('about.hintCurrent')}: <strong>${currentVersion.source === 'official' ? t('about.official') : currentVersion.source === 'chinese' ? t('about.chinese') : t('about.unknownSource')} ${currentVersion.current}</strong> → <strong>${targetSource === 'official' ? t('about.official') : targetSource === 'chinese' ? t('about.chinese') : t('about.unknownSource')} ${targetVer}</strong>${targetTag}`
      confirmBtn.disabled = false
      return
    }

    // 同源，比较版本
    const parseVer = v => v.split(/[^0-9]/).filter(Boolean).map(Number)
    const cur = parseVer(currentVersion.current)
    const tgt = parseVer(targetVer)
    let cmp = 0
    for (let i = 0; i < Math.max(cur.length, tgt.length); i++) {
      if ((tgt[i] || 0) > (cur[i] || 0)) { cmp = 1; break }
      if ((tgt[i] || 0) < (cur[i] || 0)) { cmp = -1; break }
    }

    if (cmp === 0) {
      confirmBtn.textContent = t('about.btnReinstall')
      hintEl.textContent = t('about.hintAlreadyVersion', { ver: targetVer, tag: targetTag })
      confirmBtn.disabled = false
    } else if (cmp > 0) {
      confirmBtn.textContent = t('about.btnUpgrade')
      hintEl.innerHTML = `<span style="color:var(--accent)">${currentVersion.current} → ${targetVer}${targetTag}</span>`
      confirmBtn.disabled = false
    } else {
      confirmBtn.textContent = t('about.btnDowngrade')
      hintEl.innerHTML = `<span style="color:var(--warning,#f59e0b)">${currentVersion.current} → ${targetVer}${targetTag}</span>`
      confirmBtn.disabled = false
    }
  }

  let showNightly = false

  async function loadVersions(source) {
    select.innerHTML = `<option value="">${t('common.loading')}</option>`
    confirmBtn.disabled = true
    hintEl.textContent = ''
    try {
      if (!versionsCache[source]) {
        versionsCache[source] = await api.listOpenclawVersions(source)
      }
      const allVersions = versionsCache[source]
      if (!allVersions || !allVersions.length) {
        select.innerHTML = `<option value="">${t('about.noVersions')}</option>`
        return
      }
      const stable = allVersions.filter(v => !v.includes('nightly') && !v.includes('canary') && !v.includes('alpha') && !v.includes('beta') && !v.includes('rc') && !v.includes('dev') && !v.includes('next'))
      const versions = showNightly ? allVersions : (stable.length > 0 ? stable : allVersions)
      const nightlyCount = allVersions.length - stable.length
      select.innerHTML = versions.map((v, idx) => {
        const isCurrent = isInstalled && v === currentVersion.current && source === currentVersion.source
        return `<option value="${v}">${v}${idx === 0 ? ` (${t('about.recommended')})` : ''}${isCurrent ? ` (${t('about.current')})` : ''}</option>`
      }).join('')
      // nightly 切换提示
      const toggleEl = overlay.querySelector('#nightly-toggle')
      if (toggleEl) {
        if (nightlyCount > 0) {
          toggleEl.style.display = ''
          toggleEl.innerHTML = showNightly
            ? `<a href="#" id="btn-toggle-nightly" style="color:var(--primary);text-decoration:none;font-size:var(--font-size-xs)">${t('about.hidePreview', { count: nightlyCount })}</a>`
            : `<a href="#" id="btn-toggle-nightly" style="color:var(--text-tertiary);text-decoration:none;font-size:var(--font-size-xs)">${t('about.showPreview', { count: nightlyCount })}</a>`
          toggleEl.querySelector('#btn-toggle-nightly').onclick = (e) => { e.preventDefault(); showNightly = !showNightly; loadVersions(source) }
        } else {
          toggleEl.style.display = 'none'
        }
      }
      updateHint()
    } catch (e) {
      select.innerHTML = `<option value="">${t('common.loadFailed')}: ${e.message || e}</option>`
    }
  }

  radios.forEach(radio => {
    radio.addEventListener('change', () => {
      currentSelect = radio.value
      updateRadioStyle()
      loadVersions(currentSelect)
    })
  })

  select.addEventListener('change', updateHint)

  confirmBtn.onclick = () => {
    const source = currentSelect
    const ver = select.value
    const action = confirmBtn.textContent
    close()
    doInstall(page, `${action} OpenClaw`, source, ver)
  }

  updateRadioStyle()
  loadVersions(currentSelect)
}

/**
 * 执行安装/升级/降级/切换操作（带进度弹窗）
 */
async function doInstall(page, title, source, version) {
  const modal = showUpgradeModal(title)
  modal.onClose(() => loadData(page))
  let unlistenLog, unlistenProgress, unlistenDone, unlistenError
  setUpgrading(true)

  const cleanup = () => {
    setUpgrading(false)
    unlistenLog?.(); unlistenProgress?.(); unlistenDone?.(); unlistenError?.()
  }

  try {
    if (window.__TAURI_INTERNALS__) {
      const { listen } = await import('@tauri-apps/api/event')
      unlistenLog = await listen('upgrade-log', (e) => modal.appendLog(e.payload))
      unlistenProgress = await listen('upgrade-progress', (e) => modal.setProgress(e.payload))

      unlistenDone = await listen('upgrade-done', (e) => {
        cleanup()
        modal.setDone(typeof e.payload === 'string' ? e.payload : t('about.operationDone'))
      })

      unlistenError = await listen('upgrade-error', async (e) => {
        cleanup()
        const errStr = String(e.payload || t('common.unknown'))
        modal.appendLog(errStr)
        const { diagnoseInstallError } = await import('../lib/error-diagnosis.js')
        const fullLog = modal.getLogText() + '\n' + errStr
        const diagnosis = diagnoseInstallError(fullLog)
        modal.setError(diagnosis.title)
        if (diagnosis.hint) modal.appendLog('')
        if (diagnosis.hint) modal.appendHtmlLog(`${statusIcon('info', 14)} ${diagnosis.hint}`)
        if (diagnosis.command) modal.appendHtmlLog(`${icon('clipboard', 14)} ${diagnosis.command}`)
        if (window.__openAIDrawerWithError) {
          window.__openAIDrawerWithError({ title: diagnosis.title, error: fullLog, scene: title, hint: diagnosis.hint })
        }
      })

      await api.upgradeOpenclaw(source, version)
      modal.appendLog(t('about.taskStarted'))
    } else {
      modal.appendLog(t('about.webModeNoLog'))
      const msg = await api.upgradeOpenclaw(source, version)
      modal.setDone(typeof msg === 'string' ? msg : (msg?.message || t('about.operationDone')))
      cleanup()
    }
  } catch (e) {
    cleanup()
    const errStr = String(e)
    modal.appendLog(errStr)
    const { diagnoseInstallError } = await import('../lib/error-diagnosis.js')
    const fullLog = modal.getLogText() + '\n' + errStr
    const diagnosis = diagnoseInstallError(fullLog)
    modal.setError(diagnosis.title)
  }
}

async function checkHotUpdate(cards, panelVersion) {
  const el = () => cards.querySelector('#panel-update-meta')
  try {
    const info = await api.checkFrontendUpdate()
    const meta = el()
    if (!meta) return

    if (info.updateReady) {
      // 已下载更新，等待重载
      const ver = info.manifest?.version || info.latestVersion || ''
      meta.innerHTML = `
        <span style="color:var(--accent)">v${ver} ${t('about.updateReady')}</span>
        <button class="btn btn-primary btn-sm" id="btn-hot-reload" style="padding:2px 8px;font-size:var(--font-size-xs)">${t('about.reloadApp')}</button>
        <button class="btn btn-secondary btn-sm" id="btn-hot-rollback" style="padding:2px 8px;font-size:var(--font-size-xs)">${t('about.rollback')}</button>
      `
      meta.querySelector('#btn-hot-reload')?.addEventListener('click', () => {
        window.location.reload()
      })
      meta.querySelector('#btn-hot-rollback')?.addEventListener('click', async () => {
        try {
          await api.rollbackFrontendUpdate()
          toast(t('about.rollbackSuccess'), 'success')
          setTimeout(() => window.location.reload(), 800)
        } catch (e) {
          toast(t('about.rollbackFailed') + (e.message || e), 'error')
        }
      })
    } else if (info.hasUpdate) {
      // 有新版本可下载
      const ver = info.latestVersion
      const manifest = info.manifest || {}
      const changelog = manifest.changelog || ''
      meta.innerHTML = `
        <span style="color:var(--accent)">${t('about.newVersion')}: v${ver}</span>
        ${changelog ? `<span style="color:var(--text-tertiary);font-size:var(--font-size-xs)">${changelog}</span>` : ''}
        <button class="btn btn-primary btn-sm" id="btn-hot-download" style="padding:2px 8px;font-size:var(--font-size-xs)">${t('about.hotUpdate')}</button>
        <a class="btn btn-secondary btn-sm" href="https://github.com/qingchencloud/屠戮OpenClaw/releases" target="_blank" rel="noopener" style="padding:2px 8px;font-size:var(--font-size-xs)">${t('about.fullInstaller')}</a>
      `
      meta.querySelector('#btn-hot-download')?.addEventListener('click', async () => {
        const btn = meta.querySelector('#btn-hot-download')
        if (btn) { btn.disabled = true; btn.textContent = t('about.downloading') }
        try {
          await api.downloadFrontendUpdate(manifest.url, manifest.hash || '')
          toast(t('about.downloadDone'), 'success')
          checkHotUpdate(cards, panelVersion)
        } catch (e) {
          toast(t('about.downloadFailed') + (e.message || e), 'error')
          if (btn) { btn.disabled = false; btn.textContent = t('about.retry') }
        }
      })
    } else if (!info.compatible) {
      meta.innerHTML = `<span style="color:var(--text-tertiary)">${t('about.needFullUpdate')}</span> <a class="btn btn-secondary btn-sm" href="https://github.com/qingchencloud/屠戮OpenClaw/releases" target="_blank" rel="noopener" style="padding:2px 8px;font-size:var(--font-size-xs)">GitHub</a> <span style="color:var(--text-tertiary);font-size:var(--font-size-xs)">联系QQ：2552667173</span>`
    } else {
      meta.innerHTML = `<span style="color:var(--success)">${t('about.upToDate')}</span>`
    }
  } catch (err) {
    const meta = el()
    if (!meta) return
    meta.innerHTML = `<span style="color:var(--text-tertiary)">${t('about.checkUpdateFailed')}</span> <span style="color:var(--text-secondary);font-size:var(--font-size-xs)">联系QQ：2552667173</span>`
  }
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

function renderCommunity(page) {
  const el = page.querySelector('#community-section')
  el.innerHTML = `
    <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">
      <div style="text-align:center">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=http://wpa.qq.com/msgrd?v=3&uin=916149901&site=qq&menu=yes" alt="反馈交流群" style="width:140px;height:140px;border-radius:var(--radius-md);border:1px solid var(--border-primary)">
        <div style="font-size:var(--font-size-sm);margin-top:8px;color:var(--text-secondary)">反馈交流群</div>
      </div>
      <div style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:8px;padding-top:4px">
        <div style="font-size:var(--font-size-md);color:var(--text-primary);font-weight:600">交流反馈请联系QQ群</div>
        <div style="font-size:var(--font-size-sm);color:var(--text-secondary)">遇到问题或有建议，欢迎加群交流</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
          <a class="btn btn-primary btn-sm" href="http://wpa.qq.com/msgrd?v=3&uin=916149901&site=qq&menu=yes" target="_blank" rel="noopener">加群交流</a>
        </div>
      </div>
    </div>
  `
}

const PROJECTS = [
  {
    name: 'OpenClaw',
    desc: t('about.projectOpenClaw'),
    url: 'https://github.com/openclaw/openclaw',
  },
  {
    name: 'OpenClaw-zh',
    desc: t('about.projectOpenClawZh'),
    url: 'https://github.com/1186258278/OpenClawChineseTranslation',
  },
  {
    name: '屠戮OpenClaw',
    desc: t('about.project屠戮OpenClaw'),
    url: 'https://github.com/qingchencloud/屠戮OpenClaw',
    gitee: 'https://gitee.com/QtCodeCreators/屠戮OpenClaw',
  },
  {
    name: 'ClawApp',
    desc: t('about.projectClawApp'),
    url: 'https://github.com/qingchencloud/clawapp',
  },
  {
    name: 'cftunnel',
    desc: t('about.projectCftunnel'),
    url: 'https://github.com/qingchencloud/cftunnel',
  },
]

function renderProjects(page) {
  const el = page.querySelector('#projects-list')
  el.innerHTML = `
    <div class="locked-section" id="projects-locked" style="text-align:center;padding:24px;color:var(--text-tertiary)">
      <div style="font-size:32px;margin-bottom:8px">🔒</div>
      <div style="font-size:var(--font-size-sm);margin-bottom:12px">相关内容已上锁</div>
      <input type="password" id="projects-pwd" placeholder="请输入解锁密码" style="padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-primary);font-size:var(--font-size-sm);width:180px;text-align:center">
      <button onclick="unlockProjects()" style="padding:6px 16px;border-radius:6px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-primary);font-size:var(--font-size-sm);cursor:pointer;margin-left:4px">解锁</button>
      <div id="projects-error" style="color:var(--error);font-size:var(--font-size-xs);margin-top:6px;display:none">密码错误</div>
    </div>
    <div id="projects-content" style="display:none"></div>
  `

  window.unlockProjects = function() {
    const pwd = el.querySelector('#projects-pwd').value
    if (pwd === '2552667173') {
      el.querySelector('#projects-locked').style.display = 'none'
      const content = el.querySelector('#projects-content')
      content.style.display = ''
      content.innerHTML = PROJECTS.map(p => `
        <div class="service-card">
          <div class="service-info">
            <div>
              <div class="service-name">${p.name}</div>
              <div class="service-desc">${p.desc}</div>
            </div>
          </div>
          <div class="service-actions">
            <a class="btn btn-secondary btn-sm" href="${p.url}" target="_blank" rel="noopener">GitHub</a>
            ${p.gitee ? `<a class="btn btn-secondary btn-sm" href="${p.gitee}" target="_blank" rel="noopener">${t('about.domesticMirror')}</a>` : ''}
          </div>
        </div>
      `).join('')
    } else {
      const err = el.querySelector('#projects-error')
      err.style.display = ''
      setTimeout(() => { err.style.display = 'none' }, 2000)
    }
  }
}

const LINKS = [
  { label: '联系作者', url: 'http://wpa.qq.com/msgrd?v=3&uin=2552667173&site=qq&menu=yes' },
  { label: t('about.linkOpenClawZh'), url: 'https://github.com/1186258278/OpenClawChineseTranslation' },
]

function renderContribute(page) {
  const el = page.querySelector('#contribute-section')
  el.innerHTML = `
    <div class="locked-section" id="contribute-locked" style="text-align:center;padding:24px;color:var(--text-tertiary)">
      <div style="font-size:32px;margin-bottom:8px">🔒</div>
      <div style="font-size:var(--font-size-sm);margin-bottom:12px">相关内容已上锁</div>
      <input type="password" id="contribute-pwd" placeholder="请输入解锁密码" style="padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-primary);font-size:var(--font-size-sm);width:180px;text-align:center">
      <button onclick="unlockContribute()" style="padding:6px 16px;border-radius:6px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-primary);font-size:var(--font-size-sm);cursor:pointer;margin-left:4px">解锁</button>
      <div id="contribute-error" style="color:var(--error);font-size:var(--font-size-xs);margin-top:6px;display:none">密码错误</div>
    </div>
    <div id="contribute-content" style="display:none">
      <div style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:12px">${t('about.contributeDesc')}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        <a class="btn btn-primary btn-sm" href="https://github.com/qingchencloud/屠戮OpenClaw/issues/new" target="_blank" rel="noopener">${t('about.submitIssue')}</a>
        <a class="btn btn-secondary btn-sm" href="https://github.com/qingchencloud/屠戮OpenClaw/pulls" target="_blank" rel="noopener">${t('about.submitPR')}</a>
        <a class="btn btn-secondary btn-sm" href="https://github.com/qingchencloud/屠戮OpenClaw/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener">${t('about.contributeGuide')}</a>
        <a class="btn btn-secondary btn-sm" href="https://github.com/qingchencloud/屠戮OpenClaw/issues" target="_blank" rel="noopener">${t('about.viewIssues')}</a>
      </div>
      <div style="margin-top:8px;font-size:var(--font-size-xs);color:var(--text-tertiary)">${t('about.domesticMirrorHint')}</div>
    </div>
  `

  window.unlockContribute = function() {
    const pwd = el.querySelector('#contribute-pwd').value
    if (pwd === '2552667173') {
      el.querySelector('#contribute-locked').style.display = 'none'
      el.querySelector('#contribute-content').style.display = ''
    } else {
      const err = el.querySelector('#contribute-error')
      err.style.display = ''
      setTimeout(() => { err.style.display = 'none' }, 2000)
    }
  }
}

function renderLinks(page) {
  const el = page.querySelector('#links-list')
  el.innerHTML = `
    <div class="locked-section" id="links-locked" style="text-align:center;padding:24px;color:var(--text-tertiary)">
      <div style="font-size:32px;margin-bottom:8px">🔒</div>
      <div style="font-size:var(--font-size-sm);margin-bottom:12px">相关内容已上锁</div>
      <input type="password" id="links-pwd" placeholder="请输入解锁密码" style="padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-primary);font-size:var(--font-size-sm);width:180px;text-align:center">
      <button onclick="unlockLinks()" style="padding:6px 16px;border-radius:6px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-primary);font-size:var(--font-size-sm);cursor:pointer;margin-left:4px">解锁</button>
      <div id="links-error" style="color:var(--error);font-size:var(--font-size-xs);margin-top:6px;display:none">密码错误</div>
    </div>
    <div id="links-content" style="display:none">
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-sm)">
        ${LINKS.map(l => `<a class="btn ${l.primary ? 'btn-primary' : 'btn-secondary'} btn-sm" href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`).join('')}
      </div>
    </div>
  `

  window.unlockLinks = function() {
    const pwd = el.querySelector('#links-pwd').value
    if (pwd === '2552667173') {
      el.querySelector('#links-locked').style.display = 'none'
      el.querySelector('#links-content').style.display = ''
    } else {
      const err = el.querySelector('#links-error')
      err.style.display = ''
      setTimeout(() => { err.style.display = 'none' }, 2000)
    }
  }
}

function renderCompany(page) {
  const el = page.querySelector('#company-section')
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;align-items:center;gap:12px">
        <img src="/images/logo-brand.png" alt="屠戮网络科技" style="width:40px;height:40px;border-radius:10px;flex-shrink:0">
        <div>
          <div style="font-weight:700;font-size:var(--font-size-md)">屠戮网络科技有限公司</div>
          <div style="font-size:var(--font-size-sm);color:var(--text-secondary)">屠戮 OpenClaw</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;font-size:var(--font-size-sm)">
        <div style="padding:12px;border-radius:var(--radius-md);border:1px solid var(--border-primary);background:var(--bg-secondary)">
          <div style="color:var(--text-tertiary);font-size:var(--font-size-xs);margin-bottom:4px">联系作者</div>
          <a href="http://wpa.qq.com/msgrd?v=3&uin=2552667173&site=qq&menu=yes" target="_blank" rel="noopener" style="color:var(--accent)">QQ：2552667173</a>
        </div>
        <div style="padding:12px;border-radius:var(--radius-md);border:1px solid var(--border-primary);background:var(--bg-secondary);text-align:center">
          <div style="color:var(--text-tertiary);font-size:var(--font-size-xs);margin-bottom:4px">扫码添加作者</div>
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=http://wpa.qq.com/msgrd?v=3&uin=2552667173&site=qq&menu=yes" alt="QQ二维码" style="width:100px;height:100px;border-radius:6px;cursor:pointer" onclick="showQRPreview(this.src, 'QQ: 2552667173')">
        </div>
      </div>
      <div style="font-size:var(--font-size-xs);color:var(--text-tertiary);line-height:1.6">
        屠戮 OpenClaw · 正版授权 · 2.0.0
      </div>
    </div>
  `

  window.showQRPreview = function(src, label) {
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `
      <div class="modal" style="max-width:360px;text-align:center">
        <div class="modal-title">${label || '二维码'}</div>
        <img src="${src}" alt="二维码" style="width:240px;height:240px;border-radius:8px;margin:12px auto;display:block">
        <div class="modal-actions" style="margin-top:16px">
          <button class="btn btn-secondary btn-sm" data-action="close">关闭</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove() })
    overlay.querySelector('[data-action="close"]').onclick = () => overlay.remove()
  }
}

// 版本检测（热更新检测），渲染 #panel-update-meta
async function checkNewVersion(cards, panelVersion) {
  const el = () => cards.querySelector('#panel-update-meta')
  try {
    const info = await api.checkPanelUpdate()
    const meta = el()
    if (!meta) return
    if (!info || !info.available) {
      meta.innerHTML = `<span style="color:var(--success)">${t('about.upToDate')}</span>`
      return
    }
    const latest = info.latest || ''
    meta.innerHTML = `
      <span style="color:var(--warning)">${t('about.updateAvailable', { version: latest })}</span>
      <button class="btn btn-primary btn-sm" id="btn-panel-update" style="padding:1px 7px;font-size:var(--font-size-xs)">${t('about.updateNow')}</button>
    `
    meta.querySelector('#btn-panel-update')?.addEventListener('click', async () => {
      const confirmed = await showConfirm(t('about.updateConfirm', { version: latest }))
      if (!confirmed) return
      try {
        setUpgrading(true)
        await api.downloadFrontendUpdate(info.url, info.hash || '')
        toast(t('about.updateDownloaded'), 'success')
        setTimeout(() => location.reload(), 1500)
      } catch (e) {
        setUpgrading(false)
        toast(t('about.updateFailed') + ': ' + (e.message || e), 'error')
      }
    })
  } catch (e) {
    const meta = el()
    if (meta) meta.innerHTML = `<span style="color:var(--text-tertiary)">${t('about.updateCheckFail')}</span>`
  }
}
