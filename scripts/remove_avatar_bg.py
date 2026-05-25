from PIL import Image
from collections import deque
from pathlib import Path
import sys, math
src = Path(sys.argv[1])
out = Path(sys.argv[2])
img = Image.open(src).convert('RGBA')
w,h = img.size
pix = img.load()
# Estimate background from corners/edges
samples=[]
for x,y in [(0,0),(w-1,0),(0,h-1),(w-1,h-1),(w//2,0),(0,h//2),(w-1,h//2)]:
    samples.append(pix[x,y][:3])
bg = tuple(sum(c[i] for c in samples)//len(samples) for i in range(3))
# Flood-fill only background connected to canvas edges, preserving clothes/skin.
seen = bytearray(w*h)
q = deque()
def add(x,y):
    if 0 <= x < w and 0 <= y < h:
        idx=y*w+x
        if not seen[idx]:
            seen[idx]=1; q.append((x,y))
for x in range(w): add(x,0); add(x,h-1)
for y in range(h): add(0,y); add(w-1,y)
def dist(c):
    return math.sqrt(sum((c[i]-bg[i])**2 for i in range(3)))
while q:
    x,y=q.popleft(); r,g,b,a=pix[x,y]
    d=dist((r,g,b))
    # wider threshold at canvas edge, stricter inward
    if d < 42 and a > 0:
        alpha = 0 if d < 30 else int((d-30)/12*255)
        pix[x,y]=(r,g,b,alpha)
        for nx,ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if 0<=nx<w and 0<=ny<h and not seen[ny*w+nx]:
                nr,ng,nb,na=pix[nx,ny]
                if dist((nr,ng,nb)) < 45:
                    seen[ny*w+nx]=1; q.append((nx,ny))
# Crop transparent-ish margin
bbox = img.getbbox()
if bbox:
    img = img.crop(bbox)
# Add small transparent padding
pad=20
canvas=Image.new('RGBA',(img.width+pad*2,img.height+pad*2),(0,0,0,0))
canvas.alpha_composite(img,(pad,pad))
canvas.save(out)
print('BG', bg, 'WROTE', out, canvas.size)
