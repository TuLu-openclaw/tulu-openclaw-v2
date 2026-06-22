export async function render() {
  const page = document.createElement('div')
  page.className = 'page xingshu-clone-host-page'
  page.innerHTML = `
    <iframe
      class="xingshu-clone-frame"
      title="星枢技能中心"
      src="https://www.aiyu.jx.cn/xingshu-skill/index.local.html"
      sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads"
    ></iframe>
  `
  return page
}
