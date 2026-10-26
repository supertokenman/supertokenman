import { describe, expect, it } from 'vitest'
import { appsOf, deploymentsOf, dokploy, rollbackTargetOf, statusOf } from './dokploy'

describe('dokploy', () => {
  it('reads apps from old and new project shapes', () => {
    const apps = appsOf([
      { name: 'Acme', applications: [{ applicationId: 'a1', name: 'web', applicationStatus: 'done', branch: 'main', domains: [{ host: 'acme.dev', https: true }] }] },
      { name: 'Ops', environments: [{ applications: [{ applicationId: 'a2', appName: 'api-x1', applicationStatus: 'error' }] }] },
    ])
    expect(apps).toEqual([
      { uuid: 'a1', name: 'web', fqdn: 'https://acme.dev', status: 'done', branch: 'main', repo: undefined },
      { uuid: 'a2', name: 'api-x1', fqdn: undefined, status: 'error', branch: undefined, repo: undefined },
    ])
    expect(statusOf('running')).toBe('in_progress')
  })

  it('finds the rollback to use', () => {
    const h = deploymentsOf([{ deploymentId: 'd1', status: 'done', createdAt: '2026-10-20', rollbackId: 'r1' }, { deploymentId: 'd3', status: 'error', createdAt: '2026-10-25' }, { deploymentId: 'd2', status: 'done', createdAt: '2026-10-22' }])
    expect(h.map((d) => d.id)).toEqual(['d3', 'd2', 'd1'])
    expect(rollbackTargetOf(h, 'd3')!.rollbackId).toBe('r1')
  })

  it('starts a deploy and finds its id', async () => {
    let deployed = false
    const calls: string[] = []
    const f = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url.replace('http://d/api/', '')} ${(init?.headers as Record<string, string>)['x-api-key']}`)
      if (url.includes('application.deploy')) deployed = true
      const list = [{ deploymentId: 'old', status: 'done', createdAt: '1' }, ...(deployed ? [{ deploymentId: 'new', status: 'running', createdAt: '2' }] : [])]
      return new Response(url.includes('deployment.all') ? JSON.stringify(list) : 'true')
    }) as typeof fetch
    const d = dokploy('http://d/', 'k', f)
    expect(await d.deploy('a1', async () => undefined)).toBe('new')
    expect(calls[1]).toBe('POST application.deploy k')
    expect((await d.deployment('a1', 'new')).status).toBe('in_progress')
  })
})
