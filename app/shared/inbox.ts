// One inbox: mail and social mentions as conversations in one triage list. Each one is open, pending,
// snoozed or done; a snooze ends at a time or when they write again; saved replies expand variables;
// labels and saved views filter it; business hours tell triggers when to wait. Nothing here sends:
// a reply is a draft until the person presses Send. Ideas from chatwoot (MIT); no code taken.

export type Source = 'outlook' | 'gmail' | 'bluesky' | 'mastodon' | 'rocketchat'
export type Status = 'open' | 'pending' | 'snoozed' | 'done'

/** What a source gave this time: the latest message of a conversation. */
export type Incoming = { source: Source; id: string; thread: string; from: { name: string; handle: string }; subject?: string; text: string; at: string; url?: string; unread?: boolean }

export type Note = { at: number; text: string }
export type Kept = {
  status: Status
  /** a snooze: until a time, or until they write again */
  until?: number
  untilReply?: boolean
  /** when the status last changed, to tell a new message from one already seen */
  since: number
  lastAt?: string
  labels: string[]
  notes: Note[]
}
export type Conversation = Incoming & { key: string } & Kept

export const keyOf = (i: Pick<Incoming, 'source' | 'thread'>) => `${i.source}:${i.thread}`

/**
 * The list as it stands now: new conversations open, a snooze that ran out or got an answer opens
 * again, and a done or pending conversation with a newer message comes back as open.
 */
export function triage(items: Incoming[], kept: Record<string, Kept>, now = Date.now()): { list: Conversation[]; kept: Record<string, Kept> } {
  const next: Record<string, Kept> = { ...kept }
  const latest = new Map<string, Incoming>()
  for (const i of items) {
    const k = keyOf(i)
    const had = latest.get(k)
    if (!had || Date.parse(i.at) > Date.parse(had.at)) latest.set(k, i)
  }
  const list: Conversation[] = []
  for (const [key, i] of latest) {
    let k = next[key] ?? { status: 'open' as Status, since: now, labels: [], notes: [], lastAt: i.at }
    const newer = k.lastAt !== undefined && Date.parse(i.at) > Date.parse(k.lastAt)
    if (k.status === 'snoozed' && ((k.until && now >= k.until) || (k.untilReply && newer))) k = { ...k, status: 'open', until: undefined, untilReply: undefined, since: now }
    else if ((k.status === 'done' || k.status === 'pending') && newer) k = { ...k, status: 'open', since: now }
    k = { ...k, lastAt: i.at }
    next[key] = k
    list.push({ ...i, key, ...k })
  }
  return { list: list.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)), kept: next }
}

/** A status change; a snooze needs a time or "until they reply". */
export function setStatus(k: Kept, status: Status, now = Date.now(), snooze?: { until?: number; untilReply?: boolean }): Kept {
  if (status === 'snoozed' && !snooze?.until && !snooze?.untilReply) throw new Error('Snooze until a time, or until they reply.')
  return { ...k, status, since: now, until: status === 'snoozed' ? snooze?.until : undefined, untilReply: status === 'snoozed' ? snooze?.untilReply : undefined }
}

export type SavedReply = { shortcut: string; text: string }

/** Saved reply variables, from the conversation and the account. */
export function variables(c: Pick<Conversation, 'from' | 'subject'>, me: string): Record<string, string> {
  const name = c.from.name || c.from.handle
  return { name, first_name: name.split(/\s+/)[0] ?? name, handle: c.from.handle, subject: c.subject ?? '', my_name: me }
}

/** {{name}} and friends filled in; an unknown variable stays visible so it is noticed before sending. */
export const expand = (text: string, vars: Record<string, string>) => text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => vars[k] ?? m)

/** "/thanks" at the start of the reply box: the saved replies whose shortcut starts with it. */
export function matchShortcut(typed: string, replies: SavedReply[]): SavedReply[] {
  const m = /^\/(\w*)$/.exec(typed.trim())
  if (!m) return []
  return replies.filter((r) => r.shortcut.toLowerCase().startsWith(m[1]!.toLowerCase())).slice(0, 6)
}

export function checkReply(r: Partial<SavedReply>): string | null {
  if (!r.shortcut || !/^\w{2,30}$/.test(r.shortcut)) return 'The shortcut is one word, letters, numbers or _.'
  if (!r.text?.trim()) return 'Write the reply.'
  return null
}

/** The prompt that asks the local model which saved reply fits, if any. */
export const pickPrompt = (c: Pick<Conversation, 'text' | 'subject'>, replies: SavedReply[]) =>
  `Which saved reply fits this message best? Answer with its shortcut only, or "none".\n\nSaved replies:\n${replies.map((r) => `/${r.shortcut}: ${r.text.slice(0, 160)}`).join('\n')}\n\nMessage${c.subject ? ` (${c.subject})` : ''}:\n${c.text.slice(0, 1500)}`

export const parsePick = (s: string, replies: SavedReply[]) => {
  const w = /\/?(\w+)/.exec(s.trim().toLowerCase())?.[1]
  return replies.find((r) => r.shortcut.toLowerCase() === w) ?? null
}

/** One filter for the list: sources, statuses, labels (all of them), and words. */
export type View = { name: string; sources: Source[]; statuses: Status[]; labels: string[]; text: string }
export const ALL_VIEW: View = { name: 'All open', sources: [], statuses: ['open'], labels: [], text: '' }

export function applyView(list: Conversation[], v: View): Conversation[] {
  const words = v.text.toLowerCase().split(/\s+/).filter(Boolean)
  return list.filter(
    (c) =>
      (!v.sources.length || v.sources.includes(c.source)) &&
      (!v.statuses.length || v.statuses.includes(c.status)) &&
      v.labels.every((l) => c.labels.includes(l)) &&
      words.every((w) => `${c.from.name} ${c.from.handle} ${c.subject ?? ''} ${c.text} ${c.notes.map((n) => n.text).join(' ')}`.toLowerCase().includes(w)),
  )
}

export const counts = (list: Conversation[]) => ({ open: list.filter((c) => c.status === 'open').length, pending: list.filter((c) => c.status === 'pending').length, snoozed: list.filter((c) => c.status === 'snoozed').length, done: list.filter((c) => c.status === 'done').length })

/** Business hours: weekdays (0 is Sunday) and a time range, in the machine's time zone. */
export type Hours = { on: boolean; days: number[]; start: string; end: string }
export const DEFAULT_HOURS: Hours = { on: false, days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }
const mins = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** Whether a moment is inside business hours; always true when hours are off. */
export function within(h: Hours, d: Date): boolean {
  if (!h.on) return true
  const m = d.getHours() * 60 + d.getMinutes()
  return h.days.includes(d.getDay()) && m >= mins(h.start) && m < mins(h.end)
}

/** The next moment business hours open, from d (d itself when already open). */
export function nextOpen(h: Hours, d: Date): Date {
  if (within(h, d)) return d
  for (let i = 0; i < 8; i++) {
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i)
    const s = mins(h.start)
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(s / 60), s % 60)
    if (h.days.includes(at.getDay()) && at > d) return at
  }
  return d
}

export function checkHours(h: Hours): string | null {
  if (!/^\d\d:\d\d$/.test(h.start) || !/^\d\d:\d\d$/.test(h.end)) return 'Times as HH:MM.'
  if (mins(h.end) <= mins(h.start)) return 'The end comes after the start.'
  if (h.on && !h.days.length) return 'Pick at least one day.'
  return null
}

/** Quick snooze choices: later today, tomorrow morning, next week; each lands inside business hours. */
export function snoozeChoices(h: Hours, now: Date): { label: string; until: number }[] {
  const at = (days: number, hh: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, hh, 0)
  const later = new Date(now.getTime() + 3 * 3600_000)
  const monday = at(((8 - now.getDay()) % 7) || 7, 9)
  return [
    { label: 'In 3 hours', until: later.getTime() },
    { label: 'Tomorrow 9:00', until: nextOpen(h, at(1, 9)).getTime() },
    { label: 'Next week', until: nextOpen(h, monday).getTime() },
  ]
}
