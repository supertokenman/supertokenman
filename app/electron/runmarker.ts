// The run marker: one small file in the app's data folder that says how the last run ended.
//   running      written at launch; still there at the next launch means a crash, a kill or a reboot
//   clean        written on a real quit
//   interrupted  written when an update install stopped running panels
// It also keeps how many panels were open, so the next launch can offer to resume them.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

export type RunStatus = 'running' | 'clean' | 'interrupted'
export interface RunMarker {
  status: RunStatus
  panels: number
  at: number
}

export function readMarker(file: string): RunMarker | null {
  try {
    if (!existsSync(file)) return null
    const j = JSON.parse(readFileSync(file, 'utf8')) as Partial<RunMarker>
    if (j.status !== 'running' && j.status !== 'clean' && j.status !== 'interrupted') return null
    return { status: j.status, panels: Math.max(0, Math.floor(Number(j.panels) || 0)), at: Number(j.at) || 0 }
  } catch {
    // a half-written or unreadable marker counts as no marker: nothing is offered
    return null
  }
}

export function writeMarker(file: string, m: RunMarker): void {
  try {
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(m))
    renameSync(tmp, file)
  } catch {
    // the marker never stops the app
  }
}

/** The inputs of the lifecycle "launch" event from the previous run's marker. No marker = a first run = clean. */
export function launchFacts(prev: RunMarker | null): { cleanExit: boolean; layoutPanels: number } {
  if (!prev) return { cleanExit: true, layoutPanels: 0 }
  return { cleanExit: prev.status === 'clean', layoutPanels: prev.panels }
}
