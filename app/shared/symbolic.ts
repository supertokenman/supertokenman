// Phase 122: short-term compression of long tool output (idea from the layered, symbolic memory in
// Tencent's agent memory; none of its code). A long result becomes one symbolic line (what it was,
// how big, where the original is) plus a summary made by rules for its kind; the original stays on
// disk and comes back on a click. Only results as they arrive: the SDK lets a hook replace a result
// before Claude reads it, not change what is already in the conversation.

export type OutKind = 'log' | 'diff' | 'json' | 'listing'
export const MIN_CHARS = 6000
/** Tools whose exact text Claude needs later (file reads before edits) or that are already short. */
const KEEP = new Set(['Read', 'Edit', 'MultiEdit', 'Write', 'NotebookEdit', 'NotebookRead', 'TodoWrite', 'Task', 'Agent', 'ExitPlanMode', 'AskUserQuestion'])
export const eligible = (tool: string) => !KEEP.has(tool) && !/^mcp__(code|stm|mem|symbols|office)__/.test(tool)

/** The text inside a tool's result, and how to put a new text back in the same shape. */
export function textOf(r: unknown): { text: string; put: (t: string) => unknown } | null {
  if (typeof r === 'string') return { text: r, put: (t) => t }
  if (Array.isArray(r) && r.length && r.every((c) => c && typeof c === 'object' && (c as { type?: string }).type === 'text')) return { text: r.map((c) => String((c as { text?: string }).text ?? '')).join('\n'), put: (t) => [{ type: 'text', text: t }] }
  if (r && typeof r === 'object') {
    const o = r as Record<string, unknown>
    if (typeof o.stdout === 'string') return { text: `${o.stdout}${typeof o.stderr === 'string' && o.stderr ? `\n${o.stderr}` : ''}`, put: (t) => ({ ...o, stdout: t, stderr: '' }) }
    if (typeof o.content === 'string') return { text: o.content, put: (t) => ({ ...o, content: t }) }
    if (typeof o.result === 'string') return { text: o.result, put: (t) => ({ ...o, result: t }) }
  }
  return null
}

const lines = (t: string) => t.split('\n')
export function kindOf(text: string): OutKind {
  const t = text.trimStart()
  if (/^diff --git |^--- a\//m.test(t) && /^@@ /m.test(t)) return 'diff'
  if (/^[[{]/.test(t)) {
    try {
      JSON.parse(t)
      return 'json'
    } catch {
      // not JSON after all
    }
  }
  const ls = lines(t).filter((l) => l.trim())
  if (ls.length > 10 && ls.filter((l) => /^[\w./@~-][\w./@ ~+-]*(:\d+)?$/.test(l.trim()) && l.includes('/')).length / ls.length > 0.8) return 'listing'
  return 'log'
}

const uniq = <T,>(a: T[]) => [...new Set(a)]
const cut = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** A few lines that say what is in it, by rules for its kind; no model. */
export function summarize(kind: OutKind, text: string): string {
  const ls = lines(text)
  if (kind === 'diff') {
    const files: string[] = []
    let add = 0
    let del = 0
    for (const l of ls) {
      const f = /^diff --git a\/(\S+)/.exec(l)
      if (f) files.push(f[1]!)
      else if (l.startsWith('+') && !l.startsWith('+++')) add++
      else if (l.startsWith('-') && !l.startsWith('---')) del++
    }
    return `Diff of ${files.length} file${files.length === 1 ? '' : 's'}, +${add} -${del}: ${files.slice(0, 8).join(', ')}${files.length > 8 ? ', …' : ''}.`
  }
  if (kind === 'json') {
    const j = JSON.parse(text.trim()) as unknown
    const shape = (v: unknown): string => (Array.isArray(v) ? `array of ${v.length}${v.length && v[0] && typeof v[0] === 'object' ? ` objects with ${Object.keys(v[0] as object).slice(0, 8).join(', ')}` : ''}` : v && typeof v === 'object' ? `object with ${Object.keys(v).slice(0, 10).join(', ')}${Object.keys(v).length > 10 ? ', …' : ''}` : typeof v)
    const inner = j && typeof j === 'object' && !Array.isArray(j) ? Object.entries(j as object).filter(([, v]) => Array.isArray(v)).slice(0, 3).map(([k, v]) => `${k}: ${shape(v)}`) : []
    return `JSON, ${shape(j)}.${inner.length ? ` ${inner.join('; ')}.` : ''}`
  }
  if (kind === 'listing') {
    const items = ls.map((l) => l.trim()).filter(Boolean)
    const dirs = new Map<string, number>()
    for (const i of items) {
      const d = i.split('/').slice(0, 2).join('/')
      dirs.set(d, (dirs.get(d) ?? 0) + 1)
    }
    const top = [...dirs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([d, n]) => `${d} (${n})`)
    return `${items.length} paths. Most under: ${top.join(', ')}. First: ${items.slice(0, 3).join(', ')}.`
  }
  const bad = uniq(ls.filter((l) => /\b(error|err!|fail(ed|ure)?|fatal|panic|exception|traceback)\b/i.test(l)).map((l) => cut(l.trim()))).slice(0, 6)
  const warn = ls.filter((l) => /\bwarn(ing)?\b/i.test(l)).length
  const tail = ls.filter((l) => l.trim()).slice(-3).map((l) => cut(l.trim()))
  return [`${bad.length ? `Errors (${bad.length} distinct): ${bad.join(' | ')}.` : 'No error lines.'}${warn ? ` ${warn} warning line${warn === 1 ? '' : 's'}.` : ''}`, `Ends with: ${tail.join(' | ')}`].join('\n')
}

/** What it was, in a few words: the command, the pattern, the address. */
export function whatOf(tool: string, input: Record<string, unknown>): string {
  const v = input.command ?? input.pattern ?? input.url ?? input.query ?? input.path ?? ''
  return `${tool.replace(/^mcp__([^_]+)__/, '$1 · ')}${v ? ` "${cut(String(v).replace(/\s+/g, ' '), 80)}"` : ''}`
}

export type Packed = { line: string; kind: OutKind; chars: number; kept: number; savedTokens: number }
/** The symbolic line Claude gets instead of a long result, or null when it is short enough to keep. */
export function pack(tool: string, input: Record<string, unknown>, text: string, path: string, min = MIN_CHARS): Packed | null {
  if (!eligible(tool) || text.length < min) return null
  const kind = kindOf(text)
  const n = lines(text).length
  const line = `[${whatOf(tool, input)}: ${n} lines, ${(text.length / 1024).toFixed(1)} KB of ${kind} kept by the app at ${path}. Summary:\n${summarize(kind, text)}\nRead that file (or a part of it with offset and limit) when you need the exact text.]`
  return { line, kind, chars: text.length, kept: line.length, savedTokens: Math.max(0, Math.round((text.length - line.length) / 4)) }
}
