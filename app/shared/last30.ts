// "Last 30 days": what people posted about a topic, or by a public handle, in the last N days, from
// sources ranked by their own engagement (upvotes, views, points, stars). The parsers and the ranking
// live here with no network; electron/last30.ts does the fetching. Idea from mvanhorn/last30days-skill.

export type BriefSource = 'reddit' | 'youtube' | 'hn' | 'github'
export type BriefItem = { source: BriefSource; url: string; title: string; author?: string; date: string; engagement: number; /** what the number counts, for the list */ measure: string; where?: string }
export type BriefQuery = { kind: 'topic'; text: string } | { kind: 'person'; handle: string }

export const SOURCE_LABEL: Record<BriefSource, string> = { reddit: 'Reddit', youtube: 'YouTube', hn: 'Hacker News', github: 'GitHub' }

/** "@name" or "u/name" is a public handle; anything else is a topic. */
export function parseQuery(input: string): BriefQuery | null {
  const t = input.trim()
  const h = /^(?:@|u\/)([\w.-]{2,40})$/.exec(t)
  if (h) return { kind: 'person', handle: h[1]! }
  return t.length >= 3 ? { kind: 'topic', text: t } : null
}

/** Reddit's time window for a number of days: the smallest one that covers it. */
export const redditWindow = (days: number) => (days <= 1 ? 'day' : days <= 7 ? 'week' : days <= 31 ? 'month' : 'year')

const iso = (secs?: number) => (secs ? new Date(secs * 1000).toISOString() : '')

/** Listing of /search from oauth.reddit.com: score plus comments is the engagement. */
export function parseReddit(j: unknown): BriefItem[] {
  const kids = (j as { data?: { children?: { data?: Record<string, unknown> }[] } })?.data?.children ?? []
  return kids.flatMap((k) => {
    const d = k.data ?? {}
    if (!d.permalink || d.over_18) return []
    const score = Number(d.score ?? 0)
    const comments = Number(d.num_comments ?? 0)
    return [{ source: 'reddit' as const, url: `https://www.reddit.com${String(d.permalink)}`, title: String(d.title ?? ''), author: d.author ? String(d.author) : undefined, date: iso(Number(d.created_utc)), engagement: score + comments, measure: `${score} upvotes, ${comments} comments`, where: d.subreddit_name_prefixed ? String(d.subreddit_name_prefixed) : undefined }]
  })
}

/** YouTube Data API v3: /search gives the ids, /videos the counts; views plus 10 per like and comment. */
export function parseYoutube(search: unknown, videos: unknown): BriefItem[] {
  const stats = new Map<string, { viewCount?: string; likeCount?: string; commentCount?: string }>()
  for (const v of (videos as { items?: { id: string; statistics?: Record<string, string> }[] })?.items ?? []) stats.set(v.id, v.statistics ?? {})
  return ((search as { items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; publishedAt?: string } }[] })?.items ?? []).flatMap((s) => {
    const id = s.id?.videoId
    if (!id) return []
    const st = stats.get(id) ?? {}
    const views = Number(st.viewCount ?? 0)
    const likes = Number(st.likeCount ?? 0)
    const comments = Number(st.commentCount ?? 0)
    return [{ source: 'youtube' as const, url: `https://www.youtube.com/watch?v=${id}`, title: decodeHtml(s.snippet?.title ?? ''), author: s.snippet?.channelTitle, date: s.snippet?.publishedAt ?? '', engagement: views + 10 * (likes + comments), measure: `${views.toLocaleString('en-US')} views, ${likes} likes`, where: s.snippet?.channelTitle }]
  })
}

/** Hacker News through Algolia: points plus comments. */
export function parseHn(j: unknown): BriefItem[] {
  return ((j as { hits?: { objectID: string; title?: string; author?: string; points?: number; num_comments?: number; created_at?: string }[] })?.hits ?? []).map((h) => ({ source: 'hn' as const, url: `https://news.ycombinator.com/item?id=${h.objectID}`, title: h.title ?? '', author: h.author, date: h.created_at ?? '', engagement: (h.points ?? 0) + (h.num_comments ?? 0), measure: `${h.points ?? 0} points, ${h.num_comments ?? 0} comments` }))
}

/** GitHub repositories created in the window: stars. */
export function parseGithub(j: unknown): BriefItem[] {
  return ((j as { items?: { full_name: string; html_url: string; description?: string; stargazers_count?: number; created_at?: string; owner?: { login?: string } }[] })?.items ?? []).map((x) => ({ source: 'github' as const, url: x.html_url, title: `${x.full_name}${x.description ? `: ${x.description}` : ''}`, author: x.owner?.login, date: x.created_at ?? '', engagement: x.stargazers_count ?? 0, measure: `${x.stargazers_count ?? 0} stars` }))
}

const decodeHtml = (s: string) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')

/** One address per story: no tracking parameters, no trailing slash, no "www.", no fragment. */
export function normUrl(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|ref$|ref_src$|si$|feature$)/.test(k)) u.searchParams.delete(k)
    return `${u.host.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}${u.search}`.toLowerCase()
  } catch {
    return url.trim().toLowerCase()
  }
}

/**
 * Inside the window, one per address (the more engaged copy wins), then by engagement. Each source
 * counts differently (a view is not an upvote), so items rank by their share of their source's top
 * number first, with the raw number breaking ties.
 */
export function rank(items: BriefItem[], days: number, now = Date.now()): BriefItem[] {
  const from = now - days * 86_400_000
  const inside = items.filter((i) => {
    const t = Date.parse(i.date)
    return !Number.isNaN(t) && t >= from && t <= now + 3_600_000
  })
  const byUrl = new Map<string, BriefItem>()
  for (const i of inside) {
    const k = normUrl(i.url)
    const had = byUrl.get(k)
    if (!had || i.engagement > had.engagement) byUrl.set(k, i)
  }
  const kept = [...byUrl.values()]
  const top = new Map<BriefSource, number>()
  for (const i of kept) top.set(i.source, Math.max(top.get(i.source) ?? 0, i.engagement))
  const share = (i: BriefItem) => i.engagement / Math.max(1, top.get(i.source) ?? 1)
  return kept.sort((a, b) => share(b) - share(a) || b.engagement - a.engagement)
}

/** The prompt for the brief: numbered items, one Claude call, every claim cites [n]. */
export function briefPrompt(q: BriefQuery, days: number, items: BriefItem[]): string {
  const about = q.kind === 'topic' ? `the topic "${q.text}"` : `what the public account "${q.handle}" posted`
  const list = items.map((i, n) => `[${n + 1}] ${SOURCE_LABEL[i.source]}${i.where ? ` (${i.where})` : ''}, ${i.date.slice(0, 10)}, ${i.measure}: ${i.title}`).join('\n')
  return `Write a short brief (at most 8 bullet points, then one line "What to watch") about ${about} in the last ${days} days, from these posts ranked by engagement. Say what people discussed, what got the most attention and any disagreement. Cite each point with the [n] of its posts. Use only what the list says; do not guess at what a link contains. Plain English, no emoji.\n\n${list}`
}

/** The brief with its links, as Markdown, for Copy and for Content. */
export function briefMarkdown(title: string, days: number, brief: string, items: BriefItem[]): string {
  return `# ${title}: last ${days} days\n\n${brief.trim()}\n\n## Links\n${items.map((i, n) => `${n + 1}. [${i.title}](${i.url}) (${SOURCE_LABEL[i.source]}, ${i.measure})`).join('\n')}\n`
}
