// What changes when the app runs as a packaged .app instead of from the source folder.
import { execFile, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Apps opened from the Finder get launchd's bare PATH, without Homebrew, nvm or anything a shell profile
 * adds; git, gh, docker and npx would not be found. Read the PATH the user's login shell builds instead.
 */
const PRINT_PATH = ['-ilc', 'printf "__PATH__%s__PATH__" "$PATH"']
const USUAL = ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']
const between = (out: string) => out.match(/__PATH__(.*)__PATH__/)?.[1] ?? ''

/** The shell's PATH first, then the current one, then the usual places, each once. */
export function mergePath(fromShell: string, current: string): string {
  return [...new Set([...fromShell.split(':'), ...current.split(':'), ...USUAL].filter(Boolean))].join(':')
}

export function shellPath(current = process.env.PATH ?? '', shell = process.env.SHELL || '/bin/zsh'): string {
  let fromShell = ''
  try {
    fromShell = between(execFileSync(shell, PRINT_PATH, { encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] }))
  } catch {
    // a slow or broken profile: fall back to the usual places below
  }
  return mergePath(fromShell, current)
}

/**
 * The same, without holding the main process: a login shell with a heavy profile (nvm, oh-my-zsh) takes
 * from a few hundred milliseconds to seconds, and the window waited for it. Never fails.
 */
export function shellPathAsync(current = process.env.PATH ?? '', shell = process.env.SHELL || '/bin/zsh'): Promise<string> {
  return new Promise((done) => {
    execFile(shell, PRINT_PATH, { encoding: 'utf8', timeout: 4000 }, (_err, out) => done(mergePath(between(String(out ?? '')), current)))
  })
}

/**
 * The Claude Code binary the Agent SDK ships per platform. Packaged, it sits in app.asar.unpacked: a
 * file inside the asar archive cannot be executed.
 */
export function claudeBinary(resources: string, platform = process.platform, arch = process.arch): string | undefined {
  const name = platform === 'win32' ? 'claude.exe' : 'claude'
  const p = join(resources, 'app.asar.unpacked', 'node_modules', '@anthropic-ai', `claude-agent-sdk-${platform}-${arch}`, name)
  return existsSync(p) ? p : undefined
}
