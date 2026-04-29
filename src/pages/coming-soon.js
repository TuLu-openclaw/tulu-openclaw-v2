/**
 * 全球内置
 *
 * 改为 Tauri 原生独立 WebView 顶层窗口，不再使用外部浏览器、iframe、srcdoc。
 * 真实地址仅保留在 Rust 侧，前端不展示、不复制、不暴露。
 */
import { toast } from '../components/toast.js'
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
        <div style="font-size:26px;font-weight:800;color:var(--text-primary,#fff);margin-bottom:12px;">全球内置功能</div>
        <div style="font-size:15px;line-height:1.9;color:var(--text-secondary,#a1a1aa);margin-bottom:24px;">
          此功能现已改为应用内原生独立窗口加载。<br>
          访问入口已隐藏，页面地址不会在前端界面中显示。<br>
          点击下方按钮后，将直接打开内置独立窗口。
        </div>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
          <button id="gb-open-btn" style="padding:12px 20px;border:none;border-radius:12px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-weight:700;cursor:pointer;">打开全球内置窗口</button>
        </div>
      </div>
    </div>
  `

  const openBtn = root.querySelector('#gb-open-btn')

  openBtn?.addEventListener('click', async () => {
    const ok = await openInIndependentWindow()
    if (ok) toast('已打开全球内置独立窗口', 'success')
    else toast('打开失败，请检查内置窗口能力或目标站点限制', 'error')
  })

  setTimeout(async () => {
    const ok = await openInIndependentWindow()
    if (ok) toast('已自动打开全球内置独立窗口', 'success')
  }, 50)

  return root
}
