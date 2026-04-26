/**
 * Hermes Agent 技能中心 (Skills Center)
 *
 * 功能：
 * - 本地技能：管理 ~/.hermes/skills/ 下的所有技能文件
 *   · Apply：发送技能内容给 Hermes 学习
 *   · Delete：删除技能文件
 * - 网络技能：从 clawhub.ai 搜索并安装技能
 *   · Install：下载技能并保存到本地
 */
import { t } from '../../../lib/i18n.js'
import { api } from '../../../lib/tauri-api.js'

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function mdToHtml(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/^\- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, '<br>')
}

// Network skill sources
const SKILL_SOURCES = [
  {
    name: 'ClawHub',
    searchUrl: (q) => `https://claw.qt.cool/api/v1/skills/search?q=${encodeURIComponent(q)}`,
    parse: (data) => Array.isArray(data) ? data : (data.skills || []),
    installContent: (item) => `---
name: ${item.name || item.slug || ''}
description: ${item.description || ''}
triggers: ${JSON.stringify(item.triggers || [])}
---
# ${item.name || item.slug}

${item.description || ''}

${item.content || item.readme || ''}
`,
  },
  {
    name: 'agentskills.io',
    searchUrl: (q) => `https://agentskills.io/api/skills?q=${encodeURIComponent(q)}&limit=20`,
    parse: (data) => Array.isArray(data) ? data : (data.results || []),
    installContent: (item) => `---
name: ${item.name || ''}
description: ${item.description || ''}
triggers: ${JSON.stringify(item.triggers || [])}
---
# ${item.name}

${item.description || ''}

${item.content || item.readme || ''}
`,
  },
]

export function render() {
  const el = document.createElement('div')
  el.className = 'hermes-skills-page'
  el.innerHTML = '<div class="sk-loading">加载中...</div>'

  // State
  let localSkills = []         // { name, path, description, content }
  let networkSkills = []       // from clawhub / agentskills.io
  let activeTab = 'local'      // 'local' | 'network'
  let searchQuery = ''
  let previewSkill = null      // skill being previewed in right panel
  let loadingLocal = false
  let loadingNetwork = false
  let busySkill = null         // name being saved/deleted/installed
  let notifyMsg = ''
  let notifyTimer = null
  let networkSourceIdx = 0

  // ── Load local skills ─────────────────────────────────
  async function loadLocalSkills() {
    loadingLocal = true
    draw()
    try {
      const cats = await api.hermesSkillsList()
      localSkills = []
      for (const cat of cats) {
        for (const s of cat.skills || []) {
          localSkills.push({
            name: s.name || s.file || '',
            path: s.path || '',
            description: s.description || '',
            triggers: s.triggers || [],
            content: null,
          })
        }
      }
    } catch (e) {
      console.error('loadLocalSkills error:', e)
      localSkills = []
    }
    loadingLocal = false
    draw()
  }

  // ── Search network skills ───────────────────────────────
  async function searchNetworkSkills() {
    if (!searchQuery.trim()) {
      networkSkills = []
      draw()
      return
    }
    loadingNetwork = true
    networkSkills = []
    draw()

    const source = SKILL_SOURCES[networkSourceIdx]
    try {
      const url = source.searchUrl(searchQuery)
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      networkSkills = source.parse(data).slice(0, 20)
    } catch (e) {
      console.warn('Network skill search failed:', e)
      networkSkills = []
    }
    loadingNetwork = false
    draw()
  }

  // ── Apply skill: send to Hermes chat ────────────────
  async function applySkill(skill) {
    busySkill = skill.name + ':apply'
    draw()
    try {
      let content = skill.content
      if (!content) {
        content = await api.hermesSkillDetail(skill.path)
      }
      window.dispatchEvent(new CustomEvent('hermes-skill-apply', {
        detail: { name: skill.name, content }
      }))
      showNotify(`✅ 技能「${skill.name}」已发送给 Hermes`)
    } catch (e) {
      showNotify(`⚠️ 应用失败: ${e}`)
    }
    busySkill = null
    draw()
  }

  // ── Delete skill ────────────────────────────────────
  async function deleteSkill(skill) {
    if (!confirm(`确定删除技能「${skill.name}」吗？此操作不可恢复。`)) return
    busySkill = skill.name + ':delete'
    draw()
    try {
      await api.hermesSkillDelete(skill.name)
      localSkills = localSkills.filter(s => s.name !== skill.name)
      if (previewSkill?.name === skill.name) previewSkill = null
      showNotify(`🗑️ 技能「${skill.name}」已删除`)
    } catch (e) {
      showNotify(`⚠️ 删除失败: ${e}`)
    }
    busySkill = null
    draw()
  }

  // ── Install skill from network ───────────────────────
  async function installSkill(item) {
    const source = SKILL_SOURCES[networkSourceIdx]
    const name = item.name || item.slug || `skill-${Date.now()}`
    if (!name) return
    busySkill = 'install:' + name
    draw()
    try {
      const content = source.installContent(item)
      await api.hermesSkillSave(name, content)
      showNotify(`✅ 技能「${name}」安装成功`)
      await loadLocalSkills()
    } catch (e) {
      showNotify(`⚠️ 安装失败: ${e}`)
    }
    busySkill = null
    draw()
  }

  // ── Preview skill ────────────────────────────────────
  async function previewSkillFn(skill) {
    previewSkill = { ...skill, content: null }
    draw()
    try {
      const content = await api.hermesSkillDetail(skill.path)
      previewSkill.content = content
    } catch (e) {
      previewSkill.content = `⚠️ 加载失败: ${e}`
    }
    draw()
  }

  // ── Notification ────────────────────────────────────
  function showNotify(msg) {
    notifyMsg = msg
    if (notifyTimer) clearTimeout(notifyTimer)
    notifyTimer = setTimeout(() => { notifyMsg = ''; draw() }, 3000)
    draw()
  }

  // ── Draw ────────────────────────────────────────────
  function draw() {
    const filteredLocal = localSkills.filter(s =>
      !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase())
    )

    el.innerHTML = `
      <!-- Header -->
      <div class="sk-header">
        <div class="sk-header-left">
          <span class="sk-header-title">🧠 技能中心</span>
          <span class="sk-badge">${localSkills.length} 个本地技能</span>
        </div>
        <div class="sk-header-right">
          <input type="text" id="sk-search" class="sk-search-input"
            placeholder="搜索技能..." value="${escHtml(searchQuery)}">
        </div>
      </div>

      <!-- Tab bar -->
      <div class="sk-tabs">
        <button class="sk-tab ${activeTab === 'local' ? 'active' : ''}" data-tab="local">
          📁 本地技能
        </button>
        <button class="sk-tab ${activeTab === 'network' ? 'active' : ''}" data-tab="network">
          🌐 网络技能
        </button>
        <div class="sk-source-picker">
          <select id="sk-source-select">
            ${SKILL_SOURCES.map((s, i) => `<option value="${i}" ${i === networkSourceIdx ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- Content area -->
      <div class="sk-content">
        ${activeTab === 'local' ? drawLocalTab(filteredLocal) : drawNetworkTab()}
      </div>

      <!-- Preview panel -->
      ${previewSkill ? drawPreviewPanel() : ''}

      <!-- Notification -->
      ${notifyMsg ? `<div class="sk-toast">${escHtml(notifyMsg)}</div>` : ''}
    `

    bind()
  }

  function drawLocalTab(skills) {
    if (loadingLocal) return `<div class="sk-state-msg">⏳ 加载本地技能中...</div>`
    if (skills.length === 0) {
      return `<div class="sk-state-msg">
        <div class="sk-state-icon">📭</div>
        <div>${searchQuery ? '没有匹配的技能' : '暂无本地技能'}</div>
        <div class="sk-state-sub">点击上方「网络技能」从网络安装</div>
      </div>`
    }
    return `
      <div class="sk-grid">
        ${skills.map(s => {
          const busy = busySkill === s.name + ':apply' || busySkill === s.name + ':delete'
          const isApplying = busySkill === s.name + ':apply'
          const isDeleting = busySkill === s.name + ':delete'
          return `
            <div class="sk-card ${previewSkill?.name === s.name ? 'sk-card-active' : ''}" data-name="${escHtml(s.name)}">
              <div class="sk-card-body">
                <div class="sk-card-name">${escHtml(s.name)}</div>
                <div class="sk-card-desc">${escHtml(s.description || '无描述')}</div>
                ${s.triggers.length ? `
                  <div class="sk-card-triggers">
                    ${(s.triggers || []).slice(0, 3).map(t => `<span class="sk-trigger">${escHtml(t)}</span>`).join('')}
                  </div>` : ''}
              </div>
              <div class="sk-card-actions">
                <button class="sk-btn sk-btn-apply ${isApplying ? 'sk-btn-busy' : ''}"
                  data-action="apply" data-name="${escHtml(s.name)}" ${busy ? 'disabled' : ''}>
                  ${isApplying ? '⟳' : '▶'} 应用
                </button>
                <button class="sk-btn sk-btn-delete ${isDeleting ? 'sk-btn-busy' : ''}"
                  data-action="delete" data-name="${escHtml(s.name)}" ${busy ? 'disabled' : ''}>
                  ${isDeleting ? '⟳' : '🗑️'} 删除
                </button>
              </div>
            </div>
          `
        }).join('')}
      </div>
    `
  }

  function drawNetworkTab() {
    if (!searchQuery.trim()) {
      return `<div class="sk-state-msg">
        <div class="sk-state-icon">🔍</div>
        <div>输入关键词搜索网络技能</div>
        <div class="sk-state-sub">从 ${SKILL_SOURCES[networkSourceIdx].name} 搜索并一键安装</div>
      </div>`
    }
    if (loadingNetwork) {
      return `<div class="sk-state-msg">⏳ 在 ${SKILL_SOURCES[networkSourceIdx].name} 搜索中...</div>`
    }
    if (networkSkills.length === 0) {
      return `<div class="sk-state-msg">
        <div class="sk-state-icon">😕</div>
        <div>未找到「${escHtml(searchQuery)}」相关技能</div>
        <div class="sk-state-sub">尝试其他关键词，或检查网络连接</div>
      </div>`
    }
    return `
      <div class="sk-grid">
        ${networkSkills.map((item, idx) => {
          const name = item.name || item.slug || `skill-${idx}`
          const isInstalling = busySkill === 'install:' + name
          const alreadyInstalled = localSkills.some(s => s.name === name)
          return `
            <div class="sk-card sk-card-network">
              <div class="sk-card-body">
                <div class="sk-card-name">${escHtml(name)}</div>
                <div class="sk-card-desc">${escHtml(item.description || item.title || '')}</div>
                ${item.author ? `<div class="sk-card-meta">👤 ${escHtml(item.author)}</div>` : ''}
              </div>
              <div class="sk-card-actions">
                <button class="sk-btn sk-btn-install"
                  data-action="install" data-idx="${idx}" ${isInstalling || alreadyInstalled ? 'disabled' : ''}>
                  ${isInstalling ? '⟳ 安装中...' : alreadyInstalled ? '✅ 已安装' : '⬇️ 安装'}
                </button>
              </div>
            </div>
          `
        }).join('')}
      </div>
    `
  }

  function drawPreviewPanel() {
    return `
      <div class="sk-preview-overlay" id="sk-preview-overlay">
        <div class="sk-preview-panel">
          <div class="sk-preview-header">
            <div>
              <div class="sk-preview-name">${escHtml(previewSkill.name)}</div>
              ${previewSkill.description ? `<div class="sk-preview-desc">${escHtml(previewSkill.description)}</div>` : ''}
            </div>
            <button class="sk-preview-close" id="sk-preview-close">×</button>
          </div>
          <div class="sk-preview-content">
            ${previewSkill.content
              ? mdToHtml(previewSkill.content)
              : '<div class="sk-state-msg">⏳ 加载中...</div>'
            }
          </div>
          <div class="sk-preview-footer">
            <button class="sk-btn sk-btn-apply" id="sk-preview-apply"
              ${busySkill ? 'disabled' : ''}>▶ 发送给 Hermes 学习</button>
            <button class="sk-btn sk-btn-delete" id="sk-preview-delete"
              ${busySkill ? 'disabled' : ''}>🗑️ 删除</button>
          </div>
        </div>
      </div>
    `
  }

  // ── Bind events ────────────────────────────────────
  function bind() {
    // Search
    el.querySelector('#sk-search')?.addEventListener('input', (e) => {
      searchQuery = e.target.value
      if (activeTab === 'network') {
        clearTimeout(window._skSearchTimer)
        window._skSearchTimer = setTimeout(searchNetworkSkills, 400)
      } else {
        draw()
      }
    })

    // Tab switch
    el.querySelectorAll('.sk-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab
        if (activeTab === 'local') {
          loadLocalSkills()
        } else {
          if (searchQuery.trim()) searchNetworkSkills()
          else { networkSkills = []; draw() }
        }
      })
    })

    // Source picker
    el.querySelector('#sk-source-select')?.addEventListener('change', (e) => {
      networkSourceIdx = parseInt(e.target.value)
      if (activeTab === 'network' && searchQuery.trim()) searchNetworkSkills()
    })

    // Card actions delegation
    el.querySelector('.sk-grid')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]')
      if (!btn || btn.disabled) return
      const action = btn.dataset.action
      const name = btn.dataset.name

      if (action === 'apply') {
        const skill = localSkills.find(s => s.name === name)
        if (skill) await applySkill(skill)
      } else if (action === 'delete') {
        const skill = localSkills.find(s => s.name === name)
        if (skill) await deleteSkill(skill)
      } else if (action === 'install') {
        const idx = parseInt(btn.dataset.idx)
        const item = networkSkills[idx]
        if (item) await installSkill(item)
      }
    })

    // Card click → preview
    el.querySelectorAll('.sk-card[data-name]').forEach(card => {
      card.addEventListener('click', async (e) => {
        if (e.target.closest('[data-action]')) return
        const name = card.dataset.name
        const skill = localSkills.find(s => s.name === name)
        if (skill) await previewSkillFn(skill)
      })
    })

    // Preview overlay
    el.querySelector('#sk-preview-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'sk-preview-overlay') { previewSkill = null; draw() }
    })
    el.querySelector('#sk-preview-close')?.addEventListener('click', () => { previewSkill = null; draw() })
    el.querySelector('#sk-preview-apply')?.addEventListener('click', async () => {
      if (previewSkill) await applySkill(previewSkill)
    })
    el.querySelector('#sk-preview-delete')?.addEventListener('click', async () => {
      if (previewSkill) await deleteSkill(previewSkill)
    })
  }

  loadLocalSkills()
  return el
}
