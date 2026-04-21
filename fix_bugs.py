import re

path = r'C:\Users\User\.openclaw\.openclaw\workspace\tulu-v2\src\pages\movie-tool.js'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

# Fix 1: openResumePlayer else block (add braces)
old1 = '''    if (isM3u8 || isMp4) loadVideoPlayer(epUrl, isM3u8, progress, [])
    else // URL 格式校验
        var safeEpUrl = epUrl && /^https?:\/\//i.test(epUrl) ? epUrl : '';
        body.innerHTML = '<div class="tvbox-iframe-wrap"><iframe src="' + safeEpUrl + '" allowfullscreen allow="autoplay; fullscreen" style="width:100%;height:100%;border:none"></iframe></div>'
  }'''

new1 = '''    if (isM3u8 || isMp4) {
      loadVideoPlayer(epUrl, isM3u8, progress, [])
    } else {
        var safeEpUrl = epUrl && /^https?:\/\//i.test(epUrl) ? epUrl : '';
        body.innerHTML = '<div class="tvbox-iframe-wrap"><iframe src="' + safeEpUrl + '" allowfullscreen allow="autoplay; fullscreen" style="width:100%;height:100%;border:none"></iframe></div>'
    }
  }'''

if old1 in c:
    c = c.replace(old1, new1)
    print('Fix1: APPLIED')
else:
    print('Fix1: NOT FOUND')
    idx = c.find('if (isM3u8 || isMp4) loadVideoPlayer(epUrl, isM3u8, progress, [])')
    if idx != -1:
        print('Found at', idx)
        print(repr(c[idx:idx+400]))

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)