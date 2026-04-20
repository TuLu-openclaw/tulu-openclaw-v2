const fs = require('fs');
const content = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>屠戮影视 - 测试</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto;background:#0f0f23;color:#fff;min-height:100vh}
.header{background:linear-gradient(135deg,#667eea,#764ba2);padding:20px;text-align:center}
.container{max-width:800px;margin:0 auto;padding:20px}
.test-btn{background:linear-gradient(135deg,#667eea,#764ba2);border:none;color:#fff;padding:15px 30px;font-size:16px;border-radius:8px;cursor:pointer;margin:10px}
.result{background:#1a1a2e;border-radius:12px;padding:20px;margin:15px 0}
.status-icon{width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center}
.status-success{background:#10b981}
.status-error{background:#ef4444}
.video-card{background:#252540;border-radius:8px;padding:12px;margin:8px 0;display:flex;gap:12px;cursor:pointer}
.video-thumb{width:80px;height:110px;background:#333;border-radius:6px;display:flex;align-items:center;justify-content:center}
.video-info{flex:1}
.video-info h4{margin-bottom:5px;font-size:14px}
.video-info p{font-size:11px;color:#888}
.ep-btn{background:#252540;border:1px solid #333;color:#ccc;padding:6px 4px;border-radius:4px;font-size:11px;cursor:pointer}
.ep-btn:hover{background:#e50914;color:#fff}
.log{background:#1a1a2e;border-radius:8px;padding:12px;font-size:12px;max-height:200px;overflow-y:auto}
.log-item{margin:3px 0}
.log-time{color:#555}
.log-ok{color:#10b981}
.log-err{color:#ef4444}
</style>
</head>
<body>
<div class="header"><h1>🎬 屠戮影视</h1></div>
<div class="container">
<div style="text-align:center">
<button class="test-btn" id="btnSearch">搜索</button>
<button class="test-btn" id="btnList" style="background:linear-gradient(135deg,#10b981,#059669)">列表</button>
<button class="test-btn" id="btnLive" style="background:linear-gradient(135deg,#f59e0b,#d97706)">直播</button>
</div>
<div id="results"></div>
<div class="log" id="log"></div>
</div>
<script>
var logEl=document.getElementById('log');
var resultsEl=document.getElementById('results');
function lg(msg,type){logEl.innerHTML+='<div class="log-item">'+msg+'</div>';logEl.scrollTop=logEl.scrollHeight;}
function eh(s){return s==null?'':String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');}
async function fet(url){
try{var inv=await import('@tauri-apps/api/core');if(inv.invoke)return await inv.invoke('vod_fetch',{url:url});}catch{}
throw new Error('获取失败');
}
function rst(t,s,c){return '<div class="result"><h3>'+t+'</h3>'+c+'</div>';}
function vs(vs){return vs.map(function(v){return '<div class="video-card" onclick="sel('+v.vod_id+',\''+eh(v.vod_name)+'\')"><div class="video-thumb">▶</div><div class="video-info"><h4>'+eh(v.vod_name)+'</h4></div></div>'}).join('');}
window.sel=async function(id,name){
resultsEl.innerHTML+=rst('加载中','<p>'+name+'</p>');
try{var txt=await fet('https://bfzyapi.com/api.php/provide/vod?ac=detail&ids='+id);var j=JSON.parse(txt);var v=j.list?.[0];
var html='<p>'+eh(v.vod_name)+'</p>';var pf=v.vod_play_from,pu=v.vod_play_url;
var fl=pf.split('$$$'),ug=pu.split('$$$');
for(var i=0;i<fl.length;i++){var us=(ug[i]||'').split('#');
html+='<div>'+(fl[i]||'默认')+' '+us.length+'集</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:5px">';
for(var k=0;k<Math.min(us.length,20);k++){var u=us[k].split('$');
html+='<button class="ep-btn" onclick="ply(\''+eh(u[1])+'\')">'+eh(u[0]||'E'+(k+1))+'</button>';}
html+='</div>';}
resultsEl.innerHTML+=rst('播放',html);
}catch(e){lg('错误:'+e.message);resultsEl.innerHTML+=rst('错误','<p>'+e.message+'</p>');}
};
window.ply=function(url){lg('播放:'+url.slice(0,40));var m3u=url.indexOf('.m3u8')>-1;
var html='<video id="pv" controls style="width:100%;max-height:400px"></video>';
if(!m3u)html='<iframe src="'+eh(url)+'" style="width:100%;height:400px;border:none"></iframe>';
resultsEl.innerHTML+=rst('播放器',html);
if(m3u&&window.Hls){setTimeout(function(){var h=new Hls();h.loadSource(url);h.attachMedia(document.getElementById('pv'));},500);}
};
document.getElementById('btnSearch').onclick=async function(){
resultsEl.innerHTML='';lg('搜索中');
try{var txt=await fet('https://bfzyapi.com/api.php/provide/vod?ac=detail&wd=流浪地球2');var j=JSON.parse(txt);
if(j.list&&j.list.length){lg('结果:'+j.list.length);resultsEl.innerHTML=rst('搜索结果','<p>'+j.list.length+'条</p>'+vs(j.list));}
else{lg('无结果');resultsEl.innerHTML=rst('搜索结果','<p>未找到</p>');}
}catch(e){lg('错误:'+e.message);}
};
document.getElementById('btnList').onclick=async function(){
resultsEl.innerHTML='';lg('加载中');
try{var txt=await fet('https://bfzyapi.com/api.php/provide/vod?ac=list&t=20&pg=1');var j=JSON.parse(txt);
lg('加载:'+j.list.length);resultsEl.innerHTML=rst('列表','<p>共'+(j.total||j.list.length)+'条</p>'+vs(j.list));
}catch(e){lg('错误:'+e.message);}
};
document.getElementById('btnLive').onclick=async function(){
resultsEl.innerHTML='';lg('加载中');
try{var txt=await fet('https://live.fanmingming.com/live.txt');
var ls=txt.split('\n').filter(function(l){return l.trim()&&!l.startsWith('#');});
var ch=[],cat=null;
for(var i=0;i<ls.length;i++){var l=ls[i];if(l.indexOf('#genre#')>-1)cat=l.replace('#genre#','').trim();else if(l.indexOf(',')>-1&&cat){var p=l.indexOf(',');ch.push({c:cat,n:l.slice(0,p).trim(),u:l.slice(p+1).trim()});}}
lg('频道:'+ch.length);var cs={};ch.forEach(function(x){if(!cs[x.c])cs[x.c]=[];cs[x.c].push(x);});
var ks=Object.keys(cs).slice(0,6);var html=ks.map(function(k){return '<button onclick="document.getElementById(\\'c-\'+this.textContent).style.display=\'block\';Array.from(document.querySelectorAll(\'[id^=c-]')).forEach(d=>d.style.display=d.id==\'c-\'+this.textContent?\'block\':\'none\')">'+k+'</button>'}).join('');
ks.forEach(function(k){html+='<div id="c-'+k+'">'+cs[k].map(function(x){return '<button class="ep-btn" onclick="ply(\''+x.u+'\')">'+x.n+'</button>'}).join('')+'</div>';});
resultsEl.innerHTML=rst('直播','<p>'+ch.length+'频道</p>'+html);
}catch(e){lg('错误:'+e.message);}
};
</script>
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
</body>
</html>`;
fs.writeFileSync('index.html', content, 'utf8');
console.log('Done');