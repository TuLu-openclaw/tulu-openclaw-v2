/**
 * 屠戮影视 API 测试脚本
 * 测试 VOD 源 + TV 源 + TVBox JSON 加载
 */
// 使用 Node.js 内置 fetch（Node 18+）

const PROXY = null; // 如果需要代理可以填入，如 'http://127.0.0.1:7890'

function makeFetch() {
  return PROXY ? fetch : fetch;
}

async function testVodSource(name, api, typeId = 6) {
  console.log(`\n=== 测试 VOD 源: ${name} ===`);
  const url = `${api}?ac=list&t=${typeId}&pg=1`;
  console.log(`URL: ${url}`);
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    console.log(`状态码: ${resp.status}`);
    if (!resp.ok) {
      console.log(`❌ HTTP ${resp.status}`);
      return false;
    }
    const text = await resp.text();
    let json = null;
    try { json = JSON.parse(text); } catch { console.log(`响应非JSON（长度${text.length}）`); }
    if (json) {
      const total = json.total || json.list?.length || 0;
      console.log(`✅ 成功: total=${total}, list长度=${Array.isArray(json.list) ? json.list.length : 'N/A'}`);
      if (json.list?.length > 0) {
        const first = json.list[0];
        console.log(`   示例: ${JSON.stringify({ id: first.vod_id || first.id, name: first.vod_name || first.name }).slice(0, 100)}`);
      }
      return true;
    } else {
      // 尝试 XML
      if (text.includes('<xml') || text.includes('<item>')) {
        console.log(`✅ XML 格式响应（长度${text.length}）`);
        return true;
      }
      console.log(`❌ 无法解析，长度: ${text.length}`);
      console.log(`   前100字: ${text.slice(0, 100)}`);
      return false;
    }
  } catch (e) {
    console.log(`❌ 请求失败: ${e.message}`);
    return false;
  }
}

async function testTvSource(name, api) {
  console.log(`\n=== 测试 TV 源: ${name} ===`);
  console.log(`URL: ${api}`);
  try {
    const resp = await fetch(api, {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    console.log(`状态码: ${resp.status}`);
    if (!resp.ok) {
      console.log(`❌ HTTP ${resp.status}`);
      return false;
    }
    const text = await resp.text();
    console.log(`响应长度: ${text.length}`);
    if (text.includes('#EXTM3U') || text.includes('group-title')) {
      console.log(`✅ M3U 格式`);
    } else if (text.includes('#genre#')) {
      console.log(`✅ NZK 格式`);
    }
    const lines = text.split('\n').filter(l => l.trim());
    console.log(`   总行数: ${lines.length}`);
    const channels = lines.filter(l => l.includes(',') && !l.startsWith('#'));
    console.log(`   频道数: ${channels.length}`);
    if (channels.length > 0) console.log(`   示例: ${channels[0]}`);
    return channels.length > 0;
  } catch (e) {
    console.log(`❌ 请求失败: ${e.message}`);
    return false;
  }
}

async function testTvboxJson(name, url) {
  console.log(`\n=== 测试 TVBox JSON: ${name} ===`);
  const candidates = [
    url,
    url.replace('cdn.jsdelivr.net/gh/', 'ghproxy.com/https://raw.githubusercontent.com/'),
    url.replace('cdn.jsdelivr.net/gh/', 'mirror.ghproxy.com/https://raw.githubusercontent.com/'),
  ].filter((v, i, a) => a.indexOf(v) === i);

  for (const u of candidates) {
    console.log(`尝试: ${u.slice(0, 80)}...`);
    try {
      const resp = await fetch(u, { signal: AbortSignal.timeout(15000) });
      console.log(`  状态码: ${resp.status}`);
      if (resp.ok) {
        const text = await resp.text();
        try {
          const json = JSON.parse(text);
          const count = json.list?.length || 0;
          console.log(`✅ 成功! 分类数: ${count}`);
          return true;
        } catch {
          console.log(`❌ JSON 解析失败，长度: ${text.length}`);
        }
      }
    } catch (e) {
      console.log(`  ❌ ${e.message}`);
    }
  }
  console.log(`❌ 所有镜像均失败`);
  return false;
}

async function main() {
  console.log('========================================');
  console.log('  屠戮影视 API 测试');
  console.log('========================================');

  // VOD 源测试
  await testVodSource('暴风资源', 'https://bfzyapi.com/api.php/provide/vod', 6);
  await testVodSource('星之尘', 'https://xsd.sdzyapi.com/api.php/provide/vod', 6);
  await testVodSource('天涯资源', 'https://tyyszy.com/api.php/provide/vod', 6);

  // VOD 搜索测试
  console.log(`\n=== 测试 VOD 搜索 ===`);
  for (const [name, api] of [['暴风', 'https://bfzyapi.com/api.php/provide/vod'], ['星之尘', 'https://xsd.sdzyapi.com/api.php/provide/vod'], ['天涯', 'https://tyyszy.com/api.php/provide/vod']]) {
    const url = `${api}?ac=detail&wd=流浪地球&pg=1`;
    console.log(`\n[${name}] ${url}`);
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0' } });
      const text = await resp.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      if (json?.list?.length) {
        console.log(`✅ 搜索到 ${json.list.length} 条结果`);
        console.log(`   第一条: ${json.list[0]?.vod_name || json.list[0]?.name}`);
      } else {
        console.log(`❌ 无结果 (状态${resp.status}, 长度${text.length})`);
      }
    } catch (e) {
      console.log(`❌ ${e.message}`);
    }
  }

  // TV 源测试
  await testTvSource('繁星直播', 'https://live.fanmingming.com/live.txt');
  await testTvSource('聚浪TV', 'http://julan.ml/live.txt');

  // TVBox JSON 测试
  await testTvboxJson('FongMi', 'https://cdn.jsdelivr.net/gh/FongMi/CatVodSpider@main/json/b.json');
  await testTvboxJson('HJD TVBox', 'https://cdn.jsdelivr.net/gh/hjdhnx/Dr_TVBox@main/json/api.json');

  console.log('\n========================================');
  console.log('  测试完成');
  console.log('========================================');
}

main().catch(console.error);
