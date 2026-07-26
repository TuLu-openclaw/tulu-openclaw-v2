import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { ChatHostedAgentController, normalizeHostedTransport } from '../src/lib/chat-hosted-agent-controller.js'

const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms))

function memoryStorage(model = {}) {
  const data = new Map()
  data.set('clawpanel-assistant', JSON.stringify({ baseUrl: 'http://localhost:11434/v1', model: 'test', apiType: 'openai-completions', ...model }))
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    dump: key => JSON.parse(data.get(key) || '{}'),
  }
}

function streamResponse(text) {
  const body = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`
  const bytes = new TextEncoder().encode(body)
  return { ok: true, body: { getReader: () => ({ read: (() => { let done = false; return async () => done ? { done: true } : (done = true, { done: false, value: bytes }) })() }) } }
}

function streamResponseWithoutTrailingNewline(text) {
  const bytes = new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`)
  return { ok: true, body: { getReader: () => ({ read: (() => { let done = false; return async () => done ? { done: true } : (done = true, { done: false, value: bytes }) })() }) } }
}

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function controller(options = {}) {
  const storage = options.storage || memoryStorage(options.model)
  const sent = []
  const instance = new ChatHostedAgentController({
    storage,
    gatewayReady: options.gatewayReady || (() => true),
    fetchImpl: options.fetchImpl || (async () => streamResponse('continue')),
    sendGateway: options.sendGateway || (async (sessionKey, text) => { sent.push({ sessionKey, text }); return {} }),
    readPanelConfig: options.readPanelConfig,
    requestTimeoutMs: options.requestTimeoutMs || 1000,
  })
  instance.activateSession('agent:alpha:one', 'alpha')
  return { instance, storage, sent }
}

async function start(instance, overrides = {}) {
  return instance.start({ prompt: 'goal', maxSteps: 5, stepDelayMs: 0, retryLimit: 0, timerOn: false, ...overrides })
}

async function until(predicate, timeout = 500) {
  const deadline = Date.now() + timeout
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('condition timed out')
    await tick(2)
  }
}

test('switching sessions cancels the old generation and persists only to its frozen owner', async () => {
  const pending = deferred()
  const { instance, storage } = controller({ fetchImpl: () => pending.promise })
  await start(instance)
  instance.activateSession('agent:beta:two', 'beta')
  pending.resolve(streamResponse('old result'))
  await tick()
  const sessions = storage.dump('星枢OpenClaw-hosted-agent-sessions')
  assert.equal(Boolean(sessions['agent:beta:two']?.history?.some(x => x.content === 'old result')), false)
  assert.equal(instance.owner.sessionKey, 'agent:beta:two')
  assert.equal(instance.requests.size, 0)
})

test('stop and restart ignore late success and old finally cannot clear new request', async () => {
  const old = deferred(), fresh = deferred()
  let call = 0
  const { instance } = controller({ fetchImpl: () => (++call === 1 ? old.promise : fresh.promise) })
  await start(instance)
  instance.stop({ silent: true })
  await start(instance)
  assert.equal(instance.requests.size, 1)
  old.resolve(streamResponse('old result'))
  await tick()
  assert.equal(instance.requests.size, 1)
  fresh.resolve(streamResponse('fresh result'))
  await until(() => instance.runtime.status === 'waiting_reply')
  assert.equal(instance.config.history.some(x => x.content === 'old result'), false)
  assert.equal(instance.config.history.some(x => x.content === 'fresh result'), true)
})

test('an old request timeout cannot abort a restarted request', async () => {
  const old = deferred(), fresh = deferred()
  const signals = []
  let call = 0
  const { instance } = controller({
    requestTimeoutMs: 40,
    fetchImpl: (_url, init) => { signals.push(init.signal); return ++call === 1 ? old.promise : fresh.promise },
  })
  await start(instance)
  await tick(25)
  instance.stop({ silent: true })
  await start(instance)
  await tick(20)
  assert.equal(signals[1].aborted, false)
  fresh.resolve(streamResponse('fresh'))
  old.resolve(streamResponse('old'))
  await until(() => instance.runtime.status === 'waiting_reply')
})

test('stop resolves a pending step delay and prevents the model call', async () => {
  let fetches = 0
  const { instance } = controller({ fetchImpl: async () => { fetches += 1; return streamResponse('no') } })
  await start(instance, { stepDelayMs: 10000 })
  assert.equal(instance.delays.size, 1)
  instance.stop({ silent: true })
  await tick()
  assert.equal(instance.delays.size, 0)
  assert.equal(instance.timers.size, 0)
  assert.equal(fetches, 0)
})

test('preflight failures never enter running or persist enabled', async () => {
  const { instance } = controller({ gatewayReady: () => false })
  assert.equal(await start(instance), false)
  assert.equal(instance.runtime.status, 'idle')
  assert.equal(instance.config.enabled, false)
})

test('retryLimit means the first attempt plus N retries', async () => {
  let attempts = 0
  const { instance } = controller({ fetchImpl: async () => { attempts += 1; throw new Error('fail') } })
  await start(instance, { retryLimit: 2 })
  await until(() => instance.runtime.status === 'error')
  assert.equal(attempts, 3)
  assert.equal(instance.runtime.errorCount, 3)
  assert.equal(instance.config.enabled, false)
})

test('abort is not recorded as a failure and does not retry', async () => {
  let attempts = 0
  const { instance } = controller({
    fetchImpl: (_url, init) => new Promise((resolve, reject) => {
      attempts += 1
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
    }),
  })
  await start(instance, { retryLimit: 3 })
  instance.stop({ silent: true })
  await tick()
  assert.equal(attempts, 1)
  assert.equal(instance.runtime.errorCount, 0)
})

test('request timeout follows retry and terminal error semantics instead of hanging pending', async () => {
  let attempts = 0
  const { instance } = controller({
    requestTimeoutMs: 10,
    fetchImpl: (_url, init) => new Promise((resolve, reject) => {
      attempts += 1
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
    }),
  })
  await start(instance, { retryLimit: 1 })
  await until(() => instance.runtime.status === 'error')
  assert.equal(attempts, 2)
  assert.equal(instance.runtime.pending, false)
  assert.equal(instance.config.enabled, false)
  assert.match(instance.runtime.lastError, /timed out/i)
})

test('the final SSE frame is parsed even without a trailing newline', async () => {
  const { instance } = controller({ fetchImpl: async () => streamResponseWithoutTrailingNewline('tail') })
  await start(instance)
  await until(() => instance.runtime.status === 'waiting_reply')
  assert.equal(instance.config.history.some(x => x.content === 'tail'), true)
})

test('max steps and model stop perform a complete stop', async t => {
  await t.test('max steps', async () => {
    const { instance, sent } = controller({ fetchImpl: async () => streamResponse('continue') })
    await start(instance, { maxSteps: 1, autoStopMinutes: 1, timerOn: true })
    await until(() => instance.config.enabled === false)
    assert.equal(instance.runtime.status, 'idle')
    assert.equal(instance.timers.size, 0)
    assert.equal(sent.length, 0)
  })
  await t.test('model stop', async () => {
    const { instance, sent } = controller({ fetchImpl: async () => streamResponse('done') })
    await start(instance)
    await until(() => instance.config.enabled === false)
    assert.equal(instance.runtime.status, 'idle')
    assert.equal(instance.requests.size, 0)
    assert.equal(sent.length, 0)
  })
})

test('native Anthropic and Google transports fail fast before running', async () => {
  for (const apiType of ['anthropic-messages', 'google-generative-ai']) {
    const { instance } = controller({ model: { apiType } })
    assert.equal(await start(instance), false)
    assert.equal(instance.runtime.status, 'idle')
    assert.equal(instance.config.enabled, false)
  }
  assert.equal(normalizeHostedTransport('ollama'), 'ollama')
})

test('targets require the frozen session and bind to a returned runId when available', async () => {
  const { instance } = controller({ sendGateway: async () => ({ runId: 'run-owned' }) })
  await start(instance)
  await until(() => instance.runtime.status === 'waiting_reply' && instance.expectedRunId === 'run-owned')
  assert.equal(instance.acceptTarget({ sessionKey: 'agent:beta:two', runId: 'run-owned' }, 'wrong session'), false)
  assert.equal(instance.acceptTarget({ sessionKey: 'agent:alpha:one', runId: 'run-wrong' }, 'wrong run'), false)
  assert.equal(instance.acceptTarget({ sessionKey: 'agent:alpha:one', runId: 'run-owned' }, 'target reply'), true)
})

test('destroy prevents a late panel config read from reviving state', async () => {
  const read = deferred()
  const { instance } = controller({ readPanelConfig: () => read.promise })
  const loading = instance.initialize()
  instance.destroy()
  read.resolve({ hostedAgent: { default: { maxSteps: 99 } } })
  assert.equal(await loading, false)
  assert.equal(instance.defaults, null)
  assert.equal(instance.owner, null)
  assert.equal(instance.timers.size, 0)
})

test('chat page keeps only the hosted controller integration surface', async () => {
  const source = await readFile(new URL('../src/pages/chat.js', import.meta.url), 'utf8')
  assert.match(source, /new ChatHostedAgentController\(/)
  assert.match(source, /_hostedController\?\.activateSession\(/)
  assert.match(source, /_hostedController\?\.acceptTarget\(\{ \.\.\.payload, sessionKey: eventSessionKey, runId \}/)
  assert.match(source, /_hostedController\?\.destroy\(\)/)
  assert.doesNotMatch(source, /function (?:startHostedAgent|runHostedAgentStep|callHostedAI|shouldCaptureHostedTarget)\(/)
})
