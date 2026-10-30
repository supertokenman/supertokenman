// Bounded event log per panel, kept in memory so a reopened window can replay scrollback.
// Evicts the oldest events once either the count or the byte cap is exceeded.

export interface EventRingOptions<T> {
  maxEvents?: number // default 2000
  maxBytes?: number // default 4 MB
  /** Size of one event in bytes; default is its UTF-8 JSON length. */
  size?: (event: T) => number
}

export class EventRing<T> {
  private items: { event: T; bytes: number }[] = []
  private total = 0
  private readonly maxEvents: number
  private readonly maxBytes: number
  private readonly size: (event: T) => number

  constructor(opts: EventRingOptions<T> = {}) {
    this.maxEvents = opts.maxEvents ?? 2000
    this.maxBytes = opts.maxBytes ?? 4 * 1024 * 1024
    this.size = opts.size ?? ((e) => new TextEncoder().encode(JSON.stringify(e) ?? '').length)
  }

  /** Appends an event. Returns false when the event alone is over the byte cap and was not kept. */
  push(event: T): boolean {
    const bytes = this.size(event)
    if (bytes > this.maxBytes) return false
    this.items.push({ event, bytes })
    this.total += bytes
    while (this.items.length > this.maxEvents || this.total > this.maxBytes) {
      this.total -= this.items.shift()!.bytes
    }
    return true
  }

  /** Events oldest first, the order they are replayed in. */
  toArray(): T[] {
    return this.items.map((i) => i.event)
  }

  get count(): number {
    return this.items.length
  }

  get bytes(): number {
    return this.total
  }

  clear(): void {
    this.items = []
    this.total = 0
  }
}
