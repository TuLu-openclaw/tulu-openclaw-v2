import test from 'node:test'
import assert from 'node:assert/strict'

class Element {
  constructor(tagName = 'div') {
    this.tagName = tagName
    this.children = []
    this.dataset = {}
    this.listeners = {}
    this._innerHTML = ''
  }

  set innerHTML(value) { this._innerHTML = String(value || '') }
  get innerHTML() { return this._innerHTML }
  get innerText() { return this._innerHTML.replace(/<[^>]*>/g, ' ') }
  addEventListener(type, handler) { this.listeners[type] = handler }
  querySelector(selector) {
    if (selector === '#cli-anything-body' && this._innerHTML.includes('id="cli-anything-body"')) return this
    return null
  }
  querySelectorAll() { return [] }
}

globalThis.window = {
  location: { hostname: 'localhost', hash: '#/cli-anything' },
  addEventListener() {},
  confirm() { return true },
}
globalThis.document = {
  createElement(tag) { return new Element(tag) },
  querySelectorAll() { return [] },
  addEventListener() {},
  documentElement: {},
}
globalThis.localStorage = { setItem() {}, getItem() { return null } }
globalThis.MutationObserver = class { observe() {} }

test('CLI-Anything 首屏不等待状态检测完成', async () => {
  const { render } = await import('../src/pages/cli-anything.js')
  const page = await render()
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.match(page.innerHTML, /浏览器代码化操控/)
  assert.match(page.innerHTML, /GIMP 图片编辑/)
  assert.doesNotMatch(page.innerHTML, /正在加载星枢工具生态中心/)
})
