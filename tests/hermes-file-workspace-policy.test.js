import test from 'node:test'
import assert from 'node:assert/strict'

import {
  canOpenWorkspaceEntry,
  canSaveWorkspaceFile,
  normalizeWorkspaceEntries,
  normalizeWorkspacePath,
  parentWorkspacePath,
  selectedEntry,
  workspaceBreadcrumbs,
} from '../src/engines/hermes/lib/file-workspace-policy.js'

test('normalizes workspace paths for UI routing', () => {
  assert.equal(normalizeWorkspacePath('\\notes\\today.md\\'), 'notes/today.md')
  assert.equal(normalizeWorkspacePath('/nested/path/'), 'nested/path')
  assert.equal(parentWorkspacePath('nested/path/file.md'), 'nested/path')
  assert.equal(parentWorkspacePath('file.md'), '')
})

test('builds workspace breadcrumbs from a relative path', () => {
  assert.deepEqual(workspaceBreadcrumbs('notes/daily/today.md'), [
    { label: 'workspace', path: '' },
    { label: 'notes', path: 'notes' },
    { label: 'daily', path: 'notes/daily' },
    { label: 'today.md', path: 'notes/daily/today.md' },
  ])
})

test('normalizes and sorts directory entries before files', () => {
  const entries = normalizeWorkspaceEntries([
    { name: 'z.md', relativePath: 'z.md', type: 'file', size: '12', editable: true },
    { name: 'src', relativePath: 'src', type: 'dir' },
    { name: '', relativePath: '', type: 'file' },
    { name: 'a.md', relativePath: 'a.md', type: 'file', previewable: true },
  ])

  assert.deepEqual(entries.map(entry => entry.name), ['src', 'a.md', 'z.md'])
  assert.equal(entries[2].size, 12)
})

test('selects entries and gates open/save actions', () => {
  const entries = normalizeWorkspaceEntries([
    { name: 'bin.dat', relativePath: 'bin.dat', type: 'file', editable: false, previewable: false },
    { name: 'notes.md', relativePath: 'notes.md', type: 'file', editable: true },
    { name: 'folder', relativePath: 'folder', type: 'dir' },
  ])

  assert.equal(selectedEntry(entries, 'notes.md')?.name, 'notes.md')
  assert.equal(canOpenWorkspaceEntry(selectedEntry(entries, 'folder')), true)
  assert.equal(canOpenWorkspaceEntry(selectedEntry(entries, 'bin.dat')), false)
  assert.equal(canSaveWorkspaceFile(selectedEntry(entries, 'notes.md')), true)
  assert.equal(canSaveWorkspaceFile(selectedEntry(entries, 'bin.dat')), false)
})
