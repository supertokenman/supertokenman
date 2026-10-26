// How long things have run, and which deserve a look: pure, from the cloud scan.
import type { ProviderResult, Resource } from '../electron/cloud'

export const daysSince = (iso: string | undefined, now = Date.now()) => (iso && !Number.isNaN(Date.parse(iso)) ? Math.max(0, Math.floor((now - Date.parse(iso)) / 86_400_000)) : null)

/** Running two weeks or more: the kind of thing that keeps billing after a project is forgotten. */
export const forgotten = (r: Resource, now = Date.now()) => r.state === 'running' && r.region !== 'local' && (daysSince(r.since, now) ?? 0) >= 14

export function summary(results: ProviderResult[], now = Date.now()) {
  const all = results.flatMap((p) => p.resources)
  return {
    running: all.filter((r) => r.state === 'running' && r.region !== 'local').length,
    stopped: all.filter((r) => r.state === 'stopped').length,
    forgotten: all.filter((r) => forgotten(r, now)).length,
    connected: results.filter((p) => !p.missing && !p.error).length,
  }
}
