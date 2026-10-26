import { mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { childEnv, deliver, hashOf, runCode } from './codebox'

const cwd = mkdtempSync(join(tmpdir(), 'cb-'))
const env = { PATH: process.env.PATH, HOME: '/h', ANTHROPIC_API_KEY: 'sk-fake-secret', GITHUB_TOKEN: 'ghp_fake' } as NodeJS.ProcessEnv

describe('codebox', () => {
  it('keeps secrets out of the child environment and closes the network by default', () => {
    const e = childEnv(env, false)
    expect(e.ANTHROPIC_API_KEY).toBeUndefined()
    expect(e.GITHUB_TOKEN).toBeUndefined()
    expect(e.HTTPS_PROXY).toBe('http://127.0.0.1:9')
    expect(childEnv(env, true).HTTPS_PROXY).toBeUndefined()
  })
  it('runs a script in the panel folder and returns only stdout', async () => {
    const r = await runCode('js', 'console.log(process.cwd()); console.log(Object.keys(process.env).filter(k => /KEY|TOKEN/.test(k)).length)', { cwd, env, node: process.execPath })
    expect(r.exit).toBe(0)
    // the child reports the resolved folder (/private/var for /var on macOS)
    expect(r.stdout.trim().split('\n')).toEqual([realpathSync(cwd), '0'])
  })
  it('stops at the time limit', async () => {
    const r = await runCode('js', 'setInterval(() => {}, 1000)', { cwd, env, node: process.execPath, timeoutMs: 300 })
    expect(r.timedOut).toBe(true)
  })
  it('stops at the output limit', async () => {
    const r = await runCode('js', "for (let i = 0; i < 1e5; i++) console.log('x'.repeat(100))", { cwd, env, node: process.execPath, maxBytes: 50_000 })
    expect(r.truncated).toBe(true)
  })
  it('a 50 KB log stays out; only the answer and a pointer to the raw file come back', () => {
    const log = Array.from({ length: 800 }, (_, i) => `2026-10-25T10:${String(i % 60).padStart(2, '0')} INFO request ${i} ok ${'.'.repeat(40)}`).join('\n')
    const d = deliver({ stdout: log, stderr: '', exit: 0, ms: 5, timedOut: false, truncated: false, rawBytes: log.length }, { limit: 2_000, rawDir: join(cwd, '.stm', 'exec'), hash: hashOf('js', 'x') })
    expect(d.text.length).toBeLessThan(2_300)
    expect(d.text).toContain('characters left out')
    expect(readFileSync(d.rawPath!, 'utf8')).toBe(log)
  })
  it('says when nothing was printed and shows the exit code', () => {
    expect(deliver({ stdout: '', stderr: 'boom', exit: 2, ms: 1, timedOut: false, truncated: false, rawBytes: 4 }, { hash: 'h' }).text).toBe('\n[stderr]\nboom\n[exit code 2]')
  })
})
