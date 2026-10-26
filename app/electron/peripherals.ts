// Battery of the Bluetooth things around the Mac: headphones (AirPods per bud and case), mice,
// keyboards, trackpads, speakers. macOS tells it in two places: system_profiler for most Bluetooth
// devices (whatever reports its level over Bluetooth), and the I/O registry for Apple's own input
// devices, which also says when they charge. Both are read, merged by name; nothing is written.
import { execFile } from 'node:child_process'

export type Kind = 'mac' | 'headphones' | 'mouse' | 'keyboard' | 'trackpad' | 'speaker' | 'controller' | 'other'
export type Level = { part: 'main' | 'left' | 'right' | 'case'; percent: number }
export type Peripheral = { name: string; kind: Kind; levels: Level[]; charging?: boolean; address?: string }

const pct = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? '').replace('%', ''), 10)
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null
}

export function kindOf(name: string, minor = ''): Kind {
  const t = `${minor} ${name}`.toLowerCase()
  if (/headphone|headset|airpods|earbud|buds|beats|wh-|wf-|bose qc|jabra|earphone/.test(t)) return 'headphones'
  if (/trackpad/.test(t)) return 'trackpad'
  if (/mouse|mx master|mx anywhere/.test(t)) return 'mouse'
  if (/keyboard|mx keys/.test(t)) return 'keyboard'
  if (/speaker|soundlink|jbl|boom|sonos|homepod/.test(t)) return 'speaker'
  if (/gamepad|controller|joy-con|dualsense|xbox/.test(t)) return 'controller'
  return 'other'
}

/** Connected devices and their levels from `system_profiler SPBluetoothDataType -json`. */
export function fromProfiler(json: string): Peripheral[] {
  let data: { SPBluetoothDataType?: { device_connected?: Record<string, Record<string, string>>[] }[] }
  try {
    data = JSON.parse(json)
  } catch {
    return []
  }
  const out: Peripheral[] = []
  for (const ctl of data.SPBluetoothDataType ?? [])
    for (const entry of ctl.device_connected ?? [])
      for (const [name, d] of Object.entries(entry)) {
        const levels: Level[] = []
        for (const [key, part] of [['device_batteryLevelMain', 'main'], ['device_batteryLevel', 'main'], ['device_batteryLevelLeft', 'left'], ['device_batteryLevelRight', 'right'], ['device_batteryLevelCase', 'case']] as const) {
          const v = pct(d[key])
          if (v !== null && !levels.some((l) => l.part === part)) levels.push({ part, percent: v })
        }
        out.push({ name, kind: kindOf(name, d.device_minorType), levels, address: d.device_address })
      }
  return out
}

/** Apple's input devices from `ioreg -r -k BatteryPercent -l`: level and whether they charge. */
export function fromRegistry(text: string): Peripheral[] {
  const out: Peripheral[] = []
  for (const block of text.split(/\n(?=\+-o )/)) {
    const name = /"Product" = "([^"]+)"/.exec(block)?.[1]
    const level = pct(/"BatteryPercent" = (\d+)/.exec(block)?.[1])
    if (!name || level === null) continue
    const flags = Number(/"BatteryStatusFlags" = (\d+)/.exec(block)?.[1] ?? 0)
    out.push({ name, kind: kindOf(name), levels: [{ part: 'main', percent: level }], charging: (flags & 2) === 2 || /"IsCharging" = Yes/.test(block) })
  }
  return out
}

/** Both sources as one list: the registry's level and charging win for the devices it knows. */
export function merge(profiler: Peripheral[], registry: Peripheral[]): Peripheral[] {
  const byName = new Map(profiler.map((p) => [p.name, p]))
  for (const r of registry) {
    const p = byName.get(r.name)
    byName.set(r.name, p ? { ...p, levels: r.levels, charging: r.charging } : r)
  }
  return [...byName.values()].sort((a, b) => lowest(a) - lowest(b))
}

/** The level that matters for a warning: the lowest part in use (a case on its own does not count). */
export function lowest(p: Peripheral) {
  const parts = p.levels.filter((l) => l.part !== 'case')
  const use = parts.length ? parts : p.levels
  return use.length ? Math.min(...use.map((l) => l.percent)) : 101
}

/** The Mac's own battery from `pmset -g batt`, or nothing on a desktop Mac. */
export function fromPmset(text: string): Peripheral | null {
  const m = /InternalBattery[^\n]*?\t(\d+)%;\s*([^;]+);/.exec(text)
  if (!m) return null
  const state = m[2]!.trim()
  return { name: 'This Mac', kind: 'mac', levels: [{ part: 'main', percent: Number(m[1]) }], charging: state === 'charging' || state === 'charged' || state === 'finishing charge' }
}

const sh = (cmd: string, args: string[]) => new Promise<string>((ok) => execFile(cmd, args, { timeout: 15_000, maxBuffer: 8 * 1024 * 1024 }, (_e, out) => ok(out ?? '')))

export async function readPeripherals(): Promise<Peripheral[] | null> {
  if (process.platform !== 'darwin') return null
  const [prof, reg, batt] = await Promise.all([sh('system_profiler', ['SPBluetoothDataType', '-json']), sh('ioreg', ['-r', '-k', 'BatteryPercent', '-l']), sh('pmset', ['-g', 'batt'])])
  const mac = fromPmset(batt)
  return [...(mac ? [mac] : []), ...merge(fromProfiler(prof), fromRegistry(reg))]
}
