// Shared HTML escaping helpers for dynamic text inserted into HTML strings.
export function escapeHtml(value) {
  if (value == null) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;')
}
