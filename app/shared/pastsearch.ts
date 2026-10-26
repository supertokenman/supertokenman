// Search across past sessions (idea from Hermes Agent), the parts with no disk: Claude Code's session
// logs read into one document per turn (what you asked and what came back), and a search box's words
// made into a safe full-text query. Each turn keeps the id of its last entry, so a panel can resume the
// conversation right there.

export type PastTurn = { n: number; uuid: string; endUuid: string; at: string; prompt: string; reply: string; tools: string[] }
export type PastSession = { sessionId: string; cwd: string; branch: string; turns: PastTurn[] }

type Entry = { type?: string; uuid?: string; isSidechain?: boolean; isMeta?: boolean; timestamp?: string; cwd?: string; gitBranch?: string; sessionId?: string; message?: { content?: unknown } }
type Block = { type?: string; text?: string; name?: string }

const textOf = (c: unknown): string => (typeof c === 'string' ? c : Array.isArray(c) ? (c as Block[]).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n') : '')
const clean = (s: string) => s.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim()

/** A session log as turns; side chains (subagents), meta lines and stopped-turn notes are left out. */
export function sessionOf(jsonl: string): PastSession {
  const s: PastSession = { sessionId: '', cwd: '', branch: '', turns: [] }
  let cur: PastTurn | null = null
  for (const raw of jsonl.split('\n')) {
    if (!raw.trim()) continue
    let e: Entry
    try {
      e = JSON.parse(raw) as Entry
    } catch {
      continue
    }
    if (e.sessionId && !s.sessionId) s.sessionId = e.sessionId
    if (e.cwd && !s.cwd) s.cwd = e.cwd
    if (e.gitBranch && e.gitBranch !== 'HEAD') s.branch = e.gitBranch
    if (e.isSidechain || !e.uuid || (e.type !== 'user' && e.type !== 'assistant')) continue
    const c = e.message?.content
    if (e.type === 'user' && !e.isMeta) {
      const prompt = clean(textOf(c))
      const isPrompt = prompt && !prompt.startsWith('<command-') && !/^\[Request interrupted/.test(prompt) && (typeof c === 'string' || (Array.isArray(c) && (c as Block[]).some((b) => b.type === 'text')))
      if (isPrompt) {
        cur = { n: s.turns.length + 1, uuid: e.uuid, endUuid: e.uuid, at: e.timestamp ?? '', prompt: prompt.slice(0, 20_000), reply: '', tools: [] }
        s.turns.push(cur)
        continue
      }
    }
    if (!cur) continue
    cur.endUuid = e.uuid
    if (e.type === 'assistant' && Array.isArray(c)) {
      const t = textOf(c)
      if (t) cur.reply = `${cur.reply}${cur.reply ? '\n' : ''}${t}`.slice(0, 40_000)
      for (const b of c as Block[]) if (b.type === 'tool_use' && b.name && !cur.tools.includes(b.name)) cur.tools.push(b.name)
    }
  }
  return s
}

/**
 * Words typed in the box, as an FTS5 query: each word a prefix match, "quoted text" a phrase, -word
 * left out; nothing in it can reach FTS5's own syntax. Empty when there is nothing to look for.
 */
export function ftsQuery(q: string): string {
  const parts: string[] = []
  const re = /(-?)"([^"]+)"|(-?)(\S+)/g
  for (const m of q.matchAll(re)) {
    const neg = m[1] || m[3]
    const raw = (m[2] ?? m[4] ?? '').replace(/"/g, '')
    const words = raw.split(/[^\p{L}\p{N}_]+/u).filter(Boolean)
    if (!words.length) continue
    const term = m[2] !== undefined || words.length > 1 ? `"${words.join(' ')}"` : `"${words[0]}"*`
    parts.push(neg ? `NOT ${term}` : term)
  }
  // a NOT cannot lead a query
  while (parts[0]?.startsWith('NOT ')) parts.shift()
  return parts.join(' ')
}

/** The shown piece of a hit, with FTS5's markers turned into ranges, so the window bolds them safely. */
export function marksOf(snippet: string, open = '\u0001', close = '\u0002'): { text: string; marks: [number, number][] } {
  let text = ''
  const marks: [number, number][] = []
  let start = -1
  for (const ch of snippet) {
    if (ch === open) start = text.length
    else if (ch === close) {
      if (start >= 0) marks.push([start, text.length])
      start = -1
    } else text += ch
  }
  return { text, marks }
}

/** Words and meaning together: reciprocal rank fusion (k = 60), so a turn high in either list rises. */
export function fuse<T extends { file: string; n: number }>(words: T[], meaning: T[], limit = 50): (T & { by: ('words' | 'meaning')[] })[] {
  const score = new Map<string, { item: T; s: number; by: ('words' | 'meaning')[] }>()
  const add = (list: T[], by: 'words' | 'meaning') =>
    list.forEach((h, i) => {
      const k = `${h.file}#${h.n}`
      const cur = score.get(k) ?? { item: h, s: 0, by: [] }
      // the words list keeps its highlighted snippets when a turn is in both
      if (by === 'words') cur.item = h
      cur.s += 1 / (60 + i + 1)
      cur.by.push(by)
      score.set(k, cur)
    })
  add(words, 'words')
  add(meaning, 'meaning')
  return [...score.values()].sort((a, b) => b.s - a.s).slice(0, limit).map((x) => ({ ...x.item, by: x.by }))
}
