// Phase 116: the machine's docker compose stacks (idea from Dockge, our own code): the list, each
// stack's compose file to read and edit, its services, and their logs. Nothing here starts or stops
// a stack; that is always the person's click and a confirm in the main process.

export type Stack = { name: string; status: string; files: string[]; running: number; total: number }
export type Service = { name: string; container: string; state: string; status: string; image: string; ports: string }
export type Act = 'up' | 'stop' | 'pull'
export const ACTS: Act[] = ['up', 'stop', 'pull']

/** "running(2), exited(1)" into counts. */
export function countsOf(status: string): { running: number; total: number } {
  let running = 0
  let total = 0
  for (const m of status.matchAll(/(\w+)\((\d+)\)/g)) {
    total += Number(m[2])
    if (m[1] === 'running') running += Number(m[2])
  }
  return { running, total }
}

/** `docker compose ls -a --format json` (one JSON array) into stacks, by name. */
export function stacksOf(out: string): Stack[] {
  let arr: unknown
  try {
    arr = JSON.parse(out.trim() || '[]')
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []
  return arr
    .map((j: Record<string, unknown>) => {
      const status = String(j.Status ?? '')
      return { name: String(j.Name ?? ''), status, files: String(j.ConfigFiles ?? '').split(',').map((s) => s.trim()).filter(Boolean), ...countsOf(status) }
    })
    .filter((s) => s.name)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** `docker compose ps -a --format json`: newer versions print one object per line, older ones one array. */
export function servicesOf(out: string): Service[] {
  const t = out.trim()
  if (!t) return []
  let items: Record<string, unknown>[] = []
  try {
    const j = JSON.parse(t) as unknown
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
    .map((j) => ({ name: String(j.Service ?? ''), container: String(j.Name ?? ''), state: String(j.State ?? ''), status: String(j.Status ?? ''), image: String(j.Image ?? ''), ports: String(j.Ports ?? '') }))
    .filter((s) => s.name)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Service names from `docker compose config --services`, so stopped stacks still list them. */
export const serviceNames = (out: string) => out.split('\n').map((s) => s.trim()).filter(Boolean)

/** The first useful line of a compose error ("validating x: services.web.ports must be a list"). */
export function configError(stderr: string): string {
  const lines = stderr.split('\n').map((l) => l.trim()).filter(Boolean).filter((l) => !/^time=|level=warning/.test(l))
  return (lines[0] ?? 'docker compose config failed').replace(/^error while interpolating /, '').slice(0, 400)
}

/** Only a file the stack itself names is read or written; never a path the renderer makes up. */
export const fileOf = (stacks: Stack[], name: string, file: string) => (stacks.find((s) => s.name === name)?.files.includes(file) ? file : null)

/** The arguments for an action; `up` is detached and never removes orphans or volumes. */
export function argsFor(stack: Stack, act: Act): string[] {
  const base = ['compose', '-p', stack.name, ...stack.files.flatMap((f) => ['-f', f])]
  if (act === 'up') return [...base, 'up', '-d']
  if (act === 'stop') return [...base, 'stop']
  return [...base, 'pull']
}

/** What the confirm says before an action, in plain words. */
export function confirmText(stack: Stack, act: Act): string {
  if (act === 'up') return `Start ${stack.name}? Containers that changed are made again; images not on this machine are pulled.`
  if (act === 'stop') return `Stop ${stack.name}? ${stack.running} running container${stack.running === 1 ? '' : 's'} stop; nothing is removed.`
  return `Pull new images for ${stack.name}? Running containers keep the old ones until you start it again.`
}
