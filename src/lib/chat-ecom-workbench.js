const INTRO_SEEN_KEY = '星枢OpenClaw-ecom-intro-seen-v1'
const SETTINGS_KEY = '星枢OpenClaw-ecom-workbench-settings-v1'
const COLLAPSED_KEY = '星枢OpenClaw-ecom-workbench-collapsed-v1'
const TOOLS_SECTION_START = '<!-- ECOM_WORKBENCH_SETTINGS:START -->'
const TOOLS_SECTION_END = '<!-- ECOM_WORKBENCH_SETTINGS:END -->'

const DEFAULT_SETTINGS = Object.freeze({
  platforms: '1688,淘宝,抖音',
  credentialsNote: '',
  vaultSummary: '',
  forceRefreshEachRound: true,
  enableParallelRoutes: true,
  enableSubAgents: true,
  enableVision: true,
  autoSkillDetect: true,
  autoEnableInstalledSkills: false,
  orchestrationAutoDispatch: false,
  skillPool: '1688,阿里,淘宝,天猫,抖音,小红书,京东,拼多多,闲鱼,转转,58同城,跨境',
})

const DEFAULT_RUN_STATE = Object.freeze({ active: false, phase: 'idle', detail: '', tasks: [], startedAt: 0, updatedAt: 0 })
const DEFAULT_ORCHESTRATION_STATE = Object.freeze({ groupId: '', members: [], lastPrompt: '', lastDispatchAt: 0 })

export function renderChatEcomWorkbench() {
  return `
      <div class="chat-ecom-workbench" id="chat-ecom-workbench" style="display:none">
        <div class="chat-ecom-header">
          <div>
            <div class="chat-ecom-title">全自动店铺搬运工作清单</div>
            <div class="chat-ecom-subtitle">SPU 主档优先 · 每轮选品强制刷新 · 支持多线路并行与子Agent调度</div>
          </div>
          <div class="chat-ecom-header-right">
            <div class="chat-ecom-badges"><span class="chat-ecom-badge">SPU First</span><span class="chat-ecom-badge">实时刷新</span><span class="chat-ecom-badge">并行执行</span></div>
            <button class="chat-ecom-collapse-btn" id="btn-ecom-toggle" title="折叠/展开工作台">收起</button>
          </div>
        </div>
        <div class="chat-ecom-body" id="chat-ecom-body">
          <div class="chat-ecom-toolbar">
            <button class="btn btn-sm btn-ghost" id="btn-ecom-settings">配置凭据/策略</button>
            <button class="btn btn-sm btn-ghost" id="btn-ecom-vault">密码保险箱</button>
            <button class="btn btn-sm btn-ghost" id="btn-ecom-skills">自动补技能</button>
            <button class="btn btn-sm btn-ghost" id="btn-ecom-orch">协同面板</button>
            <button class="btn btn-sm btn-ghost" id="btn-ecom-intro">查看首次说明</button>
            <button class="btn btn-sm btn-primary" id="btn-ecom-start-chat">开始对话</button>
          </div>
          <div class="chat-ecom-progress" id="chat-ecom-progress">
            <div class="chat-ecom-progress-head"><div class="chat-ecom-progress-title">实时任务进度</div><div class="chat-ecom-progress-phase" id="chat-ecom-progress-phase">待机</div></div>
            <div class="chat-ecom-progress-message" id="chat-ecom-progress-message">还没有正在执行的电商任务。</div>
            <div class="chat-ecom-progress-list" id="chat-ecom-progress-list"></div>
          </div>
          <div class="chat-ecom-grid">
            <section class="chat-ecom-card"><div class="chat-ecom-card-title">进货清单</div><ul class="chat-ecom-list"><li>SPU 主档 / 平台来源 / 供应商店铺 / 起批量 / 采购价 / 运费 / 库存状态</li><li>SKU 规格明细 / 图片素材状态 / 最近刷新时间 / 异常备注</li><li>每轮选品结束后强制刷新数据，防止继续在旧数据中决策</li></ul></section>
            <section class="chat-ecom-card"><div class="chat-ecom-card-title">售卖清单</div><ul class="chat-ecom-list"><li>SPU 上架目标 / 目标平台 / 目标店铺 / 售价 / 利润率 / 标题优化状态</li><li>SKU 挂载关系 / 主图与详情页状态 / 库存同步状态 / 风险提示</li><li>关键动作需经过质量闸门，异常时第一时间询问用户</li></ul></section>
            <section class="chat-ecom-card"><div class="chat-ecom-card-title">执行策略</div><ul class="chat-ecom-list"><li>默认允许多线路同步并行，优先保证质量再追求速度</li><li>遇到复杂任务可主动调度子Agent拆分处理后统一回收结果</li><li>支持主动补技能、凭据管理、平台地址管理与人工接管</li></ul></section>
            <section class="chat-ecom-card chat-ecom-card-full"><div class="chat-ecom-card-title">当前策略</div><div class="chat-ecom-settings-summary" id="chat-ecom-settings-summary"></div></section>
          </div>
        </div>
      </div>`
}

export function encodeEcomWorkbenchSettings(settings) {
  return `${TOOLS_SECTION_START}\n\necom_workbench:\n  platforms: ${JSON.stringify(settings.platforms || '')}\n  credentialsNote: ${JSON.stringify(settings.credentialsNote || '')}\n  vaultSummary: ${JSON.stringify(settings.vaultSummary || '')}\n  forceRefreshEachRound: ${settings.forceRefreshEachRound ? 'true' : 'false'}\n  enableParallelRoutes: ${settings.enableParallelRoutes ? 'true' : 'false'}\n  enableSubAgents: ${settings.enableSubAgents ? 'true' : 'false'}\n  enableVision: ${settings.enableVision ? 'true' : 'false'}\n  autoSkillDetect: ${settings.autoSkillDetect ? 'true' : 'false'}\n  autoEnableInstalledSkills: ${settings.autoEnableInstalledSkills ? 'true' : 'false'}\n  orchestrationAutoDispatch: ${settings.orchestrationAutoDispatch ? 'true' : 'false'}\n  skillPool: ${JSON.stringify(settings.skillPool || '')}\n${TOOLS_SECTION_END}`
}

export function parseEcomWorkbenchSettings(content = '') {
  const start = content.indexOf(TOOLS_SECTION_START)
  const end = content.indexOf(TOOLS_SECTION_END)
  if (start === -1 || end === -1 || end <= start) return null
  const block = content.slice(start, end)
  const quoted = key => {
    const match = block.match(new RegExp(`${key}:\\s+("(?:[^"\\\\]|\\\\.)*")`))
    if (!match) return ''
    try { return JSON.parse(match[1]) } catch { return '' }
  }
  const bool = (key, fallback) => block.match(new RegExp(`${key}:\\s+(true|false)`))?.[1] === 'true' || (!block.match(new RegExp(`${key}:\\s+(true|false)`)) && fallback)
  return {
    platforms: quoted('platforms'), credentialsNote: quoted('credentialsNote'), vaultSummary: quoted('vaultSummary'),
    forceRefreshEachRound: bool('forceRefreshEachRound', true), enableParallelRoutes: bool('enableParallelRoutes', true),
    enableSubAgents: bool('enableSubAgents', true), enableVision: bool('enableVision', true), autoSkillDetect: bool('autoSkillDetect', true),
    autoEnableInstalledSkills: bool('autoEnableInstalledSkills', false), orchestrationAutoDispatch: bool('orchestrationAutoDispatch', false), skillPool: quoted('skillPool'),
  }
}

export class ChatEcomWorkbench {
  constructor(options = {}) {
    this.page = options.page
    this.api = options.api
    this.storage = options.storage
    this.escapeHtml = options.escapeHtml || String
    this.getContext = options.getContext
    this.callbacks = options.callbacks || {}
    this.listeners = []
    this.destroyed = false
    this.generation = 0
    this.contextKey = ''
    this.loadedAgentId = ''
    this.settings = this.loadSettings()
    this.runState = { ...DEFAULT_RUN_STATE }
    this.orchestrationState = { ...DEFAULT_ORCHESTRATION_STATE }
    this.root = this.page?.querySelector('#chat-ecom-workbench') || null
    this.hint = this.page?.querySelector('#chat-ecom-hint') || null
    this.phase = this.page?.querySelector('#chat-ecom-progress-phase') || null
    this.progressMessage = this.page?.querySelector('#chat-ecom-progress-message') || null
    this.progressList = this.page?.querySelector('#chat-ecom-progress-list') || null
    this.summary = this.page?.querySelector('#chat-ecom-settings-summary') || null
    this.toggleButton = this.page?.querySelector('#btn-ecom-toggle') || null
    this.bindEvents()
    this.applyCollapsed(this.storage?.getItem(COLLAPSED_KEY) === '1')
    this.renderSummary()
    this.renderProgress()
  }

  listen(selector, callback, event = 'click') {
    const element = this.page?.querySelector(selector)
    if (!element) return
    const handler = () => { if (!this.destroyed) void callback() }
    element.addEventListener(event, handler)
    this.listeners.push(() => element.removeEventListener(event, handler))
  }

  bindEvents() {
    this.listen('#btn-ecom-settings', () => this.callbacks.settings?.())
    this.listen('#btn-ecom-vault', () => this.callbacks.vault?.())
    this.listen('#btn-ecom-skills', () => this.callbacks.skills?.())
    this.listen('#btn-ecom-orch', () => this.callbacks.orchestration?.())
    this.listen('#btn-ecom-intro', () => this.appendIntro({ force: true }))
    this.listen('#btn-ecom-start-chat', () => this.startChatTemplate())
    this.listen('#btn-ecom-toggle', () => this.setCollapsed(!this.collapsed))
  }

  loadSettings() {
    try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(this.storage?.getItem(SETTINGS_KEY) || '{}') || {}) } } catch { return { ...DEFAULT_SETTINGS } }
  }

  getSettings() { return this.settings }
  setSettings(settings, { persist = true } = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...(settings || {}) }
    if (persist) { try { this.storage?.setItem(SETTINGS_KEY, JSON.stringify(this.settings)) } catch {} }
    this.renderSummary()
    return this.settings
  }

  getRunState() { return this.runState }
  setRunState(patch = {}) {
    if (this.destroyed) return this.runState
    this.runState = { ...this.runState, ...patch, updatedAt: Date.now() }
    this.renderProgress()
    return this.runState
  }

  getOrchestrationState() { return this.orchestrationState }
  setOrchestrationState(patch = {}) {
    this.orchestrationState = { ...this.orchestrationState, ...patch }
    this.renderSummary()
    return this.orchestrationState
  }

  setCollapsed(collapsed) {
    this.applyCollapsed(collapsed)
    try { this.storage?.setItem(COLLAPSED_KEY, this.collapsed ? '1' : '0') } catch {}
  }

  applyCollapsed(collapsed) {
    this.collapsed = Boolean(collapsed)
    this.root?.classList.toggle('collapsed', this.collapsed)
    if (this.toggleButton) this.toggleButton.textContent = this.collapsed ? '展开' : '收起'
  }

  updateContext() {
    if (this.destroyed) return
    const context = this.getContext?.() || {}
    const agentId = context.agentId || 'main'
    const contextKey = `${agentId}\n${context.sessionKey || ''}`
    if (contextKey !== this.contextKey) {
      this.contextKey = contextKey
      this.generation += 1
    }
    const visible = agentId === 'ecom-mover'
    if (this.root) this.root.style.display = visible ? '' : 'none'
    if (this.hint) this.hint.style.display = visible ? '' : 'none'
    if (!visible) return
    void this.loadForAgent(agentId, this.generation)
    this.renderSummary()
    this.appendIntro()
  }

  async loadForAgent(agentId, generation = this.generation) {
    if (this.destroyed || agentId !== 'ecom-mover' || this.loadedAgentId === agentId) return
    try {
      const result = await this.api.readAgentFile(agentId, 'TOOLS.md')
      if (!this.isCurrent(agentId, generation)) return
      const parsed = parseEcomWorkbenchSettings(result?.content || '')
      if (parsed) this.setSettings({ ...this.loadSettings(), ...parsed })
      this.loadedAgentId = agentId
    } catch {}
  }

  async persistForAgent(agentId = this.getContext?.()?.agentId || '') {
    if (this.destroyed || agentId !== 'ecom-mover') return false
    const generation = this.generation
    const settings = { ...this.settings }
    let current = ''
    try { current = (await this.api.readAgentFile(agentId, 'TOOLS.md'))?.content || '' } catch {}
    if (!this.isCurrent(agentId, generation)) return false
    const block = encodeEcomWorkbenchSettings(settings)
    let next = current || '# TOOLS.md\n\n'
    if (next.includes(TOOLS_SECTION_START) && next.includes(TOOLS_SECTION_END)) next = next.replace(new RegExp(`${TOOLS_SECTION_START}[\\s\\S]*?${TOOLS_SECTION_END}`), block)
    else next = `${next.trimEnd()}\n\n${block}\n`
    await this.api.writeAgentFile(agentId, 'TOOLS.md', next)
    if (!this.isCurrent(agentId, generation)) return false
    this.loadedAgentId = agentId
    return true
  }

  isCurrent(agentId, generation) {
    return !this.destroyed && generation === this.generation && (this.getContext?.()?.agentId || 'main') === agentId
  }

  appendIntro({ force = false } = {}) {
    const context = this.getContext?.() || {}
    if (context.agentId !== 'ecom-mover' || !context.sessionKey) return
    const seenKey = `${INTRO_SEEN_KEY}:${context.sessionKey}`
    if (!force) {
      try { if (this.storage?.getItem(seenKey) === '1') return } catch {}
      if (context.hasMessages?.()) return
    }
    this.callbacks.systemMessage?.('你好，我是“全自动店铺搬运”。我会先按 SPU 主档组织商品，再按 SKU 子规格；每轮选品结束后强制刷新平台数据；复杂任务会优先并行拆分并在关键节点向你确认。需要你提供的平台范围、店铺/账号信息、凭据保存方式、目标利润率，我不会默认执行未经确认的高风险搬运动作。你可以直接在下方输入框发任务，也可以点“开始对话”快速填入任务模板。')
    try { this.storage?.setItem(seenKey, '1') } catch {}
  }

  startChatTemplate() {
    this.callbacks.startTemplate?.('帮我先从 1688 找 10 个适合搬到淘宝的商品 SPU，目标利润率 25%，先不要自动上架，先给我候选清单和风险提示。')
    this.setCollapsed(true)
  }

  renderProgress() {
    if (this.destroyed) return
    if (this.phase) this.phase.textContent = this.runState.active ? (this.runState.phase || '执行中') : '待机'
    if (this.progressMessage) this.progressMessage.textContent = this.runState.detail || '还没有正在执行的电商任务。'
    if (this.progressList) this.progressList.innerHTML = (this.runState.tasks || []).map(task => `<div class="chat-ecom-progress-item"><span>${this.escapeHtml(task.title || task.name || '子任务')}</span><strong>${this.escapeHtml(task.status || '等待中')}</strong></div>`).join('')
  }

  renderSummary() {
    if (!this.summary || this.destroyed) return
    const settings = this.settings
    const rows = [
      ['平台范围', settings.platforms || '未设置'], ['凭据备注', settings.credentialsNote || '未填写（建议仅记录说明，不直接裸写真密码）'],
      ['密码保险箱', settings.vaultSummary || '未维护摘要'], ['每轮强制刷新', settings.forceRefreshEachRound ? '已开启' : '已关闭'],
      ['多线路并行', settings.enableParallelRoutes ? '已开启（允许自动并行）' : '已关闭'], ['子Agent调度', settings.enableSubAgents ? '已开启（允许自动派发）' : '已关闭'],
      ['眼睛能力', settings.enableVision ? '已启用（页面观察/视觉分析）' : '未启用'], ['自动补技能', settings.autoSkillDetect ? '已启用（按任务识别并给出安装/启用流程）' : '已关闭'],
      ['技能自动启用', settings.autoEnableInstalledSkills ? '已启用（安装后自动写入 Agent）' : '手动启用'], ['协同自动派发', settings.orchestrationAutoDispatch ? '已启用（会按成员分发子任务）' : '手动派发'],
      ['技能池', settings.skillPool || DEFAULT_SETTINGS.skillPool],
    ]
    this.summary.innerHTML = rows.map(([label, value]) => `<div class="chat-ecom-summary-row"><span>${this.escapeHtml(label)}</span><strong>${this.escapeHtml(String(value))}</strong></div>`).join('')
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.generation += 1
    this.listeners.splice(0).forEach(remove => remove())
    this.page = null
    this.root = null
    this.hint = null
    this.phase = null
    this.progressMessage = null
    this.progressList = null
    this.summary = null
    this.toggleButton = null
  }
}
