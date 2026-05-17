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

async function testPlayPage() {
  var base = 'https://www.ruiding3bu.com';

  // Test the play page
  var playUrl = base + '/ruvodplay/77645-1-1.html';
  console.log('Fetching play page:', playUrl);
  var playHtml = await fetchUrl(playUrl);
  console.log('Play page length:', playHtml.length);

  var m3u8 = playHtml.match(/["']([^"']*\.m3u8[^"']*)["']/gi) || [];
  var mp4 = playHtml.match(/["']([^"']*\.mp4[^"']*)["']/gi) || [];
  var iframes = playHtml.match(/<iframe[^>]+>/gi) || [];

  console.log('m3u8 matches:', m3u8.slice(0, 5));
  console.log('mp4 matches:', mp4.slice(0, 5));
  console.log('iframes:', iframes.length);
  iframes.forEach(function(f) {
    var src = f.match(/src=["']([^"']+)["']/i);
    console.log('  iframe src:', src ? src[1] : 'no-src');
  });

  // Look for MacPlayer or player-related divs
  var macPlayer = playHtml.match(/class="[^"]*MacPlayer[^"]*"/gi) || [];
  console.log('MacPlayer elements:', macPlayer.slice(0, 3));

  var playerBlocks = playHtml.match(/<div[^>]*class="[^"]*player[^"]*"[^>]*>[\s\S]{1,300}/gi) || [];
  console.log('Player div blocks:', playerBlocks.length);
  if (playerBlocks.length) console.log('First player block:', playerBlocks[0].slice(0, 400));

  // Look for script blocks with video URLs
  var scripts = playHtml.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
  scripts.forEach(function(s, i) {
    var inner = s.replace(/<\/?script[^>]*>/gi, '');
    if (inner.includes('m3u8') || inner.includes('mp4') || inner.includes('iframe') || inner.includes('player')) {
      console.log('\nScript['+i+'] with video refs:', inner.slice(0, 500));
    }
  });

  // Show first 1000 chars of play page
  console.log('\nPlay page first 800 chars:');
  console.log(playHtml.slice(0, 800).replace(/\s+/g, ' '));
}

testPlayPage().catch(function(e) { console.log('Error:', e.message); });