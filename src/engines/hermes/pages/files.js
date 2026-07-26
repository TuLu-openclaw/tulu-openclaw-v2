import { api } from '../../../lib/tauri-api.js'
import { icon } from '../../../lib/icons.js'
import { t } from '../../../lib/i18n.js'
import { toast } from '../../../components/toast.js'
import {
  DEFAULT_WORKSPACE_AGENT_ID,
  canOpenWorkspaceEntry,
  canSaveWorkspaceFile,
  normalizeWorkspaceEntries,
  normalizeWorkspacePath,
  parentWorkspacePath,
  workspaceBreadcrumbs,
} from '../lib/file-workspace-policy.js'

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function cleanError(error) {
  return String(error?.message || error || '').replace(/^Error:\s*/, '')
}

function formatSize(size) {
  const value = Number(size) || 0
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString()
}

export function render() {
  const el = document.createElement('div')
  el.className = 'page hm-files-page'
  el.dataset.engine = 'hermes'

  let workspaceInfo = null
  let entries = []
  let currentPath = ''
  let selectedFile = null
  let editorContent = ''
  let dirty = false
  let loading = true
  let reading = false
  let saving = false
  let error = ''

  function draw() {
    const crumbs = workspaceBreadcrumbs(currentPath)
    const canGoUp = Boolean(currentPath)
    const canSave = dirty && canSaveWorkspaceFile(selectedFile) && !saving
    el.innerHTML = `
      <div class="hm-hero">
        <div class="hm-hero-title">
          <div class="hm-hero-eyebrow">${esc(t('engine.filesEyebrow'))}</div>
          <h1 class="hm-hero-h1">${esc(t('engine.filesTitle'))}</h1>
          <div class="hm-hero-sub">${esc(t('engine.filesDesc'))}</div>
        </div>
        <div class="hm-hero-actions">
          <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-files-up" ${!canGoUp || loading ? 'disabled' : ''}>${icon('upload', 14)}${esc(t('engine.filesUp'))}</button>
          <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-files-refresh" ${loading || saving ? 'disabled' : ''}>${icon('refresh-cw', 14)}${esc(t('engine.filesRefresh'))}</button>
          <button class="hm-btn hm-btn--cta hm-btn--sm" id="hm-files-save" ${!canSave ? 'disabled' : ''}>${icon('check-circle', 14)}${esc(saving ? t('engine.filesSaving') : t('engine.filesSave'))}</button>
        </div>
      </div>

      ${error ? `<section class="hm-panel" style="margin-bottom:16px"><div class="hm-panel-body" style="color:var(--hm-error)">${esc(error)}</div></section>` : ''}

      <section class="hm-panel hm-files-shell">
        <div class="hm-panel-header hm-files-header">
          <div>
            <div class="hm-panel-title">${esc(t('engine.filesWorkspace'))}</div>
            <div class="hm-muted hm-files-path">${esc(workspaceInfo?.workspacePath || t('engine.filesWorkspaceUnknown'))}</div>
          </div>
          <div class="hm-files-crumbs">
            ${crumbs.map(crumb => `<button class="hm-files-crumb" data-path="${esc(crumb.path)}">${esc(crumb.label)}</button>`).join('')}
          </div>
        </div>
        <div class="hm-panel-body hm-files-grid">
          <div class="hm-files-list" role="list">
            ${loading ? `<div class="hm-muted hm-files-empty">${esc(t('engine.filesLoading'))}</div>` : ''}
            ${!loading && !entries.length ? `<div class="hm-muted hm-files-empty">${esc(t('engine.filesEmpty'))}</div>` : ''}
            ${entries.map(entry => `
              <button class="hm-files-entry ${selectedFile?.relativePath === entry.relativePath ? 'is-active' : ''}" data-path="${esc(entry.relativePath)}" data-type="${esc(entry.type)}" ${!canOpenWorkspaceEntry(entry) ? 'disabled' : ''}>
                <span class="hm-files-entry-icon">${icon(entry.type === 'dir' ? 'folder' : 'file-text', 15)}</span>
                <span class="hm-files-entry-main">
                  <strong>${esc(entry.name)}</strong>
                  <small>${entry.type === 'dir' ? esc(t('engine.filesDirectory')) : `${esc(formatSize(entry.size))}${entry.editable ? ` · ${esc(t('engine.filesEditable'))}` : ''}`}</small>
                </span>
                <span class="hm-files-entry-time">${esc(formatTime(entry.mtime))}</span>
              </button>
            `).join('')}
          </div>
          <div class="hm-files-editor">
            ${selectedFile ? `
              <div class="hm-files-editor-head">
                <div>
                  <div class="hm-panel-title">${esc(selectedFile.relativePath)}</div>
                  <div class="hm-muted">${esc(formatSize(selectedFile.size))}${dirty ? ` · ${esc(t('engine.filesUnsaved'))}` : ''}</div>
                </div>
              </div>
              ${reading ? `<div class="hm-muted hm-files-empty">${esc(t('engine.filesReading'))}</div>` : `<textarea id="hm-files-editor" class="hm-input hm-files-textarea" spellcheck="false" ${saving || selectedFile.editable === false ? 'disabled' : ''}>${esc(editorContent)}</textarea>`}
            ` : `<div class="hm-muted hm-files-empty">${esc(t('engine.filesSelectHint'))}</div>`}
          </div>
        </div>
      </section>
    `

    el.querySelector('#hm-files-up')?.addEventListener('click', () => openDirectory(parentWorkspacePath(currentPath)))
    el.querySelector('#hm-files-refresh')?.addEventListener('click', () => loadDirectory(currentPath))
    el.querySelector('#hm-files-save')?.addEventListener('click', saveFile)
    el.querySelectorAll('.hm-files-crumb').forEach(button => {
      button.addEventListener('click', () => openDirectory(button.dataset.path || ''))
    })
    el.querySelectorAll('.hm-files-entry').forEach(button => {
      button.addEventListener('click', () => openEntry(button.dataset.path || '', button.dataset.type || 'file'))
    })
    el.querySelector('#hm-files-editor')?.addEventListener('input', event => {
      editorContent = event.target.value
      dirty = selectedFile ? editorContent !== (selectedFile.content || '') : false
      const saveBtn = el.querySelector('#hm-files-save')
      if (saveBtn) saveBtn.disabled = !dirty || !canSaveWorkspaceFile(selectedFile) || saving
    })
  }

  async function confirmDirty() {
    if (!dirty) return true
    return window.confirm(t('engine.filesDiscardConfirm'))
  }

  async function loadDirectory(path = '') {
    loading = true
    error = ''
    draw()
    try {
      const normalized = normalizeWorkspacePath(path)
      const [info, list] = await Promise.all([
        api.getAgentWorkspaceInfo(DEFAULT_WORKSPACE_AGENT_ID),
        api.listAgentWorkspaceEntries(DEFAULT_WORKSPACE_AGENT_ID, normalized),
      ])
      workspaceInfo = info || null
      currentPath = normalized
      entries = normalizeWorkspaceEntries(list)
      selectedFile = null
      editorContent = ''
      dirty = false
    } catch (err) {
      error = cleanError(err) || t('engine.filesLoadFailed')
    } finally {
      loading = false
      draw()
    }
  }

  async function openDirectory(path) {
    if (!(await confirmDirty())) return
    await loadDirectory(path)
  }

  async function openEntry(relativePath, type) {
    const normalized = normalizeWorkspacePath(relativePath)
    if (type === 'dir') {
      await openDirectory(normalized)
      return
    }
    if (!(await confirmDirty())) return
    selectedFile = entries.find(entry => entry.relativePath === normalized) || { relativePath: normalized, editable: true }
    reading = true
    error = ''
    draw()
    try {
      const file = await api.readAgentWorkspaceFile(DEFAULT_WORKSPACE_AGENT_ID, normalized)
      selectedFile = { ...selectedFile, ...file, content: file?.content || '' }
      editorContent = selectedFile.content
      dirty = false
    } catch (err) {
      error = cleanError(err) || t('engine.filesReadFailed')
      selectedFile = null
      editorContent = ''
    } finally {
      reading = false
      draw()
    }
  }

  async function saveFile() {
    if (!canSaveWorkspaceFile(selectedFile) || saving) return
    saving = true
    error = ''
    draw()
    try {
      const savedPath = selectedFile.relativePath
      await api.writeAgentWorkspaceFile(DEFAULT_WORKSPACE_AGENT_ID, savedPath, editorContent)
      selectedFile = { ...selectedFile, content: editorContent, size: editorContent.length }
      dirty = false
      toast(t('engine.filesSaved'), 'success')
      await loadDirectory(currentPath)
      await openEntry(savedPath, 'file')
    } catch (err) {
      error = cleanError(err) || t('engine.filesSaveFailed')
      toast(error, 'error')
    } finally {
      saving = false
      draw()
    }
  }

  draw()
  loadDirectory('')
  return el
}
