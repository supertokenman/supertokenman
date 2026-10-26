// A team as a file: the personas (instructions, styles, autonomy, integrations), triggers, eval cases,
// the default answer styles and the budget limits, so a colleague gets the same setup. Never secrets,
// the vault, memory or history. Importing shows what is new, what changed and what is the same, and
// brings in only what the person picks.

import { cleanPersona, type Persona } from './personas.js'
import { cleanTrigger, type Trigger } from './triggers.js'
import { findSecrets } from './secrets.js'
import { cleanStyles, type StyleId } from './styles.js'
import type { Limits } from './budget.js'

export type Team = { kind: 'supertokenman-team'; version: 1; name: string; at: string; personas: Persona[]; triggers: Trigger[]; evals: Record<string, string>; styles: StyleId[]; budget: Limits }
export type Current = { personas: Persona[]; triggers: Trigger[]; evals: Record<string, string>; styles: StyleId[]; budget: Limits }
export type Change = { key: string; kind: 'persona' | 'trigger' | 'evals' | 'styles' | 'budget'; name: string; status: 'new' | 'changed' | 'same'; before?: string; after: string }

/** The team file, with anything that looks like a secret left out and named. */
export function exportTeam(name: string, c: Current, at = new Date()): { team: Team; dropped: string[] } {
  const dropped: string[] = []
  const clean = <T>(label: string, v: T): T | null => {
    const hits = findSecrets(JSON.stringify(v))
    if (hits.length) {
      dropped.push(`${label} (${hits[0]!.kind})`)
      return null
    }
    return v
  }
  // a trigger's folder is a path on this machine: the colleague picks their own
  const personas = c.personas.map((p) => clean(`persona ${p.name}`, p)).filter((p): p is Persona => p !== null)
  const triggers = c.triggers.map((t) => clean<Trigger>(`trigger ${t.name}`, { ...t, cwd: '', lastRun: undefined, armedAt: undefined, enabled: false })).filter((t): t is Trigger => t !== null)
  const evals = Object.fromEntries(Object.entries(c.evals).filter(([id, text]) => clean(`evals of ${id}`, text) !== null))
  return { team: { kind: 'supertokenman-team', version: 1, name: name.trim() || 'Team', at: at.toISOString(), personas, triggers, evals, styles: c.styles, budget: c.budget }, dropped }
}

/** Reads a team file, cleaning each part as the app would its own. */
export function readTeam(text: string): Team {
  let j: Partial<Team>
  try {
    j = JSON.parse(text) as Partial<Team>
  } catch {
    throw new Error('Not a team file: it is not JSON.')
  }
  if (j.kind !== 'supertokenman-team') throw new Error('Not a SuperTokenMan team file.')
  if (j.version !== 1) throw new Error(`This team file is version ${j.version}; update the app to read it.`)
  return {
    kind: 'supertokenman-team',
    version: 1,
    name: String(j.name ?? 'Team').slice(0, 80),
    at: String(j.at ?? ''),
    personas: (Array.isArray(j.personas) ? j.personas : []).slice(0, 100).map(cleanPersona),
    triggers: (Array.isArray(j.triggers) ? j.triggers : []).slice(0, 100).map((t) => ({ ...cleanTrigger(t), enabled: false, cwd: '' })),
    evals: Object.fromEntries(Object.entries(j.evals ?? {}).slice(0, 100).map(([k, v]) => [String(k).slice(0, 40), String(v).slice(0, 20_000)])),
    styles: cleanStyles(j.styles),
    budget: typeof j.budget === 'object' && j.budget ? j.budget : {},
  }
}

const show = (v: unknown) => JSON.stringify(v, null, 2)
const personaText = (p: Persona) => show({ name: p.name, model: p.model, access: p.access, autonomy: p.autonomy, styles: p.styles, integrations: p.integrations, instructions: p.instructions })
const triggerText = (t: Trigger) => show({ name: t.name, persona: t.persona, when: t.when, gate: t.gate, prompt: t.prompt })

/** What importing would do, item by item. */
export function diffTeam(cur: Current, t: Team): Change[] {
  const out: Change[] = []
  const add = (key: string, kind: Change['kind'], name: string, before: string | undefined, after: string) => out.push({ key, kind, name, status: before === undefined ? 'new' : before === after ? 'same' : 'changed', ...(before !== undefined ? { before } : {}), after })
  for (const p of t.personas) {
    const mine = cur.personas.find((x) => x.id === p.id)
    add(`persona:${p.id}`, 'persona', p.name, mine && personaText(mine), personaText(p))
  }
  for (const tr of t.triggers) {
    const mine = cur.triggers.find((x) => x.id === tr.id)
    add(`trigger:${tr.id}`, 'trigger', tr.name, mine && triggerText(mine), triggerText(tr))
  }
  for (const [id, text] of Object.entries(t.evals)) add(`evals:${id}`, 'evals', `Evals of ${id}`, cur.evals[id], text)
  if (t.styles.length) add('styles', 'styles', 'Default answer styles', cur.styles.length ? show(cur.styles) : undefined, show(t.styles))
  if (Object.keys(t.budget).length) add('budget', 'budget', 'Budget limits', Object.keys(cur.budget).length ? show(cur.budget) : undefined, show(t.budget))
  return out
}

/** The setup after importing the picked items; everything else stays as it is. */
export function applyTeam(cur: Current, t: Team, picked: string[]): Current {
  const has = (k: string) => picked.includes(k)
  const personas = [...cur.personas]
  for (const p of t.personas)
    if (has(`persona:${p.id}`)) {
      const i = personas.findIndex((x) => x.id === p.id)
      if (i >= 0) personas[i] = p
      else personas.push(p)
    }
  const triggers = [...cur.triggers]
  for (const tr of t.triggers)
    if (has(`trigger:${tr.id}`)) {
      const i = triggers.findIndex((x) => x.id === tr.id)
      // an imported trigger starts off and without a folder: the person turns it on where it belongs
      const next = { ...tr, enabled: false, cwd: i >= 0 ? triggers[i]!.cwd : '' }
      if (i >= 0) triggers[i] = next
      else triggers.push(next)
    }
  const evals = { ...cur.evals }
  for (const [id, text] of Object.entries(t.evals)) if (has(`evals:${id}`)) evals[id] = text
  return { personas, triggers, evals, styles: has('styles') ? t.styles : cur.styles, budget: has('budget') ? t.budget : cur.budget }
}
