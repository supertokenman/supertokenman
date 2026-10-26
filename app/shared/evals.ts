// Evals per persona: a few prompts with what a good answer must say and must not say. Run against the
// persona's instructions, they show whether a change to the instructions made it better or worse.

export type EvalCase = { id: string; prompt: string; must: string[]; mustNot: string[] }
export type EvalResult = { id: string; pass: boolean; missing: string[]; forbidden: string[]; answer: string; where: 'local' | 'claude' }

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
/**
 * Checks that read the shape of an answer, in the style of IFEval: no judge, the same result every time.
 * @numbered, @next (ends with a Next: line), @no-filler, @max-words:N, @min-words:N, @max-lines:N, @report (has Not verified),
 * @bullets:N, @no-commas, @question (ends with one), @lowercase, @json, @code, @no-code, @title (opens with a heading).
 */
const FILLER = /\b(?:great question|hope this helps|let me know if|happy to help|feel free to|certainly!|absolutely!|ótima pergunta|espero ter ajudado)\b/i
export function shape(answer: string, check: string): boolean | null {
  const [name, arg] = check.slice(1).split(':')
  const n = Number(arg)
  const lines = answer.trim().split('\n').filter((l) => l.trim())
  switch (name) {
    case 'numbered': return /^\s*1[.)]\s/m.test(answer) && /^\s*2[.)]\s/m.test(answer)
    case 'next': return /^\s*(?:\*\*)?(?:next|próximo|proximo)(?:\*\*)?:/i.test(lines[lines.length - 1] ?? '')
    case 'no-filler': return !FILLER.test(answer)
    case 'max-words': return answer.split(/\s+/).filter(Boolean).length <= n
    case 'max-lines': return lines.length <= n
    case 'report': return /\n(?:#{1,4}\s*|\*\*)?(?:not verified|não verificado)/i.test(answer)
    case 'min-words': return answer.split(/\s+/).filter(Boolean).length >= n
    case 'bullets': return lines.filter((l) => /^\s*[-*•]\s/.test(l)).length === n
    case 'no-commas': return !answer.includes(',')
    case 'question': return /\?\s*$/.test(answer.trim())
    case 'lowercase': return answer === answer.toLowerCase()
    case 'json': try { JSON.parse(answer.trim().replace(/^```(?:json)?\n|\n```$/g, '')); return true } catch { return false }
    case 'code': return /```[\s\S]*```/.test(answer)
    case 'no-code': return !/```/.test(answer)
    case 'title': return /^#{1,3}\s+\S/.test(lines[0] ?? '')
    default: return null
  }
}
/** A check is plain text, /regex/ for patterns, or @shape. */
const hit = (answer: string, check: string) => {
  if (check.startsWith('@')) return shape(answer, check) ?? false
  const re = /^\/(.+)\/([a-z]*)$/.exec(check)
  if (re) {
    try {
      return new RegExp(re[1]!, re[2]!.includes('i') ? re[2] : `${re[2]}i`).test(answer)
    } catch {
      return false
    }
  }
  return norm(answer).includes(norm(check))
}

export function grade(c: EvalCase, answer: string, where: 'local' | 'claude'): EvalResult {
  const missing = c.must.filter((m) => !hit(answer, m))
  const forbidden = c.mustNot.filter((m) => hit(answer, m))
  return { id: c.id, pass: !missing.length && !forbidden.length, missing, forbidden, answer, where }
}

/** What a persona is asked during an eval: its instructions as the system part, then the case. */
export const evalPrompt = (instructions: string, prompt: string) => `${instructions.trim()}\n\n---\n\n${prompt.trim()}`

/** Lines `prompt | must: a, b | not: c` to cases; the format the sheet edits. */
export function parseCases(text: string): EvalCase[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l, i) => {
      const [prompt, ...rest] = l.split('|').map((x) => x.trim())
      const list = (key: string) => rest.filter((r) => r.toLowerCase().startsWith(`${key}:`)).flatMap((r) => r.slice(key.length + 1).split(',').map((x) => x.trim()).filter(Boolean))
      return { id: `E${i + 1}`, prompt: prompt!, must: list('must'), mustNot: list('not') }
    })
    .filter((c) => c.prompt)
}

export const casesText = (cases: EvalCase[]) => cases.map((c) => [c.prompt, c.must.length ? `must: ${c.must.join(', ')}` : '', c.mustNot.length ? `not: ${c.mustNot.join(', ')}` : ''].filter(Boolean).join(' | ')).join('\n')

/** The ask behind Improve: the local model tightens instructions without changing what they ask for. */
export const rewritePrompt = (instructions: string, failures: string[]) =>
  [
    'Rewrite these instructions for an AI assistant so they are clearer and shorter, keeping every requirement. Plain sentences, no headings, no preamble. Reply with the instructions only.',
    failures.length ? `Answers under them failed these checks; fix the instructions so they would pass:\n${failures.map((f) => `- ${f}`).join('\n')}` : '',
    `Instructions:\n${instructions.trim()}`,
  ]
    .filter(Boolean)
    .join('\n\n')
