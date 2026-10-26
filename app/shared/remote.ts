// Panels on your own machines over SSH (idea from Orca): Claude Code runs on the other machine, started
// through ssh, and talks to the app over that same pipe, so the app's own tools (panels, memory, manual)
// still work. Nothing of this Mac's environment goes along: the remote uses its own Claude Code login,
// and no key or token from the vault is sent.

/** A word for a POSIX shell, single-quoted. */
export const shq = (s: string) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`)

/** The environment variables that may go to the remote: Claude Code's own switches, never credentials. */
export function remoteEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) continue
    if (!/^(CLAUDE_CODE_ENTRYPOINT|CLAUDE_AGENT_SDK_VERSION|CLAUDE_CODE_DISABLE_[A-Z_]+|MAX_THINKING_TOKENS|DISABLE_[A-Z_]+)$/.test(k)) continue
    out[k] = v
  }
  return out
}

/** A folder on the remote: absolute or under ~, no shell tricks. */
export function checkRemoteDir(dir: string): string | null {
  if (!/^(~\/|\/)[\w@%+=:,./ -]*$/.test(dir)) return 'Give a folder on that machine: /path or ~/path, letters, digits and . _ - / only.'
  if (/(^|\/)\.\.(\/|$)/.test(dir)) return 'No .. in the folder.'
  return null
}

/** `~/x` as the remote shell understands it inside quotes: "$HOME"/x. */
export const dirWord = (dir: string) => (dir.startsWith('~/') ? `"$HOME"/${shq(dir.slice(2))}` : shq(dir))

/**
 * The command ssh runs: into the folder, then Claude Code from the remote's PATH (the local executable
 * path the SDK passes means nothing there), with the SDK's arguments as they are.
 */
export function remoteScript(dir: string, args: string[], env: Record<string, string | undefined>): string {
  const e = Object.entries(remoteEnv(env)).map(([k, v]) => `${k}=${shq(v)}`)
  // the SDK may pass the script of a local Node install first; the remote's claude replaces both
  const rest = args[0]?.endsWith('.js') || args[0]?.endsWith('.mjs') ? args.slice(1) : args
  return `cd ${dirWord(dir)} && exec ${e.length ? `env ${e.join(' ')} ` : ''}claude ${rest.map(shq).join(' ')}`
}

/** The ssh arguments: no password prompts (keys or an agent only), keepalives, the host from ~/.ssh/config. */
export function sshArgs(host: string, script: string): string[] {
  if (!/^[\w.@-]+$/.test(host)) throw new Error('Not a host name from ~/.ssh/config.')
  return ['-T', '-o', 'BatchMode=yes', '-o', 'ServerAliveInterval=30', '-o', 'ConnectTimeout=15', host, script]
}

/** The remote worktree for a panel: next to the repository, on its own branch. */
export function remoteWorktree(repo: string, id: string): { dir: string; branch: string; script: string } {
  const safe = id.replace(/[^a-z0-9-]/gi, '-').slice(0, 40)
  const dir = `~/.stm-worktrees/${safe}`
  const branch = `stm/${safe}`
  return { dir, branch, script: `mkdir -p "$HOME"/.stm-worktrees && git -C ${dirWord(repo)} worktree add -b ${shq(branch)} ${dirWord(dir)} HEAD` }
}

/** One git command in the remote folder, its arguments quoted one by one. */
export const remoteGit = (dir: string, args: string[]) => `cd ${dirWord(dir)} && git ${args.map(shq).join(' ')}`

/** ssh for an interactive terminal in the remote folder: a real pty there, the person's login shell. */
export function remoteShellArgs(host: string, dir: string): string[] {
  if (!/^[\w.@-]+$/.test(host)) throw new Error('Not a host name from ~/.ssh/config.')
  return ['-tt', '-o', 'BatchMode=yes', '-o', 'ServerAliveInterval=30', '-o', 'ConnectTimeout=15', host, `cd ${dirWord(dir)} && exec "\${SHELL:-/bin/sh}" -l`]
}

/** Merging a remote worktree's branch into the repository's current branch, then removing the worktree. */
export function remoteMerge(repo: string, dir: string, branch: string): string {
  return `set -e; git -C ${dirWord(repo)} merge --no-ff --no-edit ${shq(branch)}; git -C ${dirWord(repo)} worktree remove ${dirWord(dir)}; git -C ${dirWord(repo)} branch -d ${shq(branch)}`
}
/** Dropping a remote worktree and its branch, work included. */
export function remoteDrop(repo: string, dir: string, branch: string): string {
  return `git -C ${dirWord(repo)} worktree remove --force ${dirWord(dir)}; git -C ${dirWord(repo)} branch -D ${shq(branch)}`
}

/** A free-looking local port for a forwarded remote one: the same number when it is above 1024. */
export const localPortFor = (remote: number, taken: number[]) => {
  let p = remote > 1024 ? remote : remote + 20000
  while (taken.includes(p)) p++
  return p
}
