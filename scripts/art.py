"""Draws the app icons and the link-preview card with the Route A mark (icons/route-a.svg).

Run by .github/workflows/art.yml, which downloads the site's fonts first.
Locally:  FONT_DIR=/path/to/ttfs python3 scripts/art.py  (falls back to DejaVu so the layout can be checked).
Writes icons/*.png and og.png at the repo root.
"""
import bisect
import math
import os
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.environ.get('FONT_DIR', '/tmp/fonts')
GRAPHITE, INK, ORANGE, TEAL, MUTED = '#111214', '#FAFAFA', '#EC4D25', '#2BCFCE', '#CDCDCF'
SS = 4   # drawn at 4x and scaled down so curves and dots come out smooth


def font(name, size, fallback, axes=None):
    for path in (os.path.join(FONTS, name), fallback):
        if path and os.path.exists(path):
            f = ImageFont.truetype(path, size)
            if axes and path != fallback:
                f.set_variation_by_axes(axes)
            return f
    sys.exit(f'missing font {name}')


DJV = '/usr/share/fonts/truetype/dejavu/'
# Archivo italic, wght 900, wdth 125 (axis order in the font: wght, wdth)
DISPLAY = lambda s: font('Archivo-Italic.ttf', s, DJV + 'DejaVuSans-BoldOblique.ttf', [900, 125])
BODY = lambda s: font('BarlowSemiCondensed-Regular.ttf', s, DJV + 'DejaVuSansCondensed.ttf')
LABEL = lambda s: font('BarlowSemiCondensed-Bold.ttf', s, DJV + 'DejaVuSansCondensed-Bold.ttf')

# Route A geometry, in the 100-unit box of icons/route-a.svg
CURVE = [(18, 86), (40, 84), (62, 70), (76, 34)]
ARROW = [(68, 38), (77, 28), (82, 41)]
BALL, BALL_R, STROKE = (18, 86), 7, 6
A_AT, A_SIZE = (46, 78), 70        # the A: centred on x=46, baseline y=78, font-size 70
A_GAP = 0.1                        # extra space after the A in the wordmark, in em


def bezier(p, n=400):
    pts = []
    for i in range(n + 1):
        t = i / n
        c = [(1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3]
        pts.append((sum(c[j] * p[j][0] for j in range(4)), sum(c[j] * p[j][1] for j in range(4))))
    return pts


def stroke(d, pts, w, fill):
    """A polyline with round caps and joins."""
    d.line(pts, fill=fill, width=round(w), joint='curve')
    for x, y in (pts[0], pts[-1]):
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=fill)


def dashes(pts, on, off):
    """Split a polyline into dash pieces (like stroke-dasharray: on off)."""
    cum = [0.0]
    for a, b in zip(pts, pts[1:]):
        cum.append(cum[-1] + math.dist(a, b))
    def at(s):   # the point at arc length s
        i = min(bisect.bisect_right(cum, s) - 1, len(pts) - 2)
        (ax, ay), (bx, by) = pts[i], pts[i + 1]
        f = (s - cum[i]) / ((cum[i + 1] - cum[i]) or 1)
        return ax + (bx - ax) * f, ay + (by - ay) * f
    s, out = 0.0, []
    while s <= cum[-1]:
        out.append([at(s), at(min(s + on, cum[-1]))])
        s += on + off
    return out


def mark(im, x0, y0, s, letter=True, dotted=True):
    """The Route A mark with its 100-unit box at (x0, y0), s px per unit. letter=False skips the A
    (the card draws the A as part of the wordmark)."""
    d = ImageDraw.Draw(im)
    P = lambda u, v: (x0 + u * s, y0 + v * s)
    if letter:
        d.text(P(*A_AT), 'A', font=DISPLAY(round(A_SIZE * s)), fill=INK, anchor='ms')
    curve = [P(*p) for p in bezier(CURVE)]
    for piece in (dashes(curve, 1 * s, 11 * s) if dotted else [curve]):
        stroke(d, piece, STROKE * s, TEAL)
    stroke(d, [P(*p) for p in ARROW], STROKE * s, TEAL)
    bx, by = P(*BALL)
    d.ellipse([bx - BALL_R * s, by - BALL_R * s, bx + BALL_R * s, by + BALL_R * s], fill=ORANGE)


def icon(out, pad=0.0, dotted=True):
    """Full-bleed square icon (iOS and Android round the corners). pad keeps maskable icons inside the safe zone."""
    size = out * SS
    im = Image.new('RGB', (size, size), GRAPHITE)
    mark(im, size * pad, size * pad, size * (1 - 2 * pad) / 100, dotted=dotted)
    return im.resize((out, out), Image.LANCZOS)


def spaced(d, xy, text, f, fill, track):
    """Text with letter-spacing (track px after each character)."""
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=f, fill=fill)
        x += f.getlength(ch) + track


def og():
    k = SS
    W, H = 1200 * k, 630 * k
    im = Image.new('RGB', (W, H), GRAPHITE)
    d = ImageDraw.Draw(im)
    stripe = round(H * 0.07)
    d.rectangle([0, H - stripe, W, H], fill=ORANGE)
    d.rectangle([0, H - stripe - 3 * k, W, H - stripe], fill=TEAL)
    # wordmark, sized to the width; the route rides on its A exactly as in the mark
    # (A_GAP opens room after the A so the arrowhead clears the C, like the site's header)
    x, size, word = 84 * k, 112 * k, 'CE LINEUP LAB'
    width = lambda f: f.getlength('A') + A_GAP * f.size + f.getlength(word)
    while width(DISPLAY(size)) > W - 2 * x:
        size -= k
    f, base = DISPLAY(size), 196 * k
    d.text((x, base), 'A', font=f, fill=INK, anchor='ls')
    d.text((x + f.getlength('A') + A_GAP * size, base), word, font=f, fill=INK, anchor='ls')
    s = size / A_SIZE
    mark(im, x + f.getlength('A') / 2 - A_AT[0] * s, base - A_AT[1] * s, s, letter=False)
    body = BODY(54 * k)
    d.text((x, 300 * k), 'Weekly fantasy football projections,', font=body, fill=MUTED)
    d.text((x, 366 * k), 'start/sit calls and waiver pickups.', font=body, fill=MUTED)
    spaced(d, (x, 466 * k), 'PPR · HALF-PPR · STANDARD', LABEL(34 * k), TEAL, 4 * k)
    return im.resize((1200, 630), Image.LANCZOS)


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
