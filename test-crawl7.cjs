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

async function main() {
  var url = 'https://www.ruiding3bu.com/ruvoddetail/77645.html';
  var html = await fetchUrl(url);

  // Look for MAC CMS vod data (mac_url, mac_player, etc)
  var macPatterns = [
    /mac_url\s*[=:]\s*["']([^"']+)["']/gi,
    /mac_player\s*[=:]\s*["']([^"']+)["']/gi,
    /player_url\s*[=:]\s*["']([^"']+)["']/gi,
    /vod_url\s*[=:]\s*["']([^"']+)["']/gi,
    /vod_id\s*[=:]\s*["']?([^"'\s,}]+)["']?/gi,
    /mac\_[^=]*\s*[=:]\s*[{"]/gi,
    /"vod_id"\s*:\s*"([^"]+)"/gi,
    /"player"\s*:\s*"([^"]+)"/gi,
    /data-\w+\s*[=:]\s*["']([^"']{10,})["']/gi
  ];

  macPatterns.forEach(function(pat) {
    var m = html.match(pat);
    if (m && m.length) console.log('Pattern ' + pat.toString().slice(0,40) + ' found:', m.slice(0,3));
  });

  // Search all script blocks for JSON-like structures with IDs
  var scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
  scripts.forEach(function(s, i) {
    var inner = s.replace(/<\/?script[^>]*>/gi, '');
    if (inner.length > 20 && (inner.includes('77645') || inner.includes('vod') || inner.includes('player'))) {
      console.log('\nScript['+i+'] with vod/77645:', inner.slice(0, 500));
    }
  });

  // Check for any JSON-LD or structured data
  var jsonld = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi) || [];
  if (jsonld.length) console.log('\nJSON-LD:', jsonld[0].slice(0, 300));

  // Look for data-reactid or similar
  var reactData = html.match(/data-(?:reactid|props|current|state)[=][\"\'][^\"\']+/gi) || [];
  if (reactData.length) console.log('\nReact data:', reactData.slice(0, 3));

  // Try to find what happens when the page loads - search for fetch/xhr in inline scripts
  scripts.forEach(function(s, i) {
    var inner = s.replace(/<\/?script[^>]*>/gi, '');
    if (inner.includes('fetch') || inner.includes('XMLHttpRequest') || inner.includes('$.get') || inner.includes('$.ajax')) {
      console.log('\nScript['+i+'] with XHR/fetch:', inner.slice(0, 400));
    }
  });
}

main().catch(function(e) { console.log('Error:', e.message); });