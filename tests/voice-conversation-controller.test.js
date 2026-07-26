import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { VoiceConversationController, extractWakeCommand } from '../src/lib/voice-conversation-controller.js'

class FakeRecognition {
  static instances = []

  constructor() {
    FakeRecognition.instances.push(this)
    this.lang = ''
    this.continuous = false
    this.interimResults = false
  }

  start() { this.onstart?.() }
  stop() { this.onend?.() }
  abort() {}
  final(text) {
    this.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: text }, isFinal: true, length: 1 }] })
  }
  end() { this.onend?.() }
}

function resetFakeRecognition() {
  FakeRecognition.instances.length = 0
}

test('extractWakeCommand matches custom wake words and inline commands', () => {
  assert.deepEqual(extractWakeCommand('小鱼儿，帮我总结今天的任务', '小鱼儿'), {
    matched: true,
    command: '帮我总结今天的任务',
  })
  assert.deepEqual(extractWakeCommand('普通聊天内容', '小鱼儿'), { matched: false, command: '' })
})

test('short voice mode emits one command and becomes idle', () => {
  resetFakeRecognition()
  const commands = []
  const voice = new VoiceConversationController({ Recognition: FakeRecognition, onCommand: text => commands.push(text) })

  assert.equal(voice.startShort(), true)
  FakeRecognition.instances[0].final(' 发送 一条消息 ')

  assert.deepEqual(commands, ['发送 一条消息'])
  assert.equal(voice.mode, 'idle')
})

test('continuous mode restarts recognition after the engine ends', async () => {
  resetFakeRecognition()
  const commands = []
  const voice = new VoiceConversationController({ Recognition: FakeRecognition, onCommand: text => commands.push(text) })

  voice.startContinuous()
  FakeRecognition.instances[0].final('第一句')
  FakeRecognition.instances[0].end()
  await Promise.resolve()

  assert.deepEqual(commands, ['第一句'])
  assert.equal(FakeRecognition.instances.length, 2)
  assert.equal(voice.mode, 'continuous')
  voice.dispose()
})

test('wake mode accepts inline and two-step commands', () => {
  resetFakeRecognition()
  const commands = []
  const statuses = []
  const voice = new VoiceConversationController({
    Recognition: FakeRecognition,
    wakeWord: '星枢',
    onCommand: text => commands.push(text),
    onStatus: state => statuses.push(state.status),
  })

  voice.startWake()
  const recognition = FakeRecognition.instances[0]
  recognition.final('星枢 打开任务面板')
  recognition.final('星枢')
  recognition.final('帮我检查项目')

  assert.deepEqual(commands, ['打开任务面板', '帮我检查项目'])
  assert.equal(statuses.includes('wake-armed'), true)
  voice.dispose()
})

test('unsupported environments fail without throwing', () => {
  const errors = []
  const voice = new VoiceConversationController({ Recognition: null, onError: error => errors.push(error.code) })
  assert.equal(voice.startShort(), false)
  assert.deepEqual(errors, ['not-supported'])
})

test('chat page owns and clears the push-to-talk hold timer during cleanup', () => {
  const source = readFileSync(new URL('../src/pages/chat.js', import.meta.url), 'utf8')
  assert.match(source, /let _voiceHoldTimer = null/)
  assert.match(source, /_voiceHoldTimer = setTimeout\(\(\) => \{[\s\S]*if \(!_voicePanelEl \|\| !_voiceController\) return/)
  assert.match(source, /export function cleanup\(\) \{[\s\S]*if \(_voiceHoldTimer\) clearTimeout\(_voiceHoldTimer\)[\s\S]*_voiceHoldTimer = null[\s\S]*_voiceController\?\.dispose\(\)/)
})
