// Phase 117: Docker on other machines through docker contexts (idea from Portainer, our own code).
// A remote host is read-only until the person turns actions on for it, and even then every action
// on it is confirmed with the host's name. No agent is installed anywhere; contexts reach hosts over
// ssh:// or tcp:// as the docker CLI already does.

export type Host = { name: string; endpoint: string; current: boolean; remote: boolean; description: string }

/** Local sockets are this machine; anything else (ssh://, tcp://, a remote DOCKER_HOST) is another one. */
export const isRemote = (endpoint: string) => !/^(unix|npipe):\/\//.test(endpoint.trim())

/** `docker context ls --format json`: one object per line in recent versions, an array in older ones. */
export function hostsOf(out: string): Host[] {
  const t = out.trim()
  let items: Record<string, unknown>[] = []
  try {
    const j = JSON.parse(t || '[]') as unknown
    items = Array.isArray(j) ? (j as Record<string, unknown>[]) : [j as Record<string, unknown>]
  } catch {
    items = t.split('\n').flatMap((l) => {
      try {
        return [JSON.parse(l) as Record<string, unknown>]
      } catch {
        return []
      }
    })
  }
  return items
    .map((j) => {
      const endpoint = String(j.DockerEndpoint ?? '')
      return { name: String(j.Name ?? ''), endpoint, current: j.Current === true || j.Current === 'true', remote: isRemote(endpoint), description: String(j.Description ?? '') }
    })
    .filter((h) => h.name)
}

/** Context names as docker accepts them; anything else is refused before it reaches the CLI. */
export const NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.+-]*$/

/** The flag that points one docker call at a host; empty means the CLI's current context. */
export const ctxArgs = (name: string) => (name ? ['--context', name] : [])

export type Why = 'read-only' | 'confirm'
/** Whether an action may run on this host now. Local hosts follow the screen's own asks. */
export function blocked(host: Host | undefined, writable: Record<string, boolean>, confirmed: boolean): Why | null {
  if (!host?.remote) return null
  if (!writable[host.name]) return 'read-only'
  if (!confirmed) return 'confirm'
  return null
}

export const blockedText = (host: string, why: Why) => (why === 'read-only' ? `${host} is read-only here. Turn on actions for it first.` : `Actions on ${host} need a confirm each time.`)

/** "ssh://deploy@web-1.example.com" → "web-1.example.com", for labels. */
export const hostLabel = (h: Host) => (h.remote ? h.endpoint.replace(/^\w+:\/\//, '').replace(/^[^@]*@/, '').replace(/:\d+$/, '') || h.name : 'this machine')
