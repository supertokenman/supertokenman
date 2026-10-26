// Claude Code's own session logs (~/.claude/projects/<folder>/<session>.jsonl) read back: per turn,
// what was asked, which files changed and which step failed; and the tokens spent in the last five
// hours and seven days, for the plan quota when no live reading is at hand.

export type LogTurn = { at: string; prompt: string; files: string[]; failed: { tool: string; error: string }[]; tools: number; outputTokens: number }
export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number; messages: number }

type Line = {
  type?: string
  timestamp?: string
  isSidechain?: boolean
  isMeta?: boolean
  message?: { role?: string; content?: unknown; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } }
}
type Block = { type?: string; text?: string; name?: string; id?: string; input?: Record<string, unknown>; tool_use_id?: string; is_error?: boolean; content?: unknown }

const WRITES = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const textOf = (c: unknown): string => (typeof c === 'string' ? c : Array.isArray(c) ? (c as Block[]).map((b) => (b.type === 'text' ? b.text ?? '' : '')).join(' ') : '')

const lines = (jsonl: string): Line[] =>
  jsonl.split('\n').flatMap((l) => {
    try {
      return l.trim() ? [JSON.parse(l) as Line] : []
    } catch {
      return []
    }
  })

/** The session as turns: each starts at a message the person typed. */
export function turnsOf(jsonl: string): LogTurn[] {
  const out: LogTurn[] = []
  const names = new Map<string, string>()
  for (const l of lines(jsonl)) {
    if (l.isSidechain) continue
    const c = l.message?.content
    const blocks = Array.isArray(c) ? (c as Block[]) : []
    if (l.type === 'user' && !l.isMeta && (typeof c === 'string' || blocks.some((b) => b.type === 'text'))) {
      const prompt = textOf(c).replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim()
      // what Claude Code writes itself when a turn is stopped is not a prompt
      if (prompt && !prompt.startsWith('<command-') && !/^\[Request interrupted/.test(prompt)) {
        out.push({ at: l.timestamp ?? '', prompt: prompt.slice(0, 300), files: [], failed: [], tools: 0, outputTokens: 0 })
        continue
      }
    }
    const t = out[out.length - 1]
    if (!t) continue
    if (l.type === 'assistant') {
      t.outputTokens += l.message?.usage?.output_tokens ?? 0
      for (const b of blocks.filter((x) => x.type === 'tool_use')) {
        t.tools++
        if (b.id) names.set(b.id, b.name ?? '')
        const f = (b.input?.file_path ?? b.input?.notebook_path) as string | undefined
        if (b.name && WRITES.has(b.name) && f && !t.files.includes(f)) t.files.push(f)
      }
    } else if (l.type === 'user') {
      for (const b of blocks.filter((x) => x.type === 'tool_result' && x.is_error)) t.failed.push({ tool: names.get(b.tool_use_id ?? '') ?? 'tool', error: textOf(b.content).split('\n')[0]!.slice(0, 200) || (typeof b.content === 'string' ? b.content.slice(0, 200) : '') })
    }
  }
  return out
}

/** Tokens spent since `since`, from the assistant messages' usage. */
export function usageSince(jsonl: string, since: number): Usage {
  const u: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, messages: 0 }
  for (const l of lines(jsonl)) {
    if (l.type !== 'assistant' || !l.message?.usage || !l.timestamp || Date.parse(l.timestamp) < since) continue
    const x = l.message.usage
    u.input += x.input_tokens ?? 0
    u.output += x.output_tokens ?? 0
    u.cacheRead += x.cache_read_input_tokens ?? 0
    u.cacheWrite += x.cache_creation_input_tokens ?? 0
    u.messages++
  }
  return u
}

export const addUsage = (a: Usage, b: Usage): Usage => ({ input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite, messages: a.messages + b.messages })

/** Claude Code's folder name for a project: the path with every non-alphanumeric character as "-". */
export const projectFolder = (cwd: string) => cwd.replace(/[^A-Za-z0-9]/g, '-')

/** The tray's words: the live percentage when there is one, else the tokens the logs show. */
export function trayTitle(live: { kind: string; percentUsed: number }[] | null, five: Usage): string {
  const w = live?.find((x) => /five|5/.test(x.kind)) ?? live?.[0]
  if (w) return `${Math.round(w.percentUsed)}%`
  const k = five.output + five.input
  return k ? `${k >= 1e6 ? `${(k / 1e6).toFixed(1)}M` : `${Math.round(k / 1000)}k`} tok` : ''
}
