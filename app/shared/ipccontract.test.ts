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
  it('registers each handled channel once (a second ipcMain.handle throws and stops the rest of main)', () => {
    const all = [...(main + modules).matchAll(/ipcMain\.handle\('([^']+)'/g)].map((m) => m[1]!)
    expect(all.filter((c, i) => all.indexOf(c) !== i)).toEqual([])
  })
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
  it('packs: every channel is in the contract, handled in main and bridged in the preload', () => {
    const channels = ['list', 'addFolder', 'fetchGit', 'review', 'install', 'planUpdate', 'update', 'rollback', 'planRemove', 'remove', 'setMcp', 'installed', 'evalStart', 'evalResult', 'evalDiscard'].map((c) => `packs:${c}`)
    for (const c of channels) {
      expect(Object.keys(CONTRACT)).toContain(c)
      expect(handled.has(c)).toBe(true)
      expect(preload).toContain(`'${c}'`)
    }
  })
  it('packs: good arguments pass', () => {
    expect(checkArgs('packs:list', [])).toBeNull()
    expect(checkArgs('packs:addFolder', ['/Users/x/my-pack'])).toBeNull()
    expect(checkArgs('packs:fetchGit', ['https://github.com/x/pg-pack'])).toBeNull()
    expect(checkArgs('packs:review', ['pg-helper', '1.2.0', 'project', '/Users/x/app'])).toBeNull()
    expect(checkArgs('packs:install', ['pg-helper', '1.2.0-rc.1', 'global', '/Users/x/.claude', { '.claude/skills/pg-helper/a.md': 'overwrite' }])).toBeNull()
    expect(checkArgs('packs:update', ['pg-helper', '1.3.0', '/Users/x/app', { 'a.md': 'theirs', '@rules': 'leave' }])).toBeNull()
    expect(checkArgs('packs:remove', ['pg-helper', '/Users/x/app', true])).toBeNull()
    expect(checkArgs('packs:setMcp', ['pg-helper', '/Users/x/app', 'pg', true])).toBeNull()
    expect(checkArgs('packs:evalStart', ['pg-helper', '/Users/x/app', 'Fix the bug', 'claude-sonnet-5-5', 30])).toBeNull()
    expect(checkArgs('packs:evalResult', ['e1abc2'])).toBeNull()
  })
  it('packs: bad arguments are refused before the handler runs', () => {
    expect(checkArgs('packs:addFolder', ['relative/dir'])).toMatch(/absolute/)
    expect(checkArgs('packs:addFolder', ['~/pack'])).toBeTruthy()
    for (const url of ['http://github.com/x/y', 'git@github.com:x/y.git', 'file:///etc/passwd', 'https://user:pw@github.com/x/y', 'https://a.com/x;rm -rf']) {
      expect(checkArgs('packs:fetchGit', [url])).toBeTruthy()
    }
    expect(checkArgs('packs:review', ['Bad Id', '1.0.0', 'project', '/x'])).toMatch(/pack id/)
    expect(checkArgs('packs:review', ['pg-helper', 'latest', 'project', '/x'])).toMatch(/semver/)
    expect(checkArgs('packs:review', ['pg-helper', '1.0.0', 'everywhere', '/x'])).toBeTruthy()
    expect(checkArgs('packs:install', ['pg-helper', '1.0.0', 'project', '/x', { 'a.md': 'delete' }])).toBeTruthy()
    expect(checkArgs('packs:update', ['pg-helper', '1.0.0', '/x', { 'a.md': 'overwrite' }])).toBeTruthy()
    expect(checkArgs('packs:remove', ['pg-helper', '/x', 'yes'])).toBeTruthy()
    expect(checkArgs('packs:setMcp', ['pg-helper', '/x', '../evil', true])).toMatch(/server name/)
    expect(checkArgs('packs:evalStart', ['pg-helper', '/x', '', 'claude-sonnet-5-5', 30])).toBeTruthy()
    expect(checkArgs('packs:evalStart', ['pg-helper', '/x', 'p', 'gpt-4', 30])).toBeTruthy()
    expect(checkArgs('packs:evalStart', ['pg-helper', '/x', 'p', 'claude-sonnet-5-5', 0])).toBeTruthy()
    expect(checkArgs('packs:evalDiscard', ['../x'])).toBeTruthy()
  })
  it('packs: the main process checks the folder as well as the contract', () => {
    expect(main).toContain("function packRoot(root: unknown)")
    for (const c of ['review', 'install', 'planUpdate', 'update', 'rollback', 'planRemove', 'remove', 'setMcp', 'installed', 'evalStart']) {
      const line = main.split('\n').find((l) => l.includes(`ipcMain.handle('packs:${c}'`))!
      const body = c === 'evalStart' ? main.slice(main.indexOf("ipcMain.handle('packs:evalStart'"), main.indexOf("ipcMain.handle('packs:evalResult'")) : line
      expect(body).toContain('packRoot(root)')
    }
    // fetching is the only handler that can reach the network, and it is a plain call with no automatic caller
    expect(main.match(/packs\(\)\.fetchGit\(/g)?.length).toBe(1)
  })
  it('control: every channel is in the contract, handled in main and bridged in the preload', () => {
    const channels = ['policy:read', 'policy:write', 'policy:test', 'audit:query', 'audit:days', 'plan:get', 'checkpoint:list', 'checkpoint:preview', 'checkpoint:restore', 'breakpoint:set', 'triggers:caps', 'triggers:setCaps']
    for (const c of channels) {
      expect(Object.keys(CONTRACT)).toContain(c)
      expect(handled.has(c)).toBe(true)
      expect(preload).toContain(`'${c}'`)
    }
  })
  it('control: good arguments pass', () => {
    expect(checkArgs('policy:read', [])).toBeNull()
    expect(checkArgs('policy:read', ['/p'])).toBeNull()
    expect(checkArgs('policy:write', ['project', '/p', 'ask network\n'])).toBeNull()
    expect(checkArgs('policy:test', ['Bash', { command: 'ls' }])).toBeNull()
    expect(checkArgs('audit:query', [{ from: 0, to: 10, panel: 'p1', decision: 'deny', text: 'rm', limit: 2000 }])).toBeNull()
    expect(checkArgs('plan:get', ['p1'])).toBeNull()
    expect(checkArgs('checkpoint:restore', ['p1', 0])).toBeNull()
    expect(checkArgs('breakpoint:set', ['p1', [{ kind: 'before', tool: 'Bash' }, { kind: 'afterPlan' }]])).toBeNull()
    expect(checkArgs('triggers:setCaps', [{ minEvery: 15, maxEnabled: 20, maxFailures: 10 }])).toBeNull()
  })
  it('control: bad arguments are refused before the handler runs', () => {
    expect(checkArgs('policy:write', ['team', '/p', 'x'])).toBeTruthy()
    expect(checkArgs('policy:write', ['global', '', 'x'.repeat(64_001)])).toBeTruthy()
    expect(checkArgs('policy:test', ['x'.repeat(201), {}])).toBeTruthy()
    expect(checkArgs('audit:query', [{ from: 0, to: 10, limit: 2001 }])).toBeTruthy()
    expect(checkArgs('audit:query', [{ from: 0, to: 10, text: 'x'.repeat(201) }])).toBeTruthy()
    expect(checkArgs('checkpoint:restore', ['p1', -1])).toBeTruthy()
    expect(checkArgs('checkpoint:restore', ['p1', 1.5])).toBeTruthy()
    expect(checkArgs('checkpoint:restore', ['../x', 0])).toBeTruthy()
    expect(checkArgs('breakpoint:set', ['p1', Array.from({ length: 21 }, () => ({ kind: 'afterPlan' }))])).toBeTruthy()
    expect(checkArgs('breakpoint:set', ['p1', [{ kind: 'sometimes' }]])).toBeTruthy()
    expect(checkArgs('triggers:setCaps', [{ minEvery: 15 }])).toBeTruthy()
  })
})
