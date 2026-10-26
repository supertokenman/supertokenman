"""SuperToken Display: the app's own display face.

Every glyph is drawn here, on a 4 x 6 grid, as straight strokes with square ends and 45 degree cut
corners, the constructivist line the rest of the app uses. It covers A-Z (lowercase maps to the
capitals: it is a titling face), 0-9, common punctuation and the Portuguese accents. Run:

    python3 scripts/font/build.py      # writes src/fonts/supertoken-display.woff2 (needs fonttools, brotli)
"""
import math
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

COL, ROW, PAD, BASE, T = 120, 104, 60, 0, 112  # grid step, side bearing, stroke weight
H = T / 2

def P(*pts):
    return list(pts)

G = {
    'A': [P((0, 0), (0, 4), (2, 6), (4, 4), (4, 0)), P((0, 3), (4, 3))],
    'B': [P((0, 0), (0, 6), (3, 6), (4, 5), (4, 4), (3, 3), (0, 3)), P((3, 3), (4, 2), (4, 1), (3, 0), (0, 0))],
    'C': [P((4, 6), (1, 6), (0, 5), (0, 1), (1, 0), (4, 0))],
    'D': [P((0, 0), (0, 6), (3, 6), (4, 5), (4, 1), (3, 0), (0, 0))],
    'E': [P((4, 6), (0, 6), (0, 0), (4, 0)), P((0, 3), (3, 3))],
    'F': [P((4, 6), (0, 6), (0, 0)), P((0, 3), (3, 3))],
    'G': [P((4, 6), (1, 6), (0, 5), (0, 1), (1, 0), (4, 0), (4, 3), (2, 3))],
    'H': [P((0, 0), (0, 6)), P((4, 0), (4, 6)), P((0, 3), (4, 3))],
    'I': [P((0, 6), (2, 6)), P((1, 6), (1, 0)), P((0, 0), (2, 0))],
    'J': [P((4, 6), (4, 1), (3, 0), (1, 0), (0, 1))],
    'K': [P((0, 0), (0, 6)), P((4, 6), (1, 3), (0, 3)), P((1, 3), (4, 0))],
    'L': [P((0, 6), (0, 0), (4, 0))],
    'M': [P((0, 0), (0, 6), (2, 4), (4, 6), (4, 0))],
    'N': [P((0, 0), (0, 6), (4, 0), (4, 6))],
    'O': [P((1, 0), (0, 1), (0, 5), (1, 6), (3, 6), (4, 5), (4, 1), (3, 0), (1, 0))],
    'P': [P((0, 0), (0, 6), (3, 6), (4, 5), (4, 4), (3, 3), (0, 3))],
    'Q': [P((1, 0), (0, 1), (0, 5), (1, 6), (3, 6), (4, 5), (4, 1), (3, 0), (1, 0)), P((2.4, 1.6), (4, 0))],
    'R': [P((0, 0), (0, 6), (3, 6), (4, 5), (4, 4), (3, 3), (0, 3)), P((2, 3), (4, 0))],
    'S': [P((4, 6), (1, 6), (0, 5), (0, 4), (1, 3), (3, 3), (4, 2), (4, 1), (3, 0), (0, 0))],
    'T': [P((0, 6), (4, 6)), P((2, 6), (2, 0))],
    'U': [P((0, 6), (0, 1), (1, 0), (3, 0), (4, 1), (4, 6))],
    'V': [P((0, 6), (2, 0), (4, 6))],
    'W': [P((0, 6), (0, 0), (2, 2), (4, 0), (4, 6))],
    'X': [P((0, 6), (4, 0)), P((0, 0), (4, 6))],
    'Y': [P((0, 6), (2, 3), (4, 6)), P((2, 3), (2, 0))],
    'Z': [P((0, 6), (4, 6), (0, 0), (4, 0))],
    '0': [P((1, 0), (0, 1), (0, 5), (1, 6), (3, 6), (4, 5), (4, 1), (3, 0), (1, 0)), P((1.2, 2), (2.8, 4))],
    '1': [P((0, 5), (2, 6), (2, 0)), P((0, 0), (4, 0))],
    '2': [P((0, 5), (1, 6), (3, 6), (4, 5), (4, 4), (0, 0), (4, 0))],
    '3': [P((0, 6), (4, 6), (4, 5), (2, 3), (3, 3), (4, 2), (4, 1), (3, 0), (0, 0))],
    '4': [P((3, 0), (3, 6), (0, 2), (4, 2))],
    '5': [P((4, 6), (0, 6), (0, 3), (3, 3), (4, 2), (4, 1), (3, 0), (0, 0))],
    '6': [P((4, 6), (1, 6), (0, 5), (0, 1), (1, 0), (3, 0), (4, 1), (4, 2), (3, 3), (0, 3))],
    '7': [P((0, 6), (4, 6), (4, 5), (1.5, 0))],
    '8': [P((1, 3), (0, 4), (0, 5), (1, 6), (3, 6), (4, 5), (4, 4), (3, 3), (1, 3), (0, 2), (0, 1), (1, 0), (3, 0), (4, 1), (4, 2), (3, 3))],
    '9': [P((0, 0), (3, 0), (4, 1), (4, 5), (3, 6), (1, 6), (0, 5), (0, 4), (1, 3), (4, 3))],
    '.': [P((0, 0), (0, 0))],
    ',': [P((0, 0.2), (0, 0), (-0.6, -1))],
    ':': [P((0, 0), (0, 0)), P((0, 3), (0, 3))],
    ';': [P((0, 3), (0, 3)), P((0, 0.2), (0, 0), (-0.6, -1))],
    '!': [P((0, 6), (0, 2)), P((0, 0), (0, 0))],
    '?': [P((0, 5), (1, 6), (3, 6), (4, 5), (4, 4), (2, 3), (2, 2)), P((2, 0), (2, 0))],
    '-': [P((0, 3), (3, 3))],
    '+': [P((0, 3), (4, 3)), P((2, 1), (2, 5))],
    '=': [P((0, 2), (4, 2)), P((0, 4), (4, 4))],
    '/': [P((0, 0), (3, 6))],
    "'": [P((0, 6), (0, 4.6))],
    '"': [P((0, 6), (0, 4.6)), P((1.4, 6), (1.4, 4.6))],
    '(': [P((2, 6.6), (1, 5.6), (1, 0.4), (2, -0.6))],
    ')': [P((0, 6.6), (1, 5.6), (1, 0.4), (0, -0.6))],
    '_': [P((0, -1), (4, -1))],
    '$': [P((4, 6), (1, 6), (0, 5), (0, 4), (1, 3), (3, 3), (4, 2), (4, 1), (3, 0), (0, 0)), P((2, 6.9), (2, -0.9))],
    '%': [P((0, 0), (4, 6)), P((0.4, 5.6), (0.4, 5.6)), P((3.6, 0.4), (3.6, 0.4))],
    '#': [P((1, 0), (2, 6)), P((3, 0), (4, 6)), P((0, 2), (4, 2)), P((0.5, 4), (4.5, 4))],
    '*': [P((2, 6), (2, 2.6)), P((0.6, 5.2), (3.4, 3.4)), P((0.6, 3.4), (3.4, 5.2))],
    '&': [P((4, 0), (0.8, 4.2), (0.8, 5.2), (1.6, 6), (2.6, 6), (3.2, 5.2), (3.2, 4.4), (0, 2), (0, 1), (1, 0), (2.6, 0), (4, 2))],
    '@': [P((3, 2), (3, 4), (1.6, 4), (1.6, 2), (4, 2), (4, 5), (3, 6), (1, 6), (0, 5), (0, 1), (1, 0), (4, 0))],
    '<': [P((4, 5.4), (0, 3), (4, 0.6))],
    '>': [P((0, 5.4), (4, 3), (0, 0.6))],
    '[': [P((2, 6.6), (1, 6.6), (1, -0.6), (2, -0.6))],
    ']': [P((0, 6.6), (1, 6.6), (1, -0.6), (0, -0.6))],
    '·': [P((0, 3), (0, 3))],
}
ACCENT = {
    'acute': [P((-0.5, 7.1), (0.5, 8.1))],
    'grave': [P((-0.5, 8.1), (0.5, 7.1))],
    'circ': [P((-1, 7.1), (0, 8.1), (1, 7.1))],
    'tilde': [P((-1.4, 7.3), (-0.5, 8), (0.5, 7.3), (1.4, 8))],
    'dier': [P((-0.9, 7.6), (-0.9, 7.6)), P((0.9, 7.6), (0.9, 7.6))],
}
COMPOSED = {
    'Á': ('A', 'acute'), 'À': ('A', 'grave'), 'Â': ('A', 'circ'), 'Ã': ('A', 'tilde'), 'Ä': ('A', 'dier'),
    'É': ('E', 'acute'), 'Ê': ('E', 'circ'), 'È': ('E', 'grave'),
    'Í': ('I', 'acute'), 'Ó': ('O', 'acute'), 'Ô': ('O', 'circ'), 'Õ': ('O', 'tilde'), 'Ö': ('O', 'dier'),
    'Ú': ('U', 'acute'), 'Ü': ('U', 'dier'), 'Ñ': ('N', 'tilde'),
}

def width_of(strokes):
    xs = [x for s in strokes for x, _ in s]
    return max(xs) if xs else 0

def quad(a, b):
    """A stroke from a to b (grid units) as a 4-point polygon in font units, with square ends."""
    (x1, y1), (x2, y2) = a, b
    x1, y1, x2, y2 = x1 * COL, y1 * ROW + H, x2 * COL, y2 * ROW + H
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy)
    if L == 0:
        ux, uy = 1.0, 0.0
    else:
        ux, uy = dx / L, dy / L
    nx, ny = -uy * H, ux * H
    pts = [(x1 + nx, y1 + ny), (x2 + nx, y2 + ny), (x2 - nx, y2 - ny), (x1 - nx, y1 - ny)]
    # TrueType wants outer contours clockwise
    area = sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(pts, pts[1:] + pts[:1]))
    return pts if area < 0 else pts[::-1]

def joint(v):
    """An octagon with its flats at half the weight: it closes straight and 45 degree joints alike and
    cuts every free end at 45 degrees, the app's corner."""
    x, y = v[0] * COL, v[1] * ROW + H
    r = H / math.cos(math.pi / 8)
    pts = [(x + r * math.cos(math.pi / 8 + k * math.pi / 4), y + r * math.sin(math.pi / 8 + k * math.pi / 4)) for k in range(8)]
    return pts[::-1]  # clockwise

def draw(strokes, dx=0):
    pen = TTGlyphPen(None)
    polys = []
    for s in strokes:
        for a, b in zip(s, s[1:]):
            if a != b:
                polys.append(quad(a, b))
        polys += [joint(v) for v in s]
    for pts in polys:
        pen.moveTo((round(pts[0][0] + dx), round(pts[0][1])))
        for p in pts[1:]:
            pen.lineTo((round(p[0] + dx), round(p[1])))
        pen.closePath()
    return pen.glyph()

def build(out: Path):
    names, glyphs, metrics, cmap = ['.notdef', 'space'], {}, {}, {}
    glyphs['.notdef'] = draw([P((0, 0), (0, 6), (3, 6), (3, 0), (0, 0))], PAD)
    metrics['.notdef'] = (3 * COL + 2 * PAD + T, PAD)
    glyphs['space'] = TTGlyphPen(None).glyph()
    metrics['space'] = (300, 0)
    cmap[0x20] = 'space'
    cmap[0xA0] = 'space'

    def add(ch, strokes, extra=None):
        name = f'uni{ord(ch):04X}'
        xs = [x for s in strokes for x, _ in s]
        lo = min(xs) if xs else 0
        shift = -lo * COL + PAD + H
        if extra:
            strokes = strokes + extra
        glyphs[name] = draw(strokes, shift)
        w = (width_of(strokes) - lo) * COL + 2 * PAD + T
        metrics[name] = (round(w), round(shift - H))
        names.append(name)
        cmap[ord(ch)] = name
        if ch.lower() != ch:
            cmap[ord(ch.lower())] = name

    for ch, strokes in G.items():
        add(ch, strokes)
    for ch, (base, acc) in COMPOSED.items():
        mid = width_of(G[base]) / 2
        add(ch, G[base], [[(x + mid, y) for x, y in s] for s in ACCENT[acc]])
    add('Ç', G['C'], [P((2, 0), (2, -0.7), (1.2, -1.2))])

    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(names)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=900, descent=-260)
    fb.setupNameTable({'familyName': 'SuperToken Display', 'styleName': 'Regular', 'uniqueFontIdentifier': 'SuperToken Display Regular 1.0', 'fullName': 'SuperToken Display', 'version': 'Version 1.000', 'psName': 'SuperTokenDisplay-Regular', 'copyright': 'Drawn for SuperTokenMan. Free to use with the app.'})
    fb.setupOS2(sTypoAscender=900, sTypoDescender=-260, usWinAscent=920, usWinDescent=280, sCapHeight=6 * ROW + T, sxHeight=6 * ROW + T, usWeightClass=800)
    fb.setupPost()
    fb.font.flavor = 'woff2'
    out.parent.mkdir(parents=True, exist_ok=True)
    fb.save(str(out))
    return len(cmap)

if __name__ == '__main__':
    out = Path(__file__).resolve().parents[2] / 'src' / 'fonts' / 'supertoken-display.woff2'
    n = build(out)
    print(f'{out} ({out.stat().st_size} bytes, {n} characters)')
