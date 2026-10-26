// How a panel answers: styles a persona (or the app, for panels without one) turns on. Each adds a
// short rule to the system prompt, fixed for the panel's life so the cache keeps it.

export type StyleId = 'lean' | 'action' | 'report'
export const STYLES: Record<StyleId, { label: string; what: string; rule: string }> = {
  lean: {
    label: 'Lean code',
    what: 'Writes only what is needed: checks the repo, the standard library and installed packages first.',
    rule: [
      'Before writing code, go down this ladder and stop at the first yes: does it need to exist at all; is it already in this repository; does the standard library or the platform do it; does an installed dependency do it; does it fit in one line. Only then write new code, the least that does the job.',
      'Never cut: input validation, security checks and accessibility stay. Branching logic, parsers, money and security code get a test.',
      'Do not add dependencies, abstractions or options nobody asked for.',
    ].join('\n'),
  },
  action: {
    label: 'Action first',
    what: 'The answer opens with what to do, steps numbered, the next step last. No filler.',
    rule: [
      'Open with the action or the answer in one line. Then numbered steps if there is more than one. End with one line starting "Next:" saying what the person does next.',
      'No preamble, no restating the question, no "Great question", no "Hope this helps", no offers to help more.',
    ].join('\n'),
  },
  report: {
    label: 'Says what it skipped',
    what: 'Every answer that changed or checked something ends with what was skipped, not verified, and the risks.',
    rule: 'When you changed or checked anything, end the answer with a short section titled "Not verified" listing, as bullets, what you skipped, what you did not run or check, and the risks of the change. Write "Nothing" under it when you verified everything.',
  },
}
export const STYLE_IDS = Object.keys(STYLES) as StyleId[]
export const cleanStyles = (v: unknown): StyleId[] => (Array.isArray(v) ? [...new Set(v.map(String).filter((x): x is StyleId => x in STYLES))] : [])

/** The rule the turned-on styles add, in a stable order (so the cache sees the same text). */
export function styleRule(ids: StyleId[]): string {
  const on = STYLE_IDS.filter((id) => ids.includes(id))
  return on.length ? `# How to answer\n\n${on.map((id) => STYLES[id].rule).join('\n\n')}` : ''
}

/** An answer split into its body and its closing "Not verified" section, if it has one. */
export function splitReport(text: string): { body: string; report: string[] | null } {
  const m = /(?:^|\n)(?:#{1,4}\s*|\*\*)?(?:Not verified|Não verificado|Nao verificado|What I skipped|O que não verifiquei)(?:\*\*)?:?\s*\n([\s\S]+)$/i.exec(text)
  if (!m) return { body: text, report: null }
  const items = m[1]!
    .split('\n')
    .map((l) => l.replace(/^\s*(?:(?:[-*•]|\d+[.)])\s*)+/, '').trim())
    .filter(Boolean)
  return { body: text.slice(0, m.index).trimEnd(), report: items }
}
