const http = require('http');
const https = require('https');

function fetchUrl(url, timeout) {
  return new Promise(function(resolve, reject) {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9'
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

async function analyze() {
  var url = 'https://www.ruiding3bu.com/ruvoddetail/77645.html';
  try {
    console.log('Fetching:', url);
    var html = await fetchUrl(url);
    console.log('HTML length:', html.length);

    var iframes = html.match(/<iframe[^>]+>/gi) || [];
    console.log('Iframes:', iframes.length);
    iframes.forEach(function(f, i) {
      var src = f.match(/src=["']([^"']+)["']/i);
      console.log('  iframe['+i+']:', src ? src[1] : 'no-src');
    });

    var m3u8 = html.match(/["']([^"']*\.m3u8[^"']*)["']/gi) || [];
    console.log('m3u8:', m3u8.slice(0, 5));

    var scripts = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
    console.log('Scripts total:', scripts.length);
    scripts.forEach(function(s, i) {
      if (s.toLowerCase().includes('player') || s.toLowerCase().includes('m3u8')) {
        console.log('  Script['+i+']:', s.slice(0, 500));
      }
    });

    console.log('\nFirst 800 chars of HTML:');
    console.log(html.slice(0, 800));
  } catch(e) {
    console.log('Error:', e.message);
  }
}

analyze();
