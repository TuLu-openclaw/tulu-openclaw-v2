import test from 'node:test'
import assert from 'node:assert/strict'

import { ChatWorkspaceController } from '../src/lib/chat-workspace-controller.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

class FakeElement {
  constructor() {
    this.listeners = new Map()
    this.dataset = {}
    this.style = {}
    this.classList = { toggle() {} }
    this.value = ''
    this.innerHTML = ''
    this.textContent = ''
    this.disabled = false
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || new Set()
    handlers.add(handler)
    this.listeners.set(type, handlers)
  }

  removeEventListener(type, handler) {
    this.listeners.get(type)?.delete(handler)
  }

  dispatch(type, event = {}) {
    for (const handler of this.listeners.get(type) || []) handler({
      stopPropagation() {},
      preventDefault() {},
      target: this,
      ...event,
    })
  }

  closest() { return null }
}

function createHarness(overrides = {}) {
  const selectors = [
    '#btn-chat-workspace', '#chat-workspace-panel', '#chat-workspace-trigger-agent',
    '#chat-workspace-agent-badge', '#chat-workspace-agent-title', '#chat-workspace-path',
    '#chat-workspace-core-list', '#chat-workspace-tree', '#chat-workspace-current-file',
    '#chat-workspace-editor-meta', '#chat-workspace-editor', '#chat-workspace-preview',
    '#chat-workspace-empty', '#chat-workspace-save', '#chat-workspace-reload',
    '#chat-workspace-preview-toggle', '#chat-workspace-preview-label',
    '#chat-workspace-close', '#chat-workspace-refresh',
  ]
  const elements = new Map(selectors.map(selector => [selector, new FakeElement()]))
  const values = new Map()
  const context = { agentId: 'main', title: 'Main' }
  const api = {
    getAgentWorkspaceInfo: async agentId => ({ agentId, workspacePath: `/workspace/${agentId}` }),
    listAgentFiles: async () => [],
    listAgentWorkspaceEntries: async () => [],
    readAgentWorkspaceFile: async () => ({ content: '', previewable: true }),
    writeAgentWorkspaceFile: async () => {},
    ...overrides.api,
  }
  const controller = new ChatWorkspaceController({
    page: { querySelector: selector => elements.get(selector) || null },
    api,
    t: key => key,
    toast() {},
    showConfirm: async () => true,
    renderMarkdown: value => `<p>${value}</p>`,
    escapeAttr: String,
    storage: {
      getItem: key => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    },
    storageKey: 'workspace-open',
    getContext: () => context,
    ...overrides.options,
  })
  return { controller, elements, values, context }
}

test('controller owns editor dirty state and restores loaded content', () => {
  const { controller, elements } = createHarness()
  const editor = elements.get('#chat-workspace-editor')
  controller.currentFile = { relativePath: 'AGENTS.md', exists: true, previewable: true }
  controller.loadedContent = 'saved'
  editor.value = 'changed'
  editor.dispatch('input')

  assert.equal(controller.isDirty(), true)
  assert.equal(elements.get('#chat-workspace-current-file').textContent, 'AGENTS.md *')

  controller.discardChanges()
  assert.equal(controller.isDirty(), false)
  assert.equal(editor.value, 'saved')
})

test('context synchronization updates agent labels without loading a closed panel', async () => {
  let calls = 0
  const { controller, context, elements } = createHarness({
    api: { getAgentWorkspaceInfo: async () => { calls += 1; return {} } },
  })
  context.agentId = 'writer'
  context.title = 'Writer session'

  await controller.syncContext(false)

  assert.equal(controller.getAgentId(), 'writer')
  assert.equal(elements.get('#chat-workspace-trigger-agent').textContent, 'writer')
  assert.equal(elements.get('#chat-workspace-agent-title').textContent, 'Writer session')
  assert.equal(calls, 0)
})

test('stale workspace loads cannot overwrite a newer agent context', async () => {
  let resolveMain
  const mainInfo = new Promise(resolve => { resolveMain = resolve })
  const { controller, context, values } = createHarness({
    api: {
      getAgentWorkspaceInfo: agentId => agentId === 'main' ? mainInfo : Promise.resolve({ workspacePath: '/workspace/writer' }),
    },
  })
  values.set('workspace-open', '1')
  const firstLoad = controller.syncContext(true)
  context.agentId = 'writer'
  context.title = 'Writer'
  const secondLoad = controller.syncContext(true)
  await secondLoad
  resolveMain({ workspacePath: '/workspace/main' })
  await firstLoad

  assert.equal(controller.getAgentId(), 'writer')
  assert.equal(controller.info.workspacePath, '/workspace/writer')
})

test('destroy removes bound events and invalidates pending loads', async () => {
  let resolveInfo
  const pendingInfo = new Promise(resolve => { resolveInfo = resolve })
  const { controller, elements, values } = createHarness({
    api: { getAgentWorkspaceInfo: async () => pendingInfo },
  })
  values.set('workspace-open', '1')
  const load = controller.syncContext(true)
  const button = elements.get('#btn-chat-workspace')

  controller.destroy()
  button.dispatch('click')
  resolveInfo({ workspacePath: '/late' })
  await load

  assert.equal(button.listeners.get('click').size, 0)
  assert.equal(controller.info, null)
  assert.equal(controller.destroyed, true)
})

test('save completion preserves edits made while the write was pending', async () => {
  const write = deferred()
  const { controller, elements } = createHarness({
    api: { writeAgentWorkspaceFile: async () => write.promise },
  })
  const editor = elements.get('#chat-workspace-editor')
  controller.currentFile = { agentId: 'main', relativePath: 'AGENTS.md', exists: true, previewable: true }
  controller.loadedContent = 'before'
  editor.value = 'submitted'
  controller.dirty = true
  const save = controller.saveCurrentFile()

  editor.value = 'new edit'
  editor.dispatch('input')
  write.resolve()
  await save

  assert.equal(controller.loadedContent, 'submitted')
  assert.equal(editor.value, 'new edit')
  assert.equal(controller.isDirty(), true)
})

test('save completion cannot update a file opened while the write was pending', async () => {
  const write = deferred()
  const read = deferred()
  const { controller, elements } = createHarness({
    api: {
      writeAgentWorkspaceFile: async () => write.promise,
      readAgentWorkspaceFile: async () => read.promise,
    },
  })
  const editor = elements.get('#chat-workspace-editor')
  controller.currentFile = { agentId: 'main', relativePath: 'first.md', exists: true, previewable: true }
  controller.loadedContent = 'first old'
  editor.value = 'first saved'
  const save = controller.saveCurrentFile()
  const open = controller.openFile('second.md', { force: true })

  write.resolve()
  await save
  assert.equal(controller.loadedContent, 'first old')

  read.resolve({ content: 'other content', previewable: true })
  await open

  assert.equal(controller.currentFile.relativePath, 'second.md')
  assert.equal(controller.loadedContent, 'other content')
  assert.equal(editor.value, 'other content')
})

test('only the latest concurrent save can commit the editor baseline', async () => {
  const firstWrite = deferred()
  const secondWrite = deferred()
  let call = 0
  const { controller, elements } = createHarness({
    api: { writeAgentWorkspaceFile: async () => (++call === 1 ? firstWrite.promise : secondWrite.promise) },
  })
  const editor = elements.get('#chat-workspace-editor')
  controller.currentFile = { agentId: 'main', relativePath: 'AGENTS.md', exists: true, previewable: true }
  editor.value = 'first'
  const firstSave = controller.saveCurrentFile()
  editor.value = 'second'
  const secondSave = controller.saveCurrentFile()

  secondWrite.resolve()
  await secondSave
  firstWrite.resolve()
  await firstSave

  assert.equal(controller.loadedContent, 'second')
  assert.equal(controller.isDirty(), false)
  assert.equal(editor.value, 'second')
})

test('collapsing a directory during its first load wins over the late response', async () => {
  const directoryLoad = deferred()
  const { controller } = createHarness({
    api: { listAgentWorkspaceEntries: async (_agentId, path) => path ? directoryLoad.promise : [] },
  })
  controller.treeCache.set('', [{ type: 'dir', name: 'memory', relativePath: 'memory' }])
  const expand = controller.toggleDirectory('memory')
  await controller.toggleDirectory('memory')

  assert.equal(controller.expandedDirs.has('memory'), false)
  directoryLoad.resolve([{ type: 'file', name: 'today.md', relativePath: 'memory/today.md' }])
  await expand

  assert.equal(controller.treeCache.has('memory'), true)
  assert.equal(controller.expandedDirs.has('memory'), false)
})
