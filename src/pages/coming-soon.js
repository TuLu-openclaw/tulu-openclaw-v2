/**
 * 全球内置 - 内置浏览器页面
 * 直接在应用窗口内通过 iframe 加载目标 URL
 */

const TARGET_URL = 'https://zh.stripcam.xxx/top/girls/current-month-asia-and-pacific'
const LOAD_TIMEOUT = 10000 // 10秒超时

export default function render(container) {
  const root = container || document.body
  root.innerHTML = ''

  // 外层容器
  const wrap = document.createElement('div')
  wrap.style.cssText =
    'position:fixed;top:0;left:0;right:0;bottom:0;z-index:500;' +
    'display:flex;flex-direction:column;background:#0d0d1a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif'

  // 顶部工具栏
  const toolbar = document.createElement('div')
  toolbar.style.cssText =
    'flex-shrink:0;display:flex;align-items:center;justify-content:space-between;' +
    'padding:10px 16px;background:rgba(20,20,35,0.95);border-bottom:1px solid rgba(255,255,255,0.07)'

  toolbar.innerHTML =
    '<div style="display:flex;align-items:center;gap:10px">' +
      '<span style="font-size:18px">🌐</span>' +
      '<span style="font-size:14px;font-weight:600;color:#fff">全球内置</span>' +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:8px">' +
      '<span id="t-load-status" style="font-size:11px;color:#555">加载中...</span>' +
      '<button id="t-refresh-btn" style="cursor:pointer;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);' +
        'color:#888;font-size:11px;padding:4px 10px;border-radius:6px">↻ 刷新</button>' +
      '<a href="' + TARGET_URL + '" target="_blank" rel="noopener" ' +
        'style="cursor:pointer;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);' +
        'color:#8b8cf5;font-size:11px;padding:4px 10px;border-radius:6px;text-decoration:none">↗ 新窗口</a>' +
    '</div>'

  // iframe 容器
  const frameWrap = document.createElement('div')
  frameWrap.style.cssText = 'flex:1;position:relative;overflow:hidden'

  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block'
  iframe.src = TARGET_URL
  iframe.allow = 'fullscreen'

  // 加载失败时的提示
  const fallback = document.createElement('div')
  fallback.style.cssText =
    'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;' +
    'background:#12121a;padding:40px 20px;text-align:center;gap:12px'
  fallback.innerHTML =
    '<div style="font-size:40px">⚠️</div>' +
    '<div style="font-size:14px;color:#ef4444;font-weight:600">页面加载失败</div>' +
    '<div style="font-size:12px;color:#555;max-width:340px">目标网站可能设置了 X-Frame-Options 或 CSP 保护，<br>无法在 iframe 内加载。</div>' +
    '<a href="' + TARGET_URL + '" target="_blank" rel="noopener" ' +
      'style="display:inline-block;margin-top:8px;padding:9px 22px;background:linear-gradient(135deg,#6366f1,#8b5cf6);' +
      'color:#fff;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none">↗ 在浏览器中打开</a>'

  frameWrap.appendChild(iframe)
  frameWrap.appendChild(fallback)
  wrap.appendChild(toolbar)
  wrap.appendChild(frameWrap)
  root.appendChild(wrap)

  const statusEl = toolbar.querySelector('#t-load-status')

  // 加载超时
  const timer = setTimeout(function() {
    statusEl.textContent = '加载超时'
    statusEl.style.color = '#f59e0b'
  }, LOAD_TIMEOUT)

  iframe.addEventListener('load', function() {
    clearTimeout(timer)
    statusEl.textContent = '已加载'
    statusEl.style.color = '#22c55e'
  })

  iframe.addEventListener('error', function() {
    clearTimeout(timer)
    statusEl.textContent = '加载失败'
    statusEl.style.color = '#ef4444'
    iframe.style.display = 'none'
    fallback.style.display = 'flex'
  })

  toolbar.querySelector('#t-refresh-btn').addEventListener('click', function() {
    statusEl.textContent = '加载中...'
    statusEl.style.color = '#555'
    iframe.style.display = 'block'
    fallback.style.display = 'none'
    iframe.src = TARGET_URL + '?t=' + Date.now()
  })

  return root
}
