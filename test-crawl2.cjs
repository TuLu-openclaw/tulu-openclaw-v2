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
        'Referer': url
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
    var html = await fetchUrl(url);

    // Look for player-related divs
    var playerDivs = html.match(/<div[^>]*class="[^"]*player[^"]*"[^>]*>/gi) || [];
    console.log('Player divs:', playerDivs.length);
    playerDivs.forEach(function(d) { console.log(' ', d.slice(0, 200)); });

    // Look for MacPlayer class
    var macPlayer = html.match(/class="[^"]*MacPlayer[^"]*"/gi) || [];
    console.log('MacPlayer elements:', macPlayer.length);

    // Look for data-src, data-url attributes
    var dataSrc = html.match(/data-(?:src|url|video)[=:"'][^"']+/gi) || [];
    console.log('data-src/url:', dataSrc.slice(0, 5));

    // Look for input type="hidden" with value containing m3u8 or video URL
    var inputs = html.match(/<input[^>]+>/gi) || [];
    inputs.forEach(function(inp) {
      if (inp.includes('m3u8') || inp.includes('mp4') || inp.includes('url') || inp.includes('player')) {
        console.log('Input with video:', inp.slice(0, 200));
      }
    });

    // Look for a link to a detail AJAX API
    // Common patterns: /api.php, /vod.php, /play/, /detail/
    var apiLinks = html.match(/(?:href|src)=["'][^"']*(?:api|vod|play|detail)[^"']*["']/gi) || [];
    console.log('\nAPI links:', apiLinks.slice(0, 5));

    // Find the stui-player__video or similar
    var videoTags = html.match(/<video[^>]*>/gi) || [];
    console.log('\nVideo tags:', videoTags.length);

    // Check for any URL with play_id or id=
    var playLinks = html.match(/["']([^"']*(?:play|detail|vod)[^"']*\?[^"']*id[^"']*)["']/gi) || [];
    console.log('\nPlay/Detail URLs:', playLinks.slice(0, 5));

    // Search for any script that has meaningful content (not just 1-line)
    var scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
    scripts.forEach(function(s, i) {
      var inner = s.replace(/<script[^>]*>/gi, '').replace(/<\/script>/gi, '');
      if (inner.length > 50 && (inner.includes('m3u8') || inner.includes('mp4') || inner.includes('url') || inner.includes('player'))) {
        console.log('\nScript['+i+'] (video related):', inner.slice(0, 600));
      }
    });

    // Look for any non-empty src/href values
    var allLinks = html.match(/(?:src|href)=["']([^"']{10,})["']/gi) || [];
    console.log('\nAll links (10+ chars):', allLinks.slice(0, 10));

  } catch(e) {
    console.log('Error:', e.message);
  }
}

analyze();