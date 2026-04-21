import re, os

path = r'C:\Users\User\.openclaw\.openclaw\workspace\tulu-v2\src\pages\movie-tool.js'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

# Fix 2: openFloatPlayer - add resize handle
old2 = '''  function toggleFloatMin() {
    if (!_floatState) return
    _floatState.minimized = !_floatState.minimized
    _floatState.wrap.classList.toggle('minimized', _floatState.minimized)
    _floatState.wrap.querySelector('#_fmin').textContent = _floatState.minimized ? '□' : '─'
  }

  function toggleFloatPin() {
    if (!_floatState) return
    _floatState.pinned = !_floatState.pinned
    _floatState.wrap.classList.toggle('pinned', _floatState.pinned)
    _floatState.wrap.style.zIndex = _floatState.pinned ? '9999999' : '99999'
    _floatState.wrap.querySelector('#_fpin').classList.toggle('pin-on', _floatState.pinned)
  }

  let _floatDrag = null'''

new2 = '''  function toggleFloatMin() {
    if (!_floatState) return
    _floatState.minimized = !_floatState.minimized
    _floatState.wrap.classList.toggle('minimized', _floatState.minimized)
    _floatState.wrap.querySelector('#_fmin').textContent = _floatState.minimized ? '□' : '─'
  }

  function toggleFloatPin() {
    if (!_floatState) return
    _floatState.pinned = !_floatState.pinned
    _floatState.wrap.classList.toggle('pinned', _floatState.pinned)
    _floatState.wrap.style.zIndex = _floatState.pinned ? '9999999' : '99999'
    _floatState.wrap.querySelector('#_fpin').classList.toggle('pin-on', _floatState.pinned)
  }

  // 拖拽
  let _floatDrag = null'''

if old2 in c:
    c = c.replace(old2, new2)
    print('Fix2: APPLIED')
else:
    print('Fix2: NOT FOUND')

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('Done with Fix2')