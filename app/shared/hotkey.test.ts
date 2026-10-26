import { describe, expect, it } from 'vitest'
import { hotkeyLabel, toAccelerator, validHotkey } from './hotkey'

const k = (key: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}, code?: string) => ({ key, code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods })

describe('hotkey', () => {
  it('turns a key press into an accelerator', () => {
    expect(toAccelerator(k(' ', { altKey: true }, 'Space'))).toBe('Alt+Space')
    expect(toAccelerator(k('˚', { altKey: true }, 'KeyK'))).toBe('Alt+K')
    expect(toAccelerator(k('p', { metaKey: true, shiftKey: true }, 'KeyP'))).toBe('Command+Shift+P')
  })
  it('waits for a real key and refuses shortcuts that would fire while typing', () => {
    expect(toAccelerator(k('Alt', { altKey: true }))).toBeNull()
    expect(toAccelerator(k('a', {}, 'KeyA'))).toBeNull()
    expect(toAccelerator(k('A', { shiftKey: true }, 'KeyA'))).toBeNull()
    expect(toAccelerator(k('F5', {}))).toBe('F5')
  })
  it('reads with Mac symbols and validates what is stored', () => {
    expect(hotkeyLabel('Command+Shift+P')).toBe('⌘ ⇧ P')
    expect(validHotkey('Alt+Space')).toBe(true)
    expect(validHotkey('Alt+Space; rm -rf')).toBe(false)
  })
})
