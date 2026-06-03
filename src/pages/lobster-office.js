/**
 * 龙虾办公室页面
 * 点击"打开独立窗口"会在 Tauri 新窗口中打开像素风龙虾办公室
 * 当前页面作为引导/信息展示页
 */
import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'
import { t } from '../lib/i18n.js'

const PREVIEW_PRESETS = {
  ack: { emoji: '🟡', titleKey: 'lobsterOffice.stateAckTitle', descKey: 'lobsterOffice.stateAckDesc' },
  thinking: { emoji: '💭', titleKey: 'lobsterOffice.stateThinkingTitle', descKey: 'lobsterOffice.stateThinkingDesc' },
  planning: { emoji: '🧭', titleKey: 'lobsterOffice.statePlanningTitle', descKey: 'lobsterOffice.statePlanningDesc' },
  tool: { emoji: '🛠️', titleKey: 'lobsterOffice.stateToolTitle', descKey: 'lobsterOffice.stateToolDesc' },
  working: { emoji: '🔴', titleKey: 'lobsterOffice.stateWorkingTitle', descKey: 'lobsterOffice.stateWorkingDesc' },
  streaming: { emoji: '✍️', titleKey: 'lobsterOffice.stateStreamingTitle', descKey: 'lobsterOffice.stateStreamingDesc' },
  verifying: { emoji: '🔍', titleKey: 'lobsterOffice.stateVerifyingTitle', descKey: 'lobsterOffice.stateVerifyingDesc' },
  syncing: { emoji: '🔄', titleKey: 'lobsterOffice.stateSyncingTitle', descKey: 'lobsterOffice.stateSyncingDesc' },
  done: { emoji: '🟢', titleKey: 'lobsterOffice.stateDoneTitle', descKey: 'lobsterOffice.stateDoneDesc' },
  idle: { emoji: '🟢', titleKey: 'lobsterOffice.stateIdleTitle', descKey: 'lobsterOffice.stateIdleDesc' },
  error: { emoji: '🔴', titleKey: 'lobsterOffice.stateErrorTitle', descKey: 'lobsterOffice.stateErrorDesc' },
  aborted: { emoji: '🟠', titleKey: 'lobsterOffice.stateAbortedTitle', descKey: 'lobsterOffice.stateAbortedDesc' },
}

function readLiveLobsterState() {
  try {
    return JSON.parse(localStorage.getItem('lobsterState') || '{}') || {}
  } catch {
    return {}
  }
}

export default function render(el) {
  el.innerHTML = `
    <div class="page-header">
      <div class="page-title">🦞 ${t('lobsterOffice.title')}</div>
      <div class="page-desc">${t('lobsterOffice.subtitle')}</div>
    </div>
    <div class="lobster-intro">
      <div class="intro-card">
        <div class="intro-icon">🦞</div>
        <div class="intro-content">
          <h2>${t('lobsterOffice.heroTitle')}</h2>
          <p>${t('lobsterOffice.heroDesc')}</p>
          <div class="intro-features">
            <div class="feature-item">
              <span class="feature-icon">🎨</span>
              <span>${t('lobsterOffice.featurePixel')}</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">🛋️</span>
              <span>${t('lobsterOffice.featureAutoMapping')}</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">🎭</span>
              <span>${t('lobsterOffice.featureWindow')}</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">⚡</span>
              <span>${t('lobsterOffice.featureNonBlocking')}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="state-demo">
        <div class="demo-title">${t('lobsterOffice.statePreview')}</div>
        <div class="live-preview" id="lobster-live-preview">
          <div class="live-preview-emoji" id="lobster-live-emoji">🟢</div>
          <div class="live-preview-body">
            <div class="live-preview-title" id="lobster-live-title">${t('lobsterOffice.stateIdleTitle')}</div>
            <div class="live-preview-desc" id="lobster-live-desc">${t('lobsterOffice.stateIdleDesc')}</div>
            <div class="live-preview-meta" id="lobster-live-meta">${t('lobsterOffice.liveMeta', { phase: t('lobsterOffice.phaseIdle'), state: t('lobsterOffice.stateIdleLabel') })}</div>
          </div>
        </div>
        <div class="demo-grid">
          <div class="demo-item">
            <div class="demo-dot" style="background:#8892b0"></div>
            <div class="demo-info">
              <div class="demo-name">${t('lobsterOffice.demoIdle')}</div>
              <div class="demo-desc">${t('lobsterOffice.demoIdleDesc')}</div>
            </div>
          </div>
          <div class="demo-item">
            <div class="demo-dot" style="background:#fbbf24"></div>
            <div class="demo-info">
              <div class="demo-name">${t('lobsterOffice.demoCoding')}</div>
              <div class="demo-desc">${t('lobsterOffice.demoDesk')}</div>
            </div>
          </div>
          <div class="demo-item">
            <div class="demo-dot" style="background:#60a5fa"></div>
            <div class="demo-info">
              <div class="demo-name">${t('lobsterOffice.demoResearch')}</div>
              <div class="demo-desc">${t('lobsterOffice.demoWorkArea')}</div>
            </div>
          </div>
          <div class="demo-item">
            <div class="demo-dot" style="background:#fbbf24"></div>
            <div class="demo-info">
              <div class="demo-name">${t('lobsterOffice.demoExecuting')}</div>
              <div class="demo-desc">${t('lobsterOffice.demoWorkArea')}</div>
            </div>
          </div>
          <div class="demo-item">
            <div class="demo-dot" style="background:#a78bfa"></div>
            <div class="demo-info">
              <div class="demo-name">${t('lobsterOffice.demoSyncing')}</div>
              <div class="demo-desc">${t('lobsterOffice.demoWorkArea')}</div>
            </div>
          </div>
          <div class="demo-item">
            <div class="demo-dot" style="background:#f87171"></div>
            <div class="demo-info">
              <div class="demo-name">${t('lobsterOffice.demoError')}</div>
              <div class="demo-desc">${t('lobsterOffice.demoBugArea')}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="open-action">
        <button id="open-lobster-btn" class="btn btn-primary btn-xl">
          🦞 ${t('lobsterOffice.openButton')}
        </button>
        <p class="open-hint">${t('lobsterOffice.openHint')}</p>
      </div>
    </div>
  `

  // 注入样式
  if (!document.getElementById('lobster-office-style')) {
    const style = document.createElement('style')
    style.id = 'lobster-office-style'
    style.textContent = `
      .lobster-intro { max-width: 680px; margin: 0 auto; padding: 24px; display: flex; flex-direction: column; gap: 24px; }
      .intro-card { background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--radius-lg); padding: 28px; display: flex; gap: 24px; align-items: flex-start; }
      .intro-icon { font-size: 56px; flex-shrink: 0; line-height: 1; }
      .intro-content h2 { font-size: var(--font-size-xl); font-weight: 700; color: var(--text-primary); margin-bottom: 8px; }
      .intro-content p { color: var(--text-secondary); font-size: var(--font-size-sm); line-height: 1.7; margin-bottom: 16px; }
      .intro-features { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .feature-item { display: flex; align-items: center; gap: 8px; font-size: var(--font-size-sm); color: var(--text-secondary); }
      .feature-icon { font-size: 16px; }
      .state-demo { background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--radius-lg); padding: 20px 24px; }
      .demo-title { font-size: var(--font-size-sm); font-weight: 600; color: var(--text-secondary); margin-bottom: 14px; text-transform: uppercase; letter-spacing: 1px; }
      .demo-grid { display: flex; flex-direction: column; gap: 10px; }
      .live-preview { display:flex; align-items:center; gap:14px; padding:14px 16px; margin-bottom:14px; background:linear-gradient(135deg,var(--bg-tertiary),rgba(233,69,96,0.08)); border:1px solid var(--border-primary); border-radius: var(--radius-md); }
      .live-preview-emoji { font-size:32px; line-height:1; }
      .live-preview-title { font-size: var(--font-size-md); font-weight:700; color:var(--text-primary); }
      .live-preview-desc { font-size: var(--font-size-sm); color:var(--text-secondary); margin-top:2px; }
      .live-preview-meta { font-size: var(--font-size-xs); color: var(--text-tertiary); margin-top:6px; }
      .demo-grid { display: flex; flex-direction: column; gap: 10px; }
      .demo-item { display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: var(--bg-tertiary); border-radius: var(--radius-md); }
      .demo-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
      .demo-name { font-size: var(--font-size-sm); font-weight: 600; color: var(--text-primary); }
      .demo-desc { font-size: var(--font-size-xs); color: var(--text-tertiary); }
      .open-action { text-align: center; padding: 8px 0; }
      .btn-xl { padding: 14px 40px; font-size: var(--font-size-lg); font-weight: 700; border-radius: var(--radius-md); background: linear-gradient(135deg, #e94560, #c1122f); color: #fff; border: none; cursor: pointer; transition: all .2s; }
      .btn-xl:hover { opacity: 0.9; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(233,69,96,0.4); }
      .open-hint { font-size: var(--font-size-xs); color: var(--text-tertiary); margin-top: 10px; }
    `
    document.head.appendChild(style)
  }

  const refreshLivePreview = () => {
    const state = readLiveLobsterState()
    const phase = state.phase || (state.state === 'idle' ? 'idle' : 'working')
    const preset = PREVIEW_PRESETS[phase] || PREVIEW_PRESETS.working
    const emoji = state.emoji || preset.emoji
    const title = t(preset.titleKey)
    const desc = state.message || t(preset.descKey)
    const meta = t('lobsterOffice.liveMeta', { phase, state: state.state || 'working' })
    const emojiEl = el.querySelector('#lobster-live-emoji')
    const titleEl = el.querySelector('#lobster-live-title')
    const descEl = el.querySelector('#lobster-live-desc')
    const metaEl = el.querySelector('#lobster-live-meta')
    if (emojiEl) emojiEl.textContent = emoji
    if (titleEl) titleEl.textContent = title
    if (descEl) descEl.textContent = desc
    if (metaEl) metaEl.textContent = meta
  }

  refreshLivePreview()
  window.addEventListener('storage', refreshLivePreview)
  const pollTimer = setInterval(refreshLivePreview, 1200)

  // 绑定按钮事件
  let _lobsterWin = null
  el.querySelector('#open-lobster-btn').addEventListener('click', async () => {
    const btn = el.querySelector('#open-lobster-btn')
    if (_lobsterWin && !_lobsterWin.closed) {
      _lobsterWin.focus()
      toast(t('lobsterOffice.alreadyOpen'), 'info')
      return
    }
    btn.disabled = true
    btn.textContent = t('lobsterOffice.opening')
    try {
      await api.openLobsterOffice()
      toast(t('lobsterOffice.opened'), 'success')
    } catch (e) {
      // Tauri 命令本身会创建独立窗口；只有命令不可用时才退回到浏览器窗口。
      _lobsterWin = window.open('/lobster-office.html', 'lobster', 'width=1024,height=640,menubar=no,toolbar=no')
      if (!_lobsterWin) {
        toast(t('lobsterOffice.openFailed', { error: String(e) }), 'error')
      } else {
        toast(t('lobsterOffice.browserWindowOpened'), 'info')
      }
    } finally {
      btn.disabled = false
      btn.textContent = `🦞 ${t('lobsterOffice.openButton')}`
    }
  })

  el.__lobsterCleanup = () => {
    window.removeEventListener('storage', refreshLivePreview)
    clearInterval(pollTimer)
  }
}
