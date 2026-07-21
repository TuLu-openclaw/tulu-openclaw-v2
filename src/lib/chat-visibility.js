const INTERNAL_MESSAGE_TYPES = new Set([
  'analysis',
  'commentary',
  'reasoning',
  'reasoning_delta',
  'reasoning_snapshot',
  'redacted_thinking',
  'thinking',
  'thinking_delta',
])

function normalizedType(value) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/[\s-]+/g, '_') : ''
}

function hasInternalFlag(value) {
  return value?.isReasoning === true
    || value?.isReasoningSnapshot === true
    || value?.isCommentary === true
    || value?.isThinking === true
}

function hasInternalLane(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return INTERNAL_MESSAGE_TYPES.has(normalizedType(value.phase))
    || INTERNAL_MESSAGE_TYPES.has(normalizedType(value.lane))
    || INTERNAL_MESSAGE_TYPES.has(normalizedType(value.channel))
    || INTERNAL_MESSAGE_TYPES.has(normalizedType(value.contentType || value.content_type))
    || INTERNAL_MESSAGE_TYPES.has(normalizedType(value.messageType || value.message_type))
}

function signedBlockPhase(block) {
  const signature = block?.textSignature || block?.text_signature
  if (!signature) return ''
  if (typeof signature === 'object') return normalizedType(signature.phase)
  if (typeof signature !== 'string' || !signature.startsWith('{')) return ''
  try {
    return normalizedType(JSON.parse(signature).phase)
  } catch {
    return ''
  }
}

function hasOnlyInternalSignedText(value) {
  if (!Array.isArray(value?.content)) return false
  const phases = value.content
    .filter(block => ['text', 'input_text', 'output_text'].includes(normalizedType(block?.type)))
    .map(signedBlockPhase)
    .filter(Boolean)
  return phases.length > 0 && phases.every(phase => INTERNAL_MESSAGE_TYPES.has(phase))
}

export function isInternalContentBlock(block) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) return false
  return hasInternalFlag(block)
    || INTERNAL_MESSAGE_TYPES.has(normalizedType(block.type))
    || INTERNAL_MESSAGE_TYPES.has(signedBlockPhase(block))
}

export function isInternalChatPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  const candidates = [
    payload,
    payload.message,
    payload.partial,
    payload.item,
    payload.data,
    payload.data?.message,
    payload.data?.partial,
    payload.data?.item,
  ]
  return candidates.some(value => hasInternalFlag(value) || hasInternalLane(value) || hasOnlyInternalSignedText(value))
}
