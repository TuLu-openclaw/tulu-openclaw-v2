/**
 * 聊天页面 - 完整版，对接 OpenClaw Gateway
 * 支持：流式响应、Markdown 渲染、会话管理、Agent 选择、快捷指令
 */
import { api, invalidate, isTauriRuntime } from '../lib/tauri-api.js'
import { navigate } from '../router.js'
import { wsClient, uuid } from '../lib/ws-client.js'
import { renderMarkdown } from '../lib/markdown.js'
import { saveMessage, saveMessages, getLocalMessages, clearSessionMessages, isStorageAvailable } from '../lib/message-db.js'
import { toast } from '../components/toast.js'
import { showModal, showConfirm, showContentModal } from '../components/modal.js'
import { icon as svgIcon } from '../lib/icons.js'
import { t } from '../lib/i18n.js'

const RENDER_THROTTLE = 30
const STREAM_IDLE_NOTICE_MS = 90000
const STORAGE_SESSION_KEY = '星枢OpenClaw-last-session'
const STORAGE_MODEL_KEY = '星枢OpenClaw-chat-selected-model'
const STORAGE_SIDEBAR_KEY = '星枢OpenClaw-chat-sidebar-open'
const STORAGE_SESSION_NAMES_KEY = '星枢OpenClaw-chat-session-names'
const STORAGE_WORKSPACE_PANEL_KEY = '星枢OpenClaw-chat-workspace-open'
const GROUP_SESSIONS_KEY = '星枢OpenClaw-group-sessions-v1'
const ACTIVE_GROUP_KEY = '星枢OpenClaw-active-group-v1'
const GROUP_SESSION_CHANNEL_PREFIX = 'group-'
const TASK_BOARD_KEY = '星枢OpenClaw-task-board-v1'
const TASK_CONTEXT_KEY = '星枢OpenClaw-task-context-v1'

const COMMANDS = [
  { title: 'chat.cmdSession', commands: [
    { cmd: '/new', desc: 'chat.cmdNewSession', action: 'exec' },
    { cmd: '/reset', desc: 'chat.cmdResetSession', action: 'exec' },
    { cmd: '/stop', desc: 'chat.cmdStopGen', action: 'exec' },
  ]},
  { title: 'chat.cmdModel', commands: [
    { cmd: '/model ', desc: 'chat.cmdSwitchModel', action: 'fill' },
    { cmd: '/model list', desc: 'chat.cmdListModels', action: 'exec' },
    { cmd: '/model status', desc: 'chat.cmdModelStatus', action: 'exec' },
  ]},
  { title: 'chat.cmdThinkMode', commands: [
    { cmd: '/think off', desc: 'chat.cmdThinkOff', action: 'exec' },
    { cmd: '/think low', desc: 'chat.cmdThinkLow', action: 'exec' },
    { cmd: '/think medium', desc: 'chat.cmdThinkMedium', action: 'exec' },
    { cmd: '/think high', desc: 'chat.cmdThinkHigh', action: 'exec' },
  ]},
  { title: 'chat.cmdFastMode', commands: [
    { cmd: '/fast', desc: 'chat.cmdFastToggle', action: 'exec' },
    { cmd: '/fast on', desc: 'chat.cmdFastOn', action: 'exec' },
    { cmd: '/fast off', desc: 'chat.cmdFastOff', action: 'exec' },
  ]},
  { title: 'chat.cmdVerbose', commands: [
    { cmd: '/verbose off', desc: 'chat.cmdVerboseOff', action: 'exec' },
    { cmd: '/verbose low', desc: 'chat.cmdVerboseLow', action: 'exec' },
    { cmd: '/verbose high', desc: 'chat.cmdVerboseHigh', action: 'exec' },
    { cmd: '/reasoning off', desc: 'chat.cmdReasoningOff', action: 'exec' },
    { cmd: '/reasoning low', desc: 'chat.cmdReasoningLow', action: 'exec' },
    { cmd: '/reasoning medium', desc: 'chat.cmdReasoningMedium', action: 'exec' },
    { cmd: '/reasoning high', desc: 'chat.cmdReasoningHigh', action: 'exec' },
  ]},
  { title: 'chat.cmdInfo', commands: [
    { cmd: '/help', desc: 'chat.cmdHelp', action: 'exec' },
    { cmd: '/status', desc: 'chat.cmdStatus', action: 'exec' },
    { cmd: '/context', desc: 'chat.cmdContext', action: 'exec' },
    { cmd: '/miaogu', desc: 'chat.cmdMiaoguVerify', action: 'navigate' },
    { cmd: '/weiyan', desc: 'chat.cmdWeiyanVerify', action: 'navigate' },
  ]},
]

let _sessionKey = null, _lastDirectSessionKey = '', _page = null, _messagesEl = null, _textarea = null
let _sendBtn = null, _statusDot = null, _typingEl = null, _scrollBtn = null
let _replyStatusRowEl = null
let _replyStatusTextEl = null
let _replyStatusPhaseEl = null
let _replyStatusDetailEl = null
let _replyStatusMetaEl = null
let _replyStatusToolsEl = null
let _replyStatusElapsedEl = null
let _replyStatusTimer = null
const CHAT_REPLY_STATUS_ID = 'chat-reply-status'
const CHAT_REPLY_STATUS_STORE_PREFIX = '星枢Open_chat_reply_status_'
const CHAT_REPLY_STATUS_TEXT_KEYS = {
  queued: 'chat.replyStatusQueued',
  sending: 'chat.replyStatusSending',
  thinking: 'chat.replyStatusThinking',
  tool: 'chat.replyStatusTool',
  streaming: 'chat.replyStatusStreaming',
  finalizing: 'chat.replyStatusFinalizing',
  done: 'chat.replyStatusDone',
  waiting: 'chat.replyStatusWaiting',
  error: 'chat.replyStatusError',
  aborted: 'chat.replyStatusAborted',
}
const CHAT_REPLY_STATUS_PHASE_KEYS = {
  queued: 'chat.replyPhaseQueued',
  sending: 'chat.replyPhaseSending',
  thinking: 'chat.replyPhaseThinking',
  tool: 'chat.replyPhaseTool',
  streaming: 'chat.replyPhaseStreaming',
  finalizing: 'chat.replyPhaseFinalizing',
  done: 'chat.replyPhaseDone',
  waiting: 'chat.replyPhaseWaiting',
  error: 'chat.replyPhaseError',
  aborted: 'chat.replyPhaseAborted',
}
function replyStatusText(state) { return t(CHAT_REPLY_STATUS_TEXT_KEYS[state] || CHAT_REPLY_STATUS_TEXT_KEYS.waiting) }
function replyStatusPhase(state) { return t(CHAT_REPLY_STATUS_PHASE_KEYS[state] || CHAT_REPLY_STATUS_PHASE_KEYS.waiting) }
const CHAT_REPLY_STATUS_DEFAULT = { state: 'waiting', detail: '', ts: 0, sessionKey: '', runId: '', toolName: '', toolInput: '', toolCount: 0, lastToolAt: 0, activity: '' }
let _replyStatusState = { ...CHAT_REPLY_STATUS_DEFAULT }
let _sessionListEl = null, _sessionListNormalEl = null, _sessionListGroupsEl = null, _cmdPanelEl = null, _attachPreviewEl = null, _fileInputEl = null
let _mentionPanelEl = null
let _modelSelectEl = null
let _currentAiBubble = null, _currentAiText = '', _currentAiImages = [], _currentAiVideos = [], _currentAiAudios = [], _currentAiFiles = [], _currentAiTools = [], _currentRunId = null
let _lastStreamDeltaFingerprint = ''
let _isStreaming = false, _isSending = false, _messageQueue = [], _streamStartTime = 0
let _lastRenderTime = 0, _renderPending = false, _renderTimer = null, _lastHistoryHash = ''
let _autoScrollEnabled = true, _lastScrollTop = 0, _touchStartY = 0
let _isLoadingHistory = false
let _streamSafetyTimer = null, _unsubEvent = null, _unsubReady = null, _unsubStatus = null
let _seenRunIds = new Set()
let _pageActive = false
const _toolEventTimes = new Map()
const _toolEventData = new Map()
const _toolRunIndex = new Map()
const _toolEventSeen = new Set()
let _errorTimer = null, _lastErrorMsg = null
let _responseWatchdog = null, _postFinalCheck = null
let _attachments = []
let _hasEverConnected = false
let _availableModels = []
let _primaryModel = ''
let _defaultModelLabel = ''
let _selectedModel = ''
let _isApplyingModel = false
let _sessionModels = new Map()
let _sessionContextTokens = new Map()
let _sessionTokenTotals = new Map()
let _defaultContextTokens = 0
let _chatGroups = []
let _taskBoard = []
let _taskContexts = {}
let _currentGroupId = ''
let _groupTranscripts = new Map()
let _pendingTaskByRunId = new Map()
let _lastSentTaskId = ''
let _lastSessionList = []
let _isSessionMultiSelectMode = false
let _selectedSessionKeys = new Set()
const TASK_PROGRESS = { queued: 5, sending: 10, thinking: 25, streaming: 45, tool: 65, finalizing: 90, done: 100, error: 100, aborted: 100 }

const MODEL_CONFIG_CHANGED_EVENT = 'openclaw-config-changed'
let _modelConfigRefreshTimer = null
let _modelConfigChangeHandler = null

// ── 托管 Agent ──
const HOSTED_STATUS = { IDLE: 'idle', RUNNING: 'running', WAITING: 'waiting_reply', PAUSED: 'paused', ERROR: 'error' }
const HOSTED_SESSIONS_KEY = '星枢OpenClaw-hosted-agent-sessions'
const HOSTED_SYSTEM_PROMPT = `你是一个托管调度 Agent。你的职责是：根据用户设定的目标，持续引导 OpenClaw AI Agent 完成任务。
规则：
1. 你每一轮只输出一条简洁的指令（1-3 句话），发给 OpenClaw 执行
2. 根据 OpenClaw 的回复评估进展，决定下一步指令
3. 如果任务已完成或无法继续，回复包含"完成"或"停止"来结束循环
4. 不要重复相同的指令，不要输出解释性文字，只输出下一步要执行的指令`
const HOSTED_DEFAULTS = { enabled: false, prompt: '', autoRunAfterTarget: true, stopPolicy: 'self', maxSteps: 50, stepDelayMs: 1200, retryLimit: 2, autoStopMinutes: 0 }
const HOSTED_RUNTIME_DEFAULT = { status: HOSTED_STATUS.IDLE, stepCount: 0, lastRunAt: 0, lastRunId: '', lastError: '', pending: false, errorCount: 0 }
const HOSTED_CONTEXT_MAX = 30
const HOSTED_COMPRESS_THRESHOLD = 20
let _hostedBtn = null, _hostedPanelEl = null, _hostedBadgeEl = null
let _hostedPromptEl = null, _hostedMaxStepsEl = null, _hostedStepDelayEl = null, _hostedRetryLimitEl = null
let _hostedAutoStopEl = null
let _hostedSaveBtn = null, _hostedStopBtn = null, _hostedCloseBtn = null
let _hostedDefaults = null
let _hostedSessionConfig = null
let _hostedRuntime = { ...HOSTED_RUNTIME_DEFAULT }
let _hostedBusy = false
let _hostedAbort = null
let _hostedLastTargetTs = 0
let _hostedAutoStopTimer = null
let _hostedRetryTimer = null
let _hostedStartTime = 0
let _workspaceBtn = null, _workspacePanelEl = null, _workspaceAgentBadgeEl = null, _workspaceAgentTitleEl = null
let _workspacePathEl = null, _workspaceCoreListEl = null, _workspaceTreeEl = null, _workspaceCurrentFileEl = null
let _workspaceMetaEl = null, _workspaceEditorEl = null, _workspacePreviewEl = null, _workspaceEmptyEl = null
let _workspaceSaveBtn = null, _workspaceReloadBtn = null, _workspacePreviewBtn = null
let _workspaceInfo = null, _workspaceCoreFiles = [], _workspaceTreeCache = new Map(), _workspaceExpandedDirs = new Set()
let _workspaceCurrentAgentId = 'main', _workspaceCurrentFile = null, _workspacePreviewMode = false, _workspaceDirty = false
let _workspaceLoadedContent = '', _workspaceLoading = false
let _workspaceLoadSeq = 0, _workspaceOpenSeq = 0

export async function render() {
  const page = document.createElement('div')
  page.className = 'page chat-page'
  _pageActive = true
  _page = page

  page.innerHTML = `
    <div class="chat-sidebar" id="chat-sidebar">
      <div class="chat-sidebar-header">
        <span>${t('chat.sessionList')}</span>
        <div class="chat-sidebar-header-actions">
          <button class="chat-sidebar-btn" id="btn-toggle-sidebar" title="${t('chat.sessionList')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <button class="chat-sidebar-btn" id="btn-new-session" title="${t('chat.newSession')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        </div>
      </div>
      <div class="chat-session-list chat-session-sections" id="chat-session-list">
        <div class="chat-session-section">
          <div class="chat-session-section-title">
            <span>${t('chat.normalSessions')}</span>
            <button class="chat-session-section-btn" id="btn-session-multi-select" title="${t('chat.multiSelectSessions')}">${t('chat.multiSelect')}</button>
          </div>
          <div class="chat-session-multi-toolbar" id="chat-session-multi-toolbar" hidden>
            <span id="chat-session-selected-count">${t('chat.selectedSessionsCount', { count: 0 })}</span>
            <button class="chat-session-mini" id="btn-session-select-all">${t('chat.selectAll')}</button>
            <button class="chat-session-mini" id="btn-session-clear-selection">${t('chat.cancelSelectAll')}</button>
            <button class="chat-session-mini chat-session-mini-danger" id="btn-session-delete-selected" disabled>${t('chat.deleteSelected')}</button>
            <button class="chat-session-mini" id="btn-session-multi-cancel">${t('common.cancel')}</button>
          </div>
          <div class="chat-session-list-pane" id="chat-session-list-normal"></div>
        </div>
        <div class="chat-session-section chat-session-section-groups">
          <div class="chat-session-section-title">
            <span>${t('chat.groupSessions')}</span>
            <button class="chat-session-section-btn" id="btn-new-group" title="${t('chat.newGroupChat')}">${t('chat.newGroupChat')}</button>
          </div>
          <div class="chat-session-list-pane" id="chat-session-list-groups"></div>
        </div>
      </div>
    </div>
    <div class="chat-main">
      <div class="chat-header">
        <div class="chat-status">
          <button class="chat-toggle-sidebar" id="btn-toggle-sidebar-main" title="${t('chat.sessionList')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <span class="status-dot" id="chat-status-dot"></span>
          <div class="chat-title-block">
            <span class="chat-title" id="chat-title">${t('chat.chatTitle')}</span>
            <button class="btn-refresh-chat" id="btn-refresh-chat" title="${t('chat.refreshChat')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
            </button>
          </div>
        </div>
        <div class="chat-header-actions">
          <div class="chat-model-group">
            <select class="form-input" id="chat-model-select" style="width:200px;max-width:28vw;padding:6px 10px;font-size:var(--font-size-xs)">
              <option value="">${t('chat.loadingModels')}</option>
            </select>
            <button class="btn btn-sm btn-ghost" id="btn-refresh-models" title="${t('chat.refreshModels')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
            </button>
          </div>
          <button class="btn btn-sm btn-ghost chat-workspace-trigger" id="btn-chat-workspace" title="${t('chat.openWorkspace')}">
            ${svgIcon('folder', 16)}
            <span class="chat-workspace-trigger-label">${t('chat.workspace')}</span>
            <span class="chat-workspace-trigger-agent" id="chat-workspace-trigger-agent">main</span>
          </button>
          <button class="btn btn-sm btn-ghost" id="btn-task-board" title="${t('chat.taskBoardTitle')}">
            ${t('chat.taskBoard')}
          </button>
          <button class="btn btn-sm btn-ghost" id="btn-cmd" title="${t('chat.shortcuts')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M18 3a3 3 0 00-3 3v12a3 3 0 003 3 3 3 0 003-3 3 3 0 00-3-3H6a3 3 0 00-3 3 3 3 0 003 3 3 3 0 003-3V6a3 3 0 00-3-3 3 3 0 00-3 3 3 3 0 003 3h12a3 3 0 003-3 3 3 0 00-3-3z"/></svg>
          </button>
          <button class="btn btn-sm btn-ghost" id="btn-reset-session" title="${t('chat.resetSession')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
          </button>
        </div>
      </div>
      <div class="chat-reply-status-row" id="chat-reply-status-row" aria-live="polite" hidden>
        <div class="chat-reply-status-head">
          <span class="chat-reply-status-dot"></span>
          <span class="chat-reply-status-phase" id="chat-reply-status-phase">${replyStatusPhase('waiting')}</span>
          <span class="chat-reply-status-elapsed" id="chat-reply-status-elapsed">${t('chat.idle')}</span>
        </div>
        <div class="chat-reply-status-body">
          <div class="chat-reply-status-text" id="chat-reply-status-text"></div>
          <div class="chat-reply-status-detail" id="chat-reply-status-detail"></div>
          <div class="chat-reply-status-tools" id="chat-reply-status-tools"></div>
        </div>
        <div class="chat-reply-status-meta" id="chat-reply-status-meta"></div>
      </div>
      <div class="chat-workspace-panel" id="chat-workspace-panel" style="display:none">
        <div class="chat-workspace-header">
          <div class="chat-workspace-header-copy">
            <div class="chat-workspace-title-row">
              <strong>${t('chat.workspaceFiles')}</strong>
              <span class="chat-workspace-agent-badge" id="chat-workspace-agent-badge">main</span>
            </div>
            <div class="chat-workspace-agent-title" id="chat-workspace-agent-title"></div>
            <div class="chat-workspace-path" id="chat-workspace-path"></div>
          </div>
          <div class="chat-workspace-header-actions">
            <button class="chat-workspace-icon-btn" id="chat-workspace-refresh" title="${t('common.refresh')}">${svgIcon('refresh-cw', 14)}</button>
            <button class="chat-workspace-icon-btn" id="chat-workspace-close" title="${t('common.close')}">${svgIcon('x', 14)}</button>
          </div>
        </div>
        <div class="chat-workspace-body">
          <div class="chat-workspace-sidebar-pane">
            <div class="chat-workspace-section">
              <div class="chat-workspace-section-title">${t('chat.coreFiles')}</div>
              <div class="chat-workspace-core-list" id="chat-workspace-core-list"></div>
            </div>
            <div class="chat-workspace-section">
              <div class="chat-workspace-section-title">${t('chat.workspaceExplorer')}</div>
              <div class="chat-workspace-tree" id="chat-workspace-tree"></div>
            </div>
          </div>
          <div class="chat-workspace-editor-pane">
            <div class="chat-workspace-editor-toolbar">
              <div class="chat-workspace-current-file" id="chat-workspace-current-file">${t('chat.selectWorkspaceFile')}</div>
              <div class="chat-workspace-editor-actions">
                <button class="btn btn-sm btn-ghost" id="chat-workspace-reload" disabled>${svgIcon('refresh-cw', 14)} ${t('chat.reloadWorkspaceFile')}</button>
                <button class="btn btn-sm btn-ghost" id="chat-workspace-preview-toggle" disabled>${svgIcon('eye', 14)} <span id="chat-workspace-preview-label">${t('chat.previewWorkspaceFile')}</span></button>
                <button class="btn btn-sm btn-primary" id="chat-workspace-save" disabled>${t('common.save')}</button>
              </div>
            </div>
            <div class="chat-workspace-editor-meta" id="chat-workspace-editor-meta"></div>
            <textarea class="chat-workspace-editor" id="chat-workspace-editor" spellcheck="false" disabled placeholder="${t('chat.selectWorkspaceFile')}"></textarea>
            <div class="chat-workspace-preview" id="chat-workspace-preview" style="display:none"></div>
            <div class="chat-workspace-empty" id="chat-workspace-empty">${t('chat.workspaceEmptyState')}</div>
          </div>
        </div>
      </div>
      <div class="chat-messages" id="chat-messages">
        <div class="typing-indicator" id="typing-indicator" style="display:none">
          <span></span><span></span><span></span>
          <span class="typing-hint"></span>
        </div>
      </div>
      <button class="chat-scroll-btn" id="chat-scroll-btn" style="display:none">↓</button>
      <div class="chat-cmd-panel" id="chat-cmd-panel" style="display:none"></div>
      <div class="chat-attachments-preview" id="chat-attachments-preview" style="display:none"></div>
      <div class="chat-input-area">
        <input type="file" id="chat-file-input" accept="image/*" multiple style="display:none">
        <button class="chat-attach-btn" id="chat-attach-btn" title="${t('chat.uploadImage')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        </button>
        <div class="chat-input-wrapper">
          <textarea id="chat-input" rows="1" placeholder="${t('chat.inputPlaceholder')}"></textarea>
          <div class="chat-mention-panel" id="chat-mention-panel" style="display:none"></div>
        </div>
        <button class="chat-send-btn" id="chat-send-btn" disabled>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
        <button class="chat-hosted-btn btn btn-sm btn-ghost" id="chat-hosted-btn" title="${t('chat.hostedAgent')}">
          <span class="chat-hosted-label">⊕</span>
          <span class="chat-hosted-badge idle" id="chat-hosted-badge">${t('chat.hostedBadge')}</span>
        </button>
      </div>
      <div class="hosted-agent-panel" id="hosted-agent-panel" style="display:none">
        <div class="hosted-agent-header">
          <strong>${t('chat.hostedAgent')}</strong>
          <button class="hosted-agent-close" id="hosted-agent-close" title="${t('common.close')}">&times;</button>
        </div>
        <div class="hosted-agent-body">
          <div class="form-group">
            <label class="form-label" style="color:var(--accent);font-weight:600">${t('chat.taskGoal')}</label>
            <textarea class="form-input hosted-agent-prompt" id="hosted-agent-prompt" rows="3" placeholder="${t('chat.taskGoalPlaceholder')}"></textarea>
            <div class="form-hint">${t('chat.hostedHint')}</div>
          </div>
          <div class="ha-slider-group">
            <div class="ha-slider-label">${t('chat.maxReplies')} <span class="ha-slider-val" id="ha-steps-val">50</span></div>
            <input type="range" class="ha-slider" id="hosted-agent-max-steps" min="5" max="205" step="5" value="50">
            <div class="ha-slider-ticks"><span>5</span><span>50</span><span>100</span><span>200</span><span>∞</span></div>
          </div>
          <div class="ha-timer-group">
            <div class="ha-timer-header">
              <span>${t('chat.timerAutoStop')}</span>
              <label class="ha-toggle"><input type="checkbox" id="hosted-agent-timer-on"><span class="ha-toggle-track"></span></label>
            </div>
            <div class="ha-timer-body" id="ha-timer-body" style="display:none">
              <input type="range" class="ha-slider" id="hosted-agent-auto-stop" min="5" max="120" step="5" value="30">
              <div class="ha-slider-ticks"><span>5m</span><span>30m</span><span>60m</span><span>120m</span></div>
              <div class="ha-countdown" id="ha-countdown" style="display:none">
                <div class="ha-countdown-bar"><div class="ha-countdown-fill" id="ha-countdown-fill"></div></div>
                <span class="ha-countdown-text" id="ha-countdown-text">${t('chat.remaining')} --:--</span>
              </div>
            </div>
          </div>
          <input type="hidden" id="hosted-agent-step-delay" value="1200">
          <input type="hidden" id="hosted-agent-retry" value="2">
        </div>
        <div class="hosted-agent-actions">
          <button class="btn btn-primary" id="hosted-agent-save" style="flex:1">${t('chat.startHosted')}</button>
        </div>
        <div class="hosted-agent-footer" id="hosted-agent-status">${t('chat.ready')}</div>
      </div>
      <div class="chat-disconnect-bar" id="chat-disconnect-bar" style="display:none">${t('chat.disconnected')}</div>
      <div class="chat-connect-overlay" id="chat-connect-overlay" style="display:none">
        <div class="chat-connect-card">
          <div class="chat-connect-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg>
          </div>
          <div class="chat-connect-title">${t('chat.gatewayNotReady')}</div>
          <div class="chat-connect-desc" id="chat-connect-desc">${t('chat.connectingGateway')}</div>
          <div class="chat-connect-actions">
            <button class="btn btn-primary btn-sm" id="btn-fix-connect">${t('chat.fixAndReconnect')}</button>
            <button class="btn btn-secondary btn-sm" id="btn-goto-gateway">${t('chat.gatewaySettings')}</button>
          </div>
          <div class="chat-connect-hint">${t('chat.firstUseHint')}</div>
        </div>
      </div>
    </div>
  `

  _messagesEl = page.querySelector('#chat-messages')
  _textarea = page.querySelector('#chat-input')
  _sendBtn = page.querySelector('#chat-send-btn')
  _statusDot = page.querySelector('#chat-status-dot')
  _typingEl = page.querySelector('#typing-indicator')
  _scrollBtn = page.querySelector('#chat-scroll-btn')
  _replyStatusRowEl = page.querySelector('#chat-reply-status-row')
  _replyStatusTextEl = page.querySelector('#chat-reply-status-text')
  _replyStatusPhaseEl = page.querySelector('#chat-reply-status-phase')
  _replyStatusDetailEl = page.querySelector('#chat-reply-status-detail')
  _replyStatusMetaEl = page.querySelector('#chat-reply-status-meta')
  _replyStatusToolsEl = page.querySelector('#chat-reply-status-tools')
  _replyStatusElapsedEl = page.querySelector('#chat-reply-status-elapsed')
  _sessionListEl = page.querySelector('#chat-session-list')
  _sessionListNormalEl = page.querySelector('#chat-session-list-normal')
  _sessionListGroupsEl = page.querySelector('#chat-session-list-groups')
  _cmdPanelEl = page.querySelector('#chat-cmd-panel')
  _attachPreviewEl = page.querySelector('#chat-attachments-preview')
  _fileInputEl = page.querySelector('#chat-file-input')
  _mentionPanelEl = page.querySelector('#chat-mention-panel')
  _modelSelectEl = page.querySelector('#chat-model-select')
  _hostedBtn = page.querySelector('#chat-hosted-btn')
  _hostedBadgeEl = page.querySelector('#chat-hosted-badge')
  _hostedPanelEl = page.querySelector('#hosted-agent-panel')
  _hostedPromptEl = page.querySelector('#hosted-agent-prompt')
  _hostedMaxStepsEl = page.querySelector('#hosted-agent-max-steps')
  _hostedStepDelayEl = page.querySelector('#hosted-agent-step-delay')
  _hostedRetryLimitEl = page.querySelector('#hosted-agent-retry')
  _hostedAutoStopEl = page.querySelector('#hosted-agent-auto-stop')
  _hostedSaveBtn = page.querySelector('#hosted-agent-save')
  _hostedCloseBtn = page.querySelector('#hosted-agent-close')
  _workspaceBtn = page.querySelector('#btn-chat-workspace')
  _workspacePanelEl = page.querySelector('#chat-workspace-panel')
  _workspaceAgentBadgeEl = page.querySelector('#chat-workspace-agent-badge')
  _workspaceAgentTitleEl = page.querySelector('#chat-workspace-agent-title')
  _workspacePathEl = page.querySelector('#chat-workspace-path')
  _workspaceCoreListEl = page.querySelector('#chat-workspace-core-list')
  _workspaceTreeEl = page.querySelector('#chat-workspace-tree')
  _workspaceCurrentFileEl = page.querySelector('#chat-workspace-current-file')
  _workspaceMetaEl = page.querySelector('#chat-workspace-editor-meta')
  _workspaceEditorEl = page.querySelector('#chat-workspace-editor')
  _workspacePreviewEl = page.querySelector('#chat-workspace-preview')
  _workspaceEmptyEl = page.querySelector('#chat-workspace-empty')
  _workspaceSaveBtn = page.querySelector('#chat-workspace-save')
  _workspaceReloadBtn = page.querySelector('#chat-workspace-reload')
  _workspacePreviewBtn = page.querySelector('#chat-workspace-preview-toggle')
  page.querySelector('#chat-sidebar')?.classList.toggle('open', getSidebarOpen())

  bindEvents(page)
  bindConnectOverlay(page)
  const workspaceOpen = getWorkspacePanelOpen()
  applyWorkspacePanelVisibility(workspaceOpen)
  if (!workspaceOpen) syncWorkspaceContext(false)

  // 首次使用引导提示
  showPageGuide(_messagesEl)
  restoreReplyStatus()
  loadGroupSessions()
  loadTaskBoard()
  loadTaskContexts()

  loadHostedDefaults().then(() => { loadHostedSessionConfig(); renderHostedPanel(); updateHostedBadge() })
  bindModelConfigSync()
  loadModelOptions()
  // 非阻塞：先返回 DOM，后台连接 Gateway
  connectGateway()
  return page
}

const GUIDE_KEY = '星枢OpenClaw-guide-chat-dismissed'

function showPageGuide(container) {
  if (localStorage.getItem(GUIDE_KEY)) return
  if (!container || container.querySelector('.chat-page-guide')) return
  const guide = document.createElement('div')
  guide.className = 'chat-page-guide'
  guide.innerHTML = `
    <div class="chat-guide-inner">
      <div class="chat-guide-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
      </div>
      <div class="chat-guide-content">
        <b>${t('chat.guideTitle')}</b>
        <p>${t('chat.guideDesc')}</p>
        <p style="opacity:0.7;font-size:11px">${t('chat.guideHint')}</p>
      </div>
      <button class="chat-guide-close" title="${t('chat.guideClose')}">&times;</button>
    </div>
  `
  guide.querySelector('.chat-guide-close').onclick = () => {
    localStorage.setItem(GUIDE_KEY, '1')
    guide.remove()
  }
  container.insertBefore(guide, container.firstChild)
}

// ── 事件绑定 ──

function bindEvents(page) {
  if (_modelSelectEl) {
    _modelSelectEl.addEventListener('change', () => {
      _selectedModel = _modelSelectEl.value
      applySelectedModel()
    })
  }

  _textarea.addEventListener('input', () => {
    _textarea.style.height = 'auto'
    _textarea.style.height = Math.min(_textarea.scrollHeight, 150) + 'px'
    updateSendState()
    // 输入 / 时显示指令面板；群聊里输入 @ 时显示成员快捷选择
    if (_textarea.value === '/') showCmdPanel()
    else if (!_textarea.value.startsWith('/')) hideCmdPanel()
    updateMentionPanel()
  })

  _textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); sendMessage() }
    if (e.key === 'Escape') { hideCmdPanel(); hideMentionPanel() }
  })
  _mentionPanelEl?.addEventListener('click', (e) => {
    const item = e.target.closest('[data-mention]')
    if (!item) return
    insertMention(item.dataset.mention || '')
  })

  _sendBtn.addEventListener('click', () => {
    if (_isStreaming) stopGeneration()
    else sendMessage()
  })

  if (_hostedBtn) _hostedBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleHostedPanel() })
  if (_hostedCloseBtn) _hostedCloseBtn.addEventListener('click', () => hideHostedPanel())
  if (_hostedSaveBtn) _hostedSaveBtn.addEventListener('click', () => toggleHostedRun())
  // 滑块实时值显示
  if (_hostedMaxStepsEl) _hostedMaxStepsEl.addEventListener('input', () => {
    const valEl = page.querySelector('#ha-steps-val')
    if (valEl) valEl.textContent = parseInt(_hostedMaxStepsEl.value) >= 205 ? '∞' : _hostedMaxStepsEl.value
  })
  // 定时器开关
  const timerToggle = page.querySelector('#hosted-agent-timer-on')
  const timerBody = page.querySelector('#ha-timer-body')
  if (timerToggle && timerBody) {
    timerToggle.addEventListener('change', () => { timerBody.style.display = timerToggle.checked ? '' : 'none' })
  }

  const toggleSidebar = () => {
    const sidebar = page.querySelector('#chat-sidebar')
    if (!sidebar) return
    const nextOpen = !sidebar.classList.contains('open')
    sidebar.classList.toggle('open', nextOpen)
    setSidebarOpen(nextOpen)
  }
  page.querySelector('#btn-toggle-sidebar')?.addEventListener('click', toggleSidebar)
  page.querySelector('#btn-toggle-sidebar-main')?.addEventListener('click', toggleSidebar)
  page.querySelector('#btn-refresh-chat')?.addEventListener('click', forceRefreshChat)
  page.querySelector('#btn-new-session').addEventListener('click', () => showNewSessionDialog())
  page.querySelector('#btn-session-multi-select')?.addEventListener('click', () => setSessionMultiSelectMode(true))
  page.querySelector('#btn-session-multi-cancel')?.addEventListener('click', () => setSessionMultiSelectMode(false))
  page.querySelector('#btn-session-select-all')?.addEventListener('click', () => selectAllVisibleSessions())
  page.querySelector('#btn-session-clear-selection')?.addEventListener('click', () => clearSessionSelection())
  page.querySelector('#btn-session-delete-selected')?.addEventListener('click', () => deleteSelectedSessions())
  page.querySelector('#btn-task-board').addEventListener('click', () => toggleTaskBoard())
  page.querySelector('#btn-new-group')?.addEventListener('click', () => showGroupEditor())
  page.querySelector('#btn-cmd').addEventListener('click', () => toggleCmdPanel())
  page.querySelector('#btn-reset-session').addEventListener('click', () => resetCurrentSession())
  page.querySelector('#btn-refresh-models')?.addEventListener('click', () => loadModelOptions(true))
  _workspaceBtn?.addEventListener('click', async (e) => {
    e.stopPropagation()
    if (getWorkspacePanelOpen() && _workspaceDirty) {
      const yes = await confirmWorkspaceDiscardIfNeeded()
      if (!yes) return
      discardWorkspaceChanges()
    }
    toggleWorkspacePanel()
  })
  page.querySelector('#chat-workspace-close')?.addEventListener('click', async () => {
    if (_workspaceDirty) {
      const yes = await confirmWorkspaceDiscardIfNeeded()
      if (!yes) return
      discardWorkspaceChanges()
    }
    toggleWorkspacePanel(false)
  })
  page.querySelector('#chat-workspace-refresh')?.addEventListener('click', async () => {
    if (_workspaceDirty) {
      const yes = await confirmWorkspaceDiscardIfNeeded()
      if (!yes) return
      discardWorkspaceChanges()
    }
    loadWorkspacePanelData(true)
  })
  _workspaceCoreListEl?.addEventListener('click', async (e) => {
    const item = e.target.closest('[data-core-path]')
    if (!item) return
    const relativePath = item.dataset.corePath || ''
    if (!relativePath) return
    if (item.dataset.coreExists === '1') await openWorkspaceFile(relativePath, { kind: 'core' })
    else {
      const yes = await confirmWorkspaceDiscardIfNeeded()
      if (!yes) return
      discardWorkspaceChanges()
      prepareWorkspaceDraftFile(relativePath, { kind: 'core' })
    }
  })
  _workspaceTreeEl?.addEventListener('click', async (e) => {
    const toggle = e.target.closest('[data-tree-toggle]')
    if (toggle) {
      try {
        await toggleWorkspaceDirectory(toggle.dataset.treeToggle || '')
      } catch (err) {
        toast(`${t('chat.workspaceLoadFailed')}: ${err?.message || err}`, 'error')
      }
      return
    }
    const link = e.target.closest('[data-tree-path]')
    if (!link) return
    const relativePath = link.dataset.treePath || ''
    if (!relativePath) return
    if (link.dataset.treeType === 'dir') {
      try {
        await toggleWorkspaceDirectory(relativePath)
      } catch (err) {
        toast(`${t('chat.workspaceLoadFailed')}: ${err?.message || err}`, 'error')
      }
      return
    }
    await openWorkspaceFile(relativePath, { kind: 'tree' })
  })
  _workspaceEditorEl?.addEventListener('input', () => {
    if (!_workspaceCurrentFile || !_workspaceEditorEl) return
    _workspaceDirty = _workspaceEditorEl.value !== _workspaceLoadedContent
    if (_workspacePreviewMode) renderWorkspacePreview()
    updateWorkspaceEditorState()
  })
  _workspaceEditorEl?.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      saveWorkspaceCurrentFile()
    }
  })
  _workspaceReloadBtn?.addEventListener('click', () => reloadWorkspaceCurrentFile())
  _workspacePreviewBtn?.addEventListener('click', () => toggleWorkspacePreview())
  _workspaceSaveBtn?.addEventListener('click', () => saveWorkspaceCurrentFile())

  // 文件上传
  page.querySelector('#chat-attach-btn').addEventListener('click', () => _fileInputEl.click())
  _fileInputEl.addEventListener('change', handleFileSelect)
  // 粘贴图片（Ctrl+V）
  _textarea.addEventListener('paste', handlePaste)

  _messagesEl.addEventListener('scroll', () => {
    const { scrollTop, scrollHeight, clientHeight } = _messagesEl
    _scrollBtn.style.display = (scrollHeight - scrollTop - clientHeight < 80) ? 'none' : 'flex'
    if (scrollTop < _lastScrollTop - 2) _autoScrollEnabled = false
    if (isAtBottom()) _autoScrollEnabled = true
    _lastScrollTop = scrollTop
  })
  _messagesEl.addEventListener('wheel', (e) => {
    if (e.deltaY < 0) _autoScrollEnabled = false
  }, { passive: true })
  _messagesEl.addEventListener('touchstart', (e) => {
    _touchStartY = e.touches?.[0]?.clientY || 0
  }, { passive: true })
  _messagesEl.addEventListener('touchmove', (e) => {
    const y = e.touches?.[0]?.clientY || 0
    if (y > _touchStartY + 2) _autoScrollEnabled = false
  }, { passive: true })
  _scrollBtn.addEventListener('click', () => {
    _autoScrollEnabled = true
    scrollToBottom(true)
  })
  _messagesEl.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.msg-copy-btn')
    if (copyBtn) {
      e.stopPropagation()
      const msgWrap = copyBtn.closest('.msg')
      const bubble = msgWrap?.querySelector('.msg-bubble')
      if (bubble) {
        const text = bubble.innerText || bubble.textContent || ''
        navigator.clipboard.writeText(text.trim()).then(() => {
          copyBtn.classList.add('copied')
          copyBtn.innerHTML = svgIcon('check', 12)
          setTimeout(() => { copyBtn.classList.remove('copied'); copyBtn.innerHTML = svgIcon('copy', 12) }, 1500)
        }).catch(() => {})
      }
      return
    }
    const translateBtn = e.target.closest('.msg-translate-btn')
    if (translateBtn) {
      e.stopPropagation()
      translateMessageToChinese(translateBtn)
      return
    }
    hideCmdPanel()
  })
}

function bindModelConfigSync() {
  if (typeof window === 'undefined' || _modelConfigChangeHandler) return
  _modelConfigChangeHandler = () => {
    clearTimeout(_modelConfigRefreshTimer)
    _modelConfigRefreshTimer = setTimeout(async () => {
      if (!_pageActive || !_modelSelectEl) return
      await loadModelOptions(false)
      if (wsClient.gatewayReady) {
        try { await refreshRuntimeModelFromSessions(_sessionKey) } catch (_) {}
      }
    }, 80)
  }
  window.addEventListener(MODEL_CONFIG_CHANGED_EVENT, _modelConfigChangeHandler)
}

async function loadModelOptions(showToast = false) {
  if (!_modelSelectEl) return
  _modelSelectEl.innerHTML = `<option value="">${t('chat.loadingModels')}</option>`
  _modelSelectEl.disabled = true
  try {
    invalidate('read_openclaw_config')
    const configPromise = api.readOpenclawConfig()
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout(8s)')), 8000))
    const config = await Promise.race([configPromise, timeoutPromise])
    const providers = config?.models?.providers || {}
    _primaryModel = config?.agents?.defaults?.model?.primary || ''
    _defaultModelLabel = _primaryModel ? t('chat.defaultModelWithName', { model: _primaryModel }) : t('chat.defaultModel')
    const models = []
    const seen = new Set()
    const addModel = (value) => {
      const full = normalizeModelValue(value)
      if (!full || seen.has(full)) return
      seen.add(full)
      models.push(full)
    }
    addModel(_primaryModel)
    for (const [providerKey, provider] of Object.entries(providers)) {
      for (const item of (provider?.models || [])) {
        const modelId = typeof item === 'string' ? item : item?.id
        if (!modelId) continue
        addModel(modelId.includes('/') ? modelId : `${providerKey}/${modelId}`)
      }
    }
    _availableModels = models
    applyRuntimeModelToSelect(_sessionKey)
    renderModelSelect()
    if (showToast) toast(`${t('chat.refreshModels')} (${models.length})`, 'success')
  } catch (e) {
    _availableModels = []
    _primaryModel = ''
    _defaultModelLabel = t('chat.defaultModel')
    _selectedModel = ''
    renderModelSelect(`${t('common.loadFailed')}: ${e.message || e}`)
    if (showToast) toast(`${t('common.loadFailed')}: ${e.message || e}`, 'error')
  }
}

function renderModelSelect(errorText = '') {
  if (!_modelSelectEl) return
  if (!_availableModels.length && errorText) {
    _modelSelectEl.innerHTML = `<option value="">${escapeAttr(errorText)}</option>`
    _modelSelectEl.disabled = true
    _modelSelectEl.title = errorText || ''
    return
  }
  _modelSelectEl.disabled = _isApplyingModel || !_availableModels.length
  const defaultLabel = _defaultModelLabel || (_primaryModel ? t('chat.defaultModelWithName', { model: _primaryModel }) : t('chat.defaultModel'))
  const defaultOption = `<option value="" ${_selectedModel === '' ? 'selected' : ''}>${escapeAttr(defaultLabel)}</option>`
  const modelOptions = _availableModels.map(full => {
    const suffix = full === _primaryModel ? ` ${t('chat.defaultSuffix')}` : ''
    return `<option value="${escapeAttr(full)}" ${full === _selectedModel ? 'selected' : ''}>${escapeAttr(full + suffix)}</option>`
  }).join('')
  _modelSelectEl.innerHTML = defaultOption + modelOptions
  _modelSelectEl.title = _selectedModel || defaultLabel
}

function normalizeModelValue(model, provider = '') {
  const raw = String(model || '').trim()
  const prov = String(provider || '').trim()
  if (!raw) return ''
  return raw.includes('/') || !prov ? raw : `${prov}/${raw}`
}

function getSessionRuntimeModel(sessionKey) {
  if (!sessionKey) return ''
  return _sessionModels.get(sessionKey) || ''
}

function ensureModelOption(model) {
  const full = normalizeModelValue(model)
  if (!full) return
  if (!_availableModels.includes(full)) _availableModels = [full, ..._availableModels]
}


function normalizeUsage(raw = null) {
  if (!raw || typeof raw !== 'object') return null
  const input = Number(raw.input ?? raw.inputTokens ?? raw.input_tokens ?? raw.prompt_tokens ?? 0) || 0
  const output = Number(raw.output ?? raw.outputTokens ?? raw.output_tokens ?? raw.completion_tokens ?? 0) || 0
  const cacheRead = Number(raw.cacheRead ?? raw.cache_read_input_tokens ?? raw.cached_tokens ?? raw.cache_read ?? 0) || 0
  const cacheWrite = Number(raw.cacheWrite ?? raw.cache_creation_input_tokens ?? raw.cache_write_input_tokens ?? raw.cache_write ?? 0) || 0
  const total = Number(raw.total ?? raw.totalTokens ?? raw.total_tokens ?? (input + output + cacheRead + cacheWrite)) || 0
  if (!input && !output && !cacheRead && !cacheWrite && !total) return null
  return { input, output, cacheRead, cacheWrite, total }
}

function normalizeCost(raw = null) {
  if (!raw) return 0
  if (typeof raw === 'number') return raw
  if (typeof raw !== 'object') return 0
  return Number(raw.total ?? raw.amount ?? raw.cost ?? raw.usd ?? 0) || 0
}

function compactNumber(n) {
  n = Number(n) || 0
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}

function getContextWindow(sessionKey = _sessionKey) {
  return _sessionContextTokens.get(sessionKey) || _defaultContextTokens || wsClient.snapshot?.sessionDefaults?.contextTokens || 0
}

function buildMessageMeta({ time = new Date(), durationMs = 0, usage = null, cost = 0, model = '', contextWindow = 0, showCopy = true, showTranslate = false } = {}) {
  const parts = [`<span class="msg-time">${formatTime(time)}</span>`]
  if (durationMs > 0) parts.push(`<span class="meta-sep">·</span><span class="msg-duration">⏱ ${(durationMs / 1000).toFixed(1)}s</span>`)
  const u = normalizeUsage(usage)
  if (u) {
    if (u.input) parts.push(`<span class="meta-sep">·</span><span class="msg-tokens msg-token-in" title="${escapeAttr(t('chat.inputTokens'))}">↑${compactNumber(u.input)}</span>`)
    if (u.output) parts.push(`<span class="msg-tokens msg-token-out" title="${escapeAttr(t('chat.outputTokens'))}">↓${compactNumber(u.output)}</span>`)
    if (u.cacheRead) parts.push(`<span class="msg-tokens msg-token-cache" title="${escapeAttr(t('chat.cacheReadTokens'))}">R${compactNumber(u.cacheRead)}</span>`)
    if (u.cacheWrite) parts.push(`<span class="msg-tokens msg-token-cache" title="${escapeAttr(t('chat.cacheWriteTokens'))}">W${compactNumber(u.cacheWrite)}</span>`)
    const ctxBase = Number(contextWindow) || 0
    const ctxUsed = u.input + u.cacheRead + u.cacheWrite
    if (ctxBase > 0 && ctxUsed > 0) {
      const pct = Math.min(Math.round((ctxUsed / ctxBase) * 100), 100)
      const cls = pct >= 90 ? 'msg-context msg-context-danger' : pct >= 75 ? 'msg-context msg-context-warn' : 'msg-context'
      parts.push(`<span class="${cls}" title="${escapeAttr(t('chat.contextUsage'))}">${escapeHtml(t('chat.contextPercent', { percent: pct }))}</span>`)
    }
  }
  const totalCost = normalizeCost(cost)
  if (totalCost > 0) parts.push(`<span class="meta-sep">·</span><span class="msg-cost" title="${escapeAttr(t('chat.messageCost'))}">$${totalCost.toFixed(4)}</span>`)
  const modelLabel = normalizeModelValue(model) || getSessionRuntimeModel(_sessionKey) || _selectedModel || _primaryModel
  if (modelLabel) parts.push(`<span class="meta-sep">·</span><span class="msg-model" title="${escapeAttr(t('chat.messageModel'))}">${escapeHtml(modelLabel)}</span>`)
  if (showTranslate) parts.push(translateButtonHtml())
  if (showCopy) parts.push(`<button class="msg-copy-btn" title="${t('common.copy')}">${svgIcon('copy', 12)}</button>`)
  return parts.join('')
}

function extractMessageUsage(msg = {}) {
  return normalizeUsage(msg.usage || msg.tokenUsage || msg.metrics?.usage || msg.message?.usage)
}

function extractMessageCost(msg = {}) {
  return normalizeCost(msg.cost || msg.usage?.cost || msg.metrics?.cost || msg.message?.cost)
}

function extractMessageModel(msg = {}) {
  return normalizeModelValue(msg.model || msg.runtimeModel || msg.currentModel || msg.modelId || msg.message?.model || '', msg.modelProvider || msg.provider || msg.message?.modelProvider || '')
}

function applySessionDefaultsModel(defaults = null) {
  if (!defaults || typeof defaults !== 'object') return ''
  const defaultsModel = normalizeModelValue(defaults.model || defaults.runtimeModel || defaults.currentModel || '', defaults.modelProvider || defaults.provider || '')
  if (defaultsModel) {
    _primaryModel = defaultsModel
    _defaultModelLabel = t('chat.defaultModelWithName', { model: defaultsModel })
    ensureModelOption(defaultsModel)
    return defaultsModel
  }
  if (Object.prototype.hasOwnProperty.call(defaults, 'model')) {
    _primaryModel = ''
    _defaultModelLabel = t('chat.defaultModel')
  }
  return ''
}

function applyRuntimeModelToSelect(sessionKey = _sessionKey) {
  const runtimeModel = getSessionRuntimeModel(sessionKey)
  if (runtimeModel) ensureModelOption(runtimeModel)
  _selectedModel = runtimeModel || ''
  renderModelSelect()
  return _selectedModel
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function refreshRuntimeModelFromSessions(sessionKey = _sessionKey) {
  if (!sessionKey || !wsClient.gatewayReady) return ''
  const result = await wsClient.sessionsList(100, {
    activeMinutes: 1,
    includeGlobal: true,
    includeUnknown: true,
  })
  const sessions = result?.sessions || result || []
  updateSessionRuntimeCache(sessions, result?.defaults)
  return applyRuntimeModelToSelect(sessionKey)
}

function updateSessionRuntimeCache(sessions, defaults = null) {
  applySessionDefaultsModel(defaults)
  const defaultCtx = Number(defaults?.contextTokens ?? defaults?.context_tokens ?? defaults?.contextWindow ?? 0) || 0
  if (defaultCtx > 0) _defaultContextTokens = defaultCtx
  for (const item of (sessions || [])) {
    const key = item.sessionKey || item.key || ''
    if (!key) continue
    const model = normalizeModelValue(item.model || item.runtimeModel || item.currentModel || '', item.modelProvider || item.provider || '')
    if (model) _sessionModels.set(key, model)
    else _sessionModels.delete(key)
    const ctx = Number(item.contextTokens ?? item.context_tokens ?? item.contextWindow ?? item.context_window ?? defaultCtx ?? 0) || 0
    if (ctx > 0) _sessionContextTokens.set(key, ctx)
    const total = Number(item.totalTokens ?? item.total_tokens ?? item.contextUsedTokens ?? item.usedTokens ?? 0) || 0
    if (total > 0) _sessionTokenTotals.set(key, total)
  }
}

function updateSessionModelCache(sessions) {
  updateSessionRuntimeCache(sessions)
}

function escapeAttr(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 本地会话别名缓存 */
function getSessionNames() {
  try { return JSON.parse(localStorage.getItem(STORAGE_SESSION_NAMES_KEY) || '{}') } catch { return {} }
}
function setSessionName(key, name) {
  const names = getSessionNames()
  if (name) names[key] = name
  else delete names[key]
  localStorage.setItem(STORAGE_SESSION_NAMES_KEY, JSON.stringify(names))
}
function getDisplayLabel(key) {
  const custom = getSessionNames()[key]
  return custom || parseSessionLabel(key)
}

function getSidebarOpen() {
  return localStorage.getItem(STORAGE_SIDEBAR_KEY) === '1'
}

function setSidebarOpen(open) {
  localStorage.setItem(STORAGE_SIDEBAR_KEY, open ? '1' : '0')
}

function getWorkspacePanelOpen() {
  return localStorage.getItem(STORAGE_WORKSPACE_PANEL_KEY) === '1'
}

function setWorkspacePanelOpen(open) {
  localStorage.setItem(STORAGE_WORKSPACE_PANEL_KEY, open ? '1' : '0')
}

function formatWorkspaceFileSize(bytes) {
  const size = Number(bytes) || 0
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatWorkspaceFileTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString()
}

function isMarkdownWorkspaceFile(relativePath) {
  return /\.(md|markdown|mdx)$/i.test(relativePath || '')
}

async function confirmWorkspaceDiscardIfNeeded() {
  if (!_workspaceDirty) return true
  return showConfirm(t('chat.confirmDiscardWorkspaceChanges'))
}

function discardWorkspaceChanges() {
  if (!_workspaceCurrentFile) {
    _workspaceDirty = false
    updateWorkspaceEditorState()
    return
  }
  if (_workspaceEditorEl) _workspaceEditorEl.value = _workspaceLoadedContent
  _workspaceDirty = false
  if (_workspacePreviewMode) renderWorkspacePreview()
  updateWorkspaceEditorState()
}

function getCurrentWorkspaceAgentId() {
  const group = getActiveGroup()
  if (group) return 'group'
  return parseSessionAgent(_sessionKey) || wsClient.snapshot?.sessionDefaults?.defaultAgentId || 'main'
}

function getWorkspaceAgentTitle() {
  const group = getActiveGroup()
  if (group) return `群聊：${group.name}`
  if (_sessionKey) return getDisplayLabel(_sessionKey)
  if (_workspaceCurrentAgentId === 'main') return t('chat.mainSession')
  return _workspaceCurrentAgentId || t('chat.workspace')
}

async function syncWorkspaceContext(reload = true) {
  const nextAgentId = getCurrentWorkspaceAgentId()
  const prevAgentId = _workspaceCurrentAgentId
  _workspaceCurrentAgentId = nextAgentId || 'main'

  const triggerAgentEl = _page?.querySelector('#chat-workspace-trigger-agent')
  if (triggerAgentEl) triggerAgentEl.textContent = _workspaceCurrentAgentId
  if (_workspaceAgentBadgeEl) _workspaceAgentBadgeEl.textContent = _workspaceCurrentAgentId
  if (_workspaceAgentTitleEl) {
    _workspaceAgentTitleEl.textContent = getWorkspaceAgentTitle()
  }

  if (!_workspacePanelEl || !getWorkspacePanelOpen()) return
  if (!reload && prevAgentId === _workspaceCurrentAgentId && _workspaceInfo) return

  if (prevAgentId !== _workspaceCurrentAgentId) {
    _workspaceDirty = false
    _workspaceCurrentFile = null
  }

  await loadWorkspacePanelData(prevAgentId === _workspaceCurrentAgentId)
}

function applyWorkspacePanelVisibility(open) {
  if (!_workspacePanelEl) return
  _workspacePanelEl.style.display = open ? '' : 'none'
  _workspaceBtn?.classList.toggle('is-active', open)
  if (open) syncWorkspaceContext(true)
}

function toggleWorkspacePanel(force) {
  const nextOpen = typeof force === 'boolean' ? force : !getWorkspacePanelOpen()
  setWorkspacePanelOpen(nextOpen)
  applyWorkspacePanelVisibility(nextOpen)
}

function renderWorkspacePanelMeta() {
  if (_workspaceAgentBadgeEl) _workspaceAgentBadgeEl.textContent = _workspaceCurrentAgentId
  if (_workspaceAgentTitleEl) {
    _workspaceAgentTitleEl.textContent = getWorkspaceAgentTitle()
  }
  if (_workspacePathEl) {
    const path = _workspaceInfo?.workspacePath || ''
    _workspacePathEl.textContent = path || t('chat.workspaceUnavailable')
    _workspacePathEl.title = path || ''
  }
}

function renderWorkspaceCoreFiles() {
  if (!_workspaceCoreListEl) return
  if (!_workspaceCoreFiles.length) {
    _workspaceCoreListEl.innerHTML = `<div class="chat-workspace-note">${t('chat.workspaceNoCoreFiles')}</div>`
    return
  }

  _workspaceCoreListEl.innerHTML = _workspaceCoreFiles.map(file => {
    const active = _workspaceCurrentFile?.relativePath === file.name ? ' active' : ''
    const status = file.exists ? t('common.edit') : t('common.add')
    return `
      <button class="chat-workspace-core-item${active}" data-core-path="${escapeAttr(file.name)}" data-core-exists="${file.exists ? '1' : '0'}" title="${escapeAttr(file.path || file.name)}">
        <span class="chat-workspace-core-icon">${svgIcon(file.exists ? 'file-text' : 'file-plain', 14)}</span>
        <span class="chat-workspace-core-copy">
          <span class="chat-workspace-core-name">${escapeAttr(file.name)}</span>
          <span class="chat-workspace-core-status ${file.exists ? 'exists' : 'missing'}">${status}</span>
        </span>
      </button>
    `
  }).join('')
}

function renderWorkspaceTreeNode(entry, depth) {
  const isDir = entry.type === 'dir'
  const expanded = isDir && _workspaceExpandedDirs.has(entry.relativePath)
  const active = _workspaceCurrentFile?.relativePath === entry.relativePath ? ' active' : ''
  const children = expanded
    ? (_workspaceTreeCache.get(entry.relativePath) || []).map(child => renderWorkspaceTreeNode(child, depth + 1)).join('')
    : ''

  return `
    <div class="chat-workspace-tree-node">
      <div class="chat-workspace-tree-row${active}" style="padding-left:${12 + depth * 14}px">
        ${isDir
          ? `<button class="chat-workspace-tree-toggle" data-tree-toggle="${escapeAttr(entry.relativePath)}">${expanded ? '▾' : '▸'}</button>`
          : '<span class="chat-workspace-tree-toggle is-spacer"></span>'}
        <button class="chat-workspace-tree-link" data-tree-path="${escapeAttr(entry.relativePath)}" data-tree-type="${entry.type}" data-tree-editable="${entry.editable ? '1' : '0'}" title="${escapeAttr(entry.relativePath)}">
          ${svgIcon(isDir ? 'folder' : (entry.previewable ? 'file-text' : 'file'), 14)}
          <span class="chat-workspace-tree-name">${escapeAttr(entry.name)}</span>
        </button>
      </div>
      ${children}
    </div>
  `
}

function renderWorkspaceTree() {
  if (!_workspaceTreeEl) return
  const rootEntries = _workspaceTreeCache.get('') || []
  if (!rootEntries.length) {
    _workspaceTreeEl.innerHTML = `<div class="chat-workspace-note">${t('chat.workspaceTreeEmpty')}</div>`
    return
  }
  _workspaceTreeEl.innerHTML = rootEntries.map(entry => renderWorkspaceTreeNode(entry, 0)).join('')
}

function renderWorkspacePreview() {
  if (!_workspacePreviewEl || !_workspaceEditorEl) return
  _workspacePreviewEl.innerHTML = renderMarkdown(_workspaceEditorEl.value || '')
}

function updateWorkspaceEditorState() {
  const hasFile = !!_workspaceCurrentFile
  const canSaveDraft = hasFile && _workspaceCurrentFile?.exists === false
  if (_workspaceCurrentFileEl) {
    _workspaceCurrentFileEl.textContent = hasFile
      ? `${_workspaceCurrentFile.relativePath}${_workspaceDirty ? ' *' : ''}`
      : t('chat.selectWorkspaceFile')
  }
  if (_workspaceSaveBtn) _workspaceSaveBtn.disabled = !hasFile || (!canSaveDraft && !_workspaceDirty) || _workspaceLoading
  if (_workspaceReloadBtn) _workspaceReloadBtn.disabled = !hasFile || _workspaceLoading
  if (_workspacePreviewBtn) _workspacePreviewBtn.disabled = !hasFile || !_workspaceCurrentFile?.previewable || _workspaceLoading
  const previewLabelEl = _page?.querySelector('#chat-workspace-preview-label')
  if (previewLabelEl) previewLabelEl.textContent = _workspacePreviewMode ? t('chat.editWorkspaceFile') : t('chat.previewWorkspaceFile')
  if (_workspaceEditorEl) {
    _workspaceEditorEl.disabled = !hasFile || _workspaceLoading
    _workspaceEditorEl.style.display = hasFile && !_workspacePreviewMode ? '' : 'none'
  }
  if (_workspacePreviewEl) {
    _workspacePreviewEl.style.display = hasFile && _workspacePreviewMode ? '' : 'none'
  }
  if (_workspaceEmptyEl) {
    _workspaceEmptyEl.style.display = hasFile ? 'none' : ''
  }
  if (hasFile && _workspacePreviewMode) renderWorkspacePreview()
}

function resetWorkspaceEditor(emptyText = t('chat.workspaceEmptyState')) {
  _workspaceCurrentFile = null
  _workspacePreviewMode = false
  _workspaceDirty = false
  _workspaceLoadedContent = ''
  if (_workspaceMetaEl) _workspaceMetaEl.textContent = ''
  if (_workspaceEditorEl) {
    _workspaceEditorEl.value = ''
    _workspaceEditorEl.placeholder = t('chat.selectWorkspaceFile')
  }
  if (_workspacePreviewEl) {
    _workspacePreviewEl.innerHTML = ''
    _workspacePreviewEl.style.display = 'none'
  }
  if (_workspaceEmptyEl) _workspaceEmptyEl.textContent = emptyText
  renderWorkspaceCoreFiles()
  renderWorkspaceTree()
  updateWorkspaceEditorState()
}

function prepareWorkspaceDraftFile(relativePath, options = {}) {
  const { kind = 'core', previewable = isMarkdownWorkspaceFile(relativePath) } = options
  _workspaceCurrentFile = { agentId: _workspaceCurrentAgentId, relativePath, kind, previewable, exists: false }
  _workspacePreviewMode = false
  _workspaceDirty = false
  _workspaceLoadedContent = ''
  if (_workspaceEditorEl) {
    _workspaceEditorEl.value = ''
    _workspaceEditorEl.placeholder = t('chat.workspaceDraftHint')
  }
  if (_workspaceMetaEl) _workspaceMetaEl.textContent = t('chat.workspaceDraftHint')
  renderWorkspaceCoreFiles()
  renderWorkspaceTree()
  updateWorkspaceEditorState()
}

async function loadWorkspacePanelData(preserveCurrentFile = false) {
  if (!_workspaceCoreListEl || !_workspaceTreeEl) return
  const loadSeq = ++_workspaceLoadSeq
  const agentId = _workspaceCurrentAgentId || 'main'
  _workspaceLoading = true
  renderWorkspacePanelMeta()
  _workspaceCoreListEl.innerHTML = `<div class="chat-workspace-note">${t('common.loading')}</div>`
  _workspaceTreeEl.innerHTML = `<div class="chat-workspace-note">${t('common.loading')}</div>`
  updateWorkspaceEditorState()

  try {
    const previousFile = preserveCurrentFile ? _workspaceCurrentFile : null
    const [info, coreFiles, rootEntries] = await Promise.all([
      api.getAgentWorkspaceInfo(agentId),
      api.listAgentFiles(agentId),
      api.listAgentWorkspaceEntries(agentId, ''),
    ])

    if (loadSeq !== _workspaceLoadSeq || agentId !== _workspaceCurrentAgentId) return

    _workspaceInfo = info || null
    _workspaceCoreFiles = Array.isArray(coreFiles) ? coreFiles : []
    _workspaceTreeCache = new Map([['', Array.isArray(rootEntries) ? rootEntries : []]])
    _workspaceExpandedDirs = new Set()
    renderWorkspacePanelMeta()
    renderWorkspaceCoreFiles()
    renderWorkspaceTree()

    if (previousFile && previousFile.agentId === agentId) {
      if (previousFile.kind === 'core' && previousFile.exists === false) {
        prepareWorkspaceDraftFile(previousFile.relativePath, previousFile)
      } else {
        await openWorkspaceFile(previousFile.relativePath, { kind: previousFile.kind, force: true, silent: true })
      }
    } else {
      resetWorkspaceEditor(t('chat.workspaceEmptyState'))
    }
  } catch (e) {
    if (loadSeq !== _workspaceLoadSeq || agentId !== _workspaceCurrentAgentId) return
    _workspaceInfo = null
    _workspaceCoreFiles = []
    _workspaceTreeCache = new Map([['', []]])
    _workspaceExpandedDirs = new Set()
    resetWorkspaceEditor(t('chat.workspaceUnavailable'))
    renderWorkspacePanelMeta()
    const message = e?.message || String(e)
    _workspaceCoreListEl.innerHTML = `<div class="chat-workspace-note is-error">${escapeAttr(message)}</div>`
    _workspaceTreeEl.innerHTML = `<div class="chat-workspace-note is-error">${escapeAttr(message)}</div>`
    toast(`${t('chat.workspaceLoadFailed')}: ${message}`, 'error')
  } finally {
    if (loadSeq !== _workspaceLoadSeq) return
    _workspaceLoading = false
    updateWorkspaceEditorState()
  }
}

async function toggleWorkspaceDirectory(relativePath) {
  if (!relativePath) return
  if (_workspaceExpandedDirs.has(relativePath)) {
    _workspaceExpandedDirs.delete(relativePath)
    renderWorkspaceTree()
    return
  }

  try {
    if (!_workspaceTreeCache.has(relativePath)) {
      const entries = await api.listAgentWorkspaceEntries(_workspaceCurrentAgentId, relativePath)
      _workspaceTreeCache.set(relativePath, Array.isArray(entries) ? entries : [])
    }

    _workspaceExpandedDirs.add(relativePath)
    renderWorkspaceTree()
  } catch (e) {
    toast(`${t('common.loadFailed')}: ${e?.message || e}`, 'error')
  }
}

async function openWorkspaceFile(relativePath, options = {}) {
  const { kind = 'tree', force = false, silent = false } = options
  if (!force && !(await confirmWorkspaceDiscardIfNeeded())) return
  const openSeq = ++_workspaceOpenSeq
  const agentId = _workspaceCurrentAgentId

  try {
    const file = await api.readAgentWorkspaceFile(agentId, relativePath)
    if (openSeq !== _workspaceOpenSeq || agentId !== _workspaceCurrentAgentId) return
    _workspaceCurrentFile = {
      agentId,
      relativePath,
      kind,
      previewable: !!file.previewable,
      exists: true,
    }
    _workspaceLoadedContent = file.content || ''
    _workspacePreviewMode = false
    _workspaceDirty = false

    if (_workspaceEditorEl) {
      _workspaceEditorEl.value = _workspaceLoadedContent
      _workspaceEditorEl.placeholder = t('chat.selectWorkspaceFile')
    }

    const metaParts = []
    if (typeof file.size === 'number') metaParts.push(formatWorkspaceFileSize(file.size))
    const timeText = formatWorkspaceFileTime(file.mtime)
    if (timeText) metaParts.push(timeText)
    if (_workspaceMetaEl) _workspaceMetaEl.textContent = metaParts.join(' · ')

    renderWorkspaceCoreFiles()
    renderWorkspaceTree()
    updateWorkspaceEditorState()
  } catch (e) {
    if (openSeq !== _workspaceOpenSeq || agentId !== _workspaceCurrentAgentId) return
    if (!silent) toast(`${t('chat.workspaceOpenFailed')}: ${e?.message || e}`, 'error')
  }
}

async function reloadWorkspaceCurrentFile(force = false) {
  if (!_workspaceCurrentFile) return
  if (!force && !(await confirmWorkspaceDiscardIfNeeded())) return
  if (_workspaceCurrentFile.kind === 'core' && _workspaceCurrentFile.exists === false) {
    prepareWorkspaceDraftFile(_workspaceCurrentFile.relativePath, _workspaceCurrentFile)
    return
  }
  await openWorkspaceFile(_workspaceCurrentFile.relativePath, { kind: _workspaceCurrentFile.kind, force: true })
}

function toggleWorkspacePreview() {
  if (!_workspaceCurrentFile?.previewable) return
  _workspacePreviewMode = !_workspacePreviewMode
  updateWorkspaceEditorState()
}

async function saveWorkspaceCurrentFile() {
  if (!_workspaceCurrentFile || !_workspaceEditorEl) return
  const text = _workspaceEditorEl.value
  const wasExisting = _workspaceCurrentFile.exists !== false
  try {
    await api.writeAgentWorkspaceFile(_workspaceCurrentAgentId, _workspaceCurrentFile.relativePath, text)
    _workspaceCurrentFile = { ..._workspaceCurrentFile, exists: true }
    _workspaceLoadedContent = text
    _workspaceDirty = false
    try {
      await loadWorkspacePanelData(true)
    } catch (refreshError) {
      console.warn('[chat] workspace refresh after save failed:', refreshError)
    }
    toast(wasExisting ? t('common.saveSuccess') : t('chat.workspaceFileCreated'), 'success')
  } catch (e) {
    toast(`${t('common.saveFailed')}: ${e?.message || e}`, 'error')
  }
}

async function applySelectedModel() {
  if (!wsClient.gatewayReady || !_sessionKey) {
    toast(t('chat.gatewayNotReadySend'), 'warning')
    return
  }
  const targetModel = normalizeModelValue(_selectedModel)
  const previousModel = getSessionRuntimeModel(_sessionKey)
  if (previousModel === targetModel) return
  _isApplyingModel = true
  renderModelSelect()
  try {
    toast(targetModel ? t('chat.modelSwitching', { model: targetModel }) : t('chat.modelRestoringDefault'), 'info')
    await wsClient.sessionModelSet(_sessionKey, targetModel)
    if (targetModel) _sessionModels.set(_sessionKey, targetModel)
    else _sessionModels.delete(_sessionKey)
    applyRuntimeModelToSelect(_sessionKey)
    await refreshSessionList()
    await refreshRuntimeModelFromSessions(_sessionKey)
    const actualModel = getSessionRuntimeModel(_sessionKey)
    toast(actualModel ? t('chat.modelSwitchSuccess', { model: actualModel }) : t('chat.modelDefaultRestored'), 'success')
  } catch (e) {
    if (previousModel) _sessionModels.set(_sessionKey, previousModel)
    else _sessionModels.delete(_sessionKey)
    applyRuntimeModelToSelect(_sessionKey)
    toast(`${t('chat.sendFailed')}${e?.message || e}`, 'error')
  } finally {
    _isApplyingModel = false
    renderModelSelect()
  }
}

// ── 连接引导遮罩 ──

function bindConnectOverlay(page) {
  const fixBtn = page.querySelector('#btn-fix-connect')
  const gwBtn = page.querySelector('#btn-goto-gateway')

  if (fixBtn) {
    fixBtn.addEventListener('click', async () => {
      fixBtn.disabled = true
      fixBtn.textContent = t('chat.fixing')
      const desc = document.getElementById('chat-connect-desc')
      try {
        if (desc) desc.textContent = t('chat.writingConfig')
        await api.autoPairDevice()
        await api.reloadGateway()
        if (desc) desc.textContent = t('chat.fixDoneReconnecting')
        // 断开旧连接，重新发起
        wsClient.disconnect()
        setTimeout(() => connectGateway(), 3000)
      } catch (e) {
        if (desc) desc.textContent = `${t('chat.fixFailed')}${e.message || e}`
      } finally {
        fixBtn.disabled = false
        fixBtn.textContent = t('chat.fixAndReconnect')
      }
    })
  }

  if (gwBtn) {
    gwBtn.addEventListener('click', () => navigate('/gateway'))
  }
}

// ── 文件上传 ──

async function handleFileSelect(e) {
  const files = Array.from(e.target.files || [])
  if (!files.length) return

  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      toast(t('chat.imageOnly'), 'warning')
      continue
    }
    if (file.size > 5 * 1024 * 1024) {
      toast(`${file.name} > 5MB`, 'warning')
      continue
    }

    try {
      const base64 = await fileToBase64(file)
      _attachments.push({
        type: 'image',
        mimeType: file.type,
        fileName: file.name,
        content: base64,
      })
      renderAttachments()
    } catch (e) {
      toast(`${t('chat.readFileFailed')} ${file.name}`, 'error')
    }
  }
  _fileInputEl.value = ''
}

async function handlePaste(e) {
  const items = Array.from(e.clipboardData?.items || [])
  const imageItems = items.filter(item => item.type.startsWith('image/'))
  if (!imageItems.length) return
  e.preventDefault()
  for (const item of imageItems) {
    const file = item.getAsFile()
    if (!file) continue
    if (file.size > 5 * 1024 * 1024) { toast(t('chat.imageSizeLimit'), 'warning'); continue }
    try {
      const base64 = await fileToBase64(file)
      _attachments.push({ type: 'image', mimeType: file.type || 'image/png', fileName: `paste-${Date.now()}.png`, content: base64 })
      renderAttachments()
    } catch (_) { toast(t('chat.readFileFailed'), 'error') }
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      const match = /^data:[^;]+;base64,(.+)$/.exec(dataUrl)
      if (!match) { reject(new Error('invalid data URL')); return }
      resolve(match[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function renderAttachments() {
  if (!_attachPreviewEl) return
  if (!_attachments.length) {
    _attachPreviewEl.style.display = 'none'
    return
  }
  _attachPreviewEl.style.display = 'flex'
  _attachPreviewEl.innerHTML = _attachments.map((att, idx) => `
    <div class="chat-attachment-item">
      <img src="data:${att.mimeType};base64,${att.content}" alt="${att.fileName}">
      <button class="chat-attachment-del" data-idx="${idx}">×</button>
    </div>
  `).join('')

  _attachPreviewEl.querySelectorAll('.chat-attachment-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx)
      _attachments.splice(idx, 1)
      renderAttachments()
    })
  })
  updateSendState()
}

// ── Gateway 连接 ──

async function connectGateway() {
  try {
    // 清理旧的订阅，避免重复监听
    if (_unsubStatus) { _unsubStatus(); _unsubStatus = null }
    if (_unsubReady) { _unsubReady(); _unsubReady = null }
    if (_unsubEvent) { _unsubEvent(); _unsubEvent = null }

    // 订阅状态变化（订阅式，返回 unsub）
    _unsubStatus = wsClient.onStatusChange((status, errorMsg) => {
      if (!_pageActive) return
      updateStatusDot(status)
      const bar = document.getElementById('chat-disconnect-bar')
      const overlay = document.getElementById('chat-connect-overlay')
      const desc = document.getElementById('chat-connect-desc')
      if (['ready', 'connected', 'error', 'auth_failed', 'reconnecting', 'disconnected'].includes(status)) {
        import('../lib/app-state.js').then(m => {
          m.boostGatewayPolling?.()
          return m.refreshGatewayStatus()
        }).catch(() => {})
      }
      if (status === 'ready' || status === 'connected') {
        _hasEverConnected = true
        if (bar) bar.style.display = 'none'
        if (overlay) overlay.style.display = 'none'
      } else if (status === 'error' || status === 'auth_failed') {
        // 连接错误：显示引导遮罩而非底部条
        if (bar) bar.style.display = 'none'
        if (overlay) {
          overlay.style.display = 'flex'
          if (desc) desc.textContent = errorMsg || t('chat.connectFailed')
        }
      } else if (status === 'reconnecting' || status === 'disconnected') {
        // 首次连接或多次重连失败时，显示引导遮罩而非底部小条
        if (!_hasEverConnected) {
          if (overlay) { overlay.style.display = 'flex'; if (desc) desc.textContent = errorMsg || t('chat.connectingGateway') }
        } else {
          if (bar) { bar.textContent = t('chat.disconnected'); bar.style.display = 'flex' }
        }
      } else {
        if (bar) bar.style.display = 'none'
      }
    })

    _unsubReady = wsClient.onReady((hello, sessionKey, err) => {
      if (!_pageActive) return
      const overlay = document.getElementById('chat-connect-overlay')
      if (err?.error) {
        if (overlay) {
          overlay.style.display = 'flex'
          const desc = document.getElementById('chat-connect-desc')
          if (desc) desc.textContent = err.message || t('chat.connectFailed')
        }
        return
      }
      if (overlay) overlay.style.display = 'none'
      showTyping(false)  // Gateway 就绪后关闭加载动画
      // 重连后恢复：保留当前 sessionKey，不重复加载历史
      if (!_sessionKey) {
        const saved = localStorage.getItem(STORAGE_SESSION_KEY)
        const savedGroupId = localStorage.getItem(ACTIVE_GROUP_KEY) || ''
        _sessionKey = saved || sessionKey
        if (savedGroupId && _chatGroups.some(g => g.id === savedGroupId)) {
          switchGroupSession(savedGroupId, { restore: true })
        } else {
          updateSessionTitle()
          loadHistory()
        }
      } else {
        syncWorkspaceContext(false)
      }
      // 始终刷新会话列表（无论是否有 sessionKey）
      refreshSessionList()
    })

    _unsubEvent = wsClient.onEvent((msg) => {
      if (!_pageActive) return
      handleEvent(msg)
    })

    // 如果已连接且 Gateway 就绪，直接复用
    if (wsClient.connected && wsClient.gatewayReady) {
      const saved = localStorage.getItem(STORAGE_SESSION_KEY)
      const savedGroupId = localStorage.getItem(ACTIVE_GROUP_KEY) || ''
      _sessionKey = saved || wsClient.sessionKey
      updateStatusDot('ready')
      showTyping(false)  // 确保关闭加载动画
      if (savedGroupId && _chatGroups.some(g => g.id === savedGroupId)) {
        switchGroupSession(savedGroupId, { restore: true })
      } else {
        updateSessionTitle()
        loadHistory()
      }
      refreshSessionList()
      return
    }

    // 如果正在连接中（重连等），等待 onReady 回调即可
    if (wsClient.connected || wsClient.connecting || wsClient.gatewayReady) return

    // 未连接，发起新连接
    const config = await api.readOpenclawConfig()
    const gw = config?.gateway || {}
    const host = isTauriRuntime() ? `127.0.0.1:${gw.port || 18789}` : location.host
    const token = gw.auth?.token || gw.authToken || ''
    wsClient.connect(host, token)
  } catch (e) {
    toast(`${t('common.loadFailed')}: ${e.message}`, 'error')
  }
}

// ── 会话管理 ──

async function refreshSessionList() {
  if (!_sessionListEl || !wsClient.gatewayReady) return
  try {
    // 聊天页没有独立的会话下拉框，侧边栏必须展示所有可见会话。
    // 不传 activeMinutes，避免只返回活跃会话；includeGlobal/includeUnknown 保持与原生面板一致，防止跨入口会话丢失。
    const result = await wsClient.sessionsList(200, { includeGlobal: true, includeUnknown: true })
    const sessions = normalizeSessionList(result?.sessions || result || [])
    _lastSessionList = sessions
    updateSessionRuntimeCache(sessions, result?.defaults)
    applyRuntimeModelToSelect(_sessionKey)
    renderSessionList(sessions)
  } catch (e) {
    console.error('[chat] refreshSessionList error:', e)
  }
}

function normalizeSessionList(rawSessions = []) {
  const byKey = new Map()
  for (const item of (rawSessions || [])) {
    const key = item.sessionKey || item.key || ''
    if (!key) continue
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, { ...item, key, sessionKey: key })
      continue
    }
    const prevTs = prev.updatedAt || prev.lastActivity || prev.createdAt || 0
    const nextTs = item.updatedAt || item.lastActivity || item.createdAt || 0
    byKey.set(key, nextTs >= prevTs ? { ...prev, ...item, key, sessionKey: key } : { ...item, ...prev, key, sessionKey: key })
  }
  if (_sessionKey && !byKey.has(_sessionKey)) {
    byKey.set(_sessionKey, { key: _sessionKey, sessionKey: _sessionKey, updatedAt: Date.now(), displayName: getDisplayLabel(_sessionKey) })
  }
  return Array.from(byKey.values()).sort((a, b) => (b.updatedAt || b.lastActivity || b.createdAt || 0) - (a.updatedAt || a.lastActivity || a.createdAt || 0))
}


function updateSessionListActiveState() {
  if (!_sessionListEl) return
  _sessionListEl.querySelectorAll('.chat-session-card[data-key]').forEach(card => {
    const key = card.dataset.key || ''
    card.classList.toggle('active', !_currentGroupId && key === _sessionKey)
    card.classList.toggle('selected', _isSessionMultiSelectMode && _selectedSessionKeys.has(key))
  })
  _sessionListEl.querySelectorAll('.chat-session-card[data-group-key]').forEach(card => {
    card.classList.toggle('active', !!_currentGroupId && card.dataset.groupKey === _currentGroupId)
  })
  updateSessionMultiToolbar()
}

function refreshSessionListSoon() {
  renderSessionList(_lastSessionList || [])
  Promise.resolve().then(() => refreshSessionList())
}

function renderSessionList(sessions) {
  if (!_sessionListEl) return
  sessions = normalizeSessionList(sessions)
  const visibleSessions = sessions.filter(s => !isGroupDedicatedSessionKey(s.sessionKey || s.key || ''))
  const visibleKeys = new Set(visibleSessions.map(s => s.sessionKey || s.key || '').filter(Boolean))
  for (const key of Array.from(_selectedSessionKeys)) {
    if (!visibleKeys.has(key)) _selectedSessionKeys.delete(key)
  }
  const normalHtml = visibleSessions.length ? visibleSessions.map(s => renderSessionCard(s)).join('') : `<div class="chat-session-empty">${t('chat.noSessions')}</div>`
  if (_sessionListNormalEl) _sessionListNormalEl.innerHTML = normalHtml
  else _sessionListEl.innerHTML = normalHtml
  renderGroupSessionList()
  updateSessionListActiveState()

  _sessionListEl.onclick = (e) => {
    const checkbox = e.target.closest('[data-select-session]')
    if (checkbox) { e.stopPropagation(); toggleSessionSelection(checkbox.dataset.selectSession); return }
    const delBtn = e.target.closest('[data-del]')
    if (delBtn) { e.stopPropagation(); deleteSession(delBtn.dataset.del); return }
    const groupEdit = e.target.closest('[data-group-edit]')
    if (groupEdit) { e.stopPropagation(); showGroupEditor(groupEdit.dataset.groupEdit); return }
    const groupDel = e.target.closest('[data-group-del]')
    if (groupDel) { e.stopPropagation(); deleteGroupSession(groupDel.dataset.groupDel); return }
    const groupItem = e.target.closest('[data-group-key]')
    if (groupItem) { e.stopPropagation(); switchGroupSession(groupItem.dataset.groupKey); return }
    const item = e.target.closest('[data-key]')
    if (item) {
      if (_isSessionMultiSelectMode) { e.stopPropagation(); toggleSessionSelection(item.dataset.key); return }
      void switchSession(item.dataset.key)
    }
  }
  _sessionListEl.ondblclick = (e) => {
    const labelEl = e.target.closest('.chat-session-label')
    if (!labelEl) return
    const card = labelEl.closest('[data-key]')
    if (!card) return
    if (_isSessionMultiSelectMode) return
    e.stopPropagation()
    renameSession(card.dataset.key, labelEl)
  }
}

function renderSessionCard(s) {
  const key = s.sessionKey || s.key || ''
  const active = !_currentGroupId && key === _sessionKey ? ' active' : ''
  const ts = s.updatedAt || s.lastActivity || s.createdAt || 0
  const timeStr = ts ? formatSessionTime(ts) : ''
  const msgCount = s.messageCount || s.messages || 0
  const agentId = parseSessionAgent(key)
  const model = getSessionDisplayModel(key, s)
  const taskInfo = getCurrentTaskRoundInfo(key, model)
  const ctxTokens = Number(s.contextTokens ?? s.context_tokens ?? s.contextWindow ?? _sessionContextTokens.get(key) ?? _defaultContextTokens ?? 0) || 0
  const totalTokens = Number(s.totalTokens ?? s.total_tokens ?? s.contextUsedTokens ?? s.usedTokens ?? _sessionTokenTotals.get(key) ?? 0) || 0
  const percentUsed = ctxTokens > 0 && totalTokens > 0 ? Math.min(Math.round((totalTokens / ctxTokens) * 100), 100) : (Number.isFinite(Number(s.percentUsed)) ? Number(s.percentUsed) : 0)
  const ctxClass = percentUsed >= 90 ? ' danger' : percentUsed >= 75 ? ' warn' : ''
  const displayLabel = getDisplayLabel(key) || parseSessionLabel(key)
  const selected = _isSessionMultiSelectMode && _selectedSessionKeys.has(key) ? ' selected' : ''
  const checkbox = _isSessionMultiSelectMode ? `<button class="chat-session-check" data-select-session="${escapeAttr(key)}" aria-pressed="${selected ? 'true' : 'false'}" title="${t('chat.toggleSessionSelection')}">${selected ? '✓' : ''}</button>` : ''
  return `<div class="chat-session-card${active}${selected}" data-key="${escapeAttr(key)}">
    <div class="chat-session-card-header">
      ${checkbox}
      <span class="chat-session-label" title="${t('chat.doubleClickRename')}">${escapeAttr(displayLabel)}</span>
      <button class="chat-session-del" data-del="${escapeAttr(key)}" title="${t('common.delete')}">×</button>
    </div>
    <div class="chat-session-card-meta">
      ${agentId && agentId !== 'main' ? `<span class="chat-session-agent">${escapeAttr(agentId)}</span>` : ''}
      ${msgCount > 0 ? `<span>${t('chat.messagesCount', { count: msgCount })}</span>` : ''}
      ${model ? `<span class="chat-session-model" title="${escapeAttr(model)}">${escapeAttr(shortModelName(model))}</span>` : ''}
      <span class="chat-session-rounds" title="${escapeAttr(taskInfo.title)}">${escapeAttr(taskInfo.label)}</span>
      ${ctxTokens > 0 ? `<span class="chat-session-context${ctxClass}" title="${compactNumber(totalTokens)} / ${compactNumber(ctxTokens)}">${t('chat.contextPercent', { percent: percentUsed })}</span>` : ''}
      ${timeStr ? `<span>${timeStr}</span>` : ''}
    </div>
  </div>`
}

function renderGroupSessionList() {
  if (!_sessionListGroupsEl) return
  if (!_chatGroups.length) {
    _sessionListGroupsEl.innerHTML = `<div class="chat-session-empty">${t('chat.noGroupChats')}</div>`
    return
  }
  _sessionListGroupsEl.innerHTML = _chatGroups.map(g => {
    const active = _currentGroupId === g.id ? ' active' : ''
    const members = Array.isArray(g.members) ? g.members : []
    const roundSummary = getGroupRoundSummary(g)
    return `<div class="chat-session-card chat-group-card${active}" data-group-key="${escapeAttr(g.id)}">
      <div class="chat-session-card-header">
        <span class="chat-session-label" title="${escapeAttr(t('chat.groupChatTitle', { name: g.name }))}">${escapeAttr(g.name)}</span>
        <span class="chat-group-actions">
          <button class="chat-session-mini" data-group-edit="${escapeAttr(g.id)}" title="${t('chat.editGroupChat')}">${t('common.edit')}</button>
          <button class="chat-session-del" data-group-del="${escapeAttr(g.id)}" title="${t('chat.deleteGroupChat')}">×</button>
        </span>
      </div>
      <div class="chat-session-card-meta">
        <span class="chat-session-agent">${t('chat.groupChatBadge')}</span>
        <span>${t('chat.membersCount', { count: members.length })}</span>
        <span class="chat-session-rounds" title="${escapeAttr(roundSummary.title)}">${escapeAttr(roundSummary.label)}</span>
      </div>
    </div>`
  }).join('')
}

function formatSessionTime(ts) {
  const d = new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const diffMs = now - d
  if (diffMs < 60000) return t('chat.justNow')
  if (diffMs < 3600000) return t('chat.minutesAgo', { n: Math.floor(diffMs / 60000) })
  if (diffMs < 86400000) return t('chat.hoursAgo', { n: Math.floor(diffMs / 3600000) })
  if (diffMs < 604800000) return t('chat.daysAgo', { n: Math.floor(diffMs / 86400000) })
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
}

function parseSessionAgent(key) {
  const parts = (key || '').split(':')
  return parts.length >= 2 ? parts[1] : ''
}

function parseSessionLabel(key) {
  const parts = (key || '').split(':')
  if (parts.length < 3) return key || t('common.unknown')
  const agent = parts[1] || 'main'
  const channel = parts.slice(2).join(':')
  if (agent === 'main' && channel === 'main') return t('chat.mainSession')
  if (agent === 'main') return channel
  return `${agent} / ${channel}`
}

async function switchSession(newKey, options = {}) {
  const { forceWorkspace = false } = options
  if (!_currentGroupId && newKey === _sessionKey) return false
  const nextAgentId = parseSessionAgent(newKey) || 'main'
  if (!forceWorkspace && _workspaceDirty && nextAgentId !== _workspaceCurrentAgentId) {
    const yes = await confirmWorkspaceDiscardIfNeeded()
    if (!yes) return false
    discardWorkspaceChanges()
  }
  _currentGroupId = ''
  _lastDirectSessionKey = newKey
  _sessionKey = newKey
  localStorage.removeItem(ACTIVE_GROUP_KEY)
  localStorage.setItem(STORAGE_SESSION_KEY, newKey)
  updateSessionListActiveState()
  _lastHistoryHash = ''
  resetStreamState()
  updateSessionTitle()
  applyRuntimeModelToSelect(newKey)
  clearMessages()
  loadHistory()
  refreshSessionListSoon()
  return true
}

async function showNewSessionDialog() {
  const defaultAgent = wsClient.snapshot?.sessionDefaults?.defaultAgentId || 'main'

  // 先用默认选项立即显示弹窗
  const initialOptions = [
    { value: 'main', label: `main ${t('chat.defaultSuffix')}` },
    { value: '__new__', label: `+ ${t('chat.newAgent')}` }
  ]

  showModal({
    title: t('chat.newSession'),
    fields: [
      { name: 'name', label: t('chat.sessionName'), value: '', placeholder: t('chat.sessionNamePlaceholder') },
      { name: 'agent', label: 'Agent', type: 'select', value: defaultAgent, options: initialOptions },
    ],
    onConfirm: (result) => {
      const name = (result.name || '').trim()
      if (!name) { toast(t('chat.enterSessionName'), 'warning'); return }
      const agent = result.agent || defaultAgent
      if (agent === '__new__') {
        navigate('/agents')
        toast(t('chat.createAgentHint'), 'info')
        return
      }
      switchSession(`agent:${agent}:${name}`).then((switched) => {
        if (switched) toast(t('chat.sessionCreated'), 'success')
      })
    }
  })

  // 异步加载完整 Agent 列表并更新下拉框
  try {
    const agents = await api.listAgents()
    const agentOptions = agents.map(a => ({
      value: a.id,
      label: `${a.id}${a.isDefault ? ` ${t('chat.defaultSuffix')}` : ''}${a.identityName ? ' — ' + a.identityName.split(',')[0] : ''}`
    }))
    agentOptions.push({ value: '__new__', label: `+ ${t('chat.newAgent')}` })

    // 更新弹窗中的下拉框选项
    const selectEl = document.querySelector('.modal-overlay [data-name="agent"]')
    if (selectEl) {
      const currentValue = selectEl.value
      selectEl.innerHTML = agentOptions.map(o =>
        `<option value="${o.value}" ${o.value === currentValue ? 'selected' : ''}>${o.label}</option>`
      ).join('')
    }
  } catch (e) {
    console.warn('[chat] 加载 Agent 列表失败:', e)
  }
}

function clearSessionLocalState(key) {
  if (!key) return
  _sessionModels.delete(key)
  _sessionContextTokens.delete(key)
  _sessionTokenTotals.delete(key)
  for (const ctxKey of Object.keys(_taskContexts)) {
    if (ctxKey.startsWith(`${key}@@`)) delete _taskContexts[ctxKey]
  }
  _taskBoard = _taskBoard.filter(task => task.sessionKey !== key)
  _pendingTaskByRunId.forEach((taskId, runId) => {
    if (!_taskBoard.some(task => task.id === taskId)) _pendingTaskByRunId.delete(runId)
  })
  if (_lastSentTaskId && !_taskBoard.some(task => task.id === _lastSentTaskId)) _lastSentTaskId = ''
  saveTaskContexts()
  saveTaskBoard()
  try { wsClient.clearMessageCache(key) } catch {}
  clearSessionMessages(key).catch(() => {})
  try { localStorage.removeItem(getReplyStatusKey(key)) } catch {}
}

function clearSessionResetLocalState(key, model, prompt) {
  if (!key) return
  _sessionTokenTotals.delete(key)
  _taskBoard = _taskBoard.filter(task => task.sessionKey !== key)
  _pendingTaskByRunId.forEach((taskId, runId) => {
    if (!_taskBoard.some(task => task.id === taskId)) _pendingTaskByRunId.delete(runId)
  })
  if (_lastSentTaskId && !_taskBoard.some(task => task.id === _lastSentTaskId)) _lastSentTaskId = ''
  saveTaskBoard()
  try { wsClient.clearMessageCache(key) } catch {}
  clearSessionMessages(key).catch(() => {})
  try { localStorage.removeItem(getReplyStatusKey(key)) } catch {}
  resetTaskContext(key, model, prompt)
}

async function deleteSession(key) {
  const mainKey = wsClient.snapshot?.sessionDefaults?.mainSessionKey || 'agent:main:main'
  if (key === mainKey) { toast(t('chat.cannotDeleteMain'), 'warning'); return }
  const label = parseSessionLabel(key)
  const yes = await showConfirm(t('chat.confirmDeleteSession', { label }))
  if (!yes) return
  try {
    await wsClient.sessionsDelete(key)
    clearSessionLocalState(key)
    _selectedSessionKeys.delete(key)
    toast(t('chat.sessionDeleted'), 'success')
    if (key === _sessionKey) void switchSession(mainKey, { forceWorkspace: true })
    else refreshSessionList()
  } catch (e) {
    toast(`${t('common.operationFailed')}: ${e.message}`, 'error')
  }
}

function setSessionMultiSelectMode(enabled) {
  _isSessionMultiSelectMode = !!enabled
  if (!_isSessionMultiSelectMode) _selectedSessionKeys.clear()
  _page?.querySelector('#btn-session-multi-select')?.toggleAttribute('hidden', _isSessionMultiSelectMode)
  _page?.querySelector('#chat-session-multi-toolbar')?.toggleAttribute('hidden', !_isSessionMultiSelectMode)
  renderSessionList(_lastSessionList || [])
}

function getVisibleDeletableSessionKeys() {
  const mainKey = wsClient.snapshot?.sessionDefaults?.mainSessionKey || 'agent:main:main'
  return normalizeSessionList(_lastSessionList || [])
    .map(s => s.sessionKey || s.key || '')
    .filter(key => key && key !== mainKey && !isGroupDedicatedSessionKey(key))
}

function toggleSessionSelection(key) {
  if (!key) return
  const mainKey = wsClient.snapshot?.sessionDefaults?.mainSessionKey || 'agent:main:main'
  if (key === mainKey) { toast(t('chat.cannotDeleteMain'), 'warning'); return }
  if (_selectedSessionKeys.has(key)) _selectedSessionKeys.delete(key)
  else _selectedSessionKeys.add(key)
  updateSessionListActiveState()
}

function selectAllVisibleSessions() {
  for (const key of getVisibleDeletableSessionKeys()) _selectedSessionKeys.add(key)
  updateSessionListActiveState()
}

function clearSessionSelection() {
  _selectedSessionKeys.clear()
  updateSessionListActiveState()
}

function updateSessionMultiToolbar() {
  const countEl = _page?.querySelector('#chat-session-selected-count')
  const delBtn = _page?.querySelector('#btn-session-delete-selected')
  const count = _selectedSessionKeys.size
  if (countEl) countEl.textContent = t('chat.selectedSessionsCount', { count })
  if (delBtn) delBtn.disabled = count === 0
}

async function deleteSelectedSessions() {
  const mainKey = wsClient.snapshot?.sessionDefaults?.mainSessionKey || 'agent:main:main'
  const keys = Array.from(_selectedSessionKeys).filter(key => key && key !== mainKey)
  if (!keys.length) { toast(t('chat.selectSessionsToDelete'), 'warning'); return }
  const yes = await showConfirm(t('chat.confirmDeleteSelectedSessions', { count: keys.length }))
  if (!yes) return
  const failed = []
  for (const key of keys) {
    try {
      await wsClient.sessionsDelete(key)
    } catch (e) {
      failed.push({ key, message: e?.message || String(e) })
    }
  }
  for (const key of keys) {
    if (!failed.some(item => item.key === key)) {
      clearSessionLocalState(key)
      _selectedSessionKeys.delete(key)
    }
  }
  const deletedCount = keys.length - failed.length
  if (deletedCount) toast(t('chat.selectedSessionsDeleted', { count: deletedCount }), 'success')
  if (failed.length) toast(t('chat.selectedSessionsDeleteFailed', { count: failed.length, msg: failed[0].message }), 'error')
  const currentDeleted = keys.includes(_sessionKey) && !failed.some(item => item.key === _sessionKey)
  if (currentDeleted) await switchSession(mainKey, { forceWorkspace: true })
  else refreshSessionList()
  if (!_selectedSessionKeys.size) setSessionMultiSelectMode(false)
}

async function resetCurrentSession() {
  if (!_sessionKey) return
  const group = _currentGroupId ? ensureGroupIsolation(_chatGroups.find(g => g.id === _currentGroupId)) : null
  const label = group ? t('chat.groupChatTitle', { name: group.name }) : getDisplayLabel(_sessionKey)
  const yes = await showConfirm(group ? t('chat.confirmResetGroupChat', { label }) : t('chat.confirmResetSession', { label }))
  if (!yes) return
  try {
    if (group) {
      const members = Array.isArray(group.members) ? group.members : []
      for (const member of members) {
        if (!member.sessionKey) continue
        await wsClient.sessionsReset(member.sessionKey)
        clearSessionResetLocalState(member.sessionKey, getSessionDisplayModel(member.sessionKey), t('chat.groupResetTaskReason'))
      }
      clearMessages()
      _lastHistoryHash = ''
      appendSystemMessage(t('chat.groupResetDoneMessage', { name: group.name }))
      toast(t('chat.groupResetDoneToast'), 'success')
      return
    }
    await wsClient.sessionsReset(_sessionKey)
    clearSessionResetLocalState(_sessionKey, getSessionDisplayModel(_sessionKey), t('chat.resetTaskReason'))
    clearMessages()
    _lastHistoryHash = ''
    appendSystemMessage(t('chat.sessionResetDone'))
    toast(t('chat.sessionResetWithTaskContext'), 'success')
  } catch (e) {
    toast(`${t('common.operationFailed')}: ${e.message}`, 'error')
  }
}

function updateSessionTitle() {
  const el = _page?.querySelector('#chat-title')
  if (el) {
    const group = _currentGroupId ? ensureGroupIsolation(_chatGroups.find(g => g.id === _currentGroupId)) : null
    el.textContent = group ? t('chat.groupChatTitle', { name: group.name }) : getDisplayLabel(_sessionKey)
  }
  syncWorkspaceContext(false)
}

function renameSession(key, labelEl) {
  const current = getDisplayLabel(key)
  const input = document.createElement('input')
  input.type = 'text'
  input.value = current
  input.className = 'chat-session-rename-input'
  input.style.cssText = 'width:100%;padding:2px 6px;border:1px solid var(--accent);border-radius:4px;background:var(--bg-secondary);color:var(--text-primary);font-size:12px;outline:none'
  const originalText = labelEl.textContent
  labelEl.textContent = ''
  labelEl.appendChild(input)
  input.focus()
  input.select()

  let done = false
  const finish = () => {
    if (done) return
    done = true
    const newName = input.value.trim()
    if (newName && newName !== parseSessionLabel(key)) {
      setSessionName(key, newName)
      toast(t('chat.sessionRenamed'), 'success')
    } else if (!newName || newName === parseSessionLabel(key)) {
      setSessionName(key, '') // clear custom name
    }
    labelEl.textContent = getDisplayLabel(key)
    // 如果是当前会话，同步更新顶部标题
    if (key === _sessionKey) updateSessionTitle()
  }
  input.addEventListener('blur', finish)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur() }
    if (e.key === 'Escape') { input.value = originalText; input.blur() }
  })
}

// ── 快捷指令面板 ──

function showCmdPanel() {
  if (!_cmdPanelEl) return
  let html = ''
  for (const group of COMMANDS) {
    html += `<div class="cmd-group-title">${t(group.title)}</div>`
    for (const c of group.commands) {
      html += `<div class="cmd-item" data-cmd="${c.cmd}" data-action="${c.action}">
        <span class="cmd-name">${c.cmd}</span>
        <span class="cmd-desc">${t(c.desc)}</span>
      </div>`
    }
  }
  _cmdPanelEl.innerHTML = html
  _cmdPanelEl.style.display = 'block'
  _cmdPanelEl.onclick = (e) => {
    const item = e.target.closest('.cmd-item')
    if (!item) return
    hideCmdPanel()
    if (item.dataset.action === 'fill') {
      _textarea.value = item.dataset.cmd
      _textarea.focus()
      updateSendState()
    } else if (item.dataset.action === 'navigate') {
      // 快捷指令：跳转到对应页面
      const cmd = item.dataset.cmd
      if (cmd === '/miaogu') navigate('/miaogu-verify')
      else if (cmd === '/weiyan') navigate('/weiyan-verify')
      else {
        _textarea.value = cmd
        sendMessage()
      }
    } else {
      _textarea.value = item.dataset.cmd
      sendMessage()
    }
  }
}

function hideCmdPanel() {
  if (_cmdPanelEl) _cmdPanelEl.style.display = 'none'
}

function toggleCmdPanel() {
  if (_cmdPanelEl?.style.display === 'block') hideCmdPanel()
  else { _textarea.value = '/'; showCmdPanel(); _textarea.focus() }
}

function mapReplyStateToLobsterPhase(state) {
  return ({
    queued: 'ack',
    sending: 'working',
    thinking: 'thinking',
    tool: 'tool',
    streaming: 'streaming',
    finalizing: 'verifying',
    done: 'done',
    waiting: 'idle',
    error: 'error',
    aborted: 'aborted',
  })[state] || 'working'
}

function emitLobsterPhase(phase, message) {
  try {
    window.dispatchEvent(new CustomEvent('lobster-work-start', {
      detail: {
        phase,
        state: phase === 'done' ? 'idle' : (phase === 'tool' ? 'tool' : 'writing'),
        message: message || phase,
      }
    }))
    if (phase === 'done') window.dispatchEvent(new CustomEvent('lobster-work-end'))
  } catch {}
}

function loadGroupSessions() {
  try { _chatGroups = (JSON.parse(localStorage.getItem(GROUP_SESSIONS_KEY) || '[]') || []).map(normalizeGroup) } catch { _chatGroups = [] }
}

function saveGroupSessions() {
  try { localStorage.setItem(GROUP_SESSIONS_KEY, JSON.stringify(_chatGroups)) } catch (e) { console.warn('[chat] 保存群聊失败:', e) }
}

function loadTaskBoard() {
  try { _taskBoard = JSON.parse(localStorage.getItem(TASK_BOARD_KEY) || '[]') || [] } catch { _taskBoard = [] }
}

function saveTaskBoard() {
  try { localStorage.setItem(TASK_BOARD_KEY, JSON.stringify(_taskBoard.slice(0, 200))) } catch (e) { console.warn('[chat] 保存任务清单失败:', e) }
}

function loadTaskContexts() {
  try { _taskContexts = JSON.parse(localStorage.getItem(TASK_CONTEXT_KEY) || '{}') || {} } catch { _taskContexts = {} }
}

function saveTaskContexts() {
  try { localStorage.setItem(TASK_CONTEXT_KEY, JSON.stringify(_taskContexts)) } catch (e) { console.warn('[chat] 保存任务上下文失败:', e) }
}

function shortModelName(model) {
  const value = normalizeModelValue(model) || ''
  return value.includes('/') ? value.split('/').pop() : value
}

function getSessionDisplayModel(sessionKey, source = {}) {
  return normalizeModelValue(source.model || source.runtimeModel || source.currentModel || getSessionRuntimeModel(sessionKey) || _selectedModel || _primaryModel || '', source.modelProvider || source.provider || '')
}

function taskContextKey(sessionKey, model) {
  return `${sessionKey || ''}@@${normalizeModelValue(model) || 'unknown'}`
}

function ensureTaskContext(sessionKey, model, prompt = '') {
  const key = taskContextKey(sessionKey, model)
  let ctx = _taskContexts[key]
  if (!ctx) {
    ctx = { taskId: uuid(), sessionKey, model: normalizeModelValue(model) || 'unknown', prompt: prompt || '当前任务', roundCount: 0, createdAt: Date.now(), updatedAt: Date.now() }
    _taskContexts[key] = ctx
    saveTaskContexts()
  }
  return ctx
}

function resetTaskContext(sessionKey, model, prompt = '重新对话') {
  const key = taskContextKey(sessionKey, model)
  const ctx = { taskId: uuid(), sessionKey, model: normalizeModelValue(model) || 'unknown', prompt, roundCount: 0, createdAt: Date.now(), updatedAt: Date.now() }
  _taskContexts[key] = ctx
  saveTaskContexts()
  refreshSessionList()
  return ctx
}

function getCurrentTaskRoundInfo(sessionKey, model) {
  const normalized = normalizeModelValue(model) || getSessionRuntimeModel(sessionKey) || _selectedModel || _primaryModel || 'unknown'
  const ctx = _taskContexts[taskContextKey(sessionKey, normalized)]
  const rounds = Number(ctx?.roundCount || 0)
  const modelLabel = shortModelName(normalized) || t('chat.modelFallback')
  return {
    label: t('chat.currentTaskRoundsLabel', { model: modelLabel, rounds }),
    title: ctx?.prompt
      ? t('chat.currentTaskRoundsTitle', { prompt: ctx.prompt, model: normalized, rounds })
      : t('chat.currentTaskNotStartedTitle', { model: normalized, rounds }),
    rounds
  }
}

function getGroupRoundSummary(group) {
  const members = Array.isArray(group?.members) ? group.members : []
  const lines = []
  let total = 0
  for (const m of members) {
    const model = getSessionDisplayModel(m.sessionKey)
    const info = getCurrentTaskRoundInfo(m.sessionKey, model)
    total += info.rounds
    lines.push(t('chat.groupMemberRoundLine', { member: m.label || getDisplayLabel(m.sessionKey), model: shortModelName(model), rounds: info.rounds }))
  }
  return { label: t('chat.groupCurrentTaskRounds', { rounds: total }), title: lines.join('\n') || t('chat.groupNoMemberRounds') }
}

function createTaskRecord({ sessionKey, agentId = '', model = '', prompt = '', source = 'single', groupId = '', title = '' }) {
  const normalizedModel = normalizeModelValue(model) || getSessionDisplayModel(sessionKey)
  const ctx = ensureTaskContext(sessionKey, normalizedModel, prompt)
  const task = {
    id: uuid(), taskId: ctx.taskId, sessionKey, agentId: agentId || parseSessionAgent(sessionKey) || 'main', model: normalizedModel,
    title: title || prompt.slice(0, 48) || t('chat.newTask'), prompt, status: 'sending', progress: TASK_PROGRESS.sending,
    runId: '', error: '', source, groupId, roundCount: ctx.roundCount || 0, createdAt: Date.now(), updatedAt: Date.now(), completedAt: null, highlighted: false,
  }
  _taskBoard.unshift(task)
  saveTaskBoard()
  _lastSentTaskId = task.id
  return task
}

function updateTask(taskId, patch = {}) {
  const task = _taskBoard.find(t => t.id === taskId)
  if (!task) return null
  Object.assign(task, patch, { updatedAt: Date.now() })
  saveTaskBoard()
  updateOpenTaskBoardModal()
  return task
}

function updateTaskByRunOrSession(runId, sessionKey, patch = {}) {
  let task = runId ? _taskBoard.find(t => t.runId === runId) : null
  if (!task && runId && _pendingTaskByRunId.has(runId)) task = _taskBoard.find(t => t.id === _pendingTaskByRunId.get(runId))
  if (!task && sessionKey) task = _taskBoard.find(t => t.sessionKey === sessionKey && ['sending', 'queued', 'thinking', 'streaming', 'tool', 'finalizing', 'running'].includes(t.status))
  if (!task && _lastSentTaskId) {
    const lastTask = _taskBoard.find(t => t.id === _lastSentTaskId)
    if (lastTask && (!sessionKey || lastTask.sessionKey === sessionKey)) task = lastTask
  }
  if (!task) return null
  if (runId && !task.runId) {
    task.runId = runId
    _pendingTaskByRunId.set(runId, task.id)
  }
  return updateTask(task.id, patch)
}

function getBusyGroupMemberLabels(group, excludeSessionKeys = []) {
  if (!group) return []
  const exclude = new Set(excludeSessionKeys.filter(Boolean))
  const busyStatuses = ['sending', 'queued', 'thinking', 'streaming', 'tool', 'finalizing', 'running']
  const labels = []
  for (const member of group.members || []) {
    const sessionKey = member.sessionKey
    if (!sessionKey || exclude.has(sessionKey)) continue
    const busy = _taskBoard.some(t => t.sessionKey === sessionKey && busyStatuses.includes(t.status))
    if (busy) labels.push(getGroupMemberLabel(member, sessionKey))
  }
  return labels
}

function maybeNotifyBusyGroupMembers(group, excludeSessionKeys = []) {
  const labels = getBusyGroupMemberLabels(group, excludeSessionKeys)
  if (!labels.length) return
  appendSystemMessage(t('chat.groupMembersRunningNotice', { members: labels.join(t('chat.groupMemberListSeparator')) }))
}

function completeTaskRound(task) {
  if (!task || task._roundCounted) return
  const ctx = ensureTaskContext(task.sessionKey, task.model, task.prompt)
  ctx.roundCount = Number(ctx.roundCount || 0) + 1
  ctx.updatedAt = Date.now()
  task.roundCount = ctx.roundCount
  task._roundCounted = true
  saveTaskContexts()
  saveTaskBoard()
  updateOpenTaskBoardModal()
}

function escapeRegExp(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseGroupMentions(text, group) {
  const members = Array.isArray(group?.members) ? group.members : []
  if (!members.length) return { targets: [], cleanText: text }
  if (/@(全部|all)(?=\s|$|：|:)/i.test(text)) return { targets: members, cleanText: text.replace(/@(全部|all)(?=\s|$|：|:)/ig, '').trim() }
  const targets = []
  let cleanText = text
  for (const m of members) {
    const names = [m.agentId, m.label, parseSessionAgent(m.sessionKey), parseSessionLabel(m.sessionKey), getDisplayLabel(m.sessionKey)].filter(Boolean)
    if (names.some(name => new RegExp(`@${escapeRegExp(name)}(?=\\s|$|：|:)`, 'i').test(text))) {
      targets.push(m)
      names.forEach(name => { cleanText = cleanText.replace(new RegExp(`@${escapeRegExp(name)}(?=\\s|$|：|:)`, 'ig'), '') })
    }
  }
  return { targets: targets.length ? targets : members, cleanText: cleanText.trim() || text }
}

function getActiveGroup() {
  return _currentGroupId ? ensureGroupIsolation(_chatGroups.find(g => g.id === _currentGroupId)) : null
}

function getGroupStorageKey(group) {
  return group?.id ? `group:${group.id}` : ''
}

function hashSessionPart(value = '') {
  const raw = String(value || '')
  let hash = 5381
  for (let i = 0; i < raw.length; i++) hash = ((hash << 5) + hash + raw.charCodeAt(i)) | 0
  return Math.abs(hash).toString(36)
}

function slugifySessionPart(value = '') {
  const raw = String(value || '').trim().toLowerCase()
  const ascii = raw.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32)
  return ascii || `m${hashSessionPart(raw)}`
}

function getGroupMemberSessionKey(group, member) {
  if (!group || !member) return ''
  const sourceKey = member.sourceSessionKey || (isGroupDedicatedSessionKey(member.sessionKey) ? '' : member.sessionKey) || ''
  const agentId = member.agentId || parseSessionAgent(sourceKey || member.sessionKey) || 'main'
  const channelSeed = member.label || getDisplayLabel(sourceKey) || parseSessionLabel(sourceKey) || sourceKey || agentId
  const uniqueSeed = sourceKey || member.groupSessionKey || member.sessionKey || channelSeed
  return `agent:${agentId}:${GROUP_SESSION_CHANNEL_PREFIX}${slugifySessionPart(group.id)}-${slugifySessionPart(channelSeed)}-${hashSessionPart(uniqueSeed)}`
}

function isGroupDedicatedSessionKey(sessionKey = '') {
  const parts = String(sessionKey || '').split(':')
  return parts.length >= 3 && parts.slice(2).join(':').startsWith(GROUP_SESSION_CHANNEL_PREFIX)
}

function normalizeGroupMember(group, member) {
  const hasDedicatedKey = isGroupDedicatedSessionKey(member.sessionKey)
  const sourceSessionKey = member.sourceSessionKey || (hasDedicatedKey ? '' : member.sessionKey) || ''
  const agentId = member.agentId || parseSessionAgent(sourceSessionKey || member.sessionKey) || 'main'
  const label = member.label || getDisplayLabel(sourceSessionKey) || parseSessionLabel(sourceSessionKey || member.sessionKey) || agentId
  const computedGroupSessionKey = sourceSessionKey
    ? getGroupMemberSessionKey(group, { ...member, sourceSessionKey, agentId, label })
    : (member.groupSessionKey || (hasDedicatedKey ? member.sessionKey : getGroupMemberSessionKey(group, { ...member, sourceSessionKey, agentId, label })))
  return { ...member, type: 'session', sourceSessionKey, agentId, label, sessionKey: computedGroupSessionKey, groupSessionKey: computedGroupSessionKey }
}

function normalizeGroup(group) {
  if (!group) return group
  const next = { ...group }
  next.members = (group.members || []).map(m => normalizeGroupMember(next, m))
  return next
}

function ensureGroupIsolation(group) {
  if (!group) return group
  const before = JSON.stringify(group.members || [])
  Object.assign(group, normalizeGroup(group))
  if (JSON.stringify(group.members || []) !== before) saveGroupSessions()
  return group
}

function getGroupFallbackSessionKey(group) {
  return (group?.members || []).find(m => m.sessionKey)?.sessionKey || _lastDirectSessionKey || _sessionKey || 'agent:main:main'
}

function getGroupMemberBySession(group, sessionKey) {
  return (group?.members || []).find(m => m.sessionKey === sessionKey) || null
}

function getGroupMemberLabel(member, sessionKey = '') {
  const label = member?.label || getDisplayLabel(sessionKey) || member?.agentId || parseSessionAgent(sessionKey) || sessionKey || 'Agent'
  return label === 'Agent' && sessionKey ? (getDisplayLabel(sessionKey) || sessionKey) : label
}

function hideMentionPanel() {
  if (_mentionPanelEl) _mentionPanelEl.style.display = 'none'
}

function getMentionTokenInfo() {
  const value = _textarea?.value || ''
  const pos = _textarea?.selectionStart ?? value.length
  const before = value.slice(0, pos)
  const match = before.match(/(^|\s)@([^@\s：:]*)$/)
  if (!match) return null
  return { start: before.length - match[2].length - 1, end: pos, query: match[2] || '' }
}

function updateMentionPanel() {
  const group = getActiveGroup()
  if (!_mentionPanelEl || !group) { hideMentionPanel(); return }
  const info = getMentionTokenInfo()
  if (!info) { hideMentionPanel(); return }
  const q = info.query.toLowerCase()
  const entries = [{ label: t('chat.mentionAll'), value: t('chat.mentionAll'), hint: t('chat.mentionAllHint') }]
  for (const m of group.members || []) {
    const label = getGroupMemberLabel(m, m.sessionKey)
    entries.push({ label, value: label, hint: m.agentId || parseSessionAgent(m.sessionKey) || 'Agent' })
  }
  const filtered = entries.filter(e => !q || e.label.toLowerCase().includes(q) || String(e.hint || '').toLowerCase().includes(q))
  if (!filtered.length) { hideMentionPanel(); return }
  _mentionPanelEl.innerHTML = filtered.map(e => `<button type="button" class="chat-mention-item" data-mention="${escapeAttr(e.value)}"><strong>@${escapeAttr(e.label)}</strong><span>${escapeAttr(e.hint || '')}</span></button>`).join('')
  _mentionPanelEl.style.display = 'block'
}

function insertMention(name) {
  if (!_textarea || !name) return
  const value = _textarea.value || ''
  const pos = _textarea.selectionStart ?? value.length
  const info = getMentionTokenInfo() || { start: pos, end: pos }
  const insert = `@${name} `
  _textarea.value = value.slice(0, info.start) + insert + value.slice(info.end)
  const nextPos = info.start + insert.length
  _textarea.focus()
  _textarea.setSelectionRange(nextPos, nextPos)
  _textarea.dispatchEvent(new Event('input', { bubbles: true }))
  hideMentionPanel()
}

function appendGroupAssistantMessage(group, sessionKey, payload, options = {}) {
  const member = getGroupMemberBySession(group, sessionKey)
  const label = getGroupMemberLabel(member, sessionKey)
  const c = extractChatContent(payload.message)
  const text = c?.text || ''
  const images = c?.images || []
  const videos = c?.videos || []
  const audios = c?.audios || []
  const files = c?.files || []
  const tools = c?.tools || []
  if (!text && !images.length && !videos.length && !audios.length && !files.length && !tools.length) return
  const shouldRender = options.render !== false
  if (shouldRender) appendAiMessage(text, new Date(), images, videos, audios, files, tools, { agentLabel: label, sessionKey, model: extractMessageModel(payload.message || {}) || getSessionRuntimeModel(sessionKey), contextWindow: getContextWindow(sessionKey) })
  const stored = {
    id: payload.runId || uuid(), sessionKey: getGroupStorageKey(group), role: 'assistant', content: text, timestamp: Date.now(), agentLabel: label, sourceSessionKey: sessionKey,
    attachments: images.map(i => ({ category: 'image', mimeType: i.mediaType || 'image/png', url: i.url, content: i.data })).filter(a => a.url || a.content)
  }
  rememberGroupMessage(group, stored)
  saveMessage(stored)
}

function showGroupEditor(groupId = '') {
  const group = _chatGroups.find(g => g.id === groupId) || null
  const existingMembers = new Set((group?.members || []).map(m => m.sourceSessionKey || m.sessionKey))
  wsClient.sessionsList(200, { includeGlobal: true, includeUnknown: true }).then(result => {
    const sessions = normalizeSessionList(result?.sessions || result || [])
    const options = sessions.map(s => {
      const key = s.sessionKey || s.key
      const checked = existingMembers.has(key) ? 'checked' : ''
      return `<label class="chat-group-member-option"><input type="checkbox" value="${escapeAttr(key)}" ${checked}> <span>${escapeAttr(getDisplayLabel(key))}</span><small>${escapeAttr(parseSessionAgent(key) || 'main')}</small></label>`
    }).join('')
    const overlay = showContentModal({
      title: group ? t('chat.editAgentGroupChat') : t('chat.newAgentGroupChat'),
      width: 620,
      content: `<div class="chat-group-editor">
        <label class="form-label">${t('chat.groupChatName')}</label>
        <input class="form-input" id="chat-group-name" value="${escapeAttr(group?.name || '')}" placeholder="${t('chat.groupChatNamePlaceholder')}">
        <div class="form-hint">${t('chat.groupChatMembersHint')}</div>
        <div class="chat-group-member-list">${options || `<div class="chat-session-empty">${t('chat.noSelectableSessions')}</div>`}</div>
      </div>`,
      buttons: [{ id: 'chat-group-save', label: t('chat.saveGroupChat'), className: 'btn btn-primary btn-sm' }]
    })
    overlay.querySelector('#chat-group-save')?.addEventListener('click', () => {
      const name = overlay.querySelector('#chat-group-name')?.value.trim()
      if (!name) { toast(t('chat.enterGroupChatName'), 'warning'); return }
      const selected = Array.from(overlay.querySelectorAll('.chat-group-member-list input:checked')).map(input => {
        const key = input.value
        return { type: 'session', sourceSessionKey: key, agentId: parseSessionAgent(key) || 'main', label: getDisplayLabel(key) }
      })
      if (!selected.length) { toast(t('chat.selectAtLeastOneAgentSession'), 'warning'); return }
      const groupToSave = group || { id: uuid(), name: '', members: [], createdAt: Date.now(), updatedAt: Date.now() }
      Object.assign(groupToSave, { name, members: selected.map(m => normalizeGroupMember(groupToSave, m)), updatedAt: Date.now() })
      if (!group) _chatGroups.unshift(groupToSave)
      saveGroupSessions()
      renderGroupSessionList()
      overlay.close()
      toast(t('chat.groupChatSaved'), 'success')
    })
  }).catch(e => toast(t('chat.loadSessionsFailed', { msg: e.message }), 'error'))
}

async function deleteGroupSession(groupId) {
  const group = ensureGroupIsolation(_chatGroups.find(g => g.id === groupId))
  if (!group) return
  const yes = await showConfirm(t('chat.confirmDeleteGroupChat', { name: group.name }))
  if (!yes) return
  _chatGroups = _chatGroups.filter(g => g.id !== groupId)
  if (_currentGroupId === groupId) _currentGroupId = ''
  saveGroupSessions()
  renderGroupSessionList()
}

async function switchGroupSession(groupId, options = {}) {
  const group = ensureGroupIsolation(_chatGroups.find(g => g.id === groupId))
  if (!group) return
  if (_sessionKey && !_currentGroupId) _lastDirectSessionKey = _sessionKey
  _currentGroupId = groupId
  updateSessionListActiveState()
  localStorage.setItem(ACTIVE_GROUP_KEY, groupId)
  if (!_sessionKey) _sessionKey = getGroupFallbackSessionKey(group)
  updateSessionTitle()
  clearMessages()
  if (isStorageAvailable()) {
    const local = await getLocalMessages(getGroupStorageKey(group), 80)
    _groupTranscripts.set(getGroupStorageKey(group), local)
    local.forEach(msg => {
      if (!msg.content && !msg.attachments?.length) return
      const msgTime = msg.timestamp ? new Date(msg.timestamp) : new Date()
      if (msg.role === 'user') appendUserMessage(msg.content || '', msg.attachments || null, msgTime)
      else if (msg.role === 'assistant') appendAiMessage(msg.content || '', msgTime, (msg.attachments || []).filter(a => a.category === 'image').map(a => ({ mediaType: a.mimeType, data: a.content, url: a.url })), [], [], [], [], { agentLabel: msg.agentLabel || 'Agent', sessionKey: msg.sourceSessionKey || '' })
      else appendSystemMessage(msg.content || '')
    })
  }
  if (!options.restore) {
    toast(t('chat.enteredAgentGroupChat', { name: group.name }), 'success')
  }
  renderSessionList(_lastSessionList)
  updateSessionListActiveState()
  applyRuntimeModelToSelect(getGroupFallbackSessionKey(group))
}

function toggleTaskBoard() {
  const overlay = showContentModal({
    title: t('chat.taskBoard'), width: 900,
    content: `<div class="chat-task-toolbar"><button class="btn btn-sm btn-ghost" id="chat-task-select-all">${t('chat.selectAll')}</button><button class="btn btn-sm btn-danger" id="chat-task-delete-selected">${t('chat.deleteSelected')}</button></div><div id="chat-task-board-modal"></div>`,
    buttons: [{ id: 'chat-task-new', label: t('chat.newTask'), className: 'btn btn-secondary btn-sm' }]
  })
  overlay.classList.add('chat-task-board-overlay')
  overlay.querySelector('#chat-task-new')?.addEventListener('click', () => showTaskEditor(null, overlay))
  overlay.querySelector('#chat-task-select-all')?.addEventListener('click', () => {
    const boxes = Array.from(overlay.querySelectorAll('[data-task-select]'))
    const allChecked = boxes.length && boxes.every(b => b.checked)
    boxes.forEach(b => { b.checked = !allChecked })
  })
  overlay.querySelector('#chat-task-delete-selected')?.addEventListener('click', () => deleteSelectedTasks(overlay))
  updateTaskBoardModal(overlay)
}

function updateOpenTaskBoardModal() {
  const overlay = document.querySelector('.chat-task-board-overlay')
  if (overlay) updateTaskBoardModal(overlay)
}

function updateTaskBoardModal(overlay) {
  const box = overlay?.querySelector('#chat-task-board-modal')
  if (!box) return
  if (!_taskBoard.length) {
    box.innerHTML = `<div class="chat-task-empty">${t('chat.taskBoardEmpty')}</div>`
    return
  }
  const groups = [
    ['running', t('chat.taskGroupRunning'), t => ['sending','queued','thinking','streaming','tool','finalizing','running'].includes(t.status)],
    ['done', t('chat.taskGroupDone'), t => t.status === 'done'],
    ['error', t('chat.taskGroupError'), t => ['error','aborted'].includes(t.status)],
  ]
  box.innerHTML = groups.map(([cls, title, pred]) => {
    const tasks = _taskBoard.filter(pred)
    return `<div class="chat-task-section"><h4>${title}</h4>${tasks.length ? tasks.map(renderTaskCard).join('') : `<div class="chat-task-empty small">${t('chat.none')}</div>`}</div>`
  }).join('')
  box.onclick = (e) => {
    const edit = e.target.closest('[data-task-edit]')
    if (edit) { showTaskEditor(edit.dataset.taskEdit, overlay); return }
    const rerun = e.target.closest('[data-task-rerun]')
    if (rerun) { rerunTask(rerun.dataset.taskRerun); return }
    const del = e.target.closest('[data-task-delete]')
    if (del) { deleteTask(del.dataset.taskDelete); return }
  }
}

function getTaskStatusLabel(status) {
  return ({
    sending: t('chat.taskStatusSending'),
    queued: t('chat.taskStatusQueued'),
    thinking: t('chat.taskStatusThinking'),
    streaming: t('chat.taskStatusStreaming'),
    tool: t('chat.taskStatusTool'),
    finalizing: t('chat.taskStatusFinalizing'),
    done: t('chat.taskStatusDone'),
    error: t('chat.taskStatusError'),
    aborted: t('chat.taskStatusAborted'),
    running: t('chat.taskStatusRunning'),
  })[status] || status
}

function renderTaskCard(task) {
  const statusLabel = getTaskStatusLabel(task.status)
  return `<div class="chat-task-card ${escapeAttr(task.status)} ${task.highlighted ? 'highlight' : ''}">
    <div class="chat-task-head"><label class="chat-task-title"><input type="checkbox" data-task-select value="${escapeAttr(task.id)}"><strong>${escapeAttr(task.title || task.prompt || t('chat.taskFallbackTitle'))}</strong></label><span>${escapeAttr(statusLabel)}</span></div>
    <div class="chat-task-meta">${t('chat.taskCardMeta', { agent: escapeAttr(task.agentId || 'main'), session: escapeAttr(getDisplayLabel(task.sessionKey)), model: escapeAttr(shortModelName(task.model)), round: Number(task.roundCount || 0) })}</div>
    <div class="chat-task-prompt">${escapeAttr(task.prompt || '')}</div>
    <div class="chat-task-progress"><div style="width:${Math.max(0, Math.min(100, Number(task.progress || 0)))}%"></div></div>
    <div class="chat-task-actions"><button class="btn btn-sm btn-ghost" data-task-edit="${escapeAttr(task.id)}">${t('chat.editTask')}</button><button class="btn btn-sm btn-primary" data-task-rerun="${escapeAttr(task.id)}">${t('chat.rerunTask')}</button><button class="btn btn-sm btn-danger" data-task-delete="${escapeAttr(task.id)}">${t('chat.delete')}</button></div>
  </div>`
}

async function deleteTask(taskId) {
  const task = _taskBoard.find(t => t.id === taskId)
  if (!task) return
  const yes = await showConfirm(t('chat.confirmDeleteTask', { title: task.title || task.prompt || t('chat.taskFallbackTitle') }))
  if (!yes) return
  _taskBoard = _taskBoard.filter(t => t.id !== taskId)
  saveTaskBoard()
  updateOpenTaskBoardModal()
  toast(t('chat.taskDeleted'), 'success')
}

async function deleteSelectedTasks(overlay) {
  const ids = Array.from(overlay?.querySelectorAll('[data-task-select]:checked') || []).map(i => i.value).filter(Boolean)
  if (!ids.length) { toast(t('chat.selectTaskToDelete'), 'warning'); return }
  const yes = await showConfirm(t('chat.confirmDeleteSelectedTasks', { count: ids.length }))
  if (!yes) return
  const idSet = new Set(ids)
  _taskBoard = _taskBoard.filter(t => !idSet.has(t.id))
  saveTaskBoard()
  updateOpenTaskBoardModal()
  toast(t('chat.selectedTasksDeleted', { count: ids.length }), 'success')
}

function showTaskEditor(taskId, parentOverlay = null) {
  const task = _taskBoard.find(t => t.id === taskId)
  wsClient.sessionsList(200, { includeGlobal: true, includeUnknown: true }).then(result => {
    const sessions = normalizeSessionList(result?.sessions || result || [])
    const options = sessions.map(s => `<option value="${escapeAttr(s.sessionKey || s.key)}" ${(s.sessionKey || s.key) === (task?.sessionKey || _sessionKey) ? 'selected' : ''}>${escapeAttr(getDisplayLabel(s.sessionKey || s.key))}</option>`).join('')
    const overlay = showContentModal({ title: task ? t('chat.editTask') : t('chat.newTask'), width: 620, content: `<div class="chat-task-editor">
      <label class="form-label">${t('chat.targetSessionAgent')}</label><select class="form-input" id="task-session">${options}</select>
      <label class="form-label">${t('chat.taskContent')}</label><textarea class="form-input" id="task-prompt" rows="6" style="resize:vertical">${escapeAttr(task?.prompt || '')}</textarea>
      <div class="form-hint">${t('chat.taskSubmitHint')}</div>
    </div>`, buttons: [{ id: 'task-save-run', label: t('chat.submitRun'), className: 'btn btn-primary btn-sm' }] })
    overlay.querySelector('#task-save-run')?.addEventListener('click', () => {
      const sessionKey = overlay.querySelector('#task-session')?.value
      const prompt = overlay.querySelector('#task-prompt')?.value.trim()
      if (!sessionKey || !prompt) { toast(t('chat.selectSessionAndTask'), 'warning'); return }
      overlay.close()
      parentOverlay?.close?.()
      submitTaskToSession(sessionKey, prompt, task)
    })
  })
}

function submitTaskToSession(sessionKey, prompt, oldTask = null) {
  const model = getSessionDisplayModel(sessionKey)
  resetTaskContext(sessionKey, model, prompt)
  const task = createTaskRecord({ sessionKey, model, prompt, title: prompt.slice(0, 48), source: 'task-board' })
  if (oldTask) updateTask(oldTask.id, { status: 'aborted', progress: 100, error: t('chat.resubmittedAsNewTask') })
  wsClient.chatSend(sessionKey, prompt)
    .then(() => toast(t('chat.taskSubmitted'), 'success'))
    .catch(e => {
      updateTask(task.id, { status: 'error', progress: 100, error: e.message })
      toast(t('chat.taskSubmitFailed', { msg: e.message }), 'error')
    })
}

function rerunTask(taskId) {
  const task = _taskBoard.find(t => t.id === taskId)
  if (!task) return
  submitTaskToSession(task.sessionKey, task.prompt, task)
}

// ── 消息发送 ──

function sendMessage() {
  const text = _textarea.value.trim()
  if (!text && !_attachments.length) return
  emitLobsterPhase('ack', text ? t('chat.lobsterTaskReceived', { task: text.slice(0, 32) }) : t('chat.lobsterTaskReceivedFallback'))
  if (!wsClient.gatewayReady || !_sessionKey) {
    toast(t('chat.gatewayNotReadySend'), 'warning')
    return
  }
  const activeGroup = _currentGroupId ? ensureGroupIsolation(_chatGroups.find(g => g.id === _currentGroupId)) : null
  if (activeGroup && _isSending) {
    toast(t('chat.groupSendBusy'), 'warning')
    return
  }
  hideCmdPanel()
  _textarea.value = ''
  _textarea.style.height = 'auto'
  updateSendState()
  const attachments = [..._attachments]
  _attachments = []
  renderAttachments()
  if (activeGroup) {
    doGroupSend(activeGroup, text, attachments)
    return
  }
  if (_isSending || _isStreaming) { _messageQueue.push({ text, attachments }); return }
  doSend(text, attachments)
}


function getGroupTranscript(group, limit = 12) {
  const key = getGroupStorageKey(group)
  const list = key ? (_groupTranscripts.get(key) || []) : []
  return list.slice(-limit)
}

function rememberGroupMessage(group, message) {
  const key = getGroupStorageKey(group)
  if (!key || !message) return
  const list = _groupTranscripts.get(key) || []
  list.push(message)
  _groupTranscripts.set(key, list.slice(-80))
}

function buildGroupMemberPrompt(group, target, cleanText, originalText = '') {
  const memberLabel = getGroupMemberLabel(target, target?.sessionKey)
  const members = (group.members || []).map(m => getGroupMemberLabel(m, m.sessionKey)).join(t('chat.groupMemberListSeparator')) || t('chat.groupNoMembers')
  const transcript = getGroupTranscript(group, 14)
    .map(msg => {
      const who = msg.role === 'assistant' ? (msg.agentLabel || 'Agent') : (msg.role === 'user' ? t('chat.groupUser') : t('chat.groupSystem'))
      const content = String(msg.content || '').replace(/\s+/g, ' ').trim()
      return content ? `${who}：${content.slice(0, 500)}` : ''
    })
    .filter(Boolean)
    .join('\n')
  return t('chat.groupMemberPrompt', {
    groupName: group.name,
    memberLabel,
    members,
    transcript: transcript || t('chat.groupNoHistory'),
    originalText: originalText || cleanText,
    cleanText,
  })
}

async function doGroupSend(group, text, attachments = []) {
  const { targets, cleanText } = parseGroupMentions(text, group)
  if (!targets.length) { toast(t('chat.groupNoSendableMembers'), 'warning'); return }
  _isSending = true
  updateSendState()
  appendUserMessage(text, attachments)
  const storedUser = {
    id: uuid(), sessionKey: getGroupStorageKey(group), role: 'user', content: text, timestamp: Date.now(),
    attachments: attachments?.length ? attachments.map(a => ({ category: a.category || 'image', mimeType: a.mimeType || '', content: a.content || '', url: a.url || '' })) : undefined
  }
  rememberGroupMessage(group, storedUser)
  saveMessage(storedUser)
  appendSystemMessage(t('chat.groupTaskSentTo', { targets: targets.map(t => t.label || t.agentId || t.sessionKey).join(t('chat.groupMemberListSeparator')) }))
  maybeNotifyBusyGroupMembers(group, targets.map(t => t.sessionKey))
  try {
    for (const target of targets) {
      const sessionKey = target.sessionKey
      const model = getSessionDisplayModel(sessionKey)
      const groupPrompt = buildGroupMemberPrompt(group, target, cleanText, text)
      const task = createTaskRecord({ sessionKey, agentId: target.agentId, model, prompt: cleanText, source: 'group', groupId: group.id, title: cleanText.slice(0, 48) })
      try {
        await wsClient.chatSend(sessionKey, groupPrompt, attachments.length ? attachments : undefined)
        updateTask(task.id, { status: 'thinking', progress: TASK_PROGRESS.thinking })
      } catch (err) {
        updateTask(task.id, { status: 'error', progress: 100, error: err.message })
        appendSystemMessage(t('chat.groupSendFailed', { target: target.label || sessionKey, msg: err.message }))
      }
    }
  } finally {
    _isSending = false
    updateSendState()
    refreshSessionList()
  }
}

async function doSend(text, attachments = []) {
  if (!wsClient.gatewayReady || !_sessionKey) {
    toast(t('chat.gatewayNotReadySend'), 'warning')
    return
  }
  appendUserMessage(text, attachments)
  emitLobsterPhase(text.includes('主导引擎') || text.includes('协作引擎') ? 'working' : 'thinking', text.includes('主导引擎') || text.includes('协作引擎') ? t('chat.lobsterCollaborativeTask') : t('chat.lobsterAiProcessing'))
  saveMessage({
    id: uuid(), sessionKey: _sessionKey, role: 'user', content: text, timestamp: Date.now(),
    attachments: attachments?.length ? attachments.map(a => ({ category: a.category || 'image', mimeType: a.mimeType || '', content: a.content || '', url: a.url || '' })) : undefined
  })
  const currentTask = createTaskRecord({ sessionKey: _sessionKey, model: getSessionDisplayModel(_sessionKey), prompt: text, source: 'single', title: text.slice(0, 48) })
  showTyping(true)
  _isSending = true
  updateSendState()
  setReplyStatus('sending', replyStatusText('sending'), { runId: _currentRunId || '', activity: t('chat.replyActivitySubmitting') })
  _startResponseWatchdog()
  let sendFailed = false
  try {
    await wsClient.chatSend(_sessionKey, text, attachments.length ? attachments : undefined)
  } catch (err) {
    sendFailed = true
    showTyping(false)
    _cancelResponseWatchdog()
    const errText = translateGatewayError(err.message)
    appendSystemMessage(`${t('chat.sendFailed')}${errText}`)
    setReplyStatus('error', `${t('chat.sendFailed')}${errText}`, { runId: _currentRunId || '', activity: t('chat.sendFailedBeforeModel') })
    updateTask(currentTask.id, { status: 'error', progress: 100, error: errText })
  } finally {
    _isSending = false
    if (_messageQueue.length === 0) emitLobsterPhase('done', t('chat.lobsterTaskDone'))
    updateSendState()
    if (!sendFailed && !_isStreaming) {
      setReplyStatus('thinking', replyStatusText('thinking'), { runId: _currentRunId || '', activity: t('chat.replyActivityWaitingGateway') })
      updateTask(currentTask.id, { status: 'thinking', progress: TASK_PROGRESS.thinking })
    }
  }
}

function processMessageQueue() {
  if (_messageQueue.length === 0 || _isSending || _isStreaming) return
  const msg = _messageQueue.shift()
  if (typeof msg === 'string') doSend(msg, [])
  else doSend(msg.text, msg.attachments || [])
}

function stopGeneration() {
  if (!_sessionKey) return
  wsClient.chatAbort(_sessionKey, _currentRunId || undefined).catch(() => {})
  showTyping(false)
  setReplyStatus('aborted', replyStatusText('aborted'), { runId: _currentRunId || '', activity: t('chat.replyActivityAborted') })
}

// ── 事件处理（参照 clawapp 实现） ──

function handleEvent(msg) {
  const { event, payload } = msg
  if (!payload) return

  if (event === 'agent' && payload?.stream === 'tool' && payload?.data?.toolCallId) {
    const ts = payload.ts
    const toolCallId = payload.data.toolCallId
    const runKey = `${payload.runId}:${toolCallId}`
    if (_toolEventSeen.has(runKey)) return
    _toolEventSeen.add(runKey)
    if (ts) _toolEventTimes.set(toolCallId, ts)
    const current = _toolEventData.get(toolCallId) || {}
    if (payload.data?.args && current.input == null) current.input = payload.data.args
    if (payload.data?.meta && current.output == null) current.output = payload.data.meta
    if (typeof payload.data?.isError === 'boolean' && current.status == null) current.status = payload.data.isError ? 'error' : 'ok'
    if (current.time == null) current.time = ts || null
    _toolEventData.set(toolCallId, current)
    if (payload.runId) {
      const list = _toolRunIndex.get(payload.runId) || []
      if (!list.includes(toolCallId)) list.push(toolCallId)
      _toolRunIndex.set(payload.runId, list)
    }
    // 工具执行反馈：更新 typing 提示文字
    const toolName = payload.data?.name || payload.data?.toolName || ''
    if (toolName) {
      if (payload.sessionKey && payload.sessionKey !== _sessionKey && _sessionKey) return
      if (_currentRunId && payload.runId && payload.runId !== _currentRunId) return
      if (payload.runId) _currentRunId = payload.runId
      _isStreaming = true
      if (!_streamStartTime) _streamStartTime = Date.now()
      updateSendState()
      scheduleStreamSafetyTimeout()
      const toolLabel = formatToolDisplayName(toolName)
      const toolInput = summarizeToolInput(payload.data?.args || payload.data?.input || payload.data?.parameters || '')
      emitLobsterPhase('tool', t('chat.lobsterToolCall', { tool: toolLabel }))
      showTyping(true, t('chat.typingToolCall', { tool: toolLabel }))
      const count = payload.runId ? (_toolRunIndex.get(payload.runId) || []).length : 1
      setReplyStatus('tool', t('chat.typingToolCall', { tool: toolLabel }), { runId: payload.runId, toolName, toolInput, toolCount: count, lastToolAt: Date.now(), activity: toolInput ? t('chat.toolParamsWithValue', { value: toolInput }) : t('chat.waitingToolResult') })
    }
  }

  if (event === 'chat') handleChatEvent(payload)

  // Compaction 状态指示：上游 2026.3.12 新增 status_reaction 事件
  if (event === 'chat.status_reaction' || event === 'status_reaction') {
    const reaction = payload.reaction || payload.emoji || ''
    if (reaction.includes('compact') || reaction === '🗜️' || reaction === '📦') {
      showCompactionHint(true)
    } else if (!reaction || reaction === 'thinking' || reaction === '💭') {
      showCompactionHint(false)
    }
  }
}

function applyStreamText(nextText = '') {
  const text = String(nextText || '')
  if (!text) return false
  const fingerprint = `${text.length}:${text.slice(0, 32)}:${text.slice(-32)}`
  if (fingerprint === _lastStreamDeltaFingerprint) return false
  _lastStreamDeltaFingerprint = fingerprint

  if (!_currentAiText) {
    _currentAiText = text
    return true
  }
  if (text === _currentAiText) return false
  if (text.startsWith(_currentAiText)) {
    _currentAiText = text
    return true
  }
  // Some Gateway/provider paths emit token chunks instead of cumulative text.
  // Treat non-prefix shorter/equal chunks as append-only deltas so streamed replies do not lose words.
  if (text.length <= _currentAiText.length) {
    if (_currentAiText.endsWith(text)) return false
    _currentAiText += text
    return true
  }
  // If the new text is longer but not a prefix, preserve existing output and append the new chunk.
  _currentAiText += text
  return true
}

function reconcileFinalText(finalText = '') {
  const text = String(finalText || '')
  if (!text) return false
  if (text === _currentAiText) return false
  // The final message is the authoritative assistant response. Delta streams can
  // be chunk-based, cumulative, or interrupted by reconnects; replacing here
  // fixes speculative duplicate/missing text before rendering, copying, and
  // local persistence.
  _currentAiText = text
  _lastStreamDeltaFingerprint = ''
  return true
}

function beginStreamBubble(runId = '') {
  if (_currentAiBubble) return
  _currentAiBubble = createStreamBubble()
  _currentRunId = runId || _currentRunId
  _isStreaming = true
  _streamStartTime = Date.now()
  updateSendState()
  setReplyStatus('queued', replyStatusText('queued'), { runId: _currentRunId, activity: t('chat.replyActivityStreamReady') })
}

function isLongRunningReplyState(state = _replyStatusState?.state) {
  return ['queued', 'sending', 'thinking', 'tool', 'streaming', 'finalizing'].includes(state)
}

function scheduleStreamSafetyTimeout() {
  clearTimeout(_streamSafetyTimer)
  _streamSafetyTimer = setTimeout(() => {
    _streamSafetyTimer = null
    if (!_isStreaming) return

    const runId = _currentRunId || _replyStatusState?.runId || ''
    const activeState = _replyStatusState?.state || 'thinking'
    if (_currentAiBubble && _currentAiText) {
      flushStreamRender()
    }

    if (isLongRunningReplyState(activeState)) {
      const elapsed = _streamStartTime ? Date.now() - _streamStartTime : 0
      const detail = activeState === 'tool'
        ? t('chat.streamToolStillRunning')
        : t('chat.streamStillRunning')
      console.warn('[chat] 流式输出暂时无新数据，但 run 仍处于活动状态，继续等待:', runId || '(no-run)')
      setReplyStatus(activeState === 'streaming' ? 'streaming' : activeState, detail, {
        runId,
        activity: t('chat.replyActivityAwaitingMoreEvents', { seconds: Math.max(1, Math.round(elapsed / 1000)) }),
      })
      showTyping(true, detail)
      scheduleStreamSafetyTimeout()
      return
    }

    const timeoutText = t('chat.streamTimeout')
    appendSystemMessage(timeoutText)
    updateTaskByRunOrSession(runId, _sessionKey, { status: 'error', progress: 100, error: timeoutText })
    setReplyStatus('error', timeoutText, { runId, activity: t('chat.checkErrorOrRetryTask') })
    resetStreamState()
    processMessageQueue()
  }, STREAM_IDLE_NOTICE_MS)
}

function handleChatEvent(payload) {
  const { state } = payload
  const runId = payload.runId
  const eventSessionKey = payload.sessionKey || _sessionKey
  const taskPatchState = state === 'delta' ? 'streaming' : (state === 'final' ? 'finalizing' : state)
  const trackedTask = ['queued', 'delta', 'final', 'aborted', 'error'].includes(state)
    ? updateTaskByRunOrSession(runId, eventSessionKey, { status: taskPatchState, progress: TASK_PROGRESS[taskPatchState] || TASK_PROGRESS[state] || 50 })
    : null

  const activeGroup = getActiveGroup()
  const taskGroup = trackedTask?.groupId ? _chatGroups.find(g => g.id === trackedTask.groupId) : null
  const eventGroup = (activeGroup && getGroupMemberBySession(activeGroup, eventSessionKey)) ? activeGroup : (taskGroup && getGroupMemberBySession(taskGroup, eventSessionKey) ? taskGroup : null)
  if (eventGroup) {
    const renderIntoCurrentGroup = activeGroup?.id === eventGroup.id
    if (state === 'queued' && renderIntoCurrentGroup && eventSessionKey !== _sessionKey) {
      const member = getGroupMemberBySession(eventGroup, eventSessionKey)
      if (member) appendSystemMessage(t('chat.groupMemberRunningNotice', { member: getGroupMemberLabel(member, eventSessionKey) }))
      return
    }
    if (state === 'delta') return
    if (state === 'final') {
      const doneTask = updateTaskByRunOrSession(runId, eventSessionKey, { status: 'done', progress: 100, completedAt: Date.now(), highlighted: true }) || trackedTask
      completeTaskRound(doneTask)
      appendGroupAssistantMessage(eventGroup, eventSessionKey, payload, { render: renderIntoCurrentGroup })
      refreshSessionList()
    } else if (state === 'error') {
      const errMsg = translateGatewayError(payload.errorMessage || payload.error?.message || t('common.error'))
      updateTaskByRunOrSession(runId, eventSessionKey, { status: 'error', progress: 100, error: errMsg })
      if (renderIntoCurrentGroup) appendSystemMessage(t('chat.groupMemberReplyFailedNotice', { member: getGroupMemberLabel(getGroupMemberBySession(eventGroup, eventSessionKey), eventSessionKey), msg: errMsg }))
      setReplyStatus('error', errMsg, { runId, sessionKey: eventSessionKey, activity: t('chat.groupMemberReplyFailed') })
    } else if (state === 'aborted') {
      updateTaskByRunOrSession(runId, eventSessionKey, { status: 'aborted', progress: 100 })
    }
    return
  }

  // 群聊会同时把任务发给多个真实会话；非当前会话的事件只更新任务清单和轮次，不渲染到当前聊天窗口，避免串流。
  if (payload.sessionKey && payload.sessionKey !== _sessionKey && _sessionKey) {
    if (state === 'final') {
      const doneTask = updateTaskByRunOrSession(runId, eventSessionKey, { status: 'done', progress: 100, completedAt: Date.now(), highlighted: true }) || trackedTask
      completeTaskRound(doneTask)
      refreshSessionList()
    } else if (state === 'aborted') {
      updateTaskByRunOrSession(runId, eventSessionKey, { status: 'aborted', progress: 100 })
    } else if (state === 'error') {
      const errMsg = translateGatewayError(payload.errorMessage || payload.error?.message || t('common.error'))
      updateTaskByRunOrSession(runId, eventSessionKey, { status: 'error', progress: 100, error: errMsg })
    }
    return
  }

  // 重复 run 过滤：跳过已完成的 runId 的后续事件（Gateway 可能对同一消息触发多个 run）
  if (runId && state === 'final' && _seenRunIds.has(runId)) {
    console.log('[chat] 跳过重复 final, runId:', runId)
    return
  }
  if (runId && state === 'delta' && _seenRunIds.has(runId) && !_isStreaming) {
    console.log('[chat] 跳过已完成 run 的 delta, runId:', runId)
    return
  }

  if (state === 'queued') {
    if (_currentRunId && runId && runId !== _currentRunId) {
      console.warn('[chat] 忽略非当前 run 的 queued，避免串流:', runId, 'current:', _currentRunId)
      return
    }
    _cancelResponseWatchdog()
    if (runId) _currentRunId = runId
    _isStreaming = true
    _streamStartTime = _streamStartTime || Date.now()
    showTyping(true)
    updateSendState()
    setReplyStatus('queued', replyStatusText('queued'), { runId: runId || _currentRunId, activity: t('chat.replyActivityStreamReady') })
    scheduleStreamSafetyTimeout()
    return
  }

  if (state === 'delta') {
    if (_currentRunId && runId && runId !== _currentRunId) {
      console.warn('[chat] 忽略非当前 run 的 delta，避免串流:', runId, 'current:', _currentRunId)
      return
    }
    _cancelResponseWatchdog()
    const c = extractChatContent(payload.message)
    if (c?.images?.length) _currentAiImages = c.images
    if (c?.videos?.length) _currentAiVideos = c.videos
    if (c?.audios?.length) _currentAiAudios = c.audios
    if (c?.files?.length) _currentAiFiles = c.files
    if (c?.tools?.length) _currentAiTools = c.tools
    if (c?.text && applyStreamText(c.text)) {
      showTyping(false)
      beginStreamBubble(runId)
      setReplyStatus('streaming', t('chat.replyStreamingProgress', { count: _currentAiText.length }), { runId: runId || _currentRunId, activity: t('chat.replyActivityReceivingOutput') })
      scheduleStreamSafetyTimeout()
      throttledRender()
    }
    return
  }

  if (state === 'final') {
    if (_currentRunId && runId && runId !== _currentRunId) {
      console.warn('[chat] 忽略非当前 run 的 final，避免覆盖当前流:', runId, 'current:', _currentRunId)
      return
    }
    _cancelResponseWatchdog()
    const c = extractChatContent(payload.message)
    const finalText = c?.text || ''
    const finalImages = c?.images || []
    const finalVideos = c?.videos || []
    const finalAudios = c?.audios || []
    const finalFiles = c?.files || []
    let finalTools = c?.tools || []
    if (!finalTools.length && runId) {
      const ids = _toolRunIndex.get(runId) || []
      finalTools = ids.map(id => mergeToolEventData({ id, name: 'tool' })).filter(Boolean)
    }
    if (finalImages.length) _currentAiImages = finalImages
    if (finalVideos.length) _currentAiVideos = finalVideos
    if (finalAudios.length) _currentAiAudios = finalAudios
    if (finalFiles.length) _currentAiFiles = finalFiles
    if (finalTools.length) _currentAiTools = finalTools
    const hasContent = finalText || _currentAiImages.length || _currentAiVideos.length || _currentAiAudios.length || _currentAiFiles.length || _currentAiTools.length
    // 忽略空 final（Gateway 会为一条消息触发多个 run，部分是空 final）
    if (!_currentAiBubble && !hasContent) return
    // 标记 runId 为已处理，防止重复
    if (runId) {
      _seenRunIds.add(runId)
      if (_seenRunIds.size > 200) {
        const first = _seenRunIds.values().next().value
        _seenRunIds.delete(first)
      }
    }
    showTyping(false)
    // 如果流式阶段没有创建 bubble，从 final message 中提取
    if (!_currentAiBubble && hasContent) {
      _currentAiBubble = createStreamBubble()
      _currentAiText = finalText
    } else if (finalText) {
      reconcileFinalText(finalText)
    }
    if (_currentAiBubble) {
      setReplyStatus('finalizing', replyStatusText('finalizing'), { runId: runId || _currentRunId, activity: t('chat.replyActivityFinalizing', { count: finalTools.length || _currentAiTools.length || 0 }) })
      if (_currentAiBubble.parentElement) _currentAiBubble.parentElement.dataset.rawText = _currentAiText || finalText || ''
      if (_currentAiText) flushStreamRender()
      appendImagesToEl(_currentAiBubble, _currentAiImages)
      appendVideosToEl(_currentAiBubble, _currentAiVideos)
      appendAudiosToEl(_currentAiBubble, _currentAiAudios)
      appendFilesToEl(_currentAiBubble, _currentAiFiles)
      appendToolsToEl(_currentAiBubble, finalTools.length ? finalTools : _currentAiTools)
    }
    // 添加时间戳 + 耗时 + token 消耗
    const wrapper = _currentAiBubble?.parentElement
    if (wrapper) {
      const meta = document.createElement('div')
      meta.className = 'msg-meta'
      let parts = [`<span class="msg-time">${formatTime(new Date())}</span>`]
      // 计算响应耗时
      let durStr = ''
      if (payload.durationMs) {
        durStr = (payload.durationMs / 1000).toFixed(1) + 's'
      } else if (_streamStartTime) {
        durStr = ((Date.now() - _streamStartTime) / 1000).toFixed(1) + 's'
      }
      if (durStr) parts.push(`<span class="meta-sep">·</span><span class="msg-duration">⏱ ${durStr}</span>`)
      const finalMetaSource = {
        ...(payload.message || {}),
        usage: payload.message?.usage || payload.usage,
        cost: payload.message?.cost || payload.cost,
        model: payload.message?.model || payload.model,
        modelProvider: payload.message?.modelProvider || payload.modelProvider || payload.provider,
      }
      const usage = extractMessageUsage(finalMetaSource)
      const cost = extractMessageCost(finalMetaSource)
      const model = extractMessageModel(finalMetaSource) || getSessionRuntimeModel(_sessionKey)
      meta.innerHTML = buildMessageMeta({ time: new Date(), durationMs: payload.durationMs || (_streamStartTime ? Date.now() - _streamStartTime : 0), usage, cost, model, contextWindow: getContextWindow(_sessionKey), showCopy: true, showTranslate: true })
      wrapper.appendChild(meta)
    }
    const doneTask = updateTaskByRunOrSession(runId || _currentRunId, eventSessionKey, { status: 'done', progress: 100, completedAt: Date.now(), highlighted: true })
    completeTaskRound(doneTask)
    setReplyStatus('done', replyStatusText('done'), { runId: runId || _currentRunId, activity: t('chat.replyActivityDone') })
    refreshSessionList()
    if (_currentAiText || _currentAiImages.length) {
      saveMessage({
        id: payload.runId || uuid(), sessionKey: _sessionKey, role: 'assistant',
        content: _currentAiText, timestamp: Date.now(),
        usage: extractMessageUsage(finalMetaSource), cost: extractMessageCost(finalMetaSource), model: extractMessageModel(finalMetaSource) || getSessionRuntimeModel(_sessionKey), contextWindow: getContextWindow(_sessionKey),
        attachments: _currentAiImages.map(i => ({ category: 'image', mimeType: i.mediaType || 'image/png', url: i.url, content: i.data })).filter(a => a.url || a.content)
      })
    }
    // 托管 Agent：捕获 AI 回复，检测停止信号，决定是否继续
    if (shouldCaptureHostedTarget(payload)) {
      const capturedText = finalText || _currentAiText || ''
      if (capturedText) {
        appendHostedTarget(capturedText)
        if (detectStopFromText(capturedText)) {
          appendHostedOutput(t('chat.hostedAutoStopSignal'))
          stopHostedAgent()
        } else {
          maybeTriggerHostedRun()
        }
      }
    }
    resetStreamState()
    _schedulePostFinalCheck()
    processMessageQueue()
    return
  }

  if (state === 'aborted') {
    showTyping(false)
    if (_currentAiBubble && _currentAiText) {
      _currentAiBubble.innerHTML = renderMarkdown(_currentAiText)
    }
    appendSystemMessage(t('chat.generationStopped'))
    updateTaskByRunOrSession(_currentRunId, eventSessionKey, { status: 'aborted', progress: 100 })
    setReplyStatus('aborted', replyStatusText('aborted'), { runId: _currentRunId, activity: t('chat.replyActivityAborted') })
    resetStreamState()
    processMessageQueue()
    return
  }

  if (state === 'error') {
    const errMsg = translateGatewayError(payload.errorMessage || payload.error?.message || t('common.error'))

    // 连接级错误（origin/pairing/auth）拦截，不作为聊天消息显示
    if (/origin not allowed|NOT_PAIRED|PAIRING_REQUIRED|pairing required|device identity changed|auth.*fail/i.test(errMsg)) {
      console.warn('[chat] 拦截连接级错误，不显示为聊天消息:', errMsg)
      setReplyStatus('error', errMsg, { runId: _currentRunId, activity: t('chat.deviceReconnectApprovalNeeded') })
      const overlay = document.getElementById('chat-connect-overlay')
      if (overlay) {
        overlay.style.display = 'flex'
        const desc = document.getElementById('chat-connect-desc')
        if (desc) desc.textContent = errMsg
      }
      return
    }

    // 防抖：如果是相同错误且在 2 秒内，忽略（避免重复显示）
    const now = Date.now()
    if (_lastErrorMsg === errMsg && _errorTimer && (now - _errorTimer < 2000)) {
      console.warn('[chat] 忽略重复错误:', errMsg)
      return
    }
    _lastErrorMsg = errMsg
    _errorTimer = now

    // If an error belongs to another active run, do not let it interrupt the current stream.
    if (_currentRunId && runId && runId !== _currentRunId) {
      console.warn('[chat] 忽略非当前 run 的 error，避免中断当前流:', runId, 'current:', _currentRunId)
      return
    }

    // 如果流式输出中收到错误，保留已收到的内容，但必须结束当前流，避免发送按钮和队列卡死。
    if (_isStreaming || _currentAiBubble) {
      console.warn('[chat] 流式中收到错误，保留部分输出并结束当前流:', errMsg)
      showTyping(false)
      if (_currentAiBubble && _currentAiText) {
        flushStreamRender()
      }
      appendSystemMessage(`${t('chat.errorPrefix')}${errMsg}`)
      updateTaskByRunOrSession(runId || _currentRunId, eventSessionKey, { status: 'error', progress: 100, error: errMsg })
      setReplyStatus('error', `${t('chat.errorPrefix') || ''}${errMsg}`, { runId: runId || _currentRunId, activity: t('chat.checkErrorOrRetryTask') })
      resetStreamState()
      processMessageQueue()
      return
    }

    showTyping(false)
    appendSystemMessage(`${t('chat.errorPrefix')}${errMsg}`)
    updateTaskByRunOrSession(_currentRunId, eventSessionKey, { status: 'error', progress: 100, error: errMsg })
    setReplyStatus('error', `${t('chat.errorPrefix') || ''}${errMsg}`, { runId: _currentRunId, activity: t('chat.checkErrorOrRetryTask') })
    resetStreamState()
    processMessageQueue()
    return
  }
}

function translateGatewayError(message = '') {
  const raw = String(message || '')
  const req = raw.match(/requestId:\s*([^)\s]+)/i)?.[1]
  if (/pairing required|PAIRING_REQUIRED|device identity changed/i.test(raw)) {
    return t('chat.gatewayPairingChanged', { request: req ? t('chat.gatewayRequestIdSuffix', { request: req }) : '' })
  }
  if (/origin not allowed/i.test(raw)) return t('chat.gatewayOriginNotAllowed')
  if (/NOT_PAIRED/i.test(raw)) return t('chat.gatewayNotPaired')
  return raw
}

/** 从 Gateway message 对象提取文本和所有媒体（参照 clawapp extractContent） */
function extractChatContent(message) {
  if (!message || typeof message !== 'object') return null
  const tools = []
  collectToolsFromMessage(message, tools)
  if (message.role === 'tool' || message.role === 'toolResult') {
    const output = typeof message.content === 'string' ? message.content : null
    if (!tools.length) {
      tools.push({
        name: message.name || message.tool || message.tool_name || 'tool',
        input: message.input || message.args || message.parameters || null,
        output: output || message.output || message.result || null,
        status: message.status || 'ok',
      })
    } else if (output && !tools[0].output) {
      tools[0].output = output
    }
    return { text: '', images: [], videos: [], audios: [], files: [], tools }
  }
  const content = message.content
  if (typeof content === 'string') return { text: stripThinkingTags(content), images: [], videos: [], audios: [], files: [], tools }
  if (Array.isArray(content)) {
    const texts = [], images = [], videos = [], audios = [], files = []
    for (const block of content) {
      if (block.type === 'text' && typeof block.text === 'string') texts.push(block.text)
      else if (block.type === 'image' && !block.omitted) {
        if (block.data) images.push({ mediaType: block.mimeType || 'image/png', data: block.data })
        else if (block.source?.type === 'base64' && block.source.data) images.push({ mediaType: block.source.media_type || 'image/png', data: block.source.data })
        else if (block.url || block.source?.url) images.push({ url: block.url || block.source.url, mediaType: block.mimeType || 'image/png' })
      }
      else if (block.type === 'image_url' && block.image_url?.url) images.push({ url: block.image_url.url, mediaType: 'image/png' })
      else if (block.type === 'video') {
        if (block.data) videos.push({ mediaType: block.mimeType || 'video/mp4', data: block.data })
        else if (block.url) videos.push({ url: block.url, mediaType: block.mimeType || 'video/mp4' })
      }
      else if (block.type === 'audio' || block.type === 'voice') {
        if (block.data) audios.push({ mediaType: block.mimeType || 'audio/mpeg', data: block.data, duration: block.duration })
        else if (block.url) audios.push({ url: block.url, mediaType: block.mimeType || 'audio/mpeg', duration: block.duration })
      }
      else if (block.type === 'file' || block.type === 'document') {
        files.push({ url: block.url || '', name: block.fileName || block.name || 'file', mimeType: block.mimeType || '', size: block.size, data: block.data })
      }
      else if (block.type === 'tool' || block.type === 'tool_use' || block.type === 'tool_call' || block.type === 'toolCall') {
        const callId = block.id || block.tool_call_id || block.toolCallId
        upsertTool(tools, {
          id: callId,
          name: block.name || block.tool || block.tool_name || block.toolName || 'tool',
          input: block.input || block.args || block.parameters || block.arguments || null,
          output: null,
          status: block.status || 'ok',
          time: resolveToolTime(callId, message.timestamp),
        })
      }
      else if (block.type === 'tool_result' || block.type === 'toolResult') {
        const resId = block.id || block.tool_call_id || block.toolCallId
        upsertTool(tools, {
          id: resId,
          name: block.name || block.tool || block.tool_name || block.toolName || 'tool',
          input: block.input || block.args || null,
          output: block.output || block.result || block.content || null,
          status: block.status || 'ok',
          time: resolveToolTime(resId, message.timestamp),
        })
      }
    }
    if (tools.length) {
      tools.forEach(t => {
        if (typeof t.input === 'string') t.input = stripAnsi(t.input)
        if (typeof t.output === 'string') t.output = stripAnsi(t.output)
      })
    }
    // 从 mediaUrl/mediaUrls 提取
    const mediaUrls = message.mediaUrls || (message.mediaUrl ? [message.mediaUrl] : [])
    for (const url of mediaUrls) {
      if (!url) continue
      if (/\.(mp4|webm|mov|mkv)(\?|$)/i.test(url)) videos.push({ url, mediaType: 'video/mp4' })
      else if (/\.(mp3|wav|ogg|m4a|aac|flac)(\?|$)/i.test(url)) audios.push({ url, mediaType: 'audio/mpeg' })
      else if (/\.(jpe?g|png|gif|webp|heic|svg)(\?|$)/i.test(url)) images.push({ url, mediaType: 'image/png' })
      else files.push({ url, name: url.split('/').pop().split('?')[0] || 'file', mimeType: '' })
    }
    const text = texts.length ? stripThinkingTags(texts.join('\n')) : ''
    return { text, images, videos, audios, files, tools }
  }
  if (typeof message.text === 'string') return { text: stripThinkingTags(message.text), images: [], videos: [], audios: [], files: [], tools: [] }
  return null
}

function stripAnsi(text) {
  if (!text) return ''
  return text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
}

function escapeHtml(text) {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

function stripThinkingTags(text) {
  const safe = stripAnsi(text)
  return safe
    .replace(/<\s*think(?:ing)?\s*>[\s\S]*?<\s*\/\s*think(?:ing)?\s*>/gi, '')
    .replace(/Conversation info \(untrusted metadata\):\s*```json[\s\S]*?```\s*/gi, '')
    .replace(/\[Queued messages while agent was busy\]\s*---\s*Queued #\d+\s*/gi, '')
    .trim()
}

function normalizeTime(raw) {
  if (!raw) return null
  if (raw instanceof Date) return raw.getTime()
  if (typeof raw === 'string') {
    const num = Number(raw)
    if (!Number.isNaN(num)) raw = num
    else {
      const parsed = Date.parse(raw)
      return Number.isNaN(parsed) ? null : parsed
    }
  }
  if (typeof raw === 'number' && raw < 1e12) return raw * 1000
  return raw
}

function resolveToolTime(toolId, messageTimestamp) {
  const eventTs = toolId ? _toolEventTimes.get(toolId) : null
  return normalizeTime(eventTs) || normalizeTime(messageTimestamp) || null
}

function getToolTime(tool) {
  const raw = tool?.end_time || tool?.endTime || tool?.timestamp || tool?.time || tool?.started_at || tool?.startedAt || null
  return normalizeTime(raw)
}

function safeStringify(value) {
  if (value == null) return ''
  const seen = new WeakSet()
  try {
    return JSON.stringify(value, (key, val) => {
      if (typeof val === 'bigint') return val.toString()
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]'
        seen.add(val)
      }
      return val
    }, 2)
  } catch {
    try { return String(value) } catch { return '' }
  }
}

function formatTime(date) {
  const now = new Date()
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  const isToday = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
  if (isToday) return `${h}:${m}`
  const mon = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${mon}-${day} ${h}:${m}`
}

function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

/** 创建流式 AI 气泡 */
function createStreamBubble() {
  if (!_messagesEl || !_typingEl) return null
  showTyping(false)
  const wrap = document.createElement('div')
  wrap.className = 'msg msg-ai msg-streaming'
  wrap.dataset.rawText = ''
  const bubble = document.createElement('div')
  bubble.className = 'msg-bubble'
  bubble.innerHTML = '<span class="stream-cursor"></span>'
  wrap.appendChild(bubble)
  _messagesEl.insertBefore(wrap, _typingEl)
  scrollToBottom()
  return bubble
}

function getReplyStatusKey(sessionKey = _sessionKey) {
  return CHAT_REPLY_STATUS_STORE_PREFIX + (sessionKey || 'default')
}

function normalizeReplyStatus(raw = {}, sessionKey = _sessionKey) {
  const state = CHAT_REPLY_STATUS_TEXT_KEYS[raw.state] ? raw.state : 'waiting'
  return {
    state,
    detail: raw.detail || replyStatusText(state),
    ts: raw.ts || Date.now(),
    sessionKey: raw.sessionKey || sessionKey || 'default',
    runId: raw.runId || '',
    toolName: raw.toolName || '',
    toolInput: raw.toolInput || '',
    toolCount: Number(raw.toolCount || 0),
    lastToolAt: raw.lastToolAt || 0,
    activity: raw.activity || '',
    model: raw.model || '',
    agentId: raw.agentId || '',
  }
}

function persistReplyStatus(status = _replyStatusState) {
  if (!status?.sessionKey || !isStorageAvailable()) return
  try { localStorage.setItem(getReplyStatusKey(status.sessionKey), JSON.stringify(status)) } catch {}
}

function loadReplyStatus(sessionKey = _sessionKey) {
  if (!sessionKey || !isStorageAvailable()) return null
  try {
    const raw = JSON.parse(localStorage.getItem(getReplyStatusKey(sessionKey)) || 'null')
    return raw ? normalizeReplyStatus(raw, sessionKey) : null
  } catch { return null }
}

function formatStatusElapsed(status = _replyStatusState) {
  if (!status?.ts) return t('chat.idle')
  const seconds = Math.max(0, Math.floor((Date.now() - status.ts) / 1000))
  if (status.state === 'waiting') return t('chat.idle')
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
}

function scheduleReplyStatusTimer(status = _replyStatusState) {
  if (_replyStatusTimer) {
    clearInterval(_replyStatusTimer)
    _replyStatusTimer = null
  }
  if (!['queued','sending','thinking','tool','streaming','finalizing'].includes(status?.state)) return
  _replyStatusTimer = setInterval(() => {
    if (_replyStatusElapsedEl) _replyStatusElapsedEl.textContent = formatStatusElapsed(_replyStatusState)
    if (_replyStatusDetailEl) _replyStatusDetailEl.textContent = buildReplyStatusDetail(_replyStatusState)
    markStatusMarquee()
  }, 1000)
}

function markStatusMarquee() {
  for (const el of [_replyStatusTextEl, _replyStatusDetailEl, _replyStatusToolsEl, _replyStatusMetaEl]) {
    if (!el) continue
    el.classList.remove('status-marquee')
  }
}

function formatToolDisplayName(name = '') {
  const raw = String(name || '').trim()
  const lower = raw.toLowerCase()
  const normalized = lower.replace(/[.-]/g, '_')
  const leaf = lower.split(/[.:/]/).filter(Boolean).pop() || lower
  const leafNormalized = leaf.replace(/[.-]/g, '_')
  const map = {
    exec: t('chat.toolNameExec'), shell: t('chat.toolNameExec'), process: t('chat.toolNameProcess'), read: t('chat.toolNameRead'), write: t('chat.toolNameWrite'), edit: t('chat.toolNameEdit'),
    memory_search: t('chat.toolNameMemorySearch'), memory_get: t('chat.toolNameMemoryGet'), session_status: t('chat.toolNameSessionStatus'),
    web_search: t('chat.toolNameWebSearch'), web_fetch: t('chat.toolNameWebFetch'), image: t('chat.toolNameImage'), image_generate: t('chat.toolNameImageGenerate'), video_generate: t('chat.toolNameVideoGenerate'), pdf: t('chat.toolNamePdf'), tts: t('chat.toolNameTts'),
    message: t('chat.toolNameMessage'), cron: t('chat.toolNameCron'), nodes: t('chat.toolNameNodes'), canvas: t('chat.toolNameCanvas'), gateway: t('chat.toolNameGateway'),
    sessions_spawn: t('chat.toolNameSessionsSpawn'), sessions_send: t('chat.toolNameSessionsSend'), sessions_yield: t('chat.toolNameSessionsYield'), sessions_list: t('chat.toolNameSessionsList'), sessions_history: t('chat.toolNameSessionsHistory'), subagents: t('chat.toolNameSubagents'), agents_list: t('chat.toolNameAgentsList'),
    multi_tool_use_parallel: t('chat.toolNameParallelTools'), parallel: t('chat.toolNameParallelTools'),
    tool: t('chat.tool'), update_plan: t('chat.toolNameUpdatePlan'),
  }
  if (map[normalized]) return map[normalized]
  if (normalized.startsWith('functions_') && map[normalized.slice('functions_'.length)]) return map[normalized.slice('functions_'.length)]
  if (normalized.startsWith('tools_') && map[normalized.slice('tools_'.length)]) return map[normalized.slice('tools_'.length)]
  if (map[leafNormalized]) return map[leafNormalized]
  if (!raw) return t('chat.tool')
  const readable = leafNormalized
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
  return readable ? t('chat.toolNameFallback', { name: readable }) : t('chat.tool')
}

function formatToolStatus(status = '') {
  const normalized = String(status || '').trim().toLowerCase().replace(/[.-]/g, '_')
  if (['ok', 'success', 'succeeded', 'done', 'complete', 'completed'].includes(normalized)) return t('chat.toolStatusSuccess')
  if (['error', 'failed', 'fail', 'failure'].includes(normalized)) return t('chat.toolStatusFailed')
  if (['running', 'in_progress', 'progress', 'started'].includes(normalized)) return t('chat.toolStatusRunning')
  if (['pending', 'queued', 'waiting'].includes(normalized)) return t('chat.toolStatusPending')
  if (['approval_pending', 'awaiting_approval', 'needs_approval'].includes(normalized)) return t('chat.toolStatusApprovalPending')
  if (['timeout', 'timed_out', 'expired'].includes(normalized)) return t('chat.toolStatusTimeout')
  if (['skipped', 'ignored', 'noop', 'no_op'].includes(normalized)) return t('chat.toolStatusSkipped')
  if (['cancelled', 'canceled', 'aborted', 'stopped'].includes(normalized)) return t('chat.toolStatusAborted')
  return normalized ? t('chat.toolStatusValue', { status }) : t('chat.toolStatusSuccess')
}

function summarizeToolInput(input) {
  if (input == null || input === '') return ''
  let text = ''
  if (typeof input === 'string') text = input
  else {
    try { text = JSON.stringify(input) } catch { text = String(input) }
  }
  text = text.replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > 96 ? text.slice(0, 96) + '…' : text
}

function buildReplyStatusDetail(status = _replyStatusState) {
  const parts = []
  const model = status.model || getSessionDisplayModel(status.sessionKey || _sessionKey) || getSessionRuntimeModel(status.sessionKey || _sessionKey) || _selectedModel || _primaryModel || ''
  const agent = status.agentId || parseSessionAgent(status.sessionKey || _sessionKey) || 'main'
  if (agent) parts.push(t('chat.replyDetailAgent', { agent }))
  if (model) parts.push(t('chat.replyDetailModel', { model: shortModelName(model) }))
  if (status.runId) parts.push(t('chat.replyDetailRun', { run: String(status.runId).slice(0, 8) }))
  if (status.activity) parts.push(t('chat.replyDetailActivity', { activity: status.activity }))
  return parts.join(' · ')
}

function renderReplyStatus(status = _replyStatusState) {
  if (!_replyStatusRowEl || !_replyStatusTextEl) return
  if (!status || !status.state) {
    _replyStatusRowEl.hidden = true
    return
  }
  _replyStatusRowEl.hidden = false
  _replyStatusRowEl.dataset.state = status.state
  _replyStatusRowEl.dataset.sessionKey = status.sessionKey || _sessionKey || ''
  _replyStatusRowEl.title = status.detail || replyStatusText(status.state) || ''
  const phase = replyStatusPhase(status.state)
  if (_replyStatusPhaseEl) _replyStatusPhaseEl.textContent = phase
  _replyStatusTextEl.textContent = status.detail || replyStatusText(status.state)
  if (_replyStatusDetailEl) _replyStatusDetailEl.textContent = buildReplyStatusDetail(status)
  if (_replyStatusElapsedEl) _replyStatusElapsedEl.textContent = formatStatusElapsed(status)
  if (_replyStatusMetaEl) {
    const hint = ['queued','sending','thinking','tool','streaming','finalizing'].includes(status.state)
      ? t('chat.replyMetaActive')
      : (status.state === 'done' ? t('chat.replyMetaDone') : t('chat.replyMetaWaiting'))
    _replyStatusMetaEl.textContent = hint
  }
  if (_replyStatusToolsEl) {
    _replyStatusToolsEl.textContent = status.toolName
      ? `${t('chat.tool')}：${formatToolDisplayName(status.toolName)}${status.toolCount ? ` · ${t('chat.toolEventCount', { count: status.toolCount })}` : ''}${status.toolInput ? ` · ${t('chat.toolParams')}：${status.toolInput}` : ''}`
      : (status.state === 'tool' ? t('chat.toolWaitingName') : '')
  }
  markStatusMarquee()
  scheduleReplyStatusTimer(status)
}

function setReplyStatus(state, detail = '', options = {}) {
  const sessionKey = options.sessionKey || _sessionKey || _replyStatusState.sessionKey || 'default'
  const previous = _replyStatusState || {}
  const next = normalizeReplyStatus({
    state,
    detail,
    ts: options.ts || (state === previous.state && previous.ts ? previous.ts : Date.now()),
    sessionKey,
    runId: options.runId || _currentRunId || previous.runId || '',
    toolName: options.toolName || previous.toolName || '',
    toolInput: options.toolInput || previous.toolInput || '',
    toolCount: options.toolCount ?? previous.toolCount ?? 0,
    lastToolAt: options.lastToolAt || previous.lastToolAt || 0,
    activity: options.activity || '',
    model: options.model || getSessionDisplayModel(sessionKey) || getSessionRuntimeModel(sessionKey) || previous.model || '',
    agentId: options.agentId || parseSessionAgent(sessionKey) || previous.agentId || 'main',
  }, sessionKey)
  _replyStatusState = next
  persistReplyStatus(next)
  renderReplyStatus(next)
  emitLobsterPhase(mapReplyStateToLobsterPhase(next.state), next.detail || replyStatusText(next.state))
  return next
}

function restoreReplyStatus(sessionKey = _sessionKey) {
  const saved = loadReplyStatus(sessionKey)
  if (saved) {
    _replyStatusState = saved
  } else {
    _replyStatusState = normalizeReplyStatus({ state: 'waiting', sessionKey, ts: Date.now() }, sessionKey)
    persistReplyStatus(_replyStatusState)
  }
  renderReplyStatus(_replyStatusState)
}

function updateStreamingStatus(state, detail = '', options = {}) {
  return setReplyStatus(state, detail, options)
}

// ── 流式渲染（节流） ──

function throttledRender() {
  if (!_currentAiBubble || !_currentAiText) return
  const now = performance.now()
  const elapsed = now - _lastRenderTime
  if (!_renderPending && elapsed >= RENDER_THROTTLE) {
    doRender()
    return
  }
  if (_renderPending) return
  _renderPending = true
  const delay = Math.max(0, RENDER_THROTTLE - elapsed)
  _renderTimer = setTimeout(() => {
    _renderTimer = null
    requestAnimationFrame(() => {
      _renderPending = false
      doRender()
    })
  }, delay)
}

function flushStreamRender() {
  if (_renderTimer) {
    clearTimeout(_renderTimer)
    _renderTimer = null
  }
  _renderPending = false
  doRender()
}

function doRender() {
  _lastRenderTime = performance.now()
  if (_currentAiBubble && _currentAiText) {
    if (_currentAiBubble.parentElement) _currentAiBubble.parentElement.dataset.rawText = _currentAiText || ''
    _currentAiBubble.innerHTML = renderMarkdown(_currentAiText)
    scrollToBottom()
  }
}

// ── 响应看门狗：防止页面卡在等待状态 ──

function _startResponseWatchdog() {
  _cancelResponseWatchdog()
  _responseWatchdog = setTimeout(async () => {
    _responseWatchdog = null
    // 如果还在等待（未开始流式），强制刷新历史
    if (!_isStreaming && _sessionKey && _messagesEl && _pageActive) {
      console.log('[chat] 响应看门狗触发：15s 无 delta，刷新历史')
      const oldHash = _lastHistoryHash
      _lastHistoryHash = ''
      await loadHistory()
      // 如果历史有更新，关闭 typing 指示器
      if (_lastHistoryHash && _lastHistoryHash !== oldHash) {
        showTyping(false)
      } else {
        // 历史没更新，继续等待，再设一轮看门狗
        _startResponseWatchdog()
      }
    }
  }, 15000)
}

function _cancelResponseWatchdog() {
  clearTimeout(_responseWatchdog)
  _responseWatchdog = null
}

function _schedulePostFinalCheck() {
  clearTimeout(_postFinalCheck)
  _postFinalCheck = setTimeout(async () => {
    _postFinalCheck = null
    if (_sessionKey && _messagesEl && _pageActive && !_isStreaming && !_isSending) {
      _lastHistoryHash = ''
      await loadHistory()
    }
  }, 2000)
}

// ensureAiBubble 已被 createStreamBubble 替代

function resetStreamState() {
  clearTimeout(_streamSafetyTimer)
  if (_currentAiBubble && (_currentAiText || _currentAiImages.length || _currentAiVideos.length || _currentAiAudios.length || _currentAiFiles.length || _currentAiTools.length)) {
    flushStreamRender()
    appendImagesToEl(_currentAiBubble, _currentAiImages)
    appendVideosToEl(_currentAiBubble, _currentAiVideos)
    appendAudiosToEl(_currentAiBubble, _currentAiAudios)
    appendFilesToEl(_currentAiBubble, _currentAiFiles)
    appendToolsToEl(_currentAiBubble, _currentAiTools)
  }
  if (_renderTimer) {
    clearTimeout(_renderTimer)
    _renderTimer = null
  }
  _renderPending = false
  _lastRenderTime = 0
  _currentAiBubble = null
  _currentAiText = ''
  _currentAiImages = []
  _currentAiVideos = []
  _currentAiAudios = []
  _currentAiFiles = []
  _currentAiTools = []
  _currentRunId = null
  _lastStreamDeltaFingerprint = ''
  _isStreaming = false
  _streamStartTime = 0
  _lastErrorMsg = null
  _errorTimer = null
  showTyping(false)
  updateSendState()
}

// ── 历史消息加载 ──

async function loadHistory() {
  if (!_sessionKey || !_messagesEl) return
  const sessionKey = _sessionKey
  _isLoadingHistory = true
  const hasExisting = _messagesEl.querySelector('.msg')
  if (!hasExisting && isStorageAvailable()) {
    const local = await getLocalMessages(sessionKey, 200)
    if (!_pageActive || !_messagesEl || _sessionKey !== sessionKey) { _isLoadingHistory = false; return }
    if (local.length) {
      clearMessages()
      local.forEach(msg => {
        if (!msg.content && !msg.attachments?.length) return
        const msgTime = msg.timestamp ? new Date(msg.timestamp) : new Date()
        if (msg.role === 'user') appendUserMessage(msg.content || '', msg.attachments || null, msgTime)
        else if (msg.role === 'assistant') {
          const images = (msg.attachments || []).filter(a => a.category === 'image').map(a => ({ mediaType: a.mimeType, data: a.content, url: a.url }))
          appendAiMessage(msg.content || '', msgTime, images, [], [], [], [], { usage: msg.usage, cost: msg.cost, model: msg.model, contextWindow: msg.contextWindow, sessionKey: msg.sessionKey })
        }
      })
      scrollToBottom()
    }
  }
  if (!wsClient.gatewayReady) { _isLoadingHistory = false; return }
  try {
    const result = await wsClient.chatHistory(sessionKey, 200)
    if (!_pageActive || !_messagesEl || _sessionKey !== sessionKey) { _isLoadingHistory = false; return }
    if (!result?.messages?.length) {
      if (_messagesEl && !_messagesEl.querySelector('.msg')) appendSystemMessage(t('chat.noMessages'))
      return
    }
    const deduped = dedupeHistory(result.messages)
    const hash = deduped.map(m => `${m.role}:${(m.text || '').length}`).join('|')
    if (hash === _lastHistoryHash && hasExisting) return
    _lastHistoryHash = hash

    // 正在发送/流式输出时不全量重绘，避免覆盖本地乐观渲染
    if (hasExisting && (_isSending || _isStreaming || _messageQueue.length > 0)) {
      saveMessages(result.messages.map(m => {
        const c = extractContent(m)
        const role = (m.role === 'tool' || m.role === 'toolResult') ? 'assistant' : m.role
        return { id: m.id || uuid(), sessionKey, role, content: c?.text || '', timestamp: m.timestamp || Date.now(), usage: extractMessageUsage(m), cost: extractMessageCost(m), model: extractMessageModel(m), contextWindow: getContextWindow(sessionKey) }
      }))
      _isLoadingHistory = false
      return
    }

    clearMessages()
    let hasOmittedImages = false
    deduped.forEach(msg => {
      if (!msg.text && !msg.images?.length && !msg.videos?.length && !msg.audios?.length && !msg.files?.length && !msg.tools?.length) return
      const msgTime = msg.timestamp ? new Date(msg.timestamp) : new Date()
      if (msg.role === 'user') {
        const userAtts = msg.images?.length ? msg.images.map(i => ({
          mimeType: i.mediaType || i.media_type || 'image/png',
          content: i.data || i.source?.data || '',
          category: 'image',
        })).filter(a => a.content) : []
        if (msg.images?.length && !userAtts.length) hasOmittedImages = true
        appendUserMessage(msg.text, userAtts, msgTime)
      } else if (msg.role === 'assistant') {
        appendAiMessage(msg.text, msgTime, msg.images, msg.videos, msg.audios, msg.files, msg.tools, { usage: msg.usage, cost: msg.cost, model: msg.model, contextWindow: getContextWindow(sessionKey), sessionKey })
      }
    })
    if (hasOmittedImages) {
      appendSystemMessage(t('chat.imageHistoryHint'))
    }
    saveMessages(result.messages.map(m => {
      const c = extractContent(m)
      const role = (m.role === 'tool' || m.role === 'toolResult') ? 'assistant' : m.role
      return { id: m.id || uuid(), sessionKey, role, content: c?.text || '', timestamp: m.timestamp || Date.now(), usage: extractMessageUsage(m), cost: extractMessageCost(m), model: extractMessageModel(m), contextWindow: getContextWindow(sessionKey) }
    }))
    scrollToBottom()
    restoreReplyStatus()
  } catch (e) {
    console.error('[chat] loadHistory error:', e)
    if (_messagesEl && !_messagesEl.querySelector('.msg')) appendSystemMessage(`${t('common.loadFailed')}: ${e.message}`)
  } finally {
    _isLoadingHistory = false
  }
}

async function forceRefreshChat() {
  if (_isLoadingHistory || !_sessionKey) return
  const btn = document.querySelector('#btn-refresh-chat')
  if (btn) {
    btn.classList.add('spinning')
    btn.disabled = true
  }
  try {
    clearMessages()
    _lastHistoryHash = ''
    _isLoadingHistory = false
    await loadHistory()
    toast(t('chat.chatDataRefreshed'), 'success')
  } catch (e) {
    toast(t('chat.refreshFailed', { msg: e?.message || e }), 'error')
  } finally {
    if (btn) {
      btn.classList.remove('spinning')
      btn.disabled = false
    }
  }
}

function dedupeHistory(messages) {
  const deduped = []
  for (const msg of messages) {
    const role = (msg.role === 'tool' || msg.role === 'toolResult') ? 'assistant' : msg.role
    const c = extractContent(msg)
    if (!c.text && !c.images.length && !c.videos.length && !c.audios.length && !c.files.length && !c.tools.length) continue
    const tools = (c.tools || []).map(t => {
      const id = t.id || t.tool_call_id
      const time = t.time || resolveToolTime(id, msg.timestamp)
      return { ...t, time, messageTimestamp: msg.timestamp }
    })
    const last = deduped[deduped.length - 1]
    if (last && last.role === role) {
      if (role === 'user' && last.text === c.text) continue
      if (role === 'assistant') {
        // 同文本去重（Gateway 重试产生的重复回复）
        if (c.text && last.text === c.text) continue
        // 不同文本则合并
        last.text = [last.text, c.text].filter(Boolean).join('\n')
        last.images = [...(last.images || []), ...c.images]
        last.videos = [...(last.videos || []), ...c.videos]
        last.audios = [...(last.audios || []), ...c.audios]
        last.files = [...(last.files || []), ...c.files]
        tools.forEach(t => upsertTool(last.tools, t))
        if (!last.usage) last.usage = extractMessageUsage(msg)
        if (!last.cost) last.cost = extractMessageCost(msg)
        if (!last.model) last.model = extractMessageModel(msg)
        continue
      }
    }
    deduped.push({ role, text: c.text, images: c.images, videos: c.videos, audios: c.audios, files: c.files, tools, timestamp: msg.timestamp, usage: extractMessageUsage(msg), cost: extractMessageCost(msg), model: extractMessageModel(msg) })
  }
  return deduped
}

function extractContent(msg) {
  const tools = []
  collectToolsFromMessage(msg, tools)
  if (msg.role === 'tool' || msg.role === 'toolResult') {
    const output = typeof msg.content === 'string' ? msg.content : null
    if (!tools.length) {
      upsertTool(tools, {
        id: msg.id || msg.tool_call_id || msg.toolCallId,
        name: msg.name || msg.tool || msg.tool_name || 'tool',
        input: msg.input || msg.args || msg.parameters || null,
        output: output || msg.output || msg.result || null,
        status: msg.status || 'ok',
        time: resolveToolTime(msg.tool_call_id || msg.toolCallId || msg.id, msg.timestamp),
      })
    } else if (output && !tools[0].output) {
      tools[0].output = output
    }
    return { text: '', images: [], videos: [], audios: [], files: [], tools }
  }
  if (Array.isArray(msg.content)) {
    const texts = [], images = [], videos = [], audios = [], files = []
    for (const block of msg.content) {
      if (block.type === 'text' && typeof block.text === 'string') texts.push(block.text)
      else if (block.type === 'image' && !block.omitted) {
        if (block.data) images.push({ mediaType: block.mimeType || 'image/png', data: block.data })
        else if (block.source?.type === 'base64' && block.source.data) images.push({ mediaType: block.source.media_type || 'image/png', data: block.source.data })
        else if (block.url || block.source?.url) images.push({ url: block.url || block.source.url, mediaType: block.mimeType || 'image/png' })
      }
      else if (block.type === 'image_url' && block.image_url?.url) images.push({ url: block.image_url.url, mediaType: 'image/png' })
      else if (block.type === 'video') {
        if (block.data) videos.push({ mediaType: block.mimeType || 'video/mp4', data: block.data })
        else if (block.url) videos.push({ url: block.url, mediaType: block.mimeType || 'video/mp4' })
      }
      else if (block.type === 'audio' || block.type === 'voice') {
        if (block.data) audios.push({ mediaType: block.mimeType || 'audio/mpeg', data: block.data, duration: block.duration })
        else if (block.url) audios.push({ url: block.url, mediaType: block.mimeType || 'audio/mpeg', duration: block.duration })
      }
      else if (block.type === 'file' || block.type === 'document') {
        files.push({ url: block.url || '', name: block.fileName || block.name || 'file', mimeType: block.mimeType || '', size: block.size, data: block.data })
      }
      else if (block.type === 'tool' || block.type === 'tool_use' || block.type === 'tool_call' || block.type === 'toolCall') {
        const callId = block.id || block.tool_call_id || block.toolCallId
        upsertTool(tools, {
          id: callId,
          name: block.name || block.tool || block.tool_name || block.toolName || 'tool',
          input: block.input || block.args || block.parameters || block.arguments || null,
          output: null,
          status: block.status || 'ok',
          time: resolveToolTime(callId, msg.timestamp),
        })
      }
      else if (block.type === 'tool_result' || block.type === 'toolResult') {
        const resId = block.id || block.tool_call_id || block.toolCallId
        upsertTool(tools, {
          id: resId,
          name: block.name || block.tool || block.tool_name || block.toolName || 'tool',
          input: block.input || block.args || null,
          output: block.output || block.result || block.content || null,
          status: block.status || 'ok',
          time: resolveToolTime(resId, msg.timestamp),
        })
      }
    }
    if (tools.length) {
      tools.forEach(t => {
        if (typeof t.input === 'string') t.input = stripAnsi(t.input)
        if (typeof t.output === 'string') t.output = stripAnsi(t.output)
      })
    }
    const mediaUrls = msg.mediaUrls || (msg.mediaUrl ? [msg.mediaUrl] : [])
    for (const url of mediaUrls) {
      if (!url) continue
      if (/\.(mp4|webm|mov|mkv)(\?|$)/i.test(url)) videos.push({ url, mediaType: 'video/mp4' })
      else if (/\.(mp3|wav|ogg|m4a|aac|flac)(\?|$)/i.test(url)) audios.push({ url, mediaType: 'audio/mpeg' })
      else if (/\.(jpe?g|png|gif|webp|heic|svg)(\?|$)/i.test(url)) images.push({ url, mediaType: 'image/png' })
      else files.push({ url, name: url.split('/').pop().split('?')[0] || 'file', mimeType: '' })
    }
    return { text: stripThinkingTags(texts.join('\n')), images, videos, audios, files, tools }
  }
  const text = typeof msg.text === 'string' ? msg.text : (typeof msg.content === 'string' ? msg.content : '')
  return { text: stripThinkingTags(text), images: [], videos: [], audios: [], files: [], tools }
}

// ── DOM 操作 ──

function attachAgentMentionGesture(el, label) {
  if (!el || !label) return
  let timer = null
  const clear = () => { if (timer) { clearTimeout(timer); timer = null } }
  el.addEventListener('pointerdown', () => {
    clear()
    timer = setTimeout(() => insertMention(label), 520)
  })
  el.addEventListener('pointerup', clear)
  el.addEventListener('pointerleave', clear)
  el.addEventListener('click', () => {
    if (getActiveGroup()) insertMention(label)
  })
}

function messageContentToText(content) {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map(block => {
      if (typeof block === 'string') return block
      if (block?.type === 'text' && typeof block.text === 'string') return block.text
      if (typeof block?.content === 'string') return block.content
      return ''
    }).filter(Boolean).join('\n')
  }
  if (typeof content === 'object') {
    if (typeof content.text === 'string') return content.text
    if (typeof content.content === 'string') return content.content
    if (typeof content.message === 'string') return content.message
    try { return JSON.stringify(content, null, 2) } catch { return String(content) }
  }
  return String(content)
}

function getMessageRawText(msgWrap) {
  if (!msgWrap) return ''
  return messageContentToText(msgWrap.dataset?.rawText || msgWrap.querySelector('.msg-text')?.innerText || msgWrap.querySelector('.msg-bubble')?.innerText || '')
}

function isMostlyChinese(text = '') {
  const compact = String(text || '').replace(/```[\s\S]*?```/g, '').replace(/https?:\/\/\S+/g, '').trim()
  if (!compact) return true
  const chinese = (compact.match(/[\u4e00-\u9fff]/g) || []).length
  const letters = (compact.match(/[A-Za-zÀ-ÿА-Яа-яぁ-んァ-ン가-힣]/g) || []).length
  return chinese >= 12 && chinese >= letters * 0.65
}

function translateButtonHtml() {
  return `<button class="msg-translate-btn" title="${escapeAttr(t('chat.translateToChinese'))}">${t('chat.translateShort')}</button>`
}

function translateTitleHtml() {
  return `<div class="msg-translation-title">${t('chat.translationTitle')}</div>`
}

async function translateMessageToChinese(btn) {
  const msgWrap = btn.closest('.msg')
  const bubble = msgWrap?.querySelector('.msg-bubble')
  const rawText = getMessageRawText(msgWrap).trim()
  if (!msgWrap || !rawText) return
  const target = bubble || msgWrap
  if (isMostlyChinese(rawText)) {
    toast(t('chat.alreadyMostlyChinese'), 'info')
    return
  }
  let box = bubble.querySelector('.msg-translation')
  if (box?.dataset.done === '1') {
    box.hidden = !box.hidden
    btn.classList.toggle('active', !box.hidden)
    return
  }
  if (!wsClient.gatewayReady) {
    toast(t('chat.gatewayNotConnectedTranslate'), 'error')
    return
  }
  if (!box) {
    box = document.createElement('div')
    box.className = 'msg-translation'
    target.appendChild(box)
  }
  box.hidden = false
  box.dataset.done = '0'
  box.innerHTML = `${translateTitleHtml()}<div class="msg-translation-loading">${t('chat.translating')}</div>`
  btn.disabled = true
  btn.classList.add('active')
  const oldTitle = btn.title
  btn.title = t('chat.translating')
  try {
    const currentModel = getSessionDisplayModel(_sessionKey)
    const translated = await api.translateText(rawText, currentModel)
    const translatedText = messageContentToText(translated).trim()
    if (!translatedText) throw new Error(t('chat.translationEmpty'))
    box.dataset.done = '1'
    box.innerHTML = `${translateTitleHtml()}<div class="msg-translation-body">${renderMarkdown(translatedText)}</div>`
  } catch (e) {
    const errText = messageContentToText(e?.message || e || t('common.unknown'))
    box.dataset.done = '0'
    box.innerHTML = `${translateTitleHtml()}<div class="msg-translation-error">${t('chat.translationFailed')}: ${escapeHtml(errText)}</div>`
    toast(`${t('chat.translationFailed')}: ${errText}`, 'error')
  } finally {
    btn.disabled = false
    btn.title = oldTitle || t('chat.translateToChinese')
  }
}

function appendUserMessage(text, attachments = [], msgTime, metaData = {}) {
  const wrap = document.createElement('div')
  wrap.className = 'msg msg-user'
  const bubble = document.createElement('div')
  bubble.className = 'msg-bubble'

  if (attachments && attachments.length > 0) {
    const mediaContainer = document.createElement('div')
    mediaContainer.style.cssText = 'display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap'
    attachments.forEach(att => {
      const cat = att.category || att.type || 'image'
      const src = att.data ? `data:${att.mimeType || att.mediaType || 'image/png'};base64,${att.data}`
        : att.content ? `data:${att.mimeType || 'image/png'};base64,${att.content}`
        : att.url || ''
      if (cat === 'image' && src) {
        const img = document.createElement('img')
        img.src = src
        img.className = 'msg-img'
        img.onclick = () => showLightbox(img.src)
        mediaContainer.appendChild(img)
      } else if (cat === 'video' && src) {
        const video = document.createElement('video')
        video.src = src
        video.className = 'msg-video'
        video.controls = true
        video.preload = 'metadata'
        video.playsInline = true
        mediaContainer.appendChild(video)
      } else if (cat === 'audio' && src) {
        const audio = document.createElement('audio')
        audio.src = src
        audio.className = 'msg-audio'
        audio.controls = true
        audio.preload = 'metadata'
        mediaContainer.appendChild(audio)
      } else if (att.fileName || att.name) {
        const card = document.createElement('div')
        card.className = 'msg-file-card'
        card.innerHTML = `<span class="msg-file-icon">${svgIcon('paperclip', 16)}</span><span class="msg-file-name">${escapeHtml(att.fileName || att.name)}</span>`
        mediaContainer.appendChild(card)
      }
    })
    if (mediaContainer.children.length) bubble.appendChild(mediaContainer)
  }

  if (text) {
    const textNode = document.createElement('div')
    textNode.textContent = text
    bubble.appendChild(textNode)
  }

  const meta = document.createElement('div')
  meta.className = 'msg-meta'
  meta.innerHTML = buildMessageMeta({ time: msgTime || new Date(), usage: metaData.usage, cost: metaData.cost, model: metaData.model, contextWindow: metaData.contextWindow || getContextWindow(metaData.sessionKey || _sessionKey), showCopy: true, showTranslate: true })

  wrap.appendChild(bubble)
  wrap.appendChild(meta)
  _messagesEl.insertBefore(wrap, _typingEl)
  scrollToBottom()
}

function appendAiMessage(text, msgTime, images, videos, audios, files, tools, metaData = {}) {
  const wrap = document.createElement('div')
  wrap.className = 'msg msg-ai'
  wrap.dataset.rawText = text || ''
  if (metaData.agentLabel) {
    const name = document.createElement('button')
    name.type = 'button'
    name.className = 'msg-agent-name'
    name.textContent = metaData.agentLabel
    name.title = `长按 @${metaData.agentLabel}`
    attachAgentMentionGesture(name, metaData.agentLabel)
    wrap.appendChild(name)
  }
  const bubble = document.createElement('div')
  bubble.className = 'msg-bubble'
  appendToolsToEl(bubble, tools)
  const textEl = document.createElement('div')
  textEl.className = 'msg-text'
  textEl.innerHTML = renderMarkdown(text || '')
  bubble.appendChild(textEl)
  appendImagesToEl(bubble, images)
  appendVideosToEl(bubble, videos)
  appendAudiosToEl(bubble, audios)
  appendFilesToEl(bubble, files)
  // 图片点击灯箱
  bubble.querySelectorAll('img').forEach(img => { if (!img.onclick) img.onclick = () => showLightbox(img.src) })

  const meta = document.createElement('div')
  meta.className = 'msg-meta'
  meta.innerHTML = `<span class="msg-time">${formatTime(msgTime || new Date())}</span>${translateButtonHtml()}<button class="msg-copy-btn" title="${t('common.copy')}">${svgIcon('copy', 12)}</button>`

  wrap.appendChild(bubble)
  wrap.appendChild(meta)
  _messagesEl.insertBefore(wrap, _typingEl)
  scrollToBottom()
}

/** 渲染图片到消息气泡（支持 Anthropic/OpenAI/直接格式） */
function appendImagesToEl(el, images) {
  if (!images?.length) return
  const container = document.createElement('div')
  container.style.cssText = 'display:flex;gap:6px;margin-top:8px;flex-wrap:wrap'
  images.forEach(img => {
    const imgEl = document.createElement('img')
    // Anthropic 格式: { type: 'image', source: { data, media_type } }
    if (img.source?.data) {
      imgEl.src = `data:${img.source.media_type || 'image/png'};base64,${img.source.data}`
    // 直接格式: { data, mediaType }
    } else if (img.data) {
      imgEl.src = `data:${img.mediaType || img.media_type || 'image/png'};base64,${img.data}`
    // OpenAI 格式: { type: 'image_url', image_url: { url } }
    } else if (img.image_url?.url) {
      imgEl.src = img.image_url.url
    // URL 格式
    } else if (img.url) {
      imgEl.src = img.url
    } else {
      return
    }
    imgEl.style.cssText = 'max-width:300px;max-height:300px;border-radius:6px;cursor:pointer'
    imgEl.onclick = () => showLightbox(imgEl.src)
    container.appendChild(imgEl)
  })
  if (container.children.length) el.appendChild(container)
}

/** 渲染视频到消息气泡 */
function appendVideosToEl(el, videos) {
  if (!videos?.length) return
  videos.forEach(vid => {
    const videoEl = document.createElement('video')
    videoEl.className = 'msg-video'
    videoEl.controls = true
    videoEl.preload = 'metadata'
    videoEl.playsInline = true
    if (vid.data) videoEl.src = `data:${vid.mediaType};base64,${vid.data}`
    else if (vid.url) videoEl.src = vid.url
    el.appendChild(videoEl)
  })
}

/** 渲染音频到消息气泡 */
function appendAudiosToEl(el, audios) {
  if (!audios?.length) return
  audios.forEach(aud => {
    const audioEl = document.createElement('audio')
    audioEl.className = 'msg-audio'
    audioEl.controls = true
    audioEl.preload = 'metadata'
    if (aud.data) audioEl.src = `data:${aud.mediaType};base64,${aud.data}`
    else if (aud.url) audioEl.src = aud.url
    el.appendChild(audioEl)
  })
}

/** 渲染文件卡片到消息气泡 */
function appendFilesToEl(el, files) {
  if (!files?.length) return
  files.forEach(f => {
    const card = document.createElement('div')
    card.className = 'msg-file-card'
    const ext = (f.name || '').split('.').pop().toLowerCase()
    const fileIconMap = { pdf: 'file', doc: 'file-text', docx: 'file-text', txt: 'file-plain', md: 'file-plain', json: 'clipboard', csv: 'bar-chart', zip: 'package', rar: 'package' }
    const fileIcon = svgIcon(fileIconMap[ext] || 'paperclip', 16)
    const size = f.size ? formatFileSize(f.size) : ''
    card.innerHTML = `<span class="msg-file-icon">${fileIcon}</span><div class="msg-file-info"><span class="msg-file-name">${escapeHtml(f.name || 'file')}</span>${size ? `<span class="msg-file-size">${size}</span>` : ''}</div>`
    if (f.url) {
      card.style.cursor = 'pointer'
      card.onclick = () => window.open(f.url, '_blank')
    } else if (f.data) {
      card.style.cursor = 'pointer'
      card.onclick = () => {
        const a = document.createElement('a')
        a.href = `data:${f.mimeType || 'application/octet-stream'};base64,${f.data}`
        a.download = f.name || 'file'
        a.click()
      }
    }
    el.appendChild(card)
  })
}

function mergeToolEventData(entry) {
  const id = entry?.id || entry?.tool_call_id
  if (!id) return entry
  const extra = _toolEventData.get(id)
  if (!extra) return entry
  if (entry.input == null && extra.input != null) entry.input = extra.input
  if (entry.output == null && extra.output != null) entry.output = extra.output
  if (entry.status == null && extra.status != null) entry.status = extra.status
  if (entry.time == null) entry.time = extra.time || _toolEventTimes.get(id) || null
  return entry
}

function upsertTool(tools, entry) {
  if (!entry) return
  const id = entry.id || entry.tool_call_id
  let target = null
  if (id) target = tools.find(t => t.id === id || t.tool_call_id === id)
  if (!target && entry.name) target = tools.find(t => t.name === entry.name && !t.output)
  if (target) {
    if (entry.input != null && target.input == null) target.input = entry.input
    if (entry.output != null && target.output == null) target.output = entry.output
    if (entry.status && target.status == null) target.status = entry.status
    if (entry.time && target.time == null) target.time = entry.time
    return
  }
  tools.push(mergeToolEventData(entry))
}

function collectToolsFromMessage(message, tools) {
  if (!message || !tools) return
  const toolCalls = message.tool_calls || message.toolCalls || message.tools
  if (Array.isArray(toolCalls)) {
    toolCalls.forEach(call => {
      if (!call) return
      const fn = call.function || null
      const name = call?.name || call?.tool || call?.tool_name || fn?.name
      const input = call.input || call.args || call.parameters || call.arguments || fn?.arguments || null
      const callId = call.id || call.tool_call_id
      upsertTool(tools, {
        id: callId,
        name: name || 'tool',
        input,
        output: null,
        status: call.status || 'ok',
        time: resolveToolTime(callId, message?.timestamp),
      })
    })
  }
  const toolResults = message.tool_results || message.toolResults
  if (Array.isArray(toolResults)) {
    toolResults.forEach(res => {
      if (!res) return
      const resId = res.id || res.tool_call_id
      upsertTool(tools, {
        id: resId,
        name: res?.name || res?.tool || res?.tool_name || 'tool',
        input: res.input || res.args || null,
        output: res.output || res.result || res.content || null,
        status: res.status || 'ok',
        time: resolveToolTime(resId, message?.timestamp),
      })
    })
  }
}

/** 渲染工具调用到消息气泡 */
function appendToolsToEl(el, tools) {
  if (!el) return
  const existing = el.querySelector?.('.msg-tool')
  if (!tools?.length) {
    if (existing) existing.remove()
    return
  }
  const container = document.createElement('div')
  container.className = 'msg-tool'
  tools.forEach(tool => {
    const details = document.createElement('details')
    details.className = 'msg-tool-item'
    const summary = document.createElement('summary')
    const status = formatToolStatus(tool.status)
    const timeValue = getToolTime(tool) || resolveToolTime(tool.id || tool.tool_call_id, tool.messageTimestamp)
    const timeText = timeValue ? formatTime(new Date(timeValue)) : ''
    summary.innerHTML = `${escapeHtml(formatToolDisplayName(tool.name))} · ${escapeHtml(status)}${timeText ? ' · ' + escapeHtml(timeText) : ''}`
    const body = document.createElement('div')
    body.className = 'msg-tool-body'
    const inputJson = stripAnsi(safeStringify(tool.input))
    const outputJson = stripAnsi(safeStringify(tool.output))
    body.innerHTML = `<div class="msg-tool-block"><div class="msg-tool-title">${t('chat.toolParams')}</div><pre>${escapeHtml(inputJson || '-')}</pre></div>`
      + `<div class="msg-tool-block"><div class="msg-tool-title">${t('chat.toolResult')}</div><pre>${escapeHtml(outputJson || '-')}</pre></div>`
    details.appendChild(summary)
    details.appendChild(body)
    container.appendChild(details)
  })
  if (existing) existing.remove()
  el.insertBefore(container, el.firstChild)
}

/** 图片灯箱查看 */
function showLightbox(src) {
  const existing = document.querySelector('.chat-lightbox')
  if (existing) existing.remove()
  const lb = document.createElement('div')
  lb.className = 'chat-lightbox'
  const img = document.createElement('img')
  img.className = 'chat-lightbox-img'
  img.src = src || ''
  lb.appendChild(img)
  lb.onclick = (e) => { if (e.target === lb || e.target.tagName !== 'IMG') lb.remove() }
  document.body.appendChild(lb)
  // ESC 关闭
  const onKey = (e) => { if (e.key === 'Escape') { lb.remove(); document.removeEventListener('keydown', onKey) } }
  document.addEventListener('keydown', onKey)
}

function appendSystemMessage(text) {
  const wrap = document.createElement('div')
  wrap.className = 'msg msg-system'
  wrap.dataset.rawText = text || ''
  const body = document.createElement('div')
  body.className = 'msg-system-body'
  body.textContent = text
  const meta = document.createElement('div')
  meta.className = 'msg-meta msg-system-meta'
  meta.innerHTML = `${translateButtonHtml()}<button class="msg-copy-btn" title="${t('common.copy')}">${svgIcon('copy', 12)}</button>`
  wrap.appendChild(body)
  wrap.appendChild(meta)
  _messagesEl.insertBefore(wrap, _typingEl)
  scrollToBottom()
}

function clearMessages() {
  _messagesEl.querySelectorAll('.msg').forEach(m => m.remove())
  restoreReplyStatus()
  _autoScrollEnabled = true
  _lastScrollTop = 0
}

function showTyping(show, hint) {
  if (_typingEl) {
    _typingEl.style.display = show ? 'flex' : 'none'
    const hintEl = _typingEl.querySelector('.typing-hint')
    if (hintEl) hintEl.textContent = hint || (show ? t('chat.agentProcessingHint') : '')
  }
}

function showCompactionHint(show) {
  let hint = _page?.querySelector('#compaction-hint')
  if (show && !hint && _messagesEl) {
    hint = document.createElement('div')
    hint.id = 'compaction-hint'
    hint.className = 'msg msg-system compaction-hint'
    hint.innerHTML = `🗜️ ${t('chat.compacting')}`
    _messagesEl.insertBefore(hint, _typingEl)
    scrollToBottom()
  } else if (!show && hint) {
    hint.remove()
  }
}

function scrollToBottom(force = false) {
  if (!_messagesEl) return
  if (!force && !_autoScrollEnabled) return
  requestAnimationFrame(() => { _messagesEl.scrollTop = _messagesEl.scrollHeight })
}

function isAtBottom() {
  if (!_messagesEl) return true
  return _messagesEl.scrollHeight - _messagesEl.scrollTop - _messagesEl.clientHeight < 80
}

function updateSendState() {
  if (!_sendBtn || !_textarea) return
  if (_isStreaming) {
    _sendBtn.disabled = false
    _sendBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>'
    _sendBtn.title = t('chat.cmdStopGen')
  } else {
    _sendBtn.disabled = !_textarea.value.trim() && !_attachments.length
    _sendBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>'
    _sendBtn.title = t('chat.send')
  }
}

function updateStatusDot(status) {
  if (!_statusDot) return
  _statusDot.className = 'status-dot'
  if (status === 'ready' || status === 'connected') _statusDot.classList.add('online')
  else if (status === 'connecting' || status === 'reconnecting') _statusDot.classList.add('connecting')
  else _statusDot.classList.add('offline')
}

// ── 托管 Agent 核心逻辑 ──

function toggleHostedPanel() {
  if (!_hostedPanelEl) return
  const next = _hostedPanelEl.style.display !== 'block'
  _hostedPanelEl.style.display = next ? 'block' : 'none'
  if (next) renderHostedPanel()
}

function hideHostedPanel() {
  if (_hostedPanelEl) _hostedPanelEl.style.display = 'none'
}

function getHostedSessionKey() {
  return _sessionKey || localStorage.getItem(STORAGE_SESSION_KEY) || 'agent:main:main'
}

async function loadHostedDefaults() {
  try {
    const panel = await api.readPanelConfig()
    _hostedDefaults = panel?.hostedAgent?.default || null
  } catch { _hostedDefaults = null }
}

function loadHostedSessionConfig() {
  let data = {}
  try { data = JSON.parse(localStorage.getItem(HOSTED_SESSIONS_KEY) || '{}') } catch { data = {} }
  const key = getHostedSessionKey()
  const current = data[key] || {}
  _hostedSessionConfig = { ...HOSTED_DEFAULTS, ..._hostedDefaults, ...current }
  if (!_hostedSessionConfig.state) _hostedSessionConfig.state = { ...HOSTED_RUNTIME_DEFAULT }
  if (!_hostedSessionConfig.history) _hostedSessionConfig.history = []
  _hostedRuntime = { ...HOSTED_RUNTIME_DEFAULT, ..._hostedSessionConfig.state }
  updateHostedBadge()
}

function saveHostedSessionConfig(nextConfig) {
  let data = {}
  try { data = JSON.parse(localStorage.getItem(HOSTED_SESSIONS_KEY) || '{}') } catch { data = {} }
  data[getHostedSessionKey()] = nextConfig
  localStorage.setItem(HOSTED_SESSIONS_KEY, JSON.stringify(data))
}

function persistHostedRuntime() {
  if (!_hostedSessionConfig) return
  _hostedSessionConfig.state = { ..._hostedRuntime }
  saveHostedSessionConfig(_hostedSessionConfig)
}

function updateHostedBadge() {
  if (!_hostedBadgeEl || !_hostedSessionConfig) return
  const status = _hostedRuntime.status || HOSTED_STATUS.IDLE
  const enabled = _hostedSessionConfig.enabled
  let text = t('chat.hostedNotEnabled'), cls = 'chat-hosted-badge'
  if (!enabled) { text = t('chat.hostedNotEnabled'); cls += ' idle' }
  else if (status === HOSTED_STATUS.RUNNING) { text = t('chat.hostedRunning'); cls += ' running' }
  else if (status === HOSTED_STATUS.WAITING) { text = t('chat.hostedWaiting'); cls += ' waiting' }
  else if (status === HOSTED_STATUS.PAUSED) { text = t('chat.hostedPaused'); cls += ' paused' }
  else if (status === HOSTED_STATUS.ERROR) { text = t('chat.hostedErrorStatus'); cls += ' error' }
  else { text = t('chat.hostedStandby'); cls += ' idle' }
  _hostedBadgeEl.className = cls
  _hostedBadgeEl.textContent = text
}

let _countdownInterval = null

function renderHostedPanel() {
  if (!_hostedPanelEl || !_hostedSessionConfig) return
  const isRunning = _hostedSessionConfig.enabled && _hostedRuntime.status !== HOSTED_STATUS.IDLE
  if (_hostedPromptEl) { _hostedPromptEl.value = _hostedSessionConfig.prompt || ''; _hostedPromptEl.disabled = isRunning }
  if (_hostedMaxStepsEl) {
    _hostedMaxStepsEl.value = _hostedSessionConfig.maxSteps || HOSTED_DEFAULTS.maxSteps
    _hostedMaxStepsEl.disabled = isRunning
    const valEl = _hostedPanelEl.querySelector('#ha-steps-val')
    if (valEl) valEl.textContent = _hostedMaxStepsEl.value
  }
  if (_hostedAutoStopEl) { _hostedAutoStopEl.value = _hostedSessionConfig.autoStopMinutes || 30; _hostedAutoStopEl.disabled = isRunning }
  const timerToggle = _hostedPanelEl.querySelector('#hosted-agent-timer-on')
  const timerBody = _hostedPanelEl.querySelector('#ha-timer-body')
  if (timerToggle) { timerToggle.checked = (_hostedSessionConfig.autoStopMinutes || 0) > 0; timerToggle.disabled = isRunning }
  if (timerBody) timerBody.style.display = timerToggle?.checked ? '' : 'none'
  if (_hostedSaveBtn) {
    _hostedSaveBtn.textContent = isRunning ? `⏹ ${t('chat.stopHosted')}` : `▶ ${t('chat.startHosted')}`
    _hostedSaveBtn.className = isRunning ? 'btn btn-ghost' : 'btn btn-primary'
    _hostedSaveBtn.style.flex = '1'
  }
  // 主按钮同时作为停止按钮，无需额外 stop btn
  // 状态栏
  const statusEl = _hostedPanelEl.querySelector('#hosted-agent-status')
  if (statusEl) {
    let msg = t('chat.ready')
    if (_hostedRuntime.lastError) msg = `${t('chat.errorPrefix')}${_hostedRuntime.lastError}`
    else if (isRunning) {
      const remaining = Math.max(0, _hostedSessionConfig.maxSteps - _hostedRuntime.stepCount)
      msg = `${t('chat.hostedRunning')} · ${t('chat.remaining')} ${remaining}`
    }
    statusEl.textContent = msg
  }
  // 倒计时
  updateCountdown()
}

function updateCountdown() {
  const cdEl = _hostedPanelEl?.querySelector('#ha-countdown')
  const fillEl = _hostedPanelEl?.querySelector('#ha-countdown-fill')
  const textEl = _hostedPanelEl?.querySelector('#ha-countdown-text')
  if (!cdEl || !fillEl || !textEl) return
  if (!_hostedAutoStopTimer || !_hostedStartTime || !_hostedSessionConfig?.autoStopMinutes) {
    cdEl.style.display = 'none'
    clearInterval(_countdownInterval); _countdownInterval = null
    return
  }
  cdEl.style.display = ''
  const totalMs = _hostedSessionConfig.autoStopMinutes * 60000
  const elapsed = Date.now() - _hostedStartTime
  const remaining = Math.max(0, totalMs - elapsed)
  const pct = Math.max(0, Math.min(100, (remaining / totalMs) * 100))
  fillEl.style.width = pct + '%'
  const mins = Math.floor(remaining / 60000)
  const secs = Math.floor((remaining % 60000) / 1000)
  textEl.textContent = `${t('chat.remaining')} ${mins}:${secs.toString().padStart(2, '0')}`
  if (!_countdownInterval) {
    _countdownInterval = setInterval(() => updateCountdown(), 1000)
  }
  if (remaining <= 0) { clearInterval(_countdownInterval); _countdownInterval = null }
}

function toggleHostedRun() {
  if (!_hostedSessionConfig) return
  if (_hostedSessionConfig.enabled && _hostedRuntime.status !== HOSTED_STATUS.IDLE) {
    stopHostedAgent()
  } else {
    startHostedAgent()
  }
}

async function startHostedAgent() {
  if (!_hostedSessionConfig) return
  const prompt = (_hostedPromptEl?.value || '').trim()
  if (!prompt) { toast(t('chat.enterTaskGoal'), 'warning'); return }
  const rawSteps = parseInt(_hostedMaxStepsEl?.value || HOSTED_DEFAULTS.maxSteps, 10)
  const maxSteps = rawSteps >= 205 ? 999999 : Math.max(1, rawSteps)
  const stepDelayMs = Math.max(200, parseInt(_hostedStepDelayEl?.value || HOSTED_DEFAULTS.stepDelayMs, 10))
  const retryLimit = Math.max(0, parseInt(_hostedRetryLimitEl?.value || HOSTED_DEFAULTS.retryLimit, 10))
  const timerOn = _page?.querySelector('#hosted-agent-timer-on')?.checked
  const autoStopMinutes = timerOn ? Math.max(0, parseInt(_hostedAutoStopEl?.value || 0, 10)) : 0
  _hostedSessionConfig = { ..._hostedSessionConfig, prompt, enabled: true, maxSteps, stepDelayMs, retryLimit, autoStopMinutes }
  const sysContent = HOSTED_SYSTEM_PROMPT + '\n\nUser goal: ' + prompt
  if (!_hostedSessionConfig.history?.length) _hostedSessionConfig.history = [{ role: 'system', content: sysContent }]
  else if (_hostedSessionConfig.history[0]?.role === 'system') _hostedSessionConfig.history[0].content = sysContent
  else _hostedSessionConfig.history.unshift({ role: 'system', content: sysContent })
  _hostedRuntime = { ...HOSTED_RUNTIME_DEFAULT, status: HOSTED_STATUS.RUNNING }
  _hostedStartTime = Date.now()
  persistHostedRuntime()
  renderHostedPanel()
  updateHostedBadge()
  // 启动定时停止
  clearTimeout(_hostedAutoStopTimer)
  if (autoStopMinutes > 0) {
    _hostedAutoStopTimer = setTimeout(() => {
      if (!_pageActive || !_hostedSessionConfig?.enabled) return
      appendHostedOutput(t('chat.hostedTimerExpired', { min: autoStopMinutes }))
      stopHostedAgent()
    }, autoStopMinutes * 60000)
  }
  if (!wsClient.gatewayReady || !_sessionKey) { toast(t('chat.gatewayNotReadySend'), 'warning'); return }
  toast(t('chat.hostedStarted'), 'success')
  runHostedAgentStep()
}

function stopHostedAgent() {
  if (!_hostedSessionConfig) return
  if (_hostedAbort) { _hostedAbort.abort(); _hostedAbort = null }
  clearTimeout(_hostedAutoStopTimer); _hostedAutoStopTimer = null
  clearTimeout(_hostedRetryTimer); _hostedRetryTimer = null
  clearInterval(_countdownInterval); _countdownInterval = null
  _hostedBusy = false
  _hostedSessionConfig.enabled = false
  _hostedRuntime.status = HOSTED_STATUS.IDLE
  _hostedRuntime.pending = false
  _hostedRuntime.stepCount = 0
  _hostedRuntime.lastError = ''
  _hostedRuntime.errorCount = 0
  _hostedStartTime = 0
  persistHostedRuntime()
  renderHostedPanel()
  updateHostedBadge()
  toast(t('chat.hostedStopped'), 'info')
}

function shouldCaptureHostedTarget(payload) {
  if (!_hostedSessionConfig?.enabled) return false
  if (_hostedRuntime.status === HOSTED_STATUS.PAUSED || _hostedRuntime.status === HOSTED_STATUS.ERROR || _hostedRuntime.status === HOSTED_STATUS.IDLE) return false
  if (payload?.message?.role && payload.message.role !== 'assistant') return false
  const ts = payload?.timestamp || Date.now()
  if (ts && ts === _hostedLastTargetTs) return false
  _hostedLastTargetTs = ts
  return true
}

function appendHostedTarget(text) {
  if (!_hostedSessionConfig) return
  if (!_hostedSessionConfig.history) _hostedSessionConfig.history = []
  _hostedSessionConfig.history.push({ role: 'target', content: text, ts: Date.now() })
  persistHostedRuntime()
}

function maybeTriggerHostedRun() {
  if (!_hostedSessionConfig?.enabled) return
  if (_hostedRuntime.status === HOSTED_STATUS.IDLE || _hostedRuntime.status === HOSTED_STATUS.PAUSED || _hostedRuntime.status === HOSTED_STATUS.ERROR) return
  if (_hostedRuntime.pending || _hostedBusy) return
  if (!wsClient.gatewayReady) { _hostedRuntime.status = HOSTED_STATUS.PAUSED; persistHostedRuntime(); updateHostedBadge(); renderHostedPanel(); return }
  _hostedRuntime.status = HOSTED_STATUS.IDLE
  runHostedAgentStep()
}

function compressHostedContext() {
  if (!_hostedSessionConfig?.history) return
  const history = _hostedSessionConfig.history
  if (history.length <= HOSTED_COMPRESS_THRESHOLD) return
  const sysEntry = history[0]?.role === 'system' ? history[0] : null
  const recent = history.slice(-8)
  const older = history.slice(sysEntry ? 1 : 0, -8)
  const summary = older.map(h => `[${h.role}] ${(h.content || '').slice(0, 80)}`).join('\n')
  const compressed = []
  if (sysEntry) compressed.push(sysEntry)
  compressed.push({ role: 'user', content: `[Context summary - compressed ${older.length} entries]\n${summary}`, ts: Date.now() })
  compressed.push(...recent)
  _hostedSessionConfig.history = compressed
  persistHostedRuntime()
}

function buildHostedMessages() {
  compressHostedContext()
  const history = _hostedSessionConfig?.history || []
  const mapped = history.slice(-HOSTED_CONTEXT_MAX).map(item => {
    if (item.role === 'system') return { role: 'system', content: item.content }
    if (item.role === 'assistant') return { role: 'assistant', content: item.content }
    return { role: 'user', content: item.content }
  })
  const hasUserMsg = mapped.some(m => m.role === 'user' || m.role === 'assistant')
  if (!hasUserMsg && _hostedSessionConfig?.prompt) {
    mapped.push({ role: 'user', content: _hostedSessionConfig.prompt })
  }
  return mapped
}

function detectStopFromText(text) {
  if (!text) return false
  return /\b(完成|无需继续|结束|停止|done|stop|final)\b/i.test(text)
}

async function runHostedAgentStep() {
  if (!_pageActive || !_page?.isConnected) return
  if (_hostedBusy || !_hostedSessionConfig?.enabled) return
  const prompt = (_hostedSessionConfig.prompt || '').trim()
  if (!prompt) return
  if (!wsClient.gatewayReady || !_sessionKey) {
    _hostedRuntime.status = HOSTED_STATUS.PAUSED
    _hostedRuntime.lastError = 'Gateway not ready'
    persistHostedRuntime(); updateHostedBadge()
    appendHostedOutput(t('chat.hostedNeedIntervention', { reason: _hostedRuntime.lastError }))
    return
  }
  if (_hostedRuntime.errorCount >= _hostedSessionConfig.retryLimit) {
    _hostedRuntime.status = HOSTED_STATUS.ERROR
    persistHostedRuntime(); updateHostedBadge()
    appendHostedOutput(t('chat.hostedErrorThreshold'))
    return
  }
  if (_hostedRuntime.stepCount >= _hostedSessionConfig.maxSteps) {
    _hostedRuntime.status = HOSTED_STATUS.IDLE
    persistHostedRuntime(); updateHostedBadge()
    return
  }
  _hostedBusy = true
  _hostedRuntime.pending = true
  _hostedRuntime.status = HOSTED_STATUS.RUNNING
  _hostedRuntime.lastRunAt = Date.now()
  _hostedRuntime.lastRunId = uuid()
  persistHostedRuntime(); updateHostedBadge()

  const delay = _hostedSessionConfig.stepDelayMs || HOSTED_DEFAULTS.stepDelayMs
  if (delay > 0) {
    await new Promise(resolve => {
      _hostedRetryTimer = setTimeout(() => {
        _hostedRetryTimer = null
        resolve()
      }, delay)
    })
    if (!_pageActive || !_page?.isConnected || !_hostedSessionConfig?.enabled) {
      _hostedBusy = false
      _hostedRuntime.pending = false
      return
    }
  }

  try {
    const messages = buildHostedMessages()
    let resultText = ''
    await callHostedAI(messages, (chunk) => { resultText += chunk })

    _hostedRuntime.stepCount += 1
    _hostedRuntime.errorCount = 0
    _hostedRuntime.lastError = ''

    _hostedSessionConfig.history.push({ role: 'assistant', content: resultText, ts: Date.now() })
    persistHostedRuntime()
    appendHostedOutput(resultText + ` | step=${_hostedRuntime.stepCount}`)

    // 如果 AI 回复中有「执行命令」类内容，通过 Gateway 发送给 Agent
    const instruction = resultText.trim()
    if (instruction && !detectStopFromText(instruction)) {
      _hostedRuntime.status = HOSTED_STATUS.WAITING
      _hostedRuntime.pending = false
      persistHostedRuntime(); updateHostedBadge()
      // 将指令发给 Gateway Agent
      try { await wsClient.chatSend(_sessionKey, instruction) } catch {}
    } else {
      _hostedRuntime.status = HOSTED_STATUS.IDLE
      _hostedRuntime.pending = false
      persistHostedRuntime(); updateHostedBadge()
    }
  } catch (e) {
    _hostedRuntime.errorCount = (_hostedRuntime.errorCount || 0) + 1
    _hostedRuntime.lastError = e.message || String(e)
    _hostedRuntime.pending = false
    if (_hostedRuntime.errorCount >= _hostedSessionConfig.retryLimit) {
      _hostedRuntime.status = HOSTED_STATUS.ERROR
      persistHostedRuntime(); updateHostedBadge()
      appendHostedOutput(t('chat.hostedNeedIntervention', { reason: _hostedRuntime.lastError }))
      return
    }
    persistHostedRuntime(); updateHostedBadge()
    clearTimeout(_hostedRetryTimer)
    _hostedRetryTimer = setTimeout(() => {
      _hostedRetryTimer = null
      if (!_pageActive || !_page?.isConnected || !_hostedSessionConfig?.enabled) return
      _hostedBusy = false
      runHostedAgentStep()
    }, delay)
    return
  } finally {
    _hostedBusy = false
  }
}

function loadHostedAssistantConfig() {
  const keys = ['clawpanel-assistant', '星枢OpenClaw-assistant']
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const stored = JSON.parse(raw)
      if (stored && typeof stored === 'object') {
        return {
          baseUrl: stored.baseUrl || '',
          apiKey: stored.apiKey || '',
          model: stored.model || '',
          temperature: stored.temperature || 0.7,
          apiType: stored.apiType || 'openai-completions',
        }
      }
    } catch {}
  }
  return { baseUrl: '', apiKey: '', model: '', temperature: 0.7, apiType: 'openai-completions' }
}

async function callHostedAI(messages, onChunk) {
  const config = loadHostedAssistantConfig()

  if (!config.baseUrl || !config.model) throw new Error(t('chat.hostedModelNotConfigured'))

  const apiType = normalizeHostedApiType(config.apiType)
  const base = normalizeHostedBaseUrl(config.baseUrl, apiType)
  if (_hostedAbort) { _hostedAbort.abort(); _hostedAbort = null }
  _hostedAbort = new AbortController()
  const signal = _hostedAbort.signal
  const timeout = setTimeout(() => { if (_hostedAbort) _hostedAbort.abort() }, 120000)

  try {
    const headers = { 'Content-Type': 'application/json' }
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`
    const body = { model: config.model, messages, stream: true, temperature: config.temperature || 0.7 }
    const resp = await fetch(base + '/chat/completions', { method: 'POST', headers, body: JSON.stringify(body), signal })
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      let errMsg = `API error ${resp.status}`
      try { errMsg = JSON.parse(errText).error?.message || errMsg } catch {}
      throw new Error(errMsg)
    }
    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') return
        try { const json = JSON.parse(data); if (json.choices?.[0]?.delta?.content) onChunk(json.choices[0].delta.content) } catch {}
      }
    }
  } finally {
    clearTimeout(timeout)
    _hostedAbort = null
  }
}

function normalizeHostedApiType(raw) {
  const type = (raw || '').trim()
  if (type === 'anthropic' || type === 'anthropic-messages') return 'anthropic-messages'
  if (type === 'google-gemini' || type === 'google-generative-ai') return 'google-generative-ai'
  if (type === 'ollama') return 'ollama'
  return 'openai-completions'
}

function normalizeHostedBaseUrl(raw, apiType) {
  let base = (raw || '').trim()
  if (!base) throw new Error(t('chat.hostedModelNotConfigured'))
  if (/^\/\//.test(base)) base = `http:${base}`
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(base) && /^(localhost|(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:.]+\]|[^/\s]+:\d+)(?:\/|$)/i.test(base)) {
    base = `http://${base}`
  }
  let url
  try {
    url = new URL(base)
  } catch {
    throw new Error(t('chat.hostedModelUrlInvalid'))
  }
  if (!/^https?:$/.test(url.protocol) || url.hostname === 'tauri.localhost') {
    throw new Error(t('chat.hostedModelUrlInvalid'))
  }
  base = `${url.origin}${url.pathname}`
    .replace(/\/+$/, '')
    .replace(/\/api\/chat\/?$/, '')
    .replace(/\/api\/generate\/?$/, '')
    .replace(/\/api\/tags\/?$/, '')
    .replace(/\/api\/?$/, '')
    .replace(/\/chat\/completions\/?$/, '')
    .replace(/\/completions\/?$/, '')
    .replace(/\/responses\/?$/, '')
    .replace(/\/messages\/?$/, '')
    .replace(/\/models\/?$/, '')
  const type = normalizeHostedApiType(apiType)
  if (type === 'anthropic-messages') {
    if (!base.endsWith('/v1')) base += '/v1'
    return base
  }
  if (type === 'google-generative-ai') return base
  if (/:(11434)$/i.test(base) && !base.endsWith('/v1')) return `${base}/v1`
  return base
}

function appendHostedOutput(text) {
  if (!text || !_messagesEl) return
  const wrap = document.createElement('div')
  wrap.className = 'msg msg-system msg-hosted'
  wrap.textContent = `[${t('chat.hostedAgent')}] ${text}`
  _messagesEl.insertBefore(wrap, _typingEl)
  scrollToBottom()
}

// ── 页面离开清理 ──

export function cleanup() {
  _pageActive = false
  if (_unsubEvent) { _unsubEvent(); _unsubEvent = null }
  if (_unsubReady) { _unsubReady(); _unsubReady = null }
  if (_unsubStatus) { _unsubStatus(); _unsubStatus = null }
  clearTimeout(_modelConfigRefreshTimer)
  _modelConfigRefreshTimer = null
  if (_modelConfigChangeHandler && typeof window !== 'undefined') {
    window.removeEventListener(MODEL_CONFIG_CHANGED_EVENT, _modelConfigChangeHandler)
    _modelConfigChangeHandler = null
  }
  clearTimeout(_streamSafetyTimer)
  _cancelResponseWatchdog()
  clearTimeout(_postFinalCheck)
  _postFinalCheck = null
  clearTimeout(_hostedAutoStopTimer)
  _hostedAutoStopTimer = null
  clearTimeout(_hostedRetryTimer)
  _hostedRetryTimer = null
  clearInterval(_countdownInterval)
  _countdownInterval = null
  if (_hostedAbort) { _hostedAbort.abort(); _hostedAbort = null }
  _sessionKey = null
  _page = null
  _messagesEl = null
  _textarea = null
  _sendBtn = null
  _statusDot = null
  _typingEl = null
  _scrollBtn = null
  _sessionListEl = null
  _cmdPanelEl = null
  _currentAiBubble = null
  _currentAiText = ''
  _currentAiImages = []
  _currentAiVideos = []
  _currentAiAudios = []
  _currentAiFiles = []
  _currentAiTools = []
  _currentRunId = null
  _isStreaming = false
  _isSending = false
  _messageQueue = []
  _lastHistoryHash = ''
  _hostedBtn = null
  _hostedPanelEl = null
  _hostedBadgeEl = null
  _hostedPromptEl = null
  _hostedMaxStepsEl = null
  _hostedStepDelayEl = null
  _hostedRetryLimitEl = null
  _hostedSaveBtn = null
  _hostedStopBtn = null
  _hostedCloseBtn = null
  _hostedSessionConfig = null
  _hostedDefaults = null
  _hostedRuntime = { ...HOSTED_RUNTIME_DEFAULT }
  _hostedBusy = false
  _workspaceBtn = null
  _workspacePanelEl = null
  _workspaceAgentBadgeEl = null
  _workspaceAgentTitleEl = null
  _workspacePathEl = null
  _workspaceCoreListEl = null
  _workspaceTreeEl = null
  _workspaceCurrentFileEl = null
  _workspaceMetaEl = null
  _workspaceEditorEl = null
  _workspacePreviewEl = null
  _workspaceEmptyEl = null
  _workspaceSaveBtn = null
  _workspaceReloadBtn = null
  _workspacePreviewBtn = null
  _workspaceInfo = null
  _workspaceCoreFiles = []
  _workspaceTreeCache = new Map()
  _workspaceExpandedDirs = new Set()
  _workspaceCurrentAgentId = 'main'
  _workspaceCurrentFile = null
  _workspacePreviewMode = false
  _workspaceDirty = false
  _workspaceLoadedContent = ''
  _workspaceLoading = false
  _workspaceLoadSeq = 0
  _workspaceOpenSeq = 0
}
