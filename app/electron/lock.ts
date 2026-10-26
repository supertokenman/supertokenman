// Touch ID: what asks for it and for how long an unlock holds. The rule lives here, in the main
// process, so a locked app refuses to change secrets even if its window were tampered with.

export type LockPrefs = { onOpen: boolean; idleMin: number; secrets: boolean }
export const DEFAULT_LOCK: LockPrefs = { onOpen: false, idleMin: 0, secrets: false }

/** How long one Touch ID unlocks the secrets for. */
export const GRACE_MS = 5 * 60_000

export class Gate {
  private last = 0
  constructor(
    private prefs: () => LockPrefs,
    private now: () => number = Date.now,
  ) {}
  unlocked() {
    this.last = this.now()
  }
  /** Locks again: the screen locked, the Mac slept, or the app was idle. */
  lock() {
    this.last = 0
  }
  secretsOpen(): boolean {
    return !this.prefs().secrets || this.now() - this.last < GRACE_MS
  }
  /** Throws when the secrets are locked, for the handlers that change them. */
  guard() {
    if (!this.secretsOpen()) throw new Error('Locked. Unlock with Touch ID to change your secrets.')
  }
}

export function cleanPrefs(p: Partial<LockPrefs> | undefined): LockPrefs {
  const idle = Number(p?.idleMin)
  return { onOpen: Boolean(p?.onOpen), idleMin: [0, 5, 15, 30, 60].includes(idle) ? idle : 0, secrets: Boolean(p?.secrets) }
}

/**
 * The Mac password prompt, for Macs without Touch ID or when the finger is not an option: macOS asks
 * for the password of an administrator of this Mac and the app only learns whether it was right.
 */
export function passwordPrompt(reason: string): [string, string[]] {
  const text = `SuperTokenMan wants to ${reason}.`.replace(/["\\]/g, '')
  return ['/usr/bin/osascript', ['-e', `do shell script "/usr/bin/true" with prompt "${text}" with administrator privileges`]]
}
