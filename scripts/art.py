"""Draws the app icons and the link-preview card in the site's look.

Run by .github/workflows/art.yml, which downloads the Barlow fonts first.
Locally it falls back to DejaVu so the layout can be checked:  python3 scripts/art.py
Writes icons/*.png and og.png at the repo root.
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.environ.get('FONT_DIR', '/tmp/fonts')
CHARCOAL, MAROON, WHITE, MUTED, ROSE = '#1F2329', '#8C1D2F', '#FFFFFF', '#AEB6C4', '#E0707F'


def font(name, size, fallback):
    for path in (os.path.join(FONTS, name), fallback):
        if path and os.path.exists(path):
            return ImageFont.truetype(path, size)
    sys.exit(f'missing font {name}')


DJV = '/usr/share/fonts/truetype/dejavu/'
DISPLAY = lambda s: font('BarlowCondensed-ExtraBoldItalic.ttf', s, DJV + 'DejaVuSansCondensed-BoldOblique.ttf')
BODY = lambda s: font('Barlow-Medium.ttf', s, DJV + 'DejaVuSans.ttf')


def badge(draw, x, y, w, h, text, size, fill=MAROON, ink=WHITE):
    """The site's slanted ACE badge: a parallelogram with the right edge cut back, text centred in it."""
    cut = int(h * 0.30)
    draw.polygon([(x, y), (x + w, y), (x + w - cut, y + h), (x, y + h)], fill=fill)
    f = DISPLAY(size)
    l, t, r, b = draw.textbbox((0, 0), text, font=f)
    while r - l > (w - cut) * 0.86 and size > 8:   # shrink longer text to fit the badge
        size -= 2
        f = DISPLAY(size)
        l, t, r, b = draw.textbbox((0, 0), text, font=f)
    draw.text((x + (w - cut * 0.6 - (r - l)) / 2 - l, y + (h - (b - t)) / 2 - t), text, font=f, fill=ink)


def icon(size, pad=0.0):
    """Square app icon. pad shrinks the badge so it stays inside the safe zone of masked (rounded) icons."""
    im = Image.new('RGB', (size, size), CHARCOAL)
    d = ImageDraw.Draw(im)
    inner = size * (1 - 2 * pad)
    w, h = inner * 0.80, inner * 0.40
    x, y = (size - w) / 2 + inner * 0.03, (size - h) / 2
    badge(d, x, y, w, h, 'A.L.L.', int(h * 0.80))
    # thin maroon rule along the bottom, like the site's header
    d.rectangle([0, size - max(2, size // 32), size, size], fill=MAROON)
    return im


def og():
    W, H = 1200, 630
    im = Image.new('RGB', (W, H), CHARCOAL)
    d = ImageDraw.Draw(im)
    d.rectangle([0, H - 64, W, H], fill=MAROON)
    badge(d, 80, 150, 250, 116, 'ACE', 96)
    d.text((350, 140), 'LINEUP LAB', font=DISPLAY(124), fill=WHITE)
    d.text((84, 320), 'Weekly fantasy football projections,', font=BODY(46), fill=WHITE)
    d.text((84, 378), 'start / sit calls, and waiver pickups.', font=BODY(46), fill=WHITE)
    d.text((84, 470), 'ESPN · SLEEPER · CBS · FANTASYPROS · OUR MODEL', font=DISPLAY(34), fill=ROSE)
    d.text((84, H - 50), 'PPR · HALF-PPR · STANDARD', font=DISPLAY(30), fill=WHITE)
    return im


def main():
    out = os.path.join(ROOT, 'icons')
    os.makedirs(out, exist_ok=True)
    icon(512).save(os.path.join(out, 'icon-512.png'), optimize=True)
    icon(192).save(os.path.join(out, 'icon-192.png'), optimize=True)
    icon(512, pad=0.10).save(os.path.join(out, 'maskable-512.png'), optimize=True)
    icon(180).save(os.path.join(out, 'apple-touch-icon.png'), optimize=True)
    icon(64).save(os.path.join(out, 'favicon-64.png'), optimize=True)
    og().save(os.path.join(ROOT, 'og.png'), optimize=True)
    print('wrote icons/ and og.png')


if __name__ == '__main__':
    main()
