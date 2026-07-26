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
    this._MediaRecorder = options.MediaRecorder || globalThis.MediaRecorder || null
    this._getUserMedia = options.getUserMedia || globalThis.navigator?.mediaDevices?.getUserMedia?.bind(globalThis.navigator.mediaDevices) || null
    this._transcribe = options.transcribe || null
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
    this._recording = null
    this._recordingChunks = []
    this._recordingStream = null
    this._recordingTimer = null
  }

  get supported() { return Boolean(this._Recognition) }
  get recorderSupported() { return Boolean(this._MediaRecorder && this._getUserMedia && this._transcribe) }
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
    if (this._mode === 'short' && this._recording && !this._disposed) {
      this._restart = false
      this._stopRecording(false)
      return
    }
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
    this._stopRecording(true)
    this._emitStatus('idle')
  }

  dispose() {
    this._disposed = true
    this._stopRecording(true)
    this.stop()
  }

  _start(mode) {
    if (this._disposed) return false
    if (mode === 'short' && this.recorderSupported) {
      this.stop()
      this._mode = mode
      this._emitStatus('listening')
      void this._startRecording()
      return true
    }
    if (!this.supported) {
      this._onError({ code: 'not-supported', message: '当前系统不支持语音输入，请改用文字输入' })
      return false
    }
    this.stop()
    this._mode = mode
    this._restart = mode === 'continuous' || mode === 'wake'
    this._wakeArmed = false
    this._createAndStartRecognition()
    return true
  }

  async _startRecording() {
    try {
      const stream = await this._getUserMedia({ audio: true })
      if (this._mode !== 'short' || this._disposed) {
        stream.getTracks?.().forEach(track => track.stop())
        return
      }
      const recorder = new this._MediaRecorder(stream)
      this._recordingChunks = []
      this._recordingStream = stream
      recorder.ondataavailable = event => { if (event.data?.size || event.data?.length) this._recordingChunks.push(event.data) }
      recorder.onerror = () => this._handleRecorderError('recording-failed')
      recorder.onstop = () => {
        stream.getTracks?.().forEach(track => track.stop())
        const chunks = this._recordingChunks
        this._recording = null
        this._recordingStream = null
        this._recordingChunks = []
        if (chunks.length) void this._transcribeRecording(chunks, recorder.mimeType || 'audio/webm')
      }
      this._recording = recorder
      recorder.start()
      this._recordingTimer = setTimeout(() => this.stop(), 15000)
    } catch (error) {
      this._handleRecorderError(error?.name === 'NotAllowedError' ? 'not-allowed' : 'recording-failed')
    }
  }

  _stopRecording(abort = false) {
    if (this._recordingTimer) clearTimeout(this._recordingTimer)
    this._recordingTimer = null
    const recorder = this._recording
    const stream = this._recordingStream
    if (!recorder) return
    this._recording = null
    this._recordingStream = null
    if (abort) {
      try { stream?.getTracks?.().forEach(track => track.stop()) } catch {}
      try { recorder.onstop = null; recorder.stop() } catch {}
      this._recordingChunks = []
      return
    }
    try { recorder.stop() } catch { this._handleRecorderError('recording-failed') }
  }

  async _transcribeRecording(chunks, mimeType) {
    if (this._disposed || this._mode !== 'short') return
    this._emitStatus('transcribing')
    try {
      const blob = new Blob(chunks, { type: mimeType || 'audio/webm' })
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('录音读取失败'))
        reader.readAsDataURL(blob)
      })
      const result = await this._transcribe(data, mimeType, this._language)
      const text = normalizeTranscript(result?.text || result?.transcript || result)
      if (!text) throw new Error('没有识别到可用文字，请靠近麦克风后重试')
      this._onCommand(text, { mode: 'short', engine: result?.engine || 'openclaw' })
      this._mode = 'idle'
      this._emitStatus('idle')
    } catch (error) {
      this._handleError({ error: 'transcription-failed', message: error?.message || String(error) })
    }
  }

  _handleRecorderError(code) {
    this._recording = null
    this._recordingStream?.getTracks?.().forEach(track => track.stop())
    this._recordingStream = null
    this._mode = 'idle'
    this._onError({ code, message: this._friendlyError(code) })
    this._emitStatus('error')
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
    if (code === 'transcription-failed' && this.supported && !this._disposed) {
      this._mode = 'short'
      this._restart = false
      this._createAndStartRecognition()
      this._onError({ code, message: '本机转写暂时不可用，正在尝试兼容语音识别；仍失败时可改用文字输入' })
      return
    }
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
      'recording-failed': '录音失败，请检查麦克风后重试，或改用文字输入',
      'transcription-failed': '语音转文字暂时不可用，请重试或改用文字输入',
    }
    return messages[code] || '语音暂时不可用，请重试或改用文字输入'
  }
}
