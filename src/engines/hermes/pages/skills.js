/**
 * Hermes Agent 技能中心页面
 * 展示本地技能 + 网络技能，支持搜索、查看详情、应用、删除
 */
import { t } from '../../../lib/i18n.js'
import { api } from '../../../lib/tauri-api.js'

function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

function mdToHtml(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, '<br>')
}

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function timeAgo(ts) {
  if (!ts) return '—'
  const diff = Date.now() / 1000 - ts
  if (diff < 60) return '刚刚'
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前'
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前'
  return Math.floor(diff / 86400) + ' 天前'
}

export function render() {
  const el = document.createElement('div')
  el.className = 'hermes-skills-page'

  let localSkills = []
  let networkSkills = []
  let loading = true
  let loadingDetail = false
  let searchQuery = ''
  let activeTab = 'local' // 'local' | 'network'
  let activeSkill = null  // { name, file, path, description, content, size, modified }
  let applying = false    // 正在应用技能
  let installingSlug = null // 正在安装的网络技能 slug
  let networkQuery = ''
  let creating = false   // 正在新建技能
  let editingSkill = null // 编辑中的技能

  async function loadLocalSkills() {
    try {
      localSkills = await api.hermesSkillsList()
    } catch (e) {
      console.error('加载本地技能失败:', e)
      localSkills = []
    }
  }

  async function loadNetworkSkills(query) {
    try {
      if (query && query.length > 1) {
        networkSkills = await api.skillhubSearch(query, 20)
      } else {
        const index = await api.skillhubIndex()
        networkSkills = Array.isArray(index) ? index.slice(0, 20) : []
      }
    } catch (e) {
      console.error('加载网络技能失败:', e)
      networkSkills = []
    }
  }

  async function applySkill(skill) {
    applying = true
    draw()
    try {
      // 将技能内容发送到 Hermes 对话
      await api.hermesAgentRun(skill.content || skill.description || skill.name, null, [], null)
      toast('技能已发送给 Hermes，请查看聊天面板')
    } catch (e) {
      toast('应用失败: ' + e, 'error')
    }
    applying = false
    draw()
  }

  async function deleteLocalSkill(skill) {
    if (!confirm('确定要删除技能「' + skill.name + '」吗？')) return
    try {
      await api.hermesSkillDelete(skill.path)
      toast('技能已删除')
      if (activeSkill?.path === skill.path) activeSkill = null
      await loadLocalSkills()
      draw()
    } catch (e) {
      toast('删除失败: ' + e, 'error')
    }
  }

  async function installNetworkSkill(slug) {
    installingSlug = slug
    draw()
    try {
      await api.skillhubInstall(slug)
      toast('技能安装成功')
      installingSlug = null
      await loadLocalSkills()
      draw()
    } catch (e) {
      toast('安装失败: ' + e, 'error')
      installingSlug = null
      draw()
    }
  }

  async function saveNewSkill(name, content) {
    try {
      await api.hermesSkillSave(name, content)
      toast('技能已保存')
      creating = false
      editingSkill = null
      await loadLocalSkills()
      draw()
    } catch (e) {
      toast('保存失败: ' + e, 'error')
    }
  }

  async function loadDetail(skill) {
    activeSkill = { ...skill, content: '' }
    loadingDetail = true
    draw()
    try {
      if (skill.path) {
        const detail = await api.hermesSkillDetail(skill.path)
        activeSkill.content = detail.content || ''
      } else {
        activeSkill.content = skill.description || skill.content || ''
      }
    } catch (e) {
      activeSkill.content = skill.description || '(无法加载内容)'
    }
    loadingDetail = false
    draw()
  }

  function filteredLocal() {
    if (!searchQuery) return localSkills
    const q = searchQuery.toLowerCase()
    return localSkills.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q)
    )
  }

  function filteredNetwork() {
    if (!networkQuery) return networkSkills
    const q = networkQuery.toLowerCase()
    return networkSkills.filter(s =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q)
    )
  }

  function draw() {
    const localFiltered = filteredLocal()
    const networkFiltered = filteredNetwork()

    el.innerHTML = `
      <div class="hm-skills-layout">
        <!-- 左侧面板 -->
        <div class="hm-skills-list-panel">
          <!-- 标签切换 -->
          <div class="hm-skills-tabs">
            <button class="hm-tab ${activeTab === 'local' ? 'active' : ''}" id="hm-tab-local">
              本地技能
              <span class="hm-tab-badge">${localSkills.length}</span>
            </button>
            <button class="hm-tab ${activeTab === 'network' ? 'active' : ''}" id="hm-tab-network">
              网络技能
            </button>
          </div>

          <!-- 搜索栏 -->
          <div class="hm-skills-search-wrap">
            <input class="hm-skills-search" id="hm-skills-search" type="text"
              placeholder="${activeTab === 'local' ? '搜索本地技能...' : '搜索网络技能...'}"
              value="${escHtml(activeTab === 'local' ? searchQuery : networkQuery)}">
          </div>

          ${activeTab === 'local' ? `
          <!-- 新建技能按钮 -->
          <button class="hm-btn hm-btn-primary hm-skills-new-btn" id="hm-skills-new">
            + 新建技能
          </button>
          ` : ''}

          <!-- 技能列表 -->
          <div class="hm-skills-list" id="hm-skills-list">
            ${loading ? `<div class="hm-skills-loading">加载中...</div>` : ''}
            ${!loading && activeTab === 'local' && localFiltered.length === 0 ? `<div class="hm-skills-empty">暂无技能<br><small>点击上方按钮新建</small></div>` : ''}
            ${!loading && activeTab === 'network' && networkFiltered.length === 0 ? `<div class="hm-skills-empty">搜索网络技能...</div>` : ''}
            ${!loading && activeTab === 'local' ? localFiltered.map(s => `
              <div class="hm-skill-item ${activeSkill?.path === s.path || activeSkill?.name === s.name ? 'active' : ''}" data-path="${escHtml(s.path)}">
                <div class="hm-skill-item-main">
                  <div class="hm-skill-item-name">${escHtml(s.name)}</div>
                  <div class="hm-skill-item-desc">${escHtml(s.description || '无描述')}</div>
                  <div class="hm-skill-item-meta">
                    <span>${formatBytes(s.size || 0)}</span>
                    <span>${timeAgo(s.modified)}</span>
                  </div>
                </div>
                <div class="hm-skill-item-actions">
                  <button class="hm-btn hm-btn-xs hm-btn-primary hm-btn-apply" data-name="${escHtml(s.name)}" data-path="${escHtml(s.path)}" title="应用技能">▶</button>
                  <button class="hm-btn hm-btn-xs hm-btn-danger hm-btn-delete" data-path="${escHtml(s.path)}" title="删除技能">✕</button>
                </div>
              </div>
            `).join('') : ''}
            ${!loading && activeTab === 'network' ? networkFiltered.map(s => `
              <div class="hm-skill-item hm-skill-network ${activeSkill?.name === s.name ? 'active' : ''}" data-name="${escHtml(s.name || s.slug)}">
                <div class="hm-skill-item-main">
                  <div class="hm-skill-item-name">${escHtml(s.name || s.slug)}</div>
                  <div class="hm-skill-item-desc">${escHtml(s.description || '无描述')}</div>
                  ${s.source ? `<div class="hm-skill-item-meta"><span class="hm-skill-source-tag">${escHtml(s.source)}</span></div>` : ''}
                </div>
                <div class="hm-skill-item-actions">
                  <button class="hm-btn hm-btn-xs hm-btn-primary hm-btn-apply-network"
                    data-name="${escHtml(s.name || s.slug)}"
                    data-content="${escHtml((s.description || '') + '\n\n' + (s.content || ''))}"
                    title="应用技能">▶</button>
                  <button class="hm-btn hm-btn-xs ${installingSlug === (s.slug || s.name) ? 'hm-btn-loading' : 'hm-btn-primary'} hm-btn-install"
                    data-slug="${escHtml(s.slug || s.name)}"
                    data-name="${escHtml(s.name || s.slug)}"
                    data-content="${escHtml((s.description || '') + '\n\n' + (s.content || ''))}"
                    title="安装到本地">
                    ${installingSlug === (s.slug || s.name) ? '...' : '+'}
                  </button>
                </div>
              </div>
            `).join('') : ''}
          </div>
        </div>

        <!-- 右侧详情面板 -->
        <div class="hm-skills-detail-panel">
          ${!activeSkill ? `
          <div class="hm-skills-detail-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
            <span>选择一个技能查看详情</span>
          </div>` : ''}

          ${activeSkill && loadingDetail ? `<div class="hm-skills-detail-loading">加载中...</div>` : ''}

          ${activeSkill && !loadingDetail ? `
          <div class="hm-skills-detail-header">
            <h2>${escHtml(activeSkill.name)}</h2>
            ${activeSkill.file ? `<span class="hm-skills-detail-file">${escHtml(activeSkill.file)}</span>` : ''}
          </div>

          <!-- 操作按钮 -->
          <div class="hm-skills-detail-actions">
            <button class="hm-btn hm-btn-primary hm-btn-apply-detail"
              data-name="${escHtml(activeSkill.name)}"
              data-content="${escHtml(activeSkill.content || activeSkill.description || '')}"
              ${applying ? 'disabled' : ''}>
              ${applying ? '发送中...' : '▶ 发送给 Hermes'}
            </button>
            ${activeSkill.path ? `
            <button class="hm-btn hm-btn-danger hm-btn-delete-detail"
              data-path="${escHtml(activeSkill.path)}"
              data-name="${escHtml(activeSkill.name)}">
              ✕ 删除
            </button>` : ''}
          </div>

          <div class="hm-skills-detail-content markdown-body">
            ${mdToHtml(activeSkill.content || activeSkill.description || '(无内容)')}
          </div>` : ''}
        </div>
      </div>

      <!-- 新建/编辑技能弹窗 -->
      ${creating ? `
      <div class="modal-overlay" id="hm-create-modal">
        <div class="modal" style="max-width:600px;max-height:80vh;display:flex;flex-direction:column">
          <div class="modal-title">新建技能</div>
          <div class="modal-body" style="flex:1;overflow:auto">
            <div class="form-group">
              <label class="form-label">技能名称</label>
              <input class="form-input" id="hm-create-name" type="text" placeholder="例如：代码审查助手">
            </div>
            <div class="form-group">
              <label class="form-label">技能内容（Markdown）</label>
              <textarea class="form-input" id="hm-create-content" rows="15" placeholder="写入技能的完整内容..."></textarea>
            </div>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;padding:12px 16px;border-top:1px solid var(--border-primary)">
            <button class="hm-btn hm-btn-secondary" id="hm-create-cancel">取消</button>
            <button class="hm-btn hm-btn-primary" id="hm-create-confirm">保存技能</button>
          </div>
        </div>
      </div>` : ''}
    `
    bind()
  }

  function bind() {
    // Tab 切换
    el.querySelector('#hm-tab-local')?.addEventListener('click', () => {
      activeTab = 'local'
      draw()
    })
    el.querySelector('#hm-tab-network')?.addEventListener('click', () => {
      activeTab = 'network'
      loadNetworkSkills('').then(() => draw())
    })

    // 搜索
    el.querySelector('#hm-skills-search')?.addEventListener('input', (e) => {
      if (activeTab === 'local') {
        searchQuery = e.target.value
        draw()
      } else {
        networkQuery = e.target.value
        loadNetworkSkills(networkQuery).then(() => draw())
      }
    })

    // 新建技能
    el.querySelector('#hm-skills-new')?.addEventListener('click', () => {
      creating = true
      draw()
      setTimeout(() => {
        el.querySelector('#hm-create-name')?.focus()
      }, 50)
    })

    // 取消新建
    el.querySelector('#hm-create-cancel')?.addEventListener('click', () => {
      creating = false
      draw()
    })

    // 确认新建
    el.querySelector('#hm-create-confirm')?.addEventListener('click', () => {
      const name = el.querySelector('#hm-create-name')?.value?.trim()
      const content = el.querySelector('#hm-create-content')?.value || ''
      if (!name) { toast('请输入技能名称', 'error'); return }
      if (!content) { toast('请输入技能内容', 'error'); return }
      saveNewSkill(name, content)
    })

    // 本地技能列表点击（选择）
    el.querySelectorAll('.hm-skill-item:not(.hm-skill-network)').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.hm-btn')) return
        const path = item.dataset.path
        const skill = localSkills.find(s => s.path === path)
        if (skill) loadDetail(skill)
      })
    })

    // 网络技能列表点击（选择）
    el.querySelectorAll('.hm-skill-network').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.hm-btn')) return
        const name = item.dataset.name
        const skill = networkSkills.find(s => (s.name || s.slug) === name)
        if (skill) loadDetail({ ...skill, path: '' })
      })
    })

    // 应用本地技能（列表按钮）
    el.querySelectorAll('.hm-btn-apply').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const name = btn.dataset.name
        const path = btn.dataset.path
        const skill = localSkills.find(s => s.name === name && s.path === path)
        if (skill) applySkill(skill)
      })
    })

    // 删除本地技能（列表按钮）
    el.querySelectorAll('.hm-btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const path = btn.dataset.path
        const skill = localSkills.find(s => s.path === path)
        if (skill) deleteLocalSkill(skill)
      })
    })

    // 应用网络技能（列表按钮）
    el.querySelectorAll('.hm-btn-apply-network').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const content = btn.dataset.content
        const name = btn.dataset.name
        applySkill({ name, content })
      })
    })

    // 安装网络技能
    el.querySelectorAll('.hm-btn-install').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const slug = btn.dataset.slug
        const name = btn.dataset.name
        const content = btn.dataset.content
        installNetworkSkill(slug)
        // 同时保存内容到本地
        setTimeout(() => {
          api.hermesSkillSave(name, content).catch(() => {})
        }, 500)
      })
    })

    // 详情面板：应用按钮
    el.querySelector('.hm-btn-apply-detail')?.addEventListener('click', () => {
      if (!activeSkill) return
      applySkill(activeSkill)
    })

    // 详情面板：删除按钮
    el.querySelector('.hm-btn-delete-detail')?.addEventListener('click', () => {
      if (!activeSkill?.path) return
      deleteLocalSkill(activeSkill)
    })
  }

  // 初始化加载
  ;(async () => {
    loading = true
    draw()
    await loadLocalSkills()
    loading = false
    draw()
  })()

  return el
}
