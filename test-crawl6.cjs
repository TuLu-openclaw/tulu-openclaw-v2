const http = require('http');
const https = require('https');

function fetchUrl(url, timeout) {
  return new Promise(function(resolve, reject) {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': 'https://www.ruiding3bu.com/ruvoddetail/77645.html',
        'X-Requested-With': 'XMLHttpRequest'
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

async function tryAjaxEndpoints() {
  var base = 'https://www.ruiding3bu.com';
  var id = '77645';

  var endpoints = [
    '/?m=vod-detail-id-' + id,
    '/?m=vod-detail-id-' + id + '-p-1.html',
    '/?m=play-id-' + id + '-p-1.html',
    '/?m=ajax-vod-detail-id-' + id,
    '/ajaxdata.php?ac=detail&ids=' + id,
    '/inc/api.html',
    '/api.php',
    '/api.php?ac=detail&ids=' + id,
    '/api.php?m=detail&ids=' + id,
    '/api.php?m=detail&id=' + id,
    '/api.php/vod/detail?ids=' + id,
    '/api.php/vod/detail?id=' + id,
    '/api.php/player?id=' + id,
    '/api.php/vod?ids=' + id,
    '/inc/player.php?id=' + id,
    '/player.php?vid=' + id,
    '/player?vid=' + id,
    '/player/vid/' + id
  ];

  for (var i = 0; i < endpoints.length; i++) {
    var ep = endpoints[i];
    try {
      var resp = await fetchUrl(base + ep);
      var short = resp.slice(0, 100).replace(/\s+/g, ' ');
      console.log('[' + (i+1) + '/' + endpoints.length + '] ' + ep.slice(0,50) + ' => ' + short);
    } catch(e) {
      console.log('[' + (i+1) + '] ' + ep.slice(0,50) + ' => ERROR: ' + e.message);
    }
  }
}

tryAjaxEndpoints();