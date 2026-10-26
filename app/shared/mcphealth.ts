// MCP health and change, the parts with no connection: a fingerprint of each tool (its description and
// input schema), what changed between the tools you approved and what the server shows now, and which
// tools are held until you look. A tool description reaches the model on every turn, so a server update
// that changes one can change what the model is told to do.

export type ToolPrint = Record<string, string>
export type Check = { at: number; ok: boolean; ms: number; error?: string; tokens: number; tools: ToolPrint; version?: string }
export type Health = { servers: Record<string, { last?: Check; approved?: ToolPrint; approvedAt?: number }> }

/** A short stable hash of a tool's description and schema; the name is the key. */
export function printOf(t: { description?: string; inputSchema?: unknown }): string {
  const s = JSON.stringify([t.description ?? '', t.inputSchema ?? {}])
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0
  return h.toString(16).padStart(8, '0')
}

export type Change = { added: string[]; changed: string[]; removed: string[] }
export function diff(approved: ToolPrint | undefined, now: ToolPrint): Change {
  if (!approved) return { added: [], changed: [], removed: [] }
  return {
    added: Object.keys(now).filter((k) => !(k in approved)).sort(),
    changed: Object.keys(now).filter((k) => k in approved && approved[k] !== now[k]).sort(),
    removed: Object.keys(approved).filter((k) => !(k in now)).sort(),
  }
}

/** Tools held until you look: new or changed since you approved this server's tools. */
export function held(h: Health, server: string): string[] {
  const s = h.servers[server]
  if (!s?.last || !s.approved) return []
  const d = diff(s.approved, s.last.tools)
  return [...d.added, ...d.changed]
}

/** After a check: the first one becomes the approved set; later ones keep the old approval to compare. */
export function record(h: Health, server: string, c: Check): Health {
  const prev = h.servers[server]
  const first = !prev?.approved && c.ok
  return { servers: { ...h.servers, [server]: { ...prev, last: c, ...(first ? { approved: c.tools, approvedAt: c.at } : {}) } } }
}

/** You looked: what the server shows now becomes the approved set. */
export function approve(h: Health, server: string, now: number): Health {
  const s = h.servers[server]
  if (!s?.last) return h
  return { servers: { ...h.servers, [server]: { ...s, approved: s.last.tools, approvedAt: now } } }
}
