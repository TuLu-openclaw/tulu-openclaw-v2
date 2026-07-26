const PREVIEW_MARKERS = /(?:alpha|beta|canary|nightly|rc|dev|next|preview)/i

export function isPreviewVersion(version) {
  return PREVIEW_MARKERS.test(String(version || ''))
}

export function parseOpenClawVersion(version) {
  const text = String(version || '').replace(/^v/i, '')
  const match = text.match(/^(\d+(?:\.\d+)*)(.*)$/)
  const baseVersion = match?.[1] || '0'
  const numbers = baseVersion.split('.').map(Number)
  const suffix = match?.[2] || ''
  const suffixNumbers = suffix.match(/\d+/g)?.map(Number) || []
  const channel = suffix.match(/(?:^|-)(alpha|beta|canary|nightly|rc|dev|next|preview)(?:\.|-|$)/i)?.[1]?.toLowerCase() || 'stable'
  const republish = Number(suffix.match(/^-(\d+)(?:-|$)/)?.[1] || 0)
  const chineseRevision = Number(suffix.match(/-zh\.(\d+)(?:-|$)/i)?.[1] || 0)
  return { version: text, baseVersion, numbers, suffix, suffixNumbers, channel, republish, chineseRevision }
}

export function compareOpenClawVersions(left, right) {
  const a = parseOpenClawVersion(left)
  const b = parseOpenClawVersion(right)
  for (let i = 0; i < Math.max(a.numbers.length, b.numbers.length); i += 1) {
    const diff = (a.numbers[i] || 0) - (b.numbers[i] || 0)
    if (diff) return diff
  }
  const aPreview = isPreviewVersion(left)
  const bPreview = isPreviewVersion(right)
  if (aPreview !== bPreview) return aPreview ? -1 : 1
  for (let i = 0; i < Math.max(a.suffixNumbers.length, b.suffixNumbers.length); i += 1) {
    const diff = (a.suffixNumbers[i] || 0) - (b.suffixNumbers[i] || 0)
    if (diff) return diff
  }
  return String(left).localeCompare(String(right))
}

export function classifyOpenClawVersions(allVersions, recommended) {
  const unique = [...new Set((Array.isArray(allVersions) ? allVersions : []).filter(Boolean))]
  const sorted = unique.sort((a, b) => compareOpenClawVersions(b, a))
  const stable = sorted.filter(version => !isPreviewVersion(version))
  const preview = sorted.filter(isPreviewVersion)
  const latestStable = stable[0] || ''
  const recommendedVersion = recommended && unique.includes(recommended) ? recommended : (recommended || '')
  return { all: sorted, stable, preview, latestStable, recommended: recommendedVersion }
}

export function versionKinds(version, { recommended = '', latestStable = '' } = {}) {
  const kinds = []
  if (version === recommended) kinds.push('recommended')
  if (version === latestStable) kinds.push('latest')
  if (isPreviewVersion(version)) kinds.push('preview')
  if (!kinds.length) kinds.push('stable')
  return kinds
}

export function versionKind(version, context = {}) {
  return versionKinds(version, context)[0]
}

export function versionSuffixHint(version) {
  const parsed = parseOpenClawVersion(version)
  const hints = []
  if (parsed.republish) hints.push(`republish:${parsed.republish}`)
  if (parsed.chineseRevision) hints.push(`chinese-revision:${parsed.chineseRevision}`)
  return hints
}
