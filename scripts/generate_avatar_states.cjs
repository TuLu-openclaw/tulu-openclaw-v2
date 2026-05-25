const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const cfg = JSON.parse(fs.readFileSync('C:/Users/User/.openclaw/agents/main/agent/models.json','utf8'));
const p = cfg.providers['诗和远方'];
const model = 'qwen-image-max';
const outDir = path.resolve('public/digital-human/states');
fs.mkdirSync(outDir, { recursive: true });

const base = `Original premium semi-realistic 2.5D Chinese female AI assistant for OpenClaw desktop app. Natural pure elegant actress-like beauty, NOT any real celebrity, soft oval face, clear bright eyes, gentle fresh expression, delicate natural makeup, long dark brown wavy hair, subtle round glasses, black tailored blazer, white silk blouse, black pencil skirt, slim natural proportions, realistic fabric folds, clean hands, small glowing blue tech necklace. Full upper body to mid-thigh, front-facing slight three-quarter angle. IMPORTANT: solid pure chroma key green background #00ff00, flat green only, no gradient, no shadow, no room, no text, no logo, no watermark.`;
const states = [
  ['waiting', `${base} Pose: relaxed neutral standing posture, hands naturally in front, calm and ready, very gentle eye contact.`],
  ['thinking', `${base} Pose: thoughtful expression, one hand lightly touching chin or cheek, focused eyes, slightly tilted head, intelligent and curious.`],
  ['tool', `${base} Pose: active working gesture, one hand raised as if operating holographic interface, confident focused look, dynamic professional body posture.`],
  ['streaming', `${base} Pose: speaking to user, friendly open mouth subtle talking expression, one hand gently gesturing forward, warm communication.`],
  ['done', `${base} Pose: successful completion, soft bright smile, relaxed shoulders, one hand open in reassuring gesture, cheerful but professional.`],
  ['error', `${base} Pose: concerned but calm troubleshooting expression, slight lowered eyebrows, one hand near chest, apologetic and careful.`]
];

function postImage(prompt) {
  const payload = JSON.stringify({ model, prompt, size: '1024x1536', n: 1, quality: 'high' });
  const url = new URL(p.baseUrl.replace(/\/$/,'') + '/images/generations');
  return new Promise((resolve, reject) => {
    const req = https.request({ method:'POST', hostname:url.hostname, port:url.port || 443, path:url.pathname, headers:{ Authorization:`Bearer ${p.apiKey}`, 'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(payload) }, timeout:240000 }, res=>{
      let chunks=[]; res.on('data', d=>chunks.push(d)); res.on('end',()=>{
        const txt = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`HTTP ${res.statusCode}: ${txt.slice(0,500)}`));
        let j; try { j=JSON.parse(txt); } catch(e) { return reject(new Error('Bad JSON '+txt.slice(0,300))); }
        const item = j.data?.[0] || j.output?.[0] || j.result?.[0];
        const b64 = item?.b64_json || item?.base64 || item?.image_base64 || j.b64_json || j.base64;
        if (b64) return resolve({ b64 });
        const imgUrl = item?.url || j.url;
        if (imgUrl) return resolve({ url: imgUrl });
        reject(new Error('No image in response '+JSON.stringify(j).slice(0,500)));
      });
    });
    req.on('timeout',()=>{ req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.write(payload); req.end();
  });
}

function download(url, file) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? http : https;
    lib.get(u, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return download(res.headers.location, file).then(resolve, reject);
      if (res.statusCode !== 200) return reject(new Error('download HTTP '+res.statusCode));
      const ws = fs.createWriteStream(file);
      res.pipe(ws); ws.on('finish',()=>ws.close(resolve)); ws.on('error', reject);
    }).on('error', reject);
  });
}

(async () => {
  for (const [name, prompt] of states) {
    const file = path.join(outDir, `openclaw-avatar-${name}-green.png`);
    console.log('GENERATE', name);
    const r = await postImage(prompt);
    if (r.b64) fs.writeFileSync(file, Buffer.from(String(r.b64).replace(/^data:image\/\w+;base64,/,''),'base64'));
    else await download(r.url, file);
    console.log('WROTE', file, fs.statSync(file).size);
  }
})();
