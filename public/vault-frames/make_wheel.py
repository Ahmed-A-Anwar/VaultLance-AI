# make_wheel.py   pip install pillow
from PIL import Image, ImageDraw, ImageFilter
import os

SRC = r"C:\Users\pc\Desktop\Vaultpay ai\public\vault-frames\f_001.webp"
OUT = r"C:\Users\pc\Desktop\Vaultpay ai\public\vault-frames\wheel"
HUB = (1028, 537)   # wheel centre in the 1920x1080 frame (agent measured)
R = 68              # crop radius, tune if a disc edge shows
FEATHER = 6
FRAMES = 72         # 2.4 s at 30 fps
ANGLE = 60          # six spokes: last frame matches first

os.makedirs(OUT, exist_ok=True)
base = Image.open(SRC).convert("RGB")
box = (HUB[0]-R, HUB[1]-R, HUB[0]+R, HUB[1]+R)
crop = base.crop(box)

mask = Image.new("L", (2*R, 2*R), 0)
ImageDraw.Draw(mask).ellipse((FEATHER, FEATHER, 2*R-FEATHER, 2*R-FEATHER), fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(FEATHER / 2))

def ease(t):
    return t * t * (3 - 2 * t)

for i in range(FRAMES):
    t = i / (FRAMES - 1)
    rot = crop.rotate(-ANGLE * ease(t), resample=Image.BICUBIC)  # negative = clockwise
    frame = base.copy()
    frame.paste(rot, box[:2], mask)
    frame.save(f"{OUT}/w_{i+1:03d}.webp", quality=90)