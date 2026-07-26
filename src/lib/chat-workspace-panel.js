import { icon as svgIcon } from './icons.js'

export function renderChatWorkspacePanel(t) {
  return `
    <div class="chat-workspace-panel" id="chat-workspace-panel" style="display:none">
      <div class="chat-workspace-header">
        <div class="chat-workspace-header-copy">
          <div class="chat-workspace-title-row">
            <strong>${t('chat.workspaceFiles')}</strong>
            <span class="chat-workspace-agent-badge" id="chat-workspace-agent-badge">main</span>
          </div>
          <div class="chat-workspace-agent-title" id="chat-workspace-agent-title"></div>
          <div class="chat-workspace-path" id="chat-workspace-path"></div>
        </div>
        <div class="chat-workspace-header-actions">
          <button class="chat-workspace-icon-btn" id="chat-workspace-refresh" title="${t('common.refresh')}">${svgIcon('refresh-cw', 14)}</button>
          <button class="chat-workspace-icon-btn" id="chat-workspace-close" title="${t('common.close')}">${svgIcon('x', 14)}</button>
        </div>
      </div>
      <div class="chat-workspace-body">
        <div class="chat-workspace-sidebar-pane">
          <div class="chat-workspace-section">
            <div class="chat-workspace-section-title">${t('chat.coreFiles')}</div>
            <div class="chat-workspace-core-list" id="chat-workspace-core-list"></div>
          </div>
          <div class="chat-workspace-section">
            <div class="chat-workspace-section-title">${t('chat.workspaceExplorer')}</div>
            <div class="chat-workspace-tree" id="chat-workspace-tree"></div>
          </div>
        </div>
        <div class="chat-workspace-editor-pane">
          <div class="chat-workspace-editor-toolbar">
            <div class="chat-workspace-current-file" id="chat-workspace-current-file">${t('chat.selectWorkspaceFile')}</div>
            <div class="chat-workspace-editor-actions">
              <button class="btn btn-sm btn-ghost" id="chat-workspace-reload" disabled>${svgIcon('refresh-cw', 14)} ${t('chat.reloadWorkspaceFile')}</button>
              <button class="btn btn-sm btn-ghost" id="chat-workspace-preview-toggle" disabled>${svgIcon('eye', 14)} <span id="chat-workspace-preview-label">${t('chat.previewWorkspaceFile')}</span></button>
              <button class="btn btn-sm btn-primary" id="chat-workspace-save" disabled>${t('common.save')}</button>
            </div>
          </div>
          <div class="chat-workspace-editor-meta" id="chat-workspace-editor-meta"></div>
          <textarea class="chat-workspace-editor" id="chat-workspace-editor" spellcheck="false" disabled placeholder="${t('chat.selectWorkspaceFile')}"></textarea>
          <div class="chat-workspace-preview" id="chat-workspace-preview" style="display:none"></div>
          <div class="chat-workspace-empty" id="chat-workspace-empty">${t('chat.workspaceEmptyState')}</div>
        </div>
      </div>
    </div>`
}

export function formatWorkspaceFileSize(bytes) {
  const size = Number(bytes) || 0
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function formatWorkspaceFileTime(value, locale) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(locale)
}

export function isMarkdownWorkspaceFile(relativePath) {
  return /\.(md|markdown|mdx)$/i.test(relativePath || '')
}

export function renderWorkspaceCoreFiles(files, currentFile, t, escapeAttr) {
  if (!files.length) return `<div class="chat-workspace-note">${t('chat.workspaceNoCoreFiles')}</div>`

  return files.map(file => {
    const active = currentFile?.relativePath === file.name ? ' active' : ''
    const status = file.exists ? t('common.edit') : t('common.add')
    return `
      <button class="chat-workspace-core-item${active}" data-core-path="${escapeAttr(file.name)}" data-core-exists="${file.exists ? '1' : '0'}" title="${escapeAttr(file.path || file.name)}">
        <span class="chat-workspace-core-icon">${svgIcon(file.exists ? 'file-text' : 'file-plain', 14)}</span>
        <span class="chat-workspace-core-copy">
          <span class="chat-workspace-core-name">${escapeAttr(file.name)}</span>
          <span class="chat-workspace-core-status ${file.exists ? 'exists' : 'missing'}">${status}</span>
        </span>
      </button>`
  }).join('')
}

export function renderWorkspaceTree(entries, options) {
  const { currentFile, expandedDirs, treeCache, t, escapeAttr } = options
  if (!entries.length) return `<div class="chat-workspace-note">${t('chat.workspaceTreeEmpty')}</div>`

  const renderNode = (entry, depth) => {
    const isDir = entry.type === 'dir'
    const expanded = isDir && expandedDirs.has(entry.relativePath)
    const active = currentFile?.relativePath === entry.relativePath ? ' active' : ''
    const children = expanded
      ? (treeCache.get(entry.relativePath) || []).map(child => renderNode(child, depth + 1)).join('')
      : ''

    return `
      <div class="chat-workspace-tree-node">
        <div class="chat-workspace-tree-row${active}" style="padding-left:${12 + depth * 14}px">
          ${isDir
            ? `<button class="chat-workspace-tree-toggle" data-tree-toggle="${escapeAttr(entry.relativePath)}">${expanded ? '▾' : '▸'}</button>`
            : '<span class="chat-workspace-tree-toggle is-spacer"></span>'}
          <button class="chat-workspace-tree-link" data-tree-path="${escapeAttr(entry.relativePath)}" data-tree-type="${entry.type}" data-tree-editable="${entry.editable ? '1' : '0'}" title="${escapeAttr(entry.relativePath)}">
            ${svgIcon(isDir ? 'folder' : (entry.previewable ? 'file-text' : 'file'), 14)}
            <span class="chat-workspace-tree-name">${escapeAttr(entry.name)}</span>
          </button>
        </div>
        ${children}
      </div>`
  }

  return entries.map(entry => renderNode(entry, 0)).join('')
}
