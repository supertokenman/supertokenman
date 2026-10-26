// Export a panel's conversation (or a range of its turns) as Markdown or HTML, to paste into a pull
// request or an issue. Credentials are masked and absolute paths shortened before anything leaves.
import { redact } from './secrets.js'

export type ExLine =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'tool'; name: string; summary: string }
  | { kind: 'note'; text: string; tone?: 'error' }
  | { kind: 'peer'; from: string; text: string }
  | { kind: 'shell'; command: string; out: string; code: number | null }

export type ExportOpts = { from: number; to: number; tools: boolean; cwd: string; home: string; title?: string }

/** Turns: each starts at a message of yours and runs to the next one. */
export function turnsOf(lines: ExLine[]): ExLine[][] {
  const out: ExLine[][] = []
  for (const l of lines) {
    if (l.kind === 'user' || !out.length) out.push([])
    out[out.length - 1]!.push(l)
  }
  return out
}

/** Paths as a reader elsewhere can follow: the project as ".", the home folder as "~", other homes too. */
export function shortenPaths(text: string, cwd: string, home: string): string {
  let t = text
  if (cwd && cwd.length > 1) t = t.split(cwd).join('.')
  if (home && home.length > 1) t = t.split(home).join('~')
  return t.replace(/(^|[\s'"`(=])(\/(?:Users|home)\/[^/\s'"`)]+)(?=\/|\s|$)/g, '$1~').replace(/([A-Z]:\\Users\\)[^\\\s]+/g, '~')
}

/** One piece of text made safe to share: credentials masked, paths shortened. Returns how many were masked. */
export function clean(text: string, o: Pick<ExportOpts, 'cwd' | 'home'>): { text: string; masked: number } {
  const r = redact(text)
  return { text: shortenPaths(r.text, o.cwd, o.home), masked: r.found.length }
}

const fence = (s: string) => {
  const n = Math.max(3, ...[...s.matchAll(/`{3,}/g)].map((m) => m[0].length + 1))
  return '`'.repeat(n)
}

export function toMarkdown(lines: ExLine[], o: ExportOpts): { text: string; masked: number; turns: number } {
  const turns = turnsOf(lines).slice(o.from, o.to + 1)
  let masked = 0
  const c = (s: string) => {
    const r = clean(s, o)
    masked += r.masked
    return r.text
  }
  const parts: string[] = [`# ${c(o.title ?? 'Claude Code session')}`, '']
  turns.forEach((t, i) => {
    for (const l of t) {
      if (l.kind === 'user') parts.push(`## Turn ${o.from + i + 1}`, '', `**You:**`, '', c(l.text).split('\n').map((x) => `> ${x}`).join('\n'), '')
      else if (l.kind === 'assistant') parts.push('', '**Claude:**', '', c(l.text), '')
      else if (l.kind === 'peer') parts.push(`**${c(l.from)}:**`, '', c(l.text), '')
      else if (l.kind === 'tool' && o.tools) parts.push(`- _${c(l.name)}_: ${c(l.summary)}`)
      else if (l.kind === 'shell' && o.tools) {
        const out = c(l.out.length > 4000 ? `${l.out.slice(0, 4000)}\n... ${l.out.length - 4000} characters cut` : l.out)
        const f = fence(out)
        parts.push('', `\`$ ${c(l.command)}\`${l.code !== null && l.code !== 0 ? ` (exit ${l.code})` : ''}`, '', `${f}text`, out, f, '')
      } else if (l.kind === 'note' && l.tone === 'error') parts.push(`> **Note:** ${c(l.text)}`, '')
    }
  })
  parts.push('', `<sub>Exported from SuperTokenMan${masked ? `; ${masked} credential${masked === 1 ? '' : 's'} masked` : ''}.</sub>`)
  return { text: parts.join('\n').replace(/\n{3,}/g, '\n\n'), masked, turns: turns.length }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!)

/** A standalone page: no scripts, no outside files; the Markdown kept as preformatted text blocks. */
export function toHtml(lines: ExLine[], o: ExportOpts): { text: string; masked: number; turns: number } {
  const md = toMarkdown(lines, o)
  const body = md.text
    .split('\n')
    .map((l) => (l.startsWith('# ') ? `<h1>${esc(l.slice(2))}</h1>` : l.startsWith('## ') ? `<h2>${esc(l.slice(3))}</h2>` : l.startsWith('> ') ? `<blockquote>${esc(l.slice(2))}</blockquote>` : l.startsWith('**') && l.endsWith(':**') ? `<h3>${esc(l.slice(2, -3))}</h3>` : l.trim() ? `<p>${esc(l)}</p>` : ''))
    .join('\n')
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${esc(o.title ?? 'Claude Code session')}</title><style>body{font:15px/1.55 -apple-system,'Inter',sans-serif;max-width:760px;margin:40px auto;padding:0 16px;color:#1d1d1f;background:#fff}h1{font-size:26px;letter-spacing:-.02em}h2{font-size:13px;text-transform:uppercase;letter-spacing:.1em;color:#86868b;border-top:1px solid #e5e5e5;padding-top:18px;margin-top:28px}h3{font-size:14px;margin:14px 0 4px}blockquote{margin:0;padding:2px 12px;border-left:2px solid #c65d3b;white-space:pre-wrap}p{white-space:pre-wrap;margin:4px 0}</style></head><body>${body}</body></html>`
  return { ...md, text: page }
}
