import './tvbox.css';
import '../style/movie-tool.css';

const TVBOX_SOURCES_KEY = 'tvbox_sources_v2';
const TVBOX_FAVS_KEY = 'tvbox_favs_v1';
const TVBOX_HIST_KEY = 'tvbox_hist_v1';
const TVBOX_ACTIVE_KEY = 'tvbox_active_src';

const CATEGORIES = [
  { type_id: '1',  type_name: '电影' },
  { type_id: '2',  type_name: '电视剧' },
  { type_id: '3',  type_name: '综艺' },
  { type_id: '4',  type_name: '动漫' },
  { type_id: '39', type_name: '短剧' },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function getDefaultSources() {
  return [
    { key: 'lziapi',   name: '量子资源', api: 'https://cj.lziapi.com/api.php/provide/vod',          type: 'tvbox' },
    { key: 'bfzyapi',  name: '暴风资源', api: 'https://bfzyapi.com/api.php/provide/vod',            type: 'tvbox' },
    { key: 'tyyszy',   name: '天涯资源', api: 'https://tyyszy.com/api.php/provide/vod',             type: 'tvbox' },
    { key: 'ffm3u8',   name: 'FFm3u8',  api: 'https://cj.ffzyapi.com/api.php/provide/vod',         type: 'tvbox' },
    { key: '1080zyku', name: '1080资源', api: 'https://api.1080zyku.com/inc/api_mac10.php',         type: '1080'  },
  ];
}

function loadSources() {
  try { const raw = localStorage.getItem(TVBOX_SOURCES_KEY); if (raw) return JSON.parse(raw); } catch(_) {}
  return getDefaultSources();
}
function saveSources(sources) { localStorage.setItem(TVBOX_SOURCES_KEY, JSON.stringify(sources)); }
function loadFavs() {
  try { const raw = localStorage.getItem(TVBOX_FAVS_KEY); if (raw) return JSON.parse(raw); } catch(_) {}
  return [];
}
function saveFavs(favs) { localStorage.setItem(TVBOX_FAVS_KEY, JSON.stringify(favs)); }
function loadHist() {
  try { const raw = localStorage.getItem(TVBOX_HIST_KEY); if (raw) return JSON.parse(raw); } catch(_) {}
  return [];
}
function saveHist(hist) { localStorage.setItem(TVBOX_HIST_KEY, JSON.stringify(hist)); }
function getActiveSourceKey() { return localStorage.getItem(TVBOX_ACTIVE_KEY) || 'lziapi'; }
function setActiveSourceKey(key) { localStorage.setItem(TVBOX_ACTIVE_KEY, key); }

let state = {};
function S(key, def) { if (!(key in state)) state[key] = def; return state[key]; }

async function tvReq(url, params, method) {
  method = method || 'GET';
  const fullUrl = new URL(url);
  if (method === 'GET') Object.keys(params||{}).forEach(function(k){ fullUrl.searchParams.set(k,params[k]); });
  try {
    const resp = await fetch(fullUrl.toString(), {
      method: method,
      headers: { 'User-Agent': UA, 'Referer': new URL(url).origin + '/' },
      body: method === 'POST' ? new URLSearchParams(params||{}).toString() : undefined,
    });
    return { ok: resp.ok, status: resp.status, text: await resp.text() };
  } catch (e) { return { ok: false, status: -1, text: e.message }; }
}

function getSource() {
  const sources = S('sources', loadSources());
  const key = S('activeSource', getActiveSourceKey());
  return sources.find(function(s){ return s.key === key; }) || sources[0];
}

function isFaved(vodId) { return loadFavs().some(function(f){ return String(f.vod_id) === String(vodId); }); }

function toggleFav(vod) {
  const favs = loadFavs();
  const id = String(vod.vod_id);
  const idx = favs.findIndex(function(f){ return String(f.vod_id) === id; });
  if (idx >= 0) favs.splice(idx, 1);
  else favs.unshift({ vod_id: vod.vod_id, vod_name: vod.vod_name, vod_pic: vod.vod_pic, vod_year: vod.vod_year, added_at: Date.now() });
  saveFavs(favs);
  return idx < 0;
}

function addToHist(vod, episodeName) {
  const hist = loadHist();
  const id = String(vod.vod_id);
  const idx = hist.findIndex(function(h){ return String(h.vod_id) === id; });
  if (idx >= 0) hist.splice(idx, 1);
  hist.unshift({ vod_id: vod.vod_id, vod_name: vod.vod_name, vod_pic: vod.vod_pic, episode_name: episodeName, watched_at: Date.now() });
  if (hist.length > 100) hist.splice(100);
  saveHist(hist);
}

function clearHist() { saveHist([]); }

async function loadHome() {
  S('loading', true); S('errorMsg', ''); S('homeList', {}); render();
  const src = getSource();
  if (src.type === '1080') { S('loading', false); render(); return; }
  const results = {};
  CATEGORIES.forEach(function(c){ results[c.type_id] = []; });
  await Promise.all(CATEGORIES.map(function(cat){
    return tvReq(src.api, { ac: 'list', t: cat.type_id, pg: 1, limit: 8 }).then(function(r){
      if (r.ok) { try { var d=JSON.parse(r.text); if(d.code===1&&d.list) results[cat.type_id]=d.list.slice(0,8); } catch(_){} }
    });
  }));
  S('homeList', results); S('loading', false); render();
}

async function loadCategory(page) {
  page = page || 1;
  S('loading', true); S('errorMsg', ''); S('categoryList', []); render();
  const src = getSource();
  try {
    const cat = S('currentCategory', CATEGORIES[0]);
    const res = await tvReq(src.api, { ac: 'list', t: cat.type_id, pg: page, limit: 24 });
    if (!res.ok) throw new Error('网络错误: ' + res.status);
    const data = JSON.parse(res.text);
    S('categoryList', data.list||[]); S('currentPage', page);
    if (data.total) S('totalPages', Math.ceil(data.total/24));
  } catch(e) { S('errorMsg', e.message); }
  S('loading', false); render();
}

async function doSearch() {
  const q = S('searchQuery', '').trim();
  if (!q) return;
  const sources = S('sources', loadSources());
  S('loading', true); S('searchProgress', { done:0, total:sources.length, query:q }); S('searchResults', []); S('errorMsg', ''); render();
  const all = [];
  await Promise.all(sources.map(function(src){
    return tvReq(src.api, { ac: 'detail', wd: q }).then(function(r){
      S('searchProgress', { done: S('searchProgress',{}).done+1, total:sources.length, query:q }); render();
      if (r.ok) { try { var d=JSON.parse(r.text); if(d.code===1&&d.list) d.list.forEach(function(v){ v._src=src.name; all.push(v); }); } catch(_){} }
    });
  }));
  S('searchResults', all); S('searchProgress', null); S('loading', false);
  if (!all.length) S('errorMsg', '未找到相关影片');
  render();
}

function openDetail(vod) {
  const v = Object.assign({}, vod);
  v._playSources = [];
  if (vod.vod_play_url) {
    String(vod.vod_play_url).split('$$$').forEach(function(part){
      var ci = part.indexOf('$');
      var from = ci !== -1 ? part.slice(0,ci) : '播放';
      var urls = ci !== -1 ? part.slice(ci+1) : part;
      var episodes = [];
      urls.split('#').forEach(function(u){
        var di = u.indexOf('$');
        if (di !== -1 && u.slice(di+1)) episodes.push({ name: u.slice(0,di)||'未知', url: u.slice(di+1) });
      });
      if (episodes.length) v._playSources.push({ from: from, episodes: episodes });
    });
  }
  S('detailVod', v); render();
}

async function playEpisode(episode, vod) {
  const title = episode.name + (vod ? ' - ' + vod.vod_name : '');
  S('playingTitle', title); S('playingUrl', (episode.url||'').trim()); S('playerError', ''); S('showPlayer', true);
  if (vod) addToHist(vod, episode.name); render();
  const rawUrl = S('playingUrl', '');
  let finalUrl = rawUrl;
  if (window.TVBox && window.TVBox.parseUrl) { try { finalUrl = await window.TVBox.parseUrl(rawUrl); } catch(e){ finalUrl = rawUrl; } }
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){
      var video = document.getElementById('tvbox-video');
      if (!video) return;
      if (state.hls) { state.hls.destroy(); state.hls = null; }
      var url = finalUrl || rawUrl;
      if (url.indexOf('.m3u8') !== -1 && url.indexOf('http') === 0) {
        if (window.Hls && Hls.isSupported()) {
          var hls = new Hls({}); state.hls = hls;
          hls.loadSource(url); hls.attachMedia(video);
          hls.on(Hls.Events.ERROR, function(e, data){
            if (data.fatal) { S('playerError', 'HLS播放失败: '+(data.details||'未知错误')); if(state.hls){state.hls.destroy();state.hls=null;} render(); }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) { video.src = url; }
        else { S('playerError', '当前环境不支持HLS播放'); render(); }
      } else { video.src = url; }
    });
  });
}

function closePlayer() {
  S('showPlayer', false);
  if (state.hls) { state.hls.destroy(); state.hls = null; }
  var video = document.getElementById('tvbox-video');
  if (video) { video.pause(); video.src = ''; }
  S('playingUrl', ''); render();
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function getVodById(id) {
  var lists = [S('homeList',{}), S('categoryList',[]), S('searchResults',[]), loadFavs(), loadHist()];
  for (var li=0; li<lists.length; li++) {
    var lst = lists[li];
    if (!lst || !lst.length) continue;
    for (var vi=0; vi<lst.length; vi++) {
      if (String(lst[vi].vod_id) === String(id)) return lst[vi];
    }
  }
  return null;
}

// === Render functions ===
function renderSkeleton(count) {
  var html = '<div class="tvbox-grid">';
  for (var i=0;i<count;i++) html += '<div><div class="tvbox-skeleton" style="aspect-ratio:2/3;border-radius:14px;"></div><div class="tvbox-skeleton tvbox-skeleton-name"></div></div>';
  html += '</div>'; return html;
}

function renderVodCard(vod) {
  var faved = isFaved(vod.vod_id);
  var catTag = vod._cat ? '<span class="tvbox-tag">'+esc(vod._cat)+'</span>' : '';
  var srcTag = vod._src ? '<span class="tvbox-tag-src">'+esc(vod._src)+'</span>' : '';
  var scoreTag = vod.vod_score ? '<span class="tvbox-score">'+esc(vod.vod_score)+'</span>' : '';
  var tag = catTag || srcTag;
  var img = '<div class="tvbox-cover"><img src="'+esc(vod.vod_pic)+'" alt="'+esc(vod.vod_name)+'" loading="lazy" onerror="window.__tvbox.imgErr(this)"/>'+tag+scoreTag+'<div class="tvbox-card-overlay"><div class="tvbox-play-btn">&#9658;</div></div></div>';
  var name = '<div class="tvbox-name">'+esc(vod.vod_name)+'</div>';
  var favBtn = '<button class="tvbox-fav-btn'+(faved?' faved':'')+'" onclick="event.stopPropagation();window.__tvbox.fav(\''+esc(String(vod.vod_id))+'\');">'+(faved?'♥':'♡')+'</button>';
  return '<div class="tvbox-card" onclick="window.__tvbox.detail(\''+esc(String(vod.vod_id))+'\');">'+favBtn+img+name+'</div>';
}

function renderHome() {
  if (S('loading',false)) return '<div class="tvbox-section">'+renderSkeleton(12)+'</div>';
  if (S('errorMsg','')) return '<div class="tvbox-error"><div class="tvbox-error-icon">&#9888;</div><div class="tvbox-error-text">'+esc(S('errorMsg',''))+'</div></div>';
  var homeList = S('homeList',{});
  var html = '';
  CATEGORIES.forEach(function(cat){
    var items = homeList[cat.type_id]||[];
    if (!items.length) return;
    html += '<div class="tvbox-section"><div class="tvbox-section-header"><div class="tvbox-section-title">'+esc(cat.type_name)+'</div></div><div class="tvbox-grid">'+items.map(function(v){return renderVodCard(v);}).join('')+'</div></div>';
  });
  if (!html) html = '<div class="tvbox-empty"><div class="tvbox-empty-icon">&#128269;</div><div class="tvbox-empty-text">当前源暂无数据，切换其他源试试</div></div>';
  return html;
}

function renderCategory() {
  if (S('loading',false)) return '<div class="tvbox-section">'+renderSkeleton(12)+'</div>';
  if (S('errorMsg','')) return '<div class="tvbox-error"><div class="tvbox-error-icon">&#9888;</div><div class="tvbox-error-text">'+esc(S('errorMsg',''))+'</div></div>';
  var list = S('categoryList',[]);
  if (!list.length) return '<div class="tvbox-empty"><div class="tvbox-empty-icon">&#128269;</div><div class="tvbox-empty-text">暂无内容</div></div>';
  var html = '<div class="tvbox-grid">'+list.map(function(v){return renderVodCard(v);}).join('')+'</div>';
  if (S('totalPages',1) > 1) {
    html += '<div class="tvbox-page"><button'+(S('currentPage',1)<=1?' disabled':'')+' onclick="window.__tvbox.goPage('+(S('currentPage',1)-1)+');">上一页</button><span class="tvbox-page-info">'+S('currentPage',1)+' / '+S('totalPages',1)+'</span><button'+(S('currentPage',1)>=S('totalPages',1)?' disabled':'')+' onclick="window.__tvbox.goPage('+(S('currentPage',1)+1)+');">下一页</button></div>';
  }
  return html;
}

function renderSearch() {
  var prog = S('searchProgress',null);
  if (prog) {
    var pct = Math.round(prog.done/prog.total*100);
    return '<div class="tvbox-search-progress"><div class="tvbox-spinner"></div> 正在 '+esc(prog.query)+' ... '+pct+'% ('+prog.done+'/'+prog.total+')</div><div class="tvbox-grid">'+S('searchResults',[]).map(function(v){return renderVodCard(v);}).join('')+'</div>';
  }
  if (S('loading',false)) return '<div class="tvbox-loading"><div class="tvbox-spinner"></div><div class="tvbox-loading-text">搜索中...</div></div>';
  if (S('errorMsg','')) return '<div class="tvbox-error"><div class="tvbox-error-icon">&#9888;</div><div class="tvbox-error-text">'+esc(S('errorMsg',''))+'</div></div>';
  var list = S('searchResults',[]);
  if (!list.length) return '<div class="tvbox-empty"><div class="tvbox-empty-icon">&#128269;</div><div class="tvbox-empty-text">未找到相关影片</div></div>';
  return '<div class="tvbox-grid">'+list.map(function(v){return renderVodCard(v);}).join('')+'</div>';
}

function renderLibrary() {
  var libTab = S('libraryTab','favs');
  var favs = loadFavs();
  var hist = loadHist();
  var content = '';
  if (libTab === 'favs') {
    content = !favs.length
      ? '<div class="tvbox-empty"><div class="tvbox-empty-icon">&#9829;</div><div class="tvbox-empty-text">暂无收藏内容</div></div>'
      : '<div class="tvbox-grid">'+favs.map(function(v){return renderVodCard(v);}).join('')+'</div>';
  } else {
    if (!hist.length) content = '<div class="tvbox-empty"><div class="tvbox-empty-icon">&#9201;</div><div class="tvbox-empty-text">暂无观看记录</div></div>';
    else {
      content = hist.map(function(h){
        return '<div class="tvbox-history-item" onclick="window.__tvbox.histPlay(\''+esc(String(h.vod_id))+'\');">'+
          '<img class="tvbox-history-thumb" src="'+esc(h.vod_pic)+'" onerror="this.style.display=\'none\'"/>'+
          '<div class="tvbox-history-info"><div class="tvbox-history-name">'+esc(h.vod_name)+'</div><div class="tvbox-history-meta">'+(h.episode_name||'')+'</div></div>'+
          '<button class="tvbox-history-del" onclick="event.stopPropagation();window.__tvbox.histDel(\''+esc(String(h.vod_id))+'\');">&#10005;</button></div>';
      }).join('');
    }
  }
  var clearBtn = (libTab==='hist'&&hist.length) ? '<button style="margin-left:auto;padding:8px 16px;background:var(--bg-card);border:1px solid var(--border-light);border-radius:8px;color:var(--text-muted);font-size:12px;cursor:pointer;font-family:inherit;" onclick="event.stopPropagation();window.__tvbox.histClear();">清空</button>' : '';
  return '<div class="tvbox-library-tabs">'+
    '<button class="tvbox-library-tab '+(libTab==='favs'?'active':'')+'" onclick="window.__tvbox.libTab(\'favs\');">&#9829; 收藏</button>'+
    '<button class="tvbox-library-tab '+(libTab==='hist'?'active':'')+'" onclick="window.__tvbox.libTab(\'hist\');">&#9201; 历史</button>'+
    clearBtn+'</div>'+content;
}

function renderSourceManager() {
  var sources = S('sources', loadSources());
  var items = sources.map(function(src){
    return '<div class="tvbox-source-item">'+
      '<div><div class="tvbox-source-item-name">'+esc(src.name)+'</div><div class="tvbox-source-item-api">'+esc(src.api)+'</div></div>'+
      '<div class="tvbox-source-item-actions">'+
        '<button class="tvbox-source-edit-btn" onclick="window.__tvbox.editSrc(\''+esc(src.key)+'\');">编辑</button>'+
        '<button class="tvbox-source-del-btn" onclick="window.__tvbox.delSrc(\''+esc(src.key)+'\');">删除</button>'+
      '</div></div>';
  }).join('');
  return '<div class="tvbox-source-manager">'+items+'<button class="tvbox-add-source-btn" onclick="window.__tvbox.addSrc();">+ 添加新源</button></div>'+renderSourceEditModal(null);
}

function renderSourceEditModal(srcToEdit) {
  var ed = srcToEdit || {};
  var isNew = !ed.key;
  return '<div class="tvbox-edit-modal" id="tvbox-edit-modal" onclick="if(event.target===this)window.__tvbox.closeEdit();">'+
    '<div class="tvbox-edit-box" onclick="event.stopPropagation()">'+
      '<h4>'+(isNew?'添加新源':'编辑源')+'</h4>'+
      '<div class="tvbox-edit-field"><label>源名称</label><input id="tvbox-edit-name" type="text" placeholder="例如：量子资源" value="'+esc(ed.name||'')+'"/></div>'+
      '<div class="tvbox-edit-field"><label>API 地址</label><input id="tvbox-edit-api" type="text" placeholder="https://..." value="'+esc(ed.api||'')+'"/></div>'+
      '<div class="tvbox-edit-field"><label>源类型</label><select id="tvbox-edit-type">'+
        '<option value="tvbox" '+(ed.type==='tvbox'?'selected':'')+'>TVBox 标准</option>'+
        '<option value="1080" '+(ed.type==='1080'?'selected':'')+'>1080 API</option>'+
      '</select></div>'+
      '<div class="tvbox-edit-actions">'+
        '<button class="tvbox-edit-save" onclick="window.__tvbox.saveSrc('+(isNew?'null':'\''+esc(ed.key)+'\'')+');">保存</button>'+
        '<button class="tvbox-edit-cancel" onclick="window.__tvbox.closeEdit();">取消</button>'+
      '</div>'+
    '</div></div>';
}

function renderEpisodes() {
  var v = S('detailVod',null);
  if (!v||!v._playSources||!v._playSources.length) return '<div class="tvbox-no-play">暂无播放数据</div>';
  var html = '';
  v._playSources.forEach(function(src,si){
    html += '<div class="tvbox-play-source"><div class="tvbox-source-name">'+esc(src.from)+'</div><div class="tvbox-episodes">';
    src.episodes.forEach(function(ep,ei){ html += '<button class="tvbox-ep-btn" onclick="window.__tvbox.play('+si+','+ei+');">'+esc(ep.name)+'</button>'; });
    html += '</div></div>';
  });
  return html;
}

function renderDetail() {
  var v = S('detailVod',null);
  if (!v) return '';
  var faved = isFaved(v.vod_id);
  var scoreHtml = v.vod_score ? '<span class="tvbox-meta-item tvbox-score-badge">'+esc(v.vod_score)+'</span>' : '';
  var actorHtml = v.vod_actor&&v.vod_actor!=='未知演员' ? '<span class="tvbox-meta-item">'+esc(v.vod_actor)+'</span>' : '';
  var directorHtml = v.vod_director&&v.vod_director!=='未知导演' ? '<span class="tvbox-meta-item">导演: '+esc(v.vod_director)+'</span>' : '';
  var areaHtml = v.vod_area ? '<span class="tvbox-meta-item">'+esc(v.vod_area)+'</span>' : '';
  var yearHtml = v.vod_year ? '<span class="tvbox-meta-item">'+esc(v.vod_year)+'</span>' : '';
  var favIcon = faved ? '♥' : '♡';
  var favClass = faved ? 'faved' : '';
  var desc = v.vod_content ? v.vod_content.replace(/<[^>]+>/g,'') : '暂无简介';
  return '<div class="tvbox-modal" onclick="if(event.target===this)window.__tvbox.closeDetail();">'+
    '<div class="tvbox-detail" onclick="event.stopPropagation()">'+
    '<button class="tvbox-close" onclick="window.__tvbox.closeDetail();">&#10005;</button>'+
    '<img class="tvbox-detail-pic" src="'+esc(v.vod_pic)+'" onerror="this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 80 120%22><rect fill=%22%2312121f%22 width=%2280%22 height=%22120%22/></svg>\'"/>'+
    '<div class="tvbox-detail-body">'+
    '<div class="tvbox-detail-info"><h3>'+esc(v.vod_name)+'</h3>'+
    '<div class="tvbox-meta">'+actorHtml+directorHtml+areaHtml+yearHtml+scoreHtml+'</div>'+
    '<button class="tvbox-fav-detail-btn '+favClass+'" onclick="window.__tvbox.favDetail();">'+favIcon+' '+(faved?'已收藏':'收藏')+'</button>'+
    '</div><div class="tvbox-divider"></div>'+
    '<div class="tvbox-detail-desc">'+esc(desc)+'</div>'+
    renderEpisodes()+'</div></div></div>';
}

function renderPlayer() {
  if (!S('showPlayer',false)) return '';
  var err = S('playerError','');
  var errHtml = err ? '<div class="tvbox-player-error"><div class="tvbox-player-error-icon">&#9888;</div><p>'+esc(err)+'</p><button onclick="window.__tvbox.openBrowser();">在浏览器打开</button></div>' : '';
  return '<div class="tvbox-player-overlay">'+
    '<div class="tvbox-player-box">'+
    '<div class="tvbox-player-header">'+
    '<div class="tvbox-player-title">'+esc(S('playingTitle',''))+'</div>'+
    '<div class="tvbox-player-actions">'+
      '<button class="tvbox-player-btn" onclick="window.__tvbox.openBrowser();">&#128279; 外链</button>'+
      '<button class="tvbox-close-player" onclick="window.__tvbox.closePlayer();">&#10005;</button>'+
    '</div></div>'+
    errHtml+
    '<div class="tvbox-video-wrap" style="display:'+(err?'none':'block')+'"><video id="tvbox-video" controls autoplay style="width:100%;background:#000;display:block;"></video></div>'+
    '</div></div>';
}

function renderSourceBar() {
  var sources = S('sources',loadSources());
  var key = S('activeSource',getActiveSourceKey());
  var html = '<span class="tvbox-source-label">线路</span>';
  sources.forEach(function(src){ html += '<button class="tvbox-source-btn '+(src.key===key?'active':'')+'" onclick="window.__tvbox.switchSrc(\''+esc(src.key)+'\');">'+esc(src.name)+'</button>'; });
  return html;
}

function renderNav() {
  var tab = S('currentTab','home');
  var tabs = [
    { key: 'home',    label: '首页',    icon: '&#8962;' },
    { key: 'category', label: '分类',    icon: '&#9776;' },
    { key: 'search',  label: '搜索',    icon: '&#128269;' },
    { key: 'library', label: '收藏',    icon: '&#9829;' },
    { key: 'sources', label: '源管理',  icon: '&#9881;' },
  ];
  var html = '';
  tabs.forEach(function(t){ html += '<button class="tvbox-nav-btn'+(tab===t.key?' active':'')+'" onclick="window.__tvbox.tab(\''+t.key+'\');">'+t.icon+' '+t.label+'</button>'; });
  return html;
}

function render() {
  var el = document.getElementById('tvbox-app');
  if (!el) return;
  var tab = S('currentTab','home');
  var catExtra = '';
  if (tab==='category') {
    var cat = S('currentCategory',CATEGORIES[0]);
    var catsHtml = CATEGORIES.map(function(c){ return '<button class="'+(c.type_id===cat.type_id?'active':'')+'" onclick="window.__tvbox.setCat(\''+c.type_id+'\');">'+esc(c.type_name)+'</button>'; }).join('');
    catExtra = '<div class="tvbox-controls"><div class="tvbox-cat-tabs">'+catsHtml+'</div></div>';
  } else if (tab==='search') {
    catExtra = '<div class="tvbox-controls"><div class="tvbox-search-wrap">'+
      '<input type="text" placeholder="输入影片名称搜索，多源并行..." value="'+esc(S('searchQuery',''))+'" onkeyup="if(event.key===\'Enter\')window.__tvbox.search();" oninput="window.__tvbox.setQuery(this.value);"/>'+
      '<button class="tvbox-search-btn" onclick="window.__tvbox.search();">搜索</button>'+
    '</div></div>';
  }
  var tabContent = '';
  if (tab==='home') tabContent = renderHome();
  else if (tab==='category') tabContent = renderCategory();
  else if (tab==='search') tabContent = renderSearch();
  else if (tab==='library') tabContent = renderLibrary();
  else if (tab==='sources') tabContent = renderSourceManager();
  el.innerHTML =
    '<div class="tvbox-header"><div class="tvbox-header-inner">'+
    '<div class="tvbox-logo"><div class="tvbox-logo-icon">&#127916;</div>屠戮影视</div>'+
    '<div class="tvbox-nav">'+renderNav()+'</div>'+
    '</div></div>'+
    '<div class="tvbox-source-bar"><div class="tvbox-source-inner">'+renderSourceBar()+'</div></div>'+
    '<div class="tvbox-content">'+catExtra+tabContent+'</div>'+
    renderDetail()+renderPlayer();
}

window.__tvbox = {
  init: function() {
    if (!window.Hls) { var s=document.createElement('script'); s.src='./hls.min.js'; document.head.appendChild(s); }
    state = {};
    S('sources', loadSources()); S('activeSource', getActiveSourceKey()); render(); loadHome();
  },
  tab: function(t) {
    S('currentTab', t);
    if (t==='home') loadHome();
    else if (t==='category') loadCategory(1);
    else if (t==='search') render();
    else if (t==='library') render();
    else if (t==='sources') render();
  },
  switchSrc: function(key) {
    S('activeSource', key); setActiveSourceKey(key); render();
    var tab = S('currentTab','home');
    if (tab==='home') loadHome();
    else if (tab==='category') loadCategory(1);
  },
  setCat: function(id) {
    CATEGORIES.forEach(function(c){ if(c.type_id===id) S('currentCategory',c); });
    render(); loadCategory(1);
  },
  goPage: function(p){ loadCategory(p); },
  search: function(){ doSearch(); },
  setQuery: function(q){ S('searchQuery',q); },
  libTab: function(t){ S('libraryTab',t); render(); },
  histClear: function(){ clearHist(); render(); },
  histDel: function(id){
    var hist = loadHist(); var idx = hist.findIndex(function(h){return String(h.vod_id)===id;});
    if(idx>=0){hist.splice(idx,1);saveHist(hist);}
    render();
  },
  histPlay: function(id){
    var hist = loadHist(); var item = hist.find(function(h){return String(h.vod_id)===id;});
    if (!item) return;
    var src = getSource();
    tvReq(src.api,{ac:'detail',wd:item.vod_name}).then(function(r){
      if(r.ok){try{var d=JSON.parse(r.text);if(d.code===1&&d.list&&d.list.length)openDetail(d.list[0]);}catch(_){}}
    });
  },
  detail: function(id){
    var v = getVodById(id);
    if (v) openDetail(v);
    else {
      var src = getSource();
      tvReq(src.api,{ac:'detail',wd:id}).then(function(r){
        if(r.ok){try{var d=JSON.parse(r.text);if(d.code===1&&d.list&&d.list.length)openDetail(d.list[0]);}catch(_){}}
      });
    }
  },
  imgErr: function(img){ img.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 80 120%22><rect fill=%22%2312121f%22 width=%2280%22 height=%22120%22/></svg>'; },
  fav: function(id){
    var v = getVodById(id);
    if (v) { toggleFav(v); render(); }
  },
  favDetail: function(){
    var v = S('detailVod',null);
    if (v) { toggleFav(v); render(); }
  },
  closeDetail: function(){ S('detailVod',null); render(); },
  play: function(si, ei) {
    var v = S('detailVod',null);
    if (!v||!v._playSources||!v._playSources[si]) return;
    var ep = v._playSources[si].episodes[ei];
    if (ep) playEpisode(ep, v);
  },
  openBrowser: function(){ var url=S('playingUrl',''); if(url) window.open(url,'_blank'); },
  closePlayer: closePlayer,
  addSrc: function(){
    S('editingSrc', null); render();
    requestAnimationFrame(function(){
      var m = document.getElementById('tvbox-edit-modal');
      if (m) m.style.display='flex';
    });
  },
  editSrc: function(key){
    var sources = S('sources',loadSources());
    var src = sources.find(function(s){return s.key===key;});
    if (src) { S('editingSrc', src); render(); }
    requestAnimationFrame(function(){
      var m = document.getElementById('tvbox-edit-modal');
      if (m) m.style.display='flex';
    });
  },
  delSrc: function(key){
    var sources = S('sources',loadSources());
    var idx = sources.findIndex(function(s){return s.key===key;});
    if (idx>=0) { sources.splice(idx,1); saveSources(sources); S('sources',sources); render(); }
  },
  saveSrc: function(oldKey) {
    var name = document.getElementById('tvbox-edit-name').value.trim();
    var api = document.getElementById('tvbox-edit-api').value.trim();
    var type = document.getElementById('tvbox-edit-type').value;
    if (!name||!api) { alert('请填写名称和API地址'); return; }
    var sources = S('sources',loadSources());
    if (oldKey) {
      var idx = sources.findIndex(function(s){return s.key===oldKey;});
      if (idx>=0) { sources[idx].name=name; sources[idx].api=api; sources[idx].type=type; }
    } else {
      var key = 'custom_' + Date.now();
      sources.push({ key:key, name:name, api:api, type:type });
    }
    saveSources(sources); S('sources',sources);
    window.__tvbox.closeEdit();
  },
  closeEdit: function() {
    var m = document.getElementById('tvbox-edit-modal');
    if (m) m.style.display='none';
    S('editingSrc', null); render();
  },
};

document.addEventListener('DOMContentLoaded', function(){ if (document.getElementById('tvbox-app')) window.__tvbox.init(); });
if (document.readyState !== 'loading') { if (document.getElementById('tvbox-app')) window.__tvbox.init(); }

