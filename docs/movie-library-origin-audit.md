# 星枢片库原站完整复刻审计（2026-07-02）

目标：按原站点结构逻辑复刻除广告以外的所有内容，不再靠手写/猜测分类。

## 总原则

- 保留原站信息架构：主频道、子频道、筛选、分页/next、首页模块、专题/榜单/放映厅、详情、播放线路。
- 剔除广告：天穹 `home.capi` 中 `_vod` 以 `ad` 开头的 block；页面 HTML 中外链跳转/推广链接。
- 不用错配兜底：找不到真实接口时显示“未接入”，不能拿其他频道资源冒充。

## 天穹云影片库（napp03）

### 已确认接口

- `GET /v5/vod/home.capi`
  - data: `banners`, `blocks`
  - blocks 包含真实内容模块，也包含广告：`ad_home`, `ad_home2`
  - 应按原站首页模块分区展示，不应全部混成一张网格。

- `GET /vod/channel/list.capi`
  - 参数：`channelId`, `next`, `category`, `area`, `year`, `sort`
  - 真分页：第一页不传 `next`，后续传 `next=<上一页 data.next>`，例如 `next=page=2`
  - 错误方式：直接传 `page=2` 会重复第一页。
  - 返回：`items`, `next`, `category`, `year`, `area`, `language`, `sort`

- `GET /vod/detail.capi`
  - 参数：`vodId`
  - 返回详情、播放源、广告字段 `ads`
  - 应剔除 `ads`，保留详情和 `playSources`。

### 已确认有效 channelId

- `0`：全部/聚合最新
- `1`：电影
- `2`：剧集
- `3`：动漫
- `4`：综艺/纪录
- `5`：福利/伦理类
- `6`：短剧
- `7`：体育/动作等扩展频道（原站有效）

### 筛选

截图中的筛选应完整复刻：

- 排序：综合 / 最新 / 最热 / 评分
- 类型：伦理 / 福利 / 剧情 / 情色 / 爱情 / 喜剧 / 惊悚 / 写真 / 美女 / 恐怖 / 犯罪 / 悬疑 / 动作 / 同性 / 奇幻 / 古装 / 青春 / 科幻 / 文艺
- 地区：大陆 / 香港 / 台湾 / 美国 / 日本 / 韩国 / 英国 / 法国 / 德国 / 印度 / 泰国 / 丹麦 / 瑞典 / 巴西 / 加拿大 / 俄罗斯 / 意大利 / 比利时 / 爱尔兰 / 西班牙 / 澳大利亚 / 其它
- 年份：2026 / 2025 / 2024 / 2023 / 2022 / 2021 / 2020 / 10年代 / 00年代 / 90年代 / 80年代 / 更早

已验证：接口支持 `category/area/year/sort`。

### 待补完整复刻

- 首页应按 `blocks` 模块标题分区展示，剔除 `ad_*`。（已实现基础模块化，UIA 实测可见：轮播推荐、每日推荐、实时观看推荐、近期热门电影、明星、大片合集等模块和“更多”按钮）
- 分页硬规则：频道/专题/更多列表不得有总数量硬上限；前端可每页展示 12 条，但必须沿原站真实 `next`/分页继续加载，不能用 120/150/240 这类聚合上限腰斩资源。
- “更多”入口实测：`specialTopicId=12` 返回 `code=200`，第一页 15 条，`next=page=2`，首条为“被俘的塞万提斯”；第二页 15 条，`next=page=3`，首条为“我许可”。说明更多列表有真实资源并可持续翻页。
- 天穹频道翻页实测：`/vod/channel/list.capi?channelId=1` 第一页 21 条，`next=page=2`，首条“九叔之离奇命案”；第二页 21 条，`next=page=3`，首条“小镇恋歌”。
- 已确认可用模块接口：
  - `specialTopic/vods?...` → `/vod/specialTopic/vods.capi`
  - `vod/timeline?...` → `/vod/timeline.capi`
  - `netflixTopic/vods?...` → `/vod/netflixNewWatch/vods.capi`
  - `Netflix 新片` → `/vod/netflixNewWatch.capi`
  - `全部专题` → `/v2/vod/specialTopics.capi`
  - `明星/大片合集/高分点评` → `/vod/specialTopic/categoryTopics.capi`
  - `电影/剧集/动漫专题页` → `/v4/vod/channel/topicListView.capi`
- 已接入天穹发现页第一批真实功能区：Netflix 新片、全部专题、大片合集、明星、高分点评、电影专题页、剧集专题页；专题卡点击后进入真实专题/时间线/Netflix 列表。
- 仍未接入且已隐藏：上映表、排行榜、放映厅。已用签名接口探测 `/vod/rank.capi`、`/vod/rank/list.capi`、`/vod/ranking.capi`、`/v5/vod/rank.capi`、`/vod/release.capi`、`/vod/discover/release.capi`、`/discover/release.capi`、`/vod/appointment.capi`、`/liveHall.capi`、`/vod/liveHall.capi`、`/liveHall/list.capi`、`/vod/liveHall/list.capi`、`/liveTV.capi`、`/vod/liveTV.capi`、`/cinema.capi`、`/cinema/list.capi`、`/vod/cinema.capi`，均返回 `Api Not Found`；原站主 JS 中上映表/排行榜仅重定向到 `/home/discover?activeIdx=...`，未暴露可用 `.capi`。找不到真实接口前不展示占位入口。

## 樱境天幕片库（yinghua289）

- 首页 HTML 可访问。
- 首页结构中包含多个模块和“更多”链接，例如 `/index.php/vod/show/id/20.html`、详情 `/index.php/vod/detail/id/...html`。
- 分类应来自原站链接：`/index.php/vod/type/id/<id>.html` 或 `/index.php/vod/show/id/<id>.html`。
- 列表分页可用：`/index.php/vod/type/id/<id>/page/<n>.html`。
- 待补完整复刻：按首页模块分区展示，不只展示分类列表。

## 云岚星幕片库（ncat21）

- 当前直连首页返回 `Protected by cdndefend, verifying your browser...`。
- 在未通过防护前，不能完整解析首页结构。
- 已有备用回源尝试，但仍可能失败。
- 待补：解决防护会话或找到稳定可访问源后，再复刻首页/分类/筛选/详情。

## 当前代码状态提醒

- 关键文件：
  - `src/pages/movie-tool.js`
  - `src/style/movie-tool.css`
- 不要再手写猜测“看起来像”的分类来冒充原站。
- 后续每次新增一个原站模块，必须同时验证：数据来源真实、分页真实、过滤真实、广告已剔除。
