// A group room on the canvas: the person writes once to several linked panels. The panel named with @name
// answers first; the others take turns only when the person asks, each turn passed over (and charged to) the
// link between the last speaker and the next. Pure: main.ts delivers, with the usual approvals and link caps.

export type Member = { sid: string; name: string }
export type Turn = { to: string; from: string | null }

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '-')

/** @names in the text, lowercased, in order, once each. */
export function mentions(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/(?:^|[^\w@])@([\w][\w.-]*)/g)) {
    const n = norm(m[1]!.replace(/[.-]+$/, ''))
    if (n && !out.includes(n)) out.push(n)
  }
  return out
}

/** Who answers first: the first member named with @name; an exact name wins over a prefix. */
export function firstSpeaker(text: string, members: Member[]): string {
  for (const n of mentions(text)) {
    const hit = members.find((m) => norm(m.name) === n) ?? members.filter((m) => norm(m.name).startsWith(n)).at(0)
    if (hit) return hit.sid
  }
  throw new Error(members.length ? `Name who answers with @name: ${members.map((m) => `@${norm(m.name)}`).join(', ')}.` : 'The room has no panels.')
}

/** Members in room order after the first speaker, wrapping around. */
export function turnOrder(members: Member[], first: string): string[] {
  const i = members.findIndex((m) => m.sid === first)
  if (i < 0) return []
  return [...members.slice(i), ...members.slice(0, i)].map((m) => m.sid)
}

/** The next turn when the person asks: who has not spoken yet, passed from the last speaker. Null when all have. */
export function nextTurn(members: Member[], spoken: string[]): Turn | null {
  if (!spoken.length) return null
  const to = turnOrder(members, spoken[0]!).find((s) => !spoken.includes(s))
  return to ? { to, from: spoken.at(-1)! } : null
}

/** A room needs two or more distinct panels, each linked to at least one other member. */
export function checkRoom(members: Member[], linked: (a: string, b: string) => boolean): string | null {
  const ids = [...new Set(members.map((m) => m.sid))]
  if (ids.length < 2) return 'A room needs two or more panels.'
  const alone = members.find((m) => !ids.some((o) => o !== m.sid && linked(m.sid, o)))
  return alone ? `${alone.name} is not linked to anyone in the room. Link the panels first.` : null
}

/** What the next speaker reads: the person's message and the last reply. */
export function turnText(ask: string, lastName: string, lastReply: string): string {
  return `Room message from the person:\n${ask.trim()}\n\nReply from ${lastName}:\n${lastReply.trim() || '(no reply yet)'}\n\nYour turn: add what the others missed, or say you agree.`
}
