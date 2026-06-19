/**
 * Agent 管理页面
 * Agent 增删改查 + 身份编辑
 */
import { api, invalidate } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'
import { showModal, showConfirm } from '../components/modal.js'
import { CHANNEL_LABELS } from '../lib/channel-labels.js'
import { t } from '../lib/i18n.js'

const ECOM_AGENT_PRESET = {
  id: 'ecom-mover',
  name: '全自动店铺搬运',
  emoji: '🛒',
}

const ECOM_AGENT_BOOTSTRAP_FILES = [
  {
    name: 'SOUL.md',
    content: `# SOUL.md - 全自动店铺搬运\n\n## 使命\n- 专注于电商商品搬运、选品、归档、上架与多平台同步。\n- 以 SPU 为主，SKU 作为子层。\n- 每轮选品结束后必须刷新平台数据。\n\n## 工作原则\n- 先确认再执行，遇到阻塞主动询问。\n- 允许多线路并行与子 Agent 拆分，但质量优先。\n- 不默认执行未授权、违规或有明显风险的搬运动作。\n\n## 内置能力\n- 平台技能池：1688、阿里、淘宝、天猫、抖音、小红书、京东、拼多多、闲鱼、转转、58同城、跨境。\n- 眼睛能力：页面观察、视觉分析、网页读取。\n- 默认提供首次自介绍与专属工作台。\n`,
  },
  {
    name: 'IDENTITY.md',
    content: `# IDENTITY.md - 全自动店铺搬运\n\n- Name: 全自动店铺搬运\n- Vibe: SPU-first、强制刷新、并行执行、质量优先\n- Emoji: 🛒\n- Eye: enabled\n- Domains: 1688 / 阿里 / 淘宝 / 天猫 / 抖音 / 小红书 / 京东 / 拼多多 / 闲鱼 / 转转 / 58同城 / 跨境\n`,
  },
  {
    name: 'TOOLS.md',
    content: `# TOOLS.md - 全自动店铺搬运\n\n## 默认工作台\n- 进货清单：SPU 主档、SKU 子项、供应商、价格、库存、图片、刷新时间。\n- 售卖清单：目标平台、目标店铺、售价、利润率、标题与详情页状态。\n- 眼睛能力：页面观察、视觉分析、网页阅读。\n\n## 默认策略\n- SPU-first，SKU only as child records。\n- 每轮选品后强制刷新。\n- 支持多线路并行与子 Agent 调度。\n- 凭据建议只记录用途与保存方式，不建议在这里裸写真实密码。\n`,
  },
]

const ECOM_SKILL_KEYWORDS = [
  'browser', 'web', 'scraping', 'obsidian', 'playwright', 'vision', 'fetch', 'shop', 'store', 'storyboard'
]

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[c]))
}

function pickEcomSkills(skills = []) {
  return (skills || [])
    .filter(skill => skill && skill.eligible !== false && skill.disabled !== true)
    .filter(skill => {
      const hay = `${skill.name || ''} ${skill.description || ''}`.toLowerCase()
      return ECOM_SKILL_KEYWORDS.some(keyword => hay.includes(keyword))
    })
    .map(skill => skill.name)
}

export async function render() {
  const page = document.createElement('div')
  page.className = 'page agents-page'

  page.innerHTML = `
    <div class="page-header agents-page-header">
      <div>
        <h1 class="page-title">${t('agents.title')}</h1>
        <p class="page-desc">${t('agents.desc')}</p>
        <p class="page-subhint">${t('agents.detailHint')}</p>
      </div>
      <div class="page-actions agents-page-actions">
        <button class="btn btn-secondary agents-hero-btn agents-hero-btn-ecom" id="btn-add-ecom-agent">${t('agents.addEcomAgent')}</button>
        <button class="btn btn-primary agents-hero-btn agents-hero-btn-primary" id="btn-add-agent">${t('agents.addAgent')}</button>
      </div>
    </div>
    <div class="page-content">
      <div id="agents-list"></div>
    </div>
  `

  const state = { agents: [], bindings: [] }
  // 非阻塞：先返回 DOM，后台加载数据
  loadAgents(page, state)

  page.querySelector('#btn-add-agent').addEventListener('click', () => showAddAgentDialog(page, state))
  page.querySelector('#btn-add-ecom-agent').addEventListener('click', () => createEcomAgent(page, state))

  return page
}

function renderSkeleton(container) {
  const item = () => `
    <div class="agent-card" style="pointer-events:none">
      <div class="agent-card-header">
        <div class="skeleton" style="width:40px;height:40px;border-radius:50%"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:6px">
          <div class="skeleton" style="width:45%;height:16px;border-radius:4px"></div>
          <div class="skeleton" style="width:60%;height:12px;border-radius:4px"></div>
        </div>
      </div>
    </div>`
  container.innerHTML = [item(), item(), item()].join('')
}

async function loadAgents(page, state) {
  const container = page.querySelector('#agents-list')
  renderSkeleton(container)
  try {
    const [agents, config] = await Promise.all([
      api.listAgents(),
      api.readOpenclawConfig().catch(() => null),
    ])
    state.agents = agents
    state.bindings = Array.isArray(config?.bindings) ? config.bindings : []
    renderAgents(page, state)

    // 只在第一次加载时绑定事件（避免重复绑定）
    if (!state.eventsAttached) {
      attachAgentEvents(page, state)
      state.eventsAttached = true
    }
  } catch (e) {
    container.innerHTML = '<div style="color:var(--error);padding:20px">' + t('agents.loadFailed') + ': ' + String(e).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>'
    toast(t('agents.loadListFailed') + ': ' + e, 'error')
  }
}

/** 为指定 agent 生成绑定渠道的 badge HTML */
function renderBindingBadges(agentId, bindings) {
  const matched = (bindings || []).filter(b => (b.agentId || 'main') === agentId)
  if (!matched.length) {
    return `<span style="color:var(--text-tertiary)">${t('agents.noBinding')}</span>`
  }
  return matched.map(b => {
    const channel = b.match?.channel || ''
    const label = CHANNEL_LABELS[channel] || channel
    const accountId = b.match?.accountId
    const text = accountId ? `${label} · ${accountId}` : label
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    return `<span style="font-size:var(--font-size-xs);color:var(--accent);background:var(--accent-muted);padding:1px 6px;border-radius:10px;white-space:nowrap">${escaped}</span>`
  }).join(' ')
}

function renderAgents(page, state) {
  const container = page.querySelector('#agents-list')
  if (!state.agents.length) {
    container.innerHTML = `<div style="color:var(--text-tertiary);padding:20px;text-align:center">${t('agents.noAgents')}</div>`
    return
  }

  container.innerHTML = state.agents.map(a => {
    const isDefault = a.isDefault || a.id === 'main'
    const name = a.identityName ? a.identityName.split(',')[0].trim() : t('agents.noDesc')
    const safeId = escapeHtml(a.id)
    const safeName = escapeHtml(name)
    const rawModel = typeof a.model === 'object' ? (a.model?.primary || a.model?.id || JSON.stringify(a.model)) : (a.model || t('agents.notSet'))
    const safeModel = escapeHtml(rawModel)
    const safeWorkspace = escapeHtml(a.workspace || t('agents.notSet'))
    return `
      <div class="agent-card" data-id="${safeId}">
        <div class="agent-card-header">
          <div class="agent-card-title">
            <span class="agent-id">${safeId}</span>
            ${isDefault ? `<span class="badge badge-success">${t('agents.default')}</span>` : ''}
          </div>
          <div class="agent-card-actions">
            <button class="btn btn-sm btn-primary" data-action="detail" data-id="${safeId}">${t('agents.detail')}</button>
            <button class="btn btn-sm btn-secondary" data-action="backup" data-id="${safeId}">${t('agents.backup')}</button>
            <button class="btn btn-sm btn-secondary" data-action="import-workspace" data-id="${safeId}">${t('agents.importWorkspace')}</button>
            <button class="btn btn-sm btn-secondary" data-action="edit" data-id="${safeId}">${t('agents.edit')}</button>
            ${!isDefault ? `<button class="btn btn-sm btn-danger" data-action="delete" data-id="${safeId}">${t('agents.delete')}</button>` : ''}
          </div>
        </div>
        <div class="agent-card-body">
          <div class="agent-info-row">
            <span class="agent-info-label">${t('agents.labelName')}</span>
            <span class="agent-info-value">${safeName}</span>
          </div>
          <div class="agent-info-row">
            <span class="agent-info-label">${t('agents.labelModel')}</span>
            <span class="agent-info-value">${safeModel}</span>
          </div>
          <div class="agent-info-row">
            <span class="agent-info-label">${t('agents.labelWorkspace')}</span>
            <span class="agent-info-value" style="font-family:var(--font-mono);font-size:var(--font-size-xs)">${safeWorkspace}</span>
          </div>
          <div class="agent-info-row">
            <span class="agent-info-label">${t('agents.labelBindings')}</span>
            <span class="agent-info-value">${renderBindingBadges(a.id, state.bindings)}</span>
          </div>
        </div>
      </div>
    `
  }).join('')
}

function attachAgentEvents(page, state) {
  const container = page.querySelector('#agents-list')
  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]')
    if (btn) {
      const action = btn.dataset.action
      const id = btn.dataset.id
      if (action === 'detail') location.hash = `#/agent-detail?id=${encodeURIComponent(id)}`
      else if (action === 'edit') showEditAgentDialog(page, state, id)
      else if (action === 'import-workspace') showImportWorkspaceDialog(page, state, id)
      else if (action === 'delete') await deleteAgent(page, state, id)
      else if (action === 'backup') await backupAgent(id)
      return
    }
    // 点击卡片空白区域 → 进入详情页
    const card = e.target.closest('.agent-card')
    if (card) {
      const id = card.dataset.id
      if (id) location.hash = `#/agent-detail?id=${encodeURIComponent(id)}`
    }
  })
}

async function showImportWorkspaceDialog(page, state, targetId) {
  const sources = (state.agents || [])
    .filter(a => a.id !== targetId && a.workspace)
    .map(a => ({ value: a.id, label: `${a.id}${a.identityName ? ' — ' + a.identityName.split(',')[0] : ''}` }))
  if (!sources.length) {
    toast(t('agents.importWorkspaceNoSource'), 'warning')
    return
  }
  showModal({
    title: t('agents.importWorkspaceTitle', { id: targetId }),
    fields: [
      { name: 'sourceId', label: t('agents.importWorkspaceSource'), type: 'select', value: sources[0].value, options: sources },
    ],
    onConfirm: async (result) => {
      const sourceId = (result.sourceId || '').trim()
      if (!sourceId || sourceId === targetId) return
      const yes = await showConfirm(t('agents.importWorkspaceConfirm', { source: sourceId, target: targetId }))
      if (!yes) return
      try {
        const res = await api.importAgentWorkspace(targetId, sourceId)
        toast(t('agents.importWorkspaceDone', { count: res?.copied || 0 }), 'success')
        invalidate('list_agents')
        await loadAgents(page, state)
      } catch (e) {
        toast(t('agents.importWorkspaceFailed') + ': ' + e, 'error')
      }
    }
  })
}

async function showAddAgentDialog(page, state) {
  // 获取模型列表
  let models = []
  try {
    const config = await api.readOpenclawConfig()
    const providers = config?.models?.providers || {}
    for (const [pk, pv] of Object.entries(providers)) {
      for (const m of (pv.models || [])) {
        const id = typeof m === 'string' ? m : m.id
        if (id) models.push({ value: `${pk}/${id}`, label: `${pk}/${id}` })
      }
    }
  } catch { models = [{ value: 'newapi/claude-opus-4-6', label: 'newapi/claude-opus-4-6' }] }

  if (!models.length) {
    toast(t('agents.addModelsFirst'), 'warning')
    return
  }

  showModal({
    title: t('agents.addTitle'),
    fields: [
      { name: 'id', label: t('agents.agentId'), value: '', placeholder: t('agents.agentIdPlaceholder') },
      { name: 'name', label: t('agents.agentName'), value: '', placeholder: t('agents.agentNamePlaceholder') },
      { name: 'emoji', label: t('agents.agentEmoji'), value: '', placeholder: t('agents.agentEmojiPlaceholder') },
      { name: 'model', label: t('agents.agentModel'), type: 'select', value: models[0]?.value || '', options: models },
      { name: 'workspace', label: t('agents.agentWorkspace'), value: '', placeholder: t('agents.agentWorkspacePlaceholder') },
    ],
    onConfirm: async (result) => {
      const id = (result.id || '').trim()
      if (!id) { toast(t('agents.idRequired'), 'warning'); return }
      if (!/^[a-z0-9_-]+$/.test(id)) { toast(t('agents.idInvalid'), 'warning'); return }

      const name = (result.name || '').trim()
      const emoji = (result.emoji || '').trim()
      const model = result.model || models[0]?.value || ''
      const workspace = (result.workspace || '').trim()

      try {
        await api.addAgent(id, model, workspace || null)
        // 身份信息更新（非关键，失败不阻塞）
        if (name || emoji) {
          try {
            await api.updateAgentIdentity(id, name || null, emoji || null)
          } catch (identityErr) {
            console.warn('[Agent] 身份信息更新失败（Agent 已创建）:', identityErr)
            toast(t('agents.createdNameFailed'), 'warning')
          }
        }
        toast(t('agents.created'), 'success')

        // 强制清除缓存并重新加载
        invalidate('list_agents')
        await loadAgents(page, state)
      } catch (e) {
        toast(t('agents.createFailed') + ': ' + e, 'error')
      }
    }
  })
}

async function createEcomAgent(page, state) {
  const targetId = ECOM_AGENT_PRESET.id
  const openExisting = async (mode = 'detail') => {
    invalidate('list_agents', 'get_agent_detail')
    await loadAgents(page, state)
    toast(t('agents.ecomAgentExists'), 'info')
    location.hash = mode === 'chat'
      ? `#/chat?session=${encodeURIComponent(`agent:${targetId}`)}`
      : `#/agent-detail?id=${encodeURIComponent(targetId)}`
  }

  const checkExists = async () => {
    const freshAgents = await api.listAgents().catch(() => [])
    state.agents = Array.isArray(freshAgents) ? freshAgents : []
    return state.agents.some(agent => agent.id === targetId)
  }

  if (await checkExists()) {
    await openExisting('detail')
    return
  }

  try {
    const config = await api.readOpenclawConfig()
    const providers = config?.models?.providers || {}
    let model = ''
    for (const [pk, pv] of Object.entries(providers)) {
      const first = Array.isArray(pv.models) ? pv.models[0] : null
      const mid = typeof first === 'string' ? first : first?.id
      if (mid) {
        model = `${pk}/${mid}`
        break
      }
    }
    if (!model) {
      toast(t('agents.addModelsFirst'), 'warning')
      return
    }

    const skillsResp = await api.skillsList().catch(() => ({ skills: [] }))
    const enabledSkills = pickEcomSkills(skillsResp?.skills || [])

    await api.addAgent(targetId, model, null)
    await api.updateAgentIdentity(targetId, ECOM_AGENT_PRESET.name, ECOM_AGENT_PRESET.emoji)
    await api.updateAgentConfig(targetId, {
      identity: {
        name: ECOM_AGENT_PRESET.name,
        emoji: ECOM_AGENT_PRESET.emoji,
      },
      skills: enabledSkills,
      tools: {
        profile: 'full',
      },
      profile: 'ecommerce',
      metadata: {
        preset: 'ecom-mover',
        domain: 'ecommerce',
        spuMode: 'spu-first',
        workbench: {
          enabled: true,
          sourcingList: true,
          sellingList: true,
          parallelRoutes: true,
          subAgents: true,
          forceRefreshEachRound: true,
        },
      },
    })
    for (const file of ECOM_AGENT_BOOTSTRAP_FILES) {
      await api.writeAgentFile(targetId, file.name, file.content)
    }

    invalidate('list_agents', 'get_agent_detail')
    await loadAgents(page, state)
    toast(t('agents.ecomAgentCreated'), 'success')
    location.hash = `#/chat?session=${encodeURIComponent(`agent:${targetId}`)}`
  } catch (e) {
    const message = String(e?.message || e || '')
    if (message.includes('已存在') || message.includes('already exists') || message.includes('Agent「ecom-mover」已存在')) {
      const existsNow = await checkExists()
      if (existsNow) {
        await openExisting('chat')
        return
      }
    }
    toast(t('agents.createFailed') + ': ' + e, 'error')
  }
}

async function showEditAgentDialog(page, state, id) {
  const agent = state.agents.find(a => a.id === id)
  if (!agent) return

  const name = agent.identityName ? agent.identityName.split(',')[0].trim() : ''

  // 获取模型列表
  let models = []
  try {
    const config = await api.readOpenclawConfig()
    const providers = config?.models?.providers || {}
    for (const [pk, pv] of Object.entries(providers)) {
      for (const m of (pv.models || [])) {
        const mid = typeof m === 'string' ? m : m.id
        if (mid) models.push({ value: `${pk}/${mid}`, label: `${pk}/${mid}` })
      }
    }
    // 模型列表加载成功
  } catch (e) {
    console.error('[Agent编辑] 获取模型列表失败:', e)
  }

  const fields = [
    { name: 'name', label: t('agents.agentName'), value: name, placeholder: t('agents.agentNamePlaceholder') },
    { name: 'emoji', label: t('agents.agentEmoji'), value: agent.identityEmoji || '', placeholder: t('agents.agentEmojiPlaceholder') },
  ]

  if (models.length) {
    const modelField = {
      name: 'model', label: t('agents.agentModel'), type: 'select',
      value: agent.model || models[0]?.value || '',
      options: models,
    }
    fields.push(modelField)

  } else {
    console.warn('[Agent编辑] 模型列表为空，不显示模型选择器')
  }

  fields.push({
    name: 'workspace', label: t('agents.labelWorkspace').replace(':', ''),
    value: agent.workspace || t('agents.notSet'),
    placeholder: t('agents.workspaceReadonly'),
    readonly: true,
  })

  showModal({
    title: t('agents.editTitle', { id }),
    fields,
    onConfirm: async (result) => {
      // 保存 Agent 编辑结果
      const newName = (result.name || '').trim()
      const emoji = (result.emoji || '').trim()
      const model = (result.model || '').trim()

      const currentEmoji = agent.identityEmoji || ''
      const identityChanged = newName !== name || emoji !== currentEmoji

      try {
        if (identityChanged) {
          await api.updateAgentIdentity(id, newName || null, emoji || null)
        }
        if (model && model !== agent.model) {
          await api.updateAgentModel(id, model)
        }

        // 手动更新 state 并重新渲染，确保立即生效（包含清空姓名/Emoji 的场景）
        if (identityChanged) {
          agent.identityName = newName
          agent.identityEmoji = emoji
        }
        if (model) agent.model = model
        renderAgents(page, state)

        toast(t('agents.updated'), 'success')
      } catch (e) {
        console.error('[Agent编辑] 保存失败:', e)
        toast(t('agents.updateFailed') + ': ' + e, 'error')
      }
    }
  })
}

async function deleteAgent(page, state, id) {
  const yes = await showConfirm(t('agents.confirmDelete', { id }))
  if (!yes) return

  try {
    await api.deleteAgent(id)
    toast(t('agents.deleted'), 'success')
    await loadAgents(page, state)
  } catch (e) {
    toast(t('agents.deleteFailed') + ': ' + e, 'error')
  }
}

async function backupAgent(id) {
  toast(t('agents.backingUp', { id }), 'info')
  try {
    const zipPath = await api.backupAgent(id)
    try {
      const { open } = await import('@tauri-apps/plugin-shell')
      const dir = zipPath.substring(0, zipPath.lastIndexOf('/')) || zipPath
      await open(dir)
    } catch { /* fallback */ }
    toast(t('agents.backupDone', { file: zipPath.split('/').pop() }), 'success')
  } catch (e) {
    toast(t('agents.backupFailed') + ': ' + e, 'error')
  }
}
