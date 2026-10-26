// @ts-check
// The menu bar's SuperTokenMan card: a fighting-game HUD in pixel art, drawn into a PNG with no
// dependencies. Coordinates are in points; the image is drawn at SCALE pixels per point and shown
// at its point size (SwiftBar's width= and height=), so it stays sharp on Retina screens.
import { canvas } from './png.mjs';

export const SCALE = 2;

const C = { ink: '#141413', panel: '#1f1e1b', line: '#3d3c38', track: '#2b2a27', cream: '#faf9f5', gray: '#b0aea5', orange: '#d97757', deep: '#c15f3c', glow: '#f2b49a', dark: '#a94f30' };

// 5x7 arcade font, uppercase; anything else draws as a space
const FONT = {
  A: '.###.#...##...#######...##...##...#', B: '####.#...##...#####.#...##...#####.', C: '.###.#...##....#....#....#...#.###.',
  D: '####.#...##...##...##...##...#####.', E: '######....#....####.#....#....#####', F: '######....#....####.#....#....#....',
  G: '.###.#...##....#.####...##...#.####', H: '#...##...##...#######...##...##...#', I: '.###...#....#....#....#....#...###.',
  J: '..###...#....#....#....#.#..#..##..', K: '#...##..#.#.#..##...#.#..#..#.#...#', L: '#....#....#....#....#....#....#####',
  M: '#...###.###.#.##.#.##...##...##...#', N: '#...##...###..##.#.##..###...##...#', O: '.###.#...##...##...##...##...#.###.',
  P: '####.#...##...#####.#....#....#....', Q: '.###.#...##...##...##.#.##..#..##.#', R: '####.#...##...#####.#.#..#..#.#...#',
  S: '.#####....#.....###.....#....#####.', T: '#####..#....#....#....#....#....#..', U: '#...##...##...##...##...##...#.###.',
  V: '#...##...##...##...##...#.#.#...#..', W: '#...##...##...##.#.##.#.##.#.#.#.#.', X: '#...##...#.#.#...#...#.#.#...##...#',
  Y: '#...##...#.#.#...#....#....#....#..', Z: '#####....#...#...#...#...#....#####',
  0: '.###.#...##..###.#.###..##...#.###.', 1: '..#...##....#....#....#....#...###.', 2: '.###.#...#....#...#...#...#...#####',
  3: '#####...#...#.....#....##...#.###.', 4: '...#...##..#.#.#..#.#####...#....#.', 5: '######....####.....#....##...#.###.',
  6: '..##..#...#....####.#...##...#.###.', 7: '#####....#...#...#...#....#....#...', 8: '.###.#...##...#.###.#...##...#.###.',
  9: '.###.#...##...#.####....#...#..##..', $: '..#...####.#.#...###...#.#####...#..', '.': '..........................##...##..',
  ',': '....................##....#...#....', '%': '##...##..#...#...#...#...#..##...##', ':': '......##...##........##...##.......',
  '-': '...............#####...............', '>': '.#.....#.....#.....#...#...#...#...', '=': '..........#####.....#####..........', '+': '.......#....#..#####..#....#.......', '/': '.....#....#...#...#...#....#.......',
  '·': '.................#.................', '(': '...#...#...#....#....#.....#.....#.', ')': '.#.....#.....#....#....#...#...#...',
};

/** Width in points of `s` at font scale `k`. */
export const textWidth = (s, k = 1) => Math.max(0, s.length * 6 * k - k);

/** A drawing surface in points over a canvas in pixels. */
export function surface(w, h) {
  const c = canvas(w * SCALE, h * SCALE);
  /** fill a rectangle given in pixels */
  const px = (x, y, rw, rh, hex) => c.rect(x, y, rw, rh, hex);
  const s = {
    w,
    h,
    /** rectangle in points */
    rect: (x, y, rw, rh, hex) => px(x * SCALE, y * SCALE, rw * SCALE, rh * SCALE, hex),
    /** text in the arcade font, top-left at (x, y), each font pixel k points */
    text(x, y, str, hex, k = 1, anchor = 'start') {
      let cx = anchor === 'end' ? x - textWidth(str, k) : x;
      for (const ch of str.toUpperCase()) {
        const g = FONT[ch];
        if (g) for (let i = 0; i < 35; i++) if (g[i] === '#') s.rect(cx + (i % 5) * k, y + Math.floor(i / 5) * k, k, k, hex);
        cx += 6 * k;
      }
    },
    /** even-odd polygon fill, points as [x, y] in points (and fractions of them) */
    poly(pts, hex, ox = 0, oy = 0, k = 1) {
      const P = pts.map(([x, y]) => [(ox + x * k) * SCALE, (oy + y * k) * SCALE]);
      const ys = P.map((p) => p[1]);
      for (let py = Math.floor(Math.min(...ys)); py < Math.ceil(Math.max(...ys)); py++) {
        const yc = py + 0.5;
        const xs = [];
        for (let i = 0; i < P.length; i++) {
          const [x1, y1] = P[i];
          const [x2, y2] = P[(i + 1) % P.length];
          if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
        }
        xs.sort((a, b) => a - b);
        for (let i = 0; i + 1 < xs.length; i += 2) px(Math.round(xs[i]), py, Math.round(xs[i + 1]) - Math.round(xs[i]), 1, hex);
      }
    },
    /**
     * A fighting-game bar: slanted, glossy, `left` (0..1) filled, ticks every 10%. In points.
     * Below a quarter the fill turns deep terracotta.
     */
    bar(x, y, bw, bh, left, ramp = [C.glow, C.orange, C.dark], ticks = true, look = { line: C.line, track: C.track, tick: C.ink, low: [C.deep, C.deep, C.dark] }) {
      const H = bh * SCALE;
      const W = bw * SCALE;
      const p = Math.max(0, Math.min(1, left));
      const fw = Math.round(W * p);
      const colors = p < 0.25 ? look.low : ramp;
      for (let j = 0; j < H; j++) {
        const off = Math.round((H - 1 - j) * 0.6);
        const X = x * SCALE + off;
        const Y = y * SCALE + j;
        px(X - 1, Y, W + 2, 1, look.line);
        px(X, Y, W, 1, look.track);
        if (fw > 0) px(X, Y, fw, 1, j < Math.max(1, H * 0.25) ? colors[0] : j < H * 0.7 ? colors[1] : colors[2]);
        if (ticks) for (let t = 1; t < 10; t++) px(X + Math.round((W * t) / 10), Y, 1, 1, look.tick);
      }
      px(x * SCALE + Math.round((H - 1) * 0.6) - 1, y * SCALE - 1, W + 2, 1, look.line);
      px(x * SCALE - 1, y * SCALE + H, W + 2, 1, look.line);
    },
    png: () => c.png(),
  };
  return s;
}

// the mascot (assets/logo.svg of the SuperTokenMan mod), as shapes on its 64-point grid
const MASCOT = [
  ['poly', [[16, 19], [48, 19], [59.5, 59.5], [48, 55.5], [40, 61.5], [32, 56.5], [24, 61.5], [16, 55.5], [4.5, 59.5]], C.track],
  ['poly', [[17, 20], [47, 20], [58, 58], [48, 54], [40, 60], [32, 55], [24, 60], [16, 54], [6, 58]], C.ink],
  ['rect', [18, 12, 28, 34], C.orange],
  ['rect', [20, 10, 24, 2], C.orange],
  ['rect', [20, 46, 24, 2], C.orange],
  ['rect', [20, 10, 24, 5], C.ink],
  ['rect', [18, 12, 28, 3], C.ink],
  ['rect', [29, 15, 3, 2], C.ink],
  ['rect', [31, 17, 2, 2], C.ink],
  ['rect', [24, 19, 5, 6], C.cream],
  ['rect', [35, 19, 5, 6], C.cream],
  ['rect', [26, 21, 2, 3], C.ink],
  ['rect', [37, 21, 2, 3], C.ink],
  ['poly', [[32, 26.8], [41.2, 31.3], [41.2, 39.7], [32, 44.2], [22.8, 39.7], [22.8, 31.3]], C.ink],
  ['poly', [[32, 28], [40, 32], [40, 39], [32, 43], [24, 39], [24, 32]], C.cream],
  ['poly', [[27.5, 32], [36.5, 32], [36.5, 34.5], [33.3, 34.5], [33.3, 40], [30.7, 40], [30.7, 34.5], [27.5, 34.5]], C.deep],
  ['rect', [18, 44, 28, 3], C.ink],
  ['rect', [13, 28, 5, 11], C.orange],
  ['rect', [46, 28, 5, 11], C.orange],
  ['rect', [22, 48, 7, 6], C.ink],
  ['rect', [35, 48, 7, 6], C.ink],
];

/** Draws the mascot with its 64-point grid scaled by `k`, top-left at (x, y). */
function mascot(s, x, y, k) {
  for (const [kind, shape, hex] of MASCOT) {
    if (kind === 'poly') s.poly(/** @type {number[][]} */ (shape), hex, x, y, k);
    else {
      const [rx, ry, rw, rh] = /** @type {number[]} */ (shape);
      s.poly([[rx, ry], [rx + rw, ry], [rx + rw, ry + rh], [rx, ry + rh]], hex, x, y, k);
    }
  }
}

/**
 * @typedef {object} CardView
 * @property {string} score        today's real usage, formatted
 * @property {string} saved        today's savings, formatted
 * @property {number} power        today's save rate, 0..1
 * @property {number} kos          today's cuts
 * @property {number} sessions     today's sessions
 * @property {number} blocked      today's large reads blocked
 * @property {{ label: string, left: number, note: string }[]} plan  stamina bars (5h, 7d) when known
 * @property {{ letter: string, used: number, saved: number, today: boolean }[]} days  7 days, oldest first
 * @property {string} week         the week's usage, formatted
 * @property {string} weekSaved    the week's savings, formatted
 * @property {string} [footer]     a last line, small (prices and exchange rate)
 */

// the card's look: Claude orange all over, ink and cream on top, darker oranges for tracks
const O = { bg: '#d97757', edge: '#a94f30', well: '#c4643f', track: '#b85c3a', label: '#5c2614', ink: C.ink, cream: C.cream, white: '#ffffff' }
const LOOK = { line: O.edge, track: O.track, tick: O.edge, low: [O.ink, O.ink, O.ink] }
const CREAM_RAMP = [O.white, O.cream, '#e8e6dc']

/** Text with a 1-point ink drop shadow, arcade style. */
function shadowed(s, x, y, str, hex, k, anchor = 'start') {
  s.text(x + k / 2, y + k / 2, str, O.ink, k, anchor)
  s.text(x, y, str, hex, k, anchor)
}

/** The orange panel with pixel corners. */
function panel(s, W, H) {
  s.rect(2, 0, W - 4, H, O.edge)
  s.rect(0, 2, W, H - 4, O.edge)
  s.rect(3, 1, W - 6, H - 2, O.bg)
  s.rect(1, 3, W - 2, H - 6, O.bg)
}

/** The card, 340 points wide; its height depends on the plan bars. Returns { png, width, height }. */
export function hudCard(/** @type {CardView} */ v) {
  const W = 340;
  const planH = v.plan.length * 20;
  const H = 226 + planH + (v.footer ? 14 : 0);
  const s = surface(W, H);
  panel(s, W, H);

  // portrait: the hero on ink, framed in cream
  s.rect(10, 10, 52, 52, O.cream);
  s.rect(12, 12, 48, 48, O.ink);
  mascot(s, 12, 13, 0.75);
  shadowed(s, 72, 14, 'SUPERTOKENMAN', O.cream, 2);
  s.text(72, 34, 'TOKEN FIGHTER  ·  TODAY', O.label);
  s.text(72, 48, `${v.sessions} SESSION${v.sessions === 1 ? '' : 'S'}  ·  ${v.blocked} READ${v.blocked === 1 ? '' : 'S'} BLOCKED`, O.label);

  // score and saved
  let y = 74;
  s.text(10, y, 'SCORE', O.label);
  s.text(W - 10, y, 'SAVED', O.label, 1, 'end');
  shadowed(s, 10, y + 12, v.score, O.cream, 3);
  shadowed(s, W - 10, y + 12, v.saved, O.white, 3, 'end');
  y += 42;

  // power: today's save rate, and the KO count
  s.text(10, y + 2, 'POWER', O.ink);
  s.bar(48, y, 196, 10, v.power, CREAM_RAMP, true, LOOK);
  s.text(W - 10, y + 2, `${v.kos} KO`, O.ink, 1, 'end');
  y += 20;
  for (const b of v.plan) {
    s.text(10, y + 2, b.label, O.ink);
    s.bar(48, y, 196, 10, b.left, CREAM_RAMP, true, LOOK);
    s.text(W - 10, y + 2, b.note, O.ink, 1, 'end');
    y += 20;
  }

  // the week, as an arcade equalizer: cream usage segments, ink saved on top, today in white
  y += 4;
  s.rect(10, y, W - 20, 1, O.edge);
  y += 8;
  s.text(10, y, 'LAST 7 DAYS', O.ink);
  s.text(W - 10, y, `${v.week}  ·  SAVED ${v.weekSaved}`, O.label, 1, 'end');
  y += 14;
  const chartH = 44;
  const max = Math.max(1e-9, ...v.days.map((d) => d.used + d.saved));
  const colW = (W - 20 - 6 * 10) / 7;
  const SEG = 4;
  v.days.forEach((d, i) => {
    const x = 10 + i * (colW + 10);
    // a day with any use lights at least one segment
    const total = Math.max(d.used + d.saved > 0 ? 1 : 0, Math.round(((d.used + d.saved) / max) * (chartH / SEG)));
    const savedSegs = d.saved > 0 ? Math.max(1, Math.round((d.saved / max) * (chartH / SEG))) : 0;
    for (let seg = 0; seg < chartH / SEG; seg++) {
      const sy = y + chartH - (seg + 1) * SEG;
      const lit = seg < total;
      const hex = !lit ? O.well : seg >= total - savedSegs ? O.ink : d.today ? O.white : O.cream;
      s.rect(x, sy + 1, colW, SEG - 1, hex);
    }
    s.text(x + colW / 2 - 2, y + chartH + 5, d.letter, d.today ? O.white : O.ink);
  });
  if (v.footer) s.text(10, y + chartH + 19, v.footer, O.label);
  return { png: s.png(), width: W, height: H };
}

/** A menu row as an arcade button: the same orange, ink label, an arrow at the end when it acts. 340 x 26. */
export function hudButton(/** @type {string} */ label, arrow = true) {
  const W = 340;
  const H = 26;
  const s = surface(W, H);
  panel(s, W, H);
  s.rect(10, 7, 3, 12, O.ink);
  s.text(20, 10, label, O.ink);
  if (arrow) s.text(W - 12, 10, '>', O.ink, 1, 'end');
  return { png: s.png(), width: W, height: H };
}
