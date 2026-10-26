import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, BrowserWindow: class {}, clipboard: {}, Menu: {}, screen: {}, shell: { openExternal: vi.fn() } }))
const { menuTemplate } = await import('./native')

describe('application menu', () => {
  it('has the Mac app menu, shows shortcuts without taking them, and hides dev items when packaged', () => {
    const go = vi.fn()
    const t = menuTemplate(go, { mac: true, dev: false, name: 'SuperTokenMan' })
    expect(t.map((m) => m.label ?? m.role)).toEqual(['SuperTokenMan', 'File', 'Edit', 'View', 'windowMenu', 'help'])
    const view = t[3]!.submenu as { label?: string; role?: string; accelerator?: string; registerAccelerator?: boolean; click?: () => void }[]
    const pal = view.find((x) => x.label === 'Command palette')!
    expect(pal).toMatchObject({ accelerator: 'CmdOrCtrl+K', registerAccelerator: false })
    pal.click!()
    expect(go).toHaveBeenCalledWith('menu:palette')
    expect(view.some((x) => x.role === 'toggleDevTools')).toBe(false)
    expect(JSON.stringify(menuTemplate(go, { mac: false, dev: true, name: 'x' }))).toContain('toggleDevTools')
  })
})
