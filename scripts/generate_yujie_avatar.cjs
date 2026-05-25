const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const cfg = JSON.parse(fs.readFileSync('C:/Users/User/.openclaw/agents/main/agent/models.json','utf8'));
const p = cfg.providers['诗和远方'];
const model = 'qwen-image-max';
const out = 'public/digital-human/openclaw-avatar-yujie-green.png';
const prompt = `Original premium semi-realistic 2.5D Chinese female AI digital human assistant for OpenClaw desktop app. Mature elegant yujie style, confident intelligent aura, beautiful natural face, refined actress-like facial harmony but NOT any real celebrity, clear bright eyes, subtle round glasses, long dark wavy hair, tasteful attractive and professional, not vulgar, not revealing. Fitted black executive blazer with elegant waistline, white silk blouse, subtle tech necklace glowing blue, slim natural proportions, graceful confident posture, hands relaxed and expressive, high-end AI product mascot, realistic fabric folds, polished skin lighting. Full upper body to mid-thigh, front-facing slight three-quarter angle, centered. IMPORTANT: solid pure chroma key green background #00ff00, flat green only, no gradient, no shadow, no room, no text, no logo, no watermark.`;
function download(url, file) { return new Promise((resolve,reject)=>{ const u=new URL(url); const lib=u.protocol==='http:'?http:https; lib.get(u,res=>{ if(res.statusCode>=300&&res.statusCode<400&&res.headers.location) return download(res.headers.location,file).then(resolve,reject); if(res.statusCode!==200) return reject(new Error('download '+res.statusCode)); const ws=fs.createWriteStream(file); res.pipe(ws); ws.on('finish',()=>ws.close(resolve)); ws.on('error',reject); }).on('error',reject); }); }
function postImage(prompt) {
  const payload = JSON.stringify({ model, prompt, size:'1024x1536', n:1, quality:'high' });
  const url = new URL(p.baseUrl.replace(/\/$/,'') + '/images/generations');
  return new Promise((resolve,reject)=>{
    const req=https.request({method:'POST',hostname:url.hostname,path:url.pathname,headers:{Authorization:`Bearer ${p.apiKey}`,'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)},timeout:240000},res=>{
      let chunks=[]; res.on('data',d=>chunks.push(d)); res.on('end',async()=>{
        try {
          const txt=Buffer.concat(chunks).toString('utf8');
          console.log('STATUS',res.statusCode);
          if(res.statusCode<200||res.statusCode>=300) throw new Error(txt.slice(0,1000));
          const j=JSON.parse(txt); const item=j.data?.[0]||j.output?.[0]||j.result?.[0];
          const b64=item?.b64_json||item?.base64||item?.image_base64||j.b64_json||j.base64;
          if(b64) fs.writeFileSync(out, Buffer.from(String(b64).replace(/^data:image\/\w+;base64,/,''),'base64'));
          else if(item?.url||j.url) await download(item?.url||j.url, out);
          else throw new Error('no image '+JSON.stringify(j).slice(0,500));
          console.log('WROTE', path.resolve(out), fs.statSync(out).size); resolve();
        } catch(e) { reject(e); }
      });
    });
    req.on('timeout',()=>{req.destroy();reject(new Error('timeout'))}); req.on('error',reject); req.write(payload); req.end();
  });
}
postImage(prompt).catch(e=>{console.error(e.message);process.exit(1)});
