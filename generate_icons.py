#!/usr/bin/env python3
"""
Generates icon.png (1024x1024), adaptive-icon.png (1024x1024),
and splash.png (1284x2778) for WeatherAtMyLocation.
Run once: python3 generate_icons.py
Requires: pip install Pillow
"""
from PIL import Image, ImageDraw, ImageFont
import math, os

ASSETS = os.path.join(os.path.dirname(__file__), 'assets')
os.makedirs(ASSETS, exist_ok=True)

BG      = (10, 22, 40)       # --sky-deep
TEAL    = (0, 201, 177)      # --aurora-1
PURPLE  = (123, 95, 224)     # --aurora-2

# ── helper: radial glow ──────────────────────────────────────────────
def radial_glow(draw, cx, cy, r, color, steps=40):
    for i in range(steps, 0, -1):
        alpha = int(80 * (i / steps) ** 2)
        rad = int(r * i / steps)
        rgba = color + (alpha,)
        draw.ellipse([cx-rad, cy-rad, cx+rad, cy+rad], fill=rgba)

# ── ICON (1024×1024) ─────────────────────────────────────────────────
def make_icon(size=1024, path='assets/icon.png'):
    img = Image.new('RGBA', (size, size), BG + (255,))
    overlay = Image.new('RGBA', (size, size), (0,0,0,0))
    draw = ImageDraw.Draw(overlay)

    cx, cy = size//2, size//2

    # Subtle glow blobs
    radial_glow(draw, int(cx*1.3), int(cy*0.5), size//3, TEAL)
    radial_glow(draw, int(cx*0.4), int(cy*1.4), size//4, PURPLE)

    img = Image.alpha_composite(img, overlay)
    draw2 = ImageDraw.Draw(img)

    # Sun circle
    sun_r = size // 5
    sun_cx, sun_cy = cx, int(cy * 0.82)
    draw2.ellipse(
        [sun_cx - sun_r, sun_cy - sun_r, sun_cx + sun_r, sun_cy + sun_r],
        fill=TEAL + (230,)
    )
    # Inner highlight
    hi = sun_r // 3
    draw2.ellipse(
        [sun_cx - hi, sun_cy - hi - sun_r//6, sun_cx + hi, sun_cy + hi - sun_r//6],
        fill=(180, 255, 245, 120)
    )

    # Cloud shape (two overlapping ellipses)
    cloud_y = int(cy * 1.08)
    cloud_color = (230, 240, 255, 220)
    draw2.ellipse([cx - size//5, cloud_y - size//12,
                   cx + size//8, cloud_y + size//10], fill=cloud_color)
    draw2.ellipse([cx - size//9, cloud_y - size//8,
                   cx + size//4, cloud_y + size//10], fill=cloud_color)
    draw2.ellipse([cx - size//14, cloud_y - size//6,
                   cx + size//5, cloud_y + size//12], fill=cloud_color)

    # Round corners mask
    mask = Image.new('L', (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    r = size // 5
    mask_draw.rounded_rectangle([0, 0, size, size], radius=r, fill=255)
    img.putalpha(mask)

    img.save(path)
    print(f'  ✓ {path}')

# ── ADAPTIVE ICON (1024×1024, no rounding — Android applies its own mask) ──
def make_adaptive(size=1024, path='assets/adaptive-icon.png'):
    img = Image.new('RGBA', (size, size), BG + (255,))
    overlay = Image.new('RGBA', (size, size), (0,0,0,0))
    draw = ImageDraw.Draw(overlay)
    cx, cy = size//2, size//2
    radial_glow(draw, int(cx*1.3), int(cy*0.5), size//3, TEAL)
    radial_glow(draw, int(cx*0.4), int(cy*1.4), size//4, PURPLE)
    img = Image.alpha_composite(img, overlay)
    draw2 = ImageDraw.Draw(img)

    sun_r = size // 5
    sun_cx, sun_cy = cx, int(cy * 0.82)
    draw2.ellipse([sun_cx-sun_r, sun_cy-sun_r, sun_cx+sun_r, sun_cy+sun_r], fill=TEAL+(230,))
    hi = sun_r // 3
    draw2.ellipse([sun_cx-hi, sun_cy-hi-sun_r//6, sun_cx+hi, sun_cy+hi-sun_r//6], fill=(180,255,245,120))

    cloud_y = int(cy * 1.08)
    cloud_color = (230, 240, 255, 220)
    draw2.ellipse([cx-size//5, cloud_y-size//12, cx+size//8, cloud_y+size//10], fill=cloud_color)
    draw2.ellipse([cx-size//9, cloud_y-size//8, cx+size//4, cloud_y+size//10], fill=cloud_color)
    draw2.ellipse([cx-size//14, cloud_y-size//6, cx+size//5, cloud_y+size//12], fill=cloud_color)

    img.save(path)
    print(f'  ✓ {path}')

# ── SPLASH (1284×2778) ────────────────────────────────────────────────
def make_splash(w=1284, h=2778, path='assets/splash.png'):
    img = Image.new('RGBA', (w, h), BG + (255,))
    overlay = Image.new('RGBA', (w, h), (0,0,0,0))
    draw = ImageDraw.Draw(overlay)
    cx, cy = w//2, h//2
    radial_glow(draw, int(w*0.75), int(h*0.28), w//2, TEAL, steps=60)
    radial_glow(draw, int(w*0.2), int(h*0.72), w//3, PURPLE, steps=50)
    img = Image.alpha_composite(img, overlay)
    draw2 = ImageDraw.Draw(img)

    # Centred sun + cloud
    sun_r = w // 6
    sun_cx, sun_cy = cx, int(cy * 0.88)
    draw2.ellipse([sun_cx-sun_r, sun_cy-sun_r, sun_cx+sun_r, sun_cy+sun_r], fill=TEAL+(220,))
    hi = sun_r//3
    draw2.ellipse([sun_cx-hi, sun_cy-hi-sun_r//5, sun_cx+hi, sun_cy+hi-sun_r//5], fill=(180,255,245,100))

    cloud_y = int(cy * 1.04)
    cc = (230, 240, 255, 210)
    draw2.ellipse([cx-w//4, cloud_y-h//28, cx+w//10, cloud_y+h//28], fill=cc)
    draw2.ellipse([cx-w//10, cloud_y-h//20, cx+w//5, cloud_y+h//28], fill=cc)
    draw2.ellipse([cx-w//14, cloud_y-h//18, cx+w//6, cloud_y+h//30], fill=cc)

    img.save(path)
    print(f'  ✓ {path}')

if __name__ == '__main__':
    print('Generating icons...')
    make_icon()
    make_adaptive()
    make_splash()
    print('Done.')
