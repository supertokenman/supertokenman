// Dokploy as a deploy target, next to Coolify: applications read from your Dokploy through its API with
// a key from the vault (header x-api-key), a deploy started and followed, its deployments listed, and a
// rollback through Dokploy's own rollbacks when the app has them. Dokploy is Apache-2.0 outside its
// /proprietary folder; only its API is used.

import type { CoolifyApp, Deployment } from './deploys.js'

type F = typeof fetch
const api = (base: string) => `${base.replace(/\/+$/, '')}/api`
async function call(f: F, base: string, key: string, path: string, body?: unknown): Promise<unknown> {
  const r = await f(`${api(base)}/${path}`, { method: body ? 'POST' : 'GET', headers: { 'x-api-key': key, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000) })
  const text = await r.text()
  if (!r.ok) throw new Error(`Dokploy answered ${r.status}: ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}

/** Dokploy's statuses in Coolify's words, so one deploy flow follows both. */
export const statusOf = (s: unknown) => ({ running: 'in_progress', idle: 'queued', done: 'finished', error: 'failed', cancelled: 'cancelled' })[String(s)] ?? String(s)

/** Applications from project.all; newer Dokploy nests them under environments. */
export function appsOf(projects: unknown): CoolifyApp[] {
  const out: CoolifyApp[] = []
  for (const p of (Array.isArray(projects) ? projects : []) as Record<string, unknown>[]) {
    const lists = [p.applications, ...((p.environments as Record<string, unknown>[] | undefined) ?? []).map((e) => e.applications)]
    for (const a of lists.flatMap((l) => (Array.isArray(l) ? l : [])) as Record<string, unknown>[]) {
      const d = ((a.domains as Record<string, unknown>[] | undefined) ?? [])[0]
      out.push({ uuid: String(a.applicationId), name: `${String(a.name ?? a.appName)}`, fqdn: d?.host ? `${d.https === false ? 'http' : 'https'}://${d.host}` : undefined, status: String(a.applicationStatus ?? 'unknown'), branch: a.branch ? String(a.branch) : undefined, repo: a.repository ? String(a.repository) : undefined })
    }
  }
  return out
}

export type DDeployment = Deployment & { rollbackId?: string; title?: string }
export const deploymentsOf = (list: unknown): DDeployment[] =>
  ((Array.isArray(list) ? list : []) as Record<string, unknown>[])
    .map((d) => ({ id: String(d.deploymentId), status: statusOf(d.status), at: d.createdAt ? String(d.createdAt) : undefined, ...(d.title ? { title: String(d.title) } : {}), ...(d.rollbackId ? { rollbackId: String(d.rollbackId) } : {}) }))
    .sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')))

/** The rollback to use: the newest finished deployment before the current one that Dokploy kept a rollback for. */
export const rollbackTargetOf = (history: DDeployment[], current: string) => history.find((d) => d.id !== current && d.status === 'finished' && d.rollbackId) ?? null

export function dokploy(base: string, key: string, f: F = fetch) {
  const history = async (appId: string) => deploymentsOf(await call(f, base, key, `deployment.all?applicationId=${encodeURIComponent(appId)}`))
  return {
    apps: async () => appsOf(await call(f, base, key, 'project.all')),
    history,
    /** Starts a deploy and returns the new deployment's id, found as the newest one that was not there before. */
    async deploy(appId: string, wait = (ms: number) => new Promise((r) => setTimeout(r, ms))) {
      const before = new Set((await history(appId)).map((d) => d.id))
      await call(f, base, key, 'application.deploy', { applicationId: appId })
      for (let i = 0; i < 15; i++) {
        const fresh = (await history(appId)).find((d) => !before.has(d.id))
        if (fresh) return fresh.id
        await wait(1000)
      }
      throw new Error('Dokploy took the deploy but no deployment showed up.')
    },
    async deployment(appId: string, id: string): Promise<Deployment> {
      return (await history(appId)).find((d) => d.id === id) ?? { id, status: 'unknown' }
    },
    async rollback(rollbackId: string) {
      await call(f, base, key, 'rollback.rollback', { rollbackId })
    },
  }
}
