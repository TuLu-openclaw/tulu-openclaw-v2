# 屠戮影视 v2.0 设计规范

## 实现状态：✅ 已完成

## 技术架构

### 路由设计
```
/movie-tool/home      - 首页（分类浏览 + Banner 轮播）
/movie-tool/search    - 搜索页（历史 + 类型筛选 + 全网搜索）
/movie-tool/detail/:id/:srcIdx  - 详情页
/movie-tool/play/:id/:srcIdx    - 播放器页
/movie-tool/my        - 我的（收藏 + 历史）
/movie-tool/live      - 电视直播
```

### 视频源（TVBox CMS API）
| 源 | API | 类型 |
|---|---|---|
| 暴风资源 | `https://bfzyapi.com/api.php` | CMS XML |
| 量子资源 | `https://cj.lziapi.com/api.php` | CMS XML |
| 星之尘 | `https://xsd.sdzyapi.com/api.php` | CMS XML |
| 天涯资源 | `https://tyyszy.com/api.php` | CMS XML |
| 1080资源 | `https://api.1080zyku.com/inc/api_mac10.php` | JSON |

### 直播源
| 源 | URL |
|---|---|
| zdir聚合 | `http://zdir.kebedd69.repl.co/public/live.txt` |
| 聚看影视 | `http://home.jundie.top:81/Cat/tv/live.txt` |
| Ftyyy | `http://ftyyy.tk/live.txt` |
| rihou | `http://rihou.cc:555/gggg.nzk` |

### 本地存储 Key
- `tulu_vod_fav` - 收藏列表
- `tulu_vod_hist` - 观看历史（最多50条）
- `tulu_vod_search` - 搜索历史（最多30条）

## 核心模块

### 数据解析
- `parseXml(txt)` - 解析 CMS XML 格式视频列表
- `parse1080(json)` - 解析 1080 资源 JSON 格式
- `parseDl(dlNode)` - 解析播放地址列表
- `parseNzk(txt)` - 解析 NZK 格式直播源
- `parseM3u(txt)` - 解析 M3U 格式直播源

### 播放器
- HLS (m3u8) → hls.js CDN 动态加载
- MP4 → 原生 `<video>` 标签
- IFrame → 第三方解析页面

### 搜索策略
多源并发搜索，关键词匹配 name + actor 字段，按相关度排序

## 文件
- `src/pages/movie-tool.js` - 主逻辑（478行）
- `src/style/movie-tool.css` - OTT 风格样式（~14KB）
- 分类: 电影/剧集/综艺/动漫/纪录片/短剧

## 设计风格
- 深色主题，背景 #0a0a0f
- 渐变色彩强调，红色 #e50914 主色
- 圆角卡片，悬停动效
- Banner 轮播 + 分类网格
- 移动端优先，桌面端适配
