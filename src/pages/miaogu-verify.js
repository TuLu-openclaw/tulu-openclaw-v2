import '../style/movie-tool.css';

/**
 * 喵咕验证页面
 * 访问 https://yz.blyfw.cn/ 自动查找文档，为用户指定的应用或源码加入最适合的网络卡密验证
 */

export default function render(el) {
  el.innerHTML = `
    <div class="page-header">
      <div class="page-title">喵咕验证</div>
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
              打开喵咕验证
            </a>
          </div>
          <div class="verify-actions">
            <a class="btn btn-secondary btn-lg" href="https://yz.blyfw.cn/login?type=dev" target="_blank" rel="noopener">
              开发者登录
            </a>
            <a class="btn btn-secondary btn-lg" href="https://yz.blyfw.cn/login?type=agent" target="_blank" rel="noopener">
              代理登录
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

  if (!document.getElementById('miaogu-verify-style')) {
    const style = document.createElement('style')
    style.id = 'miaogu-verify-style'
    style.textContent = `
      .verify-container { padding: 24px; max-width: 640px; margin: 0 auto; }
      .verify-card { background: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--radius-lg); overflow: hidden; }
      .verify-card-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); background: var(--bg-tertiary); }
      .verify-badge { font-weight: 700; font-size: var(--font-size-md); color: var(--text-primary); }
      .verify-status { font-size: var(--font-size-xs); padding: 2px 8px; border-radius: 12px; }
      .verify-status.online { background: rgba(34,197,94,.15); color: #22c55e; }
      .verify-card-body { padding: 24px 20px; }
      .verify-actions { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
      .btn-lg { padding: 10px 24px; font-size: var(--font-size-md); font-weight: 600; border-radius: var(--radius-md); display: inline-flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none; cursor: pointer; border: none; transition: all .2s; }
      .btn-primary { background: linear-gradient(135deg,#6366f1,#8b5cf6); color: #fff; }
      .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
      .btn-secondary { background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border); }
      .btn-secondary:hover { background: var(--bg-secondary); }
      .verify-info { display: flex; flex-direction: column; gap: 10px; padding-top: 16px; border-top: 1px solid var(--border); }
      .verify-info-item { display: flex; gap: 12px; font-size: var(--font-size-sm); }
      .verify-info-label { color: var(--text-tertiary); min-width: 80px; }
      .verify-info-value { color: var(--text-secondary); }
    `
    document.head.appendChild(style)
  }
}
