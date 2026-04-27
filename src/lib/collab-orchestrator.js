import { api } from './tauri-api.js'
import { wsClient, uuid } from './ws-client.js'

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

function makeTempSessionKey(prefix = 'collab') {
  const id = `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  return `agent:main:${id}`
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
    throw new Error('OpenClaw Gateway 未就绪')
  }
  const sessionKey = makeTempSessionKey('openclaw-collab')
  const startedAt = Date.now()
  let finalText = ''
  let finalRunId = ''

  const unsub = wsClient.onEvent((msg) => {
    const { event, payload } = msg || {}
    if (event !== 'chat' || !payload) return
    if (payload.sessionKey !== sessionKey) return
    if (payload.state === 'final') {
      finalRunId = payload.runId || finalRunId
      finalText = extractChatText(payload.message) || finalText
    }
  })

  try {
    await wsClient.chatSend(sessionKey, task)
    while (Date.now() - startedAt < timeoutMs) {
      if (finalText) return { engine: 'OpenClaw', sessionKey, runId: finalRunId, text: finalText }
      await sleep(500)
    }
    throw new Error('OpenClaw 协同执行超时')
  } finally {
    try { unsub() } catch {}
  }
}

async function runHermesTask(task, { timeoutMs = 300000, instructions = null } = {}) {
  const sessionId = `collab-hermes-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  const startedAt = Date.now()
  await api.hermesAgentRun(task, sessionId, null, instructions)
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
  throw new Error('Hermes 协同执行超时')
}

export async function runDualEngineCollab(task, opts = {}) {
  const spec = parseCollabSpec(task)
  const autoIterate = opts.autoIterate ?? spec.autoIterate
  const maxRounds = opts.maxRounds ?? spec.maxRounds ?? 3
  const leadEngine = /openclaw/i.test(spec.leadEngine) ? 'OpenClaw' : /hermes/i.test(spec.leadEngine) ? 'Hermes' : ''
  const supportEngine = /openclaw/i.test(spec.supportEngine) ? 'OpenClaw' : /hermes/i.test(spec.supportEngine) ? 'Hermes' : ''
  const leadTask = spec.leadTask || task
  const supportTask = spec.supportTask || '请对主导引擎的产出执行验证、复核或补位工作。'

  const hasExplicitPipeline = leadEngine && supportEngine && leadTask && supportTask
  if (hasExplicitPipeline) {
    const runLead = leadEngine === 'Hermes' ? runHermesTask : runOpenClawTask
    const runSupport = supportEngine === 'Hermes' ? runHermesTask : runOpenClawTask

    const leadFirst = await runLead(`你是本轮双引擎协同的主导引擎。\n\n总任务：\n${task}\n\n你的主导任务：\n${leadTask}\n\n请直接完成主导产出，并输出可交给协作引擎继续执行的明确结果。`, opts)

    const supportVerify = await runSupport(`你是本轮双引擎协同的协作引擎。\n\n总任务：\n${task}\n\n主导引擎产出：\n${leadFirst.text}\n\n你的协作任务：\n${supportTask}\n\n请执行验证/测试/补位，并输出明确结果；如果失败，说明失败点和日志摘要。`, opts)

    const leadFix = await runLead(`你是本轮双引擎协同的主导引擎。\n\n总任务：\n${task}\n\n你上一轮的产出：\n${leadFirst.text}\n\n协作引擎返回的验证/测试结果：\n${supportVerify.text}\n\n请根据协作结果修正你的方案或产出，并给出新的交付内容。`, opts)

    const supportRetest = await runSupport(`你是本轮双引擎协同的协作引擎。\n\n总任务：\n${task}\n\n主导引擎修正后的产出：\n${leadFix.text}\n\n请再次执行你的协作任务：\n${supportTask}\n\n输出最终复测结果，并明确说明是否通过。`, opts)

    const mergedPrompt = `# 双引擎串行协同闭环结果\n\n[原始任务]\n${task}\n\n[主导引擎]\n${leadEngine}\n\n[协作引擎]\n${supportEngine}\n\n[主导任务]\n${leadTask}\n\n[协作任务]\n${supportTask}\n\n[主导引擎首轮产出]\n${leadFirst.text}\n\n[协作引擎首轮验证/测试结果]\n${supportVerify.text}\n\n[主导引擎修正后产出]\n${leadFix.text}\n\n[协作引擎最终复测结果]\n${supportRetest.text}\n\n[汇总要求]\n1. 说明这次串行协同闭环是否完成\n2. 如果仍未通过，明确卡在哪一步\n3. 给出当前最可靠的最终结果\n4. 必须写出“下一步建议”`

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
    ? `你是本轮双引擎协同的主导引擎。\n\n总任务：\n${task}\n\n你的主导任务：\n${leadTask}\n\n请直接完成主导产出，并明确交付给协作引擎继续处理时需要的信息。`
    : supportEngine === 'Hermes'
      ? `你是本轮双引擎协同的协作引擎。\n\n总任务：\n${task}\n\n你的协作任务：\n${supportTask}\n\n请准备在收到主导引擎结果后执行验证、测试、补位或复核。`
      : `你现在正在参与双引擎协同执行。请只完成以下任务的独立分析与执行建议，不要假装你知道另一引擎的输出。\n\n任务：\n${task}\n\n输出要求：\n1. 给出你的执行方案\n2. 给出关键风险点\n3. 给出你希望另一引擎重点复核的地方`

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
