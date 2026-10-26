// The router as a cascade: the local model drafts every small task, and Claude is asked only when a
// rule says the draft cannot be trusted: empty, unsure, the wrong shape for the task, or too long.

import type { Kind } from './arena.js'

const UNSURE = /\b(?:i(?:'m| am) not sure|i don'?t know|i cannot|i can'?t (?:help|determine)|as an ai|não sei|nao sei|não tenho certeza|não consigo)\b/i

/** Why a local draft goes up to Claude, or null when it can stand. */
export function deferReason(kind: Kind, prompt: string, answer: string): string | null {
  const a = answer.trim()
  if (!a) return 'empty draft'
  if (UNSURE.test(a)) return 'the draft says it is unsure'
  if (kind === 'commit') {
    const first = a.split('\n')[0]!
    if (first.length > 72) return 'commit subject over 72 characters'
    if (/^```|^here(?:'s| is)/i.test(first)) return 'commit message wrapped in chatter'
  }
  if (kind === 'classify' && a.split(/\s+/).length > 3) return 'asked to pick one, answered with more'
  if (a.length > Math.max(4000, prompt.length * 3)) return 'draft far longer than the task'
  return null
}
