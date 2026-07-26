import test from 'node:test'
import assert from 'node:assert/strict'

import {
  formatWorkspaceFileSize,
  formatWorkspaceFileTime,
  isMarkdownWorkspaceFile,
  renderChatWorkspacePanel,
  renderWorkspaceCoreFiles,
  renderWorkspaceTree,
} from '../src/lib/chat-workspace-panel.js'

const labels = {
  'chat.workspaceFiles': 'Workspace files',
  'chat.coreFiles': 'Core files',
  'chat.workspaceExplorer': 'Explorer',
  'chat.selectWorkspaceFile': 'Select a file',
  'chat.reloadWorkspaceFile': 'Reload',
  'chat.previewWorkspaceFile': 'Preview',
  'chat.workspaceEmptyState': 'No file selected',
  'chat.workspaceNoCoreFiles': 'No core files',
  'chat.workspaceTreeEmpty': 'No files',
  'common.refresh': 'Refresh',
  'common.close': 'Close',
  'common.save': 'Save',
  'common.edit': 'Edit',
  'common.add': 'Add',
}
const t = key => labels[key] || key
const escapeAttr = value => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')


test('workspace panel markup preserves the chat integration ids', () => {
  const html = renderChatWorkspacePanel(t)
  for (const id of [
    'chat-workspace-panel',
    'chat-workspace-core-list',
    'chat-workspace-tree',
    'chat-workspace-editor',
    'chat-workspace-save',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`))
  }
  assert.match(html, /Workspace files/)
  assert.match(html, /No file selected/)
})

test('workspace file helpers classify markdown and format bounded metadata', () => {
  assert.equal(isMarkdownWorkspaceFile('MEMORY.md'), true)
  assert.equal(isMarkdownWorkspaceFile('notes.MDX'), true)
  assert.equal(isMarkdownWorkspaceFile('avatar.png'), false)
  assert.equal(formatWorkspaceFileSize(1000), '1000 B')
  assert.equal(formatWorkspaceFileSize(1536), '1.5 KB')
  assert.equal(formatWorkspaceFileSize(2 * 1024 * 1024), '2.0 MB')
  assert.equal(formatWorkspaceFileTime('not-a-date', 'en-US'), '')
  assert.match(formatWorkspaceFileTime('2026-07-26T00:00:00Z', 'en-US'), /2026/)
})

test('workspace core file markup escapes attributes and marks the active file', () => {
  const html = renderWorkspaceCoreFiles([
    { name: 'AGENTS.md', path: 'C:/workspace/AGENTS.md', exists: true },
    { name: '<draft>.md', path: 'C:/workspace/<draft>.md', exists: false },
  ], { relativePath: 'AGENTS.md' }, t, escapeAttr)

  assert.match(html, /chat-workspace-core-item active/)
  assert.match(html, /data-core-exists="1"/)
  assert.match(html, /&lt;draft&gt;\.md/)
  assert.doesNotMatch(html, /data-core-path="<draft>/)
})

test('workspace tree renders cached children only for expanded directories', () => {
  const entries = [
    { type: 'dir', name: 'memory', relativePath: 'memory', editable: false },
    { type: 'file', name: 'README.md', relativePath: 'README.md', editable: true, previewable: true },
  ]
  const treeCache = new Map([
    ['memory', [{ type: 'file', name: 'today.md', relativePath: 'memory/today.md', editable: true, previewable: true }]],
  ])

  const collapsed = renderWorkspaceTree(entries, {
    currentFile: null,
    expandedDirs: new Set(),
    treeCache,
    t,
    escapeAttr,
  })
  assert.doesNotMatch(collapsed, /memory\/today\.md/)

  const expanded = renderWorkspaceTree(entries, {
    currentFile: { relativePath: 'memory/today.md' },
    expandedDirs: new Set(['memory']),
    treeCache,
    t,
    escapeAttr,
  })
  assert.match(expanded, /memory\/today\.md/)
  assert.match(expanded, /chat-workspace-tree-row active/)
  assert.match(expanded, /▾/)
})
