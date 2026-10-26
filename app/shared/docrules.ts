// Documents in: the parts with no model or disk. Matching rules (words, a regex) that tag a document
// and pick its folder, a storage path from a template like {sender}/{year}/{title}, the local model's
// tag suggestions read back, facts proposed for memory, and the hybrid search's fusion of keyword and
// meaning ranks. The idea of rules plus suggestions and path templates is paperless-ngx's (GPL-3.0);
// no code is taken from it.

export type Rule = { id: string; name: string; kind: 'words' | 'regex'; value: string; tags: string[]; template?: string }
export type Meta = { title: string; sender?: string; date?: string; tags: string[]; ext: string }

/** Which rules match a document's text and title: every word (any order), or the regex. */
export function matchRules(text: string, title: string, rules: Rule[]): Rule[] {
  const hay = `${title}\n${text}`.toLowerCase()
  return rules.filter((r) => {
    if (r.kind === 'regex') {
      try {
        return new RegExp(r.value, 'i').test(`${title}\n${text}`)
      } catch {
        return false
      }
    }
    const words = r.value.toLowerCase().split(/\s+/).filter(Boolean)
    return words.length > 0 && words.every((w) => hay.includes(w))
  })
}

/** A rule that cannot work: no name, nothing to match, a broken regex. */
export function checkRule(r: Partial<Rule>): string | null {
  if (!r.name?.trim()) return 'Give the rule a name.'
  if (!r.value?.trim()) return 'Say what to match.'
  if (r.kind === 'regex') {
    try {
      new RegExp(r.value)
    } catch (e) {
      return `The regex does not compile: ${(e as Error).message}`
    }
  }
  if (r.template && /\.\.|^\//.test(r.template)) return 'The folder template stays inside the documents folder: no .. and no leading /.'
  return null
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'untitled'

/** The storage path from a template; unknown values become "unknown", never an empty folder. */
export function pathFrom(template: string, m: Meta): string {
  const d = m.date ? new Date(m.date) : new Date()
  const vals: Record<string, string> = {
    sender: m.sender || 'unknown',
    year: String(d.getFullYear()),
    month: String(d.getMonth() + 1).padStart(2, '0'),
    title: m.title,
    tag: m.tags[0] ?? 'untagged',
  }
  const rel = (template || '{year}/{title}').split('/').map((part) => safe(part.replace(/\{(\w+)\}/g, (_, k: string) => vals[k] ?? k))).join('/')
  return `${rel}${m.ext}`
}

/** A sender guessed from the text: an e-mail domain or a "From:" line. */
export function senderOf(text: string): string | undefined {
  const from = /^\s*(?:from|de|remetente|emitente|locador|cedente|benefici[aá]rio)\s*:\s*(.+)$/im.exec(text)?.[1]?.trim()
  if (from) return from.replace(/<[^>]*>/, '').trim().slice(0, 60) || undefined
  const mail = /[\w.+-]+@([\w-]+)\.[\w.]+/.exec(text)?.[1]
  return mail ?? undefined
}

/** A date in the text: ISO, or day/month/year as written in Brazil. */
export function dateOf(text: string): string | undefined {
  const iso = /\b(20\d\d|19\d\d)-(\d\d)-(\d\d)\b/.exec(text)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const br = /\b(\d{1,2})\/(\d{1,2})\/(20\d\d|19\d\d)\b/.exec(text)
  if (br && Number(br[2]) <= 12) return `${br[3]}-${br[2]!.padStart(2, '0')}-${br[1]!.padStart(2, '0')}`
  return undefined
}

/** The prompt that asks the local model for tags, from the ones already in use where it can. */
export const tagPrompt = (title: string, text: string, known: string[]) =>
  `Suggest up to 3 short tags for this document. Prefer these existing tags when they fit: ${known.join(', ') || '(none yet)'}.\nAnswer with the tags only, comma separated.\n\nTitle: ${title}\n\n${text.slice(0, 3000)}`

/** The model's tags: lower case, short, each once, at most three. */
export const parseTags = (s: string) => [...new Set(s.split(/[,\n]/).map((t) => t.replace(/^[\s#*-]+|[\s.]+$/g, '').toLowerCase()).filter((t) => t.length > 1 && t.length <= 30 && !/\s{2}/.test(t)))].slice(0, 3)

/** The prompt that asks for facts worth remembering; each one is shown for confirming first. */
export const factPrompt = (title: string, text: string) =>
  `List up to 5 facts from this document worth remembering later (amounts, dates, deadlines, account or contract numbers, who it is from). One per line, each a full sentence that names the document's subject. No guesses.\n\nTitle: ${title}\n\n${text.slice(0, 4000)}`

export const parseFacts = (s: string) => s.split('\n').map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim()).filter((l) => l.length > 12 && l.length < 300).slice(0, 5)

/**
 * Reciprocal rank fusion: each list votes 1/(60 + rank) for its items, so an item high in both the
 * keyword and the meaning ranking comes first, with no scores to calibrate between them.
 */
export function fuse<T extends string | number>(lists: T[][], k = 60): { id: T; score: number }[] {
  const s = new Map<T, number>()
  for (const list of lists) list.forEach((id, i) => s.set(id, (s.get(id) ?? 0) + 1 / (k + i + 1)))
  return [...s].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score)
}

/** The rerank prompt: the local model scores each passage 0 to 10 for the query, one number per line. */
export const rerankPrompt = (q: string, passages: string[]) =>
  `Score how well each passage answers the question, 0 (not at all) to 10 (fully). Answer with one line per passage: "<number>: <score>", nothing else.\n\nQuestion: ${q}\n\n${passages.map((p, i) => `${i + 1}: ${p.slice(0, 500).replace(/\n/g, ' ')}`).join('\n')}`

export function parseScores(s: string, n: number): number[] | null {
  const out = Array<number>(n).fill(-1)
  for (const m of s.matchAll(/(\d+)\s*[:=-]\s*(\d+(?:\.\d+)?)/g)) {
    const i = Number(m[1]) - 1
    if (i >= 0 && i < n) out[i] = Math.min(10, Number(m[2]))
  }
  return out.filter((x) => x >= 0).length >= Math.ceil(n / 2) ? out : null
}
