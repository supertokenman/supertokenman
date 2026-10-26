// Deploys: Supabase's advisors (security and performance lints of each project) and Coolify's
// applications, with a deploy that is followed to the end, a health check after it, and a rollback to
// the last commit that deployed well. Tokens come from the vault; nothing here acts without the person.

export type Lint = { name: string; title: string; level: 'ERROR' | 'WARN' | 'INFO'; facing?: string; categories: string[]; description: string; detail: string; remediation?: string }
export type Advice = { project: { ref: string; name: string }; security: Lint[]; performance: Lint[]; error?: string }
export type CoolifyApp = { uuid: string; name: string; fqdn?: string; status: string; branch?: string; commit?: string; repo?: string }
export type Deployment = { id: string; status: 'queued' | 'in_progress' | 'finished' | 'failed' | 'cancelled' | string; commit?: string; at?: string }
export type Health = { ok: boolean; status?: number; ms?: number; error?: string; tries: { status?: number; ms: number; error?: string }[] }

type F = typeof fetch
async function json(f: F, url: string, init: RequestInit = {}) {
  const r = await f(url, init)
  const text = await r.text()
  if (!r.ok) throw new Error(`${new URL(url).hostname} answered ${r.status}${text ? `: ${text.slice(0, 200)}` : ''}`)
  return text ? (JSON.parse(text) as unknown) : null
}

// ---- Supabase ----

const SUPA = () => process.env.STM_SUPABASE_API ?? 'https://api.supabase.com'

export async function advisors(token: string, f: F = fetch): Promise<Advice[]> {
  const h = { Authorization: `Bearer ${token}` }
  const projects = (await json(f, `${SUPA()}/v1/projects`, { headers: h })) as { id: string; name: string; status: string }[]
  const out: Advice[] = []
  for (const p of projects.filter((x) => x.status.startsWith('ACTIVE'))) {
    try {
      const [sec, perf] = await Promise.all(['security', 'performance'].map((k) => json(f, `${SUPA()}/v1/projects/${p.id}/advisors/${k}`, { headers: h }) as Promise<{ lints?: Lint[] }>))
      const order = (l: Lint) => ({ ERROR: 0, WARN: 1, INFO: 2 })[l.level] ?? 3
      out.push({ project: { ref: p.id, name: p.name }, security: (sec.lints ?? []).sort((a, b) => order(a) - order(b)), performance: (perf.lints ?? []).sort((a, b) => order(a) - order(b)) })
    } catch (e) {
      out.push({ project: { ref: p.id, name: p.name }, security: [], performance: [], error: e instanceof Error ? e.message : String(e) })
    }
  }
  return out
}

/** What Claude gets when asked to fix a lint: what it is, where, and the official fix, without the token. */
export const lintMessage = (a: Advice['project'], l: Lint) =>
  `Supabase's advisor flagged this in the project "${a.name}" (${a.ref}), level ${l.level}:\n\n**${l.title}**\n${l.detail || l.description}\n${l.remediation ? `\nThe fix Supabase suggests: ${l.remediation}\n` : ''}\nWrite the SQL migration that fixes it in this repository's migrations folder, explain the change in two lines, and do not run it against the database.`

// ---- Coolify ----

const api = (base: string) => `${base.replace(/\/+$/, '')}/api/v1`
const auth = (token: string) => ({ Authorization: `Bearer ${token}`, Accept: 'application/json' })

export async function coolifyApps(base: string, token: string, f: F = fetch): Promise<CoolifyApp[]> {
  const list = (await json(f, `${api(base)}/applications`, { headers: auth(token) })) as Record<string, unknown>[]
  return list.map((a) => ({ uuid: String(a.uuid), name: String(a.name ?? a.uuid), fqdn: a.fqdn ? String(a.fqdn).split(',')[0] : undefined, status: String(a.status ?? 'unknown'), branch: a.git_branch ? String(a.git_branch) : undefined, commit: a.git_commit_sha ? String(a.git_commit_sha) : undefined, repo: a.git_repository ? String(a.git_repository) : undefined }))
}

export async function deploy(base: string, token: string, uuid: string, f: F = fetch): Promise<string> {
  const r = (await json(f, `${api(base)}/deploy?uuid=${encodeURIComponent(uuid)}&force=false`, { headers: auth(token) })) as { deployments?: { deployment_uuid: string }[] }
  const id = r.deployments?.[0]?.deployment_uuid
  if (!id) throw new Error('Coolify did not start a deployment.')
  return id
}

export async function deployment(base: string, token: string, id: string, f: F = fetch): Promise<Deployment> {
  const d = (await json(f, `${api(base)}/deployments/${encodeURIComponent(id)}`, { headers: auth(token) })) as Record<string, unknown>
  return { id, status: String(d.status ?? 'unknown'), commit: d.commit ? String(d.commit) : undefined, at: d.created_at ? String(d.created_at) : undefined }
}

export async function appDeployments(base: string, token: string, uuid: string, f: F = fetch): Promise<Deployment[]> {
  const r = (await json(f, `${api(base)}/deployments/applications/${encodeURIComponent(uuid)}?skip=0&take=20`, { headers: auth(token) })) as { deployments?: Record<string, unknown>[] }
  return (r.deployments ?? []).map((d) => ({ id: String(d.deployment_uuid ?? d.id), status: String(d.status), commit: d.commit ? String(d.commit) : undefined, at: d.created_at ? String(d.created_at) : undefined }))
}

/** The commit to go back to: the newest finished deployment before the one that just went out. */
export function rollbackTarget(history: Deployment[], current?: string): Deployment | null {
  return history.find((d) => d.status === 'finished' && d.commit && d.commit !== current) ?? null
}

/** Points the application at an older commit and deploys it. */
export async function rollback(base: string, token: string, uuid: string, commit: string, f: F = fetch): Promise<string> {
  await json(f, `${api(base)}/applications/${encodeURIComponent(uuid)}`, { method: 'PATCH', headers: { ...auth(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ git_commit_sha: commit }) })
  return deploy(base, token, uuid, f)
}

/** Follows a deployment until it ends (or the time runs out), reporting each state change. */
export async function follow(get: () => Promise<Deployment>, onState: (d: Deployment) => void, opts: { everyMs?: number; maxMs?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<Deployment> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  const until = Date.now() + (opts.maxMs ?? 20 * 60_000)
  let last = ''
  for (;;) {
    const d = await get()
    if (d.status !== last) onState(d)
    last = d.status
    // a status it does not know (an API change, a bad answer) ends the wait instead of polling for 20 minutes
    if (!['queued', 'in_progress'].includes(d.status)) return d
    if (Date.now() > until) return { ...d, status: 'timed out' }
    await sleep(opts.everyMs ?? 4000)
  }
}

/** A few GETs on the app; healthy when most of them answer 2xx or 3xx in time. */
export async function health(url: string, f: F = fetch, tries = 3, timeoutMs = 8000, gapMs = 1500): Promise<Health> {
  const out: Health['tries'] = []
  for (let i = 0; i < tries; i++) {
    const t = Date.now()
    try {
      const r = await f(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) })
      out.push({ status: r.status, ms: Date.now() - t })
    } catch (e) {
      out.push({ ms: Date.now() - t, error: e instanceof Error ? e.message : String(e) })
    }
    if (i < tries - 1 && gapMs) await new Promise((r) => setTimeout(r, gapMs))
  }
  const good = out.filter((x) => x.status !== undefined && x.status < 400).length
  const last = out[out.length - 1]!
  return { ok: good * 2 > tries, status: last.status, ms: Math.round(out.reduce((a, b) => a + b.ms, 0) / out.length), error: last.error, tries: out }
}
