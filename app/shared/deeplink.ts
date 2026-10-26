// supertokenman:// links (phase 82): open a panel in a folder, focus a panel, open a screen, or show a
// pull request. A closed list of actions, nothing that runs a command, sends or deletes, and the
// window asks before it acts on any of them.

export type Link =
  | { kind: 'open'; path: string }
  | { kind: 'focus'; panel: string }
  | { kind: 'screen'; id: string }
  | { kind: 'pr'; repo: string; number: number }

/** Screens a link may open: they only show things. */
export const SAFE_SCREENS = ['today', 'agenda', 'prs', 'news', 'docker', 'ports', 'diagnostics', 'work-tasks', 'playbooks', 'routines', 'skill-drafts', 'backend-map', 'arch-desk', 'learn', 'tour']

export const SCHEME = 'supertokenman'

export function parseLink(raw: string): Link | { error: string } {
  if (typeof raw !== 'string' || raw.length > 2048) return { error: 'Not a link.' }
  if (/[\u0000-\u001f]/.test(raw)) return { error: 'The link has control characters.' }
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return { error: 'Not a link.' }
  }
  if (u.protocol !== `${SCHEME}:`) return { error: 'Not a SuperTokenMan link.' }
  if (u.username || u.password) return { error: 'The link carries a login; refused.' }
  const action = (u.hostname || u.pathname.replace(/^\/+/, '').split('/')[0] || '').toLowerCase()
  const q = u.searchParams
  if (action === 'open') {
    const path = q.get('path') ?? ''
    if (!path.startsWith('/') && !/^[A-Za-z]:\\/.test(path)) return { error: 'The folder must be a full path.' }
    if (path.split(/[\\/]/).some((p) => p === '..')) return { error: 'The folder path goes up with "..".' }
    if (path.length > 1024) return { error: 'The folder path is too long.' }
    return { kind: 'open', path: path.replace(/[\\/]+$/, '') || '/' }
  }
  if (action === 'focus') {
    const panel = q.get('panel') ?? ''
    return /^[\w-]{1,64}$/.test(panel) ? { kind: 'focus', panel } : { error: 'Not a panel id.' }
  }
  if (action === 'screen') {
    const id = q.get('id') ?? ''
    return SAFE_SCREENS.includes(id) ? { kind: 'screen', id } : { error: `A link cannot open "${id.slice(0, 40)}".` }
  }
  if (action === 'pr') {
    const repo = q.get('repo') ?? ''
    const number = Number(q.get('number'))
    if (!/^[\w.-]{1,100}\/[\w.-]{1,100}$/.test(repo) || !Number.isInteger(number) || number < 1) return { error: 'Give repo=owner/name and a pull request number.' }
    return { kind: 'pr', repo, number }
  }
  return { error: `Unknown action "${action.slice(0, 40)}".` }
}

/** The link in a list of command line arguments (Windows and Linux pass it as one). */
export const linkInArgv = (argv: string[]) => argv.find((a) => a.startsWith(`${SCHEME}://`)) ?? null

/** What the window asks before acting. */
export function askText(l: Link): string {
  if (l.kind === 'open') return `Open a panel in ${l.path}?`
  if (l.kind === 'focus') return `Go to panel ${l.panel}?`
  if (l.kind === 'screen') return `Open ${l.id.replace(/-/g, ' ')}?`
  return `Show pull request ${l.repo}#${l.number}?`
}
