// Hook templates for captions: four built-in formats, each with one slot. Pure: no I/O, no network, no Claude call.
// A format describes the shape of a caption; it does not say that the shape gets views.

export type FormatId = 'choice' | 'when' | 'facts' | 'sendto'

/** A caption format. `template` holds exactly one `{slot}` placeholder. */
export type HookFormat = { id: FormatId; label: string; template: string }

export const SLOT = '{slot}'
export const MAX_SLOT = 200

export const BUILTIN_FORMATS: readonly HookFormat[] = [
  { id: 'choice', label: 'Choice question', template: `${SLOT}?` },
  { id: 'when', label: 'When + subject', template: `When ${SLOT}` },
  { id: 'facts', label: 'Facts', template: `Facts: ${SLOT}` },
  { id: 'sendto', label: 'Send this to the one who', template: `Send this to the one who ${SLOT}` },
]

export type Fill = { kind: 'ok'; text: string } | { kind: 'bad-slot'; reason: string }
export type Check = { kind: 'ok' } | { kind: 'bad-shape'; reason: string }

/** A slot is one non-empty line, at most MAX_SLOT characters, and cannot contain the placeholder. */
function slotProblem(slot: string): string | null {
  const s = slot.trim()
  if (s === '') return 'slot is empty'
  if (/[\r\n]/.test(s)) return 'slot must be one line'
  if (s.length > MAX_SLOT) return `slot is longer than ${MAX_SLOT} characters`
  if (s.includes(SLOT)) return 'slot cannot contain the placeholder'
  return null
}

/** Put the slot into the format's template. The slot is trimmed. */
export function fill(format: HookFormat, slot: string): Fill {
  const problem = slotProblem(slot)
  if (problem) return { kind: 'bad-slot', reason: problem }
  return { kind: 'ok', text: format.template.replace(SLOT, slot.trim()) }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Check that a caption keeps the format's template shape with a valid slot. */
export function validateHook(format: HookFormat, text: string): Check {
  const [before = '', after = ''] = format.template.split(SLOT)
  const re = new RegExp(`^${escapeRegExp(before)}([\\s\\S]*)${escapeRegExp(after)}$`)
  const m = re.exec(text)
  if (!m) return { kind: 'bad-shape', reason: 'caption does not keep the template shape' }
  const problem = slotProblem(m[1] ?? '')
  if (problem) return { kind: 'bad-shape', reason: problem }
  return { kind: 'ok' }
}

/** Name the built-in format a caption matches, or null. Prefix formats are checked before the question. */
export function detectFormat(caption: string): FormatId | null {
  const c = caption.trim()
  if (/^facts:/i.test(c)) return 'facts'
  if (/^when\s+(?:he|she|they|you|we|i|it|your|my|his|her|our)\b/i.test(c)) return 'when'
  if (/^send this to the one who\b/i.test(c)) return 'sendto'
  if (/\?$/.test(c) && /\sor\s/i.test(c)) return 'choice'
  return null
}
