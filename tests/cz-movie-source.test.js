import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { extractCzMediaUrl, getCzDetailRef, getCzMovieId, parseCzDetailHtml, parseCzListHtml } from '../src/lib/cz-movie-source.js'

const movieToolSource = readFileSync(new URL('../src/pages/movie-tool.js', import.meta.url), 'utf8')

test('factory source extracts stable movie ids from ids and detail URLs', () => {
  assert.equal(getCzMovieId('23607'), '23607')
  assert.equal(getCzMovieId('https://www.4kcz.com/movie/23607.html'), '23607')
  assert.equal(getCzMovieId('https://www.4kcz.com/movie/23607.html?from=history'), '23607')
  assert.equal(getCzMovieId('峡谷'), '')
})

test('factory source preserves a recoverable detail reference', () => {
  assert.equal(getCzDetailRef({ vod_id: '23607' }), '23607')
  assert.equal(getCzDetailRef({ vod_id: '', _detailUrl: 'https://www.4kcz.com/movie/23607.html' }), 'https://www.4kcz.com/movie/23607.html')
  assert.equal(getCzDetailRef({ vod_id: '峡谷' }), '')
})

test('factory list parser returns ids, absolute details, posters, and source identity', () => {
  const html = `
    <article><a href="/movie/23607.html" title="峡谷"><img data-original="/poster/canyon.jpg" alt="峡谷"></a></article>
    <article><a href="https://www.4kcz.com/movie/24001.html"><img src="https://img.example/planet.jpg" alt="星球"></a></article>
  `
  const list = parseCzListHtml(html, 'https://www.4kcz.com')
  assert.deepEqual(list.map(item => ({ id: item.vod_id, detail: item._detailUrl, source: item._srcKey })), [
    { id: '23607', detail: 'https://www.4kcz.com/movie/23607.html', source: 'a_napp03' },
    { id: '24001', detail: 'https://www.4kcz.com/movie/24001.html', source: 'a_napp03' },
  ])
  assert.equal(list[0].vod_pic, 'https://www.4kcz.com/poster/canyon.jpg')
})

test('factory fixture chain reaches detail episodes and a real media URL', () => {
  const listHtml = '<a href="/movie/23607.html" title="峡谷"><img src="/poster/canyon.jpg"></a>'
  const listItem = parseCzListHtml(listHtml, 'https://www.4kcz.com')[0]
  const detailHtml = `
    <meta property="og:image" content="https://img.example/canyon.jpg">
    <h1>峡谷</h1><div class="summary">影片简介</div>
    <a href="/v_play/bXZfMjM2MDctMS0x.html">第 1 集</a>
    <a href="/v_play/bXZfMjM2MDctMS0y.html">第 2 集</a>
  `
  const detail = parseCzDetailHtml(detailHtml, 'https://www.4kcz.com', getCzDetailRef(listItem))
  assert.equal(detail.vod_id, '23607')
  assert.equal(detail._detailUrl, 'https://www.4kcz.com/movie/23607.html')
  assert.deepEqual(detail._episodes[0].urls.map(episode => episode.url), [
    'https://www.4kcz.com/v_play/bXZfMjM2MDctMS0x.html',
    'https://www.4kcz.com/v_play/bXZfMjM2MDctMS0y.html',
  ])
  const media = 'https://media.example/canyon/index.m3u8?token=fixture'
  const wrapper = `<script>player='https://player.example/?url=${encodeURIComponent(media)}'</script>`
  assert.equal(extractCzMediaUrl(wrapper), media)
})

test('retired cloud source implementation and routes are absent', () => {
  for (const retired of ['ip51122', 'IP51122', 'ncat21', '43.248.100.69', '云岚星幕', 'loadIp51122Detail']) {
    assert.ok(!movieToolSource.includes(retired), `retired source token remains: ${retired}`)
  }
  assert.ok(movieToolSource.includes('getCzDetailRef'))
  assert.ok(movieToolSource.includes("detailRef = itemSourceKey === 'a_napp03' ? getCzDetailRef(item)"))
  assert.ok(movieToolSource.includes("source?.key !== 'a_napp03') return alert('缺少详情地址')"))
  assert.ok(movieToolSource.includes("source.key === 'a_napp03' && name"))
})
