// Phase 107: the containers the app made (isolated panels, self-hosted apps), found by its label and
// shown with their events and use. Stopping or removing one is always the person's click.

export const LABEL = 'stm=1'
export type Row = { id: string; name: string; image: string; state: string; status: string; kind: string; created: string }
export type Use = { cpu: number; memUsed: string; memPct: number }
export type Ev = { at: number; id: string; name: string; action: string }

/** `docker ps -a --filter label=stm=1 --format '{{json .}}'` lines into rows; anything without the label is dropped. */
export function rowsOf(out: string): Row[] {
  return out.split('\n').flatMap((l) => {
    try {
      const j = JSON.parse(l) as Record<string, string>
      const labels = Object.fromEntries(String(j.Labels ?? '').split(',').filter(Boolean).map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)]))
      if (labels.stm !== '1') return []
      return [{ id: String(j.ID), name: String(j.Names), image: String(j.Image), state: String(j.State), status: String(j.Status), kind: labels['stm.kind'] ?? 'app', created: String(j.CreatedAt ?? '') }]
    } catch {
      return []
    }
  })
}

/** `docker stats --no-stream --format '{{json .}}'` lines into use per container name. */
export function useOf(out: string): Record<string, Use> {
  const r: Record<string, Use> = {}
  for (const l of out.split('\n')) {
    try {
      const j = JSON.parse(l) as Record<string, string>
      r[String(j.Name)] = { cpu: parseFloat(String(j.CPUPerc)) || 0, memUsed: String(j.MemUsage ?? '').split('/')[0]!.trim(), memPct: parseFloat(String(j.MemPerc)) || 0 }
    } catch {
      // a partial line while docker writes
    }
  }
  return r
}

/** One line of `docker events --filter label=stm=1 --format '{{json .}}'`; null for others. */
export function eventOf(line: string): Ev | null {
  try {
    const j = JSON.parse(line) as { Type?: string; Action?: string; Actor?: { ID?: string; Attributes?: Record<string, string> }; time?: number; timeNano?: number }
    if (j.Type !== 'container' || j.Actor?.Attributes?.stm !== '1') return null
    return { at: j.timeNano ? Math.floor(j.timeNano / 1e6) : (j.time ?? 0) * 1000, id: String(j.Actor?.ID ?? '').slice(0, 12), name: String(j.Actor?.Attributes?.name ?? ''), action: String(j.Action ?? '').split(':')[0]! }
  } catch {
    return null
  }
}

/** Only the app's own containers can be stopped or removed from here. */
export const mayTouch = (rows: Row[], id: string) => rows.some((r) => r.id === id || r.name === id)
