// The architecture desk: decision records (ADRs) kept in docs/adr, a design review checklist whose items
// say where each idea comes from, a capacity estimate, and one design exercise a week. Checklist items and
// exercises are written in our own words; the sources are credited by link (system-design-primer is
// CC BY 4.0, the ADR format is Michael Nygard's, MADR is MIT/CC0).

export type AdrStatus = 'proposed' | 'accepted' | 'rejected' | 'deprecated' | 'superseded'
export type Adr = { n: number; file: string; title: string; status: AdrStatus; date: string; supersedes?: number; supersededBy?: number }

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
export const adrFile = (n: number, title: string) => `${String(n).padStart(4, '0')}-${slug(title) || 'decision'}.md`
export const nextNumber = (files: string[]) => Math.max(0, ...files.map((f) => Number(/^(\d{4})-/.exec(f)?.[1] ?? 0))) + 1

/** An ADR in the Nygard/MADR shape: context, decision, options, consequences. */
export function adrTemplate(n: number, title: string, date: string, opts: { context?: string; supersedes?: number } = {}): string {
  return [
    `# ${n}. ${title}`,
    '',
    `- Status: proposed`,
    `- Date: ${date}`,
    ...(opts.supersedes ? [`- Supersedes: ADR ${opts.supersedes}`] : []),
    '',
    '## Context',
    opts.context?.trim() || 'What is the situation, what forces are at play, and why does a decision have to be made now?',
    '',
    '## Options considered',
    '1. ',
    '2. ',
    '',
    '## Decision',
    'We will ...',
    '',
    '## Consequences',
    '- Good: ',
    '- Bad: ',
    '- To watch: ',
    '',
  ].join('\n')
}

/** Title, status and links of an ADR file. */
export function parseAdr(file: string, text: string): Adr {
  const n = Number(/^(\d{4})-/.exec(file)?.[1] ?? 0)
  const title = /^#\s*(?:\d+\.\s*)?(.+)$/m.exec(text)?.[1]?.trim() ?? file
  const st = (/^[-*]?\s*Status:\s*(\w+)/im.exec(text)?.[1] ?? 'proposed').toLowerCase()
  const status: AdrStatus = (['proposed', 'accepted', 'rejected', 'deprecated', 'superseded'] as const).find((s) => s === st) ?? 'proposed'
  const date = /^[-*]?\s*Date:\s*([\d-]+)/im.exec(text)?.[1] ?? ''
  const sup = /Supersedes:\s*ADR\s*(\d+)/i.exec(text)?.[1]
  const by = /Superseded by:\s*ADR\s*(\d+)/i.exec(text)?.[1]
  return { n, file, title, status, date, ...(sup ? { supersedes: Number(sup) } : {}), ...(by ? { supersededBy: Number(by) } : {}) }
}

/** The text with a new status (and the link to what replaced it). */
export function setStatus(text: string, status: AdrStatus, by?: number): string {
  let t = /^[-*]?\s*Status:.*$/im.test(text) ? text.replace(/^([-*]?\s*)Status:.*$/im, `$1Status: ${status}`) : text.replace(/^(#.*\n)/, `$1\n- Status: ${status}\n`)
  if (by) t = /Superseded by:/i.test(t) ? t.replace(/Superseded by:\s*ADR\s*\d+/i, `Superseded by: ADR ${by}`) : t.replace(/^([-*]?\s*Status:.*)$/im, `$1\n- Superseded by: ADR ${by}`)
  return t
}

export type CapacityIn = { dau: number; requestsPerUser: number; peak: number; readRatio: number; payloadKb: number; writeKb: number; years: number; replicas: number }
export type CapacityOut = { qpsAvg: number; qpsPeak: number; readQps: number; writeQps: number; egressMbps: number; storagePerYearGb: number; storageTotalGb: number }

/** Back-of-the-envelope numbers: requests per second, bandwidth, storage over the years with replicas. */
export function capacity(c: CapacityIn): CapacityOut {
  const perDay = c.dau * c.requestsPerUser
  const qpsAvg = perDay / 86_400
  const qpsPeak = qpsAvg * c.peak
  const readQps = qpsPeak * c.readRatio
  const writeQps = qpsPeak * (1 - c.readRatio)
  const egressMbps = (readQps * c.payloadKb * 8) / 1000
  const writesPerYear = perDay * (1 - c.readRatio) * 365
  const storagePerYearGb = (writesPerYear * c.writeKb) / 1_000_000
  return { qpsAvg, qpsPeak, readQps, writeQps, egressMbps, storagePerYearGb, storageTotalGb: storagePerYearGb * c.years * Math.max(1, c.replicas) }
}

const SDP = 'https://github.com/donnemartin/system-design-primer'
export type CheckItem = { area: string; ask: string; source: string; link: string }
/** The review checklist, in our words; each item names the idea it comes from and links to it. */
export const CHECKLIST: CheckItem[] = [
  { area: 'Requirements', ask: 'Are the main use cases, users and numbers (traffic, data, latency) written down before the design?', source: 'System design primer: how to approach a design', link: `${SDP}#how-to-approach-a-system-design-interview-question` },
  { area: 'Availability', ask: 'What fails if one instance, zone or dependency goes down, and what does the user see?', source: 'System design primer: availability patterns (fail-over, replication)', link: `${SDP}#availability-patterns` },
  { area: 'Consistency', ask: 'Which data must be strongly consistent, and where is eventual consistency fine?', source: 'System design primer: consistency patterns, CAP', link: `${SDP}#consistency-patterns` },
  { area: 'Data', ask: 'Is the store chosen for the access pattern (relational, key-value, document, search)? Where are the indexes?', source: 'System design primer: database (RDBMS vs NoSQL)', link: `${SDP}#database` },
  { area: 'Scaling reads', ask: 'Is there a cache in front of hot reads, with a clear invalidation rule?', source: 'System design primer: cache (cache-aside, write-through)', link: `${SDP}#cache` },
  { area: 'Scaling writes', ask: 'Will writes outgrow one database? Is there a plan for sharding or partitioning?', source: 'System design primer: sharding, federation', link: `${SDP}#sharding` },
  { area: 'Async work', ask: 'Which slow work goes to a queue, and what happens when a job fails or runs twice?', source: 'System design primer: asynchronism (message queues, back pressure)', link: `${SDP}#asynchronism` },
  { area: 'Interfaces', ask: 'Are APIs versioned, idempotent where retried, and paginated?', source: 'System design primer: communication (REST, RPC)', link: `${SDP}#communication` },
  { area: 'Security', ask: 'Where are secrets kept, what is encrypted, and what does each service get to read?', source: 'System design primer: security', link: `${SDP}#security` },
  { area: 'Operations', ask: 'What is measured (latency, errors, saturation), and who is told when it breaks?', source: 'Google SRE book: the four golden signals', link: 'https://sre.google/sre-book/monitoring-distributed-systems/' },
  { area: 'Decisions', ask: 'Is each important choice recorded as an ADR with the options that were turned down?', source: 'Michael Nygard: documenting architecture decisions', link: 'https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions' },
]

/** The review prompt for a panel: the checklist applied to this project's code, answers item by item. */
export function reviewPrompt(project: string, extra = ''): string {
  return [
    `Review the architecture of ${project} against this checklist. For each item answer: what the code does today (cite files), the risk, and one concrete change. Say "not applicable" when it is not. Do not change any file.`,
    '',
    ...CHECKLIST.map((c, i) => `${i + 1}. ${c.area}: ${c.ask}`),
    ...(extra.trim() ? ['', `Also consider: ${extra.trim()}`] : []),
    '',
    'End with the three changes that matter most, and any decision worth recording as an ADR.',
  ].join('\n')
}

export const EXERCISES = [
  'Design a URL shortener for 100M links a month: API, storage, ID generation, redirects at 10k QPS.',
  'Design rate limiting for a public API: algorithm, where it lives, what the client sees.',
  'Design a notification service that sends email, push and in-app messages with retries and user preferences.',
  'Design the feed of a social app for 10M daily users: fan-out on write or on read, and why.',
  'Design a job queue with at-least-once delivery, retries with backoff and a dead-letter queue.',
  'Design search over 50M product documents with typo tolerance and filters.',
  'Design file uploads up to 5 GB with resumable chunks, virus scanning and thumbnails.',
  'Design a metrics pipeline that ingests 1M points per second and keeps 13 months.',
  'Design multi-region read replicas for an existing Postgres app with minimal code changes.',
  'Design a feature-flag service with gradual rollouts and instant kill switches.',
  'Design an idempotent payments flow that survives retries and webhook duplicates.',
  'Design a real-time collaborative text editor for 50 people per document.',
]

/** ISO week number, so the exercise changes on Mondays. */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - y0.getTime()) / 86_400_000 + 1) / 7)
}
export const exerciseOf = (d: Date) => EXERCISES[isoWeek(d) % EXERCISES.length]!
