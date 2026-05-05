// 全球内置 - 浮动提取按钮注入脚本 v2
// 通过 Tauri eval 注入到主窗口页面 DOM 中
(function() {
  if (window.__tulu_injected) return;
  window.__tulu_injected = true;

  // ===== 密码验证 =====
  if (!window.__tulu_verified) {
    showAuth();
    return;
  }
  injectBar();

  function showAuth() {
    // Create a shadow DOM overlay to isolate from page events
    var host = document.createElement('div');
    host.id = '__tulu_auth_host';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
    var shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        .overlay {
          position:fixed; inset:0; background:rgba(5,5,16,0.97);
          display:flex; align-items:center; justify-content:center;
          font-family: 'Microsoft YaHei','Segoe UI',sans-serif;
        }
        .card {
          text-align:center; padding:48px 40px;
          background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08);
          border-radius:24px; backdrop-filter:blur(24px);
          box-shadow:0 32px 64px rgba(0,0,0,0.5); max-width:400px; width:90%;
          animation: cardIn 0.6s cubic-bezier(0.16,1,0.3,1);
        }
        @keyframes cardIn { from{opacity:0;transform:translateY(30px) scale(0.96)} to{opacity:1;transform:none} }
        .ring {
          width:72px; height:72px; margin:0 auto 24px; border-radius:50%;
          background:conic-gradient(from 0deg,#6366f1,#8b5cf6,#ec4899,#f43f5e,#f59e0b,#6366f1);
          display:flex; align-items:center; justify-content:center;
          animation: spin 4s linear infinite; position:relative;
        }
        .ring::before { content:''; position:absolute; inset:3px; border-radius:50%; background:rgba(5,5,16,0.97); }
        .ring-inner { position:relative; z-index:1; font-size:28px; }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .title { font-size:20px; font-weight:700; color:#fff; margin-bottom:6px; }
        .sub { font-size:13px; color:rgba(255,255,255,0.35); margin-bottom:28px; }
        .input {
          width:100%; padding:14px 16px; font-size:16px;
          font-family:'JetBrains Mono','Courier New',monospace;
          background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);
          border-radius:12px; color:#fff; outline:none;
          letter-spacing:5px; text-align:center;
          transition: border-color 0.3s, box-shadow 0.3s;
        }
        .input::placeholder { color:rgba(255,255,255,0.15); letter-spacing:2px; font-size:13px; }
        .input:focus { border-color:rgba(99,102,241,0.5); box-shadow:0 0 0 3px rgba(99,102,241,0.1); }
        .input.error { border-color:rgba(239,68,68,0.6); animation:shake 0.4s ease; }
        @keyframes shake {
          0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)}
          40%{transform:translateX(8px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)}
        }
        .hint { margin-top:14px; font-size:11px; color:rgba(255,255,255,0.2); }
        .err { margin-top:10px; font-size:12px; color:rgba(239,68,68,0.8); display:none; }
      </style>
      <div class="overlay">
        <div class="card">
          <div class="ring"><span class="ring-inner">🔐</span></div>
          <div class="title">安全验证</div>
          <div class="sub">请输入访问密码以继续</div>
          <input type="password" class="input" id="pwd" placeholder="输入密码" autocomplete="off" autofocus>
          <div class="err" id="err">密码错误，请重试</div>
          <div class="hint">按 <b>Enter</b> 确认</div>
        </div>
      </div>
    `;

    // Stop all events from propagating to the page
    ['keydown','keyup','keypress','mousedown','mouseup','click','touchstart','touchend'].forEach(function(evt) {
      host.addEventListener(evt, function(e) { e.stopPropagation(); }, true);
    });

    document.body.appendChild(host);

    var pwdInput = shadow.getElementById('pwd');
    var errEl = shadow.getElementById('err');

    // Focus with retry (some pages fight for focus)
    setTimeout(function() { pwdInput.focus(); }, 100);
    setTimeout(function() { pwdInput.focus(); }, 500);
    setTimeout(function() { pwdInput.focus(); }, 1000);

    // Keep focus on input
    var focusInterval = setInterval(function() {
      if (!document.getElementById('__tulu_auth_host')) { clearInterval(focusInterval); return; }
      if (document.activeElement !== pwdInput && shadow.activeElement !== pwdInput) {
        pwdInput.focus();
      }
    }, 200);

    pwdInput.addEventListener('keydown', function(e) {
      e.stopPropagation();
      if (e.key === 'Enter') {
        if (pwdInput.value === '2552667173') {
          window.__tulu_verified = true;
          clearInterval(focusInterval);
          host.style.opacity = '0';
          host.style.transition = 'opacity 0.5s';
          setTimeout(function() { host.remove(); injectBar(); }, 500);
        } else {
          pwdInput.classList.add('error');
          pwdInput.value = '';
          errEl.style.display = 'block';
          setTimeout(function() { pwdInput.classList.remove('error'); }, 500);
        }
      }
    });
  }

  // ===== 悬浮提取按钮 =====
  function injectBar() {
    var bar = document.createElement('div');
    bar.id = '__tulu_float_bar';
    bar.style.cssText = 'position:fixed;bottom:32px;right:32px;z-index:2147483647;display:flex;flex-direction:column;gap:12px;align-items:flex-end;pointer-events:none;';

    // Extract button
    var btnExtract = document.createElement('button');
    btnExtract.innerHTML = '▶';
    btnExtract.title = '提取视频链接并播放';
    btnExtract.style.cssText = 'width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;font-size:24px;color:#fff;background:linear-gradient(135deg,#ef4444,#dc2626);box-shadow:0 4px 20px rgba(239,68,68,0.3);display:flex;align-items:center;justify-content:center;transition:all 0.2s;font-family:system-ui;pointer-events:auto;';

    btnExtract.onclick = async function() {
      btnExtract.disabled = true;
      btnExtract.innerHTML = '⏳';
      tuluToast('正在深度扫描页面所有内容...');
      try {
        var pageUrl = window.location.href;
        // Also scan current page DOM for video sources
        var domSources = scanPageDOM();
        // Call Rust to fetch + scan from server side
        var rustSources = [];
        try {
          rustSources = await window.__TAURI__.core.invoke('fetch_live_sources', { url: pageUrl });
        } catch(e) {}

        // Merge + deduplicate
        var allSources = mergeSources(domSources, rustSources);

        if (allSources.length > 0) {
          tuluToast('找到 ' + allSources.length + ' 个视频源，正在打开播放器...');
          await window.__TAURI__.core.invoke('open_live_player', { sources: allSources });
        } else {
          tuluToast('未检测到视频源，尝试深度探测...', 5000);
          // Try probing common paths
          var probed = await probeCommonPaths(pageUrl);
          if (probed.length > 0) {
            tuluToast('探测到 ' + probed.length + ' 个视频源！');
            await window.__TAURI__.core.invoke('open_live_player', { sources: probed });
          } else {
            tuluToast('无法提取视频源，请确认页面上有视频在播放', 8000);
          }
        }
      } catch (err) {
        tuluToast('提取失败: ' + String(err), 6000);
      } finally {
        btnExtract.disabled = false;
        btnExtract.innerHTML = '▶';
      }
    };

    // Toast
    var toastEl = document.createElement('div');
    toastEl.style.cssText = 'position:fixed;bottom:110px;right:32px;z-index:2147483648;background:rgba(15,15,25,0.95);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:12px 20px;border-radius:12px;font-size:13px;display:none;max-width:360px;backdrop-filter:blur(16px);box-shadow:0 8px 24px rgba(0,0,0,0.4);word-break:break-all;font-family:Inter,Microsoft YaHei,sans-serif;pointer-events:none;';

    window.tuluToast = function(msg, dur) {
      dur = dur || 4000;
      toastEl.textContent = msg;
      toastEl.style.display = 'block';
      clearTimeout(window._tuluToastT);
      window._tuluToastT = setTimeout(function() { toastEl.style.display = 'none'; }, dur);
    };

    bar.appendChild(btnExtract);
    document.body.appendChild(bar);
    document.body.appendChild(toastEl);
  }

  // ===== DOM 扫描：从当前页面直接提取视频源 =====
  function scanPageDOM() {
    var sources = [];
    var seen = {};

    function addSource(url, type) {
      if (!url || seen[url]) return;
      if (url.startsWith('blob:') || url.startsWith('data:')) return;
      seen[url] = true;
      sources.push({ url: url, type: type || 'unknown', quality: detectQuality(url) });
    }

    // 1. 所有 <video> 和 <source> 元素
    document.querySelectorAll('video,video source,source').forEach(function(el) {
      var src = el.src || el.currentSrc || el.getAttribute('src') || el.getAttribute('data-src');
      if (src) addSource(src, 'video-element');
    });

    // 2. 所有 <iframe> 中的视频（跨域无法访问，但记录 src）
    document.querySelectorAll('iframe').forEach(function(f) {
      var src = f.src || f.getAttribute('data-src') || '';
      if (src && !src.startsWith('about:') && !src.startsWith('javascript:')) {
        addSource(src, 'iframe');
      }
    });

    // 3. 所有 <a> 标签中的视频链接
    document.querySelectorAll('a[href]').forEach(function(a) {
      var href = a.href;
      if (/\.(m3u8|mp4|flv|webm|ts)(\?|$)/i.test(href)) {
        addSource(href, 'link');
      }
    });

    // 4. 扫描所有 script 标签内容
    document.querySelectorAll('script').forEach(function(s) {
      var text = s.textContent || s.innerText || '';
      extractUrlsFromText(text).forEach(function(u) { addSource(u, 'script-inline'); });
    });

    // 5. 扫描页面 HTML 源码
    var html = document.documentElement.outerHTML;
    extractUrlsFromText(html).forEach(function(u) { addSource(u, 'html-scan'); });

    // 6. 检查全局变量中的播放地址
    try {
      var globalVars = ['videoUrl','playUrl','streamUrl','hlsUrl','m3u8Url','flvUrl','source','url','src','file'];
      globalVars.forEach(function(name) {
        if (window[name] && typeof window[name] === 'string' && /\.(m3u8|mp4|flv|webm)/i.test(window[name])) {
          addSource(window[name], 'global-var-' + name);
        }
      });
      // Check common player objects
      if (window.player && window.player.src) addSource(window.player.src, 'player-obj');
      if (window.dPlayer && window.dPlayer.video && window.dPlayer.video.src) addSource(window.dPlayer.video.src, 'dplayer');
      if (window.art && window.art.url) addSource(window.art.url, 'artplayer');
      if (window.aplayer && window.aplayer.audio && window.aplayer.audio.src) addSource(window.aplayer.audio.src, 'aplayer');
    } catch(e) {}

    return sources;
  }

  // 从文本中提取 m3u8/mp4/flv 等视频 URL
  function extractUrlsFromText(text) {
    if (!text) return [];
    var urls = [];
    var seen = {};
    // Standard URL patterns
    var patterns = [
      /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/gi,
      /https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/gi,
      /https?:\/\/[^\s"'<>]+\.flv[^\s"'<>]*/gi,
      /https?:\/\/[^\s"'<>]+\.webm[^\s"'<>]*/gi,
      /https?:\/\/[^\s"'<>]+\.ts[^\s"'<>]*/gi,
      // Quoted strings
      /["'](https?:\/\/[^"']+\.(?:m3u8|mp4|flv|webm|ts)[^"']*?)["']/gi,
    ];
    patterns.forEach(function(re) {
      var m;
      while ((m = re.exec(text)) !== null) {
        var url = (m[1] || m[0]).trim().replace(/['"]/g, '');
        if (!seen[url] && url.length > 10) {
          seen[url] = true;
          urls.push(url);
        }
      }
    });

    // Base64 encoded URLs (common obfuscation)
    var b64Pattern = /["']([A-Za-z0-9+\/]{20,}={0,2})["']/g;
    var bm;
    while ((bm = b64Pattern.exec(text)) !== null) {
      try {
        var decoded = atob(bm[1]);
        if (/\.(m3u8|mp4|flv|webm)/i.test(decoded)) {
          var u = decoded.trim();
          if (!seen[u]) { seen[u] = true; urls.push(u); }
        }
      } catch(e) {}
    }

    // eval/Function 解码
    try {
      var evalPattern = /eval\(function\(p,a,c,k,e,d\).*?\)/g;
      var em;
      while ((em = evalPattern.exec(text)) !== null) {
        try {
          var unpacked = eval(em[0]);
          if (typeof unpacked === 'string') {
            extractUrlsFromText(unpacked).forEach(function(u) {
              if (!seen[u]) { seen[u] = true; urls.push(u); }
            });
          }
        } catch(e2) {}
      }
    } catch(e) {}

    return urls;
  }

  function detectQuality(url) {
    var u = url.toLowerCase();
    if (/4k|2160|uhd/.test(u)) return '4K';
    if (/1080|fhd|fullhd/.test(u)) return '1080P';
    if (/720|hd/.test(u)) return '720P';
    if (/480|sd/.test(u)) return '480P';
    if (/360/.test(u)) return '360P';
    return 'auto';
  }

  function mergeSources(a, b) {
    var seen = {};
    var result = [];
    a.concat(b || []).forEach(function(s) {
      if (s && s.url && !seen[s.url]) {
        seen[s.url] = true;
        result.push(s);
      }
    });
    return result;
  }

  // 深度探测常见视频路径
  async function probeCommonPaths(pageUrl) {
    var sources = [];
    var base;
    try { base = new URL(pageUrl); } catch(e) { return sources; }
    var origin = base.origin;
    var paths = [
      '/live/live.m3u8', '/live.m3u8', '/stream.m3u8', '/index.m3u8',
      '/hls/stream.m3u8', '/video/stream.m3u8', '/play.m3u8',
      '/live/stream.m3u8', '/output.m3u8', '/playlist.m3u8',
    ];
    var checks = paths.map(function(p) {
      return origin + p;
    });
    // Also try the page URL itself as m3u8
    checks.push(pageUrl);

    for (var i = 0; i < checks.length; i++) {
      try {
        var resp = await fetch(checks[i], { method: 'GET', mode: 'no-cors' });
        // no-cors won't let us read, but we can try
        sources.push({ url: checks[i], type: 'probe', quality: 'auto' });
      } catch(e) {}
    }
    return sources;
  }
})();
