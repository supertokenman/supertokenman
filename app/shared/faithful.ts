// Faithfulness of an answer to its sources (phases 65 and 66): which claims cite a source, whether the
// cited passage supports them, and numbers that appear in the claim but not in the source. Deterministic
// checks first; a model as judge only when the person asks and sees the cost. Idea from Haystack's
// faithfulness evaluators; our own code.
import { citesOf, type Source } from './citations.js'

export type ClaimCheck = { text: string; cites: number[]; support: number; missingNumbers: string[]; verdict: 'supported' | 'weak' | 'uncited' | 'bad-mark' }
export type Faith = { claims: ClaimCheck[]; coverage: number; supported: number; unused: number[] }

const STOP = new Set('the a an and or but of to in on for with by from at as is are was were be been it its this that these those there their they them then than so such into over under about also only very more most some any each which who what when where how not no yes can could should would will may might must do does did have has had your you our we i he she his her'.split(' '))

/** The sentences of an answer that make a claim: no headings, code or one-word lines. */
export function claimsOf(reply: string): string[] {
  const body = reply.replace(/```[\s\S]*?(```|(?![\s\S]))/g, ' ').replace(/^\s*#{1,6}\s.*$/gm, ' ')
  return body
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '').trim())
    .filter((s) => s.replace(/\[S\d+\]/g, '').split(/\s+/).filter(Boolean).length >= 4)
}

const words = (s: string) => s.toLowerCase().replace(/\[s\d+\]/g, ' ').match(/[\p{L}\p{N}]+/gu) ?? []
const numbersOf = (s: string) => (s.replace(/\[S\d+\]/g, ' ').match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/[.,](?=\d{3}\b)/g, ''))

/** How much of a claim's content the source holds: share of its content words found there, 0 to 1. */
export function support(claim: string, source: string): { score: number; missingNumbers: string[] } {
  const src = new Set(words(source))
  const srcNums = new Set(numbersOf(source))
  const content = words(claim).filter((w) => !STOP.has(w) && (w.length > 3 || /\d/.test(w)))
  const missingNumbers = numbersOf(claim).filter((n) => !srcNums.has(n))
  if (!content.length) return { score: 1, missingNumbers }
  const hit = content.filter((w) => src.has(w) || [...src].some((x) => x.length > 4 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5))))).length
  return { score: hit / content.length, missingNumbers }
}

export function faithfulness(reply: string, sources: Source[], weakBelow = 0.4): Faith {
  const byN = new Map(sources.map((s) => [s.n, s]))
  const claims: ClaimCheck[] = claimsOf(reply).map((text) => {
    const cites = citesOf(text)
    if (!cites.length) return { text, cites, support: 0, missingNumbers: [], verdict: 'uncited' }
    if (cites.some((n) => !byN.has(n))) return { text, cites, support: 0, missingNumbers: [], verdict: 'bad-mark' }
    const joined = cites.map((n) => byN.get(n)!.text).join('\n')
    const s = support(text, joined)
    return { text, cites, support: s.score, missingNumbers: s.missingNumbers, verdict: s.score >= weakBelow && !s.missingNumbers.length ? 'supported' : 'weak' }
  })
  const n = claims.length || 1
  const used = new Set(claims.flatMap((c) => c.cites))
  return { claims, coverage: claims.filter((c) => c.cites.length).length / n, supported: claims.filter((c) => c.verdict === 'supported').length / n, unused: sources.map((s) => s.n).filter((x) => !used.has(x)) }
}

/** The optional judge: one claim against its passages, answered with one word. */
export const judgePrompt = (claim: string, passages: string) =>
  `Does the SOURCE support the CLAIM? Answer with exactly one word: SUPPORTED, PARTIAL or UNSUPPORTED.\n\nCLAIM:\n${claim}\n\nSOURCE:\n${passages.slice(0, 6000)}`
export const judgeOf = (answer: string): 'supported' | 'partial' | 'unsupported' | null => {
  const m = /\b(UNSUPPORTED|PARTIAL|SUPPORTED)\b/i.exec(answer)
  return m ? (m[1]!.toLowerCase() as 'supported' | 'partial' | 'unsupported') : null
}
