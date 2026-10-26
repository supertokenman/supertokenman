import { describe, expect, it } from 'vitest'
import { cameraAt, captionAt, cursorAt, pressAt, rippleAt } from './tourTrack.js'

const track = {
  width: 1440,
  height: 900,
  cursor0: [1320, 820],
  steps: [
    { title: 'Look', say: 'One panel per project.', kind: 'look', box: null, start: 0.5, end: 3, voice: null },
    { title: 'Type', say: 'Type what you need.', kind: 'type', box: { x: 300, y: 820, w: 400, h: 40 }, start: 3, end: 7, voice: { at: 3.3, seconds: 1.5, words: [{ w: 'Type', s: 0, e: 0.3 }, { w: 'what', s: 0.3, e: 0.6 }, { w: 'you', s: 0.6, e: 0.8 }, { w: 'need.', s: 0.8, e: 1.2 }] } },
  ],
  events: [
    { e: 'move', t0: 3.4, t1: 4.4, from: [1320, 820], to: [360, 840] },
    { e: 'click', t: 4.6, at: [360, 840] },
  ],
}

describe('tour track', () => {
  it('moves the cursor along the logged path and rests where it ended', () => {
    expect(cursorAt(track, 1)).toEqual([1320, 820])
    const mid = cursorAt(track, 3.9)
    expect(mid[0]).toBeCloseTo(840, 0)
    expect(cursorAt(track, 6)).toEqual([360, 840])
  })
  it('presses just before the click and lets go after, with a ripple', () => {
    expect(pressAt(track, 4.0)).toBe(0)
    expect(pressAt(track, 4.6)).toBe(1)
    expect(pressAt(track, 5.2)).toBe(0)
    expect(rippleAt(track, 4.9)?.at).toEqual([360, 840])
    expect(rippleAt(track, 5.4)).toBeNull()
  })
  it('zooms to the step target and stays inside the app', () => {
    const c = cameraAt(track, 5)
    expect(c.z).toBeGreaterThan(1.4)
    expect(c.y + 900 / 2 / c.z).toBeLessThanOrEqual(900.001)
    expect(cameraAt(track, 1).z).toBe(1)
    expect(cameraAt(track, 9).z).toBeCloseTo(1)
  })
  it('reveals the words as they are said', () => {
    expect(captionAt(track, 3.35)?.said).toBe(1)
    expect(captionAt(track, 3.95)?.said).toBe(3)
    expect(captionAt(track, 1)?.said).toBe(4)
  })
})

describe('auto zoom from clicks', () => {
  const rec = {
    width: 1440,
    height: 900,
    cursor0: [0, 0],
    steps: [],
    events: [
      { e: 'click', t: 2.0, at: [300, 200] },
      { e: 'click', t: 2.8, at: [380, 240] },
      { e: 'click', t: 3.4, at: [1300, 850] },
      { e: 'click', t: 9.0, at: [700, 450] },
    ],
  }
  it('groups clicks close in time and place, with lead, hold and a minimum length', async () => {
    const { zoomRegions } = await import('./tourTrack.js')
    expect(zoomRegions(rec)).toEqual([
      { start: 1.4, end: 4.6, x: 820, y: 535, z: 1.6 },
      { start: 8.4, end: 10.2, x: 700, y: 450, z: 1.6 },
    ])
    // apart in place, the first two and the third would be two regions; they overlap in time, so they join
    expect(zoomRegions(rec, { near: 100 }).length).toBe(2)
  })
  it('the camera eases in, holds, eases out and stays in the frame', async () => {
    const { cameraFromRegions, cameraAt } = await import('./tourTrack.js')
    const regions = [{ start: 1, end: 3, x: 1400, y: 880, z: 2 }]
    expect(cameraFromRegions(rec, regions, 0.5)).toEqual({ z: 1, x: 720, y: 450 })
    const held = cameraFromRegions(rec, regions, 2)
    expect(held.z).toBe(2)
    expect(held.x).toBe(1440 - 1440 / 4)
    expect(held.y).toBe(900 - 900 / 4)
    expect(cameraFromRegions(rec, regions, 5)).toEqual({ z: 1, x: 720, y: 450 })
    expect(cameraAt({ ...rec, zoom: regions }, 2)).toEqual(held)
  })
})
