from PIL import Image
from pathlib import Path
import sys, math
src = Path(sys.argv[1])
out = Path(sys.argv[2])
img = Image.open(src).convert('RGBA')
w,h = img.size
pix = img.load()
# Chroma-key green screen. Preserve subject edges with soft alpha.
for y in range(h):
    for x in range(w):
        r,g,b,a = pix[x,y]
        # green dominance score; generated bg is not pure 00ff00 but strongly green
        green_score = g - max(r,b)
        if g > 105 and green_score > 30:
            # stronger green => more transparent; soft edge for hair
            t = min(1.0, max(0.0, (green_score - 30) / 95))
            # avoid removing cyan necklace: require green not too blue/cyan and saturation bg-like
            if not (b > 95 and abs(g-b) < 75 and r < 80):
                na = int(a * (1.0 - t))
                if na < 22: na = 0
                pix[x,y] = (r,g,b,na)
# Clean green spill on remaining edge pixels
for y in range(h):
    for x in range(w):
        r,g,b,a = pix[x,y]
        if a and g > r + 20 and g > b + 15:
            g2 = int((r + b) / 2 + 18)
            pix[x,y] = (r, min(g, g2), b, a)
# Crop transparent margin and add padding
bbox = img.getbbox()
if bbox:
    img = img.crop(bbox)
pad = 28
canvas = Image.new('RGBA', (img.width + pad*2, img.height + pad*2), (0,0,0,0))
canvas.alpha_composite(img, (pad,pad))
canvas.save(out)
print('WROTE', out, canvas.size)
