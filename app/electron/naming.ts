// Is the name taken? Free public lookups only: RDAP for domains (the registries' own protocol), the npm
// and PyPI registries, and GitHub. An answer is "free", "taken" or "unknown" (blocked, rate-limited,
// offline): never a guess. Trademarks have no free API here, so they are links to the official searches.

export type Verdict = 'free' | 'taken' | 'unknown'
export type Check = { kind: 'domain' | 'npm' | 'pypi' | 'github'; label: string; verdict: Verdict; url: string; note?: string }

export const TLDS = ['com', 'com.br', 'dev', 'app', 'io', 'ai']

/** A name as a domain or package would spell it: lowercase letters, digits and dashes. */
export function slug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

type Fetch = (url: string, init?: RequestInit) => Promise<{ status: number; json(): Promise<unknown> }>

/** 404 is free and 200 taken; anything else is a lookup that did not answer. */
const byStatus = (s: number): Verdict => (s === 404 ? 'free' : s === 200 ? 'taken' : 'unknown')

async function status(f: Fetch, url: string, headers: Record<string, string> = {}) {
  try {
    const r = await f(url, { headers: { 'User-Agent': 'SuperTokenMan', ...headers }, redirect: 'follow', signal: AbortSignal.timeout(10_000) })
    return r
  } catch {
    return null
  }
}

export async function checkName(name: string, f: Fetch = fetch as unknown as Fetch): Promise<Check[]> {
  const s = slug(name)
  if (!s) throw new Error('Type a name first.')
  const domain = async (tld: string): Promise<Check> => {
    const host = `${s.replace(/-/g, '')}.${tld}`
    const r = await status(f, `https://rdap.org/domain/${host}`, { Accept: 'application/rdap+json' })
    return { kind: 'domain', label: host, verdict: r ? byStatus(r.status) : 'unknown', url: `https://${host}` }
  }
  const npm = async (): Promise<Check> => {
    const r = await status(f, `https://registry.npmjs.org/${s}`)
    return { kind: 'npm', label: s, verdict: r ? byStatus(r.status) : 'unknown', url: `https://www.npmjs.com/package/${s}` }
  }
  const pypi = async (): Promise<Check> => {
    const r = await status(f, `https://pypi.org/pypi/${s}/json`)
    return { kind: 'pypi', label: s, verdict: r ? byStatus(r.status) : 'unknown', url: `https://pypi.org/project/${s}/` }
  }
  const github = async (): Promise<Check> => {
    const r = await status(f, `https://api.github.com/users/${s}`, { Accept: 'application/vnd.github+json' })
    let note: string | undefined
    const search = await status(f, `https://api.github.com/search/repositories?q=${encodeURIComponent(`${s} in:name`)}&per_page=1`, { Accept: 'application/vnd.github+json' })
    if (search?.status === 200) {
      const n = ((await search.json()) as { total_count?: number }).total_count ?? 0
      note = `${n} repo${n === 1 ? '' : 's'} with this in the name`
    }
    return { kind: 'github', label: `@${s}`, verdict: r ? byStatus(r.status) : 'unknown', url: `https://github.com/${s}`, note }
  }
  return Promise.all([...TLDS.map(domain), npm(), pypi(), github()])
}

/** The official trademark searches, to open: there is no free API to ask them. */
export function trademarkLinks(name: string) {
  const q = encodeURIComponent(name.trim())
  return [
    { label: 'INPI (Brazil)', url: 'https://busca.inpi.gov.br/pePI/jsp/marcas/Pesquisa_classe_basica.jsp' },
    { label: 'USPTO (United States)', url: `https://tmsearch.uspto.gov/search/search-results?query=${q}` },
    { label: 'WIPO Global Brand Database', url: `https://branddb.wipo.int/en/similarname/results?sort=score%20desc&strategy=concept&brandName=${q}` },
    { label: 'EUIPO (European Union)', url: `https://euipo.europa.eu/eSearch/#basic/1+1+1+1/100+100+100+100/${q}` },
  ]
}

/** Where to look for the handle: the networks do not answer this reliably, so these are links, not verdicts. */
export function handleLinks(name: string) {
  const s = slug(name).replace(/-/g, '')
  return [
    { label: 'Instagram', url: `https://www.instagram.com/${s}/` },
    { label: 'X', url: `https://x.com/${s}` },
    { label: 'TikTok', url: `https://www.tiktok.com/@${s}` },
    { label: 'YouTube', url: `https://www.youtube.com/@${s}` },
    { label: 'LinkedIn', url: `https://www.linkedin.com/company/${s}` },
  ]
}

export type Research = {
  summary: string
  audience: { who: string; pain: string }[]
  competitors: { name: string; url: string; angle: string; price?: string }[]
  positioning: string
  names: string[]
  risks: string[]
}

/** Pulls the JSON object out of a model's answer, tolerating a code fence around it. */
export function parseResearch(text: string): Research {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('The research came back without data.')
  const r = JSON.parse(m[0]) as Partial<Research>
  return {
    summary: r.summary ?? '',
    audience: (r.audience ?? []).slice(0, 6),
    competitors: (r.competitors ?? []).slice(0, 8),
    positioning: r.positioning ?? '',
    names: (r.names ?? []).slice(0, 10),
    risks: (r.risks ?? []).slice(0, 6),
  }
}
