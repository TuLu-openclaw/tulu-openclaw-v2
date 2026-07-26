const STATUS = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  WAITING: 'waiting_reply',
  PAUSED: 'paused',
  ERROR: 'error',
})

const DEFAULTS = Object.freeze({
  enabled: false,
  prompt: '',
  autoRunAfterTarget: true,
  stopPolicy: 'self',
  maxSteps: 50,
  stepDelayMs: 1200,
  retryLimit: 2,
  autoStopMinutes: 0,
})

const RUNTIME_DEFAULT = Object.freeze({
  status: STATUS.IDLE,
  stepCount: 0,
  lastRunAt: 0,
  lastRunId: '',
  lastError: '',
  pending: false,
  errorCount: 0,
})

const SYSTEM_PROMPT = `You are a hosted scheduling agent. Based on the user's goal, emit one concise instruction for the target OpenClaw agent each turn. Do not repeat instructions. If the task is complete or cannot continue, include "done" or "stop".`
const STORAGE_KEY = '星枢OpenClaw-hosted-agent-sessions'
const ASSISTANT_KEYS = ['clawpanel-assistant', '星枢OpenClaw-assistant']
const CONTEXT_MAX = 30
const COMPRESS_THRESHOLD = 20

function abortError() {
  return new DOMException('Hosted agent operation aborted', 'AbortError')
}

function isAbort(error) {
  return error?.name === 'AbortError'
}

export function normalizeHostedTransport(raw) {
  const type = String(raw || 'openai-completions').trim().toLowerCase()
  if (type === 'openai' || type === 'openai-completions') return 'openai-completions'
  if (type === 'ollama') return 'ollama'
  throw new Error(`Hosted Agent does not support native ${type || 'unknown'} transport; configure an OpenAI-compatible endpoint`)
}

export function normalizeHostedBaseUrl(raw, transport = 'openai-completions') {
  let base = String(raw || '').trim()
  if (/^\/\//.test(base)) base = `http:${base}`
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(base) && /^(localhost|(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:.]+\]|[^/\s]+:\d+)(?:\/|$)/i.test(base)) base = `http://${base}`
  let url
  try { url = new URL(base) } catch { throw new Error('Hosted Agent model URL is invalid') }
  if (!/^https?:$/.test(url.protocol) || url.hostname === 'tauri.localhost') throw new Error('Hosted Agent model URL is invalid')
  base = `${url.origin}${url.pathname}`
    .replace(/\/+$/, '')
    .replace(/\/(?:api\/(?:chat|generate|tags)?|chat\/completions|completions|responses|messages|models)\/?$/i, '')
  if (transport === 'ollama' && !base.endsWith('/v1')) base += '/v1'
  return base
}

export class ChatHostedAgentController {
  constructor({ page, storage, readPanelConfig, fetchImpl = globalThis.fetch, gatewayReady, sendGateway, t = key => key, toast = () => {}, output = () => {}, now = Date.now, requestTimeoutMs = 120000 } = {}) {
    this.page = page || null
    this.storage = storage
    this.readPanelConfig = readPanelConfig || (async () => ({}))
    this.fetchImpl = fetchImpl
    this.gatewayReady = gatewayReady || (() => false)
    this.sendGateway = sendGateway || (async () => ({}))
    this.t = t
    this.toast = toast
    this.output = output
    this.now = now
    this.requestTimeoutMs = requestTimeoutMs
    this.defaults = null
    this.config = null
    this.runtime = { ...RUNTIME_DEFAULT }
    this.owner = null
    this.generation = 0
    this.destroyed = false
    this.timers = new Set()
    this.delays = new Set()
    this.requests = new Set()
    this.startedAt = 0
    this.expectedRunId = ''
    this.lastTargetIdentity = ''
    this.els = this.#collectDom()
  }

  #collectDom() {
    const q = selector => this.page?.querySelector?.(selector) || null
    return {
      button: q('#chat-hosted-btn'), badge: q('#chat-hosted-badge'), panel: q('#hosted-agent-panel'),
      prompt: q('#hosted-agent-prompt'), maxSteps: q('#hosted-agent-max-steps'), delay: q('#hosted-agent-step-delay'),
      retry: q('#hosted-agent-retry'), autoStop: q('#hosted-agent-auto-stop'), save: q('#hosted-agent-save'),
      close: q('#hosted-agent-close'), timerOn: q('#hosted-agent-timer-on'), timerBody: q('#ha-timer-body'),
      countdown: q('#ha-countdown'), countdownFill: q('#ha-countdown-fill'), countdownText: q('#ha-countdown-text'),
      stepsValue: q('#ha-steps-val'), status: q('#hosted-agent-status'),
    }
  }

  async initialize() {
    const generation = this.generation
    try {
      const panel = await this.readPanelConfig()
      if (!this.#isGeneration(generation)) return false
      this.defaults = panel?.hostedAgent?.default || null
    } catch {
      if (!this.#isGeneration(generation)) return false
      this.defaults = null
    }
    if (this.owner) this.#loadSession(this.owner.sessionKey)
    this.render()
    return true
  }

  activateSession(sessionKey, agentId = 'main') {
    if (this.config?.enabled && this.owner) this.stop({ silent: true })
    this.#cancelGeneration()
    if (this.destroyed) return
    this.owner = sessionKey ? Object.freeze({ sessionKey, agentId: agentId || 'main', generation: this.generation }) : null
    this.expectedRunId = ''
    this.lastTargetIdentity = ''
    this.#loadSession(sessionKey)
    this.render()
  }

  destroy() {
    if (this.destroyed) return
    if (this.config?.enabled && this.owner) this.stop({ silent: true })
    this.#cancelGeneration()
    this.destroyed = true
    this.owner = null
    this.page = null
    this.els = {}
  }

  togglePanel() {
    const panel = this.els.panel
    if (!panel) return
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block'
    if (panel.style.display === 'block') this.render()
  }

  hidePanel() {
    if (this.els.panel) this.els.panel.style.display = 'none'
  }

  toggleRun() {
    return this.config?.enabled ? this.stop() : this.start()
  }

  async start(overrides = null) {
    const sessionKey = this.owner?.sessionKey || ''
    const agentId = this.owner?.agentId || 'main'
    const candidate = this.#readStartConfig(overrides)
    let modelConfig
    try {
      if (!sessionKey) throw new Error('Hosted Agent requires an active session')
      if (!this.gatewayReady()) throw new Error('Gateway not ready')
      if (!candidate.prompt) throw new Error('Enter a task goal')
      modelConfig = this.#loadAssistantConfig()
      modelConfig.transport = normalizeHostedTransport(modelConfig.apiType)
      if (!modelConfig.baseUrl || !modelConfig.model) throw new Error('Hosted Agent model is not configured')
      modelConfig.baseUrl = normalizeHostedBaseUrl(modelConfig.baseUrl, modelConfig.transport)
    } catch (error) {
      this.toast(error.message || String(error), 'warning')
      return false
    }

    this.#cancelGeneration()
    const owner = Object.freeze({ sessionKey, agentId, generation: this.generation })
    this.owner = owner
    this.modelConfig = Object.freeze({ ...modelConfig })
    const system = `${SYSTEM_PROMPT}\n\nUser goal: ${candidate.prompt}`
    const history = [...(this.config?.history || [])]
    if (history[0]?.role === 'system') history[0] = { ...history[0], content: system }
    else history.unshift({ role: 'system', content: system })
    this.config = { ...this.config, ...candidate, enabled: true, history }
    this.runtime = { ...RUNTIME_DEFAULT, status: STATUS.RUNNING }
    this.startedAt = this.now()
    this.expectedRunId = ''
    this.#persist(owner)
    this.#scheduleAutoStop(owner)
    this.render()
    this.toast(this.t('chat.hostedStarted'), 'success')
    void this.#runStep(owner)
    return true
  }

  stop({ silent = false, reason = '' } = {}) {
    const previousOwner = this.owner
    this.#cancelGeneration()
    if (!this.config) return
    const owner = previousOwner?.sessionKey
      ? Object.freeze({ sessionKey: previousOwner.sessionKey, agentId: previousOwner.agentId, generation: this.generation })
      : null
    this.owner = owner
    this.config.enabled = false
    this.runtime = { ...RUNTIME_DEFAULT, lastError: reason }
    this.startedAt = 0
    this.expectedRunId = ''
    this.#persist(owner)
    this.render()
    if (!silent) this.toast(this.t('chat.hostedStopped'), 'info')
  }

  acceptTarget(payload, text) {
    const owner = this.owner
    if (!this.#isOwner(owner) || !this.config?.enabled || !text) return false
    if (![STATUS.RUNNING, STATUS.WAITING].includes(this.runtime.status)) return false
    const eventSession = payload?.sessionKey || ''
    const eventRunId = payload?.runId || payload?.run_id || ''
    if (eventSession !== owner.sessionKey) return false
    if (this.expectedRunId && eventRunId !== this.expectedRunId) return false
    if (!this.expectedRunId && !eventRunId && !eventSession) return false
    const identity = eventRunId || `${eventSession}:${payload?.timestamp || ''}:${text}`
    if (identity === this.lastTargetIdentity) return false
    this.lastTargetIdentity = identity
    this.config.history.push({ role: 'target', content: text, ts: this.now() })
    this.#persist(owner)
    if (this.#detectStop(text)) {
      this.output(this.t('chat.hostedAutoStopSignal'))
      this.stop()
    } else if (!this.runtime.pending) {
      void this.#runStep(owner)
    }
    return true
  }

  render() {
    if (this.destroyed || !this.config) return
    const running = Boolean(this.config.enabled)
    const e = this.els
    if (e.prompt) { e.prompt.value = this.config.prompt || ''; e.prompt.disabled = running }
    if (e.maxSteps) { e.maxSteps.value = this.config.maxSteps >= 999999 ? 205 : this.config.maxSteps; e.maxSteps.disabled = running }
    if (e.stepsValue) e.stepsValue.textContent = this.config.maxSteps >= 999999 ? '∞' : String(this.config.maxSteps)
    if (e.autoStop) { e.autoStop.value = this.config.autoStopMinutes || 30; e.autoStop.disabled = running }
    if (e.timerOn) { e.timerOn.checked = this.config.autoStopMinutes > 0; e.timerOn.disabled = running }
    if (e.timerBody) e.timerBody.style.display = e.timerOn?.checked ? '' : 'none'
    if (e.save) { e.save.textContent = this.t(running ? 'chat.stopHosted' : 'chat.startHosted'); e.save.className = running ? 'btn btn-ghost' : 'btn btn-primary' }
    if (e.status) e.status.textContent = this.runtime.lastError || (running ? `${this.t('chat.hostedRunning')} · ${Math.max(0, this.config.maxSteps - this.runtime.stepCount)}` : this.t('chat.ready'))
    if (e.badge) {
      const status = this.runtime.status || STATUS.IDLE
      e.badge.className = `chat-hosted-badge ${running ? (status === STATUS.WAITING ? 'waiting' : status === STATUS.ERROR ? 'error' : 'running') : 'idle'}`
      e.badge.textContent = this.t(!running ? 'chat.hostedNotEnabled' : status === STATUS.WAITING ? 'chat.hostedWaiting' : status === STATUS.ERROR ? 'chat.hostedErrorStatus' : 'chat.hostedRunning')
    }
    this.#renderCountdown()
  }

  #readStartConfig(overrides) {
    const rawSteps = Number.parseInt(overrides?.maxSteps ?? this.els.maxSteps?.value ?? DEFAULTS.maxSteps, 10)
    const timerOn = overrides?.timerOn ?? this.els.timerOn?.checked
    return {
      prompt: String(overrides?.prompt ?? this.els.prompt?.value ?? '').trim(),
      maxSteps: rawSteps >= 205 ? 999999 : Math.max(1, rawSteps || DEFAULTS.maxSteps),
      stepDelayMs: Math.max(0, Number.parseInt(overrides?.stepDelayMs ?? this.els.delay?.value ?? DEFAULTS.stepDelayMs, 10) || 0),
      retryLimit: Math.max(0, Number.parseInt(overrides?.retryLimit ?? this.els.retry?.value ?? DEFAULTS.retryLimit, 10) || 0),
      autoStopMinutes: timerOn ? Math.max(0, Number.parseFloat(overrides?.autoStopMinutes ?? this.els.autoStop?.value ?? 0) || 0) : 0,
    }
  }

  #loadAssistantConfig() {
    for (const key of ASSISTANT_KEYS) {
      try {
        const parsed = JSON.parse(this.storage?.getItem(key) || 'null')
        if (parsed && typeof parsed === 'object') return { baseUrl: parsed.baseUrl || '', apiKey: parsed.apiKey || '', model: parsed.model || '', temperature: parsed.temperature ?? 0.7, apiType: parsed.apiType || 'openai-completions' }
      } catch {}
    }
    return { baseUrl: '', apiKey: '', model: '', temperature: 0.7, apiType: 'openai-completions' }
  }

  #loadSession(sessionKey) {
    let all = {}
    try { all = JSON.parse(this.storage?.getItem(STORAGE_KEY) || '{}') } catch {}
    const saved = sessionKey ? all[sessionKey] || {} : {}
    this.config = { ...DEFAULTS, ...this.defaults, ...saved, history: [...(saved.history || [])] }
    this.config.enabled = false
    this.runtime = { ...RUNTIME_DEFAULT, ...(saved.state || {}), status: STATUS.IDLE, pending: false }
  }

  #persist(owner) {
    if (!owner?.sessionKey || !this.#isOwner(owner)) return false
    let all = {}
    try { all = JSON.parse(this.storage?.getItem(STORAGE_KEY) || '{}') } catch {}
    this.config.state = { ...this.runtime }
    all[owner.sessionKey] = { ...this.config, history: [...this.config.history] }
    this.storage?.setItem(STORAGE_KEY, JSON.stringify(all))
    return true
  }

  async #runStep(owner) {
    if (!this.#isOwner(owner) || !this.config?.enabled || this.runtime.pending) return
    if (this.runtime.stepCount >= this.config.maxSteps) return this.#completeStop(owner)
    this.runtime.pending = true
    this.runtime.status = STATUS.RUNNING
    this.runtime.lastRunAt = this.now()
    this.#persist(owner)
    this.render()
    if (!(await this.#delay(this.config.stepDelayMs, owner))) return

    let resultText = ''
    for (let attempt = 0; attempt <= this.config.retryLimit; attempt += 1) {
      try {
        resultText = await this.#callModel(this.#buildMessages(owner), owner)
        if (!this.#isOwner(owner)) return
        this.runtime.errorCount = 0
        this.runtime.lastError = ''
        break
      } catch (error) {
        if (isAbort(error) || !this.#isOwner(owner)) return
        this.runtime.errorCount += 1
        this.runtime.lastError = error.message || String(error)
        if (attempt >= this.config.retryLimit) {
          this.runtime.pending = false
          this.runtime.status = STATUS.ERROR
          this.config.enabled = false
          this.#clearTimersAndRequests()
          this.#persist(owner)
          this.render()
          this.output(this.t('chat.hostedNeedIntervention', { reason: this.runtime.lastError }))
          return
        }
        if (!(await this.#delay(this.config.stepDelayMs, owner))) return
      }
    }

    if (!this.#isOwner(owner)) return
    this.runtime.stepCount += 1
    this.runtime.pending = false
    this.config.history.push({ role: 'assistant', content: resultText, ts: this.now() })
    this.output(`${resultText} | step=${this.runtime.stepCount}`)
    if (!resultText.trim() || this.#detectStop(resultText) || this.runtime.stepCount >= this.config.maxSteps) return this.#completeStop(owner)

    this.runtime.status = STATUS.WAITING
    this.#persist(owner)
    this.render()
    try {
      const accepted = await this.sendGateway(owner.sessionKey, resultText.trim(), { agentId: owner.agentId, generation: owner.generation })
      if (!this.#isOwner(owner)) return
      this.expectedRunId = accepted?.runId || accepted?.run_id || accepted?.id || ''
      this.runtime.lastRunId = this.expectedRunId
      this.#persist(owner)
    } catch (error) {
      if (!this.#isOwner(owner) || isAbort(error)) return
      this.runtime.lastError = error.message || String(error)
      this.runtime.status = STATUS.ERROR
      this.config.enabled = false
      this.#clearTimersAndRequests()
      this.#persist(owner)
      this.render()
    }
  }

  #completeStop(owner) {
    if (!this.#isOwner(owner)) return
    this.config.enabled = false
    this.runtime.status = STATUS.IDLE
    this.runtime.pending = false
    this.startedAt = 0
    this.expectedRunId = ''
    this.#clearTimersAndRequests()
    this.#persist(owner)
    this.render()
  }

  #buildMessages(owner) {
    if (!this.#isOwner(owner)) throw abortError()
    let history = this.config.history
    if (history.length > COMPRESS_THRESHOLD) {
      const system = history[0]?.role === 'system' ? history[0] : null
      const recent = history.slice(-8)
      const older = history.slice(system ? 1 : 0, -8)
      history = [system, { role: 'user', content: `[Context summary]\n${older.map(x => `[${x.role}] ${String(x.content || '').slice(0, 80)}`).join('\n')}` }, ...recent].filter(Boolean)
      this.config.history = history
      this.#persist(owner)
    }
    const messages = history.slice(-CONTEXT_MAX).map(item => ({ role: item.role === 'system' || item.role === 'assistant' ? item.role : 'user', content: item.content }))
    if (!messages.some(x => x.role !== 'system')) messages.push({ role: 'user', content: this.config.prompt })
    return messages
  }

  async #callModel(messages, owner) {
    if (!this.#isOwner(owner)) throw abortError()
    const controller = new AbortController()
    const request = { controller, owner, timedOut: false }
    this.requests.add(request)
    const timeout = setTimeout(() => {
      request.timedOut = true
      controller.abort()
    }, this.requestTimeoutMs)
    this.timers.add(timeout)
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (this.modelConfig.apiKey) headers.Authorization = `Bearer ${this.modelConfig.apiKey}`
      const response = await this.fetchImpl(`${this.modelConfig.baseUrl}/chat/completions`, {
        method: 'POST', headers, signal: controller.signal,
        body: JSON.stringify({ model: this.modelConfig.model, messages, stream: true, temperature: this.modelConfig.temperature }),
      })
      if (!response.ok) {
        const raw = await response.text().catch(() => '')
        let message = `API error ${response.status}`
        try { message = JSON.parse(raw).error?.message || message } catch {}
        throw new Error(message)
      }
      const reader = response.body?.getReader?.()
      if (!reader) throw new Error('Hosted Agent response body is unavailable')
      const decoder = new TextDecoder()
      let buffer = '', text = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!this.#isOwner(owner)) throw abortError()
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n'); buffer = lines.pop() || ''
        for (const line of lines) {
          const data = line.trim().replace(/^data:\s*/, '')
          if (!data || data === '[DONE]') continue
          try { text += JSON.parse(data).choices?.[0]?.delta?.content || '' } catch {}
        }
      }
      const tail = buffer.trim().replace(/^data:\s*/, '')
      if (tail && tail !== '[DONE]') {
        try { text += JSON.parse(tail).choices?.[0]?.delta?.content || '' } catch {}
      }
      return text
    } catch (error) {
      if (request.timedOut && isAbort(error) && this.#isOwner(owner)) {
        throw new Error('Hosted Agent model request timed out')
      }
      throw error
    } finally {
      clearTimeout(timeout)
      this.timers.delete(timeout)
      this.requests.delete(request)
    }
  }

  #delay(ms, owner) {
    if (!ms) return Promise.resolve(this.#isOwner(owner))
    return new Promise(resolve => {
      const delay = { timer: null, resolve }
      delay.timer = setTimeout(() => { this.timers.delete(delay.timer); this.delays.delete(delay); resolve(this.#isOwner(owner)) }, ms)
      this.timers.add(delay.timer)
      this.delays.add(delay)
    })
  }

  #scheduleAutoStop(owner) {
    if (!this.config.autoStopMinutes) return
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      if (!this.#isOwner(owner)) return
      this.output(this.t('chat.hostedTimerExpired', { min: this.config.autoStopMinutes }))
      this.stop()
    }, this.config.autoStopMinutes * 60000)
    this.timers.add(timer)
    const countdown = setInterval(() => this.#isOwner(owner) ? this.#renderCountdown() : clearInterval(countdown), 1000)
    this.timers.add(countdown)
  }

  #renderCountdown() {
    const e = this.els
    if (!e.countdown || !this.config?.enabled || !this.config.autoStopMinutes || !this.startedAt) { if (e.countdown) e.countdown.style.display = 'none'; return }
    const total = this.config.autoStopMinutes * 60000
    const remaining = Math.max(0, total - (this.now() - this.startedAt))
    e.countdown.style.display = ''
    if (e.countdownFill) e.countdownFill.style.width = `${remaining / total * 100}%`
    if (e.countdownText) e.countdownText.textContent = `${this.t('chat.remaining')} ${Math.floor(remaining / 60000)}:${String(Math.floor(remaining % 60000 / 1000)).padStart(2, '0')}`
  }

  #detectStop(text) {
    return /(^|\s)(完成|无需继续|结束|停止|done|stop|final)(\s|[.!。！]|$)/i.test(String(text || ''))
  }

  #isGeneration(generation) { return !this.destroyed && generation === this.generation }
  #isOwner(owner) { return Boolean(owner) && !this.destroyed && this.owner === owner && owner.generation === this.generation }

  #cancelGeneration() {
    this.generation += 1
    this.#clearTimersAndRequests()
    if (this.runtime) this.runtime.pending = false
  }

  #clearTimersAndRequests() {
    for (const timer of this.timers) { clearTimeout(timer); clearInterval(timer) }
    this.timers.clear()
    for (const delay of this.delays) delay.resolve(false)
    this.delays.clear()
    for (const request of this.requests) request.controller.abort()
    this.requests.clear()
  }
}

export { DEFAULTS as HOSTED_AGENT_DEFAULTS, STATUS as HOSTED_AGENT_STATUS }
