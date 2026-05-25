from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
import math, subprocess, shutil

ROOT = Path(r'C:/Users/User/tulu-openclaw-v2')
SRC = ROOT / 'public/digital-human/states/transparent/openclaw-avatar-waiting-clean.png'
OUT = ROOT / 'public/digital-human/video'
TMP = ROOT / 'public/digital-human/video/_frames'
OUT.mkdir(parents=True, exist_ok=True)
TMP.mkdir(parents=True, exist_ok=True)

W, H = 540, 760
FPS = 24
DUR = 4
N = FPS * DUR

STATES = {
    'waiting':   dict(color=(56, 189, 248), accent=(168, 85, 247), amp=5, zoom=.018, mood='calm'),
    'idle':      dict(color=(56, 189, 248), accent=(168, 85, 247), amp=5, zoom=.018, mood='calm'),
    'queued':    dict(color=(34, 197, 94), accent=(56, 189, 248), amp=4, zoom=.014, mood='ready'),
    'sending':   dict(color=(59, 130, 246), accent=(34, 197, 94), amp=5, zoom=.016, mood='receive'),
    'thinking':  dict(color=(168, 85, 247), accent=(56, 189, 248), amp=7, zoom=.026, mood='focus'),
    'tool':      dict(color=(34, 197, 94), accent=(250, 204, 21), amp=8, zoom=.030, mood='work'),
    'streaming': dict(color=(244, 114, 182), accent=(56, 189, 248), amp=9, zoom=.034, mood='speak'),
    'finalizing':dict(color=(99, 102, 241), accent=(34, 197, 94), amp=5, zoom=.020, mood='check'),
    'done':      dict(color=(134, 239, 172), accent=(56, 189, 248), amp=4, zoom=.018, mood='happy'),
    'error':     dict(color=(248, 113, 113), accent=(251, 146, 60), amp=3, zoom=.010, mood='warn'),
    'aborted':   dict(color=(148, 163, 184), accent=(96, 165, 250), amp=3, zoom=.010, mood='pause'),
}

def rgba(c, a): return (*c, a)

def make_bg(t, cfg):
    bg = Image.new('RGBA', (W, H), (5, 9, 20, 255))
    px = bg.load()
    c1, c2 = cfg['color'], cfg['accent']
    for y in range(H):
        yy = y / H
        for x in range(W):
            xx = x / W
            glow = max(0, 1 - math.hypot(xx-.52, yy-.45)*1.45)
            wave = (math.sin((xx*5 + yy*3 + t*2)*math.pi) + 1) / 2
            r = int(7 + c1[0]*glow*.20 + c2[0]*wave*.035)
            g = int(12 + c1[1]*glow*.20 + c2[1]*wave*.035)
            b = int(25 + c1[2]*glow*.22 + c2[2]*wave*.045)
            px[x,y] = (min(255,r), min(255,g), min(255,b), 255)
    return bg

def draw_hud(draw, t, cfg):
    c1, c2 = cfg['color'], cfg['accent']
    cx, cy = W//2, int(H*.46)
    for i, rad in enumerate([145, 188, 232]):
        phase = (t*80 + i*65) % 360
        bbox = (cx-rad, cy-rad, cx+rad, cy+rad)
        draw.arc(bbox, phase, phase+82+i*18, fill=rgba(c1, 95-i*20), width=2)
        draw.arc(bbox, phase+180, phase+238, fill=rgba(c2, 70-i*16), width=1)
    # floating particles
    for i in range(22):
        a = i * 1.618 + t * (0.5 + i%3*.13)
        rr = 95 + (i*17 % 180)
        x = cx + math.cos(a)*rr + math.sin(t*4+i)*10
        y = cy + math.sin(a*0.72)*rr*.72 + math.cos(t*3+i)*8
        size = 1 + (i % 3)
        col = c1 if i % 2 else c2
        draw.ellipse((x-size, y-size, x+size, y+size), fill=rgba(col, 90))
    # bottom smart panel glow, no text
    draw.rounded_rectangle((46, H-112, W-46, H-36), radius=24, fill=(4,10,24,150), outline=rgba(c1, 80), width=1)
    for i in range(5):
        x = 76 + i*78
        draw.rounded_rectangle((x, H-80, x+42+(i%2)*22, H-72), radius=4, fill=rgba(c1 if i%2 else c2, 110))

def state_overlay(frame, t, cfg):
    ov = Image.new('RGBA', (W,H), (0,0,0,0))
    d = ImageDraw.Draw(ov)
    c1, c2 = cfg['color'], cfg['accent']
    mood = cfg['mood']
    if mood == 'work':
        for i in range(4):
            y = 110 + i*28 + math.sin(t*5+i)*6
            d.line((78,y,W-78,y+math.sin(t*8+i)*10), fill=rgba(c1,70), width=2)
    elif mood == 'speak':
        for i in range(5):
            amp = 12 + i*7
            x = W//2 + (i-2)*22
            d.arc((x-amp, 110-amp, x+amp, 110+amp), 200, 340, fill=rgba(c2,90), width=2)
    elif mood == 'focus':
        for i in range(3):
            r = 54+i*26+math.sin(t*math.pi*2+i)*5
            d.ellipse((W//2-r, 122-r, W//2+r, 122+r), outline=rgba(c1,75), width=2)
    elif mood == 'warn':
        d.polygon([(W//2,70),(W//2-38,136),(W//2+38,136)], outline=rgba(c1,110), fill=(80,20,20,35))
    elif mood == 'happy':
        for i in range(8):
            x = 90 + i*45
            y = 88 + math.sin(t*6+i)*12
            d.line((x,y,x+10,y+18), fill=rgba(c1,95), width=2)
    return Image.alpha_composite(frame, ov.filter(ImageFilter.GaussianBlur(.25)))

avatar = Image.open(SRC).convert('RGBA')
# crop transparent bounds to make figure bigger
bbox = avatar.getbbox()
avatar = avatar.crop(bbox)
base_h = 575
base_w = int(avatar.width * base_h / avatar.height)
avatar = avatar.resize((base_w, base_h), Image.Resampling.LANCZOS)

ffmpeg = shutil.which('ffmpeg') or r'C:/Users/User/AppData/Local/Microsoft/WinGet/Packages/yt-dlp.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-N-124279-g0f6ba39122-winarm64-gpl/bin/ffmpeg.exe'

for state, cfg in STATES.items():
    state_dir = TMP / state
    if state_dir.exists(): shutil.rmtree(state_dir)
    state_dir.mkdir(parents=True)
    for i in range(N):
        t = i / FPS
        frame = make_bg(t, cfg)
        d = ImageDraw.Draw(frame)
        draw_hud(d, t, cfg)
        # character motion: full-body bob/lean so no tearing
        phase = math.sin(t * math.pi * 2 / DUR)
        bob = phase * cfg['amp']
        zoom = 1 + cfg['zoom'] * (0.5 + 0.5*phase)
        lean = math.sin(t * math.pi * 4 / DUR) * (1.1 if state in ['thinking','tool','streaming'] else .45)
        char = avatar.resize((int(base_w*zoom), int(base_h*zoom)), Image.Resampling.LANCZOS)
        # state-specific color polish
        if state == 'error':
            char = ImageEnhance.Color(char).enhance(.82)
            char = ImageEnhance.Brightness(char).enhance(.92)
        elif state in ['done','streaming']:
            char = ImageEnhance.Color(char).enhance(1.08)
            char = ImageEnhance.Brightness(char).enhance(1.03)
        char = char.rotate(lean, resample=Image.Resampling.BICUBIC, expand=True)
        shadow = Image.new('RGBA', char.size, (0,0,0,0))
        shadow.alpha_composite(char)
        shadow = shadow.filter(ImageFilter.GaussianBlur(18))
        # tint shadow/aura
        aura = Image.new('RGBA', shadow.size, rgba(cfg['color'], 70))
        aura.putalpha(shadow.getchannel('A').point(lambda a: int(a*.28)))
        x = (W - char.width)//2
        y = int(H - char.height - 16 + bob)
        frame.alpha_composite(aura, (x, y))
        frame.alpha_composite(char, (x, y))
        frame = state_overlay(frame, t, cfg)
        frame.convert('RGB').save(state_dir / f'{i:04d}.jpg', quality=92)
    out = OUT / f'{state}.mp4'
    cmd = [ffmpeg, '-y', '-framerate', str(FPS), '-i', str(state_dir/'%04d.jpg'), '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'fast', '-crf', '21', '-movflags', '+faststart', str(out)]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print('WROTE', out)
print('done')
