import {
  AUTH_OAUTH_DEVICE,
  AUTH_OAUTH_EXTERNAL,
  groupProviders,
} from './providers.js'

export function oauthProviders(list) {
  return groupProviders(list).oauth
}

export function oauthProviderStatus(provider, hermesInfo = {}) {
  const configured = String(hermesInfo.configuredProvider || hermesInfo.provider || '').toLowerCase()
  const id = String(provider?.id || '').toLowerCase()
  return {
    providerId: provider?.id || '',
    selected: Boolean(id && configured === id),
    authType: provider?.authType || '',
    command: provider?.cliAuthHint || '',
    model: hermesInfo.model || '',
    providerConfigured: Boolean(hermesInfo.providerConfigured),
  }
}

export function defaultOauthModel(provider) {
  return Array.isArray(provider?.models) && provider.models.length ? provider.models[0] : ''
}

export function canConfigureOauth(provider, model) {
  return Boolean(
    provider &&
    (provider.authType === AUTH_OAUTH_DEVICE || provider.authType === AUTH_OAUTH_EXTERNAL) &&
    String(model || '').trim()
  )
}

export function oauthAuthLabel(authType) {
  if (authType === AUTH_OAUTH_DEVICE) return 'Device code'
  if (authType === AUTH_OAUTH_EXTERNAL) return 'External OAuth'
  return 'OAuth'
}
