// The fighting-game HUD, drawn as SVG where the surface has Svg (Desktop, VS Code, mobile).
// Pure functions of a plain view: no engine calls, so a preview can render them anywhere.
//   context      -> HP bar, drains as the context fills
//   5h / 7d      -> stamina bars, drain as the plan windows are used
//   prompt cache -> the round timer, minutes left
//   session cost -> score; token-kit savings -> saved, with a KO count
//   costly tool results -> enemies, each with its own health bar

export type HudView = {
  ctxUsed: number | null
  ctxTokens: string
  ctxWindow: string
  five: { used: number; resets: string } | null
  seven: { used: number; resets: string } | null
  cacheLeft: number | null
  round: number
  score: string
  saved: string
  kos: number
  ko: { tokens: string; usd: string } | null
  enemies: { label: string; usd: string; share: number; meta: string }[]
  /** the hero to draw in the portrait, inside a 64-point viewBox; the logo when absent */
  portrait?: string
}

// assets/logo.svg and assets/fight.svg, comments and whitespace stripped
export const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" shape-rendering="crispEdges"><title>SuperTokenMan</title><g><animateTransform attributeName="transform" type="translate" values="0 1;0 -1;0 1" dur="1.6s" repeatCount="indefinite"/><path fill="#141413" stroke="#e8e6dc" stroke-width="1.2" stroke-linejoin="round"><animate attributeName="d" dur="0.8s" repeatCount="indefinite" values="M17 20 H47 L58 58 L48 54 L40 60 L32 55 L24 60 L16 54 L6 58 Z; M17 20 H47 L60 54 L50 57 L42 58 L32 57 L22 58 L14 57 L4 54 Z; M17 20 H47 L58 58 L48 54 L40 60 L32 55 L24 60 L16 54 L6 58 Z"/></path><rect x="18" y="10" width="28" height="38" rx="8" fill="#d97757"/><rect x="18" y="10" width="28" height="5" rx="3" fill="#141413"/><rect x="29" y="15" width="3" height="2" fill="#141413"/><rect x="31" y="17" width="2" height="2" fill="#141413"/><rect x="24" y="19" width="5" height="6" fill="#faf9f5"/><rect x="35" y="19" width="5" height="6" fill="#faf9f5"/><rect x="26" y="21" width="2" height="3" fill="#141413"><animate attributeName="height" values="3;3;3;0.4;3" keyTimes="0;0.85;0.9;0.95;1" dur="3.2s" repeatCount="indefinite"/></rect><rect x="37" y="21" width="2" height="3" fill="#141413"><animate attributeName="height" values="3;3;3;0.4;3" keyTimes="0;0.85;0.9;0.95;1" dur="3.2s" repeatCount="indefinite"/></rect><path d="M32 28 L40 32 L40 39 L32 43 L24 39 L24 32 Z" fill="#faf9f5" stroke="#141413" stroke-width="1.5"/><path d="M27.5 32 H36.5 V34.5 H33.3 V40 H30.7 V34.5 H27.5 Z" fill="#c15f3c"/><rect x="18" y="44" width="28" height="3" fill="#141413"/><rect x="13" y="28" width="5" height="11" rx="2" fill="#d97757"/><rect x="46" y="28" width="5" height="11" rx="2" fill="#d97757"/><rect x="22" y="48" width="7" height="6" fill="#141413"/><rect x="35" y="48" width="7" height="6" fill="#141413"/></g></svg>'
export const FIGHT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 64" width="128" height="64" shape-rendering="crispEdges"><title>SuperTokenMan KO</title><g><animateTransform attributeName="transform" type="translate" dur="1.2s" repeatCount="indefinite" values="0 0;0 0;8 0;8 0;0 0" keyTimes="0;0.3;0.42;0.6;1"/><path d="M9 18 H33 L42 54 L33 51 L27 56 L21 52 L15 56 L9 51 L0 54 Z" fill="#141413" stroke="#e8e6dc" stroke-width="1"/><rect x="9" y="8" width="24" height="34" rx="7" fill="#d97757"/><rect x="9" y="8" width="24" height="5" rx="3" fill="#141413"/><rect x="19" y="13" width="3" height="2" fill="#141413"/><rect x="14" y="17" width="4" height="5" fill="#faf9f5"/><rect x="24" y="17" width="4" height="5" fill="#faf9f5"/><rect x="16" y="19" width="2" height="3" fill="#141413"/><rect x="26" y="19" width="2" height="3" fill="#141413"/><path d="M21 25 L28 28.5 L28 34.5 L21 38 L14 34.5 L14 28.5 Z" fill="#faf9f5" stroke="#141413" stroke-width="1.2"/><path d="M17.2 28.6 H24.8 V30.8 H22.1 V35.5 H19.9 V30.8 H17.2 Z" fill="#c15f3c"/><rect x="13" y="42" width="6" height="5" fill="#141413"/><rect x="23" y="42" width="6" height="5" fill="#141413"/><rect x="33" y="26" height="5" rx="2" fill="#d97757"><animate attributeName="width" dur="1.2s" repeatCount="indefinite" values="5;5;20;20;5" keyTimes="0;0.3;0.42;0.6;1"/></rect></g><g><animateTransform attributeName="transform" type="translate" dur="1.2s" repeatCount="indefinite" values="30 0;8 0;0 0;0 0;30 0" keyTimes="0;0.35;0.45;0.99;1"/><g><animate attributeName="opacity" dur="1.2s" repeatCount="indefinite" values="1;1;0;0;1" keyTimes="0;0.47;0.55;0.99;1"/><circle cx="74" cy="29" r="11" fill="#b0aea5" stroke="#141413" stroke-width="1.2"/><path d="M68 24 L72 26 M80 24 L76 26" stroke="#141413" stroke-width="1.5"/><rect x="70" y="27" width="2" height="2" fill="#141413"/><rect x="76" y="27" width="2" height="2" fill="#141413"/><path d="M70 34 Q74 31 78 34" stroke="#141413" stroke-width="1.2" fill="none"/></g></g><g fill="#d97757" opacity="0"><animate attributeName="opacity" dur="1.2s" repeatCount="indefinite" values="0;0;1;0;0" keyTimes="0;0.44;0.5;0.8;1"/><rect x="72" y="27" width="4" height="4"><animateTransform attributeName="transform" type="translate" dur="1.2s" repeatCount="indefinite" values="0 0;0 0;14 -12;14 -12" keyTimes="0;0.45;0.8;1"/></rect><rect x="72" y="27" width="4" height="4"><animateTransform attributeName="transform" type="translate" dur="1.2s" repeatCount="indefinite" values="0 0;0 0;18 4;18 4" keyTimes="0;0.45;0.8;1"/></rect><rect x="72" y="27" width="3" height="3" fill="#b0aea5"><animateTransform attributeName="transform" type="translate" dur="1.2s" repeatCount="indefinite" values="0 0;0 0;8 14;8 14" keyTimes="0;0.45;0.8;1"/></rect><rect x="72" y="27" width="3" height="3" fill="#b0aea5"><animateTransform attributeName="transform" type="translate" dur="1.2s" repeatCount="indefinite" values="0 0;0 0;10 -18;10 -18" keyTimes="0;0.45;0.8;1"/></rect><rect x="72" y="27" width="3" height="3" fill="#c15f3c"><animateTransform attributeName="transform" type="translate" dur="1.2s" repeatCount="indefinite" values="0 0;0 0;22 -4;22 -4" keyTimes="0;0.45;0.8;1"/></rect></g><text x="100" y="20" font-family="Poppins, Arial, sans-serif" font-weight="700" font-size="14" fill="#c15f3c" text-anchor="middle" opacity="0">KO!<animate attributeName="opacity" dur="1.2s" repeatCount="indefinite" values="0;0;1;1;0" keyTimes="0;0.45;0.5;0.85;1"/></text></svg>'

const C = { ink: '#141413', panel: '#1f1e1b', line: '#3d3c38', track: '#2b2a27', cream: '#faf9f5', gray: '#b0aea5', orange: '#d97757', deep: '#c15f3c', glow: '#f2b49a' }
const BIG = `font-family="'Arial Black','Helvetica Neue',Arial,sans-serif" font-weight="900" font-style="italic"`
const MONO = `font-family="ui-monospace,'SF Mono',Menlo,monospace" font-weight="700"`

const inner = (svg: string) => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '').replace(/<title>[^<]*<\/title>/, '')
const MASCOT = inner(LOGO)
const SCENE = inner(FIGHT)

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const pct = (n: number) => `${Math.round(n)}%`

const DEFS =
  `<defs>` +
  `<linearGradient id="hp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.glow}"/><stop offset=".45" stop-color="${C.orange}"/><stop offset="1" stop-color="#a94f30"/></linearGradient>` +
  `<linearGradient id="st" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.cream}"/><stop offset="1" stop-color="${C.gray}"/></linearGradient>` +
  `<linearGradient id="foe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e08a6c"/><stop offset="1" stop-color="#8f3f24"/></linearGradient>` +
  `</defs>`

/**
 * A fighting-game bar: a slanted track, `left` (0..1) filled from the left, ticks every 10%.
 * Below a quarter the fill turns deep terracotta and flashes.
 */
function bar(x: number, y: number, w: number, h: number, left: number, fill: string, ticks = true) {
  const s = Math.round(h * 0.6)
  const p = Math.max(0, Math.min(1, left))
  const shape = (width: number) => `M${x + s} ${y} H${x + width + s} L${x + width} ${y + h} H${x} Z`
  const low = p < 0.25
  let out = `<path d="${shape(w)}" fill="${C.track}"/>`
  if (p > 0)
    out += `<path d="${shape(Math.max(s, w * p))}" fill="${low ? C.deep : fill}">${low ? '<animate attributeName="opacity" values="1;.35;1" dur=".9s" repeatCount="indefinite"/>' : ''}</path>`
  out += `<path d="M${x + s} ${y + 1.5} H${x + Math.max(s, w * p) + s - 1}" stroke="#fff" stroke-opacity="${p > 0 ? 0.28 : 0}" stroke-width="1"/>`
  if (ticks) {
    let d = ''
    for (let i = 1; i < 10; i++) {
      const tx = x + (w * i) / 10
      d += `M${tx + s} ${y} L${tx} ${y + h} `
    }
    out += `<path d="${d}" stroke="${C.ink}" stroke-opacity=".5" stroke-width="1"/>`
  }
  return out + `<path d="${shape(w)}" fill="none" stroke="${C.line}" stroke-width="1"/>`
}

const text = (x: number, y: number, size: number, fill: string, body: string, font = BIG, anchor = 'start', extra = '') =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" ${font} ${extra}>${body}</text>`

const portrait = (x: number, y: number, size: number, hero = MASCOT) =>
  `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size / 8}" fill="${C.panel}" stroke="${C.orange}" stroke-width="2"/>` +
  `<g transform="translate(${x + size * 0.06} ${y + size * 0.06}) scale(${(size * 0.88) / 64})">${hero}</g>`

/** The KO screen: the fight loop, a stamp that pops in, and what was knocked out. */
function koOverlay(w: number, h: number, ko: NonNullable<HudView['ko']>) {
  const cy = h / 2
  return (
    `<g><rect width="${w}" height="${h}" rx="10" fill="${C.ink}" fill-opacity=".92"/>` +
    `<g transform="translate(${w * 0.2} ${cy - 30}) scale(.94)">${SCENE}</g>` +
    `<g transform="translate(${w * 0.2 + 150} ${cy + 13})"><g>` +
    `<animateTransform attributeName="transform" type="scale" values="2.2;.9;1.06;1" keyTimes="0;.5;.8;1" dur=".35s" fill="freeze"/>` +
    text(0, 0, 36, C.orange, 'K.O.', BIG, 'start', `stroke="${C.cream}" stroke-width="1.2" paint-order="stroke"`) +
    `</g></g>` +
    text(w * 0.2 + 260, cy - 4, 15, C.cream, `-${esc(ko.tokens)} WASTED TOKENS`) +
    text(w * 0.2 + 260, cy + 16, 13, C.orange, `+${esc(ko.usd)} NOT WRITTEN`) +
    `</g>`
  )
}

/** The band above the prompt: portrait, HP and stamina, the round timer, score and saved. 720 x 72. */
export function hudBand(v: HudView) {
  const W = 720
  const H = 72
  const hpLeft = v.ctxUsed == null ? 1 : 1 - v.ctxUsed / 100
  const cold = v.cacheLeft != null && v.cacheLeft <= 0
  const timer = v.cacheLeft == null ? '--' : cold ? '00' : String(Math.min(99, v.cacheLeft)).padStart(2, '0')
  const stamina = (x: number, label: string, l: HudView['five']) =>
    l
      ? bar(x, 47, 140, 6, 1 - l.used / 100, 'url(#st)', false) + text(x, 66, 9, C.gray, `${label} ${pct(100 - l.used)} LEFT${l.resets ? `  ·  ${esc(l.resets)}` : ''}`, MONO)
      : text(x, 66, 9, C.gray, `${label} --`, MONO)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${DEFS}` +
    `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="10" fill="${C.ink}" stroke="${C.line}"/>` +
    portrait(8, 8, 56, v.portrait) +
    text(76, 20, 11, C.orange, 'SUPERTOKENMAN', BIG, 'start', 'letter-spacing="1.2"') +
    text(392, 20, 9, C.gray, v.ctxUsed == null ? 'HP --' : `HP ${pct(hpLeft * 100)}  ·  ${esc(v.ctxTokens)}/${esc(v.ctxWindow)}`, MONO, 'end') +
    bar(76, 25, 310, 15, hpLeft, 'url(#hp)') +
    stamina(76, '5H', v.five) +
    stamina(240, '7D', v.seven) +
    // the round timer: minutes of warm prompt cache
    `<rect x="408" y="8" width="72" height="56" rx="8" fill="${C.panel}" stroke="${cold ? C.deep : C.line}" stroke-width="${cold ? 2 : 1}"/>` +
    text(444, 21, 8, C.gray, 'CACHE', MONO, 'middle', 'letter-spacing="1.5"') +
    `<g>${cold ? '<animate attributeName="opacity" values="1;.25;1" dur="1s" repeatCount="indefinite"/>' : ''}` +
    text(444, 52, 30, cold ? C.deep : C.cream, timer, BIG, 'middle') +
    `</g>` +
    // round and score
    text(500, 21, 8, C.gray, 'ROUND', MONO, 'start', 'letter-spacing="1.5"') +
    text(500, 50, 24, C.cream, String(v.round), BIG) +
    text(708, 21, 8, C.gray, 'SCORE', MONO, 'end', 'letter-spacing="1.5"') +
    text(708, 44, 20, C.cream, esc(v.score), BIG, 'end') +
    text(708, 63, 11, C.orange, `SAVED ${esc(v.saved)}  ·  ${v.kos} KO`, BIG, 'end') +
    (v.ko ? koOverlay(W, H, v.ko) : '') +
    `</svg>`
  )
}

/** The details pane: a character sheet, the KO banner while a fight plays, then the enemies. 400 wide. */
export function hudPane(v: HudView) {
  const W = 400
  let y = 0
  let body = ''
  // header
  body += portrait(16, 16, 88, v.portrait)
  body += text(120, 38, 19, C.orange, 'SUPERTOKENMAN', BIG, 'start', 'letter-spacing="1"')
  body += text(120, 56, 9, C.gray, `TOKEN FIGHTER  ·  ROUND ${v.round}`, MONO, 'start', 'letter-spacing="1"')
  body += text(120, 78, 8, C.gray, 'SCORE', MONO, 'start', 'letter-spacing="1.5"')
  body += text(120, 101, 22, C.cream, esc(v.score), BIG)
  body += text(256, 78, 8, C.gray, 'SAVED', MONO, 'start', 'letter-spacing="1.5"')
  body += text(256, 99, 17, C.orange, esc(v.saved), BIG)
  body += text(384, 99, 11, C.cream, `${v.kos} KO`, BIG, 'end')
  y = 120

  if (v.ko) {
    body +=
      `<rect x="16" y="${y}" width="${W - 32}" height="74" rx="8" fill="${C.panel}" stroke="${C.deep}" stroke-width="2"/>` +
      `<g transform="translate(22 ${y + 6}) scale(.95)">${SCENE}</g>` +
      text(160, y + 36, 26, C.orange, 'K.O.!', BIG, 'start', `stroke="${C.cream}" stroke-width="1" paint-order="stroke"`) +
      text(160, y + 56, 11, C.cream, `-${esc(v.ko.tokens)} WASTED TOKENS  +${esc(v.ko.usd)}`, BIG)
    y += 88
  }

  const section = (title: string, note = '') => {
    let out = text(16, y + 12, 10, C.cream, title, BIG, 'start', 'letter-spacing="1.5"')
    if (note) out += text(384, y + 12, 8, C.gray, note, MONO, 'end')
    out += `<path d="M16 ${y + 18} H384" stroke="${C.line}"/>`
    y += 28
    return out
  }
  const row = (label: string, left: number | null, value: string, caption: string, fill: string) => {
    let out = text(16, y + 14, 13, C.cream, label, BIG)
    out += left == null ? bar(62, y + 3, 260, 12, 0, fill) : bar(62, y + 3, 260, 12, left, fill)
    out += text(384, y + 14, 13, left != null && left < 0.25 ? C.deep : C.cream, value, BIG, 'end')
    out += text(62, y + 30, 9, C.gray, caption, MONO)
    y += 40
    return out
  }

  body += section('STATS', 'BARS DRAIN AS YOU SPEND')
  body += row('HP', v.ctxUsed == null ? null : 1 - v.ctxUsed / 100, v.ctxUsed == null ? '--' : pct(100 - v.ctxUsed), v.ctxUsed == null ? 'context: no reply yet' : `context: ${esc(v.ctxTokens)} of ${esc(v.ctxWindow)} used`, 'url(#hp)')
  if (v.five) body += row('5H', 1 - v.five.used / 100, pct(100 - v.five.used), `plan window${v.five.resets ? `: resets ${esc(v.five.resets)}` : ''}`, 'url(#st)')
  if (v.seven) body += row('7D', 1 - v.seven.used / 100, pct(100 - v.seven.used), `weekly window${v.seven.resets ? `: resets ${esc(v.seven.resets)}` : ''}`, 'url(#st)')
  const cold = v.cacheLeft != null && v.cacheLeft <= 0
  body += row(
    'TIME',
    v.cacheLeft == null ? null : Math.max(0, v.cacheLeft) / 60,
    v.cacheLeft == null ? '--' : cold ? 'COLD' : `${v.cacheLeft}m`,
    v.cacheLeft == null ? 'prompt cache: not written yet' : cold ? `cache cold: the next message re-reads ${esc(v.ctxTokens)} at full price` : 'prompt cache warm: a reply resets the hour',
    'url(#st)',
  )

  y += 6
  body += section('BIGGEST ENEMIES', 'WRITTEN ONCE, RE-READ EVERY REQUEST')
  if (!v.enemies.length) {
    body += text(16, y + 12, 10, C.gray, 'NO ENEMIES YET', MONO)
    y += 24
  }
  for (const e of v.enemies) {
    body +=
      `<g transform="translate(26 ${y + 12})"><circle r="9" fill="${C.gray}" stroke="${C.ink}"/><path d="M-5 -4 L-2 -2 M5 -4 L2 -2" stroke="${C.ink}" stroke-width="1.4"/><rect x="-3" y="-1" width="1.6" height="1.6" fill="${C.ink}"/><rect x="1.4" y="-1" width="1.6" height="1.6" fill="${C.ink}"/><path d="M-3 4 Q0 2 3 4" stroke="${C.ink}" fill="none"/></g>` +
      text(44, y + 10, 11, C.cream, esc(clip(e.label, 34)), MONO) +
      text(384, y + 10, 12, C.orange, esc(e.usd), BIG, 'end') +
      bar(44, y + 15, 334, 5, e.share, 'url(#foe)', false) +
      text(44, y + 32, 8, C.gray, esc(e.meta), MONO)
    y += 40
  }
  y += 8
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${y}" width="${W}" height="${y}">${DEFS}<rect x=".5" y=".5" width="${W - 1}" height="${y - 1}" rx="12" fill="${C.ink}" stroke="${C.line}"/>${body}</svg>`
}
