export async function render() {
  const page = document.createElement('div')
  page.className = 'page xingshu-clone-host-page'
  page.innerHTML = `
    <iframe
      class="xingshu-clone-frame"
      title="星枢安全检测"
      src="https://www.aiyu.jx.cn/skill-security/"
      sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads"
    ></iframe>
  `
  return page
}
