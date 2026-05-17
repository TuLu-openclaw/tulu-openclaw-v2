// 全球内置 — 最早期钩子脚本（init 注入）
// 通过 Tauri initialization_script 注入，在页面任何 JS 执行前运行
// 确保 fetch/XHR/WebSocket 请求无一漏网
(function() {
  window.__tulu_hooked = true;
  window.__fetchUrls = [];
  window.__xhrUrls = [];
  window.__wsUrls = [];
  try {
    var _fetch = window.fetch;
    window.fetch = function() {
      try { var u = arguments[0]; window.__fetchUrls.push(typeof u === 'string' ? u : (u && u.url) || ''); } catch(e) {}
      return _fetch.apply(this, arguments);
    };
  } catch(e) {}
  try {
    var _xhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      try { window.__xhrUrls.push(url); } catch(e) {}
      return _xhrOpen.apply(this, arguments);
    };
  } catch(e) {}
  try {
    var _WS = window.WebSocket;
    window.WebSocket = function(url, protocols) {
      try { window.__wsUrls.push(url); } catch(e) {}
      if (protocols !== undefined) return new _WS(url, protocols);
      return new _WS(url);
    };
    window.WebSocket.prototype = _WS.prototype;
    window.WebSocket.CONNECTING = _WS.CONNECTING;
    window.WebSocket.OPEN = _WS.OPEN;
    window.WebSocket.CLOSING = _WS.CLOSING;
    window.WebSocket.CLOSED = _WS.CLOSED;
  } catch(e) {}
})();
