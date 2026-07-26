const DEFAULT_WAKE_WORD = '小鱼儿'

function normalizeTranscript(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

export function extractWakeCommand(transcript, wakeWord) {
  const text = normalizeTranscript(transcript)
  const wake = normalizeTranscript(wakeWord)
  if (!text || !wake) return { matched: false, command: '' }
  const index = text.toLocaleLowerCase().indexOf(wake.toLocaleLowerCase())
  if (index < 0) return { matched: false, command: '' }
  return {
    matched: true,
    command: normalizeTranscript(text.slice(index + wake.length).replace(/^[，。！？、,:;\s]+/, '')),
  }
}

export class VoiceConversationController {
  constructor(options = {}) {
    this._Recognition = options.Recognition || globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null
    this._onCommand = options.onCommand || (() => {})
    this._onInterim = options.onInterim || (() => {})
    this._onStatus = options.onStatus || (() => {})
    this._onError = options.onError || (() => {})
    this._language = options.language || 'zh-CN'
    this._wakeWord = normalizeTranscript(options.wakeWord) || DEFAULT_WAKE_WORD
    this._mode = 'idle'
    this._recognition = null
    this._restart = false
    this._wakeArmed = false
    this._disposed = false
  }

  get supported() { return Boolean(this._Recognition) }
  get mode() { return this._mode }
  get wakeWord() { return this._wakeWord }
  get active() { return this._mode !== 'idle' }

  setWakeWord(value) {
    this._wakeWord = normalizeTranscript(value) || DEFAULT_WAKE_WORD
    this._wakeArmed = false
    return this._wakeWord
  }

  startShort() { return this._start('short') }
  startContinuous() { return this._start('continuous') }
  startWake() { return this._start('wake') }
  startPushToTalk() { return this._start('push') }

  stopPushToTalk() {
    if (this._mode !== 'push') return
    this._restart = false
    this._recognition?.stop()
  }

  stop() {
    this._restart = false
    this._wakeArmed = false
    this._mode = 'idle'
    const recognition = this._recognition
    this._recognition = null
    if (recognition) {
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      try { recognition.abort() } catch {}
    }
    this._onInterim('')
    this._emitStatus('idle')
  }

  dispose() {
    this._disposed = true
    this.stop()
  }

  _start(mode) {
    if (this._disposed) return false
    if (!this.supported) {
      this._onError({ code: 'not-supported', message: '当前系统 WebView 不支持语音识别' })
      return false
    }
    this.stop()
    this._mode = mode
    this._restart = mode === 'continuous' || mode === 'wake'
    this._wakeArmed = false
    this._createAndStartRecognition()
    return true
  }

  _createAndStartRecognition() {
    if (this._disposed || this._mode === 'idle') return
    const recognition = new this._Recognition()
    recognition.lang = this._language
    recognition.interimResults = true
    recognition.continuous = this._mode === 'continuous' || this._mode === 'wake'
    recognition.maxAlternatives = 1
    recognition.onstart = () => this._emitStatus(this._mode === 'wake' ? 'waiting-wake-word' : 'listening')
    recognition.onresult = (event) => this._handleResult(event)
    recognition.onerror = (event) => this._handleError(event)
    recognition.onend = () => this._handleEnd(recognition)
    this._recognition = recognition
    try {
      recognition.start()
    } catch (error) {
      this._handleError({ error: 'start-failed', message: error?.message || String(error) })
    }
  }

  _handleResult(event) {
    let interim = ''
    for (let index = event.resultIndex || 0; index < event.results.length; index += 1) {
      const result = event.results[index]
      const transcript = normalizeTranscript(result?.[0]?.transcript)
      if (!transcript) continue
      if (result.isFinal) this._handleFinalTranscript(transcript)
      else interim = normalizeTranscript(`${interim} ${transcript}`)
    }
    this._onInterim(interim)
  }

  _handleFinalTranscript(transcript) {
    this._onInterim('')
    if (this._mode === 'wake') {
      if (this._wakeArmed) {
        this._wakeArmed = false
        this._onCommand(transcript, { mode: 'wake' })
        this._emitStatus('waiting-wake-word')
        return
      }
      const wake = extractWakeCommand(transcript, this._wakeWord)
      if (!wake.matched) return
      if (wake.command) {
        this._onCommand(wake.command, { mode: 'wake' })
        this._emitStatus('waiting-wake-word')
      } else {
        this._wakeArmed = true
        this._emitStatus('wake-armed')
      }
      return
    }

    this._onCommand(transcript, { mode: this._mode })
    if (this._mode === 'short' || this._mode === 'push') {
      this._restart = false
      try { this._recognition?.stop() } catch {}
    }
  }

  _handleError(event) {
    const code = event?.error || 'unknown'
    const recoverable = code === 'no-speech' || code === 'aborted'
    if (!recoverable) this._restart = false
    this._onError({ code, message: event?.message || this._friendlyError(code) })
    if (!recoverable) {
      this._mode = 'idle'
      this._emitStatus('error')
    }
  }

  _handleEnd(recognition) {
    if (this._recognition !== recognition) return
    this._recognition = null
    if (this._restart && !this._disposed && this._mode !== 'idle') {
      queueMicrotask(() => this._createAndStartRecognition())
      return
    }
    this._mode = 'idle'
    this._wakeArmed = false
    this._emitStatus('idle')
  }

  _emitStatus(status) {
    this._onStatus({ status, mode: this._mode, wakeWord: this._wakeWord })
  }

  _friendlyError(code) {
    const messages = {
      'not-allowed': '麦克风权限被拒绝，请在系统隐私设置中允许访问麦克风',
      'service-not-allowed': '系统语音识别服务不可用',
      'audio-capture': '没有检测到可用的麦克风',
      network: '语音识别服务网络连接失败',
      'no-speech': '没有检测到语音，请重试',
      aborted: '语音识别已停止',
      'start-failed': '无法启动语音识别',
    }
    return messages[code] || `语音识别失败（${code}）`
  }
}
