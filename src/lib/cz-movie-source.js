export function getCzMovieId(value) {
  const raw = String(value || '').trim()
  return raw.match(/\/movie\/(\d+)\.html(?:[?#]|$)/i)?.[1] || raw.match(/^(\d+)$/)?.[1] || ''
}

export function getCzDetailRef(item) {
  const detailUrl = String(item?._detailUrl || item?.detailUrl || '').trim()
  if (getCzMovieId(detailUrl)) return detailUrl
  const id = getCzMovieId(item?.vod_id || item?.detailId || item?.id)
  return id || ''
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

export function parseCzListHtml(html, baseUrl, limit = Number.MAX_SAFE_INTEGER) {
  const results = []
  const seen = new Set()
  const re = /<a[^>]+href=["']([^"']*\/movie\/(\d+)\.html)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match
  while ((match = re.exec(html)) && results.length < limit) {
    const href = match[1]
    const id = match[2]
    if (!id || seen.has(id)) continue
    seen.add(id)
    const block = match[0]
    const context = html.slice(Math.max(0, match.index - 400), Math.min(html.length, match.index + match[0].length + 400))
    const title = decodeHtmlEntities((
      block.match(/title=["']([^"']+)["']/i)?.[1] ||
      block.match(/alt=["']([^"']+)["']/i)?.[1] ||
      block.match(/>([^<]{2,40})<\/a>/i)?.[1] ||
      ''
    ).trim())
    if (!title) continue
    const picRaw =
      block.match(/data-original=["']([^"']+)["']/i)?.[1] ||
      block.match(/src=["']([^"']+)["']/i)?.[1] ||
      context.match(/data-original=["']([^"']+)["']/i)?.[1] ||
      context.match(/src=["']([^"']+)["']/i)?.[1] ||
      ''
    results.push({
      vod_id: id,
      vod_name: title,
      vod_pic: picRaw ? new URL(picRaw, baseUrl).href : '',
      type_name: '影视',
      _detailUrl: new URL(href, baseUrl).href,
      _api: baseUrl,
      _srcKey: 'a_napp03',
    })
  }
  return results
}

export function parseCzDetailHtml(html, baseUrl, detailRef, fallback = {}) {
  const id = getCzMovieId(detailRef)
  if (!id) throw new Error('厂长资源详情标识无效，请返回列表重新选择')
  if (/403 Forbidden|openresty|Access Denied/i.test(html)) throw new Error('源站返回 403，当前详情页不可用')
  const title = decodeHtmlEntities((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || fallback.name || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
  const poster = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] || fallback.pic || ''
  const desc = decodeHtmlEntities((html.match(/<div[^>]+class=["'][^"']*(?:summary|content|desc|intro|story)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim())
  const episodes = []
  const seen = new Set()
  const re = /<a[^>]*href=["']([^"']*\/v_play\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match
  while ((match = re.exec(html))) {
    const url = decodeHtmlEntities(match[1])
    if (!url || seen.has(url)) continue
    seen.add(url)
    episodes.push({
      name: decodeHtmlEntities(match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) || '播放',
      url: new URL(url, baseUrl).href,
    })
  }
  if (!episodes.length) throw new Error('厂长资源详情页未解析到播放列表')
  const detailUrl = new URL(`/movie/${id}.html`, baseUrl).href
  return {
    vod_id: id,
    vod_name: title || fallback.name || '未命名',
    vod_pic: poster,
    vod_content: desc,
    vod_play_from: '默认线路',
    vod_play_url: episodes.map(episode => `${episode.name}$${episode.url}`).join('#'),
    _episodes: [{ name: '默认线路', urls: episodes }],
    _detailUrl: detailUrl,
    _srcKey: 'a_napp03',
    _api: baseUrl,
  }
}

export function extractCzMediaUrl(html) {
  const candidates = [...String(html || '').matchAll(/(https?:\/\/[^\s'"<>]+)/gi)]
    .map(match => decodeHtmlEntities(match[1]))
    .filter(candidate => /(?:m3u8|mp4)/i.test(candidate))
  for (const candidate of [...new Set(candidates)]) {
    try {
      const wrappedUrl = new URL(candidate).searchParams.get('url')
      if (wrappedUrl && /\.(?:m3u8|mp4)(?:[?#]|$)/i.test(wrappedUrl)) return wrappedUrl
    } catch {}
    if (/\.(?:m3u8|mp4)(?:[?#]|$)/i.test(candidate)) return candidate
  }
  return ''
}
