import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { findCommand } from '../../shared/pilotcatalog'
import { applyInverse, runCommand, type Env } from './run'

function env(over: Partial<Env> = {}): Env & { log: string[] } {
  const log: string[] = []
  let layout = 'auto'
  return {
    log,
    entries: () => [{ id: 'go-today', label: 'Today', run: () => void log.push('today') }],
    layout: () => layout,
    setLayout: (l) => void ((layout = l), log.push(`layout ${l}`)),
    hasPanel: (s) => s === 's1',
    focusPanel: (s) => void log.push(`focus ${s}`),
    closePanel: (s) => void log.push(`close ${s}`),
    openFolder: (c) => void log.push(`open ${c}`),
    openPersona: (i) => void log.push(`persona ${i}`),
    ...over,
  }
}

describe('runCommand', () => {
  it('runs the palette closure of a screen and says so', async () => {
    const e = env()
    expect(await runCommand(e, { id: 'go-today', args: {} })).toEqual({ ok: true, text: 'Opened Today.' })
    expect(e.log).toEqual(['today'])
  })
  it('a layout change returns its inverse and the value it left', async () => {
    const e = env()
    const r = await runCommand(e, { id: 'layout-grid', args: { id: 'grid' } })
    expect(r).toMatchObject({ ok: true, undo: { kind: 'layout', prev: 'auto' }, after: 'grid' })
  })
  it('the same layout again has nothing to undo', async () => {
    const e = env()
    await runCommand(e, { id: 'layout-grid', args: { id: 'grid' } })
    expect((await runCommand(e, { id: 'layout-grid', args: { id: 'grid' } })).undo).toBeUndefined()
  })
  it('focus needs an existing panel', async () => {
    const e = env()
    expect((await runCommand(e, { id: 'panel-s9', args: { sid: 's9' } })).ok).toBe(false)
    expect((await runCommand(e, { id: 'panel-s1', args: { sid: 's1' } })).ok).toBe(true)
    expect(e.log).toEqual(['focus s1'])
  })
  it('a folder and a persona open through their own closures', async () => {
    const e = env()
    await runCommand(e, { id: 'open-/tmp/x', args: { cwd: '/tmp/x' } })
    await runCommand(e, { id: 'persona-writer', args: { id: 'writer' } })
    expect(e.log).toEqual(['open /tmp/x', 'persona writer'])
  })
  it('unknown ids and screens the window does not have are errors, not throws', async () => {
    const e = env()
    expect((await runCommand(e, { id: 'policy.rules', args: {} })).ok).toBe(false)
    expect((await runCommand(e, { id: 'go-docker', args: {} })).text).toMatch(/not available/)
  })
  it('a closure that throws becomes an error result', async () => {
    const e = env({ entries: () => [{ id: 'go-today', label: 'Today', run: () => { throw new Error('boom') } }] })
    expect(await runCommand(e, { id: 'go-today', args: {} })).toEqual({ ok: false, text: 'boom' })
  })
  it('a closure that never finishes ends in an error', async () => {
    vi.useFakeTimers()
    const e = env({ entries: () => [{ id: 'go-today', label: 'Today', run: () => new Promise<void>(() => undefined) }] })
    const p = runCommand(e, { id: 'go-today', args: {} })
    await vi.advanceTimersByTimeAsync(9000)
    expect((await p).ok).toBe(false)
    vi.useRealTimers()
  })
})

describe('undo', () => {
  it('restores the layout', async () => {
    const e = env()
    expect(await runCommand(e, { id: 'undo', args: {}, undo: { kind: 'layout', prev: 'columns' } })).toEqual({ ok: true, text: 'Layout is back to columns.' })
    expect(e.log).toEqual(['layout columns'])
  })
  it('closes the panels that were opened, and cannot reopen closed ones', async () => {
    const e = env()
    expect((await applyInverse(e, { kind: 'panels', opened: ['s2', 's3'] })).ok).toBe(true)
    expect(e.log).toEqual(['close s2', 'close s3'])
    expect((await applyInverse(e, { kind: 'panels', closed: ['s4'] })).ok).toBe(false)
    expect((await applyInverse(e, undefined)).ok).toBe(false)
  })
})

// the contract of the spec: a new palette entry is a command the agent can run or is marked as not one
describe('palette coverage', () => {
  const src = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
  const block = src.slice(src.indexOf('const paletteEntries'), src.indexOf('const [todayOpen'))
  it('every Go to entry has a command spec', () => {
    const ids = [...block.matchAll(/^\s+\['([\w-]+)', '/gm)].map((m) => m[1]!)
    expect(ids.length).toBeGreaterThan(80)
    const missing = ids.filter((id) => !findCommand(`go-${id}`))
    expect(missing).toEqual([])
  })
  it('every dynamic family has a spec', () => {
    const prefixes = [...block.matchAll(/id: `([a-z]+-)\$\{/g)].map((m) => m[1]!)
    expect(prefixes.length).toBeGreaterThan(5)
    expect(prefixes.filter((p) => p !== 'go-' && !findCommand(`${p}x`))).toEqual([])
  })
})
