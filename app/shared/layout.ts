export type Layout = 'auto' | 'grid' | 'columns' | 'canvas'
export const LAYOUTS: { id: Layout; name: string; what: string }[] = [
  { id: 'auto', name: 'Auto', what: 'Side by side up to three; four make a 2 by 2 grid' },
  { id: 'grid', name: 'Grid', what: 'Always the squarest grid' },
  { id: 'columns', name: 'Columns', what: 'All side by side in one row' },
  { id: 'canvas', name: 'Canvas', what: 'Cards you move, pan and zoom, with their links drawn' },
]

/** The narrowest a panel gets before more columns stop helping: a chat column and its margins. */
export const MIN_PANEL_W = 520
export type Screen = { w: number; h: number }
/** A wide monitor (ultrawide, 1440p and up) fits four panels side by side. */
export const isWide = (s?: Screen) => Boolean(s && s.w >= 2400 && s.w / Math.max(1, s.h) >= 1.5)
/** A monitor turned on its side: tall enough that three panels stacked still read well. */
export const isTall = (s?: Screen) => Boolean(s && s.h >= 1600 && s.h / Math.max(1, s.w) >= 1.4)

/** Columns and rows for n panels; a portrait window stacks them, a wide one goes to four across. */
export function arrange(n: number, layout: Layout, portrait = false, screen?: Screen): { cols: number; rows: number } {
  const count = Math.max(1, n)
  let cols: number
  if (portrait) cols = count <= (isTall(screen) ? 3 : 2) ? 1 : 2
  else if (layout === 'columns') cols = count
  else if (layout === 'grid') cols = Math.ceil(Math.sqrt(count))
  else if (isWide(screen)) cols = Math.min(4, count)
  else cols = count === 4 ? 2 : Math.min(3, count)
  // never narrower than a panel can be: extra panels wrap to another row
  if (screen) cols = Math.max(1, Math.min(cols, Math.floor(screen.w / MIN_PANEL_W)))
  return { cols, rows: Math.ceil(count / cols) }
}
