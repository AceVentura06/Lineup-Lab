"""Draws the app icons and the link-preview card in the site's look.

Run by .github/workflows/art.yml, which downloads the site's fonts first.
Locally it falls back to DejaVu so the layout can be checked:  python3 scripts/art.py
(or point FONT_DIR at a folder holding the .ttf files below).
Writes icons/*.png and og.png at the repo root.
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.environ.get('FONT_DIR', '/tmp/fonts')
CHARCOAL, MAROON, WHITE, MUTED, ROSE = '#1F2329', '#8C1D2F', '#FFFFFF', '#AEB6C4', '#E0707F'
ITALIC = 0.21   # the site's synthetic italic slant (font-style: italic on a font with no italic cut)


def font(name, size, fallback):
    for path in (os.path.join(FONTS, name), fallback):
        if path and os.path.exists(path):
            return ImageFont.truetype(path, size)
    sys.exit(f'missing font {name}')


DJV = '/usr/share/fonts/truetype/dejavu/'
DISPLAY = lambda s: font('SpecialGothicExpandedOne-Regular.ttf', s, DJV + 'DejaVuSans-Bold.ttf')
LABEL = lambda s: font('SpecialGothicCondensedOne-Regular.ttf', s, DJV + 'DejaVuSansCondensed-Bold.ttf')
BODY = lambda s: font('CabinCondensed-Medium.ttf', s, DJV + 'DejaVuSansCondensed.ttf')


def slanted_text(im, xy, text, f, fill):
    """Draw text with the site's synthetic italic: render upright, then shear the layer."""
    l, t, r, b = f.getbbox(text)
    h = b + 4
    extra = int(h * ITALIC) + 2
    layer = Image.new('RGBA', (r + extra + 4, h), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((extra, 0), text, font=f, fill=fill)
    # x_src = x_dst + ITALIC*(y - h): the top leans right
    layer = layer.transform(layer.size, Image.AFFINE, (1, ITALIC, -ITALIC * h, 0, 1, 0), resample=Image.BICUBIC)
    im.paste(layer, (int(xy[0] - extra), int(xy[1])), layer)


def text_box(text, f):
    l, t, r, b = f.getbbox(text)
    return l, t, r - l, b - t


def lines_width(h):
    """How far the speed lines reach left of the badge's bottom-left corner."""
    return h * 1.12


def ace_badge(im, x, y, w, h, text='ACE', lines=True):
    """The site's ACE mark: a maroon block slanted on both sides, with three speed
    lines tucked against its left edge and stepped along the same angle."""
    d = ImageDraw.Draw(im)
    lean, cut = w * 0.10, w * 0.12
    d.polygon([(x + lean, y), (x + w, y), (x + w - cut, y + h), (x, y + h)], fill=MAROON)
    if lines:
        t, g = h * 0.11, h * 0.135                       # line thickness and spacing
        slope = lean / h                                 # px of lean per px of height
        for i, (ln, col) in enumerate([(0.70, ROSE), (1.19, WHITE), (0.49, ROSE)]):
            yc = y + h / 2 + (i - 1) * (t + g)
            right = x + lean * (1 - (yc - y) / h) - h * 0.08   # small gap to the slanted edge
            L = ln * h
            yt, yb = yc - t / 2, yc + t / 2
            sh = t * slope / 2
            d.polygon([(right - L + sh, yt), (right + sh, yt), (right - sh, yb), (right - L - sh, yb)], fill=col)
    # fit and centre the text inside the block
    size = int(h * 0.80)
    while size > 6:
        f = DISPLAY(size)
        l, t0, tw, th = text_box(text, f)
        if tw + th * ITALIC <= (w - lean - cut) * 0.80 and th <= h * 0.56:
            break
        size -= 1
    cx = x + (lean + w - cut) / 2 + w * 0.01
    slanted_text(im, (cx - (tw + th * ITALIC) / 2 - l, y + (h - th) / 2 - t0), text, f, WHITE)


def icon(out, pad=0.0, ss=4):
    """Square app icon. pad shrinks the mark so it stays inside the safe zone of masked (rounded) icons.
    Drawn at ss times the size and scaled down, so the slanted edges come out smooth."""
    size = out * ss
    im = Image.new('RGB', (size, size), CHARCOAL)
    inner = size * (1 - 2 * pad)
    w, h = inner * 0.52, inner * 0.29
    group = lines_width(h) + w
    x = (size - group) / 2 + lines_width(h)
    y = (size - h) / 2
    ace_badge(im, x, y, w, h)
    # thin maroon rule along the bottom, like the site's header
    ImageDraw.Draw(im).rectangle([0, size - max(2 * ss, size // 32), size, size], fill=MAROON)
    return im.resize((out, out), Image.LANCZOS)


def og():
    return _og(2).resize((1200, 630), Image.LANCZOS)


def _og(k):
    W, H = 1200 * k, 630 * k
    im = Image.new('RGB', (W, H), CHARCOAL)
    d = ImageDraw.Draw(im)
    d.rectangle([0, H - 64 * k, W, H], fill=MAROON)
    bh, bw = 104 * k, 230 * k
    bx = 84 * k + lines_width(bh)
    ace_badge(im, bx, 150 * k, bw, bh)
    size = 110 * k
    while size > 40:
        f = DISPLAY(size)
        l, t, tw, th = text_box('LINEUP LAB', f)
        if bx + bw + 28 * k + tw + th * ITALIC <= W - 70 * k:
            break
        size -= 2
    slanted_text(im, (bx + bw + 28 * k - l, 150 * k + (bh - th) / 2 - t), 'LINEUP LAB', f, WHITE)
    d.text((84 * k, 320 * k), 'Weekly fantasy football projections,', font=BODY(50 * k), fill=WHITE)
    d.text((84 * k, 382 * k), 'start / sit calls, and waiver pickups.', font=BODY(50 * k), fill=WHITE)
    d.text((84 * k, 474 * k), 'ESPN · SLEEPER · CBS · FANTASYPROS · OUR MODEL', font=LABEL(36 * k), fill=ROSE)
    d.text((84 * k, H - 50 * k), 'PPR · HALF-PPR · STANDARD', font=LABEL(32 * k), fill=WHITE)
    return im


def main():
    out = os.path.join(ROOT, 'icons')
    os.makedirs(out, exist_ok=True)
    icon(512).save(os.path.join(out, 'icon-512.png'), optimize=True)
    icon(192).save(os.path.join(out, 'icon-192.png'), optimize=True)
    icon(512, pad=0.14).save(os.path.join(out, 'maskable-512.png'), optimize=True)
    icon(180).save(os.path.join(out, 'apple-touch-icon.png'), optimize=True)
    icon(64).save(os.path.join(out, 'favicon-64.png'), optimize=True)
    og().save(os.path.join(ROOT, 'og.png'), optimize=True)
    print('wrote icons/ and og.png')


if __name__ == '__main__':
    main()
