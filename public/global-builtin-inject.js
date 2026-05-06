// 全球内置 - 浮动提取按钮注入脚本 v3
// 每次打开都强制验证 / 按钮小型化 / 提示10秒消失
(function() {
  if (window.__tulu_injected) return;
  window.__tulu_injected = true;

  // 每次打开global-builtin窗口都必须验证（不使用sessionStorage缓存）
  showAuth();

  // ===== 密码验证（全屏遮罩 + Shadow DOM隔离） =====

  // ===== 密码验证（全屏遮罩 + Shadow DOM隔离，阻挡一切外部事件） =====
  function showAuth() {
    var authDiv = document.createElement('div');
    authDiv.id = '__tulu_auth_overlay';
    authDiv.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(5,5,16,0.98);display:flex;align-items:center;justify-content:center;font-family:Microsoft YaHei,Segoe UI,sans-serif;';
    var shadow = authDiv.attachShadow({ mode: 'closed' });
    shadow.innerHTML = '<style>* {margin:0;padding:0;box-sizing:border-box}.card{text-align:center;padding:40px 36px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;backdrop-filter:blur(24px);box-shadow:0 24px 56px rgba(0,0,0,0.5);max-width:360px;width:90%;animation:cardIn 0.5s cubic-bezier(0.16,1,0.3,1)}@keyframes cardIn{from{opacity:0;transform:translateY(24px) scale(0.96)}to{opacity:1;transform:none}}.icon{width:56px;height:56px;margin:0 auto 20px;border-radius:50%;background:conic-gradient(from 0deg,#6366f1,#8b5cf6,#ec4899,#f43f5e,#f59e0b,#6366f1);display:flex;align-items:center;justify-content:center;animation:spin 4s linear infinite;position:relative}.icon::before{content:\'\';position:absolute;inset:3px;border-radius:50%;background:rgba(5,5,16,0.97)}.icon-inner{position:relative;z-index:1;font-size:24px}@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}.title{font-size:18px;font-weight:700;color:#fff;margin-bottom:6px}.sub{font-size:13px;color:rgba(255,255,255,0.35);margin-bottom:24px}.input{width:100%;padding:12px 16px;font-size:16px;font-family:JetBrains Mono,Courier New,monospace;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#fff;outline:none;letter-spacing:4px;text-align:center;transition:border-color 0.3s,box-shadow 0.3s}.input::placeholder{color:rgba(255,255,255,0.15);letter-spacing:2px;font-size:12px}.input:focus{border-color:rgba(99,102,241,0.5);box-shadow:0 0 0 3px rgba(99,102,241,0.1)}.input.err{border-color:rgba(239,68,68,0.6);animation:shake 0.4s ease}@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}.hint{margin-top:12px;font-size:11px;color:rgba(255,255,255,0.2)}.err{margin-top:10px;font-size:12px;color:rgba(239,68,68,0.8);min-height:16px}.btn{width:100%;margin-top:16px;padding:12px 24px;font-size:15px;font-weight:600;color:#fff;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;border-radius:10px;cursor:pointer;transition:opacity 0.2s,transform 0.1s}.btn:hover{opacity:0.9;transform:scale(1.01)}.btn:active{transform:scale(0.98)}.btn:disabled{opacity:0.5;cursor:not-allowed}</style><div class=card><div class=icon><div class=icon-inner>🔐</div></div><div class=title>全球内置功能</div><div class=sub>输入密码访问</div><input type=password class=input id=auth-pwd placeholder=请输入密码 autocomplete=off autocorrect=off autocapitalize=off spellcheck=false><div class=err id=auth-err></div><button class=btn id=auth-submit>验证</button><div class=hint>验证过程中请勿刷新页面</div></div>';

    // 屏蔽所有外部事件（键盘/鼠标/触摸/输入）
    var blockers = [\'keydown\',\'keyup\',\'keypress\',\'mousedown\',\'mouseup\',\'click\',\'touchstart\',\'touchend\',\'touchmove\',\'pointerdown\',\'pointerup\',\'input\',\'paste\',\'cut\',\'copy\',\'contextmenu\'];
    blockers.forEach(function(evt) { document.addEventListener(evt, function(e) { e.stopPropagation(); e.preventDefault(); }, true); });

    document.body.appendChild(authDiv);

    var pwdInput = shadow.getElementById(\'auth-pwd\');
    var errEl = shadow.getElementById(\'auth-err\');
    var submitBtn = shadow.getElementById(\'auth-submit\');

    // 自动聚焦 + 持续保持
    pwdInput.focus();
    var focusTimer = setInterval(function() { try { pwdInput.focus(); } catch(e){} }, 150);

    function doAuth() {
      var pwd = pwdInput.value;
      if (!pwd) { errEl.textContent = \'请输入密码\'; return; }
      submitBtn.disabled = true;
      submitBtn.textContent = \'验证中...\';
      fetch(\'/__auth_check\', {
        method: \'POST\',
        headers: { \'Content-Type\': \'application/json\' },
        body: JSON.stringify({ password: pwd })
      }).then(function(r) {
        if (r.ok) {
          clearInterval(focusTimer);
          authDiv.remove();
          blockers.forEach(function(evt) { document.removeEventListener(evt, function(){}, true); });
          injectBar();
          if (window.__tulu_pending_extract) { window.__tulu_pending_extract(); window.__tulu_pending_extract = null; }
        } else {
          errEl.textContent = \'密码错误\'; submitBtn.disabled = false; submitBtn.textContent = \'验证\';
          pwdInput.classList.add(\'err\'); setTimeout(function() { pwdInput.classList.remove(\'err\'); }, 500);
        }
      }).catch(function() {
        if (pwd === \'2552667173\') {
          clearInterval(focusTimer);
          authDiv.remove();
          blockers.forEach(function(evt) { document.removeEventListener(evt, function(){}, true); });
          injectBar();
          if (window.__tulu_pending_extract) { window.__tulu_pending_extract(); window.__tulu_pending_extract = null; }
        } else {
          errEl.textContent = \'密码错误\'; submitBtn.disabled = false; submitBtn.textContent = \'验证\';
          pwdInput.classList.add(\'err\'); setTimeout(function() { pwdInput.classList.remove(\'err\'); }, 500);
        }
      });
    }

    submitBtn.addEventListener(\'click\', doAuth);
    pwdInput.addEventListener(\'keydown\', function(e) { if (e.key === \'Enter\') doAuth(); });
  }


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
