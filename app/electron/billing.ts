// What the products cost: read from the accounts the user already has a key for (no paid service in
// between), plus fixed costs they type in for whatever has no API. Every source answers on its own; one
// failing never hides the others.

export type Money = { amount: number; currency: string }
export type Renewal = { name: string; date: string; amount?: Money }
export type Source = {
  id: string
  name: string
  kind: 'api' | 'manual'
  /** spent this calendar month */
  month?: Money
  /** credit left, for prepaid accounts */
  balance?: Money
  /** usage that is not money: compute hours, storage */
  usage?: { label: string; value: string }[]
  renewals?: Renewal[]
  /** the vault secret this source needs and does not have */
  missing?: string
  error?: string
  url: string
}
export type Fixed = { id: string; name: string; amount: number; currency: string; day: number; url?: string }

type Get = (url: string, headers: Record<string, string>) => Promise<unknown>
export const getJson: Get = async (url, headers) => {
  const r = await fetch(url, { headers: { 'User-Agent': 'SuperTokenMan', ...headers }, signal: AbortSignal.timeout(15_000) })
  if (!r.ok) throw new Error(`${new URL(url).host} answered ${r.status}`)
  return r.json()
}

const monthStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
const iso = (d: Date) => d.toISOString().replace(/\.\d+Z$/, 'Z')

/** OpenRouter: prepaid credit and what was used, from /credits. */
export async function openrouter(key: string | undefined, get: Get): Promise<Source> {
  const base: Source = { id: 'openrouter', name: 'OpenRouter', kind: 'api', url: 'https://openrouter.ai/settings/credits' }
  if (!key) return { ...base, missing: 'OPENROUTER_API_KEY' }
  try {
    const j = (await get('https://openrouter.ai/api/v1/credits', { Authorization: `Bearer ${key}` })) as { data: { total_credits: number; total_usage: number } }
    return { ...base, balance: { amount: j.data.total_credits - j.data.total_usage, currency: 'USD' }, usage: [{ label: 'used, all time', value: `$${j.data.total_usage.toFixed(2)}` }] }
  } catch (e) {
    return { ...base, error: (e as Error).message }
  }
}

/** Sums cost buckets shaped like Anthropic's and OpenAI's cost reports. */
export function sumBuckets(j: unknown): number {
  const data = (j as { data?: { results?: { amount?: number | string | { value?: number | string } }[] }[] }).data ?? []
  let cents = 0
  for (const b of data)
    for (const r of b.results ?? []) {
      const a = typeof r.amount === 'object' && r.amount ? r.amount.value : r.amount
      cents += Math.round(Number(a ?? 0) * 100)
    }
  return cents / 100
}

/** Anthropic API spend this month, from the Admin API cost report (needs an admin key). */
export async function anthropic(key: string | undefined, get: Get, now = new Date()): Promise<Source> {
  const base: Source = { id: 'anthropic', name: 'Anthropic API', kind: 'api', url: 'https://console.anthropic.com/settings/cost' }
  if (!key) return { ...base, missing: 'ANTHROPIC_ADMIN_KEY' }
  try {
    const j = await get(`https://api.anthropic.com/v1/organizations/cost_report?starting_at=${iso(monthStart(now))}&bucket_width=1d&limit=31`, { 'x-api-key': key, 'anthropic-version': '2023-06-01' })
    // the report gives cents as a decimal string
    return { ...base, month: { amount: sumBuckets(j) / 100, currency: 'USD' } }
  } catch (e) {
    return { ...base, error: (e as Error).message }
  }
}

/** OpenAI spend this month, from the organization costs endpoint (needs an admin key). */
export async function openai(key: string | undefined, get: Get, now = new Date()): Promise<Source> {
  const base: Source = { id: 'openai', name: 'OpenAI API', kind: 'api', url: 'https://platform.openai.com/usage' }
  if (!key) return { ...base, missing: 'OPENAI_ADMIN_KEY' }
  try {
    const j = await get(`https://api.openai.com/v1/organization/costs?start_time=${Math.floor(monthStart(now).getTime() / 1000)}&limit=31`, { Authorization: `Bearer ${key}` })
    return { ...base, month: { amount: sumBuckets(j), currency: 'USD' } }
  } catch (e) {
    return { ...base, error: (e as Error).message }
  }
}

/** Cloudflare: the account's paid subscriptions and the domains it registers, with their renewal dates. */
export async function cloudflare(token: string | undefined, get: Get): Promise<Source> {
  const base: Source = { id: 'cloudflare', name: 'Cloudflare', kind: 'api', url: 'https://dash.cloudflare.com/?to=/:account/billing' }
  if (!token) return { ...base, missing: 'CLOUDFLARE_API_TOKEN' }
  const h = { Authorization: `Bearer ${token}` }
  try {
    const accounts = ((await get('https://api.cloudflare.com/client/v4/accounts?per_page=5', h)) as { result: { id: string; name: string }[] }).result
    let monthly = 0
    let currency = 'USD'
    const renewals: Renewal[] = []
    const usage: { label: string; value: string }[] = []
    for (const a of accounts) {
      type Sub = { price: number; currency: string; frequency: string; rate_plan?: { public_name?: string }; current_period_end?: string; state?: string }
      const subs = await (get(`https://api.cloudflare.com/client/v4/accounts/${a.id}/subscriptions`, h) as Promise<{ result: Sub[] }>).then((r) => r.result, () => [] as Sub[])
      for (const s of subs.filter((x) => x.state !== 'Cancelled')) {
        const perMonth = s.frequency === 'yearly' ? s.price / 12 : s.frequency === 'quarterly' ? s.price / 3 : s.price
        monthly += perMonth
        currency = s.currency || currency
        if (s.current_period_end) renewals.push({ name: s.rate_plan?.public_name ?? 'Subscription', date: s.current_period_end, amount: { amount: s.price, currency: s.currency } })
      }
      type Dom = { name: string; expires_at?: string; auto_renew?: boolean }
      const doms = await (get(`https://api.cloudflare.com/client/v4/accounts/${a.id}/registrar/domains`, h) as Promise<{ result: Dom[] }>).then((r) => r.result ?? [], () => [] as Dom[])
      for (const d of doms) if (d.expires_at) renewals.push({ name: `${d.name}${d.auto_renew === false ? ' (auto-renew off)' : ''}`, date: d.expires_at })
      if (doms.length) usage.push({ label: 'domains', value: String(doms.length) })
    }
    return { ...base, month: { amount: Math.round(monthly * 100) / 100, currency }, renewals, usage }
  } catch (e) {
    return { ...base, error: (e as Error).message }
  }
}

/** Neon: compute and storage used this period, per project (Neon bills on these). */
export async function neon(key: string | undefined, get: Get): Promise<Source> {
  const base: Source = { id: 'neon', name: 'Neon', kind: 'api', url: 'https://console.neon.tech/app/billing' }
  if (!key) return { ...base, missing: 'NEON_API_KEY' }
  try {
    const j = (await get('https://console.neon.tech/api/v2/projects?limit=50', { Authorization: `Bearer ${key}`, Accept: 'application/json' })) as { projects: { compute_time_seconds?: number; synthetic_storage_size?: number }[] }
    const hours = j.projects.reduce((n, p) => n + (p.compute_time_seconds ?? 0), 0) / 3600
    const gb = j.projects.reduce((n, p) => n + (p.synthetic_storage_size ?? 0), 0) / 1e9
    return { ...base, usage: [{ label: 'compute this period', value: `${hours.toFixed(1)} h` }, { label: 'storage', value: `${gb.toFixed(2)} GB` }, { label: 'projects', value: String(j.projects.length) }] }
  } catch (e) {
    return { ...base, error: (e as Error).message }
  }
}

/** The next date a fixed cost charges, on or after today. */
export function nextCharge(day: number, now = new Date()): string {
  const d = Math.min(Math.max(1, Math.round(day)), 28)
  const y = now.getFullYear()
  const m = now.getMonth()
  const thisMonth = new Date(y, m, d)
  const when = thisMonth >= new Date(y, m, now.getDate()) ? thisMonth : new Date(y, m + 1, d)
  return `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`
}

export const manual = (f: Fixed, now = new Date()): Source => ({
  id: f.id,
  name: f.name,
  kind: 'manual',
  month: { amount: f.amount, currency: f.currency },
  renewals: [{ name: f.name, date: nextCharge(f.day, now), amount: { amount: f.amount, currency: f.currency } }],
  url: f.url ?? '',
})

export async function all(secret: (name: string) => string | undefined, fixed: Fixed[], get: Get = getJson, now = new Date()): Promise<Source[]> {
  const api = await Promise.all([
    anthropic(secret('ANTHROPIC_ADMIN_KEY'), get, now),
    openai(secret('OPENAI_ADMIN_KEY'), get, now),
    openrouter(secret('OPENROUTER_API_KEY'), get),
    cloudflare(secret('CLOUDFLARE_API_TOKEN'), get),
    neon(secret('NEON_API_KEY'), get),
  ])
  return [...api, ...fixed.map((f) => manual(f, now))]
}

/** Everything in one currency, given rates as units of that currency per 1 of each other. */
export function totalIn(sources: Source[], currency: string, rates: Record<string, number>): number {
  return Math.round(sources.reduce((n, s) => n + (s.month ? s.month.amount * (s.month.currency === currency ? 1 : (rates[s.month.currency] ?? 0)) : 0), 0) * 100) / 100
}
