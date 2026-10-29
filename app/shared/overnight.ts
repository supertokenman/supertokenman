// A "while you were away" summary: what the panels and triggers did since a given time, as lines for
// the window and as safe arguments for reading them aloud with macOS `say`. Pure functions.

export type Event = {
  at: number
  panel: string
  kind: 'turn' | 'approval-waiting' | 'trigger-run' | 'error' | 'loop-ended'
  text?: string
  costUsd?: number
}

/** Events at or after `from`, oldest first. */
export function since(events: Event[], from: number): Event[] {
  return events.filter((e) => e.at >= from).sort((a, b) => a.at - b.at)
}

const uniq = (xs: string[]) => [...new Set(xs)]

/** "45 min", "2 h", "7 h 20 min", "3 days". */
export function duration(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) {
    const m = min % 60
    return m ? `${h} h ${m} min` : `${h} h`
  }
  const days = Math.floor(h / 24)
  return days === 1 ? '1 day' : `${days} days`
}

/** The title and the lines for the events since `from`, judged at `now`. */
export function summary(events: Event[], from: number, now: number): { title: string; lines: string[] } {
  const evs = since(events, from)
  const title = `While you were away (${duration(now - from)})`
  const lines: string[] = []

  const waits = evs.filter((e) => e.kind === 'approval-waiting')
  if (waits.length) lines.push(`${waits.length} approvals wait for you: ${uniq(waits.map((e) => e.panel)).join(', ')}`)

  const runs = evs.filter((e) => e.kind === 'trigger-run')
  if (runs.length) lines.push(`${runs.length} trigger runs: ${uniq(runs.map((e) => e.panel)).join(', ')}`)

  const turns = evs.filter((e) => e.kind === 'turn')
  if (turns.length) lines.push(`${turns.length} turns in ${uniq(turns.map((e) => e.panel)).length} panels`)

  const errors = evs.filter((e) => e.kind === 'error')
  for (const e of errors.slice(0, 3)) lines.push(`Errors: ${e.panel}: ${(e.text ?? '').slice(0, 120)}`)
  if (errors.length > 3) lines.push(`and ${errors.length - 3} more`)

  const spent = evs.reduce((sum, e) => sum + (e.costUsd && e.costUsd > 0 ? e.costUsd : 0), 0)
  if (spent > 0) lines.push(`Spent $${spent.toFixed(2)}`)

  return { title, lines: lines.length ? lines : ['Nothing ran while you were away.'] }
}

/** Plain text for speech: one sentence per line, "$1.25" read as "1.25 dollars", no markup. */
export function speech(s: { title: string; lines: string[] }): string {
  return [s.title, ...s.lines]
    .map((l) => l.replace(/\$(\d[\d,]*(?:\.\d+)?)/g, '$1 dollars').replace(/[*_`#>[\]]/g, '').replace(/\s+/g, ' ').trim())
    .join('\n')
}

const VOICE = /^[A-Za-z][A-Za-z ()-]{0,40}$/

/** argv for `say` run without a shell; the text always follows `--`, so a leading "-" is never a flag. */
export function sayArgs(text: string, voice?: string): string[] {
  const t = text.slice(0, 2000)
  if (voice === undefined) return ['--', t]
  if (!VOICE.test(voice)) throw new Error('Unknown voice name.')
  return ['-v', voice, '--', t]
}
