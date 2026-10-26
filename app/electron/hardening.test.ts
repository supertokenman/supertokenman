import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn(), on: vi.fn() }, session: { defaultSession: {} } }))
const { trustedFrame, uiFile, FUSES } = await import('./hardening')

describe('hardening', () => {
  it('trusts only the app page (and the dev server in dev)', () => {
    expect(trustedFrame('stmui://app/index.html', false)).toBe(true)
    expect(trustedFrame('stmui://app/index.html#panel', false)).toBe(true)
    // the built page is no longer a file: a file:// page, even an index.html in dist, is not the app
    expect(trustedFrame('file:///Applications/SuperTokenMan.app/Contents/Resources/app.asar/dist/index.html', false)).toBe(false)
    expect(trustedFrame('stmui://other/index.html', false)).toBe(false)
    expect(trustedFrame('stmui://app/tour/index.html', false)).toBe(false)
    expect(trustedFrame('http://localhost:5173/', false)).toBe(false)
    expect(trustedFrame('http://localhost:5173/', true)).toBe(true)
    expect(trustedFrame('https://evil.example/dist/index.html', false)).toBe(false)
    expect(trustedFrame('file:///tmp/evil.html', false)).toBe(false)
    expect(trustedFrame('stmapp://doc/1', false)).toBe(false)
    expect(trustedFrame(undefined, true)).toBe(false)
  })
  it('serves only files inside the UI folder', () => {
    const dir = '/app.asar/dist'
    expect(uiFile(dir, 'stmui://app/index.html')).toEqual({ path: '/app.asar/dist/index.html', type: 'text/html; charset=utf-8' })
    expect(uiFile(dir, 'stmui://app/')!.path).toBe('/app.asar/dist/index.html')
    expect(uiFile(dir, 'stmui://app/assets/index-abc.js')!.type).toBe('text/javascript; charset=utf-8')
    expect(uiFile(dir, 'stmui://app/tour/panels.json')!.path).toBe('/app.asar/dist/tour/panels.json')
    // the URL parser already folds ../ away: this one stays inside the folder
    expect(uiFile(dir, 'stmui://app/../../etc/passwd')!.path).toBe('/app.asar/dist/etc/passwd')
    expect(uiFile(dir, 'stmui://app/%2e%2e/%2e%2e/etc/passwd')!.path).toBe('/app.asar/dist/etc/passwd')
    // an encoded slash is not folded by the parser; decoded, it would leave the folder
    expect(uiFile(dir, 'stmui://app/assets/%2e%2e%2f%2e%2e%2fsecret')).toBeNull()
    expect(uiFile(dir, 'stmui://evil/index.html')).toBeNull()
    expect(uiFile(dir, 'stmmedia://app/index.html')).toBeNull()
    expect(uiFile(dir, 'stmui://app/%E0%A4%A')).toBeNull()
  })
  it('ships with RunAsNode and the inspect flags off', () => {
    expect(FUSES).toMatchObject({ RunAsNode: false, EnableNodeCliInspectArguments: false, EnableNodeOptionsEnvironmentVariable: false, OnlyLoadAppFromAsar: true })
  })
})
