// Routines: a skill run on a schedule ("every Monday, scan dependencies and sum up") whose only output is
// a draft in the app. A routine can read the project and nothing else: no commands, no edits, no network,
// no posting. What it costs counts against the project's budget like any turn.
// Idea from nanobot's scheduled jobs, kept to drafts; our own code.
import { isDue as triggerDue, nextRun, type When } from './triggers.js'

export type Routine = { id: string; name: string; cwd: string; skill: string; params: string; when: When; enabled: boolean; lastRun?: number; armedAt?: number; failures?: number; disabledReason?: 'failures'; note?: string }
export type Draft = { id: string; routine: string; name: string; at: number; text: string; costUsd: number; read: boolean; error?: string }

/** The only tools a routine gets. Anything else is refused, whatever the skill says. */
export const ROUTINE_TOOLS = ['Read', 'Grep', 'Glob']

export const isDue = (r: Routine, now: number) => triggerDue({ id: r.id, name: r.name, persona: '', cwd: r.cwd, prompt: '', when: r.when, enabled: r.enabled, lastRun: r.lastRun, armedAt: r.armedAt }, now)
export const nextOf = (r: Routine, now: number) => (r.enabled ? nextRun(r.when, Math.max(r.lastRun ?? 0, r.armedAt ?? 0, now - 1)) : null)

export function routinePrompt(r: Routine): string {
  return [
    `[Routine "${r.name}". You can only read files in this project; there is no shell, no editing and no network. Your whole answer becomes a draft the person reads later, so write it as a short report: what you found, what needs attention, and what you would do next. Do not claim to have changed or sent anything.]`,
    r.skill ? `Use the ${r.skill} skill.` : '',
    r.params.trim(),
  ].filter(Boolean).join('\n\n')
}

/** A routine can be saved only with a name, a folder and something to do. */
export function checkRoutine(r: Partial<Routine>, minEvery = 15): string | null {
  if (!r.name?.trim()) return 'Name the routine.'
  if (!r.cwd?.trim()) return 'Pick the project folder.'
  if (!r.skill?.trim() && !r.params?.trim()) return 'Pick a skill or write what it should do.'
  if (r.when?.kind === 'pr-review') return 'Routines run on a schedule, not on pull requests.'
  if (r.when?.kind === 'every' && r.when.minutes < minEvery) return `Runs can be at most every ${minEvery} minutes. Pick a longer interval.`
  if (r.when?.kind === 'every' && r.when.minutes < 60) return 'A routine runs at most once an hour.'
  return null
}
