from PIL import Image
from collections import deque
from pathlib import Path
import math
src=Path('public/digital-human/openclaw-avatar-yujie-green.png')
out=Path('public/digital-human/openclaw-avatar-yujie-transparent.png')
img=Image.open(src).convert('RGBA'); w,h=img.size; pix=img.load()
samples=[]
for x in range(0,w,max(1,w//100)): samples += [pix[x,0][:3], pix[x,h-1][:3]]
for y in range(0,h,max(1,h//100)): samples += [pix[0,y][:3], pix[w-1,y][:3]]
bg=tuple(sum(c[i] for c in samples)//len(samples) for i in range(3))
def dist(c): return math.sqrt(sum((c[i]-bg[i])**2 for i in range(3)))
def is_bg(r,g,b): return dist((r,g,b))<98 or (g>r*1.12 and g>b*1.05 and g>55) or (g>r+12 and g>b+6 and g>35 and r<100 and b<110)
seen=bytearray(w*h); q=deque()
def push(x,y):
    if 0<=x<w and 0<=y<h:
        i=y*w+x
        if not seen[i]: seen[i]=1; q.append((x,y))
for x in range(w): push(x,0); push(x,h-1)
for y in range(h): push(0,y); push(w-1,y)
while q:
    x,y=q.popleft(); r,g,b,a=pix[x,y]
    if not is_bg(r,g,b): continue
    d=dist((r,g,b)); alpha=0
    if 72<d<116 and (g-max(r,b))<65: alpha=min(110,int((d-72)/44*110))
    pix[x,y]=(r,g,b,alpha)
    for nx,ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
        if 0<=nx<w and 0<=ny<h and not seen[ny*w+nx]:
            nr,ng,nb,na=pix[nx,ny]
            if is_bg(nr,ng,nb): seen[ny*w+nx]=1; q.append((nx,ny))
for y in range(h):
    for x in range(w):
        r,g,b,a=pix[x,y]
        if a and g>r+18 and g>b+10:
            pix[x,y]=(r,min(g,int((r+b)/2+15)),b,a)
bbox=img.getbbox()
if bbox: img=img.crop(bbox)
canvas=Image.new('RGBA',(img.width+56,img.height+56),(0,0,0,0)); canvas.alpha_composite(img,(28,28)); canvas.save(out)
print(out, canvas.size)
