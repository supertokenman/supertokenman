// The quick search shortcut: works from any app, like Spotlight. Cmd+Space is Spotlight's, so the
// default is Option+Space; the person can record another one.

export const DEFAULT_HOTKEY = 'Alt+Space'

type Keys = { key: string; code?: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }

const NAMED: Record<string, string> = { ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Enter: 'Return', Escape: 'Escape', Backspace: 'Backspace', Tab: 'Tab' }

/** An Electron accelerator from a key press, or null while only modifiers are down or none is held. */
export function toAccelerator(e: Keys): string | null {
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return null
  // Option changes the character on a Mac (Option+K is ˚): read the physical key instead
  const fromCode = e.code?.match(/^Key([A-Z])$/)?.[1] ?? e.code?.match(/^Digit(\d)$/)?.[1]
  const key = NAMED[e.key] ?? (e.code === 'Space' ? 'Space' : fromCode ?? (/^F\d{1,2}$/.test(e.key) ? e.key : e.key.length === 1 ? e.key.toUpperCase() : null))
  if (!key) return null
  const mods = [e.metaKey && 'Command', e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(Boolean) as string[]
  // a bare letter would fire while typing anywhere: at least one modifier besides Shift
  if (!mods.some((m) => m !== 'Shift') && !/^F\d{1,2}$/.test(key)) return null
  return [...mods, key].join('+')
}

const SYMBOL: Record<string, string> = { Command: '⌘', Control: '⌃', Alt: '⌥', Shift: '⇧', Space: 'Space', Return: '↩', Up: '↑', Down: '↓', Left: '←', Right: '→' }

/** How the shortcut reads in the app: ⌥ Space. */
export const hotkeyLabel = (accel: string) => accel.split('+').map((k) => SYMBOL[k] ?? k).join(' ')

/** Only shapes toAccelerator makes are stored. */
export const validHotkey = (accel: unknown): accel is string => typeof accel === 'string' && /^(((Command|Control|Alt|Shift)\+){1,4}([A-Z0-9]|F\d{1,2}|Space|Return|Up|Down|Left|Right)|F\d{1,2})$/.test(accel)
