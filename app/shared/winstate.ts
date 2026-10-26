// Where the window was: bounds and maximized, put back on start, moved onto a screen that still exists
// when the monitor it was on is gone (phase 79).
export type Rect = { x: number; y: number; width: number; height: number }
export type WinState = Rect & { maximized: boolean; fullscreen?: boolean }

const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))

/**
 * The saved bounds if enough of the window (its title bar strip and 1/4 of its area) is on a screen;
 * else the same size, shrunk to fit, centred on the primary screen.
 */
export function clampBounds(saved: Rect, screens: Rect[], min = { width: 760, height: 520 }): Rect {
  const w = Math.max(min.width, saved.width)
  const h = Math.max(min.height, saved.height)
  const bar: Rect = { x: saved.x, y: saved.y, width: w, height: 40 }
  const ok = screens.some((s) => overlap(bar, s) >= Math.min(200, w) * 20 && overlap({ ...saved, width: w, height: h }, s) >= (w * h) / 4)
  if (ok) return { x: saved.x, y: saved.y, width: w, height: h }
  const p = screens[0] ?? { x: 0, y: 0, width: 1440, height: 900 }
  const fw = Math.min(w, p.width)
  const fh = Math.min(h, p.height)
  return { x: Math.round(p.x + (p.width - fw) / 2), y: Math.round(p.y + (p.height - fh) / 2), width: fw, height: fh }
}

export function parseState(text: string | null): WinState | null {
  try {
    const s = JSON.parse(text ?? '') as WinState
    return [s.x, s.y, s.width, s.height].every((n) => Number.isFinite(n)) ? s : null
  } catch {
    return null
  }
}
