/**
 * 音乐播放器 — 独立 HTML 加载 wrapper
 * 实际页面：public/music-player.html（自包含，无外部依赖）
 */
export default function MusicPlayerPage() {
  const container = document.createElement('div')
  container.className = 'music-player-page'
  container.style.cssText = 'position:fixed;inset:0;z-index:10;'

  const iframe = document.createElement('iframe')
  iframe.src = '/music-player.html'
  iframe.style.cssText = 'width:100%;height:100%;border:none;'
  iframe.allow = 'autoplay'

  container.appendChild(iframe)
  return container
}
