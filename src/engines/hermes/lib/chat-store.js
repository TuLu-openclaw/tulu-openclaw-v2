/**
 * Hermes Chat Store — reactive state for sessions, messages and streaming.
 *
 * Mirrors the shape of `hermes-web-ui`'s Pinia `chat` store in a dependency-
 * free, vanilla JS pub/sub style. A single instance is exported (`chatStore`);
 * the page subscribes via `chatStore.subscribe(listener)` and receives a
 * notification on every mutation.
 *
 * Responsibilities:
 *   - Load sessions from the backend (via `api.hermesSessionsList`) and merge
 *     with local-only sessions that haven't been flushed yet.
 *   - Load + map a session's messages (role/content/tool details).
 *   - Handle streaming via Tauri's `hermes-run-*` events, accumulating delta
 *     text into an assistant message and tracking live tool calls.
 *   - Persist session summaries + per-session messages to `localStorage` so
 *     reopening the page renders instantly while server data revalidates.
 *   - Manage pinned sessions + collapsed groups (UI prefs).
 *
 * Non-responsibilities (left for the page):
 *   - Rendering (the store never touches the DOM).
 *   - File attachment uploads (kept out of scope for Phase 4).
 *   - Full tmux-like run resume (Tauri events are in-process and reliable).
 */
import { api } from '../../../lib/tauri-api.js'

// ---------- constants ----------

const STORAGE_PROFILE = 'hermes_chat_profile_v1'
const STORAGE_SESSIONS_PREFIX = 'hermes_chat_sessions_v2_'
const STORAGE_ACTIVE_PREFIX = 'hermes_chat_active_v2_'
const STORAGE_PINNED_PREFIX = 'hermes_chat_pinned_'
const STORAGE_COLLAPSED_PREFIX = 'hermes_chat_collapsed_groups_'
const STORAGE_MSGS_PREFIX = 'hermes_chat_msgs_v2_'
const LIVE_BADGE_WINDOW_MS = 5 * 60 * 1000  // 5 min

const SOURCE_LABELS = {
  telegram: 'Telegram',
  api_server: 'API Server',
  cli: 'CLI',
  discord: 'Discord',
  slack: 'Slack',
  matrix: 'Matrix',
  whatsapp: 'WhatsApp',
  signal: 'Signal',
  email: 'Email',
  sms: 'SMS',
  dingtalk: 'DingTalk',
  feishu: 'Feishu',
  wecom: 'WeCom',
  weixin: 'WeChat',
  bluebubbles: 'iMessage',
  mattermost: 'Mattermost',
  cron: 'Cron',
}

export function getSourceLabel(source) {
  if (!source) return ''
  return SOURCE_LABELS[source] || source
}

// ---------- helpers ----------

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function safeGet(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, value) } catch {}
}
function safeRemove(key) {
  try { localStorage.removeItem(key) } catch {}
}

function loadJson(key) {
  try {
    const raw = safeGet(key)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
function saveJson(key, value) {
  try { safeSet(key, JSON.stringify(value)) } catch {}
}

function profileKey(profile) {
  return encodeURIComponent(profile || 'default')
}

function parseEpochMs(value) {
  if (typeof value === 'number') {
    // Seconds vs milliseconds heuristic.
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value)
  }
  if (typeof value === 'string' && value.trim()) {
    const t = Date.parse(value)
    return Number.isFinite(t) ? t : 0
  }
  return 0
}

// ---------- message mapping ----------

/**
 * Convert Hermes CLI-exported messages (mixed roles + tool_calls) into the
 * flat display list we render. Matches `hermes-web-ui`'s `mapHermesMessages`.
 */
function mapHermesMessages(msgs) {
  if (!Array.isArray(msgs)) return []

  const toolNameMap = new Map()
  const toolArgsMap = new Map()
  for (const m of msgs) {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        if (tc.id) {
          if (tc.function?.name) toolNameMap.set(tc.id, tc.function.name)
          if (tc.function?.arguments) toolArgsMap.set(tc.id, tc.function.arguments)
        }
      }
    }
  }

  const out = []
  for (const m of msgs) {
    const ts = parseEpochMs(m.timestamp || m.created_at)

    // Assistant message whose only payload is tool_calls — emit placeholder
    // tool messages, the actual tool responses will fill them in.
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length && !(m.content || '').trim()) {
      for (const tc of m.tool_calls) {
        out.push({
          id: String(m.id) + '_' + tc.id,
          role: 'tool',
          content: '',
          timestamp: ts,
          toolName: tc.function?.name || 'tool',
          toolArgs: tc.function?.arguments || undefined,
          toolStatus: 'done',
        })
      }
      continue
    }

    if (m.role === 'tool') {
      const tcId = m.tool_call_id || ''
      const toolName = m.tool_name || toolNameMap.get(tcId) || 'tool'
      const toolArgs = toolArgsMap.get(tcId) || undefined
      let preview = ''
      if (m.content) {
        try {
          const parsed = JSON.parse(m.content)
          preview = parsed.url || parsed.title || parsed.preview || parsed.summary || ''
        } catch {
          preview = String(m.content).slice(0, 80)
        }
      }
      const phIdx = out.findIndex(x => x.role === 'tool' && x.toolName === toolName && !x.toolResult && x.id.includes('_' + tcId))
      if (phIdx !== -1) out.splice(phIdx, 1)
      out.push({
        id: String(m.id),
        role: 'tool',
        content: '',
        timestamp: ts,
        toolName,
        toolArgs,
        toolPreview: typeof preview === 'string' ? (preview.slice(0, 100) || undefined) : undefined,
        toolResult: m.content || undefined,
        toolStatus: 'done',
      })
      continue
    }

    // Plain user/assistant/system message.
    out.push({
      id: String(m.id || uid()),
      role: m.role || 'assistant',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content || ''),
      timestamp: ts,
    })
  }
  return out
}

/** Convert a backend session summary into the store's canonical shape. */
function mapSessionSummary(s) {
  return {
    id: s.id || s.session_id || '',
    title: s.title || '',
    source: s.source || '',
    model: s.model || '',
    messageCount: s.message_count || 0,
    createdAt: parseEpochMs(s.created_at || s.started_at),
    updatedAt: parseEpochMs(s.updated_at || s.last_active || s.ended_at || s.created_at || s.started_at),
    endedAt: s.ended_at != null ? parseEpochMs(s.ended_at) : null,
    lastActiveAt: s.last_active != null ? parseEpochMs(s.last_active) : undefined,
    // Usage analytics — surfaced from `hermes sessions export` JSONL
    // (Rust command at hermes.rs::hermes_sessions_list). Match the Hermes
    // CLI naming so other consumers (Usage page) can reuse the same fields.
    inputTokens: Number(s.input_tokens || 0),
    outputTokens: Number(s.output_tokens || 0),
    cacheReadTokens: Number(s.cache_read_tokens || 0),
    cacheWriteTokens: Number(s.cache_write_tokens || 0),
    estimatedCostUsd: typeof s.estimated_cost_usd === 'number' ? s.estimated_cost_usd : null,
    messages: [],
  }
}

// ---------- Tauri event bridge ----------

let _listenFn = null
async function tauriListen(event, cb) {
  if (!_listenFn) {
    const mod = await import('@tauri-apps/api/event')
    _listenFn = mod.listen
  }
  return _listenFn(event, cb)
}

// ---------- store implementation ----------

function createStore() {
  // --- state ---
  const state = {
    sessions: [],
    activeSessionId: null,
    loading: false,
    loadingMessages: false,
    streaming: false,
    runningSessionId: null,
    pendingAssistantId: null,  // id of the currently streaming assistant message
    error: null,
    profiles: [],
    activeProfile: safeGet(STORAGE_PROFILE) || 'default',
    loadingProfiles: false,

    // Live tool calls for the current run (shown in the streaming indicator).
    liveTools: [],             // [{ id, name, status, preview, args, result }]

    // UI prefs (persisted).
    pinned: new Set(loadJson(STORAGE_PINNED_PREFIX + profileKey(safeGet(STORAGE_PROFILE) || 'default')) || []),
    collapsed: new Set(loadJson(STORAGE_COLLAPSED_PREFIX + profileKey(safeGet(STORAGE_PROFILE) || 'default')) || []),
  }

  // --- subscription ---
  //
  // Uses rAF-batched notify so a burst of mutations (e.g. streaming delta +
  // tool events) produces a single redraw per frame instead of one per event.
  // This avoids the visual stutter + scroll jitter seen in Phase 4.
  const listeners = new Set()
  let scheduled = false
  function subscribe(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }
  function flushNotify() {
    scheduled = false
    for (const fn of listeners) {
      try { fn(state) } catch (e) { console.error('chatStore listener error:', e) }
    }
  }
  function notify() {
    if (scheduled) return
    scheduled = true
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(flushNotify)
    } else {
      setTimeout(flushNotify, 0)
    }
  }
  /** Force an immediate, unbatched notification (used by deterministic tests). */
  function notifySync() {
    scheduled = false
    flushNotify()
  }

  // --- persistence ---
  const sessionsKey = () => STORAGE_SESSIONS_PREFIX + profileKey(state.activeProfile)
  const activeKey = () => STORAGE_ACTIVE_PREFIX + profileKey(state.activeProfile)
  const pinnedKey = () => STORAGE_PINNED_PREFIX + profileKey(state.activeProfile)
  const collapsedKey = () => STORAGE_COLLAPSED_PREFIX + profileKey(state.activeProfile)
  const messagesKey = (sid) => STORAGE_MSGS_PREFIX + profileKey(state.activeProfile) + '_' + sid

  function persistSessions() {
    saveJson(sessionsKey(), state.sessions.map(s => ({ ...s, messages: [] })))
  }
  function persistActiveMessages() {
    persistSessionMessages(state.activeSessionId)
  }
  function persistSessionMessages(sessionId) {
    const sid = sessionId
    if (!sid) return
    const s = state.sessions.find(x => x.id === sid)
    if (s) saveJson(messagesKey(sid), s.messages)
  }
  function loadSessionsCache() {
    const cached = loadJson(sessionsKey())
    if (Array.isArray(cached) && cached.length) {
      state.sessions = cached
      const savedActive = safeGet(activeKey())
      const target = savedActive && cached.find(s => s.id === savedActive)
      if (target) {
        const msgs = loadJson(messagesKey(target.id))
        if (Array.isArray(msgs)) target.messages = msgs
        state.activeSessionId = target.id
      }
    }
  }

  function loadProfilePrefs() {
    state.pinned = new Set(loadJson(pinnedKey()) || [])
    state.collapsed = new Set(loadJson(collapsedKey()) || [])
  }

  function savePinned() { saveJson(pinnedKey(), [...state.pinned]) }
  function saveCollapsed() { saveJson(collapsedKey(), [...state.collapsed]) }

  // --- derived queries ---
  function activeSession() {
    return state.sessions.find(s => s.id === state.activeSessionId) || null
  }

  function isSessionLive(sessionId) {
    if (state.streaming && sessionId === state.runningSessionId) return true
    const s = state.sessions.find(x => x.id === sessionId)
    if (!s?.lastActiveAt || s.endedAt != null) return false
    return Date.now() - s.lastActiveAt <= LIVE_BADGE_WINDOW_MS
  }

  /** Group sessions by source. Pinned ones go in a separate bucket. */
  function groupedSessions() {
    const pinnedList = state.sessions
      .filter(s => state.pinned.has(s.id))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))

    const bySource = new Map()
    for (const s of state.sessions) {
      if (state.pinned.has(s.id)) continue
      const key = s.source || ''
      if (!bySource.has(key)) bySource.set(key, [])
      bySource.get(key).push(s)
    }

    const sortKey = (src) => {
      if (src === 'api_server') return -1
      if (src === '') return 0
      if (src === 'cron') return 999
      return 1
    }

    const keys = [...bySource.keys()].sort((a, b) => {
      const ka = sortKey(a)
      const kb = sortKey(b)
      if (ka !== kb) return ka - kb
      return String(a).localeCompare(String(b))
    })

    return { pinned: pinnedList, sources: keys.map(src => ({ source: src, label: getSourceLabel(src), sessions: bySource.get(src) })) }
  }

  // ---------- streaming lifecycle ----------

  let _unlistenDelta = null
  let _unlistenTool = null
  let _unlistenDone = null
  let _unlistenError = null

  async function attachStreamListeners() {
    await detachStreamListeners()
    _unlistenDelta = await tauriListen('hermes-run-delta', ev => {
      if (!state.pendingAssistantId) return
      const s = state.sessions.find(x => x.id === state.runningSessionId)
      if (!s) return
      const msg = s.messages.find(m => m.id === state.pendingAssistantId)
      if (msg) {
        msg.content = (msg.content || '') + (ev.payload?.text || '')
        persistActiveMessages()
        notify()
      }
    })
    _unlistenTool = await tauriListen('hermes-run-tool', ev => {
      const s = state.sessions.find(x => x.id === state.runningSessionId)
      if (!s) return
      const tool = ev.payload
      if (!tool) return
      // Accumulate live tools for the streaming indicator.
      const existing = state.liveTools.find(x => x.id === tool.id)
      if (existing) {
        if (tool.result != null) existing.result = tool.result
        if (tool.status) existing.status = tool.status
      } else {
        state.liveTools.push({ id: tool.id, name: tool.name || 'tool', status: tool.status || 'running', preview: tool.preview || '', args: tool.arguments || '', result: tool.result || '' })
      }
      // If the tool has a result, patch it into the matching tool message.
      if (tool.result != null && tool.id) {
        const msg = s.messages.find(m => m.role === 'tool' && m.id === tool.id)
        if (msg) {
          msg.toolResult = tool.result
          msg.toolStatus = 'done'
        }
        persistActiveMessages()
      }
      notify()
    })
    _unlistenDone = await tauriListen('hermes-run-done', ev => {
      if (!state.runningSessionId) return
      const s = state.sessions.find(x => x.id === state.runningSessionId)
      if (!s) return
      if (state.pendingAssistantId) {
        const msg = s.messages.find(m => m.id === state.pendingAssistantId)
        if (msg) {
          if (ev.payload?.finish_reason) msg.finishReason = ev.payload.finish_reason
          if (ev.payload?.usage) msg.usage = ev.payload.usage
        }
      }
      cleanupAfterRun()
    })
    _unlistenError = await tauriListen('hermes-run-error', ev => {
      if (!state.runningSessionId) return
      const s = state.sessions.find(x => x.id === state.runningSessionId)
      if (!s) return
      s.messages.push({
        id: uid(),
        role: 'assistant',
        content: `⚠️ ${ev.payload?.error || 'Run failed'}`,
        timestamp: Date.now(),
      })
      persistActiveMessages()
      cleanupAfterRun()
    })
  }

  function cleanupAfterRun() {
    state.streaming = false
    state.runningSessionId = null
    state.pendingAssistantId = null
    state.liveTools = []
    persistSessions()
    notify()
  }

  async function detachStreamListeners() {
    const cleanup = [
      _unlistenDelta && tryCall(_unlistenDelta),
      _unlistenTool && tryCall(_unlistenTool),
      _unlistenDone && tryCall(_unlistenDone),
      _unlistenError && tryCall(_unlistenError),
    ]
    _unlistenDelta = null
    _unlistenTool = null
    _unlistenDone = null
    _unlistenError = null
    await Promise.allSettled(cleanup)
  }

  function tryCall(fn) {
    try { return fn() } catch { return Promise.resolve() }
  }

  // ---------- actions ----------

  async function loadSessions() {
    state.loading = true
    state.error = null
    notify()
    try {
      const raw = await api.hermesSessionsList(null, null, state.activeProfile)
      const summaries = (raw || []).map(mapSessionSummary)
      // Merge: keep local-only sessions (those that aren't in the backend list).
      const backendIds = new Set(summaries.map(s => s.id))
      const localOnly = state.sessions.filter(s => !s.id || !backendIds.has(s.id))
      state.sessions = [...summaries, ...localOnly]
      state.sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      persistSessions()
    } catch (e) {
      state.error = e?.message || String(e)
    } finally {
      state.loading = false
      notify()
    }
  }

  async function refreshActiveMessages() {
    const s = activeSession()
    if (!s) return
    state.loadingMessages = true
    notify()
    try {
      const detail = await api.hermesSessionDetail(s.id, state.activeProfile)
      if (detail?.messages) {
        s.messages = mapHermesMessages(detail.messages)
        s.title = detail.title || s.title
        s.model = detail.model || s.model
        persistSessionMessages(s.id)
        persistSessions()
      }
    } catch (e) {
      console.error('[chatStore] refreshActiveMessages failed:', e)
    } finally {
      state.loadingMessages = false
      notify()
    }
  }

  async function switchSession(sessionId) {
    flushSave()
    state.activeSessionId = sessionId
    safeSet(activeKey(), sessionId)
    await refreshActiveMessages()
    notify()
  }

  async function newChat() {
    flushSave()
    const s = {
      id: uid(),
      title: '',
      source: 'api_server',
      model: '',
      messageCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      endedAt: null,
      lastActiveAt: null,
      messages: [],
    }
    state.sessions.unshift(s)
    state.activeSessionId = s.id
    safeSet(activeKey(), s.id)
    persistSessions()
    notify()
    return s
  }

  async function deleteSession(sessionId) {
    const idx = state.sessions.findIndex(s => s.id === sessionId)
    if (idx === -1) return
    state.sessions.splice(idx, 1)
    state.pinned.delete(sessionId)
    savePinned()
    safeRemove(messagesKey(sessionId))
    if (state.activeSessionId === sessionId) {
      state.activeSessionId = state.sessions[0]?.id || null
      safeSet(activeKey(), state.activeSessionId || '')
    }
    try { await api.hermesSessionDelete(sessionId, state.activeProfile) } catch {}
    persistSessions()
    notify()
  }

  async function bulkDeleteSessions(sessionIds) {
    for (const id of sessionIds) {
      const idx = state.sessions.findIndex(s => s.id === id)
      if (idx !== -1) state.sessions.splice(idx, 1)
      state.pinned.delete(id)
      safeRemove(messagesKey(id))
      try { await api.hermesSessionDelete(id, state.activeProfile) } catch {}
    }
    savePinned()
    if (sessionIds.includes(state.activeSessionId)) {
      state.activeSessionId = state.sessions[0]?.id || null
      safeSet(activeKey(), state.activeSessionId || '')
    }
    persistSessions()
    notify()
  }

  async function renameSession(sessionId, title) {
    const s = state.sessions.find(x => x.id === sessionId)
    if (!s) return
    s.title = title
    try { await api.hermesSessionRename(sessionId, title, state.activeProfile) } catch {}
    persistSessions()
    notify()
  }

  function togglePinned(sessionId) {
    if (state.pinned.has(sessionId)) {
      state.pinned.delete(sessionId)
    } else {
      state.pinned.add(sessionId)
    }
    savePinned()
    notify()
  }

  function toggleCollapsed(source) {
    if (state.collapsed.has(source)) {
      state.collapsed.delete(source)
    } else {
      state.collapsed.add(source)
    }
    saveCollapsed()
    notify()
  }

  function updateSessionTitleFromFirstUser(s) {
    if (s.title) return
    const first = s.messages.find(m => m.role === 'user')
    if (!first) return
    const text = first.content.replace(/\n+/g, ' ').trim()
    s.title = text.slice(0, 60) || 'New Chat'
  }

  async function sendMessage(content, images = []) {
    const s = activeSession()
    if (!s) return
    if (state.streaming) return

    // Append user message.
    s.messages.push({ id: uid(), role: 'user', content, timestamp: Date.now(), images: [...images] })
    updateSessionTitleFromFirstUser(s)
    s.updatedAt = Date.now()
    s.lastActiveAt = Date.now()
    persistActiveMessages()
    persistSessions()
    notify()

    // Start streaming.
    state.streaming = true
    state.runningSessionId = s.id
    state.liveTools = []

    // The pending assistant message — content starts empty.
    const pendingId = uid()
    state.pendingAssistantId = pendingId
    s.messages.push({ id: pendingId, role: 'assistant', content: '', timestamp: Date.now() })
    persistActiveMessages()
    notify()

    await attachStreamListeners()

    try {
      await api.hermesAgentRun(content, s.id, s.messages.slice(0, -1), null)
      // The Rust side emits events; cleanup happens on hermes-run-done/error.
    } catch (e) {
      s.messages.push({
        id: uid(),
        role: 'assistant',
        content: `⚠️ ${e?.message || e}`,
        timestamp: Date.now(),
      })
      persistSessionMessages(s.id)
      cleanupAfterRun()
    }
  }

  function stopStreaming() {
    // Hermes CLI doesn't have a native stop; signal via a sentinel.
    cleanupAfterRun()
  }

  /** Utility: push an inline assistant message (used by /slash local replies). */
  function pushLocalAssistant(content) {
    const s = activeSession()
    if (!s) return
    s.messages.push({ id: uid(), role: 'assistant', content, timestamp: Date.now() })
    updateSessionTitleFromFirstUser(s)
    s.updatedAt = Date.now()
    persistActiveMessages()
    persistSessions()
    notify()
  }

  function pushLocalUser(content) {
    const s = activeSession()
    if (!s) return
    s.messages.push({ id: uid(), role: 'user', content, timestamp: Date.now() })
    updateSessionTitleFromFirstUser(s)
    s.updatedAt = Date.now()
    persistActiveMessages()
    persistSessions()
    notify()
  }

  function clearActive() {
    const s = activeSession()
    if (!s) return
    s.messages = []
    s.title = ''
    persistActiveMessages()
    persistSessions()
    notify()
  }

  /**
   * Fuzzy search across loaded sessions. Returns up to `limit` hits sorted
   * by match strength. We only search in-memory data (title + cached first
   * user message) — no network round-trip — so this is instant even with
   * hundreds of sessions.
   */
  function searchSessions(query, limit = 20) {
    const q = (query || '').trim()
    if (!q) return []
    const hits = []
    for (const s of state.sessions) {
      const m = fuzzyMatchSession(s, q)
      if (m) hits.push({ session: s, score: m.score, snippet: m.snippet })
    }
    hits.sort((a, b) => b.score - a.score || (b.session.updatedAt || 0) - (a.session.updatedAt || 0))
    return hits.slice(0, limit)
  }

  // ---------- bootstrap ----------

  loadSessionsCache()

  return {
    // readonly state access
    get state() { return state },
    activeSession,
    isSessionLive,
    groupedSessions,
    subscribe,

    // actions
    loadSessions,
    refreshActiveMessages,
    switchSession,
    newChat,
    deleteSession,
    bulkDeleteSessions,
    renameSession,
    togglePinned,
    toggleCollapsed,
    sendMessage,
    stopStreaming,
    pushLocalAssistant,
    pushLocalUser,
    clearActive,
    searchSessions,

    // lifecycle
    detachStreamListeners,
    notifySync,
  }
}

/**
 * Fuzzy score a single session against `query`. Used by `store.searchSessions`.
 * Returns `null` when nothing matches, or `{ score, snippet }` otherwise.
 *
 * Scoring weights:
 *   - title substring hit  → +20 (strongest)
 *   - first-user content   → +10 (with highlight window snippet)
 *   - id prefix            → +5
 *   - model name           → +3
 */
function fuzzyMatchSession(session, query) {
  const q = query.toLowerCase()
  const title = (session.title || '').toLowerCase()
  const model = (session.model || '').toLowerCase()
  const id = session.id.toLowerCase()
  const firstUser = (session.messages || []).find(m => m.role === 'user')?.content || ''
  const preview = firstUser.slice(0, 240).toLowerCase()

  let score = 0
  let snippet = ''
  if (title.includes(q)) { score += 20; snippet = session.title }
  if (preview.includes(q)) {
    const idx = preview.indexOf(q)
    const start = Math.max(0, idx - 20)
    const end = Math.min(preview.length, idx + q.length + 40)
    const raw = firstUser.slice(start, end)
    if (!snippet) snippet = (start > 0 ? '…' : '') + raw + (end < firstUser.length ? '…' : '')
    score += 10
  }
  if (model.includes(q)) score += 3
  if (id.startsWith(q)) score += 5
  return score > 0 ? { score, snippet: snippet || session.title || '(untitled)' } : null
}

// Single-instance singleton (same shape as Pinia).
let _store = null
export function getChatStore() {
  if (!_store) _store = createStore()
  return _store
}
