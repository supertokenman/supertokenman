import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

/** Below this many items everything is drawn, as before: windowing only for a long transcript. */
export const WINDOW_FROM = 300
/** Height guessed for an item not drawn yet; a drawn item keeps its measured height. */
const GUESS = 160

/** The drawn range: items from `start` up to `end`, with what to leave as space above and below. */
export function rangeOf(heights: number[], top: number, bottom: number): { start: number; end: number } {
  let y = 0
  let start = heights.length
  let end = heights.length
  for (let i = 0; i < heights.length; i++) {
    const h = heights[i]!
    if (start === heights.length && y + h > top) start = i
    if (y > bottom) { end = i; break }
    y += h
  }
  return { start: Math.min(start, end), end }
}

/**
 * A long list drawn only near the view of its scroller (`scroller`), plus two screens above and below,
 * with the rest held as space at the measured (or guessed) height. Items are the scroller's flex
 * children as before (a `display: contents` wrapper), each item one element. Heights come from a
 * ResizeObserver, so code blocks, images and folds that change size are followed; scroll anchoring
 * keeps the view still when an item above it is measured.
 */
export function Windowed({ scroller, keys, children }: { scroller: RefObject<HTMLElement | null>; keys: string[]; children: (i: number) => ReactNode }) {
  const gapRef = useRef(0)
  const on = keys.length >= WINDOW_FROM
  const list = useRef<HTMLDivElement>(null)
  const sizes = useRef(new Map<string, number>())
  const [range, setRange] = useState<{ start: number; end: number }>(() => ({ start: Math.max(0, keys.length - 40), end: keys.length }))
  const keysRef = useRef(keys)
  keysRef.current = keys

  const drawn = useRef(range)
  drawn.current = range
  const update = useCallback((force = false) => {
    const el = scroller.current
    const ls = list.current
    if (!el || !ls) return
    const ks = keysRef.current
    // the list's place in the scroller, from its first element (the wrapper has no box)
    const first = ls.firstElementChild
    const view = el.getBoundingClientRect()
    const at = first ? first.getBoundingClientRect().top - view.top : 0
    const screen = Math.max(el.clientHeight, 400)
    const heights = ks.map((k) => sizes.current.get(k) ?? GUESS)
    // what is drawn still covers half a screen above the view and one below: nothing to do. So the
    // list is drawn again about once a screen of scrolling, not on every frame.
    const { start, end } = drawn.current
    if (!force && end <= ks.length) {
      let top = 0
      for (let i = 0; i < start; i++) top += heights[i]!
      let bottom = top
      for (let i = start; i < end; i++) bottom += heights[i]!
      if ((start === 0 || top <= -at - screen / 2) && (end === ks.length || bottom >= -at + 2 * screen)) return
    }
    const r = rangeOf(heights, -at - 2 * screen, -at + 3 * screen)
    setRange((p) => (p.start === r.start && p.end === r.end ? p : r))
  }, [scroller])

  // follow the scroll, once a frame at most
  useEffect(() => {
    const el = scroller.current
    if (!el || !on) return
    let raf = 0
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update() }) }
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(onScroll) // shown again after the preview or terminal tab, or resized
    ro.observe(el)
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); cancelAnimationFrame(raf) }
  }, [scroller, update, on])

  // a new line: draw what is in view now (the newest line when at the bottom, for stick-to-bottom)
  useLayoutEffect(() => { if (on) update(true) }, [keys.length, on, update])

  // measure every drawn item, now and whenever it changes size
  const start = on ? range.start : 0
  const end = on ? Math.min(range.end, keys.length) : keys.length
  useLayoutEffect(() => {
    const ls = list.current
    if (!ls || !on) return
    const gap = (gapRef.current = parseFloat(getComputedStyle(ls.parentElement ?? ls).rowGap) || 0)
    const items = Array.from(ls.children).filter((c) => !(c as HTMLElement).dataset.spacer) as HTMLElement[]
    const ro = new ResizeObserver((entries) => {
      let changed = false
      for (const e of entries) {
        const k = (e.target as HTMLElement).dataset.wk
        const h = Math.round((e.target as HTMLElement).offsetHeight) + gap
        if (k && sizes.current.get(k) !== h) { sizes.current.set(k, h); changed = true }
      }
      if (changed) update()
    })
    items.forEach((it, j) => { const k = keys[start + j]; if (k) { it.dataset.wk = k; ro.observe(it) } })
    return () => ro.disconnect()
  }, [start, end, keys, on, update])

  if (!on) return <div ref={list} style={{ display: 'contents' }}>{keys.map((_, i) => children(i))}</div>
  const gap = gapRef.current
  const space = (from: number, to: number) => {
    let h = 0
    for (let i = from; i < to; i++) h += sizes.current.get(keys[i]!) ?? GUESS
    return h - gap // the space is a flex item too, and the column puts a gap after it
  }
  const out: ReactNode[] = []
  for (let i = start; i < end; i++) out.push(children(i))
  return (
    <div ref={list} style={{ display: 'contents' }}>
      {start > 0 && <div data-spacer="1" aria-hidden style={{ height: space(0, start), flexShrink: 0 }} />}
      {out}
      {end < keys.length && <div data-spacer="1" aria-hidden style={{ height: space(end, keys.length), flexShrink: 0 }} />}
    </div>
  )
}
