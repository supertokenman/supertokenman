// A browser profile per panel: its own Electron partition and, for the Playwright server, its own
// user-data-dir under the app's data. Never the person's Chrome or Safari profile.

/** A panel id safe for a partition name and a folder name: [a-z0-9-], at most 40. */
export const safeId = (id: string) => String(id).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'panel'
export const panelPartition = (id: string) => `persist:panel-${safeId(id)}`
export const isPanelPartition = (p: string) => /^persist:panel-[a-z0-9-]{1,40}$/.test(p)
export const profileDir = (userData: string, id: string) => `${userData.replace(/\/+$/, '')}/panel-browsers/${safeId(id)}`

/** The Playwright MCP args with this panel's profile folder, unless one is already set. */
export function withProfile(args: string[], dir: string): string[] {
  if (!args.some((a) => /playwright\/mcp/.test(a))) return args
  if (args.some((a) => a === '--user-data-dir' || a.startsWith('--user-data-dir=') || a === '--isolated')) return args
  return [...args, '--user-data-dir', dir]
}
