/**
 * 全球内置
 *
 * 改为 Tauri 原生独立 WebView 顶层窗口，不再使用外部浏览器、iframe、srcdoc。
 * 真实地址仅保留在 Rust 侧，前端不展示、不复制、不暴露。
 */
import { toast } from '../components/toast.js'
import { t } from '../lib/i18n.js'
import { api } from '../lib/tauri-api.js'

async function openInIndependentWindow() {
  try {
    await api.openGlobalBuiltinWindow()
    return true
  } catch (_) {
    return false
  }
}

export default async function render(container) {
  const root = container || document.body
  root.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:65vh;padding:24px;">
      <div style="max-width:720px;width:100%;background:var(--bg-secondary,#111827);border:1px solid var(--border-color,rgba(255,255,255,.08));border-radius:20px;padding:32px;box-shadow:0 20px 50px rgba(0,0,0,.25);text-align:center;">
        <div style="font-size:56px;line-height:1;margin-bottom:16px;">🌐</div>
        <div style="font-size:26px;font-weight:800;color:var(--text-primary,#fff);margin-bottom:12px;">${t('sidebar.globalBuiltinFeatureTitle')}</div>
        <div style="font-size:15px;line-height:1.9;color:var(--text-secondary,#a1a1aa);margin-bottom:24px;">
          ${t('sidebar.globalBuiltinFeatureDescription')}
        </div>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
          <button id="gb-open-btn" style="padding:12px 20px;border:none;border-radius:12px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-weight:700;cursor:pointer;">${t('sidebar.globalBuiltinOpenButton')}</button>
        </div>
      </div>
    </div>
  `

  const openBtn = root.querySelector('#gb-open-btn')

  openBtn?.addEventListener('click', async () => {
    try {
      await api.openGlobalBuiltinWindow()
      toast(t('sidebar.globalBuiltinOpenOk'), 'success')
    } catch (err) {
      const errDetail = String(err?.message || err || 'unknown')
      console.error('[global-builtin] open failed:', errDetail)
      toast(`${t('sidebar.globalBuiltinOpenFailed')}: ${errDetail}`, 'error')
    }
  })

  setTimeout(async () => {
    try {
      await api.openGlobalBuiltinWindow()
      toast(t('sidebar.globalBuiltinOpenOk'), 'success')
    } catch (err) {
      const errDetail = String(err?.message || err || 'unknown')
      console.error('[global-builtin] auto-open failed:', errDetail)
      toast(`${t('sidebar.globalBuiltinOpenFailed')}: ${errDetail}`, 'error')
    }
  }, 50)

  return root
}
