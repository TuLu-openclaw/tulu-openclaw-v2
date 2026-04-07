/**
 * 喵咕验证页面
 * 访问 https://yz.blyfw.cn/ 自动查找文档，为用户指定的应用或源码加入最适合的网络卡密验证
 */
import { t } from '../lib/i18n.js'

export function renderMiaoguVerify(el) {
  el.innerHTML = `
    <div class="page-header">
      <div class="page-title">${icon('verify', 20)} 喵咕验证</div>
      <div class="page-desc">网络卡密验证系统 · 自动查找文档快速接入</div>
    </div>
    <div class="verify-container">
      <div class="verify-card">
        <div class="verify-card-header">
          <span class="verify-badge">喵咕验证</span>
          <span class="verify-status online">服务正常</span>
        </div>
        <div class="verify-card-body">
          <p style="color:var(--text-secondary);font-size:var(--font-size-sm);margin-bottom:16px;text-align:center">
            点击下方按钮访问喵咕验证，为您的应用快速接入网络卡密验证功能
          </p>
          <div class="verify-actions">
            <a class="btn btn-primary btn-lg" href="https://yz.blyfw.cn/" target="_blank" rel="noopener">
              ${icon('external-link', 16)} 打开喵咕验证
            </a>
          </div>
          <div class="verify-info">
            <div class="verify-info-item">
              <span class="verify-info-label">功能说明</span>
              <span class="verify-info-value">自动查找文档 · 智能卡密验证 · 快速接入</span>
            </div>
            <div class="verify-info-item">
              <span class="verify-info-label">支持类型</span>
              <span class="verify-info-value">应用验证 · 源码验证 · SDK接入</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `

  // 页面样式
  if (!document.getElementById('verify-page-style')) {
    const style = document.createElement('style')
    style.id = 'verify-page-style'
    style.textContent = `
      .verify-container { padding: 24px; max-width: 640px; margin: 0 auto; }
      .verify-card { background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--radius-lg); overflow: hidden; }
      .verify-card-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); background: var(--bg-tertiary); }
      .verify-badge { font-weight: 700; font-size: var(--font-size-md); color: var(--text-primary); }
      .verify-status { font-size: var(--font-size-xs); padding: 2px 8px; border-radius: 12px; }
      .verify-status.online { background: rgba(34,197,94,.15); color: #22c55e; }
      .verify-status.offline { background: rgba(239,68,68,.15); color: #ef4444; }
      .verify-card-body { padding: 24px 20px; }
      .verify-actions { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }
      .btn-lg { padding: 10px 24px; font-size: var(--font-size-md); font-weight: 600; border-radius: var(--radius-md); display: inline-flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none; cursor: pointer; border: none; transition: all .2s; }
      .btn-primary { background: linear-gradient(135deg,#6366f1,#8b5cf6); color: #fff; }
      .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
      .verify-info { display: flex; flex-direction: column; gap: 10px; padding-top: 16px; border-top: 1px solid var(--border); }
      .verify-info-item { display: flex; gap: 12px; font-size: var(--font-size-sm); }
      .verify-info-label { color: var(--text-tertiary); min-width: 80px; }
      .verify-info-value { color: var(--text-secondary); }
      .page-desc { color: var(--text-secondary); font-size: var(--font-size-sm); margin-top: 4px; }
    `
    document.head.appendChild(style)
  }
}

function icon(name, size = 16) {
  const icons = {
    'verify': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="${size}" height="${size}"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`,
    'external-link': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="${size}" height="${size}"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  }
  return icons[name] || ''
}
