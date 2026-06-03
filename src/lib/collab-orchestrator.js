import { api } from './tauri-api.js'
import { wsClient } from './ws-client.js'
import { t } from './i18n.js'

function parseCollabSpec(rawTask) {
  const text = String(rawTask || '')
  const pick = (label) => {
    const m = text.match(new RegExp(`(?:^|\\n)-?\\s*${label}\\s*[:：]\\s*(.+)`, 'i'))
    return m ? m[1].trim() : ''
  }
  const autoIterateRaw = pick('自动迭代') || pick('auto iterate')
  const maxRoundsRaw = pick('最大轮数') || pick('max rounds')
  return {
    leadEngine: pick('主导引擎') || pick('lead engine'),
    supportEngine: pick('协作引擎') || pick('support engine'),
    leadTask: pick('主导任务') || pick('lead task'),
    supportTask: pick('协作任务') || pick('support task'),
    autoIterate: /^(开启|true|yes|on|1)$/i.test(autoIterateRaw),
    maxRounds: Math.max(1, Math.min(10, Number(maxRoundsRaw) || 3)),
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const COLLAB_ACTIVE_GRACE_MS = 90000

function collabError(key, params) {
  return new Error(t(`engine.${key}`, params))
}

function makeTempSessionKey(prefix = 'collab') {
  const id = `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  return `agent:main:${id}`
}

async function ensureCollabReady() {
  const issues = []
  const openclawInfo = wsClient.getConnectionInfo?.() || {}
  if (!wsClient.gatewayReady || !wsClient.connected) {
    issues.push(t('engine.collabOpenClawNotReadyIssue', {
      connected: openclawInfo.connected ? 'yes' : 'no',
      gatewayReady: openclawInfo.gatewayReady ? 'yes' : 'no',
    }))
  }
  const hermesInfo = await api.checkHermes().catch(() => null)
  if (!hermesInfo?.gatewayRunning) {
    issues.push(t('engine.collabHermesNotRunningIssue'))
  }
  if (issues.length) {
    throw collabError('collabNotReadyError', { issues: issues.join(t('engine.collabIssueSeparator')) })
  }
  return { openclawInfo, hermesInfo }
}

function extractChatText(message) {
  if (!message) return ''
  if (typeof message === 'string') return message
  if (Array.isArray(message?.content)) {
    return message.content
      .map(part => {
        if (typeof part === 'string') return part
        if (part?.text) return part.text
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (typeof message?.content === 'string') return message.content
  if (message?.content?.text) return message.content.text
  return ''
}

async function runOpenClawTask(task, { timeoutMs = 300000 } = {}) {
  if (!wsClient.gatewayReady || !wsClient.connected) {
    throw collabError('collabOpenClawGatewayNotReady')
  }
  const sessionKey = makeTempSessionKey('openclaw-collab')
  const startedAt = Date.now()
  let finalText = ''
  let partialText = ''
  let finalRunId = ''
  let finalSeen = false
  let lastState = 'queued'
  let lastActivityAt = startedAt
  let terminalError = null

  const unsub = wsClient.onEvent((msg) => {
    const { event, payload } = msg || {}
    if (event !== 'chat' || !payload) return
    if (payload.sessionKey !== sessionKey) return
    lastActivityAt = Date.now()
    lastState = payload.state || lastState
    finalRunId = payload.runId || finalRunId
    if (payload.state === 'delta') {
      const text = extractChatText(payload.message)
      if (text) partialText += text
      return
    }
    if (payload.state === 'error' || payload.state === 'aborted') {
      terminalError = payload.error || payload.message || payload.reason || payload.state
      return
    }
    if (payload.state === 'final') {
      finalSeen = true
      finalText = extractChatText(payload.message) || partialText || finalText
    }
  })

  try {
    await wsClient.chatSend(sessionKey, task)
    while ((Date.now() - startedAt < timeoutMs) || (Date.now() - lastActivityAt < COLLAB_ACTIVE_GRACE_MS)) {
      if (terminalError) throw collabError('collabOpenClawRunFailed', { error: String(terminalError) })
      if (finalSeen) {
        return {
          engine: 'OpenClaw',
          sessionKey,
          runId: finalRunId,
          text: finalText || t('engine.collabOpenClawEmptyFinal'),
        }
      }
      await sleep(500)
    }
    throw collabError('collabOpenClawTimeout', {
      seconds: Math.round((Date.now() - startedAt) / 1000),
      state: lastState || 'unknown',
    })
  } finally {
    try { unsub() } catch {}
  }
}

async function runHermesTask(task, { timeoutMs = 300000, instructions = null } = {}) {
  const ready = await api.checkHermes().catch(() => null)
  if (!ready?.gatewayRunning) {
    throw collabError('collabHermesGatewayNotReady')
  }
  const sessionId = `collab-hermes-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  const startedAt = Date.now()
  const systemInstructions = [
    t('engine.collabHermesSystemInstructions'),
    instructions || '',
  ].filter(Boolean).join('\n')
  await api.hermesAgentRun(task, sessionId, null, systemInstructions)
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const detail = await api.hermesSessionDetail(sessionId)
      const messages = detail?.messages || detail?.session?.messages || []
      const assistant = [...messages].reverse().find(m => m.role === 'assistant' && extractChatText(m))
      const text = extractChatText(assistant)
      if (text) return { engine: 'Hermes', sessionId, text }
    } catch {}
    await sleep(800)
  }
  throw collabError('collabHermesTimeout', { seconds: Math.round((Date.now() - startedAt) / 1000) })
}

export async function runDualEngineCollab(task, opts = {}) {
  await ensureCollabReady()
  const spec = parseCollabSpec(task)
  const autoIterate = opts.autoIterate ?? spec.autoIterate
  const maxRounds = opts.maxRounds ?? spec.maxRounds ?? 3
  const leadEngine = /openclaw/i.test(spec.leadEngine) ? 'OpenClaw' : /hermes/i.test(spec.leadEngine) ? 'Hermes' : ''
  const supportEngine = /openclaw/i.test(spec.supportEngine) ? 'OpenClaw' : /hermes/i.test(spec.supportEngine) ? 'Hermes' : ''
  const leadTask = spec.leadTask || task
  const supportTask = spec.supportTask || t('engine.collabDefaultSupportTask')

  const hasExplicitPipeline = leadEngine && supportEngine && leadTask && supportTask
  if (hasExplicitPipeline) {
    const runLead = leadEngine === 'Hermes' ? runHermesTask : runOpenClawTask
    const runSupport = supportEngine === 'Hermes' ? runHermesTask : runOpenClawTask

    const leadFirst = await runLead(t('engine.collabPipelineLeadFirstPrompt', { task, leadTask }), opts)

    const supportVerify = await runSupport(t('engine.collabPipelineSupportVerifyPrompt', { task, leadOutput: leadFirst.text, supportTask }), opts)

    const leadFix = await runLead(t('engine.collabPipelineLeadFixPrompt', { task, leadOutput: leadFirst.text, supportOutput: supportVerify.text }), opts)

    const supportRetest = await runSupport(t('engine.collabPipelineSupportRetestPrompt', { task, leadOutput: leadFix.text, supportTask }), opts)

    const mergedPrompt = t('engine.collabPipelineMergedPrompt', { task, leadEngine, supportEngine, leadTask, supportTask, leadFirst: leadFirst.text, supportVerify: supportVerify.text, leadFix: leadFix.text, supportRetest: supportRetest.text })

    return {
      task,
      mode: 'pipeline',
      leadEngine,
      supportEngine,
      leadTask,
      supportTask,
      leadFirst,
      supportVerify,
      leadFix,
      supportRetest,
      mergedPrompt,
      extraRounds: [],
    }
  }

  const openclawPrompt = leadEngine === 'OpenClaw'
    ? `你是本轮双引擎协同的主导引擎。\n\n总任务：\n${task}\n\n你的主导任务：\n${leadTask}\n\n请直接完成主导产出，并明确交付给协作引擎继续处理时需要的信息。`
    : supportEngine === 'OpenClaw'
      ? `你是本轮双引擎协同的协作引擎。\n\n总任务：\n${task}\n\n你的协作任务：\n${supportTask}\n\n请准备在收到主导引擎结果后执行验证、测试、补位或复核。`
      : `你现在正在参与双引擎协同执行。请只完成以下任务的独立分析与执行建议，不要假装你知道另一引擎的输出。\n\n任务：\n${task}\n\n输出要求：\n1. 给出你的执行方案\n2. 给出关键风险点\n3. 给出你希望另一引擎重点复核的地方`

  const hermesPrompt = leadEngine === 'Hermes'
    ? `你是本轮双引擎协同的主导引擎。\n\n总任务：\n${task}\n\n你的主导任务：\n${leadTask}\n\n请直接完成主导产出，并明确交付给协作引擎继续处理时需要的信息。\n\n禁止向用户追问 OpenClaw API、接口地址或手动同步方式。执行器会自动把你的结果转交给 OpenClaw。`
    : supportEngine === 'Hermes'
      ? `你是本轮双引擎协同的协作引擎。\n\n总任务：\n${task}\n\n你的协作任务：\n${supportTask}\n\n请准备在收到主导引擎结果后执行验证、测试、补位或复核。\n\n禁止向用户追问 OpenClaw API、接口地址或手动同步方式。执行器会自动把你的结果转交给 OpenClaw。`
      : `你现在正在参与双引擎协同执行。请只完成以下任务的独立分析与执行建议，不要假装你知道另一引擎的输出。\n\n任务：\n${task}\n\n禁止向用户追问 OpenClaw API、接口地址或手动同步方式。执行器会自动把你的结果转交给 OpenClaw。\n\n输出要求：\n1. 给出你的执行方案\n2. 给出关键风险点\n3. 给出你希望另一引擎重点复核的地方`

  const [openclaw, hermes] = await Promise.all([
    runOpenClawTask(openclawPrompt, opts),
    runHermesTask(hermesPrompt, opts),
  ])

  const hermesReviewPrompt = `你正在复核 OpenClaw 的协同结果。\n\n原始任务：\n${task}\n\nOpenClaw 输出：\n${openclaw.text}\n\n你的角色：${leadEngine === 'Hermes' ? '主导引擎' : supportEngine === 'Hermes' ? '协作引擎' : '协同引擎'}\n你的复核任务：\n${supportEngine === 'Hermes' ? supportTask : '请做复核与补充'}\n\n请只做复核：\n1. 指出你认同的部分\n2. 指出你不同意或需要补充的部分\n3. 给出你修正后的建议`
  const openclawReviewPrompt = `你正在复核 Hermes 的协同结果。\n\n原始任务：\n${task}\n\nHermes 输出：\n${hermes.text}\n\n你的角色：${leadEngine === 'OpenClaw' ? '主导引擎' : supportEngine === 'OpenClaw' ? '协作引擎' : '协同引擎'}\n你的复核任务：\n${supportEngine === 'OpenClaw' ? supportTask : '请做复核与补充'}\n\n请只做复核：\n1. 指出你认同的部分\n2. 指出你不同意或需要补充的部分\n3. 给出你修正后的建议`

  const [hermesReview, openclawReview] = await Promise.all([
    runHermesTask(hermesReviewPrompt, opts),
    runOpenClawTask(openclawReviewPrompt, opts),
  ])

  const extraRounds = []
  if (autoIterate && maxRounds > 2) {
    let lastHermes = hermesReview.text
    let lastOpenclaw = openclawReview.text
    for (let round = 3; round <= maxRounds; round++) {
      const [nextHermes, nextOpenclaw] = await Promise.all([
        runHermesTask(`第 ${round} 轮协同收敛。原始任务：\n${task}\n\nOpenClaw 上一轮输出：\n${lastOpenclaw}\n\n请继续收敛，避免重复，给出更最终的结论。`, opts),
        runOpenClawTask(`第 ${round} 轮协同收敛。原始任务：\n${task}\n\nHermes 上一轮输出：\n${lastHermes}\n\n请继续收敛，避免重复，给出更最终的结论。`, opts),
      ])
      extraRounds.push({ round, hermes: nextHermes, openclaw: nextOpenclaw })
      lastHermes = nextHermes.text
      lastOpenclaw = nextOpenclaw.text
    }
  }

  const mergedPrompt = `# 双引擎协同结果汇总\n\n[原始任务]\n${task}\n\n[OpenClaw 首轮输出]\n${openclaw.text}\n\n[Hermes 首轮输出]\n${hermes.text}\n\n[OpenClaw 对 Hermes 的复核]\n${openclawReview.text}\n\n[Hermes 对 OpenClaw 的复核]\n${hermesReview.text}${extraRounds.length ? `\n\n[额外自动迭代轮次]\n${extraRounds.map(r => `### 第 ${r.round} 轮\n- OpenClaw:\n${r.openclaw.text}\n- Hermes:\n${r.hermes.text}`).join('\n\n')}` : ''}\n\n[汇总要求]\n1. 提取双方一致结论\n2. 标出双方分歧\n3. 给出综合后的推荐执行方案\n4. 单独写出“协同复核”小节，说明双方互相补位了什么\n5. 如果某一方明显更适合主导，要明确指出原因\n6. 输出最终收敛结论，避免重复保留冲突草稿`

  return {
    task,
    openclaw,
    hermes,
    openclawReview,
    hermesReview,
    extraRounds,
    mergedPrompt,
  }
}
