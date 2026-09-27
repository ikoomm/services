"""Original 20s website-demo ad. Captured owned UI; two hook variants.
No browser automation, network, generative API, third-party music or GPU.
Python/Pillow and installed FFmpeg. Re-run: python render_ad.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import math, json, subprocess, wave, struct, time, hashlib

ROOT = Path(__file__).resolve().parent
W, H, FPS, SECONDS = 1080, 1920, 24, 20
CREAM, INK, GREEN, ORANGE = '#F6F0E4', '#18362B', '#284C39', '#BC5432'
FONT = Path('C:/Windows/Fonts')
def font(size, bold=False):
    return ImageFont.truetype(str(FONT / ('segoeuib.ttf' if bold else 'segoeui.ttf')), size)
F = {s: font(s, True) for s in [28, 32, 38, 42, 48, 58, 76, 86, 102]}
REG = font(36)
def ease(x):
    x = max(0., min(1., x)); return x*x*(3-2*x)
def center(draw, text, y, f, color):
    box = draw.textbbox((0,0), text, font=f)
    draw.text(((W-(box[2]-box[0]))/2,y),text,font=f,fill=color)

ASSETS = {}
for key in ['hero','menu','mains']:
    image = Image.open(ROOT / f'mora-mobile-{key}.png').convert('RGB')
    # Remove only browser scrollbar, never alter website content.
    image = image.crop((0,0,image.width-15,image.height))
    ASSETS[key] = image.resize((548,1236),Image.Resampling.LANCZOS)

HOOKS = {'A': ['Your menu.', 'One clear path.'], 'B': ['Less hunting.', 'More browsing.']}
def frame(t, variant):
    im = Image.new('RGB',(W,H),CREAM); d = ImageDraw.Draw(im)
    if t < 16:
        d.ellipse((780,310,1300,830),fill='#E9B98C')
        d.ellipse((-210,1100,220,1540),fill='#DFE5D2')
        d.text((72,68),'MORA TABLE',font=F[38],fill=GREEN)
        d.text((72,124),'WEBSITE DEMO / 20 SECONDS',font=F[28],fill=GREEN)
        scene = 0 if t<4 else 1 if t<9 else 2
        start = [0,4,9][scene]
        titles = HOOKS[variant] if scene==0 else (['A menu made','for mobile.'] if scene==1 else ['From category','to choice.'])
        for k,line in enumerate(titles):
            center(d,line,220+k*102,F[86],INK)
        y = int(452+28*(1-ease((t-start)/0.6)))
        x=266
        d.rounded_rectangle((x-15,y-15,x+563,y+1251),radius=49,fill=INK)
        shot = ASSETS[['hero','menu','mains'][scene]]
        mask=Image.new('L',shot.size,0); ImageDraw.Draw(mask).rounded_rectangle((0,0,547,1235),radius=34,fill=255)
        im.paste(shot,(x,y),mask)
        d=ImageDraw.Draw(im)
        d.rounded_rectangle((72,1652,1008,1730),radius=28,fill=GREEN)
        labels=['A responsive website concept','Browse categories and menu items','Clear choices. Visible prices.']
        center(d,labels[scene],1669,F[38],'#FFFFFF')
    else:
        d.rectangle((0,0,W,H),fill=GREEN)
        d.ellipse((830,-200,1320,290),fill='#44614A')
        d.text((72,90),'MORA TABLE',font=F[42],fill='#F3D98C')
        for i,line in enumerate(['Explore the','Mora Table','demo.']):
            d.text((72,370+i*130),line,font=F[102],fill=CREAM)
        d.rounded_rectangle((72,930,1008,1050),radius=28,fill='#F3D98C')
        center(d,'SEE THE LIVE WEBSITE',958,F[42],INK)
        center(d,'ikoomm.github.io/',1140,F[48],CREAM)
        center(d,'restaurant-ui-study/',1206,F[48],CREAM)
        center(d,'Real interface. Original design.',1490,F[38],CREAM)
    d=ImageDraw.Draw(im)
    footcolor=GREEN if t<16 else CREAM
    center(d,'Independent concept • No client affiliation',1780,F[28],footcolor)
    d.rectangle((0,H-8,int(W*t/SECONDS),H),fill=ORANGE)
    return im

def sound():
    # Original soft tonal cues: no samples, songs or speech.
    rate=48000
    with wave.open(str(ROOT/'original-sound.wav'),'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        events=[(0.2,261.63),(4.05,329.63),(9.05,392.0),(16.05,523.25)]
        for i in range(rate*SECONDS):
            t=i/rate; v=0.
            for start,freq in events:
                u=t-start
                if 0<=u<1.5:
                    env=min(1.,u/.08)*math.exp(-3*u)
                    v+=0.09*env*(math.sin(2*math.pi*freq*u)+.3*math.sin(2*math.pi*2*freq*u))
            w.writeframesraw(struct.pack('<h',int(max(-1,min(1,v))*32767)))

def encode(variant):
    target=ROOT/f'mora-product-ad-hook-{variant}.mp4'
    command=['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','pipe:0','-i',str(ROOT/'original-sound.wav'),'-c:v','libx264','-threads','2','-preset','fast','-crf','21','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-t',str(SECONDS),'-movflags','+faststart',str(target)]
    with subprocess.Popen(command,stdin=subprocess.PIPE,stderr=subprocess.PIPE) as p:
        for n in range(FPS*SECONDS):
            p.stdin.write(frame(n/FPS,variant).tobytes())
        p.stdin.close(); error=p.stderr.read().decode(); code=p.wait()
    if code: raise RuntimeError(error)
    return target

def main():
    started=time.time(); sound(); products=[]
    for variant in HOOKS:
        target=encode(variant)
        probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(target)]))
        subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(target),'-f','null','-'],check=True,stderr=subprocess.PIPE)
        products.append({'file':target.name,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'probe':probe,'full_decode':'PASS'})
    (ROOT/'export-verification.json').write_text(json.dumps({'render_seconds':round(time.time()-started,2),'new_cash_cost_usd':0,'gpu_used':False,'cpu_threads':2,'variants':products,'unverified':'Full-speed human playback and subjective audio quality not claimed'},indent=2),encoding='utf-8')
    # Review stills extracted from actual encoded output, not only source frames.
    cards=[]
    for index,t in enumerate([1,4.7,9.7,16.7]):
        dest=ROOT/f'preview-{index}.png'
        subprocess.run(['ffmpeg','-y','-v','error','-ss',str(t),'-i',str(ROOT/'mora-product-ad-hook-A.mp4'),'-frames:v','1',str(dest)],check=True)
        cards.append(Image.open(dest).resize((270,480)))
    sheet=Image.new('RGB',(1080,480),'white')
    for i,card in enumerate(cards): sheet.paste(card,(i*270,0))
    sheet.save(ROOT/'contact-sheet.jpg',quality=93)
    print(json.dumps({'exports':[p['file'] for p in products],'render_seconds':round(time.time()-started,2)}))

if __name__=='__main__': main()
