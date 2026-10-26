// The hero's mood, from what the session is going through: Inside Out for a token fighter.
import type { State } from './state'

export type Mood = 'joy' | 'anger' | 'fear' | 'disgust' | 'sadness' | 'sleep' | 'focus' | 'working' | 'idle'

export const MOODS: Mood[] = ['idle', 'working', 'focus', 'joy', 'anger', 'fear', 'disgust', 'sadness', 'sleep']

/** What each mood means, for the tooltip. */
export const WHY: Record<Mood, string> = {
  joy: 'Knocked out wasted tokens, or CI passed',
  anger: 'A credential showed up, CI failed, or something broke',
  fear: 'Context or plan nearly spent',
  disgust: 'A command dumped a huge output',
  sadness: 'Prompt cache went cold',
  sleep: 'Asleep: the next message wakes it',
  focus: 'In a focus round',
  working: 'Working',
  idle: 'Ready',
}

/**
 * The mood, strongest first: a fresh K.O. wins briefly, then trouble (anger, fear), then
 * annoyances (disgust, sadness), then the steady states.
 */
export function moodOf(s: State, now = Date.now(), extra: { focus?: boolean } = {}): Mood {
  const lastCut = s.cuts.at(-1)
  if (lastCut && now - lastCut.at < 4500) return 'joy'
  const lastCi = s.ciDone.at(-1)
  if (lastCi && lastCi.conclusion === 'success' && now - lastCi.at < 6000) return 'joy'
  const lastExposure = s.exposures.at(-1)
  const lastLine = s.lines.at(-1)
  const ciFailed = lastCi && lastCi.conclusion === 'failure' && now - lastCi.at < 60_000
  if ((lastExposure && now - lastExposure.at < 60_000) || (lastLine?.kind === 'note' && lastLine.tone === 'error') || ciFailed) return 'anger'
  const five = s.limits.five_hour?.percentUsed ?? 0
  if ((s.context?.percent ?? 0) >= 80 || five >= 90) return 'fear'
  const run = [...s.lines].reverse().find((l) => l.kind === 'shell')
  if (run?.kind === 'shell' && run.out.length > 50_000 && s.lines.indexOf(run) >= s.lines.length - 3) return 'disgust'
  if (s.lastTurnAt != null && !s.busy && now - s.lastTurnAt > 3600_000 && (s.context?.tokens ?? 0) >= 20_000) return 'sadness'
  if (s.asleep) return 'sleep'
  if (extra.focus) return 'focus'
  if (s.busy) return 'working'
  return 'idle'
}
