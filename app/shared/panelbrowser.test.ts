import { describe, expect, it } from 'vitest'
import { isPanelPartition, panelPartition, profileDir, safeId, withProfile } from './panelbrowser'

describe('panelbrowser', () => {
  it('sanitizes ids', () => {
    expect(safeId('Abc_12/../x')).toBe('abc-12-x')
    expect(safeId('///')).toBe('panel')
    expect(safeId('a'.repeat(60))).toHaveLength(40)
  })
  it('names partitions and folders', () => {
    expect(panelPartition('S1')).toBe('persist:panel-s1')
    expect(isPanelPartition(panelPartition('../x'))).toBe(true)
    expect(isPanelPartition('persist:browse')).toBe(false)
    expect(profileDir('/d', '../x')).toBe('/d/panel-browsers/x')
  })
  it('adds a profile only to playwright', () => {
    const pw = ['-y', '@playwright/mcp@0.0.83']
    expect(withProfile(pw, '/p')).toEqual([...pw, '--user-data-dir', '/p'])
    expect(withProfile([...pw, '--isolated'], '/p')).toEqual([...pw, '--isolated'])
    expect(withProfile(['-y', 'other'], '/p')).toEqual(['-y', 'other'])
  })
})
