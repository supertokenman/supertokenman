// What the browser pane says and shows, as plain functions (tested without a window): which panel's browser
// is in front, who is driving it, what an ask card says, and how a profile scope reads.
import type { Ask, PaneState, Profile } from './types'

/** The panel whose browser the pane shows: the focused one if it has tabs, else one with an ask waiting, else the latest to change. */
export function shownPanel(states: Record<string, PaneState>, focus: string | null, asks: Ask[], changedAt: Record<string, number>): string | null {
  const has = (p: string) => (states[p]?.tabs.length ?? 0) > 0
  if (focus && has(focus)) return focus
  const asked = asks.find((a) => has(a.panel))
  if (asked) return asked.panel
  const open = Object.keys(states).filter(has)
  if (!open.length) return null
  return open.sort((a, b) => (changedAt[b] ?? 0) - (changedAt[a] ?? 0))[0]!
}

export type Status = { kind: 'secret' | 'held' | 'stopped' | 'driving' | 'idle'; label: string; detail: string }

export const DRIVING_WINDOW_MS = 6000
const SECRET_REASONS = ['sign-in', 'payment', 'passkey']

export function reasonText(reason: string): string {
  switch (reason) {
    case 'sign-in': return 'to sign in'
    case 'captcha': return 'for a check that needs a person'
    case 'passkey': return 'for a passkey'
    case 'payment': return 'for a payment'
    case 'unclear': return 'because it was not sure what to do'
    default: return ''
  }
}

export function statusOf(s: PaneState, name: string, now: number, changedAt: number): Status {
  if (s.held) {
    if (SECRET_REASONS.includes(s.reason)) {
      return { kind: 'secret', label: 'Your turn: type it in the page', detail: `${name} asked ${reasonText(s.reason)}. Type secrets straight into the page. ${name} never sees them, and screenshots stay off while one is in a field. Give the browser back when you are done.` }
    }
    return { kind: 'held', label: 'You have the browser', detail: s.reason ? `${name} handed it over ${reasonText(s.reason)}. Give it back when you are done.` : `${name} is paused. Give the browser back to let it continue.` }
  }
  if (s.stopped) return { kind: 'stopped', label: 'Task stopped', detail: s.stopped }
  if (now - changedAt < DRIVING_WINDOW_MS) return { kind: 'driving', label: `${name} is driving`, detail: 'Take over to use the page yourself. The assistant waits until you give it back.' }
  return { kind: 'idle', label: 'Idle', detail: `${name} is not using the browser right now.` }
}

export const fmtSize = (n: number | undefined): string => {
  if (!n || n < 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export type CardText = { title: string; body: string; yes: string; always?: string; no: string }

export function cardText(a: Ask, name: string): CardText {
  const host = a.detail.host || 'this site'
  if (a.kind === 'host') {
    return {
      title: `Open ${host}?`,
      body: `${name} wants to open ${host}. It has not been there in this task.`,
      yes: 'Allow once',
      ...(a.detail.always ? { always: 'Always allow' } : {}),
      no: 'Deny',
    }
  }
  if (a.kind === 'download') {
    const size = fmtSize(a.detail.size)
    return { title: 'Save this download?', body: `${a.detail.name ?? 'A file'}${size ? ` (${size})` : ''} from ${host}. It goes to .stm/downloads in the project.`, yes: 'Save', no: 'Discard' }
  }
  if (a.detail.pick) return { title: 'Upload a file?', body: `${name} wants to attach a file on ${host}. You choose which one next.`, yes: 'Choose a file', no: 'Deny' }
  const size = fmtSize(a.detail.size)
  return { title: 'Upload this file?', body: `${a.detail.name ?? 'A file'}${size ? ` (${size})` : ''} to ${host}. The page gets it only if you allow it.`, yes: 'Upload', no: 'Deny' }
}

export function scopeLabel(scope: string, profiles: Profile[]): string {
  if (scope === 'project') return 'Project profile'
  if (scope.startsWith('profile:')) return profiles.find((p) => p.id === scope.slice(8))?.name ?? 'Profile'
  return 'This panel only'
}

/** A line for the address bar: host and path without the scheme. */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.host}${u.pathname === '/' ? '' : u.pathname}${u.search}`
  } catch {
    return url
  }
}

/** The address as the person typed it: add https:// when there is no scheme. */
export function addressOf(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  return /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`
}
