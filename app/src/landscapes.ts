// Backgrounds: real places drawn as flat poster shapes in the theme's own colors, lit by the hour.
// Drawn for this app; no photos. Every color is the theme's background mixed toward one of its tones,
// so a scene never fights the text on top of it.
import type { Theme } from './themes'

export type Scene = { id: string; name: string; place: string; draw: (k: Ink) => string }
export type Phase = 'dawn' | 'day' | 'dusk' | 'night'

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const toHex = (c: number[]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`
/** `a` moved toward `b` by t (0..1). */
export const mix = (a: string, b: string, t: number) => {
  const x = hex(a)
  const y = hex(b)
  return toHex(x.map((v, i) => v + (y[i]! - v) * t))
}

/** The hour's light: dawn 5-8, day 8-17, dusk 17-20, night otherwise. */
export const phaseOf = (hour: number): Phase => (hour >= 5 && hour < 8 ? 'dawn' : hour >= 8 && hour < 17 ? 'day' : hour >= 17 && hour < 20 ? 'dusk' : 'night')

/** The inks a scene paints with: layers from far (1) to near (4), sky top and bottom, the sun, highlights. */
export type Ink = { far: string; mid: string; near: string; front: string; skyTop: string; skyLow: string; sun: string; light: string; water: string; night: boolean }

export function inks(t: Theme, phase: Phase, strength = 1): Ink {
  const { bg, accent, glow, blue, muted, text } = t.c
  const s = (v: number) => v * strength
  const warm = phase === 'dawn' || phase === 'dusk'
  const night = phase === 'night'
  const sunTone = night ? text : warm ? accent : glow
  return {
    skyTop: mix(bg, night ? blue : warm ? accent : blue, s(night ? 0.12 : warm ? 0.16 : 0.18)),
    skyLow: mix(bg, warm ? glow : blue, s(warm ? 0.38 : night ? 0.06 : 0.26)),
    sun: mix(bg, sunTone, s(night ? 0.4 : warm ? 0.85 : 0.7)),
    far: mix(bg, warm ? accent : blue, s(night ? 0.16 : 0.28)),
    mid: mix(bg, warm ? glow : muted, s(night ? 0.12 : 0.2)),
    near: mix(mix(bg, '#000000', 0.2), accent, s(0.07)),
    front: mix(mix(bg, '#000000', 0.38), accent, s(0.04)),
    light: mix(bg, text, s(night ? 0.3 : 0.45)),
    water: mix(bg, warm ? glow : blue, s(night ? 0.22 : 0.32)),
    night,
  }
}

const stars = (k: Ink) =>
  k.night
    ? Array.from({ length: 46 }, (_, i) => {
        // a fixed scatter, the same on every render
        const x = (i * 337) % 1600
        const y = (i * 97) % 380
        return `<circle cx="${x}" cy="${y + 20}" r="${i % 7 === 0 ? 1.8 : 1}" fill="${k.light}"/>`
      }).join('')
    : ''
const sky = (k: Ink, sun: [number, number, number]) =>
  `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${k.skyTop}"/><stop offset="1" stop-color="${k.skyLow}"/></linearGradient></defs>` +
  `<rect width="1600" height="900" fill="url(#sky)"/>${stars(k)}` +
  // by night the sun becomes a small crescent moon, so it never sits on the text like a lamp
  (k.night
    ? `<circle cx="${sun[0]}" cy="${sun[1] - 60}" r="${Math.round(sun[2] * 0.4)}" fill="${k.sun}"/><circle cx="${sun[0] + sun[2] * 0.16}" cy="${sun[1] - 60 - sun[2] * 0.1}" r="${Math.round(sun[2] * 0.36)}" fill="${k.skyTop}"/>`
    : `<circle cx="${sun[0]}" cy="${sun[1]}" r="${sun[2]}" fill="${k.sun}"/>`)

export const SCENES: Scene[] = [
  {
    id: 'lencois',
    name: 'Lençóis',
    place: 'Lençóis Maranhenses, Brazil',
    draw: (k) =>
      sky(k, [1180, 330, 70]) +
      `<path d="M0 560 C220 500 380 520 560 470 S900 520 1100 480 1420 500 1600 470 V900 H0z" fill="${k.mid}"/>` +
      `<path d="M0 620 C200 560 420 600 620 560 S980 620 1180 570 1460 600 1600 580 V900 H0z" fill="${k.light}" opacity=".55"/>` +
      `<ellipse cx="430" cy="660" rx="190" ry="22" fill="${k.water}"/><ellipse cx="1080" cy="640" rx="240" ry="26" fill="${k.water}"/>` +
      `<path d="M0 700 C260 650 520 700 800 660 S1300 720 1600 680 V900 H0z" fill="${k.near}"/>` +
      `<ellipse cx="760" cy="760" rx="300" ry="30" fill="${k.water}"/>` +
      `<path d="M0 800 C300 770 700 810 1000 780 S1400 820 1600 800 V900 H0z" fill="${k.front}"/>`,
  },
  {
    id: 'fuji',
    name: 'Fuji',
    place: 'Mount Fuji from Lake Kawaguchi, Japan',
    draw: (k) =>
      sky(k, [520, 280, 110]) +
      `<path d="M240 640 L700 300 Q800 240 900 300 L1360 640z" fill="${k.far}"/>` +
      `<path d="M640 345 L700 300 Q800 240 900 300 L960 345 L910 370 L860 340 L800 380 L740 340 L690 372z" fill="${k.light}"/>` +
      `<path d="M0 640 C300 600 500 620 800 610 S1300 600 1600 630 V660 H0z" fill="${k.mid}"/>` +
      `<rect y="660" width="1600" height="240" fill="${k.water}"/>` +
      Array.from({ length: 7 }, (_, i) => `<rect x="${560 + i * 18}" y="${690 + i * 24}" width="${480 - i * 36}" height="5" fill="${k.far}" opacity="${0.6 - i * 0.07}"/>`).join('') +
      `<path d="M0 820 C300 800 600 830 900 815 S1400 830 1600 810 V900 H0z" fill="${k.front}"/>`,
  },
  {
    id: 'patagonia',
    name: 'Patagonia',
    place: 'Torres del Paine, Chile',
    draw: (k) =>
      sky(k, [1260, 230, 60]) +
      `<path d="M0 620 L180 470 L320 560 L470 420 L560 520 V900 H0z" fill="${k.mid}"/>` +
      `<path d="M560 600 L640 300 L690 260 L730 320 L770 240 L820 230 L860 300 L900 250 L950 270 L990 600z" fill="${k.far}"/>` +
      `<path d="M640 300 L690 260 L730 320 L770 240 L820 230 L860 300 L900 250 L950 270 L940 320 L880 300 L840 330 L790 290 L740 350 L680 310z" fill="${k.light}" opacity=".7"/>` +
      `<path d="M900 600 L1100 440 L1260 540 L1420 450 L1600 560 V900 H900z" fill="${k.mid}"/>` +
      `<rect y="640" width="1600" height="90" fill="${k.water}"/>` +
      `<path d="M0 720 C400 690 800 740 1200 700 S1500 720 1600 710 V900 H0z" fill="${k.near}"/>` +
      `<path d="M0 820 L120 790 L260 815 L420 780 L600 820 L800 790 L1000 820 L1200 785 L1400 815 L1600 790 V900 H0z" fill="${k.front}"/>`,
  },
  {
    id: 'iceland',
    name: 'Iceland',
    place: 'Kirkjufell under the aurora, Iceland',
    draw: (k) =>
      sky(k, [300, 210, 34]) +
      `<path d="M0 300 C300 220 600 360 900 260 S1400 200 1600 280" stroke="${k.water}" stroke-width="60" fill="none" opacity=".9"/>` +
      `<path d="M0 360 C350 290 650 420 1000 320 S1450 300 1600 340" stroke="${k.light}" stroke-width="22" fill="none" opacity=".45"/>` +
      `<path d="M820 640 L960 420 Q1010 360 1060 420 L1240 640z" fill="${k.far}"/>` +
      `<path d="M0 660 L260 560 L480 640 V900 H0z" fill="${k.mid}"/>` +
      `<rect y="640" width="1600" height="260" fill="${k.near}"/>` +
      `<path d="M300 700 h60 v-40 h30 v40 h50 v-60 h40 v60" stroke="${k.water}" stroke-width="10" fill="none" opacity=".7"/>` +
      `<path d="M0 800 C400 770 900 820 1300 790 L1600 800 V900 H0z" fill="${k.front}"/>`,
  },
  {
    id: 'cappadocia',
    name: 'Cappadocia',
    place: 'Göreme valley at sunrise, Turkey',
    draw: (k) =>
      sky(k, [1180, 260, 80]) +
      [[260, 300, 26], [520, 180, 34], [1000, 240, 30], [1260, 360, 22], [760, 330, 16]]
        .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${k.sun}"/><rect x="${x! - r! / 4}" y="${y! + r! + 6}" width="${r! / 2}" height="${r! / 2.5}" fill="${k.far}"/>`)
        .join('') +
      `<path d="M0 640 L120 560 Q140 520 160 560 L240 640 L320 520 Q345 470 370 520 L450 640 L560 580 Q580 550 600 580 L700 640 L1600 640 V900 H0z" fill="${k.far}"/>` +
      `<path d="M900 640 L980 530 Q1005 480 1030 530 L1110 640 L1200 560 Q1220 530 1240 560 L1330 640 L1420 500 Q1445 450 1470 500 L1560 640z" fill="${k.far}"/>` +
      `<path d="M0 700 C300 670 600 710 900 690 S1400 700 1600 690 V900 H0z" fill="${k.near}"/>` +
      `<path d="M0 810 C400 780 800 820 1200 795 S1500 810 1600 800 V900 H0z" fill="${k.front}"/>`,
  },
]

export const NONE = 'none'
export const AUTO = 'auto'

/** The scene for a setting: a fixed one, none, or `auto`, which walks the list one scene a day. */
export function sceneFor(id: string, now = new Date()): Scene | null {
  if (id === NONE) return null
  if (id === AUTO) return SCENES[Math.floor(now.getTime() / 86_400_000) % SCENES.length]!
  return SCENES.find((s) => s.id === id) ?? null
}

/** The full SVG for a scene, theme and hour. */
export function sceneSvg(scene: Scene, theme: Theme, hour: number, strength = 1): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" width="100%" height="100%">${scene.draw(inks(theme, phaseOf(hour), strength))}</svg>`
}
