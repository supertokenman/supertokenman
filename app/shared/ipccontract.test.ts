import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkArgs, CONTRACT } from './ipccontract'

const main = readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8')
const preload = readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8')
// handlers registered from their own module, beside main.ts
const modules = ['transcripts.ts', 'posteverywhere.ts', 'dictation.ts'].map((f) => readFileSync(new URL(`../electron/${f}`, import.meta.url), 'utf8')).join('\n')
const handled = new Set([...(main + modules).matchAll(/ipcMain\.handle\('([^']+)'/g)].map((m) => m[1]!))
const native = readFileSync(new URL('../electron/native.ts', import.meta.url), 'utf8')
const listened = new Set([...(main + native).matchAll(/ipcMain\.on\('([^']+)'/g)].map((m) => m[1]!))

describe('IPC contract', () => {
  it('every channel the preload invokes has a handler, and every send a listener', () => {
    const invoked = [...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map((m) => m[1]!)
    const sent = [...preload.matchAll(/ipcRenderer\.send\('([^']+)'/g)].map((m) => m[1]!)
    expect(invoked.length).toBeGreaterThan(400)
    expect(invoked.filter((c) => !handled.has(c))).toEqual([])
    expect(sent.filter((c) => !listened.has(c))).toEqual([])
  })
  it('every channel in the contract exists', () => {
    expect(Object.keys(CONTRACT).filter((c) => !handled.has(c))).toEqual([])
  })
  it('runtime channels: states, snapshot, keepRunning, stopAll, resume dismissal', () => {
    for (const c of ['panel:states', 'runtime:snapshot', 'runtime:keepRunning', 'runtime:stopAll', 'runtime:dismissResume']) {
      expect(Object.keys(CONTRACT)).toContain(c)
      expect(handled.has(c)).toBe(true)
      expect(preload).toContain(`'${c}'`)
    }
    expect(checkArgs('runtime:keepRunning', [])).toBeNull()
    expect(checkArgs('runtime:keepRunning', [true])).toBeNull()
    expect(checkArgs('runtime:keepRunning', ['yes'])).toBeTruthy()
    expect(checkArgs('runtime:snapshot', ['extra'])).toBeTruthy()
    // the main process pushes state changes to the window
    expect(preload).toContain("ipcRenderer.on('panel:state'")
    expect(main).toMatch(/toWin\('panel:state'/)
  })
  it('refuses arguments outside the contract', () => {
    expect(checkArgs('vault:set', ['GITHUB_TOKEN', 'ghp_x'])).toBeNull()
    expect(checkArgs('vault:set', ['../../etc', 'x'])).toMatch(/secret name/)
    expect(checkArgs('vault:set', ['My Stripe key', 'x'])).toBeNull()
    expect(checkArgs('vault:set', ['NAME', ''])).toMatch(/argument 1/)
    expect(checkArgs('shell:run', ['s1', { cmd: 'rm -rf /' }])).toMatch(/argument 1/)
    expect(checkArgs('chat:model', ['s1', 'gpt-4'])).toBeTruthy()
    expect(checkArgs('iso:start', ['s1', 'alpine; rm -rf /'])).toBeTruthy()
    expect(checkArgs('term:open', ['s1', 80, 24])).toBeNull()
    expect(checkArgs('not:in:contract', [1, 2, 3])).toBeNull()
  })
})
