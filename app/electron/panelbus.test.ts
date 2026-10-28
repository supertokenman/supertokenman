import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JS module of the CLI, no types
import { panelRequest, panelText } from '../cli/panelcmd.mjs'
import { addLink, deliveryOf, isModel, labelled, linkOf, linksFor, NOTE_MAX, noteGet, noteSet, notesDir, PanelKeys, RateLimit } from './panelbus'

const env = { STM_PANEL_ID: 's1', STM_PANEL_KEY: 'k1' }

describe('stm panel commands: arguments', () => {
  it('builds each request with the caller identity', () => {
    expect(panelRequest('whoami', [], {}, env)).toEqual({ cmd: 'whoami', args: { me: 's1', key: 'k1' } })
    expect(panelRequest('spawn', [], { model: 'claude-opus-5-5', prompt: 'hi there', cwd: 'sub' }, env)).toEqual({ cmd: 'pspawn', args: { me: 's1', key: 'k1', cwd: 'sub', model: 'claude-opus-5-5', prompt: 'hi there' } })
    expect(panelRequest('send', ['s2', 'look', 'at', 'this'], {}, env)).toEqual({ cmd: 'psend', args: { me: 's1', key: 'k1', panel: 's2', text: 'look at this' } })
    expect(panelRequest('note', ['get', 'plan'], {}, env).args).toEqual({ me: 's1', key: 'k1', op: 'get', name: 'plan' })
    expect(panelRequest('note', ['append', 'plan', 'step', 'two'], {}, env).args.text).toBe('step two\n')
    expect(panelRequest('link', ['s3'], {}, env)).toEqual({ cmd: 'plink', args: { me: 's1', key: 'k1', panel: 's3' } })
    expect(panelRequest('links', [], {}, env).cmd).toBe('plinks')
  })
  it('refuses bad usage with a clear message', () => {
    expect(() => panelRequest('send', ['s2'], {}, env)).toThrow(/Usage: stm send/)
    expect(() => panelRequest('send', ['new', 'x'], {}, env)).toThrow(/stm spawn/)
    expect(() => panelRequest('note', ['rm', 'x'], {}, env)).toThrow(/Usage: stm note/)
    expect(() => panelRequest('note', ['append', 'x'], {}, env)).toThrow(/Usage/)
    expect(() => panelRequest('link', [], {}, env)).toThrow(/Usage: stm link/)
    expect(() => panelRequest('spawn', ['extra'], {}, env)).toThrow(/Usage: stm spawn/)
    expect(() => panelRequest('spawn', [], { model: undefined }, env)).toThrow(/--model needs a value/)
  })
  it('outside a panel: panel-only commands refuse, send keeps its old meaning', () => {
    expect(() => panelRequest('whoami', [], {}, {})).toThrow(/inside a SuperTokenMan panel/)
    expect(() => panelRequest('spawn', [], {}, {})).toThrow(/STM_PANEL_ID is not set/)
    expect(panelRequest('send', ['s2', 'x'], {}, {})).toBeNull()
    expect(panelRequest('status', [], {}, env)).toBeNull()
  })
  it('prints a queued send as queued', () => {
    expect(panelText('psend', { panel: 's2', delivery: 'queued' })).toMatch(/Queued in s2's composer/)
  })
})

describe('identity', () => {
  it('a panel acts only as itself', () => {
    const k = new PanelKeys()
    const a = k.issue('s1')
    const b = k.issue('s2')
    expect(k.verify('s1', a)).toBe('s1')
    expect(() => k.verify('s1', b)).toThrow(/only act as itself/)
    expect(() => k.verify('s1', '')).toThrow(/only act as itself/)
    expect(() => k.verify('s9', a)).toThrow(/Unknown panel "s9"/)
    expect(() => k.verify('', a)).toThrow(/STM_PANEL_ID is not set/)
    k.drop('s1')
    expect(() => k.verify('s1', a)).toThrow(/Unknown panel/)
  })
})

describe('rate limits', () => {
  it('caps per panel in a sliding window, with a clear error', () => {
    const r = new RateLimit('stm send', () => 3, 60_000)
    for (let i = 0; i < 3; i++) r.take('s1', 1000 + i)
    expect(() => r.take('s1', 2000)).toThrow(/stm send is capped at 3 per minute.*Try again in 59s/)
    r.take('s2', 2000)
    r.take('s1', 61_001)
  })
  it('reads the cap each time (configurable)', () => {
    let max = 1
    const r = new RateLimit('stm spawn', () => max, 3_600_000)
    r.take('s1', 0)
    expect(() => r.take('s1', 1)).toThrow(/per hour/)
    max = 2
    r.take('s1', 2)
  })
})

describe('notes', () => {
  it('lives in the project, capped in size', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stm-notes-'))
    expect(noteGet(dir, 'plan')).toBe('')
    noteSet(dir, 'plan', 'one\n')
    noteSet(dir, 'plan', 'two\n', true)
    expect(readFileSync(join(notesDir(dir), 'plan.md'), 'utf8')).toBe('one\ntwo\n')
    expect(() => noteSet(dir, 'big', 'x'.repeat(NOTE_MAX + 1))).toThrow(/capped/)
    noteSet(dir, 'big', 'x'.repeat(NOTE_MAX - 1))
    expect(() => noteSet(dir, 'big', 'yy', true)).toThrow(/capped/)
    expect(() => noteSet(dir, '../etc', 'x')).toThrow(/note name/)
    expect(() => noteGet(dir, 'a/b')).toThrow(/note name/)
  })
})

describe('send delivery and links', () => {
  it('never auto-submits by default', () => {
    expect(deliveryOf(undefined)).toBe('queued')
    const links = addLink([], 's1', 's2', 5)
    expect(deliveryOf(linkOf(links, 's2', 's1'))).toBe('queued')
    expect(deliveryOf({ ...links[0]!, auto: true })).toBe('auto')
  })
  it('labels the message with the sender', () => {
    expect(labelled('acme 2', 'hello')).toBe('From panel acme 2: hello')
  })
  it('links are undirected and not duplicated', () => {
    let l = addLink([], 's1', 's2', 1)
    l = addLink(l, 's2', 's1', 2)
    expect(l).toHaveLength(1)
    expect(linksFor(l, 's2')).toEqual([{ panel: 's1', auto: false }])
    expect(() => addLink(l, 's1', 's1')).toThrow(/itself/)
  })
  it('validates model ids against the model list', () => {
    expect(isModel('claude-opus-5-5')).toBe(true)
    expect(isModel('claude-opus-5-5[1m]')).toBe(true)
    expect(isModel('gpt-5')).toBe(false)
  })
})
