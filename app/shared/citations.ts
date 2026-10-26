// Answers from attached documents cite their sources as [S1], [S2]: each mark points at one passage
// (document and chunk), and an answer that cites none, or cites a number it was never given, is flagged.

export type Source = { n: number; doc: number; chunk: number; title: string; tag: string; text: string }

export const CITE_RULE = 'Cite each claim with its mark from the numbered sources, like [S1]; if they do not cover it, say so.'

/** The label a passage goes in with: its mark first, so the model can cite it. */
export const sourceLabel = (s: Source) => `[S${s.n}] @${s.tag}: ${s.title}`

/** The marks an answer uses, in order of first use. */
export function citesOf(reply: string): number[] {
  const out: number[] = []
  for (const m of reply.matchAll(/\[S(\d{1,3})\]/g)) {
    const n = Number(m[1])
    if (!out.includes(n)) out.push(n)
  }
  return out
}

/** What is wrong with the citations of an answer given these sources, or null when they are fine. */
export function citeCheck(reply: string, sources: Source[]): string | null {
  if (!sources.length) return null
  const used = citesOf(reply)
  const known = new Set(sources.map((s) => s.n))
  const unknown = used.filter((n) => !known.has(n))
  if (unknown.length) return `This answer cites ${unknown.map((n) => `[S${n}]`).join(', ')}, which were not given to it.`
  if (!used.length && !/(sources|documents|passages)[^.]{0,40}(do not|don't|doesn't|does not|no)\b/i.test(reply)) return 'This answer cites no source from the attached documents.'
  return null
}

/** The answer cut into text and citation marks, for drawing the marks as links. */
export function splitCites(reply: string): (string | { n: number })[] {
  const out: (string | { n: number })[] = []
  let at = 0
  for (const m of reply.matchAll(/\[S(\d{1,3})\]/g)) {
    out.push(reply.slice(at, m.index), { n: Number(m[1]) })
    at = m.index! + m[0].length
  }
  out.push(reply.slice(at))
  return out.filter((x) => x !== '')
}
