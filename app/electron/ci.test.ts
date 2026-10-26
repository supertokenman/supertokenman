import { describe, expect, it } from 'vitest'
import { failureExcerpt, finished, github, jobs, parseRemote, repoOf, runs, token, type Run } from './ci'

describe('ci', () => {
  it('reads GitHub remotes', () => {
    expect(parseRemote('https://github.com/arimayuji/CLI.git')).toBe('arimayuji/CLI')
    expect(parseRemote('git@github.com:arimayuji/bzcorrida.git')).toBe('arimayuji/bzcorrida')
    expect(parseRemote('https://github.com/a/b')).toBe('a/b')
    expect(parseRemote('https://gitlab.com/a/b.git')).toBeNull()
  })

  it('finds the repo and branch of a folder, and a token', async () => {
    const run = async (cmd: string, args: string[]) => (args[0] === 'remote' ? 'git@github.com:arimayuji/CLI.git' : cmd === 'gh' ? 'gho_x' : 'main')
    expect(await repoOf('/p', run)).toEqual({ repo: 'arimayuji/CLI', branch: 'main' })
    expect(await repoOf('/p', async () => { throw new Error('not a repo') })).toBeNull()
    expect(await token('ghp_vault', run)).toBe('ghp_vault')
    expect(await token(undefined, run)).toBe('gho_x')
  })

  it('maps runs and jobs from the API', async () => {
    const calls: string[] = []
    const fake = (async (url: string) => {
      calls.push(url)
      const body = url.includes('/jobs')
        ? { jobs: [{ id: 7, name: 'test', status: 'completed', conclusion: 'failure', started_at: 'a', completed_at: 'b', html_url: 'u', steps: [{ name: 'npm test', status: 'completed', conclusion: 'failure', number: 3 }] }] }
        : { workflow_runs: [{ id: 1, name: 'CI', display_title: 'Fix queue', head_branch: 'main', head_sha: 'abcdef123', event: 'push', status: 'completed', conclusion: 'failure', created_at: 'c', updated_at: 'u', html_url: 'h', run_attempt: 1 }] }
      return new Response(JSON.stringify(body), { status: 200 })
    }) as typeof fetch
    const api = github('tok', fake)
    expect(await runs(api, 'a/b', 'main')).toMatchObject([{ id: 1, workflow: 'CI', title: 'Fix queue', sha: 'abcdef1', conclusion: 'failure' }])
    expect(await jobs(api, 'a/b', 1)).toMatchObject([{ id: 7, steps: [{ name: 'npm test', conclusion: 'failure' }] }])
    expect(calls[0]).toBe('https://api.github.com/repos/a/b/actions/runs?branch=main&per_page=12')
  })

  it('cuts a log down to the lines that explain the failure', () => {
    const log = ['2026-10-22T12:00:00.0000000Z Run npm test', 'ok 1 - parses', 'ok 2 - ranks', ...Array.from({ length: 40 }, (_, i) => `noise ${i}`), 'not ok 3 - queue', '  AssertionError: expected 2 to equal 3', '    at test.ts:10', 'more noise', 'npm ERR! Test failed', '##[error]Process completed with exit code 1.'].join('\n')
    const out = failureExcerpt(log)
    expect(out).toContain('AssertionError: expected 2 to equal 3')
    expect(out).toContain('##[error]Process completed with exit code 1.')
    expect(out).not.toContain('noise 5')
    expect(out).not.toContain('2026-10-22T')
    expect(failureExcerpt('a\nb\nc', 2)).toBe('b\nc')
  })

  it('spots runs that just finished', () => {
    const r = (id: number, status: string): Run => ({ id, status, workflow: '', title: '', branch: '', sha: '', event: '', conclusion: null, createdAt: '', updatedAt: '', url: '', attempt: 1 })
    expect(finished([r(1, 'in_progress'), r(2, 'completed')], [r(1, 'completed'), r(2, 'completed'), r(3, 'completed')]).map((x) => x.id)).toEqual([1])
  })
})
