import { describe, expect, it } from 'vitest'
import * as C from './cloud'

describe('cloud', () => {
  it('lists EC2 and RDS across regions', async () => {
    const r: C.Run = async (_cmd, args) => {
      if (args[1] === 'describe-regions') return '["us-east-1","sa-east-1"]'
      if (args[1] === 'describe-instances')
        return JSON.stringify({ Reservations: args.includes('sa-east-1') ? [{ Instances: [{ InstanceId: 'i-1', InstanceType: 't3.large', LaunchTime: '2026-01-02T00:00:00Z', State: { Name: 'running' }, Tags: [{ Key: 'Name', Value: 'old-api' }] }] }] : [] })
      return JSON.stringify({ DBInstances: args.includes('us-east-1') ? [{ DBInstanceIdentifier: 'db1', DBInstanceClass: 'db.t3.micro', DBInstanceStatus: 'stopped' }] : [] })
    }
    const res = await C.aws(r)
    expect(res.resources.map((x) => [x.kind, x.name, x.state, x.region])).toEqual(expect.arrayContaining([['EC2', 'old-api', 'running', 'sa-east-1'], ['RDS', 'db1', 'stopped', 'us-east-1']]))
    expect(res.resources.find((x) => x.kind === 'EC2')!.stop).toBe('aws ec2 stop-instances --region sa-east-1 --instance-ids i-1')
  })
  it('reports a missing CLI instead of failing', async () => {
    const res = await C.digitalocean(async () => {
      throw Object.assign(new Error('doctl not installed'), { missing: 'doctl' })
    })
    expect(res).toEqual({ provider: 'DigitalOcean', resources: [], missing: 'doctl' })
    expect((await C.supabase(undefined, async () => [])).missing).toBe('SUPABASE_ACCESS_TOKEN')
  })
  it('reads gcloud VMs and Neon computes', async () => {
    const g = await C.gcloud(async (_c, args) => {
      if (args[0] === 'projects') return JSON.stringify([{ projectId: 'proj-a' }, { projectId: 'proj-b' }])
      if (args[0] === 'compute' && args.includes('--project=proj-a')) return JSON.stringify([{ name: 'vm1', zone: '.../zones/us-central1-a', status: 'RUNNING', machineType: '.../e2-medium', creationTimestamp: '2026-01-01' }])
      if (args[0] === 'compute') throw new Error('Compute Engine API has not been used in project proj-b')
      return '[]'
    })
    expect(g.error).toBeUndefined()
    expect(g.resources).toHaveLength(1)
    expect(g.resources[0]).toMatchObject({ name: 'vm1', region: 'proj-a · us-central1-a', size: 'e2-medium', state: 'running', stop: 'gcloud compute instances stop vm1 --zone us-central1-a --project proj-a' })
    const n = await C.neon('t', async (url) => (url.includes('/endpoints') ? { endpoints: [{ id: 'ep-1', current_state: 'active', autoscaling_limit_max_cu: 2, suspend_timeout_seconds: -1 }] } : { projects: [{ id: 'p1', name: 'shop', region_id: 'aws-us-east-1', created_at: '' }] }))
    expect(n.resources[0]).toMatchObject({ state: 'running', size: '2 CU max, never suspends' })
  })
  it('lists repository secret names only', async () => {
    const api = async (path: string) => (path.includes('dependabot') ? { secrets: [] } : { secrets: [{ name: 'VERCEL_TOKEN', updated_at: '2025-01-01T00:00:00Z' }] })
    const r = await C.repoSecrets(api, ['me/app'])
    expect(r).toEqual([{ repo: 'me/app', secrets: [{ name: 'VERCEL_TOKEN', updatedAt: '2025-01-01T00:00:00Z', scope: 'Actions' }] }])
  })
})
