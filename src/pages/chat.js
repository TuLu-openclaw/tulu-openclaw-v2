/**
 * 聊天页面 - 完整版，对接 OpenClaw Gateway
 * 支持：流式响应、Markdown 渲染、会话管理、Agent 选择、快捷指令
 */
import { api, invalidate, isTauriRuntime } from '../lib/tauri-api.js'
import { navigate } from '../router.js'
import { wsClient, uuid } from '../lib/ws-client.js'
import { renderMarkdown, resolveImageSrc } from '../lib/markdown.js'
import { saveMessage, saveMessages, getLocalMessages, clearSessionMessages, isStorageAvailable } from '../lib/message-db.js'
import { toast } from '../components/toast.js'
import { showModal, showConfirm, showContentModal } from '../components/modal.js'
import { icon as svgIcon } from '../lib/icons.js'
import { t } from '../lib/i18n.js'
import { enhanceModelCallError } from '../lib/model-error-diagnosis.js'
import { hasVisibleChatContent, isInternalChatPayload, isInternalContentBlock, shouldFinalizeChatRun } from '../lib/chat-visibility.js'
import { diagnoseChatError } from '../lib/chat-error-diagnosis.js'
import { ChatRunCoordinator } from '../lib/chat-run-coordinator.js'
import { ChatHostedAgentController } from '../lib/chat-hosted-agent-controller.js'
import { ChatWorkspaceController } from '../lib/chat-workspace-controller.js'
import { VoiceConversationController } from '../lib/voice-conversation-controller.js'
import {
  renderChatWorkspacePanel,
} from '../lib/chat-workspace-panel.js'
import { ChatEcomWorkbench, renderChatEcomWorkbench } from '../lib/chat-ecom-workbench.js'

const RENDER_THROTTLE = 16
const STREAM_RENDER_MAX_PENDING_MS = 64
const RESPONSE_WATCHDOG_MS = 15000
const STREAM_IDLE_NOTICE_MS = 90000
const STREAM_STALE_REFRESH_MS = 10 * 60 * 1000
const STORAGE_SESSION_KEY = '星枢OpenClaw-last-session'
const STORAGE_MODEL_KEY = '星枢OpenClaw-chat-selected-model'
const STORAGE_SIDEBAR_KEY = '星枢OpenClaw-chat-sidebar-open'
const STORAGE_SESSION_NAMES_KEY = '星枢OpenClaw-chat-session-names'
const STORAGE_WORKSPACE_PANEL_KEY = '星枢OpenClaw-chat-workspace-open'
const VOICE_SETTINGS_KEY = '星枢OpenClaw-chat-voice-v1'
const GROUP_SESSIONS_KEY = '星枢OpenClaw-group-sessions-v1'
const ACTIVE_GROUP_KEY = '星枢OpenClaw-active-group-v1'
const GROUP_SESSION_CHANNEL_PREFIX = 'group-'
const TASK_BOARD_KEY = '星枢OpenClaw-task-board-v1'
const TASK_CONTEXT_KEY = '星枢OpenClaw-task-context-v1'
const ECOM_VAULT_FILENAME = 'ECOM_VAULT.md'
const ECOM_SKILL_SUGGESTIONS = [
  { label: '1688货源/采集', keywords: ['1688', '阿里巴巴', '采集', '货源', '采购'], queries: ['1688', '1688 sourcing', '1688 product search', '电商 1688'], targets: ['openclaw', 'hermes'] },
  { label: '淘宝/天猫上架运营', keywords: ['淘宝', '天猫', '上架', '店铺', '商品'], queries: ['taobao', '淘宝', '淘宝 电商', '电商 上架'], targets: ['openclaw', 'hermes'] },
  { label: '抖音电商运营', keywords: ['抖音', '小店', '短视频', '直播'], queries: ['抖音', 'douyin', 'douyin operations', '电商 短视频'], targets: ['openclaw', 'hermes'] },
  { label: '小红书内容/电商运营', keywords: ['小红书', '笔记', '种草'], queries: ['小红书', 'xiaohongshu', 'xhs', '小红书 电商'], targets: ['openclaw', 'hermes'] },
  { label: '浏览器自动化', keywords: ['截图', '页面', '浏览器', '登录', '打开网页'], queries: ['browser automation', 'auto browser', '浏览器 自动化'], targets: ['openclaw'] },
]
const ECOM_ORCH_MEMBER_LIMIT = 6

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
let _voiceController = null, _voiceBtn = null, _voicePanelEl = null, _voiceStatusEl = null
let _voiceModeEl = null, _voiceWakeWordEl = null, _voiceAutoSendEl = null
let _voiceHoldTimer = null
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
let _isStreaming = false, _isSending = false, _streamStartTime = 0
const _runCoordinator = new ChatRunCoordinator()
let _lastRenderTime = 0, _renderPending = false, _renderTimer = null, _lastHistoryHash = ''
// ── 打字机匀速消费缓冲区 ──
// 网络 delta 一阵一阵到达（缓冲/分块），若来多少渲染多少会出现"卡顿→爆发→卡顿"。
// 解耦方案：delta 只累加进 _currentAiText（目标文本），另开一个 rAF 循环把
// _displayedText（已显示文本）朝目标匀速推进，落后越多打字越快（自动追赶），
// 追上就停。流式期间只做轻量文本渲染，完整 markdown 解析留到结束一次性做。
let _displayedText = ''            // 屏幕上已"打"出来的文本
let _typewriterRAF = null          // 消费循环的 rAF 句柄
let _typewriterActive = false      // 消费循环是否在跑
let _lastFullMdRender = 0          // 上次做完整 markdown 渲染的时间戳
const TYPE_MIN_CHARS_PER_FRAME = 2         // 每帧最少推进字数（保证匀速手感）
const TYPE_CATCHUP_DIVISOR = 6             // 追赶系数：积压越多，单帧推进越多（backlog/该值）
const TYPE_MAX_CHARS_PER_FRAME = 400       // 单帧推进上限，避免一次吐太多
const STREAM_MD_RENDER_INTERVAL = 180      // 流式期间完整 markdown 重渲染的最小间隔(ms)
let _autoScrollEnabled = true, _lastScrollTop = 0, _touchStartY = 0
let _isLoadingHistory = false
let _streamSafetyTimer = null, _unsubEvent = null, _unsubReady = null, _unsubStatus = null
let _seenRunIds = new Set()
let _pageActive = false
let _pageGeneration = 0
const _toolEventTimes = new Map()
const _toolEventData = new Map()
const _toolRunIndex = new Map()
const _toolEventSeen = new Set()
let _errorTimer = null, _lastErrorMsg = null
let _responseWatchdog = null, _postFinalCheck = null, _runtimeStatusSyncTimer = null
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
let _isDeletingSelectedSessions = false
const TASK_PROGRESS = { queued: 5, sending: 10, thinking: 25, streaming: 45, tool: 65, finalizing: 90, done: 100, error: 100, aborted: 100 }

const MODEL_CONFIG_CHANGED_EVENT = 'openclaw-config-changed'
let _modelConfigRefreshTimer = null
let _modelConfigChangeHandler = null

let _hostedController = null
let _workspaceController = null
let _ecomWorkbench = null
let _ecomSkillCatalogCache = null
let _ecomSkillCatalogTs = 0

export async function render() {
  const generation = ++_pageGeneration
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
      ${renderChatWorkspacePanel(t)}
      ${renderChatEcomWorkbench()}
      <div class="chat-messages" id="chat-messages">
        <div class="typing-indicator" id="typing-indicator" style="display:none">
          <span></span><span></span><span></span>
          <span class="typing-hint"></span>
        </div>
      </div>
      <button class="chat-scroll-btn" id="chat-scroll-btn" style="display:none">↓</button>
      <div class="chat-cmd-panel" id="chat-cmd-panel" style="display:none"></div>
      <div class="chat-attachments-preview" id="chat-attachments-preview" style="display:none"></div>
      <div class="chat-ecom-hint" id="chat-ecom-hint" style="display:none">
        这是电商专属工作台。请直接在下方输入框里下达任务；也可以先点“开始对话”，我会帮你填入一个任务模板。
      </div>
      <div class="chat-input-area">
        <input type="file" id="chat-file-input" accept="image/*" multiple style="display:none">
        <button class="chat-attach-btn" id="chat-attach-btn" title="${t('chat.uploadImage')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
        </button>
        <button class="chat-voice-btn" id="chat-voice-btn" type="button" title="语音对话：点击切换，按住说话">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/></svg>
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
      <div class="chat-voice-panel" id="chat-voice-panel" style="display:none">
        <div class="chat-voice-panel-row">
          <label for="chat-voice-mode">语音模式</label>
          <select id="chat-voice-mode">
            <option value="short">短句对话</option>
            <option value="continuous">连续对话</option>
            <option value="wake">唤醒词</option>
          </select>
          <label class="chat-voice-toggle"><input id="chat-voice-auto-send" type="checkbox" checked> 自动发送</label>
        </div>
        <div class="chat-voice-panel-row chat-voice-wake-row">
          <label for="chat-voice-wake-word">唤醒词</label>
          <input id="chat-voice-wake-word" type="text" maxlength="24" value="小鱼儿" autocomplete="off">
          <button class="btn btn-sm btn-secondary" id="chat-voice-toggle" type="button">开始语音</button>
        </div>
        <div class="chat-voice-status" id="chat-voice-status" role="status" aria-live="polite">点击麦克风选择模式，或按住麦克风直接说话</div>
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
  _voiceBtn = page.querySelector('#chat-voice-btn')
  _voicePanelEl = page.querySelector('#chat-voice-panel')
  _voiceStatusEl = page.querySelector('#chat-voice-status')
  _voiceModeEl = page.querySelector('#chat-voice-mode')
  _voiceWakeWordEl = page.querySelector('#chat-voice-wake-word')
  _voiceAutoSendEl = page.querySelector('#chat-voice-auto-send')
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
  _hostedController = new ChatHostedAgentController({
    page,
    storage: localStorage,
    readPanelConfig: () => api.readPanelConfig(),
    gatewayReady: () => wsClient.gatewayReady,
    sendGateway: (sessionKey, instruction) => wsClient.chatSend(sessionKey, instruction),
    t,
    toast,
    output: appendHostedOutput,
  })
  _workspaceController = new ChatWorkspaceController({
    page,
    api,
    t,
    toast,
    showConfirm,
    renderMarkdown,
    escapeAttr,
    storage: localStorage,
    storageKey: STORAGE_WORKSPACE_PANEL_KEY,
    getContext: getWorkspaceContext,
  })
  page.querySelector('#chat-sidebar')?.classList.toggle('open', getSidebarOpen())
  _ecomWorkbench = new ChatEcomWorkbench({
    page,
    api,
    storage: localStorage,
    escapeHtml,
    getContext: () => ({
      agentId: parseSessionAgent(_sessionKey) || 'main',
      sessionKey: _sessionKey || '',
      hasMessages: () => Boolean(_messagesEl?.querySelector('.msg')),
    }),
    callbacks: {
      settings: showEcomWorkbenchSettings,
      vault: showEcomVaultEditor,
      skills: showEcomSkillAssistant,
      orchestration: showEcomOrchestrationPanel,
      systemMessage: appendSystemMessage,
      startTemplate: template => {
        if (!_textarea) return
        if (!_textarea.value.trim()) _textarea.value = template
        _textarea.focus()
        const pos = _textarea.value.length
        _textarea.setSelectionRange(pos, pos)
        _textarea.dispatchEvent(new Event('input', { bubbles: true }))
      },
    },
  })

  bindEvents(page)
  setupVoiceConversation(page)
  bindConnectOverlay(page)
  _workspaceController.initialize()

  // 首次使用引导提示
  showPageGuide(_messagesEl)
  applyOpenMontageDraft()
  restoreReplyStatus()
  loadGroupSessions()
  loadTaskBoard()
  loadTaskContexts()

  _hostedController.activateSession(_sessionKey || localStorage.getItem(STORAGE_SESSION_KEY) || '', parseSessionAgent(_sessionKey) || 'main')
  void _hostedController.initialize()
  bindModelConfigSync()
  loadModelOptions()
  // 非阻塞：先返回 DOM，后台连接 Gateway
  void connectGateway(generation)
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

function applyOpenMontageDraft() {
  if (!_textarea) return
  let draft = ''
  let source = 'openmontage'
  try {
    draft = localStorage.getItem('cliAnything.chatDraft') || ''
    if (draft) {
      localStorage.removeItem('cliAnything.chatDraft')
      source = 'cli-anything'
    } else {
      draft = localStorage.getItem('openmontage.chatDraft') || ''
      if (draft) localStorage.removeItem('openmontage.chatDraft')
    }
  } catch {}
  if (!draft || _textarea.value.trim()) return
  _textarea.value = draft
  _textarea.focus()
  const pos = _textarea.value.length
  _textarea.setSelectionRange(pos, pos)
  _textarea.dispatchEvent(new Event('input', { bubbles: true }))
  appendSystemMessage(source === 'cli-anything'
    ? '已进入 CLI-Anything 工具中枢 / 电商工作流协同模式。下方输入框已填好专用 Agent 提示词，你可以直接发送，或先补充具体任务。'
    : '已进入 OpenMontage 视频创作助手模式。下方输入框已填好专用工作流提示词，你可以直接发送，或先把“我的需求”改成你想做的视频。')
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

  page.querySelector('#chat-hosted-btn')?.addEventListener('click', (e) => { e.stopPropagation(); _hostedController?.togglePanel() })
  page.querySelector('#hosted-agent-close')?.addEventListener('click', () => _hostedController?.hidePanel())
  page.querySelector('#hosted-agent-save')?.addEventListener('click', () => { void _hostedController?.toggleRun() })
  // 滑块实时值显示
  const hostedMaxSteps = page.querySelector('#hosted-agent-max-steps')
  if (hostedMaxSteps) hostedMaxSteps.addEventListener('input', () => {
    const valEl = page.querySelector('#ha-steps-val')
    if (valEl) valEl.textContent = parseInt(hostedMaxSteps.value) >= 205 ? '∞' : hostedMaxSteps.value
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
      // 不封顶：真实反映占用，超 100% 时用户能看到超限程度。
      const pct = Math.round((ctxUsed / ctxBase) * 100)
      const cls = pct > 100 ? 'msg-context msg-context-over' : pct >= 90 ? 'msg-context msg-context-danger' : pct >= 75 ? 'msg-context msg-context-warn' : 'msg-context'
      parts.push(`<span class="${cls}" title="${escapeAttr(t('chat.contextUsage'))} · ${compactNumber(ctxUsed)} / ${compactNumber(ctxBase)}">${escapeHtml(t('chat.contextPercent', { percent: pct }))}</span>`)
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

function getSessionRuntimeInfo(item = {}) {
  const runtime = item.runtime || item.run || item.currentRun || item.activeRun || item.execution || item.task || {}
  return (runtime && typeof runtime === 'object') ? runtime : {}
}

function updateSessionRuntimeCache(sessions, defaults = null) {
  applySessionDefaultsModel(defaults)
  const defaultCtx = Number(defaults?.contextTokens ?? defaults?.context_tokens ?? defaults?.contextWindow ?? 0) || 0
  if (defaultCtx > 0) _defaultContextTokens = defaultCtx
  for (const item of (sessions || [])) {
    const key = item.sessionKey || item.key || item.id || item.name || ''
    if (!key) continue
    const runtime = getSessionRuntimeInfo(item)
    const model = normalizeModelValue(item.model || item.runtimeModel || item.currentModel || runtime.model || runtime.runtimeModel || runtime.currentModel || '', item.modelProvider || item.provider || runtime.modelProvider || runtime.provider || '')
    if (model) _sessionModels.set(key, model)
    else _sessionModels.delete(key)
    const ctx = Number(item.contextTokens ?? item.context_tokens ?? item.contextWindow ?? item.context_window ?? runtime.contextTokens ?? runtime.context_tokens ?? runtime.contextWindow ?? runtime.context_window ?? defaultCtx ?? 0) || 0
    if (ctx > 0) _sessionContextTokens.set(key, ctx)
    // 优先取“当前上下文占用”类字段（会随压缩下降）；contextUsedTokens/usedTokens/
    // promptTokens 都是当前 prompt 长度。totalTokens 是累计花费（只增不减），
    // 不能当上下文占用，只在没有真实占用字段时兵底。
    // 网关 sessions.list 实际下发 inputTokens（当前 prompt 输入量，会随压缩下降），
    // 优先用它作为“当前上下文占用”。其余字段作为兼容层，totalTokens 仅兜底。
    const liveCtx = Number(
      item.inputTokens ?? item.input_tokens ??
      item.contextUsedTokens ?? item.context_used_tokens ?? item.usedTokens ?? item.used_tokens ??
      item.promptTokens ?? item.prompt_tokens ??
      runtime.inputTokens ?? runtime.input_tokens ??
      runtime.contextUsedTokens ?? runtime.context_used_tokens ?? runtime.usedTokens ?? runtime.used_tokens ??
      runtime.promptTokens ?? runtime.prompt_tokens ?? 0
    ) || 0
    if (liveCtx > 0) {
      _sessionTokenTotals.set(key, liveCtx)
    } else {
      // 没有 inputTokens 时兜底 totalTokens（网关当前它也是“当前上下文”语义、
      // 带 totalTokensFresh）；且不覆盖 final 事件刚写入的更准确的当轮 input。
      const fallback = Number(item.totalTokens ?? item.total_tokens ?? runtime.totalTokens ?? runtime.total_tokens ?? 0) || 0
      if (fallback > 0 && !_sessionTokenTotals.has(key)) _sessionTokenTotals.set(key, fallback)
    }
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

function getWorkspaceContext() {
  const group = getActiveGroup()
  const agentId = group
    ? (parseSessionAgent(getGroupFallbackSessionKey(group)) || 'main')
    : (parseSessionAgent(_sessionKey) || wsClient.snapshot?.sessionDefaults?.defaultAgentId || 'main')
  let title = agentId
  if (group) title = t('chat.groupChatTitle', { name: group.name })
  else if (_sessionKey) title = getDisplayLabel(_sessionKey)
  else if (agentId === 'main') title = t('chat.mainSession')
  return { agentId, title }
}

async function syncWorkspaceContext(reload = true) {
  await _workspaceController?.syncContext(reload)
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

async function connectGateway(generation = _pageGeneration) {
  const isCurrentPage = () => _pageActive && generation === _pageGeneration
  try {
    // 清理旧的订阅，避免重复监听
    if (_unsubStatus) { _unsubStatus(); _unsubStatus = null }
    if (_unsubReady) { _unsubReady(); _unsubReady = null }
    if (_unsubEvent) { _unsubEvent(); _unsubEvent = null }

    // 订阅状态变化（订阅式，返回 unsub）
    _unsubStatus = wsClient.onStatusChange((status, errorMsg) => {
      if (!isCurrentPage()) return
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
      if (!isCurrentPage()) return
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
        _runCoordinator.activateSession(_sessionKey)
        _hostedController?.activateSession(_sessionKey, parseSessionAgent(_sessionKey) || 'main')
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
      if (!isCurrentPage()) return
      handleEvent(msg)
    })

    // 如果已连接且 Gateway 就绪，直接复用
    if (wsClient.connected && wsClient.gatewayReady) {
      const saved = localStorage.getItem(STORAGE_SESSION_KEY)
      const savedGroupId = localStorage.getItem(ACTIVE_GROUP_KEY) || ''
      _sessionKey = saved || wsClient.sessionKey
      _runCoordinator.activateSession(_sessionKey)
      _hostedController?.activateSession(_sessionKey, parseSessionAgent(_sessionKey) || 'main')
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
    if (!isCurrentPage()) return
    const gw = config?.gateway || {}
    const host = isTauriRuntime() ? `127.0.0.1:${gw.port || 18789}` : location.host
    const token = typeof (gw.auth?.token ?? gw.authToken) === 'string' ? (gw.auth?.token ?? gw.authToken) : ''
    const password = gw.auth?.mode === 'password' && typeof gw.auth.password === 'string' ? gw.auth.password : ''
    wsClient.connect(host, { mode: gw.auth?.mode || 'token', token, password })
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
    const selected = _isSessionMultiSelectMode && _selectedSessionKeys.has(key)
    card.classList.toggle('active', !_currentGroupId && key === _sessionKey)
    card.classList.toggle('selected', selected)
    const checkbox = card.querySelector('[data-select-session]')
    if (checkbox) {
      checkbox.setAttribute('aria-pressed', selected ? 'true' : 'false')
      checkbox.textContent = selected ? '✓' : ''
    }
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
  // 上下文占用统一以 _sessionTokenTotals 为单一可信源：它已由
  // updateSessionRuntimeCache（inputTokens 优先）和 final/群聊事件实时维护。
  // 优先读它，避免与原始 s.totalTokens 双源不一致；再退回原始字段兜底。
  const totalTokens = Number(_sessionTokenTotals.get(key) ?? s.inputTokens ?? s.input_tokens ?? s.totalTokens ?? s.total_tokens ?? s.contextUsedTokens ?? s.usedTokens ?? 0) || 0
  const percentUsed = ctxTokens > 0 && totalTokens > 0 ? Math.round((totalTokens / ctxTokens) * 100) : (Number.isFinite(Number(s.percentUsed)) ? Number(s.percentUsed) : 0)
  const ctxClass = percentUsed > 100 ? ' over' : percentUsed >= 90 ? ' danger' : percentUsed >= 75 ? ' warn' : ''
  const displayLabel = getDisplayLabel(key) || parseSessionLabel(key)
  const selected = _isSessionMultiSelectMode && _selectedSessionKeys.has(key) ? ' selected' : ''
  const checkbox = _isSessionMultiSelectMode ? `<button class="chat-session-check" data-select-session="${escapeAttr(key)}" aria-pressed="${selected ? 'true' : 'false'}" title="${t('chat.toggleSessionSelection')}">${selected ? '✓' : ''}</button>` : ''
  const deleteButton = _isSessionMultiSelectMode ? '' : `<button class="chat-session-del" data-del="${escapeAttr(key)}" title="${t('common.delete')}">×</button>`
  return `<div class="chat-session-card${active}${selected}" data-key="${escapeAttr(key)}">
    <div class="chat-session-card-header">
      ${checkbox}
      <span class="chat-session-label" title="${t('chat.doubleClickRename')}">${escapeAttr(displayLabel)}</span>
      ${deleteButton}
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
  if (!forceWorkspace && _workspaceController?.isDirty() && nextAgentId !== _workspaceController.getAgentId()) {
    const yes = await _workspaceController.confirmDiscardIfNeeded()
    if (!yes) return false
    _workspaceController.discardChanges()
  }
  _currentGroupId = ''
  _lastDirectSessionKey = newKey
  _sessionKey = newKey
  _runCoordinator.activateSession(newKey)
  _hostedController?.activateSession(newKey, parseSessionAgent(newKey) || 'main')
  localStorage.removeItem(ACTIVE_GROUP_KEY)
  localStorage.setItem(STORAGE_SESSION_KEY, newKey)
  updateSessionListActiveState()
  _lastHistoryHash = ''
  resetStreamState()
  _isSending = false
  updateSendState()
  updateSessionTitle()
  applyRuntimeModelToSelect(newKey)
  clearMessages()
  loadHistory()
  refreshSessionListSoon()
  processMessageQueue()
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

function clearGroupLocalState(group) {
  const key = getGroupStorageKey(group)
  if (!key) return
  _groupTranscripts.delete(key)
  clearSessionMessages(key).catch(() => {})
  try { localStorage.removeItem(getReplyStatusKey(key)) } catch {}
}

function pruneDeletedSessionsFromGroups(keys) {
  const deleted = new Set((Array.isArray(keys) ? keys : [keys]).filter(Boolean))
  if (!deleted.size || !_chatGroups.length) return
  let changed = false
  const removedGroups = []
  for (const group of _chatGroups) {
    const before = group.members || []
    const nextMembers = before.filter(m => !deleted.has(m.sessionKey) && !deleted.has(m.sourceSessionKey))
    if (nextMembers.length !== before.length) {
      group.members = nextMembers
      group.updatedAt = Date.now()
      changed = true
    }
    if (!nextMembers.length) removedGroups.push(group)
  }
  if (removedGroups.length) {
    const removedIds = new Set(removedGroups.map(g => g.id))
    _chatGroups = _chatGroups.filter(g => !removedIds.has(g.id))
    removedGroups.forEach(clearGroupLocalState)
    if (removedIds.has(_currentGroupId)) _currentGroupId = ''
    changed = true
  }
  if (changed) saveGroupSessions()
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
    pruneDeletedSessionsFromGroups(key)
    _selectedSessionKeys.delete(key)
    toast(t('chat.sessionDeleted'), 'success')
    if (key === _sessionKey) void switchSession(mainKey, { forceWorkspace: true })
    else refreshSessionList()
  } catch (e) {
    toast(`${t('common.operationFailed')}: ${e.message}`, 'error')
  }
}

function setSessionMultiSelectMode(enabled) {
  if (_isDeletingSelectedSessions) return
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
  if (!key || _isDeletingSelectedSessions) return
  const mainKey = wsClient.snapshot?.sessionDefaults?.mainSessionKey || 'agent:main:main'
  if (key === mainKey) { toast(t('chat.cannotDeleteMain'), 'warning'); return }
  if (_selectedSessionKeys.has(key)) _selectedSessionKeys.delete(key)
  else _selectedSessionKeys.add(key)
  updateSessionListActiveState()
}

function selectAllVisibleSessions() {
  if (_isDeletingSelectedSessions) return
  for (const key of getVisibleDeletableSessionKeys()) _selectedSessionKeys.add(key)
  updateSessionListActiveState()
}

function clearSessionSelection() {
  if (_isDeletingSelectedSessions) return
  _selectedSessionKeys.clear()
  updateSessionListActiveState()
}

function updateSessionMultiToolbar() {
  const countEl = _page?.querySelector('#chat-session-selected-count')
  const delBtn = _page?.querySelector('#btn-session-delete-selected')
  const selectAllBtn = _page?.querySelector('#btn-session-select-all')
  const clearBtn = _page?.querySelector('#btn-session-clear-selection')
  const cancelBtn = _page?.querySelector('#btn-session-multi-cancel')
  const count = _selectedSessionKeys.size
  if (countEl) countEl.textContent = t('chat.selectedSessionsCount', { count })
  if (delBtn) {
    delBtn.disabled = count === 0 || _isDeletingSelectedSessions
    delBtn.textContent = _isDeletingSelectedSessions ? t('chat.deletingSelected') : t('chat.deleteSelected')
  }
  if (selectAllBtn) selectAllBtn.disabled = _isDeletingSelectedSessions
  if (clearBtn) clearBtn.disabled = _isDeletingSelectedSessions
  if (cancelBtn) cancelBtn.disabled = _isDeletingSelectedSessions
}

async function deleteSelectedSessions() {
  if (_isDeletingSelectedSessions) return
  const mainKey = wsClient.snapshot?.sessionDefaults?.mainSessionKey || 'agent:main:main'
  const deletableKeys = new Set(getVisibleDeletableSessionKeys())
  const keys = Array.from(_selectedSessionKeys).filter(key => key && key !== mainKey && deletableKeys.has(key))
  if (!keys.length) { toast(t('chat.selectSessionsToDelete'), 'warning'); return }
  const yes = await showConfirm(t('chat.confirmDeleteSelectedSessions', { count: keys.length }))
  if (!yes) return
  const failed = []
  const deletedKeys = []
  _isDeletingSelectedSessions = true
  updateSessionMultiToolbar()
  try {
    for (const key of keys) {
      try {
        await wsClient.sessionsDelete(key)
      } catch (e) {
        failed.push({ key, message: e?.message || String(e) })
      }
    }
  } finally {
    _isDeletingSelectedSessions = false
  }
  for (const key of keys) {
    if (!failed.some(item => item.key === key)) {
      clearSessionLocalState(key)
      deletedKeys.push(key)
      _selectedSessionKeys.delete(key)
    }
  }
  pruneDeletedSessionsFromGroups(deletedKeys)
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
  updateEcomWorkbenchVisibility()
}

function updateEcomWorkbenchVisibility() {
  _ecomWorkbench?.updateContext()
}

function loadEcomWorkbenchSettings() {
  return _ecomWorkbench?.getSettings() || {}
}

function saveEcomWorkbenchSettings() {
  if (_ecomWorkbench) _ecomWorkbench.setSettings(_ecomWorkbench.getSettings())
}

function setEcomRunState(patch = {}) {
  return _ecomWorkbench?.setRunState(patch)
}

function renderEcomWorkbenchSummary() {
  _ecomWorkbench?.renderSummary()
}

async function persistEcomWorkbenchSettingsForAgent(agentId) {
  return _ecomWorkbench?.persistForAgent(agentId)
}


function parseEcomVaultAccounts(content = '') {
  const text = String(content || '')
  const blocks = text.split(/\n(?=##\s+)/).filter(Boolean)
  const accounts = []
  for (const block of blocks) {
    const title = (block.match(/^##\s+(.+)$/m)?.[1] || '').trim()
    if (!title || title.includes('使用说明')) continue
    const get = (label) => (block.match(new RegExp(`^-\\s*${label}：\\s*(.*)$`, 'm'))?.[1] || '').trim()
    accounts.push({ platform: get('平台'), url: get('平台地址'), account: get('账号'), password: get('密码/密钥'), extra: get('其他关键信息'), note: get('备注') })
  }
  return accounts.length ? accounts : [{ platform: '', url: '', account: '', password: '', extra: '', note: '' }]
}

function buildEcomVaultContent(accounts = []) {
  const cleanAccounts = (accounts || []).map(item => ({
    platform: String(item.platform || '').trim(),
    url: String(item.url || '').trim(),
    account: String(item.account || '').trim(),
    password: String(item.password || '').trim(),
    extra: String(item.extra || '').trim(),
    note: String(item.note || '').trim(),
  })).filter(item => item.platform || item.url || item.account || item.password || item.extra || item.note)
  const lines = [
    '# ECOM_VAULT.md', '', '## 使用说明',
    '- 每个平台/店铺保存一组账号信息，平台地址用于登录入口，账号/密码用于执行前确认。',
    '- 其他关键信息可填写手机号、验证码接收方式、店铺名、API Key、Cookie 保存位置、二级密码提示等。',
    '- 这里属于 Agent 专属工作区文件；请只保存你允许该电商 Agent 使用的信息。', '',
  ]
  if (!cleanAccounts.length) {
    lines.push('## 账号 1', '- 平台：', '- 平台地址：', '- 账号：', '- 密码/密钥：', '- 其他关键信息：', '- 备注：', '')
    return lines.join('\n')
  }
  cleanAccounts.forEach((item, index) => {
    lines.push(`## 账号 ${index + 1}${item.platform ? ` - ${item.platform}` : ''}`, `- 平台：${item.platform}`, `- 平台地址：${item.url}`, `- 账号：${item.account}`, `- 密码/密钥：${item.password}`, `- 其他关键信息：${item.extra}`, `- 备注：${item.note}`, '')
  })
  return lines.join('\n')
}

function renderEcomVaultAccountFields(accounts = []) {
  return accounts.map((item, index) => `
    <div class="chat-ecom-vault-account" data-vault-account="${index}">
      <div class="chat-ecom-vault-account-head"><strong>账号 ${index + 1}</strong><button type="button" class="btn btn-sm btn-secondary" data-vault-remove="${index}">删除</button></div>
      <div class="chat-ecom-vault-grid">
        <label><span>平台/店铺名</span><input class="form-input" data-vault-field="platform" value="${escapeAttr(item.platform || '')}" placeholder="如：淘宝主店 / 1688供应商"></label>
        <label><span>平台地址</span><input class="form-input" data-vault-field="url" value="${escapeAttr(item.url || '')}" placeholder="https://..."></label>
        <label><span>账号</span><input class="form-input" data-vault-field="account" value="${escapeAttr(item.account || '')}" placeholder="手机号 / 邮箱 / 登录名"></label>
        <label><span>密码/密钥</span><input class="form-input" data-vault-field="password" value="${escapeAttr(item.password || '')}" placeholder="密码、API Key 或 secretRef"></label>
      </div>
      <label class="chat-ecom-vault-wide"><span>其他关键信息</span><textarea class="form-input" data-vault-field="extra" rows="2" placeholder="验证码接收方式、店铺 ID、Cookie 路径、二级密码提示等">${escapeHtml(item.extra || '')}</textarea></label>
      <label class="chat-ecom-vault-wide"><span>备注</span><textarea class="form-input" data-vault-field="note" rows="2" placeholder="使用限制、风险提示、是否允许自动登录等">${escapeHtml(item.note || '')}</textarea></label>
    </div>
  `).join('')
}

async function showEcomVaultEditor() {
  const agentId = parseSessionAgent(_sessionKey) || ''
  if (agentId !== 'ecom-mover') {
    toast('只有 ecom-mover 会话支持密码保险箱', 'warning')
    return
  }
  let initial = buildEcomVaultContent([])
  try {
    const res = await api.readAgentFile(agentId, ECOM_VAULT_FILENAME)
    if (res?.content) initial = res.content
  } catch {}
  let accounts = parseEcomVaultAccounts(initial)
  const overlay = showContentModal({
    title: '密码保险箱',
    width: 820,
    content: `
      <div class="chat-ecom-vault-help"><strong>怎么用：</strong>把每个平台的登录入口、账号、密码/密钥和其他关键信息分组填写。Agent 执行搬运任务前会优先读取这里的账号上下文；涉及登录、下单、上架等高风险动作仍应先确认。</div>
      <div id="ecom-vault-accounts">${renderEcomVaultAccountFields(accounts)}</div>
      <button type="button" class="btn btn-secondary btn-sm" id="ecom-vault-add">添加账号</button>
    `,
    buttons: [{ label: '保存保险箱', className: 'btn btn-primary btn-sm', id: 'ecom-vault-save' }],
  })
  const readAccounts = () => [...overlay.querySelectorAll('[data-vault-account]')].map(card => {
    const item = {}
    card.querySelectorAll('[data-vault-field]').forEach(el => { item[el.dataset.vaultField] = el.value || '' })
    return item
  })
  const rerender = () => {
    const wrap = overlay.querySelector('#ecom-vault-accounts')
    if (wrap) wrap.innerHTML = renderEcomVaultAccountFields(accounts)
  }
  overlay.querySelector('#ecom-vault-add')?.addEventListener('click', () => {
    accounts = readAccounts()
    accounts.push({ platform: '', url: '', account: '', password: '', extra: '', note: '' })
    rerender()
  })
  overlay.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-vault-remove]')
    if (!btn) return
    accounts = readAccounts().filter((_, index) => index !== Number(btn.dataset.vaultRemove))
    if (!accounts.length) accounts.push({ platform: '', url: '', account: '', password: '', extra: '', note: '' })
    rerender()
  })
  overlay.querySelector('#ecom-vault-save')?.addEventListener('click', async () => {
    const content = buildEcomVaultContent(readAccounts())
    await api.writeAgentFile(agentId, ECOM_VAULT_FILENAME, content)
    const saved = parseEcomVaultAccounts(content).filter(item => item.platform || item.account || item.url)
    _ecomWorkbench?.setSettings({ ...loadEcomWorkbenchSettings(), vaultSummary: saved.length ? `${saved.length} 组账号：${saved.map(item => item.platform || item.account || item.url).slice(0, 3).join(' / ')}` : '未配置账号' })
    saveEcomWorkbenchSettings()
    renderEcomWorkbenchSummary()
    await persistEcomWorkbenchSettingsForAgent(agentId)
    overlay.close?.()
    toast('密码保险箱已保存', 'success')
  })
}

function showEcomWorkbenchSettings() {
  const settings = loadEcomWorkbenchSettings()
  showModal({
    title: '全自动店铺搬运配置',
    fields: [
      { name: 'platforms', label: '平台范围', type: 'textarea', rows: 2, value: settings.platforms || '', placeholder: '如：1688,淘宝,抖音,小红书' },
      { name: 'skillPool', label: '技能池', type: 'textarea', rows: 2, value: settings.skillPool || '', placeholder: '如：1688,阿里,淘宝,天猫,抖音...' },
      { name: 'credentialsNote', label: '凭据备注', type: 'textarea', rows: 2, value: settings.credentialsNote || '', placeholder: '记录保存方式/账号说明，不建议直接裸写真实密码' },
      { name: 'vaultSummary', label: '密码保险箱摘要', type: 'textarea', rows: 2, value: settings.vaultSummary || '', placeholder: '如：淘宝主店 / 抖音小店 / secretRef 已配置', hint: '摘要仅用于工作台展示，详细内容请点“密码保险箱”维护。' },
      { name: 'forceRefreshEachRound', label: '每轮选品后强制刷新', type: 'select', value: settings.forceRefreshEachRound ? 'true' : 'false', options: [ { value: 'true', label: '开启' }, { value: 'false', label: '关闭' } ] },
      { name: 'enableParallelRoutes', label: '多线路并行偏好', type: 'select', value: settings.enableParallelRoutes ? 'true' : 'false', options: [ { value: 'true', label: '开启（仅表示允许并行策略）' }, { value: 'false', label: '关闭' } ] },
      { name: 'enableSubAgents', label: '子Agent调度偏好', type: 'select', value: settings.enableSubAgents ? 'true' : 'false', options: [ { value: 'true', label: '开启（需真实调度成功）' }, { value: 'false', label: '关闭' } ] },
      { name: 'autoSkillDetect', label: '自动补技能', type: 'select', value: settings.autoSkillDetect ? 'true' : 'false', options: [ { value: 'true', label: '启用任务识别与安装建议' }, { value: 'false', label: '关闭' } ] },
      { name: 'autoEnableInstalledSkills', label: '自动启用已装技能', type: 'select', value: settings.autoEnableInstalledSkills ? 'true' : 'false', options: [ { value: 'true', label: '安装后自动写入 Agent skills' }, { value: 'false', label: '只安装，不自动启用' } ] },
      { name: 'orchestrationAutoDispatch', label: '协同自动派发', type: 'select', value: settings.orchestrationAutoDispatch ? 'true' : 'false', options: [ { value: 'true', label: '开启（按成员分发子任务）' }, { value: 'false', label: '关闭，手动派发' } ] },
      { name: 'enableVision', label: '眼睛能力', type: 'select', value: settings.enableVision ? 'true' : 'false', options: [ { value: 'true', label: '启用页面观察/视觉分析' }, { value: 'false', label: '关闭' } ] },
    ],
    onConfirm: async (result) => {
      _ecomWorkbench?.setSettings({
        platforms: (result.platforms || '').trim(),
        skillPool: (result.skillPool || '').trim(),
        credentialsNote: (result.credentialsNote || '').trim(),
        vaultSummary: (result.vaultSummary || '').trim(),
        forceRefreshEachRound: String(result.forceRefreshEachRound) !== 'false',
        enableParallelRoutes: String(result.enableParallelRoutes) !== 'false',
        enableSubAgents: String(result.enableSubAgents) !== 'false',
        enableVision: String(result.enableVision) !== 'false',
        autoSkillDetect: String(result.autoSkillDetect) !== 'false',
        autoEnableInstalledSkills: String(result.autoEnableInstalledSkills) !== 'false',
        orchestrationAutoDispatch: String(result.orchestrationAutoDispatch) === 'true',
      })
      saveEcomWorkbenchSettings()
      renderEcomWorkbenchSummary()
      try {
        await persistEcomWorkbenchSettingsForAgent(parseSessionAgent(_sessionKey) || '')
        toast('专属工作台配置已保存并同步到 Agent 工作区', 'success')
      } catch (e) {
        toast(`配置已保存到本地，但同步到 Agent 工作区失败: ${e?.message || e}`, 'warning')
      }
    }
  })
}

async function loadEcomSkillCatalog(force = false) {
  const freshEnough = _ecomSkillCatalogCache && (Date.now() - _ecomSkillCatalogTs < 60 * 1000)
  if (!force && freshEnough) return _ecomSkillCatalogCache
  const [skillsResp, hermesResp, storeResp] = await Promise.all([
    api.skillsList().catch(() => ({ skills: [] })),
    api.hermesSkillsList().catch(() => []),
    api.skillhubIndex().catch(() => ({ skills: [], items: [] })),
  ])
  const installed = Array.isArray(skillsResp?.skills) ? skillsResp.skills : []
  const hermes = Array.isArray(hermesResp) ? hermesResp : (Array.isArray(hermesResp?.skills) ? hermesResp.skills : [])
  const store = Array.isArray(storeResp?.skills) ? storeResp.skills : (Array.isArray(storeResp?.items) ? storeResp.items : [])
  _ecomSkillCatalogCache = { installed, hermes, store }
  _ecomSkillCatalogTs = Date.now()
  return _ecomSkillCatalogCache
}

function detectEcomSkillNeeds(taskText = '') {
  const text = String(taskText || '').toLowerCase()
  const matches = []
  for (const rule of ECOM_SKILL_SUGGESTIONS) {
    const hit = rule.keywords.some(keyword => text.includes(String(keyword).toLowerCase()))
    if (hit) matches.push(rule)
  }
  return matches
}

function getEcomRuleQueries(rule = {}) {
  const queries = Array.isArray(rule.queries) ? rule.queries : [rule.query]
  return [...new Set(queries.map(q => String(q || '').trim()).filter(Boolean))]
}

function getSkillStoreSlug(item) {
  return item?.slug || item?.id || item?.name || ''
}

function getSkillDisplayName(item) {
  return item?.displayName || item?.display_name || item?.title || item?.name || item?.slug || item?.id || '未知技能'
}

function getSkillSearchText(item) {
  const tags = Array.isArray(item?.tags) ? item.tags.join(' ') : ''
  const categories = Array.isArray(item?.categories) ? item.categories.join(' ') : ''
  return [
    item?.slug,
    item?.id,
    item?.name,
    item?.displayName,
    item?.display_name,
    item?.title,
    item?.summary,
    item?.description,
    item?.category,
    tags,
    categories,
  ].filter(Boolean).join(' ').toLowerCase()
}

function uniqSkillItems(items = []) {
  const seen = new Set()
  const out = []
  for (const item of items) {
    const slug = getSkillStoreSlug(item)
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    out.push(item)
  }
  return out
}

async function searchEcomSkillCandidates(rule, store = []) {
  const results = []
  const queries = getEcomRuleQueries(rule)
  for (const query of queries) {
    try {
      const resp = await api.skillhubSearch(query, 8)
      const items = Array.isArray(resp) ? resp : (Array.isArray(resp?.results) ? resp.results : (Array.isArray(resp?.items) ? resp.items : (Array.isArray(resp?.skills) ? resp.skills : [])))
      results.push(...items)
    } catch {}
  }
  if (!results.length && store.length) {
    for (const query of queries) {
      const tokens = query.toLowerCase().split(/[\s,，/]+/).filter(Boolean)
      for (const item of store) {
        const hay = getSkillSearchText(item)
        const score = tokens.reduce((sum, token) => sum + (hay.includes(token) ? 1 : 0), 0)
        if (score > 0) results.push({ ...item, score })
      }
    }
  }
  return uniqSkillItems(results)
}

function formatEcomSkillTask(item, status) {
  const name = getSkillDisplayName(item)
  const slug = getSkillStoreSlug(item)
  return { title: slug && slug !== name ? `${name}（${slug}）` : name, status }
}

async function enableSkillsForEcomAgent(skillNames = []) {
  const agentId = parseSessionAgent(_sessionKey) || ''
  if (agentId !== 'ecom-mover' || !skillNames.length) return
  let detail = null
  try {
    detail = await api.getAgentDetail(agentId)
  } catch {}
  const current = new Set(Array.isArray(detail?.skills) ? detail.skills : [])
  skillNames.forEach(name => current.add(name))
  await api.updateAgentConfig(agentId, { skills: [...current] })
}

async function installEcomSkillsFromRules(rules = []) {
  if (!rules.length) return { installed: [], enabled: [], failed: [], matched: [] }
  const catalog = await loadEcomSkillCatalog(true)
  const installedNames = new Set((catalog.installed || []).map(item => item?.name || item?.slug).filter(Boolean))
  const hermesNames = new Set((catalog.hermes || []).map(item => item?.slug || item?.name).filter(Boolean))
  const installed = []
  const enabled = []
  const failed = []
  const matched = []
  const tasks = []

  for (const rule of rules) {
    const candidates = await searchEcomSkillCandidates(rule, catalog.store || [])
    if (!candidates.length) {
      const title = rule.label || getEcomRuleQueries(rule)[0] || '电商技能'
      tasks.push({ title, status: '未找到' })
      failed.push(`${title}: 未找到匹配的 SkillHub 技能`)
      setEcomRunState({ tasks: [...tasks] })
      continue
    }

    for (const item of candidates.slice(0, 3)) {
      const slug = getSkillStoreSlug(item)
      if (!slug) continue
      matched.push(slug)
      tasks.push(formatEcomSkillTask(item, '安装中'))
      setEcomRunState({ tasks: [...tasks] })
      const taskIndex = tasks.length - 1
      try {
        let changed = false
        if (rule.targets?.includes('openclaw') && !installedNames.has(slug)) {
          await api.skillhubInstall(slug)
          installed.push(`OpenClaw:${slug}`)
          installedNames.add(slug)
          changed = true
        }
        if (rule.targets?.includes('hermes') && !hermesNames.has(slug)) {
          await api.hermesSkillhubInstall(slug)
          installed.push(`Hermes:${slug}`)
          hermesNames.add(slug)
          changed = true
          try { await api.hermesSkillToggle(slug, true) } catch {}
        }
        if (loadEcomWorkbenchSettings().autoEnableInstalledSkills) enabled.push(slug)
        tasks[taskIndex] = formatEcomSkillTask(item, changed ? '已安装' : '已存在')
        setEcomRunState({ tasks: [...tasks] })
      } catch (e) {
        const msg = e?.message || e
        failed.push(`${slug}: ${msg}`)
        tasks[taskIndex] = formatEcomSkillTask(item, '失败')
        setEcomRunState({ tasks: [...tasks] })
      }
    }
  }

  if (enabled.length && loadEcomWorkbenchSettings().autoEnableInstalledSkills) {
    await enableSkillsForEcomAgent(enabled)
  }
  _ecomSkillCatalogCache = null
  return { installed, enabled, failed, matched, tasks }
}

async function maybeAutoInstallEcomSkills(taskText, options = {}) {
  const settings = loadEcomWorkbenchSettings()
  if (!settings.autoSkillDetect) return false
  const rules = detectEcomSkillNeeds(taskText)
  if (!rules.length) return false
  const labels = rules.map(rule => rule.label || getEcomRuleQueries(rule)[0]).join(' / ')
  const shouldProceed = options.force === true
    ? true
    : await showConfirm(`检测到该任务可能需要补充技能：${labels}\n\n是否现在从 ClawHub 搜索真实技能、安装并按配置启用？`)
  if (!shouldProceed) return false
  setEcomRunState({ active: true, phase: '补技能中', detail: `正在从 ClawHub 搜索并安装：${labels}`, tasks: rules.map(rule => ({ title: rule.label || getEcomRuleQueries(rule)[0], status: '检索中' })) })
  setReplyStatus('tool', '正在自动补充电商技能', { activity: 'ClawHub 搜索与安装中' })
  const result = await installEcomSkillsFromRules(rules)
  const summary = []
  if (result.matched.length) summary.push(`匹配到 ${result.matched.length} 个真实技能`)
  if (result.installed.length) summary.push(`安装/同步 ${result.installed.length} 项`)
  if (result.enabled.length) summary.push(`已启用 ${result.enabled.length} 项`)
  if (result.failed.length) summary.push(`异常 ${result.failed.length} 项`)
  const detail = summary.join('，') || '没有匹配到可安装技能'
  setEcomRunState({ active: false, phase: '待机', detail, tasks: result.tasks || [] })
  toast(detail, result.failed.length ? 'warning' : 'success')
  appendSystemMessage(`技能补充结果：${detail}${result.failed.length ? `\n失败详情：${result.failed.join('； ')}` : ''}`)
  renderEcomWorkbenchSummary()
  return true
}

async function showEcomSkillAssistant() {
  const text = _textarea?.value?.trim() || ''
  const seed = text || (loadEcomWorkbenchSettings().skillPool || '')
  if (!seed) {
    toast('先输入任务，或在配置里补充技能池关键词，再使用自动补技能', 'warning')
    return
  }
  await maybeAutoInstallEcomSkills(seed, { force: false })
}

function inferEcomSubAgentRoles(prompt = '') {
  const text = String(prompt || '')
  const roles = []
  const add = (id, name, focus) => { if (!roles.some(role => role.id === id)) roles.push({ id, name, focus }) }
  if (/1688|阿里|货源|供应商|采购/i.test(text)) add('ecom-source-agent', '电商货源采集员', '负责 1688/阿里/供应商货源采集、价格库存刷新、源链接记录')
  if (/淘宝|天猫|上架|标题|详情|店铺/i.test(text)) add('ecom-listing-agent', '电商上架运营员', '负责淘宝/天猫标题、类目、详情页、售价和上架风险检查')
  if (/抖音|小红书|内容|直播|短视频|种草/i.test(text)) add('ecom-content-agent', '电商内容运营员', '负责抖音/小红书内容卖点、短视频脚本、种草笔记和直播话术')
  if (/利润|对比|风控|风险|合规|复核|质检/i.test(text)) add('ecom-risk-agent', '电商风控复核员', '负责利润率、合规风险、平台规则、重复商品和最终质检')
  if (!roles.length) {
    add('ecom-source-agent', '电商货源采集员', '负责货源采集、SPU 主档整理和刷新时间记录')
    add('ecom-risk-agent', '电商风控复核员', '负责利润率、合规风险和最终交付复核')
  }
  return roles.slice(0, ECOM_ORCH_MEMBER_LIMIT)
}

async function resolveDefaultAgentModel() {
  try {
    const config = await api.readOpenclawConfig()
    const providers = config?.models?.providers || {}
    for (const [pk, pv] of Object.entries(providers)) {
      const first = Array.isArray(pv.models) ? pv.models[0] : null
      const mid = typeof first === 'string' ? first : first?.id
      if (mid) return `${pk}/${mid}`
    }
  } catch {}
  return _selectedModel || _primaryModel || ''
}

async function ensureEcomSubAgent(role) {
  const existing = await api.listAgents().catch(() => [])
  const found = Array.isArray(existing) && existing.some(agent => agent.id === role.id)
  if (!found) {
    const model = await resolveDefaultAgentModel()
    if (!model) throw new Error('未找到可用于创建子Agent的模型')
    await api.addAgent(role.id, model, null)
  }
  await api.updateAgentIdentity(role.id, role.name, '🛒').catch(() => {})
  await api.updateAgentConfig(role.id, {
    identity: { name: role.name, emoji: '🛒' },
    profile: 'ecommerce-subagent',
    metadata: { preset: 'ecom-mover-subagent', parent: 'ecom-mover', focus: role.focus },
  }).catch(() => {})
  const soul = `# SOUL.md - ${role.name}\n\n## 职责\n${role.focus}。\n\n## 协同规则\n- 只完成主 Agent 派发的子任务，不向用户索要无关信息。\n- 输出必须包含：结论、证据/链接、风险、下一步建议。\n- 涉及登录、下单、上架、付款等高风险动作必须等待主 Agent 或用户确认。\n`
  await api.writeAgentFile(role.id, 'SOUL.md', soul).catch(() => {})
  return {
    sessionKey: `agent:${role.id}:ecom-orchestration`,
    agentId: role.id,
    label: role.name,
    model: getSessionDisplayModel(`agent:${role.id}:ecom-orchestration`),
    focus: role.focus,
  }
}

async function buildEcomOrchestrationCandidates(prompt = '') {
  const roles = inferEcomSubAgentRoles(prompt)
  const members = []
  for (const role of roles) {
    try {
      members.push(await ensureEcomSubAgent(role))
    } catch (e) {
      appendSystemMessage(`自动创建协同子Agent失败：${userFacingChatError(e, 'group-agent-create')}`, { severity: 'error' })
    }
  }
  return members
}

function renderEcomOrchestrationMembers(candidates = []) {
  if (!candidates.length) return '<div class="form-hint">输入任务后系统会自动创建/复用电商子Agent，不需要手动勾选成员。</div>'
  return candidates.map(item => `
    <div class="agent-skill-card">
      <div class="agent-skill-main">
        <div class="agent-skill-head">
          <span class="agent-skill-name">${escapeHtml(item.label)}</span>
          <span class="agent-skill-badge">自动</span>
        </div>
        <div class="agent-skill-desc">${escapeHtml(item.agentId || 'agent')} · ${escapeHtml(item.focus || '按任务自动分工')}</div>
      </div>
    </div>
  `).join('')
}

async function dispatchEcomOrchestration(prompt, members = []) {
  if (!members.length) {
    toast('请至少选择一个协同成员', 'warning')
    return false
  }
  const groupId = `ecom-orch-${Date.now()}`
  setEcomRunState({
    active: true,
    phase: '并行派发中',
    detail: `正在向 ${members.length} 个子Agent派发任务`,
    tasks: members.map(member => ({ title: member.label || member.agentId || member.sessionKey, status: '待派发' })),
  })
  setReplyStatus('tool', '正在并行派发电商子任务', { activity: `已选择 ${members.length} 个协同成员` })
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index]
    setEcomRunState({
      active: true,
      phase: '并行派发中',
      detail: `正在派发给 ${member.label || member.agentId || member.sessionKey}`,
      tasks: members.map((item, itemIndex) => ({ title: item.label || item.agentId || item.sessionKey, status: itemIndex < index ? '已派发' : itemIndex === index ? '派发中' : '等待中' })),
    })
    try {
      const task = createTaskRecord({ sessionKey: member.sessionKey, agentId: member.agentId, model: member.model, prompt, source: 'ecom-orchestration', groupId, title: prompt.slice(0, 48) })
      await wsClient.chatSend(member.sessionKey, prompt)
      updateTask(task.id, { status: 'thinking', progress: TASK_PROGRESS.thinking })
    } catch (e) {
      appendSystemMessage(`协同成员派发失败：${member.label || member.sessionKey} - ${userFacingChatError(e, 'group-dispatch')}`, { severity: 'error' })
    }
  }
  _ecomWorkbench?.setOrchestrationState({ groupId, members, lastPrompt: prompt, lastDispatchAt: Date.now() })
  syncEcomProgressFromTaskBoard()
  setEcomRunState({ active: true, phase: '结果回收中', detail: '子任务已派发，正在等待各成员回传结果', tasks: members.map(member => ({ title: member.label || member.agentId || member.sessionKey, status: '执行中' })) })
  return true
}

async function showEcomOrchestrationPanel() {
  const orchestrationState = _ecomWorkbench?.getOrchestrationState() || {}
  const initialPrompt = _textarea?.value?.trim() || orchestrationState.lastPrompt || ''
  const overlay = showContentModal({
    title: '电商协同面板',
    width: 720,
    content: `
      <div class="chat-task-editor">
        <div class="form-group">
          <label class="form-label">协同任务</label>
          <textarea class="form-input" id="ecom-orch-prompt" rows="6" placeholder="输入需要并行拆分的任务，例如：分别在 1688 / 淘宝 / 抖音收集候选 SPU，并统一回收风险和利润率。">${escapeHtml(initialPrompt)}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">自动子Agent</label>
          <div class="agent-skills-list" id="ecom-orch-members">${renderEcomOrchestrationMembers([])}</div>
        </div>
        <div class="form-hint">开启协同后，主 Agent 会按任务自动创建/复用子 Agent、写入职责，并自动派发子任务；用户不需要手动指定成员。</div>
      </div>
    `,
    buttons: [
      { label: '预览自动分工', className: 'btn btn-secondary btn-sm', id: 'ecom-orch-preview' },
      { label: '立即自动派发', className: 'btn btn-primary btn-sm', id: 'ecom-orch-dispatch' },
    ]
  })
  const prepareMembers = async () => {
    const prompt = overlay.querySelector('#ecom-orch-prompt')?.value?.trim() || ''
    if (!prompt) { toast('请先填写协同任务', 'warning'); return [] }
    const list = overlay.querySelector('#ecom-orch-members')
    if (list) list.innerHTML = '<div class="form-hint">正在自动创建/复用子Agent...</div>'
    const members = await buildEcomOrchestrationCandidates(prompt)
    if (list) list.innerHTML = renderEcomOrchestrationMembers(members)
    const currentState = _ecomWorkbench?.getOrchestrationState() || {}
    _ecomWorkbench?.setOrchestrationState({
      groupId: currentState.groupId || `ecom-orch-${Date.now()}`,
      members,
      lastPrompt: prompt,
      lastDispatchAt: currentState.lastDispatchAt || 0,
    })
    renderEcomWorkbenchSummary()
    return members
  }
  overlay.querySelector('#ecom-orch-preview')?.addEventListener('click', async () => {
    const members = await prepareMembers()
    if (members.length) toast(`已准备 ${members.length} 个自动协同子Agent`, 'success')
  })
  overlay.querySelector('#ecom-orch-dispatch')?.addEventListener('click', async () => {
    const prompt = overlay.querySelector('#ecom-orch-prompt')?.value?.trim() || ''
    const members = await prepareMembers()
    if (!members.length) return
    overlay.close?.()
    await dispatchEcomOrchestration(prompt, members)
  })
}

function analyzeEcomTask(text = '') {
  const raw = String(text || '').trim()
  if (!raw) return { isEcom: false, shouldParallel: false, shouldDispatch: false, hits: [] }
  const hits = detectEcomSkillNeeds(raw)
  const settings = loadEcomWorkbenchSettings()
  const shouldParallel = !!settings.enableParallelRoutes && /(同时|并行|分别|多平台|多个平台|1688.*淘宝|淘宝.*抖音|抖音.*小红书|采集.*对比|对比.*利润)/i.test(raw)
  const shouldDispatch = !!settings.enableSubAgents && !!settings.orchestrationAutoDispatch && shouldParallel
  return { isEcom: hits.length > 0 || (parseSessionAgent(_sessionKey) === 'ecom-mover'), shouldParallel, shouldDispatch, hits }
}

async function maybeAutoOrchestrateEcomTask(text = '') {
  const analysis = analyzeEcomTask(text)
  if (!analysis.isEcom) return false
  if (analysis.shouldDispatch) {
    setEcomRunState({ active: true, phase: '自动协同准备中', detail: '正在按任务创建/复用电商子Agent', tasks: inferEcomSubAgentRoles(text).map(role => ({ title: role.name, status: '准备中' })) })
    const members = await buildEcomOrchestrationCandidates(text)
    if (members.length) {
      appendSystemMessage(`已自动进入并行编排：系统准备了 ${members.length} 个子Agent，并将在主对话持续回报进度。`)
      await dispatchEcomOrchestration(text, members)
      return true
    }
  }
  if (analysis.shouldParallel) {
    setEcomRunState({ active: true, phase: '并行准备中', detail: '该任务适合并行执行，正在优先走快速链路', tasks: [] })
    setReplyStatus('tool', '正在准备并行执行链路', { activity: '电商任务并行预热中' })
  }
  return false
}
function maybeFinalizeEcomRunState(status = 'done', detail = '') {
  if (parseSessionAgent(_sessionKey) !== 'ecom-mover') return
  const message = detail || (status === 'done'
    ? '当前任务已完成，可以继续发下一条电商指令。'
    : status === 'aborted'
      ? '当前任务已中止。'
      : '当前任务执行失败，请检查报错或重试。')
  const currentRunState = _ecomWorkbench?.getRunState() || {}
  const nextTasks = Array.isArray(currentRunState.tasks)
    ? currentRunState.tasks.map(task => ({ ...task, status: status === 'done' ? '已完成' : status === 'aborted' ? '已中止' : '失败' }))
    : []
  setEcomRunState({ active: false, phase: status === 'done' ? '待机' : status === 'aborted' ? '已中止' : '失败', detail: message, tasks: nextTasks })
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

function mapReplyStateToLobsterState(state) {
  return ({
    queued: 'executing',
    sending: 'executing',
    thinking: 'researching',
    tool: 'executing',
    streaming: 'writing',
    finalizing: 'syncing',
    done: 'idle',
    waiting: 'idle',
    error: 'error',
    aborted: 'error',
  })[state] || 'executing'
}

function emitLobsterPhase(phase, message, replyState = '') {
  try {
    const lobsterState = replyState
      ? mapReplyStateToLobsterState(replyState)
      : (phase === 'done' || phase === 'idle' ? 'idle' : phase === 'error' || phase === 'aborted' ? 'error' : 'executing')
    window.dispatchEvent(new CustomEvent('lobster-work-start', {
      detail: { phase, state: lobsterState, message: message || phase }
    }))
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
  syncEcomProgressFromTaskBoard(task)
  saveTaskBoard()
  updateOpenTaskBoardModal()
  return task
}

function syncEcomProgressFromTaskBoard(task = null) {
  const orchestrationState = _ecomWorkbench?.getOrchestrationState() || {}
  if (!orchestrationState.groupId) return
  const members = Array.isArray(orchestrationState.members) ? orchestrationState.members : []
  if (!members.length) return
  const relatedTasks = _taskBoard.filter(item => item.groupId === orchestrationState.groupId)
  if (!relatedTasks.length && !task) return
  const nextItems = members.map(member => {
    const related = relatedTasks.find(item => item.sessionKey === member.sessionKey) || (task && task.sessionKey === member.sessionKey ? task : null)
    const rawStatus = related?.status || 'waiting'
    const statusMap = {
      sending: '已派发',
      queued: '排队中',
      thinking: '执行中',
      streaming: '回传中',
      tool: '调用工具中',
      finalizing: '收尾中',
      done: '已完成',
      error: '失败',
      aborted: '已中止',
      waiting: '等待中',
      running: '执行中',
    }
    return {
      title: member.label || member.agentId || member.sessionKey,
      status: statusMap[rawStatus] || rawStatus,
      sessionKey: member.sessionKey,
      runId: related?.runId || '',
    }
  })
  const doneCount = nextItems.filter(item => item.status === '已完成').length
  const failCount = nextItems.filter(item => item.status === '失败').length
  const activeCount = nextItems.filter(item => ['已派发', '排队中', '执行中', '回传中', '调用工具中', '收尾中'].includes(item.status)).length
  const phase = failCount ? '部分失败' : activeCount ? '结果回收中' : doneCount ? '已完成' : '待机'
  const detail = failCount
    ? `协同成员已完成 ${doneCount} 个，失败 ${failCount} 个。`
    : activeCount
      ? `协同成员执行中：已完成 ${doneCount} / ${nextItems.length}。`
      : doneCount
        ? `协同成员已全部完成，共 ${doneCount} 个。`
        : (_ecomWorkbench?.getRunState()?.detail || '还没有正在执行的电商任务。')
  setEcomRunState({
    active: activeCount > 0,
    phase,
    detail,
    tasks: nextItems,
  })
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
  const gUsage = extractMessageUsage(payload.message || payload)
  if (gUsage && sessionKey) {
    const gCtxUsed = (gUsage.input || 0) + (gUsage.cacheRead || 0) + (gUsage.cacheWrite || 0)
    if (gCtxUsed > 0) _sessionTokenTotals.set(sessionKey, gCtxUsed)
  }
  if (isInternalChatPayload(payload)) return false
  const c = extractChatContent(payload.message)
  const text = c?.text || ''
  const images = c?.images || []
  const videos = c?.videos || []
  const audios = c?.audios || []
  const files = c?.files || []
  const tools = c?.tools || []
  if (!hasVisibleChatContent({ text, images, videos, audios, files })) return false
  const shouldRender = options.render !== false
  if (shouldRender) appendAiMessage(text, new Date(), images, videos, audios, files, tools, { agentLabel: label, sessionKey, model: extractMessageModel(payload.message || {}) || getSessionRuntimeModel(sessionKey), contextWindow: getContextWindow(sessionKey) })
  const stored = {
    id: payload.runId || uuid(), sessionKey: getGroupStorageKey(group), role: 'assistant', content: text, timestamp: Date.now(), agentLabel: label, sourceSessionKey: sessionKey,
    attachments: images.map(i => ({ category: 'image', mimeType: i.mediaType || 'image/png', url: i.url, content: i.data })).filter(a => a.url || a.content)
  }
  rememberGroupMessage(group, stored)
  saveMessage(stored)
  return true
}

function shouldFinalizeBackgroundPayload(payload) {
  if (isInternalChatPayload(payload)) return false
  const content = extractChatContent(payload.message) || {}
  return shouldFinalizeChatRun({
    hasVisibleContent: hasVisibleChatContent(content),
    hasTrackedTools: Boolean(content.tools?.length),
  })
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
  clearGroupLocalState(group)
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
  _runCoordinator.activateSession(_sessionKey)
  _hostedController?.activateSession(_sessionKey, parseSessionAgent(_sessionKey) || 'main')
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

async function sendMessage() {
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
  if (!activeGroup && parseSessionAgent(_sessionKey) === 'ecom-mover') {
    try {
      await maybeAutoInstallEcomSkills(text, { force: false })
      await maybeAutoOrchestrateEcomTask(text)
    } catch (e) {
      appendSystemMessage(`电商自动编排预处理失败：${userFacingChatError(e, 'ecom-preflight')}`, { severity: 'error' })
    }
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
  if (_isSending || _isStreaming) {
    _runCoordinator.enqueue(_sessionKey, text, attachments)
    return
  }
  if (parseSessionAgent(_sessionKey) === 'ecom-mover') {
    setEcomRunState({ active: true, phase: '主任务执行中', detail: `正在执行：${text.slice(0, 64)}`, tasks: _ecomWorkbench?.getRunState()?.tasks || [] })
    setReplyStatus('thinking', `正在处理电商任务：${text.slice(0, 48)}`, { activity: '电商工作流执行中' })
  }
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
        const friendlyError = userFacingChatError(err, 'group-send')
        updateTask(task.id, { status: 'error', progress: 100, error: friendlyError })
        appendSystemMessage(t('chat.groupSendFailed', { target: target.label || sessionKey, msg: friendlyError }))
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
  const sendSessionKey = _sessionKey
  const sendContext = _runCoordinator.beginSend(sendSessionKey)
  appendUserMessage(text, attachments)
  emitLobsterPhase(text.includes('主导引擎') || text.includes('协作引擎') ? 'working' : 'thinking', text.includes('主导引擎') || text.includes('协作引擎') ? t('chat.lobsterCollaborativeTask') : t('chat.lobsterAiProcessing'))
  saveMessage({
    id: uuid(), sessionKey: sendSessionKey, role: 'user', content: text, timestamp: Date.now(),
    attachments: attachments?.length ? attachments.map(a => ({ category: a.category || 'image', mimeType: a.mimeType || '', content: a.content || '', url: a.url || '' })) : undefined
  })
  const currentTask = createTaskRecord({ sessionKey: sendSessionKey, model: getSessionDisplayModel(sendSessionKey), prompt: text, source: 'single', title: text.slice(0, 48) })
  showTyping(true)
  _isSending = true
  updateSendState()
  setReplyStatus('sending', replyStatusText('sending'), { runId: _currentRunId || '', activity: t('chat.replyActivitySubmitting') })
  _startResponseWatchdog()
  let sendFailed = false
  try {
    const result = await wsClient.chatSend(sendSessionKey, text, attachments.length ? attachments : undefined)
    const acceptedRunId = result?.runId || result?.run_id || result?.id || ''
    if (acceptedRunId) _runCoordinator.registerRun(acceptedRunId, sendSessionKey)
  } catch (err) {
    sendFailed = true
    const errText = translateGatewayError(err.message)
    updateTask(currentTask.id, { status: 'error', progress: 100, error: errText })
    if (_runCoordinator.isCurrent(sendContext)) {
      showTyping(false)
      _cancelResponseWatchdog()
      appendSystemMessage(`${t('chat.sendFailed')}${errText}`)
      setReplyStatus('error', `${t('chat.sendFailed')}${errText}`, { runId: _currentRunId || '', activity: t('chat.sendFailedBeforeModel') })
      maybeFinalizeEcomRunState('error', errText)
    }
  } finally {
    _runCoordinator.settleSend(sendContext)
    if (!_runCoordinator.isCurrent(sendContext)) return
    _isSending = false
    updateSendState()
    if (!sendFailed && !_isStreaming) {
      _isStreaming = true
      _streamStartTime = _streamStartTime || Date.now()
      updateSendState()
      scheduleStreamSafetyTimeout()
      setReplyStatus('thinking', replyStatusText('thinking'), { runId: _currentRunId || '', activity: t('chat.replyActivityWaitingGateway') })
      updateTask(currentTask.id, { status: 'thinking', progress: TASK_PROGRESS.thinking })
    }
  }
}

function processMessageQueue() {
  if (_runCoordinator.queuedCount === 0 || _isSending || _isStreaming || !_sessionKey) return
  const msg = _runCoordinator.takeNext(_sessionKey)
  if (msg) doSend(msg.text, msg.attachments || [])
}

function stopGeneration() {
  if (!_sessionKey) return
  const abortSessionKey = _sessionKey
  const abortRunId = _currentRunId || undefined
  wsClient.chatAbort(abortSessionKey, abortRunId).catch(() => {})
  showTyping(false)
  setReplyStatus('aborted', replyStatusText('aborted'), { runId: _currentRunId || '', activity: t('chat.replyActivityAborted') })
  maybeFinalizeEcomRunState('aborted')
}

// ── 事件处理（参照 clawapp 实现） ──

function normalizeChatEventPayload(event, payload = {}) {
  if (event === 'chat') return payload
  if (!event?.startsWith?.('chat.')) return null
  const kind = event.slice('chat.'.length)
  const message = payload.message || payload.data?.message || payload.data || payload
  if (kind === 'message' && message?.role && message.role !== 'assistant') return null
  const stateMap = {
    queued: 'queued', start: 'queued', started: 'queued', run: 'queued',
    delta: 'delta', stream: 'delta', token: 'delta',
    message: 'final', final: 'final', done: 'final', complete: 'final', completed: 'final',
    error: 'error', aborted: 'aborted', abort: 'aborted', stopped: 'aborted',
  }
  const state = payload.state || stateMap[kind]
  if (!state) return null
  return {
    ...payload,
    state,
    runId: payload.runId || payload.run_id || payload.id || message?.runId || message?.run_id || '',
    sessionKey: payload.sessionKey || payload.session_key || message?.sessionKey || message?.session_key || '',
    message,
  }
}

function handleEvent(msg) {
  const { event, payload } = msg
  if (!payload) return

  if (event === 'agent' && payload?.stream === 'tool' && payload?.data?.toolCallId) {
    const ts = payload.ts
    const toolCallId = payload.data.toolCallId
    const runId = payload.runId || ''
    const eventSessionKey = _runCoordinator.resolveEventSession(payload.sessionKey, runId)
    const renderInCurrentSession = Boolean(eventSessionKey)
      && eventSessionKey === _sessionKey
      && (!_currentRunId || !runId || runId === _currentRunId)
    const runKey = `${payload.runId}:${toolCallId}`
    if (_toolEventSeen.has(runKey)) return
    _toolEventSeen.add(runKey)
    if (ts) _toolEventTimes.set(toolCallId, ts)
    const current = _toolEventData.get(toolCallId) || {}
    if (payload.data?.args && current.input == null) current.input = payload.data.args
    if (payload.data?.meta && current.output == null) current.output = payload.data.meta
    const mediaRefs = extractMediaRefsFromValue(payload.data?.meta || payload.data?.output || payload.data?.result || payload.data?.content)
    if (mediaRefs.length && renderInCurrentSession) {
      renderStreamMediaRefs(mediaRefs, payload.runId || _currentRunId)
    }
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
      if (eventSessionKey) {
        updateTaskByRunOrSession(runId, eventSessionKey, { status: 'tool', progress: TASK_PROGRESS.tool })
      }
      if (!renderInCurrentSession) return
      if (payload.runId) _currentRunId = payload.runId
      _isStreaming = true
      if (!_streamStartTime) _streamStartTime = Date.now()
      updateSendState()
      scheduleStreamSafetyTimeout()
      const toolLabel = formatToolDisplayName(toolName)
      const toolInput = summarizeToolInput(payload.data?.args || payload.data?.input || payload.data?.parameters || '')
      emitLobsterPhase('tool', t('chat.lobsterToolCall', { tool: toolLabel }))
      showTyping(false)
      const count = payload.runId ? (_toolRunIndex.get(payload.runId) || []).length : 1
      setReplyStatus('tool', t('chat.typingToolCall', { tool: toolLabel }), { runId: payload.runId, toolName, toolInput, toolCount: count, lastToolAt: Date.now(), activity: toolInput ? t('chat.toolParamsWithValue', { value: toolInput }) : t('chat.waitingToolResult') })
    }
  }

  const chatPayload = normalizeChatEventPayload(event, payload)
  if (chatPayload) handleChatEvent(chatPayload)

  // Compaction 状态指示：上游 2026.3.12 新增 status_reaction 事件
  if (event === 'chat.status_reaction' || event === 'status_reaction') {
    const eventSessionKey = _runCoordinator.resolveEventSession(
      payload.sessionKey || payload.session_key || '',
      payload.runId || payload.run_id || '',
    )
    if (!eventSessionKey || eventSessionKey !== _sessionKey) return
    const reaction = payload.reaction || payload.emoji || ''
    if (reaction.includes('compact') || reaction === '🗜️' || reaction === '📦') {
      showCompactionHint(true)
    } else if (!reaction || reaction === 'thinking' || reaction === '💭') {
      showCompactionHint(false)
    }
  }
}

function findStreamOverlapSuffix(existing = '', incoming = '') {
  const a = String(existing || '')
  const b = String(incoming || '')
  const max = Math.min(a.length, b.length)
  for (let len = max; len > 0; len--) {
    if (a.slice(-len) === b.slice(0, len)) return len
  }
  return 0
}

function normalizeStreamText(text = '') {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/([^\n])\n(#{1,6}\s+)/g, '$1\n\n$2')
    .replace(/([^\n])\n((?:[-*+] |\d+[.)] |>|```|~~~))/g, '$1\n\n$2')
}

function normalizeStreamDelta(text = '') {
  return normalizeStreamText(text)
}

function countHtmlTag(text = '', tag = '') {
  if (!tag) return 0
  const pattern = new RegExp(`<\\s*${tag}(?=\\s|>|/)|<\\s*/\\s*${tag}\\s*>`, 'gi')
  let count = 0
  let match
  while ((match = pattern.exec(text))) {
    count += /^<\s*\//.test(match[0]) ? -1 : 1
  }
  return count
}

function escapeRawHtmlCodeTags(text = '') {
  return String(text || '')
    .replace(/<\s*(\/?)\s*(code|pre)(\s[^>]*)?>/gi, (_, slash, tag) => `&lt;${slash || ''}${tag}&gt;`)
}

function closeDanglingHtmlCodeTags(text = '') {
  let snapshot = text
  const missingCodeClose = countHtmlTag(snapshot, 'code') > 0
  const missingPreClose = countHtmlTag(snapshot, 'pre') > 0
  if (missingCodeClose) snapshot += '</code>'
  if (missingPreClose) snapshot += '</pre>'
  return snapshot
}

function makeStreamRenderSnapshot(text = '') {
  let snapshot = normalizeStreamText(text)
  snapshot = closeDanglingHtmlCodeTags(snapshot)
  snapshot = escapeRawHtmlCodeTags(snapshot)
  const fenceMatches = snapshot.match(/(^|\n)(```|~~~)/g) || []
  if (fenceMatches.length % 2 === 1) {
    const lastFence = fenceMatches[fenceMatches.length - 1].trim().slice(0, 3)
    snapshot += `\n${lastFence}`
  }
  return snapshot
}

function applyStreamText(nextText = '') {
  const text = normalizeStreamDelta(nextText)
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

  const overlap = findStreamOverlapSuffix(_currentAiText, text)
  const appendText = overlap > 0 ? text.slice(overlap) : text
  if (!appendText) return false
  _currentAiText = normalizeStreamText(_currentAiText + appendText)
  return true
}

function reconcileFinalText(finalText = '') {
  const text = normalizeStreamText(finalText)
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

function rememberSeenRunId(runId) {
  if (!runId) return
  _seenRunIds.add(runId)
  if (_seenRunIds.size > 200) {
    const first = _seenRunIds.values().next().value
    _seenRunIds.delete(first)
  }
}

function isLongRunningReplyState(state = _replyStatusState?.state) {
  return ['queued', 'sending', 'thinking', 'tool', 'streaming', 'finalizing'].includes(state)
}

function escapeRuntimeStatusRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/_/g, '[_-]')
}

function hasRuntimeStatus(item = {}, values = []) {
  const runtime = getSessionRuntimeInfo(item)
  const raw = [
    item.status, item.state, item.phase, item.runState, item.runtimeStatus,
    runtime.status, runtime.state, runtime.phase, runtime.runState, runtime.runtimeStatus,
  ].map(value => String(value || '').toLowerCase().trim()).filter(Boolean).join(' ')
  if (!raw) return false
  return values.some(value => {
    const pattern = new RegExp(`(^|[^a-z0-9_-])${escapeRuntimeStatusRegex(value)}($|[^a-z0-9_-])`)
    return pattern.test(raw)
  })
}

function isSessionRuntimeBusy(item = {}) {
  return hasRuntimeStatus(item, ['queued', 'sending', 'thinking', 'streaming', 'tool', 'running', 'in_progress', 'busy', 'working', 'executing', 'finalizing'])
}

function isSessionRuntimeCompleted(item = {}) {
  const runtime = getSessionRuntimeInfo(item)
  if (hasRuntimeStatus(item, ['done', 'complete', 'completed', 'success', 'succeeded', 'idle', 'waiting', 'stopped', 'cancelled'])) return true
  if (item.completedAt || item.completed_at || item.finishedAt || item.finished_at || item.endedAt || item.ended_at || runtime.completedAt || runtime.completed_at || runtime.finishedAt || runtime.finished_at || runtime.endedAt || runtime.ended_at) return true
  return false
}

function findRuntimeSession(sessions = [], sessionKey = _sessionKey) {
  if (!sessionKey) return null
  return sessions.find(item => (item.sessionKey || item.key || item.id || item.name || '') === sessionKey) || null
}

async function syncReplyStatusWithRuntime(reason = '') {
  if (!wsClient.gatewayReady || !_sessionKey || !isLongRunningReplyState()) return false
  try {
    const result = await wsClient.sessionsList(100, { activeMinutes: 10, includeGlobal: true, includeUnknown: true })
    const sessions = result?.sessions || result || []
    updateSessionRuntimeCache(sessions, result?.defaults)
    const item = findRuntimeSession(sessions, _sessionKey)
    if (!item || isSessionRuntimeBusy(item) || !isSessionRuntimeCompleted(item)) return false
    const doneRunId = _currentRunId || _replyStatusState?.runId || ''
    if (_sessionKey && _messagesEl && _pageActive) {
      _lastHistoryHash = ''
      await loadHistory()
    }
    if (isLongRunningReplyState()) {
      if (doneRunId) rememberSeenRunId(doneRunId)
      showTyping(false)
      resetStreamState()
      // The first loadHistory() above runs while streaming and only warms local cache.
      // After runtime says the run completed, repaint once with streaming cleared so
      // silent/history-only completions become visible before the status turns idle.
      if (_sessionKey && _messagesEl && _pageActive) {
        _lastHistoryHash = ''
        await loadHistory()
      }
      setReplyStatus('done', replyStatusText('done'), { runId: doneRunId, activity: reason ? t('chat.replyActivityRuntimeSyncedWithReason', { reason }) : t('chat.replyActivityRuntimeSynced') })
      maybeFinalizeEcomRunState('done')
      processMessageQueue()
    }
    return true
  } catch (e) {
    console.debug('[chat] runtime status sync failed:', e)
    return false
  }
}

function scheduleRuntimeStatusSync(reason = '') {
  clearTimeout(_runtimeStatusSyncTimer)
  if (!isLongRunningReplyState()) return
  _runtimeStatusSyncTimer = setTimeout(() => {
    _runtimeStatusSyncTimer = null
    syncReplyStatusWithRuntime(reason).catch(() => {})
  }, 1200)
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
      if (elapsed > STREAM_STALE_REFRESH_MS && _sessionKey && _messagesEl && _pageActive) {
        const oldHash = _lastHistoryHash
        _lastHistoryHash = ''
        loadHistory().then(async () => {
          if (_lastHistoryHash && _lastHistoryHash !== oldHash) {
            setReplyStatus('finalizing', t('chat.streamHistoryUpdated'), { runId, activity: t('chat.replyActivityFinalizing', { count: 0 }) })
            if (runId) rememberSeenRunId(runId)
            const doneTask = updateTaskByRunOrSession(runId || _currentRunId, _sessionKey, { status: 'done', progress: 100, completedAt: Date.now(), highlighted: true })
            completeTaskRound(doneTask)
            resetStreamState()
            // loadHistory deliberately avoids repainting while a stream is active.
            // When a silent/long-running run only completes in history (no final WS event),
            // render once more after clearing stream state so the completed answer is visible.
            _lastHistoryHash = ''
            await loadHistory()
            setReplyStatus('done', replyStatusText('done'), { runId, activity: t('chat.replyActivityDone') })
            maybeFinalizeEcomRunState('done')
            refreshSessionList()
            processMessageQueue()
          }
        }).catch(() => {})
      }
      showTyping(true, detail)
      scheduleRuntimeStatusSync('quiet')
      scheduleStreamSafetyTimeout()
      return
    }

    const timeoutText = t('chat.streamTimeout')
    console.warn('[chat] 流式安全检查发现状态暂时不活跃，但仍保留任务等待并刷新历史:', runId || '(no-run)', activeState)
    const waitState = activeState && !['done', 'error', 'aborted'].includes(activeState) ? activeState : 'thinking'
    setReplyStatus(waitState, timeoutText, { runId, activity: t('chat.replyActivityRefreshHistory') })
    if (_sessionKey && _messagesEl && _pageActive) {
      _lastHistoryHash = ''
      loadHistory().catch(() => {})
    }
    showTyping(true, timeoutText)
    scheduleRuntimeStatusSync('quiet-timeout')
    scheduleStreamSafetyTimeout()
  }, STREAM_IDLE_NOTICE_MS)
}

function appendMediaRefsToStreamText(refs = []) {
  const lines = []
  for (const ref of refs) {
    const value = typeof ref === 'string' ? ref : (ref?.url || ref?.path || ref?.filePath || ref?.fullPath || '')
    if (!value) continue
    const line = `MEDIA:${value}`
    if (_currentAiText.includes(line) || lines.includes(line)) continue
    lines.push(line)
  }
  if (!lines.length) return false
  _currentAiText = normalizeStreamText([_currentAiText, ...lines].filter(Boolean).join('\n'))
  return true
}

function extractMediaRefsFromValue(value, refs = []) {
  if (value == null) return refs
  if (typeof value === 'string') {
    const re = /(?:https?:\/\/[^\s<>()]+|file:\/\/[^\s<>()]+|[A-Za-z]:[\\/][^\s<>()"'`]+|(?:\.\.?[\\/]|[\\/])[^\s<>()"'`]+)\.(?:png|jpe?g|gif|webp|bmp|svg|mp4|webm|mov|m4v|avi|mkv|mp3|wav|ogg|m4a|flac|aac)(?:[?#][^\s<>()]*)?/gi
    let match
    while ((match = re.exec(value))) refs.push(match[0])
    return refs
  }
  if (Array.isArray(value)) { value.forEach(item => extractMediaRefsFromValue(item, refs)); return refs }
  if (typeof value === 'object') {
    for (const key of ['url', 'path', 'filePath', 'fullPath', 'media', 'output', 'result', 'image', 'video', 'audio', 'content']) extractMediaRefsFromValue(value[key], refs)
    return refs
  }
  return refs
}

function renderStreamMediaRefs(refs = [], runId = _currentRunId) {
  if (!refs.length) return false
  beginStreamBubble(runId)
  const changed = appendMediaRefsToStreamText(refs)
  if (changed) {
    showTyping(false)
    setReplyStatus('streaming', t('chat.replyStreamingProgress', { count: _currentAiText.length }), { runId: runId || _currentRunId, activity: t('chat.replyActivityReceivingOutput') })
    flushStreamRender()
    scheduleStreamSafetyTimeout()
  }
  return changed
}
function handleChatEvent(payload) {
  const { state } = payload
  const runId = payload.runId
  const eventSessionKey = _runCoordinator.resolveEventSession(payload.sessionKey, runId)
  if (!eventSessionKey) {
    console.warn('[chat] 忽略无法确定会话归属的事件:', state, runId || '(no-run)')
    return
  }
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
      if (!shouldFinalizeBackgroundPayload(payload)) return
      const doneTask = updateTaskByRunOrSession(runId, eventSessionKey, { status: 'done', progress: 100, completedAt: Date.now(), highlighted: true }) || trackedTask
      completeTaskRound(doneTask)
      appendGroupAssistantMessage(eventGroup, eventSessionKey, payload, { render: renderIntoCurrentGroup })
      refreshSessionList()
    } else if (state === 'error') {
      const errMsg = translateGatewayError(payload.errorMessage || payload.error?.message || t('common.error'))
      updateTaskByRunOrSession(runId, eventSessionKey, { status: 'error', progress: 100, error: errMsg })
      if (renderIntoCurrentGroup) appendSystemMessage(t('chat.groupMemberReplyFailedNotice', { member: getGroupMemberLabel(getGroupMemberBySession(eventGroup, eventSessionKey), eventSessionKey), msg: errMsg }))
      if (renderIntoCurrentGroup) setReplyStatus('error', errMsg, { runId, sessionKey: eventSessionKey, activity: t('chat.groupMemberReplyFailed') })
    } else if (state === 'aborted') {
      updateTaskByRunOrSession(runId, eventSessionKey, { status: 'aborted', progress: 100 })
    }
    return
  }

  // 群聊会同时把任务发给多个真实会话；非当前会话的事件只更新任务清单和轮次，不渲染到当前聊天窗口，避免串流。
  if (eventSessionKey !== _sessionKey) {
    if (state === 'final') {
      if (!shouldFinalizeBackgroundPayload(payload)) return
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
    console.debug('[chat] 跳过重复 final, runId:', runId)
    return
  }
  if (runId && state === 'delta' && _seenRunIds.has(runId) && !_isStreaming) {
    console.debug('[chat] 跳过已完成 run 的 delta, runId:', runId)
    return
  }
  if (runId && ['error', 'aborted'].includes(state) && _seenRunIds.has(runId)) {
    console.debug('[chat] 跳过已完成 run 的 late terminal event, runId:', runId, 'state:', state)
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
    if (isInternalChatPayload(payload)) return
    if (!_currentRunId && runId) _currentRunId = runId
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
    const structuredMediaRefs = [..._currentAiImages, ..._currentAiVideos, ..._currentAiAudios, ..._currentAiFiles]
      .map(item => item?.url || item?.path || item?.filePath || item?.fullPath || '')
      .filter(Boolean)
    if (structuredMediaRefs.length) renderStreamMediaRefs(structuredMediaRefs, runId || _currentRunId)
    if (c?.text && applyStreamText(c.text)) {
      showTyping(false)
      beginStreamBubble(runId)
      // 启动打字机消费循环（幂等：已在跑则直接返回），而不是每 token 立即渲染
      startTypewriter()
      // 状态条文本/看门狗节流更新，避免每 token 写 localStorage + 重置 90s 定时器
      maybeUpdateStreamStatus(runId)
    }
    return
  }

  if (state === 'final') {
    const internalFinal = isInternalChatPayload(payload)
    if (!_currentRunId && runId) _currentRunId = runId
    if (_currentRunId && runId && runId !== _currentRunId) {
      console.warn('[chat] 忽略非当前 run 的 final，避免覆盖当前流:', runId, 'current:', _currentRunId)
      return
    }
    _cancelResponseWatchdog()
    const c = internalFinal ? null : extractChatContent(payload.message)
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
    const hasContent = finalText || _currentAiText || _currentAiImages.length || _currentAiVideos.length || _currentAiAudios.length || _currentAiFiles.length
    const hasTrackedTools = finalTools.length > 0 || _currentAiTools.length > 0
    // Gateway can emit empty finals before the real answer. Only a visible
    // answer or a confirmed tool execution is allowed to consume the run.
    if (!shouldFinalizeChatRun({ hasVisibleContent: hasContent, hasTrackedTools })) {
      if (internalFinal) {
        showTyping(true, t('chat.replyActivityFinalizing'))
        scheduleStreamSafetyTimeout()
      }
      return
    }
    if (runId && !_runCoordinator.markTerminal(runId)) return
    if (runId) rememberSeenRunId(runId)
    showTyping(false)
    // 如果流式阶段没有创建 bubble，从 final message 中提取
    if (!_currentAiBubble && hasContent) {
      _currentAiBubble = createStreamBubble()
      _currentAiText = normalizeStreamText(finalText)
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
    if (usage) {
      const ctxUsed = (usage.input || 0) + (usage.cacheRead || 0) + (usage.cacheWrite || 0)
      const usageKey = eventSessionKey || _sessionKey
      if (ctxUsed > 0 && usageKey) _sessionTokenTotals.set(usageKey, ctxUsed)
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
      meta.innerHTML = buildMessageMeta({ time: new Date(), durationMs: payload.durationMs || (_streamStartTime ? Date.now() - _streamStartTime : 0), usage, cost, model, contextWindow: getContextWindow(eventSessionKey || _sessionKey), showCopy: true, showTranslate: true })
      wrapper.appendChild(meta)
    }
    const doneTask = updateTaskByRunOrSession(runId || _currentRunId, eventSessionKey, { status: 'done', progress: 100, completedAt: Date.now(), highlighted: true })
    completeTaskRound(doneTask)
    setReplyStatus('done', replyStatusText('done'), { runId: runId || _currentRunId, activity: t('chat.replyActivityDone') })
    maybeFinalizeEcomRunState('done')
    refreshSessionList()
    if (_currentAiText || _currentAiImages.length || _currentAiVideos.length || _currentAiAudios.length || _currentAiFiles.length) {
      saveMessage({
        id: payload.runId || uuid(), sessionKey: eventSessionKey, role: 'assistant',
        content: _currentAiText, timestamp: Date.now(),
        usage: extractMessageUsage(finalMetaSource), cost: extractMessageCost(finalMetaSource), model: extractMessageModel(finalMetaSource) || getSessionRuntimeModel(eventSessionKey), contextWindow: getContextWindow(eventSessionKey),
        attachments: _currentAiImages.map(i => ({ category: 'image', mimeType: i.mediaType || 'image/png', url: i.url, content: i.data })).filter(a => a.url || a.content),
        videos: _currentAiVideos,
        audios: _currentAiAudios,
        files: _currentAiFiles,
      })
    }
    _hostedController?.acceptTarget({ ...payload, sessionKey: eventSessionKey, runId }, finalText || _currentAiText || '')
    resetStreamState()
    _schedulePostFinalCheck()
    processMessageQueue()
    return
  }

  if (state === 'aborted') {
    if (runId && !_runCoordinator.markTerminal(runId)) return
    showTyping(false)
    if (_currentAiBubble && _currentAiText) {
      _currentAiBubble.innerHTML = renderMarkdown(makeStreamRenderSnapshot(_currentAiText))
    }
    appendSystemMessage(t('chat.generationStopped'))
    updateTaskByRunOrSession(_currentRunId, eventSessionKey, { status: 'aborted', progress: 100 })
    setReplyStatus('aborted', replyStatusText('aborted'), { runId: _currentRunId, activity: t('chat.replyActivityAborted') })
    maybeFinalizeEcomRunState('aborted')
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
    if (keepRunWaitingAfterRecoverableError(errMsg, runId, eventSessionKey)) return
    if (runId && !_runCoordinator.markTerminal(runId)) return

    if (_isStreaming || _currentAiBubble) {
      console.warn('[chat] 流式中收到错误，保留部分输出并结束当前流:', errMsg)
      showTyping(false)
      if (_currentAiBubble && _currentAiText) {
        flushStreamRender()
      }
      appendSystemMessage(`${t('chat.errorPrefix')}${errMsg}`)
      updateTaskByRunOrSession(runId || _currentRunId, eventSessionKey, { status: 'error', progress: 100, error: errMsg })
      setReplyStatus('error', `${t('chat.errorPrefix') || ''}${errMsg}`, { runId: runId || _currentRunId, activity: t('chat.checkErrorOrRetryTask') })
      maybeFinalizeEcomRunState('error', errMsg)
      resetStreamState()
      processMessageQueue()
      return
    }

    showTyping(false)
    appendSystemMessage(`${t('chat.errorPrefix')}${errMsg}`)
    updateTaskByRunOrSession(_currentRunId, eventSessionKey, { status: 'error', progress: 100, error: errMsg })
    setReplyStatus('error', `${t('chat.errorPrefix') || ''}${errMsg}`, { runId: _currentRunId, activity: t('chat.checkErrorOrRetryTask') })
    maybeFinalizeEcomRunState('error', errMsg)
    resetStreamState()
    processMessageQueue()
    return
  }
}

function isRecoverableStreamTimeoutError(message = '') {
  const raw = String(message || '')
  const lower = raw.toLowerCase()
  return raw.includes('\u8f93\u51fa\u8d85\u65f6') || raw.includes('\u8f38\u51fa\u8d85\u6642')
    || /output\s+timeout|output[^\n]{0,60}timed?\s*out|no new output|stream[^\n]{0,60}timeout|stream[^\n]{0,60}timed?\s*out|response watchdog/i.test(lower)
}

function keepRunWaitingAfterRecoverableError(errMsg, runId, eventSessionKey) {
  if (!isRecoverableStreamTimeoutError(errMsg)) return false
  if (!_isStreaming && !_currentAiBubble && !isLongRunningReplyState(_replyStatusState?.state)) return false
  const activeState = isLongRunningReplyState(_replyStatusState?.state) ? _replyStatusState.state : (_currentAiText ? 'streaming' : 'thinking')
  const detail = activeState === 'tool' ? t('chat.streamToolStillRunning') : t('chat.streamStillRunning')
  console.warn('[chat] recoverable stream timeout error, keep run waiting:', runId || _currentRunId || '(no-run)', errMsg)
  _isStreaming = true
  _streamStartTime = _streamStartTime || Date.now()
  if (_currentAiBubble && _currentAiText) flushStreamRender()
  showTyping(true, detail)
  updateTaskByRunOrSession(runId || _currentRunId, eventSessionKey, { status: activeState, progress: TASK_PROGRESS[activeState] || TASK_PROGRESS.thinking, error: '' })
  setReplyStatus(activeState, detail, { runId: runId || _currentRunId, activity: t('chat.replyActivityAwaitingMoreEvents', { seconds: _streamStartTime ? Math.max(1, Math.round((Date.now() - _streamStartTime) / 1000)) : 1 }) })
  scheduleRuntimeStatusSync('recoverable-timeout')
  scheduleStreamSafetyTimeout()
  if (_sessionKey && _messagesEl && _pageActive) {
    _lastHistoryHash = ''
    loadHistory().catch(() => {})
  }
  return true
}

function translateGatewayError(message = '') {
  const raw = String(message || '')
  console.error('[chat] Gateway task failed:', raw)
  const req = raw.match(/requestId:\s*([^)\s]+)/i)?.[1]
  if (/pairing required|PAIRING_REQUIRED|device identity changed/i.test(raw)) {
    return t('chat.gatewayPairingChanged', { request: req ? t('chat.gatewayRequestIdSuffix', { request: req }) : '' })
  }
  if (/origin not allowed/i.test(raw)) return t('chat.gatewayOriginNotAllowed')
  if (/NOT_PAIRED/i.test(raw)) return t('chat.gatewayNotPaired')
  const diagnosis = diagnoseChatError(raw)
  if (diagnosis.kind !== 'plain') return diagnosis.message
  const enhanced = enhanceModelCallError(raw, t)
  const lower = raw.toLowerCase()
  if (/insufficient|quota|credit|balance|余额|欠费|429|payment\s+required/.test(lower)) {
    return `${enhanced}\n\n💡 模型服务额度/余额不足，或服务商触发额度限制。请求已被模型服务商拒绝，不是本项目卡住。请充值、切换模型或稍后重试。`
  }
  if (/api.?key|unauthorized|forbidden|401|403|invalid key|认证|密钥|权限/.test(lower)) {
    return `${enhanced}\n\n💡 模型认证失败：API Key 无效、过期，或当前账号没有该模型权限。请检查模型配置页的密钥、Base URL 和模型权限。`
  }
  if (/timeout|timed out|etimedout|econnreset|network|fetch failed|连接|超时|网络/.test(lower)) {
    return `${enhanced}\n\n💡 模型请求网络异常：连接超时或服务端中断。不是聊天页无响应，请检查网络、代理或服务商状态。`
  }
  return enhanced
}

function userFacingChatError(error, context = 'chat') {
  console.error(`[chat] ${context} failed:`, error)
  return diagnoseChatError(error).message
}

/** 从 Gateway message 对象提取文本和所有媒体（参照 clawapp extractContent） */
function extractChatContent(message) {
  if (!message || typeof message !== 'object') return null
  if (isInternalChatPayload(message)) return { text: '', images: [], videos: [], audios: [], files: [], tools: [] }
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
      if (isInternalContentBlock(block)) continue
      if ((block.type === 'text' || block.type === 'output_text') && typeof block.text === 'string') texts.push(block.text)
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
    // OpenClaw 网关在流式预览里把 reasoning 内容作为 markdown 引用块推送：
    // "> Thinking\n> 思考内容..." 或多行 "> ..."。
    // 修复：头部连续的 >引用块（以 Thinking 标题开头）流入正文气泡。
    .replace(/^>\s*Thinking\b[^\n]*(?:\n>\s*[^\n]*)*\n?/gim, '')
    // 兼容 DeepSeek R1 的 <think>...</think>（已由上方处理）和纯推理文本块：
    // 随着 Thinking... 行起头的段落（防备无标签缓冲区残漏）
    .replace(/^Thinking\.\.\.\s*\n[\s\S]*?(?=\n\S|$)/gim, '')
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
    if (_replyStatusDetailEl) _replyStatusDetailEl.innerHTML = buildReplyStatusDetail(_replyStatusState)
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
    web_search: t('chat.toolNameWebSearch'), web_fetch: t('chat.toolNameWebFetch'), image: t('chat.toolNameImage'), imagegen: t('chat.toolNameImageGenerate'), image_gen: t('chat.toolNameImageGenerate'), image_generate: t('chat.toolNameImageGenerate'), video_generate: t('chat.toolNameVideoGenerate'), pdf: t('chat.toolNamePdf'), tts: t('chat.toolNameTts'),
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
  return readable ? t('chat.toolNameUnknown') : t('chat.tool')
}

function formatToolStatus(status = '') {
  const normalized = String(status || '').trim().toLowerCase().replace(/[.-]/g, '_')
  if (['ok', 'success', 'succeeded', 'done', 'complete', 'completed'].includes(normalized)) return t('chat.toolStatusSuccess')
  if (['error', 'failed', 'fail', 'failure'].includes(normalized)) return t('chat.toolStatusFailed')
  if (['running', 'in_progress', 'progress', 'started'].includes(normalized)) return t('chat.toolStatusRunning')
  if (['pending', 'queued', 'waiting'].includes(normalized)) return t('chat.toolStatusPending')
  if (['approval_pending', 'awaiting_approval', 'needs_approval'].includes(normalized)) return t('chat.toolStatusApprovalPending')
  if (['denied', 'rejected', 'blocked', 'unauthorized', 'forbidden'].includes(normalized)) return t('chat.toolStatusDenied')
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

function cleanStatusText(value = '') {
  return String(value || '')
    .replace(/<\/?\s*(code|pre)\s*>/gi, '')
    .replace(/&lt;\/?\s*(code|pre)\s*&gt;/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactStatusText(value = '', max = 64) {
  const text = cleanStatusText(value)
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function renderStatusChips(items = []) {
  return items
    .filter(item => item?.value)
    .map(item => `<span class="chat-status-chip${item.className ? ` ${item.className}` : ''}">${escapeHtml(item.label ? `${item.label}：` : '')}${escapeHtml(compactStatusText(item.value, item.max || 72))}</span>`)
    .join('')
}

function buildReplyStatusDetail(status = _replyStatusState) {
  const items = []
  if (status.state === 'tool' && status.toolName) items.push({ label: t('chat.tool'), value: formatToolDisplayName(status.toolName), max: 32 })
  if (status.activity) items.push({ label: t('chat.replyChipAction'), value: status.activity, max: 56 })
  return renderStatusChips(items)
}

function buildReplyStatusTools(status = _replyStatusState) {
  if (status?.state !== 'tool') return ''
  if (!status?.toolName) return `<span class="chat-status-chip">${escapeHtml(t('chat.toolWaitingName'))}</span>`
  return ''
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
  _replyStatusRowEl.title = compactStatusText(status.detail || replyStatusText(status.state) || '', 160)
  const phase = replyStatusPhase(status.state)
  if (_replyStatusPhaseEl) _replyStatusPhaseEl.textContent = phase
  _replyStatusTextEl.textContent = compactStatusText(status.detail || replyStatusText(status.state), 72)
  if (_replyStatusDetailEl) _replyStatusDetailEl.innerHTML = buildReplyStatusDetail(status)
  if (_replyStatusElapsedEl) _replyStatusElapsedEl.textContent = formatStatusElapsed(status)
  if (_replyStatusMetaEl) {
    const hint = ['queued','sending','thinking','tool','streaming','finalizing'].includes(status.state)
      ? t('chat.replyMetaActiveShort')
      : (status.state === 'done' ? t('chat.replyMetaDoneShort') : t('chat.replyMetaWaitingShort'))
    _replyStatusMetaEl.textContent = hint
  }
  if (_replyStatusToolsEl) {
    _replyStatusToolsEl.innerHTML = buildReplyStatusTools(status)
  }
  markStatusMarquee()
  scheduleReplyStatusTimer(status)
}

function setReplyStatus(state, detail = '', options = {}) {
  const sessionKey = options.sessionKey || _sessionKey || _replyStatusState.sessionKey || 'default'
  const previous = _replyStatusState || {}
  const keepToolContext = ['tool', 'streaming', 'finalizing'].includes(state)
  const next = normalizeReplyStatus({
    state,
    detail: compactStatusText(detail || replyStatusText(state), 90),
    ts: options.ts || (state === previous.state && previous.ts ? previous.ts : Date.now()),
    sessionKey,
    runId: options.runId || _currentRunId || previous.runId || '',
    toolName: options.toolName ?? (keepToolContext ? previous.toolName || '' : ''),
    toolInput: options.toolInput != null ? compactStatusText(options.toolInput, 96) : (keepToolContext ? previous.toolInput || '' : ''),
    toolCount: options.toolCount ?? (keepToolContext ? previous.toolCount ?? 0 : 0),
    lastToolAt: options.lastToolAt || (keepToolContext ? previous.lastToolAt || 0 : 0),
    activity: options.activity || '',
    model: options.model || getSessionDisplayModel(sessionKey) || getSessionRuntimeModel(sessionKey) || previous.model || '',
    agentId: options.agentId || parseSessionAgent(sessionKey) || previous.agentId || 'main',
  }, sessionKey)
  _replyStatusState = next
  persistReplyStatus(next)
  renderReplyStatus(next)
  emitLobsterPhase(mapReplyStateToLobsterPhase(next.state), next.detail || replyStatusText(next.state), next.state)
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
  if (saved && _replyStatusState.state !== 'waiting') {
    emitLobsterPhase(mapReplyStateToLobsterPhase(_replyStatusState.state), _replyStatusState.detail || replyStatusText(_replyStatusState.state), _replyStatusState.state)
  }
}

function updateStreamingStatus(state, detail = '', options = {}) {
  return setReplyStatus(state, detail, options)
}

// 节流的流式状态更新：避免每 token 都 setReplyStatus（写 localStorage）+ 重置 90s 看门狗。
// delta 一阵一阵到，每 token 写一次 localStorage + clear/reset 定时器是主线程负担。
let _lastStreamStatusAt = 0
const STREAM_STATUS_THROTTLE = 250 // ms
function maybeUpdateStreamStatus(runId) {
  const now = performance.now()
  if (now - _lastStreamStatusAt < STREAM_STATUS_THROTTLE) return
  _lastStreamStatusAt = now
  setReplyStatus('streaming', t('chat.replyStreamingProgress', { count: _currentAiText.length }), { runId: runId || _currentRunId, activity: t('chat.replyActivityReceivingOutput') })
  scheduleStreamSafetyTimeout()
}

// ── 流式渲染（打字机匀速消费） ──

/**
 * 启动打字机消费循环。每帧检查 _displayedText 是否追上 _currentAiText，
 * 若未追上则逐字推进；积压越多单帧推进越快（自动追赶）。
 * 流式期间用轻量纯文本渲染（换行→<br>），完整 markdown 解析节流到
 * 180ms 间隔或结束时一次性做，彻底消除 O(n²) 逐帧全量重解析。
 */
function startTypewriter() {
  if (_typewriterActive) return
  _typewriterActive = true
  _displayedText = '' // 从头开始打字
  _lastFullMdRender = 0
  typewriterLoop()
}

function stopTypewriter() {
  if (_typewriterRAF) {
    cancelAnimationFrame(_typewriterRAF)
    _typewriterRAF = null
  }
  _typewriterActive = false
}

function typewriterLoop() {
  if (!_typewriterActive || !_currentAiBubble) {
    _typewriterRAF = null
    return
  }

  const target = _currentAiText || ''
  const displayed = _displayedText || ''
  const backlog = target.length - displayed.length

  if (backlog > 0) {
    // 计算本帧推进量：基础速度 + 根据积压自动追赶
    const catchupBoost = Math.floor(backlog / TYPE_CATCHUP_DIVISOR)
    const charsThisFrame = Math.min(
      TYPE_MAX_CHARS_PER_FRAME,
      Math.max(TYPE_MIN_CHARS_PER_FRAME, TYPE_MIN_CHARS_PER_FRAME + catchupBoost)
    )
    _displayedText = target.slice(0, displayed.length + charsThisFrame)

    // 流式期间用轻量渲染：纯文本 + 换行转<br>，不做完整 markdown 解析
    renderStreamLightweight(_displayedText)

    // 节流完整 markdown 渲染：仅在间隔足够长时（或首次）触发一次
    const now = performance.now()
    if (now - _lastFullMdRender >= STREAM_MD_RENDER_INTERVAL) {
      _lastFullMdRender = now
      renderStreamFullMarkdown(_displayedText)
    }

    scrollToBottom()
  }

  // 无论是否推进，循环继续（直到 stopTypewriter）
  _typewriterRAF = requestAnimationFrame(typewriterLoop)
}

/**
 * 轻量流式渲染：纯文本 + 换行→<br>，跳过完整 markdown 解析。
 * 保留光标效果，快速更新 DOM。
 */
function renderStreamLightweight(text) {
  if (!_currentAiBubble) return
  const escaped = escapeHtml(text || '')
  const withBreaks = escaped.replace(/\n/g, '<br>')
  _currentAiBubble.innerHTML = withBreaks + '<span class="stream-cursor"></span>'
}

/**
 * 节流的完整 markdown 渲染：解析代码块、列表、表格等。
 * 流式期间按 STREAM_MD_RENDER_INTERVAL 调用；结束时 flushStreamRender 强制调用一次。
 */
function renderStreamFullMarkdown(text) {
  if (!_currentAiBubble) return
  const liveTools = _currentAiBubble.querySelector?.('.msg-tool.msg-tool-live')
  if (_currentAiBubble.parentElement) {
    _currentAiBubble.parentElement.dataset.rawText = text || ''
  }
  const renderText = makeStreamRenderSnapshot(text)
  _currentAiBubble.innerHTML = renderMarkdown(renderText)
  if (liveTools) _currentAiBubble.appendChild(liveTools)
}

/** 旧 throttledRender 保留兼容（非流式路径可能调用），内部走 typewriter */
function throttledRender() {
  // 流式时由 typewriter 循环接管，非流式直接flush
  if (_typewriterActive) return
  flushStreamRender()
}

function flushStreamRender() {
  // 强制把 _displayedText 追平到 _currentAiText，并做完整 markdown 渲染
  _displayedText = _currentAiText || ''
  renderStreamFullMarkdown(_displayedText)
  scrollToBottom()
}

function doRender() {
  // 旧实现已被 typewriter 替代，保留空壳防报错
  flushStreamRender()
}

// ── 响应看门狗：防止页面卡在等待状态 ──

function _startResponseWatchdog() {
  _cancelResponseWatchdog()
  _responseWatchdog = setTimeout(async () => {
    _responseWatchdog = null
    // 如果还在等待（未开始流式），只刷新历史/状态，不判定失败，避免后台任务仍运行时 UI 误报超时。
    if (!_isStreaming && _sessionKey && _messagesEl && _pageActive) {
      console.debug('[chat] 响应看门狗触发：无事件返回，刷新历史并继续等待')
      const oldHash = _lastHistoryHash
      _lastHistoryHash = ''
      await loadHistory()
      if (_lastHistoryHash && _lastHistoryHash !== oldHash) {
        const doneRunId = _currentRunId || ''
        if (doneRunId) rememberSeenRunId(doneRunId)
        showTyping(false)
        const doneTask = updateTaskByRunOrSession(doneRunId, _sessionKey, { status: 'done', progress: 100, completedAt: Date.now(), highlighted: true })
        completeTaskRound(doneTask)
        resetStreamState()
        // The first refresh only persists history while waiting/streaming; repaint now that
        // the watchdog has confirmed the answer arrived without a live final event.
        _lastHistoryHash = ''
        await loadHistory()
        setReplyStatus('done', replyStatusText('done'), { runId: doneRunId, activity: t('chat.replyActivityDone') })
        refreshSessionList()
        processMessageQueue()
      } else if (await syncReplyStatusWithRuntime('watchdog')) {
        return
      } else if (!_currentAiBubble) {
        _isStreaming = true
        _streamStartTime = _streamStartTime || Date.now()
        updateSendState()
        showTyping(true, t('chat.streamStillRunning'))
        setReplyStatus('thinking', t('chat.streamStillRunning'), { runId: _currentRunId || '', activity: t('chat.replyActivityWaitingGateway') })
        scheduleStreamSafetyTimeout()
      }
    }
  }, RESPONSE_WATCHDOG_MS)
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
  clearTimeout(_runtimeStatusSyncTimer)
  // 先停打字机循环，再 flush（把还没打完的剩余内容一次性显示出来）
  stopTypewriter()
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
  // 打字机状态清理
  _displayedText = ''
  _lastFullMdRender = 0
  _lastStreamStatusAt = 0
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
  _isSending = false
  showTyping(false)
  updateSendState()
}

// ── 历史消息加载 ──

async function loadHistory() {
  if (!_sessionKey || !_messagesEl) return
  const generation = _pageGeneration
  const sessionKey = _sessionKey
  const isCurrentPage = () => _pageActive && generation === _pageGeneration
  _isLoadingHistory = true
  const hasExisting = _messagesEl.querySelector('.msg')
  if (!hasExisting && isStorageAvailable()) {
    const local = await getLocalMessages(sessionKey, 200)
    if (!isCurrentPage() || !_messagesEl || _sessionKey !== sessionKey) { _isLoadingHistory = false; return }
    if (local.length) {
      clearMessages()
      local.forEach(msg => {
        if (!msg.content && !msg.attachments?.length && !msg.videos?.length && !msg.audios?.length && !msg.files?.length) return
        const msgTime = msg.timestamp ? new Date(msg.timestamp) : new Date()
        if (msg.role === 'user') appendUserMessage(msg.content || '', msg.attachments || null, msgTime)
        else if (msg.role === 'assistant') {
          const images = (msg.attachments || []).filter(a => a.category === 'image').map(a => ({ mediaType: a.mimeType, data: a.content, url: a.url }))
          appendAiMessage(msg.content || '', msgTime, images, msg.videos || [], msg.audios || [], msg.files || [], msg.tools || [], { usage: msg.usage, cost: msg.cost, model: msg.model, contextWindow: msg.contextWindow, sessionKey: msg.sessionKey })
        }
      })
      scrollToBottom()
    }
  }
  if (!wsClient.gatewayReady) { _isLoadingHistory = false; return }
  try {
    const result = await wsClient.chatHistory(sessionKey, 200)
    if (!isCurrentPage() || !_messagesEl || _sessionKey !== sessionKey) { _isLoadingHistory = false; return }
    if (!result?.messages?.length) {
      if (_messagesEl && !_messagesEl.querySelector('.msg')) appendSystemMessage(t('chat.noMessages'))
      return
    }
    const deduped = dedupeHistory(result.messages)
    const hash = deduped.map(historyMessageSignature).join('|')
    if (hash === _lastHistoryHash && hasExisting) return
    _lastHistoryHash = hash

    // 正在发送/流式输出时不全量重绘，避免覆盖本地乐观渲染
    if (hasExisting && (_isSending || _isStreaming || _runCoordinator.queuedCount > 0)) {
      saveMessages(result.messages.map(m => localHistoryMessage(m, sessionKey)).filter(Boolean))
      _isLoadingHistory = false
      return
    }

    clearMessages()
    let hasOmittedImages = false
    deduped.forEach(msg => {
      if (!msg.text && !msg.images?.length && !msg.videos?.length && !msg.audios?.length && !msg.files?.length) return
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
    saveMessages(result.messages.map(m => localHistoryMessage(m, sessionKey)).filter(Boolean))
    scrollToBottom()
    restoreReplyStatus()
  } catch (e) {
    console.error('[chat] loadHistory error:', e)
    if (_messagesEl && !_messagesEl.querySelector('.msg')) appendSystemMessage(`${t('common.loadFailed')}: ${userFacingChatError(e, 'history-load')}`)
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
    if (!c.text && !c.images.length && !c.videos.length && !c.audios.length && !c.files.length) continue
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

function stableHistoryString(value) {
  if (value == null || value === '') return ''
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) } catch { return String(value) }
}

function historyToolSignature(tool = {}) {
  return hashSessionPart([
    tool.id || tool.tool_call_id || tool.toolCallId || '',
    tool.name || tool.tool || tool.tool_name || tool.toolName || '',
    tool.status || '',
    stableHistoryString(tool.input),
    stableHistoryString(tool.output || tool.result),
  ].join('\u001f'))
}

function historyMessageSignature(message = {}) {
  return [
    message.role || '',
    message.timestamp || '',
    hashSessionPart(message.text || ''),
    hashSessionPart((message.images || []).map(i => i.url || i.data || i.mediaType || '').join('\u001f')),
    hashSessionPart((message.videos || []).map(v => v.url || v.data || v.mediaType || '').join('\u001f')),
    hashSessionPart((message.audios || []).map(a => a.url || a.data || a.mediaType || '').join('\u001f')),
    hashSessionPart((message.files || []).map(f => f.url || f.name || f.data || '').join('\u001f')),
    (message.tools || []).map(historyToolSignature).join(','),
    hashSessionPart(stableHistoryString(message.usage)),
    hashSessionPart(stableHistoryString(message.cost)),
    message.model || '',
  ].join(':')
}

function extractContent(msg) {
  const tools = []
  if (isInternalChatPayload(msg)) return { text: '', images: [], videos: [], audios: [], files: [], tools }
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
      if (isInternalContentBlock(block)) continue
      if ((block.type === 'text' || block.type === 'output_text') && typeof block.text === 'string') texts.push(block.text)
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
    } else if (img.url || img.path || img.filePath || img.fullPath) {
      imgEl.src = resolveImageSrc(img.url || img.path || img.filePath || img.fullPath)
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
    else if (vid.url || vid.path || vid.filePath || vid.fullPath) videoEl.src = resolveImageSrc(vid.url || vid.path || vid.filePath || vid.fullPath)
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
    else if (aud.url || aud.path || aud.filePath || aud.fullPath) audioEl.src = resolveImageSrc(aud.url || aud.path || aud.filePath || aud.fullPath)
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
  if (existing) existing.remove()
}

function localHistoryMessage(message, sessionKey) {
  const c = extractContent(message)
  if (!c) return null
  const hasVisibleContent = c.text || c.images?.length || c.videos?.length || c.audios?.length || c.files?.length
  if (!hasVisibleContent) return null
  const role = (message.role === 'tool' || message.role === 'toolResult') ? 'assistant' : message.role
  return {
    id: message.id || uuid(),
    sessionKey,
    role,
    content: c.text || '',
    timestamp: message.timestamp || Date.now(),
    usage: extractMessageUsage(message),
    cost: extractMessageCost(message),
    model: extractMessageModel(message),
    contextWindow: getContextWindow(sessionKey),
    attachments: (c.images || []).map(image => ({
      category: 'image',
      mimeType: image.mediaType || image.media_type || 'image/png',
      content: image.data || image.source?.data || '',
      url: image.url || image.source?.url || '',
    })).filter(image => image.content || image.url),
    videos: c.videos || [],
    audios: c.audios || [],
    files: c.files || [],
  }
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

function appendSystemMessage(text, options = {}) {
  const wrap = document.createElement('div')
  const isError = options.severity === 'error' || /⚠|错误|失败|error|failed|quota|余额|模型服务|认证失败|不可用/i.test(String(text || ''))
  wrap.className = `msg msg-system${isError ? ' msg-system-error' : ''}`
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

function loadVoiceSettings() {
  const fallback = { mode: 'short', wakeWord: '小鱼儿', autoSend: true }
  try {
    const saved = JSON.parse(localStorage.getItem(VOICE_SETTINGS_KEY) || '{}')
    return { ...fallback, ...saved }
  } catch {
    return fallback
  }
}

function saveVoiceSettings() {
  const settings = {
    mode: _voiceModeEl?.value || 'short',
    wakeWord: _voiceWakeWordEl?.value?.trim() || '小鱼儿',
    autoSend: _voiceAutoSendEl?.checked !== false,
  }
  try { localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(settings)) } catch {}
  _voiceController?.setWakeWord(settings.wakeWord)
  return settings
}

function setVoiceStatus(message, state = 'idle') {
  if (_voiceStatusEl) {
    _voiceStatusEl.textContent = message
    _voiceStatusEl.dataset.state = state
  }
  if (_voiceBtn) {
    _voiceBtn.dataset.state = state
    _voiceBtn.classList.toggle('active', state !== 'idle' && state !== 'error')
  }
}

function applyVoiceTranscript(text, meta = {}) {
  const transcript = String(text || '').trim()
  if (!transcript || !_textarea) return
  _textarea.value = transcript
  _textarea.dispatchEvent(new Event('input', { bubbles: true }))
  const shouldSend = _voiceAutoSendEl?.checked !== false
  if (shouldSend) {
    setVoiceStatus(meta.mode === 'continuous' ? '已识别，正在发送并继续监听' : '已识别，正在发送', 'sending')
    sendMessage()
  } else {
    _textarea.focus()
    setVoiceStatus('语音已转成文字，请确认后发送', 'ready')
  }
}

function voiceStatusMessage(status, wakeWord) {
  const messages = {
    idle: '语音已停止',
    listening: '正在聆听，请说话',
    'waiting-wake-word': `等待唤醒词“${wakeWord || '小鱼儿'}”`,
    'wake-armed': '已唤醒，请说出指令',
    error: '语音服务已停止',
  }
  return messages[status] || '语音对话已就绪'
}

function setupVoiceConversation(page) {
  if (!_voiceBtn || !_voicePanelEl) return
  const settings = loadVoiceSettings()
  _voiceModeEl.value = settings.mode
  _voiceWakeWordEl.value = settings.wakeWord
  _voiceAutoSendEl.checked = settings.autoSend

  _voiceController = new VoiceConversationController({
    language: navigator.language?.toLowerCase().startsWith('zh') ? navigator.language : 'zh-CN',
    wakeWord: settings.wakeWord,
    onCommand: applyVoiceTranscript,
    onInterim: (text) => {
      if (text) setVoiceStatus(`正在识别：${text}`, 'listening')
    },
    onStatus: ({ status, wakeWord }) => setVoiceStatus(voiceStatusMessage(status, wakeWord), status),
    onError: ({ code, message }) => {
      if (code === 'no-speech' || code === 'aborted') return
      setVoiceStatus(message, 'error')
      toast(message, 'error')
    },
  })

  if (!_voiceController.supported) {
    setVoiceStatus('当前系统 WebView 不支持在线语音识别；文字聊天不受影响', 'error')
  }

  const toggleButton = page.querySelector('#chat-voice-toggle')
  const startSelectedMode = () => {
    const current = saveVoiceSettings()
    if (_voiceController.active) {
      _voiceController.stop()
      if (toggleButton) toggleButton.textContent = '开始语音'
      return
    }
    const started = current.mode === 'continuous'
      ? _voiceController.startContinuous()
      : current.mode === 'wake'
        ? _voiceController.startWake()
        : _voiceController.startShort()
    if (started && toggleButton) toggleButton.textContent = '停止语音'
  }

  let pushToTalk = false
  let suppressNextClick = false
  const cancelHoldTimer = () => {
    if (_voiceHoldTimer) clearTimeout(_voiceHoldTimer)
    _voiceHoldTimer = null
  }
  _voiceBtn.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    cancelHoldTimer()
    _voiceHoldTimer = setTimeout(() => {
      _voiceHoldTimer = null
      if (!_voicePanelEl || !_voiceController) return
      pushToTalk = true
      suppressNextClick = true
      _voicePanelEl.style.display = 'none'
      _voiceController.startPushToTalk()
    }, 320)
  })
  const finishPointer = () => {
    cancelHoldTimer()
    if (pushToTalk) {
      pushToTalk = false
      _voiceController.stopPushToTalk()
    }
  }
  _voiceBtn.addEventListener('pointerup', finishPointer)
  _voiceBtn.addEventListener('pointercancel', finishPointer)
  _voiceBtn.addEventListener('pointerleave', () => {
    if (pushToTalk) finishPointer()
  })
  _voiceBtn.addEventListener('click', () => {
    if (suppressNextClick) {
      suppressNextClick = false
      return
    }
    _voicePanelEl.style.display = _voicePanelEl.style.display === 'none' ? 'block' : 'none'
  })

  toggleButton?.addEventListener('click', startSelectedMode)
  _voiceModeEl?.addEventListener('change', () => {
    saveVoiceSettings()
    if (_voiceController.active) _voiceController.stop()
    if (toggleButton) toggleButton.textContent = '开始语音'
  })
  _voiceWakeWordEl?.addEventListener('change', saveVoiceSettings)
  _voiceAutoSendEl?.addEventListener('change', saveVoiceSettings)
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
  _pageGeneration += 1
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
  clearInterval(_replyStatusTimer)
  _replyStatusTimer = null
  clearTimeout(_runtimeStatusSyncTimer)
  _runtimeStatusSyncTimer = null
  clearTimeout(_errorTimer)
  _errorTimer = null
  clearTimeout(_renderTimer)
  _renderTimer = null
  stopTypewriter()
  _cancelResponseWatchdog()
  clearTimeout(_postFinalCheck)
  _postFinalCheck = null
  _hostedController?.destroy()
  _hostedController = null
  _sessionKey = null
  _runCoordinator.reset()
  _page = null
  _messagesEl = null
  _textarea = null
  if (_voiceHoldTimer) clearTimeout(_voiceHoldTimer)
  _voiceHoldTimer = null
  _voiceController?.dispose()
  _voiceController = null
  _voiceBtn = null
  _voicePanelEl = null
  _voiceStatusEl = null
  _voiceModeEl = null
  _voiceWakeWordEl = null
  _voiceAutoSendEl = null
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
  _runCoordinator.clearPageQueue()
  _lastHistoryHash = ''
  _workspaceController?.destroy()
  _workspaceController = null
  _ecomWorkbench?.destroy()
  _ecomWorkbench = null
}
