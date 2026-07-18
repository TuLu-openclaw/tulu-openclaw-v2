import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'
import { showConfirm, showUpgradeModal } from '../components/modal.js'
import { navigate } from '../router.js'

let page = null
let status = null
let busy = false

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
}

function stateBadge(ok, yes = '正常', no = '未就绪') {
  return `<span class="bu-badge ${ok ? 'ok' : 'warn'}">${ok ? yes : no}</span>`
}

function renderBody() {
  const s = status || {}
  const ready = Boolean(s.installed && s.runtimeReady && s.registered)
  const domains = (s.allowedDomains || []).join('\n')
  return `
    <div class="bu-status-grid">
      <div class="bu-status-item"><span>browser-use</span><strong>${esc(s.version || '未安装')}</strong>${stateBadge(s.installed, '版本已固定', '需要安装')}</div>
      <div class="bu-status-item"><span>隔离运行时</span><strong>${s.runtimeReady ? '可用' : '未就绪'}</strong>${stateBadge(s.runtimeReady)}</div>
      <div class="bu-status-item"><span>OpenClaw 全局 Agent 工具</span><strong>${s.registered ? '已注册' : '未注册'}</strong>${stateBadge(s.registered, '已连接', '已暂停')}</div>
      <div class="bu-status-item"><span>默认权限</span><strong>${s.allowInteraction ? '允许交互' : '只读浏览'}</strong>${stateBadge(!s.allowAutonomous, '自主代理受控', '自主代理已授权')}</div>
    </div>

    <section class="bu-section bu-setup">
      <div>
        <h2>${ready ? '浏览器助手已就绪' : '一键启用浏览器助手'}</h2>
        <p>${ready ? '现在可以直接在聊天中让助手打开网页、读取内容。' : '点击一次完成安装和安全配置，完成后直接进入聊天即可使用。'}</p>
      </div>
      <div class="bu-actions">
        <button class="btn btn-primary" data-action="quick-start" ${busy ? 'disabled' : ''}>${ready ? '进入聊天' : '安装并开始使用'}</button>
        <button class="btn btn-secondary" data-action="install" ${busy ? 'disabled' : ''}>${s.installed ? '修复组件' : '稍后安装'}</button>
      </div>
    </section>

    <section class="bu-section">
      <div class="bu-section-heading">
        <div><h2>权限与访问范围</h2><p>保存后会更新 OpenClaw 全局 Agent 工具配置并重新加载 Gateway。交互与自主代理默认关闭。</p></div>
        ${stateBadge(!s.allowInteraction && !s.allowAutonomous, '安全默认值', '已扩大权限')}
      </div>
      <div class="bu-permissions">
        <label class="bu-toggle-row">
          <input id="bu-interaction" type="checkbox" ${s.allowInteraction ? 'checked' : ''} ${!s.installed || busy ? 'disabled' : ''}>
          <span><strong>允许页面交互</strong><small>开放点击与输入。提交表单、登录、购买等外部动作仍应由用户确认。</small></span>
        </label>
        <label class="bu-toggle-row danger">
          <input id="bu-autonomous" type="checkbox" ${s.allowAutonomous ? 'checked' : ''} ${!s.installed || busy ? 'disabled' : ''}>
          <span><strong>允许自主浏览器代理</strong><small>可执行多步骤任务并调用模型，风险和费用更高；仅在明确需要时开启。</small></span>
        </label>
        <label class="bu-domain-field">
          <span>域名白名单 <small>可选，每行一个；填写后仅允许该域名及其子域名</small></span>
          <textarea id="bu-domains" rows="4" placeholder="example.com\ndocs.example.com" ${!s.installed || busy ? 'disabled' : ''}>${esc(domains)}</textarea>
        </label>
      </div>
      <div class="bu-actions">
        <button class="btn btn-primary" data-action="save" ${!s.installed || busy ? 'disabled' : ''}>保存权限配置</button>
        <button class="btn btn-secondary" data-action="unregister" ${!s.registered || busy ? 'disabled' : ''}>暂停全局工具接入</button>
      </div>
      <div class="bu-policy">始终阻止 localhost、私网、链路本地和保留地址；URL 中嵌入账号密码也会被拒绝。下载、用户数据和文件访问均限制在独立目录。</div>
    </section>

    <section class="bu-section">
      <h2>客户使用教程</h2>
      <div class="bu-guide">
        <div><b>1</b><span><strong>点击安装并开始使用</strong><small>首次使用只需等待一次安装完成，默认采用安全的只读模式。</small></span></div>
        <div><b>2</b><span><strong>直接说出需求</strong><small>进入聊天后，用普通话描述网址和要读取的内容，不需要记工具名称。</small></span></div>
        <div><b>3</b><span><strong>需要操作时再授权</strong><small>需要点击或填写网页时，打开本页的“允许页面交互”并保存即可。</small></span></div>
        <div><b>4</b><span><strong>提交前由你确认</strong><small>登录、上传、发送、购买和提交表单等动作，始终先检查再确认。</small></span></div>
      </div>
      <div class="bu-example">
        <code>打开 https://example.com，读取页面标题和主要内容，不要点击或提交任何内容。</code>
        <button class="btn btn-secondary btn-sm" data-action="open-chat">去实时聊天</button>
      </div>
    </section>

    <section class="bu-section">
      <h2>故障排查</h2>
      <div class="bu-troubleshoot">
        <details><summary>安装失败或长时间无进度</summary><p>首次安装需要下载独立运行环境和 Chromium，请确认网络连接正常后点击“修复组件”重试；无需自行安装 Python。</p></details>
        <details><summary>聊天中找不到浏览器工具</summary><p>确认本页“OpenClaw 全局 Agent 工具”显示“已连接”。若为“已暂停”，执行“修复组件”或保存权限配置以重新注册。</p></details>
        <details><summary>网址被安全策略拒绝</summary><p>本地和私有网络地址不能放行。若配置了域名白名单，请检查目标域名是否在列表中；不要填写协议、路径、端口或通配符。</p></details>
        <details><summary>无法点击或输入</summary><p>开启“允许页面交互”并保存。自主代理不是普通点击所必需，建议继续保持关闭。</p></details>
      </div>
    </section>

    <section class="bu-section bu-remove">
      <div><h2>移除集成</h2><p>暂停只会注销 MCP；完整卸载会同时删除隔离虚拟环境、浏览器配置、下载和文件目录。</p></div>
      <button class="btn btn-danger" data-action="uninstall" ${!s.installed || busy ? 'disabled' : ''}>完整卸载</button>
    </section>
  `
}

async function loadStatus() {
  const body = page?.querySelector('#browser-use-body')
  if (!body) return
  try {
    status = await api.browserUseStatus()
    body.innerHTML = renderBody()
  } catch (error) {
    body.innerHTML = `<div class="bu-error">状态检测失败：${esc(error?.message || error)}</div>`
  }
}

async function install() {
  if (busy) return
  busy = true
  const modal = showUpgradeModal('安装 browser-use 浏览器自动化')
  modal.setProgress(12)
  modal.appendLog('正在创建隔离运行时并安装固定版本依赖。')
  page.querySelector('#browser-use-body').innerHTML = '<div class="bu-working">正在安装 browser-use、MCP 与隔离 Chromium，请查看进度窗口…</div>'
  try {
    modal.setProgress(35)
    const result = await api.browserUseInstall()
    status = result || status
    modal.setProgress(90)
    modal.appendLog(`browser-use：${result?.version || '已安装'}`)
    modal.appendLog('已注册到 OpenClaw 全局 Agent 工具。')
    modal.setDone('浏览器助手已准备好')
    toast('浏览器助手已准备好，现在可以直接聊天使用', 'success')
  } catch (error) {
    const message = error?.message || error
    modal.appendLog(`失败：${message}`)
    modal.setError(`安装失败：${message}`)
    toast(`安装失败：${message}`, 'error', { duration: 6000 })
  } finally {
    busy = false
    await loadStatus()
  }
}

function readPermissions() {
  const domains = page.querySelector('#bu-domains').value.split(/\r?\n|,/).map(item => item.trim()).filter(Boolean)
  return {
    allowInteraction: page.querySelector('#bu-interaction').checked,
    allowAutonomous: page.querySelector('#bu-autonomous').checked,
    allowedDomains: domains,
  }
}

async function savePermissions() {
  const permissions = readPermissions()
  if (permissions.allowAutonomous) {
    const confirmed = await showConfirm('自主浏览器代理可以执行多步骤网页任务并产生模型费用。确认开启此高风险权限吗？')
    if (!confirmed) return
  }
  busy = true
  try {
    status = await api.browserUseConfigure(permissions)
    toast('browser-use 权限配置已保存', 'success')
  } catch (error) {
    toast(error?.message || error, 'error', { duration: 6000 })
  } finally {
    busy = false
    await loadStatus()
  }
}

async function unregister() {
  if (!await showConfirm('暂停 browser-use 全局工具接入？隔离运行时和配置会保留，可通过“修复组件”重新启用。')) return
  busy = true
  try {
    await api.browserUseUnregister()
    toast('browser-use 全局工具已暂停', 'success')
  } catch (error) {
    toast(error?.message || error, 'error', { duration: 6000 })
  } finally {
    busy = false
    await loadStatus()
  }
}

async function uninstall() {
  if (!await showConfirm('完整卸载会删除 browser-use 隔离运行时、浏览器配置、下载和文件目录，此操作不可撤销。确定继续吗？')) return
  busy = true
  try {
    await api.browserUseUninstall()
    toast('browser-use 已完整卸载', 'success')
  } catch (error) {
    toast(error?.message || error, 'error', { duration: 6000 })
  } finally {
    busy = false
    await loadStatus()
  }
}

function bindEvents() {
  page.addEventListener('click', async event => {
    const action = event.target.closest('[data-action]')?.dataset.action
    if (!action) return
    if (action === 'install') await install()
    if (action === 'quick-start') {
      if (status?.installed && status?.runtimeReady && status?.registered) navigate('/chat')
      else { await install(); if (status?.installed && status?.runtimeReady && status?.registered) navigate('/chat') }
    }
    if (action === 'refresh') await loadStatus()
    if (action === 'save') await savePermissions()
    if (action === 'unregister') await unregister()
    if (action === 'uninstall') await uninstall()
    if (action === 'open-chat') navigate('/chat')
  })
}

export async function render() {
  page = document.createElement('div')
  page.className = 'page browser-use-page'
  page.innerHTML = `
    <header class="page-header bu-header">
      <div><h1 class="page-title">browser-use 浏览器自动化</h1><p class="page-desc">安全隔离的网页浏览、内容提取和可控交互能力，直接供 OpenClaw Agent 调用。</p></div>
      <span class="bu-version">browser-use 0.13.6</span>
    </header>
    <div id="browser-use-body"><div class="bu-working">正在检测 browser-use 运行状态…</div></div>
  `
  bindEvents()
  await loadStatus()
  return page
}
