// Phase 120: after a session, what is worth keeping (idea from Hindsight's retain, recall and reflect;
// none of its code). A model drafts decisions, project facts and lessons from the session's digest,
// each with a date and a confidence; the app marks a new item that contradicts one already kept, and
// nothing enters the memory without the person's click. Notes about people are not drafted.

export type Kind = 'decision' | 'fact' | 'lesson'
export type Conf = 'high' | 'medium' | 'low'
export type Item = { kind: Kind; text: string; confidence: Conf; why?: string }
export type Kept = { date: string; title: string; text: string }
export type Clash = { old: Kept; topic: string; was: string; now: string }

export const KINDS: Kind[] = ['decision', 'fact', 'lesson']

/** The prompt for the draft: the digest, what is already kept, and the rules. */
export function prompt(digest: string, kept: Kept[]): string {
  const known = kept.slice(-40).map((k) => `- ${k.date} ${k.title}${k.text ? `: ${k.text.split('\n')[0]!.slice(0, 160)}` : ''}`).join('\n')
  return [
    'From this coding session, list what is worth remembering for the project. Three kinds:',
    '- decision: a choice the team made (tool, design, rule), with the reason if given;',
    '- fact: something true about the project that is not obvious from the code (a port, a quirk, where a thing lives);',
    '- lesson: something that went wrong or took long, and what to do next time.',
    'Only what the session shows. No notes about people, their habits or feelings. At most 8 items, short, in English.',
    'confidence: high when the session says it plainly, medium when it is implied, low when it is a guess.',
    'Answer with JSON only: [{"kind":"decision","text":"...","confidence":"high","why":"..."}]',
    known ? `Already kept for this project (do not repeat these; if the session changes one, say so in the text):\n${known}` : '',
    `Session:\n---\n${digest.slice(0, 24_000)}\n---`,
  ].filter(Boolean).join('\n\n')
}

/** The JSON array in a model's answer, cleaned; anything malformed is dropped. */
export function parseItems(answer: string): Item[] {
  const m = /\[[\s\S]*\]/.exec(answer)
  if (!m) return []
  let arr: unknown
  try {
    arr = JSON.parse(m[0])
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []
  const seen = new Set<string>()
  return arr.flatMap((x: Record<string, unknown>) => {
    const kind = KINDS.find((k) => k === String(x?.kind ?? '').toLowerCase())
    const text = String(x?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300)
    const confidence = (['high', 'medium', 'low'] as const).find((c) => c === String(x?.confidence ?? '').toLowerCase()) ?? 'medium'
    if (!kind || text.length < 4 || seen.has(text.toLowerCase())) return []
    seen.add(text.toLowerCase())
    const why = String(x?.why ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
    return [{ kind, text, confidence, ...(why ? { why } : {}) }]
  }).slice(0, 12)
}

/** Entries of a project note ("## 2026-10-20 Title" then the text) as kept items. */
export function keptOf(note: string): Kept[] {
  return [...note.matchAll(/^## (\d{4}-\d{2}-\d{2}) (.+)\n+([\s\S]*?)(?=^## |(?![\s\S]))/gm)].map((m) => ({ date: m[1]!, title: m[2]!.trim(), text: m[3]!.trim() }))
}

// choices where one replaces another; a project normally has one of each
const TOPICS: Record<string, string[]> = {
  'package manager': ['npm', 'pnpm', 'yarn', 'bun'],
  runtime: ['node', 'deno', 'bun'],
  database: ['postgres', 'postgresql', 'mysql', 'sqlite', 'mongodb', 'tidb', 'd1', 'supabase'],
  'test runner': ['jest', 'vitest', 'mocha', 'playwright', 'cypress'],
  bundler: ['webpack', 'vite', 'esbuild', 'rollup', 'parcel', 'turbopack'],
  framework: ['next', 'next.js', 'nuxt', 'remix', 'astro', 'sveltekit', 'express', 'fastify', 'hono', 'nestjs'],
  orm: ['prisma', 'drizzle', 'typeorm', 'sequelize', 'kysely'],
  hosting: ['vercel', 'netlify', 'cloudflare', 'fly', 'render', 'railway', 'aws', 'heroku'],
  css: ['tailwind', 'css modules', 'styled-components', 'sass', 'vanilla-extract'],
}
const ALIAS: Record<string, string> = { postgresql: 'postgres', 'next.js': 'next' }
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9.\- ]+/g, ' ')
/** The topic choices a text names ("pnpm" → package manager: pnpm). A word that only follows "from" is the old one. */
function choices(text: string): Map<string, string> {
  const t = ` ${words(text)} `
  const out = new Map<string, string>()
  for (const [topic, opts] of Object.entries(TOPICS)) {
    const hits = opts.filter((o) => t.includes(` ${o} `) && !new RegExp(`\\b(from|instead of|replacing|away from) ${o.replace('.', '\\.')}\\b`).test(t))
    // "bun" is both a runtime and a package manager; a text that names npm-like words decides
    if (hits.length) out.set(topic, ALIAS[hits[hits.length - 1]!] ?? hits[hits.length - 1]!)
  }
  return out
}

/** Kept items that a new item contradicts: the same topic with a different choice. */
export function clashes(item: Item, kept: Kept[]): Clash[] {
  if (item.kind === 'lesson') return []
  const now = choices(item.text)
  const out: Clash[] = []
  for (const k of [...kept].reverse()) {
    if (/^Replaced:/i.test(k.text)) continue
    const was = choices(`${k.title} ${k.text}`)
    for (const [topic, choice] of now) {
      const old = was.get(topic)
      if (old && old !== choice && !out.some((c) => c.topic === topic)) out.push({ old: k, topic, was: old, now: choice })
    }
  }
  return out
}

/** The entry written for an approved item; a replacing one names what it replaces, the old entry stays. */
export function entryFor(item: Item, replaces: Clash[] = []): { title: string; text: string } {
  const label = item.kind === 'decision' ? 'Decision' : item.kind === 'fact' ? 'Fact' : 'Lesson'
  const lines = [item.why ? `Why: ${item.why}` : '', `Confidence: ${item.confidence}. Kept after a session review.`, ...replaces.map((c) => `Replaces: "${c.old.title}" from ${c.old.date} (${c.topic}: ${c.was} → ${c.now}).`)]
  return { title: `${label}: ${item.text}`.slice(0, 80), text: [item.text.length > 70 ? item.text : '', ...lines].filter(Boolean).join('\n') }
}
