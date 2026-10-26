// A turn going in circles: the same tool call again and again, or the same error coming back. When it
// happens the panel stops and asks, instead of spending the plan on more of the same.

const norm = (s: string) => s.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().slice(0, 200)

export class LoopWatch {
  private calls: string[] = []
  private errors: string[] = []
  constructor(
    private sameCalls = 3,
    private window = 6,
    private sameErrors = 3,
  ) {}

  /** A new message from the person: whatever repeated before is not a loop of this turn. */
  reset() {
    this.calls = []
    this.errors = []
  }

  /** A tool call; the reason when this exact call has now come back too many times in a short run. */
  tool(name: string, summary: string): string | null {
    const sig = `${name}\u0000${norm(summary)}`
    this.calls = [...this.calls, sig].slice(-this.window)
    const n = this.calls.filter((c) => c === sig).length
    return n >= this.sameCalls ? `${name} ran ${n} times with the same input${summary ? ` (${summary.slice(0, 80)})` : ''}.` : null
  }

  /** A tool error; the reason when the same error has now come back several times in a row. */
  error(text: string): string | null {
    const e = norm(text.split('\n').find((l) => l.trim()) ?? text)
    this.errors = [...this.errors, e].slice(-this.sameErrors)
    return this.errors.length >= this.sameErrors && this.errors.every((x) => x === e) ? `The same error came back ${this.sameErrors} times: ${e.slice(0, 100)}` : null
  }
}
