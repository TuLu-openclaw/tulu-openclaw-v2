/**
 * AI 专家库 — 内置 Agency Agents
 */
import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'
import { showConfirm, showUpgradeModal } from '../components/modal.js'
import { t } from '../lib/i18n.js'

let _activePage = null
let _state = { data: null, query: '', division: 'all' }

const DIVISION_LABELS = {
  academic: '学术研究',
  design: '设计体验',
  engineering: '工程开发',
  finance: '财务金融',
  'game-development': '游戏开发',
  gis: 'GIS 地理空间',
  marketing: '营销增长',
  'paid-media': '付费投放',
  product: '产品管理',
  'project-management': '项目管理',
  sales: '销售增长',
  security: '安全攻防',
  'spatial-computing': '空间计算',
  specialized: '专门领域',
  support: '支持运营',
  testing: '测试质量',
}

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[c]))
}

const WORD_LABELS = {
  '3d': '3D', accessibility: '无障碍', account: '客户', accounts: '账款', payable: '应付账款', ad: '广告', creative: '创意', strategist: '策略师',
  aeo: 'AI 搜索优化', foundations: '基础架构', architect: '架构师', agentic: '智能体', identity: '身份', trust: '信任', search: '搜索', optimizer: '优化师',
  agents: '多智能体', orchestrator: '编排师', ai: 'AI', citation: '引用', data: '数据', remediation: '修复', engineer: '工程师', analytics: '分析', reporter: '报告员',
  anthropologist: '人类学顾问', geographer: '地理学顾问', historian: '历史顾问', narratologist: '叙事顾问', api: 'API', tester: '测试工程师', app: '应用', store: '商店',
  application: '应用', security: '安全', automation: '自动化', governance: '治理', autonomous: '自主优化', backend: '后端', baidu: '百度', seo: 'SEO', specialist: '专家',
  behavioral: '行为', nudge: '助推', bilibili: 'B站', content: '内容', bim: 'BIM', gis: 'GIS', blockchain: '区块链', auditor: '审计师', book: '图书', co: '协作', author: '作者',
  bookkeeper: '记账', controller: '管控', brand: '品牌', guardian: '守护者', business: '商业', carousel: '轮播', growth: '增长', cartography: '地图制图', designer: '设计师',
  change: '变更', management: '管理', consultant: '顾问', chief: '首席', financial: '财务', officer: '官', staff: '幕僚长', china: '中国', commerce: '电商', operator: '运营',
  market: '市场', localization: '本地化', civil: '土木', cloud: '云', cms: 'CMS', code: '代码', reviewer: '审查员', codebase: '代码库', onboarding: '上手', compliance: '合规',
  creator: '创作者', corporate: '企业', training: '培训', cross: '跨境', border: '跨境', cultural: '文化', intelligence: '情报', customer: '客户', service: '服务', success: '成功', manager: '经理',
  consolidation: '整合', privacy: '隐私', database: '数据库', deal: '交易', developer: '开发者', advocate: '布道师', devops: 'DevOps', automator: '自动化工程师', discovery: '需求发现', coach: '教练',
  document: '文档', generator: '生成器', douyin: '抖音', drone: '无人机', reality: '实景', mapping: '测绘', drupal: 'Drupal', shopping: '购物', cart: '车', email: '邮件', marketing: '营销',
  embedded: '嵌入式', firmware: '固件', esg: 'ESG', sustainability: '可持续', evidence: '证据', collector: '采集员', executive: '高管', summary: '摘要', experiment: '实验', tracker: '追踪器',
  feedback: '反馈', synthesizer: '综合分析师', feishu: '飞书', integration: '集成', filament: 'Filament', finance: '财务', fp: '财务计划', analyst: '分析师', french: '法国', navigator: '导航顾问',
  frontend: '前端', game: '游戏', audio: '音频', geoai: 'GeoAI', geoprocessing: '地理处理', git: 'Git', workflow: '工作流', master: '专家', global: '全球', podcast: '播客',
  government: '政企', digital: '数字化', presales: '售前', grant: '资助申请', hacker: '黑客', healthcare: '医疗', hospitality: '酒店服务', guest: '宾客', services: '服务', hr: 'HR',
  graph: '图谱', image: '图像', prompt: '提示词', incident: '事件', responder: '响应员', response: '响应', commander: '指挥官', inclusive: '包容性', visuals: '视觉', infrastructure: '基础设施',
  instagram: 'Instagram', curator: '策展', investment: '投资', researcher: '研究员', it: 'IT', jira: 'Jira', korean: '韩国', kuaishou: '快手', language: '语言', translator: '翻译',
  legal: '法务', billing: '计费', time: '工时', tracking: '追踪', client: '客户', intake: '接待', document: '文档', review: '审查', level: '关卡', linkedin: 'LinkedIn',
  livestream: '直播', loan: '贷款', assistant: '助手', lsp: 'LSP', index: '索引', m: '并购', macos: 'macOS', spatial: '空间', metal: 'Metal', mcp: 'MCP', builder: '构建师',
  medical: '医疗', coding: '编码', meeting: '会议', notes: '纪要', minimal: '最小变更', mobile: '移动端', model: '模型', qa: '质检', multi: '多平台', platform: '平台', publisher: '发布',
  narrative: '叙事', offer: '报价', lead: '线索', gen: '生成', operations: '运营', organizational: '组织', psychologist: '心理顾问', orgscript: '组织脚本', outbound: '外呼', paid: '付费投放',
  media: '媒体', social: '社媒', penetration: '渗透', performance: '性能', benchmarker: '基准测试', persona: '用户画像', walkthrough: '走查', personal: '个人', pipeline: '流水线', ppc: 'PPC',
  pr: '公关', communications: '传播', pricing: '定价', private: '私域', domain: '域名', product: '产品', programmatic: '程序化', display: '展示广告', buyer: '买手', project: '项目', shepherd: '推进官',
  proposal: '方案', psychologist: '心理顾问', rapid: '快速', prototyper: '原型师', real: '房地产', estate: '地产', recruitment: '招聘', reddit: 'Reddit', community: '社群', distribution: '分发',
  retail: '零售', returns: '退货', sales: '销售', outreach: '拓客', salesforce: 'Salesforce', query: '查询', senior: '高级', secops: '安全运营', short: '短视频', video: '视频', software: '软件',
  solidity: 'Solidity', smart: '智能', contract: '合约', solution: '解决方案', scientist: '科学家', sprint: '迭代', prioritizer: '优先级', sre: 'SRE', site: '站点', reliability: '可靠性',
  strategy: '战略', duel: '对抗', studio: '工作室', producer: '制片人', study: '留学', abroad: '海外', advisor: '顾问', supply: '供应链', support: '支持', tax: '税务', technical: '技术',
  artist: '美术', writer: '写作', terminal: '终端', results: '结果', analyzer: '分析器', threat: '威胁', detection: '检测', tiktok: 'TikTok', tool: '工具', evaluator: '评估师',
  trend: '趋势', twitter: 'Twitter', engager: '互动运营', ui: 'UI', ux: 'UX', visionos: 'visionOS', visual: '视觉', storyteller: '故事顾问', voice: '语音', web: 'Web', wechat: '微信', mini: '小程序', official: '公众号', weibo: '微博', whimsy: '创意趣味', wordpress: 'WordPress', xiaohongshu: '小红书', xr: 'XR', immersive: '沉浸式', interface: '界面', zhihu: '知乎', zk: '零知识', steward: '管家'
}

function divisionLabel(value) {
  return DIVISION_LABELS[value] || value || '未分类'
}

function cleanEmoji(value) {
  return value && !String(value).includes('?') ? value : '🤖'
}

function agentTitle(agent) {
  return String(agent.slug || agent.id || '')
    .replace(/^agency-/, '')
    .split('-')
    .filter(Boolean)
    .map(part => WORD_LABELS[part] || part)
    .join('') || agent.name || 'AI 专家'
}

function agentSummary(agent) {
  const title = agentTitle(agent)
  const division = divisionLabel(agent.division)
  return `${title}，适用于${division}场景。可作为独立 Agent 处理分析、规划、审查、生成和优化类任务。`
}

function filteredAgents() {
  const data = _state.data
  if (!data) return []
  const q = _state.query.trim().toLowerCase()
  return (data.agents || []).filter(agent => {
    if (_state.division !== 'all' && agent.division !== _state.division) return false
    if (!q) return true
    const hay = `${agent.name || ''} ${agentTitle(agent)} ${agentSummary(agent)} ${agent.description || ''} ${agent.vibe || ''} ${agent.division || ''}`.toLowerCase()
    return hay.includes(q)
  })
}

function renderStats(data) {
  const installed = (data.agents || []).filter(a => a.installed).length
  const divisions = Object.keys(data.divisions || {}).length
  return `
    <div class="agency-stats">
      <div class="stat-card"><div class="stat-value">${data.total || 0}</div><div class="stat-label">全部专家</div></div>
      <div class="stat-card"><div class="stat-value">${installed}</div><div class="stat-label">已安装</div></div>
      <div class="stat-card"><div class="stat-value">${divisions}</div><div class="stat-label">专业分类</div></div>
      <div class="stat-card"><div class="stat-value">MIT</div><div class="stat-label">可商用授权</div></div>
    </div>
  `
}

function renderDivisionOptions(data) {
  const entries = Object.entries(data.divisions || {})
  return `<option value="all">全部分类</option>${entries.map(([key, info]) => (
    `<option value="${esc(key)}">${esc(divisionLabel(key))}（${Number(info?.count || 0)}）</option>`
  )).join('')}`
}

function renderAgentCard(agent) {
  return `
    <div class="agency-card" data-id="${esc(agent.id)}">
      <div class="agency-card-head">
        <div class="agency-avatar">${esc(cleanEmoji(agent.emoji))}</div>
        <div class="agency-title-wrap">
          <div class="agency-name">${esc(agentTitle(agent))}</div>
          <div class="agency-id">原始名称：${esc(agent.name || agent.id)}</div>
        </div>
        <span class="badge ${agent.installed ? 'badge-success' : 'badge-secondary'}">${agent.installed ? '已安装' : '未安装'}</span>
      </div>
      <div class="agency-desc">${esc(agentSummary(agent))}</div>
      <div class="agency-vibe">用途提示：安装后可在 Agent 管理里选择它，针对对应专业问题发起任务。</div>
      <div class="agency-meta">
        <span>${esc(divisionLabel(agent.division))}</span>
        <span>${esc(agent.id || '')}</span>
      </div>
      <div class="agency-actions">
        <button class="btn btn-sm btn-secondary" data-action="detail" data-id="${esc(agent.id)}">预览</button>
        <button class="btn btn-sm btn-primary" data-action="install" data-id="${esc(agent.id)}">${agent.installed ? '重新安装' : '安装'}</button>
      </div>
    </div>
  `
}

function renderList(page) {
  const data = _state.data
  if (!data) return
  const list = filteredAgents()
  const container = page.querySelector('#agency-list')
  const count = page.querySelector('#agency-count')
  if (count) count.textContent = `当前显示 ${list.length} / ${data.total || 0}`
  container.innerHTML = list.length
    ? list.map(renderAgentCard).join('')
    : '<div class="clawhub-empty" style="padding:var(--space-xl);text-align:center;color:var(--text-tertiary)">没有匹配的专家</div>'
}

async function refresh(page) {
  const content = page.querySelector('#agency-content')
  content.innerHTML = '<div class="stat-card loading-placeholder" style="height:120px"></div>'
  try {
    const data = await api.agencyAgentsList()
    _state.data = data
    content.innerHTML = `
      ${renderStats(data)}
      <div class="agency-guide">
        <h2>出厂级使用说明</h2>
        <div class="agency-guide-grid">
          <div><strong>1. 先选场景</strong><span>用分类或搜索找到对应岗位，例如安全审计、前端开发、销售增长、短视频制作。</span></div>
          <div><strong>2. 预览能力</strong><span>点「预览」查看专家的身份、工作规则和自带工作区文件，确认适合再安装。</span></div>
          <div><strong>3. 安装专家</strong><span>单个安装适合测试；安装当前分类适合某个业务线；安装全部适合完整专家库部署。</span></div>
          <div><strong>4. 使用专家</strong><span>安装后到 Agent 管理 / 对话入口选择该专家发起任务；安装窗口会显示复制数量、配置写入和错误明细。</span></div>
        </div>
      </div>
      <div class="clawhub-toolbar agency-toolbar">
        <input class="input" id="agency-search" placeholder="搜索专家、岗位、能力..." value="${esc(_state.query)}" style="flex:1">
        <select class="input input-sm" id="agency-division">${renderDivisionOptions(data)}</select>
        <button class="btn btn-secondary btn-sm" data-action="refresh">刷新</button>
        <button class="btn btn-primary btn-sm" data-action="install-division">安装当前分类</button>
        <button class="btn btn-primary btn-sm" data-action="install-all">安装全部</button>
      </div>
      <div class="agency-install-note">安装会弹出实时进度窗口：显示正在安装什么、复制了多少文件、配置是否写入、失败时具体是哪一个专家出错。</div>
      <div class="agency-count" id="agency-count"></div>
      <div class="agency-grid" id="agency-list"></div>
      <div id="agency-detail"></div>
    `
    const select = page.querySelector('#agency-division')
    select.value = _state.division
    page.querySelector('#agency-search').addEventListener('input', e => {
      _state.query = e.target.value || ''
      renderList(page)
    })
    select.addEventListener('change', e => {
      _state.division = e.target.value || 'all'
      renderList(page)
    })
    renderList(page)
  } catch (e) {
    content.innerHTML = `<div style="color:var(--error);padding:20px">AI 专家库加载失败：${esc(e?.message || e)}</div>`
  }
}

async function installOne(page, id) {
  let modal = null
  try {
    const overwrite = await showConfirm(`安装/更新专家「${id}」？已存在时会覆盖内置 SOUL/AGENTS/IDENTITY 文件。`)
    if (!overwrite) return
    modal = showUpgradeModal('安装 AI 专家')
    modal.setProgress(15)
    modal.appendLog(`开始安装专家：${id}`)
    modal.appendLog('正在复制专家工作区并写入 OpenClaw Agent 配置。')
    const res = await api.agencyAgentInstall(id, true)
    modal.setProgress(85)
    modal.appendLog(`专家名称：${res?.name || id}`)
    modal.appendLog(`工作区：${res?.workspace || '未知'}`)
    modal.appendLog(`复制文件数：${res?.copied ?? 0}`)
    modal.appendLog(res?.configChanged ? 'Agent 配置已更新。' : 'Agent 配置已存在，本次覆盖工作区。')
    modal.setDone(`已安装 ${res?.name || id}`)
    modal.onClose(() => refresh(page))
    toast(`已安装 ${res?.name || id}`, 'success')
    await refresh(page)
  } catch (e) {
    const msg = e?.message || e
    if (modal) {
      modal.appendLog(`失败：${msg}`)
      modal.setError(`安装失败：${msg}`)
    }
    toast(`安装失败：${msg}`, 'error', { duration: 6000 })
  }
}

async function installBulk(page, division = null) {
  const label = division ? `「${divisionLabel(division)}」分类` : '全部 217 个专家'
  const ok = await showConfirm(`确认安装 ${label}？已存在的专家会备份在 OpenClaw 配置外，请谨慎覆盖。`)
  if (!ok) return
  const modal = showUpgradeModal(`安装 AI 专家库：${label}`)
  try {
    modal.setProgress(10)
    modal.appendLog(`开始安装 ${label}。`)
    modal.appendLog('批量安装可能需要一段时间，请不要重复点击。')
    const res = await api.agencyAgentsInstallBulk(division, true)
    modal.setProgress(88)
    modal.appendLog(`新增/更新：${res?.installed || 0}`)
    modal.appendLog(`跳过：${res?.skipped || 0}`)
    modal.appendLog(`复制文件数：${res?.copied || 0}`)
    if ((res?.errors || []).length) {
      res.errors.forEach(item => modal.appendLog(`错误：${item.id} - ${item.error}`))
      modal.setError(`安装完成但有 ${res.errors.length} 个错误`)
    } else {
      modal.setDone('AI 专家库安装完成')
    }
    modal.onClose(() => refresh(page))
    toast(`安装完成：新增/更新 ${res?.installed || 0}，跳过 ${res?.skipped || 0}`, res?.success === false ? 'warning' : 'success')
    await refresh(page)
  } catch (e) {
    const msg = e?.message || e
    modal.appendLog(`失败：${msg}`)
    modal.setError(`批量安装失败：${msg}`)
    toast(`批量安装失败：${msg}`, 'error', { duration: 6000 })
  }
}

async function showDetail(id) {
  const mount = _activePage?.querySelector('#agency-detail')
  if (!mount) return
  mount.innerHTML = '<div class="modal-backdrop"><div class="modal-card"><div class="skeleton" style="height:260px"></div></div></div>'
  try {
    const data = await api.agencyAgentDetail(id)
    const agent = data.agent || {}
    const files = data.files || {}
    mount.innerHTML = `
      <div class="modal-backdrop" data-action="close-detail">
        <div class="modal-card agency-detail-modal" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h3>${esc(cleanEmoji(agent.emoji))} ${esc(agentTitle(agent))}</h3>
            <button class="btn btn-sm btn-secondary" data-action="close-detail">关闭</button>
          </div>
          <p class="form-hint">${esc(agentSummary(agent))}</p>
          <p class="form-hint">原始名称：${esc(agent.name || id)}；分类：${esc(divisionLabel(agent.division))}</p>
          <div class="agency-detail-files">
            ${Object.entries(files).map(([name, content]) => `
              <details ${name === 'IDENTITY.md' ? 'open' : ''}>
                <summary>${esc(name)}</summary>
                <pre>${esc(String(content || '').slice(0, 12000))}</pre>
              </details>
            `).join('')}
          </div>
          <div class="modal-actions">
            <button class="btn btn-primary" data-action="install" data-id="${esc(id)}">安装这个专家</button>
          </div>
        </div>
      </div>
    `
  } catch (e) {
    mount.innerHTML = `<div class="modal-backdrop" data-action="close-detail"><div class="modal-card"><div style="color:var(--error)">预览失败：${esc(e?.message || e)}</div></div></div>`
  }
}

function bindEvents(page) {
  page.addEventListener('click', async e => {
    const target = e.target.closest('[data-action]')
    if (!target) return
    const action = target.dataset.action
    const id = target.dataset.id
    if (action === 'refresh') await refresh(page)
    else if (action === 'install') await installOne(page, id)
    else if (action === 'detail') await showDetail(id)
    else if (action === 'close-detail') page.querySelector('#agency-detail').innerHTML = ''
    else if (action === 'install-all') await installBulk(page, null)
    else if (action === 'install-division') await installBulk(page, _state.division === 'all' ? null : _state.division)
  })
}

export async function render() {
  const page = document.createElement('div')
  page.className = 'page agency-page'
  _activePage = page
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">AI 专家库</h1>
        <p class="page-desc">内置 217 个行业专家 Agent，覆盖工程、安全、营销、电商、销售、设计等场景。</p>
      </div>
    </div>
    <div class="page-content" id="agency-content"></div>
  `
  bindEvents(page)
  refresh(page)
  return page
}

export function cleanup() {
  _activePage = null
}
