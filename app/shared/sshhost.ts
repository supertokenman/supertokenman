// A saved SSH machine: a name the person gave it, and an alias from ~/.ssh/config (or user@host).
// Only the alias and folder are stored; keys, passwords and agent sockets never are. Pure checks, no I/O.
import { checkRemoteDir } from './remote.js'

/** One saved machine, as Settings > Machines lists it. */
export type SshHost = { id: string; name: string; sshAlias: string; defaultDir: string; claudePath?: string }

/** A host alias or user@host: letters, digits, . _ -, starting with a letter, digit or _. Ports go in ~/.ssh/config. */
const ALIAS = /^[A-Za-z0-9_][A-Za-z0-9_.-]*(@[A-Za-z0-9_][A-Za-z0-9_.-]*)?$/

/** Null when the alias is safe to pass to ssh after `--`, otherwise the reason to show. */
export function checkSshAlias(alias: string): string | null {
  if (alias.length === 0 || alias.length > 255) return 'Give an alias of 1 to 255 characters.'
  if (alias.startsWith('-')) return 'The alias cannot start with -.'
  if (/\s/.test(alias)) return 'No spaces in the alias.'
  if (!ALIAS.test(alias)) return 'Use a Host name from ~/.ssh/config, or user@host, with letters, digits, . _ - only.'
  return null
}

/** Null when a saved host is complete and safe, otherwise the first reason to show. */
export function checkSshHost(host: SshHost): string | null {
  if (host.name.trim().length === 0) return 'Give the machine a name.'
  const alias = checkSshAlias(host.sshAlias)
  if (alias) return alias
  return checkRemoteDir(host.defaultDir)
}
