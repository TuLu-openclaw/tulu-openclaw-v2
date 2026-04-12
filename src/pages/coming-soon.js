import '../style/movie-tool.css';

const URL = 'https://zh.stripcam.xxx/top/girls/current-month-asia-and-pacific';
const LOCK_KEY = 'tulu_comingsoon_locked'
const CORRECT_PWD = '2552667173'

/**
 * 渲染入口 — 接收路由容器，渲染到容器内部
 * 不再寻找不存在的 #tvbox-app，直接渲染到传入的容器
 */
export default function render(container) {
  // container 是路由传入的 _contentEl（HTMLElement）
  // 如果为 null/undefined，降级到 document.body（但这在正常路由环境下不应该发生）
  const root = container || document.body

  function doRender() {
    if (localStorage.getItem(LOCK_KEY) !== '1') {
      root.innerHTML =
        '<div class="tvbox-lock-screen">' +
          '<div class="tvbox-lock-box">' +
            '<div class="tvbox-lock-icon">🔒</div>' +
            '<div class="tvbox-lock-title">待开放功能</div>' +
            '<div class="tvbox-lock-sub">请输入访问密码</div>' +
            '<input type="password" id="t-lock-pwd" class="tvbox-lock-input" placeholder="密码" maxlength="20" />' +
            '<div class="tvbox-lock-error" id="t-lock-err" style="display:none">密码错误，请重试</div>' +
            '<button class="tvbox-lock-btn" id="t-lock-btn">解锁进入</button>' +
          '</div>' +
        '</div>'
      const input = root.querySelector('#t-lock-pwd')
      const btn   = root.querySelector('#t-lock-btn')
      const err   = root.querySelector('#t-lock-err')

      function tryUnlock() {
        if (input.value === CORRECT_PWD) {
          localStorage.setItem(LOCK_KEY, '1')
          doRender()
        } else {
          err.style.display = 'block'
          input.value = ''
          input.focus()
        }
      }
      btn.addEventListener('click', tryUnlock)
      input.addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock() })
      setTimeout(() => input.focus(), 100)
      return
    }

    const iframeWrap =
      '<div class="coming-soon-container">' +
        '<iframe id="coming-soon-iframe" class="coming-soon-iframe" src="' + URL + '" allow="fullscreen"></iframe>' +
        '<div id="coming-soon-fallback" style="display:none;padding:40px 20px;text-align:center;background:#12121a;border-radius:8px;margin-bottom:16px">' +
          '<div style="font-size:48px;margin-bottom:16px">🌐</div>' +
          '<div style="font-size:15px;color:#ef4444;margin-bottom:12px;font-weight:600">链接已被拦截，无法在 iframe 内加载</div>' +
          '<div style="font-size:13px;color:#888;margin-bottom:20px">可能是目标网站设置了 X-Frame-Options 或 CSP 保护</div>' +
          '<a href="' + URL + '" target="_blank" rel="noopener" style="display:inline-block;padding:10px 24px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">🔗 在浏览器中打开</a>' +
        '</div>' +
      '</div>'
    const footer =
      '<div class="coming-soon-footer">' +
        '<div class="coming-soon-url">链接：<a href="' + URL + '" target="_blank" rel="noopener">' + URL + '</a></div>' +
        '<span class="coming-soon-badge">🔒 已解锁</span>' +
      '</div>'
    const hint = '<p class="coming-soon-hint">如链接无法点击，请直接复制上方链接到浏览器打开</p>'

    root.innerHTML =
      '<div class="coming-soon-page">' +
        '<div class="tvbox-toolbar" style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06)">' +
          '<div style="display:flex;align-items:center;gap:10px;justify-content:space-between">' +
            '<div style="display:flex;align-items:center;gap:8px">' +
              '<span style="font-size:20px">🔒</span>' +
              '<span style="font-size:15px;font-weight:600;color:#fff">待开放功能</span>' +
            '</div>' +
            '<button id="t-lock-logout" style="cursor:pointer;background:rgba(167,139,250,.15);border:1px solid rgba(167,139,250,.3);color:#a78bfa;padding:5px 12px;border-radius:6px;font-size:12px">🔒 锁定</button>' +
          '</div>' +
        '</div>' +
        iframeWrap +
        footer +
        hint +
      '</div>'

    // iframe 加载超时 fallback（X-Frame-Options / CSP 拦截时 load 事件不触发）
    const iframe = root.querySelector('#coming-soon-iframe')
    const fallback = root.querySelector('#coming-soon-fallback')
    const loadTimer = setTimeout(() => {
      if (iframe) iframe.style.display = 'none'
      if (fallback) fallback.style.display = 'block'
    }, 8000)
    iframe.addEventListener('load', () => { clearTimeout(loadTimer) })
    iframe.addEventListener('error', () => {
      clearTimeout(loadTimer)
      if (iframe) iframe.style.display = 'none'
      if (fallback) fallback.style.display = 'block'
    })

    root.querySelector('#t-lock-logout')?.addEventListener('click', () => {
      localStorage.removeItem(LOCK_KEY)
      doRender()
    })
  }

  doRender()
  return root
}
