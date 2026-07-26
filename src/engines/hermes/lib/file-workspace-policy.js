export const DEFAULT_WORKSPACE_AGENT_ID = 'main'

export function normalizeWorkspacePath(path) {
  const parts = String(path || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(part => part && part !== '.')
  const safe = []
  for (const part of parts) {
    if (part === '..') {
      safe.pop()
      continue
    }
    safe.push(part)
  }
  return safe.join('/')
}

export function parentWorkspacePath(path) {
  const normalized = normalizeWorkspacePath(path)
  if (!normalized) return ''
  const parts = normalized.split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

export function workspaceBreadcrumbs(path) {
  const normalized = normalizeWorkspacePath(path)
  const crumbs = [{ label: 'workspace', path: '' }]
  if (!normalized) return crumbs
  const parts = normalized.split('/').filter(Boolean)
  let acc = ''
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part
    crumbs.push({ label: part, path: acc })
  }
  return crumbs
}

export function normalizeWorkspaceEntries(entries) {
  return (Array.isArray(entries) ? entries : [])
    .map(entry => ({
      name: String(entry?.name || ''),
      relativePath: normalizeWorkspacePath(entry?.relativePath || entry?.name || ''),
      type: entry?.type === 'dir' ? 'dir' : 'file',
      size: Number.isFinite(Number(entry?.size)) ? Number(entry.size) : 0,
      mtime: entry?.mtime || null,
      editable: Boolean(entry?.editable),
      previewable: Boolean(entry?.previewable),
    }))
    .filter(entry => entry.name && entry.relativePath)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

export function selectedEntry(entries, relativePath) {
  const wanted = normalizeWorkspacePath(relativePath)
  if (!wanted) return null
  return normalizeWorkspaceEntries(entries).find(entry => entry.relativePath === wanted) || null
}

export function canOpenWorkspaceEntry(entry) {
  if (!entry) return false
  if (entry.type === 'dir') return true
  return Boolean(entry.editable || entry.previewable)
}

export function canSaveWorkspaceFile(file) {
  return Boolean(file && file.relativePath && file.editable !== false)
}
