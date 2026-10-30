// What the menu bar shows while panels run. Pure: main.ts turns this into the Tray title and menu.
import type { PanelView } from './runtime.js'

export interface TrayInput {
  panels: (PanelView & { name: string })[]
  /** US dollars spent today across panels */
  todayUsd: number
  background: boolean
  needsYou: number
}

const LABEL: Record<string, string> = {
  working: 'working',
  waiting_approval: 'needs approval',
  waiting_input: 'needs you',
  idle: 'idle',
  error: 'error',
  closed: 'closed',
}

const money = (usd: number) => `$${usd.toFixed(2)}`

/** `3 running  $1.42 today`, with ` needs you` when something waits. Empty when nothing runs. */
export function trayTitle(i: TrayInput): string {
  const running = i.panels.filter((p) => p.state === 'working' || p.state === 'waiting_approval').length
  if (!running && !i.background) return ''
  const need = i.needsYou ? `  ${i.needsYou} needs you` : ''
  return `${running} running  ${money(i.todayUsd)} today${need}`
}

/** One disabled line per panel: `name: state (reason)`. */
export function trayLines(i: TrayInput): string[] {
  return i.panels.map((p) => `${p.name}: ${LABEL[p.state] ?? p.state}${p.reason ? ` (${p.reason.slice(0, 60)})` : ''}`)
}

export type TrayAction = 'open' | 'stop-all' | 'quit-and-stop'
export interface TrayItem {
  label: string
  action?: TrayAction
  enabled?: boolean
  separator?: boolean
}

/** The background section of the menu. Stop all and Quit always exist so the person can end everything. */
export function trayItems(i: TrayInput): TrayItem[] {
  const lines = trayLines(i).map((label) => ({ label, enabled: false }))
  return [
    ...lines,
    ...(lines.length ? [{ label: '', separator: true }] : []),
    { label: 'Open SuperTokenMan', action: 'open' },
    { label: 'Stop all panels...', action: 'stop-all', enabled: i.panels.some((p) => p.state !== 'closed') },
    { label: 'Quit and stop all', action: 'quit-and-stop' },
  ]
}
