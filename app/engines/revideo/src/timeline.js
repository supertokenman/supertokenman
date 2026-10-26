// The video's timeline, shared by the scene and the render script: each segment lasts as long as its
// narration needs (plus room to breathe), or its default when there is no voice.

/** @typedef {{ key: string, kind: 'hook'|'product'|'stat'|'quote'|'point'|'cta', index?: number, start: number, dur: number, say?: string, voice?: number, words?: { w: string, s: number, e: number }[] }} Segment */

const LEAD = 0.2 // the voice starts a beat after the cut

/** The segments of a video, in order, with what each one says. */
export function segments(d) {
  /** @type {{ key: string, kind: Segment['kind'], index?: number, say?: string, min: number }[]} */
  const s = [{ key: 'hook', kind: 'hook', say: d.say?.hook, min: 2.4 }]
  if (d.template === 'launch' && d.product) s.push({ key: 'product', kind: 'product', say: d.product.say, min: 2.6 })
  if (d.template === 'stat' && d.stat) s.push({ key: 'stat', kind: 'stat', say: d.stat.say, min: 3.2 })
  if (d.template === 'quote' && d.quote) s.push({ key: 'quote', kind: 'quote', say: d.quote.say, min: 3.4 })
  ;(d.points ?? []).forEach((p, i) => s.push({ key: `point${i}`, kind: 'point', index: i, say: p.say, min: d.pace ?? 2.8 }))
  s.push({ key: 'cta', kind: 'cta', say: d.say?.cta, min: 2.6 })
  return s
}

/**
 * Start times and lengths. `voice` maps a segment key to its narration length in seconds, `words` to
 * the measured time of each word in it (seconds from the start of that segment's audio).
 * @returns {Segment[]}
 */
export function timeline(d, voice = {}, words = {}) {
  let t = 0
  return segments(d).map((s) => {
    const v = voice[s.key]
    const dur = Math.max(s.min, v ? LEAD + v + (s.kind === 'cta' ? 0.8 : 0.45) : 0)
    const seg = { key: s.key, kind: s.kind, index: s.index, start: t, dur, say: s.say, voice: v, words: words[s.key]?.length ? words[s.key] : undefined }
    t += dur
    return seg
  })
}

export const total = (tl) => tl.reduce((a, s) => a + s.dur, 0)

/** Words of a narration with their times: measured when the voice engine gave them, else spread by length. */
export function wordTimes(seg) {
  if (!seg.say || !seg.voice) return []
  const at = seg.start + LEAD
  if (seg.words?.length) return seg.words.map((x) => ({ word: x.w, start: at + x.s, end: at + x.e }))
  const words = seg.say.split(/\s+/).filter(Boolean)
  const weight = words.map((w) => w.replace(/[^\p{L}\p{N}]/gu, '').length + 1.5)
  const sum = weight.reduce((a, b) => a + b, 0)
  let t = seg.start + LEAD
  return words.map((w, i) => {
    const d = (weight[i] / sum) * seg.voice
    const out = { word: w, start: t, end: t + d }
    t += d
    return out
  })
}

/** Caption chunks as [from, to) word indexes: up to `max` words, a new chunk after each sentence end. */
export function captionGroups(words, max = 4) {
  const out = []
  let from = 0
  words.forEach((w, i) => {
    if (i + 1 - from === max || /[.!?…。！？]$/.test(w) || i === words.length - 1) {
      out.push([from, i + 1])
      from = i + 1
    }
  })
  return out
}

export { LEAD }
