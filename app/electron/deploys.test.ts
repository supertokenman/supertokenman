import { describe, expect, it } from 'vitest'
import { advisors, appDeployments, coolifyApps, deploy, deployment, follow, health, lintMessage, rollback, rollbackTarget } from './deploys'

type Call = { url: string; method: string; body?: string; auth?: string }
function fake(routes: Record<string, (c: Call) => unknown>, calls: Call[] = []) {
  return (async (url: string, init: RequestInit = {}) => {
    const c = { url, method: init.method ?? 'GET', body: init.body as string | undefined, auth: (init.headers as Record<string, string> | undefined)?.Authorization }
    calls.push(c)
    const key = Object.keys(routes).find((k) => url.includes(k))
    if (!key) return new Response('not found', { status: 404 })
    const v = routes[key]!(c)
    return v instanceof Response ? v : new Response(JSON.stringify(v))
  }) as unknown as typeof fetch
}

describe('Supabase advisors', () => {
  it('reads both advisors of each active project, errors first', async () => {
    const calls: Call[] = []
    const f = fake({
      '/v1/projects/abc/advisors/security': () => ({ lints: [{ name: 'auth_otp', title: 'OTP expiry', level: 'WARN', categories: ['SECURITY'], description: 'd', detail: 'OTP lasts 24h' }, { name: 'rls_disabled_in_public', title: 'RLS disabled', level: 'ERROR', categories: ['SECURITY'], description: 'd', detail: 'Table public.notes has RLS off', remediation: 'https://supabase.com/docs/guides/database/database-linter?lint=0013' }] }),
      '/v1/projects/abc/advisors/performance': () => ({ lints: [] }),
      '/v1/projects': () => [{ id: 'abc', name: 'shop', status: 'ACTIVE_HEALTHY' }, { id: 'old', name: 'paused', status: 'INACTIVE' }],
    }, calls)
    const a = await advisors('tok', f)
    expect(a).toHaveLength(1)
    expect(a[0]!.security.map((l) => l.level)).toEqual(['ERROR', 'WARN'])
    expect(calls.every((c) => c.auth === 'Bearer tok')).toBe(true)
    const m = lintMessage(a[0]!.project, a[0]!.security[0]!)
    expect(m).toContain('RLS disabled')
    expect(m).toContain('do not run it')
    expect(m).not.toContain('tok')
  })
})

describe('Coolify', () => {
  const base = 'https://coolify.example.com/'
  it('lists apps, deploys, follows and finds the rollback commit', async () => {
    let polls = 0
    const calls: Call[] = []
    const f = fake({
      '/api/v1/applications/app1': (c) => (c.method === 'PATCH' ? { uuid: 'app1' } : {}),
      '/api/v1/applications': () => [{ uuid: 'app1', name: 'web', fqdn: 'https://web.example.com,https://www.example.com', status: 'running:healthy', git_branch: 'main', git_commit_sha: 'HEAD' }],
      '/api/v1/deploy?': () => ({ deployments: [{ deployment_uuid: 'dep9', resource_uuid: 'app1' }] }),
      '/api/v1/deployments/applications/app1': () => ({ deployments: [{ deployment_uuid: 'dep9', status: 'finished', commit: 'bad999' }, { deployment_uuid: 'dep8', status: 'failed', commit: 'mid555' }, { deployment_uuid: 'dep7', status: 'finished', commit: 'good111' }] }),
      '/api/v1/deployments/dep9': () => ({ status: ++polls < 3 ? 'in_progress' : 'finished', commit: 'bad999' }),
    }, calls)
    expect(await coolifyApps(base, 't', f)).toEqual([{ uuid: 'app1', name: 'web', fqdn: 'https://web.example.com', status: 'running:healthy', branch: 'main', commit: 'HEAD', repo: undefined }])
    expect(await deploy(base, 't', 'app1', f)).toBe('dep9')
    const seen: string[] = []
    const end = await follow(() => deployment(base, 't', 'dep9', f), (d) => seen.push(d.status), { sleep: async () => undefined })
    expect(end.status).toBe('finished')
    expect(seen).toEqual(['in_progress', 'finished'])
    const hist = await appDeployments(base, 't', 'app1', f)
    expect(rollbackTarget(hist, 'bad999')?.commit).toBe('good111')
    expect(await rollback(base, 't', 'app1', 'good111', f)).toBe('dep9')
    expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({ url: 'https://coolify.example.com/api/v1/applications/app1', body: '{"git_commit_sha":"good111"}' })
  })
  it('stops on a status Coolify does not use, instead of waiting it out', async () => {
    let n = 0
    const d = await follow(async () => ({ id: 'x', status: ++n > 3 ? 'nonsense' : 'queued' }), () => undefined, { sleep: async () => undefined })
    expect(d.status).toBe('nonsense')
  })
  it('stops following after its time', async () => {
    const d = await follow(async () => ({ id: 'x', status: 'in_progress' }), () => undefined, { maxMs: -1, sleep: async () => undefined })
    expect(d.status).toBe('timed out')
  })
})

describe('health check', () => {
  it('is healthy when most answers are good, and says why when not', async () => {
    let n = 0
    const flaky = (async () => (++n === 2 ? new Response('', { status: 502 }) : new Response('ok', { status: 200 }))) as unknown as typeof fetch
    expect((await health('https://x', flaky, 3, 1000, 0)).ok).toBe(true)
    const down = (async () => new Response('', { status: 503 })) as unknown as typeof fetch
    expect(await health('https://x', down, 3, 1000, 0)).toMatchObject({ ok: false, status: 503 })
    const dead = (async () => { throw new Error('ECONNREFUSED') }) as unknown as typeof fetch
    expect(await health('https://x', dead, 2, 1000, 0)).toMatchObject({ ok: false, error: 'ECONNREFUSED' })
  })
})
