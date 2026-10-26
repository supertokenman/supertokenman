// Long documents attached to a panel (PDF, Word, slides, sheets) kept in the project's memory as
// Markdown, headings and tables intact, so they are read by table of contents (memory_index, then the
// sections needed) instead of whole. PDFs go through pdftotext's layout mode, which keeps reading order
// and table columns (MarkItDown reorders a PDF's blocks); Word, slides, sheets and pages go through
// MarkItDown, which writes real Markdown tables, or pandoc when MarkItDown cannot read them.
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, join } from 'node:path'

export const DOC_TYPES = ['.pdf', '.docx', '.pptx', '.xlsx', '.html', '.epub']

const run = (cmd: string, args: string[]) =>
  new Promise<string | null>((ok) => execFile(cmd, args, { timeout: 120_000, maxBuffer: 64 * 1024 * 1024 }, (e, out) => ok(e ? null : out)))

const which = (name: string) => [join(homedir(), '.local', 'bin', name), `/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`, `/usr/bin/${name}`].find((p) => existsSync(p)) ?? null

/**
 * Plain text laid out as a PDF page: lines that look like headings become Markdown headings, and runs
 * of lines split into columns (a table) are kept in a block so the columns stay aligned.
 */
export function layoutToMarkdown(text: string, title: string): string {
  const lines = text.replace(/\f/g, '\n').split('\n')
  const out: string[] = [`# ${title}`, '']
  const isRow = (l: string) => l.trim().split(/\s{2,}/).length >= 2
  let table: string[] = []
  const flush = () => {
    if (table.length >= 2) out.push('```', ...table.map((r) => r.replace(/^\s+/, '')), '```')
    else out.push(...table.map((r) => r.trim()))
    table = []
  }
  for (const raw of lines) {
    const l = raw.replace(/\s+$/, '')
    const t = l.trim()
    if (t && isRow(l)) {
      table.push(l)
      continue
    }
    flush()
    // a short line with no full stop, numbered or in capitals, is a section title
    const heading = t.length > 2 && t.length < 80 && !/[.,;:]$/.test(t) && (/^(\d+(\.\d+)*\.?|[IVX]+\.)\s+\S/.test(t) || (t === t.toUpperCase() && /[A-Z]{3}/.test(t)))
    out.push(heading ? `\n## ${t.replace(/^(\d+(\.\d+)*\.?|[IVX]+\.)\s+/, '')}\n` : t)
  }
  flush()
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/** The document as Markdown, or null when no converter is there or it failed. */
export async function toMarkdown(path: string): Promise<string | null> {
  const title = basename(path)
  if (extname(path).toLowerCase() === '.pdf') {
    const pt = which('pdftotext')
    if (pt) {
      const out = await run(pt, ['-layout', path, '-'])
      if (out?.trim()) return layoutToMarkdown(out, title)
    }
  }
  const md = which('markitdown')
  if (md) {
    const out = await run(md, [path])
    if (out?.trim()) return /^# /m.test(out) ? out : `# ${title}\n\n${out}`
  }
  // pandoc reads Word, HTML and ePub into GitHub Markdown, tables included
  const pd = ['.docx', '.html', '.epub'].includes(extname(path).toLowerCase()) ? which('pandoc') : null
  if (pd) {
    const out = await run(pd, ['-t', 'gfm', '--wrap=none', path])
    if (out?.trim()) return /^# /m.test(out) ? out : `# ${title}\n\n${out}`
  }
  return null
}

/** Converts and keeps it under the project's documents; the stored file's name, or null. */
export async function keepDoc(vault: string, project: string, path: string): Promise<string | null> {
  if (!vault || !DOC_TYPES.includes(extname(path).toLowerCase())) return null
  const text = await toMarkdown(path)
  if (!text) return null
  const dir = join(vault, 'docs', project)
  mkdirSync(dir, { recursive: true })
  const name = `${basename(path, extname(path)).replace(/[^\w.-]+/g, '-').slice(0, 60)}.md`
  writeFileSync(join(dir, name), text)
  return name
}
