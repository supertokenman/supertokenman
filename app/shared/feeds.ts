// Feeds and briefings, the parts with no network: OPML in and out, rules applied as items arrive
// (hide, star, summarize, notify), video entries kept as title, channel and link only, a digest prompt
// with numbered sources, and when a scheduled briefing is due. The idea of rules on arrival and
// newsletters in the reader is Folo's (AGPL-3.0); no code is taken from it.

export type FeedItem = { id: string; feed: string; source: string; title: string; link: string; date: string; summary: string; image?: string; video?: boolean; starred?: boolean; aiSummary?: string; newsletter?: boolean }
export type Feed = { url: string; title: string }

export type RuleAction = 'hide' | 'star' | 'summarize' | 'notify'
export type FeedRule = { id: string; words: string; field: 'any' | 'title' | 'source'; action: RuleAction }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

/** Feeds from an OPML file: every outline with an xmlUrl, nested folders included, each address once. */
export function parseOpml(xml: string): Feed[] {
  const out: Feed[] = []
  for (const m of xml.matchAll(/<outline\b[^>]*>/gi)) {
    const tag = m[0]
    const url = /xmlUrl="([^"]+)"/i.exec(tag)?.[1]
    if (!url || !/^https?:\/\//i.test(unesc(url))) continue
    const title = /title="([^"]*)"/i.exec(tag)?.[1] ?? /text="([^"]*)"/i.exec(tag)?.[1] ?? url
    if (!out.some((f) => f.url === unesc(url))) out.push({ url: unesc(url), title: unesc(title) })
  }
  return out
}

export const toOpml = (feeds: Feed[], title = 'SuperTokenMan feeds') =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>${esc(title)}</title></head>\n  <body>\n${feeds.map((f) => `    <outline type="rss" text="${esc(f.title)}" title="${esc(f.title)}" xmlUrl="${esc(f.url)}"/>`).join('\n')}\n  </body>\n</opml>\n`

/** A YouTube or Vimeo entry: kept as title, channel and link; nothing is downloaded or embedded. */
export const isVideo = (i: Pick<FeedItem, 'link' | 'feed'>) => /youtube\.com\/(watch|shorts|feeds\/videos)|youtu\.be\/|vimeo\.com\/\d/.test(`${i.link} ${i.feed}`)

const matches = (r: FeedRule, i: FeedItem) => {
  const words = r.words.toLowerCase().split(/\s+/).filter(Boolean)
  const hay = (r.field === 'title' ? i.title : r.field === 'source' ? i.source : `${i.title} ${i.source} ${i.summary}`).toLowerCase()
  return words.length > 0 && words.every((w) => hay.includes(w))
}

export type Applied = { items: FeedItem[]; hidden: number; toSummarize: string[]; toNotify: string[] }

/** The rules on a batch: hidden items go, starred ones are marked, and the ones to summarize or notify are named. */
export function applyRules(items: FeedItem[], rules: FeedRule[]): Applied {
  const out: FeedItem[] = []
  const toSummarize: string[] = []
  const toNotify: string[] = []
  let hidden = 0
  for (const raw of items) {
    const i = { ...raw, video: raw.video ?? isVideo(raw) }
    // a video keeps no picture of its own: the reader shows title, channel and link
    if (i.video) delete i.image
    const hit = rules.filter((r) => matches(r, i))
    if (hit.some((r) => r.action === 'hide')) {
      hidden++
      continue
    }
    if (hit.some((r) => r.action === 'star')) i.starred = true
    if (hit.some((r) => r.action === 'summarize')) toSummarize.push(i.id)
    if (hit.some((r) => r.action === 'notify')) toNotify.push(i.id)
    out.push(i)
  }
  return { items: out, hidden, toSummarize, toNotify }
}

export function checkFeedRule(r: Partial<FeedRule>): string | null {
  if (!r.words?.trim()) return 'Say which words the rule looks for.'
  if (!['hide', 'star', 'summarize', 'notify'].includes(String(r.action))) return 'Pick what the rule does.'
  return null
}

export const summaryPrompt = (i: Pick<FeedItem, 'title' | 'source' | 'summary'>, body: string) =>
  `Summarize this article in two sentences for a busy reader. Plain words, no hype, no "this article". Same language as the article.\n\nTitle: ${i.title} (${i.source})\n\n${(body || i.summary).slice(0, 6000)}`

/** The digest prompt: the unread items numbered so every point can name its source as [n]. */
export function digestPrompt(items: FeedItem[], max = 30): { prompt: string; used: FeedItem[] } {
  const used = [...items].sort((a, b) => Number(Boolean(b.starred)) - Number(Boolean(a.starred)) || b.date.localeCompare(a.date)).slice(0, max)
  const prompt = [
    'Write a short briefing of what is new, grouped by theme. Each point is one or two sentences and ends with its source as [n]. Starred items first. Skip duplicates. No intro and no closing line.',
    '',
    ...used.map((i, k) => `[${k + 1}] ${i.title} (${i.source}${i.video ? ', video' : ''}${i.starred ? ', starred' : ''}): ${(i.aiSummary || i.summary).slice(0, 300)}`),
  ].join('\n')
  return { prompt, used }
}

export const sourcesList = (used: FeedItem[]) => used.map((i, k) => `${k + 1}. ${i.title} (${i.source}) ${i.link}`).join('\n')

export type Schedule = { on: boolean; every: 'daily' | 'weekly'; day: number; time: string; lastAt?: number }
export const DEFAULT_SCHEDULE: Schedule = { on: false, every: 'daily', day: 1, time: '07:30' }

/** Whether a briefing is due: today's (or this week's) time has passed and none was made since. */
export function briefingDue(s: Schedule, now: Date): boolean {
  if (!s.on) return false
  const [h, m] = s.time.split(':').map(Number)
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h ?? 7, m ?? 0)
  if (s.every === 'weekly') at.setDate(at.getDate() - ((at.getDay() - s.day + 7) % 7))
  return now >= at && (s.lastAt ?? 0) < at.getTime()
}

/** Mail from a newsletter sender, as a feed item for the reader. */
export function newsletterItem(m: { id: string; subject: string; from: { name: string; address: string } | null; at: string; preview: string }, account: string): FeedItem {
  return { id: `nl-${account}-${m.id}`, feed: `mail:${account}`, source: m.from?.name || m.from?.address || 'Newsletter', title: m.subject || '(no subject)', link: '', date: m.at, summary: m.preview, newsletter: true }
}

/** Two letters for a feed's tile: the first of two words, or the first two of one (Hacker News is HN). */
export function monogram(title: string): string {
  const words = title.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  const two = words.length > 1 ? words[0]![0]! + words[1]![0]! : words[0]!.slice(0, 2)
  return two.toUpperCase()
}
