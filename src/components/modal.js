/**
 * Modal 弹窗组件
 */

import { t } from '../lib/i18n.js'

// 转义 HTML 属性值，防止双引号等字符破坏 HTML 结构
export function escapeAttr(str) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// 转义 HTML 文本节点，允许调用方拼接可信图标/标签时保护动态文本
export function escapeHtml(str) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function safeFieldName(name) {
  return escapeAttr(name || '')
}

function renderFieldHint(hint) {
  return hint ? `<div class="form-hint">${escapeHtml(hint)}</div>` : ''
}

function renderFieldLabel(label) {
  return escapeHtml(label)
}

/**
 * 自定义确认弹窗，替代原生 confirm()
 * Tauri WebView 不支持原生 confirm/alert，必须用自定义弹窗
 * @param {string} message 确认消息
 * @returns {Promise<boolean>} 用户选择确认返回 true，取消返回 false
 */
export function showConfirm(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `
      <div class="modal" style="max-width:400px">
        <div class="modal-title">${t('common.confirmAction')}</div>
        <div class="modal-body" style="font-size:var(--font-size-sm);color:var(--text-secondary);white-space:pre-wrap;line-height:1.6">${escapeAttr(message)}</div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" data-action="cancel">${t('common.cancel')}</button>
          <button class="btn btn-danger btn-sm" data-action="confirm">${t('common.confirm')}</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)

    const close = (result) => {
      overlay.remove()
      resolve(result)
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false)
    })
    overlay.querySelector('[data-action="cancel"]').onclick = () => close(false)
    overlay.querySelector('[data-action="confirm"]').onclick = () => close(true)
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); close(true) }
      else if (e.key === 'Escape') close(false)
    })
    // 聚焦确认按钮以接收键盘事件
    overlay.querySelector('[data-action="confirm"]').focus()
  })
}

export function showModal({ title, fields, onConfirm }) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'

  const fieldHtml = fields.map(f => {
    const fieldName = safeFieldName(f.name)
    const label = renderFieldLabel(f.label)
    const hint = renderFieldHint(f.hint)
    if (f.type === 'checkbox') {
      return `
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" data-name="${fieldName}" ${f.value ? 'checked' : ''}>
            <span class="form-label" style="margin:0">${label}</span>
          </label>
          ${hint}
        </div>`
    }
    if (f.type === 'select') {
      return `
        <div class="form-group">
          <label class="form-label">${label}</label>
          <select class="form-input" data-name="${fieldName}">
            ${(f.options || []).map(o => {
              const value = o?.value ?? ''
              return `<option value="${escapeAttr(value)}" ${value === f.value ? 'selected' : ''}>${escapeHtml(o?.label ?? value)}</option>`
            }).join('')}
          </select>
          ${hint}
        </div>`
    }
    if (f.type === 'textarea') {
      const rows = Number(f.rows) > 0 ? Number(f.rows) : 4
      return `
        <div class="form-group">
          <label class="form-label">${label}</label>
          <textarea class="form-input" data-name="${fieldName}" rows="${rows}" placeholder="${escapeAttr(f.placeholder)}"${f.readonly ? ' readonly style="opacity:0.6;cursor:not-allowed;resize:vertical"' : ' style="resize:vertical"'}>${escapeHtml(f.value)}</textarea>
          ${hint}
        </div>`
    }
    return `
      <div class="form-group">
        <label class="form-label">${label}</label>
        <input class="form-input" data-name="${fieldName}" value="${escapeAttr(f.value)}" placeholder="${escapeAttr(f.placeholder)}"${f.readonly ? ' readonly style="opacity:0.6;cursor:not-allowed"' : ''}>
        ${hint}
      </div>`
  }).join('')

  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-title">${escapeHtml(title)}</div>
      ${fieldHtml}
      <div class="modal-actions">
        <button class="btn btn-secondary btn-sm" data-action="cancel">${t('common.cancel')}</button>
        <button class="btn btn-primary btn-sm" data-action="confirm">${t('common.confirm')}</button>
      </div>
    </div>
  `

  document.body.appendChild(overlay)

  // 点击遮罩关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove()
  })

  overlay.querySelector('[data-action="cancel"]').onclick = () => overlay.remove()

  overlay.querySelector('[data-action="confirm"]').onclick = () => {
    const result = {}
    overlay.querySelectorAll('[data-name]').forEach(el => {
      if (el.type === 'checkbox') {
        result[el.dataset.name] = el.checked
      } else {
        result[el.dataset.name] = el.value
      }
    })
    const callback = onConfirm
    setTimeout(() => overlay.remove(), 0)
    callback(result)
  }

  // 键盘事件：Enter 确认，Escape 关闭；textarea 内 Enter 不抢提交
  const handleKey = (e) => {
    const targetTag = e.target?.tagName?.toLowerCase()
    if (e.key === 'Enter') {
      if (targetTag === 'textarea') return
      e.preventDefault()
      overlay.querySelector('[data-action="confirm"]')?.click()
    } else if (e.key === 'Escape') {
      overlay.remove()
    }
  }
  overlay.addEventListener('keydown', handleKey)

  // 自动聚焦第一个输入框
  const firstInput = overlay.querySelector('input, textarea, select')
  if (firstInput) firstInput.focus()
}

/**
 * 通用内容弹窗 — 支持自定义 HTML 和按钮
 * @param {{ title, content, buttons, width }} opts
 *   buttons: [{ label, className, id }]
 * @returns {HTMLElement} overlay 元素（带 .close() 方法）
 */
export function showContentModal({ title, content, buttons = [], width = 480 }) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'

  const btnsHtml = buttons.map(b =>
    `<button class="${escapeAttr(b.className || 'btn btn-primary btn-sm')}" id="${escapeAttr(b.id || '')}">${escapeHtml(b.label)}</button>`
  ).join('')

  overlay.innerHTML = `
    <div class="modal" style="max-width:${Number(width) || 480}px">
      <div class="modal-title">${escapeHtml(title)}</div>
      <div class="modal-content-body">${content}</div>
      <div class="modal-actions">
        <button class="btn btn-secondary btn-sm" data-action="cancel">${t('common.cancel')}</button>
        ${btnsHtml}
      </div>
    </div>
  `

  document.body.appendChild(overlay)

  overlay.close = () => overlay.remove()

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove()
  })
  overlay.querySelector('[data-action="cancel"]').onclick = () => overlay.remove()
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') overlay.remove()
  })

  // 自动聚焦第一个输入框或按钮
  const firstInput = overlay.querySelector('input, textarea, select')
  if (firstInput) firstInput.focus()

  return overlay
}

/**
 * 升级进度弹窗 — 带进度条和实时日志
 * @returns {{ appendLog, setProgress, setDone, setError, destroy }}
 */
export function showUpgradeModal(title) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal" style="max-width:520px">
      <div class="modal-title">${title || t('common.upgradeOpenClaw')}</div>
      <div class="upgrade-progress-wrap">
        <div class="upgrade-progress-bar"><div class="upgrade-progress-fill" style="width:0%"></div></div>
        <div class="upgrade-progress-text">${t('common.preparing')}</div>
      </div>
      <div class="upgrade-log-box"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary btn-sm" data-action="close">${t('common.close')}</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  const fill = overlay.querySelector('.upgrade-progress-fill')
  const text = overlay.querySelector('.upgrade-progress-text')
  const logBox = overlay.querySelector('.upgrade-log-box')
  const closeBtn = overlay.querySelector('[data-action="close"]')
  const _logLines = []

  let _onClose = null
  let _finished = false
  let _taskBar = null

  // 重新打开弹窗（从任务状态栏点击时）
  function reopenModal() {
    if (_taskBar) { _taskBar.remove(); _taskBar = null }
    document.body.appendChild(overlay)
  }

  // 关闭弹窗：未完成时显示任务状态栏
  function closeModal() {
    overlay.remove()
    if (!_finished) {
      showTaskBar()
    } else {
      if (_taskBar) { _taskBar.remove(); _taskBar = null }
      _onClose?.()
    }
  }

  // 全局任务状态栏：关闭弹窗后显示在页面顶部
  function showTaskBar() {
    if (_taskBar) return
    _taskBar = document.createElement('div')
    _taskBar.className = 'upgrade-task-bar'
    _taskBar.innerHTML = `
      <span class="upgrade-task-bar-text">${text.textContent}</span>
      <button class="btn btn-sm upgrade-task-bar-open">${t('common.viewDetails')}</button>
      <button class="btn btn-sm btn-ghost upgrade-task-bar-dismiss">×</button>
    `
    _taskBar.querySelector('.upgrade-task-bar-open').onclick = reopenModal
    _taskBar.querySelector('.upgrade-task-bar-dismiss').onclick = () => { _taskBar.remove(); _taskBar = null }
    document.body.appendChild(_taskBar)
  }

  function updateTaskBar(statusText) {
    if (_taskBar) {
      const span = _taskBar.querySelector('.upgrade-task-bar-text')
      if (span) span.textContent = statusText
    }
  }

  closeBtn.onclick = closeModal
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal()
  })

  return {
    appendLog(line) {
      _logLines.push(line)
      const div = document.createElement('div')
      div.textContent = line
      logBox.appendChild(div)
      logBox.scrollTop = logBox.scrollHeight
    },
    appendHtmlLog(line) {
      _logLines.push(line)
      const div = document.createElement('div')
      div.innerHTML = line
      logBox.appendChild(div)
      logBox.scrollTop = logBox.scrollHeight
    },
    getLogText() { return _logLines.join('\n') },
    setProgress(pct) {
      fill.style.width = pct + '%'
      let statusText
      if (pct >= 100) statusText = t('common.completed')
      else if (pct >= 75) statusText = t('common.installingProgress')
      else if (pct >= 30) statusText = t('common.downloadingDependencies')
      else statusText = t('common.preparing')
      text.textContent = statusText
      updateTaskBar(statusText)
    },
    setDone(msg) {
      _finished = true
      text.textContent = msg || t('common.upgradeCompleted')
      fill.style.width = '100%'
      fill.classList.add('done')
      if (_taskBar) { _taskBar.remove(); _taskBar = null }
      closeBtn.focus()
    },
    setError(msg) {
      _finished = true
      text.textContent = msg || t('common.upgradeFailed')
      fill.classList.add('error')
      if (_taskBar) {
        const span = _taskBar.querySelector('.upgrade-task-bar-text')
        if (span) { span.textContent = msg || t('common.upgradeFailed'); span.style.color = 'var(--error)' }
      }
      closeBtn.focus()
    },
    onClose(fn) { _onClose = fn },
    destroy() { overlay.remove(); if (_taskBar) { _taskBar.remove(); _taskBar = null } _onClose?.() },
  }
}
