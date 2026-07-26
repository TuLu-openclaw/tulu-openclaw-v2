import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const sidebar = fs.readFileSync(new URL('../src/components/sidebar.js', import.meta.url), 'utf8')
const page = fs.readFileSync(new URL('../src/pages/extensions.js', import.meta.url), 'utf8')
const layout = fs.readFileSync(new URL('../src/style/layout.css', import.meta.url), 'utf8')
const sidebarLocale = fs.readFileSync(new URL('../src/locales/modules/sidebar.js', import.meta.url), 'utf8')
const extLocale = fs.readFileSync(new URL('../src/locales/modules/ext.js', import.meta.url), 'utf8')

test('extensions center is exposed as a first-class openclaw navigation entry', () => {
  assert.match(sidebar, /route: '\/extensions'/)
  assert.match(sidebar, /label: t\('sidebar\.extensions'\)/)
  assert.match(page, /t\('ext\.centerTitle'\)/)
  assert.match(page, /t\('ext\.kernelHint'\)/)
  assert.match(extLocale, /centerTitle:/)
  assert.match(extLocale, /kernelHint:/)
})

test('sidebar renders a kernel status badge with localized states', () => {
  assert.ok(sidebar.includes('function getKernelBadgeModel('))
  assert.match(sidebar, /sidebar-kernel-badge/)
  assert.match(sidebar, /t\('sidebar\.kernelBadgeBelowFloor'/)
  assert.match(sidebar, /t\('sidebar\.kernelBadgeUpdateAvailable'/)
  assert.match(sidebarLocale, /kernelUnknown:/)
  assert.match(sidebarLocale, /kernelBadgeReady:/)
  assert.match(layout, /\.sidebar-kernel-badge\.ok/)
  assert.match(layout, /\.sidebar-kernel-badge\.warn/)
  assert.match(layout, /\.sidebar-kernel-detail/)
})
