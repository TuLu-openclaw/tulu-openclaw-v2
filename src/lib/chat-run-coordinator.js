import { uuid } from './ws-client.js'

/**
 * Owns chat protocol correlation without touching the DOM.
 * Page rendering stays in chat.js; session/run ownership lives here.
 */
export class ChatRunCoordinator {
  constructor() {
    this.activeSessionKey = ''
    this.generation = 0
    this.queue = []
    this.pendingSends = new Map()
    this.lastSendContext = null
    this.runOwners = new Map()
    this.terminalRuns = new Set()
  }

  activateSession(sessionKey) {
    if (sessionKey !== this.activeSessionKey) this.generation += 1
    this.activeSessionKey = sessionKey || ''
    return this.generation
  }

  beginSend(sessionKey) {
    const context = Object.freeze({
      id: uuid(),
      sessionKey: sessionKey || '',
      generation: this.generation,
    })
    this.pendingSends.set(context.id, context)
    this.lastSendContext = context
    return context
  }

  settleSend(context) {
    if (context?.id) this.pendingSends.delete(context.id)
  }

  isCurrent(context) {
    return Boolean(context)
      && context.sessionKey === this.activeSessionKey
      && context.generation === this.generation
  }

  enqueue(sessionKey, text, attachments = []) {
    const item = Object.freeze({
      id: uuid(),
      sessionKey: sessionKey || '',
      text,
      attachments: [...attachments],
    })
    this.queue.push(item)
    return item
  }

  takeNext(sessionKey = this.activeSessionKey) {
    const index = this.queue.findIndex(item => item.sessionKey === sessionKey)
    if (index < 0) return null
    return this.queue.splice(index, 1)[0]
  }

  get queuedCount() {
    return this.queue.length
  }

  registerRun(runId, sessionKey) {
    if (!runId || !sessionKey) return
    this.runOwners.set(runId, sessionKey)
    if (this.runOwners.size > 500) {
      const recent = [...this.runOwners.entries()].slice(-250)
      this.runOwners = new Map(recent)
    }
  }

  resolveEventSession(explicitSessionKey, runId) {
    if (runId && this.runOwners.has(runId)) return this.runOwners.get(runId)
    if (explicitSessionKey) {
      this.registerRun(runId, explicitSessionKey)
      return explicitSessionKey
    }

    const pendingSessions = new Set(
      [...this.pendingSends.values()].map(item => item.sessionKey).filter(Boolean),
    )
    if (pendingSessions.size === 1) {
      const [sessionKey] = pendingSessions
      this.registerRun(runId, sessionKey)
      return sessionKey
    }
    if (pendingSessions.size === 0 && this.isCurrent(this.lastSendContext)) {
      this.registerRun(runId, this.lastSendContext.sessionKey)
      return this.lastSendContext.sessionKey
    }
    return ''
  }

  shouldRender({ explicitSessionKey = '', runId = '', currentRunId = '' } = {}) {
    const sessionKey = this.resolveEventSession(explicitSessionKey, runId)
    if (!sessionKey || sessionKey !== this.activeSessionKey) return false
    if (currentRunId && runId && currentRunId !== runId) return false
    return true
  }

  markTerminal(runId) {
    if (!runId) return true
    if (this.terminalRuns.has(runId)) return false
    this.terminalRuns.add(runId)
    if (this.terminalRuns.size > 500) {
      const recent = [...this.terminalRuns].slice(-250)
      this.terminalRuns = new Set(recent)
    }
    return true
  }

  clearPageQueue() {
    this.queue = []
  }

  reset() {
    this.activeSessionKey = ''
    this.generation += 1
    this.queue = []
    this.pendingSends.clear()
    this.lastSendContext = null
    this.runOwners.clear()
    this.terminalRuns.clear()
  }
}
