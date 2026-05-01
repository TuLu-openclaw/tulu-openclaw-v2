/**
 * 独立直播播放器页面
 * 从 URL 参数获取 sources JSON，加载视频源并播放
 * 支持全屏、音量、HLS 清晰度切换、录屏
 */
import { api } from '../lib/tauri-api.js'

// 解析 URL 参数
function getSourcesFromUrl() {
  const params = new URLSearchParams(window.location.search)
  const encoded = params.get('sources')
  if (!encoded) return []
  try {
    return JSON.parse(decodeURIComponent(encoded))
  } catch (_) {
    return []
  }
}

function esc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// 加载 HLS.js
function loadHlsJs() {
  return new Promise((resolve, reject) => {
    if (window.Hls) { resolve(); return }
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.4.12/dist/hls.min.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('HLS.js 加载失败'))
    document.head.appendChild(script)
  })
}

// 检测可用源
function detectVideoUrl(sources) {
  for (const s of sources) {
    const url = s.url || s
    if (!url) continue
    if (url.includes('.m3u8')) return { type: 'hls', url }
    if (url.includes('.mp4')) return { type: 'mp4', url }
  }
  return null
}

let currentPlayer = null
let hlsInstance = null
let mediaRecorder = null
let recordingStream = null
let isRecording = false

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
  if (recordingStream) {
    recordingStream.getTracks().forEach(t => t.stop())
    recordingStream = null
  }
  isRecording = false
  updateRecordBtn()
}

function startRecording() {
  if (!currentPlayer) return
  try {
    recordingStream = currentPlayer.captureStream()
    mediaRecorder = new MediaRecorder(recordingStream, { mimeType: 'video/webm;codecs=vp9' })
    const chunks = []
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `recording_${Date.now()}.webm`
      a.click()
    }
    mediaRecorder.start()
    isRecording = true
    updateRecordBtn()
  } catch (e) {
    alert('录屏失败: ' + e.message)
  }
}

function updateRecordBtn() {
  const btn = document.getElementById('rec-btn')
  if (!btn) return
  if (isRecording) {
    btn.textContent = '⏹ 停止录屏'
    btn.style.background = '#ef4444'
  } else {
    btn.textContent = '⏺ 录屏'
    btn.style.background = ''
  }
}

async function playUrl(url, type) {
  const container = document.getElementById('player-container')
  container.innerHTML = ''

  if (currentPlayer) {
    currentPlayer.pause()
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null }
    currentPlayer = null
  }
  stopRecording()

  if (type === 'hls') {
    await loadHlsJs()
    const video = document.createElement('video')
    video.id = 'main-video'
    video.controls = true
    video.style.width = '100%'
    video.style.maxHeight = '80vh'
    video.style.background = '#000'
    container.appendChild(video)

    if (Hls.isSupported()) {
      hlsInstance = new Hls({ enableWorker: true })
      hlsInstance.loadSource(url)
      hlsInstance.attachMedia(video)
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => video.play())
      currentPlayer = video
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url
      video.addEventListener('loadedmetadata', () => video.play())
      currentPlayer = video
    } else {
      container.innerHTML = '<div style="color:#ef4444;padding:20px;">您的浏览器不支持 HLS 播放</div>'
    }
  } else if (type === 'mp4') {
    const video = document.createElement('video')
    video.id = 'main-video'
    video.src = url
    video.controls = true
    video.style.width = '100%'
    video.style.maxHeight = '80vh'
    video.style.background = '#000'
    container.appendChild(video)
    video.play()
    currentPlayer = video
  }

  // 添加音量控制
  setupVolumeControl()
}

function setupVolumeControl() {
  const volSlider = document.getElementById('vol-slider')
  const volLabel = document.getElementById('vol-label')
  if (!volSlider || !currentPlayer) return
  volSlider.value = currentPlayer.volume * 100
  volSlider.oninput = () => {
    currentPlayer.volume = volSlider.value / 100
    if (volLabel) volLabel.textContent = Math.round(currentPlayer.volume * 100) + '%'
  }
}

function setupFullscreen() {
  const btn = document.getElementById('fs-btn')
  if (!btn) return
  btn.addEventListener('click', () => {
    const container = document.getElementById('player-container')
    if (!container) return
    if (container.requestFullscreen) container.requestFullscreen()
    else if (container.webkitRequestFullscreen) container.webkitRequestFullscreen()
  })
}

function render(sources) {
  const detected = detectVideoUrl(sources)
  const root = document.getElementById('app')
  root.innerHTML = `
    <div style="background:#0a0a0f;color:#fff;min-height:100vh;padding:20px;box-sizing:border-box;">
      <div style="max-width:1200px;margin:0 auto;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
          <div style="font-size:22px;font-weight:800;">🎬 直播播放器</div>
          ${detected ? `<button id="fs-btn" style="padding:8px 16px;background:#333;border:1px solid #555;color:#fff;border-radius:8px;cursor:pointer;font-size:14px;">⛶ 全屏</button>` : ''}
          ${detected ? `<button id="rec-btn" style="padding:8px 16px;background:#333;border:1px solid #555;color:#fff;border-radius:8px;cursor:pointer;font-size:14px;">⏺ 录屏</button>` : ''}
          <div style="margin-left:auto;display:flex;align-items:center;gap:8px;">
            <span style="font-size:13px;color:#a1a1aa;">音量</span>
            <input id="vol-slider" type="range" min="0" max="100" value="100" style="width:100px;" />
            <span id="vol-label" style="font-size:12px;color:#a1a1aa;min-width:36px;">100%</span>
          </div>
        </div>

        <div id="player-container" style="background:#000;border-radius:12px;overflow:hidden;margin-bottom:16px;position:relative;">
          ${!detected ? `<div style="padding:40px;text-align:center;color:#a1a1aa;">未检测到可用视频源</div>` : ''}
        </div>

        ${sources.length > 0 ? `
        <div style="margin-top:16px;">
          <div style="font-size:14px;color:#a1a1aa;margin-bottom:8px;">检测到的视频源（点击选择）</div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${sources.map((s, i) => {
              const url = s.url || s
              return `<button data-url="${esc(url)}" data-type="${url.includes('.m3u8') ? 'hls' : 'mp4'}" style="text-align:left;padding:10px 14px;background:#1a1a2e;border:1px solid #333;color:#e2e8f0;border-radius:8px;cursor:pointer;font-size:13px;font-family:monospace;word-break:break-all;${detected && detected.url === url ? 'border-color:#6366f1;background:#1e1b4b;' : ''}">
                ${i + 1}. ${esc(url)}
              </button>`
            }).join('')}
          </div>
        </div>` : ''}
      </div>
    </div>
  `

  // 绑定按钮事件
  const recBtn = document.getElementById('rec-btn')
  if (recBtn) {
    recBtn.addEventListener('click', () => {
      if (isRecording) stopRecording()
      else startRecording()
    })
  }
  setupFullscreen()

  // 绑定源选择按钮
  document.querySelectorAll('[data-url]').forEach(btn => {
    btn.addEventListener('click', () => {
      playUrl(btn.dataset.url, btn.dataset.type)
    })
  })

  // 自动播放第一个检测到的源
  if (detected) {
    setTimeout(() => playUrl(detected.url, detected.type), 100)
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const sources = getSourcesFromUrl()
  render(sources)
})
