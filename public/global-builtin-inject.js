// 悬浮提取按钮注入脚本 v4
// auth 由 global-builtin.html 处理（window.location.href 导航后）
// 本脚本只负责：注入持久化悬浮按钮 + 嗅探播放
(function() {
  if (window.__tulu_injected) return;
  window.__tulu_injected = true;

  // ===== 注入持久化悬浮按钮 =====
  function injectBar() {
    // 移除旧的（如果存在）
    var old = document.getElementById('__tulu_float_bar');
    if (old) old.remove();
    var oldToast = document.getElementById('__tulu_toast');
    if (oldToast) oldToast.remove();

    var bar = document.createElement('div');
    bar.id = '__tulu_float_bar';
    bar.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;display:flex;flex-direction:column;gap:10px;align-items:flex-end;pointer-events:none;';

    // 主按钮（提取）
    var btnMain = document.createElement('button');
    btnMain.innerHTML = '&#9654;'; // ▶
    btnMain.title = '提取视频';
    btnMain.style.cssText = 'width:52px;height:52px;border-radius:50%;border:none;cursor:pointer;font-size:22px;color:#fff;background:linear-gradient(135deg,#ef4444,#dc2626);box-shadow:0 4px 16px rgba(239,68,68,0.4);display:flex;align-items:center;justify-content:center;transition:all 0.2s;font-family:system-ui;pointer-events:auto;position:relative;animation:pulseBtn 2s ease-in-out infinite;';

    // 添加动画样式
    if (!document.getElementById('__tulu_style')) {
      var style = document.createElement('style');
      style.id = '__tulu_style';
      style.textContent = '@keyframes pulseBtn{0%,100%{box-shadow:0 4px 16px rgba(239,68,68,0.3)}50%{box-shadow:0 4px 32px rgba(239,68,68,0.7)}}';
      document.head.appendChild(style);
    }

    btnMain.onclick = async function() {
      btnMain.disabled = true;
      btnMain.innerHTML = '&#8987;'; // ⏳
      tuluToast('正在深度扫描页面...');
      try {
        var domSources = scanPageDOM();
        var rustSources = [];
        try {
          rustSources = await window.__TAURI__.core.invoke('fetch_live_sources', { url: window.location.href });
        } catch(e) {}
        var allSources = mergeSources(domSources, rustSources || []);
        if (allSources.length > 0) {
          tuluToast('找到 ' + allSources.length + ' 个视频源，正在打开播放器...', 12000);
          await window.__TAURI__.core.invoke('open_live_player', { sources: allSources });
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

    // 悬浮提示（15秒后自动消失）
    var hint = document.createElement('div');
    hint.style.cssText = 'position:relative;right:0;bottom:0;background:rgba(15,15,25,0.92);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.6);padding:8px 14px;border-radius:8px;font-size:11px;white-space:nowrap;font-family:Inter,Microsoft YaHei,sans-serif;pointer-events:none;opacity:1;transition:opacity 0.5s ease;';
    hint.textContent = '点击提取当前页面视频源';

    bar.appendChild(btnMain);
    bar.appendChild(hint);
    document.body.appendChild(bar);

    // 提示15秒后消失
    setTimeout(function() {
      try { hint.style.opacity = '0'; } catch(e) {}
      setTimeout(function() { try { hint.remove(); } catch(e) {} }, 600);
    }, 15000);

    // Toast 通知
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

  // ===== DOM 扫描 =====
  function scanPageDOM() {
    var sources = [];
    var seen = {};
    function add(url, type) {
      if (!url || seen[url]) return;
      if (/^blob:|data:/.test(url)) return;
      seen[url] = true;
      sources.push({ url: url, type: type || 'unknown' });
    }
    document.querySelectorAll('video,source').forEach(function(el) {
      var s = el.src || el.getAttribute('src') || el.getAttribute('data-src');
      if (s) add(s, 'video-el');
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
    try {
      var g = ['videoUrl','playUrl','streamUrl','hlsUrl','m3u8Url','playerUrl','sourceUrl','stream'];
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
    var urls = [], seen = {};
    var pats = [
      /https?:\/\/[^\s"'<>`]+\.(?:m3u8|mp4|flv|webm|ts)[^\s"'<>`]*/gi,
      /["'](https?:\/\/[^"']+\.(?:m3u8|mp4|flv|webm|ts)[^"']*?)["']/gi
    ];
    pats.forEach(function(re) {
      var m; while ((m = re.exec(text)) !== null) {
        var u = (m[1]||m[0]).trim().replace(/['"]/g,'');
        if (u.length > 10 && !seen[u]) { seen[u]=true; urls.push(u); }
      }
    });
    // base64
    var b64 = /["']([A-Za-z0-9+\/]{30,}={0,2})["']/g, bm;
    while ((bm=b64.exec(text)) !== null) {
      try {
        var d = atob(bm[1]);
        if (/\.(?:m3u8|mp4|flv|webm)/i.test(d)) {
          var u = d.trim();
          if (!seen[u]) { seen[u]=true; urls.push(u); }
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

  // ===== 初始化：注入悬浮按钮 =====
  injectBar();
})();
