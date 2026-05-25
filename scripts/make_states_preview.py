from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
files = [
 ('待机 waiting','openclaw-avatar-waiting-transparent.png'),
 ('思考 thinking','openclaw-avatar-thinking-transparent.png'),
 ('工具 tool','openclaw-avatar-tool-transparent.png'),
 ('输出 streaming','openclaw-avatar-streaming-transparent.png'),
 ('完成 done','openclaw-avatar-done-transparent.png'),
 ('错误 error','openclaw-avatar-error-transparent.png'),
]
base=Path('public/digital-human/states/transparent')
thumbs=[]
for label,name in files:
    img=Image.open(base/name).convert('RGBA')
    img.thumbnail((220,360), Image.LANCZOS)
    canvas=Image.new('RGBA',(240,410),(20,24,36,255))
    canvas.alpha_composite(img, ((240-img.width)//2, 20))
    d=ImageDraw.Draw(canvas)
    d.text((12,378), label, fill=(240,248,255,255))
    thumbs.append(canvas.convert('RGB'))
out=Image.new('RGB',(240*3,410*2),(8,12,20))
for i,t in enumerate(thumbs): out.paste(t, ((i%3)*240, (i//3)*410))
out.save('digital-human-states-preview.jpg', quality=92)
out.save('C:/Users/User/Desktop/OpenClaw数字人六状态预览.jpg', quality=92)
print('WROTE digital-human-states-preview.jpg')
