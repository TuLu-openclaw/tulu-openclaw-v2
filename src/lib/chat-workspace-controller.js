import {
  formatWorkspaceFileSize,
  formatWorkspaceFileTime,
  isMarkdownWorkspaceFile,
  renderWorkspaceCoreFiles,
  renderWorkspaceTree,
} from './chat-workspace-panel.js'

export class ChatWorkspaceController {
  constructor(options) {
    this.page = options.page
    this.api = options.api
    this.t = options.t
    this.toast = options.toast
    this.showConfirm = options.showConfirm
    this.renderMarkdown = options.renderMarkdown
    this.escapeAttr = options.escapeAttr
    this.storage = options.storage
    this.storageKey = options.storageKey
    this.getContext = options.getContext
    this.listeners = []
    this.destroyed = false
    this.info = null
    this.coreFiles = []
    this.treeCache = new Map()
    this.expandedDirs = new Set()
    this.currentAgentId = 'main'
    this.currentFile = null
    this.previewMode = false
    this.dirty = false
    this.loadedContent = ''
    this.loading = false
    this.loadSeq = 0
    this.openSeq = 0
    this.saveSeq = 0
    this.fileSeq = 0
    this.treeSeq = 0
    this.directoryIntent = new Map()
    this.captureElements()
    this.bindEvents()
  }

  captureElements() {
    const find = selector => this.page?.querySelector(selector) || null
    this.button = find('#btn-chat-workspace')
    this.panel = find('#chat-workspace-panel')
    this.triggerAgent = find('#chat-workspace-trigger-agent')
    this.agentBadge = find('#chat-workspace-agent-badge')
    this.agentTitle = find('#chat-workspace-agent-title')
    this.path = find('#chat-workspace-path')
    this.coreList = find('#chat-workspace-core-list')
    this.tree = find('#chat-workspace-tree')
    this.currentFileEl = find('#chat-workspace-current-file')
    this.meta = find('#chat-workspace-editor-meta')
    this.editor = find('#chat-workspace-editor')
    this.preview = find('#chat-workspace-preview')
    this.empty = find('#chat-workspace-empty')
    this.saveButton = find('#chat-workspace-save')
    this.reloadButton = find('#chat-workspace-reload')
    this.previewButton = find('#chat-workspace-preview-toggle')
    this.previewLabel = find('#chat-workspace-preview-label')
  }

  listen(element, type, handler) {
    if (!element) return
    element.addEventListener(type, handler)
    this.listeners.push(() => element.removeEventListener(type, handler))
  }

  bindEvents() {
    this.listen(this.button, 'click', async event => {
      event.stopPropagation()
      if (this.isOpen() && !(await this.confirmDiscardIfNeeded())) return
      if (this.isOpen()) this.discardChanges()
      this.toggle()
    })
    this.listen(this.page?.querySelector('#chat-workspace-close'), 'click', async () => {
      if (!(await this.confirmDiscardIfNeeded())) return
      this.discardChanges()
      this.toggle(false)
    })
    this.listen(this.page?.querySelector('#chat-workspace-refresh'), 'click', async () => {
      if (!(await this.confirmDiscardIfNeeded())) return
      this.discardChanges()
      void this.loadPanelData(true)
    })
    this.listen(this.coreList, 'click', async event => {
      const item = event.target.closest('[data-core-path]')
      if (!item) return
      const relativePath = item.dataset.corePath || ''
      if (!relativePath) return
      if (item.dataset.coreExists === '1') await this.openFile(relativePath, { kind: 'core' })
      else if (await this.confirmDiscardIfNeeded()) {
        this.discardChanges()
        this.prepareDraftFile(relativePath, { kind: 'core' })
      }
    })
    this.listen(this.tree, 'click', async event => {
      const toggle = event.target.closest('[data-tree-toggle]')
      if (toggle) {
        await this.toggleDirectoryWithToast(toggle.dataset.treeToggle || '')
        return
      }
      const link = event.target.closest('[data-tree-path]')
      if (!link) return
      const relativePath = link.dataset.treePath || ''
      if (!relativePath) return
      if (link.dataset.treeType === 'dir') await this.toggleDirectoryWithToast(relativePath)
      else await this.openFile(relativePath, { kind: 'tree' })
    })
    this.listen(this.editor, 'input', () => {
      if (!this.currentFile || !this.editor) return
      this.dirty = this.editor.value !== this.loadedContent
      if (this.previewMode) this.renderPreview()
      this.updateEditorState()
    })
    this.listen(this.editor, 'keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void this.saveCurrentFile()
      }
    })
    this.listen(this.reloadButton, 'click', () => void this.reloadCurrentFile())
    this.listen(this.previewButton, 'click', () => this.togglePreview())
    this.listen(this.saveButton, 'click', () => void this.saveCurrentFile())
  }

  initialize() {
    const open = this.isOpen()
    this.applyVisibility(open)
    if (!open) void this.syncContext(false)
  }

  isOpen() {
    return this.storage?.getItem(this.storageKey) === '1'
  }

  setOpen(open) {
    this.storage?.setItem(this.storageKey, open ? '1' : '0')
  }

  isDirty() {
    return this.dirty
  }

  getAgentId() {
    return this.currentAgentId
  }

  async confirmDiscardIfNeeded() {
    if (!this.dirty) return true
    return this.showConfirm(this.t('chat.confirmDiscardWorkspaceChanges'))
  }

  discardChanges() {
    if (this.editor && this.currentFile) this.editor.value = this.loadedContent
    this.dirty = false
    if (this.previewMode) this.renderPreview()
    this.updateEditorState()
  }

  async syncContext(reload = true) {
    if (this.destroyed) return
    const context = this.getContext() || {}
    const nextAgentId = context.agentId || 'main'
    const previousAgentId = this.currentAgentId
    this.currentAgentId = nextAgentId
    if (this.triggerAgent) this.triggerAgent.textContent = nextAgentId
    if (this.agentBadge) this.agentBadge.textContent = nextAgentId
    if (this.agentTitle) this.agentTitle.textContent = context.title || nextAgentId
    if (previousAgentId !== nextAgentId) {
      this.dirty = false
      this.currentFile = null
      this.fileSeq += 1
    }
    if (!this.panel || !this.isOpen()) return
    if (!reload && previousAgentId === nextAgentId && this.info) return
    await this.loadPanelData(previousAgentId === nextAgentId)
  }

  applyVisibility(open) {
    if (!this.panel) return
    this.panel.style.display = open ? '' : 'none'
    this.button?.classList.toggle('is-active', open)
    if (open) void this.syncContext(true)
  }

  toggle(force) {
    const open = typeof force === 'boolean' ? force : !this.isOpen()
    this.setOpen(open)
    this.applyVisibility(open)
  }

  renderMeta() {
    const context = this.getContext() || {}
    if (this.agentBadge) this.agentBadge.textContent = this.currentAgentId
    if (this.agentTitle) this.agentTitle.textContent = context.title || this.currentAgentId
    if (this.path) {
      const workspacePath = this.info?.workspacePath || ''
      this.path.textContent = workspacePath || this.t('chat.workspaceUnavailable')
      this.path.title = workspacePath
    }
  }

  renderCoreFiles() {
    if (this.coreList) this.coreList.innerHTML = renderWorkspaceCoreFiles(this.coreFiles, this.currentFile, this.t, this.escapeAttr)
  }

  renderTree() {
    if (!this.tree) return
    this.tree.innerHTML = renderWorkspaceTree(this.treeCache.get('') || [], {
      currentFile: this.currentFile,
      expandedDirs: this.expandedDirs,
      treeCache: this.treeCache,
      t: this.t,
      escapeAttr: this.escapeAttr,
    })
  }

  renderPreview() {
    if (this.preview && this.editor) this.preview.innerHTML = this.renderMarkdown(this.editor.value || '')
  }

  updateEditorState() {
    const hasFile = !!this.currentFile
    const canSaveDraft = hasFile && this.currentFile.exists === false
    if (this.currentFileEl) this.currentFileEl.textContent = hasFile ? `${this.currentFile.relativePath}${this.dirty ? ' *' : ''}` : this.t('chat.selectWorkspaceFile')
    if (this.saveButton) this.saveButton.disabled = !hasFile || (!canSaveDraft && !this.dirty) || this.loading
    if (this.reloadButton) this.reloadButton.disabled = !hasFile || this.loading
    if (this.previewButton) this.previewButton.disabled = !hasFile || !this.currentFile?.previewable || this.loading
    if (this.previewLabel) this.previewLabel.textContent = this.previewMode ? this.t('chat.editWorkspaceFile') : this.t('chat.previewWorkspaceFile')
    if (this.editor) {
      this.editor.disabled = !hasFile || this.loading
      this.editor.style.display = hasFile && !this.previewMode ? '' : 'none'
    }
    if (this.preview) this.preview.style.display = hasFile && this.previewMode ? '' : 'none'
    if (this.empty) this.empty.style.display = hasFile ? 'none' : ''
    if (hasFile && this.previewMode) this.renderPreview()
  }

  resetEditor(emptyText = this.t('chat.workspaceEmptyState')) {
    this.fileSeq += 1
    this.currentFile = null
    this.previewMode = false
    this.dirty = false
    this.loadedContent = ''
    if (this.meta) this.meta.textContent = ''
    if (this.editor) {
      this.editor.value = ''
      this.editor.placeholder = this.t('chat.selectWorkspaceFile')
    }
    if (this.preview) {
      this.preview.innerHTML = ''
      this.preview.style.display = 'none'
    }
    if (this.empty) this.empty.textContent = emptyText
    this.renderCoreFiles()
    this.renderTree()
    this.updateEditorState()
  }

  prepareDraftFile(relativePath, options = {}) {
    const { kind = 'core', previewable = isMarkdownWorkspaceFile(relativePath) } = options
    this.fileSeq += 1
    this.currentFile = { agentId: this.currentAgentId, relativePath, kind, previewable, exists: false }
    this.previewMode = false
    this.dirty = false
    this.loadedContent = ''
    if (this.editor) {
      this.editor.value = ''
      this.editor.placeholder = this.t('chat.workspaceDraftHint')
    }
    if (this.meta) this.meta.textContent = this.t('chat.workspaceDraftHint')
    this.renderCoreFiles()
    this.renderTree()
    this.updateEditorState()
  }

  async loadPanelData(preserveCurrentFile = false) {
    if (!this.coreList || !this.tree || this.destroyed) return
    const loadSeq = ++this.loadSeq
    const agentId = this.currentAgentId || 'main'
    this.loading = true
    this.renderMeta()
    this.coreList.innerHTML = `<div class="chat-workspace-note">${this.t('common.loading')}</div>`
    this.tree.innerHTML = `<div class="chat-workspace-note">${this.t('common.loading')}</div>`
    this.updateEditorState()
    try {
      const previousFile = preserveCurrentFile ? this.currentFile : null
      const [info, coreFiles, rootEntries] = await Promise.all([
        this.api.getAgentWorkspaceInfo(agentId),
        this.api.listAgentFiles(agentId),
        this.api.listAgentWorkspaceEntries(agentId, ''),
      ])
      if (this.isStale(loadSeq, agentId)) return
      this.info = info || null
      this.coreFiles = Array.isArray(coreFiles) ? coreFiles : []
      this.treeCache = new Map([['', Array.isArray(rootEntries) ? rootEntries : []]])
      this.expandedDirs = new Set()
      this.directoryIntent = new Map()
      this.treeSeq += 1
      this.renderMeta()
      this.renderCoreFiles()
      this.renderTree()
      if (previousFile && previousFile.agentId === agentId) {
        if (previousFile.kind === 'core' && previousFile.exists === false) this.prepareDraftFile(previousFile.relativePath, previousFile)
        else await this.openFile(previousFile.relativePath, { kind: previousFile.kind, force: true, silent: true })
      } else this.resetEditor(this.t('chat.workspaceEmptyState'))
    } catch (error) {
      if (this.isStale(loadSeq, agentId)) return
      this.info = null
      this.coreFiles = []
      this.treeCache = new Map([['', []]])
      this.expandedDirs = new Set()
      this.directoryIntent = new Map()
      this.treeSeq += 1
      this.resetEditor(this.t('chat.workspaceUnavailable'))
      this.renderMeta()
      const message = error?.message || String(error)
      this.coreList.innerHTML = `<div class="chat-workspace-note is-error">${this.escapeAttr(message)}</div>`
      this.tree.innerHTML = `<div class="chat-workspace-note is-error">${this.escapeAttr(message)}</div>`
      this.toast(`${this.t('chat.workspaceLoadFailed')}: ${message}`, 'error')
    } finally {
      if (loadSeq === this.loadSeq && !this.destroyed) {
        this.loading = false
        this.updateEditorState()
      }
    }
  }

  isStale(sequence, agentId) {
    return this.destroyed || sequence !== this.loadSeq || agentId !== this.currentAgentId
  }

  async toggleDirectoryWithToast(relativePath) {
    try { await this.toggleDirectory(relativePath) }
    catch (error) { this.toast(`${this.t('chat.workspaceLoadFailed')}: ${error?.message || error}`, 'error') }
  }

  async toggleDirectory(relativePath) {
    if (!relativePath || this.destroyed) return
    const intendedExpanded = !(this.directoryIntent.get(relativePath) ?? this.expandedDirs.has(relativePath))
    this.directoryIntent.set(relativePath, intendedExpanded)
    if (!intendedExpanded) {
      this.expandedDirs.delete(relativePath)
      this.renderTree()
      return
    }
    this.expandedDirs.add(relativePath)
    this.renderTree()
    const agentId = this.currentAgentId
    const treeSeq = this.treeSeq
    try {
      if (!this.treeCache.has(relativePath)) {
        const entries = await this.api.listAgentWorkspaceEntries(agentId, relativePath)
        if (this.destroyed || agentId !== this.currentAgentId || treeSeq !== this.treeSeq) return
        this.treeCache.set(relativePath, Array.isArray(entries) ? entries : [])
      }
      if (this.directoryIntent.get(relativePath) === true) this.expandedDirs.add(relativePath)
      else this.expandedDirs.delete(relativePath)
      this.renderTree()
    } catch (error) {
      this.toast(`${this.t('common.loadFailed')}: ${error?.message || error}`, 'error')
    }
  }

  async openFile(relativePath, options = {}) {
    const { kind = 'tree', force = false, silent = false } = options
    if (!force && !(await this.confirmDiscardIfNeeded())) return
    const openSeq = ++this.openSeq
    const fileSeq = ++this.fileSeq
    const agentId = this.currentAgentId
    try {
      const file = await this.api.readAgentWorkspaceFile(agentId, relativePath)
      if (this.destroyed || openSeq !== this.openSeq || fileSeq !== this.fileSeq || agentId !== this.currentAgentId) return
      this.currentFile = { agentId, relativePath, kind, previewable: !!file.previewable, exists: true }
      this.loadedContent = file.content || ''
      this.previewMode = false
      this.dirty = false
      if (this.editor) {
        this.editor.value = this.loadedContent
        this.editor.placeholder = this.t('chat.selectWorkspaceFile')
      }
      const metaParts = []
      if (typeof file.size === 'number') metaParts.push(formatWorkspaceFileSize(file.size))
      const timeText = formatWorkspaceFileTime(file.mtime)
      if (timeText) metaParts.push(timeText)
      if (this.meta) this.meta.textContent = metaParts.join(' · ')
      this.renderCoreFiles()
      this.renderTree()
      this.updateEditorState()
    } catch (error) {
      if (!this.destroyed && openSeq === this.openSeq && agentId === this.currentAgentId && !silent) this.toast(`${this.t('chat.workspaceOpenFailed')}: ${error?.message || error}`, 'error')
    }
  }

  async reloadCurrentFile(force = false) {
    if (!this.currentFile || (!force && !(await this.confirmDiscardIfNeeded()))) return
    if (this.currentFile.kind === 'core' && this.currentFile.exists === false) {
      this.prepareDraftFile(this.currentFile.relativePath, this.currentFile)
      return
    }
    await this.openFile(this.currentFile.relativePath, { kind: this.currentFile.kind, force: true })
  }

  togglePreview() {
    if (!this.currentFile?.previewable) return
    this.previewMode = !this.previewMode
    this.updateEditorState()
  }

  async saveCurrentFile() {
    if (!this.currentFile || !this.editor || this.destroyed) return
    const saveSeq = ++this.saveSeq
    const fileSeq = this.fileSeq
    const agentId = this.currentAgentId
    const relativePath = this.currentFile.relativePath
    const text = this.editor.value
    const wasExisting = this.currentFile.exists !== false
    try {
      await this.api.writeAgentWorkspaceFile(agentId, relativePath, text)
      if (this.destroyed || saveSeq !== this.saveSeq || fileSeq !== this.fileSeq
        || agentId !== this.currentAgentId || relativePath !== this.currentFile?.relativePath) return
      this.currentFile = { ...this.currentFile, exists: true }
      this.loadedContent = text
      this.dirty = this.editor.value !== text
      this.coreFiles = this.coreFiles.map(file => file.name === relativePath ? { ...file, exists: true } : file)
      this.renderCoreFiles()
      this.renderTree()
      this.updateEditorState()
      this.toast(wasExisting ? this.t('common.saveSuccess') : this.t('chat.workspaceFileCreated'), 'success')
    } catch (error) {
      if (!this.destroyed && saveSeq === this.saveSeq && fileSeq === this.fileSeq
        && agentId === this.currentAgentId && relativePath === this.currentFile?.relativePath) {
        this.toast(`${this.t('common.saveFailed')}: ${error?.message || error}`, 'error')
      }
    }
  }

  destroy() {
    this.destroyed = true
    this.loadSeq += 1
    this.openSeq += 1
    this.saveSeq += 1
    this.fileSeq += 1
    this.treeSeq += 1
    for (const remove of this.listeners.splice(0)) remove()
    this.page = null
    this.captureElements()
    this.info = null
    this.coreFiles = []
    this.treeCache = new Map()
    this.expandedDirs = new Set()
    this.directoryIntent = new Map()
    this.currentAgentId = 'main'
    this.currentFile = null
    this.previewMode = false
    this.dirty = false
    this.loadedContent = ''
    this.loading = false
  }
}
