import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const rust = fs.readFileSync(new URL('../src-tauri/src/commands/portable.rs', import.meta.url), 'utf8')
const lib = fs.readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8')
const productionRust = rust.split('#[cfg(test)]')[0]

test('portable migration exposure is read-only and registered as preflight only', () => {
  assert.match(lib, /commands::portable::preflight_portable_migration/)
  assert.doesNotMatch(lib, /portable::(?:migrate|execute|apply)_portable/)
  assert.match(rust, /"readOnly": true/)
  assert.match(rust, /"freeSpaceVerified": false/)
})

test('portable preflight rejects overlap, links, and occupied targets', () => {
  assert.match(rust, /reject_overlap\(target, source/)
  assert.match(rust, /symlink_metadata/)
  assert.match(rust, /FILE_ATTRIBUTE_REPARSE_POINT/)
  assert.match(rust, /reject_link_ancestors\(target/)
  assert.match(rust, /clean_path\(path\)/)
  assert.match(rust, /directory_has_entries\(target\)/)
  assert.doesNotMatch(productionRust, /fs::(?:copy|rename|remove_file|remove_dir_all)\(/)
})
