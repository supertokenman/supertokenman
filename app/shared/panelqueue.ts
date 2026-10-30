// Per-panel message queue: what the person sent while a turn ran, in order. Pure reducer; the main process
// keeps the queue in settings (panelQueues) and pushes the head item when nextToSend says so.
// Sending items are always at the front; a steer goes in front of the waiting items.

export type QueueItem = { id: string; text: string; at: number; steer?: 'next' | 'interrupt'; askId?: string; state: 'waiting' | 'sending' }
export type PanelQueue = { items: QueueItem[]; paused: boolean; pauseReason?: string }
export type QueueAction =
  | { t: 'add'; item: QueueItem }
  | { t: 'edit'; id: string; text: string }
  | { t: 'cancel'; id: string }
  | { t: 'move'; id: string; to: number }
  | { t: 'steer'; id: string; mode: 'next' | 'interrupt' }
  | { t: 'pause'; reason?: string }
  | { t: 'resume' }
  | { t: 'turnEnded'; ok: boolean }
  | { t: 'sent'; id: string }
  | { t: 'loaded' }

export const MAX_ITEMS = 50
export const MAX_CHARS = 20_000

export const emptyQueue = (): PanelQueue => ({ items: [], paused: false })

const at = (q: PanelQueue, id: string) => q.items.findIndex((x) => x.id === id)
/** Index of the first waiting item: the sending items before it are in flight. */
const lead = (q: PanelQueue) => {
  const i = q.items.findIndex((x) => x.state === 'waiting')
  return i < 0 ? q.items.length : i
}
const textOk = (t: string) => t.trim().length > 0 && t.length <= MAX_CHARS

export function reduce(q: PanelQueue, a: QueueAction): PanelQueue {
  switch (a.t) {
    case 'add': {
      if (q.items.length >= MAX_ITEMS || !textOk(a.item.text)) return q
      const item: QueueItem = { ...a.item, state: 'waiting' }
      const i = item.steer ? lead(q) : q.items.length
      return { ...q, items: [...q.items.slice(0, i), item, ...q.items.slice(i)] }
    }
    case 'edit': {
      const i = at(q, a.id)
      if (i < 0 || q.items[i]!.state !== 'waiting' || !textOk(a.text)) return q
      return { ...q, items: q.items.map((x, k) => (k === i ? { ...x, text: a.text } : x)) }
    }
    case 'cancel': {
      const i = at(q, a.id)
      if (i < 0 || q.items[i]!.state !== 'waiting') return q
      return { ...q, items: q.items.filter((_, k) => k !== i) }
    }
    case 'move': {
      const i = at(q, a.id)
      if (i < 0 || q.items[i]!.state !== 'waiting') return q
      const rest = q.items.filter((_, k) => k !== i)
      const to = Math.min(Math.max(a.to, lead(q)), rest.length)
      return { ...q, items: [...rest.slice(0, to), q.items[i]!, ...rest.slice(to)] }
    }
    case 'steer': {
      const i = at(q, a.id)
      if (i < 0 || q.items[i]!.state !== 'waiting') return q
      const item = { ...q.items[i]!, steer: a.mode }
      const rest = q.items.filter((_, k) => k !== i)
      const to = lead(q)
      return { ...q, items: [...rest.slice(0, to), item, ...rest.slice(to)] }
    }
    case 'pause': {
      const { pauseReason: _old, ...base } = q
      return { ...base, paused: true, ...(a.reason ? { pauseReason: a.reason } : {}) }
    }
    case 'resume': {
      const { pauseReason: _old, ...base } = q
      return { ...base, paused: false }
    }
    case 'turnEnded': {
      if (a.ok) {
        if (!q.items.some((x) => x.state === 'sending')) return q
        return { ...q, items: q.items.filter((x) => x.state !== 'sending') }
      }
      // A failed turn keeps its text: the item waits again and the queue stops rather than retrying into an error loop.
      if (!q.items.length) return q
      const items = q.items.map((x) => (x.state === 'sending' ? { ...x, state: 'waiting' as const } : x))
      return { ...q, items, paused: true, pauseReason: 'The last turn failed' }
    }
    case 'sent': {
      const i = at(q, a.id)
      if (i < 0 || q.items[i]!.state !== 'waiting') return q
      return { ...q, items: q.items.map((x, k) => (k === i ? { ...x, state: 'sending' as const } : x)) }
    }
    case 'loaded': {
      const items = q.items.map((x) => (x.state === 'sending' ? { ...x, state: 'waiting' as const } : x))
      return { items, paused: true, pauseReason: 'Paused after restart: resume to send' }
    }
  }
}

/** The item to push now: the head waiting item, only when no turn runs, the queue is not paused and nothing is in flight. */
export function nextToSend(q: PanelQueue, busy: boolean): QueueItem | null {
  if (busy || q.paused || q.items.some((x) => x.state === 'sending')) return null
  return q.items.find((x) => x.state === 'waiting') ?? null
}

/** The head item is an interrupt steer and a turn runs: the app interrupts, then sends it when the interrupted result arrives. */
export function interruptFor(q: PanelQueue, busy: boolean): QueueItem | null {
  if (!busy || q.paused) return null
  const head = q.items.find((x) => x.state === 'waiting')
  return head?.steer === 'interrupt' ? head : null
}

export type Estimate = { turns: number; usd: number | null }

/** Waiting turns and their likely cost: the median of the last 10 recent turn costs times the turns. usd is null with no history. */
export function estimate(q: PanelQueue, recentCosts: number[]): Estimate {
  const turns = q.items.filter((x) => x.state === 'waiting').length
  const xs = recentCosts.filter((x) => Number.isFinite(x) && x >= 0).slice(-10).sort((a, b) => a - b)
  if (!xs.length) return { turns, usd: null }
  const m = Math.floor(xs.length / 2)
  const median = xs.length % 2 ? xs[m]! : (xs[m - 1]! + xs[m]!) / 2
  return { turns, usd: median * turns }
}
