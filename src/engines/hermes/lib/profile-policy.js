const PROFILE_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/

export function validateProfileName(name) {
  const value = String(name || '').trim()
  if (!PROFILE_NAME_PATTERN.test(value)) {
    return { valid: false, value, reason: 'format' }
  }
  return { valid: true, value, reason: '' }
}

export function profileActions(profile, activeProfile) {
  const name = String(profile?.name || '')
  const isDefault = name === 'default'
  const isActive = name === activeProfile || profile?.active === true
  return {
    canActivate: !isActive,
    canRename: !isDefault && !isActive,
    canDelete: !isDefault && !isActive,
    isDefault,
    isActive,
  }
}

export function cloneSourceOptions(profiles) {
  return [
    { value: '', labelKey: 'profilesCreateFresh' },
    ...(Array.isArray(profiles) ? profiles : [])
      .filter(profile => validateProfileName(profile?.name).valid)
      .map(profile => ({ value: profile.name, label: profile.name })),
  ]
}
