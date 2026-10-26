// The panel's terminal: a real shell (the person's login shell) in the panel's folder, through a
// pseudo-terminal, so interactive programs work (vim, htop, prompts, colours). One per panel, kept while
// the panel lives. Its environment is the app's plus the vault secrets marked for commands, like
// Claude's Bash; nothing else from the vault.
import { spawn, type IPty } from 'node-pty'

const ptys = new Map<string, IPty>()

export function openTerminal(p: { id: string; cwd: string; cols: number; rows: number; exec?: { file: string; args: string[] }; env: Record<string, string | undefined>; data: (d: string) => void; exit: (code: number) => void; proc?: (name: string) => void }) {
  closeTerminal(p.id)
  const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
  // a remote panel's terminal is ssh to that machine, with a pty there
  const t = spawn(p.exec?.file ?? shell, p.exec?.args ?? ['-l'], {
    name: 'xterm-256color',
    cols: Math.max(20, p.cols | 0),
    rows: Math.max(5, p.rows | 0),
    cwd: p.cwd,
    env: { ...Object.fromEntries(Object.entries(p.env).filter((e): e is [string, string] => typeof e[1] === 'string')), TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'SuperTokenMan' },
  })
  t.onData(p.data)
  // the program in the foreground (the shell itself when idle), told when it changes
  let last = ''
  const watch = setInterval(() => {
    let name = ''
    try {
      name = t.process
    } catch {
      return
    }
    if (name !== last) p.proc?.((last = name))
  }, 500)
  t.onExit(({ exitCode }) => {
    clearInterval(watch)
    if (ptys.get(p.id) === t) ptys.delete(p.id)
    p.exit(exitCode)
  })
  ptys.set(p.id, t)
  return shell.split('/').pop() ?? shell
}

export const writeTerminal = (id: string, data: string) => ptys.get(id)?.write(data)
export const resizeTerminal = (id: string, cols: number, rows: number) => ptys.get(id)?.resize(Math.max(20, cols | 0), Math.max(5, rows | 0))
export function closeTerminal(id: string) {
  const t = ptys.get(id)
  if (!t) return
  ptys.delete(id)
  try {
    t.kill()
  } catch {
    // already gone
  }
}
export const closeAllTerminals = () => [...ptys.keys()].forEach(closeTerminal)
