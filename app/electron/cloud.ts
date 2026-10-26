// What is running in the user's cloud accounts, and what secrets their repositories hold (names only).
// Read through the CLIs already logged in on this Mac (aws, gcloud, doctl, flyctl) and tokens in the
// vault (GitHub, Neon, Supabase, Cloudflare): no new account, no paid service, read-only.
import { execFile } from 'node:child_process'
import type { Api } from './ci.js'

export type Resource = { provider: string; kind: string; name: string; region: string; state: 'running' | 'stopped' | 'idle' | 'other'; since?: string; size?: string; console: string; stop?: string; connect?: string }
export type ProviderResult = { provider: string; resources: Resource[]; missing?: string; error?: string }
export type RepoSecrets = { repo: string; secrets: { name: string; updatedAt: string; scope: string }[]; error?: string }

export type Run = (cmd: string, args: string[]) => Promise<string>
export const run: Run = (cmd, args) =>
  new Promise((resolve, reject) =>
    execFile(cmd, args, { timeout: 60_000, maxBuffer: 32 * 1024 * 1024 }, (err, out, errOut) => {
      if ((err as NodeJS.ErrnoException | null)?.code === 'ENOENT') return reject(Object.assign(new Error(`${cmd} not installed`), { missing: cmd }))
      if (err) return reject(new Error((errOut || err.message).trim().split('\n').slice(-2).join(' ')))
      resolve(out)
    }),
  )

const settle = async (provider: string, fn: () => Promise<Resource[]>): Promise<ProviderResult> => {
  try {
    return { provider, resources: await fn() }
  } catch (e) {
    const m = (e as { missing?: string }).missing
    return m ? { provider, resources: [], missing: m } : { provider, resources: [], error: (e as Error).message }
  }
}

/** AWS: EC2 instances (running or stopped, as stopped ones still bill their disks) and RDS, every region. */
export function aws(r: Run = run) {
  return settle('AWS', async () => {
    const regions = JSON.parse(await r('aws', ['ec2', 'describe-regions', '--query', 'Regions[].RegionName', '--output', 'json'])) as string[]
    const out: Resource[] = []
    await Promise.all(
      regions.map(async (region) => {
        type Ec2 = { Reservations: { Instances: { InstanceId: string; InstanceType: string; LaunchTime: string; State: { Name: string }; Tags?: { Key: string; Value: string }[] }[] }[] }
        const ec2 = JSON.parse(await r('aws', ['ec2', 'describe-instances', '--region', region, '--filters', 'Name=instance-state-name,Values=running,stopped,pending', '--output', 'json'])) as Ec2
        for (const i of ec2.Reservations.flatMap((x) => x.Instances))
          out.push({
            provider: 'AWS', kind: 'EC2', region, size: i.InstanceType, since: i.LaunchTime,
            name: i.Tags?.find((t) => t.Key === 'Name')?.Value ?? i.InstanceId,
            state: i.State.Name === 'running' || i.State.Name === 'pending' ? 'running' : 'stopped',
            console: `https://${region}.console.aws.amazon.com/ec2/home?region=${region}#InstanceDetails:instanceId=${i.InstanceId}`,
            stop: `aws ec2 stop-instances --region ${region} --instance-ids ${i.InstanceId}`,
            // Session Manager: no SSH key or open port needed, only the SSM agent on the instance
            connect: `aws ssm start-session --region ${region} --target ${i.InstanceId}`,
          })
        type Rds = { DBInstances: { DBInstanceIdentifier: string; DBInstanceClass: string; DBInstanceStatus: string; InstanceCreateTime?: string }[] }
        const rds = JSON.parse(await r('aws', ['rds', 'describe-db-instances', '--region', region, '--output', 'json']).catch(() => '{"DBInstances":[]}')) as Rds
        for (const d of rds.DBInstances)
          out.push({
            provider: 'AWS', kind: 'RDS', region, name: d.DBInstanceIdentifier, size: d.DBInstanceClass, since: d.InstanceCreateTime,
            state: d.DBInstanceStatus === 'available' ? 'running' : d.DBInstanceStatus === 'stopped' ? 'stopped' : 'other',
            console: `https://${region}.console.aws.amazon.com/rds/home?region=${region}#database:id=${d.DBInstanceIdentifier}`,
            stop: `aws rds stop-db-instance --region ${region} --db-instance-identifier ${d.DBInstanceIdentifier}`,
          })
      }),
    )
    return out
  })
}

/** Google Cloud: Compute Engine VMs and Cloud SQL in every active project the login can see. */
export function gcloud(r: Run = run) {
  return settle('Google Cloud', async () => {
    const projects = (JSON.parse(await r('gcloud', ['projects', 'list', '--filter=lifecycleState:ACTIVE', '--format=json'])) as { projectId: string }[]).map((p) => p.projectId).slice(0, 40)
    const out: Resource[] = []
    await Promise.all(
      projects.map(async (project) => {
        type Vm = { name: string; zone: string; status: string; machineType: string; creationTimestamp: string }
        // a project without the Compute or SQL API enabled has nothing of that kind: its error is skipped
        const vms = JSON.parse(await r('gcloud', ['compute', 'instances', 'list', `--project=${project}`, '--format=json']).catch(() => '[]')) as Vm[]
        for (const v of vms) {
          const zone = v.zone.split('/').pop()!
          out.push({
            provider: 'Google Cloud', kind: 'VM', name: v.name, region: `${project} · ${zone}`, size: v.machineType.split('/').pop(), since: v.creationTimestamp,
            state: v.status === 'RUNNING' ? 'running' : v.status === 'TERMINATED' ? 'stopped' : 'other',
            console: `https://console.cloud.google.com/compute/instancesDetail/zones/${zone}/instances/${v.name}?project=${project}`,
            stop: `gcloud compute instances stop ${v.name} --zone ${zone} --project ${project}`,
            connect: `gcloud compute ssh ${v.name} --zone ${zone} --project ${project}`,
          })
        }
        type Sql = { name: string; region: string; state: string; settings?: { tier?: string; activationPolicy?: string }; createTime?: string }
        const sql = JSON.parse(await r('gcloud', ['sql', 'instances', 'list', `--project=${project}`, '--format=json']).catch(() => '[]')) as Sql[]
        for (const d of sql)
          out.push({
            provider: 'Google Cloud', kind: 'Cloud SQL', name: d.name, region: `${project} · ${d.region}`, size: d.settings?.tier, since: d.createTime,
            state: d.state === 'RUNNABLE' && d.settings?.activationPolicy !== 'NEVER' ? 'running' : 'stopped',
            console: `https://console.cloud.google.com/sql/instances/${d.name}/overview?project=${project}`,
            stop: `gcloud sql instances patch ${d.name} --activation-policy=NEVER --project ${project}`,
          })
      }),
    )
    return out
  })
}

/** DigitalOcean droplets. */
export function digitalocean(r: Run = run) {
  return settle('DigitalOcean', async () => {
    type D = { id: number; name: string; status: string; size_slug: string; created_at: string; region: { slug: string } }
    const ds = JSON.parse(await r('doctl', ['compute', 'droplet', 'list', '--output', 'json'])) as D[]
    return ds.map((d) => ({
      provider: 'DigitalOcean', kind: 'Droplet', name: d.name, region: d.region.slug, size: d.size_slug, since: d.created_at,
      state: d.status === 'active' ? 'running' : d.status === 'off' ? 'stopped' : 'other',
      console: `https://cloud.digitalocean.com/droplets/${d.id}`,
      stop: `doctl compute droplet-action power-off ${d.id}`,
      connect: `doctl compute ssh ${d.id}`,
    }))
  })
}

/** Fly.io apps and whether they run. */
export function fly(r: Run = run) {
  return settle('Fly.io', async () => {
    type A = { Name: string; Status: string; Organization?: { Slug: string } }
    const apps = JSON.parse(await r('flyctl', ['apps', 'list', '--json'])) as A[]
    return apps.map((a) => ({
      provider: 'Fly.io', kind: 'App', name: a.Name, region: a.Organization?.Slug ?? '',
      state: a.Status === 'deployed' || a.Status === 'running' ? 'running' : a.Status === 'suspended' ? 'stopped' : 'other',
      console: `https://fly.io/apps/${a.Name}`,
      stop: `flyctl scale count 0 -a ${a.Name}`,
      connect: `flyctl ssh console -a ${a.Name}`,
    }))
  })
}

type Get = (url: string, headers: Record<string, string>) => Promise<unknown>

/** Supabase projects: active ones bill (and free ones pause on their own after a week idle). */
export function supabase(token: string | undefined, get: Get) {
  return settle('Supabase', async () => {
    if (!token) throw Object.assign(new Error('no token'), { missing: 'SUPABASE_ACCESS_TOKEN' })
    type P = { id: string; name: string; region: string; status: string; created_at: string }
    const ps = (await get('https://api.supabase.com/v1/projects', { Authorization: `Bearer ${token}` })) as P[]
    return ps.map((p) => ({
      provider: 'Supabase', kind: 'Project', name: p.name, region: p.region, since: p.created_at,
      state: p.status.startsWith('ACTIVE') ? 'running' : p.status.includes('PAUSED') || p.status === 'INACTIVE' ? 'stopped' : 'other',
      console: `https://supabase.com/dashboard/project/${p.id}`,
    }))
  })
}

/** Neon: compute endpoints, which bill while active. */
export function neon(token: string | undefined, get: Get) {
  return settle('Neon', async () => {
    if (!token) throw Object.assign(new Error('no token'), { missing: 'NEON_API_KEY' })
    const h = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    const { projects } = (await get('https://console.neon.tech/api/v2/projects?limit=50', h)) as { projects: { id: string; name: string; region_id: string; created_at: string }[] }
    const out: Resource[] = []
    for (const p of projects) {
      const { endpoints } = (await get(`https://console.neon.tech/api/v2/projects/${p.id}/endpoints`, h)) as { endpoints: { id: string; current_state: string; autoscaling_limit_max_cu?: number; suspend_timeout_seconds?: number }[] }
      for (const e of endpoints)
        out.push({
          provider: 'Neon', kind: 'Compute', name: `${p.name} (${e.id})`, region: p.region_id, since: p.created_at,
          size: e.autoscaling_limit_max_cu ? `${e.autoscaling_limit_max_cu} CU max${e.suspend_timeout_seconds === -1 ? ', never suspends' : ''}` : undefined,
          state: e.current_state === 'active' ? 'running' : e.current_state === 'idle' ? 'idle' : 'other',
          console: `https://console.neon.tech/app/projects/${p.id}`,
        })
    }
    return out
  })
}

/** Names and update dates of each repository's Actions secrets; GitHub never returns the values. */
export async function repoSecrets(api: Api, repos: string[]): Promise<RepoSecrets[]> {
  return Promise.all(
    repos.map(async (repo) => {
      try {
        const [a, d] = await Promise.all([
          api(`/repos/${repo}/actions/secrets?per_page=100`) as Promise<{ secrets: { name: string; updated_at: string }[] }>,
          (api(`/repos/${repo}/dependabot/secrets?per_page=100`) as Promise<{ secrets: { name: string; updated_at: string }[] }>).catch(() => ({ secrets: [] })),
        ])
        return { repo, secrets: [...a.secrets.map((s) => ({ name: s.name, updatedAt: s.updated_at, scope: 'Actions' })), ...d.secrets.map((s) => ({ name: s.name, updatedAt: s.updated_at, scope: 'Dependabot' }))] }
      } catch (e) {
        return { repo, secrets: [], error: (e as Error).message }
      }
    }),
  )
}

/** The user's own repositories, most recently pushed first. */
export async function myRepos(api: Api, limit = 40): Promise<string[]> {
  const rs = (await api(`/user/repos?affiliation=owner,organization_member&sort=pushed&per_page=${limit}`)) as { full_name: string; permissions?: { admin?: boolean } }[]
  return rs.filter((r) => r.permissions?.admin !== false).map((r) => r.full_name)
}
