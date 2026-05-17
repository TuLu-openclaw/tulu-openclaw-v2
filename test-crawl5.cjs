const http = require('http');
const https = require('https');

function fetchUrl(url, timeout) {
  return new Promise(function(resolve, reject) {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Referer': 'https://www.ruiding3bu.com/'
      }
    }, function(res) {
      const chunks = [];
      res.on('data', function(d) { chunks.push(d); });
      res.on('end', function() { resolve(Buffer.concat(chunks).toString('utf8')); });
    });
    req.on('error', reject);
    req.setTimeout(timeout || 10000, function() { req.destroy(); reject(new Error('timeout')); });
  });
}

async function searchForVodUrl() {
  var js = await fetchUrl('https://www.ruiding3bu.com/template/mb13/statics/js/stui_block.js');
  // Find the context around vod_url
  var idx = js.indexOf('vod_url');
  if (idx >= 0) {
    console.log('vod_url context (200 chars):');
    console.log(js.slice(Math.max(0, idx - 100), idx + 200));
  }

  // Also search for vod_play, ajaxdata, or similar
  var patterns = ['vod_play', 'ajaxdata', 'player', 'detail'];
  patterns.forEach(function(p) {
    var i = js.indexOf(p);
    if (i >= 0) {
      console.log('\n' + p + ' context (200 chars):');
      console.log(js.slice(Math.max(0, i - 50), i + 150));
    }
  });
}

searchForVodUrl();