// Pure helpers of the Pilot sheet: the model it starts on, the confirm card read back from the ask main
// sent, and the words of the actions list. No React, so they are tested without a DOM.
import { MAIN_MODELS, type Model } from '../../shared/models'
import type { PilotAction } from '../bridge'

/** The cheapest current model: the Pilot reads and clicks, it does not write code (spec-pilot.md, decided). */
export function smallestModel(list: readonly Model[] = MAIN_MODELS): Model {
  return [...list].sort((a, b) => a.price.input - b.price.input || a.price.output - b.price.output)[0]!
}

export type Card = { title: string; args: { key: string; value: string }[]; tier: 'free' | 'ask' | 'confirm'; irreversible: boolean }

/** `Pilot: Title (a=1, b=2) [ask]. This cannot be undone.` as main writes it (electron/pilottools.ts cardText). */
export function parseCard(summary: string): Card | null {
  const m = /^Pilot: (.+?)(?: \((.*)\))? \[(free|ask|confirm)\](\. This cannot be undone\.)?$/s.exec(summary.trim())
  if (!m) return null
  const args = (m[2] ?? '')
    .split(/, (?=\w+=)/)
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf('=')
      return { key: p.slice(0, i), value: p.slice(i + 1) }
    })
  return { title: m[1]!, args, tier: m[3] as Card['tier'], irreversible: Boolean(m[4]) }
}

export const TIER_WORDS: Record<Card['tier'], string> = {
  free: 'Free: runs at once',
  ask: 'Ask: shows you a card',
  confirm: 'Confirm: always asks',
}

export type UndoReason = NonNullable<Awaited<ReturnType<Window['stm']['pilot']['undo']>>['reason']>

export function reasonText(reason: UndoReason | undefined): string {
  switch (reason) {
    case 'missing':
      return 'Already undone.'
    case 'irreversible':
      return 'This cannot be undone.'
    case 'none':
      return 'Nothing to undo.'
    case 'changed':
      return 'Changed since, so it was left as it is.'
    default:
      return 'Could not undo it.'
  }
}

/** The newest action that has an inverse: what "undo last" reverts. */
export const lastUndoable = (actions: readonly PilotAction[]): PilotAction | undefined => actions.find((a) => a.undo !== null && !a.irreversible)

export function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 10) return 'just now'
  if (s < 60) return `${s} s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`
}
