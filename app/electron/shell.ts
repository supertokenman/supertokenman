// Commands typed by the person run here, in the panel's folder, in their own login shell:
// no model involved, no tokens spent. Output streams back in chunks; a run can be stopped.
import { spawn, type ChildProcess } from 'node:child_process'

export type ShellEvent =
  | { kind: 'shell-start'; id: string; command: string; cwd: string }
  | { kind: 'shell-out'; id: string; text: string; stream: 'out' | 'err' }
  | { kind: 'shell-end'; id: string; code: number | null; ms: number }

const MAX_OUTPUT = 400_000

export class ShellRunner {
  private running = new Map<string, ChildProcess>()
  private n = 0

  constructor(private emit: (e: ShellEvent) => void, private opts: { shell?: string; env?: () => NodeJS.ProcessEnv } = {}) {}

  run(command: string, cwd: string): string {
    const id = `sh${++this.n}`
    const shell = this.opts.shell || process.env.SHELL || '/bin/bash'
    const started = Date.now()
    this.emit({ kind: 'shell-start', id, command, cwd })
    // a login shell reads the person's profile: PATH, nvm, aliases
    const child = spawn(shell, ['-lc', command], { cwd, env: { ...process.env, ...this.opts.env?.(), FORCE_COLOR: '0' } })
    this.running.set(id, child)
    let size = 0
    const forward = (stream: 'out' | 'err') => (chunk: Buffer) => {
      if (size > MAX_OUTPUT) return
      size += chunk.length
      const text = size > MAX_OUTPUT ? `${chunk.toString('utf8')}\n... output cut at ${MAX_OUTPUT / 1000} kB` : chunk.toString('utf8')
      this.emit({ kind: 'shell-out', id, text, stream })
    }
    child.stdout?.on('data', forward('out'))
    child.stderr?.on('data', forward('err'))
    child.on('error', (err) => this.emit({ kind: 'shell-out', id, text: `${err.message}\n`, stream: 'err' }))
    child.on('close', (code) => {
      this.running.delete(id)
      this.emit({ kind: 'shell-end', id, code, ms: Date.now() - started })
    })
    return id
  }

  stop(id: string) {
    this.running.get(id)?.kill('SIGINT')
  }

  stopAll() {
    for (const c of this.running.values()) c.kill('SIGTERM')
  }
}
