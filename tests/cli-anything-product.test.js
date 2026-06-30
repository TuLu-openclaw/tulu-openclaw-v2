import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const pageSource = fs.readFileSync(new URL('../src/pages/cli-anything.js', import.meta.url), 'utf8')

function functionBody(name) {
  const start = pageSource.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `missing function ${name}`)
  const next = pageSource.indexOf('\nfunction ', start + 1)
  assert.notEqual(next, -1, `missing end for ${name}`)
  return pageSource.slice(start, next)
}

const forbidden = /售卖版|analytics|invoke timeout|Successfully|Uninstalling|Attempting uninstall|setuptools|wheel|安装命令|CLI 工具：|正在打开 AI 工具中枢/i

test('AI 工具中枢客户可见核心文案不暴露工程细节', () => {
  const blocks = [
    functionBody('confirmToolInstall'),
    functionBody('confirmToolUninstall'),
    functionBody('renderHero'),
    pageSource.match(/_page\.innerHTML\s*=\s*'[^']+'/)?.[0] || '',
  ]
  for (const block of blocks) {
    assert.ok(block)
    assert.doesNotMatch(block, forbidden)
  }
})

test('AI 工具中枢包含真实状态同步保护', () => {
  assert.match(pageSource, /rememberToolState\(name, \{ installed: true, installState: 'installed'/)
  assert.match(pageSource, /rememberToolState\(name, \{ installed: false, installState: 'not-installed'/)
  assert.match(pageSource, /await recheckToolState\(name\)/)
  assert.match(pageSource, /不是全部工具总数/)
  assert.match(pageSource, /已切换到：/)
  assert.match(pageSource, /当前是离线推荐模式/)
  assert.match(pageSource, /离线推荐；完整目录可重新检测/)
  assert.match(pageSource, /当前筛选 \/ 完整目录/)
  assert.match(pageSource, /_toolStateOverrides\.clear\(\)/)
  assert.match(pageSource, /verify-needed|需复查/)
})
