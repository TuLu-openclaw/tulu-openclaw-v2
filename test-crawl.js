const http = require('http');
const https = require('https');

function fetchUrl(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': url
      }
    }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function analyze(url) {
  try {
    console.log('Fetching:', url);
    const html = await fetchUrl(url);
    console.log('HTML length:', html.length);
    console.log('Status: OK');

    // Look for iframes
    const iframes = html.match(/<iframe[^>]+>/gi) || [];
    console.log('\nIframes found:', iframes.length);
    iframes.forEach((f, i) => {
      const src = f.match(/src=["']([^"']+)["']/i);
      console.log('  iframe['+i+']:', src ? src[1] : 'no-src');
    });

    // Look for script blocks with player/playerurl/video
    const scripts = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
    console.log('\nScripts:', scripts.length);
    scripts.forEach((s, i) => {
      if (s.toLowerCase().includes('player') || s.toLowerCase().includes('video') || s.toLowerCase().includes('m3u8')) {
        console.log('  Script['+i+'] has player/video:', s.slice(0, 400));
      }
    });

    // Look for m3u8/mp4 patterns
    const m3u8 = html.match(/["']([^"']*\.m3u8[^"']*)["']/gi) || [];
    const mp4 = html.match(/["']([^"']*\.mp4[^"']*)["']/gi) || [];
    console.log('\nm3u8 matches:', m3u8.slice(0, 5));
    console.log('mp4 matches:', mp4.slice(0, 5));

    // Look for API calls
    const apis = html.match(/["']([^"']*api[^"']*)["']/gi) || [];
    console.log('\nAPI URLs:', apis.slice(0, 5));

    // Look for vod_id / detail patterns
    const vodId = html.match(/vod_id[=:]["']([^"']+)["']/i);
    const detailId = html.match(/detail[/_]?id[=:]["']([^"']+)["']/i);
    console.log('\nvod_id found:', vodId ? vodId[1] : 'none');
    console.log('detail_id found:', detailId ? detailId[1] : 'none');

    // Show some of the HTML body
    console.log('\nHTML snippet (first 1000):');
    console.log(html.slice(0, 1000));
  } catch(e) {
    console.log('Error:', e.message);
  }
}

analyze('https://www.ruiding3bu.com/ruvoddetail/77645.html');