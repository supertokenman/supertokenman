// The router: one box for the whole team. It picks the persona for a message without a model call,
// from an @mention, the persona's name, a few words each starter is known by (English and
// Portuguese), the words of its own instructions, and what it learned from the person's own picks.
// When nothing stands out the local model suggests one, Claude can be asked, or the person picks.

import type { Persona } from './personas.js'

/** Words the starters are known by, beyond their own instructions. */
const KNOWN: Record<string, string[]> = {
  reviewer: ['review', 'revisar', 'revisa', 'revisao', 'pr', 'pull', 'diff', 'bug', 'bugs', 'seguranca', 'security', 'audit', 'auditar', 'code', 'codigo'],
  frontend: ['ui', 'ux', 'css', 'tela', 'telas', 'layout', 'componente', 'component', 'botao', 'button', 'react', 'tailwind', 'responsivo', 'responsive', 'pagina', 'page', 'visual', 'tema', 'theme', 'acessibilidade', 'accessibility'],
  devops: ['deploy', 'ci', 'cd', 'pipeline', 'infra', 'docker', 'cloudflare', 'worker', 'workers', 'servidor', 'server', 'dns', 'dominio', 'domain', 'build', 'actions', 'producao', 'production', 'logs', 'banco', 'database', 'migration', 'migracao'],
  writer: ['doc', 'docs', 'readme', 'documentacao', 'documentation', 'changelog', 'post', 'texto', 'text', 'artigo', 'article', 'escrever', 'write', 'linkedin', 'release', 'notes'],
}

const STOP = new Set(
  'a an and are as at be but by do for from has have i if in into is it its me my no not of on or our so than that the their then there these this to up was we what when where which who why will with you your o os um uma uns umas e de do da dos das em no na nos nas por para pra com sem que se ou mas como mais menos muito ja nao sim eu voce ele ela isso esse essa este esta aqui ali'.split(' '),
)

export const words = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9@]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))

export type Route = { persona: Persona | null; score: number; why: string[]; sure: boolean; mention: boolean }

/** What the router learned from the person: for each word, how often a message with it went to each persona. */
export type Learned = Record<string, Record<string, number>>

/**
 * A message sent to a persona teaches the router: each of its words counts once more for that persona.
 * Only the most recent words are kept, so the map stays small and old habits fade.
 */
export function learn(learned: Learned, text: string, personaId: string, keep = 400): Learned {
  const next: Learned = { ...learned }
  for (const w of new Set(words(text).filter((w) => !w.startsWith('@') && w.length > 2))) {
    const old = next[w]
    // moved to the end, so the words not used for longest are the first ones dropped
    delete next[w]
    next[w] = { ...old, [personaId]: Math.min(20, (old?.[personaId] ?? 0) + 1) }
  }
  const all = Object.keys(next)
  for (const w of all.slice(0, Math.max(0, all.length - keep))) delete next[w]
  return next
}

/** The best persona for a message, how sure, and the words that decided it. */
export function route(text: string, personas: Persona[], learned: Learned = {}): Route {
  const ws = words(text)
  // an @mention decides: @reviewer, @dev-ops, @Writer
  for (const p of personas) {
    const handles = new Set([p.id, p.id.replace(/-/g, ''), ...words(p.name).map((w) => w.replace(/@/g, ''))])
    if (ws.some((w) => w.startsWith('@') && handles.has(w.slice(1)))) return { persona: p, score: 99, why: [`@${p.id}`], sure: true, mention: true }
  }
  const scored = personas
    .map((p) => {
      const why: string[] = []
      let score = 0
      const name = new Set(words(p.name))
      const known = new Set(KNOWN[p.id] ?? [])
      const own = new Set(words(p.instructions).filter((w) => w.length > 3))
      for (const w of new Set(ws)) {
        if (name.has(w)) (score += 5), why.push(w)
        else if (known.has(w)) (score += 3), why.push(w)
        else if (own.has(w)) (score += 1), why.push(w)
        // a word the person kept sending to this persona, weighed against where else it went
        const seen = learned[w]
        if (seen?.[p.id]) {
          const total = Object.values(seen).reduce((a, b) => a + b, 0)
          const share = seen[p.id]! / total
          if (share > 0.5 && seen[p.id]! >= 2) (score += Math.min(5, 2 + seen[p.id]! / 2) * share), why.includes(w) || why.push(w)
        }
      }
      return { p, score, why }
    })
    .sort((a, b) => b.score - a.score)
  const [best, next] = scored
  if (!best || best.score === 0) return { persona: null, score: 0, why: [], sure: false, mention: false }
  // sure when it clearly beats the runner-up
  const sure = best.score >= 3 && best.score >= (next?.score ?? 0) * 1.5 + 1
  return { persona: best.p, score: best.score, why: best.why.slice(0, 4), sure, mention: false }
}

/** The message without the @mention that routed it. */
export const stripMention = (text: string, r: Route) => (r.mention ? text.replace(/(^|\s)@[\w-]+/, '$1').trim() : text)

/** The question for Claude when the words do not decide: answer with one id. */
export function choosePrompt(text: string, personas: Persona[]): string {
  return [
    'Pick the one teammate best suited to handle this message. Answer with only their id, or "none".',
    '',
    ...personas.map((p) => `- ${p.id}: ${p.name}. ${p.instructions.slice(0, 220)}`),
    '',
    `Message: ${text.slice(0, 1500)}`,
  ].join('\n')
}
