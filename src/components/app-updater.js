/**
 * 应用自动更新组件（GitHub Release）
 * 
 * 功能：
 * - 启动时检查 GitHub Release 新版本
 * - 弹窗提示更新，显示更新日志
 * - 下载安装包，显示进度
 * - 安装并重启
 */

import { api } from '../lib/tauri-api.js'
import { t } from '../locales/i18n.js'

let updateModal = null
let downloadProgress = 0

/**
 * 检查应用更新（启动时调用）
 * @param {boolean} silent - 静默模式，无更新时不弹窗
 */
export async function checkAppUpdate(silent = true) {
  try {
    const info = await api.checkAppUpdate()
    
    if (!info.hasUpdate) {
      if (!silent) {
        toast(t('updater.noUpdate') || '当前已是最新版本', 'success')
      }
      return null
    }
    
    // 有新版本，显示更新弹窗
    showUpdateModal(info)
    return info
  } catch (err) {
    console.error('[AppUpdater] 检查更新失败:', err)
    if (!silent) {
      toast(t('updater.checkFailed') || '检查更新失败: ' + (err.message || err), 'error')
    }
    return null
  }
}

/**
 * 显示更新弹窗
 */
function showUpdateModal(info) {
  if (updateModal) {
    updateModal.remove()
    updateModal = null
  }

  const modal = document.createElement('div')
  updateModal = modal
  modal.className = 'modal-overlay'
  modal.style.cssText = `
    position: fixed; inset: 0; z-index: 10000;
    background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    animation: fadeIn 0.2s ease;
  `

  const releaseNotes = formatReleaseNotes(info.releaseNotes)
  const publishedDate = info.publishedAt ? new Date(info.publishedAt).toLocaleDateString('zh-CN') : ''
  const asset = info.platformAsset

  modal.innerHTML = `
    <div class="modal-card" style="
      background: var(--bg-primary, #1a1a2e); border: 1px solid var(--border-color, #333);
      border-radius: 12px; padding: 0; max-width: 520px; width: 90%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      animation: slideUp 0.3s ease;
    ">
      <!-- 头部 -->
      <div style="padding: 20px 24px 16px; border-bottom: 1px solid var(--border-color, #333);">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="
            width: 48px; height: 48px; border-radius: 12px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex; align-items: center; justify-content: center;
            font-size: 24px;
          ">🚀</div>
          <div>
            <h3 style="margin: 0; font-size: 18px; color: var(--text-primary, #fff);">
              ${t('updater.title') || '发现新版本'}
            </h3>
            <div style="margin-top: 4px; font-size: 13px; color: var(--text-tertiary, #888);">
              v${info.currentVersion} → <span style="color: var(--accent, #667eea); font-weight: 600;">v${info.latestVersion}</span>
              ${publishedDate ? ` · ${publishedDate}` : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- 更新日志 -->
      ${releaseNotes ? `
      <div style="padding: 16px 24px; max-height: 200px; overflow-y: auto;">
        <div style="font-size: 13px; color: var(--text-secondary, #ccc); line-height: 1.6;">
          ${releaseNotes}
        </div>
      </div>
      ` : ''}

      <!-- 下载进度（初始隐藏） -->
      <div id="app-update-progress" style="display: none; padding: 0 24px 16px;">
        <div style="
          height: 6px; border-radius: 3px; background: var(--bg-tertiary, #333);
          overflow: hidden; margin-bottom: 8px;
        ">
          <div id="app-update-progress-bar" style="
            height: 100%; border-radius: 3px; width: 0%;
            background: linear-gradient(90deg, #667eea, #764ba2);
            transition: width 0.3s ease;
          "></div>
        </div>
        <div id="app-update-progress-text" style="
          font-size: 12px; color: var(--text-tertiary, #888); text-align: center;
        ">${t('updater.downloading') || '正在下载...'}</div>
      </div>

      <!-- 按钮 -->
      <div id="app-update-buttons" style="
        padding: 16px 24px 20px; display: flex; gap: 10px; justify-content: flex-end;
      ">
        <button id="btn-update-later" class="btn btn-secondary" style="
          padding: 8px 16px; border-radius: 8px; font-size: 13px;
          border: 1px solid var(--border-color, #444);
          background: transparent; color: var(--text-secondary, #ccc);
          cursor: pointer; transition: all 0.2s;
        ">
          ${t('updater.later') || '稍后更新'}
        </button>
        <button id="btn-update-download" class="btn btn-primary" style="
          padding: 8px 20px; border-radius: 8px; font-size: 13px;
          border: none;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: #fff; font-weight: 600;
          cursor: pointer; transition: all 0.2s;
        ">
          ${asset ? (t('updater.download') || '立即更新') : (t('updater.viewRelease') || '查看发布页')}
        </button>
      </div>
    </div>
  `

  document.body.appendChild(modal)

  // 绑定事件
  const btnLater = modal.querySelector('#btn-update-later')
  const btnDownload = modal.querySelector('#btn-update-download')

  btnLater.addEventListener('click', () => {
    modal.style.animation = 'fadeOut 0.2s ease'
    setTimeout(() => {
      modal.remove()
      updateModal = null
    }, 200)
  })

  btnDownload.addEventListener('click', async () => {
    if (!asset) {
      // 没有匹配当前平台的安装包，打开发布页
      window.open(info.htmlUrl, '_blank')
      return
    }

    // 开始下载
    btnDownload.disabled = true
    btnDownload.textContent = t('updater.downloading') || '下载中...'
    btnLater.style.display = 'none'

    const progressEl = modal.querySelector('#app-update-progress')
    const progressBar = modal.querySelector('#app-update-progress-bar')
    const progressText = modal.querySelector('#app-update-progress-text')
    progressEl.style.display = 'block'

    try {
      // 模拟进度（实际下载是单次请求，无法获取真实进度）
      let progress = 0
      const progressTimer = setInterval(() => {
        progress = Math.min(progress + Math.random() * 15, 90)
        progressBar.style.width = progress + '%'
        progressText.textContent = `${t('updater.downloading') || '正在下载...'} ${Math.round(progress)}%`
      }, 500)

      const result = await api.downloadAppUpdate(asset.url, asset.name)

      clearInterval(progressTimer)
      progressBar.style.width = '100%'
      progressText.textContent = t('updater.downloadDone') || '下载完成！'

      // 显示安装按钮
      btnDownload.textContent = t('updater.install') || '安装并重启'
      btnDownload.disabled = false
      btnDownload.onclick = async () => {
        btnDownload.disabled = true
        btnDownload.textContent = t('updater.installing') || '正在安装...'
        try {
          await api.launchInstallerAndExit(result.path)
        } catch (e) {
          toast(t('updater.installFailed') || '安装失败: ' + (e.message || e), 'error')
          btnDownload.disabled = false
          btnDownload.textContent = t('updater.retry') || '重试'
        }
      }

      btnLater.style.display = ''
      btnLater.textContent = t('updater.close') || '关闭'
    } catch (e) {
      progressBar.style.width = '0%'
      progressText.textContent = t('updater.downloadFailed') || '下载失败'
      btnDownload.disabled = false
      btnDownload.textContent = t('updater.retry') || '重试'
      btnLater.style.display = ''
      toast(t('updater.downloadFailed') || '下载失败: ' + (e.message || e), 'error')
    }
  })
}

/**
 * 格式化更新日志（Markdown → 简单 HTML）
 */
function formatReleaseNotes(notes) {
  if (!notes) return ''
  
  return notes
    .replace(/### (.*)/g, '<h4 style="margin: 12px 0 6px; font-size: 14px; color: var(--text-primary, #fff);">$1</h4>')
    .replace(/## (.*)/g, '<h3 style="margin: 14px 0 8px; font-size: 15px; color: var(--text-primary, #fff);">$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.*?)`/g, '<code style="background: var(--bg-tertiary, #333); padding: 1px 4px; border-radius: 3px; font-size: 12px;">$1</code>')
    .replace(/^- (.*)/gm, '<div style="padding-left: 16px; position: relative;"><span style="position: absolute; left: 0; color: var(--accent, #667eea);">•</span>$1</div>')
    .replace(/\n/g, '<br>')
}

/**
 * Toast 通知（兼容已有的 toast 系统）
 */
function toast(msg, type = 'info') {
  if (window.toast) {
    window.toast(msg, type)
    return
  }
  // fallback
  console.log(`[Toast ${type}] ${msg}`)
}

// 添加动画样式
const style = document.createElement('style')
style.textContent = `
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
  @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
`
document.head.appendChild(style)
