// Import a skill from a URL as a draft: the text is fetched, read for instructions aimed at the model,
// for dangerous commands and for reaching out with secrets, and shown with the source's license. It goes
// in only after the person approves it, through the same draft flow as skills from experience. It is
// never updated by itself later.
import { riskOf } from './cmdrisk.js'
import { scanInjection } from './injection.js'
import type { SkillDraft } from './skilldraft.js'

export type ImportFinding = { kind: 'injection' | 'command' | 'secrets' | 'network' | 'size'; level: 'block' | 'warn'; text: string; line?: number }
export type SkillSource = { url: string; raw: string; repo?: string; license: string | null; findings: ImportFinding[]; fetchedAt: number }

/** The raw text URL for a link a person pastes: GitHub page links become raw links to SKILL.md. */
export function rawUrlOf(url: string): { raw: string; repo?: string } {
  const u = url.trim()
  if (!/^https:\/\//.test(u)) throw new Error('Paste an https link.')
  const blob = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/blob\/([^/]+)\/(.+)$/.exec(u)
  if (blob) return { raw: `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/${blob[3]}/${blob[4]}`, repo: `${blob[1]}/${blob[2]}` }
  const tree = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/tree\/([^/]+)\/(.+?)\/?$/.exec(u)
  if (tree) return { raw: `https://raw.githubusercontent.com/${tree[1]}/${tree[2]}/${tree[3]}/${tree[4]}/SKILL.md`, repo: `${tree[1]}/${tree[2]}` }
  const raw = /^https:\/\/raw\.githubusercontent\.com\/([\w.-]+)\/([\w.-]+)\//.exec(u)
  return { raw: u, ...(raw ? { repo: `${raw[1]}/${raw[2]}` } : {}) }
}

/** SKILL.md split into its front matter (name, description) and body. */
export function parseSkillMd(text: string, fallbackName = 'imported-skill'): SkillDraft {
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, '\n'))
  const fm = m?.[1] ?? ''
  const field = (k: string) => new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(fm)?.[1]?.trim().replace(/^["']|["']$/g, '')
  const name = (field('name') ?? fallbackName).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || fallbackName
  return { name, description: field('description') ?? '', body: (m ? m[2]! : text).trim() }
}

const SECRETS = /(?:\.ssh\/|id_rsa|id_ed25519|\.aws\/credentials|keychain|\.env\b|ANTHROPIC_API_KEY|GITHUB_TOKEN|\$\{?[A-Z_]*(?:TOKEN|SECRET|KEY)\}?)/
const OUT = /\b(?:curl|wget|nc|scp|rsync|Invoke-WebRequest)\b|https?:\/\/(?!github\.com|docs\.|developer\.)/

/** What is risky in a skill's text, line by line. Block-level findings must be acknowledged to approve. */
export function scanSkill(text: string): ImportFinding[] {
  const out: ImportFinding[] = []
  if (text.length > 100_000) out.push({ kind: 'size', level: 'warn', text: 'Over 100,000 characters: long skills cost on every use.' })
  for (const f of scanInjection(text)) out.push({ kind: 'injection', level: f.severity === 'high' ? 'block' : 'warn', text: `Tries to steer the model: ${f.rule} ("${f.excerpt.slice(0, 80)}")` })
  text.split('\n').forEach((l, i) => {
    const line = i + 1
    const cmd = l.replace(/^\s*(?:[-*]|\d+\.)?\s*(?:`{1,3})?\s*(?:\$\s*)?/, '').replace(/`+\s*$/, '')
    const r = riskOf(cmd)
    if (r.level === 'blocked') out.push({ kind: 'command', level: 'block', line, text: `Line ${line}: ${r.why} (${cmd.trim().slice(0, 80)})` })
    else if (r.level === 'ask') out.push({ kind: 'command', level: 'warn', line, text: `Line ${line}: ${r.why}` })
    if (SECRETS.test(l) && OUT.test(l)) out.push({ kind: 'secrets', level: 'block', line, text: `Line ${line}: reads secrets and reaches out in the same step` })
    else if (/\b(?:curl|wget)\b/.test(l) && /https?:\/\//.test(l)) out.push({ kind: 'network', level: 'warn', line, text: `Line ${line}: downloads from ${/https?:\/\/[^\s'"`)]+/.exec(l)?.[0] ?? 'the internet'}` })
  })
  return out
}

/** Blocking findings stop approval unless acknowledged one by one in the screen. */
export const blocking = (f: ImportFinding[]) => f.filter((x) => x.level === 'block')

/** Lines of a readable diff between the skill on disk and the one coming in. */
export function lineDiff(before: string, after: string): { op: ' ' | '+' | '-'; text: string }[] {
  const a = before.split('\n')
  const b = after.split('\n')
  const n = a.length
  const m = b.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
  const out: { op: ' ' | '+' | '-'; text: string }[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) (out.push({ op: ' ', text: a[i]! }), i++, j++)
    else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) out.push({ op: '-', text: a[i++]! })
    else out.push({ op: '+', text: b[j++]! })
  }
  while (i < n) out.push({ op: '-', text: a[i++]! })
  while (j < m) out.push({ op: '+', text: b[j++]! })
  return out
}
