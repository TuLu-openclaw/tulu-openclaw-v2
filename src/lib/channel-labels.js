import { t } from './i18n.js'

const CHANNEL_LABEL_KEYS = {
  qqbot: 'qqbot',
  telegram: 'telegram',
  feishu: 'feishu',
  dingtalk: 'dingtalk',
  'dingtalk-connector': 'dingtalkConnector',
  discord: 'discord',
  slack: 'slack',
  whatsapp: 'whatsapp',
  msteams: 'msteams',
  signal: 'signal',
  matrix: 'matrix',
  irc: 'irc',
  googlechat: 'googlechat',
  imessage: 'imessage',
  line: 'line',
  nostr: 'nostr',
  mattermost: 'mattermost',
  'openclaw-weixin': 'openclawWeixin',
  weixin: 'weixin',
}

export function getChannelLabel(channel) {
  const key = CHANNEL_LABEL_KEYS[channel]
  return key ? t(`channelLabels.${key}`) : (channel || '')
}

export const CHANNEL_LABELS = new Proxy({}, {
  get(_target, prop) {
    return typeof prop === 'string' ? getChannelLabel(prop) : undefined
  },
})
