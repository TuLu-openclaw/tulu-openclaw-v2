/**
 * 全球内置
 *
 * 改为 Tauri 原生独立 WebView 顶层窗口，不再使用外部浏览器、iframe、srcdoc。
 * 真实地址仅保留在 Rust 侧，前端不展示、不复制、不暴露。
 *
 * 密码保护：每次启动全球内置功能都需要输入密码验证。
 * 支持"记住密码"和"显示/隐藏密码"。
 */
import { toast } from '../components/toast.js'
import { api } from '../lib/tauri-api.js'

const PASSWORD = '2552667173'
const STORAGE_KEY = 'gb_remembered'

function esc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function renderOverlay(root, onSuccess) {
  root.innerHTML = `
    <div id="gb-pwd-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:rgba(10,10,20,0.97);display:flex;align-items:center;justify-content:center;">
      <div style="background:var(--bg-secondary,#1a1a2e);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:40px;max-width:420px;width:90%;text-align:center;box-shadow:0 25px 60px rgba(0,0,0,0.5);">
        <div style="font-size:52px;margin-bottom:16px;">🔐</div>
        <div style="font-size:22px;font-weight:800;color:var(--text-primary,#fff);margin-bottom:8px;">全球内置功能</div>
        <div style="font-size:14px;color:var(--text-secondary,#a1a1aa);margin-bottom:28px;">请输入访问密码</div>
        <div id="gb-pwd-error" style="display:none;color:#ef4444;font-size:13px;margin-bottom:12px;"></div>
        <div style="position:relative;margin-bottom:12px;">
          <input id="gb-pwd-input" type="password" placeholder="请输入密码" style="width:100%;padding:12px 44px 12px 14px;border:1px solid rgba(255,255,255,0.15);border-radius:10px;background:rgba(255,255,255,0.05);color:#fff;font-size:15px;box-sizing:border-box;outline:none;" />
          <button id="gb-pwd-toggle" type="button" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#a1a1aa;font-size:16px;padding:4px;">👁</button>
        </div>
        <div style="display:flex;align-items:center;justify-content:flex-start;margin-bottom:20px;gap:8px;">
          <input id="gb-pwd-remember" type="checkbox" style="width:16px;height:16px;cursor:pointer;" />
          <label for="gb-pwd-remember" style="font-size:13px;color:#a1a1aa;cursor:pointer;">记住密码（本次访问）</label>
        </div>
        <button id="gb-pwd-submit" style="width:100%;padding:13px;border:none;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:15px;font-weight:700;cursor:pointer;">确认</button>
      </div>
    </div>
  `

  const overlay = root.querySelector('#gb-pwd-overlay')
  const input = root.querySelector('#gb-pwd-input')
  const submitBtn = root.querySelector('#gb-pwd-submit')
  const toggleBtn = root.querySelector('#gb-pwd-toggle')
  const errorEl = root.querySelector('#gb-pwd-pwd-error')
  const rememberEl = root.querySelector('#gb-pwd-remember')
  let showPass = false

  function trySubmit() {
    const val = input.value
    if (val === PASSWORD) {
      if (rememberEl.checked) {
        try { localStorage.setItem(STORAGE_KEY, '1') } catch (_) {}
      }
      overlay.style.transition = 'opacity 0.3s'
      overlay.style.opacity = '0'
      setTimeout(() => {
        overlay.remove()
        onSuccess()
      }, 280)
    } else {
      errorEl.textContent = '密码错误，请重试'
      errorEl.style.display = 'block'
      input.value = ''
      input.focus()
    }
  }

  submitBtn.addEventListener('click', trySubmit)
  input.addEventListener('keydown', e => { if (e.key === 'Enter') trySubmit() })
  toggleBtn.addEventListener('click', () => {
    showPass = !showPass
    input.type = showPass ? 'text' : 'password'
    toggleBtn.textContent = showPass ? '🙈' : '👁'
  })
  input.focus()
}

async function openInIndependentWindow() {
  try {
    await api.openGlobalBuiltinWindow()
    return true
  } catch (_) {
    return false
  }
}

function renderContent(root) {
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
}

export default async function render(container) {
  const root = container || document.body
  root.innerHTML = ''

  // 检查是否已记住密码
  let remembered = false
  try { remembered = localStorage.getItem(STORAGE_KEY) === '1' } catch (_) {}

  if (remembered) {
    renderContent(root)
    setTimeout(() => openInIndependentWindow().then(ok => {
      if (ok) toast('已打开全球内置独立窗口', 'success')
    }), 50)
  } else {
    renderOverlay(root, () => {
      renderContent(root)
    })
  }

  return root
}
