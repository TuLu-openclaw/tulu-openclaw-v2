import './tvbox.css';
import '../style/movie-tool.css';

const TVBOX_SOURCES = [
  { key: 'lziapi', name: '🌺量子资源', api: 'https://cj.lziapi.com/api.php/provide/vod', type: 'tvbox' },
  { key: 'bfzyapi', name: '🌺暴风资源', api: 'https://bfzyapi.com/api.php/provide/vod', type: 'tvbox' },
  { key: 'tyyszy', name: '🌺天涯资源', api: 'https://tyyszy.com/api.php/provide/vod', type: 'tvbox' },
  { key: 'ffm3u8', name: '🌺FFm3u8', api: 'https://cj.ffzyapi.com/api.php/provide/vod', type: 'tvbox' },
  { key: 'xsd', name: '🌺星之尘', api: 'https://xsd.sdzyapi.com/api.php/provide/vod', type: 'tvbox' },
  { key: '1080zyku', name: '🌺1080资源', api: 'https://api.1080zyku.com/inc/api_mac10.php', type: '1080' },
];

const CATEGORIES = [
  { type_id: '1', type_name: '电影' },
  { type_id: '2', type_name: '电视剧' },
  { type_id: '3', type_name: '综艺' },
  { type_id: '4', type_name: '动漫' },
  { type_id: '39', type_name: '短剧' },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let state = {};

function S(key, def) {
  if (!(key in state)) state[key] = def;
  return state[key];
}

async function tvReq(url, params, method) {
  method = method || 'GET';
  const fullUrl = new URL(url);
  if (method === 'GET') {
    Object.keys(params || {}).forEach(function(k) { fullUrl.searchParams.set(k, params[k]); });
  }
  try {
    var resp = await fetch(fullUrl.toString(), {
      method: method,
      headers: { 'User-Agent': UA, 'Referer': new URL(url).origin + '/' },
      body: method === 'POST' ? new URLSearchParams(params || {}).toString() : undefined,
    });
    return { code: resp.status, content: await resp.text() };
  } catch (e) {
    return { code: -1, content: e.message };
  }
}

function getSource() {
  return TVBOX_SOURCES.find(function(s) { return s.key === S('activeSource', 'lziapi'); }) || TVBOX_SOURCES[0];
}

async function loadHome() {
  S('loading', true);
  S('errorMsg', '');
  S('homeList', []);
  render();
  var src = getSource();
  if (src.type === '1080') {
    S('loading', false);
    render();
    return;
  }
  var results = [];
  for (var ci = 0; ci < CATEGORIES.length; ci++) {
    var cat = CATEGORIES[ci];
    var r = await tvReq(src.api, { ac: 'list', t: cat.type_id, pg: 1, limit: 6 });
    if (r.code === 200) {
      try {
        var d = JSON.parse(r.content);
        if (d.code === 1 && d.list) {
          d.list.forEach(function(v) {
            v._cat = cat.type_name;
            results.push(v);
          });
        }
      } catch (_) {}
    }
  }
  S('homeList', results);
  S('loading', false);
  render();
}

async function loadCategory(page) {
  page = page || 1;
  S('loading', true);
  S('errorMsg', '');
  S('categoryList', []);
  render();
  var src = getSource();
  try {
    var params = { ac: 'list', t: S('currentCategory', { type_id: '1', type_name: '电影' }).type_id, pg: page, limit: 24 };
    var res = await tvReq(src.api, params);
    if (res.code !== 200) throw new Error('网络错误: ' + res.code);
    var data = JSON.parse(res.content);
    S('categoryList', data.list || []);
    S('currentPage', page);
    if (data.total) S('totalPages', Math.ceil(data.total / 24));
  } catch (e) {
    S('errorMsg', e.message);
  }
  S('loading', false);
  render();
}

async function doSearch() {
  var q = S('searchQuery', '').trim();
  if (!q) return;
  S('loading', true);
  S('errorMsg', '');
  S('searchList', []);
  render();
  var all = [];
  for (var si = 0; si < TVBOX_SOURCES.length; si++) {
    var src = TVBOX_SOURCES[si];
    try {
      var res = await tvReq(src.api, { ac: 'detail', wd: q });
      if (res.code === 200) {
        var data = JSON.parse(res.content);
        if (data.code === 1 && data.list) {
          data.list.forEach(function(v) {
            v._src = src.name;
            all.push(v);
          });
        }
      }
    } catch (_) {}
  }
  S('searchList', all);
  S('loading', false);
  if (all.length === 0) S('errorMsg', '未找到相关影片');
  render();
}

function openDetail(vod) {
  var v = Object.assign({}, vod);
  v._playSources = [];
  if (vod.vod_play_url) {
    var parts = String(vod.vod_play_url).split('$$$');
    for (var pi = 0; pi < parts.length; pi++) {
      var part = parts[pi];
      var ci = part.indexOf('$');
      var from = ci !== -1 ? part.slice(0, ci) : '播放';
      var urls = ci !== -1 ? part.slice(ci + 1) : part;
      var episodes = [];
      var urlParts = urls.split('#');
      for (var ui = 0; ui < urlParts.length; ui++) {
        var u = urlParts[ui];
        var di = u.indexOf('$');
        if (di !== -1 && u.slice(di + 1)) {
          episodes.push({ name: u.slice(0, di) || '未知', url: u.slice(di + 1) });
        }
      }
      if (episodes.length) v._playSources.push({ from: from, episodes: episodes });
    }
  }
  S('detailVod', v);
  render();
}

async function playEpisode(episode) {
  S('playingTitle', episode.name);
  S('playingUrl', (episode.url || '').trim());
  S('playerError', '');
  S('showPlayer', true);
  render();

  var rawUrl = S('playingUrl', '');
  var finalUrl = rawUrl;

  if (window.TVBox && window.TVBox.parseUrl) {
    try {
      finalUrl = await window.TVBox.parseUrl(rawUrl);
    } catch (e) {
      console.warn('[TVBox] parseUrl failed, using raw URL:', e.message);
      finalUrl = rawUrl;
    }
  }

  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      var video = document.getElementById('tvbox-video');
      if (!video) return;
      if (state.hls) { state.hls.destroy(); state.hls = null; }
      var url = finalUrl || rawUrl;
      if (url.indexOf('.m3u8') !== -1 && url.indexOf('http') === 0) {
        if (window.Hls && Hls.isSupported()) {
          var hls = new Hls({});
          state.hls = hls;
          hls.loadSource(url);
          hls.attachMedia(video);
          hls.on(Hls.Events.ERROR, function(e, data) {
            if (data.fatal) {
              S('playerError', 'HLS播放失败: ' + (data.details || '未知错误'));
              if (state.hls) { state.hls.destroy(); state.hls = null; }
              render();
            }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = url;
        } else {
          S('playerError', '当前环境不支持HLS播放');
          render();
        }
      } else {
        video.src = url;
      }
    });
  });
}

function closePlayer() {
  S('showPlayer', false);
  if (state.hls) { state.hls.destroy(); state.hls = null; }
  var video = document.getElementById('tvbox-video');
  if (video) { video.pause(); video.src = ''; }
  S('playingUrl', '');
  render();
}

function openExternalBrowser() {
  var url = S('playingUrl', '');
  if (url) window.open(url, '_blank');
}

function switchTab(tab) {
  S('currentTab', tab);
  if (tab === 'home') loadHome();
  else if (tab === 'category') loadCategory(1);
  else if (tab === 'search') render();
}

function getVodById(id) {
  var lists = [S('homeList', []), S('categoryList', []), S('searchList', [])];
  for (var li = 0; li < lists.length; li++) {
    var lst = lists[li];
    for (var vi = 0; vi < lst.length; vi++) {
      if (String(lst[vi].vod_id) === String(id)) return lst[vi];
    }
  }
  return null;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderVodCard(vod) {
  var catTag = vod._cat ? '<span class="tvbox-tag">' + esc(vod._cat) + '</span>' : '';
  var srcTag = vod._src ? '<span class="tvbox-tag-src">' + esc(vod._src) + '</span>' : '';
  var tag = catTag || srcTag;
  var name = '<div class="tvbox-name">' + esc(vod.vod_name) + '</div>';
  var img = '<div class="tvbox-cover"><img src="' + esc(vod.vod_pic) + '" alt="' + esc(vod.vod_name) + '" loading="lazy" onerror="window.__tvbox.imgErr(this)"/>' + tag + '<div class="tvbox-card-overlay"><div class="tvbox-play-icon">▶</div></div></div>';
  return '<div class="tvbox-card" onclick="window.__tvbox.detail(\'' + esc(String(vod.vod_id)) + '\')">' + img + name + '</div>';
}

function renderHome() {
  if (S('loading', false)) return '<div class="tvbox-loading">加载中</div>';
  if (S('errorMsg', '')) return '<div class="tvbox-error">' + esc(S('errorMsg', '')) + '</div>';
  var list = S('homeList', []);
  if (list.length === 0) return '<div class="tvbox-empty">当前源暂无数据，切换其他源试试</div>';
  var html = '';
  for (var ci = 0; ci < CATEGORIES.length; ci++) {
    var cat = CATEGORIES[ci];
    var items = [];
    for (var vi = 0; vi < list.length; vi++) {
      if (list[vi]._cat === cat.type_name) items.push(list[vi]);
    }
    items = items.slice(0, 6);
    if (!items.length) continue;
    html += '<div class="tvbox-section"><div class="tvbox-section-header"><div class="tvbox-section-title">' + esc(cat.type_name) + '</div></div><div class="tvbox-grid">' + items.map(function(v) { return renderVodCard(v); }).join('') + '</div></div>';
  }
  return html;
}

function renderCategory() {
  if (S('loading', false)) return '<div class="tvbox-loading">加载中</div>';
  if (S('errorMsg', '')) return '<div class="tvbox-error">' + esc(S('errorMsg', '')) + '</div>';
  var list = S('categoryList', []);
  if (!list.length) return '<div class="tvbox-empty">暂无内容</div>';
  var html = '<div class="tvbox-grid">' + list.map(function(v) { return renderVodCard(v); }).join('') + '</div>';
  if (list.length) {
    html += '<div class="tvbox-page"><button' + (S('currentPage', 1) <= 1 ? ' disabled' : '') + ' onclick="window.__tvbox.goPage(' + (S('currentPage', 1) - 1) + ')">上一页</button><span>' + S('currentPage', 1) + ' / ' + S('totalPages', 1) + '</span><button' + (S('currentPage', 1) >= S('totalPages', 1) ? ' disabled' : '') + ' onclick="window.__tvbox.goPage(' + (S('currentPage', 1) + 1) + ')">下一页</button></div>';
  }
  return html;
}

function renderSearch() {
  if (S('loading', false)) return '<div class="tvbox-loading">搜索中</div>';
  if (S('errorMsg', '')) return '<div class="tvbox-error">' + esc(S('errorMsg', '')) + '</div>';
  var list = S('searchList', []);
  if (!list.length) return '<div class="tvbox-empty">未找到相关影片</div>';
  return '<div class="tvbox-grid">' + list.map(function(v) { return renderVodCard(v); }).join('') + '</div>';
}

function renderEpisodes() {
  var playSources = S('detailVod', null);
  if (!playSources || !playSources._playSources || !playSources._playSources.length) {
    return '<div class="tvbox-no-play">暂无播放源</div>';
  }
  var html = '';
  for (var si = 0; si < playSources._playSources.length; si++) {
    var src = playSources._playSources[si];
    html += '<div class="tvbox-play-source"><div class="tvbox-source-name">' + esc(src.from) + '</div><div class="tvbox-episodes">';
    for (var ei = 0; ei < src.episodes.length; ei++) {
      var ep = src.episodes[ei];
      html += '<button class="tvbox-ep-btn" onclick="window.__tvbox.play(' + si + ',' + ei + ')">' + esc(ep.name) + '</button>';
    }
    html += '</div></div>';
  }
  return html;
}

function renderDetail() {
  var v = S('detailVod', null);
  if (!v) return '';
  var scoreHtml = v.vod_score ? '<span class="tvbox-meta-item tvbox-score">' + esc(v.vod_score) + '</span>' : '';
  var actorHtml = v.vod_actor && v.vod_actor !== '未知演员' ? '<span class="tvbox-meta-item">主演: ' + esc(v.vod_actor) + '</span>' : '';
  var directorHtml = v.vod_director && v.vod_director !== '未知导演' ? '<span class="tvbox-meta-item">导演: ' + esc(v.vod_director) + '</span>' : '';
  var areaHtml = v.vod_area ? '<span class="tvbox-meta-item">' + esc(v.vod_area) + '</span>' : '';
  var yearHtml = v.vod_year ? '<span class="tvbox-meta-item">' + esc(v.vod_year) + '</span>' : '';
  return '<div class="tvbox-modal" onclick="if(event.target===this)window.__tvbox.closeDetail()">' +
    '<div class="tvbox-detail" onclick="event.stopPropagation()">' +
    '<button class="tvbox-close" onclick="window.__tvbox.closeDetail()">✕</button>' +
    '<img class="tvbox-detail-pic" src="' + esc(v.vod_pic) + '" onerror="this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 80 120%22><rect fill=%22%231e1e30%22 width=%2280%22 height=%22120%22/></svg>\'" />' +
    '<div class="tvbox-detail-body">' +
    '<div class="tvbox-detail-info"><h3>' + esc(v.vod_name) + '</h3>' +
    '<div class="tvbox-meta">' + actorHtml + directorHtml + areaHtml + yearHtml + scoreHtml + '</div></div>' +
    '<div class="tvbox-detail-desc">' + esc(v.vod_content || '暂无简介') + '</div>' +
    renderEpisodes() + '</div></div></div>';
}

function renderPlayer() {
  if (!S('showPlayer', false)) return '';
  var err = S('playerError', '');
  var errHtml = err ? '<div class="tvbox-player-error"><p>' + esc(err) + '</p><button onclick="window.__tvbox.openBrowser()">在浏览器打开</button></div>' : '';
  return '<div class="tvbox-player-overlay">' +
    '<div class="tvbox-player-box">' +
    '<div class="tvbox-player-header">' +
    '<div class="tvbox-player-title">' + esc(S('playingTitle', '')) + '</div>' +
    '<button class="tvbox-close-player" onclick="window.__tvbox.closePlayer()">✕</button></div>' +
    errHtml +
    '<div class="tvbox-video-wrap" style="display:' + (err ? 'none' : 'block') + '">' +
    '<video id="tvbox-video" controls autoplay style="width:100%;background:#000;display:block;"></video></div>' +
    '</div></div>';
}

function render() {
  var el = document.getElementById('tvbox-app');
  if (!el) return;
  var tab = S('currentTab', 'home');
  var catExtra = '';
  if (tab === 'category') {
    var catHtml = '';
    for (var ci = 0; ci < CATEGORIES.length; ci++) {
      var cat = CATEGORIES[ci];
      var curCat = S('currentCategory', { type_id: '1', type_name: '电影' });
      catHtml += '<button class="' + (cat.type_id === curCat.type_id ? 'active' : '') + '" onclick="window.__tvbox.setCat(\'' + cat.type_id + '\')">' + esc(cat.type_name) + '</button>';
    }
    catExtra = '<div class="tvbox-controls"><div class="tvbox-cat-tabs">' + catHtml + '</div></div>';
  } else if (tab === 'search') {
    catExtra = '<div class="tvbox-controls"><div class="tvbox-search-wrap"><input type="text" placeholder="输入影片名称搜索" value="' + esc(S('searchQuery', '')) + '" onkeyup="if(event.key===\'Enter\')window.__tvbox.search()" oninput="window.__tvbox.setQuery(this.value)" /><button onclick="window.__tvbox.search()">搜索</button></div></div>';
  }

  var srcBtns = '';
  for (var si = 0; si < TVBOX_SOURCES.length; si++) {
    var src = TVBOX_SOURCES[si];
    srcBtns += '<button class="tvbox-source-btn ' + (src.key === S('activeSource', 'lziapi') ? 'active' : '') + '" onclick="window.__tvbox.switchSrc(\'' + src.key + '\')">' + src.name + '</button>';
  }

  var tabContent;
  if (tab === 'home') tabContent = renderHome();
  else if (tab === 'category') tabContent = renderCategory();
  else tabContent = renderSearch();

  el.innerHTML =
    '<div class="tvbox-header"><div class="tvbox-header-inner">' +
    '<div class="tvbox-logo">🎬 屠戮影视</div>' +
    '<div class="tvbox-nav">' +
    '<button class="' + (tab === 'home' ? 'active' : '') + '" onclick="window.__tvbox.tab(\'home\')">首页</button>' +
    '<button class="' + (tab === 'category' ? 'active' : '') + '" onclick="window.__tvbox.tab(\'category\')">分类</button>' +
    '<button class="' + (tab === 'search' ? 'active' : '') + '" onclick="window.__tvbox.tab(\'search\')">搜索</button>' +
    '</div></div></div>' +
    '<div class="tvbox-source-bar"><div class="tvbox-source-inner">' +
    '<span class="tvbox-source-label">线路</span>' + srcBtns +
    '</div></div>' +
    '<div class="tvbox-content">' + catExtra + tabContent + '</div>' +
    renderDetail() + renderPlayer();
}

window.__tvbox = {
  init: function() {
    if (!window.Hls) {
      var s = document.createElement('script');
      s.src = './hls.min.js';
      document.head.appendChild(s);
    }
    state = {};
    render();
    loadHome();
  },
  tab: function(t) { switchTab(t); },
  switchSrc: function(key) {
    S('activeSource', key);
    render();
    var tab = S('currentTab', 'home');
    if (tab === 'home') loadHome();
    else if (tab === 'category') loadCategory(1);
  },
  setCat: function(id) {
    for (var ci = 0; ci < CATEGORIES.length; ci++) {
      if (CATEGORIES[ci].type_id === id) {
        S('currentCategory', CATEGORIES[ci]);
        break;
      }
    }
    render();
    loadCategory(1);
  },
  goPage: function(p) { loadCategory(p); },
  search: function() { doSearch(); },
  setQuery: function(q) { S('searchQuery', q); },
  detail: function(id) {
    var vod = getVodById(id);
    if (vod) openDetail(vod);
  },
  play: function(si, ei) {
    var vod = S('detailVod', null);
    if (vod && vod._playSources && vod._playSources[si]) {
      var ep = vod._playSources[si].episodes[ei];
      if (ep) playEpisode(ep);
    }
  },
  closeDetail: function() { S('detailVod', null); render(); },
  closePlayer: function() { closePlayer(); },
  openBrowser: function() { openExternalBrowser(); },
  imgErr: function(el) { if (el) el.style.display = 'none'; },
};
