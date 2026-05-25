from PIL import Image
from pathlib import Path
from collections import deque
import sys, math
src = Path(sys.argv[1])
out = Path(sys.argv[2])
img = Image.open(src).convert('RGBA')
w,h = img.size
pix = img.load()
# Estimate green background from borders
samples=[]
for x in range(0,w,max(1,w//80)):
    samples.append(pix[x,0][:3]); samples.append(pix[x,h-1][:3])
for y in range(0,h,max(1,h//80)):
    samples.append(pix[0,y][:3]); samples.append(pix[w-1,y][:3])
bg = tuple(sum(c[i] for c in samples)//len(samples) for i in range(3))

def color_dist(c1,c2):
    return math.sqrt(sum((c1[i]-c2[i])**2 for i in range(3)))

def is_bg(r,g,b):
    # connected border background: tolerate darker green/teal gradients, avoid skin/hair/cloth
    d = color_dist((r,g,b), bg)
    greenish = g > r * 1.12 and g > b * 1.05 and g > 55
    dark_green = g > r + 12 and g > b + 6 and g > 35 and r < 95 and b < 105
    return d < 95 or greenish or dark_green

seen = bytearray(w*h)
q = deque()
def push(x,y):
    if 0 <= x < w and 0 <= y < h:
        i=y*w+x
        if not seen[i]:
            seen[i]=1; q.append((x,y))
for x in range(w): push(x,0); push(x,h-1)
for y in range(h): push(0,y); push(w-1,y)

while q:
    x,y=q.popleft()
    r,g,b,a=pix[x,y]
    if not is_bg(r,g,b):
        continue
    # Soft edge based on distance from bg and green dominance
    d = color_dist((r,g,b), bg)
    dominance = max(0, g - max(r,b))
    alpha = 0
    if 70 < d < 115 and dominance < 65:
        alpha = min(120, int((d-70)/45*120))
    pix[x,y] = (r,g,b,alpha)
    for nx,ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
        if 0 <= nx < w and 0 <= ny < h and not seen[ny*w+nx]:
            nr,ng,nb,na=pix[nx,ny]
            if is_bg(nr,ng,nb):
                seen[ny*w+nx]=1; q.append((nx,ny))

# Remove green spill on semi-transparent edges
for y in range(h):
    for x in range(w):
        r,g,b,a=pix[x,y]
        if a and g > r + 18 and g > b + 10:
            g = min(g, int((r+b)/2 + 16))
            pix[x,y] = (r,g,b,a)

bbox = img.getbbox()
if bbox:
    img = img.crop(bbox)
pad=28
canvas=Image.new('RGBA',(img.width+pad*2,img.height+pad*2),(0,0,0,0))
canvas.alpha_composite(img,(pad,pad))
canvas.save(out)
a = canvas.getchannel('A')
data=list(a.getdata())
print('BG', bg, 'SIZE', canvas.size, 'ALPHA', a.getextrema(), 'TRANSPARENT', sum(1 for v in data if v<10), '/', len(data), 'WROTE', out)
