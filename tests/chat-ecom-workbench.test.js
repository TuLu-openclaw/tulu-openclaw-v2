import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ChatEcomWorkbench,
  encodeEcomWorkbenchSettings,
  parseEcomWorkbenchSettings,
  renderChatEcomWorkbench,
} from '../src/lib/chat-ecom-workbench.js'

function deferred() {
  let resolve
  const promise = new Promise(resolvePromise => { resolve = resolvePromise })
  return { promise, resolve }
}

class FakeElement {
  constructor() {
    this.listeners = new Map()
    this.style = {}
    this.innerHTML = ''
    this.textContent = ''
    this.classList = { values: new Set(), toggle: (name, enabled) => enabled ? this.classList.values.add(name) : this.classList.values.delete(name) }
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || new Set()
    handlers.add(handler)
    this.listeners.set(type, handlers)
  }

  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler) }
  dispatch(type) { for (const handler of this.listeners.get(type) || []) handler({ target: this }) }
}

function createHarness(overrides = {}) {
  const selectors = [
    '#chat-ecom-workbench', '#chat-ecom-hint', '#chat-ecom-progress-phase', '#chat-ecom-progress-message',
    '#chat-ecom-progress-list', '#chat-ecom-settings-summary', '#btn-ecom-toggle', '#btn-ecom-settings',
    '#btn-ecom-vault', '#btn-ecom-skills', '#btn-ecom-orch', '#btn-ecom-intro', '#btn-ecom-start-chat',
  ]
  const elements = new Map(selectors.map(selector => [selector, new FakeElement()]))
  const values = new Map()
  const context = { agentId: 'ecom-mover', sessionKey: 'agent:ecom-mover:main', hasMessages: () => false }
  const api = {
    readAgentFile: async () => ({ content: '' }),
    writeAgentFile: async () => {},
    ...overrides.api,
  }
  const messages = []
  const templates = []
  const workbench = new ChatEcomWorkbench({
    page: { querySelector: selector => elements.get(selector) || null },
    api,
    storage: {
      getItem: key => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    },
    escapeHtml: value => String(value).replaceAll('<', '&lt;'),
    getContext: () => context,
    callbacks: {
      systemMessage: value => messages.push(value),
      startTemplate: value => templates.push(value),
      ...overrides.callbacks,
    },
  })
  return { workbench, elements, values, context, messages, templates }
}

test('template and settings codec preserve the existing workbench contract', () => {
  const html = renderChatEcomWorkbench()
  assert.match(html, /id="chat-ecom-workbench"/)
  assert.match(html, /id="btn-ecom-start-chat"/)
  const settings = {
    platforms: '1688,淘宝', credentialsNote: 'secretRef', vaultSummary: '2 groups', forceRefreshEachRound: true,
    enableParallelRoutes: false, enableSubAgents: true, enableVision: false, autoSkillDetect: true,
    autoEnableInstalledSkills: true, orchestrationAutoDispatch: false, skillPool: 'browser, sourcing',
  }
  assert.deepEqual(parseEcomWorkbenchSettings(encodeEcomWorkbenchSettings(settings)), settings)
})

test('controller owns collapse persistence, progress rendering, and button listeners', () => {
  const { workbench, elements, values, templates } = createHarness()
  elements.get('#btn-ecom-toggle').dispatch('click')
  assert.equal(workbench.collapsed, true)
  assert.equal(values.get('星枢OpenClaw-ecom-workbench-collapsed-v1'), '1')

  workbench.setRunState({ active: true, phase: '执行中', detail: '采集中', tasks: [{ title: '<SPU>', status: '运行' }] })
  assert.equal(elements.get('#chat-ecom-progress-phase').textContent, '执行中')
  assert.match(elements.get('#chat-ecom-progress-list').innerHTML, /&lt;SPU>/)

  elements.get('#btn-ecom-start-chat').dispatch('click')
  assert.equal(templates.length, 1)
  assert.match(templates[0], /1688/)
})

test('a late settings load cannot overwrite a switched agent context', async () => {
  const read = deferred()
  const { workbench, context } = createHarness({ api: { readAgentFile: async () => read.promise } })
  workbench.updateContext()
  context.agentId = 'writer'
  context.sessionKey = 'agent:writer:main'
  workbench.updateContext()
  read.resolve({ content: encodeEcomWorkbenchSettings({ ...workbench.getSettings(), platforms: 'late-platform' }) })
  await Promise.resolve()
  await Promise.resolve()

  assert.notEqual(workbench.getSettings().platforms, 'late-platform')
  assert.equal(workbench.loadedAgentId, '')
})

test('destroy removes listeners and invalidates pending async loads', async () => {
  const read = deferred()
  const { workbench, elements } = createHarness({ api: { readAgentFile: async () => read.promise } })
  workbench.updateContext()
  workbench.destroy()
  elements.get('#btn-ecom-toggle').dispatch('click')
  read.resolve({ content: encodeEcomWorkbenchSettings({ platforms: 'late-platform' }) })
  await Promise.resolve()
  await Promise.resolve()

  assert.equal(elements.get('#btn-ecom-toggle').listeners.get('click').size, 0)
  assert.equal(workbench.loadedAgentId, '')
  assert.equal(workbench.destroyed, true)
})

test('agent switching while persistence reads prevents a write into stale context', async () => {
  const read = deferred()
  const writes = []
  const { workbench, context } = createHarness({
    api: {
      readAgentFile: async () => read.promise,
      writeAgentFile: async (...args) => writes.push(args),
    },
  })
  workbench.updateContext()
  const save = workbench.persistForAgent('ecom-mover')
  context.agentId = 'writer'
  context.sessionKey = 'agent:writer:main'
  workbench.updateContext()
  read.resolve({ content: '# TOOLS.md\n' })

  assert.equal(await save, false)
  assert.deepEqual(writes, [])
})
