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
  // Fetch the full page and look for the actual player data
  var html = await fetchUrl('https://www.ruiding3bu.com/ruvoddetail/77645.html');

  // Look for all hidden inputs, JSON script blocks
  var hiddenInputs = html.match(/<input[^>]+>/gi) || [];
  console.log('Hidden inputs:');
  hiddenInputs.forEach(function(h) {
    if (h.includes('type="hidden"') || h.includes("type='hidden'")) {
      console.log(' ', h);
    }
  });

  // Look for all script[type="application/json"] or similar
  var jsonBlocks = html.match(/<script[^>]+type="[^"]*json[^"]*"[^>]*>[\s\S]*?<\/script>/gi) || [];
  console.log('\nJSON blocks:', jsonBlocks.length);
  jsonBlocks.forEach(function(b, i) {
    console.log('['+i+']:', b.slice(0, 300));
  });

  // Search for "vod_play" or "playlist" in scripts
  var scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
  scripts.forEach(function(s, i) {
    var inner = s.replace(/<\/?script[^>]*>/gi, '');
    if (inner.includes('77645') || inner.includes('vod_play') || inner.includes('playlist')) {
      console.log('\nScript['+i+'] with vod_id/77645:');
      console.log(inner.slice(0, 800));
    }
  });

  // Look for any URL that is relative with "play" in it
  var relativePlay = html.match(/href=["'][^"']*(?:play|vod)[^"']*["']/gi) || [];
  console.log('\nRelative play URLs:', relativePlay.slice(0, 10));

  // Check the class="stui-player" or similar
  var playerClass = html.match(/class="[^"]*player[^"]*"/gi) || [];
  console.log('\nPlayer classes:', playerClass.slice(0, 5));

  // Check for the existence of the player by searching for any element with stui-player
  var stuiPlayer = html.match(/stui-player[\s\S]{0,200}/gi) || [];
  console.log('\nstui-player blocks:', stuiPlayer.length);
  if (stuiPlayer.length) console.log(stuiPlayer[0]);

  // Full HTML search for key phrases
  var phrases = ['MacPlayer', 'player', 'vod_id', 'vod_url', 'vod_play_from', 'play_url'];
  phrases.forEach(function(p) {
    var regex = new RegExp(p, 'gi');
    var matches = html.match(regex);
    if (matches) console.log('\n"' + p + '" appears ' + matches.length + ' times');
    // Show surrounding context
    var idx = html.indexOf(p);
    while (idx >= 0) {
      console.log('  context: ' + html.slice(Math.max(0, idx-20), idx+80).replace(/\s+/g, ' '));
      idx = html.indexOf(p, idx + 1);
      if (idx > 0 && html.indexOf(p, idx + 1) === idx) break;
    }
  });
}

main().catch(function(e) { console.log('Error:', e.message); });