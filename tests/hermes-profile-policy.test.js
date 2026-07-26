import test from 'node:test'
import assert from 'node:assert/strict'

import { cloneSourceOptions, profileActions, validateProfileName } from '../src/engines/hermes/lib/profile-policy.js'

test('profile names follow the Hermes 1-64 character contract', () => {
  for (const name of ['a', 'coding', 'work_2', '3-test', 'a'.repeat(64)]) {
    assert.deepEqual(validateProfileName(name), { valid: true, value: name, reason: '' })
  }
  for (const name of ['', '-bad', '_bad', 'Upper', 'has space', 'a'.repeat(65)]) {
    assert.equal(validateProfileName(name).valid, false, name)
  }
  assert.equal(validateProfileName('  coding  ').value, 'coding')
})

test('default and active profiles cannot be renamed or deleted', () => {
  assert.deepEqual(profileActions({ name: 'default' }, 'default'), {
    canActivate: false,
    canRename: false,
    canDelete: false,
    isDefault: true,
    isActive: true,
  })
  assert.equal(profileActions({ name: 'work' }, 'work').canDelete, false)
  assert.equal(profileActions({ name: 'work' }, 'default').canDelete, true)
})

test('clone source options contain fresh mode and only valid profiles', () => {
  assert.deepEqual(cloneSourceOptions([{ name: 'default' }, { name: 'work' }, { name: '../bad' }]), [
    { value: '', labelKey: 'profilesCreateFresh' },
    { value: 'default', label: 'default' },
    { value: 'work', label: 'work' },
  ])
})
