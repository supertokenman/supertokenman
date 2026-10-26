// Tools as apps (the MCP Apps extension): a tool can name a ui:// resource, an HTML page that shows its
// result. The page runs in a sandboxed frame with no network and no same-origin access, and talks to
// the app only through postMessage JSON-RPC; these are the rules for what it may ask.

type Meta = { _meta?: Record<string, unknown> }

/** The ui:// page a tool shows its result in, or null. */
export function uiUriOf(tool: Meta): string | null {
  const m = tool._meta ?? {}
  const ui = m.ui as { resourceUri?: unknown } | undefined
  const uri = ui?.resourceUri ?? m['ui/resourceUri']
  return typeof uri === 'string' && uri.startsWith('ui://') ? uri : null
}

/** The page's own HTML from a resources/read answer (text or base64 blob), or null if it is not HTML. */
export function htmlOf(read: { contents?: { uri?: string; mimeType?: string; text?: string; blob?: string }[] }): string | null {
  const c = read.contents?.find((x) => !x.mimeType || /^text\/html/.test(x.mimeType))
  if (!c) return null
  if (typeof c.text === 'string') return c.text
  if (typeof c.blob === 'string') return new TextDecoder().decode(Uint8Array.from(atob(c.blob), (ch) => ch.charCodeAt(0)))
  return null
}

/** No network at all: inline scripts and styles, data: images and fonts. */
export const APP_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"

/** The page with our CSP put first in its head, so nothing it declares can loosen it. */
export function framed(html: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${APP_CSP}">`
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (h) => `${h}${meta}`)
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (h) => `${h}<head>${meta}</head>`)
  return `<!doctype html><html><head>${meta}</head><body>${html}</body></html>`
}

export type AppAsk =
  | { kind: 'initialize'; id: number | string }
  | { kind: 'call'; id: number | string; name: string; args: Record<string, unknown> }
  | { kind: 'link'; id: number | string; url: string }
  | { kind: 'message'; id: number | string; text: string }
  | { kind: 'size'; height: number }
  | { kind: 'refuse'; id: number | string; why: string }
  | { kind: 'ignore' }

/**
 * What a message from the page asks for. Tool calls are limited to the tools of the same server; links
 * must be https and still need a click; anything else is refused with a reason.
 */
export function readAsk(data: unknown, serverTools: string[]): AppAsk {
  if (!data || typeof data !== 'object') return { kind: 'ignore' }
  const m = data as { jsonrpc?: string; id?: number | string; method?: string; params?: Record<string, unknown> }
  if (m.jsonrpc !== '2.0' || typeof m.method !== 'string') return { kind: 'ignore' }
  const p = m.params ?? {}
  if (m.id === undefined || m.id === null) {
    if (m.method === 'ui/notifications/size-changed' && typeof p.height === 'number') return { kind: 'size', height: Math.max(40, Math.min(2000, Math.round(p.height))) }
    return { kind: 'ignore' }
  }
  const id = m.id
  switch (m.method) {
    case 'ui/initialize':
      return { kind: 'initialize', id }
    case 'tools/call': {
      const name = String(p.name ?? '')
      if (!serverTools.includes(name)) return { kind: 'refuse', id, why: `Tool ${name || '(none)'} is not on this server.` }
      return { kind: 'call', id, name, args: p.arguments && typeof p.arguments === 'object' ? (p.arguments as Record<string, unknown>) : {} }
    }
    case 'ui/open-link': {
      const url = String(p.url ?? '')
      return /^https:\/\/[^\s]+$/.test(url) ? { kind: 'link', id, url } : { kind: 'refuse', id, why: 'Only https links.' }
    }
    case 'ui/message': {
      const c = p.content as { type?: string; text?: string }[] | undefined
      const text = Array.isArray(c) ? c.filter((x) => x?.type === 'text').map((x) => String(x.text ?? '')).join('\n') : ''
      return text ? { kind: 'message', id, text: text.slice(0, 4000) } : { kind: 'refuse', id, why: 'Empty message.' }
    }
    default:
      return { kind: 'refuse', id, why: `Not supported here: ${m.method}` }
  }
}
