// 全球内置 - 浮动提取按钮注入脚本
// 通过 Tauri eval 注入到主窗口页面 DOM 中
// 按钮在页面 DOM 里 → 可以直接读取 window.location.href（当前真实 URL）
(function() {
  if (window.__tulu_injected) return;
  window.__tulu_injected = true;

  // Password check
  if (!window.__tulu_verified) {
    var overlay = document.createElement('div');
    overlay.id = '__tulu_auth';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(5,5,16,0.95);display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = '<div style="text-align:center;padding:48px 40px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:24px;backdrop-filter:blur(24px);box-shadow:0 32px 64px rgba(0,0,0,0.5);max-width:400px;width:90%">' +
      '<div style="width:72px;height:72px;margin:0 auto 24px;border-radius:50%;background:conic-gradient(from 0deg,#6366f1,#8b5cf6,#ec4899,#f43f5e,#f59e0b,#6366f1);display:flex;align-items:center;justify-content:center;animation:tulu-ring-spin 4s linear infinite"><div style="width:66px;height:66px;border-radius:50%;background:rgba(5,5,16,0.95);display:flex;align-items:center;justify-content:center;font-size:28px">🔐</div></div>' +
      '<div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:6px">安全验证</div>' +
      '<div style="font-size:13px;color:rgba(255,255,255,0.35);margin-bottom:28px">请输入访问密码以继续</div>' +
      '<input type="password" id="__tulu_pwd" placeholder="输入密码" autofocus style="width:100%;padding:14px 16px;font-size:16px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;color:#fff;outline:none;letter-spacing:5px;text-align:center">' +
      '<div style="margin-top:14px;font-size:11px;color:rgba(255,255,255,0.2)">按 Enter 确认</div>' +
      '</div>';
    var style = document.createElement('style');
    style.textContent = '@keyframes tulu-ring-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
    document.head.appendChild(style);
    document.body.appendChild(overlay);
    var pwdInput = document.getElementById('__tulu_pwd');
    pwdInput.focus();
    pwdInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        if (pwdInput.value === '2552667173') {
          window.__tulu_verified = true;
          overlay.style.opacity = '0';
          overlay.style.transition = 'opacity 0.5s';
          setTimeout(function() { overlay.remove(); injectBar(); }, 500);
        } else {
          pwdInput.style.borderColor = 'rgba(239,68,68,0.6)';
          pwdInput.value = '';
          pwdInput.style.animation = 'none';
          pwdInput.offsetHeight;
          pwdInput.style.animation = 'tulu-shake 0.4s ease';
        }
      }
    });
    var shakeStyle = document.createElement('style');
    shakeStyle.textContent = '@keyframes tulu-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}';
    document.head.appendChild(shakeStyle);
    return; // Don't inject bar yet
  }

  injectBar();

  function injectBar() {
    // Floating bar
    var bar = document.createElement('div');
    bar.id = '__tulu_float_bar';
    bar.style.cssText = 'position:fixed;bottom:32px;right:32px;z-index:2147483647;display:flex;flex-direction:column;gap:12px;align-items:flex-end;';

    // Extract button
    var btnExtract = document.createElement('button');
    btnExtract.innerHTML = '▶';
    btnExtract.title = '提取视频链接并播放';
    btnExtract.style.cssText = 'width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;font-size:24px;color:#fff;background:linear-gradient(135deg,#ef4444,#dc2626);box-shadow:0 4px 20px rgba(239,68,68,0.3);display:flex;align-items:center;justify-content:center;transition:all 0.2s;font-family:system-ui;';
    btnExtract.onmouseenter = function(){this.style.transform='translateY(-3px) scale(1.05)';this.style.boxShadow='0 8px 28px rgba(239,68,68,0.6)';};
    btnExtract.onmouseleave = function(){this.style.transform='';this.style.boxShadow='0 4px 20px rgba(239,68,68,0.3)';};

    btnExtract.onclick = async function() {
      btnExtract.disabled = true;
      btnExtract.innerHTML = '⏳';
      try {
        // Read current URL from the page DOM (not from Rust!)
        var pageUrl = window.location.href;
        var sources = await window.__TAURI__.core.invoke('fetch_live_sources', { url: pageUrl });
        if (sources && sources.length > 0) {
          tuluToast('找到 ' + sources.length + ' 个视频源，正在打开播放器...');
          await window.__TAURI__.core.invoke('open_live_player', { sources: sources });
        } else {
          tuluToast('未检测到视频源，请先点击页面上的播放按钮', 6000);
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
    toastEl.id = '__tulu_toast';
    toastEl.style.cssText = 'position:fixed;bottom:110px;right:32px;z-index:2147483648;background:rgba(15,15,25,0.95);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:12px 20px;border-radius:12px;font-size:13px;display:none;max-width:320px;backdrop-filter:blur(16px);box-shadow:0 8px 24px rgba(0,0,0,0.4);word-break:break-all;font-family:Inter,Microsoft YaHei,sans-serif;';

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
})();
