/**
 * Hermes Agent 仪表盘 - 企业级现代化 UI
 */
import { t } from '../../../lib/i18n.js'
import { api } from '../../../lib/tauri-api.js'
import { PROVIDER_PRESETS } from '../../../lib/model-presets.js'
import '../hermes.css'

const HERMES_PROVIDERS = PROVIDER_PRESETS.filter(p => !p.hidden)

let _listenFn = null
async function tauriListen(event, cb) {
  if (!_listenFn) {
    const mod = await import('@tauri-apps/api/event')
    _listenFn = mod.listen
  }
  return _listenFn(event, cb)
}

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') }

export function render() {
  const el = document.createElement('div')
  el.className = 'hm-dashboard'

  let info = null
  let health = null
  let hermesConfig = null
  let models = []
  let loading = true
  let actionBusy = false
  let modelBusy = false
  let fetchBusy = false
  let cfgMsg = ''
  let showDropdown = false
  let envDetecting = false
  let envData = null
  let connectMode = 'local'
  let customGwUrl = ''
  let connectMsg = ''
  let modelConfigCollapsed = true
  let activeSection = 'status'

  let formBaseUrl = ''
  let formApiKey = ''
  let formModel = ''
  let formInited = false

  function syncFormFromDom() {
    const u = el.querySelector('#hm-cfg-baseurl')
    const k = el.querySelector('#hm-cfg-apikey')
    const m = el.querySelector('#hm-cfg-model')
    if (u) formBaseUrl = u.value
    if (k) formApiKey = k.value
    if (m) formModel = m.value
  }

  const isWin = navigator.platform?.startsWith('Win') || navigator.userAgent?.includes('Windows')
  const configPath = isWin ? '%USERPROFILE%\\.hermes' : '~/.hermes'

  const CLI_COMMANDS = [
    { label: t('engine.cliChat'),       desc: t('engine.cliChatDesc'),      cmd: 'hermes chat' },
    { label: t('engine.cliDoctor'),     desc: t('engine.cliDoctorDesc'),    cmd: 'hermes doctor' },
    { label: t('engine.cliVersion'),   desc: t('engine.cliVersionDesc'),   cmd: 'hermes version' },
    { label: t('engine.cliGwStart'),   desc: t('engine.cliGwStartDesc'),   cmd: 'hermes gateway run' },
    { label: t('engine.cliGwStop'),    desc: t('engine.cliGwStopDesc'),    cmd: 'hermes gateway stop' },
    { label: t('engine.cliUpgrade'),   desc: t('engine.cliUpgradeDesc'),   cmd: 'uv tool install --reinstall "hermes-agent @ git+https://github.com/NousResearch/hermes-agent.git" --python 3.11' },
    { label: t('engine.cliUninstall'), desc: t('engine.cliUninstallDesc'), cmd: 'uv tool uninstall hermes-agent' },
    { label: t('engine.cliConfig'),    desc: t('engine.cliConfigDesc'),    cmd: isWin ? `explorer ${configPath}` : `open ${configPath}` },
  ]

  function renderCliCommands() {
    return CLI_COMMANDS.map((c, i) =>
      `<div class="hm-cli-row">
        <div class="hm-cli-info">
          <span class="hm-cli-label">${c.label}</span>
          <span class="hm-cli-desc">${c.desc}</span>
        </div>
        <div class="hm-cli-cmd-wrap">
          <code class="hm-cli-cmd">${esc(c.cmd)}</code>
          <button class="hm-cli-copy" data-cmd-idx="${i}" title="${t('common.copy')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          </button>
        </div>
      </div>`
    ).join('')
  }

  function draw() {
    if (loading) {
      el.innerHTML = `<div class="hm-dashboard-loading">
        <div class="hm-skeleton-header"></div>
        <div class="hm-skeleton-grid">${[1,2,3,4].map(()=>`<div class="hm-skeleton-card"></div>`).join('')}</div>
        <div class="hm-skeleton-section"></div>
        <div class="hm-skeleton-section"></div>
      </div>`
      return
    }

    const gwRunning = info?.gatewayRunning
    const port = info?.gatewayPort || 8642
    const version = info?.version || '-'
    const modelName = formModel || hermesConfig?.model || health?.model || info?.model || ''
    const displayModel = modelName || t('engine.dashNoModel')
    const activePreset = HERMES_PROVIDERS.find(p => formBaseUrl === p.baseUrl)

    const statusColor = gwRunning ? 'var(--success)' : 'var(--error)'
    const statusBg = gwRunning ? 'var(--success-muted)' : 'var(--error-muted)'
    const statusLabel = gwRunning ? t('engine.dashRunning') : t('engine.dashStopped')

    const dropdownHtml = showDropdown && models.length
      ? `<div id="hm-model-dropdown" class="hm-dropdown">${models.map(m =>
          `<div class="hm-dropdown-opt${m === formModel ? ' active' : ''}" data-model="${esc(m)}">${esc(m)}</div>`
        ).join('')}</div>`
      : ''

    el.innerHTML = `
      <!-- 页面 Header -->
      <div class="hm-header">
        <div class="hm-header-left">
          <div class="hm-header-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5" width="22" height="22">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <h1 class="hm-header-title">${t('engine.hermesDashboardTitle')}</h1>
            <div class="hm-header-sub">${gwRunning ? `127.0.0.1:${port}` : t('engine.gatewayStopped')}</div>
          </div>
        </div>
        <div class="hm-header-right">
          <span class="hm-status-badge" style="background:${statusBg};color:${statusColor}">
            <span class="hm-status-dot" style="background:${statusColor}"></span>
            ${statusLabel}
          </span>
          <button class="hm-btn-icon" id="hm-btn-refresh" title="Refresh">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
          </button>
        </div>
      </div>

      <!-- 状态概览卡片 -->
      <div class="hm-overview-grid">
        <div class="hm-stat-card hm-stat-primary">
          <div class="hm-stat-label">${t('engine.dashGatewayStatus')}</div>
          <div class="hm-stat-value" style="color:${statusColor}">${statusLabel}</div>
          <div class="hm-stat-sub">${gwRunning ? `Port ${port}` : t('engine.gatewayStopped')}</div>
        </div>
        <div class="hm-stat-card">
          <div class="hm-stat-label">${t('engine.dashModel')}</div>
          <div class="hm-stat-value hm-stat-model">${esc(displayModel)}</div>
          <div class="hm-stat-sub">${activePreset ? activePreset.label : t('engine.configProvider')}</div>
        </div>
        <div class="hm-stat-card">
          <div class="hm-stat-label">${t('engine.dashVersion')}</div>
          <div class="hm-stat-value">${version}</div>
          <div class="hm-stat-sub">Hermes Agent</div>
        </div>
        <div class="hm-stat-card hm-stat-action" id="hm-open-panel-card">
          <div class="hm-stat-label">${t('engine.dashOpenPanel')}</div>
          <div class="hm-stat-value hm-stat-panel-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            ${t('engine.dashOpenPanelDesc')}
          </div>
          <div class="hm-stat-sub">→ /h/chat</div>
        </div>
      </div>

      <!-- Gateway 快捷控制 -->
      <div class="hm-section">
        <div class="hm-section-title">${t('engine.gatewayTitle')}</div>
        <div class="hm-gateway-row">
          ${!gwRunning ? `<button class="hm-btn hm-btn-primary" id="hm-btn-start" ${actionBusy ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            ${actionBusy ? t('engine.dashStarting') : t('engine.dashStartGw')}
          </button>` : ''}
          ${gwRunning ? `<button class="hm-btn hm-btn-danger" id="hm-btn-stop" ${actionBusy ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            ${actionBusy ? t('engine.dashStopping') : t('engine.dashStopGw')}
          </button>
          <button class="hm-btn hm-btn-secondary" id="hm-btn-restart" ${actionBusy ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
            ${actionBusy ? t('engine.dashRestarting') : t('engine.dashRestartGw')}
          </button>` : ''}
          <span class="hm-gateway-msg" id="hm-gw-msg"></span>
        </div>
      </div>

      <!-- 主要内容区：左侧模型配置 + 右侧连接目标 -->
      <div class="hm-two-col">
        <!-- 模型配置 -->
        <div class="hm-section hm-section-fill">
          <div class="hm-section-titlebar">
            <span class="hm-section-title">${t('engine.dashModelConfig')}</span>
            <button class="hm-btn-collapse" id="hm-btn-model-toggle">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="transform:rotate(${modelConfigCollapsed ? '0' : '180'}deg);transition:transform .2s"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
          <div class="hm-section-body${modelConfigCollapsed ? ' hidden' : ''}" id="hm-model-cfg-body">
            <!-- 服务商快捷按钮 -->
            <div class="hm-provider-grid">
              ${HERMES_PROVIDERS.map(p =>
                `<button class="hm-provider-btn${activePreset?.key === p.key ? ' active' : ''}" data-key="${p.key}" data-url="${esc(p.baseUrl)}" data-api="${p.api || 'openai-completions'}">
                  <span class="hm-provider-name">${p.label}</span>
                </button>`
              ).join('')}
            </div>
            <div class="hm-form-grid">
              <label class="hm-form-field">
                <span class="hm-form-label">${t('engine.configBaseUrl')}</span>
                <input type="text" id="hm-cfg-baseurl" class="hm-input" value="${esc(formBaseUrl)}" placeholder="https://gpt.qt.cool/v1" autocomplete="off">
              </label>
              <label class="hm-form-field">
                <span class="hm-form-label">${t('engine.configApiKey')}</span>
                <input type="password" id="hm-cfg-apikey" class="hm-input" value="${esc(formApiKey)}" placeholder="sk-..." autocomplete="off">
              </label>
            </div>
            <div class="hm-form-row">
              <label class="hm-form-field hm-form-field-flex">
                <span class="hm-form-label">${t('engine.configModel')}</span>
                <div class="hm-input-wrap">
                  <input type="text" id="hm-cfg-model" class="hm-input" value="${esc(formModel)}" placeholder="QC-B01" autocomplete="off">
                  ${dropdownHtml}
                </div>
              </label>
              <button class="hm-btn hm-btn-secondary" id="hm-btn-fetch" ${fetchBusy ? 'disabled' : ''} style="flex-shrink:0;align-self:flex-end">
                ${fetchBusy ? t('engine.configFetching') : t('engine.configFetchModels')}
              </button>
            </div>
            <div class="hm-form-msg" id="hm-cfg-msg">${cfgMsg}</div>
            <div class="hm-form-actions">
              <button class="hm-btn hm-btn-primary" id="hm-btn-save-model" ${modelBusy ? 'disabled' : ''}>
                ${modelBusy ? '...' : t('engine.configSaveBtn')}
              </button>
            </div>
          </div>
        </div>

        <!-- 连接目标 -->
        <div class="hm-section">
          <div class="hm-section-titlebar">
            <span class="hm-section-title">${t('engine.dashConnectTarget')}</span>
            <button class="hm-btn hm-btn-xs hm-btn-secondary" id="hm-btn-detect" ${envDetecting ? 'disabled' : ''}>
              ${envDetecting ? t('engine.dashDetecting') : t('engine.dashDetectEnv')}
            </button>
          </div>
          <div class="hm-section-body">
            <div class="hm-connect-modes">
              <button class="hm-mode-btn${connectMode === 'local' ? ' active' : ''}" data-mode="local">
                <span class="hm-mode-icon">🖥️</span>
                <span>${t('engine.dashConnLocal')}</span>
              </button>
              ${envData?.wsl2?.available ? `<button class="hm-mode-btn${connectMode === 'wsl2' ? ' active' : ''}" data-mode="wsl2">
                <span class="hm-mode-icon">🐧</span>
                <span>WSL2</span>
              </button>` : ''}
              ${envData?.docker?.available ? `<button class="hm-mode-btn${connectMode === 'docker' ? ' active' : ''}" data-mode="docker">
                <span class="hm-mode-icon">🐋</span>
                <span>Docker</span>
              </button>` : ''}
              <button class="hm-mode-btn${connectMode === 'custom' ? ' active' : ''}" data-mode="custom">
                <span class="hm-mode-icon">🌐</span>
                <span>${t('engine.dashConnCustom')}</span>
              </button>
            </div>
            ${connectMode === 'wsl2' && envData?.wsl2 ? `<div class="hm-env-info">
              <div class="hm-env-row"><span class="hm-env-label">IP</span><code class="hm-env-val">${esc(envData.wsl2.ip || '-')}</code></div>
              <div class="hm-env-row"><span class="hm-env-label">Hermes</span><span class="${envData.wsl2.hermesInstalled ? 'hm-env-ok' : 'hm-env-warn'}">${envData.wsl2.hermesInstalled ? '✓ ' + esc(envData.wsl2.hermesInfo || '') : '✗ Not installed'}</span></div>
              <div class="hm-env-row"><span class="hm-env-label">Gateway</span><span class="${envData.wsl2.gatewayRunning ? 'hm-env-ok' : 'hm-env-muted'}">${envData.wsl2.gatewayRunning ? '✓ ' + esc(envData.wsl2.gatewayUrl || '') : '✗ ' + t('engine.gatewayStopped')}</span></div>
            </div>` : ''}
            ${connectMode === 'docker' && envData?.docker ? `<div class="hm-env-info">
              <div class="hm-env-row"><span class="hm-env-label">Docker</span><span class="hm-env-val">${esc(envData.docker.version || '-')}</span></div>
              ${(envData.docker.hermesContainers || []).map(c => `<div class="hm-env-row"><span class="hm-env-label">Container</span><code class="hm-env-val">${esc(c.name)}</code><span class="hm-env-sub">${esc(c.ports)}</span></div>`).join('') || `<div class="hm-env-muted">${t('engine.logsNoFiles')}</div>`}
            </div>` : ''}
            ${connectMode === 'custom' ? `<div class="hm-form-field" style="margin-top:8px">
              <input type="text" id="hm-custom-gw-url" class="hm-input" value="${esc(customGwUrl)}" placeholder="http://192.168.1.100:8642">
            </div>` : ''}
            <div class="hm-connect-apply">
              <button class="hm-btn hm-btn-primary" id="hm-btn-apply-connect">${t('engine.dashConnApply')}</button>
              <span class="hm-form-msg" id="hm-connect-msg">${connectMsg}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 快捷操作 -->
      <div class="hm-section">
        <div class="hm-section-title">${t('engine.dashQuickActions')}</div>
        <div class="hm-quick-grid">
          <button class="hm-quick-card" data-route="/h/chat">
            <div class="hm-quick-icon" style="background:var(--accent-muted)">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" width="20" height="20"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            </div>
            <div class="hm-quick-info">
              <div class="hm-quick-name">${t('engine.dashOpenChat')}</div>
              <div class="hm-quick-desc">/h/chat</div>
            </div>
            <svg class="hm-quick-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <button class="hm-quick-card" data-route="/h/setup">
            <div class="hm-quick-icon" style="background:var(--success-muted)">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
            </div>
            <div class="hm-quick-info">
              <div class="hm-quick-name">${t('engine.dashOpenSetup')}</div>
              <div class="hm-quick-desc">/h/setup</div>
            </div>
            <svg class="hm-quick-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>

      <!-- 终端命令 -->
      <div class="hm-section">
        <div class="hm-section-titlebar">
          <span class="hm-section-title">${t('engine.dashCliTitle')}</span>
          <span class="hm-section-sub">${t('engine.dashCliDesc')}</span>
        </div>
        <div class="hm-cli-grid">
          ${renderCliCommands()}
        </div>
      </div>
    `

    bind()
  }

  function bind() {
    el.querySelector('#hm-btn-refresh')?.addEventListener('click', refresh)
    el.querySelector('#hm-open-panel-card')?.addEventListener('click', () => { window.location.hash = '#/h/chat' })

    // Gateway 启停
    el.querySelector('#hm-btn-start')?.addEventListener('click', async () => {
      actionBusy = true; draw()
      setGwMsg(t('engine.gatewayStarting'), false)
      try { const r = await api.hermesGatewayAction('start'); setGwMsg(r || t('engine.dashRunning'), false) } catch (e) { setGwMsg(String(e).replace(/^Error:\s*/, ''), true) }
      actionBusy = false; await refresh()
    })
    el.querySelector('#hm-btn-stop')?.addEventListener('click', async () => {
      actionBusy = true; draw()
      try { await api.hermesGatewayAction('stop') } catch (e) { setGwMsg(String(e).replace(/^Error:\s*/, ''), true) }
      actionBusy = false; await refresh()
    })
    el.querySelector('#hm-btn-restart')?.addEventListener('click', async () => {
      actionBusy = true; draw()
      try { await api.hermesGatewayAction('stop') } catch (_) {}
      await new Promise(r => setTimeout(r, 1500))
      try { await api.hermesGatewayAction('start') } catch (e) { setGwMsg(String(e).replace(/^Error:\s*/, ''), true) }
      actionBusy = false; await refresh()
    })

    // 模型配置折叠
    el.querySelector('#hm-btn-model-toggle')?.addEventListener('click', () => {
      syncFormFromDom()
      modelConfigCollapsed = !modelConfigCollapsed
      draw()
    })

    // Provider 预设
    el.querySelectorAll('.hm-provider-btn').forEach(btn => {
      btn.addEventListener('click', () => { formBaseUrl = btn.dataset.url; draw() })
    })

    // 获取模型列表
    el.querySelector('#hm-btn-fetch')?.addEventListener('click', doFetchModels)

    // 模型下拉
    el.querySelectorAll('.hm-dropdown-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        formModel = opt.dataset.model
        showDropdown = false
        draw()
      })
    })
    el.querySelector('#hm-cfg-model')?.addEventListener('focus', () => {
      if (models.length) { showDropdown = true; syncFormFromDom(); draw() }
    })
    el.addEventListener('click', (e) => {
      if (showDropdown && !e.target.closest('#hm-cfg-model') && !e.target.closest('#hm-model-dropdown')) {
        showDropdown = false; syncFormFromDom(); draw()
      }
    })

    // 保存模型配置
    el.querySelector('#hm-btn-save-model')?.addEventListener('click', doSaveModel)

    // 连接目标
    el.querySelector('#hm-btn-detect')?.addEventListener('click', doDetectEnv)
    el.querySelectorAll('.hm-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        connectMode = btn.dataset.mode
        if (connectMode === 'wsl2' && envData?.wsl2?.gatewayUrl) customGwUrl = envData.wsl2.gatewayUrl
        syncFormFromDom(); draw()
      })
    })
    el.querySelector('#hm-btn-apply-connect')?.addEventListener('click', doApplyConnect)

    // 快捷操作
    el.querySelectorAll('.hm-quick-card').forEach(btn => {
      btn.addEventListener('click', () => { window.location.hash = '#' + btn.dataset.route })
    })

    // CLI 复制
    el.querySelectorAll('.hm-cli-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.cmdIdx)
        const cmd = CLI_COMMANDS[idx]?.cmd
        if (!cmd) return
        navigator.clipboard.writeText(cmd).then(() => {
          btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>'
          setTimeout(() => {
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>'
          }, 1500)
        }).catch(() => {})
      })
    })
  }

  async function doFetchModels() {
    syncFormFromDom()
    if (!formBaseUrl) { cfgMsg = `<span class="hm-msg-warn">${t('engine.configFetchNeedUrl')}</span>`; draw(); return }
    if (!formApiKey) { cfgMsg = `<span class="hm-msg-warn">${t('engine.configFetchNeedKey')}</span>`; draw(); return }
    const matched = HERMES_PROVIDERS.find(p => formBaseUrl === p.baseUrl)
    const apiType = matched?.api || 'openai-completions'
    fetchBusy = true; cfgMsg = ''; draw()
    try {
      const fetchedModels = await api.hermesFetchModels(formBaseUrl, formApiKey, apiType)
      models = fetchedModels || []
      cfgMsg = `<span class="hm-msg-ok">✓ ${t('engine.configFetchSuccess', { count: models.length })}</span>`
      showDropdown = models.length > 0
    } catch (err) {
      cfgMsg = `<span class="hm-msg-err">✗ ${String(err).replace(/^Error:\s*/, '')}</span>`
    } finally {
      fetchBusy = false; draw()
    }
  }

  async function doSaveModel() {
    syncFormFromDom()
    if (!formApiKey) { cfgMsg = `<span class="hm-msg-warn">${t('engine.configFetchNeedKey')}</span>`; draw(); return }
    if (!formModel) { cfgMsg = `<span class="hm-msg-warn">请输入模型名</span>`; draw(); return }
    const matched = HERMES_PROVIDERS.find(p => formBaseUrl && p.baseUrl === formBaseUrl)
    const provider = matched?.key || 'custom'
    modelBusy = true; cfgMsg = ''; draw()
    try {
      await api.configureHermes(provider, formApiKey, formModel, formBaseUrl || null)
      cfgMsg = `<span class="hm-msg-ok">✓ 配置已保存</span>`
      try { hermesConfig = await api.hermesReadConfig() } catch (_) {}
    } catch (e) {
      cfgMsg = `<span class="hm-msg-err">✗ ${String(e).replace(/^Error:\s*/, '')}</span>`
    } finally {
      modelBusy = false; draw()
    }
  }

  async function doDetectEnv() {
    envDetecting = true; draw()
    try { envData = await api.hermesDetectEnvironments() } catch (e) { connectMsg = String(e).replace(/^Error:\s*/, '') }
    envDetecting = false; draw()
  }

  async function doApplyConnect() {
    let targetUrl = null
    if (connectMode === 'local') {
      targetUrl = null
    } else if (connectMode === 'wsl2') {
      targetUrl = envData?.wsl2?.gatewayUrl || null
      if (!targetUrl) { connectMsg = 'WSL2 Gateway 未运行'; draw(); return }
    } else if (connectMode === 'docker') {
      const urlInput = el.querySelector('#hm-custom-gw-url')
      targetUrl = urlInput?.value?.trim() || null
    } else if (connectMode === 'custom') {
      const urlInput = el.querySelector('#hm-custom-gw-url')
      targetUrl = urlInput?.value?.trim() || null
      if (!targetUrl) { connectMsg = t('engine.dashConnNoGwUrl'); draw(); return }
    }
    try {
      const result = await api.hermesSetGatewayUrl(targetUrl)
      connectMsg = `✓ ${result}`; await refresh()
    } catch (e) {
      connectMsg = `✗ ${String(e).replace(/^Error:\s*/, '')}`; draw()
    }
  }

  function setGwMsg(msg, isErr) {
    const el2 = el.querySelector('#hm-gw-msg')
    if (el2) { el2.textContent = msg; el2.className = 'hm-gateway-msg ' + (isErr ? 'hm-msg-err' : 'hm-msg-ok') }
  }

  async function refresh() {
    try {
      info = await api.checkHermes()
      if (info?.gatewayRunning) { try { health = await api.hermesHealthCheck() } catch (_) {} } else { health = null }
      try { hermesConfig = await api.hermesReadConfig() } catch (_) {}
    } catch (_) {}
    loading = false
    if (!formInited && hermesConfig) {
      formBaseUrl = hermesConfig.base_url || ''
      formApiKey = hermesConfig.api_key || ''
      formModel = hermesConfig.model || ''
      formInited = true
    }
    draw()
  }

  refresh()

  let unlisteners = []
  let autoRefreshTimer = null

  async function setupListeners() {
    try {
      const unlisten1 = await tauriListen('hermes-gateway-status', (evt) => {
        if (info) {
          const wasRunning = info.gatewayRunning
          info.gatewayRunning = !!evt.payload.running
          if (evt.payload.port) info.gatewayPort = evt.payload.port
          if (wasRunning !== info.gatewayRunning) draw()
        }
      })
      unlisteners.push(unlisten1)
      const unlisten2 = await tauriListen('hermes-guardian-log', (evt) => { setGwMsg(evt.payload || '', false) })
      unlisteners.push(unlisten2)
    } catch (_) {}
    autoRefreshTimer = setInterval(async () => {
      if (actionBusy || modelBusy) return
      try {
        const newInfo = await api.checkHermes()
        if (newInfo && info && newInfo.gatewayRunning !== info.gatewayRunning) { info = newInfo; draw() }
      } catch (_) {}
    }, 15000)
  }
  setupListeners()

  const cleanup = () => { unlisteners.forEach(fn => fn()); unlisteners = []; if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null } }
  const detachObserver = new MutationObserver(() => { if (!el.isConnected) { cleanup(); detachObserver.disconnect() } })
  requestAnimationFrame(() => { if (el.parentNode) detachObserver.observe(el.parentNode, { childList: true }) })

  return el
}
