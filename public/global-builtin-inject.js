// 全球内置 - 浮动提取按钮注入脚本 v3
// 每次打开都强制验证 / 按钮小型化 / 提示10秒消失
(function() {
  if (window.__tulu_injected) return;
  window.__tulu_injected = true;

  // 每次打开global-builtin窗口都必须验证（不使用sessionStorage缓存）
  showAuth();

  // ===== 密码验证（全屏遮罩 + Shadow DOM隔离） =====
  function showAuth() {
    var host = document.createElement('div');
    host.id = '__tulu_auth_host';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
    var shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        .overlay{
          position:fixed;inset:0;background:rgba(5,5,16,0.97);
          display:flex;align-items:center;justify-content:center;
          font-family:'Microsoft YaHei','Segoe UI',sans-serif;
        }
        .card{
          text-align:center;padding:40px 36px;
          background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);
          border-radius:20px;backdrop-filter:blur(24px);
          box-shadow:0 24px 56px rgba(0,0,0,0.5);max-width:360px;width:90%;
          animation:cardIn 0.5s cubic-bezier(0.16,1,0.3,1);
        }
        @keyframes cardIn{from{opacity:0;transform:translateY(24px) scale(0.96)}to{opacity:1;transform:none}}
        .icon{
          width:56px;height:56px;margin:0 auto 20px;border-radius:50%;
          background:conic-gradient(from 0deg,#6366f1,#8b5cf6,#ec4899,#f43f5e,#f59e0b,#6366f1);
          display:flex;align-items:center;justify-content:center;
          animation:spin 4s linear infinite;position:relative;
        }
        .icon::before{content:'';position:absolute;inset:3px;border-radius:50%;background:rgba(5,5,16,0.97);}
        .icon-inner{position:relative;z-index:1;font-size:24px;}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .title{font-size:18px;font-weight:700;color:#fff;margin-bottom:6px;}
        .sub{font-size:13px;color:rgba(255,255,255,0.35);margin-bottom:24px;}
        .input{
          width:100%;padding:12px 16px;font-size:16px;
          font-family:'JetBrains Mono','Courier New',monospace;
          background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);
          border-radius:10px;color:#fff;outline:none;
          letter-spacing:4px;text-align:center;
          transition:border-color 0.3s,box-shadow 0.3s;
        }
        .input::placeholder{color:rgba(255,255,255,0.15);letter-spacing:2px;font-size:12px;}
        .input:focus{border-color:rgba(99,102,241,0.5);box-shadow:0 0 0 3px rgba(99,102,241,0.1);}
        .input.err{border-color:rgba(239,68,68,0.6);animation:shake 0.4s ease}
        @keyframes shake{
          0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}
          40%{transform:translateX(6px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}
        }
        .hint{margin-top:12px;font-size:11px;color:rgba(255,255,255,0.2);}
        .err{margin-top:10px;font-size:12px;color:rgba(239,68,68,0.8);display:none;}
      </style>
      <div class="overlay">
        <div class="card">
          <div class="icon"><span class="icon-inner">🔐</span></div>
          <div class="title">安全验证</div>
          <div class="sub">请输入访问密码以继续</div>
          <input type="password" class="input" id="pwd" placeholder="输入密码" autocomplete="off">
          <div class="err" id="err">密码错误，请重试</div>
          <div class="hint">按 <b>Enter</b> 确认</div>
        </div>
      </div>
    `;

    // 屏蔽所有事件，防止页面干扰
    ['keydown','keyup','keypress','mousedown','mouseup','click','touchstart','touchend','input','paste','cut'].forEach(function(evt) {
      host.addEventListener(evt, function(e) { e.stopPropagation(); e.preventDefault(); }, true);
    });

    document.body.appendChild(host);

    var pwdInput = shadow.getElementById('pwd');
    var errEl = shadow.getElementById('err');
    if (!pwdInput) { console.error('pwd input not found in shadow DOM'); return; }

    // 自动聚焦
    function tryFocus() { try { pwdInput.focus(); } catch(e) {} }
    tryFocus();
    setTimeout(tryFocus, 100);
    setTimeout(tryFocus, 400);
    setTimeout(tryFocus, 800);

    // 持续保持焦点（双重保险）
    var focusGuard = setInterval(function() {
      try {
        if (!document.getElementById('__tulu_auth_host')) { clearInterval(focusGuard); return; }
        if (document.activeElement !== pwdInput && (!shadow.activeElement || shadow.activeElement !== pwdInput)) {
          tryFocus();
        }
      } catch(e) { clearInterval(focusGuard); }
    }, 150);

    // 备用强制聚焦：如果 shadow DOM focus 失效，改用直接 DOM 操作
    var backupFocus = setInterval(function() {
      try {
        if (!document.getElementById('__tulu_auth_host')) { clearInterval(backupFocus); return; }
        var shadowPwd = shadow.getElementById('pwd');
        if (shadowPwd && shadowPwd.value === '' && document.activeElement !== shadowPwd) {
          shadowPwd.focus();
        }
      } catch(e) { clearInterval(backupFocus); }
    }, 200);

    // 输入时清除错误状态
    pwdInput.addEventListener('input', function() {
      try { errEl.style.display = 'none'; } catch(e) {}
      try { pwdInput.classList.remove('err'); } catch(e) {}
    });

    pwdInput.addEventListener('keydown', function(e) {
      e.stopPropagation();
      e.preventDefault();
      if (e.key === 'Enter') {
        clearInterval(focusGuard);
        var val = '';
        try { val = pwdInput.value; } catch(e) {}
        if (val === '2552667173') {
          host.style.opacity = '0';
          host.style.transition = 'opacity 0.4s';
          setTimeout(function() { try { host.remove(); } catch(e) {} injectBar(); }, 400);
        } else {
          try {
            pwdInput.classList.add('err');
            pwdInput.value = '';
            errEl.style.display = 'block';
            setTimeout(function() { try { pwdInput.classList.remove('err'); } catch(e) {}; tryFocus(); }, 400);
          } catch(e) {}
        }
      }
    });
  }

  // ===== 悬浮提取按钮（小型化） =====
  function injectBar() {
    var bar = document.createElement('div');
    bar.id = '__tulu_float_bar';
    bar.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;display:flex;flex-direction:column;gap:10px;align-items:flex-end;pointer-events:none;';

    // 主按钮（48px，比之前60px小）
    var btnMain = document.createElement('button');
    btnMain.innerHTML = '▶';
    btnMain.title = '提取视频';
    btnMain.style.cssText = 'width:48px;height:48px;border-radius:50%;border:none;cursor:pointer;font-size:20px;color:#fff;background:linear-gradient(135deg,#ef4444,#dc2626);box-shadow:0 4px 16px rgba(239,68,68,0.35);display:flex;align-items:center;justify-content:center;transition:all 0.2s;font-family:system-ui;pointer-events:auto;position:relative;';

    // 小型化悬浮按钮点击
    btnMain.onclick = async function() {
      btnMain.disabled = true;
      btnMain.innerHTML = '⏳';
      tuluToast('正在深度扫描页面...');
      try {
        var domSources = scanPageDOM();
        var rustSources = [];
        try { rustSources = await window.__TAURI__.core.invoke('fetch_live_sources', { url: window.location.href }); } catch(e) {}
        var allSources = mergeSources(domSources, rustSources || []);
        if (allSources.length > 0) {
          tuluToast('找到 ' + allSources.length + ' 个视频源，正在打开播放器...', 10000);
          await window.__TAURI__.core.invoke('open_live_player', { sources: allSources });
        } else {
          tuluToast('未检测到视频源，请确认页面上有视频在播放', 10000);
        }
      } catch(err) {
        tuluToast('提取失败: ' + String(err), 8000);
      } finally {
        btnMain.disabled = false;
        btnMain.innerHTML = '▶';
      }
    };

    // 悬浮提示（10秒后自动消失）
    var hint = document.createElement('div');
    hint.style.cssText = 'position:relative;right:0;bottom:0;background:rgba(15,15,25,0.92);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.6);padding:8px 14px;border-radius:8px;font-size:11px;white-space:nowrap;font-family:Inter,Microsoft YaHei,sans-serif;pointer-events:none;opacity:1;transition:opacity 0.5s ease;';
    hint.textContent = '点击提取当前页面视频源';

    bar.appendChild(btnMain);
    bar.appendChild(hint);
    document.body.appendChild(bar);

    // 10秒后提示消失
    setTimeout(function() { try { hint.style.opacity = '0'; setTimeout(function() { try { hint.remove(); } catch(e) {} }, 500); } catch(e) {} }, 10000);

    // Toast（底部中间，10秒消失）
    var toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);z-index:2147483648;background:rgba(15,15,25,0.95);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:10px 20px;border-radius:10px;font-size:13px;display:none;max-width:400px;backdrop-filter:blur(16px);box-shadow:0 8px 24px rgba(0,0,0,0.4);word-break:break-all;font-family:Inter,Microsoft YaHei,sans-serif;pointer-events:none;text-align:center;';
    document.body.appendChild(toast);

    window.tuluToast = function(msg, dur) {
      dur = dur || 10000;
      toast.textContent = msg;
      toast.style.display = 'block';
      clearTimeout(window._tuluToastT);
      window._tuluToastT = setTimeout(function() { try { toast.style.display = 'none'; } catch(e) {} }, dur);
    };
  }

  // ===== DOM扫描 =====
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
})();
