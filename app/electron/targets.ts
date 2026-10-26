// Where the panel's terminal can go besides this Mac: running containers, the hosts of ~/.ssh/config and
// running cloud machines. Each target is the plain command that opens its shell, typed into the terminal
// in full, so the person sees exactly what runs.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type Target = { kind: 'docker' | 'ssh' | 'cloud'; name: string; detail: string; command: string }

const safe = (s: string) => /^[\w.@:/=-]+$/.test(s)

/** Hosts named in an SSH config: the concrete ones, not the patterns (*, ?, !). */
export function sshHosts(text: string): Target[] {
  const out: Target[] = []
  let cur: { names: string[]; host?: string; user?: string } | null = null
  const flush = () => {
    if (!cur) return
    for (const n of cur.names) if (!/[*?!]/.test(n) && safe(n)) out.push({ kind: 'ssh', name: n, detail: [cur.user, cur.host].filter(Boolean).join('@') || 'ssh config', command: `ssh ${n}` })
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const [key = '', ...rest] = line.split(/\s+/)
    const value = rest.join(' ')
    if (/^host$/i.test(key)) {
      flush()
      cur = { names: value.split(/\s+/) }
    } else if (/^match$/i.test(key)) {
      flush()
      cur = null
    } else if (cur && /^hostname$/i.test(key)) cur.host = value
    else if (cur && /^user$/i.test(key)) cur.user = value
  }
  flush()
  return out
}

export function sshTargets(file = join(homedir(), '.ssh', 'config')): Target[] {
  try {
    return sshHosts(readFileSync(file, 'utf8'))
  } catch {
    return []
  }
}

/** A shell in a running container: bash when it has one, sh otherwise. */
export const dockerTarget = (c: { id: string; name: string; image: string }): Target => ({
  kind: 'docker',
  name: c.name,
  detail: c.image,
  command: `docker exec -it ${safe(c.name) ? c.name : c.id} sh -c 'command -v bash >/dev/null && exec bash || exec sh'`,
})
