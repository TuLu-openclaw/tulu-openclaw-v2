/**
 * 屠戮影视仓 - TVBox 风格影视播放
 * 直接实现 TVBox 框架 + Tomorrow 仓库解析器接口
 */

const { createApp, ref, computed, onMounted, nextTick } = Vue;

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

createApp({
  setup() {
    const currentTab = ref('home');
    const activeSource = ref(TVBOX_SOURCES[0].key);
    const categories = ref(CATEGORIES);
    const homeList = ref([]);
    const categoryList = ref([]);
    const searchList = ref([]);
    const searchQuery = ref('');
    const currentCategory = ref({ type_id: '1', type_name: '电影' });
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

    const currentSource = computed(() => TVBOX_SOURCES.find(s => s.key === activeSource.value) || TVBOX_SOURCES[0]);

    async function tvboxReq(url, params = {}, method = 'GET') {
      const fullUrl = new URL(url);
      if (method === 'GET') {
        Object.entries(params).forEach(([k, v]) => fullUrl.searchParams.set(k, v));
      }
      try {
        const resp = await fetch(fullUrl.toString(), {
          method,
          headers: { 'User-Agent': UA, 'Referer': new URL(url).origin + '/' },
          body: method === 'POST' ? new URLSearchParams(params).toString() : undefined,
        });
        return { code: resp.status, content: await resp.text() };
      } catch (e) {
        return { code: -1, content: e.message };
      }
    }

    async function loadHome() {
      loading.value = true;
      errorMsg.value = '';
      homeList.value = [];
      const src = currentSource.value;
      try {
        if (src.type === '1080') {
          // 1080接口：只支持分类
          loading.value = false;
          return;
        }
        // TVBox 标准首页接口
        const res = await tvboxReq(src.api, { ac: 'list' });
        if (res.code !== 200) throw new Error(`网络错误: ${res.code}`);
        const data = JSON.parse(res.content);
        if (data.code !== 1) throw new Error(data.msg || '接口返回错误');
        // 取每个分类前6条
        const results = [];
        for (const cat of CATEGORIES) {
          const r = await tvboxReq(src.api, { ac: 'list', t: cat.type_id, pg: 1, limit: 6 });
          if (r.code === 200) {
            try {
              const d = JSON.parse(r.content);
              if (d.code === 1 && d.list) {
                results.push(...d.list.map(v => ({ ...v, _cat: cat.type_name })));
              }
            } catch {}
          }
        }
        homeList.value = results;
      } catch (e) {
        errorMsg.value = e.message;
      }
      loading.value = false;
    }

    async function loadCategory(page = 1) {
      loading.value = true;
      errorMsg.value = '';
      categoryList.value = [];
      const src = currentSource.value;
      try {
        if (src.type === '1080') {
          const res = await tvboxReq(src.api, { ac: 'list', t: currentCategory.value.type_id, p: page, pagesize: 24 });
          if (res.code !== 200) throw new Error(`网络错误: ${res.code}`);
          const data = JSON.parse(res.content);
          categoryList.value = data.list || [];
          currentPage.value = page;
        } else {
          const res = await tvboxReq(src.api, { ac: 'list', t: currentCategory.value.type_id, pg: page, limit: 24 });
          if (res.code !== 200) throw new Error(`网络错误: ${res.code}`);
          const data = JSON.parse(res.content);
          if (data.code !== 1) throw new Error(data.msg || '接口返回错误');
          categoryList.value = data.list || [];
          currentPage.value = page;
          totalPages.value = Math.ceil((data.total || 0) / 24);
        }
      } catch (e) {
        errorMsg.value = e.message;
      }
      loading.value = false;
    }

    async function doSearch() {
      if (!searchQuery.value.trim()) return;
      loading.value = true;
      errorMsg.value = '';
      searchList.value = [];
      const q = searchQuery.value.trim();
      const allResults = [];
      for (const src of TVBOX_SOURCES) {
        try {
          let res;
          if (src.type === '1080') {
            res = await tvboxReq(src.api, { ac: 'detail', wd: q });
          } else {
            res = await tvboxReq(src.api, { ac: 'detail', wd: q });
          }
          if (res.code === 200) {
            const data = JSON.parse(res.content);
            if (data.code === 1 && data.list) {
              allResults.push(...data.list.map(v => ({ ...v, _src: src.name })));
            }
          }
        } catch {}
      }
      searchList.value = allResults;
      loading.value = false;
      if (allResults.length === 0) errorMsg.value = '未找到相关影片';
    }

    async function openDetail(vod) {
      detailVod.value = vod;
      // 解析播放列表
      if (vod.vod_play_url) {
        const playSources = [];
        const parts = vod.vod_play_url.split('$$$');
        for (const part of parts) {
          const [from, urls] = part.split('$');
          const episodes = (urls || '').split('#').map(u => {
            const [n, url] = u.split('$');
            return { name: n || '未知', url: url || '' };
          }).filter(e => e.url);
          if (episodes.length) playSources.push({ from: from || '播放', episodes });
        }
        detailVod.value._playSources = playSources;
      }
    }

    async function playEpisode(episode) {
      playingTitle.value = episode.name;
      let rawUrl = episode.url.trim();
      playerError.value = '';
      playingUrl.value = '';

      // 判断是否是直接 m3u8
      if (rawUrl.includes('.m3u8')) {
        playingUrl.value = rawUrl;
        showPlayer.value = true;
        await nextTick();
        window.openPlayer(rawUrl);
        return;
      }

      // 中间地址需要解析
      showPlayer.value = true;
      playingUrl.value = rawUrl;
      await nextTick();
      // 尝试直接播放（部分中间地址可能是直接可用的）
      window.openPlayer(rawUrl);
    }

    function openExternalBrowser() {
      if (playingUrl.value) {
        window.open(playingUrl.value, '_blank');
      }
    }

    function switchTab(tab) {
      if (tab === currentTab.value) return;
      tabHistory.value.push(currentTab.value);
      currentTab.value = tab;
      if (tab === 'home') loadHome();
      else if (tab === 'category') loadCategory(1);
      else if (tab === 'search') { /* 搜索页默认空 */ }
    }

    function goBack() {
      if (tabHistory.value.length > 0) {
        currentTab.value = tabHistory.value.pop();
      }
    }

    onMounted(() => {
      loadHome();
    });

    window.openPlayer = function(url) {
      const video = document.getElementById('tvbox-video');
      if (!video) return;
      if (url.includes('.m3u8')) {
        if (Hls.isSupported()) {
          const hls = new Hls({ });
          hls.loadSource(url);
          hls.attachMedia(video);
          hls.on(Hls.Events.ERROR, (e, data) => {
            playerError.value = '播放失败: ' + (data.details || '未知错误');
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = url;
        } else {
          playerError.value = '当前浏览器不支持 HLS 播放';
        }
      } else {
        // 非 m3u8，直接赋值让浏览器尝试
        video.src = url;
      }
    };

    window.closePlayer = function() {
      showPlayer.value = false;
      playingUrl.value = '';
      const video = document.getElementById('tvbox-video');
      if (video) { video.pause(); video.src = ''; }
    };

    return {
      currentTab, activeSource, categories, homeList, categoryList, searchList,
      searchQuery, currentCategory, currentPage, totalPages, loading, errorMsg,
      detailVod, playingUrl, playingTitle, showPlayer, playerError,
      TVBOX_SOURCES, currentSource,
      loadHome, loadCategory, doSearch, openDetail, playEpisode,
      openExternalBrowser, switchTab, goBack,
    };
  },
  template: `
<div class="tvbox-app">
  <!-- 顶部导航 -->
  <div class="tvbox-nav">
    <button v-for="tab in ['home','category','search']" :key="tab"
      :class="{ active: currentTab === tab }"
      @click="switchTab(tab)">
      {{ tab === 'home' ? '🏠' : tab === 'category' ? '📺' : '🔍' }}
      {{ tab === 'home' ? '首页' : tab === 'category' ? '分类' : '搜索' }}
    </button>
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
    <div v-if="loading" class="tvbox-loading">加载中...</div>
    <div v-else-if="errorMsg" class="tvbox-error">{{ errorMsg }}</div>
    <div v-else>
      <div v-for="cat in categories" :key="cat.type_id" class="tvbox-section">
        <div class="tvbox-section-title">{{ cat.type_name }}</div>
        <div class="tvbox-grid">
          <div v-for="vod in homeList.filter(v => v._cat === cat.type_name).slice(0,6)" :key="vod.vod_id"
            class="tvbox-card" @click="openDetail(vod)">
            <div class="tvbox-cover">
              <img :src="vod.vod_pic" :alt="vod.vod_name" loading="lazy" @error="$event.target.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 80 120%22><rect fill=%22%23333%22 width=%2280%22 height=%22120%22/><text x=%2240%22 y=%2260%22 text-anchor=%22middle%22 fill=%22%23666%22 font-size=%2210%22>无图</text></svg>'" />
              <span class="tvbox-tag">{{ vod.vod_year || '' }}</span>
            </div>
            <div class="tvbox-name">{{ vod.vod_name }}</div>
          </div>
        </div>
      </div>
      <div v-if="homeList.length === 0 && !loading" class="tvbox-empty">
        当前源暂无数据，切换其他源试试
      </div>
    </div>
  </div>

  <!-- 分类 -->
  <div v-if="currentTab === 'category'" class="tvbox-content">
    <div class="tvbox-cat-tabs">
      <button v-for="cat in categories" :key="cat.type_id"
        :class="{ active: currentCategory.type_id === cat.type_id }"
        @click="currentCategory = cat; loadCategory(1)">
        {{ cat.type_name }}
      </button>
    </div>
    <div v-if="loading" class="tvbox-loading">加载中...</div>
    <div v-else-if="errorMsg" class="tvbox-error">{{ errorMsg }}</div>
    <div v-else>
      <div class="tvbox-grid">
        <div v-for="vod in categoryList" :key="vod.vod_id"
          class="tvbox-card" @click="openDetail(vod)">
          <div class="tvbox-cover">
            <img :src="vod.vod_pic" :alt="vod.vod_name" loading="lazy" @error="$event.target.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 80 120%22><rect fill=%22%23333%22 width=%2280%22 height=%22120%22/><text x=%2240%22 y=%2260%22 text-anchor=%22middle%22 fill=%22%23666%22 font-size=%2210%22>无图</text></svg>'" />
          </div>
          <div class="tvbox-name">{{ vod.vod_name }}</div>
        </div>
      </div>
      <div v-if="categoryList.length" class="tvbox-page">
        <button :disabled="currentPage <= 1" @click="loadCategory(currentPage - 1)">上一页</button>
        <span>{{ currentPage }} / {{ totalPages || 1 }}</span>
        <button :disabled="currentPage >= totalPages" @click="loadCategory(currentPage + 1)">下一页</button>
      </div>
    </div>
  </div>

  <!-- 搜索 -->
  <div v-if="currentTab === 'search'" class="tvbox-content">
    <div class="tvbox-search-bar">
      <input v-model="searchQuery" placeholder="输入影片名称搜索" @keyup.enter="doSearch" />
      <button @click="doSearch">搜索</button>
    </div>
    <div v-if="loading" class="tvbox-loading">搜索中...</div>
    <div v-else-if="errorMsg" class="tvbox-error">{{ errorMsg }}</div>
    <div v-else>
      <div class="tvbox-grid">
        <div v-for="vod in searchList" :key="vod.vod_id"
          class="tvbox-card" @click="openDetail(vod)">
          <div class="tvbox-cover">
            <img :src="vod.vod_pic" :alt="vod.vod_name" loading="lazy" @error="$event.target.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 80 120%22><rect fill=%22%23333%22 width=%2280%22 height=%22120%22/><text x=%2240%22 y=%2260%22 text-anchor=%22middle%22 fill=%22%23666%22 font-size=%2210%22>无图</text></svg>'" />
            <span v-if="vod._src" class="tvbox-src-tag">{{ vod._src }}</span>
          </div>
          <div class="tvbox-name">{{ vod.vod_name }}</div>
        </div>
      </div>
      <div v-if="searchList.length === 0 && searchQuery" class="tvbox-empty">未找到相关影片</div>
    </div>
  </div>

  <!-- 详情弹窗 -->
  <div v-if="detailVod" class="tvbox-modal" @click.self="detailVod = null">
    <div class="tvbox-detail">
      <button class="tvbox-close" @click="detailVod = null">✕</button>
      <div class="tvbox-detail-header">
        <img :src="detailVod.vod_pic" class="tvbox-detail-pic" @error="$event.target.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 80 120%22><rect fill=%22%23333%22 width=%2280%22 height=%22120%22/></svg>'" />
        <div class="tvbox-detail-info">
          <h3>{{ detailVod.vod_name }}</h3>
          <p>{{ detailVod.vod_actor || '未知演员' }}</p>
          <p>{{ detailVod.vod_director || '未知导演' }}</p>
          <p>{{ detailVod.vod_area || '' }} {{ detailVod.vod_year || '' }}</p>
          <p class="tvbox-score" v-if="detailVod.vod_score">评分: {{ detailVod.vod_score }}</p>
        </div>
      </div>
      <div class="tvbox-detail-desc">{{ detailVod.vod_content || '暂无简介' }}</div>
      <div v-if="detailVod._playSources && detailVod._playSources.length" class="tvbox-play-sources">
        <div v-for="(src, si) in detailVod._playSources" :key="si" class="tvbox-play-source">
          <div class="tvbox-source-name">{{ src.from }}</div>
          <div class="tvbox-episodes">
            <button v-for="(ep, ei) in src.episodes" :key="ei"
              class="tvbox-ep-btn" @click="playEpisode(ep)">
              {{ ep.name }}
            </button>
          </div>
        </div>
      </div>
      <div v-else class="tvbox-no-play">暂无播放源</div>
    </div>
  </div>

  <!-- 播放器 -->
  <div v-if="showPlayer" class="tvbox-player-overlay" @click.self="window.closePlayer()">
    <div class="tvbox-player-box">
      <button class="tvbox-close-player" @click="window.closePlayer()">✕</button>
      <div class="tvbox-player-title">{{ playingTitle }}</div>
      <div v-if="playerError" class="tvbox-player-error">
        <p>{{ playerError }}</p>
        <p v-if="playingUrl">播放地址: {{ playingUrl }}</p>
        <button @click="openExternalBrowser">在浏览器打开</button>
      </div>
      <video v-show="!playerError" id="tvbox-video" controls autoplay playsinline
        style="width:100%;max-height:70vh;background:#000"></video>
    </div>
  </div>
</div>
  `,
}).mount('#tvbox-app');
