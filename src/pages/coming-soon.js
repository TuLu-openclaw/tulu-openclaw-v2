import '../style/movie-tool.css';

const URL = 'https://zh.stripcam.xxx/top/girls/current-month-asia-and-pacific';

function render() {
  var el = document.getElementById('tvbox-app');
  if (!el) return;
  el.innerHTML =
    '<div class="tvbox-app coming-soon-page">' +
    '  <div class="coming-soon-container">' +
    '    <iframe class="coming-soon-iframe" src="' + URL + '" allow="fullscreen"></iframe>' +
    '    <div class="coming-soon-footer">' +
    '      <div class="coming-soon-url">链接：<a href="' + URL + '" target="_blank" rel="noopener">' + URL + '</a></div>' +
    '      <span class="coming-soon-badge">待开放功能</span>' +
    '    </div>' +
    '  </div>' +
    '  <p class="coming-soon-hint">如链接无法点击，请直接复制上方链接到浏览器打开</p>' +
    '</div>';
}

render();
