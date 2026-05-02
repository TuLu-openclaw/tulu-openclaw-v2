/**
 * 龙虾办公室页面
 * 点击"打开独立窗口"会在 Tauri 新窗口中打开像素风龙虾办公室
 * 当前页面作为引导/信息展示页
 */
import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'

const PREVIEW_PRESETS = {
  ack: { emoji: '🟡', title: '已收到', desc: '已收到新任务，等待进入处理' },
  thinking: { emoji: '💭', title: '思考中', desc: '正在分析和组织方案' },
  tool: { emoji: '🛠️', title: '工具调用', desc: '正在调用工具或执行外部步骤' },
  working: { emoji: '🔴', title: '处理中', desc: '正在持续处理任务' },
  done: { emoji: '🟢', title: '已完成', desc: '任务已处理完成' },
  idle: { emoji: '🟢', title: '待命', desc: '当前无任务，保持待命' },
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
      <div class="page-title">🦞 龙虾办公室</div>
      <div class="page-desc">像素风 AI 状态可视化 · 独立窗口运行</div>
    </div>
    <div class="lobster-intro">
      <div class="intro-card">
        <div class="intro-icon">🦞</div>
        <div class="intro-content">
          <h2>你的 AI 助手正在等你参观</h2>
          <p>龙虾办公室是你的 AI 状态可视化面板。在独立窗口中运行，不影响任何工作。</p>
          <div class="intro-features">
            <div class="feature-item">
              <span class="feature-icon">🎨</span>
              <span>像素风格，视觉舒适</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">🛋️</span>
              <span>6 种状态自动映射</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">🎭</span>
              <span>独立窗口，沉浸体验</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">⚡</span>
              <span>不影响指令和任务</span>
            </div>
          </div>
        </div>
      </div>

      <div class="state-demo">
        <div class="demo-title">状态预览</div>
        <div class="live-preview" id="lobster-live-preview">
          <div class="live-preview-emoji" id="lobster-live-emoji">🟢</div>
          <div class="live-preview-body">
            <div class="live-preview-title" id="lobster-live-title">待命</div>
            <div class="live-preview-desc" id="lobster-live-desc">当前无任务，保持待命</div>
            <div class="live-preview-meta" id="lobster-live-meta">状态: 空闲</div>
          </div>
        </div>
        <div class="demo-grid">
          <div class="demo-item">
            <div class="demo-dot" style="background:#8892b0"></div>
            <div class="demo-info">
              <div class="demo-name">待命</div>
              <div class="demo-desc">休息区沙发</div>
            </div>
          </div>
          <div class="demo-item">
            <div class="demo-dot" style="background:#fbbf24"></div>
            <div class="demo-info">
              <div class="demo-name">写代码</div>
              <div class="demo-desc">工作区办公桌</div>
            </div>
          </div>
          <div class="demo-item">
            <div class="demo-dot" style="background:#60a5fa"></div>
            <div class="demo-info">
              <div class="demo-name">调研</div>
              <div class="demo-desc">工作区</div>
            </div>
          </div>
          <div class="demo-item">
            <div class="demo-dot" style="background:#fbbf24"></div>
            <div class="demo-info">
              <div class="demo-name">执行</div>
              <div class="demo-desc">工作区</div>
            </div>
          </div>
          <div class="demo-item">
            <div class="demo-dot" style="background:#a78bfa"></div>
            <div class="demo-info">
              <div class="demo-name">同步</div>
              <div class="demo-desc">工作区</div>
            </div>
          </div>
          <div class="demo-item">
            <div class="demo-dot" style="background:#f87171"></div>
            <div class="demo-info">
              <div class="demo-name">报错</div>
              <div class="demo-desc">Bug 区</div>
            </div>
          </div>
        </div>
      </div>

      <div class="open-action">
        <button id="open-lobster-btn" class="btn btn-primary btn-xl">
          🦞 打开龙虾办公室
        </button>
        <p class="open-hint">在独立窗口中打开，不影响主界面</p>
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
    const title = preset.title
    const desc = state.message || preset.desc
    const meta = `状态: ${phase} · 阶段: ${state.state || 'working'}`
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
      toast('龙虾办公室已打开', 'info')
      return
    }
    btn.disabled = true
    btn.textContent = '正在打开...'
    try {
      await api.openLobsterOffice()
      // 等待窗口打开后建立通信
      setTimeout(() => {
        _lobsterWin = window.open('/lobster-office.html', 'lobster', 'width=1024,height=640,menubar=no,toolbar=no')
        if (!_lobsterWin) {
          toast('弹窗被拦截，请允许弹窗后重试', 'error')
        } else {
          toast('龙虾办公室已打开！', 'success')
        }
      }, 300)
    } catch (e) {
      toast('打开失败：' + e, 'error')
    } finally {
      btn.disabled = false
      btn.textContent = '🦞 打开龙虾办公室'
    }
  })

  el.__lobsterCleanup = () => {
    window.removeEventListener('storage', refreshLivePreview)
    clearInterval(pollTimer)
  }
}
