const http = require('http');
const https = require('https');

function fetchUrl(url, timeout) {
  return new Promise(function(resolve, reject) {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
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

async function testStaticJS() {
  // The page loads stui_default.js and stui_block.js - let's fetch those
  var jsFiles = [
    'https://www.ruiding3bu.com/template/mb13/statics/js/stui_default.js',
    'https://www.ruiding3bu.com/template/mb13/statics/js/stui_block.js'
  ];

  for (var i = 0; i < jsFiles.length; i++) {
    try {
      var js = await fetchUrl(jsFiles[i]);
      console.log('JS[' + i + '] (' + jsFiles[i] + ') length:', js.length);
      // Look for API endpoints or ajax calls
      var apiCalls = js.match(/(?:ajax|url|api|fetch|getJSON)\s*[\(:\"\']*([^\)\"\'\s]{10,})/gi) || [];
      if (apiCalls.length) console.log('API patterns:', apiCalls.slice(0, 5));
      // Look for vod/play/detail keywords
      var vodRefs = js.match(/\b(?:vod|play|detail|video|player)[^\"\'\s]{0,30}/gi) || [];
      if (vodRefs.length) console.log('Vod refs:', vodRefs.slice(0, 5));
      // Look for any URL with path
      var urls = js.match(/["']([/][^"'\s]{5,})["']/g) || [];
      if (urls.length) console.log('Relative URLs in JS:', urls.slice(0, 10));
      console.log('---');
    } catch(e) {
      console.log('JS[' + i + '] error:', e.message);
    }
  }
}

testStaticJS();