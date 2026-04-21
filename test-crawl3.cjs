const http = require('http');
const https = require('https');

function fetchUrl(url, timeout) {
  return new Promise(function(resolve, reject) {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
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

async function testMacCMS() {
  var baseUrl = 'https://www.ruiding3bu.com';
  var vodId = '77645';

  // Try various MacCMS/VodCMS API patterns
  var apis = [
    '/api.php/v1.video?id=' + vodId,
    '/api.php/video/detail?id=' + vodId,
    '/api/vod?id=' + vodId,
    '/?m=video-info&id=' + vodId,
    '/?m= vod-detail&id=' + vodId,
    '/?m=play&pid=' + vodId,
    '/ajaxdata.php?ac=detail&ids=' + vodId,
    '/index.php/vod/play/id/' + vodId + '.html'
  ];

  for (var i = 0; i < apis.length; i++) {
    var api = apis[i];
    try {
      var resp = await fetchUrl(baseUrl + api);
      console.log('API [' + api.slice(0, 50) + '] => ' + resp.slice(0, 200));
      if (resp.includes('m3u8') || resp.includes('mp4') || resp.includes('url')) {
        console.log('*** FOUND VIDEO in this API! ***');
      }
    } catch(e) {
      console.log('API [' + api.slice(0, 50) + '] => Error: ' + e.message);
    }
  }

  // Try the play page
  console.log('\n--- Trying play page ---');
  try {
    var playHtml = await fetchUrl(baseUrl + '/ruvodplay/' + vodId + '.html');
    console.log('Play page length:', playHtml.length);
    var m3u8 = playHtml.match(/["']([^"']*\.m3u8[^"']*)["']/gi) || [];
    var macUrl = playHtml.match(/mac_url\s*[=:]\s*["']([^"']+)["']/i) || [];
    console.log('m3u8 in play:', m3u8.slice(0, 3));
    console.log('mac_url:', macUrl.slice(0, 3));
    // Find player div
    var playerDiv = playHtml.match(/<div[^>]+class="[^"]*player[^"]*"[^>]*>[\s\S]{1,500}/gi) || [];
    console.log('Player divs in play page:', playerDiv.length);
    if (playerDiv.length) console.log('First player div:', playerDiv[0].slice(0, 300));
  } catch(e) {
    console.log('Play page error:', e.message);
  }
}

testMacCMS();