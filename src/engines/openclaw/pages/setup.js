/**
 * OpenClaw 引擎设置页面
 *
 * 提供 OpenClaw 引擎的设置入口。
 * Hermes Agent 部署引导：通过此入口切换到 Hermes 引擎进行一键部署。
 */
import { t } from '../../../lib/i18n.js'
import { navigate } from '../../../router.js'
import { getActiveEngineId, switchEngine } from '../../../lib/engine-manager.js'
import { toast } from '../../../components/toast.js'

export function render() {
  const el = document.createElement('div')
  el.className = 'page'

  el.innerHTML = `
    <div class="page-header">
      <h1>${t('openclawSetup.title')}</h1>
      <p style="color:var(--text-secondary);margin-top:4px">${t('openclawSetup.subtitle')}</p>
    </div>
    <div style="max-width:600px;display:flex;flex-direction:column;gap:16px">

      <div class="config-section">
        <div class="config-section-title">${t('openclawSetup.sectionEngine')}</div>
        <div style="display:flex;flex-direction:column;gap:12px">

          <div style="padding:16px;border-radius:var(--radius-md);border:1px solid var(--border-primary);background:var(--bg-secondary)">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
              <span style="font-size:24px">🤖</span>
              <div>
                <div style="font-weight:600">${t('openclawSetup.hermesTitle')}</div>
                <div style="font-size:var(--font-size-xs);color:var(--text-tertiary)">${t('openclawSetup.hermesTagline')}</div>
              </div>
            </div>
            <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin:0 0 12px;line-height:1.6">
              ${t('openclawSetup.hermesDesc')}
            </p>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-primary btn-sm" id="btn-switch-to-hermes">
                ${t('openclawSetup.switchToHermes')}
              </button>
              <button class="btn btn-secondary btn-sm" id="btn-goto-hermes-setup">
                ${t('about.hermesSetup')}
              </button>
            </div>
          </div>

          <div style="padding:16px;border-radius:var(--radius-md);border:1px solid var(--border);background:var(--bg-secondary)">
            <div style="display:flex;align-items:center;gap:12px">
              <span style="font-size:24px">🪶</span>
              <div>
                <div style="font-weight:600">${t('openclawSetup.openclawTitle')}</div>
                <div style="font-size:var(--font-size-xs);color:var(--text-tertiary)">${t('openclawSetup.currentActive')}</div>
              </div>
            </div>
            <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin:12px 0 0;line-height:1.6">
              ${t('openclawSetup.openclawDesc')}
            </p>
          </div>

        </div>
      </div>

      <div class="config-section">
        <div class="config-section-title">${t('openclawSetup.sectionLinks')}</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button class="btn btn-secondary btn-sm" id="btn-goto-dashboard">${t('sidebar.dashboard')}</button>
          <button class="btn btn-secondary btn-sm" id="btn-goto-models">${t('sidebar.models')}</button>
          <button class="btn btn-secondary btn-sm" id="btn-goto-channels">${t('sidebar.channels')}</button>
          <button class="btn btn-secondary btn-sm" id="btn-goto-about">${t('sidebar.about')}</button>
        </div>
      </div>

    </div>
  `

  el.querySelector('#btn-switch-to-hermes')?.addEventListener('click', async () => {
    try {
      await switchEngine('hermes')
      // switchEngine 会自动 navigate 到新引擎的默认路由
    } catch (e) {
      toast(t('common.loadFailed') + ': ' + (e.message || e), 'error')
    }
  })

  el.querySelector('#btn-goto-hermes-setup')?.addEventListener('click', async () => {
    if (getActiveEngineId() !== 'hermes') {
      await switchEngine('hermes')
    }
    navigate('/hermes/setup')
  })

  el.querySelector('#btn-goto-dashboard')?.addEventListener('click', () => navigate('/dashboard'))
  el.querySelector('#btn-goto-models')?.addEventListener('click', () => navigate('/models'))
  el.querySelector('#btn-goto-channels')?.addEventListener('click', () => navigate('/channels'))
  el.querySelector('#btn-goto-about')?.addEventListener('click', () => navigate('/about'))

  return el
}