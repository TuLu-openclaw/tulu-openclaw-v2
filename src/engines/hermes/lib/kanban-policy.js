export const KANBAN_STATUSES = Object.freeze([
  'todo',
  'in_progress',
  'blocked',
  'done',
  'archived',
])

export function normalizeKanbanBoard(value) {
  const source = value && typeof value === 'object' ? value : {}
  const columns = Array.isArray(source.columns) ? source.columns : []
  return {
    ...source,
    columns: columns
      .filter(column => column && typeof column === 'object')
      .map(column => ({
        ...column,
        name: String(column.name || 'todo'),
        tasks: Array.isArray(column.tasks) ? column.tasks.filter(Boolean) : [],
      })),
  }
}

export function normalizeKanbanBoards(value) {
  const boards = Array.isArray(value) ? value : (Array.isArray(value?.boards) ? value.boards : [])
  return boards.filter(board => board && typeof board === 'object')
}

export function normalizeKanbanTaskForm(value) {
  const title = String(value?.title || '').trim()
  const summary = String(value?.summary || '').trim()
  const rawStatus = String(value?.status || 'todo')
  const status = KANBAN_STATUSES.includes(rawStatus) && rawStatus !== 'archived' ? rawStatus : 'todo'
  const parsedPriority = Number.parseInt(value?.priority, 10)
  const priority = Number.isFinite(parsedPriority) ? Math.max(1, Math.min(5, parsedPriority)) : 1
  return {
    title,
    summary: summary || undefined,
    status,
    priority,
  }
}

export function canCreateKanbanTask(value, busy = false) {
  return !busy && normalizeKanbanTaskForm(value).title.length > 0
}

export function canMoveKanbanTask(status, busy = false) {
  return !busy && KANBAN_STATUSES.includes(String(status || ''))
}
