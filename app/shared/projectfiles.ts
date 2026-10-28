// Personas and triggers as files in the project (.supertokenman/personas/*.md, .supertokenman/triggers/*.md),
// so they are reviewed and versioned with git. Export writes them; import is always explicit: it shows what
// would change first, because a cloned repository could carry instructions you did not write.

import { cleanPersona, fromMarkdown as personaFromMd, toMarkdown as personaToMd, type Persona } from './personas.js'
import { cleanTrigger, DAYS, type Trigger, type When } from './triggers.js'

export const PERSONA_DIR = '.supertokenman/personas'
export const TRIGGER_DIR = '.supertokenman/triggers'

const whenText = (w: When) => (w.kind === 'every' ? `every ${w.minutes}` : w.kind === 'pr-review' ? 'pr-review' : `${w.days.map((d) => DAYS[d]).join(',') || 'none'} ${w.time}`)
function whenOf(s: string): When {
  const t = s.trim()
  const every = /^every\s+(\d+)$/i.exec(t)
  if (every) return { kind: 'every', minutes: Number(every[1]) }
  if (/^pr-review$/i.test(t)) return { kind: 'pr-review' }
  const [days = '', time = '09:00'] = t.split(/\s+/)
  return { kind: 'schedule', days: days.split(',').map((d) => DAYS.findIndex((x) => x.toLowerCase() === d.trim().toLowerCase())).filter((d) => d >= 0), time }
}
const list = (s?: string) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean)

/** A trigger as a file; the project folder is where the file lives, so it is not written. */
export function triggerToMd(t: Trigger): string {
  return [
    '---',
    `name: ${t.name}`,
    `persona: ${t.persona}`,
    `when: ${whenText(t.when)}`,
    `enabled: ${t.enabled}`,
    ...(t.gate ? ['gate: true'] : []),
    ...(t.hoursOnly ? ['hours-only: true'] : []),
    ...(t.scope?.read.length ? [`may-read: ${t.scope.read.join(', ')}`] : []),
    ...(t.scope?.write.length ? [`may-write: ${t.scope.write.join(', ')}`] : []),
    ...(t.scope?.commands.length ? [`may-run: ${t.scope.commands.join(', ')}`] : []),
    '---',
    '',
    t.prompt,
    '',
  ].join('\n')
}

export function triggerFromMd(text: string, id: string, cwd: string): Trigger {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text.trim())
  if (!m) throw new Error('Not a trigger file: it starts with a --- header.')
  const head: Record<string, string> = {}
  for (const line of m[1]!.split(/\r?\n/)) {
    const i = line.indexOf(':')
    if (i > 0) head[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim()
  }
  return cleanTrigger({
    id,
    name: head.name,
    persona: head.persona,
    cwd,
    prompt: m[2]!.trim(),
    when: whenOf(head.when ?? ''),
    // a trigger that arrives in a repository never starts on its own: the person turns it on
    enabled: false,
    gate: head.gate === 'true',
    hoursOnly: head['hours-only'] === 'true',
    scope: { read: list(head['may-read']), write: list(head['may-write']), commands: list(head['may-run']) },
  })
}

export const fileId = (file: string) => file.replace(/^.*\//, '').replace(/\.md$/, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40)

export type Change = { kind: 'persona' | 'trigger'; id: string; name: string; what: 'new' | 'changed' | 'same' }

/** What importing would do, compared with what the app holds now. */
export function plan(files: { personas: { id: string; text: string }[]; triggers: { id: string; text: string }[] }, have: { personas: Persona[]; triggers: Trigger[] }, cwd: string) {
  const personas = files.personas.map((f) => ({ ...personaFromMd(f.text), id: f.id }))
  const triggers = files.triggers.map((f) => triggerFromMd(f.text, f.id, cwd))
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  const changes: Change[] = [
    ...personas.map((p): Change => {
      const old = have.personas.find((x) => x.id === p.id)
      return { kind: 'persona', id: p.id, name: p.name, what: !old ? 'new' : same(cleanPersona(old), cleanPersona(p)) ? 'same' : 'changed' }
    }),
    ...triggers.map((t): Change => {
      const old = have.triggers.find((x) => x.id === t.id)
      const strip = (x: Trigger) => ({ ...x, enabled: false, lastRun: undefined, armedAt: undefined })
      return { kind: 'trigger', id: t.id, name: t.name, what: !old ? 'new' : same(strip(old), strip(t)) ? 'same' : 'changed' }
    }),
  ]
  return { personas, triggers, changes }
}

export const planText = (changes: Change[]) =>
  changes.length
    ? changes.map((c) => `  ${c.what.padEnd(8)} ${c.kind.padEnd(8)} ${c.id}  ${c.name}`).join('\n')
    : `  Nothing: no files in ${PERSONA_DIR} or ${TRIGGER_DIR}.`

export { personaToMd }
