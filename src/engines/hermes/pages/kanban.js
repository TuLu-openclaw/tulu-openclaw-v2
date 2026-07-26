import { t } from '../../../lib/i18n.js'
import { api } from '../../../lib/tauri-api.js'
import { toast } from '../../../components/toast.js'
import { showModal, showContentModal, escapeHtml, escapeAttr } from '../../../components/modal.js'
import { icon } from '../../../lib/icons.js'
import {
  KANBAN_STATUSES,
  canCreateKanbanTask,
  canMoveKanbanTask,
  normalizeKanbanBoard,
  normalizeKanbanBoards,
  normalizeKanbanTaskForm,
} from '../lib/kanban-policy.js'

const KANBAN_BASE = '/api/plugins/kanban'

function message(err, fallbackKey) {
  const detail = String(err?.message || err || '').replace(/^Error:\s*/, '')
  return detail ? `${t(fallbackKey)}: ${detail}` : t(fallbackKey)
}

function columnLabel(name) {
  const map = {
    todo: t('engine.hermesKanbanColTodo'),
    in_progress: t('engine.hermesKanbanColInProgress'),
    blocked: t('engine.hermesKanbanColBlocked'),
    done: t('engine.hermesKanbanColDone'),
    archived: t('engine.hermesKanbanColArchived'),
  }
  return map[name] || name
}

function priorityOptions() {
  return [1, 2, 3, 4, 5].map(value => ({ value: String(value), label: `P${value}` }))
}

function statusOptions(includeArchived = false) {
  return KANBAN_STATUSES
    .filter(status => includeArchived || status !== 'archived')
    .map(status => ({ value: status, label: columnLabel(status) }))
}

export function render() {
  const el = document.createElement('div')
  el.className = 'page hm-kanban-page'
  el.dataset.engine = 'hermes'

  let board = normalizeKanbanBoard(null)
  let boards = []
  let loading = true
  let busy = false
  let error = ''

  function draw() {
    const currentSlug = boards.find(item => item?.is_current)?.slug || boards.find(item => item?.is_current)?.name || ''
    el.innerHTML = `
      <div class="hm-hero">
        <div class="hm-hero-title">
          <div class="hm-hero-eyebrow">${escapeHtml(t('engine.hermesKanbanEyebrow'))}</div>
          <h1 class="hm-hero-h1">${escapeHtml(t('engine.hermesKanbanTitle'))}</h1>
          <div class="hm-hero-sub">${escapeHtml(t('engine.hermesKanbanDesc'))}</div>
        </div>
        <div class="hm-hero-actions hm-kanban-toolbar">
          ${boards.length > 1 ? `
            <select class="hm-input hm-kanban-board-switch" id="hm-kanban-board-switch" ${busy || loading ? 'disabled' : ''}>
              ${boards.map(item => {
                const slug = item.slug || item.name || ''
                const selected = slug === currentSlug || item.is_current
                return `<option value="${escapeAttr(slug)}" ${selected ? 'selected' : ''}>${escapeHtml(item.name || slug)}</option>`
              }).join('')}
            </select>` : ''}
          <button class="hm-btn hm-btn--ghost hm-btn--sm" id="hm-kanban-refresh" ${loading || busy ? 'disabled' : ''}>${icon('refresh-cw', 14)}${escapeHtml(t('engine.filesRefresh'))}</button>
          <button class="hm-btn hm-btn--cta hm-btn--sm" id="hm-kanban-new-task" ${busy ? 'disabled' : ''}>${icon('clipboard', 14)}${escapeHtml(t('engine.hermesKanbanNewTask'))}</button>
        </div>
      </div>
      ${error ? `<section class="hm-panel hm-lazy-error"><div class="hm-panel-body">${icon('alert-triangle', 16)}<span>${escapeHtml(error)}</span></div></section>` : ''}
      <section class="hm-panel hm-kanban-panel">
        <div class="hm-panel-header">
          <div>
            <div class="hm-panel-title">${escapeHtml(t('engine.hermesKanbanBoardTitle'))}</div>
            <div class="hm-muted">${escapeHtml(t('engine.hermesKanbanBoardHint'))}</div>
          </div>
          <span class="hm-profile-badge ${loading ? '' : 'hm-profile-badge--active'}">${escapeHtml(loading ? t('engine.filesLoading') : t('engine.hermesKanbanReady'))}</span>
        </div>
        <div class="hm-panel-body">
          ${loading ? `<div class="hm-files-empty">${escapeHtml(t('engine.filesLoading'))}</div>` : renderBoard()}
        </div>
      </section>
    `

    el.querySelector('#hm-kanban-refresh')?.addEventListener('click', load)
    el.querySelector('#hm-kanban-new-task')?.addEventListener('click', onCreateTask)
    el.querySelector('#hm-kanban-board-switch')?.addEventListener('change', onSwitchBoard)
    el.querySelectorAll('[data-task-id]').forEach(card => {
      card.addEventListener('click', () => onTaskClick(card.dataset.taskId))
    })
  }

  function renderBoard() {
    const columns = Array.isArray(board.columns) ? board.columns : []
    if (!columns.length) {
      return `<div class="hm-files-empty">${escapeHtml(t('engine.hermesKanbanEmpty'))}</div>`
    }
    return `
      <div class="hm-kanban-board">
        ${columns.map(column => `
          <section class="hm-kanban-column" data-col="${escapeAttr(column.name)}">
            <div class="hm-kanban-column-head">
              <span class="hm-kanban-column-name">${escapeHtml(columnLabel(column.name))}</span>
              <span class="hm-kanban-column-count">${escapeHtml(String(column.tasks?.length || 0))}</span>
            </div>
            <div class="hm-kanban-column-body">
              ${(column.tasks || []).map(renderTask).join('') || `<div class="hm-kanban-empty-col">${escapeHtml(t('engine.hermesKanbanColEmpty'))}</div>`}
            </div>
          </section>
        `).join('')}
      </div>
    `
  }

  function renderTask(task) {
    const priority = Number.parseInt(task?.priority, 10)
    return `
      <button class="hm-kanban-task" type="button" data-task-id="${escapeAttr(task?.id || '')}">
        <div class="hm-kanban-task-title">${escapeHtml(task?.title || '')}</div>
        ${task?.summary ? `<div class="hm-kanban-task-summary">${escapeHtml(task.summary)}</div>` : ''}
        <div class="hm-kanban-task-meta">
          ${Number.isFinite(priority) ? `<span class="hm-kanban-chip">P${escapeHtml(String(priority))}</span>` : ''}
          ${task?.assignee ? `<span class="hm-kanban-chip">@${escapeHtml(task.assignee)}</span>` : ''}
          ${task?.comment_count ? `<span class="hm-kanban-chip">${icon('message-square', 12)}${escapeHtml(String(task.comment_count))}</span>` : ''}
        </div>
      </button>
    `
  }

  async function load() {
    loading = true
    error = ''
    draw()
    try {
      const [boardData, boardsData] = await Promise.all([
        api.hermesDashboardApi('GET', `${KANBAN_BASE}/board`),
        api.hermesDashboardApi('GET', `${KANBAN_BASE}/boards`).catch(() => ({ boards: [] })),
      ])
      board = normalizeKanbanBoard(boardData)
      boards = normalizeKanbanBoards(boardsData)
    } catch (err) {
      error = message(err, 'engine.hermesKanbanLoadFailed')
      board = normalizeKanbanBoard(null)
      boards = []
    } finally {
      loading = false
      busy = false
      draw()
    }
  }

  async function onSwitchBoard(event) {
    const slug = String(event?.target?.value || '')
    if (!slug || busy) return
    busy = true
    draw()
    try {
      await api.hermesDashboardApi('POST', `${KANBAN_BASE}/boards/${encodeURIComponent(slug)}/switch`)
      toast(t('engine.hermesKanbanBoardSwitched', { name: slug }), 'success')
      await load()
    } catch (err) {
      toast(message(err, 'engine.hermesKanbanBoardSwitchFailed'), 'error')
      busy = false
      draw()
    }
  }

  function onCreateTask() {
    showModal({
      title: t('engine.hermesKanbanNewTaskTitle'),
      fields: [
        { name: 'title', label: t('engine.hermesKanbanTitleLabel'), value: '', placeholder: '...' },
        { name: 'summary', label: t('engine.hermesKanbanSummaryLabel'), value: '', placeholder: '' },
        { name: 'status', label: t('engine.hermesKanbanStatusLabel'), type: 'select', options: statusOptions(false), value: 'todo' },
        { name: 'priority', label: t('engine.hermesKanbanPriorityLabel'), type: 'select', options: priorityOptions(), value: '1' },
      ],
      onConfirm: async (raw) => {
        const form = normalizeKanbanTaskForm(raw)
        if (!canCreateKanbanTask(form, busy)) {
          toast(t('engine.hermesKanbanTitleRequired'), 'error')
          return
        }
        busy = true
        draw()
        try {
          await api.hermesDashboardApi('POST', `${KANBAN_BASE}/tasks`, form)
          toast(t('engine.hermesKanbanTaskCreated'), 'success')
          await load()
        } catch (err) {
          busy = false
          draw()
          toast(message(err, 'engine.hermesKanbanTaskCreateFailed'), 'error')
        }
      },
    })
  }

  async function onTaskClick(taskId) {
    if (!taskId || busy) return
    try {
      const task = await api.hermesDashboardApi('GET', `${KANBAN_BASE}/tasks/${encodeURIComponent(taskId)}`)
      const detail = task && typeof task === 'object' ? task : {}
      const modal = showContentModal({
        title: detail.title || taskId,
        width: 560,
        content: `
          <div class="hm-kanban-detail">
            <div class="hm-kanban-detail-row"><strong>${escapeHtml(t('engine.hermesKanbanStatusLabel'))}</strong><span>${escapeHtml(columnLabel(detail.status || 'todo'))}</span></div>
            ${detail.priority ? `<div class="hm-kanban-detail-row"><strong>${escapeHtml(t('engine.hermesKanbanPriorityLabel'))}</strong><span>P${escapeHtml(String(detail.priority))}</span></div>` : ''}
            ${detail.assignee ? `<div class="hm-kanban-detail-row"><strong>${escapeHtml(t('engine.hermesKanbanAssigneeLabel'))}</strong><span>@${escapeHtml(detail.assignee)}</span></div>` : ''}
            ${detail.summary ? `<div class="hm-kanban-detail-block"><strong>${escapeHtml(t('engine.hermesKanbanSummaryLabel'))}</strong><div>${escapeHtml(detail.summary)}</div></div>` : ''}
            ${detail.description ? `<div class="hm-kanban-detail-block"><strong>${escapeHtml(t('engine.hermesKanbanDescLabel'))}</strong><pre>${escapeHtml(detail.description)}</pre></div>` : ''}
            ${detail.latest_summary ? `<div class="hm-kanban-detail-block"><strong>${escapeHtml(t('engine.hermesKanbanRunSummary'))}</strong><pre>${escapeHtml(detail.latest_summary)}</pre></div>` : ''}
          </div>
        `,
        buttons: [
          { label: t('engine.hermesKanbanMoveStatus'), className: 'btn btn-primary btn-sm', id: 'hm-kanban-move-task' },
        ],
      })
      modal.dataset.engine = 'hermes'
      setTimeout(() => {
        modal.querySelector('#hm-kanban-move-task')?.addEventListener('click', () => {
          showModal({
            title: t('engine.hermesKanbanMoveStatusTitle'),
            fields: [
              { name: 'status', label: t('engine.hermesKanbanStatusLabel'), type: 'select', options: statusOptions(true), value: detail.status || 'todo' },
            ],
            onConfirm: async (raw) => {
              const status = String(raw?.status || '')
              if (!canMoveKanbanTask(status, busy)) {
                toast(t('engine.hermesKanbanTaskUpdateFailed'), 'error')
                return
              }
              busy = true
              draw()
              try {
                await api.hermesDashboardApi('PATCH', `${KANBAN_BASE}/tasks/${encodeURIComponent(taskId)}`, { status })
                toast(t('engine.hermesKanbanTaskUpdated'), 'success')
                modal.close()
                await load()
              } catch (err) {
                busy = false
                draw()
                toast(message(err, 'engine.hermesKanbanTaskUpdateFailed'), 'error')
              }
            },
          })
        })
      }, 0)
    } catch (err) {
      toast(message(err, 'engine.hermesKanbanTaskLoadFailed'), 'error')
    }
  }

  draw()
  load()
  return el
}
