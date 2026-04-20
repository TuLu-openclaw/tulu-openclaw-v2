// 快速测试暴风 typeId
async function quickTest() {
  const typeIds = [1, 6, 20, 30];
  for (const t of typeIds) {
    const url = `https://bfzyapi.com/api.php/provide/vod?ac=list&t=${t}&pg=1`;
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const json = JSON.parse(await resp.text());
      console.log(`typeId=${t}: total=${json.total}, list.length=${json.list?.length || 0}`);
    } catch(e) {
      console.log(`typeId=${t}: ${e.message}`);
    }
  }
}
quickTest();