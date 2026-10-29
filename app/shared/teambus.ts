// Panels asking each other for help: panel A asks panel B a question, B's answer comes back to A as a new turn.
// Pure logic only: the caller stores the open asks and sends the text through the usual approvals and brake.

export type Ask = { id: string; from: string; to: string; question: string; depth: number; at: number }

export const MAX_DEPTH = 2
export const MAX_QUESTION = 4000
export const MAX_OPEN_PER_PANEL = 3

export function newAsk(from: string, to: string, question: string, depth = 0, now = Date.now(), id?: string): Ask {
  if (from === to) throw new Error('A panel cannot ask itself.')
  const q = question.trim()
  if (!q) throw new Error('Write the question.')
  if (depth > MAX_DEPTH) throw new Error('Too many hand-offs: panels asked each other more than 2 deep.')
  return { id: id ?? `a${now.toString(36)}`, from, to, question: q.slice(0, MAX_QUESTION), depth, at: now }
}

/** A reason string when `from` already has too many open asks, else null. */
export function canOpen(open: Ask[], from: string): string | null {
  const n = open.filter(a => a.from === from).length
  return n >= MAX_OPEN_PER_PANEL ? `${from} already has ${n} open questions. Wait for an answer first.` : null
}

/** True if the open asks already contain a chain to -> ... -> from, so asking from -> to would close a loop. */
export function wouldLoop(open: Ask[], from: string, to: string): boolean {
  if (to === from) return true
  const seen = new Set<string>([to])
  const queue = [to]
  while (queue.length) {
    const node = queue.shift()!
    for (const a of open) {
      if (a.from !== node || seen.has(a.to)) continue
      if (a.to === from) return true
      seen.add(a.to)
      queue.push(a.to)
    }
  }
  return false
}

export const askText = (fromName: string, a: Ask) =>
  `Panel ${fromName} asks for help:\n\n${a.question}\n\nAnswer in your reply; it goes back to ${fromName}. Do not edit files for this unless the question asks you to.`

export const replyText = (toName: string, a: Ask, reply: string) => {
  const body = reply.trim()
  if (!body) return `Panel ${toName} gave no answer.`
  const first = a.question.split('\n')[0].slice(0, 200)
  return `Panel ${toName} answered your question:\n\n> ${first}\n\n${body}`
}
