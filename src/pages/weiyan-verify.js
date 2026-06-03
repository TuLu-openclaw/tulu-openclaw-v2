import { t } from '../lib/i18n.js'

/**
 * 微验验证页面
 * 网络卡密验证系统 · 基于微验API
 */

export default function render(el) {
  const ANNOUNCEMENT = t('verify.weiyanAnnouncement')

  el.innerHTML = `
    ${ANNOUNCEMENT ? `<div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:8px;padding:10px 12px;margin:16px 16px 0;font-size:12px;color:#a5b4fc;line-height:1.6">📢 ${ANNOUNCEMENT}</div>` : ''}
    <div class="page-header">
      <div class="page-title">${t('verify.weiyanTitle')}</div>
      <div class="page-desc">${t('verify.weiyanDesc')}</div>
    </div>
    <div class="verify-container">
      <div class="verify-card">
        <div class="verify-card-header">
          <span class="verify-badge">${t('verify.weiyanTitle')}</span>
          <span class="verify-status online">${t('verify.serviceOnline')}</span>
        </div>
        <div class="verify-card-body">
          <div class="verify-form">
            <div class="verify-form-group">
              <label class="verify-form-label">${t('verify.licenseKey')}</label>
              <input type="text" id="weiyan-key" class="verify-form-input" placeholder="${t('verify.licensePlaceholder')}" autocomplete="off">
            </div>
            <div class="verify-form-group">
              <label class="verify-form-label">${t('verify.appId')}</label>
              <input type="text" id="weiyan-appid" class="verify-form-input" placeholder="${t('verify.appIdPlaceholder')}" value="67696" autocomplete="off">
            </div>
            <div id="weiyan-result" style="display:none" class="verify-result"></div>
            <button id="weiyan-btn" class="btn btn-primary btn-lg" style="width:100%;margin-top:8px">
              ${t('verify.verifyKey')}
            </button>
          </div>
          <div class="verify-divider"><span>${t('verify.or')}</span></div>
          <div class="verify-actions">
            <a class="btn btn-secondary btn-lg" href="https://wy.llua.cn/" target="_blank" rel="noopener" style="display:block;text-align:center">
              ${t('verify.visitWeiyan')}
            </a>
            <a class="btn btn-secondary btn-lg" href="https://wy.llua.cn/buy" target="_blank" rel="noopener" style="display:block;text-align:center">
              ${t('verify.buyKey')}
            </a>
          </div>
        </div>
      </div>
      <div class="verify-info-box">
        <div class="verify-info-title">${t('verify.apiParams')}</div>
        <div class="verify-info-row"><span>${t('verify.apiAddress')}</span><code>https://wy.llua.cn</code></div>
        <div class="verify-info-row"><span>AppID</span><code>67696</code></div>
        <div class="verify-info-row"><span>AppKey</span><code>sd47K5r8v7K0KsH0</code></div>
      </div>
    </div>
  `

  el.querySelector('#weiyan-btn').addEventListener('click', async () => {
    const key = el.querySelector('#weiyan-key').value.trim()
    const appid = el.querySelector('#weiyan-appid').value.trim()
    const resultEl = el.querySelector('#weiyan-result')
    const btn = el.querySelector('#weiyan-btn')

    if (!key) {
      resultEl.style.display = ''
      resultEl.className = 'verify-result verify-result-error'
      resultEl.textContent = t('verify.emptyKey')
      return
    }

    btn.disabled = true
    btn.textContent = t('verify.verifying')
    resultEl.style.display = 'none'

    try {
      const resp = await fetch('https://wy.llua.cn/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appid, key, appkey: 'sd47K5r8v7K0KsH0' })
      })
      const data = await resp.json().catch(() => ({}))

      resultEl.style.display = ''
      if (data.success || data.code === 2552667173 || data.ret === 2552667173) {
        resultEl.className = 'verify-result verify-result-success'
        resultEl.textContent = t('verify.verifySuccess')
      } else {
        resultEl.className = 'verify-result verify-result-error'
        resultEl.textContent = t('verify.invalidOrExpired')
      }
    } catch (e) {
      resultEl.style.display = ''
      resultEl.className = 'verify-result verify-result-error'
      resultEl.textContent = t('verify.verifyFailedWithReason', { reason: e.message || t('verify.networkError') })
    } finally {
      btn.disabled = false
      btn.textContent = t('verify.verifyKey')
    }
  })

  if (!document.getElementById('weiyan-verify-style')) {
    const style = document.createElement('style')
    style.id = 'weiyan-verify-style'
    style.textContent = `
      .verify-container { padding: 24px; max-width: 560px; margin: 0 auto; }
      .verify-card { background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--radius-lg); overflow: hidden; margin-bottom: 16px; }
      .verify-card-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); background: var(--bg-tertiary); }
      .verify-badge { font-weight: 700; font-size: var(--font-size-md); color: var(--text-primary); }
      .verify-status { font-size: var(--font-size-xs); padding: 2px 8px; border-radius: 12px; }
      .verify-status.online { background: rgba(34,197,94,.15); color: #22c55e; }
      .verify-card-body { padding: 24px 20px; }
      .verify-form { display: flex; flex-direction: column; gap: 12px; }
      .verify-form-group { display: flex; flex-direction: column; gap: 6px; }
      .verify-form-label { font-size: var(--font-size-sm); color: var(--text-secondary); font-weight: 500; }
      .verify-form-input { padding: 10px 12px; border-radius: var(--radius-md); border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary); font-size: var(--font-size-sm); }
      .verify-form-input:focus { outline: none; border-color: var(--primary); }
      .verify-result { padding: 10px 12px; border-radius: var(--radius-md); font-size: var(--font-size-sm); margin-top: 8px; }
      .verify-result-success { background: rgba(34,197,94,.1); color: #22c55e; border: 1px solid rgba(34,197,94,.3); }
      .verify-result-error { background: rgba(239,68,68,.1); color: #ef4444; border: 1px solid rgba(239,68,68,.3); }
      .verify-divider { text-align: center; color: var(--text-tertiary); font-size: var(--font-size-xs); margin: 16px 0; position: relative; }
      .verify-divider::before, .verify-divider::after { content: ''; position: absolute; top: 50%; width: 40%; height: 1px; background: var(--border); }
      .verify-divider::before { left: 0; }
      .verify-divider::after { right: 0; }
      .verify-divider span { background: var(--bg-secondary); padding: 0 8px; position: relative; }
      .verify-actions { display: flex; flex-direction: column; gap: 8px; }
      .btn-lg { padding: 10px 24px; font-size: var(--font-size-md); font-weight: 600; border-radius: var(--radius-md); display: inline-flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none; cursor: pointer; border: none; transition: all .2s; }
      .btn-primary { background: linear-gradient(135deg,#6366f1,#8b5cf6); color: #fff; }
      .btn-primary:hover { opacity: 0.9; }
      .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
      .btn-secondary { background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border); }
      .btn-secondary:hover { background: var(--bg-secondary); }
      .verify-info-box { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 16px; }
      .verify-info-title { font-size: var(--font-size-sm); font-weight: 600; color: var(--text-primary); margin-bottom: 10px; }
      .verify-info-row { display: flex; justify-content: space-between; font-size: var(--font-size-xs); color: var(--text-secondary); margin-bottom: 6px; }
      .verify-info-row code { color: var(--primary); background: var(--bg-tertiary); padding: 1px 5px; border-radius: 3px; }
      .page-desc { color: var(--text-secondary); font-size: var(--font-size-sm); margin-top: 4px; }
    `
    document.head.appendChild(style)
  }
}
