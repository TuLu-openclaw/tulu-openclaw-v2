import test from 'node:test'
import assert from 'node:assert/strict'

import {
  KANBAN_STATUSES,
  canCreateKanbanTask,
  canMoveKanbanTask,
  normalizeKanbanBoard,
  normalizeKanbanBoards,
  normalizeKanbanTaskForm,
} from '../src/engines/hermes/lib/kanban-policy.js'

test('normalizes board and board-list response shapes', () => {
  assert.deepEqual(normalizeKanbanBoard(null).columns, [])
  assert.deepEqual(normalizeKanbanBoard({ columns: [{ name: 'todo' }, null] }).columns, [
    { name: 'todo', tasks: [] },
  ])
  assert.deepEqual(normalizeKanbanBoards({ boards: [{ slug: 'main' }] }), [{ slug: 'main' }])
  assert.deepEqual(normalizeKanbanBoards([{ slug: 'other' }]), [{ slug: 'other' }])
})

test('normalizes task form to Hermes supported values', () => {
  assert.deepEqual(normalizeKanbanTaskForm({
    title: '  Ship it  ',
    summary: '  verified  ',
    status: 'in_progress',
    priority: '9',
  }), {
    title: 'Ship it',
    summary: 'verified',
    status: 'in_progress',
    priority: 5,
  })

  const fallback = normalizeKanbanTaskForm({ status: 'unknown', priority: 'x' })
  assert.equal(fallback.status, 'todo')
  assert.equal(fallback.priority, 1)
  assert.equal(fallback.summary, undefined)
})

test('task actions reject empty titles, invalid status, and busy state', () => {
  assert.equal(canCreateKanbanTask({ title: 'Task' }), true)
  assert.equal(canCreateKanbanTask({ title: '   ' }), false)
  assert.equal(canCreateKanbanTask({ title: 'Task' }, true), false)
  assert.equal(canMoveKanbanTask('done'), true)
  assert.equal(canMoveKanbanTask('invalid'), false)
  assert.equal(canMoveKanbanTask(KANBAN_STATUSES[0], true), false)
})
