# 星枢片库完整复刻与重构蓝图

目标：完整复刻三方原站除广告以外的所有内容、结构、功能和播放逻辑。不是单点修按钮，而是站点级结构适配和前端/播放器重构。

## 1. 范围定义

### 必须复刻

- 站点信息架构：主频道、子频道、首页模块、专题、榜单、时间线、放映厅、文章/教程、搜索、筛选、分页。
- 资源列表逻辑：每个频道/模块对应真实数据源，不能用其他分类冒充。
- 筛选逻辑：类型、地区、年份、排序等必须进入真实接口请求。
- 详情页逻辑：标题、封面、简介、标签、地区、年份、评分、播放量、收藏/点赞等可用字段。
- 播放逻辑：多播放源、多线路、多集数、续播、自动下一集、可解析真实播放地址。
- 首页结构：按原站 block/module 分区，不得全部压成一个网格。
- 原站“更多”入口：专题/时间线/榜单等必须能进入完整列表。

### 必须剔除

- 广告 block、推广图、跳外链广告、站点安装推广、第三方博彩/成人广告等。
- 原站 APP 下载推广、无关客服/二维码推广。

### 禁止

- 禁止手写猜测分类替代原站结构。
- 禁止拿其他频道数据冒充当前频道。
- 禁止为了“看起来有内容”而使用假兜底。
- 找不到真实接口时必须显示未接入，并记录待逆向点。

## 2. 新架构

### 2.1 Site Adapter 层

每个资源站必须实现统一接口：

```ts
interface MovieSiteAdapter {
  key: string
  name: string
  getHome(): Promise<HomeSection[]>
  getNavigation(): Promise<NavigationNode[]>
  getList(request: ListRequest): Promise<ListResult>
  getFilters(node: NavigationNode): Promise<FilterGroup[]>
  search(keyword: string, request?: PageRequest): Promise<ListResult>
  getDetail(item: MovieItem): Promise<MovieDetail>
  resolvePlay?(episode: Episode): Promise<PlayableUrl>
}
```

### 2.2 数据结构

```ts
type HomeSection = {
  id: string
  title: string
  kind: 'banner' | 'grid' | 'topic' | 'rank' | 'timeline' | 'article' | 'live'
  items: MovieItem[]
  more?: ListRequest
}

type NavigationNode = {
  id: string
  title: string
  kind: 'channel' | 'tab' | 'topic' | 'rank' | 'timeline' | 'live' | 'article'
  children?: NavigationNode[]
  request?: ListRequest
}

type ListRequest = {
  source: string
  path?: string
  params?: Record<string, string | number>
  cursor?: string
  filters?: Record<string, string>
}

type ListResult = {
  items: MovieItem[]
  next?: string
  total?: number
  sections?: HomeSection[]
}
```

### 2.3 前端组件

- `MovieLibraryShell`：站点切换、导航、搜索、全局布局。
- `SiteNavigation`：主频道/子频道/更多入口。
- `FilterPanel`：根据站点和频道动态展示筛选。
- `HomeSections`：按原站首页模块分区展示。
- `MovieGrid`：资源网格。
- `TopicListView`：专题/榜单/时间线列表。
- `MovieDetailPanel`：详情、简介、标签、线路。
- `PlayerShell`：统一播放器容器。
- `SourceSelector`：播放源/线路选择。
- `EpisodeGrid`：剧集选择。
- `PlaybackControls`：续播、下一集、速度、投屏/PiP。

## 3. 三站实现策略

### 3.1 天穹云影片库

已确认接口：

- `/v5/vod/home.capi`：首页模块，含广告 block，需过滤 `ad_*`。
- `/vod/channel/list.capi`：频道列表，支持 `channelId`, `next`, `category`, `area`, `year`, `sort`。
- `/vod/detail.capi`：详情和播放源。
- `/vod/specialTopic/vods.capi`：专题影视列表。
- `/vod/timeline.capi`：时间线列表。

待逆向：

- `specialTopic/categoryTopics?...` 对应真实接口。
- `article/list` 对应真实接口。
- `发现` 主频道完整结构。
- `放映厅`/直播频道真实接口。

### 3.2 樱境天幕片库

已确认：

- 首页 HTML 可访问。
- 分类/模块链接可从 HTML 解析。
- 列表分页可通过 `/page/<n>.html`。
- 详情页和播放列表可解析。

待实现：

- 首页模块分区解析。
- “更多”链接进入完整列表。
- 分类筛选逻辑（若原站存在）。
- 播放源解析稳定化。

### 3.3 云岚星幕片库

问题：

- 当前首页受 `cdndefend` 防护影响。
- 未通过防护前不能完整复刻结构。

策略：

- 优先找稳定回源/镜像/接口。
- 若必须浏览器会话，使用内嵌 WebView 会话或后端 cookie 持久化。
- 未获取真实结构前显示未接入，不做假兜底。

## 4. 分阶段落地

### Phase 1：架构拆分

- 从 `src/pages/movie-tool.js` 中抽出站点适配器层。
- 保持现有 UI 可用，不一次性大重写。
- 先实现天穹 adapter，作为模板。

### Phase 2：天穹完整化

- 首页模块完整渲染。
- 频道、筛选、next 分页完整。
- 专题/时间线“更多”完整。
- 详情/播放源完整。
- 继续逆发现/放映厅接口。

### Phase 3：樱境完整化

- 首页模块解析。
- 分类/更多/详情/播放稳定。

### Phase 4：云岚完整化

- 解决防护/回源。
- 复刻结构。

### Phase 5：播放器重构

- 拆出独立播放器组件。
- 统一多源、多线路、选集、续播、下一集、投屏/PiP。

## 5. 验收标准

每个站点验收：

- 首页模块数量与原站基本一致，广告已剔除。
- 每个主频道/子频道内容来源真实。
- 筛选项与原站一致，并真实影响接口结果。
- 翻页/next 不重复第一页。
- 专题/榜单/时间线可进入完整列表。
- 详情页可打开，播放源/剧集完整。
- 搜索结果真实，不串站不串类。

## 6. 当前状态

- 天穹首页模块化已初步落地。
- 天穹频道筛选和 next 分页已落地。
- 天穹专题/时间线接口已确认并部分接入。
- 樱境和云岚仍需进入结构适配阶段。
