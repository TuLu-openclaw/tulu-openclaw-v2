/**
 * Hermes Agent 配置编辑
 */
import { t } from '../../../lib/i18n.js'

export function render() {
  const el = document.createElement('div')
  el.className = 'hermes-config-page'
  el.innerHTML = `
    <div class="hm-config-header"><span class="hm-config-header-title">${t('engine.hermesConfigTitle')}</span></div>
    <div class="hm-config-content">
      <div style="text-align:center;padding:40px;color:var(--text-tertiary);font-size:14px">
        ${t('engine.comingSoonPhase2')}
      </div>
    </div>
  `
  return el
}
