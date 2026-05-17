// 测试无 typeId vs 有 typeId 的区别，以及搜索功能
async function test() {
  const sources = [
    { name: '暴风-无type', url: 'https://bfzyapi.com/api.php/provide/vod' },
    { name: '星之尘-无type', url: 'https://xsd.sdzyapi.com/api.php/provide/vod' },
    { name: '天涯-无type', url: 'https://tyyszy.com/api.php/provide/vod' },
  ];

  for (const s of sources) {
    // 无 typeId 列表
    const url1 = `${s.url}?ac=list&pg=1`;
    const r1 = await fetch(url1, { signal: AbortSignal.timeout(10000) });
    const j1 = JSON.parse(await r1.text());
    console.log(`${s.name}: total=${j1.total}, list.len=${j1.list?.length || 0}`);

    // 搜索测试
    const sUrl = `${s.url}?ac=detail&wd=流浪地球`;
    const sr = await fetch(sUrl, { signal: AbortSignal.timeout(10000) });
    const sj = JSON.parse(await sr.text());
    console.log(`  搜索结果: total=${sj.total}, list.len=${sj.list?.length || 0}`);
    if (sj.list?.length) console.log(`  第一个: ${sj.list[0].vod_name || sj.list[0].name}`);
  }
}
test();