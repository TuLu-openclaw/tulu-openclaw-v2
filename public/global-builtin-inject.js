// 悬浮提取按钮注入脚本 v7
// auth 由 global-builtin.html 处理（每次都要密码验证）
// 本脚本只负责：注入持久化悬浮按钮 + 嗅探（4层全覆盖） + 选择播放
// ★ 第4层：fetch/XHR/WebSocket 拦截（最早期注入，捕获所有动态请求）
(function() {
  if (!window.__tulu_hooked) {
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
  }
})();
(function() {
  if (window.__tulu_injected) return;
  window.__tulu_injected = true;

  // Tauri IPC 兼容检测
  function tauriInvoke(cmd, args) {
    if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
      return window.__TAURI__.core.invoke(cmd, args || {});
    }
    if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) {
      return window.__TAURI_INTERNALS__.invoke(cmd, args || {});
    }
    return Promise.reject(new Error('Tauri IPC not available'));
  }

  // ===== 悬浮按钮 =====
  function injectBar() {
    var old = document.getElementById('__tulu_float_bar');
    if (old) old.remove();
    var oldToast = document.getElementById('__tulu_toast');
    if (oldToast) oldToast.remove();
    var oldPanel = document.getElementById('__tulu_source_panel');
    if (oldPanel) oldPanel.remove();

    var bar = document.createElement('div');
    bar.id = '__tulu_float_bar';
    bar.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;display:flex;flex-direction:column;gap:10px;align-items:flex-end;pointer-events:none;';

    var btnMain = document.createElement('button');
    btnMain.innerHTML = '&#9654;';
    btnMain.title = '提取视频';
    btnMain.style.cssText = 'width:52px;height:52px;border-radius:50%;border:none;cursor:pointer;font-size:22px;color:#fff;background:linear-gradient(135deg,#ef4444,#dc2626);box-shadow:0 4px 16px rgba(239,68,68,0.4);display:flex;align-items:center;justify-content:center;transition:all 0.2s;font-family:system-ui;pointer-events:auto;position:relative;animation:pulseBtn 2s ease-in-out infinite;';

    if (!document.getElementById('__tulu_style')) {
      var style = document.createElement('style');
      style.id = '__tulu_style';
      style.textContent = '@keyframes pulseBtn{0%,100%{box-shadow:0 4px 16px rgba(239,68,68,0.3)}50%{box-shadow:0 4px 32px rgba(239,68,68,0.7)}}';
      document.head.appendChild(style);
    }

    // 点击嗅探
    btnMain.onclick = async function() {
      btnMain.disabled = true;
      btnMain.innerHTML = '&#8987;';
      tuluToast('正在深度扫描页面...');
      try {
        var domSources = scanPageDOM();
        var rustSources = [];
        try {
          rustSources = await tauriInvoke('fetch_live_sources', { url: window.location.href });
        } catch(e) {
          console.warn('[tulu] Rust scan unavailable:', e.message);
        }
        var allSources = mergeSources(domSources, rustSources || []);
        if (allSources.length > 0) {
          tuluToast('找到 ' + allSources.length + ' 个视频源', 5000);
          showSourceSelector(allSources);
        } else {
          tuluToast('未检测到视频源，请确认页面上有视频在播放', 10000);
        }
      } catch(err) {
        tuluToast('提取失败: ' + String(err), 8000);
      } finally {
        btnMain.disabled = false;
        btnMain.innerHTML = '&#9654;';
      }
    };

    var hint = document.createElement('div');
    hint.style.cssText = 'position:relative;right:0;bottom:0;background:rgba(15,15,25,0.92);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.6);padding:8px 14px;border-radius:8px;font-size:11px;white-space:nowrap;font-family:Inter,Microsoft YaHei,sans-serif;pointer-events:none;opacity:1;transition:opacity 0.5s ease;';
    hint.textContent = '点击提取当前页面视频源';
    bar.appendChild(btnMain);
    bar.appendChild(hint);
    document.body.appendChild(bar);

    setTimeout(function() {
      try { hint.style.opacity = '0'; } catch(e) {}
      setTimeout(function() { try { hint.remove(); } catch(e) {} }, 600);
    }, 15000);

    // Toast
    var toast = document.createElement('div');
    toast.id = '__tulu_toast';
    toast.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);z-index:2147483648;background:rgba(15,15,25,0.95);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:12px 22px;border-radius:12px;font-size:13px;display:none;max-width:420px;backdrop-filter:blur(16px);box-shadow:0 8px 24px rgba(0,0,0,0.4);word-break:break-all;font-family:Inter,Microsoft YaHei,sans-serif;pointer-events:none;text-align:center;';
    document.body.appendChild(toast);
    window.tuluToast = function(msg, dur) {
      dur = dur || 10000;
      toast.textContent = msg;
      toast.style.display = 'block';
      clearTimeout(window._tuluToastT);
      window._tuluToastT = setTimeout(function() { try { toast.style.display = 'none'; } catch(e) {} }, dur);
    };
  }

  // ===== 资源选择面板 =====
  function showSourceSelector(sources) {
    var old = document.getElementById('__tulu_source_panel');
    if (old) old.remove();

    var panel = document.createElement('div');
    panel.id = '__tulu_source_panel';
    panel.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2147483647;width:520px;max-width:90vw;max-height:80vh;background:rgba(10,10,20,0.97);border:1px solid rgba(255,255,255,0.1);border-radius:16px;backdrop-filter:blur(24px);box-shadow:0 24px 64px rgba(0,0,0,0.6);font-family:Inter,Microsoft YaHei,sans-serif;color:#fff;overflow:hidden;display:flex;flex-direction:column;';

    // 标题栏
    var header = document.createElement('div');
    header.style.cssText = 'padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;';
    var title = document.createElement('div');
    title.style.cssText = 'font-size:16px;font-weight:700;';
    title.textContent = '选择视频源 (' + sources.length + '个)';
    var closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&#10005;';
    closeBtn.style.cssText = 'width:32px;height:32px;border:none;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.5);border-radius:8px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;';
    closeBtn.onclick = function() { panel.remove(); };
    header.appendChild(title);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // 列表
    var list = document.createElement('div');
    list.style.cssText = 'padding:8px;overflow-y:auto;flex:1;';
    sources.forEach(function(src, i) {
      var item = document.createElement('div');
      item.style.cssText = 'padding:12px 16px;margin:4px 0;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;cursor:pointer;transition:all 0.15s;';
      item.onmouseenter = function() { item.style.background = 'rgba(99,102,241,0.15)'; item.style.borderColor = 'rgba(99,102,241,0.3)'; };
      item.onmouseleave = function() { item.style.background = 'rgba(255,255,255,0.03)'; item.style.borderColor = 'rgba(255,255,255,0.06)'; };

      var idx = document.createElement('span');
      idx.style.cssText = 'display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;background:rgba(99,102,241,0.2);color:#818cf8;border-radius:6px;font-size:11px;font-weight:700;margin-right:10px;';
      idx.textContent = i + 1;

      var urlText = document.createElement('span');
      urlText.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.7);word-break:break-all;line-height:1.4;';
      var displayUrl = src.url.length > 80 ? src.url.substring(0, 80) + '...' : src.url;
      urlText.textContent = displayUrl;
      urlText.title = src.url;

      var fromTag = document.createElement('span');
      fromTag.style.cssText = 'display:inline-block;margin-left:8px;padding:2px 6px;background:rgba(255,255,255,0.06);border-radius:4px;font-size:10px;color:rgba(255,255,255,0.35);';
      fromTag.textContent = src.from || src.type || '';

      item.appendChild(idx);
      item.appendChild(urlText);
      if (src.from || src.type) item.appendChild(fromTag);

      item.onclick = function() {
        panel.remove();
        playSource(src, i + 1);
      };
      list.appendChild(item);
    });
    panel.appendChild(list);

    // 底部操作栏
    var footer = document.createElement('div');
    footer.style.cssText = 'padding:12px 20px;border-top:1px solid rgba(255,255,255,0.08);display:flex;gap:8px;justify-content:flex-end;';
    var playAllBtn = document.createElement('button');
    playAllBtn.textContent = '全部播放';
    playAllBtn.style.cssText = 'padding:8px 16px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.6);border-radius:8px;cursor:pointer;font-size:12px;';
    playAllBtn.onclick = function() {
      panel.remove();
      playAllSources(sources);
    };
    footer.appendChild(playAllBtn);
    panel.appendChild(footer);

    document.body.appendChild(panel);

    // 点击外部关闭（延迟启用防误触）
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0.15);';
    var overlayReady = false
    setTimeout(function() { overlayReady = true }, 800)
    overlay.onclick = function() { if (overlayReady) { panel.remove(); overlay.remove(); } };
    document.body.appendChild(overlay);
    panel.addEventListener('click', function(e) { e.stopPropagation(); });
  }

  // ===== 播放单个资源 =====
  async function playSource(src, idx) {
    tuluToast('正在打开播放器: 资源' + idx + '...');
    try {
      await tauriInvoke('open_live_player', { sources: [src] });
      tuluToast('播放器已打开', 5000);
    } catch(e) {
      tuluToast('播放器打开失败，尝试直接播放...', 5000);
      try { window.open(src.url, '_blank'); } catch(e2) {
        tuluToast('播放失败: ' + String(e), 8000);
      }
    }
  }

  // ===== 播放全部资源 =====
  async function playAllSources(sources) {
    tuluToast('正在打开播放器...');
    try {
      await tauriInvoke('open_live_player', { sources: sources });
      tuluToast('播放器已打开', 5000);
    } catch(e) {
      tuluToast('播放器打开失败: ' + String(e), 8000);
    }
  }

  // ===== DOM 扫描 =====
  function scanPageDOM() {
    var sources = [];
    var seen = {};
    function add(url, type) {
      if (!url || seen[url]) return;
      if (/^blob:|^data:|^about:|^javascript:/.test(url)) return;
      if (url.length < 10 || url.length > 4096) return;
      seen[url] = true;
      sources.push({ url: url, type: type || 'unknown' });
    }
    document.querySelectorAll('video,audio,source').forEach(function(el) {
      var s = el.src || el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('data-url');
      if (s) add(s, 'media-el');
    });
    document.querySelectorAll('iframe').forEach(function(f) {
      var s = f.src || f.getAttribute('data-src') || '';
      if (s && !/^about:|javascript:/.test(s)) add(s, 'iframe');
    });
    document.querySelectorAll('a[href]').forEach(function(a) {
      if (/\.(m3u8|mp4|flv|webm|ts)(\?|$)/i.test(a.href)) add(a.href, 'link');
    });
    document.querySelectorAll('script').forEach(function(s) {
      extractUrls(s.textContent || '').forEach(function(u) { add(u, 'script'); });
    });
    // ★ 第3层：Performance API 网络请求拦截
    try {
      var perfEntries = performance.getEntriesByType('resource');
      for (var i = 0; i < perfEntries.length; i++) {
        var entry = perfEntries[i];
        var url = entry.name;
        if (!url) continue;
        var lower = url.toLowerCase();
        if (lower.indexOf('.m3u8') !== -1) add(url, 'network.m3u8');
        else if (lower.indexOf('.mp4') !== -1) add(url, 'network.mp4');
        else if (lower.indexOf('.mpd') !== -1) add(url, 'network.dash');
        else if (lower.indexOf('.flv') !== -1) add(url, 'network.flv');
        else if (lower.indexOf('.m4s') !== -1) add(url, 'network.m4s');
        else if (lower.indexOf('.ts') !== -1) add(url, 'network.ts');
      }
    } catch(e) {}
    // 全局变量
    try {
      var g = ['videoUrl','playUrl','streamUrl','hlsUrl','m3u8Url','playerUrl','sourceUrl','stream','videoSrc','playSrc'];
      g.forEach(function(n) {
        if (window[n] && typeof window[n] === 'string' && /\.(m3u8|mp4|flv|webm)/i.test(window[n])) add(window[n], 'gvar-'+n);
      });
      if (window.dp && window.dp.video && window.dp.video.src) add(window.dp.video.src, 'dplayer');
      if (window.artplayer && window.artplayer.url) add(window.artplayer.url, 'artplayer');
      if (window.APLAYER && window.APLAYER.audio && window.APLAYER.audio.src) add(window.APLAYER.audio.src, 'aplayer');
    } catch(e) {}
    return sources;
  }

  function extractUrls(text) {
    if (!text) return [];
    var urls = [], s = {};
    var pats = [
      /https?:\/\/[^\s"'<>`\\]+\.m3u8[^\s"'<>`\\]*/gi,
      /https?:\/\/[^\s"'<>`\\]+\.mp4[^\s"'<>`\\]*/gi,
      /https?:\/\/[^\s"'<>`\\]+\.flv[^\s"'<>`\\]*/gi,
      /https?:\/\/[^\s"'<>`\\]+\.webm[^\s"'<>`\\]*/gi,
    ];
    pats.forEach(function(re) {
      var m; while ((m = re.exec(text)) !== null) {
        var u = m[0].trim().replace(/['"<>`]+$/g,'');
        if (u.length > 10 && !s[u]) { s[u]=true; urls.push(u); }
      }
    });
    var b64 = /["']([A-Za-z0-9+\/]{30,}={0,2})["']/g, bm;
    while ((bm=b64.exec(text)) !== null) {
      try {
        var d = atob(bm[1]);
        if (/\.(?:m3u8|mp4|flv|webm)/i.test(d)) {
          var u = d.trim();
          if (!s[u]) { s[u]=true; urls.push(u); }
        }
      } catch(e) {}
    }
    return urls;
  }

  function mergeSources(a, b) {
    var seen = {};
    return (a||[]).concat(b||[]).filter(function(s) {
      if (!s || !s.url || seen[s.url]) return false;
      seen[s.url] = true; return true;
    });
  }

  injectBar();
})();
