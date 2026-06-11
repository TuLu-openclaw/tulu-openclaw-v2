import test from 'node:test'
import assert from 'node:assert/strict'

const listeners = new Map()
globalThis.window = {
  addEventListener(type, handler) { listeners.set(type, handler) },
}
globalThis.document = {
  readyState: 'loading',
  documentElement: {},
  addEventListener() {},
  querySelectorAll() { return [] },
}
globalThis.MutationObserver = class {
  observe() {}
}

const { renderMarkdown } = await import('../src/lib/markdown.js')

test('renderMarkdown escapes raw HTML instead of passing it through', () => {
  const html = renderMarkdown('<img src=x onerror=alert(1)>')
  assert.equal(html, '<p>&lt;img src=x onerror=alert(1)&gt;</p>')
  assert.doesNotMatch(html, /<img\b/i)
})

test('renderMarkdown still renders fenced code blocks as safe pre/code HTML', () => {
  const html = renderMarkdown('```js\nconst x = "<tag>"\n```')
  assert.match(html, /^<pre data-lang="js">/)
  assert.match(html, /<code>/)
  assert.match(html, /&lt;tag&gt;/)
})
