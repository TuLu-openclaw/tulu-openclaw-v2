/**
 * 屠戮影视仓 - TVBox 风格影视播放
 * 全新设计：暗色玻璃拟态UI / 收藏 / 历史 / 源管理 / 多源并行搜索
 */

const { createApp, ref, computed, onMounted, nextTick } = Vue;

const TVBOX_SOURCES_KEY = 'tvbox_src_v2';
const TVBOX_FAVS_KEY = 'tvbox_favs_v1';
const TVBOX_HIST_KEY = 'tvbox_hist_v1';

function getDefaultSources() {
  return [
    { key: 'lziapi',   name: '🌺量子资源', api: 'https://cj.lziapi.com/api.php/provide/vod',  type: 'tvbox' },
    { key: 'bfzyapi',  name: '🌺暴风资源', api: 'https://bfzyapi.com/api.php/provide/vod', type: 'tvbox' },
    { key: 'tyyszy',   name: '🌺天涯资源', api: 'https://tyyszy.com/api.php/provide/vod',  type: 'tvbox' },
    { key: 'ffm3u8',   name: '🌺FFm3u8',  api: 'https://cj.ffzyapi.com/api.php/provide/vod', type: 'tvbox' },
    { key: 'xsd',      name: '🌺星之尘',   api: 'https://xsd.sdzyapi.com/api.php/provide/vod', type: 'tvbox' },
    { key: '1080zyku', name: '🌺1080资源', api: 'https://api.1080zyku.com/inc/api_mac10.php', type: '1080' },
  ];
}
function loadSources() {
  try { const r = localStorage.getItem(TVBOX_SOURCES_KEY); if (r) return JSON.parse(r); } catch(_) {}
  return getDefaultSources();
}
function saveSources(s) { localStorage.setItem(TVBOX_SOURCES_KEY, JSON.stringify(s)); }
function loadFavs() {
  try { const r = localStorage.getItem(TVBOX_FAVS_KEY); if (r) return JSON.parse(r); } catch(_) {}
  return [];
}
function saveFavs(s) { localStorage.setItem(TVBOX_FAVS_KEY, JSON.stringify(s)); }
function loadHist() {
  try { const r = localStorage.getItem(TVBOX_HIST_KEY); if (r) return JSON.parse(r); } catch(_) {}
  return [];
}
function saveHist(s) { localStorage.setItem(TVBOX_HIST_KEY, JSON.stringify(s)); }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

createApp({
  setup() {
    const TVBOX_SOURCES = ref(loadSources());
    const CATEGORIES = [
      { type_id: '1',  type_name: '电影' },
      { type_id: '2',  type_name: '电视剧' },
      { type_id: '3',  type_name: '综艺' },
      { type_id: '4',  type_name: '动漫' },
      { type_id: '39', type_name: '短剧' },
    ];

    const currentTab = ref('home');
    const activeSource = ref(TVBOX_SOURCES.value[0]?.key || 'lziapi');
    const homeList = ref([]);
    const categoryList = ref([]);
    const searchList = ref([]);
    const searchQuery = ref('');
    const currentCategory = ref(CATEGORIES[0]);
    const currentPage = ref(1);
    const totalPages = ref(1);
    const loading = ref(false);
    const errorMsg = ref('');
    const detailVod = ref(null);
    const playingUrl = ref('');
    const playingTitle = ref('');
    const showPlayer = ref(false);
    const playerError = ref('');
    const tabHistory = ref([]);
    const libraryTab = ref('favs');
    const favs = ref(loadFavs());
    const hist = ref(loadHist());
    const searchProgress = ref(null);
    const showSrcMgr = ref(false);
    const editingSrc = ref(null);
    const editName = ref('');
    const editApi = ref('');
    const editType = ref('tvbox');

    const currentSource = computed(() => TVBOX_SOURCES.value.find(s => s.key === activeSource.value) || TVBOX_SOURCES.value[0]);

    function isFaved(vodId) { return favs.value.some(f => String(f.vod_id) === String(vodId)); }

    function toggleFav(vod) {
      const id = String(vod.vod_id);
      const idx = favs.value.findIndex(f => String(f.vod_id) === id);
      if (idx >= 0) favs.value.splice(idx, 1);
      else favs.value.unshift({ vod_id: vod.vod_id, vod_name: vod.vod_name, vod_pic: vod.vod_pic, vod_year: vod.vod_year, added_at: Date.now() });
      saveFavs(favs.value);
    }

    function addToHist(vod, epName) {
      const id = String(vod.vod_id);
      const idx = hist.value.findIndex(h => String(h.vod_id) === id);
      if (idx >= 0) hist.value.splice(idx, 1);
      hist.value.unshift({ vod_id: vod.vod_id, vod_name: vod.vod_name, vod_pic: vod.vod_pic, episode_name: epName, watched_at: Date.now() });
      if (hist.value.length > 100) hist.value.splice(100);
      saveHist(hist.value);
    }

    function clearHist() { hist.value = []; saveHist([]); }

    async function tvboxReq(url, params = {}, method = 'GET') {
      const fullUrl = new URL(url);
      if (method === 'GET') Object.entries(params).forEach(([k, v]) => fullUrl.searchParams.set(k, v));
      try {
        const resp = await fetch(fullUrl.toString(), {
          method, headers: { 'User-Agent': UA, 'Referer': new URL(url).origin + '/' },
          body: method === 'POST' ? new URLSearchParams(params).toString() : undefined,
        });
        return { ok: resp.ok, status: resp.status, text: await resp.text() };
      } catch (e) { return { ok: false, status: -1, text: e.message }; }
    }

    async function loadHome() {
      loading.value = true; errorMsg.value = ''; homeList.value = [];
      const src = currentSource.value;
      if (src.type === '1080') { loading.value = false; return; }
      const results = [];
      for (const cat of CATEGORIES) {
        const r = await tvboxReq(src.api, { ac: 'list', t: cat.type_id, pg: 1, limit: 6 });
        if (r.ok) {
          try {
            const d = JSON.parse(r.text);
            if (d.code === 1 && d.list) results.push(...d.list.map(v => ({ ...v, _cat: cat.type_name })));
          } catch {}
        }
      }
      homeList.value = results; loading.value = false;
    }

    async function loadCategory(page = 1) {
      loading.value = true; errorMsg.value = ''; categoryList.value = [];
      const src = currentSource.value;
      try {
        let res;
        if (src.type === '1080') {
          res = await tvboxReq(src.api, { ac: 'list', t: currentCategory.value.type_id, p: page, pagesize: 24 });
        } else {
          res = await tvboxReq(src.api, { ac: 'list', t: currentCategory.value.type_id, pg: page, limit: 24 });
        }
        if (!res.ok) throw new Error('网络错误: ' + res.status);
        const data = JSON.parse(res.text);
        if (src.type === '1080') {
          categoryList.value = data.list || [];
        } else {
          if (data.code !== 1) throw new Error(data.msg || '接口错误');
          categoryList.value = data.list || [];
          totalPages.value = Math.ceil((data.total || 0) / 24);
        }
        currentPage.value = page;
      } catch (e) { errorMsg.value = e.message; }
      loading.value = false;
    }

    async function doSearch() {
      if (!searchQuery.value.trim()) return;
      loading.value = true; errorMsg.value = ''; searchList.value = [];
      const q = searchQuery.value.trim();
      const allResults = [];
      const total = TVBOX_SOURCES.value.length;
      let done = 0;
      searchProgress.value = { done: 0, total, query: q };

      await Promise.all(TVBOX_SOURCES.value.map(async (src) => {
        const r = await tvboxReq(src.api, { ac: 'detail', wd: q });
        done++;
        searchProgress.value = { done, total, query: q };
        if (r.ok) {
          try {
            const d = JSON.parse(r.text);
            if (d.code === 1 && d.list) allResults.push(...d.list.map(v => ({ ...v, _src: src.name })));
          } catch {}
        }
      }));

      searchList.value = allResults;
      searchProgress.value = null;
      loading.value = false;
      if (allResults.length === 0) errorMsg.value = '未找到相关影片';
    }

    async function openDetail(vod) {
      detailVod.value = vod;
      if (vod.vod_play_url) {
        const playSources = [];
        const parts = String(vod.vod_play_url).split('$$$');
        for (const part of parts) {
          const ci = part.indexOf('$');
          const from = ci !== -1 ? part.slice(0, ci) : '播放';
          const urls = ci !== -1 ? part.slice(ci + 1) : part;
          const episodes = [];
          urls.split('#').forEach(u => {
            const di = u.indexOf('$');
            if (di !== -1 && u.slice(di + 1)) episodes.push({ name: u.slice(0, di) || '未知', url: u.slice(di + 1) });
          });
          if (episodes.length) playSources.push({ from, episodes });
        }
        detailVod.value = { ...vod, _playSources: playSources };
      }
    }

    async function playEpisode(episode, vod) {
      playingTitle.value = episode.name + (vod ? ' - ' + vod.vod_name : '');
      let rawUrl = episode.url.trim();
      playerError.value = '';
      if (vod) addToHist(vod, episode.name);
      if (window.TVBox && typeof window.TVBox.parseUrl === 'function') {
        try { rawUrl = await window.TVBox.parseUrl(rawUrl); } catch {}
      }
      playingUrl.value = rawUrl;
      showPlayer.value = true;
      await nextTick();
      window.openPlayer(rawUrl);
    }

    function switchTab(tab) {
      if (tab === currentTab.value) return;
      tabHistory.value.push(currentTab.value);
      currentTab.value = tab;
      if (tab === 'home') loadHome();
      else if (tab === 'category') loadCategory(1);
      else if (tab === 'search') { /* 搜索页 */ }
    }

    function goBack() {
      if (tabHistory.value.length > 0) currentTab.value = tabHistory.value.pop();
    }

    // 源管理
    function openSrcMgr() { showSrcMgr.value = true; editingSrc.value = null; editName.value = ''; editApi.value = ''; editType.value = 'tvbox'; }
    function closeSrcMgr() { showSrcMgr.value = false; }
    function editSrc(src) { editingSrc.value = src.key; editName.value = src.name; editApi.value = src.api; editType.value = src.type || 'tvbox'; }
    function delSrc(key) {
      const arr = TVBOX_SOURCES.value;
      const idx = arr.findIndex(s => s.key === key);
      if (idx >= 0) { arr.splice(idx, 1); TVBOX_SOURCES.value = [...arr]; saveSources(arr); }
    }
    function saveSrc() {
      if (!editName.value.trim() || !editApi.value.trim()) return;
      const arr = [...TVBOX_SOURCES.value];
      if (editingSrc.value) {
        const idx = arr.findIndex(s => s.key === editingSrc.value);
        if (idx >= 0) { arr[idx] = { ...arr[idx], name: editName.value.trim(), api: editApi.value.trim(), type: editType.value }; }
      } else {
        arr.push({ key: 'custom_' + Date.now(), name: editName.value.trim(), api: editApi.value.trim(), type: editType.value });
      }
      TVBOX_SOURCES.value = arr; saveSources(arr);
      if (activeSource.value && !arr.find(s => s.key === activeSource.value)) activeSource.value = arr[0]?.key;
      closeSrcMgr();
    }

    // 历史播放
    async function histPlay(h) {
      const src = TVBOX_SOURCES.value.find(s => s.key === activeSource.value) || TVBOX_SOURCES.value[0];
      const r = await tvboxReq(src.api, { ac: 'detail', wd: h.vod_name });
      if (r.ok) {
        try { const d = JSON.parse(r.text); if (d.code === 1 && d.list && d.list.length) openDetail(d.list[0]); } catch {}
      }
    }

    onMounted(() => { loadHome(); });

    window.openPlayer = function(url) {
      const video = document.getElementById('tvbox-video');
      if (!video) return;
      if (url.includes('.m3u8')) {
        if (Hls.isSupported()) {
          const hls = new Hls({});
          hls.loadSource(url); hls.attachMedia(video);
          hls.on(Hls.Events.ERROR, (e, data) => { playerError.value = 'HLS播放失败: ' + (data.details || '未知错误'); });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) { video.src = url; }
        else { playerError.value = '当前浏览器不支持HLS播放'; }
      } else { video.src = url; }
    };
    window.closePlayer = function() { showPlayer.value = false; playingUrl.value = ''; const v = document.getElementById('tvbox-video'); if (v) { v.pause(); v.src = ''; } };

    function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

    return {
      TVBOX_SOURCES, CATEGORIES, currentTab, activeSource, homeList, categoryList, searchList,
      searchQuery, currentCategory, currentPage, totalPages, loading, errorMsg,
      detailVod, playingUrl, playingTitle, showPlayer, playerError,
      libraryTab, favs, hist, searchProgress,
      showSrcMgr, editingSrc, editName, editApi, editType,
      isFaved, toggleFav, clearHist,
      loadHome, loadCategory, doSearch, openDetail, playEpisode,
      openExternalBrowser: () => { if (playingUrl.value) window.open(playingUrl.value, '_blank'); },
      switchTab, goBack,
      openSrcMgr, closeSrcMgr, editSrc, delSrc, saveSrc,
      histPlay,
    };
  },
  template: `
<div class="tvbox-app">
  <!-- 顶部导航 -->
  <div class="tvbox-nav">
    <button v-for="tab in ['home','category','search','library']" :key="tab"
      :class="{ active: currentTab === tab }" @click="switchTab(tab)">
      {{ tab==='home'?'🏠':tab==='category'?'📺':tab==='search'?'🔍':'♥' }}
      {{ tab==='home'?'首页':tab==='category'?'分类':tab==='search'?'搜索':'收藏' }}
    </button>
    <button @click="openSrcMgr" style="margin-left:auto;opacity:0.7;font-size:12px;">⚙</button>
  </div>

  <!-- 源选择 -->
  <div class="tvbox-sources">
    <button v-for="s in TVBOX_SOURCES" :key="s.key"
      :class="{ active: activeSource === s.key }"
      @click="activeSource = s.key; if(currentTab==='home') loadHome()">
      {{ s.name }}
    </button>
  </div>

  <!-- 首页 -->
  <div v-if="currentTab === 'home'" class="tvbox-content">
    <div v-if="loading" class="tvbox-loading"><div class="tvbox-spinner"></div><span>加载中...</span></div>
    <div v-else-if="errorMsg" class="tvbox-error"><div class="tvbox-error-icon">⚠</div>{{ errorMsg }}</div>
    <div v-else>
      <div v-for="cat in CATEGORIES" :key="cat.type_id" class="tvbox-section">
        <div class="tvbox-section-title">{{ cat.type_name }}</div>
        <div class="tvbox-grid">
          <div v-for="vod in homeList.filter(v=>v._cat===cat.type_name).slice(0,6)" :key="vod.vod_id"
            class="tvbox-card" @click="openDetail(vod)">
            <div class="tvbox-cover">
              <img :src="vod.vod_pic" :alt="vod.vod_name" loading="lazy"
                @error="$event.target.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 80 120%22><rect fill=%22%2312121f%22 width=%2280%22 height=%22120%22/></svg>'" />
              <span class="tvbox-tag">{{ vod.vod_year || '' }}</span>
              <span v-if="vod._src" class="tvbox-src-tag">{{ vod._src }}</span>
              <span v-if="vod.vod_score" class="tvbox-score-tag">⭐ {{ vod.vod_score }}</span>
            </div>
            <div class="tvbox-name">{{ vod.vod_name }}</div>
          </div>
        </div>
      </div>
      <div v-if="homeList.length===0" class="tvbox-empty"><div class="tvbox-empty-icon">📺</div><div>当前源暂无数据，切换其他源试试</div></div>
    </div>
  </div>

  <!-- 分类 -->
  <div v-if="currentTab === 'category'" class="tvbox-content">
    <div class="tvbox-cat-tabs">
      <button v-for="cat in CATEGORIES" :key="cat.type_id"
        :class="{ active: currentCategory.type_id === cat.type_id }"
        @click="currentCategory = cat; loadCategory(1)">{{ cat.type_name }}</button>
    </div>
    <div v-if="loading" class="tvbox-loading"><div class="tvbox-spinner"></div></div>
    <div v-else-if="errorMsg" class="tvbox-error"><div class="tvbox-error-icon">⚠</div>{{ errorMsg }}</div>
    <div v-else>
      <div class="tvbox-grid">
        <div v-for="vod in categoryList" :key="vod.vod_id" class="tvbox-card" @click="openDetail(vod)">
          <div class="tvbox-cover">
            <img :src="vod.vod_pic" :alt="vod.vod_name" loading="lazy"
              @error="$event.target.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 80 120%22><rect fill=%22%2312121f%22 width=%2280%22 height=%22120%22/></svg>'" />
            <span v-if="vod.vod_score" class="tvbox-score-tag">⭐ {{ vod.vod_score }}</span>
          </div>
          <div class="tvbox-name">{{ vod.vod_name }}</div>
        </div>
      </div>
      <div v-if="categoryList.length" class="tvbox-page">
        <button :disabled="currentPage<=1" @click="loadCategory(currentPage-1)">上一页</button>
        <span>{{ currentPage }} / {{ totalPages||1 }}</span>
        <button :disabled="currentPage>=totalPages" @click="loadCategory(currentPage+1)">下一页</button>
      </div>
    </div>
  </div>

  <!-- 搜索 -->
  <div v-if="currentTab === 'search'" class="tvbox-content">
    <div class="tvbox-search-bar">
      <input v-model="searchQuery" placeholder="输入影片名称，多源并行搜索..." @keyup.enter="doSearch" />
      <button @click="doSearch">搜索</button>
    </div>
    <div v-if="searchProgress" class="tvbox-search-progress">
      <div class="tvbox-spinner" style="width:18px;height:18px;border-width:2px;"></div>
      正在搜索 "{{ searchProgress.query }}" ... {{ Math.round(searchProgress.done/searchProgress.total*100) }}% ({{ searchProgress.done }}/{{ searchProgress.total }})
    </div>
    <div v-else-if="loading" class="tvbox-loading"><div class="tvbox-spinner"></div><span>搜索中...</span></div>
    <div v-else-if="errorMsg" class="tvbox-error"><div class="tvbox-error-icon">⚠</div>{{ errorMsg }}</div>
    <div v-else>
      <div class="tvbox-grid">
        <div v-for="vod in searchList" :key="vod.vod_id" class="tvbox-card" @click="openDetail(vod)">
          <div class="tvbox-cover">
            <img :src="vod.vod_pic" :alt="vod.vod_name" loading="lazy"
              @error="$event.target.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 80 120%22><rect fill=%22%2312121f%22 width=%2280%22 height=%22120%22/></svg>'" />
            <span v-if="vod._src" class="tvbox-src-tag">{{ vod._src }}</span>
            <span v-if="vod.vod_score" class="tvbox-score-tag">⭐ {{ vod.vod_score }}</span>
          </div>
          <div class="tvbox-name">{{ vod.vod_name }}</div>
        </div>
      </div>
      <div v-if="searchList.length===0 && searchQuery" class="tvbox-empty"><div class="tvbox-empty-icon">🔍</div><div>未找到相关影片</div></div>
    </div>
  </div>

  <!-- 收藏/历史 -->
  <div v-if="currentTab === 'library'" class="tvbox-content">
    <div class="tvbox-lib-tabs">
      <button class="tvbox-lib-tab" :class="{ active: libraryTab==='favs' }" @click="libraryTab='favs'">♥ 收藏 ({{ favs.length }})</button>
      <button class="tvbox-lib-tab" :class="{ active: libraryTab==='hist' }" @click="libraryTab='hist'">⏱ 历史 ({{ hist.length }})</button>
      <button v-if="libraryTab==='hist' && hist.length" @click="clearHist" style="margin-left:auto;padding:7px 14px;background:var(--bg-card);border:1px solid var(--border-light);border-radius:8px;color:var(--text-muted);font-size:12px;cursor:pointer;font-family:inherit;">清空</button>
    </div>
    <div v-if="libraryTab==='favs'">
      <div v-if="favs.length===0" class="tvbox-empty"><div class="tvbox-empty-icon">♥</div><div>暂无收藏内容</div></div>
      <div class="tvbox-grid">
        <div v-for="vod in favs" :key="vod.vod_id" class="tvbox-card" @click="openDetail(vod)">
          <div class="tvbox-cover">
            <img :src="vod.vod_pic" :alt="vod.vod_name" loading="lazy"
              @error="$event.target.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 80 120%22><rect fill=%22%2312121f%22 width=%2280%22 height=%22120%22/></svg>'" />
          </div>
          <div class="tvbox-name">{{ vod.vod_name }}</div>
        </div>
      </div>
    </div>
    <div v-else>
      <div v-if="hist.length===0" class="tvbox-empty"><div class="tvbox-empty-icon">⏱</div><div>暂无观看记录</div></div>
      <div v-for="h in hist" :key="h.vod_id+h.watched_at" class="tvbox-hist-item" @click="histPlay(h)">
        <img class="tvbox-hist-thumb" :src="h.vod_pic" @error="this.style.display='none'" />
        <div class="tvbox-hist-info">
          <div class="tvbox-hist-name">{{ h.vod_name }}</div>
          <div class="tvbox-hist-meta">{{ h.episode_name || '' }}</div>
        </div>
        <button class="tvbox-hist-del" @click.stop="hist.splice(hist.findIndex(x=>x.vod_id===h.vod_id),1);saveHist(hist)">✕</button>
      </div>
    </div>
  </div>

  <!-- 详情弹窗 -->
  <div v-if="detailVod" class="tvbox-modal" @click.self="detailVod=null">
    <div class="tvbox-detail" @click.stop>
      <button class="tvbox-close" @click="detailVod=null">✕</button>
      <div class="tvbox-detail-header">
        <img class="tvbox-detail-pic" :src="detailVod.vod_pic" @error="$event.target.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 80 120%22><rect fill=%22%2312121f%22 width=%2280%22 height=%22120%22/></svg>'" />
        <div class="tvbox-detail-info">
          <h3>{{ detailVod.vod_name }}</h3>
          <div class="tvbox-detail-meta">
            <span v-if="detailVod.vod_actor && detailVod.vod_actor!=='未知演员'" class="tvbox-meta-tag">{{ detailVod.vod_actor }}</span>
            <span v-if="detailVod.vod_director && detailVod.vod_director!=='未知导演'" class="tvbox-meta-tag">导演: {{ detailVod.vod_director }}</span>
            <span v-if="detailVod.vod_area" class="tvbox-meta-tag">{{ detailVod.vod_area }}</span>
            <span v-if="detailVod.vod_year" class="tvbox-meta-tag">{{ detailVod.vod_year }}</span>
            <span v-if="detailVod.vod_score" class="tvbox-meta-tag tvbox-score-val">⭐ {{ detailVod.vod_score }}</span>
          </div>
          <button class="tvbox-meta-tag" :style="isFaved(detailVod.vod_id)?'background:rgba(255,107,157,0.15);border-color:#ff6b9d;color:#ff6b9d;cursor:pointer':'cursor:pointer'"
            @click="toggleFav(detailVod)">
            {{ isFaved(detailVod.vod_id)?'♥ 已收藏':'♡ 收藏' }}
          </button>
        </div>
      </div>
      <div class="tvbox-detail-body">
        <div class="tvbox-detail-desc">{{ detailVod.vod_content ? detailVod.vod_content.replace(/<[^>]+>/g,'') : '暂无简介' }}</div>
        <div class="tvbox-divider"></div>
        <div v-if="detailVod._playSources && detailVod._playSources.length">
          <div v-for="(src,si) in detailVod._playSources" :key="si" class="tvbox-play-source">
            <div class="tvbox-source-name">{{ src.from }}</div>
            <div class="tvbox-episodes">
              <button v-for="(ep,ei) in src.episodes" :key="ei" class="tvbox-ep-btn" @click="playEpisode(ep, detailVod)">{{ ep.name }}</button>
            </div>
          </div>
        </div>
        <div v-else class="tvbox-no-play">暂无播放数据</div>
      </div>
    </div>
  </div>

  <!-- 播放器 -->
  <div v-if="showPlayer" class="tvbox-player-overlay" @click.self="window.closePlayer()">
    <div class="tvbox-player-box">
      <div class="tvbox-player-header">
        <div class="tvbox-player-title">{{ playingTitle }}</div>
        <div class="tvbox-player-actions">
          <button class="tvbox-player-btn" @click="openExternalBrowser">🔗 外链</button>
          <button class="tvbox-close-player" @click="window.closePlayer()">✕</button>
        </div>
      </div>
      <div v-if="playerError" class="tvbox-player-error">
        <div class="tvbox-player-error-icon">⚠</div>
        <p>{{ playerError }}</p>
        <button @click="openExternalBrowser">在浏览器打开</button>
      </div>
      <div v-show="!playerError" class="tvbox-video-wrap">
        <video id="tvbox-video" controls autoplay playsinline style="width:100%;max-height:65vh;background:#000"></video>
      </div>
    </div>
  </div>

  <!-- 源管理弹窗 -->
  <div v-if="showSrcMgr" class="tvbox-modal" style="z-index:300" @click.self="closeSrcMgr">
    <div class="tvbox-detail" style="max-width:500px" @click.stop>
      <button class="tvbox-close" @click="closeSrcMgr">✕</button>
      <div class="tvbox-detail-header"><h3 style="font-size:17px;color:var(--text-primary);margin:0;">⚙ 源管理</h3></div>
      <div class="tvbox-detail-body">
        <div v-for="src in TVBOX_SOURCES" :key="src.key" class="tvbox-hist-item" style="cursor:default">
          <div class="tvbox-hist-info">
            <div class="tvbox-hist-name">{{ src.name }}</div>
            <div class="tvbox-hist-meta" style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ src.api }}</div>
          </div>
          <button class="tvbox-player-btn" style="font-size:11px;padding:4px 10px" @click="editSrc(src)">编辑</button>
          <button style="padding:4px 10px;background:rgba(255,107,107,0.1);border:1px solid rgba(255,107,107,0.3);border-radius:6px;color:#ff6b6b;font-size:11px;cursor:pointer;font-family:inherit" @click="delSrc(src.key)">删除</button>
        </div>
        <button class="tvbox-no-play" style="margin-top:10px;border-style:dashed;cursor:pointer;background:transparent" @click="editingSrc=null;editName='';editApi='';editType='tvbox'">+ 添加新源</button>
        <div v-if="editName!=='' || editApi!==''" style="margin-top:14px">
          <div class="tvbox-detail-desc" style="font-size:12px;color:var(--text-muted);margin-bottom:10px">{{ editingSrc?'编辑源':'添加新源' }}</div>
          <div style="margin-bottom:10px">
            <input v-model="editName" placeholder="源名称" style="width:100%;padding:9px 12px;background:var(--bg-card);border:1px solid var(--border-light);border-radius:8px;color:var(--text-primary);font-size:13px;outline:none;font-family:inherit" />
          </div>
          <div style="margin-bottom:10px">
            <input v-model="editApi" placeholder="API 地址 https://..." style="width:100%;padding:9px 12px;background:var(--bg-card);border:1px solid var(--border-light);border-radius:8px;color:var(--text-primary);font-size:13px;outline:none;font-family:inherit" />
          </div>
          <div style="margin-bottom:12px">
            <select v-model="editType" style="width:100%;padding:9px 12px;background:var(--bg-card);border:1px solid var(--border-light);border-radius:8px;color:var(--text-primary);font-size:13px;outline:none;font-family:inherit">
              <option value="tvbox">TVBox 标准</option>
              <option value="1080">1080 API</option>
            </select>
          </div>
          <button @click="saveSrc" style="width:100%;padding:10px;background:linear-gradient(135deg,var(--accent),#6355cc);border:none;border-radius:10px;color:#fff;font-size:14px;cursor:pointer;font-weight:700;font-family:inherit">保存</button>
        </div>
      </div>
    </div>
  </div>
</div>
  `,
}).mount('#tvbox-app');