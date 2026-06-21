import { render as renderCenter } from './xingshu-skill-center.js'
import { t } from '../lib/i18n.js'

export async function render() {
  const page = await renderCenter()
  const title = page.querySelector('.page-title')
  const desc = page.querySelector('.page-desc')
  if (title) title.textContent = t('skills.xingshuSecurity')
  if (desc) desc.textContent = t('skills.xingshuSecurityDesc')
  const list = page.querySelector('#xs-skill-list')
  if (list) {
    const note = document.createElement('div')
    note.className = 'form-hint'
    note.style.marginBottom = 'var(--space-md)'
    note.textContent = t('skills.xingshuSecurityHint')
    list.parentNode.insertBefore(note, list)
  }
  return page
}
