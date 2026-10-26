// Phase 104: an Evernote (or Joplin) .enex export into Markdown notes with their attachments. Own
// parser: notes are flat in the format, so each <note> block is read by tag; the ENML body becomes
// Markdown, en-media points at the attachment by its hash, dates and tags go into the frontmatter.
import { createHash } from 'node:crypto'

export type EnexFile = { name: string; mime: string; data: Buffer; hash: string }
export type EnexNote = { title: string; created?: string; updated?: string; tags: string[]; source?: string; markdown: string; files: EnexFile[] }

const ent = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&')
const tag = (xml: string, t: string) => new RegExp(`<${t}>([\\s\\S]*?)</${t}>`).exec(xml)?.[1]
const all = (xml: string, t: string) => [...xml.matchAll(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`, 'g'))].map((m) => m[1]!)
const cdata = (s: string) => /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(s)?.[1] ?? s
/** 20261025T143000Z → 2026-10-25T14:30:00Z */
const date = (s?: string) => (s ? s.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z') : undefined)
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'application/pdf': 'pdf', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'text/plain': 'txt' }

/** ENML (XHTML) to Markdown: the tags Evernote writes; anything else keeps its text. */
export function enmlToMarkdown(enml: string, nameOf: (hash: string) => string | undefined): string {
  let h = enml.replace(/<\?xml[^>]*>|<!DOCTYPE[^>]*>/gi, '').replace(/<\/?en-note[^>]*>/gi, '')
  h = h.replace(/<en-media\b[^>]*\bhash="([0-9a-f]+)"[^>]*\/?>(?:<\/en-media>)?/gi, (_m, hash: string) => { const n = nameOf(hash); return n ? `![[${n}]]` : '' })
  h = h.replace(/<en-todo\b[^>]*checked="true"[^>]*\/?>(?:<\/en-todo>)?/gi, '- [x] ').replace(/<en-todo\b[^>]*\/?>(?:<\/en-todo>)?/gi, '- [ ] ')
  h = h.replace(/<en-crypt\b[\s\S]*?<\/en-crypt>/gi, '*(encrypted text left out)*')
  h = h.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, n: string, t: string) => `\n\n${'#'.repeat(Number(n))} ${t}\n\n`)
  h = h.replace(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**').replace(/<(i|em)\b[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*').replace(/<(s|strike|del)\b[^>]*>([\s\S]*?)<\/\1>/gi, '~~$2~~')
  h = h.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
  h = h.replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, u: string, t: string) => `[${t.replace(/<[^>]+>/g, '')}](${u})`)
  h = h.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_m, t: string) => `\n- ${t.replace(/<\/?(div|p)[^>]*>/gi, '').trim()}`)
  h = h.replace(/<br\s*\/?>/gi, '\n').replace(/<hr\s*\/?>/gi, '\n\n---\n\n')
  h = h.replace(/<\/(div|p|ul|ol|table|tr|blockquote)>/gi, '\n').replace(/<(div|p|ul|ol|table|tr|blockquote)\b[^>]*>/gi, '\n')
  h = h.replace(/<\/t[dh]>/gi, ' | ').replace(/<[^>]+>/g, '')
  return ent(h).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function parseEnex(xml: string): EnexNote[] {
  return all(xml, 'note').map((n) => {
    const files: EnexFile[] = all(n, 'resource').flatMap((r) => {
      const b64 = (tag(r, 'data') ?? '').replace(/^<data[^>]*>/, '').replace(/\s+/g, '')
      const raw = /<data[^>]*>([\s\S]*?)<\/data>/.exec(r)?.[1]?.replace(/\s+/g, '') ?? b64
      if (!raw) return []
      const data = Buffer.from(raw, 'base64')
      const mime = (tag(r, 'mime') ?? 'application/octet-stream').trim()
      const hash = createHash('md5').update(data).digest('hex')
      const given = ent(tag(tag(r, 'resource-attributes') ?? '', 'file-name') ?? '').trim()
      const name = (given || `${hash.slice(0, 10)}.${EXT[mime] ?? 'bin'}`).replace(/[\\/:*?"<>|]+/g, '_')
      return [{ name, mime, data, hash }]
    })
    // two attachments with one name get the hash in front of the second
    const seen = new Set<string>()
    for (const f of files) {
      if (seen.has(f.name)) f.name = `${f.hash.slice(0, 6)}-${f.name}`
      seen.add(f.name)
    }
    const content = cdata(tag(n, 'content') ?? '')
    return {
      title: ent(tag(n, 'title') ?? 'Untitled').trim() || 'Untitled',
      created: date(tag(n, 'created')),
      updated: date(tag(n, 'updated')),
      tags: all(n, 'tag').map((t) => ent(t).trim()).filter(Boolean),
      source: ent(tag(tag(n, 'note-attributes') ?? '', 'source-url') ?? '') || undefined,
      markdown: enmlToMarkdown(content, (h) => files.find((f) => f.hash === h)?.name),
      files,
    }
  })
}

/** The Markdown file for a note: frontmatter, then the body. */
export function noteFile(n: EnexNote): string {
  const q = (s: string) => JSON.stringify(s)
  const fm = [`title: ${q(n.title)}`, n.created ? `created: ${n.created}` : '', n.updated ? `updated: ${n.updated}` : '', n.tags.length ? `tags:\n${n.tags.map((t) => `  - ${q(t)}`).join('\n')}` : '', n.source ? `source: ${q(n.source)}` : '', 'imported: enex'].filter(Boolean)
  return `---\n${fm.join('\n')}\n---\n\n${n.markdown}\n`
}

export const safeName = (s: string) => s.replace(/[\\/:*?"<>|#^[\]]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled'
