// The credential vault: values encrypted at rest with a key the OS keeps (Keychain on macOS, through
// Electron's safeStorage), in one JSON file in the app's data folder. Values never reach the window;
// it sees names, when each was saved, and whether commands may read it.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export type Cipher = { encrypt: (plain: string) => Buffer; decrypt: (data: Buffer) => string; available: () => boolean }
export type SecretInfo = { name: string; savedAt: number; forCommands: boolean }
type Stored = { data: string; savedAt: number; forCommands: boolean }

export const validName = (n: string) => /^[A-Z][A-Z0-9_]{1,63}$/.test(n)

export class Vault {
  private items: Record<string, Stored> = {}

  constructor(private file: string, private cipher: Cipher) {
    try {
      if (existsSync(file)) this.items = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Stored>
    } catch {
      this.items = {}
    }
  }

  private save() {
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(this.items, null, 2), { mode: 0o600 })
  }

  list(): SecretInfo[] {
    return Object.entries(this.items)
      .map(([name, s]) => ({ name, savedAt: s.savedAt, forCommands: s.forCommands }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  set(name: string, value: string, forCommands = false) {
    if (!validName(name)) throw new Error('Use UPPER_SNAKE_CASE for the name, like SUPABASE_ACCESS_TOKEN.')
    if (!value) throw new Error('The value is empty.')
    if (!this.cipher.available()) throw new Error('The system keychain is not available, so the vault cannot encrypt.')
    this.items[name] = { data: this.cipher.encrypt(value).toString('base64'), savedAt: Date.now(), forCommands: this.items[name]?.forCommands ?? forCommands }
    this.save()
  }

  setForCommands(name: string, on: boolean) {
    const s = this.items[name]
    if (!s) return
    s.forCommands = on
    this.save()
  }

  delete(name: string) {
    delete this.items[name]
    this.save()
  }

  get(name: string): string | undefined {
    const s = this.items[name]
    if (!s) return undefined
    try {
      return this.cipher.decrypt(Buffer.from(s.data, 'base64'))
    } catch {
      return undefined
    }
  }

  /** Every saved value, for masking it wherever it shows up. */
  all(): { name: string; value: string }[] {
    return Object.keys(this.items).flatMap((name) => {
      const value = this.get(name)
      return value ? [{ name, value }] : []
    })
  }

  /** What the person's commands and Claude's Bash get: only the credentials marked for commands. */
  commandEnv(): Record<string, string> {
    const env: Record<string, string> = {}
    for (const [name, s] of Object.entries(this.items)) if (s.forCommands) {
      const v = this.get(name)
      if (v) env[name] = v
    }
    return env
  }
}
