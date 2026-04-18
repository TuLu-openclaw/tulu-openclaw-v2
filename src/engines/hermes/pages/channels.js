/**
 * Hermes Agent 渠道配置
 */
import { t } from '../../../lib/i18n.js'

export function render() {
  const el = document.createElement('div')
  el.className = 'hermes-channels-page'
  el.innerHTML = `
    <div class="hm-channels-header"><span class="hm-channels-header-title">${t('engine.hermesChannelsTitle')}</span></div>
    <div class="hm-channels-content">
      <div class="hm-channels-coming-soon">
        <div class="hm-channels-coming-soon-icon">🚧</div>
        <div class="hm-channels-coming-soon-text">${t('engine.comingSoonPhase2')}</div>
      </div>
    </div>
  `
  return el
}
