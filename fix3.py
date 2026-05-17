path = r'C:\Users\User\.openclaw\.openclaw\workspace\tulu-v2\src\style\movie-tool.css'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

# Add resize handle style after .tvbox-float-wrap.minimized .tvbox-float-url-bar
old_css = '.tvbox-float-wrap.minimized .tvbox-float-url-bar { display: none; }'

new_css = '''.tvbox-float-wrap.minimized .tvbox-float-url-bar { display: none; }

/* 拖拽调整大小手柄 */
.tvbox-float-wrap::after {
  content: '';
  position: absolute;
  bottom: 0;
  right: 0;
  width: 16px;
  height: 16px;
  cursor: se-resize;
  background: linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.15) 50%);
  border-radius: 0 0 var(--radius-lg) 0;
}'''

if old_css in c:
    c = c.replace(old_css, new_css)
    print('CSS Fix: APPLIED')
else:
    print('CSS Fix: NOT FOUND')

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)