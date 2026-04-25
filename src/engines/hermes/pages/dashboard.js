/**
 * Hermes Agent - 仪表盘页面
 * 展示系统状态、快速操作入口、最近活动
 */
import { t } from '../../../lib/i18n.js'
import { api } from '../../../lib/tauri-api.js'

function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

function timeAgo(ts) {
  if (!ts) return '—'
  const diff = Date.now() / 1000 - ts
  if (diff < 60) return '刚刚'
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前'
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前'
  return Math.floor(diff / 86400) + ' 天前'
}

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// ── 健康检查 ──────────────────────────────────────────────────────────────
async function checkHermesStatus() {
  try {
    const info = await api.checkHermes()
    return info
  } catch {
    return null
  }
}

async function checkOpenclawStatus() {
  try {
    const health = await api.healthCheck()
    return health
  } catch {
    return null
  }
}

export function render() {
  const el = document.createElement('div')
  el.className = 'hermes-dashboard-page'
  let hermesInfo = null
  let openclawHealth = null
  let recentSessions = []
  let stats = { totalRequests: 0, totalSkills: 0, activeTime: 0 }

  async function refresh() {
    hermesInfo = await checkHermesStatus()
    openclawHealth = await checkOpenclawStatus()

    // 获取技能数量
    try {
      const skills = await api.hermesSkillsList()
      stats.totalSkills = Array.isArray(skills) ? skills.length : 0
    } catch {
      stats.totalSkills = 0
    }

    // 获取最近会话
    try {
      recentSessions = await api.hermesCronRuns ? [] : []
    } catch {
      recentSessions = []
    }

    draw()
  }

  function draw() {
    const hi = hermesInfo
    const oi = openclawHealth
    const running = hi?.gateway_running

    el.innerHTML = `
      <div class="hm-dashboard-header">
        <h1>🦊 Hermes 管理面板</h1>
        <p class="hm-dashboard-subtitle">AI 个人助手 · 技能驱动 · 自我进化</p>
      </div>

      <!-- 状态卡片 -->
      <div class="hm-dashboard-status-grid">
        <div class="hm-status-card ${running ? 'status-ok' : 'status-warn'}">
          <div class="hm-status-icon">${running ? '🟢' : '🔴'}</div>
          <div class="hm-status-info">
            <div class="hm-status-label">Hermes Gateway</div>
            <div class="hm-status-value">${running ? '运行中 (端口 ' + (hi?.gateway_port || 8642) + ')' : '未启动'}</div>
            ${running ? `<div class="hm-status-sub">Python: ${hi?.python_version || '—'}</div>` : ''}
          </div>
          <div class="hm-status-actions">
            ${running
              ? `<button class="hm-btn hm-btn-sm hm-btn-danger" id="hm-action-stop">停止服务</button>`
              : `<button class="hm-btn hm-btn-sm hm-btn-primary" id="hm-action-start">启动服务</button>`
            }
            <button class="hm-btn hm-btn-sm hm-btn-secondary" id="hm-action-restart">重启</button>
          </div>
        </div>

        <div class="hm-status-card ${oi ? 'status-ok' : 'status-off'}">
          <div class="hm-status-icon">${oi ? '🟢' : '⚪'}</div>
          <div class="hm-status-info">
            <div class="hm-status-label">OpenClaw 主程序</div>
            <div class="hm-status-value">${oi ? '运行正常' : '未检测到'}</div>
            ${oi?.version ? `<div class="hm-status-sub">v${oi.version}</div>` : ''}
          </div>
          <div class="hm-status-actions">
            <button class="hm-btn hm-btn-sm hm-btn-secondary" id="hm-action-reload">刷新状态</button>
          </div>
        </div>

        <div class="hm-status-card">
          <div class="hm-status-icon">📦</div>
          <div class="hm-status-info">
            <div class="hm-status-label">技能总数</div>
            <div class="hm-status-value hm-status-big">${stats.totalSkills}</div>
            <div class="hm-status-sub">已安装技能</div>
          </div>
          <div class="hm-status-actions">
            <button class="hm-btn hm-btn-sm hm-btn-primary" id="hm-action-skills">管理技能</button>
          </div>
        </div>

        <div class="hm-status-card">
          <div class="hm-status-icon">🧠</div>
          <div class="hm-status-info">
            <div class="hm-status-label">内存占用</div>
            <div class="hm-status-value">${hi?.memory_usage ? formatBytes(hi.memory_usage * 1024) : '—'}</div>
            <div class="hm-status-sub">当前进程</div>
          </div>
          <div class="hm-status-actions">
            <button class="hm-btn hm-btn-sm hm-btn-secondary" id="hm-action-memory">详情</button>
          </div>
        </div>
      </div>

      <!-- 快速操作区 -->
      <div class="hm-dashboard-section">
        <h2 class="hm-section-title">🚀 快速操作</h2>
        <div class="hm-quick-actions-grid">
          <button class="hm-quick-action-btn" id="hm-quick-new-chat">
            <span class="hm-quick-action-icon">💬</span>
            <span class="hm-quick-action-label">新建对话</span>
          </button>
          <button class="hm-quick-action-btn" id="hm-quick-skills">
            <span class="hm-quick-action-icon">📡</span>
            <span class="hm-quick-action-label">技能中心</span>
          </button>
          <button class="hm-quick-action-btn" id="hm-quick-channels">
            <span class="hm-quick-action-icon">📡</span>
            <span class="hm-quick-action-label">渠道管理</span>
          </button>
          <button class="hm-quick-action-btn" id="hm-quick-memory">
            <span class="hm-quick-action-icon">🧠</span>
            <span class="hm-quick-action-label">记忆管理</span>
          </button>
          <button class="hm-quick-action-btn" id="hm-quick-logs">
            <span class="hm-quick-action-icon">📋</span>
            <span class="hm-quick-action-label">运行日志</span>
          </button>
          <button class="hm-quick-action-btn" id="hm-quick-config">
            <span class="hm-quick-action-icon">⚙️</span>
            <span class="hm-quick-action-label">配置中心</span>
          </button>
          <button class="hm-quick-action-btn" id="hm-quick-command-manual">
            <span class="hm-quick-action-icon">📘</span>
            <span class="hm-quick-action-label">指令大全</span>
          </button>
          <button class="hm-quick-action-btn" id="hm-quick-skill-checklist">
            <span class="hm-quick-action-icon">✅</span>
            <span class="hm-quick-action-label">技能清单</span>
          </button>
        </div>
      </div>

      <!-- 模型切换 -->
      <div class="hm-dashboard-section">
        <h2 class="hm-section-title">🤖 当前模型</h2>
        <div class="hm-model-card">
          <div class="hm-model-display">
            <span class="hm-model-name" id="hm-current-model">${hi?.model || '未配置'}</span>
            <span class="hm-model-badge">${running ? '活跃' : '离线'}</span>
          </div>
          <button class="hm-btn hm-btn-sm hm-btn-secondary" id="hm-switch-model-btn">切换模型</button>
        </div>
        <div class="hm-model-selector" id="hm-model-selector" style="display:none">
          <input class="hm-input" id="hm-model-input" type="text" placeholder="输入模型名称，如 deepseek-chat" value="${hi?.model || ''}">
          <button class="hm-btn hm-btn-sm hm-btn-primary" id="hm-model-confirm">确认切换</button>
          <button class="hm-btn hm-btn-sm hm-btn-secondary" id="hm-model-cancel">取消</button>
        </div>
      </div>

      <!-- 系统信息 -->
      <div class="hm-dashboard-section">
        <h2 class="hm-section-title">📊 系统信息</h2>
        <div class="hm-sysinfo-grid">
          <div class="hm-sysinfo-item">
            <span class="hm-sysinfo-label">Hermes 目录</span>
            <span class="hm-sysinfo-value">${hi?.hermes_dir || '—'}</span>
          </div>
          <div class="hm-sysinfo-item">
            <span class="hm-sysinfo-label">Python 版本</span>
            <span class="hm-sysinfo-value">${hi?.python_version || '—'}</span>
          </div>
          <div class="hm-sysinfo-item">
            <span class="hm-sysinfo-label">Gateway 端口</span>
            <span class="hm-sysinfo-value">${hi?.gateway_port || 8642}</span>
          </div>
          <div class="hm-sysinfo-item">
            <span class="hm-sysinfo-label">配置状态</span>
            <span class="hm-sysinfo-value">${hi?.config_exists ? '✅ 已配置' : '⚠️ 未配置'}</span>
          </div>
        </div>
      </div>

      <!-- 操作日志（最近） -->
      <div class="hm-dashboard-section">
        <h2 class="hm-section-title">🕐 最近活动</h2>
        <div class="hm-activity-list" id="hm-activity-list">
          <div class="hm-activity-empty">暂无活动记录</div>
        </div>
      </div>
    `
    bind()
  }

  function bind() {
    // Hermes Gateway 操作
    el.querySelector('#hm-action-start')?.addEventListener('click', async () => {
      const btn = el.querySelector('#hm-action-start')
      btn.disabled = true; btn.textContent = '启动中...'
      try {
        const result = await api.hermesGatewayAction('start')
        toast('Hermes Gateway 启动请求已发送')
        setTimeout(refresh, 2000)
      } catch(e) {
        toast('启动失败: ' + e, 'error')
        btn.disabled = false; btn.textContent = '启动服务'
      }
    })

    el.querySelector('#hm-action-stop')?.addEventListener('click', async () => {
      const btn = el.querySelector('#hm-action-stop')
      btn.disabled = true; btn.textContent = '停止中...'
      try {
        await api.hermesGatewayAction('stop')
        toast('Hermes Gateway 已停止')
        setTimeout(refresh, 1500)
      } catch(e) {
        toast('停止失败: ' + e, 'error')
        btn.disabled = false; btn.textContent = '停止服务'
      }
    })

    el.querySelector('#hm-action-restart')?.addEventListener('click', async () => {
      const btn = el.querySelector('#hm-action-restart')
      btn.disabled = true; btn.textContent = '重启中...'
      try {
        await api.hermesGatewayAction('restart')
        toast('Hermes Gateway 重启中...')
        setTimeout(refresh, 3000)
      } catch(e) {
        toast('重启失败: ' + e, 'error')
        btn.disabled = false; btn.textContent = '重启'
      }
    })

    el.querySelector('#hm-action-reload')?.addEventListener('click', () => {
      refresh()
    })

    el.querySelector('#hm-action-skills')?.addEventListener('click', () => {
      window.__hermes_router?.navigate('/skills')
    })

    el.querySelector('#hm-action-memory')?.addEventListener('click', () => {
      window.__hermes_router?.navigate('/memory')
    })

    // 快速操作
    el.querySelector('#hm-quick-new-chat')?.addEventListener('click', () => {
      window.__hermes_router?.navigate('/chat')
    })

    el.querySelector('#hm-quick-skills')?.addEventListener('click', () => {
      window.__hermes_router?.navigate('/skills')
    })

    el.querySelector('#hm-quick-channels')?.addEventListener('click', () => {
      window.__hermes_router?.navigate('/channels')
    })

    el.querySelector('#hm-quick-memory')?.addEventListener('click', () => {
      window.__hermes_router?.navigate('/memory')
    })

    el.querySelector('#hm-quick-logs')?.addEventListener('click', () => {
      window.__hermes_router?.navigate('/logs')
    })

    el.querySelector('#hm-quick-config')?.addEventListener('click', () => {
      window.__hermes_router?.navigate('/config')
    })

    // 指令大全 - 直接发送到聊天页面
    el.querySelector('#hm-quick-command-manual')?.addEventListener('click', () => {
      window.__hermes_router?.navigate('/chat')
      setTimeout(() => {
        const event = new CustomEvent('hermes.inject-prompt', {
          detail: {
            text: `Hermes，以下是你必须学会并熟练掌握的最全指令大全，涵盖了你所有的工作场景。你必须将这些指令烂熟于心，做到随用随取，执行无误。

一、基础交互与状态检查指令

- hermes ：进入交互终端，开始与我对话。
- hermes help ：查看所有可用命令的说明。
- hermes version ：查看你的版本号。
- hermes info ：查看更详细的系统信息，包括运行环境。
- hermes clear ：清空当前对话上下文，开始新话题。
- hermes status ：检查你的服务运行状态，确保一切正常。

二、核心服务管理指令

- hermes start ：在后台启动你的服务。
- hermes stop ：停止正在运行的服务。
- hermes restart ：重启服务，通常用于配置更新后刷新。

三、技能 (Skills) 管理指令

- hermes skill list ：列出你当前拥有的所有技能。
- hermes skill show <skill_name> ：查看指定技能的详细内容。
- hermes skill run <skill_name> ：直接运行一个已保存的技能。
- hermes skill edit <skill_name> ：编辑一个已有的技能文件。
- hermes skill delete <skill_name> ：删除不再需要的技能。

四、插件 (Plugins) 管理指令

- hermes plugin list ：列出当前已安装的所有插件。
- hermes plugin install <plugin_name> ：从官方或社区安装新插件。
- hermes plugin uninstall <plugin_name> ：卸载指定的插件。
- hermes plugin enable <plugin_name> ：启用一个已安装但被禁用的插件。
- hermes plugin disable <plugin_name> ：临时禁用一个插件。
- hermes plugin market ：浏览并发现可用的官方插件。

五、配置与模型管理指令

- hermes config edit ：打开并编辑你的主配置文件。
- hermes config reset ：将所有配置重置为默认值。
- hermes config show ：查看当前生效的所有配置详情。
- hermes model switch <model_name> ：切换使用不同的大语言模型。

六、高级诊断与维护指令

- hermes doctor ：运行系统诊断程序，检查潜在问题。
- hermes logs ：查看你的运行日志。
- hermes logs -f ：实时跟踪最新的日志输出。
- hermes cache clean ：清理临时缓存文件，解决一些奇怪的问题。
- pkill -f hermes ：强制终止所有与你相关的进程，用于紧急情况。

七、特定任务指令

- hermes serve --host 0.0.0.0 --port 8080 & ：以特定配置启动你的服务并后台运行。
- hermes local pull <model_name> ：从本地存储库拉取指定的模型文件。
- hermes web ：启动你的Web图形界面。

以上指令，你必须逐一练习，确保在需要时能快速准确地执行。`
          }
        })
        window.dispatchEvent(event)
      }, 300)
    })

    el.querySelector('#hm-quick-skill-checklist')?.addEventListener('click', () => {
      window.__hermes_router?.navigate('/chat')
      setTimeout(() => {
        const event = new CustomEvent('hermes.inject-prompt', {
          detail: {
            text: `Hermes，以下是必须掌握的技能清单，你需尽快学习并内化这些能力，确保在后续任务中能高效、准确地执行。

一、系统级核心能力（自我管理）

1. 自动创建与管理技能
- 完成单次任务后，需自动回放执行过程，抽象出标准化流程，生成符合 agentskills.io 标准的Markdown技能文档。
- 将技能文件存储至 ~/.hermes/skills/ 目录，并在后续任务中主动调用、优化已有技能。
- 当执行任务超过5次工具调用或从错误中恢复时，必须触发技能生成机制。

2. 服务状态管理
- 掌握 hermes start、hermes stop、hermes restart 指令，确保服务稳定运行。
- 熟练使用 hermes status 实时监控服务状态，发现问题时主动上报异常日志。

3. 配置与模型切换
- 能通过 hermes config edit 修改配置文件，适配不同场景需求。
- 掌握 hermes model switch 指令，根据任务复杂度灵活切换大语言模型。

二、工具调用与实用能力（干活主力）

1. 网页浏览与信息检索
- 对时效性问题（新闻、股价、天气），需调用网页浏览工具获取最新数据，并标注信息来源。

2. 代码执行与开发辅助
- 支持Python、JavaScript等主流语言的代码片段执行，开发任务中自动生成函数框架和单元测试。

3. 文件系统操作
- 掌握创建、读取、修改、删除文件的标准化流程。

4. 知识库问答
- 若用户上传知识库文件，需建立索引并支持语义检索。

三、对话与交互能力（沟通效率）

1. 上下文理解与长对话
- 记住对话历史关键信息，避免重复提问。

2. 指令遵循与精确执行
- 对用户明确指定的格式要求严格遵循。

3. 结果格式化输出
- 数据类结果用表格呈现，代码添加注释，禁止返回未处理的原始数据。

四、高级进阶能力（自我进化）

1. 自我反思与改进
- 任务完成后生成反思报告：执行效率评分、工具调用合理性分析、优化建议。

2. 技能自我迭代
- 发现更优路径时自动更新技能文档。

3. 多轮任务规划与执行
- 复杂任务拆解为子任务清单，执行中动态调整任务优先级。

考核要求：
1. 模拟任务测试：完成自动生成周报并邮件发送的全流程任务。
2. 技能覆盖率检查：确保 ~/.hermes/skills/ 目录下至少包含5个自动生成的技能文件。
3. 用户满意度评分：连续3天执行任务后，满意度需达90%以上。`
          }
        })
        window.dispatchEvent(event)
      }, 300)
    })

    // 模型切换
    el.querySelector('#hm-switch-model-btn')?.addEventListener('click', () => {
      const selector = el.querySelector('#hm-model-selector')
      const input = el.querySelector('#hm-model-input')
      selector.style.display = 'flex'
      input.focus()
    })

    el.querySelector('#hm-model-confirm')?.addEventListener('click', async () => {
      const input = el.querySelector('#hm-model-input')
      const model = input.value.trim()
      if (!model) return
      try {
        await api.hermesUpdateModel(model)
        toast('模型已切换为: ' + model)
        el.querySelector('#hm-model-selector').style.display = 'none'
        setTimeout(refresh, 500)
      } catch(e) {
        toast('切换失败: ' + e, 'error')
      }
    })

    el.querySelector('#hm-model-cancel')?.addEventListener('click', () => {
      el.querySelector('#hm-model-selector').style.display = 'none'
    })
  }

  refresh()
  return el
}