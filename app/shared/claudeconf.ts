// Providers for Claude Code: a profile changes only the endpoint, the key and the model in
// ~/.claude/settings.json and leaves everything else as it was (hooks, MCP servers, permissions, the
// person's comments and layout). The key never lands in the file: Claude Code asks the app for it
// through apiKeyHelper. The idea of switching providers by editing only those keys is cc-switch's (MIT).
import { applyEdits, findNodeAtLocation, modify, parse, parseTree, type ParseError } from 'jsonc-parser'

export type Provider = {
  id: string
  name: string
  /** empty: Anthropic's own endpoint */
  baseUrl: string
  /** the vault entry holding the key; empty: the person's Claude login */
  keyName: string
  model: string
  smallModel: string
  note?: string
}

/** The two that need nothing typed: the person's own plan, and the local Headroom proxy. */
export const BUILT_IN: Provider[] = [
  { id: 'claude', name: 'Claude (your login)', baseUrl: '', keyName: '', model: '', smallModel: '', note: 'Anthropic directly, with the plan or key Claude Code already uses.' },
  { id: 'headroom', name: 'Headroom (local proxy)', baseUrl: 'http://127.0.0.1:8787', keyName: '', model: '', smallModel: '', note: 'Through Headroom on this Mac, which compresses context before it goes to Anthropic.' },
]

/** The keys a profile owns in settings.json; nothing else is ever touched. */
export const OWNED: string[][] = [['env', 'ANTHROPIC_BASE_URL'], ['env', 'ANTHROPIC_MODEL'], ['env', 'ANTHROPIC_SMALL_FAST_MODEL'], ['apiKeyHelper']]

const FMT = { formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' } }

export function readConf(text: string): { value: Record<string, unknown>; errors: ParseError[] } {
  const errors: ParseError[] = []
  const value = (parse(text || '{}', errors, { allowTrailingComma: true }) ?? {}) as Record<string, unknown>
  return { value, errors }
}

/**
 * One key set or removed. A key new to the top level is typed in by hand after the last property, so
 * the blocks around it keep their layout (the library would reformat its neighbours); inside an
 * existing object the library's own edit is used.
 */
function setKey(text: string, path: string[], value: string | undefined): string {
  const root = parseTree(text)
  if (!root || root.type !== 'object') throw new Error('settings.json is not an object.')
  const top = findNodeAtLocation(root, [path[0]!])
  if (value === undefined) return top ? applyEdits(text, modify(text, path, undefined, {})) : text
  if (top) return applyEdits(text, modify(text, path, value, FMT))
  // a new top-level key (or a new object holding it), placed after the last property
  const body = path.length === 1 ? JSON.stringify(value) : `{\n    ${JSON.stringify(path[1])}: ${JSON.stringify(value)}\n  }`
  const last = root.children?.[root.children.length - 1]
  if (!last) return `{\n  ${JSON.stringify(path[0])}: ${body}\n}\n`
  const end = last.offset + last.length
  const rest = text.slice(end)
  const comma = /^\s*,/.exec(rest)
  const at = comma ? end + comma[0].length : end
  return `${text.slice(0, at)}${comma ? '' : ','}\n  ${JSON.stringify(path[0])}: ${body}${comma ? ',' : ''}${text.slice(at)}`
}

/** A provider written into settings.json text: only the owned keys change, comments and order stay. */
export function applyProvider(text: string, p: Provider, helper: (keyName: string) => string): string {
  if (readConf(text).errors.length) throw new Error('settings.json does not parse; fix it by hand first so nothing of yours is lost.')
  const want: [string[], string | undefined][] = [
    [['env', 'ANTHROPIC_BASE_URL'], p.baseUrl || undefined],
    [['env', 'ANTHROPIC_MODEL'], p.model || undefined],
    [['env', 'ANTHROPIC_SMALL_FAST_MODEL'], p.smallModel || undefined],
    [['apiKeyHelper'], p.keyName ? helper(p.keyName) : undefined],
  ]
  let out = text.trim() ? text : '{}\n'
  for (const [path, value] of want) out = setKey(out, path, value)
  // an env block left empty by removing ours goes too, unless it was there before with nothing in it
  const env = readConf(out).value.env
  if (env && typeof env === 'object' && !Object.keys(env).length && !(readConf(text).value.env && !Object.keys(readConf(text).value.env as object).length)) out = applyEdits(out, modify(out, ['env'], undefined, FMT))
  return out.endsWith('\n') ? out : `${out}\n`
}

/** Which profile the file matches now, by its owned keys; null when it was set by hand. */
export function activeProvider(text: string, list: Provider[], helper: (keyName: string) => string): string | null {
  const v = readConf(text).value as { env?: Record<string, string>; apiKeyHelper?: string }
  const env = v.env ?? {}
  const hit = list.find((p) => (env.ANTHROPIC_BASE_URL ?? '') === p.baseUrl && (env.ANTHROPIC_MODEL ?? '') === p.model && (env.ANTHROPIC_SMALL_FAST_MODEL ?? '') === p.smallModel && (v.apiKeyHelper ?? '') === (p.keyName ? helper(p.keyName) : ''))
  return hit?.id ?? null
}

/** A profile the person typed: an http(s) endpoint, a vault name in capitals, a model id. */
export function checkProvider(p: Partial<Provider>): string | null {
  if (!p.name?.trim()) return 'Give it a name.'
  if (p.baseUrl && !/^https:\/\/[^\s]+$|^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/[^\s]*)?$/.test(p.baseUrl)) return 'The endpoint is https://, or http:// on this machine.'
  if (p.keyName && !/^[A-Z][A-Z0-9_]{2,63}$/.test(p.keyName)) return 'The key is the name of a vault entry, like OPENROUTER_KEY.'
  if (p.baseUrl && !p.keyName && !/127\.0\.0\.1|localhost/.test(p.baseUrl)) return 'An outside endpoint needs a key from the vault.'
  for (const m of [p.model, p.smallModel]) if (m && !/^[\w./:@-]{2,80}$/.test(m)) return `"${m}" does not look like a model id.`
  return null
}

/** The lines that differ, for the preview before applying. */
export function lineDiff(before: string, after: string): { sign: ' ' | '+' | '-'; text: string }[] {
  const a = before.split('\n')
  const b = after.split('\n')
  const n = a.length
  const m = b.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
  const out: { sign: ' ' | '+' | '-'; text: string }[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) (out.push({ sign: ' ', text: a[i]! }), i++, j++)
    else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) out.push({ sign: '-', text: a[i++]! })
    else out.push({ sign: '+', text: b[j++]! })
  }
  while (i < n) out.push({ sign: '-', text: a[i++]! })
  while (j < m) out.push({ sign: '+', text: b[j++]! })
  return out
}
