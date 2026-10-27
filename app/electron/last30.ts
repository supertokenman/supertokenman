// "Last 30 days" brief: the fetching. Official APIs only, each on the person's own credentials where
// the API asks for them: Reddit with an app-only token from their own Reddit app, YouTube Data API v3
// with their own key, Hacker News (Algolia) and GitHub search with none. Nothing runs until they ask.
import { briefPrompt, parseGithub, parseHn, parseReddit, parseYoutube, rank, redditWindow, type BriefItem, type BriefQuery, type BriefSource } from '../shared/last30.js'
import { guard } from '../shared/research.js'
import { GH_API, HN_API } from './research.js'

export const REDDIT_AUTH = process.env.STM_REDDIT_AUTH ?? 'https://www.reddit.com/api/v1/access_token'
export const REDDIT_API = process.env.STM_REDDIT_API ?? 'https://oauth.reddit.com'
export const YT_API = process.env.STM_YT_API ?? 'https://www.googleapis.com/youtube/v3'
const UA = 'desktop:supertokenman:v1 (last 30 days brief)'

export type Creds = { redditId?: string; redditSecret?: string; youtubeKey?: string }
export type SourceState = { source: BriefSource; found: number; skipped?: string; error?: string }
export type BriefResult = { items: BriefItem[]; states: SourceState[]; brief: string; tokens: number } | { stopped: string; states: SourceState[]; items: BriefItem[] }

const since = (days: number, now: number) => new Date(now - days * 86_400_000).toISOString()

export async function redditItems(q: BriefQuery, days: number, c: Creds, f: typeof fetch): Promise<BriefItem[]> {
  const tr = await f(REDDIT_AUTH, { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${c.redditId}:${c.redditSecret}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA }, body: 'grant_type=client_credentials', signal: AbortSignal.timeout(15_000) })
  if (!tr.ok) throw new Error(`Reddit sign-in answered ${tr.status}${tr.status === 401 ? ' (check the client id and secret)' : ''}`)
  const token = ((await tr.json()) as { access_token?: string }).access_token
  if (!token) throw new Error('Reddit gave no token.')
  const term = q.kind === 'topic' ? q.text : `author:${q.handle}`
  const r = await f(`${REDDIT_API}/search?limit=40&sort=top&t=${redditWindow(days)}&raw_json=1&q=${encodeURIComponent(term)}`, { headers: { authorization: `Bearer ${token}`, 'user-agent': UA }, signal: AbortSignal.timeout(15_000) })
  if (!r.ok) throw new Error(`Reddit answered ${r.status}`)
  return parseReddit(await r.json())
}

export async function youtubeItems(q: BriefQuery, days: number, key: string, f: typeof fetch, now = Date.now()): Promise<BriefItem[]> {
  const term = q.kind === 'topic' ? q.text : q.handle
  const s = await f(`${YT_API}/search?part=snippet&type=video&order=viewCount&maxResults=25&publishedAfter=${encodeURIComponent(since(days, now))}&q=${encodeURIComponent(term)}&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(15_000) })
  const sj = (await s.json()) as { items?: { id?: { videoId?: string } }[]; error?: { message?: string } }
  if (!s.ok) throw new Error(`YouTube API: ${sj.error?.message ?? s.status}`)
  const ids = (sj.items ?? []).map((i) => i.id?.videoId).filter(Boolean)
  if (!ids.length) return []
  const v = await f(`${YT_API}/videos?part=statistics&id=${ids.join(',')}&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(15_000) })
  if (!v.ok) throw new Error(`YouTube API answered ${v.status}`)
  return parseYoutube(sj, await v.json())
}

export async function hnRecent(q: BriefQuery, days: number, f: typeof fetch, now = Date.now()): Promise<BriefItem[]> {
  const after = Math.floor((now - days * 86_400_000) / 1000)
  const tags = q.kind === 'topic' ? 'story' : `story,author_${q.handle}`
  const query = q.kind === 'topic' ? `&query=${encodeURIComponent(q.text)}` : ''
  const r = await f(`${HN_API}/search?tags=${tags}&hitsPerPage=40&numericFilters=${encodeURIComponent(`created_at_i>${after}`)}${query}`)
  if (!r.ok) throw new Error(`Hacker News answered ${r.status}`)
  return parseHn(await r.json())
}

export async function githubRecent(q: BriefQuery, days: number, f: typeof fetch, now = Date.now()): Promise<BriefItem[]> {
  const term = `${q.kind === 'topic' ? q.text : `user:${q.handle}`} created:>=${since(days, now).slice(0, 10)}`
  const r = await f(`${GH_API}/search/repositories?per_page=30&sort=stars&order=desc&q=${encodeURIComponent(term)}`, { headers: { accept: 'application/vnd.github+json' } })
  if (!r.ok) throw new Error(`GitHub answered ${r.status}${r.status === 403 ? ' (rate limit; try again in a minute)' : ''}`)
  return parseGithub(await r.json())
}

export type BriefDeps = { fetch: typeof fetch; creds: Creds; ask: (prompt: string) => Promise<string>; allow: (tokens: number) => string | null; now?: number }

/** All chosen sources at once; a source without credentials is skipped and says how to connect it. */
export async function gather(q: BriefQuery, days: number, sources: BriefSource[], d: BriefDeps): Promise<{ items: BriefItem[]; states: SourceState[] }> {
  const now = d.now ?? Date.now()
  const states = await Promise.all(
    sources.map(async (source): Promise<SourceState & { items: BriefItem[] }> => {
      if (source === 'reddit' && !(d.creds.redditId && d.creds.redditSecret)) return { source, found: 0, skipped: 'Connect Reddit', items: [] }
      if (source === 'youtube' && !d.creds.youtubeKey) return { source, found: 0, skipped: 'Add a YouTube API key', items: [] }
      try {
        const items = source === 'reddit' ? await redditItems(q, days, d.creds, d.fetch) : source === 'youtube' ? await youtubeItems(q, days, d.creds.youtubeKey!, d.fetch, now) : source === 'hn' ? await hnRecent(q, days, d.fetch, now) : await githubRecent(q, days, d.fetch, now)
        return { source, found: items.length, items }
      } catch (e) {
        return { source, found: 0, error: (e as Error).message, items: [] }
      }
    }),
  )
  return { items: rank(states.flatMap((s) => s.items), days, now), states: states.map(({ items: _i, ...s }) => s) }
}

/** Gather, rank, keep the top 25, then one Claude call writes the brief, behind the budget brake. */
export async function lastDays(input: { query: BriefQuery; days: number; sources: BriefSource[] }, d: BriefDeps): Promise<BriefResult> {
  const text = input.query.kind === 'topic' ? input.query.text : input.query.handle
  const bad = input.query.kind === 'topic' ? guard(text) : null
  if (bad) return { stopped: bad, states: [], items: [] }
  const days = Math.max(1, Math.min(365, Math.round(input.days) || 30))
  const { items, states } = await gather(input.query, days, input.sources, d)
  const top = items.slice(0, 25)
  if (!top.length) return { stopped: `Nothing posted in the last ${days} days on the sources that answered.`, states, items: [] }
  const prompt = briefPrompt(input.query, days, top)
  const tokens = Math.ceil(prompt.length / 4) + 600
  const brake = d.allow(tokens)
  if (brake) return { stopped: brake, states, items: top }
  return { items: top, states, brief: (await d.ask(prompt)).trim(), tokens }
}
