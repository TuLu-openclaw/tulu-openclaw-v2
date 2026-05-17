// 完整测试播放流程
async function test() {
  const api = 'https://bfzyapi.com/api.php/provide/vod';

  // 1. 搜索一部电影
  console.log('=== 1. 搜索视频 ===');
  const searchUrl = `${api}?ac=detail&wd=流浪地球`;
  const sr = await fetch(searchUrl, { signal: AbortSignal.timeout(15000) });
  const sj = await sr.json();
  console.log(`找到 ${sj.list.length} 条结果`);
  const first = sj.list[0];
  console.log(`第一个: ${first.vod_name} (id=${first.vod_id})`);

  // 2. 获取视频详情（播放列表）
  console.log('\n=== 2. 获取视频详情 ===');
  const detailUrl = `${api}?ac=detail&ids=${first.vod_id}`;
  console.log(`URL: ${detailUrl}`);
  const dr = await fetch(detailUrl, { signal: AbortSignal.timeout(15000) });
  const dj = await dr.json();
  const v = dj.list?.[0] || first;
  console.log(`名称: ${v.vod_name}`);
  console.log(`简介: ${(v.vod_content || v.vod_blurb || '').slice(0, 80)}...`);

  // 3. 解析播放源
  console.log('\n=== 3. 解析播放源 ===');
  const playFrom = v.vod_play_from || v.play_from || '';
  const playUrl = v.vod_play_url || v.play_url || '';
  const flags = playFrom.split('$$$');
  const urlGrps = playUrl.split('$$$');
  console.log(`播放源: ${flags.join(', ')}`);

  for (let fi = 0; fi < flags.length; fi++) {
    const urls = (urlGrps[fi] || urlGrps[0] || '').split('#').filter(Boolean);
    console.log(`\n[${flags[fi] || '默认'}] 共 ${urls.length} 个分集:`);
    for (let i = 0; i < Math.min(urls.length, 3); i++) {
      const [name, url] = urls[i].split('$');
      console.log(`  ${name}: ${url}`);
    }
    if (urls.length > 3) console.log(`  ... 还有 ${urls.length - 3} 集`);
  }

  // 4. 尝试播放第一个有效URL
  console.log('\n=== 4. 测试播放 ===');
  const firstUrlObj = (urlGrps[0] || '').split('#').filter(Boolean)[0];
  if (firstUrlObj) {
    const [epName, playUrl] = firstUrlObj.split('$');
    console.log(`播放地址: ${playUrl}`);
    if (playUrl?.includes('.m3u8')) {
      console.log('📺 m3u8 流媒体格式');
    } else if (playUrl?.includes('.mp4')) {
      console.log('🎬 mp4 视频格式');
    } else {
      console.log('🔗 iframe/其他格式');
    }
  } else {
    console.log('无播放地址');
  }
}

test().catch(console.error);
