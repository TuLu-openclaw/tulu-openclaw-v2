const fs = require('fs');
let c = fs.readFileSync('C:/Users/User/.openclaw/.openclaw/workspace/tulu-v2/src/pages/movie-tool.js', 'utf8');

const original = `    if (isM3u8 || isMp4) loadVideoPlayer(epUrl, isM3u8, progress, [])
    else // URL 格式校验
        var safeEpUrl = epUrl && /^https?:\/\//i.test(epUrl) ? epUrl : '';
        body.innerHTML = '<div class="tvbox-iframe-wrap"><iframe src="' + safeEpUrl + '" allowfullscreen allow="autoplay; fullscreen" style="width:100%;height:100%;border:none"></iframe></div>'
  }`;

const fixed = `    if (isM3u8 || isMp4) {
      loadVideoPlayer(epUrl, isM3u8, progress, [])
    } else {
        var safeEpUrl = epUrl && /^https?:\/\//i.test(epUrl) ? epUrl : '';
        body.innerHTML = '<div class="tvbox-iframe-wrap"><iframe src="' + safeEpUrl + '" allowfullscreen allow="autoplay; fullscreen" style="width:100%;height:100%;border:none"></iframe></div>'
    }
  }`;

if (!c.includes(original)) {
  console.log('Fix1: PATTERN NOT FOUND');
  // Try to find the actual content
  const idx = c.indexOf('if (isM3u8 || isMp4) loadVideoPlayer(epUrl, isM3u8, progress, [])');
  console.log('Found at:', idx);
  if (idx !== -1) console.log(JSON.stringify(c.substring(idx, idx + 300)));
} else {
  c = c.replace(original, fixed);
  console.log('Fix1: APPLIED');
  fs.writeFileSync('C:/Users/User/.openclaw/.openclaw/workspace/tulu-v2/src/pages/movie-tool.js', c, 'utf8');
}
