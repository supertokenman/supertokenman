// SuperTokenMan in every mood: the same pixel hero on a 64-point grid, with a body color, a face and
// an animation per mood. Returns the inside of an <svg viewBox="0 0 64 64">, SMIL-animated.
import type { Mood } from './mood'

// the hero's own ink and cream, one step off the HUD palette so themes never recolor the character
const INK = '#151514'
const CREAM = '#fbfaf6'
const RIM = '#e8e6dc'

/** body colors: Claude orange at rest, the Inside Out palette when a feeling takes over */
export const BODY: Record<Mood, string> = {
  idle: '#da7757',
  working: '#da7757',
  focus: '#da7757',
  joy: '#f0b23e',
  anger: '#d9472f',
  fear: '#a38bd6',
  disgust: '#8db158',
  sadness: '#6f95cc',
  sleep: '#b98a74',
}

const anim = (attr: string, values: string, dur: string, extra = '') => `<animate attributeName="${attr}" values="${values}" dur="${dur}" repeatCount="indefinite" ${extra}/>`
const move = (values: string, dur: string, extra = '') => `<animateTransform attributeName="transform" type="translate" values="${values}" dur="${dur}" repeatCount="indefinite" ${extra}/>`
const BLINK = (y: number, h: number) => anim('height', `${h};${h};${h};0.4;${h}`, '3.2s', `keyTimes="0;0.85;0.9;0.95;1"`) + anim('y', `${y};${y};${y};${y + h / 2};${y}`, '3.2s', `keyTimes="0;0.85;0.9;0.95;1"`)

function eyes(m: Mood): string {
  const white = (x: number, y = 19, w = 5, h = 6) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${CREAM}"/>`
  const pupil = (x: number, y: number, w = 2, h = 3, blink = true) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${INK}">${blink ? BLINK(y, h) : ''}</rect>`
  switch (m) {
    case 'joy':
      return `<path d="M24 23 Q26.5 18.5 29 23 M35 23 Q37.5 18.5 40 23" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>`
    case 'sleep':
      return `<path d="M24 22.5 H29 M35 22.5 H40" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`
    case 'focus':
      return white(24, 21, 5, 3) + white(35, 21, 5, 3) + pupil(26, 21, 2, 3, false) + pupil(37, 21, 2, 3, false)
    case 'fear':
      return white(23, 17, 6, 8) + white(35, 17, 6, 8) + pupil(25.5, 20, 1.5, 2, false) + pupil(37.5, 20, 1.5, 2, false) +
        `<path d="M23 15 L29 13.5 M35 13.5 L41 15" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`
    case 'anger':
      return white(24, 20, 5, 5) + white(35, 20, 5, 5) + pupil(26, 21.5, 2, 2.5, false) + pupil(37, 21.5, 2, 2.5, false) +
        `<path d="M23 16.5 L29.5 19.5 M41 16.5 L34.5 19.5" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`
    case 'sadness':
      return white(24, 20, 5, 5) + white(35, 20, 5, 5) + pupil(26, 22.5, 2, 2.5) + pupil(37, 22.5, 2, 2.5) +
        `<path d="M23.5 19 L29 16.5 M40.5 19 L35 16.5" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`
    case 'disgust':
      return `<path d="M24 22 H29" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>` + white(35, 19, 5, 5) + pupil(36, 20.5, 2, 2.5) +
        `<path d="M34 17 L40.5 15.5" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`
    case 'working':
      return white(24) + white(35) + pupil(27, 22) + pupil(38, 22)
    default:
      return white(24) + white(35) + pupil(26, 21) + pupil(37, 21)
  }
}

function mouth(m: Mood): string {
  switch (m) {
    case 'joy':
      return `<path d="M27.5 25.5 Q32 29.5 36.5 25.5 Z" fill="${INK}"/>`
    case 'anger':
      return `<path d="M28.5 26.5 H35.5" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`
    case 'fear':
      return `<ellipse cx="32" cy="26.5" rx="1.6" ry="1.3" fill="${INK}"/>`
    case 'sadness':
      return `<path d="M29 27.5 Q32 25 35 27.5" stroke="${INK}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`
    case 'disgust':
      return `<path d="M28 26.5 Q30 25 32 26.5 T36 26.5" stroke="${INK}" stroke-width="1.5" fill="none" stroke-linecap="round"/><rect x="32" y="26.6" width="2.6" height="2" rx="1" fill="#e06a8a"/>`
    default:
      return ''
  }
}

/** What floats around the hero: sparkles, steam, sweat, a tear, stink lines, Zs. */
function extras(m: Mood): string {
  const fade = (dur: string, begin = '0s') => anim('opacity', '0;1;1;0', dur, `keyTimes="0;0.2;0.7;1" begin="${begin}"`)
  switch (m) {
    case 'joy':
      return [[8, 12, '0s'], [54, 10, '0.3s'], [50, 30, '0.6s'], [12, 32, '0.9s']]
        .map(([x, y, b]) => `<path d="M${x} ${Number(y) - 3} L${Number(x) + 0.9} ${Number(y) - 0.9} L${Number(x) + 3} ${y} L${Number(x) + 0.9} ${Number(y) + 0.9} L${x} ${Number(y) + 3} L${Number(x) - 0.9} ${Number(y) + 0.9} L${Number(x) - 3} ${y} L${Number(x) - 0.9} ${Number(y) - 0.9} Z" fill="#ffe08a" opacity="0">${fade('1.2s', String(b))}</path>`)
        .join('')
    case 'anger':
      return [[24, '0s'], [40, '0.45s']]
        .map(([x, b]) => `<g opacity="0">${fade('0.9s', String(b))}${move(`0 0;0 -7`, '0.9s', `begin="${b}"`)}<circle cx="${x}" cy="7" r="2.6" fill="${RIM}"/><circle cx="${Number(x) + 2.4}" cy="5" r="1.8" fill="${RIM}"/></g>`)
        .join('')
    case 'fear':
      return `<g>${move('0 0;0 0;0 9', '1.4s', 'keyTimes="0;0.3;1"')}${anim('opacity', '0;1;1;0', '1.4s', 'keyTimes="0;0.3;0.8;1"')}<path d="M44 14 Q46 18 44 19.5 Q42 18 44 14 Z" fill="#9fd0f0"/></g>`
    case 'sadness':
      return `<g>${move('0 0;0 0;0 14', '1.8s', 'keyTimes="0;0.25;1"')}${anim('opacity', '0;1;1;0', '1.8s', 'keyTimes="0;0.25;0.85;1"')}<path d="M26 25 Q27.5 28 26 29.3 Q24.5 28 26 25 Z" fill="#bfe0ff"/></g>`
    case 'disgust':
      return [0, 1, 2]
        .map((i) => `<path d="M${49 + i * 4} 30 q-2 -3 0 -6 q2 -3 0 -6" stroke="#b7d58f" stroke-width="1.3" fill="none" stroke-linecap="round" opacity="0">${fade('1.5s', `${i * 0.4}s`)}${move('0 0;0 -4', '1.5s', `begin="${i * 0.4}s"`)}</path>`)
        .join('')
    case 'sleep':
      return [[44, 12, 6, '0s'], [50, 6, 8, '0.8s']]
        .map(([x, y, s, b]) => `<text x="${x}" y="${y}" font-size="${s}" font-family="Arial Black, sans-serif" font-weight="900" fill="${CREAM}" opacity="0">Z${fade('1.6s', String(b))}${move('0 0;3 -5', '1.6s', `begin="${b}"`)}</text>`)
        .join('')
    default:
      return ''
  }
}

/** Arms: at the sides, typing, or raised in victory. */
function arms(m: Mood, body: string): string {
  if (m === 'joy')
    return `<rect x="10" y="12" width="5" height="12" rx="2" fill="${body}" transform="rotate(-25 12.5 24)"/><rect x="49" y="12" width="5" height="12" rx="2" fill="${body}" transform="rotate(25 51.5 24)"/>`
  if (m === 'working')
    return `<rect x="13" y="30" width="5" height="10" rx="2" fill="${body}">${move('0 0;0 -2;0 0', '0.36s')}</rect><rect x="46" y="30" width="5" height="10" rx="2" fill="${body}">${move('0 -2;0 0;0 -2', '0.36s')}</rect>`
  if (m === 'sadness') return `<rect x="14" y="31" width="5" height="11" rx="2" fill="${body}"/><rect x="45" y="31" width="5" height="11" rx="2" fill="${body}"/>`
  if (m === 'anger') return `<rect x="12" y="28" width="6" height="8" rx="2.5" fill="${body}"/><rect x="46" y="28" width="6" height="8" rx="2.5" fill="${body}"/>`
  return `<rect x="13" y="28" width="5" height="11" rx="2" fill="${body}"/><rect x="46" y="28" width="5" height="11" rx="2" fill="${body}"/>`
}

/** The whole-body motion for each mood. */
function motion(m: Mood): string {
  switch (m) {
    case 'joy':
      return move('0 2;0 -6;0 2', '0.6s')
    case 'anger':
      return move('-1.5 0;1.5 0;-1.5 0', '0.16s')
    case 'fear':
      return move('-0.6 0;0.6 0;-0.6 0', '0.1s')
    case 'sadness':
      return move('0 0;0 2;0 0', '3s')
    case 'disgust':
      return `<animateTransform attributeName="transform" type="rotate" values="0 32 54;-7 32 54;-7 32 54;0 32 54" keyTimes="0;0.3;0.7;1" dur="2.4s" repeatCount="indefinite"/>`
    case 'working':
      return move('0 0;0 -1;0 0', '0.36s')
    case 'focus':
    case 'sleep':
      return move('0 0;0 0.8;0 0', m === 'sleep' ? '3.2s' : '2.4s')
    default:
      return move('0 1;0 -1;0 1', '1.6s')
  }
}

export function mascot(m: Mood): string {
  const body = BODY[m]
  const capeWave = m === 'sadness' || m === 'sleep'
    ? 'M17 20 H47 L55 60 L46 58 L39 61 L32 58 L25 61 L18 58 L9 60 Z'
    : 'M17 20 H47 L58 58 L48 54 L40 60 L32 55 L24 60 L16 54 L6 58 Z;M17 20 H47 L60 54 L50 57 L42 58 L32 57 L22 58 L14 57 L4 54 Z;M17 20 H47 L58 58 L48 54 L40 60 L32 55 L24 60 L16 54 L6 58 Z'
  const cape = capeWave.includes(';')
    ? `<path fill="${INK}" stroke="${RIM}" stroke-width="1.2" stroke-linejoin="round" d="${capeWave.split(';')[0]}">${anim('d', capeWave, m === 'joy' || m === 'anger' ? '0.4s' : '0.8s')}</path>`
    : `<path fill="${INK}" stroke="${RIM}" stroke-width="1.2" stroke-linejoin="round" d="${capeWave}"/>`
  const band = m === 'focus' ? `<rect x="18" y="14.5" width="28" height="3" fill="#c25f3c"/><path d="M46 15 l5 -2 l-1 3 l2 2 l-6 -1 z" fill="#c25f3c"/>` : ''
  return (
    `<g>${motion(m)}` +
    cape +
    `<rect x="18" y="10" width="28" height="38" rx="8" fill="${body}"/>` +
    `<rect x="18" y="10" width="28" height="5" rx="3" fill="${INK}"/><rect x="29" y="15" width="3" height="2" fill="${INK}"/><rect x="31" y="17" width="2" height="2" fill="${INK}"/>` +
    band +
    eyes(m) +
    mouth(m) +
    // the T emblem, a little smaller and lower than on the logo, so the face has room for a mouth
    `<g transform="translate(32 37.5) scale(0.78) translate(-32 -35.5)">` +
    `<path d="M32 28 L40 32 L40 39 L32 43 L24 39 L24 32 Z" fill="${CREAM}" stroke="${INK}" stroke-width="1.6"/>` +
    `<path d="M27.5 32 H36.5 V34.5 H33.3 V40 H30.7 V34.5 H27.5 Z" fill="#c25f3c"/>` +
    `</g>` +
    `<rect x="18" y="44" width="28" height="3" fill="${INK}"/>` +
    arms(m, body) +
    `<rect x="22" y="48" width="7" height="6" fill="${INK}"/><rect x="35" y="48" width="7" height="6" fill="${INK}"/>` +
    `</g>` +
    extras(m)
  )
}

export const mascotSvg = (m: Mood, size = 64) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" shape-rendering="crispEdges">${mascot(m)}</svg>`
