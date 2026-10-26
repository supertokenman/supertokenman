// What the tour scene draws at any second, from the recording's track (scripts/tour/record.mjs):
// where the cursor is, how pressed it is, the click ripple, where the camera looks, and how much
// of each step's line has been said. Pure functions of time, so the picture never drifts.

const ease = (v) => (v < 0.5 ? 4 * v ** 3 : 1 - (-2 * v + 2) ** 3 / 2)
const clamp01 = (v) => Math.max(0, Math.min(1, v))

/** The cursor in app pixels (CSS), following the logged moves. */
export function cursorAt(track, t) {
  let at = track.cursor0
  for (const e of track.events) {
    if (e.e !== 'move') continue
    if (t < e.t0) break
    if (t >= e.t1) at = e.to
    else {
      const v = ease((t - e.t0) / (e.t1 - e.t0))
      return [e.from[0] + (e.to[0] - e.from[0]) * v, e.from[1] + (e.to[1] - e.from[1]) * v]
    }
  }
  return at
}

/** 0 at rest, 1 fully pressed: down fast before the click, back up with a small overshoot after. */
export function pressAt(track, t) {
  for (const e of track.events) {
    if (e.e !== 'click') continue
    const d = t - e.t
    if (d > -0.12 && d < 0) return clamp01((d + 0.12) / 0.12)
    if (d >= 0 && d < 0.3) return 1 - ease(d / 0.3)
  }
  return 0
}

/** The ripple of the latest click: radius 0..1 and opacity, or null. */
export function rippleAt(track, t) {
  let last = null
  for (const e of track.events) if (e.e === 'click' && e.t <= t && t - e.t < 0.6) last = e
  if (!last) return null
  const v = (t - last.t) / 0.6
  return { at: last.at, r: 1 - (1 - v) ** 3, a: 1 - v }
}

/**
 * The camera: a zoom and the point it looks at (app pixels). Each step with a target eases there
 * as it starts; a step without one pulls back to the whole app.
 */
export function cameraAt(track, t, MOVE = 1.0) {
  // a recording with zoom regions (found from its clicks, maybe edited) follows them instead
  if (Array.isArray(track.zoom)) return cameraFromRegions(track, track.zoom, t)
  const W = track.width
  const H = track.height
  const pose = (box) => {
    if (!box) return { z: 1, x: W / 2, y: H / 2 }
    // a wide target (a text field, a toolbar) is framed around where the cursor lands, its left part
    const w = Math.min(box.w, 520)
    const z = Math.max(1, Math.min(1.9, (W * 0.42) / Math.max(140, w), (H * 0.5) / Math.max(90, box.h)))
    const hw = W / 2 / z
    const hh = H / 2 / z
    return { z, x: Math.max(hw, Math.min(W - hw, box.x + w / 2)), y: Math.max(hh, Math.min(H - hh, box.y + box.h / 2)) }
  }
  let cur = pose(null)
  for (const s of track.steps) {
    if (t < s.start) break
    const next = pose(s.kind === 'look' && s.box && s.box.w > W * 0.6 ? null : s.box)
    const v = ease(clamp01((t - s.start) / MOVE))
    cur = { z: cur.z + (next.z - cur.z) * v, x: cur.x + (next.x - cur.x) * v, y: cur.y + (next.y - cur.y) * v }
  }
  // the last beat: back to the whole app
  const last = track.steps[track.steps.length - 1]
  if (last && t > last.end) {
    const v = ease(clamp01((t - last.end) / MOVE))
    const all = pose(null)
    cur = { z: cur.z + (all.z - cur.z) * v, x: cur.x + (all.x - cur.x) * v, y: cur.y + (all.y - cur.y) * v }
  }
  return cur
}

/** The step on screen at t, and how many of its words have been said. */
export function captionAt(track, t) {
  let i = -1
  track.steps.forEach((s, k) => {
    if (t >= s.start) i = k
  })
  if (i < 0) return null
  const s = track.steps[i]
  const words = (s.say ?? '').split(/\s+/).filter(Boolean)
  let said = words.length
  if (s.voice?.words?.length) {
    const since = t - s.voice.at
    said = s.voice.words.filter((w) => w.s <= since).length
  }
  return { i, said: Math.min(said, words.length), since: t - s.start, left: s.end - t }
}

/**
 * Phase 103: zoom regions found from the clicks alone, for recordings without scripted targets.
 * Clicks close in time and place make one region; each starts a little before its first click,
 * holds a little after its last, and lasts at least minDur. The result is plain JSON, kept next to
 * the recording, so a region can be deleted or nudged by hand before rendering.
 */
export function zoomRegions(track, o = {}) {
  const gap = o.gap ?? 1.6
  const near = o.near ?? 260
  const lead = o.lead ?? 0.6
  const hold = o.hold ?? 1.2
  const minDur = o.minDur ?? 1.8
  const z = o.z ?? 1.6
  const clicks = track.events.filter((e) => e.e === 'click').sort((a, b) => a.t - b.t)
  const groups = []
  for (const c of clicks) {
    const g = groups[groups.length - 1]
    const last = g?.[g.length - 1]
    if (last && c.t - last.t <= gap && Math.hypot(c.at[0] - last.at[0], c.at[1] - last.at[1]) <= near) g.push(c)
    else groups.push([c])
  }
  const out = groups.map((g) => {
    const start = Math.max(0, g[0].t - lead)
    const end = Math.max(g[g.length - 1].t + hold, start + minDur)
    const x = g.reduce((a, c) => a + c.at[0], 0) / g.length
    const y = g.reduce((a, c) => a + c.at[1], 0) / g.length
    return { start: +start.toFixed(2), end: +end.toFixed(2), x: Math.round(x), y: Math.round(y), z }
  })
  // regions that would overlap are joined, so the camera never jumps between two at once
  const merged = []
  for (const r of out) {
    const p = merged[merged.length - 1]
    if (p && r.start < p.end) merged[merged.length - 1] = { ...p, end: Math.max(p.end, r.end), x: Math.round((p.x + r.x) / 2), y: Math.round((p.y + r.y) / 2) }
    else merged.push(r)
  }
  return merged
}

/** The camera from zoom regions: eases in at each start, out at each end, framed inside the app. */
export function cameraFromRegions(track, regions, t, MOVE = 0.6) {
  const W = track.width
  const H = track.height
  const whole = { z: 1, x: W / 2, y: H / 2 }
  const frame = (r) => {
    const hw = W / 2 / r.z
    const hh = H / 2 / r.z
    return { z: r.z, x: Math.max(hw, Math.min(W - hw, r.x)), y: Math.max(hh, Math.min(H - hh, r.y)) }
  }
  const mix = (a, b, v) => ({ z: a.z + (b.z - a.z) * v, x: a.x + (b.x - a.x) * v, y: a.y + (b.y - a.y) * v })
  for (const r of regions) {
    if (t < r.start || t > r.end + MOVE) continue
    const f = frame(r)
    if (t <= r.start + MOVE) return mix(whole, f, ease(clamp01((t - r.start) / MOVE)))
    if (t <= r.end) return f
    return mix(f, whole, ease(clamp01((t - r.end) / MOVE)))
  }
  return whole
}
