import '../style/pages.css';

const URL = 'https://zh.stripcam.xxx/top/girls/current-month-asia-and-pacific';
const LOCK_KEY = 'tulu_comingsoon_locked'
const CORRECT_PWD = '2552667173'

function render() {
  var el = document.getElementById('tvbox-app')
  if (!el) return

  if (localStorage.getItem(LOCK_KEY) !== '1') {
    el.innerHTML =
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
    const input = el.querySelector('#t-lock-pwd')
    const btn   = el.querySelector('#t-lock-btn')
    const err   = el.querySelector('#t-lock-err')

    function tryUnlock() {
      if (input.value === CORRECT_PWD) {
        localStorage.setItem(LOCK_KEY, '1')
        render()
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

  el.innerHTML =
    '<div class="tvbox-app coming-soon-page">' +
    '  <div class="tvbox-toolbar" style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06)">' +
    '    <div style="display:flex;align-items:center;gap:10px;justify-content:space-between">' +
    '      <div style="display:flex;align-items:center;gap:8px">' +
    '        <span style="font-size:20px">🔒</span>' +
    '        <span style="font-size:15px;font-weight:600;color:#fff">待开放功能</span>' +
    '      </div>' +
    '      <button id="t-lock-logout" style="cursor:pointer;background:rgba(167,139,250,.15);border:1px solid rgba(167,139,250,.3);color:#a78bfa;padding:5px 12px;border-radius:6px;font-size:12px">🔒 锁定</button>' +
    '    </div>' +
    '  </div>' +
    '  <div class="coming-soon-container">' +
    '    <iframe class="coming-soon-iframe" src="' + URL + '" allow="fullscreen"></iframe>' +
    '    <div class="coming-soon-footer">' +
    '      <div class="coming-soon-url">链接：<a href="' + URL + '" target="_blank" rel="noopener">' + URL + '</a></div>' +
    '    </div>' +
    '  </div>' +
    '  <p class="coming-soon-hint">如链接无法点击，请直接复制上方链接到浏览器打开</p>' +
    '</div>'

  el.querySelector('#t-lock-logout')?.addEventListener('click', () => {
    localStorage.removeItem(LOCK_KEY)
    render()
  })
}

render();
