// The policy gate's decision: which rules match one tool call, and what the final decision is once the
// existing approval result (decide in electron/main.ts) is combined with them. Pure: no fs, no electron.
//
// Order: deny rules, then ask rules, then allow rules (an allow only where the existing result is ask or
// allow). No match leaves the existing result as it is. Strictness: deny > ask > allow.
//
// Fail closed: a Bash command that cannot be resolved (command substitution, variables, eval) and a call
// without a path both count as matching a path condition for deny and ask rules, and never for allow.

import type { Cond, Effect, Rule, Value } from './policyrules.js'

export type Decision = 'allow' | 'ask' | 'deny'
export type ScopedRule = { scope: 'global' | 'project'; rule: Rule }
export type Ctx = { project: string; home: string; cwd: string }
export type Call = { tool: string; input: Record<string, unknown> }
export type Verdict = {
  decision: Decision
  by: 'rule' | 'app'
  /** `global:12 note` or `project:3 note`, when a rule decided */
  rule?: string
  /** true when an explicit allow rule turned an existing ask into allow */
  explicit: boolean
}

export const RANK: Record<Decision, number> = { allow: 0, ask: 1, deny: 2 }

/** The stricter of two decisions. Never loosens: the only way to loosen is an explicit allow rule (see evaluate). */
export function strictest(a: Decision, b: Decision): Decision {
  return RANK[a] >= RANK[b] ? a : b
}

const READ = new Set(['Read', 'Grep', 'Glob', 'NotebookRead', 'LS'])
const WRITE = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const NETWORK_TOOLS = new Set(['WebFetch', 'WebSearch'])
const NET_CMD = /(^|[\s;&|(`'"])(curl|wget|ssh|scp|sftp|rsync|nc|ncat|telnet|ftp)(?=\s|$)/
const GIT_NET = /(^|[\s;&|(])git\s+(push|pull|fetch|clone|ls-remote)\b/
const PKG_NET = /(^|[\s;&|(])(npm|pnpm|yarn|bun|pip3?|pipx|uv|cargo|gem|go|brew|composer)\s+(install|i|add|publish|update|upgrade|get)\b/
const UNRESOLVED = /\$\(|`|\$\{|\$[A-Za-z_]|(^|[\s;&|(])eval(?=\s|$)/
const URL_HOST = /\b[a-z][a-z0-9+.-]*:\/\/(?:[^@\s/'"]*@)?([^\s/:'"?#]+)/i

type Tri = 'yes' | 'no' | 'unknown'
type Fields = {
  cmd?: string
  paths: string[]
  unresolved: boolean
  branch?: string
  host?: string
  input: Record<string, unknown>
}

const esc = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')

/** A glob: `*` matches anything; in a path `*` stops at `/` and `**` crosses it. */
export function globRe(glob: string, inPath: boolean): RegExp {
  let out = ''
  for (let i = 0; i < glob.length; i++) {
    if (glob[i] === '*') {
      if (glob[i + 1] === '*') { out += '.*'; i++ } else out += inPath ? '[^/]*' : '.*'
    } else out += esc(glob[i]!)
  }
  return new RegExp(`^${out}$`, 's')
}

/** `p` made absolute against `cwd` (and `~` against `home`), with `.` and `..` folded. */
export function absPath(p: string, cwd: string, home: string): string {
  let full = p === '~' || p.startsWith('~/') ? `${home}${p.slice(1)}` : p.startsWith('/') ? p : `${cwd}/${p}`
  const out: string[] = []
  for (const seg of full.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return `/${out.join('/')}`
}

const strOf = (v: unknown): string | undefined => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : undefined)

/** Whether a Bash command reaches the network: curl, ssh, git push and friends, package installs. */
export function isNetworkCommand(cmd: string): boolean {
  return NET_CMD.test(cmd) || GIT_NET.test(cmd) || PKG_NET.test(cmd)
}

function pathTokens(cmd: string): string[] {
  const out: string[] = []
  for (const raw of cmd.split(/[\s;&|<>()]+/)) {
    const t = raw.replace(/["'`]/g, '')
    if (!t || t.startsWith('-') || t.includes('://') || t === '/dev/null') continue
    if (t.includes('/') || t.startsWith('~') || t === '.' || t === '..') out.push(t)
  }
  return out
}

function gitPushBranch(cmd: string): string | undefined {
  const m = /\bgit\s+push\b([^;&|\n]*)/.exec(cmd)
  if (!m) return undefined
  const args = m[1]!.trim().split(/\s+/).filter((t) => t && !t.startsWith('-'))
  const refspec = args[1]
  if (!refspec) return undefined
  const dst = refspec.replace(/^\+/, '').split(':').pop()
  return dst || undefined
}

/** What the rules can see of one call. Unknown values stay undefined or unresolved, which fails closed. */
export function resolveFields(call: Call, ctx: Ctx): Fields {
  const input = call.input ?? {}
  const str = (k: string) => strOf(input[k])
  if (call.tool === 'Bash') {
    const cmd = str('command')
    if (cmd === undefined) return { paths: [], unresolved: true, input }
    const host = URL_HOST.exec(cmd)?.[1]?.toLowerCase()
    return {
      cmd,
      paths: pathTokens(cmd).map((p) => absPath(p, ctx.cwd, ctx.home)),
      unresolved: UNRESOLVED.test(cmd),
      branch: gitPushBranch(cmd),
      host,
      input,
    }
  }
  if (READ.has(call.tool)) {
    const p = str('file_path') ?? str('notebook_path') ?? str('path')
    return { paths: [absPath(p ?? '.', ctx.cwd, ctx.home)], unresolved: false, input }
  }
  if (WRITE.has(call.tool)) {
    const p = str('file_path') ?? str('notebook_path') ?? str('path')
    return p === undefined ? { paths: [], unresolved: true, input } : { paths: [absPath(p, ctx.cwd, ctx.home)], unresolved: false, input }
  }
  const url = str('url')
  const p = str('file_path') ?? str('path')
  return {
    paths: p === undefined ? [] : [absPath(p, ctx.cwd, ctx.home)],
    unresolved: false,
    host: url ? URL_HOST.exec(url)?.[1]?.toLowerCase() : undefined,
    input,
  }
}

/** Whether the rule's tool pattern covers this call. `read`, `write` and `network` are classes. */
export function toolMatches(pattern: string, call: Call, fields: Fields): boolean {
  if (pattern === '*') return true
  if (pattern === 'read') return READ.has(call.tool)
  if (pattern === 'write') return WRITE.has(call.tool)
  if (pattern === 'network') {
    return NETWORK_TOOLS.has(call.tool) || (call.tool === 'Bash' && fields.cmd !== undefined && isNetworkCommand(fields.cmd))
  }
  return globRe(pattern, false).test(call.tool)
}

const valueOf = (v: Value, ctx: Ctx): string => {
  if (!v.quoted && v.text === '$project') return absPath(ctx.project, '/', ctx.home)
  if (!v.quoted && v.text === '$home') return absPath(ctx.home, '/', ctx.home)
  return v.text
}

/** One condition on a call. `some` (deny, ask) or `every` (allow) decides how many paths must agree. */
function evalCond(c: Cond, f: Fields, ctx: Ctx, quant: 'some' | 'every'): Tri {
  const v = valueOf(c.value, ctx)
  if (c.field === 'path') {
    if (f.unresolved) return 'unknown'
    if (f.paths.length === 0) return 'no'
    const hit = (p: string) => {
      switch (c.op) {
        case 'is': return p === v
        case 'matches': return globRe(v, true).test(p)
        case 'has': return p.includes(v)
        case 'inside': return p === absPath(v, '/', ctx.home) || p.startsWith(`${absPath(v, '/', ctx.home).replace(/\/$/, '')}/`)
        case 'outside': return !(p === absPath(v, '/', ctx.home) || p.startsWith(`${absPath(v, '/', ctx.home).replace(/\/$/, '')}/`))
      }
    }
    const ok = quant === 'some' ? f.paths.some(hit) : f.paths.every(hit)
    return ok ? 'yes' : 'no'
  }
  let x: string | undefined
  if (c.field === 'cmd') x = f.cmd
  else if (c.field === 'branch') x = f.branch
  else if (c.field === 'host') x = f.host
  else x = strOf(f.input[c.field.slice(4)])
  if (x === undefined) return c.field.startsWith('arg.') ? 'no' : 'unknown'
  if (c.op === 'inside' || c.op === 'outside') return 'no'
  const r = c.op === 'is' ? x === v : c.op === 'has' ? x.includes(v) : globRe(v, false).test(x)
  return r ? 'yes' : 'no'
}

/** Whether a rule applies to a call. Unknowns resolve toward the stricter answer. */
export function ruleApplies(rule: Rule, call: Call, ctx: Ctx, fields = resolveFields(call, ctx)): boolean {
  if (!toolMatches(rule.tool, call, fields)) return false
  const failClosed = rule.effect !== 'allow'
  const quant = failClosed ? 'some' : 'every'
  const whenOk = rule.when.every((c) => {
    const r = evalCond(c, fields, ctx, quant)
    return r === 'unknown' ? failClosed : r === 'yes'
  })
  if (!whenOk) return false
  const excluded = rule.unless.some((c) => {
    const r = evalCond(c, fields, ctx, quant)
    return r === 'unknown' ? !failClosed : r === 'yes'
  })
  return !excluded
}

const label = (s: ScopedRule) => `${s.scope}:${s.rule.line}${s.rule.note ? ` ${s.rule.note}` : ''}`

/**
 * The final decision for one call. `existing` is the result of the app's own decide (hard denies,
 * autonomy, command risk). Rules can only tighten it, except an explicit allow that turns an ask into allow.
 */
export function evaluate(rules: ScopedRule[], call: Call, ctx: Ctx, existing: Decision): Verdict {
  const fields = resolveFields(call, ctx)
  const hits = rules.filter((s) => ruleApplies(s.rule, call, ctx, fields))
  const pick = (effect: Effect) => hits.find((s) => s.rule.effect === effect)
  const deny = pick('deny')
  if (deny) return { decision: 'deny', by: 'rule', rule: label(deny), explicit: false }
  const ask = pick('ask')
  if (ask) return { decision: strictest('ask', existing), by: existing === 'deny' ? 'app' : 'rule', rule: label(ask), explicit: false }
  const allow = pick('allow')
  if (allow) {
    if (existing === 'deny') return { decision: 'deny', by: 'app', explicit: false }
    return { decision: 'allow', by: 'rule', rule: label(allow), explicit: true }
  }
  return { decision: existing, by: 'app', explicit: false }
}
