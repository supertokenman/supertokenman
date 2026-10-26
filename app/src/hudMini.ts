// The panel meter: one slim strip above the chat. Context left, the plan's 5-hour and 7-day windows, the
// prompt cache timer, and what the panel has cost and saved. Flat bars, square edges and the 45 degree cut
// at the top right; no mascot, no game words. Drawn in the Claude Dark colors and re-coloured per theme
// by themed().
import type { HudView } from '../../token-kit/mod/supertokenman/hooks/hud'

const C = { ink: '#141413', panel: '#1f1e1b', line: '#3d3c38', track: '#2b2a27', cream: '#faf9f5', gray: '#b0aea5', orange: '#d97757', deep: '#c15f3c' }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const MONO = `font-family="ui-monospace,'SF Mono',Menlo,monospace" font-weight="500" letter-spacing=".08em"`
const NUM = `font-family="'SuperToken Display',ui-monospace,monospace" font-weight="400" letter-spacing=".02em"`

/** A flat bar, `left` 0..1 filled; a quarter or less turns the deep accent. */
function bar(x: number, y: number, w: number, h: number, left: number, fill: string) {
  const p = Math.max(0, Math.min(1, left))
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.track}"/>` + (p > 0 ? `<rect x="${x}" y="${y}" width="${Math.max(1, w * p)}" height="${h}" fill="${p < 0.25 ? C.deep : fill}"/>` : '')
}

/** 480 x 36, scaled to the panel's width. */
export function hudMini(v: HudView) {
  const W = 480
  const H = 36
  const cut = 8
  const left = v.ctxUsed == null ? null : 100 - v.ctxUsed
  const cold = v.cacheLeft != null && v.cacheLeft <= 0
  const timer = v.cacheLeft == null ? '--' : cold ? '0m' : `${Math.min(99, v.cacheLeft)}m`
  const win = (x: number, label: string, l: HudView['five']) =>
    `<text x="${x}" y="30" font-size="6.5" fill="${C.gray}" ${MONO}>${label}</text>` + bar(x + 16, 26, 56, 3, l ? 1 - l.used / 100 : 0, C.cream)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<path d="M.5 .5 H${W - cut - 0.5} L${W - 0.5} ${cut + 0.5} V${H - 0.5} H.5 Z" fill="${C.ink}" stroke="${C.line}"/>` +
    `<text x="12" y="13" font-size="6.5" fill="${C.gray}" ${MONO}>CONTEXT</text>` +
    bar(56, 8, 186, 5, left == null ? 1 : left / 100, C.orange) +
    `<text x="250" y="13.5" font-size="8.5" fill="${left != null && left < 25 ? C.deep : C.cream}" ${NUM}>${left == null ? '--' : `${Math.round(left)}%`}</text>` +
    `<text x="250" y="30" font-size="6.5" fill="${C.gray}" ${MONO}>${esc(v.ctxTokens)}</text>` +
    win(12, '5H', v.five) +
    win(96, '7D', v.seven) +
    `<text x="186" y="30" font-size="6.5" fill="${C.gray}" ${MONO}>CACHE</text>` +
    `<text x="214" y="30" font-size="6.5" fill="${cold ? C.deep : C.cream}" ${MONO}>${timer}</text>` +
    `<line x1="318" y1="7" x2="318" y2="29" stroke="${C.line}"/>` +
    `<text x="${W - 12}" y="17" font-size="13" fill="${C.cream}" ${NUM} text-anchor="end">${esc(v.score)}</text>` +
    `<text x="${W - 12}" y="29" font-size="6.5" fill="${C.orange}" ${MONO} text-anchor="end">SAVED ${esc(v.saved)}</text>` +
    `</svg>`
  )
}
