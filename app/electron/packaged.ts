// What changes when the app runs as a packaged .app instead of from the source folder.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Apps opened from the Finder get launchd's bare PATH, without Homebrew, nvm or anything a shell profile
 * adds; git, gh, docker and npx would not be found. Read the PATH the user's login shell builds instead.
 */
export function shellPath(current = process.env.PATH ?? '', shell = process.env.SHELL || '/bin/zsh'): string {
  let fromShell = ''
  try {
    fromShell = execFileSync(shell, ['-ilc', 'printf "__PATH__%s__PATH__" "$PATH"'], { encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] }).match(/__PATH__(.*)__PATH__/)?.[1] ?? ''
  } catch {
    // a slow or broken profile: fall back to the usual places below
  }
  const usual = ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']
  return [...new Set([...fromShell.split(':'), ...current.split(':'), ...usual].filter(Boolean))].join(':')
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
