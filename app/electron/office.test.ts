import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { build, detect, placeOf, type Exec } from './office'

const FAKE = join(__dirname, '__fixtures__', 'fake-officecli.mjs')
const viaFake = (version?: string): Exec => (bin, args, o) =>
  new Promise((done) => {
    const { execFile } = require('node:child_process') as typeof import('node:child_process')
    execFile(process.execPath, [FAKE, ...args], { cwd: o.cwd, env: { ...process.env, ...(version ? { FAKE_OC_VERSION: version } : {}) } }, (err, stdout, stderr) =>
      done({ code: err ? ((err as { code?: number }).code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) }))
  })
const missing: Exec = async () => ({ code: 127, stdout: '', stderr: 'not found' })

describe('officecli', () => {
  it('without the program, says so and links the releases', async () => {
    expect(await detect('officecli', missing)).toMatchObject({ found: false, ok: false, releases: expect.stringContaining('/releases') })
  })
  it('checks the version', async () => {
    expect(await detect('x', viaFake('1.0.140'))).toMatchObject({ found: true, ok: true, version: '1.0.140' })
    expect(await detect('x', viaFake('1.0.100'))).toMatchObject({ found: true, ok: false })
  })
  it('refuses paths outside the folder and other kinds', () => {
    const root = mkdtempSync(join(tmpdir(), 'oc-'))
    expect(() => placeOf(root, '../evil.docx')).toThrow(/outside/)
    expect(() => placeOf(root, '/etc/x.docx')).toThrow(/outside/)
    expect(() => placeOf(root, 'notes.txt')).toThrow(/Only/)
    expect(placeOf(root, 'out/report.docx')).toBe(join(root, 'out', 'report.docx'))
  })
  it('builds, validates, lists issues and takes a screenshot, with a hash', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oc-'))
    const r = await build(root, 'deck.pptx', [{ command: 'set', path: '/slide[1]/shape[1]', props: { text: 'overflow' } }], { run: viaFake() })
    expect(r).toMatchObject({ ok: true, rel: 'deck.pptx', valid: true, issues: ['Slide 1: text overflows shape 2'], commands: 1 })
    expect(r.hash).toMatch(/^[0-9a-f]{16}$/)
    expect(existsSync(r.png!)).toBe(true)
  })
  it('a failing item rolls the whole batch back and says why', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oc-'))
    await build(root, 'a.docx', [{ command: 'set', path: '/body', props: { text: 'one' } }], { run: viaFake() })
    const before = readFileSync(join(root, 'a.docx'), 'utf8')
    const r = await build(root, 'a.docx', [{ command: 'set', path: '/body', props: { text: 'two' } }, { command: 'set', path: '/bad' }], { run: viaFake() })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('Item 2: path not found (Valid paths: /body)')
    expect(readFileSync(join(root, 'a.docx'), 'utf8')).toBe(before)
  })
})
