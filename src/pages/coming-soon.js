import './tvbox.css';

const URL = 'https://zh.stripcam.xxx/top/girls/current-month-asia-and-pacific';

export default function render() {
  const el = document.createElement('div');
  el.className = 'tvbox-page-root';
  el.innerHTML =
    '<div class="tvbox-app" style="flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#1a1a2e;padding:20px;box-sizing:border-box">' +
    '<div style="width:100%;max-width:1200px;height:calc(100vh - 120px);border-radius:12px;overflow:hidden;border:2px solid #333">' +
    '<iframe src="' + URL + '" style="width:100%;height:100%;border:none;display:block" allow="fullscreen" allowfullscreen></iframe>' +
    '</div>' +
    '<p style="color:#666;font-size:13px;margin-top:16px;text-align:center">待开放使用</p>' +
    '</div>';
  return el;
}
