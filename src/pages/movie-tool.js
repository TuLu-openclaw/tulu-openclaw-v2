/**
 * 星枢影视 - 影视点播 + 电视直播
 * VOD: 多源聚合（暴风/星之尘/天涯/饭太稀/肥猫）
 * TV: 多源直播（繁星/聚浪等M3U源）
 * 基于 TVAPP (youhunwl/TVAPP) 影视仓框架分析
 * 2026-04-13 v8
 */

import '../style/movie-tool.css'
import { t, getLang } from '../lib/i18n.js'

function mt(key, params) {
  return t('movieTool.' + key, params)
}

// ── HTML 转义（防止 XSS）───────────────────────────────
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeHttpUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    return parsed.href
  } catch {
    return ''
  }
}

function parseYinghuaListHtml(html, baseUrl) {
  const results = []
  const seen = new Set()
  const addFromBlock = (block) => {
    const href = block.match(/href=["']([^"']*\/index\.php\/vod\/detail\/id\/\d+\.html[^"']*)["']/i)?.[1]
    if (!href) return
    const url = new URL(href, baseUrl).href
    const idMatch = href.match(/\/id\/(\d+)\.html/i)
    const id = idMatch ? idMatch[1] : url
    if (seen.has(id)) return
    seen.add(id)
    const picRaw = block.match(/data-original=["']([^"']+)["']/i)?.[1] || block.match(/src=["']([^"']+)["']/i)?.[1] || ''
    const title = decodeHtmlEntities((block.match(/title=["']([^"']+)["']/i)?.[1] || block.match(/<h3[^>]*class=["'][^"']*title[^"']*["'][^>]*>[\s\S]*?<a[^>]*>([^<]+)/i)?.[1] || '').trim())
    const remarks = decodeHtmlEntities((block.match(/pic-text[^>]*>([^<]+)/i)?.[1] || '').trim())
    results.push({
      vod_id: id,
      vod_name: title,
      vod_pic: picRaw ? new URL(picRaw, baseUrl).href : '',
      vod_remarks: remarks,
      type_name: '动漫',
      _detailUrl: url,
    })
  }
  const boxRe = /<div[^>]+class=["'][^"']*stui-vodlist__box[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi
  let match
  while ((match = boxRe.exec(html)) && results.length < 60) addFromBlock(match[1])
  const mediaRe = /<li[^>]+class=["'][^"']*(?:active|clearfix|top-line-dot)[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi
  while ((match = mediaRe.exec(html)) && results.length < 60) addFromBlock(match[1])
  return results
}

function decodeHtmlEntities(text) {
  if (!text) return ''
  return String(text)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function extractYinghuaLines(html, baseUrl) {
  const lines = []
  const lineKeys = new Set()
  const pushLine = (name, eps) => {
    const seenUrls = new Set()
    const cleanEps = eps.filter(ep => {
      if (!ep?.url || seenUrls.has(ep.url)) return false
      seenUrls.add(ep.url)
      return true
    })
    if (!cleanEps.length) return
    const key = cleanEps.map(ep => ep.url).join('|')
    if (lineKeys.has(key)) return
    lineKeys.add(key)
    lines.push({ name: cleanLineName(name, '线路' + (lines.length + 1)), urls: cleanEps })
  }
  const fromMatch = html.match(/player_aaaa\.from\s*=\s*['"]([^'"]+)['"]/i)
  const urlMatch = html.match(/player_aaaa\.url\s*=\s*['"]([^'"]+)['"]/i)
  const sourceNames = (fromMatch?.[1] || '').split('$$$')
  const sourceUrls = (urlMatch?.[1] || '').split('$$$')
  for (let i = 0; i < Math.min(sourceNames.length, sourceUrls.length); i++) {
    const name = cleanLineName(sourceNames[i], '线路' + (i + 1))
    const raw = sourceUrls[i] || ''
    const eps = raw.split('#').map((part, epIndex) => {
      const idx = part.indexOf('$')
      const epName = idx >= 0 ? part.slice(0, idx).trim() : '第' + (epIndex + 1) + '集'
      const epUrl = idx >= 0 ? part.slice(idx + 1).trim() : part.trim()
      return epUrl ? { name: epName, url: new URL(epUrl, baseUrl).href } : null
    }).filter(Boolean)
    if (eps.length) pushLine(name, eps)
  }
  if (!lines.length) {
    const playlistBlocks = [...html.matchAll(/<div[^>]+class=["'][^"']*(?:playlist|play-list|stui-content__playlist|stui-play__list|anthology|episode-list)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)]
    playlistBlocks.forEach((block, blockIndex) => {
      const eps = [...block[1].matchAll(/<a[^>]+href=["']([^"']*(?:\/play\/|\/index\.php\/vod\/play\/)[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
        .map((m, i) => ({
          name: decodeHtmlEntities(m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) || ('第' + (i + 1) + '集'),
          url: normalizeEpisodeUrl(m[1], baseUrl),
        }))
        .filter(ep => ep.url)
      pushLine('线路' + (blockIndex + 1), eps)
    })
  }
  if (!lines.length) {
    const eps = [...html.matchAll(/<a[^>]+href=["']([^"']*(?:\/play\/|\/index\.php\/vod\/play\/)[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map((m, i) => ({
        name: decodeHtmlEntities(m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) || ('第' + (i + 1) + '集'),
        url: normalizeEpisodeUrl(m[1], baseUrl),
      }))
      .filter(ep => ep.url)
    if (eps.length) {
      if (eps.length > 220) {
        const groups = new Map()
        eps.forEach(ep => {
          const sid = ep.url.match(/\/sid\/(\d+)\//i)?.[1] || 'default'
          if (!groups.has(sid)) groups.set(sid, [])
          groups.get(sid).push(ep)
        })
        ;[...groups.values()].forEach((group, groupIndex) => pushLine(groupIndex === 0 ? '默认线路' : '线路' + (groupIndex + 1), group))
      } else {
        pushLine('默认线路', eps)
      }
    }
  }
  return lines
}

function isYinghuaPlayPageUrl(url) {
  return /yinghua289\.com\/index\.php\/vod\/play\//i.test(String(url || '')) || /\/index\.php\/vod\/play\//i.test(String(url || ''))
}

function parseYinghuaPlayUrl(html, baseUrl) {
  const playerJson = html.match(/var\s+player_aaaa\s*=\s*(\{[\s\S]*?\})\s*<\/script>/i)?.[1]
  if (playerJson) {
    try {
      const data = JSON.parse(playerJson)
      const rawUrl = data?.url || ''
      if (rawUrl) return normalizeEpisodeUrl(rawUrl, baseUrl)
    } catch {}
  }
  const direct = html.match(/https?:\\?\/\\?\/[^'"<>\\]+(?:m3u8|mp4)(?:[^'"<>\\]*)/i)?.[0]
  if (direct) return direct.replace(/\\\//g, '/')
  const iframe = html.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1]
  if (iframe) return normalizeEpisodeUrl(iframe, baseUrl)
  return ''
}

async function resolvePlayableUrl(url) {
  const raw = String(url || '').trim()
  if (!raw || raw === '#') return raw
  if (isDirectVideoUrl(raw)) return raw
  if (isYinghuaPlayPageUrl(raw)) {
    const html = await fetchYinghuaPage(raw)
    const playable = parseYinghuaPlayUrl(html, raw)
    if (!playable) throw new Error('樱花播放页未解析到真实播放地址')
    return playable
  }
  return raw
}

const NAPP03_API_CACHE_BASE = 'https://vcache.zmizr.cn'
const NAPP03_IMAGE_BASES = {
  vod1: 'https://vres.dsty29.com/vod1',
  sres: 'https://sres.dsty29.com',
}

async function fetchNapp03Api(path, query = {}) {
  const { invoke } = await import('@tauri-apps/api/core').catch(() => ({}))
  if (!invoke) throw new Error('天穹接口需要 Tauri 后端解密，当前环境不可用')
  const text = await invoke('napp03_api_fetch', { path, query, timeoutSecs: 12 })
  const json = JSON.parse(text)
  if (json?.code !== 200) throw new Error(json?.message || '天穹接口返回异常')
  return json.data || {}
}

function napp03ImageUrl(item) {
  const imagePath = item?.imagePath || item?.cover || item?.pic || ''
  if (!imagePath) return ''
  if (/^https?:\/\//i.test(imagePath)) return imagePath
  const group = item?.imageGroup || 'vod1'
  const base = NAPP03_IMAGE_BASES[group] || NAPP03_IMAGE_BASES.vod1
  return new URL(imagePath.replace(/^\//, ''), base + '/').href
}

function napp03VodId(item) {
  const url = String(item?.url || item?._detailUrl || '')
  const urlId = url.match(/vod\/(?:detail|play)\?vodId=(\d+)/i)?.[1] || url.match(/[?&]vodId=(\d+)/i)?.[1]
  if (url && !urlId) return ''
  return item?.vodId || item?.vod_id || urlId || item?.id || ''
}

function mapNapp03Vod(item) {
  const id = napp03VodId(item)
  return {
    vod_id: id,
    vod_name: item?.title || item?.name || '未命名',
    vod_pic: napp03ImageUrl(item),
    vod_remarks: item?.bottomLabel || item?.topLeftLabel || item?.channelName || '',
    type_name: item?.channelName || (Array.isArray(item?.labels) ? item.labels.map(x => x.name).filter(Boolean).slice(0, 2).join(' / ') : '天穹'),
    _detailUrl: id ? `vod/detail?vodId=${id}` : '',
    _api: NAPP03_API_CACHE_BASE,
    _srcKey: 'a_napp03',
  }
}

function mapNapp03HomeCard(item) {
  const url = String(item?.url || '')
  if (/^browser\?/i.test(url) || /^article\//i.test(url)) return null
  if (/specialTopic\/vods|vod\/timeline|netflixTopic\/vods/i.test(url)) return mapNapp03TopicCard(item)
  const vod = mapNapp03Vod(item)
  return vod.vod_id ? vod : null
}

function napp03FirstText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (value && typeof value === 'object') {
      const nested = napp03FirstText(value.title, value.name, value.text, value.label, value.value)
      if (nested) return nested
    }
  }
  return ''
}

function mapNapp03TopicCard(item) {
  const header = item?.header || item
  const url = header?.url || item?.url || ''
  const id = header?.id || header?.specialTopicId || header?.topicId || item?.id || item?.specialTopicId || item?.topicId || url
  const title = napp03FirstText(header?.title, header?.name, header?.topicName, header?.specialTopicName, header?.subjectName, header?.playlistName, header?.collectionName, header?.vodName, header?.displayName, header?.channelName, header?.label, header?.text, item?.title, item?.name, item?.topicName, item?.specialTopicName, item?.subjectName, item?.playlistName, item?.collectionName, item?.vodName, item?.displayName, item?.channelName, item?.label, item?.text)
  const summary = napp03FirstText(header?.summary, header?.subTitle, header?.subtitle, header?.desc, header?.description, item?.summary, item?.subTitle, item?.subtitle, item?.desc, item?.description)
  return {
    vod_id: id,
    vod_name: title || (id ? '专题 ' + id : '未命名专题'),
    vod_pic: napp03ImageUrl({ imagePath: header?.coverPathVertical || header?.coverPathHorizontal || header?.imagePath || item?.coverPathVertical || item?.coverPathHorizontal || item?.imagePath, imageGroup: header?.coverGroupVertical || header?.coverGroupHorizontal || header?.imageGroup || item?.coverGroupVertical || item?.coverGroupHorizontal || item?.imageGroup }),
    vod_remarks: header?.count ? (/部$/.test(String(header.count)) ? String(header.count) : String(header.count).replace(/^共?/, '共') + '部') : (item?.count || summary || '频道'),
    type_name: summary || '频道',
    _detailUrl: url || (id ? String(id) : ''),
    _libraryAction: 'napp03-url-list',
    _api: NAPP03_API_CACHE_BASE,
    _srcKey: 'a_napp03',
  }
}

function mapNapp03TopicSections(data) {
  const sections = []
  ;(Array.isArray(data?.items) ? data.items : []).forEach((block, index) => {
    const blockType = String(block?._vod || '')
    if (/^ad/i.test(blockType)) return
    const rawItems = Array.isArray(block?.data) ? block.data : []
    const list = rawItems.map(mapNapp03TopicCard).filter(item => item.vod_id && item._detailUrl)
    if (!list.length) return
    const title = block?.header?.title || block?.title || ('专题模块 ' + (index + 1))
    sections.push({ title, list, style: blockType || 'topic', url: block?.header?.url || '' })
  })
  return sections
}

function mapNapp03HomeSections(data) {
  const sections = []
  const pushSection = (title, rawItems, options = {}) => {
    if (!Array.isArray(rawItems) || !rawItems.length) return
    const list = mergeVodLists([rawItems.map(mapNapp03HomeCard).filter(Boolean).filter(item => item.vod_id && (item._detailUrl || item._libraryAction))], options.limit || 24)
    if (!list.length) return
    sections.push({ title: title || '推荐', list, style: options.style || 'grid', url: options.url || '' })
  }
  const normalizeHomeSectionTitle = (title) => (title === '推荐模块 1' || title === '推荐模块1') ? '每日推荐' : title
  pushSection('轮播推荐', data?.banners?.data || data?.banners?.items || data?.banners, { limit: 12, style: 'banner' })
  ;(Array.isArray(data?.blocks) ? data.blocks : []).forEach((block, index) => {
    const blockType = String(block?._vod || block?.type || '')
    if (/^ad/i.test(blockType)) return
    const rawTitle = block?.header?.title || block?.title || block?.name || ('推荐模块 ' + (index + 1))
    const title = normalizeHomeSectionTitle(rawTitle)
    const url = block?.header?.url || block?.url || ''
    pushSection(title, block?.data || block?.items || block?.list, { limit: 30, style: blockType || 'grid', url })
  })
  return sections
}

function mapNapp03Home(data) {
  const items = []
  const seen = new Set()
  const push = raw => {
    const mapped = mapNapp03HomeCard(raw)
    if (!mapped || !mapped.vod_id || seen.has(mapped.vod_id)) return
    seen.add(mapped.vod_id)
    items.push(mapped)
  }
  const pushMany = value => {
    if (Array.isArray(value)) value.forEach(push)
  }
  pushMany(data?.data)
  pushMany(data?.items)
  pushMany(data?.list)
  return items
}

function mapNapp03UrlListItems(data, path) {
  const sections = /categoryTopics|specialTopics|topicListView/i.test(path)
    ? (path.includes('topicListView') ? mapNapp03HomeSections(data) : mapNapp03TopicSections(data))
    : []
  if (sections.length) return sections.flatMap(section => section.list || [])
  const raw = Array.isArray(data?.items) ? data.items : (Array.isArray(data?.list) ? data.list : (Array.isArray(data?.data) ? data.data : []))
  return raw.map(item => {
    const topic = mapNapp03HomeCard(item) || mapNapp03TopicCard(item)
    if (topic?._libraryAction) return topic
    return mapNapp03Vod(item)
  }).filter(item => item?.vod_id && (item._detailUrl || item._libraryAction))
}

async function loadNapp03UrlList(rawUrl, title = '专题', cursor = '') {
  const url = String(rawUrl || '')
  const queryText = url.split('?')[1] || ''
  const params = Object.fromEntries(new URLSearchParams(queryText))
  let path = ''
  let query = {}
  const titleTopicId = String(title || '').match(/[（(](\d+)[）)]/)?.[1]
  const plainTopicId = /^\d+$/.test(url.trim()) ? url.trim() : ''
  const topicCategoryPathId = url.match(/categoryTopics\/(\d+)/i)?.[1]
  const specialTopicPathId = url.match(/specialTopic\/vods\/(\d+)/i)?.[1] || url.match(/specialTopicId[=/](\d+)/i)?.[1]
  const channelPathId = url.match(/\/channel\/(\d+)/i)?.[1] || url.match(/channelId[=/](\d+)/i)?.[1]
  if (/specialTopic\/vods/i.test(url) && (params.specialTopicId || specialTopicPathId)) {
    path = '/vod/specialTopic/vods.capi'
    query = { specialTopicId: params.specialTopicId || specialTopicPathId }
  } else if (plainTopicId || titleTopicId) {
    path = '/vod/specialTopic/vods.capi'
    query = { specialTopicId: plainTopicId || titleTopicId }
  } else if (/specialTopic\/categoryTopics|categoryTopics\.capi/i.test(url) && (params.topicCategoryId || params.categoryId || params.id || topicCategoryPathId)) {
    path = '/vod/specialTopic/categoryTopics.capi'
    query = { topicCategoryId: params.topicCategoryId || params.categoryId || params.id || topicCategoryPathId }
  } else if (/specialTopics|specialTopic\/list/i.test(url)) {
    path = '/v2/vod/specialTopics.capi'
    query = {}
  } else if (/channel\/topicListView|topicListView\.capi/i.test(url) && (params.channelId || params.id || channelPathId)) {
    path = '/v4/vod/channel/topicListView.capi'
    query = { channelId: params.channelId || params.id || channelPathId }
  } else if (/vod\/channel\/list|channel\/list\.capi|\/channel\//i.test(url) && (params.channelId || params.id || channelPathId)) {
    path = '/vod/channel/list.capi'
    query = { channelId: params.channelId || params.id || channelPathId }
  } else if (/vod\/timeline/i.test(url) && params.timelineId) {
    path = '/vod/timeline.capi'
    query = { timelineId: params.timelineId }
  } else if (/netflixTopic\/vods/i.test(url) && params.netflixTopicId) {
    path = '/vod/netflixNewWatch/vods.capi'
    query = { netflixTopicId: params.netflixTopicId }
  } else {
    throw new Error('该原站模块暂未找到可用接口：' + title + '（' + url + '）')
  }
  if (cursor) query.next = cursor
  const data = await fetchNapp03Api(path, query)
  const list = mapNapp03UrlListItems(data, path)
  return { list, total: list.length, page: 1, next: data.next || '', hasMore: Boolean(data.next), cursor: cursor || '', request: { kind: 'napp03-url-list', rawUrl, title, path }, title }
}

function mapNapp03PlaySourceEpisode(ep, epIndex, source) {
  const playUrl = ep?.m3u8Url || ep?.url || ep?.playUrl || (Array.isArray(ep?.playUrls) ? ep.playUrls.find(p => p?.url)?.url : '') || ''
  return {
    name: ep?.title || ep?.name || `第 ${epIndex + 1} 集`,
    url: playUrl,
    _episodeId: ep?.id || ep?.episodeId || '',
    _episodeVodId: ep?.episodeVodId || source?.episodeVodId || '',
    _siteId: ep?.siteId || source?.siteId || '',
    _playUrls: Array.isArray(ep?.playUrls) ? ep.playUrls : [],
  }
}

async function loadNapp03PlaySourceEpisodes(source) {
  const existing = (source?.list || []).map((ep, epIndex) => mapNapp03PlaySourceEpisode(ep, epIndex, source)).filter(ep => ep.url)
  if (existing.length || !source?.episodeVodId || !source?.siteId) return existing
  try {
    const data = await fetchNapp03Api('/v2/vod/episodes.capi', { episodeVodId: source.episodeVodId, siteId: source.siteId })
    const rows = Array.isArray(data) ? data : (Array.isArray(data?.list) ? data.list : [])
    return rows.map((ep, epIndex) => mapNapp03PlaySourceEpisode(ep, epIndex, source)).filter(ep => ep.url)
  } catch (e) {
    console.warn('[movie] 天穹线路加载失败:', source?.name || source?.siteId, e?.message || e)
    return []
  }
}

async function loadNapp03Detail(detailId, name, pic) {
  const data = await fetchNapp03Api('/vod/detail.capi', { vodId: detailId })
  const sources = Array.isArray(data.playSources) ? data.playSources : []
  const lines = (await Promise.all(sources.map(async (source, lineIndex) => {
    const eps = await loadNapp03PlaySourceEpisodes(source)
    return eps.length ? {
      name: source.name || source.siteId || `线路${lineIndex + 1}`,
      tag: source.tag || '',
      tips: source.tips || '',
      urls: eps,
      total: source.total || eps.length,
      siteId: source.siteId || '',
      episodeVodId: source.episodeVodId || '',
    } : null
  }))).filter(Boolean)
  if (!lines.length) throw new Error('天穹详情已返回，但没有可播放线路')
  return {
    vod_id: data.id || detailId,
    vod_name: data.title || name || '未命名',
    vod_pic: napp03ImageUrl(data) || pic || '',
    vod_content: data.summary || '',
    vod_play_from: lines.map(l => l.name).join('$$$'),
    vod_play_url: lines.map(l => l.urls.map(ep => `${ep.name}$${ep.url}`).join('#')).join('$$$'),
    _episodes: lines,
    _srcKey: 'a_napp03',
    _api: NAPP03_API_CACHE_BASE,
  }
}

function ip51122ImageUrl(item) {
  const imagePath = item?.imagePath || item?.cover || item?.pic || ''
  if (!imagePath) return ''
  if (/^https?:\/\//i.test(imagePath)) return fixIp51122PosterUrl(imagePath)
  const group = item?.imageGroup || 'vod1'
  const path = /^\/vod\d+\//i.test(imagePath) ? imagePath : '/' + String(group).replace(/^\/+|\/+$/g, '') + '/' + String(imagePath).replace(/^\/+/, '')
  return fixIp51122PosterUrl(path)
}

async function loadIp51122Detail(detailId, name, pic) {
  const data = await fetchNapp03Api('/vod/detail.capi', { vodId: detailId })
  const sources = Array.isArray(data.playSources) ? data.playSources : []
  const lines = (await Promise.all(sources.map(async (source, lineIndex) => {
    const eps = await loadNapp03PlaySourceEpisodes(source)
    return eps.length ? {
      name: source.name || source.siteId || `线路${lineIndex + 1}`,
      tag: source.tag || '',
      tips: source.tips || '',
      urls: eps,
      total: source.total || eps.length,
      siteId: source.siteId || '',
      episodeVodId: source.episodeVodId || '',
    } : null
  }))).filter(Boolean)
  if (!lines.length) throw new Error('云岚详情已返回，但没有可播放线路')
  return {
    vod_id: data.id || detailId,
    vod_name: data.title || name || '未命名',
    vod_pic: ip51122ImageUrl(data) || pic || '',
    vod_content: data.summary || '',
    vod_play_from: lines.map(l => l.name).join('$$$'),
    vod_play_url: lines.map(l => l.urls.map(ep => `${ep.name}$${ep.url}`).join('#')).join('$$$'),
    _episodes: lines,
    _srcKey: 'ip51122',
    _api: IP51122_LIST_BASE,
  }
}

function isDirectVideoUrl(url) {
  return /\.(m3u8|mp4|mpd)(?:[?#]|$)/i.test(String(url || ''))
}

function normalizeEpisodeUrl(url, baseUrl) {
  if (!url) return ''
  const raw = String(url).trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  try { return new URL(raw, baseUrl).href } catch { return raw }
}

function getPlayableSourceKey(source) {
  if (!source) return ''
  return source.key || source.name || ''
}

const IP51122_LIST_BASE = 'https://www.ncat21.com'
const IP51122_DETAIL_BASE = 'https://www.ncat21.com'
const IP51122_FALLBACK_BASE = 'https://43.248.100.69:51080'
const IP51122_IMAGE_BASE = 'https://vres.zyxpedu.com'
let _ip51122SearchToken = ''
let _napp03WarmupPromise = null

function isCdndefendHtml(html) {
  return /Protected by cdndefend|cdndefend_js_cookie|verifying your browser/i.test(String(html || ''))
}

function warmupNapp03Cdndefend() {
  if (typeof document === 'undefined') return Promise.resolve()
  if (_napp03WarmupPromise) return _napp03WarmupPromise
  _napp03WarmupPromise = new Promise(resolve => {
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:absolute;width:1px;height:1px;left:-9999px;top:-9999px;opacity:0;pointer-events:none;border:0'
    let done = false
    const finish = () => {
      if (done) return
      done = true
      setTimeout(() => { try { iframe.remove() } catch {} }, 1000)
      resolve()
    }
    iframe.onload = () => setTimeout(finish, 1600)
    iframe.onerror = finish
    setTimeout(finish, 6000)
    iframe.src = NAPP03_BOOT_BASE + '/'
    document.body.appendChild(iframe)
  }).finally(() => { _napp03WarmupPromise = null })
  return _napp03WarmupPromise
}

async function fetchNapp03Page(path) {
  const url = /^https?:\/\//i.test(path) ? path : new URL(path, NAPP03_BASE).href
  let result = await fetchTextWithFallback(url, {
    timeoutMs: 9000,
    proxyTimeoutMs: 5000,
    preferTauri: true,
    headers: { 'Accept': 'text/html,application/xhtml+xml' },
  })
  let html = result.text
  if (result.status === 850 || isCdndefendHtml(html)) {
    clearCachedMovieRequest('text:' + url)
    await warmupNapp03Cdndefend()
    result = await fetchTextWithFallback(url, {
      timeoutMs: 9000,
      proxyTimeoutMs: 5000,
      preferTauri: true,
      headers: { 'Accept': 'text/html,application/xhtml+xml' },
    })
    html = result.text
  }
  if (result.status === 850 || isCdndefendHtml(html)) throw new Error('ncat 实时站点 cdndefend 防护未通过，请先打开天穹启动页 ' + NAPP03_BOOT_BASE)
  return html
}

function extractNapp03Cards(html, baseUrl, limit = 60) {
  const results = []
  const seen = new Set()
  const hrefRe = /<a[^>]+href=["']([^"']*\/detail\/(\d+)\.html)["'][^>]*>[\s\S]*?<\/a>/gi
  let match
  while ((match = hrefRe.exec(html)) && results.length < limit) {
    const block = match[0]
    const context = html.slice(Math.max(0, match.index - 500), Math.min(html.length, hrefRe.lastIndex + 500))
    const href = match[1]
    const id = match[2]
    if (!id || seen.has(id)) continue
    seen.add(id)
    const detailUrl = new URL(href, baseUrl).href
    const picRaw = block.match(/data-original=["']([^"']+)["']/i)?.[1]
      || block.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1]
      || context.match(/data-original=["']([^"']+)["']/i)?.[1]
      || context.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1]
      || ''
    const titleRaw = block.match(/carousel-item-title[^>]*>([^<]+)</i)?.[1]
      || block.match(/alt=["']([^"']+)["']/i)?.[1]
      || block.match(/title=["']([^"']+)["']/i)?.[1]
      || block.match(/class=["'][^"']*(?:video|vod|item|title)[^"']*["'][^>]*>([^<]+)</i)?.[1]
      || context.match(/carousel-item-title[^>]*>([^<]+)</i)?.[1]
      || ''
    const title = decodeHtmlEntities(titleRaw.replace(/𝕜𝕜𝕪𝕤𝟘𝟙\.𝕔𝕠𝕞|kkys01\.com/ig, '').trim())
    if (!title || /placeholder|logo|网飞猫|可可影视|kekys/i.test(title)) continue
    results.push({
      vod_id: id,
      vod_name: title,
      vod_pic: picRaw ? new URL(decodeHtmlEntities(picRaw), baseUrl).href : '',
      type_name: '影视',
      _detailUrl: detailUrl,
      _api: baseUrl,
      _srcKey: 'a_napp03',
    })
  }
  return results
}

function cleanLineName(value, fallback) {
  const raw = decodeHtmlEntities(String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
  if (!raw) return fallback
  if (/movieTool\.|selectSource|^[a-z0-9_\-]{4,}$/i.test(raw) && !/[\u4e00-\u9fa5]/.test(raw)) return fallback
  return raw.replace(/[•·*★☆]+/g, '').trim() || fallback
}

function parseNapp03DetailHtml(html, baseUrl, detailId, name, pic) {
  const title = decodeHtmlEntities((
    html.match(/<div[^>]+class=["'][^"']*detail-title[^"']*["'][^>]*>[\s\S]*?<strong>(?!𝕜𝕜𝕪𝕤)([^<]+)<\/strong>/i)?.[1]
    || html.match(/<title[^>]*>([^<-]+)(?:-|<)/i)?.[1]
    || name
    || ''
  ).trim())
  const posterRaw = html.match(/<div[^>]+class=["'][^"']*detail-pic[^"']*["'][^>]*>[\s\S]*?<img[^>]+data-original=["']([^"']+)["']/i)?.[1]
    || html.match(/<div[^>]+class=["'][^"']*detail-pic[^"']*["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i)?.[1]
    || pic
    || ''
  const desc = decodeHtmlEntities((html.match(/<div[^>]+class=["'][^"']*detail-desc[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim())
  const sourceNames = [...html.matchAll(/<span[^>]+class=["'][^"']*source-item-label[^"']*["'][^>]*>([^<]+)<\/span>[\s\S]*?<span[^>]+class=["'][^"']*source-item-sublabel[^"']*["'][^>]*>([^<]*)<\/span>/gi)]
    .map((m, i) => cleanLineName(m[1] || m[2], '线路' + (i + 1)))
  const lines = []
  const lineBlocks = [...html.matchAll(/<div[^>]+class=["'][^"']*(?:episode-list|playlist|player-list|play-list|source-item)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)]
  if (lineBlocks.length) {
    lineBlocks.forEach((blockMatch, blockIndex) => {
      const urls = [...blockMatch[1].matchAll(/<a[^>]+href=["']([^"']*\/play\/[^"']+|[^"']*\/index\.php\/vod\/play\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
        .map((ep, i) => {
          const rawName = decodeHtmlEntities(ep[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
          return { name: rawName || ('集' + (i + 1)), url: normalizeEpisodeUrl(ep[1], baseUrl) }
        })
        .filter(ep => ep.url)
      if (urls.length) lines.push({ name: cleanLineName(sourceNames[blockIndex], '线路' + (blockIndex + 1)), urls })
    })
  }
  if (!lines.length) {
    const urls = [...html.matchAll(/<a[^>]+href=["']([^"']*\/play\/[^"']+|[^"']*\/index\.php\/vod\/play\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map((ep, i) => ({
        name: decodeHtmlEntities(ep[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) || ('集' + (i + 1)),
        url: normalizeEpisodeUrl(ep[1], baseUrl),
      }))
      .filter(ep => ep.url)
    if (urls.length) lines.push({ name: '默认线路', urls })
  }
  if (!lines.length) return null
  return {
    vod_id: detailId,
    vod_name: title,
    vod_pic: posterRaw ? new URL(decodeHtmlEntities(posterRaw), baseUrl).href : '',
    vod_content: desc,
    vod_play_from: lines.map(l => l.name).join('$$$'),
    vod_play_url: lines.map(l => l.urls.map(ep => `${ep.name}$${ep.url}`).join('#')).join('$$$'),
    _episodes: lines,
    _detailHtml: html,
    _srcKey: 'a_napp03',
    _api: baseUrl,
  }
}

function fixIp51122PosterUrl(url) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  let parsed
  try { parsed = new URL(raw, IP51122_FALLBACK_BASE) } catch { return raw }
  const pathname = parsed.pathname || ''
  if (!/^\/vod\d+\//i.test(pathname)) return raw
  return IP51122_IMAGE_BASE + pathname + (parsed.search || '')
}

function parseIp51122ListHtml(html, baseUrl) {
  const results = []
  const seen = new Set()
  const patterns = [
    /<a[^>]+href=["']([^"']*\/detail\/\d+\.html)["'][^>]*class=["'][^"']*(?:carousel-item|v-item|search-result-item)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi,
    /<div[^>]+class=["'][^"']*module-item[^"']*["'][^>]*>([\s\S]*?)(?=<div[^>]+class=["'][^"']*module-item|<\/section>|<\/main>)/gi,
  ]
  for (const re of patterns) {
    let match
    while ((match = re.exec(html)) && results.length < 60) {
      const block = match[2] || match[1]
      const href = match[2] ? match[1] : block.match(/href=["']([^"']*\/detail\/\d+\.html)["']/i)?.[1]
      if (!href) continue
      const id = href.match(/\/detail\/(\d+)\.html/i)?.[1] || href
      if (seen.has(id)) continue
      seen.add(id)
      const title = decodeHtmlEntities((
        block.match(/carousel-item-title[^>]*>([^<]+)/i)?.[1] ||
        block.match(/search-result-item-main[\s\S]*?<div[^>]+class=["']title["'][^>]*>([^<]+)/i)?.[1] ||
        [...block.matchAll(/v-item-title[^>]*>([^<]+)/gi)].map(m => m[1].trim()).find(v => v && !/可可影视|kekys/i.test(v)) ||
        block.match(/title=["']([^"']+)["']/i)?.[1] ||
        ''
      ).trim())
      if (!title || /可可影视|kekys/i.test(title)) continue
      const picCandidates = [
        ...[...block.matchAll(/data-original=["']([^"']+)["']/gi)].map(m => m[1]),
        ...[...block.matchAll(/src=["']([^"']+)["']/gi)].map(m => m[1]),
      ].filter(Boolean)
      const picRaw = picCandidates.findLast(pic => !/placeholder|logo_placeholder|noneCover/i.test(pic)) || picCandidates.find(Boolean) || ''
      results.push({
        vod_id: id,
        vod_name: title,
        vod_pic: picRaw ? fixIp51122PosterUrl(decodeHtmlEntities(picRaw)) : '',
        type_name: '影视',
        _detailUrl: new URL(href, baseUrl).href,
        _api: baseUrl,
        _srcKey: 'ip51122',
      })
    }
    if (results.length) break
  }
  return results
}

function parseIp51122HomeSections(html, baseUrl) {
  const sections = []
  const seenTitles = new Set()
  const re = /<div[^>]+class=["'][^"']*section-header-title[^"']*["'][^>]*>([\s\S]*?)<\/div>([\s\S]*?)(?=<div[^>]+class=["'][^"']*section-header-title|<\/body>|$)/gi
  let match
  while ((match = re.exec(html))) {
    const title = decodeHtmlEntities(String(match[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    if (!title || seenTitles.has(title) || /专题|排行|留言/.test(title)) continue
    const list = parseIp51122ListHtml(match[2] || '', baseUrl)
    if (!list.length) continue
    seenTitles.add(title)
    sections.push({ id: 'section:' + encodeURIComponent(title), name: title, title, typeId: 'section:' + title, list })
  }
  return sections
}

function parseLibraryCategoryLinks(html, baseUrl, options = {}) {
  const categories = []
  const seen = new Set()
  const add = (id, name, typeId) => {
    const cleanName = decodeHtmlEntities(String(name || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    if (!id || !cleanName || seen.has(id)) return
    if (options.exclude?.some(re => re.test(cleanName))) return
    seen.add(id)
    categories.push({ id, name: cleanName, typeId })
  }
  const patterns = options.patterns || []
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(html))) {
      const href = decodeHtmlEntities(match[1] || '')
      const text = match[2] || ''
      const idMatch = href.match(options.idRegex)
      if (!idMatch) continue
      const rawId = idMatch[1]
      add(String(options.idPrefix || '') + rawId, text, options.typeId ? options.typeId(rawId, href) : rawId)
    }
  }
  return categories
}

async function loadYinghuaCategories() {
  const html = await fetchYinghuaPage(YINGHUA_BASE + '/')
  const cats = parseLibraryCategoryLinks(html, YINGHUA_BASE, {
    idRegex: /\/index\.php\/vod\/type\/id\/(\d+)\.html/i,
    idPrefix: 'yh_',
    typeId: id => Number(id),
    exclude: [/首页|留言|排行|专题|明星|资讯|搜索/],
    patterns: [/<a[^>]+href=["']([^"']*\/index\.php\/vod\/type\/id\/\d+\.html)["'][^>]*>([\s\S]*?)<\/a>/gi],
  })
  const home = { id: 'home', name: '首页推荐', typeId: 'home' }
  const list = cats.length ? cats : YINGHUA_CATEGORIES.filter(cat => cat.id !== 'home')
  return [home, ...list.filter(cat => cat.id !== 'home')]
}

async function loadNapp03Categories() {
  const validTypeIds = new Set(['home'])
  for (const typeId of [...new Set(NAPP03_CATEGORIES.map(cat => cat.typeId))]) {
    if (typeId === 'home') continue
    try {
      const data = await fetchNapp03Api('/vod/channel/list.capi', { channelId: typeId, page: 1 })
      if ((data.items || []).length) validTypeIds.add(typeId)
    } catch {
      validTypeIds.add(typeId)
    }
  }
  const groups = NAPP03_GROUPS.map(group => ({
    ...group,
    children: group.children.filter(cat => cat.specialPath || cat.unsupported || validTypeIds.has(cat.typeId)),
  })).filter(group => group.children.length)
  return { groups, categories: groups.flatMap(group => group.children.map(cat => ({ ...cat, groupId: group.id }))) }
}

async function loadIp51122Categories() {
  const html = await fetchIp51122Page('/', IP51122_FALLBACK_BASE)
  const sections = parseIp51122HomeSections(html, IP51122_FALLBACK_BASE)
  if (sections.length) return [{ id: 'home', name: '首页推荐', typeId: 'home' }, ...sections.map(({ id, name, typeId }) => ({ id, name, typeId }))]
  const parsed = parseLibraryCategoryLinks(html, IP51122_FALLBACK_BASE, {
    idRegex: /\/channel\/([^\/.'"?#]+)(?:\.html|\/)?/i,
    idPrefix: 'ip_',
    typeId: id => id,
    exclude: [/首页|搜索|排行|专题|留言|明星/],
    patterns: [/<a[^>]+href=["']([^"']*\/channel\/[^"']+?)["'][^>]*>([\s\S]*?)<\/a>/gi],
  })
  return parsed.length ? [{ id: 'home', name: '首页推荐', typeId: 'home' }, ...parsed] : PAGE_LIBRARY_CATEGORIES
}

async function fetchIp51122Page(path, baseUrl = IP51122_FALLBACK_BASE) {
  const pathUrl = /^https?:\/\//i.test(path) ? path : new URL(path, baseUrl).href
  const urls = []
  const addUrl = candidate => { if (candidate && !urls.includes(candidate)) urls.push(candidate) }
  if (/^https:\/\/www\.ncat21\.com/i.test(pathUrl)) {
    addUrl(pathUrl.replace(/^https:\/\/www\.ncat21\.com/i, IP51122_FALLBACK_BASE))
    addUrl(pathUrl)
  } else if (/^https:\/\/43\.248\.100\.69:51080/i.test(pathUrl)) {
    addUrl(pathUrl)
  } else {
    addUrl(pathUrl)
    if (!/^https?:\/\//i.test(path)) addUrl(new URL(path, IP51122_FALLBACK_BASE).href)
  }

  let lastError = ''
  for (const targetUrl of urls) {
    try {
      const result = await fetchTextWithFallback(targetUrl, {
        timeoutMs: 18000,
        directTimeoutMs: 16000,
        proxyTimeoutMs: 5000,
        preferTauri: true,
        tauriOnly: true,
        forceRetry: true,
        headers: { 'Accept': 'text/html,application/xhtml+xml' },
        credentials: 'omit',
      })
      const html = result.text || ''
      if (html && !isCdndefendHtml(html)) return html
      lastError = '云岚实时站点 cdndefend 防护未通过: ' + targetUrl
    } catch (error) {
      lastError = error?.message || String(error)
      clearCachedMovieRequest('text:' + targetUrl)
    }
  }
  throw new Error(lastError || '云岚实时站点请求失败')
}

async function searchAiyiNapp(keyword, page = 1) {
  const target = String(keyword || '').trim()
  if (!target) return { list: [], total: 0, page, hasMore: false }
  try {
    const data = await fetchNapp03Api('/vod/search/query', { next: `page=${Math.max(1, Number(page) || 1)}`, k: target, type: 1, channelId: 0 })
    const list = (data.items || []).map(mapNapp03Vod).filter(item => item.vod_id)
    return { list, total: list.length, page, next: data.next || '', hasMore: Boolean(data.next), cursor: data.next || '' }
  } catch (error) {
    const channels = [0, 1, 2, 3, 4, 5, 6, 7]
    const found = []
    const seen = new Set()
    for (const channelId of channels) {
      let next = ''
      for (let depth = 0; depth < 8; depth++) {
        const query = { channelId }
        if (next) query.next = next
        const data = await fetchNapp03Api('/vod/channel/list.capi', query)
        for (const raw of (data.items || [])) {
          const item = mapNapp03Vod(raw)
          if (!movieNameMatches(item, target)) continue
          if (!item.vod_id || seen.has(item.vod_id)) continue
          seen.add(item.vod_id)
          found.push(item)
        }
        if (!data.next || data.next === next) break
        next = data.next
      }
    }
    return { list: found, total: found.length, page, hasMore: false, message: found.length ? '' : '天穹真实搜索接口暂未完成初始化，已降级跨频道深度检索；原始错误：' + (error?.message || '未知错误') }
  }
}

async function getIp51122SearchToken() {
  if (_ip51122SearchToken) return _ip51122SearchToken
  const html = await fetchIp51122Page('/search?k=%E4%BB%99%E9%80%86', IP51122_LIST_BASE).catch(() => '')
  const encoded = html.match(/(?:[?&]|&amp;)t=([^"'&<\s]+)/i)?.[1]
  if (encoded) {
    _ip51122SearchToken = decodeURIComponent(encoded)
    return _ip51122SearchToken
  }
  throw new Error('云岚实时搜索 token 未生成，原站脚本/防护未通过')
}

async function searchIp51122(keyword, page = 1) {
  const token = await getIp51122SearchToken()
  const path = keyword ? `/search?k=${encodeURIComponent(keyword)}&t=${encodeURIComponent(token)}` : `/?t=${encodeURIComponent(token)}`
  const html = await fetchIp51122Page(path, IP51122_FALLBACK_BASE)
  const list = parseIp51122ListHtml(html, IP51122_FALLBACK_BASE)
  return { list, total: list.length, page }
}

function mergeVodLists(lists, limit = 96) {
  const merged = []
  const seen = new Set()
  for (const list of lists) {
    for (const item of (Array.isArray(list) ? list : [])) {
      const key = String(item?.vod_id || item?._detailUrl || item?.vod_name || '').trim()
      if (!key || seen.has(key)) continue
      seen.add(key)
      merged.push(item)
      if (merged.length >= limit) return merged
    }
  }
  return merged
}

async function loadAiyiCategory(category, page = 1, filters = {}) {
  const config = typeof category === 'object' && category ? category : { typeId: category }
  if (config.unsupported) {
    return { list: [], total: 0, page, hasMore: false, message: '该子频道属于原站独立功能区，当前接口未暴露真实资源列表；为避免分类错配，暂不使用其他频道内容替代。' }
  }
  if (config.specialPath) {
    const query = { ...(config.specialQuery || {}) }
    if (filters.cursor) query.next = filters.cursor
    const data = await fetchNapp03Api(config.specialPath, query)
    if (config.resultKind === 'homeSections') {
      const sections = mapNapp03HomeSections(data)
      const list = sections.length ? mergeVodLists(sections.map(section => section.list), Number.MAX_SAFE_INTEGER) : mapNapp03Home(data)
      return { list, total: list.length, page: 1, next: data.next || '', hasMore: Boolean(data.next), cursor: filters.cursor || '' }
    }
    const sections = mapNapp03TopicSections(data)
    const list = mergeVodLists(sections.map(section => section.list), Number.MAX_SAFE_INTEGER)
    return { list, total: list.length, page: 1, next: data.next || '', hasMore: Boolean(data.next), cursor: filters.cursor || '' }
  }
  const typeId = config.typeId
  if (typeId === 'home') {
    const data = await fetchNapp03Api('/v5/vod/home.capi')
    const sections = mapNapp03HomeSections(data)
    const list = sections.length ? mergeVodLists(sections.map(section => section.list), 240) : mapNapp03Home(data)
    return { list, sections, total: list.length, page: 1, hasMore: false, aggregated: false }
  }
  const query = { channelId: Number(typeId) || 0 }
  const sort = NAPP03_SORT_VALUE[filters.sort] ?? filters.sort
  const year = NAPP03_YEAR_VALUE[filters.year] ?? filters.year
  const categoryFilter = filters.category || config.category
  if (categoryFilter) query.category = categoryFilter
  if (filters.area) query.area = filters.area
  if (year) query.year = year
  if (sort) query.sort = sort
  if (filters.cursor) query.next = filters.cursor
  const data = await fetchNapp03Api('/vod/channel/list.capi', query)
  const list = (data.items || []).map(mapNapp03Vod).filter(item => item.vod_id)
  return { list, total: list.length, page, next: data.next || '', hasMore: Boolean(data.next), cursor: filters.cursor || '' }
}

async function loadIp51122Category(typeId, page = 1) {
  if (String(typeId || '') === 'home') {
    const html = await fetchIp51122Page('/', IP51122_FALLBACK_BASE)
    const sections = parseIp51122HomeSections(html, IP51122_FALLBACK_BASE)
    const list = sections.length ? mergeVodLists(sections.map(section => section.list), 240) : parseIp51122ListHtml(html, IP51122_FALLBACK_BASE)
    return { list, sections, total: list.length, page: 1, hasMore: false, aggregated: true }
  }
  if (String(typeId || '').startsWith('section:')) {
    const sectionName = String(typeId).slice('section:'.length)
    const html = await fetchIp51122Page('/', IP51122_FALLBACK_BASE)
    const section = parseIp51122HomeSections(html, IP51122_FALLBACK_BASE).find(item => item.name === sectionName)
    const list = section?.list || []
    return { list, total: list.length, page: 1, hasMore: false, aggregated: true, message: list.length ? '该分类来自云岚首页真实分区，原站独立分类页当前返回 403。' : '该首页分区暂未解析到资源。' }
  }
  const pages = []
  let lastError = ''
  const maxPages = typeId && typeId !== 'home' ? 4 : 1
  let categoryBlocked = false
  for (let p = 1; p <= maxPages; p++) {
    const paths = typeId && typeId !== 'home'
      ? [`/channel/${encodeURIComponent(typeId)}${p > 1 ? '-' + p : ''}.html`, `/channel/${encodeURIComponent(typeId)}/page/${p}.html`, `/channel/${encodeURIComponent(typeId)}.html?pg=${p}`]
      : ['/']
    let pageList = []
    for (const path of paths) {
      const html = await fetchIp51122Page(path, IP51122_FALLBACK_BASE).catch(e => { lastError = e?.message || String(e); if (/403|850|Forbidden|防护|cdndefend/i.test(lastError)) categoryBlocked = true; return '' })
      pageList = parseIp51122ListHtml(html, IP51122_FALLBACK_BASE)
      if (pageList.length) break
    }
    if (!pageList.length) break
    pages.push(pageList)
    if (p > 1 && mergeVodLists([pages[p - 2], pageList], 120).length <= pages[p - 2].length) break
  }
  const list = mergeVodLists(pages, 120)
  if (list.length) return { list, total: list.length, page: 1, hasMore: false, aggregated: true }
  if (typeId && typeId !== 'home' && categoryBlocked) {
    const homeHtml = await fetchIp51122Page('/', IP51122_FALLBACK_BASE).catch(() => '')
    const homeList = homeHtml ? parseIp51122ListHtml(homeHtml, IP51122_FALLBACK_BASE) : []
    if (homeList.length) return { list: homeList, total: homeList.length, page: 1, hasMore: false, aggregated: true, message: '该分类页被原站防护拦截，已显示云岚首页真实推荐内容。' }
  }
  return { list: [], total: 0, page, message: lastError || '该站点实时返回为空或防护未通过，没有使用离线兜底。' }
}

async function fetchYinghuaPage(url) {
  return (await fetchTextWithFallback(url, {
    timeoutMs: 8000,
    proxyTimeoutMs: 5000,
    preferTauri: true,
    forceRetry: true,
    headers: { 'Accept': 'text/html,application/xhtml+xml' },
  })).text
}

async function searchYinghua(keyword, page = 1) {
  const q = encodeURIComponent(keyword)
  const html = await fetchYinghuaPage(`${YINGHUA_BASE}/index.php/vod/search/wd/${q}.html`)
  const list = parseYinghuaListHtml(html, YINGHUA_BASE)
  return { list, total: list.length, page }
}

async function loadYinghuaCategory(typeId, page = 1) {
  if (typeId === 'home') {
    const html = await fetchYinghuaPage(YINGHUA_BASE + '/')
    const list = parseYinghuaListHtml(html, YINGHUA_BASE)
    return { list, total: list.length, page: 1, hasMore: false, aggregated: true }
  }
  const pages = []
  for (let p = 1; p <= 4; p++) {
    const html = await fetchYinghuaPage(`${YINGHUA_BASE}/index.php/vod/type/id/${typeId}/page/${p}.html`)
    const list = parseYinghuaListHtml(html, YINGHUA_BASE)
    if (!list.length) break
    pages.push(list)
    if (!new RegExp('/page/' + (p + 1) + '\\.html|[?&]page=' + (p + 1), 'i').test(html)) break
  }
  const list = mergeVodLists(pages, 120)
  return { list, total: list.length, page: 1, hasMore: false, aggregated: true }
}

async function openYinghuaDetail(item) {
  const detailUrl = item?._detailUrl || (item?.vod_id ? `${YINGHUA_BASE}/index.php/vod/detail/id/${item.vod_id}.html` : '')
  if (!detailUrl) return null
  const html = await fetchYinghuaPage(detailUrl)
  if (/403 Forbidden|openresty|Access Denied/i.test(html)) throw new Error('源站返回 403，当前详情页不可用')
  const title = decodeHtmlEntities((html.match(/<h1[^>]*class=["'][^"']*(?:title|stui-content__detail)[^"']*["'][^>]*>([^<]+)<\/h1>/i)?.[1] || item?.vod_name || '').trim())
  const pic = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*class=["'][^"']*(?:pic|thumb|stui-content__thumb)[^"']*["']/i)?.[1] || item?.vod_pic || ''
  const desc = decodeHtmlEntities((html.match(/<div[^>]+class=["'][^"']*(?:desc|stui-content__desc)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
  const lines = extractYinghuaLines(html, YINGHUA_BASE)
  if (!lines.length) throw new Error('详情页未解析到播放列表')
  return {
    vod_id: item?.vod_id || detailUrl,
    vod_name: title || item?.vod_name || '',
    vod_pic: pic,
    vod_content: desc,
    vod_play_from: lines.map(l => l.name).join('$$$'),
    vod_play_url: lines.map(l => l.urls.map(ep => `${ep.name}$${ep.url}`).join('#')).join('$$$'),
    _episodes: lines,
    _detailUrl: detailUrl,
  }
}

const VOD_SOURCES = [
  { key: 'lzzy',   name: '量子资源', api: 'https://cj.lziapi.com/api.php/provide/vod',       type: 'tvbox' },
  { key: 'bfzy',   name: '暴风资源', api: 'https://bfzyapi.com/api.php/provide/vod',       type: 'tvbox' },
  { key: 'xsd',    name: '星之尘',  api: 'https://xsd.sdzyapi.com/api.php/provide/vod',   type: 'tvbox', default: true },
  { key: 'tyys',   name: '天涯资源', api: 'https://tyyszy.com/api.php/provide/vod',      type: 'tvbox' },
]

const TV_SOURCES = [
  { key: 'fanming', name: '📺繁星直播', api: 'https://live.fanmingming.com/live.txt' },
  { key: 'julan',   name: '📺聚浪TV',   api: 'http://julan.ml/live.txt' },
]

// ── TVBox JSON API（通过 cdn.jsdelivr.net 代理 GitHub）───────────────────────
// ── TVBox CDN 多镜像（jsdelivr 挂了时自动回退）──────────
function tvboxMirrors(url) {
  if (!url || !url.includes('cdn.jsdelivr.net')) return [url];
  // https://cdn.jsdelivr.net/gh/user/repo@branch/path → 提取 user/repo@branch 和 path
  const match = url.match(/cdn\.jsdelivr\.net\/gh\/([^@]+)\/(.+)/);
  if (!match) return [url];
  const repoPart = match[1]; // user/repo@branch
  const path = match[2];
  return [
    url,
    'https://ghproxy.com/https://raw.githubusercontent.com/' + repoPart + '/' + path,
    'https://mirror.ghproxy.com/https://raw.githubusercontent.com/' + repoPart + '/' + path,
  ].filter(Boolean);
}

const TVBOX_BUILTIN = [
  { key: 'fongmi',    name: '🌺FongMi',    url: 'https://cdn.jsdelivr.net/gh/FongMi/CatVodSpider@main/json/b.json',        note: '推荐' },
  { key: 'hjd',       name: '🌺HJD TVBox', url: 'https://cdn.jsdelivr.net/gh/hjdhnx/Dr_TVBox@main/json/api.json',          note: '' },
  { key: 'cattorn',   name: '🌺Cat TVBox', url: 'https://cdn.jsdelivr.net/gh/CatTornado/TVBox@main/json/api.json',          note: '' },
  { key: 'sunpolar',  name: '🌺SunPolar',  url: 'https://cdn.jsdelivr.net/gh/SunPolar/TVBox@main/json/api.json',            note: '' },
  { key: 'imdgo',     name: '🌺imDgo',    url: 'https://cdn.jsdelivr.net/gh/imDgo/TVBox@main/json/api.json',              note: '' },
  { key: 'q215',      name: '🌺q215 TVBox',url: 'https://cdn.jsdelivr.net/gh/q215813905/TVBox@main/json/api.json',         note: '' },
  { key: '173799616', name: '🌺173仓',     url: 'https://cdn.jsdelivr.net/gh/173799616/TVBox@master/json/api.json',        note: '' },
  { key: '7wf',       name: '🌺7尿壶',     url: 'https://cdn.jsdelivr.net/gh/7%E5%B0%BF%E5%A3%B6/TVBox@main/json/apijson.json', note: '' },
  { key: 'yyfxz',     name: '🌺业余打发',  url: 'https://cdn.jsdelivr.net/gh/yyfxz/qqtv@main/qq.json',                  note: '' },
  { key: '240584984', name: '🌺240仓',     url: 'https://cdn.jsdelivr.net/gh/240584984/TVBox@master/json/TVBox.json',      note: '' },
  { key: 'gaomingxu', name: '🌺高命续',    url: 'https://cdn.jsdelivr.net/gh/gaomingxu/TVBox@main/json.json',             note: '' },
  { key: '881014',    name: '🌺881仓',    url: 'https://cdn.jsdelivr.net/gh/881014/TVBox@main/TVBox.json',              note: '' },
  { key: 'kvymin',    name: '🌺KvyMin',   url: 'https://cdn.jsdelivr.net/gh/kvymin/TVBox@main/json/api.json',            note: '' },
  { key: 'mochi',     name: '🌺Mochi',    url: 'https://cdn.jsdelivr.net/gh/dmdql037/TVBox_Mochi@main/json/bili.json',    note: '' },
  { key: 'laoe',      name: '🌺老鹅',     url: 'https://cdn.jsdelivr.net/gh/laoe/TVBox@main/json/api.json',              note: '' },
  { key: 'wxtvbox',   name: '🌺WxtvBox',  url: 'https://cdn.jsdelivr.net/gh/s情妖/TVBox@main/json.json',                note: '' },
  { key: 'dd520',     name: '🌺DD520',    url: 'https://cdn.jsdelivr.net/gh/dd520666/TVBox@main/json/api.json',         note: '' },
  { key: 'tvcloud',   name: '🌺TVCloud', url: 'https://cdn.jsdelivr.net/gh/Guovin/TV@main/json/gq.json',              note: '' },
]
const KEY_CUSTOM_TVBOX = 'tulu_custom_tvbox'
const KEY_ACTIVE_TVBOX = 'tulu_active_tvbox'
let _tvboxCache = {}
let _customTvbox = []

function getCustomTvbox() {
  try { return JSON.parse(localStorage.getItem(KEY_CUSTOM_TVBOX) || '[]') } catch { return [] }
}
function saveCustomTvbox(a) { try { localStorage.setItem(KEY_CUSTOM_TVBOX, JSON.stringify(a)) } catch {} }
function getActiveTvboxKey() { try { return localStorage.getItem(KEY_ACTIVE_TVBOX) || '' } catch { return '' } }
function setActiveTvboxKey(k) { try { localStorage.setItem(KEY_ACTIVE_TVBOX, k) } catch {} }

// 加载 TVBox API 配置（同时支持 JSON 和 XML，自动检测格式）
// ── Wex JSON 配置加载───────────────────────────────
async function loadWexConfig(api) {
  if (_tvboxCache[api.key]) return _tvboxCache[api.key]
  try {
    const resp = await fetch(api.url, { signal: AbortSignal.timeout(15000) })
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    const text = await resp.text()
    let config
    try { config = JSON.parse(text) }
    catch { config = null }
    if (!config || !(config.list || config.urls || Array.isArray(config))) {
      console.warn('[movie-tool] Wex config invalid:', api.name)
      return null
    }
    _tvboxCache[api.key] = config
    return config
  } catch (e) { console.warn('[movie-tool] Wex load failed:', e.message); return null }
}

async function loadTvboxConfig(api) {
  if (api.type === 'wex') return loadWexConfig(api)
  if (_tvboxCache[api.key]) return _tvboxCache[api.key]

  // ── 优先：直接 fetch（Tauri WebView 无 CORS 限制）──────────
  try {
    const resp = await fetch(api.url, {
      signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
      credentials: 'include'
    })
    if (resp.ok) {
      const text = await resp.text()
      let config
      try { config = JSON.parse(text) }
      catch { config = parseXml(text) }
      if (isValidMovieConfig(config)) {
        _tvboxCache[api.key] = config
        return config
      }
    }
  } catch { /* 降级到 Tauri 后端 */ }

  // ── 降级：Tauri 后端代理（绕过 CORS）────────────────
  try {
    const { invoke } = await import('@tauri-apps/api/core').catch(() => ({}))
    if (invoke) {
      const text = await Promise.race([
        invoke('vod_fetch', { url: api.url }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('vod_fetch timeout')), 8000))
      ])
      if (text && typeof text === 'string') {
        let config
        try { config = JSON.parse(text) }
        catch { config = parseXml(text) }
        if (isValidMovieConfig(config)) {
          _tvboxCache[api.key] = config
          return config
        }
      }
    }
  } catch { /* 降级到直接 fetch */ }

  // ── 最终降级：直接 fetch（网络问题兜底）─────────────
  try {
    const resp = await fetch(api.url, { signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined })
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    const text = await resp.text()
    let config
    try { config = JSON.parse(text) }
    catch { config = parseXml(text) }
    if (!isValidMovieConfig(config)) {
      console.warn('[movie-tool] TVBox config invalid or empty:', api.name, config)
      return null
    }
    _tvboxCache[api.key] = config
    return config
  } catch (e) { console.warn('[movie-tool] TVBox load failed:', api.name, e.message); return null }
}

function isValidMovieConfig(config) {
  if (!config) return false
  if (Array.isArray(config.sites) && config.sites.length) return true
  if (Array.isArray(config.list) && config.list.length) return true
  if (config.total) return true
  return false
}

function normalizeCmsApiBase(api) {
  if (!api || typeof api !== 'string') return ''
  let base = api.trim()
  if (!/^https?:\/\//i.test(base)) return ''
  base = base.replace(/\/?$/, '')
  if (/\/api\.php\/provide\/vod\/?$/i.test(base)) return base
  if (/\/api\.php\/?$/i.test(base)) return base.replace(/\/api\.php\/?$/i, '/api.php/provide/vod')
  if (/\/provide\/vod\/?$/i.test(base)) return base
  return base
}

function getSearchableTvboxSites(config) {
  const sites = Array.isArray(config?.sites) ? config.sites : []
  return sites
    .filter(site => site && site.api && site.searchable !== 0 && (site.type === 1 || site.type === 3 || site.type == null))
    .map(site => ({ ...site, api: normalizeCmsApiBase(site.api) }))
    .filter(site => site.api)
}

// ── 解析 CMS 扁平格式（量子/暴风等 CMS API）───────────────────────────────
// CMS API: config.list 是视频数组，不是分类数组
function parseCMSList(config) {
  const result = []
  for (const v of (config?.list || [])) {
    const dl = parseTvboxDl(v)
    result.push({
      vod_id:       v.vod_id || v.id || v.player_id || '',
      vod_name:     v.vod_name || v.name || v.title || '',
      vod_pic:      v.vod_pic || v.pic || v.thumb || '',
      type_name:    v.type_name || '',
      vod_actor:    v.vod_actor || v.actor || '',
      vod_director: v.vod_director || v.director || '',
      vod_blurb:    v.vod_content || v.content || v.des || '',
      vod_year:     v.vod_year || v.year || '',
      vod_area:     v.vod_area || v.area || '',
      _dl:          dl,
      _cat:         v.type_name || '',
    })
  }
  return result
}

// ── 解析 TVBox 嵌套分类格式 ─────────────────────────────────────────────────
function parseTvboxList(config) {
  const result = []
  for (const cat of (config?.list || [])) {
    const catName = cat.name || mt('uncategorized')
    for (const v of (cat.list || [])) {
      const dl = parseTvboxDl(v)
      result.push({
        vod_id:     v.id || v.vod_id || v.player_id || '',
        vod_name:   v.name || v.title || v.vod_name || '',
        vod_pic:    v.pic || v.thumb || v.vod_pic || '',
        type_name:  catName,
        vod_actor:  v.actor || v.vod_actor || '',
        vod_director: v.director || v.vod_director || '',
        vod_blurb:  v.des || v.content || v.vod_content || v.vod_blurb || '',
        vod_year:   v.year || v.vod_year || '',
        vod_area:   v.area || v.vod_area || '',
        _dl:        dl,
        _cat:       catName,
      })
    }
  }
  return result
}

// ── 统一解析入口（自动检测格式）──────────────────────────────────────────────
function parseVideoList(config) {
  if (!config) return []
  const first = config.list?.[0]
  // TVBox 嵌套格式：第一个分类对象的 list 属性是数组
  if (first && Array.isArray(first.list)) return parseTvboxList(config)
  // CMS 扁平格式（量子/暴风等）：直接是视频数组
  return parseCMSList(config)
}

function parseTvboxDl(v) {
  const playFrom = v.vod_play_from || v.play_from || ''
  const playUrl  = v.vod_play_url  || v.play_url  || ''
  if (!playUrl) return []
  const flags   = playFrom.split('$$$')
  const urlGrps = playUrl.split('$$$')
  const result  = []
  flags.forEach((flag, fi) => {
    const urls = (urlGrps[fi] || urlGrps[0] || '').split('#').filter(Boolean)
    if (urls.length) result.push({
      flag: flag.trim() || mt('defaultLine'),
      urls: urls.map(u => { const [n, url] = u.split('$'); return (n || '') + '$' + url })
    })
  })
  return result
}

// TVBox 列表搜索
async function searchTvboxList(config, kw, api = null) {
  const q = (kw || '').toLowerCase()
  const local = parseVideoList(config).filter(v =>
    v.vod_name.toLowerCase().includes(q) ||
    (v.vod_actor && v.vod_actor.toLowerCase().includes(q))
  )
  if (local.length) return local

  const directApis = api?.api ? [{ name: api.name || mt('currentSource'), api: normalizeCmsApiBase(api.api) }] : []
  const targets = [...directApis, ...getSearchableTvboxSites(config)].filter(s => s.api).slice(0, 16)
  if (!targets.length) return []

  const merged = []
  const seen = new Set()
  for (const site of targets) {
    const urls = [
      site.api + '?ac=videolist&wd=' + encodeURIComponent(kw) + '&pg=1',
      site.api + '?ac=videolist&zm=' + encodeURIComponent(kw) + '&pg=1',
      site.api + '?ac=list&wd=' + encodeURIComponent(kw) + '&pg=1',
      site.api + '?ac=detail&wd=' + encodeURIComponent(kw),
    ]
    for (const url of urls) {
      let list = []
      try { list = parseVideoList(await fetchJSON(url)) } catch {}
      if (!list.length) { try { list = parseVideoList(await fetchJsonp(url)) } catch {} }
      if (list.length) {
        for (const item of list) {
          const key = (item.vod_id || item.vod_name || Math.random().toString()) + '|' + site.api
          if (!seen.has(key)) {
            seen.add(key)
            merged.push({ ...item, _srcName: site.name || api?.name || 'TVBox', _tvboxApi: site.api })
          }
        }
        break
      }
    }
    if (merged.length >= 80) break
  }
  return merged
}

// ── 获取当前活跃 TVBox 源（内置优先，自定义次之）
function getActiveTvbox() {
  const key = getActiveTvboxKey()
  return TVBOX_BUILTIN.find(a => a.key === key) || _customTvbox.find(a => a.key === key) || TVBOX_BUILTIN[0] || null
}

function getTvboxSourceName(api) {
  const b = TVBOX_BUILTIN.find(a => a.key === api.key)
  return b ? b.name : (api.name || mt('custom'))
}

// 初始化自定义 TVBox 列表
_customTvbox = getCustomTvbox()

// 每个 VOD 源的分类映射（CMS type_id 体系各异，必须按源区分）
// key: source key, value: { movie, tv, variety, anime, short } 对应的 type_id
const VOD_TYPE_MAP = {
  bfzy:   { movie: 20, tv: 30, variety: 27, anime: 25, short: 28 },  // 暴风资源
  xsd:    { movie: 6,  tv: 7,  variety: 16, anime: 25, short: 28 },   // 星之尘（实际typeId从6开始，非1）
  tyys:   { movie: 6,  tv: 7,  variety: 16, anime: 25, short: 28 },   // 天涯资源
}

const YINGHUA_BASE = 'https://www.yinghua289.com'
const NAPP03_BOOT_BASE = 'https://a.napp03.com'
const NAPP03_BASE = 'https://www.ncat1.app'
const YINGHUA_SOURCE_NAME = '樱境天幕片库'
const YINGHUA_ALT_NAME = '🌸樱华片库'
const A_NAPP03_SOURCE_NAME = '天穹云影片库'
const IP51122_SOURCE_NAME = '云岚星幕片库'
const YINGHUA_CATEGORIES = [
  { id: 'home', name: '首页推荐', typeId: 'home' },
  { id: 'jp_anime', name: '日本动漫', typeId: 20 },
  { id: 'cn_anime', name: '国产动漫', typeId: 21 },
  { id: 'eu_anime', name: '欧美动漫', typeId: 22 },
  { id: 'anime_movie', name: '动漫电影', typeId: 23 },
  { id: 'other_anime', name: '其他动漫', typeId: 24 },
]
const NAPP03_HOME_CATEGORIES = [
  { id: 'home_recommend', name: '推荐', typeId: 'home' },
  { id: 'home_short', name: '短剧', typeId: 6 },
  { id: 'home_movie', name: '电影', typeId: 1 },
  { id: 'home_tv', name: '剧集', typeId: 2 },
  { id: 'home_anime', name: '动漫', typeId: 3 },
  { id: 'home_variety', name: '综艺纪录', typeId: 4 },
  { id: 'home_welfare', name: '福利', typeId: 5 },
]
const NAPP03_UNSUPPORTED_CATEGORY = { unsupported: true }
const NAPP03_GROUPS = [
  { id: 'home', name: '首页', children: NAPP03_HOME_CATEGORIES },
  { id: 'discover', name: '发现', children: [
    { id: 'discover_netflix', name: 'Netflix 新片', specialPath: '/vod/netflixNewWatch.capi', resultKind: 'topicSections' },
    { id: 'discover_topics', name: '全部专题', specialPath: '/v2/vod/specialTopics.capi', resultKind: 'topicSections' },
    { id: 'discover_topic_movie', name: '大片合集', specialPath: '/vod/specialTopic/categoryTopics.capi', specialQuery: { topicCategoryId: 1 }, resultKind: 'topicSections' },
    { id: 'discover_topic_star', name: '明星', specialPath: '/vod/specialTopic/categoryTopics.capi', specialQuery: { topicCategoryId: 35 }, resultKind: 'topicSections' },
    { id: 'discover_topic_score', name: '高分点评', specialPath: '/vod/specialTopic/categoryTopics.capi', specialQuery: { topicCategoryId: 8 }, resultKind: 'topicSections' },
    { id: 'discover_channel_movie', name: '电影专题页', specialPath: '/v4/vod/channel/topicListView.capi', specialQuery: { channelId: 1 }, resultKind: 'homeSections' },
    { id: 'discover_channel_tv', name: '剧集专题页', specialPath: '/v4/vod/channel/topicListView.capi', specialQuery: { channelId: 2 }, resultKind: 'homeSections' },
  ] },
  { id: 'watch', name: '看啥片', children: [
    { id: 'watch_all', name: '全部', typeId: 0 },
    { id: 'watch_new', name: '新片', typeId: 1, sort: 'new' },
    { id: 'watch_ethics', name: '伦理', typeId: 5 },
  ] },

]
const NAPP03_CATEGORIES = NAPP03_GROUPS.flatMap(group => group.children.map(cat => ({ ...cat, groupId: group.id })))

const NAPP03_FILTERS = [
  { key: 'sort', label: '排序', values: ['综合', '最新', '最热', '评分'] },
  { key: 'category', label: '类型', values: ['伦理', '福利', '剧情', '情色', '爱情', '喜剧', '惊悚', '写真', '美女', '恐怖', '犯罪', '悬疑', '动作', '同性', '奇幻', '古装', '青春', '科幻', '文艺'] },
  { key: 'area', label: '地区', values: ['大陆', '香港', '台湾', '美国', '日本', '韩国', '英国', '法国', '德国', '印度', '泰国', '丹麦', '瑞典', '巴西', '加拿大', '俄罗斯', '意大利', '比利时', '爱尔兰', '西班牙', '澳大利亚', '其它'] },
  { key: 'year', label: '年份', values: ['2026', '2025', '2024', '2023', '2022', '2021', '2020', '10年代', '00年代', '90年代', '80年代', '更早'] },
]
const NAPP03_YEAR_VALUE = { '10年代': '2010', '00年代': '2000', '90年代': '1990', '80年代': '1980', '更早': '1970' }
const NAPP03_SORT_VALUE = { '综合': '', '最新': '最新', '最热': '最热', '评分': '评分' }

const PAGE_LIBRARY_CATEGORIES = [
  { id: 'home', name: '首页推荐', typeId: 'home' },
  { id: 'movie', name: '电影', typeId: 1 },
  { id: 'tv', name: '连续剧', typeId: 2 },
  { id: 'anime', name: '动漫', typeId: 3 },
  { id: 'variety', name: '综艺纪录', typeId: 4 },
  { id: 'short', name: '短剧', typeId: 6 },
]

const VOD_CATEGORIES = [
  { id: 'movie',   nameKey: 'categoryMovie', name: '电影' },
  { id: 'tv',      nameKey: 'categoryTv', name: '电视剧' },
  { id: 'variety', nameKey: 'categoryVariety', name: '综艺' },
  { id: 'anime',   nameKey: 'categoryAnime', name: '动漫' },
  { id: 'short',   nameKey: 'categoryShort', name: '短剧' },
]

function categoryName(category) {
  return category?.nameKey ? mt(category.nameKey) : (category?.name || mt('uncategorized'))
}

// 自适应分类缓存：{ sourceKey: [{ id: 'movie', name: '电影', typeId: 1 }, ...] }
let _catCache = {}

const HLS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js'
const KEY_SEARCH = 'tulu_vod_search'
const KEY_PLAY   = 'tulu_vod_play'
const KEY_LIBRARY_FOLLOW = 'tulu_library_follow'

let cat = 'movie'
let src = 0
let tvSrc = 0
let page = 1
let query = ''
let tvCache = {}
const _sourceHealth = {}
let _currentTypeId = null  // 当前选中分类的 typeId（自适应分类用）
let playingEp = null
let _el = null
let _viewStack = []
let _tvboxMode = false  // true = TVBox JSON 模式

// ── 历史记录 ──
function getSearchHistory() {
  try { return JSON.parse(localStorage.getItem(KEY_SEARCH) || '[]') } catch { return [] }
}
function saveSearchHistory(list) { try { localStorage.setItem(KEY_SEARCH, JSON.stringify(list)) } catch {} }
function addSearchHistory(q) {
  if (!q) return
  let h = getSearchHistory().filter(s => s !== q)
  h.unshift(q)
  saveSearchHistory(h.slice(0, 20))
}
function clearSearchHistory() { saveSearchHistory([]) }
function removeSearchHistory(q) { saveSearchHistory(getSearchHistory().filter(s => s !== q)) }

function getPlayHistory() {
  try { return JSON.parse(localStorage.getItem(KEY_PLAY) || '[]') } catch { return [] }
}
function savePlayHistory(list) { try { localStorage.setItem(KEY_PLAY, JSON.stringify(list)) } catch {} }
function upsertPlayHistory(item) {
  // 用 id + source + epName 三元组区分同一部剧的不同集数
  let h = getPlayHistory().filter(s => !(
    s.id === item.id && s.source === item.source && s.epName === item.epName
  ))
  h.unshift({ ...item, updatedAt: Date.now() })
  savePlayHistory(h.slice(0, 50))
}
function updatePlayProgress(id, source, progress, epName, duration, extra = {}) {
  const nextProgress = Number(progress) || 0
  let h = getPlayHistory()
  let idx = h.findIndex(s => s.id === id && s.source === source && (epName == null || s.epName === epName))
  if (idx >= 0) {
    const oldProgress = Number(h[idx].progress) || 0
    const shouldUpdateProgress = nextProgress === 999 || nextProgress + 2 >= oldProgress
    if (shouldUpdateProgress) h[idx].progress = nextProgress
    if (typeof duration === 'number' && duration > 0) h[idx].duration = duration
    const mergedExtra = { ...extra }
    if (Array.isArray(h[idx].allUrls) && h[idx].allUrls.length > 1 && Array.isArray(mergedExtra.allUrls) && mergedExtra.allUrls.length <= 1) delete mergedExtra.allUrls
    if (Array.isArray(h[idx].allEps) && h[idx].allEps.length > 1 && Array.isArray(mergedExtra.allEps) && mergedExtra.allEps.length <= 1) delete mergedExtra.allEps
    if (Array.isArray(h[idx].allLines) && h[idx].allLines.length > 0 && Array.isArray(mergedExtra.allLines) && mergedExtra.allLines.length <= 1) delete mergedExtra.allLines
    for (const key of ['desc','vod_content','sourceKey','api','detailId']) {
      if ((h[idx][key] || '') && !(mergedExtra[key] || '')) delete mergedExtra[key]
    }
    h[idx] = { ...h[idx], ...mergedExtra, updatedAt: Date.now() }
    const item = h.splice(idx, 1)[0]
    h.unshift(item)
  } else if (id && source) {
    h.unshift({ id, source, epName, progress: nextProgress, duration: typeof duration === 'number' ? duration : 0, ...extra, updatedAt: Date.now() })
  }
  savePlayHistory(h.slice(0, 50))
}
function getLatestProgressForEpisode(id, source, epName, epUrl) {
  const rows = getPlayHistory().filter(h =>
    (id == null || String(h.id) === String(id)) &&
    (source == null || h.source === source) &&
    (epName == null || h.epName === epName || !h.epName) &&
    (!epUrl || h.epUrl === epUrl || (Array.isArray(h.allUrls) && h.allUrls.includes(epUrl)))
  )
  let best = rows[0] || null
  for (const row of rows) {
    const p = Number(row.progress) || 0
    const bp = Number(best?.progress) || 0
    if (p > bp || Number(row.updatedAt || 0) > Number(best?.updatedAt || 0)) best = row
  }
  return best
}
function refreshProgressViews() {
  try {
    if (typeof activeLibraryView !== 'undefined' && activeLibraryView === 'history') renderLibraryHistoryList()
    else if (typeof activeLibraryView !== 'undefined' && activeLibraryView === 'follow') renderLibraryFollowList()
  } catch {}
}
function clearPlayHistory() { savePlayHistory([]) }
function removePlayHistoryItem(item) {
  if (!item) return
  savePlayHistory(getPlayHistory().filter(h => !(h.id === item.id && h.source === item.source && h.epName === item.epName && h.epUrl === item.epUrl)))
}
function fmtVodTime(seconds) {
  const value = Number(seconds) || 0
  const h = Math.floor(value / 3600)
  const m = Math.floor((value % 3600) / 60)
  const s = Math.floor(value % 60)
  return h > 0 ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') : m + ':' + String(s).padStart(2, '0')
}

function getFollowList() {
  try { return JSON.parse(localStorage.getItem(KEY_LIBRARY_FOLLOW) || '[]') } catch { return [] }
}
function saveFollowList(list) { try { localStorage.setItem(KEY_LIBRARY_FOLLOW, JSON.stringify(list)) } catch {} }
function followKey(item) { return [item?.sourceKey || item?._librarySourceKey || item?._srcKey || item?.source || '', item?.api || item?._libraryApi || item?._api || '', item?.detailId || item?.vod_id || item?._detailUrl || item?.id || item?.name || item?.vod_name || ''].join('|') }
function upsertFollow(item) {
  const key = followKey(item)
  if (!key.replace(/\|/g, '')) return
  const list = getFollowList().filter(x => followKey(x) !== key)
  list.unshift({ ...item, followKey: key, updatedAt: Date.now() })
  saveFollowList(list.slice(0, 80))
}
function removeFollowByKey(key) { saveFollowList(getFollowList().filter(x => (x.followKey || followKey(x)) !== key)) }
function isFollowed(item) { const key = followKey(item); return getFollowList().some(x => (x.followKey || followKey(x)) === key) }
function getLatestPlayForVod(item) {
  const source = item?.sourceName || item?.source || item?._librarySourceName || ''
  const id = String(item?.detailId || item?.vod_id || item?.id || '')
  const name = item?.name || item?.vod_name || ''
  return getPlayHistory().find(h => (source ? h.source === source : true) && (String(h.id) === id || h.name === name || (name && String(h.name || '').startsWith(name)))) || null
}

// ── 监听独立播放器窗口的消息（Tauri event + postMessage fallback） ──
let _playerEventUnlisten = null
async function setupPlayerEventListener() {
  if (_playerEventUnlisten) return
  try {
    const { listen } = await import('@tauri-apps/api/event').catch(() => ({}))
    if (listen) {
      _playerEventUnlisten = await listen('player-event', (e) => {
        handlePlayerMessage(e.payload)
      })
    }
  } catch(e) {}
}
function handlePlayerMessage(d) {
  if (!d || (d.type !== 'playerProgress' && d.type !== 'playerEnded')) return
  const { id, source, epName } = d.playbackCtx || {}
  if (!id || !source) return
  const extra = {
    name: d.title || d.name || epName || '未命名',
    epUrl: d.url || '',
    allUrls: d.url ? [d.url] : [],
    allEps: d.url ? [{ epName: epName || '播放', url: d.url }] : [],
    desc: d.playbackCtx?.desc || '',
    vod_content: d.playbackCtx?.desc || '',
    sourceKey: d.playbackCtx?.sourceKey || '',
    api: d.playbackCtx?.api || '',
    detailId: id,
  }
  if (d.type === 'playerProgress') {
    updatePlayProgress(id, source, Number(d.currentTime) || 0, epName, Number(d.duration) || 0, extra)
  } else if (d.type === 'playerEnded') {
    updatePlayProgress(id, source, 999, epName, Number(d.duration) || 0, extra)
  }
  refreshProgressViews()
}
// postMessage fallback（保留给 web 模式或其他不适用 Tauri event 的场景）
window.addEventListener('message', (e) => {
  const d = e.data
  if (!d || (d.type !== 'playerProgress' && d.type !== 'playerEnded')) return
  handlePlayerMessage(d)
})
// 初始化 Tauri event listener
setupPlayerEventListener()

function exportFavorites() {
  const data = getPlayHistory()
  if (!data.length) { alert(mt('favoritesEmpty')); return }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'tulu_favorites.json' })
  a.click()
}
function importFavorites() {
  const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' })
  inp.addEventListener('change', () => {
    const f = inp.files[0]; if (!f) return
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const arr = JSON.parse(e.target.result)
        if (!Array.isArray(arr)) throw new Error('not array')
        const existing = getPlayHistory()
        const merged = [...arr.reverse(), ...existing]
        const seen = new Set(); const deduped = merged.filter(s => { if (seen.has(s.id + '|' + s.source)) return false; seen.add(s.id + '|' + s.source); return true }).slice(0, 30)
        savePlayHistory(deduped)
        alert(mt('favoritesImportSuccess', { count: deduped.length }))
        loadData()
      } catch { alert(mt('favoritesImportInvalid')) }
    }
    reader.readAsText(f)
  })
  inp.click()
}

// ── 网络请求 ──
// ── XML 解析（CMS 格式影视接口）─────────────────────────────
function parseXml(raw) {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(raw, 'text/xml')
    const list = []
    // 同时支持 <item>（RSS格式）和 <video>（量子CMS格式）
    for (const item of doc.querySelectorAll('item, video')) {
      const vod = {}
      for (const child of item.children) vod[child.nodeName] = child.textContent
      if (Object.keys(vod).length) list.push(vod)
    }
    return { list, total: list.length }
  } catch { return { list: [], total: 0 } }
}

// ── 网络请求（优先 Rust 后端代理，绕过 WebView CORS 限制） ──

const MOVIE_REQUEST_CACHE = new Map()
const MOVIE_BAD_URLS = new Map()
const MOVIE_CACHE_TTL = 30000
const MOVIE_BAD_TTL = 60000

function getCachedMovieRequest(key) {
  const hit = MOVIE_REQUEST_CACHE.get(key)
  if (!hit || Date.now() - hit.time > MOVIE_CACHE_TTL) return null
  return hit.value
}
function setCachedMovieRequest(key, value) {
  MOVIE_REQUEST_CACHE.set(key, { time: Date.now(), value })
  if (MOVIE_REQUEST_CACHE.size > 120) MOVIE_REQUEST_CACHE.delete(MOVIE_REQUEST_CACHE.keys().next().value)
}
function clearCachedMovieRequest(key) { MOVIE_REQUEST_CACHE.delete(key); MOVIE_BAD_URLS.delete(key) }
function markBadMovieUrl(key) { MOVIE_BAD_URLS.set(key, Date.now() + MOVIE_BAD_TTL) }
function isBadMovieUrl(key) {
  const until = MOVIE_BAD_URLS.get(key)
  if (!until) return false
  if (Date.now() > until) { MOVIE_BAD_URLS.delete(key); return false }
  return true
}

// 优先直接 fetch，失败走 Tauri Rust 后端，再失败走 CORS 代理
async function vodApiFetch(url, signal) {
  const cacheKey = 'json:' + url
  const cached = getCachedMovieRequest(cacheKey)
  if (cached) return cached
  if (isBadMovieUrl(cacheKey)) return { list: [], total: 0 }
  // ── 方式1: Tauri Rust 后端代理（绕过 CORS，Tauri 2.x 必须走这里）────────
  try {
    const { invoke } = await import('@tauri-apps/api/core').catch(() => ({}))
    if (invoke) {
      const ctrl = new AbortController()
      const tid = setTimeout(() => ctrl.abort(), 5000) // 5秒超时，不等20秒
      const text = await Promise.race([
        invoke('vod_fetch', { url }),
        new Promise(resolve => setTimeout(() => resolve(null), 4500))
      ]).catch(e => { clearTimeout(tid); return null })
      clearTimeout(tid)
      if (text && typeof text === 'string' && text.trim()) {
        try { console.info('[vodApiFetch] Tauri后端成功:', url.slice(0, 80)); const json = JSON.parse(text); setCachedMovieRequest(cacheKey, json); return json } catch(e) { console.warn('[vodApiFetch] Tauri JSON解析失败:', e.message); return null }
      }
    } else { console.warn('[vodApiFetch] Tauri API 不可用') }
  } catch (e) { console.warn('[vodApiFetch] Tauri降级异常:', e.message) }

  // ── 方式2: CORS 代理（allorigins → corsproxy.io）───────────────────────
  const proxies = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
  ]
  for (const proxy of proxies) {
    try {
      const resp = await fetch(proxy + encodeURIComponent(url), { signal: AbortSignal.timeout ? AbortSignal.timeout(3500) : undefined })
      if (resp.ok) {
        const txt = await resp.text()
        try { console.info('[vodApiFetch] 代理成功:', proxy.slice(0, 30), url.slice(0, 50)); const json = JSON.parse(txt); setCachedMovieRequest(cacheKey, json); return json } catch(e) { console.warn('[vodApiFetch] 代理JSON解析失败:', proxy, e.message) }
      }
    } catch (e) { console.warn('[vodApiFetch] 代理异常:', proxy, e.message) }
  }

  // ── 方式3: 直接 fetch（最后兜底，5秒超时）─────────────────────────────
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(3500) : undefined })
    if (resp.ok) {
      const txt = await resp.text()
      try { console.info('[vodApiFetch] 直接fetch成功(兜底):', url.slice(0, 80)); const json = JSON.parse(txt); setCachedMovieRequest(cacheKey, json); return json } catch { return null }
    }
  } catch (e) { console.warn('[vodApiFetch] 直接fetch异常(兜底):', e.message, url.slice(0, 80)) }

  markBadMovieUrl(cacheKey)
  const empty = { list: [], total: 0 }
  setCachedMovieRequest(cacheKey, empty)
  return empty
}

async function fetchTextWithFallback(url, options = {}) {
  const timeoutMs = options.timeoutMs || 8000
  const directTimeoutMs = Math.min(timeoutMs, options.directTimeoutMs || 6000)
  const proxyTimeoutMs = Math.min(timeoutMs, options.proxyTimeoutMs || 9000)
  const headers = options.headers || { 'Accept': 'text/html,application/xhtml+xml' }
  const cacheKey = 'text:' + url
  const cached = getCachedMovieRequest(cacheKey)
  if (cached) return cached
  if (isBadMovieUrl(cacheKey) && !options.forceRetry) throw new Error('最近请求失败，暂时跳过慢源')

  if (options.preferTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core').catch(() => ({}))
      if (invoke) {
        const text = await Promise.race([
          invoke('vod_fetch', { url, timeoutSecs: Math.ceil(directTimeoutMs / 1000) }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('vod_fetch timeout')), directTimeoutMs)),
        ])
        if (text && typeof text === 'string') {
          const result = { text, status: 200, via: 'tauri' }
          setCachedMovieRequest(cacheKey, result)
          return result
        }
      }
    } catch (tauriError) {
      console.warn('[fetchTextWithFallback] Tauri 优先请求失败:', tauriError?.message || tauriError, url.slice(0, 80))
    }
  }

  if (options.tauriOnly) throw new Error('Tauri 后端请求失败，已按云岚专用链路停止浏览器/CORS 降级')

  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout ? AbortSignal.timeout(directTimeoutMs) : undefined,
      credentials: options.credentials || 'include',
      headers,
    })
    const text = await resp.text()
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    const result = { text, status: resp.status, via: 'direct' }
    setCachedMovieRequest(cacheKey, result)
    return result
  } catch (directError) {
    console.warn('[fetchTextWithFallback] 直接请求失败:', directError?.message || directError, url.slice(0, 80))
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core').catch(() => ({}))
    if (invoke) {
      const text = await Promise.race([
        invoke('vod_fetch', { url, timeoutSecs: Math.ceil(directTimeoutMs / 1000) }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('vod_fetch timeout')), directTimeoutMs)),
      ])
      if (text && typeof text === 'string') {
        const result = { text, status: 200, via: 'tauri' }
        setCachedMovieRequest(cacheKey, result)
        return result
      }
    }
  } catch (tauriError) {
    console.warn('[fetchTextWithFallback] Tauri 请求失败:', tauriError?.message || tauriError, url.slice(0, 80))
  }

  const proxies = [
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url=',
  ]
  for (const proxy of proxies) {
    try {
      const resp = await fetch(proxy + encodeURIComponent(url), {
        signal: AbortSignal.timeout ? AbortSignal.timeout(proxyTimeoutMs) : undefined,
      })
      const text = await resp.text()
      if (resp.ok) {
        const result = { text, status: resp.status, via: proxy }
        setCachedMovieRequest(cacheKey, result)
        return result
      }
    } catch (proxyError) {
      console.warn('[fetchTextWithFallback] 代理请求失败:', proxy, proxyError?.message || proxyError)
    }
  }

  markBadMovieUrl(cacheKey)
  throw new Error('Failed to fetch')
}

// 普通请求（非 JSON）
async function webFetch(url) {
  return (await fetchTextWithFallback(url, {
    timeoutMs: 8000,
    headers: { 'Accept': 'text/html,application/xhtml+xml', 'Referer': 'https://claw.qt.cool/' },
  })).text
}

// 通用 JSON 获取（自动降级）
async function fetchJSON(url, signal) {
  let json = await vodApiFetch(url, signal)
  if (json) return json
  // Rust 后端失败，降级到浏览器 fetch
  let text
  try { text = await webFetch(url) } catch { return { list: [], total: 0 } }
  try { return JSON.parse(text) } catch { try { return parseXml(text) } catch { return { list: [], total: 0 } } }
}

function movieNameMatches(item, kw) {
  const q = String(kw || '').trim().toLowerCase()
  if (!q) return true
  const name = String(item?.vod_name || item?.name || item?.title || '').toLowerCase()
  if (!name) return false
  return name.includes(q)
}

function filterSearchResults(list, kw) {
  const exact = (list || []).filter(item => movieNameMatches(item, kw))
  return exact
}

function getVodSourceBase(itemSrcKey, itemApi) {
  if (itemApi) return itemApi.replace(/\/api\.php.*$/, '')
  const key = itemSrcKey || getActiveTvboxKey() || VOD_SOURCES[0]?.key || ''
  const source = VOD_SOURCES.find(item => item.key === key) || VOD_SOURCES[0]
  return source?.api ? source.api.replace(/\/api\.php.*$/, '') : ''
}

function normalizePosterValue(url) {
  return decodeHtmlEntities(String(url || ''))
    .split(/[,$|]/)
    .map(item => item.trim())
    .find(Boolean) || ''
}

function fixPosterUrl(url, itemSrcKey, itemApi) {
  if (!url) return ''
  const raw = normalizePosterValue(url)
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('//')) return 'https:' + raw
  const base = getVodSourceBase(itemSrcKey, itemApi)
  return base ? base + (raw.startsWith('/') ? raw : '/' + raw) : raw
}

function buildPicCandidates(url, itemSrcKey, itemApi) {
  const raw = normalizePosterValue(url)
  if (!raw) return []
  const base = getVodSourceBase(itemSrcKey, itemApi)
  const direct = fixPosterUrl(raw, itemSrcKey, itemApi)
  const candidates = [direct]
  if (base && raw.startsWith('/')) candidates.push(base + raw)
  if (base && !/^https?:\/\//i.test(raw) && !raw.startsWith('//')) candidates.push(base + '/' + raw.replace(/^\/+/, ''))
  if (/^https?:\/\//i.test(raw)) {
    const strip = raw.replace(/^https?:\/\//i, '')
    candidates.push('https://images.weserv.nl/?url=' + encodeURIComponent(strip))
    candidates.push('https://proxy.this.im/image?url=' + encodeURIComponent(raw))
  }
  return [...new Set(candidates.filter(Boolean))]
}

function posterFallback(img, placeholder = '🎬') {
  if (!img) return
  const next = img.dataset.posterCands ? img.dataset.posterCands.split('||').filter(Boolean) : []
  if (next.length) {
    img.dataset.posterCands = next.slice(1).join('||')
    img.src = next[0]
    return
  }
  if (img.parentElement) img.parentElement.innerHTML = '<span class="tvbox-card-placeholder"><span class="tvbox-card-placeholder-icon">' + placeholder + '</span><span class="tvbox-card-placeholder-text">暂无封面</span></span>'
}

function renderPosterImg(url, alt, itemSrcKey, itemApi, placeholder = '🎬') {
  const candidates = buildPicCandidates(url, itemSrcKey, itemApi)
  if (!candidates.length) return '<span class="tvbox-card-placeholder"><span class="tvbox-card-placeholder-icon">' + placeholder + '</span><span class="tvbox-card-placeholder-text">暂无封面</span></span>'
  const first = candidates[0]
  return '<img src="' + escHtml(first) + '" data-poster-cands="' + escHtml(candidates.slice(1).join('||')) + '" alt="' + escHtml(alt || '') + '" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="window.__tuluPosterFallback && window.__tuluPosterFallback(this, \'' + placeholder + '\')" />'
}

function normalizeVodItem(item, source) {
  const name = item?.vod_name || item?.name || item?.title || item?.vod_title || ''
  const pic = item?.vod_pic || item?.pic || item?.thumb || item?.cover || item?.poster || item?.image || item?.img || ''
  return {
    ...item,
    vod_id: item?.vod_id || item?.id || item?.player_id || name,
    vod_name: name,
    vod_pic: pic,
    type_name: item?.type_name || item?.type || item?.class || '影视',
    vod_actor: item?.vod_actor || item?.actor || item?.stars || '',
    vod_content: item?.vod_content || item?.content || item?.desc || item?.des || item?.vod_blurb || '',
    _srcKey: item?._srcKey || source?.key || getActiveTvboxKey() || VOD_SOURCES[0]?.key || '',
    _srcName: item?._srcName || source?.name || VOD_SOURCES.find(s => s.key === getActiveTvboxKey())?.name || VOD_SOURCES[0]?.name || '',
    _api: item?._api || source?.api || '',
  }
}

if (typeof window !== 'undefined') window.__tuluPosterFallback = posterFallback


async function fetchJSONFast(url, signal) {
  const timeout = new Promise(resolve => setTimeout(() => resolve({ list: [], total: 0, _timeout: true }), 3000))
  return await Promise.race([
    fetchJSON(url, signal).catch(() => ({ list: [], total: 0 })),
    timeout,
  ])
}

// ── NZK 解析 ──
function parseNzk(raw) {
  const lines = raw.split('\n').map(l => l.replace(/\r$/, '').trim()).filter(l => l)
  const categories = []
  let currentCat = null
  for (const line of lines) {
    if (line.includes('#genre#')) {
      currentCat = { name: line.replace('#genre#', '').trim(), channels: [] }
      categories.push(currentCat)
    } else if (line.includes(',') && currentCat) {
      const idx = line.indexOf(',')
      const chName = line.slice(0, idx).trim()
      const chUrl = line.slice(idx + 1).trim()
      if (chName && chUrl && (chUrl.startsWith('http') || chUrl.startsWith('//'))) {
        currentCat.channels.push({ name: chName, url: chUrl.startsWith('//') ? 'https:' + chUrl : chUrl })
      }
    }
  }
  return categories
}

// ── M3U 转 NZK（TVAPP convertM3uToNormal 算法）──────────────────────────────
function convertM3uToNormal(m3u) {
  try {
    const lines = m3u.split('\n'), parts = []
    let currentGroup = '', TV = ''
    for (const line of lines) {
      if (line.startsWith('#EXTINF:')) {
        const g = line.split('"')[1]?.trim() || '未分类'
        TV = line.split('"')[2]?.substring(1) || ''
        if (currentGroup !== g) { currentGroup = g; parts.push('\n' + currentGroup + ',#genre#\n') }
      } else if (line.startsWith('http')) {
        parts.push(TV + '\,' + line.split(',')[0] + '\n')
      }
    }
    return parts.join('').trim()
  } catch (e) { return m3u }
}

// ── 自动检测格式加载 TV 源 ──────────────────────────────────────────────────
async function loadTvSource(idx) {
  if (tvCache[idx]) return tvCache[idx]
  try {
    const text = await fetch(TV_SOURCES[idx].api, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.text())
    const isM3u = text.includes('#EXTM3U') || text.includes('group-title')
    tvCache[idx] = isM3u ? parseNzk(convertM3uToNormal(text)) : parseNzk(text)
  } catch (e) { tvCache[idx] = [] }
  return tvCache[idx]
}

/**
 * 渲染入口 — 接收路由容器，将自身挂载到容器内
 * 不再直接 appendChild(document.body)，避免被路由的 innerHTML='' 清除
 */
const MISSAV_BASE = 'https://missav.live'
const MISSAV_BASES = [MISSAV_BASE]
let MISSAV_ACTIVE_BASE = MISSAV_BASE
const MISSAV_CATEGORIES = [
  { id: '/', name: '首页', desc: '默认展示最近更新', path: '/dm539/new' },
  { id: '/dm278/chinese-subtitle', name: '中文字幕', desc: '中文字幕内容', path: '/dm278/chinese-subtitle' },
  { id: '/dm539/new', name: '最近更新', desc: '觀看日本 AV / 最近更新', path: '/dm539/new' },
  { id: '/dm634/release', name: '新作上市', desc: '觀看日本 AV / 新作上市', path: '/dm634/release' },
  { id: '/dm817/uncensored-leak', name: '無碼流出', desc: '觀看日本 AV / 無碼流出', path: '/dm817/uncensored-leak' },
  { id: '/actresses', name: '女優一覽', desc: '觀看日本 AV / 女優索引', path: '/actresses' },
  { id: '/actresses/ranking', name: '女優排行', desc: '觀看日本 AV / 排行', path: '/actresses/ranking' },
  { id: '/genres', name: '類型', desc: '觀看日本 AV / 類型標籤', path: '/genres' },
  { id: '/makers', name: '發行商', desc: '觀看日本 AV / 發行商', path: '/makers' },
  { id: '/genres/VR', name: 'VR', desc: '觀看日本 AV / VR', path: '/genres/VR' },
  { id: '/dm298/today-hot', name: '今日熱門', desc: '觀看日本 AV / 今日熱門', path: '/dm298/today-hot' },
  { id: '/dm170/weekly-hot', name: '本週熱門', desc: '觀看日本 AV / 本週熱門', path: '/dm170/weekly-hot' },
  { id: '/dm270/monthly-hot', name: '本月熱門', desc: '觀看日本 AV / 本月熱門', path: '/dm270/monthly-hot' },
  { id: '/dm36/siro', name: 'SIRO', desc: '素人', path: '/dm36/siro' },
  { id: '/dm34/luxu', name: 'LUXU', desc: '素人', path: '/dm34/luxu' },
  { id: '/dm34/gana', name: 'GANA', desc: '素人', path: '/dm34/gana' },
  { id: '/dm1002/maan', name: 'PRESTIGE PREMIUM', desc: '素人', path: '/dm1002/maan' },
  { id: '/dm38/scute', name: 'S-CUTE', desc: '素人', path: '/dm38/scute' },
  { id: '/dm34/ara', name: 'ARA', desc: '素人', path: '/dm34/ara' },
  { id: '/dm541/fc2', name: 'FC2', desc: '無碼影片', path: '/dm541/fc2' },
  { id: '/dm2097925/heyzo', name: 'HEYZO', desc: '無碼影片', path: '/dm2097925/heyzo' },
  { id: '/dm42/tokyohot', name: '東京熱', desc: '無碼影片', path: '/dm42/tokyohot' },
  { id: '/dm4835360/1pondo', name: '一本道', desc: '無碼影片', path: '/dm4835360/1pondo' },
  { id: '/dm7502171/caribbeancom', name: 'Caribbeancom', desc: '無碼影片', path: '/dm7502171/caribbeancom' },
  { id: '/dm88271/caribbeancompr', name: 'Caribbeancompr', desc: '無碼影片', path: '/dm88271/caribbeancompr' },
  { id: '/dm6794110/10musume', name: '10musume', desc: '無碼影片', path: '/dm6794110/10musume' },
  { id: '/dm2626775/pacopacomama', name: 'pacopacomama', desc: '無碼影片', path: '/dm2626775/pacopacomama' },
  { id: '/dm150/gachinco', name: 'Gachinco', desc: '無碼影片', path: '/dm150/gachinco' },
  { id: '/dm42/xxxav', name: 'XXX-AV', desc: '無碼影片', path: '/dm42/xxxav' },
  { id: '/dm37/marriedslash', name: '人妻斬', desc: '無碼影片', path: '/dm37/marriedslash' },
  { id: '/dm33/naughty4610', name: '頑皮 4610', desc: '無碼影片', path: '/dm33/naughty4610' },
  { id: '/dm37/naughty0930', name: '頑皮 0930', desc: '無碼影片', path: '/dm37/naughty0930' },
  { id: '/dm63/madou', name: '麻豆傳媒', desc: '亞洲 AV', path: '/dm63/madou' },
  { id: '/dm31/twav', name: 'TWAV', desc: '亞洲 AV', path: '/dm31/twav' },
  { id: '/dm15/furuke', name: 'Furuke', desc: '亞洲 AV', path: '/dm15/furuke' },
  { id: '/klive', name: '韓國直播', desc: '亞洲 AV', path: '/klive' },
  { id: '/clive', name: '中國直播', desc: '亞洲 AV', path: '/clive' },
  { id: '/saved', name: '我的影片收藏', desc: '我的收藏 / 需登入', path: '/saved' },
  { id: '/playlists', name: '我的片單', desc: '我的收藏 / 需登入', path: '/playlists' },
  { id: '/saved/actresses', name: '我的女優收藏', desc: '我的收藏 / 需登入', path: '/saved/actresses' },
  { id: '/history', name: '觀看記錄', desc: '我的收藏 / 需登入', path: '/history' },
  { id: 'https://mycomic.com/', name: '無廣告免費漫畫', desc: '更多好站 / 外部', path: 'https://mycomic.com/', external: true },
  { id: 'https://zh.myavlive.com/girls/chinese', name: '色色主播', desc: '更多好站 / 外部', path: 'https://zh.myavlive.com/girls/chinese', external: true },
]
const MISSAV_LOCAL_TRANSLATE = {
  Home: '首页', New: '最新', Trending: '热门', Categories: '分类', Genres: '类型', Tags: '标签',
  Actresses: '演员', Makers: '厂商', Search: '搜索', Today: '今天', 'This week': '本周', 'This month': '本月',
  'Chinese subtitle': '中文字幕', Uncensored: '无码', Subtitles: '字幕', Featured: '推荐', Popular: '热门', Latest: '最新',
}

const MYAVLIVE_BASE = 'https://zh.myavlive.com'
const MYAVLIVE_FRONT_VERSION = '11.8.27'
const MYAVLIVE_CATEGORIES = [
  { id: 'girls', name: '女主播', primaryTag: 'girls' },
  { id: 'girls/recommended', name: '推荐', primaryTag: 'girls', filter: item => item.isRecommended },
  { id: 'girls/new', name: '新主播', primaryTag: 'girls', filter: item => item.isNew },
  { id: 'girls/hd', name: '高清', primaryTag: 'girls', filter: item => item.isHd },
  { id: 'girls/vr', name: 'VR 摄像头', primaryTag: 'girls', filter: item => item.isVr },
  { id: 'girls/mobile', name: '移动直播', primaryTag: 'girls', filter: item => item.isMobile },
  { id: 'girls/interactive-toys', name: '互动玩具', primaryTag: 'girls', filter: item => item.isLovense || item.isKiiroo },
  { id: 'girls/chinese', name: '中文主播', primaryTag: 'girls', filter: item => String(item.country || '').toLowerCase() === 'cn' },
  { id: 'girls/korean', name: '韩语', primaryTag: 'girls', filter: item => String(item.country || '').toLowerCase() === 'kr' },
  { id: 'girls/ukrainian', name: '乌克兰女主播', primaryTag: 'girls', filter: item => String(item.country || '').toLowerCase() === 'ua' },
  { id: 'girls/asian', name: '亚洲人', primaryTag: 'girls' },
  { id: 'girls/teens', name: '少女 18+', primaryTag: 'girls' },
  { id: 'girls/young', name: '鲜嫩青年 22+', primaryTag: 'girls' },
  { id: 'girls/milfs', name: '熟女', primaryTag: 'girls' },
  { id: 'girls/mature', name: '成熟', primaryTag: 'girls' },
  { id: 'girls/ebony', name: '黑珍珠', primaryTag: 'girls' },
  { id: 'girls/latin', name: '拉丁人', primaryTag: 'girls' },
  { id: 'girls/white', name: '白人', primaryTag: 'girls' },
  { id: 'girls/petite', name: '娇小', primaryTag: 'girls' },
  { id: 'girls/athletic', name: '运动型', primaryTag: 'girls' },
  { id: 'girls/curvy', name: '曲线', primaryTag: 'girls' },
  { id: 'girls/bbw', name: '大号美女', primaryTag: 'girls' },
  { id: 'girls/blondes', name: '金发', primaryTag: 'girls' },
  { id: 'girls/black-hair', name: '黑发', primaryTag: 'girls' },
  { id: 'girls/brunettes', name: '棕发', primaryTag: 'girls' },
  { id: 'girls/redheads', name: '红发', primaryTag: 'girls' },
  { id: 'girls/group-sex', name: '群交', primaryTag: 'girls', filter: item => /group/i.test(item.gender || item.broadcastGender || '') },
  { id: 'couples', name: '情侣', primaryTag: 'couples' },
  { id: 'men', name: '男主播', primaryTag: 'men' },
  { id: 'trans', name: '跨性别', primaryTag: 'trans' },
]

function missavUrl(path = '/', base = MISSAV_ACTIVE_BASE) {
  const raw = String(path || '/').trim() || '/'
  const activeBase = String(base || MISSAV_ACTIVE_BASE || MISSAV_BASES[0]).replace(/\/+$/, '')
  if (/^https?:\/\//i.test(raw)) {
    try {
      const allowed = new Set(MISSAV_BASES.map(item => new URL(item).origin))
      const next = new URL(raw)
      return allowed.has(next.origin) ? next.href : ''
    } catch { return '' }
  }
  return activeBase + '/' + raw.replace(/^\/+/, '')
}

function translateMissavLocal(text) {
  let out = String(text || '')
  for (const [from, to] of Object.entries(MISSAV_LOCAL_TRANSLATE)) out = out.replace(new RegExp('\\b' + from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), to)
  return out
}

function myAvLiveUrl(path = '/', query = {}) {
  const url = new URL(String(path || '/'), MYAVLIVE_BASE)
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  })
  return url.href
}

function myAvLivePlayableUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const streamId = (raw.match(/\/hls\/([^/]+)/i) || [])[1] || (raw.match(/\/([0-9]+)(?:_\d+p)?\.m3u8/i) || [])[1]
  if (streamId && /\/master\/[^/?#]+_\d+p\.m3u8/i.test(raw)) {
    return raw.replace(/\/master\/[^/?#]+_\d+p\.m3u8/i, '/master/' + streamId + '.m3u8')
  }
  return raw
}

function myAvLivePreviewUrl(model) {
  const direct = model?.previewUrl || model?.previewUrlThumbBig
  if (direct) return normalizeMyAvLiveImage(direct)
  const small = String(model?.previewUrlThumbSmall || '').trim()
  if (small) return normalizeMyAvLiveImage(small.replace('-thumb-small', '-thumb-big'))
  return ''
}

function myAvLiveNoCacheUrl(url) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    parsed.searchParams.set('_live_ts', String(Date.now()))
    return parsed.href
  } catch {
    return raw
  }
}

function myAvLiveStreamUrl(model) {
  const direct = String(model?.hlsPlaylist || '').trim()
  if (direct) return direct
  const streamName = String(model?.streamName || model?.id || '').trim()
  return streamName ? 'https://edge-hls.doppiocdn.com/hls/' + encodeURIComponent(streamName) + '/master/' + encodeURIComponent(streamName) + '_240p.m3u8' : ''
}

function normalizeMyAvLiveImage(url) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  try { return new URL(raw, MYAVLIVE_BASE).href } catch { return raw }
}

async function fetchMyAvLiveText(url, options = {}) {
  const requestUrl = String(url || '').trim()
  if (!requestUrl) return ''
  const { invoke } = await import('@tauri-apps/api/core').catch(() => ({}))
  if (invoke) return await invoke('vod_fetch', { url: requestUrl, timeoutSecs: options.timeoutSecs || 18 })
  const resp = await fetch(requestUrl, { cache: 'no-store' })
  if (!resp.ok) throw new Error('MyAvLive HTTP ' + resp.status)
  return await resp.text()
}

async function validateMyAvLiveLiveUrl(url) {
  const masterText = await fetchMyAvLiveText(url, { timeoutSecs: 18 })
  if (/EXT-X-MOUFLON/i.test(masterText)) {
    const mediaUrl = masterText.split(/\r?\n/).map(line => line.trim()).find(line => /^https?:\/\//i.test(line))
    if (mediaUrl) {
      const mediaText = await fetchMyAvLiveText(mediaUrl, { timeoutSecs: 18 })
      if (/EXT-X-MOUFLON-ADVERT|\/cpa\/v\d+\//i.test(mediaText)) {
        return url
      }
      if (/EXT-X-PLAYLIST-TYPE:VOD/i.test(mediaText) && /EXT-X-ENDLIST/i.test(mediaText)) {
        throw new Error('当前地址返回 VOD 片段，不是实时直播链。')
      }
    }
  }
  return url
}

async function fetchMyAvLiveApi(path, query = {}, options = {}) {
  const requestUrl = myAvLiveUrl(path, query)
  const fetchUrl = options.noCache === false ? requestUrl : requestUrl + (requestUrl.includes('?') ? '&' : '?') + '_ts=' + Date.now()
  const { invoke } = await import('@tauri-apps/api/core').catch(() => ({}))
  let text = ''
  if (invoke) {
    text = await invoke('vod_fetch', { url: fetchUrl, timeoutSecs: options.timeoutSecs || 25 })
  } else {
    const resp = await fetch(fetchUrl, {
      headers: {
        Accept: 'application/json',
        'Front-Version': MYAVLIVE_FRONT_VERSION,
      },
      cache: 'no-store',
    })
    if (!resp.ok) throw new Error('MyAvLive HTTP ' + resp.status)
    text = await resp.text()
  }
  const json = JSON.parse(text)
  return json
}

function normalizeMyAvLiveModel(model) {
  const username = String(model?.username || model?.displayName || model?.name || '').trim()
  const streamName = String(model?.streamName || model?.id || '').trim()
  return {
    id: String(model?.id || streamName || username),
    username,
    title: username || ('直播间 ' + (streamName || '')),
    status: String(model?.status || ''),
    streamName,
    hlsPlaylist: String(model?.hlsPlaylist || ''),
    viewers: Number(model?.viewersCount || model?.viewers || 0) || 0,
    avatar: normalizeMyAvLiveImage(model?.avatarUrl),
    preview: myAvLivePreviewUrl(model),
    country: String(model?.country || ''),
    primaryTag: String(model?.primaryTag || model?.genderGroup || ''),
    gender: String(model?.gender || ''),
    broadcastGender: String(model?.broadcastGender || ''),
    isHd: !!model?.isHd,
    isVr: !!model?.isVr,
    isNew: !!model?.isNew,
    isMobile: !!model?.isMobile,
    isRecommended: !!model?.isRecommended,
    isLovense: !!model?.isLovense,
    isKiiroo: !!model?.isKiiroo,
    presets: Array.isArray(model?.presets) ? model.presets.map(x => String(x || '').trim()).filter(Boolean) : [],
    presets265: Array.isArray(model?.presets265) ? model.presets265.map(x => String(x || '').trim()).filter(Boolean) : [],
    presetsAv1: Array.isArray(model?.presetsAv1) ? model.presetsAv1.map(x => String(x || '').trim()).filter(Boolean) : [],
    tags: Array.isArray(model?.tags) ? model.tags.slice(0, 6).map(x => String(x?.name || x || '').trim()).filter(Boolean) : [],
    raw: model,
  }
}

async function fetchMyAvLiveModels(category, search = '') {
  const q = String(search || '').trim()
  const primaryTag = category?.primaryTag || 'girls'
  const pageSize = 96
  const maxPages = 5
  const pages = []
  for (let page = 0; page < maxPages; page++) {
    const baseQuery = { primaryTag, limit: pageSize, offset: page * pageSize }
    if (q) baseQuery.search = q
    const data = await fetchMyAvLiveApi('/api/front/models', baseQuery, { timeoutSecs: 25 })
    const rows = Array.isArray(data?.models) ? data.models : []
    pages.push(...rows)
    if (rows.length < pageSize) break
  }
  const seen = new Set()
  let models = pages
    .map(item => normalizeMyAvLiveModel({ ...item, primaryTag }))
    .filter(item => {
      const key = item.streamName || item.username || item.id
      if (!item.username || item.status !== 'public' || seen.has(key)) return false
      seen.add(key)
      return true
    })
  if (typeof category?.filter === 'function') models = models.filter(category.filter)
  return q ? models.filter(item => (item.username + ' ' + item.title + ' ' + item.tags.join(' ')).toLowerCase().includes(q.toLowerCase())) : models
}

async function resolveMyAvLiveLiveUrl(model) {
  const username = String(model?.username || '').trim()
  const streamName = String(model?.streamName || model?.id || '').trim()
  const primaryTags = [...new Set([String(model?.primaryTag || '').trim(), 'girls', 'couples', 'men', 'trans'].filter(Boolean))]
  let latest = null
  for (const primaryTag of primaryTags) {
    for (const offset of [0, 48, 96]) {
      const data = await fetchMyAvLiveApi('/api/front/models', { primaryTag, limit: 48, offset }, { timeoutSecs: 25 })
      const models = Array.isArray(data?.models) ? data.models : []
      latest = models
        .map(item => normalizeMyAvLiveModel({ ...item, primaryTag }))
        .find(item => (username && item.username.toLowerCase() === username.toLowerCase()) || (streamName && item.streamName === streamName))
      if (latest || models.length < 48) break
    }
    if (latest) break
  }
  const live = latest || model
  if (String(live?.status || '') !== 'public') {
    throw new Error('当前主播不是公开直播状态，已阻止播放广告/付费预热视频。请刷新列表选择公开直播主播。')
  }
  const directUrl = myAvLiveStreamUrl(live)
  if (!directUrl) throw new Error('未解析到实时直播 m3u8 地址')
  await validateMyAvLiveLiveUrl(directUrl)
  return { ...live, directUrl, playableUrl: myAvLivePlayableUrl(directUrl) }
}

function privateChannelName(name, path = '') {
  const raw = translateMissavLocal(String(name || '').replace(/[-_]+/g, ' ').trim())
  const normalized = raw || String(path || '').split('/').filter(Boolean).pop() || '频道'
  const key = normalized.toLowerCase()
  const pathText = String(path || '').toLowerCase()
  const brandMap = {
    siro: '素人 · SIRO', luxu: '素人 · LUXU', gana: '素人 · GANA', maan: '素人 · PRESTIGE', scute: '素人 · S-CUTE', ara: '素人 · ARA',
    fc2: '无码 · FC2', heyzo: '无码 · HEYZO', tokyohot: '无码 · 东京热', '1pondo': '无码 · 一本道', caribbeancom: '无码 · 加勒比', caribbeancompr: '无码 · 加勒比精选',
    '10musume': '无码 · 一本道系', pacopacomama: '无码 · 人妻系', gachinco: '无码 · Gachinco', xxxav: '无码 · XXX-AV', marriedslash: '无码 · 人妻斩', naughty4610: '无码 · 顽皮4610', naughty0930: '无码 · 顽皮0930',
    madou: '亚洲 · 麻豆传媒', twav: '亚洲 · TWAV', furuke: '亚洲 · Furuke',
  }
  for (const [slug, label] of Object.entries(brandMap)) {
    if (pathText.includes('/' + slug) || key === slug) return label
  }
  const map = {
    'new': '最近更新', 'today hot': '今日热门', 'weekly hot': '本周热门', 'monthly hot': '本月热门',
    'release': '新作上市', 'chinese subtitle': '中文字幕', 'uncensored leak': '无码流出',
    'genres': '类型', 'makers': '发行商', 'actresses': '演员', 'ranking': '排行榜', 'vr': 'VR专区',
    '女優一覽': '演员一览', '女優排行': '演员排行', '類型': '类型', '發行商': '发行商', '無碼流出': '无码流出', '今日熱門': '今日热门', '本週熱門': '本周热门', '本月熱門': '本月热门',
  }
  return map[key] || map[normalized] || normalized
}


function isCloudflareBlockHtml(html) {
  return /Just a moment|cf-browser-verification|challenge-platform|cloudflare/i.test(String(html || ''))
}

function parseMissavCards(html, baseUrl = MISSAV_ACTIVE_BASE) {
  const list = []
  const seen = new Set()
  const pushCard = (href, title, pic, meta = '精选') => {
    if (!href || /javascript:|#|ads|banner|login|signup|\/vip|\/saved|\/playlists|\/history|\/genres|\/makers|\/actresses|\/dm\d+\//i.test(href)) return
    let url = ''
    try { url = new URL(href, baseUrl).href } catch { return }
    if (!MISSAV_BASES.some(base => new URL(url).origin === new URL(base).origin)) return
    const pathname = new URL(url).pathname.replace(/^\/+|\/+$/g, '')
    if (!pathname || !/^[a-z0-9]+-[a-z0-9-]+$/i.test(pathname)) return
    const cleanTitle = decodeHtmlEntities(String(title || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    if (!cleanTitle || cleanTitle.length < 2) return
    const key = url.replace(/[?#].*$/, '')
    if (seen.has(key)) return
    seen.add(key)
    let poster = ''
    try { poster = pic ? new URL(pic, baseUrl).href : '' } catch { poster = pic || '' }
    list.push({ vod_id: key, vod_name: translateMissavLocal(cleanTitle), vod_pic: poster, type_name: meta || '精选', vod_content: cleanTitle, _missavUrl: url })
  }

  const cards = String(html || '').match(/<div\b[^>]*class=["'][^"']*thumbnail[^"']*group[^"']*["'][\s\S]*?(?=<div\b[^>]*class=["'][^"']*thumbnail[^"']*group|<nav\b|<footer\b|$)/gi) || []
  for (const card of cards) {
    if (list.length >= 48) break
    const href = card.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] || ''
    const img = card.match(/<img\b[\s\S]*?(?:data-src|src)=["']([^"']+)["'][\s\S]*?>/i)?.[1] || ''
    const title = card.match(/<div\b[^>]*class=["'][^"']*truncate[^"']*["'][\s\S]*?<a\b[\s\S]*?>([\s\S]*?)<\/a>/i)?.[1]
      || card.match(/<img\b[\s\S]*?alt=["']([^"']+)["']/i)?.[1]
      || card.match(/<a\b[^>]*alt=["']([^"']+)["']/i)?.[1]
      || ''
    const duration = card.match(/<span\b[^>]*>(\s*\d{1,2}:\d{2}(?::\d{2})?\s*)<\/span>/i)?.[1]?.trim() || ''
    pushCard(href, title, img, duration)
  }
  if (list.length) return list

  const blocks = String(html || '').match(/<a\b[\s\S]*?<\/a>/gi) || []
  for (const block of blocks) {
    if (list.length >= 48) break
    const href = block.match(/href=["']([^"']+)["']/i)?.[1] || ''
    const img = block.match(/(?:data-src|data-original|src)=["']([^"']+)\.(?:jpg|jpeg|png|webp)(?:[^"']*)["']/i)?.[0]?.match(/=["']([^"']+)["']/)?.[1] || ''
    if (!img) continue
    const title = block.match(/title=["']([^"']+)["']/i)?.[1] || block.match(/alt=["']([^"']+)["']/i)?.[1] || block.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')
    pushCard(href, title, img)
  }
  return list
}

function isMissavUnavailableHtml(html) {
  const text = String(html || '')
  return isCloudflareBlockHtml(text) || /avdaisukicp|kaizoku|page-feature|JAV Anti-Piracy Project|ThisAV - 世界最高/i.test(text)
}

async function fetchMissavApi(path, query = {}) {
  const { invoke } = await import('@tauri-apps/api/core').catch(() => ({}))
  if (!invoke) throw new Error('当前环境暂不支持该片库')
  const text = await invoke('missav_api_fetch', { path, query, timeoutSecs: 35 })
  const json = JSON.parse(text)
  if (json?.code !== 200) throw new Error(json?.message || '片库返回异常')
  return { data: json.data || {}, source: json.source || MISSAV_BASE }
}

async function fetchMissavPage(path, options = {}) {
  const requestPath = /^https?:\/\//i.test(String(path || '')) ? new URL(missavUrl(path)).pathname + (new URL(missavUrl(path)).search || '') : (path || '/')
  const { data, source } = await fetchMissavApi(requestPath)
  let rawList = Array.isArray(data.list) ? data.list : []
  const shouldMergePages = options.mergePages !== false && !/[?&]page=\d+/i.test(requestPath) && rawList.length > 0
  if (shouldMergePages) {
    const preloadCount = Math.max(1, Math.min(8, Number(options.preloadPages || 6)))
    const explicitPages = Array.isArray(data.pages) ? data.pages.filter(p => /[?&]page=\d+/i.test(p.path || '')).slice(0, preloadCount - 1) : []
    const pageLinks = explicitPages.length ? explicitPages : Array.from({ length: preloadCount - 1 }, (_, idx) => ({ path: requestPath + (requestPath.includes('?') ? '&' : '?') + 'page=' + (idx + 2) }))
    const seenIds = new Set(rawList.map(item => item.detail_url || item.vod_id || item.vod_name).filter(Boolean))
    for (const page of pageLinks) {
      try {
        const next = await fetchMissavApi(page.path)
        if (Array.isArray(next.data?.list)) {
          for (const item of next.data.list) {
            const key = item.detail_url || item.vod_id || item.vod_name
            if (!key || seenIds.has(key)) continue
            seenIds.add(key)
            rawList.push(item)
          }
        }
      } catch (err) {
        console.warn('[private-library] 分页预加载失败:', err?.message || err)
      }
    }
  }
  const items = rawList.map(item => ({
    vod_id: item.vod_id || item.detail_url || item.vod_name,
    vod_name: translateMissavLocal(item.vod_name || '未命名'),
    vod_pic: item.vod_pic || '',
    type_name: item.type_name || item.vod_remarks || '精选',
    vod_content: item.vod_content || item.vod_name || '',
    _missavUrl: item.detail_url || '',
  })).filter(item => item.vod_id && item._missavUrl)
  const categories = Array.isArray(data.categories) ? data.categories.map(item => ({
    name: translateMissavLocal(item.name || ''),
    path: item.path || '',
    url: item.url || '',
  })).filter(item => item.name && item.path) : []
  const pages = Array.isArray(data.pages) ? data.pages.map(item => ({
    name: translateMissavLocal(item.name || ''),
    path: item.path || '',
    url: item.url || '',
  })).filter(item => item.name && item.path) : []
  const channels = Array.isArray(data.channels) ? data.channels.map(item => ({
    name: translateMissavLocal(item.name || ''),
    path: item.path || '',
    url: item.url || '',
  })).filter(item => item.name && item.path) : []
  if (!items.length && !categories.length && !pages.length && !channels.length) throw new Error('当前频道没有可显示内容')
  MISSAV_ACTIVE_BASE = MISSAV_BASE
  return { text: '', status: 200, via: '内部片库', url: source, items, categories, channels, pages, menu: [], title: '' }
}

async function fetchMissavDetail(url) {
  const requestPath = /^https?:\/\//i.test(String(url || '')) ? new URL(missavUrl(url)).pathname : (url || '/')
  const { data, source } = await fetchMissavApi(requestPath)
  const playUrls = Array.isArray(data.play_urls) ? data.play_urls.map((item, index) => ({
    name: item.name || ('线路 ' + (index + 1)),
    url: item.url || '',
  })).filter(item => item.url) : []
  return { playUrls, source }
}

export default function render(container) {
  // 如果传入了容器（路由环境），渲染到容器内；否则降级到 body
  const root = container || document.body
  const el = document.createElement('div')
  el.className = 'tvbox-root'
  _el = el
  _viewStack = []
  root.appendChild(el)
  // 全局调试状态
  window._tuluMovieDebug = { status: mt('debugInitializing'), api: '', error: '' }
  initApp(el)
  return el
}

function initApp(el) {
  el.innerHTML = `
    <nav class="tvbox-navbar">
      <div class="tvbox-brand">
        <div class="tvbox-brand-icon">影</div>
        <div>
          <div class="tvbox-brand-name">${escHtml(mt('appTitle'))}</div>
          <div id="t-debug-status" style="font-size:10px;color:var(--text-muted);margin-top:2px"></div>
        </div>
      </div>

      <div class="tvbox-search-wrap">
        <div class="tvbox-search-box">
          <span class="tvbox-search-icon">🔍</span>
          <input class="tvbox-search-input" type="text" id="t-search" placeholder="${escHtml(mt('searchPlaceholder'))}" autocomplete="off" />
          <button class="tvbox-search-btn" id="t-search-btn">${escHtml(mt('searchButton'))}</button>
        </div>
        <div id="t-history-panel" class="tvbox-search-history-panel" style="display:none">
          <div class="tvbox-search-history-head">
            <span>${escHtml(mt('searchHistory'))}</span>
            <button id="t-clear-history" class="tvbox-search-history-clear">${escHtml(mt('clear'))}</button>
          </div>
          <div id="t-history-tags" class="tvbox-search-history-tags"></div>
        </div>
      </div>

      <div class="tvbox-mode-tabs">
        <button class="tvbox-mode-tab active" id="t-library-entry" data-mode="library">星枢片库</button>
        <button class="tvbox-mode-tab" data-mode="vod">${escHtml(mt('vodMode'))}</button>
        <button class="tvbox-mode-tab" data-mode="crawl">${escHtml(mt('crawlMode'))}</button>
        <button class="tvbox-mode-tab" data-mode="missav">精品专区</button>
        <button class="tvbox-mode-tab" data-mode="myavlive">实时直播</button>
      </div>
    </nav>

    <div class="tvbox-catbar" id="t-catbar">
      <span class="tvbox-catbar-label">${escHtml(mt('categoryLabel'))}</span>
    </div>

    <div class="tvbox-srcbar" id="t-srcbar">
      <span class="tvbox-srcbar-label">${escHtml(mt('sourceLabel'))}</span>
    </div>

    <div class="tvbox-content" id="t-content">
      <div class="tvbox-loading">
        <div class="tvbox-loading-icon"></div>
        <span class="tvbox-loading-text">${escHtml(mt('loading'))}</span>
      </div>
    </div>


    <div class="tvbox-player-overlay" id="t-player-overlay" style="display:none">
      <div class="tvbox-player-box">
        <div class="tvbox-player-hdr">
          <span class="tvbox-player-title" id="t-player-title">${escHtml(mt('playing'))}</span>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="tvbox-player-mini" id="t-player-mini" title="关闭">✕</button>
          </div>
        </div>
        <div class="tvbox-player-body" id="t-player-body">
          <div class="tvbox-player-loading">${escHtml(mt('loadingPlayer'))}</div>
        </div>
        <div class="tvbox-player-foot">
          <a href="#" class="tvbox-open-ext" id="t-ext-link" target="_blank" rel="noopener">${escHtml(mt('openExternal'))}</a>
        </div>
      </div>
    </div>
  `

  const searchInput = el.querySelector('#t-search')
  const searchBtn   = el.querySelector('#t-search-btn')

  searchBtn.addEventListener('mousedown', () => hideHistory())
  searchBtn.addEventListener('click', () => doSearch(searchInput.value))
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') { hideHistory(); doSearch(searchInput.value) } })
  searchInput.addEventListener('focus', () => { if (!searchInput.value.trim()) showSearchHistory() })
  searchInput.addEventListener('input', () => { if (!searchInput.value.trim()) showSearchHistory(); else hideHistory() })
  searchInput.addEventListener('input', () => { if (searchInput.value.trim()) hideHistory() })
  searchInput.addEventListener('blur', () => setTimeout(() => hideHistory(), 120))
  el.querySelector('#t-clear-history').addEventListener('click', e => { e.stopPropagation(); clearSearchHistory(); renderSearchHistory() })
  el.querySelector('#t-player-mini').addEventListener('click', closePlayer)
  el.querySelector('#t-player-overlay').addEventListener('click', e => { if (e.target === el.querySelector('#t-player-overlay')) closePlayer() })

  // 模式切换（library / vod / crawl）
  let mode = 'library'
  let missavUnlocked = false
  const showMissavPasswordDialog = () => new Promise(resolve => {
    const existing = el.querySelector('.tvbox-auth-overlay')
    if (existing) existing.remove()
    const overlay = document.createElement('div')
    overlay.className = 'tvbox-auth-overlay'
    overlay.innerHTML = '<div class="tvbox-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="missav-auth-title">' +
      '<div class="tvbox-auth-glow"></div>' +
      '<div class="tvbox-auth-head"><div class="tvbox-auth-logo">影</div><div><div class="tvbox-auth-kicker">ENTERPRISE ACCESS</div><h3 id="missav-auth-title">精品专区授权验证</h3><p>该功能为高级内容入口，请输入授权密码后继续访问。</p></div></div>' +
      '<div class="tvbox-auth-field"><label for="missav-auth-password">访问密码</label><div class="tvbox-auth-input-wrap"><input id="missav-auth-password" type="password" autocomplete="current-password" placeholder="请输入精品专区访问密码" /><button type="button" id="missav-auth-toggle">显示</button></div><div class="tvbox-auth-error" id="missav-auth-error"></div></div>' +
      '<div class="tvbox-auth-foot"><button type="button" class="tvbox-auth-cancel" id="missav-auth-cancel">取消</button><button type="button" class="tvbox-auth-submit" id="missav-auth-submit">验证进入</button></div>' +
      '</div>'
    el.appendChild(overlay)
    const input = overlay.querySelector('#missav-auth-password')
    const error = overlay.querySelector('#missav-auth-error')
    const finish = value => { overlay.remove(); resolve(value) }
    const submit = () => {
      if (input.value === '2552667173') finish(true)
      else {
        error.textContent = '密码错误，请核对后重新输入'
        overlay.classList.remove('tvbox-auth-shake')
        void overlay.offsetWidth
        overlay.classList.add('tvbox-auth-shake')
        input.select()
      }
    }
    overlay.querySelector('#missav-auth-submit').addEventListener('click', submit)
    overlay.querySelector('#missav-auth-cancel').addEventListener('click', () => finish(false))
    overlay.querySelector('#missav-auth-toggle').addEventListener('click', e => {
      const showing = input.type === 'text'
      input.type = showing ? 'password' : 'text'
      e.currentTarget.textContent = showing ? '显示' : '隐藏'
      input.focus()
    })
    overlay.addEventListener('click', e => { if (e.target === overlay) finish(false) })
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Enter') submit()
      if (e.key === 'Escape') finish(false)
    })
    setTimeout(() => input.focus(), 30)
  })
  const ensureMissavUnlocked = async () => {
    try { if (sessionStorage.getItem('tulu-missav-unlocked') === '1') return true } catch {}
    if (missavUnlocked) return true
    const ok = await showMissavPasswordDialog()
    if (ok) {
      missavUnlocked = true
      try { sessionStorage.setItem('tulu-missav-unlocked', '1') } catch {}
      return true
    }
    return false
  }
  el.querySelectorAll('.tvbox-mode-tab').forEach(btn => {
    btn.addEventListener('click', async () => {
      let newMode = btn.dataset.mode
      if (newMode === 'live' || newMode === 'tvboxjson') newMode = 'library'
      if ((newMode === 'missav' || newMode === 'myavlive') && !await ensureMissavUnlocked()) return
      if (newMode === mode) return
      mode = newMode
      el.classList.toggle('tvbox-library-mode', mode === 'library')
      el.querySelectorAll('.tvbox-mode-tab').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      page = 1; query = ''; searchInput.value = ''; hideHistory(); _viewStack = []
      if (mode === 'live') {
        el.querySelector('#t-catbar').innerHTML = '<span class="tvbox-catbar-label">' + escHtml(mt('categoryLabel')) + '</span><button class="tvbox-cat-chip active">' + escHtml(mt('allChannels')) + '</button>'
        el.querySelector('#t-catbar').querySelector('.tvbox-cat-chip').addEventListener('click', () => {})
        renderSrcBar()
      } else if (mode === 'library') {
        el.querySelector('#t-catbar').innerHTML = ''
        el.querySelector('#t-srcbar').innerHTML = ''
        showLibraryHome()
      } else if (mode === 'tvboxjson') {
        el.querySelector('#t-catbar').innerHTML = '<span class="tvbox-catbar-label">' + escHtml(mt('categoryLabel')) + '</span><button class="tvbox-cat-chip active">' + escHtml(mt('all')) + '</button>'
        renderTvboxSrcTabs()
      } else if (mode === 'crawl') {
        el.querySelector('#t-catbar').innerHTML = '<span class="tvbox-catbar-label">' + escHtml(mt('crawlMode')) + '</span>'
        el.querySelector('#t-srcbar').innerHTML = ''
        showCrawlInput()
      } else if (mode === 'missav') {
        el.querySelector('#t-catbar').innerHTML = ''
        el.querySelector('#t-srcbar').innerHTML = ''
        showMissavHome()
      } else if (mode === 'myavlive') {
        el.querySelector('#t-catbar').innerHTML = ''
        el.querySelector('#t-srcbar').innerHTML = ''
        showMyAvLiveHome()
      } else {
        renderCatBar()
        renderSrcBar()
      }
      if (mode === 'live') loadLive()
      else if (mode === 'library') { /* showLibraryHome 已加载 */ }
      else if (mode === 'tvboxjson') loadTvboxList()
      else if (mode === 'crawl') { /* 等待用户输入 */ }
      else if (mode === 'missav') { /* showMissavHome 已加载 */ }
      else if (mode === 'myavlive') { /* showMyAvLiveHome 已加载 */ }
      else if (getPlayHistory().length > 0 && !query) showPlayHistory()
      else loadData()
    })
  })

  // API 管理按钮
  el.querySelector('#t-api-manage')?.addEventListener('click', showApiManage)

  // 链接输入按钮
  el.querySelector('#t-url-input')?.addEventListener('click', showUrlInput)

  el.classList.toggle('tvbox-library-mode', true)
  el.querySelector('#t-catbar').innerHTML = ''
  el.querySelector('#t-srcbar').innerHTML = ''
  showLibraryHome()

  function doSearch(q) {
    query = q.trim()
    if (!query) return
    addSearchHistory(query)
    page = 1
    hideHistory()
    searchInput.blur()
    _viewStack = []
    if (mode === 'library') showLibraryHome(query)
    else if (mode === 'missav') showMissavHome(query)
    else if (mode === 'myavlive') showMyAvLiveHome(query)
    else loadData()
  }

  function showSearchHistory() {
    const h = getSearchHistory().slice(0, 8)
    const wrap = el.querySelector('#t-history-panel')
    if (!wrap || !h.length || searchInput.value.trim()) {
      hideHistory()
      return
    }
    renderSearchHistory()
    wrap.style.display = 'block'
  }

  function renderSearchHistory() {
    const tags = el.querySelector('#t-history-tags')
    if (!tags) return
    tags.innerHTML = getSearchHistory().slice(0, 8).map(s =>
      '<div class="tvbox-history-item"><button class="tvbox-history-tag" data-q="' + escHtml(s) + '"><span class="tvbox-history-clock">↻</span><span class="tvbox-history-text">' + escHtml(s) + '</span></button><button class="tvbox-history-remove" data-q="' + escHtml(s) + '" title="删除">×</button></div>'
    ).join('')
    tags.querySelectorAll('.tvbox-history-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        searchInput.value = tag.dataset.q
        hideHistory()
        doSearch(tag.dataset.q)
      })
    })
    tags.querySelectorAll('.tvbox-history-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation()
        removeSearchHistory(btn.dataset.q)
        renderSearchHistory()
      })
    })
  }

  function hideHistory() {
    const panel = el.querySelector('#t-history-panel')
    if (panel) panel.style.display = 'none'
  }

  function showPlayHistory() {
    const h = getPlayHistory().slice(0, 12)
    const content = el.querySelector('#t-content')
    if (!h.length) { loadData(); return }

    let html = '<div class="tvbox-section-title tvbox-history-title"><span>📜</span>' + escHtml(mt('recentPlayback')) + ' ' +
      '<button id="_h-import" class="tvbox-clear-btn">📥 ' + escHtml(mt('import')) + '</button>' +
      '<button id="_h-export" class="tvbox-clear-btn">📤 ' + escHtml(mt('export')) + '</button>' +
      '<button id="t-clear-play" class="tvbox-clear-btn tvbox-clear-danger">' + escHtml(mt('clearAll')) + '</button></div>'
    html += '<div class="tvbox-history-rail">'
    h.forEach((item, i) => {
      const source = [...VOD_SOURCES, ...TVBOX_BUILTIN].find(s => s.key === item._srcKey || s.name === item.source)
      const srcKey = source?.key || item.source
      const srcApi = source?.api || source?.url || ''
      const posterHtml = renderPosterImg(item.pic, item.name, srcKey, srcApi, '🎬')
      const pct = item.duration > 0 ? Math.round((item.progress / item.duration) * 100) : 0
      const resumeLabel = pct > 95 ? mt('watched') : pct > 2 ? mt('resumePercent', { percent: pct }) : ''
      const timeLabel = item.progress > 0 ? (item.duration > 0 ? fmtVodTime(item.progress) + ' / ' + fmtVodTime(item.duration) : fmtVodTime(item.progress)) : ''
      html += '<article class="tvbox-hist-card" data-hi="' + i + '" data-progress="' + escHtml(item.progress || 0) + '" data-duration="' + escHtml(item.duration || 0) + '">' +
        '<button class="tvbox-hist-poster" data-action="detail" title="查看详情">' +
          posterHtml +
          (resumeLabel ? '<span class="tvbox-hist-resume">' + escHtml(resumeLabel) + '</span>' : '') +
          '<span class="tvbox-hist-source">' + escHtml(item.source || srcKey || '历史') + '</span>' +
          '<div class="tvbox-hist-progress"><div style="width:' + Math.min(100, Math.max(0, pct)) + '%"></div></div>' +
        '</button>' +
        '<div class="tvbox-hist-name">' + escHtml(item.name) + '</div>' +
        '<div class="tvbox-hist-ep">' + escHtml(item.epName || '') + '</div>' +
        (timeLabel ? '<div class="tvbox-library-progress-time">' + escHtml(timeLabel) + '</div>' : '') +
        '<div class="tvbox-hist-actions">' +
          '<button class="tvbox-hist-action primary" data-action="play">播放</button>' +
          '<button class="tvbox-hist-action" data-action="detail">详情</button>' +
          '<button class="tvbox-hist-action danger" data-action="delete">删除</button>' +
        '</div>' +
      '</article>'
    })
    html += '</div>'
    html += '<div class="tvbox-divider"></div>'
    html += '<div class="tvbox-section-header"><div class="tvbox-section-heading"><div class="tvbox-section-heading-dot"></div>' + escHtml(mt('movieList')) + '</div></div>'
    content.innerHTML = html + '<div id="t-main-grid"></div><div id="t-pagination"></div>'

    content.querySelector('#t-clear-play')?.addEventListener('click', e => { e.stopPropagation(); if (confirm('确定清空全部播放历史？')) { clearPlayHistory(); loadData() } })
    content.querySelector('#_h-import')?.addEventListener('click', e => { e.stopPropagation(); importFavorites() })
    content.querySelector('#_h-export')?.addEventListener('click', e => { e.stopPropagation(); exportFavorites() })
    content.querySelectorAll('.tvbox-hist-card').forEach(card => {
      const openHistoryDetail = async (item) => {
        const source = resolveHistorySource(item)
        if (!source) {
          alert('无法识别历史来源，请打开播放详情')
          return
        }
        try {
          const detailId = item.detailId || item.id
          if (source.key !== 'yinghua' && source.key !== 'a_napp03' && source.key !== 'ip51122') {
            const resolved = await fetchCmsVodDetail(source.api || '', detailId, item.name, item.pic)
            return showEpisodePicker(resolved, source.name || item.source)
          }
          const resolved = source.key === 'yinghua'
            ? await openYinghuaDetail({ vod_id: detailId, vod_name: item.name, vod_pic: item.pic, _detailUrl: item.detailUrl })
            : await fetchPageApiDetail(source, detailId, item.name, item.pic)
          if (resolved) return showEpisodePicker(resolved, source.name)
          alert(mt('loadFailed'))
        } catch (e) {
          alert(e.message || mt('loadFailed'))
        }
      }
      const playHistoryItem = async (item) => {
        await openHistoryPlayer(item)
      }
      card.addEventListener('click', (event) => {
        const d = card.dataset
        const item = h[parseInt(d.hi)] || {}
        const action = event.target.closest('[data-action]')?.dataset.action || 'detail'
        if (action === 'play') playHistoryItem(item)
        else if (action === 'delete') {
          event.stopPropagation()
          if (confirm('删除这条播放历史？')) { removePlayHistoryItem(item); showPlayHistory() }
        }
        else openHistoryDetail(item)
      })
    })
    loadList()
  }

  function resolveHistorySource(item) {
    const sourceName = String(item?.source || '')
    const sourceKey = String(item?._srcKey || item?.srcKey || '')
    const api = String(item?._api || item?.api || '')
    const all = [
      ...VOD_SOURCES,
      { key: 'yinghua', name: YINGHUA_SOURCE_NAME, api: YINGHUA_BASE },
      { key: 'a_napp03', name: A_NAPP03_SOURCE_NAME, api: NAPP03_BASE },
      { key: 'ip51122', name: IP51122_SOURCE_NAME, api: IP51122_LIST_BASE },
    ]
    return all.find(s => s.key === sourceKey || s.name === sourceName || s.api === api)
      || (sourceName.includes('樱') ? { key: 'yinghua', name: YINGHUA_SOURCE_NAME, api: YINGHUA_BASE } : null)
      || (sourceName.includes('天空') || sourceName.includes('ncat') ? { key: 'a_napp03', name: A_NAPP03_SOURCE_NAME, api: NAPP03_BASE } : null)
      || (sourceName.includes('云岚') || sourceName.includes('51122') ? { key: 'ip51122', name: IP51122_SOURCE_NAME, api: IP51122_LIST_BASE } : null)
  }

  async function openHistoryPlayer(item) {
    const name = item?.name || item?.vod_name || '未命名'
    const pic = item?.pic || item?.vod_pic || ''
    const id = item?.id || item?.detailId || item?.vod_id || ''
    const sourceName = item?.source || item?.sourceName || 'vod_history'
    const epName = item?.epName || ''
    const epUrl = item?.epUrl || ''
    if (!epUrl || epUrl === '#' || epUrl === 'undefined') return
    const overlay = el.querySelector('#t-player-overlay')
    if (overlay) overlay.style.display = 'none'
    let urls = Array.isArray(item?.allUrls) && item.allUrls.length ? item.allUrls : [epUrl]
    let eps = Array.isArray(item?.allEps) && item.allEps.length ? item.allEps : urls.map((url, i) => ({ epName: i === 0 ? (epName || '播放') : '第 ' + (i + 1) + ' 集', url }))
    let lines = Array.isArray(item?.allLines) && item.allLines.length ? item.allLines : []
    if (!lines.length || lines.every(line => !Array.isArray(line.urls) || line.urls.length <= 1)) {
      try {
        const source = resolveHistorySource(item)
        const detailId = item.detailId || item.id
        let resolved = null
        if (source && detailId) {
          if (source.key !== 'yinghua' && source.key !== 'a_napp03' && source.key !== 'ip51122') resolved = await fetchCmsVodDetail(source.api || '', detailId, name, pic)
          else resolved = source.key === 'yinghua'
            ? await openYinghuaDetail({ vod_id: detailId, vod_name: name, vod_pic: pic, _detailUrl: item.detailUrl })
            : await fetchPageApiDetail(source, detailId, name, pic)
        }
        const episodes = resolved ? (resolved._episodes || parsePlaylist(resolved.vod_play_from, resolved.vod_play_url)) : []
        if (episodes.length) {
          lines = episodes.map((line, lineIndex) => ({
            name: line.name || ('线路' + (lineIndex + 1)),
            urls: (line.urls || []).map(e => ({ epName: e.name, url: e.url, pic: resolved.vod_pic || pic })),
          })).filter(line => line.urls.length)
          const matchLine = lines.find(line => line.urls.some(e => e.url === epUrl || e.epName === epName)) || lines[0]
          eps = matchLine.urls.map(e => ({ epName: e.epName || e.name, url: e.url, pic: e.pic || resolved.vod_pic || pic }))
          urls = eps.map(e => e.url).filter(Boolean)
        }
      } catch (e) {
        console.warn('[movie] 历史播放补全选集失败:', e?.message || e)
      }
    }
    const hasUsableEpisodeContext = lines.some(line => Array.isArray(line.urls) && line.urls.length > 1) || eps.length > 1 || urls.length > 1
    if (!hasUsableEpisodeContext) {
      const source = resolveHistorySource(item)
      const detailId = item.detailId || item.id
      if (source && detailId) {
        try {
          let resolved = null
          if (source.key !== 'yinghua' && source.key !== 'a_napp03' && source.key !== 'ip51122') resolved = await fetchCmsVodDetail(source.api || '', detailId, name, pic)
          else resolved = source.key === 'yinghua'
            ? await openYinghuaDetail({ vod_id: detailId, vod_name: name, vod_pic: pic, _detailUrl: item.detailUrl })
            : await fetchPageApiDetail(source, detailId, name, pic)
          if (resolved) return showEpisodePicker(resolved, source.name || sourceName)
        } catch (e) {
          console.warn('[movie] 历史详情打开失败:', e?.message || e)
        }
      }
    }
    if (!lines.length) lines = [{ name: sourceName || '当前线路', urls: eps.map(e => ({ epName: e.epName || e.name || '播放', url: e.url, pic: e.pic || pic })) }]
    openPlayerVod(name, epUrl, id, sourceName, epName, pic, urls, 0, eps, lines, 0, { desc: item?.vod_content || item?.desc || item?.content || '', year: item?.vod_year || '', area: item?.vod_area || '', type: item?.type_name || '', actor: item?.vod_actor || '' })
  }

  // 从源 API 获取自适应分类列表
  async function fetchSourceCategories(sourceKey) {
    if (_catCache[sourceKey]) return _catCache[sourceKey]
    const source = VOD_SOURCES.find(s => s.key === sourceKey)
    if (!source) return VOD_CATEGORIES.map(c => ({ ...c, typeId: 1 }))
    try {
      if (source.key === 'yinghua') {
        _catCache[sourceKey] = YINGHUA_CATEGORIES
        return YINGHUA_CATEGORIES
      }
      const json = await fetchJSON(source.api + '?ac=config')
      if (json?.class && Array.isArray(json.class)) {
        const cats = json.class.map(cls => ({
          id: String(cls.type_id || cls.typeId || ''),
          name: cls.type_name || cls.name || mt('unnamed'),
          typeId: Number(cls.type_id || cls.typeId || 1),
        })).filter(c => c.typeId > 0)
        if (cats.length > 0) {
          _catCache[sourceKey] = cats
          return cats
        }
      }
    } catch {}
    const fallback = VOD_CATEGORIES.map(c => ({ ...c, typeId: (VOD_TYPE_MAP[sourceKey] || {})[c.id] || 1 }))
    _catCache[sourceKey] = fallback
    return fallback
  }

  async function renderCatBar(wait = false) {
    if (mode === 'library') return
    const container = el.querySelector('#t-catbar')
    const source = VOD_SOURCES[src]
    const currentSourceKey = source.key
    let cats = _catCache[source.key] || VOD_CATEGORIES.map(c => ({ ...c, typeId: (VOD_TYPE_MAP[source.key] || {})[c.id] || 1 }))
    const paint = (freshCats) => {
      if (src >= VOD_SOURCES.length || VOD_SOURCES[src].key !== currentSourceKey) return
      cats = freshCats && freshCats.length ? freshCats : cats
      if (_currentTypeId == null) {
        const preferred = cats.find(c => c.id === cat) || cats[0]
        if (preferred) { cat = preferred.id; _currentTypeId = preferred.typeId }
      }
      container.innerHTML = '<span class="tvbox-catbar-label">' + escHtml(mt('categoryLabel')) + '</span>' +
        cats.map(c => '<button class="tvbox-cat-chip' + (String(c.typeId) === String(_currentTypeId) ? ' active' : '') + '" data-typeid="' + escHtml(c.typeId) + '" data-catid="' + escHtml(c.id) + '" title="' + escHtml(categoryName(c)) + '">' + escHtml(categoryName(c)) + '</button>').join('')
      container.querySelectorAll('.tvbox-cat-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          cat = btn.dataset.catid
          _currentTypeId = parseInt(btn.dataset.typeid)
          page = 1; query = ''; searchInput.value = ''; hideHistory(); _viewStack = []
          renderCatBar(); renderSrcBar()
          loadData()
        })
      })
    }
    container.innerHTML = '<span class="tvbox-catbar-label">' + escHtml(mt('categoryLabel')) + '</span><span style="color:var(--text-tertiary);font-size:12px">⏳ ' + escHtml(mt('syncingCategories')) + '</span>'
    const promise = fetchSourceCategories(source.key).then(paint).catch(() => paint(cats))
    if (wait) await promise
    else promise
  }

  function renderSrcBar() {
    if (mode === 'library') return
    const container = el.querySelector('#t-srcbar')
    const list = VOD_SOURCES
    container.innerHTML = '<span class="tvbox-srcbar-label">' + escHtml(mt('sourceLabel')) + '</span>' +
      list.map((s, i) => '<button class="tvbox-src-chip' + (i === src ? ' active' : '') + '" data-idx="' + i + '">' +
        '<span class="tvbox-src-dot' + (_sourceHealth[s.api] > 5000 ? ' tvbox-src-warn' : '') + '"></span>' +
        s.name + (_sourceHealth[s.api] > 5000 ? ' ⚠️' : '') + '</button>').join('')
    container.querySelectorAll('.tvbox-src-chip').forEach(btn => {
      btn.addEventListener('click', async () => {
        src = parseInt(btn.dataset.idx)
        _currentTypeId = null  // 切换源时重置typeId，让新源的分类自适应
        cat = 'movie'           // 切回默认分类
        query = ''
        searchInput.value = ''
        page = 1
        hideHistory()
        renderSrcBar()
        await renderCatBar(true)
        loadData()
      })
    })
  }

  async function loadData() {
    if (mode === 'library') return
    const content = el.querySelector('#t-content')
    content.innerHTML = '<div class="tvbox-loading"><div class="tvbox-loading-icon"></div><span class="tvbox-loading-text">' + escHtml(mt('loading')) + '</span></div>'
    try {
      if (mode === 'live') loadLive()
      else if (mode === 'tvboxjson') { if (query) await loadTvboxSearch(); else await loadTvboxList() }
      else if (query) await searchAllSources(query)
      else if (getPlayHistory().length > 0 && page === 1 && !query) { await showPlayHistory(); return }
      else await loadList()
    } catch (e) {
      content.innerHTML = '<div class="tvbox-empty"><div class="tvbox-empty-icon">😵</div><div class="tvbox-empty-title">' + escHtml(mt('loadFailed')) + '</div><div class="tvbox-empty-sub">' + escHtml(e.message) + '</div></div>'
    }
  }

  // 更新调试面板（界面可见状态）
function setDebug(msg, detail) {
  const el = document.querySelector('#t-debug-status')
  if (!el) return
  el.textContent = new Date().toLocaleTimeString('zh-CN') + ' ' + msg
  console.info('[DEBUG]', msg, detail || '')
}

  async function loadList() {
    const content = el.querySelector('#t-content')
    const source = VOD_SOURCES[src]
    // 自适应分类：优先用当前缓存的 typeId，否则用旧映射
    let typeId = _currentTypeId
    if (typeId == null) {
      const typeMap = VOD_TYPE_MAP[source.key] || { movie: 1, tv: 2, variety: 3, anime: 4, short: 6 }
      typeId = typeMap[cat] ?? 1
    }
    setDebug(mt('debugLoading'), source.name + ' cat=' + cat + ' typeId=' + typeId)
    let json = { list: [], total: 0 }
    const t0 = Date.now()
    try {
      if (source.key === 'yinghua') json = await loadYinghuaCategory((YINGHUA_CATEGORIES.find(c => c.id === cat) || YINGHUA_CATEGORIES[0]).typeId, page)
      else if (source.key === 'a_napp03' || source.key === 'ip51122') json = await fetchJSONFast(source.api + '?ac=list&t=' + typeId + '&pg=' + page)
      else {
        try {
          json = await fetchJSONFast(source.api + '?ac=list&t=' + typeId + '&pg=' + page)
          _sourceHealth[source.api] = Date.now() - t0
          setDebug(mt('debugApiReturned'), 'total=' + json.total + ' list.len=' + (json.list?.length || 0) + ' (' + _sourceHealth[source.api] + 'ms)')
        } catch (e) { setDebug(mt('debugFirstError'), e.message) }
        if (!json.list) { try { json = await fetchJsonp(source.api + '?ac=list&t=' + typeId + '&pg=' + page) } catch {} }
      }
    } catch (e) { setDebug(mt('debugAllMethodsError'), e.message) }
    if (!json.list || !json.list.length) {
      setDebug(mt('debugTypeIdEmpty'), '')
      try { json = await fetchJSONFast(source.api + '?ac=list&pg=' + page) } catch {}
    }
    const count = json.list?.length || 0
    // 标记超时源（>5s）
    if (_sourceHealth[source.api] > 5000) renderSrcBar()
    setDebug(mt('debugResultCount', { count: json.total || count }), 'list.len=' + count)
    let normalized = (json.list || []).map(item => normalizeVodItem(item, source))
    normalized = await enrichVodListPosters(source.api, normalized)
    renderVodGrid(normalized, json.total || count)
  }

  // 全源并发搜索（所有 VOD CMS 源同时搜，哪个源先返回就先渲染）
  async function searchAllSources(q) {
    const content = el.querySelector('#t-content')
    const qe = encodeURIComponent(q)
    const perSourceTimeout = 6000
    const seen = new Set()
    const merged = []
    let finished = 0
    let succeeded = 0
    let renderedAny = false
    content.innerHTML = '<div id="t-main-grid"><div class="tvbox-loading"><div class="tvbox-loading-icon"></div><span class="tvbox-loading-text">' + escHtml(mt('searchingImmediate')) + '</span></div></div><div id="t-pagination"></div>'
    setDebug(mt('debugGlobalSearchRunning'), mt('debugSourceProgress', { done: 0, total: VOD_SOURCES.length }))

    const tasks = VOD_SOURCES.map(async (source) => {
      const ctrl = new AbortController()
      const tid = setTimeout(() => ctrl.abort(), perSourceTimeout)
      try {
        let json = { list: [] }
        try {
          if (source.key === 'yinghua') json = await searchYinghua(q, 1)
          else if (source.key === 'a_napp03') json = await searchAiyiNapp(q, 1)
          else if (source.key === 'ip51122') json = await searchIp51122(q, 1)
          else json = await fetchJSONFast(source.api + '?ac=videolist&wd=' + qe + '&pg=1', ctrl.signal)
        } catch {}
        if (!json.list?.length && source.key !== 'yinghua' && source.key !== 'a_napp03' && source.key !== 'ip51122') { try { json = await fetchJSONFast(source.api + '?ac=videolist&zm=' + qe + '&pg=1', ctrl.signal) } catch {} }
        if (!json.list?.length && source.key !== 'yinghua' && source.key !== 'a_napp03' && source.key !== 'ip51122') { try { json = await fetchJSONFast(source.api + '?ac=detail&wd=' + qe, ctrl.signal) } catch {} }
        const items = await enrichVodListPosters(source.api, (json.list || []).map(item => normalizeVodItem(item, source)))
        let added = 0
        for (const item of items) {
          if (!movieNameMatches(item, q)) continue
          const key = (item.vod_name || item.vod_id || Math.random().toString()).trim()
          if (!seen.has(key)) {
            seen.add(key)
            merged.push(item)
            added++
          }
        }
        if (added > 0) {
          succeeded++
          renderedAny = true
          renderVodGrid(merged, merged.length)
        }
      } catch (e) {
        console.warn('[movie] 搜索源失败:', source.name, e?.message || e)
      } finally {
        clearTimeout(tid)
        finished++
        setDebug(mt('debugGlobalSearchRunning'), mt('debugSourceDisplayed', { done: finished, total: VOD_SOURCES.length, count: merged.length }))
      }
    })

    await Promise.allSettled(tasks)
    if (!renderedAny) renderVodGrid([], 0)
    setDebug(mt('debugGlobalSearchDone'), mt('debugSourceMatched', { done: succeeded, total: VOD_SOURCES.length, count: merged.length }))
  }

  async function loadSearch() {
    const source = VOD_SOURCES[src]
    const q = encodeURIComponent(query)
    let json = { list: [], total: 0 }
    try {
      // 优先 videolist（CMS标准搜索接口）
      if (source.key === 'yinghua') {
        const html = await fetchYinghuaPage(`${YINGHUA_BASE}/index.php/vod/search/wd/${q}.html`)
        json = { list: parseYinghuaListHtml(html, YINGHUA_BASE), total: 0 }
      } else if (source.key === 'a_napp03') {
        json = await searchAiyiNapp(query, page)
      } else if (source.key === 'ip51122') {
        json = await searchIp51122(query, page)
      } else {
        try { json = await fetchJSONFast(source.api + '?ac=videolist&wd=' + q + '&pg=' + page) } catch {}
        if (!json.list?.length) { try { json = await fetchJSONFast(source.api + '?ac=videolist&zm=' + q + '&pg=' + page) } catch {} }
        if (!json.list?.length) { try { json = await fetchJsonp(source.api + '?ac=videolist&wd=' + q) } catch {} }
      }
    } catch {}
    const count = json.list?.length || 0
    if (!count) {
      // 兜底：直接 fetch 搜索（部分源搜索接口不同）
      try { json = await fetchJSONFast(source.api + '?ac=detail&wd=' + q) } catch {}
    }
    const filtered = await enrichVodListPosters(source.api, filterSearchResults((json.list || []).map(item => normalizeVodItem(item, source)), query))
    const total = filtered.length
    setDebug(total > 0 ? mt('exactResultCount', { count: total }) : mt('noSearchResult'), 'list.len=' + (json.list?.length || 0) + ' filtered=' + total)
    if (!total && source.key === 'a_napp03' && json.message) {
      const content = el.querySelector('#t-content')
      content.innerHTML = '<div class="tvbox-empty"><div class="tvbox-empty-icon">🔎</div><div class="tvbox-empty-title">' + escHtml(mt('noSearchResult')) + '</div><div class="tvbox-empty-sub">' + escHtml(json.message) + '</div></div>'
      return
    }
    renderVodGrid(filtered, total)
  }

  // ── TVBox JSON 模式 ──────────────────────────────
  async function loadTvboxList() {
    const content = el.querySelector('#t-content')
    content.innerHTML = '<div class="tvbox-loading">' + escHtml(mt('loadingTvboxJson')) + '</div>'
    const api = getActiveTvbox()
    if (!api) {
      content.innerHTML = '<div class="tvbox-empty">' + escHtml(mt('selectTvboxSourceFirstDetailed')) + '</div><div style="text-align:center;margin-top:20px"><button id="t-add-tvbox-btn" style="background:#0a59f7;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:14px;cursor:pointer">' + escHtml(mt('addCustomTvboxApi')) + '</button></div>'
      el.querySelector('#t-add-tvbox-btn')?.addEventListener('click', showApiManage)
      return
    }
    const config = await loadTvboxConfig(api)
    if (!config) {
      content.innerHTML = '<div class="tvbox-empty">' + escHtml(mt('tvboxJsonLoadFailedDetailed')) + '<br><br><button id="t-switch-src-btn" style="background:#333;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:13px;cursor:pointer">' + escHtml(mt('switchSource')) + '</button></div>'
      el.querySelector('#t-switch-src-btn')?.addEventListener('click', renderTvboxSrcTabs)
      return
    }
    const all = parseVideoList(config)
    const filtered = cat !== 'all' ? all.filter(v => (v.type_name || '').includes(VOD_CATEGORIES.find(c => c.id === cat)?.name || cat)) : all
    const total = filtered.length
    const start = (page - 1) * 20
    renderVodGrid(filtered.slice(start, start + 20).map(item => normalizeVodItem(item, { key: getActiveTvboxKey(), name: getActiveTvbox()?.name || 'TVBox', api: getActiveTvbox()?.url || '' })), total)
  }

  async function loadTvboxSearch() {
    const content = el.querySelector('#t-content')
    content.innerHTML = '<div class="tvbox-loading">' + escHtml(mt('searching')) + '</div>'
    const api = getActiveTvbox()
    if (!api) { content.innerHTML = '<div class="tvbox-empty">' + escHtml(mt('selectTvboxSourceFirst')) + '</div>'; return }
    const config = await loadTvboxConfig(api)
    if (!config) { content.innerHTML = '<div class="tvbox-empty">' + escHtml(mt('tvboxJsonLoadFailed')) + '</div>'; return }
    const results = filterSearchResults((await searchTvboxList(config, query, api)).map(item => normalizeVodItem(item, { key: getActiveTvboxKey(), name: getActiveTvbox()?.name || 'TVBox', api: getActiveTvbox()?.url || '' })), query)
    renderVodGrid(results, results.length)
  }

  function renderTvboxSrcTabs() {
    const container = el.querySelector('#t-src-tabs')
    const activeKey = getActiveTvboxKey()
    const custom = getCustomTvbox()
    const allSources = [...TVBOX_BUILTIN.map(a => ({ ...a, _isBuiltin: true })), ...custom.map(a => ({ ...a, _isBuiltin: false }))]
    container.innerHTML = allSources.map((s, i) =>
      '<button class="tvbox-tab ' + (s.key === activeKey || (i === 0 && !activeKey) ? 'active' : '') + '" data-key="' + s.key + '">' + s.name + '</button>'
    ).join('') +
    '<button class="tvbox-tab" id="t-add-custom-btn" style="color:#317af7;font-size:13px">＋ ' + escHtml(mt('custom')) + '</button>'
    container.querySelectorAll('.tvbox-tab[data-key]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.key
        setActiveTvboxKey(key)
        _tvboxCache = {}  // 清除缓存，强制重新加载
        src = 0; page = 1
        container.querySelectorAll('.tvbox-tab').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        if (query) await loadTvboxSearch()
        else await loadTvboxList()
      })
    })
    el.querySelector('#t-add-custom-btn')?.addEventListener('click', showApiManage)
  }

  // ── API 管理弹窗 ───────────────────────────────
  function showApiManage() {
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center'
    const custom = getCustomTvbox()
    const activeKey = getActiveTvboxKey()
    overlay.innerHTML = '<div style="background:var(--bg-secondary);border-radius:16px;padding:24px;width:90%;max-width:500px;max-height:80vh;overflow-y:auto;color:var(--text-primary);font-family:inherit">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
        '<div style="font-size:16px;font-weight:bold">⚙️ ' + escHtml(mt('tvboxApiManageTitle')) + '</div>' +
        '<button id="t-api-close" style="background:none;border:none;color:var(--text-secondary);font-size:20px;cursor:pointer;padding:4px">✕</button>' +
      '</div>' +
      '<div style="margin-bottom:16px">' +
        '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">' + escHtml(mt('builtinTvboxJsonSources')) + '</div>' +
        TVBOX_BUILTIN.map(a => '<div class="tvbox-src-item' + (a.key === activeKey ? ' active' : '') + '" data-key="' + a.key + '" data-type="builtin" style="padding:10px 12px;background:' + (a.key === activeKey ? 'var(--accent-muted)' : 'var(--bg-tertiary)') + ';border-radius:8px;margin-bottom:6px;cursor:pointer;display:flex;justify-content:space-between;align-items:center">' +
          '<span>' + a.name + '</span><span style="font-size:12px;color:var(--text-secondary)">' + (a.note || '') + '</span></div>').join('') +
      '</div>' +
      '<div style="margin-bottom:16px">' +
        '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">' + escHtml(mt('customTvboxApiCount', { count: custom.length })) + '</div>' +
        (custom.length ? custom.map(a => '<div style="padding:10px 12px;background:var(--bg-tertiary);border-radius:8px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">' +
          '<div style="overflow:hidden"><div style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px">' + escHtml(a.name) + '</div>' +
          '<div style="font-size:11px;color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px">' + escHtml(a.url) + '</div></div>' +
          '<button class="t-del-api" data-key="' + a.key + '" style="background:#0a59f7;color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;flex-shrink:0;margin-left:8px">' + escHtml(mt('delete')) + '</button></div>').join('') : '<div style="color:var(--text-tertiary);font-size:13px;text-align:center;padding:12px">' + escHtml(mt('noCustomApi')) + '</div>') +
      '</div>' +
      '<div style="border-top:1px solid var(--border-primary);padding-top:16px">' +
        '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">' + escHtml(mt('addCustomTvboxJsonApi')) + '</div>' +
        '<input id="t-api-name" placeholder="' + escHtml(mt('apiNamePlaceholder')) + '" style="width:100%;background:var(--bg-tertiary);border:1px solid var(--border-primary);color:var(--text-primary);border-radius:8px;padding:8px 12px;font-size:13px;box-sizing:border-box;margin-bottom:8px;display:block"/>' +
        '<input id="t-api-url" placeholder="' + escHtml(mt('apiUrlPlaceholder')) + '" style="width:100%;background:var(--bg-tertiary);border:1px solid var(--border-primary);color:var(--text-primary);border-radius:8px;padding:8px 12px;font-size:13px;box-sizing:border-box;margin-bottom:8px;display:block"/>' +
        '<button id="t-api-add-btn" style="width:100%;background:#0a59f7;color:#fff;border:none;border-radius:8px;padding:10px;font-size:14px;cursor:pointer">' + escHtml(mt('addAndUse')) + '</button>' +
      '</div>' +
    '</div>'
    document.body.appendChild(overlay)
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
    overlay.querySelector('#t-api-close').addEventListener('click', () => overlay.remove())
    overlay.querySelectorAll('.tvbox-src-item[data-key]').forEach(item => item.addEventListener('click', async () => {
      const key = item.dataset.key
      setActiveTvboxKey(key)
      _tvboxCache = {}
      overlay.remove()
      await loadTvboxList()
      renderTvboxSrcTabs()
    }))
    overlay.querySelectorAll('.tvbox-src-item[data-type="builtin"]').forEach(item => {
      item.addEventListener('contextmenu', e => {
        e.preventDefault()
        const key = item.dataset.key
        const src = TVBOX_BUILTIN.find(a => a.key === key)
        if (src?.url) {
          navigator.clipboard?.writeText(src.url).catch(() => {})
          const orig = item.style.background
          item.style.background = 'var(--accent-muted)'
          setTimeout(() => { item.style.background = orig }, 300)
        }
      })
    })
    overlay.querySelectorAll('.t-del-api').forEach(btn => btn.addEventListener('click', e => {
      e.stopPropagation()
      const key = btn.dataset.key
      const apis = getCustomTvbox().filter(a => a.key !== key)
      saveCustomTvbox(apis); _customTvbox = apis
      if (getActiveTvboxKey() === key) { setActiveTvboxKey(''); _tvboxCache = {} }
      overlay.remove()
      showApiManage()
    }))
    overlay.querySelector('#t-api-add-btn').addEventListener('click', async () => {
      const name = overlay.querySelector('#t-api-name')?.value.trim() || ''
      const url = overlay.querySelector('#t-api-url')?.value.trim()
      if (!url) return
      const key = 'ctv_' + Date.now()
      const api = { key, name: name || mt('customSourceName', { number: _customTvbox.length + 1 }), url }
      const config = await loadTvboxConfig(api)
      if (config) {
        const apis = getCustomTvbox(); apis.push(api); saveCustomTvbox(apis); _customTvbox = apis
        setActiveTvboxKey(key); _tvboxCache = {}
        overlay.remove()
        await loadTvboxList()
        renderTvboxSrcTabs()
      } else {
        alert(mt('invalidTvboxApi'))
      }
    })
  }

  function fetchJsonp(url) {
    // 支持 CDN 镜像回退
    const mirrors = typeof tvboxMirrors === 'function' ? tvboxMirrors(url) : [url];
    let mirrorIdx = 0;
    function tryNext(errMsg) {
      if (mirrorIdx < mirrors.length) {
        const mirror = mirrors[mirrorIdx++];
        return new Promise((resolve, reject) => {
          const cbName = '__jsonp_cb_' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
          const script = document.createElement('script');
          script.src = mirror + (mirror.includes('?') ? '&' : '?') + 'callback=' + cbName;
          let settled = false;
          function cleanup() {
            if (settled) return;
            settled = true;
            try { delete window[cbName]; } catch(e) {}
            if (script.parentNode) script.parentNode.removeChild(script);
          }
          script.onerror = () => { cleanup(); tryNext(mt('jsonpRequestFailed')).then(resolve).catch(reject); };
          window[cbName] = (data) => { cleanup(); resolve(data); };
          document.head.appendChild(script);
          setTimeout(() => { cleanup(); if (!settled) tryNext(mt('jsonpTimeout')).then(resolve).catch(reject); }, 15000);
        });
      } else reject(new Error(errMsg || mt('jsonpRequestFailed')));
    }
    return tryNext();
  }

  function renderVodGrid(list, total) {
    if (mode === 'library') return
    const root = _el // 用全局根元素（initApp 里设置的 _el）
    if (!root) { console.warn('[renderVodGrid] _el 全局根元素不存在!'); return }
    let grid = root.querySelector('#t-main-grid')
    let pagination = root.querySelector('#t-pagination')
    // 保证 grid 和 pagination 存在（initApp/renderHistory 等可能用 innerHTML 替换了 content 区域）
    if (!grid || !pagination) {
      let content = root.querySelector('#t-content')
      if (!content) { content = root.appendChild(Object.assign(document.createElement('div'), { id: 't-content' })) }
      grid = content.querySelector('#t-main-grid')
      if (!grid) { grid = content.appendChild(Object.assign(document.createElement('div'), { id: 't-main-grid' })) }
      pagination = content.querySelector('#t-pagination')
      if (!pagination) { pagination = content.appendChild(Object.assign(document.createElement('div'), { id: 't-pagination' })) }
      // 清除残留的加载中状态
      content.innerHTML = ''
      content.appendChild(grid)
      content.appendChild(pagination)
      console.info('[renderVodGrid] 修复: 重建grid/pagination并清除loading完成')
    }
    console.info('[renderVodGrid] 收到: list.len=', list?.length, 'total=', total)
    if (!list || !list.length) {
      grid.innerHTML = '<div class="tvbox-empty"><div class="tvbox-empty-icon">📭</div><div class="tvbox-empty-title">' + escHtml(mt('noData')) + '</div><div class="tvbox-empty-sub">' + escHtml(mt('tryOtherCategoryOrKeyword')) + '</div></div>'
      if (pagination) pagination.innerHTML = ''
      return
    }
    const history = getPlayHistory()
    const sourceName = VOD_SOURCES[src]?.name || ''
    const totalPages = Math.max(1, Math.ceil(total / 20))

    grid.innerHTML = '<div class="tvbox-grid">' + list.map(item => {
      const itemSourceName = item._srcName || sourceName
      const itemApi = item._tvboxApi || item._api || ''
      const histItem = history.find(h => h.id == item.vod_id && h.source === itemSourceName)
      const pct = histItem && histItem.duration > 0 ? Math.round((histItem.progress / histItem.duration) * 100) : 0
      const resumeLabel = pct > 95 ? mt('watched') : pct > 2 ? mt('resumePercent', { percent: pct }) : ''
      return '<div class="tvbox-card" data-id="' + escHtml(item.vod_id) + '" data-source="' + escHtml(itemSourceName) + '" data-src-key="' + escHtml(item._srcKey || '') + '" data-api="' + escHtml(itemApi) + '" data-name="' + escHtml(item.vod_name) + '" data-pic="' + escHtml(item.vod_pic) + '" data-detail-url="' + escHtml(item._detailUrl || '') + '">' +
        '<div class="tvbox-card-inner">' +
          '<div class="tvbox-card-pic">' +
            renderPosterImg(item.vod_pic, item.vod_name, item._srcKey, itemApi) +
            '<span class="tvbox-card-tag">' + escHtml(item.type_name || mt('videoTypeFallback')) + '</span>' +
            (item.vod_score ? '<span class="tvbox-card-score">' + escHtml(item.vod_score) + '</span>' : '') +
            (resumeLabel ? '<span class="tvbox-resume-badge">' + escHtml(resumeLabel) + '</span>' : '') +
          '</div>' +
          '<div class="tvbox-card-info">' +
            '<div class="tvbox-card-title">' + escHtml(item.vod_name) + '</div>' +
            '<div class="tvbox-card-sub">' + escHtml(item.vod_actor || itemSourceName || mt('unknownActor')) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    }).join('') + '</div>'

    if (pagination) pagination.innerHTML = totalPages > 1 ? renderPagination(page, totalPages) : ''

    grid.querySelectorAll('.tvbox-card').forEach(card => {
      card.addEventListener('click', () => {
        _viewStack.push('list')
        openCardDetail(card)
      })
    })
    if (pagination) {
      pagination.querySelectorAll('.tvbox-page-btn[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
          page = parseInt(btn.dataset.page)
          hideHistory()
          loadData()
          el.querySelector('.tvbox-content').scrollTop = 0
        })
      })
    }
  }

  async function openCardDetail(card) {
    const d = card.dataset
    const source = resolveHistorySource({ source: d.source, _srcKey: d.srcKey, _api: d.api })
    try {
      if (source && ['yinghua', 'a_napp03', 'ip51122'].includes(source.key)) {
        const item = { vod_id: d.id, vod_name: d.name, vod_pic: d.pic, _detailUrl: d.detailUrl || '' }
        const resolved = source.key === 'yinghua'
          ? await openYinghuaDetail(item)
          : await fetchPageApiDetail(source, d.detailUrl || d.id, d.name, d.pic)
        if (resolved) return showEpisodePicker(resolved, source.name)
      }
    } catch (e) {
      console.warn('[movie] 页面型详情打开失败，回退普通详情:', e?.message || e)
    }
    return fetchCmsVodDetail(d.api, d.id, d.name, d.pic).then(item => showEpisodePicker(item, d.source))
  }

  async function loadLive() {
    const source = TV_SOURCES[tvSrc]
    const content = el.querySelector('#t-content')
    content.innerHTML = '<div class="tvbox-loading"><div class="tvbox-loading-icon"></div><span class="tvbox-loading-text">' + escHtml(mt('loadingLiveChannels')) + '</span></div>'
    let cats = tvCache[tvSrc]
    if (!cats) {
      try {
        const text = await fetch(source.api, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.text())
        const isM3u = text.includes('#EXTM3U') || text.includes('group-title')
        cats = isM3u ? parseNzk(convertM3uToNormal(text)) : parseNzk(text)
        tvCache[tvSrc] = cats
      } catch (e) {
        content.innerHTML = '<div class="tvbox-empty"><div class="tvbox-empty-icon">📡</div><div class="tvbox-empty-title">' + escHtml(mt('loadFailed')) + '</div><div class="tvbox-empty-sub">' + escHtml(e.message) + '</div></div>'
        return
      }
    }
    renderTvGrid(cats)
  }

  function renderTvGrid(categories) {
    const content = el.querySelector('#t-content')
    if (!categories || !categories.length) { content.innerHTML = '<div class="tvbox-empty"><div class="tvbox-empty-icon">📡</div><div class="tvbox-empty-title">' + escHtml(mt('noChannelData')) + '</div></div>'; return }
    content.innerHTML = categories.slice(0, 30).map(cat => {
      if (!cat.channels || !cat.channels.length) return ''
      const chHtml = cat.channels.slice(0, 80).map(ch =>
        '<div class="tvbox-live-card" data-url="' + escHtml(ch.url) + '" data-name="' + escHtml(ch.name) + '">' +
          '<span class="tvbox-live-icon">📺</span><span class="tvbox-live-name">' + escHtml(ch.name) + '</span>' +
        '</div>'
      ).join('')
      return '<div class="tvbox-cat-section">' +
        '<div class="tvbox-cat-heading">📺 ' + escHtml(cat.name) + ' <span class="tvbox-cat-heading-count">' + cat.channels.length + '</span></div>' +
        '<div class="tvbox-live-grid">' + chHtml + '</div>' +
      '</div>'
    }).join('')
    content.querySelectorAll('.tvbox-live-card').forEach(node => {
      node.addEventListener('click', () => {
        const url = node.dataset.url, name = node.dataset.name
        if (url && url !== '#') openPlayerTv(name, url)
        else alert(mt('channelNoPlaybackUrl'))
      })
    })
  }

  function openPlayerTv(name, url) {
    const overlay = el.querySelector('#t-player-overlay')
    const body = el.querySelector('#t-player-body')
    el.querySelector('#t-player-title').textContent = '📺 ' + name
    el.querySelector('#t-ext-link').href = url
    body.innerHTML = '<div class="tvbox-player-loading">' + escHtml(mt('loading')) + '</div>'
    overlay.style.display = 'flex'
    const isM3u8 = url.includes('.m3u8')
    const isMp4  = url.includes('.mp4')
    if (isM3u8 || isMp4) loadVideoPlayer(url, isM3u8, 0, playingEp?.allUrls || [])
    else {
      // URL 格式校验
      var safeUrl = url && /^https?:\/\//i.test(url) ? url : ''
      body.innerHTML = '<div class="tvbox-iframe-wrap"><iframe id="tv-iframe" src="' + safeUrl + '" allowfullscreen allow="autoplay; fullscreen" style="width:100%;height:100%;border:none"></iframe></div>'
      // 超时兜底：10 秒内 iframe 未触发 load 事件则显示错误
      setTimeout(() => {
        const iframe = document.getElementById('tv-iframe')
        if (iframe && iframe.style.display !== 'none') {
          body.innerHTML = '<div style="text-align:center;padding:40px"><p style="color:var(--text-secondary);margin-bottom:14px">' + escHtml(mt('playbackAddressInvalid')) + '</p><a href="' + safeUrl + '" target="_blank" class="tvbox-open-ext">' + escHtml(mt('openInBrowser')) + '</a></div>'
        }
      }, 10000)
    }
  }

async function enrichVodListPosters(api, list) {
  const items = Array.isArray(list) ? list : []
  const ids = items.filter(item => !normalizePosterValue(item.vod_pic) && item.vod_id).slice(0, 36).map(item => item.vod_id)
  if (!api || !ids.length) return items
  try {
    const detailUrl = api + (api.includes('?') ? '&' : '?') + 'ac=detail&ids=' + encodeURIComponent(ids.join(','))
    const json = await fetchJSONFast(detailUrl)
    const details = Array.isArray(json?.list) ? json.list : []
    const byId = new Map(details.map(item => [String(item.vod_id || item.id || ''), item]))
    return items.map(item => {
      if (normalizePosterValue(item.vod_pic)) return item
      const detail = byId.get(String(item.vod_id || ''))
      const pic = detail?.vod_pic || detail?.pic || detail?.thumb || detail?.cover || detail?.poster || detail?.image || detail?.img || ''
      return pic ? { ...item, vod_pic: pic } : item
    })
  } catch {
    return items
  }
}

async function fetchCmsVodDetail(api, detailId, fallbackName, fallbackPic) {
  if (!api || !detailId) throw new Error('缺少详情接口')
  const detailUrl = api + (api.includes('?') ? '&' : '?') + 'ac=detail&ids=' + encodeURIComponent(detailId)
  let json = await vodApiFetch(detailUrl)
  if (!json || !Array.isArray(json.list) || !json.list.length) {
    const altUrl = api + (api.includes('?') ? '&' : '?') + 'ac=videolist&ids=' + encodeURIComponent(detailId)
    json = await vodApiFetch(altUrl)
  }
  const item = json?.list?.[0]
  if (!item) throw new Error('未获取到详情')
  return {
    ...item,
    vod_id: item.vod_id || detailId,
    vod_name: item.vod_name || fallbackName,
    vod_pic: item.vod_pic || fallbackPic,
  }
}

async function fetchPageApiDetail(source, detailId, name, pic) {
  const base = source.key === 'ip51122' ? IP51122_DETAIL_BASE : source.key === 'a_napp03' ? NAPP03_BASE : source.api
  if (source.key === 'a_napp03') {
    const id = String(detailId || '').match(/vodId=(\d+)/i)?.[1] || String(detailId || '').match(/^(\d+)$/)?.[1]
    if (!id) throw new Error('天穹详情缺少 vodId')
    return loadNapp03Detail(id, name, pic)
  }
  if (source.key === 'ip51122') {
    const id = String(detailId || '').match(/\/detail\/(\d+)\.html/i)?.[1] || String(detailId || '').match(/^(\d+)$/)?.[1]
    if (!id) throw new Error('云岚详情缺少 vodId')
    return loadIp51122Detail(id, name, pic)
  }
  const urls = [
        `${base}/api.php/provide/vod/?ac=detail&ids=${encodeURIComponent(detailId)}`,
        `${base}/index.php/vod/detail/id/${encodeURIComponent(detailId)}.html`,
        `${base}/#/home/index?channelId=0`,
      ]
  for (const url of urls) {
    try {
      const html = await fetchYinghuaPage(url)
      const detail = await parsePageDetailFromHtml(html, base, detailId, name, pic)
      if (detail) return detail
    } catch {}
  }
  return null
}

async function parsePageDetailFromHtml(html, baseUrl, detailId, name, pic) {
  if (/403 Forbidden|openresty|Access Denied/i.test(html)) return null
  const title = decodeHtmlEntities((html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1] || name || '').trim())
  const desc = decodeHtmlEntities((html.match(/<div[^>]+class=["'][^"']*(?:desc|content|detail)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
  const poster = html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || pic || ''
  const episodeLinks = [...html.matchAll(/<a[^>]+href=["']([^"']*\/play\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(m => ({ name: decodeHtmlEntities(m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()), url: normalizeEpisodeUrl(m[1], baseUrl) }))
    .filter(ep => ep.url)
  const lines = episodeLinks.length ? [{ name: '默认线路', urls: episodeLinks }] : []
  if (!lines.length) return null
  return {
    vod_id: detailId,
    vod_name: title,
    vod_pic: poster,
    vod_content: desc,
    vod_play_from: lines.map(l => l.name).join('$$$'),
    vod_play_url: lines.map(l => l.urls.map(ep => `${ep.name}$${ep.url}`).join('#')).join('$$$'),
    _episodes: lines,
    _detailHtml: html,
  }
}

  async function showLibraryHome(initialQuery = '') {
    const content = el.querySelector('#t-content')
    const sources = [
      { key: 'a_napp03', name: A_NAPP03_SOURCE_NAME, desc: 'PC 实时入口，分类 / 搜索 / 播放列表', categories: NAPP03_CATEGORIES, groups: NAPP03_GROUPS, activeGroupId: 'home', loadCategories: loadNapp03Categories, list: loadAiyiCategory, search: searchAiyiNapp },
      { key: 'yinghua', name: YINGHUA_SOURCE_NAME, desc: '实时首页 / 动态分类 / 多线路播放', categories: YINGHUA_CATEGORIES, loadCategories: loadYinghuaCategories, list: loadYinghuaCategory, search: searchYinghua },
      { key: 'ip51122', name: IP51122_SOURCE_NAME, desc: '真实首页 / 搜索结果 / 详情页受原站防护限制', categories: PAGE_LIBRARY_CATEGORIES, loadCategories: loadIp51122Categories, list: loadIp51122Category, search: searchIp51122 },
    ]
    const KEY_LIBRARY_USER_STATE = 'xingshu_movie_library_user_state_v1'
    const readLibraryUserState = () => { try { return JSON.parse(localStorage.getItem(KEY_LIBRARY_USER_STATE) || '{}') || {} } catch { return {} } }
    const writeLibraryUserState = (patch = {}) => {
      try {
        const prev = readLibraryUserState()
        localStorage.setItem(KEY_LIBRARY_USER_STATE, JSON.stringify({ ...prev, ...patch }))
      } catch {}
    }
    const libraryUserState = readLibraryUserState()
    const defaultSource = sources[0]
    if (libraryUserState.groups && libraryUserState.groups[defaultSource.key] && defaultSource.groups?.some(g => g.id === libraryUserState.groups[defaultSource.key])) defaultSource.activeGroupId = libraryUserState.groups[defaultSource.key]
    let activeSourceKey = defaultSource.key
    let activeCategory = defaultSource.categories.find(c => c.id === libraryUserState.categories?.[defaultSource.key]) || defaultSource.categories[0]
    let libraryPage = 1
    let libraryQuery = String(initialQuery || '').trim()
    let napp03Filters = { sort: '综合', category: '', area: '', year: '', ...(libraryUserState.filters?.[defaultSource.key] || {}) }
    let libraryCursor = ''
    let libraryPaging = null
    let loadingToken = 0
    let activeLibraryView = 'home'
    const persistLibraryChoice = () => {
      const source = sources.find(src => src.key === activeSourceKey) || defaultSource
      writeLibraryUserState({
        view: activeLibraryView,
        sourceKey: activeSourceKey,
        groups: { ...(readLibraryUserState().groups || {}), [activeSourceKey]: source.activeGroupId || '' },
        categories: { ...(readLibraryUserState().categories || {}), [activeSourceKey]: activeCategory?.id || '' },
        filters: { ...(readLibraryUserState().filters || {}), [activeSourceKey]: { ...napp03Filters } },
      })
    }
    const resetLibraryPaging = () => {
      libraryPage = 1
      libraryCursor = ''
      libraryPaging = null
    }
    const getLibraryPageSize = () => {
      const main = content.querySelector('.tvbox-library-main') || content
      const box = content.querySelector('#library-list') || main
      const rect = box.getBoundingClientRect?.() || { top: 0, width: 0 }
      const width = Math.max(1, rect.width || box.clientWidth || main.clientWidth || window.innerWidth || 1200)
      const gap = 14
      const minCardWidth = 128
      const columns = Math.max(1, Math.floor((width + gap) / (minCardWidth + gap)))
      const cardWidth = (width - gap * (columns - 1)) / columns
      const cardHeight = cardWidth * 1.5 + 64
      const availableHeight = Math.max(cardHeight, (window.innerHeight || 760) - rect.top - 72)
      const rows = Math.max(1, Math.ceil((availableHeight + gap) / (cardHeight + gap)) + 1)
      return columns * rows
    }

    const sourceByKey = key => sources.find(s => s.key === key) || VOD_SOURCES.find(s => s.key === key) || sources[0]
    const refreshSourceCategories = async (source) => {
      if (!source?.loadCategories || source._categoriesLoaded) return source.categories
      try {
        const loaded = await withLibraryTimeout(source.loadCategories(), 12000)
        if (Array.isArray(loaded) && loaded.length) source.categories = loaded
        else if (loaded && Array.isArray(loaded.categories) && loaded.categories.length) {
          source.categories = loaded.categories
          if (Array.isArray(loaded.groups) && loaded.groups.length) source.groups = loaded.groups
        }
      } catch {}
      source._categoriesLoaded = true
      if (!source.categories.some(c => c.id === activeCategory?.id)) activeCategory = source.categories[0]
      if (source.groups && !source.groups.some(group => group.id === source.activeGroupId)) source.activeGroupId = source.groups[0]?.id
      return source.categories
    }
    const renderOriginFallback = (source, message = '') => {
      return '<div class="tvbox-empty tvbox-origin-fallback">' +
        '<div class="tvbox-empty-icon">🌐</div>' +
        '<div class="tvbox-empty-title">原站数据未接入成功</div>' +
        '<div class="tvbox-empty-sub">' + escHtml(message || '当前站点需要原站 SPA/API 或浏览器防护会话，内嵌模式已停用，避免黑屏误导。') + '</div>' +
      '</div>'
    }
    const renderNapp03Filters = (source) => {
      if (source.key !== 'a_napp03' || activeCategory?.unsupported || activeCategory?.typeId === 'home') return ''
      return '<div class="tvbox-library-filters">' + NAPP03_FILTERS.map(group => {
        const current = napp03Filters[group.key] || (group.key === 'sort' ? '综合' : '')
        const values = group.key === 'category' ? [''].concat(group.values) : [''].concat(group.values)
        return '<div class="tvbox-library-filter-row"><span>' + escHtml(group.label) + '</span>' + values.map(value => {
          const label = value || (group.key === 'sort' ? '综合' : '全部')
          const active = (value || (group.key === 'sort' ? '综合' : '')) === current
          return '<button class="tvbox-library-filter' + (active ? ' active' : '') + '" data-filter="' + escHtml(group.key) + '" data-value="' + escHtml(value || (group.key === 'sort' ? '综合' : '')) + '">' + escHtml(label) + '</button>'
        }).join('') + '</div>'
      }).join('') + '</div>'
    }
    const renderShell = () => {
      const source = sourceByKey(activeSourceKey)
      const libraryHistory = getSearchHistory().slice(0, 8)
      content.innerHTML = '<div class="tvbox-library-workspace">' +
        '<aside class="tvbox-library-sidebar">' +
          '<button class="tvbox-library-nav' + (activeLibraryView === 'home' ? ' active' : '') + '" data-view="home"><strong>星枢片库</strong><span>上次浏览 / 自动恢复</span></button>' +
          '<button class="tvbox-library-nav' + (activeLibraryView === 'follow' ? ' active' : '') + '" data-view="follow"><strong>我的追剧</strong><span>收藏视频 / 观看进度</span></button>' +
          '<button class="tvbox-library-nav' + (activeLibraryView === 'history' ? ' active' : '') + '" data-view="history"><strong>播放历史</strong><span>最近观看 / 播放记录</span></button>' +
          '<div class="tvbox-library-side-title">实时资源站点</div>' +
          '<div class="tvbox-library-side-sub">分类浏览</div>' +
          sources.map(s => '<button class="tvbox-library-source' + (activeLibraryView === 'home' && s.key === activeSourceKey ? ' active' : '') + '" data-source="' + escHtml(s.key) + '"><strong>' + escHtml(s.name) + '</strong><span>' + escHtml(s.desc) + '</span></button>').join('') +
        '</aside>' +
        '<main class="tvbox-library-main">' +
          '<div class="tvbox-library-toolbar">' +
            '<div><div class="tvbox-library-title">' + escHtml(source.name) + '</div><div class="tvbox-library-desc">' + escHtml(source.desc) + '</div></div>' +
            '<div class="tvbox-library-search"><input id="library-search-input" name="xingshu-library-search" type="search" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="搜索星枢片库 + 影视点播全部资源" value="' + escHtml(libraryQuery) + '" /><button id="library-search-btn">搜索</button></div>' +
          '</div>' +
          '<div class="tvbox-library-search-history"' + (libraryHistory.length ? '' : ' style="display:none"') + '>' + libraryHistory.map(q => '<span class="tvbox-library-search-chip"><button data-q="' + escHtml(q) + '">' + escHtml(q) + '</button><button class="remove" data-remove-q="' + escHtml(q) + '">×</button></span>').join('') + '</div>' +
          '<div class="tvbox-library-groups">' + (source.groups ? source.groups.map(group => '<button class="tvbox-library-group' + (group.id === (source.activeGroupId || source.groups[0]?.id) ? ' active' : '') + '" data-group="' + escHtml(group.id) + '">' + escHtml(group.name) + '</button>').join('') : '') + '</div>' +
          '<div class="tvbox-library-cats">' + source.categories.filter(cat => !source.groups || cat.groupId === (source.activeGroupId || source.groups[0]?.id)).map(cat => '<button class="tvbox-library-cat' + (cat.id === activeCategory.id ? ' active' : '') + '" data-cat="' + escHtml(cat.id) + '">' + escHtml(cat.name) + '</button>').join('') + '</div>' +
          renderNapp03Filters(source) +
          '<div id="library-list" class="tvbox-library-list"><div class="tvbox-loading"><div class="tvbox-loading-icon"></div><span class="tvbox-loading-text">' + escHtml(mt('loading')) + '</span></div></div>' +
        '</main>' +
      '</div>'

      content.querySelectorAll('.tvbox-library-nav').forEach(btn => btn.addEventListener('click', () => {
        activeLibraryView = btn.dataset.view || 'home'
        libraryQuery = ''
        persistLibraryChoice()
        resetLibraryPaging()
        renderShell()
        if (activeLibraryView === 'follow') renderLibraryFollowList()
        else if (activeLibraryView === 'history') renderLibraryHistoryList()
        else loadLibraryList()
      }))
      content.querySelectorAll('[data-q]').forEach(btn => btn.addEventListener('click', () => {
        activeLibraryView = 'home'
        libraryQuery = btn.dataset.q || ''
        persistLibraryChoice()
        resetLibraryPaging()
        renderShell()
        loadLibraryList()
      }))
      content.querySelectorAll('[data-remove-q]').forEach(btn => btn.addEventListener('click', e => {
        e.stopPropagation()
        removeSearchHistory(btn.dataset.removeQ || '')
        renderShell()
        if (activeLibraryView === 'follow') renderLibraryFollowList()
        else if (activeLibraryView === 'history') renderLibraryHistoryList()
        else loadLibraryList()
      }))
      content.querySelectorAll('.tvbox-library-source').forEach(btn => btn.addEventListener('click', async () => {
        activeLibraryView = 'home'
        activeSourceKey = btn.dataset.source
        const next = sourceByKey(activeSourceKey)
        const state = readLibraryUserState()
        if (state.groups && state.groups[activeSourceKey] && next.groups?.some(g => g.id === state.groups[activeSourceKey])) next.activeGroupId = state.groups[activeSourceKey]
        libraryQuery = ''
        renderShell()
        await refreshSourceCategories(next)
        const groupId = next.activeGroupId || next.groups?.[0]?.id
        activeCategory = next.categories.find(c => c.id === state.categories?.[activeSourceKey] && (!next.groups || c.groupId === groupId)) || next.categories.find(c => !next.groups || c.groupId === groupId) || next.categories[0]
        napp03Filters = { sort: '综合', category: '', area: '', year: '', ...(state.filters?.[activeSourceKey] || {}) }
        persistLibraryChoice()
        resetLibraryPaging()
        renderShell()
        loadLibraryList()
      }))
      content.querySelectorAll('.tvbox-library-group').forEach(btn => btn.addEventListener('click', () => {
        const source = sourceByKey(activeSourceKey)
        source.activeGroupId = btn.dataset.group
        activeCategory = source.categories.find(c => c.id === readLibraryUserState().categories?.[activeSourceKey] && c.groupId === source.activeGroupId) || source.categories.find(c => c.groupId === source.activeGroupId) || source.categories[0]
        persistLibraryChoice()
        resetLibraryPaging()
        libraryQuery = ''
        renderShell()
        loadLibraryList()
      }))
      content.querySelectorAll('.tvbox-library-cat').forEach(btn => btn.addEventListener('click', () => {
        const source = sourceByKey(activeSourceKey)
        activeCategory = source.categories.find(c => c.id === btn.dataset.cat) || source.categories[0]
        persistLibraryChoice()
        resetLibraryPaging()
        libraryQuery = ''
        renderShell()
        loadLibraryList()
      }))
      content.querySelectorAll('.tvbox-library-filter').forEach(btn => btn.addEventListener('click', () => {
        const key = btn.dataset.filter
        if (!key) return
        napp03Filters[key] = btn.dataset.value || ''
        if (key !== 'sort' && napp03Filters[key] === '全部') napp03Filters[key] = ''
        persistLibraryChoice()
        resetLibraryPaging()
        libraryQuery = ''
        renderShell()
        loadLibraryList()
      }))
      content.querySelector('#library-search-btn')?.addEventListener('click', () => {
        libraryQuery = content.querySelector('#library-search-input')?.value.trim() || ''
        if (libraryQuery) addSearchHistory(libraryQuery)
        activeLibraryView = 'home'
        persistLibraryChoice()
        resetLibraryPaging()
        renderShell()
        loadLibraryList()
      })
      content.querySelector('#library-search-input')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          libraryQuery = e.currentTarget.value.trim()
          if (libraryQuery) addSearchHistory(libraryQuery)
          activeLibraryView = 'home'
          persistLibraryChoice()
          resetLibraryPaging()
          renderShell()
          loadLibraryList()
        }
      })
    }

    const scrollLibraryTop = () => {
      const main = content.querySelector('.tvbox-library-main')
      const list = content.querySelector('#library-list')
      try { (main || list || content).scrollIntoView({ behavior: 'smooth', block: 'start' }) } catch {}
      if (main) main.scrollTop = 0
    }

    const renderVodCard = (item, source) => {
      const itemSourceName = item._librarySourceName || source.name
      const itemSourceKey = item._librarySourceKey || source.key
      const itemApi = item._libraryApi || ''
      const title = escHtml(item.vod_name || item.name || mt('unnamed'))
      const detailId = escHtml((itemSourceKey === 'ip51122' && item._detailUrl) ? item._detailUrl : (item.vod_id || item._detailUrl || ''))
      const poster = renderPosterImg(item.vod_pic || '', item.vod_name || '', itemSourceKey, itemApi || (source.key === 'yinghua' ? YINGHUA_BASE : source.key === 'a_napp03' ? NAPP03_BASE : IP51122_DETAIL_BASE), '影')
      const note = escHtml(item.vod_remarks || item.type_name || item.vod_year || '')
      const followed = isFollowed({ sourceKey: itemSourceKey, api: itemApi, detailId: itemSourceKey === 'ip51122' && item._detailUrl ? item._detailUrl : (item.vod_id || item._detailUrl || ''), name: item.vod_name || item.name, sourceName: itemSourceName })
      const isTopicEntry = item._libraryAction === 'napp03-url-list'
      return '<article class="tvbox-library-vod' + (isTopicEntry ? ' tvbox-library-topic' : '') + '" data-source="' + escHtml(source.key) + '" data-item-source="' + escHtml(itemSourceKey) + '" data-api="' + escHtml(itemApi) + '" data-source-name="' + escHtml(itemSourceName) + '" data-detail="' + detailId + '" data-action="' + escHtml(item._libraryAction || '') + '" data-name="' + title + '" data-pic="' + escHtml(item.vod_pic || '') + '" data-desc="' + escHtml(item.vod_content || item.desc || item.content || '') + '" data-year="' + escHtml(item.vod_year || '') + '" data-area="' + escHtml(item.vod_area || '') + '" data-type="' + escHtml(item.type_name || '') + '" data-actor="' + escHtml(item.vod_actor || '') + '">' +
        '<button class="tvbox-library-vod-poster">' + poster + (note ? '<span>' + note + '</span>' : '') + '</button>' +
        '<div class="tvbox-library-vod-title">' + title + '</div>' +
        '<div class="tvbox-library-vod-meta">' + escHtml(isTopicEntry ? (item.type_name || '子频道') : itemSourceName) + '</div>' +
        '<div class="tvbox-library-card-actions">' + (isTopicEntry ? '<button data-open-saved>进入频道</button>' : '<button data-open-saved>播放详情</button><button data-follow-card>' + (followed ? '已追剧' : '追剧') + '</button>') + '</div>' +
      '</article>'
    }

    function startTopicCoverRotators(root) {
      const cards = Array.from(root.querySelectorAll('.tvbox-library-topic[data-action="napp03-url-list"]')).slice(0, 36)
      const loadCard = async card => {
        if (!card || card.dataset.coverRotator === '1') return
        card.dataset.coverRotator = '1'
        const detail = card.dataset.detail || ''
        const title = card.dataset.name || ''
        if (!detail) return
        try {
          const result = await withLibraryTimeout(loadNapp03UrlList(detail, title, ''), 12000)
          const pics = []
          for (const item of (result.list || [])) {
            for (const pic of buildPicCandidates(item.vod_pic || item.pic || '', item._srcKey || 'a_napp03', item._api || NAPP03_API_CACHE_BASE)) {
              if (pic && !pics.includes(pic)) pics.push(pic)
              if (pics.length >= 8) break
            }
            if (pics.length >= 8) break
          }
          if (!(result.list || []).length) { card.remove(); return }
          if (!pics.length || !card.isConnected) return
          const poster = card.querySelector('.tvbox-library-vod-poster')
          if (!poster) return
          const labelText = poster.querySelector(':scope > span')?.textContent || card.dataset.type || '频道'
          const img = document.createElement('img')
          img.alt = title
          img.loading = 'lazy'
          img.decoding = 'async'
          img.referrerPolicy = 'no-referrer'
          img.src = pics[0]
          poster.innerHTML = ''
          poster.appendChild(img)
          if (labelText) {
            const label = document.createElement('span')
            label.textContent = labelText
            poster.appendChild(label)
          }
          if (pics.length <= 1) return
          let index = 0
          const timer = setInterval(() => {
            if (!card.isConnected) { clearInterval(timer); return }
            index = (index + 1) % pics.length
            img.src = pics[index]
          }, 3000)
        } catch (err) {
          card.dataset.coverRotator = 'failed'
          console.warn('[movie] 频道轮播封面加载失败:', title, err?.message || err)
        }
      }
      if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(entries => {
          entries.forEach(entry => {
            if (!entry.isIntersecting) return
            observer.unobserve(entry.target)
            loadCard(entry.target)
          })
        }, { root: root.closest('.tvbox-library-main') || null, rootMargin: '160px' })
        cards.forEach(card => observer.observe(card))
      } else {
        cards.forEach(loadCard)
      }
    }

    const renderLibraryEntryGrid = (title, subtitle, items, emptyText, modeName) => {
      const box = content.querySelector('#library-list')
      if (!box) return
      if (!items.length) {
        box.innerHTML = '<div class="tvbox-empty"><div class="tvbox-empty-title">' + escHtml(emptyText) + '</div><div class="tvbox-empty-sub">搜索或播放后这里会自动记录，方便继续观看。</div></div>'
        return
      }
      const clearHistoryButton = modeName === 'history' ? '<button id="library-clear-history" class="tvbox-clear-btn tvbox-clear-danger">清空历史</button>' : ''
      box.innerHTML = '<section class="tvbox-library-section"><div class="tvbox-library-section-head"><h3>' + escHtml(title) + '</h3><span>' + escHtml(subtitle) + '</span>' + clearHistoryButton + '</div><div class="tvbox-library-card-grid">' + items.map((entry, entryIdx) => {
        const latest = entry._history || getLatestPlayForVod(entry)
        const current = Number(latest?.progress) || 0
        const duration = Number(latest?.duration) || 0
        const progress = duration > 0 ? Math.min(100, Math.round(current / duration * 100)) : 0
        const timeText = current > 0 ? (duration > 0 ? fmtVodTime(current) + ' / ' + fmtVodTime(duration) : fmtVodTime(current)) : ''
        return '<article class="tvbox-library-vod tvbox-library-saved" data-entry-idx="' + entryIdx + '" data-source="' + escHtml(entry.sourceKey || 'a_napp03') + '" data-item-source="' + escHtml(entry.sourceKey || '') + '" data-api="' + escHtml(entry.api || '') + '" data-source-name="' + escHtml(entry.sourceName || entry.source || '') + '" data-detail="' + escHtml(entry.detailId || entry.id || '') + '" data-action="' + escHtml(entry.action || '') + '" data-name="' + escHtml(entry.name || '') + '" data-pic="' + escHtml(entry.pic || '') + '" data-play-url="' + escHtml(latest?.epUrl || '') + '" data-play-ep="' + escHtml(latest?.epName || '') + '" data-play-duration="' + escHtml(duration || 0) + '" data-desc="' + escHtml(entry.desc || entry.vod_content || '') + '" data-year="' + escHtml(entry.year || entry.vod_year || '') + '" data-area="' + escHtml(entry.area || entry.vod_area || '') + '" data-type="' + escHtml(entry.type || entry.type_name || '') + '">' +
          '<button class="tvbox-library-vod-poster">' + renderPosterImg(entry.pic || '', entry.name || '', entry.sourceKey || '', entry.api || '', '影') + (latest?.epName ? '<span>看到 ' + escHtml(latest.epName) + '</span>' : '') + '</button>' +
          '<div class="tvbox-library-vod-title">' + escHtml(entry.name || '未命名') + '</div>' +
          '<div class="tvbox-library-vod-meta">' + escHtml((entry.sourceName || entry.source || '星枢片库') + (latest?.epName ? ' · 有观看进度' : '')) + '</div>' +
          (progress ? '<div class="tvbox-library-progress"><i style="width:' + progress + '%"></i></div><div class="tvbox-library-progress-time">' + escHtml(timeText) + '</div>' : '') +
          '<div class="tvbox-library-card-actions"><button data-play-saved>播放</button><button data-open-saved>播放详情</button>' + (modeName === 'history' ? '<button data-delete-history>删除</button>' : '') + (modeName === 'follow' ? '<button data-remove-follow="' + escHtml(entry.followKey || followKey(entry)) + '">取消追剧</button>' : '') + '</div>' +
        '</article>'
      }).join('') + '</div></section>'
      bindLibraryResult(box, sourceByKey(activeSourceKey), {})
      box.querySelector('#library-clear-history')?.addEventListener('click', e => {
        e.stopPropagation()
        if (confirm('确定清空全部播放历史？')) { clearPlayHistory(); renderLibraryHistoryList() }
      })
      box.querySelectorAll('[data-delete-history]').forEach(btn => btn.addEventListener('click', e => {
        e.stopPropagation()
        const card = btn.closest('.tvbox-library-vod')
        const entry = items[Number(card?.dataset.entryIdx || -1)] || null
        const latest = entry?._history || (entry ? getLatestPlayForVod(entry) : null)
        if (latest && confirm('删除这条播放历史？')) { removePlayHistoryItem(latest); renderLibraryHistoryList() }
      }))
      box.querySelectorAll('[data-play-saved]').forEach(btn => btn.addEventListener('click', async e => {
        e.stopPropagation()
        const card = btn.closest('.tvbox-library-vod')
        const entry = items[Number(card?.dataset.entryIdx || -1)] || null
        const latest = entry?._history || (entry ? getLatestPlayForVod(entry) : null)
        const playUrl = latest?.epUrl || card?.dataset.playUrl || ''
        if (!card || !playUrl) { alert('没有可播放地址。'); return }
        const savedUrls = Array.isArray(latest?.allUrls) && latest.allUrls.length ? latest.allUrls : (Array.isArray(entry?.allUrls) && entry.allUrls.length ? entry.allUrls : [playUrl])
        const savedEps = Array.isArray(latest?.allEps) && latest.allEps.length ? latest.allEps : (Array.isArray(entry?.allEps) && entry.allEps.length ? entry.allEps : savedUrls.map((u, i) => ({ epName: i === 0 ? (latest?.epName || card.dataset.playEp || '播放') : '线路 ' + (i + 1), url: u })))
        const sourceName = latest?.source || entry?.sourceName || entry?.source || card.dataset.sourceName || 'vod_history'
        const epName = latest?.epName || card.dataset.playEp || ''
        const savedLines = Array.isArray(latest?.allLines) && latest.allLines.length ? latest.allLines : (Array.isArray(entry?.allLines) && entry.allLines.length ? entry.allLines : [{ name: sourceName || '当前线路', urls: savedEps.map(e => ({ name: e.epName || e.name || '播放', url: e.url })) }])
        const detailMeta = await resolveEntryDetailMeta(entry, card)
        upsertPlayHistory({
          id: card.dataset.detail, name: card.dataset.name, pic: card.dataset.pic,
          source: sourceName, epName,
          epUrl: playUrl, progress: 0, duration: Number(card.dataset.playDuration || latest?.duration || 0),
          allUrls: savedUrls, allEps: savedEps, allLines: savedLines,
          desc: detailMeta.desc, vod_content: detailMeta.desc,
          sourceKey: detailMeta.sourceKey || card.dataset.source || entry?.sourceKey || '', api: detailMeta.api || card.dataset.api || entry?.api || '', detailId: card.dataset.detail,
        })
        openPlayerVod(card.dataset.name, playUrl, card.dataset.detail, sourceName, epName, card.dataset.pic, savedUrls, 0, savedEps, savedLines, 0, detailMeta)
      }))
      box.querySelectorAll('[data-remove-follow]').forEach(btn => btn.addEventListener('click', e => {
        e.stopPropagation()
        removeFollowByKey(btn.dataset.removeFollow || '')
        renderLibraryFollowList()
      }))
    }

    async function resolveEntryDetailMeta(entry, card) {
      const sourceKey = card?.dataset?.itemSource || card?.dataset?.source || entry?.sourceKey || entry?._history?._srcKey || entry?._history?.sourceKey || ''
      const apiValue = card?.dataset?.api || entry?.api || entry?._history?._api || entry?._history?.api || ''
      const directDesc = card?.dataset?.desc || entry?.desc || entry?.vod_content || entry?._history?.desc || entry?._history?.vod_content || ''
      if (directDesc) return { desc: directDesc, year: card?.dataset?.year || entry?.year || entry?.vod_year || '', area: card?.dataset?.area || entry?.area || entry?.vod_area || '', type: card?.dataset?.type || entry?.type || entry?.type_name || '', actor: entry?.actor || entry?.vod_actor || '', sourceKey, api: apiValue }
      const detail = card?.dataset?.detail || entry?.detailId || entry?.id || entry?._history?.detailId || entry?._history?.id || ''
      if (!detail) return { desc: '', year: '', area: '', type: '', actor: '', sourceKey, api: apiValue }
      try {
        const source = sourceByKey(sourceKey)
        const api = apiValue
        const name = card?.dataset?.name || entry?.name || entry?._history?.name || ''
        const pic = card?.dataset?.pic || entry?.pic || entry?._history?.pic || ''
        let resolved = null
        if ((source?.key === 'a_napp03') || (card?.dataset?.itemSource === 'a_napp03')) resolved = await withLibraryTimeout(fetchPageApiDetail(sourceByKey('a_napp03'), detail, name, pic), 12000)
        else if (api && (card?.dataset?.itemSource || entry?.sourceKey) !== 'ip51122') resolved = await withLibraryTimeout(fetchCmsVodDetail(api, detail, name, pic), 12000)
        else if (source?.key === 'yinghua') resolved = await withLibraryTimeout(openYinghuaDetail({ vod_id: detail, vod_name: name, vod_pic: pic, _detailUrl: entry?.detailUrl || entry?._history?.detailUrl || '' }), 12000)
        else resolved = await withLibraryTimeout(fetchPageApiDetail(source, detail, name, pic), 12000)
        return { desc: resolved?.vod_content || resolved?.desc || resolved?.content || '', year: resolved?.vod_year || '', area: resolved?.vod_area || '', type: resolved?.type_name || '', actor: resolved?.vod_actor || '', sourceKey, api: apiValue }
      } catch (err) {
        console.warn('[movie] 历史/追剧详情简介补全失败:', err?.message || err)
        return { desc: '', year: '', area: '', type: '', actor: '', sourceKey, api: apiValue }
      }
    }

    const renderLibraryFollowList = () => renderLibraryEntryGrid('我的追剧', '收藏的视频会结合播放进度显示观看状态', getFollowList(), '还没有追剧收藏', 'follow')
    const renderLibraryHistoryList = () => {
      const rows = getPlayHistory().map(h => ({
        sourceKey: h._srcKey || h.sourceKey || '',
        api: h._api || h.api || '',
        sourceName: h.source || '',
        source: h.source || '',
        detailId: h.detailId || h.id,
        name: h.name || h.epName || '未命名',
        pic: h.pic || '',
        id: h.id,
        detailUrl: h.detailUrl || '',
        allUrls: h.allUrls || [], allEps: h.allEps || [], allLines: h.allLines || [],
        _history: h,
      }))
      const seen = new Set()
      const items = rows.filter(item => {
        const key = followKey(item)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      }).slice(0, 60)
      renderLibraryEntryGrid('播放历史', '按最近观看排序，可继续打开详情播放', items, '暂无播放历史', 'history')
    }

    const renderCards = (items, source, result = {}) => {
      if (!items.length) return '<div class="tvbox-empty"><div class="tvbox-empty-title">暂无可显示内容</div><div class="tvbox-empty-sub">该站点实时返回为空或防护未通过，没有使用离线兜底。</div></div>'
      const currentPage = result.page || 1
      const knownPage = Math.max(currentPage, Number(String(result.next || '').match(/page=(\d+)/i)?.[1] || currentPage))
      const metaText = result.hasMore ? '第 ' + currentPage + ' 页 / 已知至少 ' + knownPage + ' 页 · 本页 ' + items.length + ' 条' : '第 ' + currentPage + ' 页 · 已显示全部 · 本页 ' + items.length + ' 条'
      const rawSections = Array.isArray(result.sections) ? result.sections : []
      const restoredSections = rawSections.map(section => ({ ...section, title: (section?.title === '推荐模块 1' || section?.title === '推荐模块1') ? '每日推荐' : section?.title }))
      const priorityTitles = new Set(['轮播推荐', '每日推荐'])
      const prioritySections = restoredSections.filter(section => priorityTitles.has(section?.title))
      const normalSections = restoredSections.filter(section => !priorityTitles.has(section?.title))
      const realtimeIndex = normalSections.findIndex(section => /实时.*观看|观看.*推荐|实时|正在看|热播/i.test(String(section?.title || '')))
      const visibleSections = realtimeIndex >= 0
        ? normalSections.slice(0, realtimeIndex + 1).concat(prioritySections, normalSections.slice(realtimeIndex + 1))
        : normalSections.slice(0, 1).concat(prioritySections, normalSections.slice(1))
      const sectionsHtml = visibleSections.length
        ? visibleSections.map(section => '<section class="tvbox-library-section"><div class="tvbox-library-section-head"><h3>' + escHtml(section.title || '推荐') + '</h3><div>' + (section.url ? '<button class="tvbox-library-more" data-url="' + escHtml(section.url) + '" data-title="' + escHtml(section.title || '专题') + '">更多</button>' : '<span>' + escHtml(String((section.list || []).length)) + ' 条</span>') + '</div></div><div class="tvbox-library-card-grid">' + (section.list || []).map(item => renderVodCard(item, source)).join('') + '</div></section>').join('')
        : '<div class="tvbox-library-card-grid">' + items.map(item => renderVodCard(item, source)).join('') + '</div>'
      const pager = '<div class="tvbox-library-pager"><button id="library-prev" ' + (currentPage <= 1 ? 'disabled' : '') + '>上一页</button><span>' + escHtml(metaText) + '</span><label class="tvbox-library-jump">跳到 <input id="library-page-jump" type="number" min="1" value="' + escHtml(String(currentPage)) + '" /> 页</label><button id="library-page-go">跳转</button><button id="library-next" ' + (!result.hasMore ? 'disabled' : '') + '>下一页</button></div>'
      return sectionsHtml + pager
    }

    const toInternalMediaUrl = (url) => {
      const value = String(url || '').trim()
      if (/^https:\/\/(?:[^/]+\.)?surrit\.com\//i.test(value)) return 'http://127.0.0.1:18188/hls-proxy?u=' + encodeURIComponent(value)
      return value
    }

    const openPrivateLibraryPlayer = async (url, title, pic = '') => {
      const detail = await fetchMissavDetail(url)
      const results = (detail.playUrls || []).filter(x => x?.url && isDirectVideoUrl(x.url))
      if (!results.length) throw new Error('当前资源暂不可播放')
      const eps = results.map((x, index) => ({ name: x.name || ('线路 ' + (index + 1)), url: toInternalMediaUrl(x.url) }))
      const urls = eps.map(x => x.url)
      closePlayer()
      await playCrawlVideo(title || '精选内容', urls[0], 0, eps, urls, true)
    }

    const openLibraryDetail = async (card) => {
      if ((card.dataset.itemSource || card.dataset.source) === 'missav') {
        const detailUrl = card.dataset.detail || card.dataset.url || ''
        const overlay = el.querySelector('#t-player-overlay')
        const body = el.querySelector('#t-player-body')
        const title = el.querySelector('#t-player-title')
        try {
          if (!detailUrl) throw new Error('未找到详情页')
          if (overlay && body) {
            if (title) title.textContent = card.dataset.name || '精选内容'
            overlay.style.display = 'flex'
            body.innerHTML = '<div class="tvbox-player-loading">正在解析播放...</div>'
          }
          await openPrivateLibraryPlayer(detailUrl, card.dataset.name || '精选内容', card.dataset.pic || '')
          return
        } catch (e) {
          if (body) body.innerHTML = '<div class="tvbox-playback-error"><div class="tvbox-playback-error-title">独立播放器打开失败</div><div>' + escHtml(e?.message || '未知错误') + '</div></div>'
          return
        }
      }
      const source = sourceByKey(card.dataset.itemSource || card.dataset.source)
      const detail = card.dataset.detail
      if (!detail) return alert('缺少详情地址')
      if (card.dataset.action === 'napp03-url-list') {
        const box = content.querySelector('#library-list')
        if (!box) return
        const title = card.dataset.name || '专题'
        resetLibraryPaging()
        libraryPaging = { mode: 'napp03-url-list', sourceKey: source.key, rawUrl: detail, title, items: [], nextCursor: '', exhausted: false }
        await loadPagedLibraryResult(box, source)
        return
      }
      try {
        let resolved
        if (source.key === 'a_napp03' || card.dataset.itemSource === 'a_napp03') resolved = await withLibraryTimeout(fetchPageApiDetail(sourceByKey('a_napp03'), detail, card.dataset.name, card.dataset.pic), 12000)
        else if (card.dataset.api && card.dataset.itemSource !== 'ip51122') resolved = await fetchCmsVodDetail(card.dataset.api, detail, card.dataset.name, card.dataset.pic)
        else resolved = source.key === 'yinghua'
          ? await withLibraryTimeout(openYinghuaDetail({ vod_id: detail, vod_name: card.dataset.name, vod_pic: card.dataset.pic, _detailUrl: `${YINGHUA_BASE}/index.php/vod/detail/id/${detail}.html` }), 12000)
          : await withLibraryTimeout(fetchPageApiDetail(source, detail, card.dataset.name, card.dataset.pic), 12000)
        if (!resolved) throw new Error('详情页未解析到播放列表')
        return showEpisodePicker(resolved, card.dataset.sourceName || source.name)
      } catch (e) {
        const overlay = el.querySelector('#t-player-overlay')
        const body = el.querySelector('#t-player-body')
        const title = el.querySelector('#t-player-title')
        if (overlay && body) {
          if (title) title.textContent = card.dataset.name || '详情加载失败'
          overlay.style.display = 'flex'
          body.innerHTML = '<div class="tvbox-playback-error"><div class="tvbox-playback-error-title">' + escHtml(e.message || mt('loadFailed')) + '</div></div>'
        } else {
          alert(e.message || mt('loadFailed'))
        }
      }
    }

    const searchLibraryFallbackSources = async (keyword) => {
      const results = []
      const seen = new Set()
      await Promise.allSettled(sources.map(async source => {
        try {
          const json = await source.search(keyword, libraryPage)
          for (const item of (json?.list || [])) {
            if (!movieNameMatches(item, keyword)) continue
            const key = source.key + ':' + (item.vod_id || item._detailUrl || item.vod_name)
            if (seen.has(key)) continue
            seen.add(key)
            results.push({ ...item, _librarySourceName: source.name, _librarySourceKey: source.key, _libraryApi: '' })
          }
        } catch {}
      }))
      await Promise.allSettled(VOD_SOURCES.filter(source => !sources.some(s => s.key === source.key)).map(async source => {
        try {
          const qe = encodeURIComponent(keyword)
          let json = { list: [] }
          try { json = await fetchJSONFast(source.api + '?ac=videolist&wd=' + qe + '&pg=' + libraryPage) } catch {}
          if (!json.list?.length) { try { json = await fetchJSONFast(source.api + '?ac=videolist&zm=' + qe + '&pg=' + libraryPage) } catch {} }
          if (!json.list?.length) { try { json = await fetchJSONFast(source.api + '?ac=detail&wd=' + qe) } catch {} }
          for (const raw of (json?.list || [])) {
            const item = normalizeVodItem(raw, source)
            if (!movieNameMatches(item, keyword)) continue
            const key = source.key + ':' + (item.vod_id || item._detailUrl || item.vod_name)
            if (seen.has(key)) continue
            seen.add(key)
            results.push({ ...item, _librarySourceName: source.name, _librarySourceKey: source.key, _libraryApi: source.api || '' })
          }
        } catch {}
      }))
      try {
        const missav = await fetchMissavPage('/search/' + encodeURIComponent(keyword), { mergePages: false })
        for (const item of (missav.items || [])) {
          const key = 'missav:' + (item._missavUrl || item.vod_id || item.vod_name)
          if (seen.has(key)) continue
          seen.add(key)
          results.push({
            ...item,
            vod_id: item._missavUrl || item.vod_id,
            _detailUrl: item._missavUrl || item.vod_id,
            _librarySourceName: '精品专区',
            _librarySourceKey: 'missav',
            _libraryApi: '',
          })
        }
      } catch (err) {
        console.warn('[movie] MISSAV 搜索失败:', err?.message || err)
      }
      return { list: results, total: results.length, page: libraryPage, hasMore: results.length >= (sources.length + VOD_SOURCES.length) * 8 }
    }

    const withLibraryTimeout = (promise, ms = 15000) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('实时站点响应超时：当前源或代理链路较慢，请重新加载或稍后再试')), ms)),
    ])

    const bindLibraryResult = (box, source, result) => {
      box.querySelectorAll('.tvbox-library-more').forEach(btn => btn.addEventListener('click', async () => {
        const title = btn.dataset.title || '专题'
        resetLibraryPaging()
        libraryPaging = { mode: 'napp03-url-list', sourceKey: source.key, rawUrl: btn.dataset.url, title, items: [], nextCursor: '', exhausted: false }
        await loadPagedLibraryResult(box, source)
      }))
      box.querySelectorAll('[data-follow-card]').forEach(btn => btn.addEventListener('click', e => {
        e.stopPropagation()
        const card = btn.closest('.tvbox-library-vod')
        if (!card) return
        upsertFollow({ sourceKey: card.dataset.itemSource || card.dataset.source, sourceName: card.dataset.sourceName, api: card.dataset.api, detailId: card.dataset.detail, action: card.dataset.action, name: card.dataset.name, pic: card.dataset.pic, desc: card.dataset.desc || '', vod_content: card.dataset.desc || '', year: card.dataset.year || '', vod_year: card.dataset.year || '', area: card.dataset.area || '', vod_area: card.dataset.area || '', type: card.dataset.type || '', type_name: card.dataset.type || '', actor: card.dataset.actor || '', vod_actor: card.dataset.actor || '' })
        btn.textContent = '已追剧'
        btn.classList.add('active')
      }))
      box.querySelectorAll('.tvbox-library-vod').forEach(card => card.addEventListener('click', e => {
        if (e.target.closest('[data-follow-card], [data-remove-follow]')) return
        openLibraryDetail(card)
      }))
      startTopicCoverRotators(box)
      box.querySelector('#library-prev')?.addEventListener('click', async () => {
        if (libraryPage <= 1) return
        libraryPage--
        await loadPagedLibraryResult(box, source)
      })
      box.querySelector('#library-next')?.addEventListener('click', async () => {
        if (!result?.hasMore) return
        libraryPage++
        await loadPagedLibraryResult(box, source)
      })
      box.querySelector('#library-page-go')?.addEventListener('click', async () => {
        await jumpLibraryPage(box, source, box.querySelector('#library-page-jump')?.value)
      })
      box.querySelector('#library-page-jump')?.addEventListener('keydown', async e => {
        if (e.key === 'Enter') await jumpLibraryPage(box, source, e.currentTarget.value)
      })
    }

    const loadPagedLibraryResult = async (box, source) => {
      if (!libraryPaging) return loadLibraryList()
      box.innerHTML = '<div class="tvbox-loading"><div class="tvbox-loading-icon"></div><span class="tvbox-loading-text">正在加载第 ' + libraryPage + ' 页...</span></div>'
      try {
        const pageSize = getLibraryPageSize()
        const needCount = libraryPage * pageSize
        libraryPaging.items = libraryPaging.items || []
        while (libraryPaging.items.length < needCount && !libraryPaging.exhausted) {
          const cursor = libraryPaging.nextCursor || ''
          const result = libraryPaging.mode === 'napp03-url-list'
            ? await withLibraryTimeout(loadNapp03UrlList(libraryPaging.rawUrl, libraryPaging.title, cursor), 18000)
            : await withLibraryTimeout(source.list(activeCategory, libraryPage, { ...napp03Filters, cursor }), 18000)
          libraryPaging.items.push(...(result.list || []))
          libraryPaging.nextCursor = result.next || ''
          if (!result.hasMore || !result.next) libraryPaging.exhausted = true
          if (!(result.list || []).length) break
        }
        const pageItems = libraryPaging.items.slice((libraryPage - 1) * pageSize, libraryPage * pageSize)
        const result = {
          list: pageItems,
          page: libraryPage,
          next: libraryPaging.nextCursor || '',
          hasMore: libraryPaging.items.length > libraryPage * pageSize || Boolean(libraryPaging.nextCursor),
        }
        if (libraryPaging.mode === 'napp03-url-list') box.innerHTML = '<div class="tvbox-library-subtitle">' + escHtml(libraryPaging.title) + '</div>' + renderCards(pageItems, source, result)
        else box.innerHTML = renderCards(pageItems, source, result)
        bindLibraryResult(box, source, result)
        scrollLibraryTop()
      } catch (e) {
        box.innerHTML = renderOriginFallback(source, e.message || '该页面暂未接入') || '<div class="tvbox-empty tvbox-library-error"><div class="tvbox-empty-title">实时加载失败</div><div class="tvbox-empty-sub">' + escHtml(e.message || mt('loadFailed')) + '</div></div>'
      }
    }

    const jumpLibraryPage = async (box, source, targetPage) => {
      const target = Math.max(1, Number(targetPage) || 1)
      if (!libraryPaging || target === libraryPage) return
      libraryPage = target
      await loadPagedLibraryResult(box, source)
    }

    const loadLibraryList = async () => {
      const source = sourceByKey(activeSourceKey)
      const box = content.querySelector('#library-list')
      if (!box) return
      box.innerHTML = '<div class="tvbox-loading"><div class="tvbox-loading-icon"></div><span class="tvbox-loading-text">正在加载实时片库...</span></div>'
      try {
        let result = libraryQuery ? { list: [], total: 0, page: libraryPage } : null
        if (libraryQuery) {
          result = await withLibraryTimeout(searchLibraryFallbackSources(libraryQuery), 18000).catch(() => ({ list: [] }))
          result.page = libraryPage
        } else if (source.key === 'a_napp03' && activeCategory?.typeId !== 'home') {
          if (!libraryPaging || libraryPaging.mode !== 'napp03-category') {
            libraryPaging = { mode: 'napp03-category', sourceKey: source.key, items: [], nextCursor: '', exhausted: false }
          }
          await loadPagedLibraryResult(box, source)
          return
        } else {
          result = await withLibraryTimeout(source.list(activeCategory.typeId, libraryPage, {}), 18000)
          result.page = libraryPage
        }
        const allItems = Array.isArray(result?.list) ? result.list : []
        const pageSize = getLibraryPageSize()
        const start = (libraryPage - 1) * pageSize
        const items = allItems.slice(start, start + pageSize)
        const displayResult = { ...result, list: items, page: libraryPage, hasMore: allItems.length > start + pageSize || Boolean(result?.hasMore) }
        if (!items.length && result?.message) {
          box.innerHTML = renderOriginFallback(source, result.message) || '<div class="tvbox-empty"><div class="tvbox-empty-title">暂无可显示内容</div><div class="tvbox-empty-sub">' + escHtml(result.message) + '</div></div>'
          return
        }
        box.innerHTML = renderCards(items, source, displayResult)
        bindLibraryResult(box, source, displayResult)
        scrollLibraryTop()
      } catch (e) {
        box.innerHTML = '<div class="tvbox-empty tvbox-library-error"><div class="tvbox-empty-title">实时加载失败</div><div class="tvbox-empty-sub">' + escHtml(e.message || mt('loadFailed')) + '</div><button class="tvbox-library-retry" id="library-retry">重新加载</button></div>'
        box.querySelector('#library-retry')?.addEventListener('click', loadLibraryList)
      }
    }

    renderShell()
    refreshSourceCategories(sourceByKey(activeSourceKey)).then(() => {
      renderShell()
      loadLibraryList()
    })
  }

  async function showEpisodePicker(item, sourceName) {
    const warmup = warmUpEpisodeSources(item).catch(() => {})
    const overlay = el.querySelector('#t-player-overlay')
    const body = el.querySelector('#t-player-body')
    el.querySelector('#t-player-title').textContent = item.vod_name
    el.querySelector('#t-ext-link').href = '#'
    const episodes = item._episodes || parsePlaylist(item.vod_play_from, item.vod_play_url)
    const hist = getPlayHistory().find(h => h.id == item.vod_id && h.source === sourceName)
    playingEp = null

    // ── 豆瓣评分异步获取 ───────────────────────────────
    let doubanRating = ''
    try {
      const controller = AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined
      const r = await fetch('https://api.douban.com/v2/movie/search?q=' + encodeURIComponent(item.vod_name), controller ? { signal: controller } : undefined)
      const d = await r.json().catch(() => null)
      const score = d?.subjects?.[0]?.rating?.average
      if (score && score > 0) doubanRating = mt('doubanRating', { score })
    } catch {}

    // 优先选择包含直接 m3u8 的源
    let preferredSi = 0
    if (episodes.length > 1) {
      const scored = episodes.map((e, i) => {
        const hasDirectM3u8 = e.urls.some(u => u.url.includes('.m3u8') && !u.url.includes('/share/'))
        const hasShare = e.urls.some(u => u.url.includes('/share/'))
        return { i, score: hasDirectM3u8 ? 2 : hasShare ? 1 : 0 }
      })
      scored.sort((a, b) => b.score - a.score)
      preferredSi = scored[0].i
    }

    const backBtn = '<div style="margin-bottom:12px"><button class="tvbox-back-btn" id="t-detail-back">' + escHtml(mt('backToList')) + '</button></div>'
    const firstUrls = episodes[preferredSi]?.urls || []
    const siHtml = episodes.length > 1
      ? '<section class="tvbox-line-panel"><div class="tvbox-line-panel-head"><span>' + escHtml(mt('selectSource')) + '</span><em>' + episodes.length + ' 条线路</em></div><div class="tvbox-line-tabs">' +
          episodes.map((e, i) => {
            const meta = [e.tag, e.tips, e.total ? `${e.total}集` : ''].filter(Boolean).join(' · ')
            return '<button class="tvbox-tab tvbox-line-tab' + (i===preferredSi?' active':'') + '" data-si="' + i + '" title="' + escHtml(meta || e.name) + '"><strong>' + escHtml(e.name) + '</strong>' + (meta ? '<small>' + escHtml(meta) + '</small>' : '') + (i===preferredSi?' <b>推荐</b>':'') + '</button>'
          }).join('') +
        '</div></section>'
      : ''

    const sourceForPic = VOD_SOURCES.find(s => s.name === sourceName) || {}
    const picCands = buildPicCandidates(item.vod_pic, sourceForPic.key, sourceForPic.api || '')
    body.innerHTML =
      backBtn +
      '<section class="tvbox-ep-info">' +
        '<div class="tvbox-ep-poster-wrap">' + renderPosterImg(item.vod_pic, item.vod_name, sourceForPic.key || item._srcKey, sourceForPic.api || item._api || '').replace('<img ', '<img class="tvbox-ep-pic" ') + '</div>' +
        '<div class="tvbox-ep-meta">' +
          (doubanRating ? '<div class="tvbox-ep-rating">' + doubanRating + '</div>' : '') +
          '<div class="tvbox-ep-desc">' + (item.vod_content || mt('noDescription')) + '</div>' +
        '</div>' +
      '</section>' +
      siHtml +
      '<div class="tvbox-ep-list-title" id="t-ep-list-title">' + escHtml(mt('episodeListCount', { count: firstUrls.length })) + '</div>' +
      '<div class="tvbox-ep-grid" id="t-ep-grid">' +
        firstUrls.map((ep, i) => {
          const isResume = hist && hist.epName === ep.name
          return '<button class="tvbox-ep-btn' + (isResume?' playing':'') + '" ' +
            'data-url="' + escHtml(ep.url) + '" data-name="' + escHtml(item.vod_name) + '" ' +
            'data-epname="' + escHtml(ep.name) + '" data-pic="' + escHtml(item.vod_pic) + '" ' +
            'data-id="' + escHtml(item.vod_id) + '" data-source="' + escHtml(sourceName) + '" data-src-key="' + escHtml(item._srcKey || sourceForPic.key || '') + '" data-api="' + escHtml(item._api || sourceForPic.api || '') + '" data-detail-url="' + escHtml(item._detailUrl || '') + '">' +
            (isResume?'▶ ':'') + escHtml(ep.name) + '</button>'
        }).join('') +
      '</div>'

    body.querySelector('#t-detail-back')?.addEventListener('click', () => {
      closePlayer()
      _viewStack.pop()
      if (query) loadSearch()
      else loadList()
    })

    body.querySelectorAll('[data-si]').forEach(btn => {
      btn.addEventListener('click', () => {
        const si = parseInt(btn.dataset.si)
        const eps = episodes[si]?.urls || []
        const grid = body.querySelector('#t-ep-grid')
        grid.innerHTML = eps.map((ep, i) =>
          '<button class="tvbox-ep-btn" data-url="' + escHtml(ep.url) + '" data-name="' + escHtml(item.vod_name) + '" ' +
            'data-epname="' + escHtml(ep.name) + '" data-pic="' + escHtml(item.vod_pic) + '" ' +
            'data-id="' + escHtml(item.vod_id) + '" data-source="' + escHtml(sourceName) + '" data-src-key="' + escHtml(item._srcKey || sourceForPic.key || '') + '" data-api="' + escHtml(item._api || sourceForPic.api || '') + '" data-detail-url="' + escHtml(item._detailUrl || '') + '">' + escHtml(ep.name) + '</button>'
        ).join('')
        const titleEl = body.querySelector('#t-ep-list-title')
        if (titleEl) titleEl.textContent = mt('episodeListCount', { count: eps.length })
        body.querySelectorAll('[data-si]').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
      })
    })

    overlay.style.display = 'flex'

    // 使用事件委托，避免重复绑定监听器
    const epGrid = body.querySelector('#t-ep-grid')
    epGrid.addEventListener('click', e => {
      const btn = e.target.closest('.tvbox-ep-btn')
      if (!btn) return
      const epUrl = btn.dataset.url
      // 获取当前显示的源的 si（从 active 的 [data-si] 按钮获取）
      const activeSiBtn = body.querySelector('[data-si].active')
      const si = activeSiBtn ? parseInt(activeSiBtn.dataset.si) : preferredSi
      // 保存当前线路的完整剧集上下文，保证从历史播放也能切集/切线路
      const allUrls = (episodes[si]?.urls || []).map(e => e.url)
      const allEps = (episodes[si]?.urls || []).map(e => ({ epName: e.name, url: e.url }))
      const allLines = episodes.map((line, lineIndex) => ({
        name: line.name || ('线路' + (lineIndex + 1)),
        urls: (line.urls || []).map(e => ({ epName: e.name, url: e.url })),
      }))
      upsertPlayHistory({
        id: btn.dataset.id, name: btn.dataset.name, pic: btn.dataset.pic,
        source: btn.dataset.source, epName: btn.dataset.epname,
        _srcKey: btn.dataset.srcKey || '', sourceKey: btn.dataset.srcKey || '', _api: btn.dataset.api || '', api: btn.dataset.api || '', detailId: btn.dataset.id, detailUrl: btn.dataset.detailUrl || '',
        epUrl: epUrl, progress: 0, duration: 0,
        allUrls, allEps, allLines,
        desc: btn.dataset.desc || item.vod_content || '', vod_content: btn.dataset.desc || item.vod_content || '',
      })
      openPlayerVod(btn.dataset.name, epUrl, btn.dataset.id, btn.dataset.source, btn.dataset.epname, btn.dataset.pic, allUrls, 0, allEps, allLines, si, { desc: btn.dataset.desc || item.vod_content || '', year: btn.dataset.year || item.vod_year || '', area: btn.dataset.area || item.vod_area || '', type: btn.dataset.type || item.type_name || '', actor: btn.dataset.actor || item.vod_actor || '' })
    })
  }

  async function openPlayerVod(name, url, id, source, epName, pic, fallbackUrls, startProgress, allEps, allLines, activeLineIndex, meta) {
    if (!url || url === '#') return
    let playableUrl = url
    let resolvedForStandalone = false
    try {
      playableUrl = await resolvePlayableUrl(url)
      resolvedForStandalone = playableUrl !== url || isDirectVideoUrl(playableUrl)
    } catch (e) {
      console.warn('[movie] 播放页解析失败:', e?.message || e)
    }
    const selectedOriginalUrl = url
    const normalizedEps = Array.isArray(allEps) && allEps.length ? allEps.map(e => ({ ...e, url: e.url === selectedOriginalUrl ? playableUrl : e.url })) : [{ epName: epName || name || '当前播放', url: playableUrl }]
    const normalizedUrls = Array.isArray(fallbackUrls) && fallbackUrls.length ? fallbackUrls.map(u => u === selectedOriginalUrl ? playableUrl : u) : normalizedEps.map(e => e.url).filter(Boolean)
    const normalizedLines = Array.isArray(allLines) && allLines.length ? allLines.map(line => ({
      ...line,
      urls: Array.isArray(line.urls) ? line.urls.map(e => ({ ...e, url: e.url === selectedOriginalUrl ? playableUrl : e.url })) : [],
    })) : [{ name: source || '当前线路', urls: normalizedEps.map((e, i) => ({ epName: e.epName || e.name || ('第 ' + (i + 1) + ' 集'), url: e.url || normalizedUrls[i] || playableUrl })) }]
    playingEp = { id, name, source, epName, pic, epUrl: playableUrl, allUrls: normalizedUrls, allEps: normalizedEps, allLines: normalizedLines, lineIndex: activeLineIndex || 0 }
    const resume = 0
    const opened = resolvedForStandalone ? await openStandalonePlayer({
      url: playableUrl, title: name, resume,
      allEps: normalizedEps,
      allUrls: normalizedUrls,
      allLines: normalizedLines,
      playbackCtx: { id, source, epName, desc: meta?.desc || '', year: meta?.year || '', area: meta?.area || '', type: meta?.type || '', actor: meta?.actor || '', sourceKey: meta?.sourceKey || '', api: meta?.api || '' },
      pic,
    }) : false
    if (!opened) showEmbeddedPlayerFallback(name, playableUrl, resume, normalizedUrls, normalizedEps, normalizedLines, activeLineIndex || 0)
  }

  async function openStandalonePlayer({ url, title, resume, allEps, allUrls, allLines, playbackCtx, pic }) {
    try {
      const { invoke } = await import('@tauri-apps/api/core').catch(() => ({}))
      if (!invoke) throw new Error(mt('standaloneApiUnavailable'))
      await invoke('open_player_window', {
        url, title, resume,
        lang: getLang(),
        allEps: JSON.stringify(allEps || []),
        allUrls: JSON.stringify(allUrls || [url]),
        allLines: JSON.stringify(allLines || []),
        playbackCtx: JSON.stringify(playbackCtx || {}),
        pic: pic || '',
      })
      return true
    } catch (e) {
      console.warn('[movie] 独立播放器打开失败，回退内嵌播放:', e?.message || e)
      return false
    }
  }

  function showEmbeddedPlayerFallback(name, url, resume, fallbackUrls, allEps, allLines, activeLineIndex) {
    const overlay = el.querySelector('#t-player-overlay')
    const title = el.querySelector('#t-player-title')
    const body = el.querySelector('#t-player-body')
    if (!overlay || !body) {
      alert(mt('playerOpenFailedRetry'))
      return
    }
    if (title) title.textContent = name || mt('playbackTitleFallback')
    overlay.style.display = 'flex'
    body.innerHTML = '<div class="tvbox-player-boot"><div class="tvbox-player-boot-icon"></div><p>' + escHtml(mt('standaloneFallbackNotice')) + '</p></div>'
    loadVideoPlayer(url, isDirectVideoUrl(url), resume || 0, fallbackUrls || [url], allEps || [], allLines || [], activeLineIndex || 0)
  }

  async function loadVideoPlayer(videoUrl, isM3u8, startProgress, fallbackUrls, allEps, allLines, activeLineIndex) {
    const body = el.querySelector('#t-player-body')
    const fallbackArr = (fallbackUrls && fallbackUrls.length) ? fallbackUrls : []
    const episodeArr = Array.isArray(allEps) ? allEps : []
    const fallbackUrlsAreEpisodes = fallbackArr.length > 0 && episodeArr.length > 0 && fallbackArr.every(u => getFallbackEpisodeByUrl(u, episodeArr))
    let lineIdx = 0  // 当前尝试的地址索引（0=主URL；可能是线路或剧集）
    let activeLineIdx = Number.isFinite(activeLineIndex) ? activeLineIndex : 0
    const lineGroups = Array.isArray(allLines) ? allLines.filter(line => Array.isArray(line.urls) && line.urls.length) : []
    let errCount = 0
    const MAX_ERR = 3

    function getFallbackEpisodeByUrl(epUrl, eps = episodeArr) {
      if (!epUrl || !eps || !eps.length) return null
      return eps.find(ep => ep && ep.url === epUrl) || null
    }

    function syncEmbeddedEpisodeContext(nextUrl) {
      if (!fallbackUrlsAreEpisodes || !playingEp) return
      const ep = getFallbackEpisodeByUrl(nextUrl)
      if (!ep) return
      const nextEpName = ep.epName || ep.name || playingEp.epName
      playingEp = { ...playingEp, epName: nextEpName, epUrl: nextUrl, lineIndex: activeLineIdx }
      const titleEl = el.querySelector('#t-player-title')
      if (titleEl && nextEpName) titleEl.textContent = (playingEp.name || mt('playingTitleFallback')) + ' · ' + nextEpName
      upsertPlayHistory({
        id: playingEp.id, name: playingEp.name || titleEl?.textContent || nextEpName || mt('playingTitleFallback'), pic: playingEp.pic || '',
        source: playingEp.source, epName: playingEp.epName, epUrl: nextUrl, progress: 0, duration: 0,
        allUrls: playingEp.allUrls || fallbackArr || [], allEps: playingEp.allEps || episodeArr || [],
        updated: Date.now()
      })
      el.querySelector('#t-ext-link')?.setAttribute('href', nextUrl)
    }

    function fallbackTargetText() { return fallbackUrlsAreEpisodes ? mt('fallbackTargetEpisode') : mt('fallbackTargetLine') }

    function showOtip(vid, msg) {
      let tip = document.getElementById('_ttip')
      if (!tip) { tip = Object.assign(document.createElement('div'), { id: '_ttip' }); tip.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.7);color:#fff;padding:8px 16px;border-radius:8px;font-size:16px;pointer-events:none;z-index:100' }
      tip.textContent = msg; if (!document.body.contains(tip)) vid.parentElement.appendChild(tip)
      clearTimeout(showOtip._t); showOtip._t = setTimeout(() => tip.remove(), 1200)
    }

    function buildEpisodeNav(allUrls) {
      const urls = Array.isArray(allUrls) ? allUrls : []
      if (!urls.length) return ''
      const currentEp = escHtml(playingEp?.epName || mt('episodeLabel'))
      const currentLine = escHtml(lineGroups[activeLineIdx]?.name || mt('lineLabel'))
      return '<div class="tvbox-player-console">' +
        '<div class="tvbox-now-playing"><span>正在播放</span><strong>' + currentEp + '</strong><em>' + currentLine + '</em></div>' +
        '<div class="tvbox-episode-nav">' +
          '<button class="tvbox-ep-nav primary" id="t-prev-ep">' + escHtml(mt('previousEpisode')) + '</button>' +
          '<button class="tvbox-ep-nav primary" id="t-next-ep">' + escHtml(mt('nextEpisode')) + '</button>' +
          '<button class="tvbox-ep-nav" id="t-ep-menu">选集</button>' +
          '<button class="tvbox-ep-nav" id="t-line-menu">线路切换</button>' +
          '<button class="tvbox-ep-nav" id="t-speed-menu">1.0x</button>' +
          '<button class="tvbox-ep-nav" id="t-reload-url">刷新</button>' +
          '<button class="tvbox-ep-nav" id="t-copy-url">复制链接</button>' +
          '<label class="tvbox-ep-auto"><input id="t-auto-next" type="checkbox" checked /> ' + escHtml(mt('autoPlayNext')) + '</label>' +
        '</div>' +
      '</div>'
    }

    function bindEpisodeNav(video, allUrls) {
      const urls = Array.isArray(allUrls) ? allUrls : []
      if (!urls.length) return
      const prevBtn = body.querySelector('#t-prev-ep')
      const nextBtn = body.querySelector('#t-next-ep')
      const menuBtn = body.querySelector('#t-ep-menu')
      const lineBtn = body.querySelector('#t-line-menu')
      const speedBtn = body.querySelector('#t-speed-menu')
      const reloadBtn = body.querySelector('#t-reload-url')
      const copyBtn = body.querySelector('#t-copy-url')
      const autoNext = body.querySelector('#t-auto-next')
      const getActiveUrls = () => Array.isArray(playingEp?.allUrls) && playingEp.allUrls.length ? playingEp.allUrls : urls
      const getCurrentIdx = () => {
        const activeUrls = getActiveUrls()
        const current = video.src || video.currentSrc || video.getAttribute('src') || playingEp?.epUrl || ''
        const byUrl = activeUrls.indexOf(current)
        if (byUrl >= 0) return byUrl
        const byEp = (playingEp?.allEps || []).findIndex(ep => ep.epName === playingEp?.epName || ep.name === playingEp?.epName)
        return Math.max(0, byEp)
      }
      const refreshConsole = () => {
        const epEl = body.querySelector('.tvbox-now-playing strong')
        const lineEl = body.querySelector('.tvbox-now-playing em')
        if (epEl) epEl.textContent = playingEp?.epName || mt('episodeLabel')
        if (lineEl) lineEl.textContent = lineGroups[activeLineIdx]?.name || mt('lineLabel')
      }
      const playAtIndex = (idx, sourceUrls = getActiveUrls()) => {
        const nextUrl = sourceUrls[idx]
        if (!nextUrl) return
        const resume = 0
        const ep = (playingEp?.allEps || [])[idx]
        playingEp = playingEp ? { ...playingEp, epUrl: nextUrl, epName: ep?.epName || ep?.name || playingEp.epName, lineIndex: activeLineIdx } : playingEp
        refreshConsole()
        tryPlay(nextUrl, isDirectVideoUrl(nextUrl), resume)
      }
      prevBtn?.addEventListener('click', () => {
        const idx = getCurrentIdx()
        if (idx > 0) playAtIndex(idx - 1, getActiveUrls())
      })
      nextBtn?.addEventListener('click', () => {
        const idx = getCurrentIdx()
        const activeUrls = getActiveUrls()
        if (idx >= 0 && idx < activeUrls.length - 1) playAtIndex(idx + 1, activeUrls)
      })
      menuBtn?.addEventListener('click', (event) => {
        event.stopPropagation()
        showEmbeddedEpPicker(video, urls)
      })
      lineBtn?.addEventListener('click', () => showLinePicker(urls, video, playAtIndex, getCurrentIdx, refreshConsole))
      speedBtn?.addEventListener('click', () => {
        const rates = [0.75, 1, 1.25, 1.5, 2]
        const current = rates.includes(video.playbackRate) ? rates.indexOf(video.playbackRate) : 1
        const next = rates[(current + 1) % rates.length]
        video.playbackRate = next
        speedBtn.textContent = next.toFixed(next % 1 ? 2 : 1).replace(/0$/, '') + 'x'
        showOtip(video, '倍速 ' + speedBtn.textContent)
      })
      reloadBtn?.addEventListener('click', () => {
        const current = video.currentSrc || video.src || urls[getCurrentIdx()]
        if (current) tryPlay(current, isDirectVideoUrl(current), Math.max(0, video.currentTime || 0))
      })
      copyBtn?.addEventListener('click', async () => {
        const current = video.currentSrc || video.src || urls[getCurrentIdx()]
        try {
          await navigator.clipboard?.writeText(current)
          showOtip(video, '播放链接已复制')
        } catch {
          window.prompt('复制播放链接', current)
        }
      })
      video.addEventListener('ended', () => {
        if (autoNext?.checked) {
          const idx = getCurrentIdx()
          const activeUrls = getActiveUrls()
          if (idx >= 0 && idx < activeUrls.length - 1) playAtIndex(idx + 1, activeUrls)
        }
      })
    }

    function attachInlinePlayerControls(video, allUrls) {
      const nav = buildEpisodeNav(allUrls)
      if (!nav) return
      body.insertAdjacentHTML('beforeend', nav)
      bindEpisodeNav(video, allUrls)
    }

    function showEmbeddedEpPicker(video, urls) {
      const eps = Array.isArray(playingEp?.allEps) ? playingEp.allEps : []
      const list = eps.length ? eps : (Array.isArray(urls) ? urls.map((url, i) => ({ name: mt('episodeOption', { number: i + 1 }), url })) : [])
      if (!list.length) return
      const old = document.getElementById('_embedded_ep_menu')
      if (old) { old.remove(); return }
      const menu = document.createElement('div')
      menu.id = '_embedded_ep_menu'
      menu.className = 'tvbox-embedded-ep-menu'
      list.forEach((ep, i) => {
        const epUrl = ep.url || urls[i]
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.textContent = ep.epName || ep.name || mt('episodeOption', { number: i + 1 })
        if (epUrl === (video.currentSrc || video.src || playingEp?.epUrl)) btn.classList.add('active')
        btn.addEventListener('click', () => {
          if (!epUrl) return
          playingEp = playingEp ? { ...playingEp, epUrl, epName: ep.epName || ep.name || playingEp.epName } : playingEp
          const epEl = body.querySelector('.tvbox-now-playing strong')
          if (epEl) epEl.textContent = playingEp?.epName || mt('episodeLabel')
          tryPlay(epUrl, isDirectVideoUrl(epUrl), 0)
          menu.remove()
        })
        menu.appendChild(btn)
      })
      body.appendChild(menu)
      setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0)
    }

    function showLinePicker(urls, video, playAtIndex, getCurrentIdx, refreshConsole) {
      const list = lineGroups.length ? lineGroups : [{ name: mt('lineLabel'), urls: urls.map((url, i) => ({ epName: mt('episodeOption', { number: i + 1 }), url })) }]
      if (!list.length) return
      const old = document.getElementById('_line_menu')
      if (old) { old.remove(); return }
      const menu = document.createElement('div')
      menu.id = '_line_menu'
      menu.className = 'tvbox-line-switch-menu'
      const currentEpisodeIndex = getCurrentIdx()
      list.forEach((line, i) => {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = i === activeLineIdx ? 'active' : ''
        btn.innerHTML = '<strong>' + escHtml(line.name || mt('lineOption', { number: i + 1 })) + '</strong><small>' + (line.urls?.length || 0) + ' 集</small>'
        btn.addEventListener('click', () => {
          const nextEps = line.urls || []
          const nextIndex = nextEps[currentEpisodeIndex]?.url ? currentEpisodeIndex : 0
          const targetUrl = nextEps[nextIndex]?.url
          if (!targetUrl) return
          activeLineIdx = i
          lineIdx = nextIndex
          playingEp = playingEp ? { ...playingEp, lineIndex: i, allEps: nextEps, allUrls: nextEps.map(ep => ep.url), epName: nextEps[nextIndex]?.epName || nextEps[nextIndex]?.name || playingEp.epName } : playingEp
          refreshConsole()
          playAtIndex(nextIndex, nextEps.map(ep => ep.url))
          menu.remove()
        })
        menu.appendChild(btn)
      })
      body.appendChild(menu)
      setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0)
    }

    function addPipBtn(vid) {
      const pip = Object.assign(document.createElement('button'), { textContent: '📺 ' + mt('pipTitle'), title: mt('pipTitle') })
      pip.style.cssText = 'position:absolute;top:8px;right:180px;z-index:10;background:rgba(30,30,50,0.9);color:#fff;border:1px solid #444;border-radius:4px;padding:4px 8px;font-size:12px;cursor:pointer'
      pip.addEventListener('click', async () => {
        try {
          if (vid && vid.webkitShowPlaybackTargetPicker) { vid.webkitShowPlaybackTargetPicker(); return }
          if (document.pictureInPictureEnabled && vid.requestPictureInPicture) await vid.requestPictureInPicture()
          else alert(mt('castNotSupported'))
        } catch { alert(mt('castNotSupported')) }
      })
      return pip
    }

    function addTouchGesture(vid) {
      let tx = 0, ty = 0, tt = 0, startVol = 1
      vid.addEventListener('touchstart', e => {
        tx = e.touches[0].clientX; ty = e.touches[0].clientY; tt = vid.currentTime; startVol = vid.volume
      }, { passive: true })
      vid.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - tx
        const dy = e.changedTouches[0].clientY - ty
        const pct = dx / vid.offsetWidth
        if (Math.abs(pct) > 0.04) {
          vid.currentTime = Math.max(0, Math.min(vid.duration, tt + pct * 60))
          showOtip(vid, (pct > 0 ? '＋' : '－') + Math.round(Math.abs(pct) * 60) + 's')
        } else if (Math.abs(dy) > 30) {
          vid.volume = Math.max(0, Math.min(1, startVol - dy / 300))
          showOtip(vid, '🔊 ' + Math.round(vid.volume * 100) + '%')
        }
      }, { passive: true })
    }

    async function tryNextLine(failedUrl) {
      lineIdx++
      const next = fallbackArr.find((u, i) => i >= lineIdx && u !== failedUrl)
      if (!next) return false
      lineIdx = fallbackArr.indexOf(next)
      await tryPlay(next, next.includes('.m3u8') || next.includes('.mp4'), 0)
      return true
    }

    function renderPlaybackError(url, message) {
      const canOpenExternal = !/^https?:\/\/127\.0\.0\.1:/i.test(String(url || ''))
      body.innerHTML = '<div class="tvbox-playback-error"><div class="tvbox-playback-error-title">' + escHtml(message || mt('playbackFailed')) + '</div>' + (canOpenExternal ? '<a href="' + escHtml(url) + '" target="_blank" class="tvbox-open-ext">↗ ' + escHtml(mt('openInBrowser')) + '</a>' : '') + '</div>'
    }

    async function tryPlay(url, isM3u8, sp) {
      let playableUrl = url
      try { playableUrl = await resolvePlayableUrl(url) } catch (e) {
        console.warn('[movie] 解析播放地址失败:', e?.message || e)
        renderPlaybackError(url, e?.message || mt('playbackFailed'))
        const switched = await tryNextLine(url)
        if (!switched) renderPlaybackError(url, mt('allFallbackUnavailable', { target: fallbackTargetText() }))
        return
      }
      syncEmbeddedEpisodeContext(playableUrl)
      if (!playableUrl || playableUrl === '#') { body.innerHTML = '<div class="tvbox-playback-error"><div class="tvbox-playback-error-title">' + escHtml(mt('noPlaybackUrl')) + '</div></div>'; return }
      isM3u8 = isDirectVideoUrl(playableUrl) ? playableUrl.includes('.m3u8') : isM3u8
      url = playableUrl

      if (isM3u8) {
        await ensureHls()
        if (window.Hls && window.Hls.isSupported()) {
          const wrap = document.createElement('div'); wrap.className = 'tvbox-video-wrap'
          const video = document.createElement('video'); video.controls = true
          wrap.appendChild(video)
          body.innerHTML = ''; body.appendChild(wrap)
          attachInlinePlayerControls(video, fallbackArr)
          const hls = new window.Hls({ autoStartLoad: true, startLevel: -1 })
          window._movieHls = hls
          hls.loadSource(url)
          hls.attachMedia(video)
          let hlsTimedOut = false
          const hlsTimer = setTimeout(async () => {
            if (!hlsTimedOut) { hlsTimedOut = true; hls.destroy(); window._movieHls = null
              renderPlaybackError(url, mt('m3u8TimeoutSwitching', { target: fallbackTargetText() }))
              const switched = await tryNextLine(url)
              if (!switched) renderPlaybackError(url, mt('allFallbackUnavailable', { target: fallbackTargetText() }))
            }
          }, 15000)
          hls.on(window.Hls.Events.ERROR, async (evt, data) => {
            clearTimeout(hlsTimer)
            if (data.fatal) {
              errCount++
              if (errCount < MAX_ERR && (data.type === window.Hls.ErrorTypes.NETWORK_ERROR || data.type === window.Hls.ErrorTypes.MEDIA_ERROR)) {
                console.warn('[HLS] 可恢复错误，尝试恢复 (#' + errCount + '):', data.type, data.details)
                hls.startLoad(); return
              }
              hlsTimedOut = true; hls.destroy(); window._movieHls = null
              renderPlaybackError(url, mt('playbackInterruptedSwitching', { reason: errCount >= MAX_ERR ? mt('multipleRetriesFailed') : data.details, target: fallbackTargetText() }))
              const switched = await tryNextLine(url)
              if (!switched) renderPlaybackError(url, mt('allFallbackUnavailable', { target: fallbackTargetText() }))
            }
          })
          hls.on(window.Hls.Events.MANIFEST_PARSED, () => { clearTimeout(hlsTimer); hls.currentLevel = -1 })
          const pipBtn = addPipBtn(video); if (pipBtn) wrap.appendChild(pipBtn)
          addTouchGesture(video)
          video.addEventListener('timeupdate', () => trackProgress(video))
          video.addEventListener('ended', () => markFinished())
          if (sp > 0) video.currentTime = sp
          video.play().catch(() => {})
        } else {
          const wrap = document.createElement('div'); wrap.className = 'tvbox-video-wrap'; wrap.style.position = 'relative'
          const video = document.createElement('video'); video.controls = true; video.style.width = '100%'; video.style.maxHeight = '70vh'
          video.src = url
          const pipBtn = addPipBtn(video); if (pipBtn) wrap.appendChild(pipBtn)
          addTouchGesture(video)
          video.addEventListener('error', async () => {
            const switched = await tryNextLine(url)
            if (!switched) renderPlaybackError(url, mt('allFallbackUnavailable', { target: fallbackTargetText() }))
          })
          wrap.appendChild(video)
          body.innerHTML = ''; body.appendChild(wrap)
          attachInlinePlayerControls(video, fallbackArr)
          if (sp > 0) video.currentTime = sp
          video.play().catch(() => {})
        }
      } else {
        const wrap = document.createElement('div'); wrap.className = 'tvbox-video-wrap'
        const video = document.createElement('video'); video.controls = true
        wrap.appendChild(video)
        body.innerHTML = ''; body.appendChild(wrap)
          attachInlinePlayerControls(video, fallbackArr)
        const pipBtn = addPipBtn(video); if (pipBtn) wrap.appendChild(pipBtn)
        addTouchGesture(video)
        video.addEventListener('timeupdate', () => trackProgress(video))
        video.addEventListener('ended', () => markFinished())
        video.addEventListener('error', async () => {
          const switched = await tryNextLine(url)
          if (!switched) renderPlaybackError(url, mt('allFallbackUnavailable', { target: fallbackTargetText() }))
        })
        video.src = url
        if (sp > 0) video.currentTime = sp
        video.play().catch(() => {})
      }
    }

    // 先尝试主URL
    tryPlay(videoUrl, isM3u8, startProgress)
  }

  function trackProgress(video) {
    if (!playingEp || !video.duration) return
    const pct = (video.currentTime / video.duration) * 100
    if (pct > 1) updatePlayProgress(playingEp.id, playingEp.source, video.currentTime, playingEp.epName)
  }

  function markFinished() {
    if (!playingEp) return
    updatePlayProgress(playingEp.id, playingEp.source, 999, playingEp.epName)
  }

  function ensureHls() {
    return new Promise(resolve => {
      if (window.Hls) { resolve(); return }
      const sc = document.createElement('script')
      sc.src = HLS_CDN
      sc.onload = () => resolve()
      sc.onerror = () => resolve()
      document.head.appendChild(sc)
    })
  }

  function closePlayer() {
    const vid = document.querySelector('#t-player-body video') || document.querySelector('#t-player-body .tvbox-video-wrap video')
    if (vid && vid.duration > 0 && playingEp) {
      updatePlayProgress(playingEp.id, playingEp.source, vid.currentTime, playingEp.epName)
    }
    playingEp = null
    el.querySelector('#t-player-overlay').style.display = 'none'
    el.querySelector('#t-player-body').innerHTML = ''
    if (window._movieHls) { window._movieHls.destroy(); window._movieHls = null }
  }

  function renderPagination(page, total) {
    if (total <= 1) return ''
    const prev = page > 1 ? page - 1 : 1
    const next = page < total ? page + 1 : total
    return '<div class="tvbox-pagination">' +
      '<button class="tvbox-page-btn" data-page="' + prev + '">◀ ' + escHtml(mt('prevPage')) + '</button>' +
      '<span class="tvbox-page-info">' + escHtml(mt('pageInfo', { page, total })) + '</span>' +
      '<button class="tvbox-page-btn" data-page="' + next + '">' + escHtml(mt('nextPage')) + ' ▶</button>' +
    '</div>'
  }

  // ── 悬浮播放器（可拖拽/最小化/置顶）───────────────────────────────────
  let _floatState = null   // { wrap, title, pinned, minimized, h, w, x, y }

  function saveFloatState() {
    if (!_floatState) return
    try {
      localStorage.setItem('float_x', _floatState.x)
      localStorage.setItem('float_y', _floatState.y)
      localStorage.setItem('float_w', _floatState.w)
      localStorage.setItem('float_h', _floatState.h)
      localStorage.setItem('float_pinned', _floatState.pinned ? '1' : '0')
    } catch(e) {}
  }

  function loadFloatState() {
    try {
      const x = parseInt(localStorage.getItem('float_x'))
      const y = parseInt(localStorage.getItem('float_y'))
      const w = parseInt(localStorage.getItem('float_w'))
      const h = parseInt(localStorage.getItem('float_h'))
      const pinned = localStorage.getItem('float_pinned') === '1'
      if (!isNaN(x) && !isNaN(y)) return { x, y, w: w || 420, h: h || 300, pinned }
    } catch(e) {}
    return null
  }


  async function openFloatPlayer(name, url, id, source, epName, pic, allUrls, startProgress, allEps) {
    // 优先使用独立 Tauri 窗口播放；失败时回退到内嵌播放器并给出可见反馈。
    if (!url || url === '#') return
    const useUrl = pickDirectUrl(url)
    const resume = 0
    playingEp = { id, source, epName, epUrl: useUrl, pic, allUrls: allUrls || [], allEps: allEps || [] }
    const opened = await openStandalonePlayer({
      url: useUrl, title: name, resume,
      allEps: allEps || [],
      allUrls: allUrls || [useUrl],
      allLines: [],
      playbackCtx: { id, source, epName },
      pic,
    })
    if (!opened) showEmbeddedPlayerFallback(name, useUrl, resume, allUrls || [useUrl], allEps || [])
  }

function pickDirectUrl(url) {
    // url 可能是 "集名$url#集名$url" 或单个 url
    if (!url.includes('#') && !url.includes('$$$')) return url
    // 找第一个非 /share/ 的 m3u8
    const parts = url.split('#').filter(Boolean)
    for (const p of parts) {
      const idx = p.indexOf('$')
      const u = idx >= 0 ? p.slice(idx + 1) : p
      if (u.includes('.m3u8') && !u.includes('/share/')) return u
    }
    // 其次选第一个 m3u8
    for (const p of parts) {
      const idx = p.indexOf('$')
      const u = idx >= 0 ? p.slice(idx + 1) : p
      if (u.includes('.m3u8')) return u
    }
    // fallback 第一个 url
    const idx0 = parts[0].indexOf('$')
    return idx0 >= 0 ? parts[0].slice(idx0 + 1) : parts[0]
  }

  function renderFloatPlaybackError(url, message) {
    const safeUrl = normalizeHttpUrl(url) || url || '#'
    return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:8px;color:#f87171;font-size:13px;text-align:center;padding:12px">' +
      '<div>' + escHtml(message || mt('playbackFailed')) + '</div>' +
      (safeUrl && safeUrl !== '#' ? '<a href="' + escHtml(safeUrl) + '" target="_blank" rel="noopener" style="color:#5c97ff;text-decoration:none">' + escHtml(mt('openInBrowser')) + '</a>' : '') +
    '</div>'
  }

  function getFloatEpisodeByUrl(url) {
    if (!_floatState?.epList || !url) return null
    return _floatState.epList.find(ep => ep.url === url) || null
  }

  function switchFloatEpisode(nextUrl, resumeProgress = 0) {
    if (!_floatState || !nextUrl) return
    const vid = document.querySelector('#_fvid video')
    if (vid && vid.duration > 0 && playingEp) updatePlayProgress(playingEp.id, playingEp.source, vid.currentTime, playingEp.epName, vid.duration)
    if (window._floatHls) { window._floatHls.destroy(); window._floatHls = null }
    const ep = getFloatEpisodeByUrl(nextUrl)
    _floatState.currentUrl = nextUrl
    if (playingEp) playingEp = { ...playingEp, epName: ep?.epName || ep?.name || playingEp.epName, epUrl: nextUrl }
    if (playingEp?.id && playingEp?.source) {
      upsertPlayHistory({
        id: playingEp.id, name: _floatState.title || playingEp.epName || '播放中', pic: playingEp.pic || '',
        source: playingEp.source, epName: playingEp.epName, epUrl: nextUrl, progress: 0, duration: 0,
        allUrls: playingEp.allUrls || _floatState.allUrls || [], allEps: playingEp.allEps || [],
      })
    }
    const vidWrap = document.getElementById('_fvid'); if (vidWrap) vidWrap.innerHTML = ''
    const isM3u8 = nextUrl.includes('.m3u8'); const isMp4 = nextUrl.includes('.mp4')
    if (isM3u8 || isMp4) { if (isM3u8) loadVideoIntoFloat(nextUrl, resumeProgress); else loadMp4IntoFloat(nextUrl, resumeProgress) }
    else if (vidWrap) vidWrap.innerHTML = renderFloatPlaybackError(nextUrl, mt('notDirectVideoUrl'))
  }

  async function loadVideoIntoFloat(url, resumeProgress = 0) {
    await ensureHls()
    const vidWrap = document.querySelector('#_fvid')
    if (!vidWrap) return
    if (window._floatHls) { window._floatHls.destroy(); window._floatHls = null }
    const video = document.createElement('video')
    video.controls = true
    vidWrap.appendChild(video)
    if (window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls()
      window._floatHls = hls
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        const levels = hls.levels || []
        hls.currentLevel = -1
        if (resumeProgress > 0) {
          video.addEventListener('loadedmetadata', () => {
            video.currentTime = Math.min(resumeProgress, video.duration)
          }, { once: true })
        }
      })

      let timedOut = false
      let errCount = 0
      const MAX_ERR = 3
      const clearLoadTimer = () => { clearTimeout(timer) }
      const timer = setTimeout(() => {
        if (!timedOut) { timedOut = true; hls.destroy(); window._floatHls = null
          vidWrap.innerHTML = renderFloatPlaybackError(url, mt('m3u8Timeout'))
        }
      }, 15000)
      hls.on(window.Hls.Events.ERROR, (evt, data) => {
        if (data.fatal) {
          errCount++
          if (errCount < MAX_ERR && (data.type === window.Hls.ErrorTypes.NETWORK_ERROR || data.type === window.Hls.ErrorTypes.MEDIA_ERROR)) {
            console.warn('[FloatHLS] 可恢复错误，尝试恢复 (#' + errCount + '):', data.type, data.details)
            hls.startLoad(); return
          }
          clearLoadTimer()
          timedOut = true; hls.destroy(); window._floatHls = null
          vidWrap.innerHTML = renderFloatPlaybackError(url, mt('playbackInterrupted', { reason: errCount >= MAX_ERR ? mt('multipleRetriesFailed') : data.details }))
        }
      })
      hls.on(window.Hls.Events.MANIFEST_PARSED, clearLoadTimer)
      setupFloatControls(video, hls)
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url
      if (resumeProgress > 0) {
        video.addEventListener('loadedmetadata', () => {
          video.currentTime = Math.min(resumeProgress, video.duration)
        }, { once: true })
      }
      const nativeTimer = setTimeout(() => {
        vidWrap.innerHTML = renderFloatPlaybackError(url, mt('m3u8Timeout'))
      }, 15000)
      video.addEventListener('loadedmetadata', () => clearTimeout(nativeTimer), { once: true })
      video.addEventListener('error', () => {
        clearTimeout(nativeTimer)
        vidWrap.innerHTML = renderFloatPlaybackError(url, mt('playbackFailed'))
      })
      setupFloatControls(video, null)
    } else {
      vidWrap.innerHTML = renderFloatPlaybackError(url, mt('browserUnsupportedHls'))
    }
  }

  function loadMp4IntoFloat(url, resumeProgress = 0) {
    const vidWrap = document.querySelector('#_fvid')
    if (!vidWrap) return
    const video = document.createElement('video')
    video.controls = true
    vidWrap.appendChild(video)
    video.src = url
    if (resumeProgress > 0) {
      video.addEventListener('loadedmetadata', () => {
        video.currentTime = Math.min(resumeProgress, video.duration)
      }, { once: true })
    }
    const loadTimer = setTimeout(() => {
      vidWrap.innerHTML = renderFloatPlaybackError(url, mt('mp4Timeout'))
    }, 15000)
    video.addEventListener('loadedmetadata', () => clearTimeout(loadTimer), { once: true })
    video.addEventListener('error', () => {
      clearTimeout(loadTimer)
      vidWrap.innerHTML = renderFloatPlaybackError(url, mt('playbackFailed'))
    })
    setupFloatControls(video, null)
  }

  // ── 悬浮播放器完整控制条 ──────────────────────────────
  function setupFloatControls(video, hls) {
    const ctrl = document.getElementById('_fctrl')
    if (!ctrl) return
    const playBtn = document.getElementById('_fplay')
    const prevBtn = document.getElementById('_fprev')
    const nextBtn = document.getElementById('_fnext')
    const muteBtn = document.getElementById('_fmute')
    const volWrap = document.getElementById('_fvol')
    const volFill = document.getElementById('_fvolfill')
    const speedBtn = document.getElementById('_fspeed')
    const pipBtn = document.getElementById('_fsp')
    const epBtn = document.getElementById('_fep')
    const seek = document.getElementById('_fseek')
    const fill = document.getElementById('_ffill')
    const thumb = document.getElementById('_fthumb')
    const curT = document.getElementById('_fcur')
    const totT = document.getElementById('_ftot')

    const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3]
    let speedIdx = 2 // 默认 1x
    let _dragging = false
    let _vol = 1

    function fmt(s) {
      s = Math.floor(s)
      return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
    }
    function updateTime() {
      if (!video.duration || !isFinite(video.duration)) return
      const pct = (video.currentTime / video.duration) * 100
      if (fill) fill.style.width = pct + '%'
      if (thumb) thumb.style.left = pct + '%'
      if (curT) curT.textContent = fmt(video.currentTime)
      if (totT) totT.textContent = fmt(video.duration)
    }
    function updateVol() {
      if (volFill) volFill.style.width = (_vol * 100) + '%'
    }

    playBtn?.addEventListener('click', () => {
      if (video.paused) video.play().catch(() => {})
      else video.pause()
    })
    video.addEventListener('play', () => { if (playBtn) playBtn.textContent = '⏸' })
    video.addEventListener('pause', () => { if (playBtn) playBtn.textContent = '▶' })
    video.addEventListener('ended', () => {
      if (playBtn) playBtn.textContent = '▶'
      if (_floatState?.allUrls && _floatState.allUrls.length > 1) {
        const idx = _floatState.allUrls.indexOf(_floatState.currentUrl)
        if (idx >= 0 && idx < _floatState.allUrls.length - 1) {
          const next = _floatState.allUrls[idx + 1]
          switchFloatEpisode(next, 0)
        }
      } else if (_floatState?.epList && _floatState.epList.length > 1) {
        const idx = _floatState.epList.findIndex(ep => ep.url === _floatState.currentUrl)
        const next = _floatState.epList[idx + 1]?.url
        if (next) switchFloatEpisode(next, 0)
      }
    })
    video.addEventListener('timeupdate', () => {
      updateTime()
      if (!_dragging && playingEp) {
        const pct = (video.currentTime / video.duration) * 100
        if (pct > 1) updatePlayProgress(playingEp.id, playingEp.source, video.currentTime, playingEp.epName, video.duration)
      }
    })

    // 进度条拖拽
    seek?.addEventListener('mousedown', e => {
      _dragging = true
      const rect = seek.getBoundingClientRect()
      video.currentTime = Math.max(0, Math.min(video.duration, (e.clientX - rect.left) / rect.width * video.duration))
      updateTime()
    })
    document.addEventListener('mousemove', e => {
      if (!_dragging || !seek) return
      const rect = seek.getBoundingClientRect()
      video.currentTime = Math.max(0, Math.min(video.duration, (e.clientX - rect.left) / rect.width * video.duration))
      updateTime()
    })
    document.addEventListener('mouseup', () => { _dragging = false })

    // 上一集/下一集
    prevBtn?.addEventListener('click', () => {
      if (!_floatState?.allUrls) return
      const idx = _floatState.allUrls.indexOf(_floatState.currentUrl)
      if (idx > 0) {
        const prev = _floatState.allUrls[idx - 1]
        switchFloatEpisode(prev, 0)
      }
    })
    nextBtn?.addEventListener('click', () => {
      if (!_floatState?.allUrls) return
      const idx = _floatState.allUrls.indexOf(_floatState.currentUrl)
      if (idx >= 0 && idx < _floatState.allUrls.length - 1) {
        const next = _floatState.allUrls[idx + 1]
        switchFloatEpisode(next, 0)
      }
    })

    // 静音
    muteBtn?.addEventListener('click', () => {
      if (video.muted || _vol === 0) {
        video.muted = false; video.volume = _vol > 0 ? _vol : 1
        if (muteBtn) muteBtn.textContent = '🔊'
      } else {
        video.muted = true
        if (muteBtn) muteBtn.textContent = '🔇'
      }
    })
    volWrap?.addEventListener('click', e => {
      const rect = volWrap.getBoundingClientRect()
      _vol = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      video.volume = _vol; video.muted = false
      updateVol()
      if (muteBtn) muteBtn.textContent = '🔊'
    })

    // 倍速
    speedBtn?.addEventListener('click', () => {
      speedIdx = (speedIdx + 1) % SPEEDS.length
      const s = SPEEDS[speedIdx]
      video.playbackRate = s
      if (speedBtn) speedBtn.textContent = s + 'x'
    })

    // 投屏
    const castBtn = document.getElementById('_fcast')
    castBtn?.addEventListener('click', async () => {
      try {
        if (video && video.webkitShowPlaybackTargetPicker) {
          video.webkitShowPlaybackTargetPicker()
          return
        }
        if (document.pictureInPictureEnabled && video.requestPictureInPicture) {
          await video.requestPictureInPicture().catch(() => {})
          return
        }
        alert(mt('castNotSupported'))
      } catch {
        alert(mt('castNotSupported'))
      }
    })

    // 双击全屏
    video.addEventListener('dblclick', () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      else video.requestFullscreen().catch(() => {})
    })

    updateTime(); updateVol()
  }

  function showFloatEpPicker() {
    if (!_floatState) return
    const existing = document.getElementById('_fepmenu')
    if (existing) { existing.remove(); return }
    const menu = document.createElement('div')
    menu.id = '_fepmenu'
    menu.style.cssText = 'position:absolute;bottom:100%;left:50%;transform:translateX(-50%);background:rgba(20,20,35,0.96);border:1px solid #444;border-radius:8px;padding:6px 0;z-index:999999;min-width:180px;max-height:260px;overflow-y:auto'
    const items = (_floatState.epList && _floatState.epList.length) ? _floatState.epList : (_floatState.allEps || []).map(ep => ({ name: ep.epName || ep.name, url: ep.url }))
    items.forEach(ep => {
      const btn = document.createElement('button')
      btn.textContent = ep.epName || ep.name || ep.url
      btn.style.cssText = 'display:block;width:100%;text-align:left;padding:6px 12px;background:none;border:none;color:' + (ep.url === _floatState.currentUrl ? '#5c97ff' : '#ccc') + ';font-size:12px;cursor:pointer'
      btn.addEventListener('click', () => {
        switchFloatEpisode(ep.url, 0)
        menu.remove()
      })
      menu.appendChild(btn)
    })
    const castBtn = document.getElementById('_fcast')
    castBtn?.parentElement?.appendChild(menu)
    document.addEventListener('click', () => menu.remove(), { once: true })
  }

  function buildQualityMenu(hls, video) {
    const levels = hls.levels || []
    if (levels.length <= 1) return
    const qBtn = document.getElementById('_fspeed')
    if (!qBtn) return
    let menu = null
    const closeMenu = () => {
      if (!menu) return
      menu.remove()
      menu = null
    }
    qBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      if (menu) { closeMenu(); return }
      menu = document.createElement('div')
      menu.style.cssText = 'position:absolute;bottom:100%;right:0;background:rgba(20,20,35,0.96);border:1px solid #444;border-radius:6px;padding:4px 0;z-index:999999;min-width:80px'
      levels.forEach((lv, i) => {
        const label = lv.height ? lv.height + 'p' : 'Level ' + i
        const btn = document.createElement('button')
        btn.textContent = (hls.currentLevel === i ? '✅ ' : '') + label
        btn.style.cssText = 'display:block;width:100%;text-align:left;padding:5px 10px;background:none;border:none;color:#ccc;font-size:11px;cursor:pointer'
        btn.addEventListener('click', () => { hls.currentLevel = i; menu?.querySelectorAll('button').forEach(b => b.textContent = b.textContent.replace(/^✅ /, '')); btn.textContent = '✅ ' + label; closeMenu() })
        menu.appendChild(btn)
      })
      const autoBtn = document.createElement('button')
      autoBtn.textContent = (hls.currentLevel === -1 ? '✅ ' : '') + '🔀 ' + mt('autoQuality')
      autoBtn.style.cssText = 'display:block;width:100%;text-align:left;padding:5px 10px;background:none;border:none;color:#ccc;font-size:11px;cursor:pointer'
      autoBtn.addEventListener('click', () => { hls.currentLevel = -1; menu?.querySelectorAll('button').forEach(b => b.textContent = b.textContent.replace(/^✅ /, '')); autoBtn.textContent = '✅ 🔀 ' + mt('autoQuality'); closeMenu() })
      menu.appendChild(autoBtn)
      qBtn.parentElement?.appendChild(menu)
      document.addEventListener('click', closeMenu, { once: true })
    })
  }

  function toggleFloatMin() {
    if (!_floatState) return
    _floatState.minimized = !_floatState.minimized
    _floatState.wrap.classList.toggle('minimized', _floatState.minimized)
    _floatState.wrap.querySelector('#_fmin').textContent = _floatState.minimized ? '□' : '─'
  }

  function toggleFloatPin() {
    if (!_floatState) return
    _floatState.pinned = !_floatState.pinned
    _floatState.wrap.classList.toggle('pinned', _floatState.pinned)
    _floatState.wrap.style.zIndex = _floatState.pinned ? '9999999' : '99999'
    _floatState.wrap.querySelector('#_fpin').classList.toggle('pin-on', _floatState.pinned)
  }

  // 拖拽
  let _floatDrag = null

  function onFloatDragStart(e) {
    if (_floatState && _floatState.minimized) return
    e.preventDefault()
    const pt = e.touches ? e.touches[0] : e
    _floatDrag = {
      ox: pt.clientX, oy: pt.clientY,
      sx: _floatState ? _floatState.x : 0,
      sy: _floatState ? _floatState.y : 0
    }
    _floatState?.wrap.classList.add('dragging')
    document.addEventListener('mousemove', onFloatDragMove)
    document.addEventListener('mouseup', onFloatDragEnd)
    document.addEventListener('touchmove', onFloatDragMove, { passive: false })
    document.addEventListener('touchend', onFloatDragEnd)
  }

  function onFloatDragMove(e) {
    if (!_floatDrag) return
    e.preventDefault()
    const pt = e.touches ? e.touches[0] : e
    const dx = pt.clientX - _floatDrag.ox
    const dy = pt.clientY - _floatDrag.oy
    if (!_floatState) return
    _floatState.x = Math.max(0, Math.min(window.innerWidth - _floatState.w, _floatState.sx + dx))
    _floatState.y = Math.max(0, Math.min(window.innerHeight - _floatState.h, _floatState.sy + dy))
    _floatState.wrap.style.right = 'auto'
    _floatState.wrap.style.left = _floatState.x + 'px'
    _floatState.wrap.style.top = _floatState.y + 'px'
    _floatState.wrap.style.bottom = 'auto'
  }

  function onFloatDragEnd() {
    if (_floatState) {
      _floatState.wrap.classList.remove('dragging')
      saveFloatState()
    }
    _floatDrag = null
    document.removeEventListener('mousemove', onFloatDragMove)
    document.removeEventListener('mouseup', onFloatDragEnd)
    document.removeEventListener('touchmove', onFloatDragMove)
    document.removeEventListener('touchend', onFloatDragEnd)
  }

  function onFloatEsc(e) {
    if (e.key === 'Escape') closeFloatPlayer()
  }

  function closeFloatPlayer() {
    // 保存当前播放进度
    const vid = document.querySelector('#_fvid video') || document.querySelector('.tvbox-float-video-wrap video')
    if (vid && vid.duration > 0 && playingEp) {
      updatePlayProgress(playingEp.id, playingEp.source, vid.currentTime, playingEp.epName)
    }
    if (window._floatHls) { window._floatHls.destroy(); window._floatHls = null }
    if (_floatState?.wrap) { _floatState.wrap.remove(); _floatState = null }
    document.removeEventListener('keydown', onFloatEsc)
  }

// ── 网站爬虫解析器 ───────────────────────────────────────────────

  // 爬虫模式状态
  let _crawlResults = []

  async function showMissavHome(initialSearch = '') {
    const content = el.querySelector('#t-content')
    const currentQuery = String(initialSearch || '').trim()
    const currentPath = currentQuery ? '/search/' + encodeURIComponent(currentQuery) : '/dm539/new'
    const byPath = (path) => MISSAV_CATEGORIES.find(cat => cat.path === path) || { name: path, path }
    const rootChannels = [
      { title: '热门频道', items: ['/dm539/new', '/dm634/release', '/dm278/chinese-subtitle', '/dm817/uncensored-leak', '/dm298/today-hot', '/dm170/weekly-hot', '/dm270/monthly-hot'].map(byPath) },
      { title: '内容索引', items: ['/genres', '/genres/VR', '/actresses', '/actresses/ranking', '/makers'].map(byPath) },
      { title: '素人厂牌', items: ['/dm36/siro', '/dm34/luxu', '/dm34/gana', '/dm1002/maan', '/dm38/scute', '/dm34/ara'].map(byPath) },
      { title: '无码厂牌', items: ['/dm541/fc2', '/dm2097925/heyzo', '/dm42/tokyohot', '/dm4835360/1pondo', '/dm7502171/caribbeancom', '/dm88271/caribbeancompr', '/dm6794110/10musume', '/dm2626775/pacopacomama', '/dm150/gachinco', '/dm42/xxxav', '/dm37/marriedslash', '/dm33/naughty4610', '/dm37/naughty0930'].map(byPath) },
      { title: '亚洲频道', items: ['/dm63/madou', '/dm31/twav', '/dm15/furuke', '/klive', '/clive'].map(byPath) },
    ]
    let activePath = currentPath
    let lastResult = null
    let localPage = 1
    let localPageSize = 12
    let dynamicChannels = []

    content.innerHTML = '<div class="tvbox-missav-app">' +
      '<header class="tvbox-missav-topbar">' +
        '<div class="tvbox-missav-hero-copy"><div class="tvbox-missav-kicker">PREMIUM LIBRARY</div><div class="tvbox-missav-title"><strong>精选片库</strong><span id="missav-active-source">私密频道</span></div><p>按频道结构浏览，支持子频道、分页与番号搜索。</p></div>' +
        '<div class="tvbox-missav-hero-actions"><div class="tvbox-missav-search"><input id="missav-search-input" type="search" autocomplete="off" placeholder="搜索番号、标题、演员" value="' + escHtml(currentQuery) + '" /><button id="missav-search-btn">搜索</button></div><div class="tvbox-missav-overview"><span>精选频道</span><span>子频道</span><span>分页跳转</span><span>每页三行</span></div></div>' +
      '</header>' +
      '<div class="tvbox-missav-layout">' +
        '<aside class="tvbox-missav-nav" id="missav-channel-nav"></aside>' +
        '<main class="tvbox-missav-content">' +
          '<section class="tvbox-missav-subnav" id="missav-subnav"></section>' +
          '<section class="tvbox-missav-list-head"><div><div id="missav-breadcrumb" class="tvbox-missav-breadcrumb">片库 / 最近更新</div><h2 id="missav-view-title">最近更新</h2><p id="missav-view-meta">按频道结构浏览</p></div><div class="tvbox-missav-head-actions"><button id="missav-refresh-btn">刷新</button></div></section>' +
          '<section id="missav-list" class="tvbox-missav-list"><div class="tvbox-missav-loading"><div></div><strong>加载中</strong><span>正在读取频道内容</span></div></section>' +
          '<section class="tvbox-missav-pager" id="missav-pager"></section>' +
        '</main>' +
      '</div>' +
    '</div>'

    const navBox = content.querySelector('#missav-channel-nav')
    const subnavBox = content.querySelector('#missav-subnav')
    const listBox = content.querySelector('#missav-list')
    const pagerBox = content.querySelector('#missav-pager')
    const titleBox = content.querySelector('#missav-view-title')
    const metaBox = content.querySelector('#missav-view-meta')
    const breadcrumbBox = content.querySelector('#missav-breadcrumb')

    const normalizePath = (path) => String(path || '/dm539/new')
    const pageFromPath = (path) => Number(new URL(missavUrl(path)).searchParams.get('page') || '1') || 1
    const pagePath = (basePath, page) => {
      const url = new URL(missavUrl(basePath))
      if (page > 1) url.searchParams.set('page', String(page))
      else url.searchParams.delete('page')
      return url.pathname + url.search
    }
    const maxPageFromPages = (pages = []) => pages.reduce((max, page) => {
      const n = Number(new URL(missavUrl(page.path || '')).searchParams.get('page') || '')
      return Number.isFinite(n) && n > max ? n : max
    }, 1)
    const basePathWithoutPage = (path) => {
      const url = new URL(missavUrl(path))
      url.searchParams.delete('page')
      return url.pathname + url.search
    }
    const scrollToListTop = () => {
      const target = listBox.querySelector('.tvbox-missav-card') || listBox
      target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    }
    const computePageSize = () => {
      const width = listBox?.clientWidth || 900
      const columns = Math.max(1, Math.floor(width / 278))
      const navHeight = navBox?.clientHeight || 760
      const rows = Math.max(3, Math.floor(navHeight / 260))
      localPageSize = columns * rows
      return localPageSize
    }
    const bindPathButtons = (scope = content) => {
      scope.querySelectorAll('[data-missav-path]').forEach(btn => btn.addEventListener('click', () => loadMissavPath(btn.dataset.missavPath || '/dm539/new')))
    }
    const renderChannels = () => {
      const dynamic = dynamicChannels.length ? [{ title: '更多频道', items: dynamicChannels.slice(0, 160) }] : []
      const groups = rootChannels.concat(dynamic)
      navBox.innerHTML = groups.map(group => '<section><h3>' + escHtml(group.title) + '</h3>' + group.items.map(item => '<button class="tvbox-missav-nav-item" data-missav-path="' + escHtml(item.path) + '"><span>' + escHtml(privateChannelName(item.name, item.path)) + '</span></button>').join('') + '</section>').join('')
      bindPathButtons(navBox)
      setActivePath(activePath)
    }
    const setActivePath = (path) => {
      activePath = normalizePath(path)
      content.querySelectorAll('[data-missav-path]').forEach(btn => btn.classList.toggle('active', btn.dataset.missavPath === activePath || basePathWithoutPage(btn.dataset.missavPath || '') === basePathWithoutPage(activePath)))
      const source = content.querySelector('#missav-active-source')
      if (source) source.textContent = '私密频道'
    }
    const updateDynamicChannels = (channels = []) => {
      if (!Array.isArray(channels) || !channels.length) return
      const blocked = /vip|login|register|signup|upload|saved|playlist|history|群|club/i
      const seen = new Set(rootChannels.flatMap(group => group.items.map(item => item.path)).concat(dynamicChannels.map(item => item.path)))
      const next = []
      const usedNames = new Map([...rootChannels.flatMap(group => group.items.map(item => [privateChannelName(item.name, item.path), 1])), ...dynamicChannels.map(item => [item.name, 1])])
      for (const item of channels) {
        if (!item?.path || !item?.name || blocked.test(item.path + item.name) || seen.has(item.path)) continue
        const baseName = privateChannelName(item.name, item.path)
        const count = usedNames.get(baseName) || 0
        usedNames.set(baseName, count + 1)
        next.push({ name: count ? (baseName + ' ' + (count + 1)) : baseName, path: item.path })
      }
      if (!next.length) return
      dynamicChannels = dynamicChannels.concat(next)
      renderChannels()
    }
    const renderSubChannels = (categories = []) => {
      if (!Array.isArray(categories) || !categories.length) {
        subnavBox.innerHTML = ''
        return
      }
      subnavBox.innerHTML = '<div class="tvbox-missav-subnav-title">当前频道下的子分类</div><div class="tvbox-missav-subnav-grid">' + categories.map(cat => '<button data-missav-path="' + escHtml(cat.path) + '">' + escHtml(privateChannelName(cat.name, cat.path)) + '</button>').join('') + '</div>'
      bindPathButtons(subnavBox)
    }
    const renderPager = (result, totalItems, shownItems) => {
      const remotePage = pageFromPath(activePath)
      const maxRemotePage = Math.max(remotePage, maxPageFromPages(result.pages || []))
      const localTotal = Math.max(1, Math.ceil(totalItems / computePageSize()))
      const remoteBase = basePathWithoutPage(activePath)
      pagerBox.innerHTML = '<div class="tvbox-missav-pager-main">' +
        '<button id="missav-prev-page" ' + (remotePage <= 1 && localPage <= 1 ? 'disabled' : '') + '>上一页</button>' +
        '<button id="missav-next-page">下一页</button>' +
        '<label>跳至 <input id="missav-page-input" type="number" min="1" value="' + escHtml(String(remotePage)) + '" /> 页</label>' +
        '<button id="missav-page-go">跳转</button>' +
        '<span>第 ' + escHtml(String(remotePage)) + ' 页 / 共 ' + escHtml(String(maxRemotePage)) + ' 页</span>' +
        '<span>本页显示 ' + escHtml(String(shownItems)) + ' / ' + escHtml(String(totalItems)) + '</span>' +
      '</div>'
      pagerBox.querySelector('#missav-prev-page')?.addEventListener('click', () => {
        if (localPage > 1) { localPage -= 1; renderCurrentList(); scrollToListTop(); return }
        if (remotePage > 1) loadMissavPath(pagePath(remoteBase, remotePage - 1), true)
      })
      pagerBox.querySelector('#missav-next-page')?.addEventListener('click', () => {
        if (localPage < localTotal) { localPage += 1; renderCurrentList(); scrollToListTop(); return }
        loadMissavPath(pagePath(remoteBase, remotePage + 1), true)
      })
      pagerBox.querySelector('#missav-page-go')?.addEventListener('click', () => {
        const n = Math.max(1, Number(pagerBox.querySelector('#missav-page-input')?.value || remotePage) || remotePage)
        loadMissavPath(pagePath(remoteBase, n), true)
      })
    }
    const renderCards = (items) => items.map(item => {
      const title = escHtml(item.vod_name || '未命名')
      const meta = escHtml(item.type_name || '')
      const url = escHtml(item._missavUrl || '')
      return '<article class="tvbox-missav-card" data-url="' + url + '" data-title="' + title + '"><button class="tvbox-missav-poster">' + renderPosterImg(item.vod_pic || '', item.vod_name || '', '', '', '影') + (meta ? '<span class="tvbox-missav-duration">' + meta + '</span>' : '') + '<span class="tvbox-missav-playmark">播放</span></button><div class="tvbox-missav-card-body"><div class="tvbox-missav-card-title">' + title + '</div><div class="tvbox-missav-card-actions"><button data-missav-detail>立即播放</button></div></div></article>'
    }).join('')
    const renderCurrentList = () => {
      if (!lastResult) return
      const allItems = lastResult.items || []
      const size = computePageSize()
      const start = (localPage - 1) * size
      const shown = allItems.slice(start, start + size)
      titleBox.textContent = lastResult.title || '频道内容'
      if (breadcrumbBox) breadcrumbBox.textContent = '片库 / ' + (lastResult.title || '频道内容') + ' / 第 ' + pageFromPath(activePath) + ' 页'
      metaBox.textContent = '共 ' + allItems.length + ' 条 · 每页 3 行 · 当前频道'
      if (!shown.length) {
        listBox.innerHTML = '<div class="tvbox-missav-empty-state"><div class="tvbox-empty-title">暂无内容</div><div class="tvbox-empty-sub">当前频道没有可显示的视频。</div></div>'
      } else {
        listBox.innerHTML = '<div class="tvbox-missav-grid">' + renderCards(shown) + '</div>'
      }
      renderPager(lastResult, allItems.length, shown.length)
      listBox.querySelectorAll('[data-missav-detail]').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); openMissavDetail(btn.closest('.tvbox-missav-card')) }))
      listBox.querySelectorAll('.tvbox-missav-card').forEach(card => card.addEventListener('click', () => openMissavDetail(card)))
    }
    const renderError = () => {
      subnavBox.innerHTML = ''
      pagerBox.innerHTML = ''
      listBox.innerHTML = '<div class="tvbox-missav-error-card"><div class="tvbox-missav-error-mark">!</div><div><div class="tvbox-empty-title">加载失败</div><div class="tvbox-empty-sub">当前频道暂时无法读取，请稍后刷新。</div><div class="tvbox-missav-error-actions"><button data-missav-path="/dm539/new">最近更新</button><button data-missav-path="/genres">类型</button><button data-missav-path="/makers">厂商</button></div></div></div>'
      bindPathButtons(listBox)
    }
    const loadMissavPath = async (path = '/dm539/new', shouldScroll = false) => {
      if (/^https?:\/\//i.test(path) && !MISSAV_BASES.some(base => new URL(path).origin === new URL(base).origin)) {
        window.open(path, '_blank', 'noopener')
        return
      }
      localPage = 1
      setActivePath(path)
      subnavBox.innerHTML = ''
      pagerBox.innerHTML = ''
      listBox.innerHTML = '<div class="tvbox-missav-loading"><div></div><strong>加载中</strong><span>正在读取频道内容</span></div>'
      try {
        const result = await fetchMissavPage(path)
        updateDynamicChannels(result.channels || [])
        const cleanedCategories = (result.categories || []).filter(cat => {
        const name = privateChannelName(cat.name, cat.path)
        if (!cat.path || cat.path === basePathWithoutPage(activePath)) return false
        if (/^[0-9]+$/.test(name)) return false
        return !/注册|帳戶|账户|简体中文|繁體中文|所有|單人|单人|多人|发行日期|發行日期|最近更新|收藏|浏览|瀏覽|下一页|下一頁/.test(name)
      })
      renderSubChannels(cleanedCategories)
        lastResult = { ...result, title: currentQuery ? ('搜索：' + currentQuery) : (content.querySelector('[data-missav-path].active span')?.textContent || '频道内容') }
        renderCurrentList()
        if (shouldScroll) setTimeout(scrollToListTop, 80)
      } catch {
        renderError()
      }
    }
    const doMissavSearch = () => {
      const q = content.querySelector('#missav-search-input')?.value.trim() || ''
      if (!q) return loadMissavPath('/dm539/new')
      addSearchHistory(q)
      loadMissavPath('/search/' + encodeURIComponent(q))
    }
    const showMissavSourceHint = () => {}
    const openMissavDetail = async (card) => {
      const url = card?.dataset.url || ''
      const title = card?.dataset.title || '精选内容'
      if (!url) return
      const overlay = el.querySelector('#t-player-overlay')
      const body = el.querySelector('#t-player-body')
      const titleEl = el.querySelector('#t-player-title')
      if (overlay && body) {
        titleEl.textContent = title
        overlay.style.display = 'flex'
        body.innerHTML = '<div class="tvbox-player-loading">正在解析播放...</div>'
      }
      try {
        const detail = await fetchMissavDetail(url)
        const results = (detail.playUrls || []).filter(x => x?.url && isDirectVideoUrl(x.url))
        if (!results.length) throw new Error('当前资源暂不可播放：详情页未解析到 m3u8/mp4 地址')
        const toMissavPlayableUrl = value => /^https:\/\/(?:[^/]+\.)?surrit\.com\//i.test(String(value || '').trim())
          ? 'http://127.0.0.1:18188/hls-proxy?u=' + encodeURIComponent(String(value || '').trim())
          : String(value || '').trim()
        const eps = results.map((x, index) => ({ name: x.name || ('线路 ' + (index + 1)), url: toMissavPlayableUrl(x.url) }))
        const urls = eps.map(x => x.url)
        closePlayer()
        await playCrawlVideo(title, urls[0], 0, eps, urls, true)
      } catch (err) {
        if (body) body.innerHTML = '<div class="tvbox-playback-error"><div class="tvbox-playback-error-title">MISSAV 独立播放器打开失败</div><div>' + escHtml(err?.message || '未知错误') + '</div><div style="margin-top:10px;color:#9ca3af;font-size:12px">入口：openMissavDetail / strict standalone</div></div>'
      }
    }

    renderChannels()
    bindPathButtons(content)
    content.querySelector('#missav-search-btn')?.addEventListener('click', doMissavSearch)
    content.querySelector('#missav-search-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') doMissavSearch() })
    content.querySelector('#missav-refresh-btn')?.addEventListener('click', () => loadMissavPath(activePath))
    window.addEventListener('resize', () => { if (mode === 'missav' && lastResult) renderCurrentList() }, { passive: true })
    loadMissavPath(currentPath)
  }

  async function showMyAvLiveHome(initialSearch = '') {
    const content = el.querySelector('#t-content')
    let activeCategory = MYAVLIVE_CATEGORIES[0]
    let queryText = String(initialSearch || '').trim()
    let currentModels = []
    let previewRefreshTimer = null

    const stopMyAvLivePreviews = () => {
      if (previewRefreshTimer) clearInterval(previewRefreshTimer)
      previewRefreshTimer = null
    }

    const startMyAvLivePreviews = () => {
      stopMyAvLivePreviews()
      let lastListRefreshAt = 0
      let refreshingList = false
      const refresh = async () => {
        const now = Date.now()
        if (!refreshingList && now - lastListRefreshAt > 12000) {
          refreshingList = true
          lastListRefreshAt = now
          try {
            const latestModels = await fetchMyAvLiveModels(activeCategory, queryText)
            const latestByKey = new Map(latestModels.map(item => [String(item.streamName || item.username || item.id), item]))
            currentModels = currentModels.map(item => latestByKey.get(String(item.streamName || item.username || item.id)) || item)
            currentModels.forEach((item, index) => {
              const card = listBox.querySelector('[data-myavlive-index="' + index + '"]')
              if (!card) return
              const img = card.querySelector('img[data-myavlive-preview-img]')
              if (img && item.preview) {
                img.dataset.myavlivePreviewImg = item.preview
                img.src = myAvLiveNoCacheUrl(item.preview)
              }
              const viewers = card.querySelector('.tvbox-myavlive-viewers')
              if (viewers) viewers.textContent = item.viewers ? item.viewers.toLocaleString() + ' 人观看' : '实时在线'
            })
            metaBox.textContent = '在线房间 ' + currentModels.length + ' 个 · 实时画面更新 ' + new Date().toLocaleTimeString()
          } catch (e) {
          } finally {
            refreshingList = false
          }
        }
        listBox.querySelectorAll('img[data-myavlive-preview-img]').forEach(img => {
          const src = img.dataset.myavlivePreviewImg || ''
          if (src) img.src = myAvLiveNoCacheUrl(src)
        })
      }
      refresh()
      previewRefreshTimer = setInterval(refresh, 3000)
    }

    content.innerHTML = '<div class="tvbox-missav-app tvbox-myavlive-app">' +
      '<header class="tvbox-missav-topbar">' +
        '<div class="tvbox-missav-hero-copy"><div class="tvbox-missav-kicker">LIVE STREAM</div><div class="tvbox-missav-title"><strong>实时直播</strong><span id="myavlive-active-source">MyAvLive</span></div><p>每次刷新列表与点击播放都会实时请求最新直播间和最新 m3u8，不使用旧播放地址。</p></div>' +
        '<div class="tvbox-missav-hero-actions"><div class="tvbox-missav-search"><input id="myavlive-search-input" type="search" autocomplete="off" placeholder="搜索主播昵称" value="' + escHtml(queryText) + '" /><button id="myavlive-search-btn">搜索</button></div><div class="tvbox-missav-overview"><span>实时列表</span><span>播放前重解</span><span>HLS直播</span><span>高速代理</span></div></div>' +
      '</header>' +
      '<div class="tvbox-missav-layout tvbox-myavlive-layout">' +
        '<aside class="tvbox-missav-nav" id="myavlive-channel-nav"></aside>' +
        '<main class="tvbox-missav-content">' +
          '<section class="tvbox-missav-list-head"><div><div id="myavlive-breadcrumb" class="tvbox-missav-breadcrumb">直播 / 推荐</div><h2 id="myavlive-view-title">推荐女主播</h2><p id="myavlive-view-meta">正在读取实时在线房间</p></div><div class="tvbox-missav-head-actions"><button id="myavlive-refresh-btn">实时刷新</button></div></section>' +
          '<section id="myavlive-list" class="tvbox-missav-list"><div class="tvbox-missav-loading"><div></div><strong>加载中</strong><span>正在实时读取直播列表</span></div></section>' +
        '</main>' +
      '</div>' +
    '</div>'

    const navBox = content.querySelector('#myavlive-channel-nav')
    const listBox = content.querySelector('#myavlive-list')
    const titleBox = content.querySelector('#myavlive-view-title')
    const metaBox = content.querySelector('#myavlive-view-meta')
    const breadcrumbBox = content.querySelector('#myavlive-breadcrumb')
    const searchInput = content.querySelector('#myavlive-search-input')

    const renderChannels = () => {
      navBox.innerHTML = '<section><h3>直播频道</h3>' + MYAVLIVE_CATEGORIES.map(cat => '<button class="tvbox-missav-nav-item" data-myavlive-cat="' + escHtml(cat.id) + '"><span>' + escHtml(cat.name) + '</span></button>').join('') + '</section>'
      navBox.querySelectorAll('[data-myavlive-cat]').forEach(btn => btn.addEventListener('click', () => {
        activeCategory = MYAVLIVE_CATEGORIES.find(cat => cat.id === btn.dataset.myavliveCat) || MYAVLIVE_CATEGORIES[0]
        queryText = ''
        searchInput.value = ''
        loadMyAvLive()
      }))
    }

    const setActiveCategory = () => {
      navBox.querySelectorAll('[data-myavlive-cat]').forEach(btn => btn.classList.toggle('active', btn.dataset.myavliveCat === activeCategory.id))
      titleBox.textContent = activeCategory.name
      breadcrumbBox.textContent = '实时直播 / ' + activeCategory.name
      content.querySelector('#myavlive-active-source').textContent = 'MyAvLive · ' + activeCategory.name
    }

    const showMyAvLiveInlineNotice = (message, type = 'warn') => {
      const old = content.querySelector('.tvbox-myavlive-inline-notice')
      if (old) old.remove()
      const notice = document.createElement('div')
      notice.className = 'tvbox-myavlive-inline-notice tvbox-myavlive-inline-notice-' + type
      notice.style.cssText = 'margin:10px 0;padding:10px 12px;border-radius:12px;background:' + (type === 'error' ? 'rgba(239,68,68,.12)' : 'rgba(245,158,11,.14)') + ';color:' + (type === 'error' ? '#ef4444' : '#b45309') + ';font-size:13px;line-height:1.5'
      notice.textContent = message
      listBox.parentNode.insertBefore(notice, listBox)
      setTimeout(() => { if (notice.isConnected) notice.remove() }, 4500)
    }

    const renderModels = () => {
      stopMyAvLivePreviews()
      if (!currentModels.length) {
        listBox.innerHTML = '<div class="tvbox-empty">当前没有解析到在线直播间，请稍后点“实时刷新”。</div>'
        return
      }
      listBox.innerHTML = currentModels.map((item, index) => {
        const previewUrl = item.preview || ''
        const previewImg = previewUrl ? myAvLiveNoCacheUrl(previewUrl) : ''
        const viewers = item.viewers ? item.viewers.toLocaleString() + ' 人观看' : '实时在线'
        const tags = [item.status === 'public' ? '现场直播' : item.status, viewers].filter(Boolean)
        return '<article class="tvbox-missav-card tvbox-myavlive-live-card" data-myavlive-index="' + index + '">' +
          '<button class="tvbox-missav-poster tvbox-myavlive-live-cover" type="button" data-myavlive-play="' + index + '">' + (previewImg ? '<img src="' + escHtml(previewImg) + '" data-myavlive-preview-img="' + escHtml(previewUrl) + '" alt="' + escHtml(item.title) + ' 直播画面" loading="eager" decoding="async" referrerpolicy="no-referrer" />' : '<div class="tvbox-myavlive-live-empty"><span>LIVE</span><small>等待实时画面</small></div>') + '<span class="tvbox-myavlive-device">▯</span><span class="tvbox-myavlive-live-signal"><i></i>LIVE</span><span class="tvbox-myavlive-new">NEW</span><span class="tvbox-myavlive-viewers">' + escHtml(viewers) + '</span><div class="tvbox-myavlive-live-caption"><strong>' + escHtml(item.title) + '</strong><small>' + escHtml(tags.join(' · ')) + '</small></div></button>' +
          '<div class="tvbox-missav-card-body"><div class="tvbox-missav-card-title">' + escHtml(item.title) + '</div><div class="tvbox-missav-meta">' + escHtml(tags.join(' · ')) + '</div><div class="tvbox-missav-card-actions"><button type="button" data-myavlive-play="' + index + '">进入直播间</button></div></div>' +
        '</article>'
      }).join('')
      listBox.querySelectorAll('[data-myavlive-play]').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); openMyAvLivePlayer(Number(btn.dataset.myavlivePlay || 0)) }))
      listBox.querySelectorAll('[data-myavlive-index]').forEach(card => card.addEventListener('click', () => openMyAvLivePlayer(Number(card.dataset.myavliveIndex || 0))))
      startMyAvLivePreviews()
    }

    const loadMyAvLive = async () => {
      setActiveCategory()
      listBox.innerHTML = '<div class="tvbox-missav-loading"><div></div><strong>实时刷新中</strong><span>正在读取最新在线房间</span></div>'
      metaBox.textContent = '正在实时请求 ' + new Date().toLocaleTimeString()
      try {
        currentModels = await fetchMyAvLiveModels(activeCategory, queryText)
        metaBox.textContent = '在线房间 ' + currentModels.length + ' 个 · 更新时间 ' + new Date().toLocaleTimeString()
        renderModels()
      } catch (err) {
        currentModels = []
        listBox.innerHTML = '<div class="tvbox-playback-error"><div class="tvbox-playback-error-title">实时直播列表读取失败</div><div>' + escHtml(err?.message || '未知错误') + '</div></div>'
        metaBox.textContent = '读取失败'
      }
    }

    const openMyAvLivePlayer = async (index) => {
      const model = currentModels[index]
      if (!model) return
      const card = listBox.querySelector('[data-myavlive-index="' + index + '"]')
      const actionBtn = card?.querySelector('.tvbox-missav-card-actions [data-myavlive-play]')
      const oldText = actionBtn?.textContent || ''
      if (actionBtn) {
        actionBtn.disabled = true
        actionBtn.textContent = '解析中...'
      }
      try {
        stopMyAvLivePreviews()
        const resolved = await resolveMyAvLiveLiveUrl(model)
        const eps = [{ name: '实时直播', url: resolved.playableUrl }]
        closePlayer()
        await playCrawlVideo(resolved.title || model.title, resolved.playableUrl, 0, eps, [resolved.playableUrl], true, {
          playerKind: 'myavlive-mmp',
          source: 'myavlive',
          id: resolved.username || resolved.streamName || resolved.playableUrl,
          epName: '实时直播',
          desc: 'MyAvLive 实时直播 · MMP/Mouflon',
          pic: resolved.preview || model.preview || '',
          mmpPresets: resolved.presets || model.presets || [],
          mmpPresets265: resolved.presets265 || model.presets265 || [],
          mmpPresetsAv1: resolved.presetsAv1 || model.presetsAv1 || [],
        })
      } catch (err) {
        closePlayer()
        const message = err?.message || '实时直播解析失败，请刷新列表后重试。'
        showMyAvLiveInlineNotice(message, 'warn')
        if (/不是公开直播状态|广告|付费预热视频/.test(message)) {
          currentModels = currentModels.filter((_, itemIndex) => itemIndex !== index)
          renderModels()
          metaBox.textContent = '该主播状态已变化，已从列表移除 · 更新时间 ' + new Date().toLocaleTimeString()
          setTimeout(() => loadMyAvLive(), 1200)
        }
      } finally {
        if (actionBtn && actionBtn.isConnected) {
          actionBtn.disabled = false
          actionBtn.textContent = oldText || '进入播放器'
        }
        startMyAvLivePreviews()
      }
    }

    const doSearch = () => {
      queryText = searchInput.value.trim()
      if (queryText) addSearchHistory(queryText)
      loadMyAvLive()
    }

    renderChannels()
    content.querySelector('#myavlive-refresh-btn')?.addEventListener('click', () => loadMyAvLive())
    content.querySelector('#myavlive-search-btn')?.addEventListener('click', doSearch)
    searchInput?.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch() })
    loadMyAvLive()
  }

  function showCrawlInput() {
    const content = el.querySelector('#t-content')
    content.innerHTML = `
      <div class="tvbox-crawl-panel">
        <div class="tvbox-crawl-header">
          <div class="tvbox-crawl-icon">🕷️</div>
          <div class="tvbox-crawl-title">${mt('crawlPlayerTitle')}</div>
          <div class="tvbox-crawl-sub">${mt('crawlPlayerSubtitle')}</div>
        </div>
        <div class="tvbox-crawl-form" style="margin-bottom:8px">
          <input id="t-crawl-url" type="url" placeholder="${mt('crawlUrlPlaceholder')}" />
          <button id="t-crawl-go" class="tvbox-crawl-btn" style="background:#0a59f7">🔬 ${mt('deepSniff')}</button>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--text-secondary)">
            <input id="t-crawl-auto" type="checkbox" style="width:15px;height:15px" checked />
            🚀 ${mt('crawlAutoplay')}
          </label>
          <button id="t-crawl-urlbtn" class="tvbox-tab" style="font-size:12px;padding:2px 10px">📋 ${mt('directUrlInput')}</button>
        </div>
        <div class="tvbox-crawl-hint">
          <p>${mt('crawlSupportHint')}</p>
        </div>
        <div id="t-crawl-status" class="tvbox-crawl-status"></div>
        <div id="t-crawl-results" class="tvbox-crawl-results"></div>
      </div>
    `

    const input = content.querySelector('#t-crawl-url')
    const btn   = content.querySelector('#t-crawl-go')
    const autoPlay = content.querySelector('#t-crawl-auto')

    async function doCrawl() {
      const url = normalizeHttpUrl(input.value)
      if (!url) {
        showCrawlStatus(mt('invalidHttpUrl'), 'error')
        return
      }
      input.value = url
      btn.disabled = true
      btn.textContent = autoPlay.checked ? `⏳ ${mt('sniffAndPlayLoading')}` : `⏳ ${mt('sniffingLoading')}`
      showCrawlStatus(autoPlay.checked ? `🚀 ${mt('sniffAndPlayStatus')}` : `🔍 ${mt('deepSniffStatus')}`, 'loading')
      _crawlResults = []
      let autoPlayed = false
      const results = await crawlSite(url, autoPlay.checked ? (name, u) => {
        if (autoPlayed) return
        autoPlayed = true
        // 第一个可用链接 → 直接播放（独立窗口）
        showCrawlStatus(mt('crawlPlayableFound', { name }), 'success')
        btn.disabled = false; btn.textContent = `🔬 ${mt('deepSniff')}`
        playCrawlVideo(name, u, 0, [], [u])
      } : null)
      _crawlResults = results
      btn.disabled = false
      btn.textContent = `🔬 ${mt('deepSniff')}`
      if (!autoPlay.checked || !results.length) renderCrawlResults(results)
    }

    btn.addEventListener('click', doCrawl)
    content.querySelector('#t-crawl-urlbtn')?.addEventListener('click', showUrlInput)
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doCrawl() })
    setTimeout(() => input.focus(), 100)
  }

  function showCrawlStatus(msg, type) {
    const el2 = el.querySelector('#t-crawl-status')
    if (!el2) return
    el2.className = 'tvbox-crawl-status tvbox-crawl-status-' + (type || 'info')
    el2.textContent = msg
    el2.style.display = 'block'
  }

  // ── 缩略图提取 ─────────────────────────────────────
  function extractThumb(html) {
    const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    if (og && og[1]) return og[1]
    const twitter = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
    if (twitter && twitter[1]) return twitter[1]
    return ''
  }

  // ── DASH / MPD 检测 ─────────────────────────────────
  function extractDash(html, base) {
    const results = []
    const mpdLinks = html.match(/["']([^"']+\.mpd[^"']*)["']/gi) || []
    mpdLinks.forEach(raw => {
      const url = raw.replace(/['">]/g, '')
      if (url.startsWith('http')) results.push({ name: 'DASH manifest', url, thumb: '', type: 'dash' })
    })
    // init.mp4 + seg*.m4s 模式
    const segMatches = html.match(/["']([^"']*init\.mp4[^"']*)["']/gi) || []
    segMatches.forEach(raw => {
      const url = raw.replace(/['">]/g, '')
      if (url.startsWith('http')) results.push({ name: mt('m4sSegmentVideo'), url, thumb: '', type: 'm4s' })
    })
    return results
  }

  // ── 站点指纹策略记忆 ────────────────────────────────
  const CRAWL_FP_KEY = (domain) => 'crawl_fp_' + domain
  function getSiteStrategy(domain) {
    try { return JSON.parse(localStorage.getItem(CRAWL_FP_KEY(domain)) || 'null') } catch { return null }
  }
  function saveSiteStrategy(domain, strat) {
    try { localStorage.setItem(CRAWL_FP_KEY(domain), JSON.stringify(strat)) } catch {}
  }

  // crawlSite: 爬取URL的视频链接
  // onFirstMatch(url, name): 每条策略首次找到结果时的回调（用于自动播放模式）
  async function crawlSite(url, onFirstMatch) {
    url = normalizeHttpUrl(url)
    if (!url) return []
    if (isDirectVideoUrl(url)) {
      const name = url.split('/').pop().replace(/\.(m3u8|mp4|mpd)/i, '') || mt('directVideo')
      const results = [{ name, url, thumb: '', type: 'direct' }]
      onFirstMatch?.(name, url)
      return results
    }

    // 云盘检测
    const panDomains = ['pan.baidu.com', 'yun.baidu.com', 'wangpan.cn', 'uc.cn', 'quark.cn']
    if (panDomains.some(d => url.includes(d))) {
      showCrawlStatus(mt('cloudLinkDetected'), 'loading')
      try {
        const resp = await fetch('https://api.pan666.cn/?url=' + encodeURIComponent(url), { signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined })
        const json = await resp.json().catch(() => null)
        if (json && json.url) { const cloudName = mt('cloudDirectLink'); onFirstMatch?.(cloudName, json.url); return [{ name: cloudName, url: json.url, thumb: '', type: 'direct' }] }
      } catch {}
      return [{ name: mt('cloudPendingParse'), url, thumb: '', type: 'cloud' }]
    }

    let html = ''
    try { html = await crawlFetch(url) } catch (e) { showCrawlStatus(mt('pageFetchFailed', { msg: e.message }), 'error'); return [] }

    const thumb = extractThumb(html)
    let domain = ''
    try { domain = new URL(url).hostname.replace(/\./g, '_') } catch {}
    const siteStrat = domain ? getSiteStrategy(domain) : null

    const strategies = [
      { name: mt('crawlStrategyM3u8Regex'), fn: () => extractM3u8(html, url, thumb) },
      { name: mt('crawlStrategyMp4Regex'),  fn: () => extractMp4(html, url) },
      { name: mt('crawlStrategyDashDetect'), fn: () => extractDash(html, url) },
      { name: mt('crawlStrategyIframeRecursive'), fn: async () => {
        const iframes = extractIframes(html, url)
        const found = []
        for (const iframe of iframes.slice(0, 3)) {
          try {
            const frameHtml = await crawlFetch(iframe.src).catch(() => '')
            const fi = extractM3u8(frameHtml, iframe.src, thumb)
            const fp = extractMp4(frameHtml, iframe.src)
            fi.forEach(i => { i.thumb = i.thumb || thumb; found.push(i) })
            fp.forEach(i => { i.thumb = i.thumb || thumb; found.push(i) })
            const nested = extractIframes(frameHtml, iframe.src).slice(0, 3)
            for (const n of nested) {
              try {
                const nHtml = await crawlFetch(n.src).catch(() => '')
                extractM3u8(nHtml, n.src, thumb).forEach(i => { i.thumb = i.thumb || thumb; found.push(i) })
                extractMp4(nHtml, n.src).forEach(i => { i.thumb = i.thumb || thumb; found.push(i) })
              } catch {}
            }
          } catch {}
        }
        return found
      }},
      { name: mt('crawlStrategyCmsPlayerJs'), fn: async () => {
        // 如果 URL 本身就是播放页（ruvodplay/play/vodplay），直接用当前页HTML提取
        let playUrl = ''
        let playHtml = ''
        const isPlayPage = /(ruvodplay|play|vodplay)\/\d+/i.test(url)
        if (isPlayPage) {
          playUrl = url
          playHtml = html
        } else {
          // 从详情页HTML中找播放页链接
          const playPageMatch = html.match(/href=["'](\/[^"']*\/ruvodplay\/\d+[^"']*)["']/i)
            || html.match(/href=["'](\/[^"']*\/play\/\d+[^"']*)["']/i)
            || html.match(/href=["'](\/[^"']*\/vodplay\/\d+[^"']*)["']/i)
          if (!playPageMatch) return []
          playUrl = playPageMatch[1].replace(/[?#].*$/, '')
          if (!playUrl) return []
          let base = ''
          try { base = new URL(url).origin } catch {}
          playUrl = playUrl.startsWith('http') ? playUrl : base + playUrl
          playHtml = await crawlFetch(playUrl).catch(() => '')
          if (!playHtml) return []
        }
        // 把 \/ 替换成 /（JS转义）
        const fixed = playHtml.replace(/\\\//g, '/')
        // 找 var player_aaaa = {...} 或类似JS变量
        const playerVars = fixed.match(/var\s+player_\w+\s*=\s*(\{[^;]+\});?/i)
          || fixed.match(/player(?:_\w+)?\s*=\s*(\{[^;]+\});?/i)
          || fixed.match(/"url"\s*:\s*"([^"]+)"/i)
        const found = []
        if (playerVars) {
          const jsonStr = playerVars[1] || playerVars[0]
          // 尝试提取 vod_data.url 或直接 url 字段
          const m3u8Match = jsonStr.match(/"url"\s*:\s*"([^"]+\.m3u8[^"]*)"/i)
            || jsonStr.match(/"(https?:[^"\\]+\.m3u8[^"\\]*)"/i)
            || jsonStr.match(/"vod_data"\s*:\s*\{[^}]+\}/i)
          if (m3u8Match) {
            let vodDataStr = m3u8Match[0]
            // 提取 vod_data 对象
            const vodUrlMatch = vodDataStr.match(/"url"\s*:\s*"([^"]+)"/i)
            if (vodUrlMatch) {
              let videoUrl = vodUrlMatch[1].replace(/\\/g, '')
              // 反转义 JS Unicode 转义 \u3a \\u3a → :
              try { videoUrl = JSON.parse('"' + videoUrl + '"') } catch {}
              if (videoUrl && (videoUrl.includes('.m3u8') || videoUrl.includes('.mp4'))) {
                const name = playUrl.split('/').pop().replace(/\.html/i, '') || mt('cmsVideo')
                found.push({ name, url: videoUrl, thumb, type: videoUrl.includes('.m3u8') ? 'm3u8' : 'mp4' })
              }
            }
          }
        }
        // 也直接从页面HTML找m3u8/mp4（转义或未转义）
        const directM3u8 = fixed.match(/"(https?:[^"\\]+\.m3u8[^"\\]*)"/i) || []
        const directMp4 = fixed.match(/"(https?:[^"\\]+\.mp4[^"\\]*)"/i) || []
        ;[...directM3u8, ...directMp4].forEach(raw => {
          const u = raw.replace(/[\\"]/g, '').split('?')[0]
          if (u.startsWith('http') && (u.includes('.m3u8') || u.includes('.mp4'))) {
            found.push({ name: u.split('/').pop().replace(/\.(m3u8|mp4).*/i, '') || mt('videoTitleFallback'), url: u, thumb, type: u.includes('.m3u8') ? 'm3u8' : 'mp4' })
          }
        })
        return found
      }},
      { name: mt('crawlStrategyListExtract'), fn: () => extractVideoList(html, url) },
      { name: mt('crawlStrategyScriptParse'), fn: () => extractFromScript(html, url) },
      // 策略6：JS渲染（用 Edge headless + CDP 渲染后提取）
      { name: mt('crawlStrategyJsRender'), fn: async () => {
        const { invoke } = await import('@tauri-apps/api/core').catch(() => ({}))
        if (!invoke) return []
        try {
          const result = await invoke('fetch_page_js', { url })
          if (!result || result === '[]' || !result.startsWith('[')) return []
          const arr = JSON.parse(result)
          if (!Array.isArray(arr)) return []
          return arr.filter(r => r && r.url).map(r => ({
            name: r.name || r.url.split('/').pop().replace(/\.[^.]+$/, '') || mt('jsVideo'),
            url: r.url,
            thumb: r.thumb || '',
            type: r.url.includes('.m3u8') ? 'm3u8' : (r.url.includes('.mp4') ? 'mp4' : r.type || 'unknown')
          }))
        } catch { return [] }
      }},
    ]

    // 已通知自动播放的 url 集合（防重复）
    const notifiedUrls = new Set()
    function notifyMatch(item) {
      if (!item?.url || notifiedUrls.has(item.url)) return
      notifiedUrls.add(item.url)
      onFirstMatch?.(item.name, item.url)
    }

    const allResults = []
    const settled = await Promise.allSettled(strategies.map(async (s, i) => {
      showCrawlStatus(mt('crawlStrategyRunning', { current: i + 1, total: strategies.length, name: s.name }), 'loading')
      const r = await s.fn()
      showCrawlStatus(mt('crawlStrategyDone', { current: i + 1, total: strategies.length, name: s.name, count: Array.isArray(r) ? r.length : 0 }), 'loading')
      // 自动播放：每条策略首次找到结果立即通知
      if (onFirstMatch && Array.isArray(r) && r.length > 0) notifyMatch(r[0])
      return r
    }))

    settled.forEach((p, i) => {
      if (p.status === 'fulfilled' && Array.isArray(p.value)) {
        p.value.forEach(item => { item.thumb = item.thumb || thumb; allResults.push(item) })
        if (p.value.length > 0 && domain && !siteStrat) saveSiteStrategy(domain, strategies[i].name)
      }
    })

    const seen = new Set()
    return allResults.filter(r => {
      if (!r.url) return false
      if (seen.has(r.url)) return false
      seen.add(r.url)
      return true
    })
  }

  // User-Agent 随机池（防反爬）
  const CRAWL_UAS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ]
  const CRAWL_TIMEOUT = 10000  // 10秒超时
  const CRAWL_RETRIES = 2     // 最多重试2次

  async function crawlFetch(pageUrl, depth = 0) {
    const ua = CRAWL_UAS[Math.floor(Math.random() * CRAWL_UAS.length)]
    const headers = { 'Accept': 'text/html,application/xhtml+xml,*/*', 'Accept-Language': 'zh-CN,zh;q=0.9', 'User-Agent': ua }

    async function _doFetch(signal) {
      // ── 优先：Tauri Rust 后端代理（CORS 穿透）────────
      try {
        const { invoke } = await import('@tauri-apps/api/core').catch(() => ({}))
        if (invoke) {
          const html = await invoke('fetch_page', { url: pageUrl }).catch(() => null)
          if (html) return html
        }
      } catch {}
      // ── 降级：浏览器 fetch ───────────────────────
      const resp = await fetch(pageUrl, { signal, credentials: 'include', headers })
      if (!resp.ok) throw new Error('HTTP ' + resp.status)
      return resp.text()
    }

    // 尝试 fetch，带超时
    let lastErr
    for (let i = 0; i <= CRAWL_RETRIES; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 1000)) // 重试前等1秒
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), CRAWL_TIMEOUT)
        const html = await _doFetch(controller.signal)
        clearTimeout(timer)
        return html
      } catch (e) {
        lastErr = e
        if (e.name === 'AbortError') lastErr = new Error(mt('requestTimeoutSeconds', { seconds: CRAWL_TIMEOUT / 1000 }))
      }
    }
    throw lastErr || new Error(mt('fetchFailed'))
  }

  function extractM3u8(html, base, baseThumb) {
    const results = []
    // 1) 页面直接 URL
    const re = /(?:src|href|url|video|media)[\s"'=]*(\S+\.m3u8[^"'<>\s]*)/gi
    let m
    while ((m = re.exec(html)) !== null) {
      const raw = m[1].replace(/['"]/g, '').split('?')[0]
      const resolved = raw.startsWith('http') ? raw : new URL(raw, base).href
      if (resolved.includes('.m3u8')) {
        const name = raw.split('/').pop().replace('.m3u8', '') || mt('m3u8Video')
        results.push({ name, url: resolved, thumb: baseThumb || '', type: 'm3u8' })
      }
    }
    // 2) JSON 字符串
    const jsonRe = /"(https?:[^"]+\.m3u8[^"]*)"/gi
    while ((m = jsonRe.exec(html)) !== null) {
      const resolved = m[1].split('?')[0]
      if (resolved.includes('.m3u8')) {
        const name = resolved.split('/').pop().replace('.m3u8', '').split(/[,&?]/)[0] || mt('m3u8Video')
        results.push({ name, url: resolved, thumb: baseThumb || '', type: 'm3u8' })
      }
    }
    // 3) M3U8 多分辨率变体（#EXT-X-STREAM-INF）
    if (html.includes('#EXTM3U') && html.includes('#EXT-X-STREAM-INF')) {
      const lines = html.split('\n')
      let curRes = '', curBw = '', curUrl = ''
      for (const line of lines) {
        const l = line.trim()
        if (l.startsWith('#EXT-X-STREAM-INF:')) {
          const bw = l.match(/BANDWIDTH=(\d+)/)?.[1]
          const res = l.match(/RESOLUTION=([^,]+)/)?.[1] || ''
          curBw = bw ? Math.round(parseInt(bw) / 1000) + 'k' : ''
          curRes = res ? res.replace('x', 'p ') : ''
        } else if (l && !l.startsWith('#')) {
          curUrl = l.startsWith('http') ? l : new URL(l, base).href
          const label = (curRes + ' ' + curBw).trim() || mt('streamLabel')
          results.push({ name: '[' + label + '] ' + (curUrl.split('/').pop().replace('.m3u8', '') || 'M3U8'), url: curUrl, thumb: baseThumb || '', type: 'm3u8' })
          curUrl = ''
        }
      }
    }
    return results
  }

  function extractMp4(html, base) {
    const results = []
    const re = /(?:src|href|url|video|media)[\s"'=]*(\S+\.mp4[^"'<>\s]*)/gi
    let m
    while ((m = re.exec(html)) !== null) {
      const raw = m[1].replace(/['"]/g, '').split('?')[0]
      const resolved = raw.startsWith('http') ? raw : new URL(raw, base).href
      if (resolved.includes('.mp4')) {
        const name = raw.split('/').pop().replace('.mp4', '') || mt('mp4Video')
        results.push({ name, url: resolved, thumb: '', type: 'mp4' })
      }
    }
    return results
  }

  function extractIframes(html, base) {
    const results = []
    const re = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi
    let m
    while ((m = re.exec(html)) !== null) {
      const src = m[1].trim()
      if (src && !src.startsWith('about:') && !src.startsWith('javascript:')) {
        const resolved = src.startsWith('http') ? src : new URL(src, base).href
        results.push({ src: resolved })
      }
    }
    const re2 = /<iframe[^>]+data-src=["']([^"']+)["'][^>]*>/gi
    while ((m = re2.exec(html)) !== null) {
      const src = m[1].trim()
      if (src) {
        const resolved = src.startsWith('http') ? src : new URL(src, base).href
        results.push({ src: resolved })
      }
    }
    return results
  }

  function extractVideoList(html, base) {
    const results = []
    const re = /<(?:a|div|li)[^>]+(?:href|data-url|data-src)[\s="']*([^"'<>\s]+)[^>]*>([^<]{2,60})/gi
    let m
    while ((m = re.exec(html)) !== null) {
      const rawUrl = m[1].trim()
      const title = m[2].replace(/<[^>]+>/g, '').trim()
      if (!rawUrl || !title || rawUrl.length < 5) continue
      const resolved = rawUrl.startsWith('http') ? rawUrl : new URL(rawUrl, base).href
      if (resolved.includes('.m3u8') || resolved.includes('.mp4') ||
          /player|video|play|watch|episode|detail/i.test(resolved)) {
        results.push({ name: title || resolved.split('/').pop(), url: resolved, thumb: '', type: 'link' })
      }
    }
    return results
  }

  function extractFromScript(html, base) {
    const results = []
    // 预处理：把 JavaScript 转义的 \/ 和 \u 替换成正常字符
    const fixed = html.replace(/\\\//g, '/').replace(/\\u([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    // ── 1. 从 <script> 块中提取 JS 变量赋值的 URL ──────────
    const varPatterns = [
      /(?:var|let|const)\s+\w+\s*=\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi,
      /(?:player|video|src|media|videoUrl|video_url|playUrl|play_url)\s*[=:]\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi,
      /url\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi,
    ]
    const varRe = /(?:var|let|const)\s+\w+\s*=\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']|player\.src\s*=\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)|video\.src\s*=\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)/gi
    // 通用：寻找包含 m3u8/mp4 的赋值语句或对象属性
    const scriptBlocks = fixed.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || []
    scriptBlocks.forEach(block => {
      const lines = block.replace(/<\/script>/i, '').replace(/<script[^>]*>/i, '')
      const matches = lines.match(/["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/g) || []
      matches.forEach(raw => {
        const url = raw.replace(/["' >]/g, '').split('?')[0]
        if (url.startsWith('http')) {
          const type = url.includes('.m3u8') ? 'm3u8' : 'mp4'
          const name = decodeURIComponent(url.split('/').pop().replace(/\.(m3u8|mp4)/i, '')) || mt(type === 'm3u8' ? 'm3u8Video' : 'mp4Video')
          results.push({ name, url, thumb: '', type })
        }
      })
    })
    // ── 2. JSON 块中提取 m3u8/mp4 ──────────────────────
    const jsonBlocks = fixed.match(/\{[^{}]{50,50000}\}/g) || []
    jsonBlocks.forEach(block => {
      const m3u8Matches = block.match(/"(https?:[^"]+\.m3u8[^"]*)"/gi) || []
      const mp4Matches = block.match(/"(https?:[^"]+\.mp4[^"]*)"/gi) || []
      ;[...m3u8Matches, ...mp4Matches].forEach(raw => {
        const url = raw.replace(/["' >]/g, '').split('?')[0]
        if (url.startsWith('http')) {
          const type = url.includes('.m3u8') ? 'm3u8' : 'mp4'
          const name = decodeURIComponent(url.split('/').pop().replace(/\.(m3u8|mp4)/i, '')) || mt(type === 'm3u8' ? 'm3u8Video' : 'mp4Video')
          results.push({ name, url, thumb: '', type })
        }
      })
    })
    return results
  }

  function renderCrawlResults(results) {
    const container = el.querySelector('#t-crawl-results')
    if (!results || results.length === 0) {
      container.innerHTML = `<div class="tvbox-empty"><div class="tvbox-empty-icon">🔍</div><div class="tvbox-empty-title">${mt('crawlNoVideoTitle')}</div><div class="tvbox-empty-sub">${mt('crawlNoVideoSubtitle')}</div></div>`
      showCrawlStatus('', 'info')
      return
    }
    showCrawlStatus(mt('crawlPlayableCount', { count: results.length }), 'success')

    // 导出按钮
    const exportBar = '<div style="display:flex;gap:10px;margin-bottom:16px">' +
      `<button id="_crawl-export-json" class="tvbox-crawl-btn" style="flex:1">📥 ${mt('exportJson')}</button>` +
      `<button id="_crawl-export-m3u" class="tvbox-crawl-btn" style="flex:1">📄 ${mt('exportM3u')}</button></div>`
    container.innerHTML = exportBar + '<div class="tvbox-grid">' + results.map((r, i) => {
      const typeIcon = { direct: '🎬', m3u8: '📺', mp4: '🎞️', dash: '📡', m4s: '🎞️', cloud: '☁️', link: '🔗' }[r.type] || '📺'
      const picHtml = r.thumb
        ? '<img src="' + escHtml(r.thumb) + '" alt="' + escHtml(r.name) + '" loading="lazy" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display=\'none\';this.parentElement.innerHTML=\'<span style=font-size:32px;display:flex;align-items:center;justify-content:center;width:100%;height:100%>' + typeIcon + '</span>\'" />'
        : '<span style="font-size:32px;display:flex;align-items:center;justify-content:center;width:100%;height:100%">' + typeIcon + '</span>'
      return '<div class="tvbox-card tvbox-crawl-card" data-index="' + i + '">' +
        '<div class="tvbox-card-inner">' +
          '<div class="tvbox-card-pic"><div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:8px">' + picHtml + '</div></div>' +
          '<div class="tvbox-card-info">' +
            '<div class="tvbox-card-title" style="font-size:12px;line-height:1.3">' + escHtml(r.name.slice(0, 40)) + '</div>' +
            '<div class="tvbox-card-sub">' + r.type.toUpperCase() + '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    }).join('') + '</div>'

    // JSON 导出
    container.querySelector('#_crawl-export-json')?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' })
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'crawl_results.json' })
      a.click()
    })
    // M3U 导出
    container.querySelector('#_crawl-export-m3u')?.addEventListener('click', () => {
      const m3u = '#EXTM3U\n' + results.filter(r => r.url.includes('.m3u8') || r.url.includes('.mp4')).map(r => '#EXTINF:-1,' + r.name + '\n' + r.url).join('\n')
      const blob = new Blob([m3u], { type: 'audio/x-mpegurl' })
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'crawl_results.m3u' })
      a.click()
    })

    container.querySelectorAll('.tvbox-crawl-card').forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.index)
        const r = _crawlResults[idx]
        if (r) playCrawlVideo(r.name, r.url, 0, [], [r.url])
      })
    })
  }

  // playCrawlVideo: 独立窗口播放（不影响主界面）
  async function playCrawlVideo(name, url, resume = 0, allEps, allUrls, strictStandalone = false, extraCtx = {}) {
    resume = 0
    const ctx = { id: url.startsWith('tauri://localhost/hls-proxy') ? name : url, source: 'crawl', epName: name, ...extraCtx }
    const { invoke } = await import('@tauri-apps/api/core').catch(() => ({}))
    if (invoke) {
      try {
        await invoke('open_player_window', {
          url, title: name, resume,
          lang: getLang(),
          allEps: JSON.stringify(allEps || []),
          allUrls: JSON.stringify(allUrls || [url]),
          allLines: JSON.stringify([]),
          playbackCtx: JSON.stringify(ctx),
          pic: extraCtx.pic || '',
        })
      } catch (e) {
        if (strictStandalone) throw e
        openPlayerVod(name, url, 'crawl', 'crawl', name, '', [url], resume, [])
      }
    } else {
      if (strictStandalone) throw new Error('Tauri invoke 不可用，无法打开独立播放器')
      openPlayerVod(name, url, 'crawl', 'crawl', name, '', [url], resume, [])
    }
  }

// ── 链接输入解析器 ────────────────────────────────────────────────
  // ── 链接输入解析器 ────────────────────────────────────────────────
  function showUrlInput() {
    const existing = document.querySelector('.tvbox-url-overlay')
    if (existing) { existing.remove(); return }

    const overlay = document.createElement('div')
    overlay.className = 'tvbox-url-overlay'
    overlay.innerHTML = `
      <div class="tvbox-url-box">
        <div class="tvbox-url-title">🔗 ${mt('urlParserTitle')}</div>
        <div class="tvbox-url-err" id="_urlerr"></div>
        <div class="tvbox-url-row">
          <input id="_urlin" type="url" placeholder="${mt('urlParserPlaceholder')}" autofocus />
          <button class="tvbox-url-go" id="_urlgo">${mt('parse')}</button>
        </div>
        <div class="tvbox-url-hint">
          ${mt('urlParserHint')}
        </div>
        <button class="tvbox-url-cancel" id="_urlcancel">${mt('cancel')}</button>
      </div>`

    document.body.appendChild(overlay)

    const err = overlay.querySelector('#_urlerr')
    const inp = overlay.querySelector('#_urlin')

    function showErr(msg) {
      err.textContent = msg
      err.classList.add('show')
    }
    function clearErr() { err.classList.remove('show') }

    async function doUrlParse(rawUrl) {
      const parsedUrl = normalizeHttpUrl(rawUrl)
      if (!parsedUrl) { showErr(mt('invalidHttpLink')); return }
      inp.value = parsedUrl
      clearErr()
      const goBtn = overlay.querySelector('#_urlgo')
      goBtn.disabled = true
      goBtn.textContent = mt('parsing')

      try {
        // 直链直接播
        if (isDirectVideoUrl(parsedUrl)) {
          overlay.remove()
          openFloatPlayer(mt('directPlayback'), parsedUrl, parsedUrl, 'url_input', mt('directPlayback'), '', [parsedUrl], 0)
          return
        }

        // 量子/暴风分享页 → 尝试 Rust vod_fetch 提取详情
        const isLzShare = /\/share\//.test(parsedUrl) || parsedUrl.includes('v.lfthirtytwo.com') || parsedUrl.includes('vip.lz-')
        if (isLzShare) {
          overlay.remove()
          openFloatPlayer(mt('parsing'), parsedUrl, parsedUrl, 'share_page', mt('parsing'), '', [parsedUrl], 0)
          // 先尝试用 vod_fetch 找详情接口
          await tryExtractFromSharePage(parsedUrl)
          return
        }

        // 其他页面 → 尝试复用爬虫解析，避免“无法解析”假播放旧状态
        showErr(mt('parsingPageWait'))
        const results = await crawlSite(parsedUrl, null)
        const playable = results.filter(r => r?.url && (isDirectVideoUrl(r.url) || r.type !== 'cloud'))
        if (playable.length) {
          const first = playable[0]
          overlay.remove()
          playCrawlVideo(first.name || mt('parseResult'), first.url, 0, [], playable.map(r => r.url))
          return
        }
        showErr(mt('noPlayableUrlDeepSniffHint'))
      } finally {
        if (document.body.contains(overlay)) {
          goBtn.disabled = false
          goBtn.textContent = mt('parse')
        }
      }
    }

    overlay.querySelector('#_urlgo').addEventListener('click', () => doUrlParse(inp.value))
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') doUrlParse(inp.value) })
    overlay.querySelector('#_urlcancel').addEventListener('click', () => overlay.remove())
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
    inp.focus()
  }

  async function tryExtractFromSharePage(shareUrl) {
    // 从分享页 URL 反向推断 vod_id，调用详情接口
    // 分享页格式: https://v.lfthirtytwo.com/share/{hash}
    // 无法直接提取 hash → vod_id 映射，改用 iframe 尝试
    const vidWrap = document.querySelector('#_fvid')
    if (vidWrap) {
      vidWrap.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);font-size:13px">${mt('sharePageBrowserRequired')}</div>`
    }
    // 更新说明
    const urlBar = document.querySelector('.tvbox-float-url-bar')
    if (urlBar) {
      const a = urlBar.querySelector('a')
      if (a) a.href = shareUrl
    }
    // 尝试 iframe 播放（可能失败）
    if (vidWrap && !vidWrap.innerHTML.includes('iframe')) {
      const safeUrl = normalizeHttpUrl(shareUrl)
      const iframe = document.createElement('iframe')
      iframe.src = safeUrl
      iframe.style.cssText = 'width:100%;height:100%;border:none;background:#000'
      iframe.allow = 'autoplay; fullscreen'
      vidWrap.appendChild(iframe)
    }
  }

  function parsePlaylist(from, url) {
    if (!url) return []
    const sources = []
    url.split('$$$').forEach((part, i) => {
      const name = (from || '').split('$$$')[i] || mt('lineOption', { number: i + 1 })
      sources.push({
        name,
        urls: part.split('#').map(p => {
          const idx = p.indexOf('$')
          return idx >= 0
            ? { name: p.slice(0, idx) || mt('episodeUnknown'), url: p.slice(idx + 1) }
            : { name: mt('episodeUnknown'), url: p }
        }).filter(ep => ep.url)
      })
    })
    return sources
  }

  async function searchDetailFallback(source, keyword) {
    const q = encodeURIComponent(keyword)
    const urls = [
      source.api + '?ac=videolist&wd=' + q + '&pg=1',
      source.api + '?ac=videolist&zm=' + q + '&pg=1',
      source.api + '?ac=list&wd=' + q + '&pg=1',
      source.api + '?ac=detail&wd=' + q,
    ]
    for (const url of urls) {
      try {
        const json = await fetchJSON(url)
        const item = json?.list?.find?.(v => String(v.vod_name || '').includes(keyword)) || json?.list?.[0]
        if (item) return item
      } catch {}
      try {
        const jsonp = await fetchJsonp(url)
        const item = jsonp?.list?.find?.(v => String(v.vod_name || '').includes(keyword)) || jsonp?.list?.[0]
        if (item) return item
      } catch {}
    }
    return null
  }

  async function warmUpEpisodeSources(item) {
    const urls = []
    const from = String(item?.vod_play_from || '').split('$$$')
    const play = String(item?.vod_play_url || '').split('$$$')
    for (let i = 0; i < Math.min(from.length, play.length); i++) {
      const part = play[i] || ''
      const first = part.split('#').find(Boolean) || ''
      const idx = first.indexOf('$')
      if (idx >= 0) urls.push(first.slice(idx + 1))
    }
    const ping = urls.slice(0, 3).filter(Boolean).map(url => fetch(url, { method: 'HEAD', signal: AbortSignal.timeout ? AbortSignal.timeout(3000) : undefined }).catch(() => null))
    await Promise.allSettled(ping)
  }
}
