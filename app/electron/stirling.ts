// Phase 105: PDF tools through the person's own Stirling-PDF (MIT), at the address they set. Files go
// to that address and nowhere else; results are saved next to the original, never over it. Endpoints
// and fields as in Stirling-PDF's published API reference (registry.scalar.com/@stirlingpdf).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'

export type Op = 'merge' | 'split' | 'compress' | 'ocr' | 'remove' | 'redact'
export const OPS: { id: Op; name: string; path: string; many?: boolean }[] = [
  { id: 'merge', name: 'Merge', path: '/api/v1/general/merge-pdfs', many: true },
  { id: 'split', name: 'Split', path: '/api/v1/general/split-pages' },
  { id: 'compress', name: 'Compress', path: '/api/v1/misc/compress-pdf' },
  { id: 'ocr', name: 'OCR', path: '/api/v1/misc/ocr-pdf' },
  { id: 'remove', name: 'Remove pages', path: '/api/v1/general/remove-pages' },
  { id: 'redact', name: 'Redact', path: '/api/v1/security/auto-redact' },
]
export type Params = { pages?: string; level?: number; languages?: string[]; terms?: string[] }

/** The base must be http on this machine or https anywhere; anything else is refused. */
export function checkBase(base: string): URL {
  let u: URL
  try {
    u = new URL(base)
  } catch {
    throw new Error('The Stirling-PDF address is not a URL.')
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) throw new Error('Use https, or http only on this machine.')
  return u
}

export function form(op: Op, files: string[], p: Params): FormData {
  const f = new FormData()
  const blob = (file: string) => new Blob([new Uint8Array(readFileSync(file))], { type: 'application/pdf' })
  if (op === 'merge') {
    if (files.length < 2) throw new Error('Merge needs two PDFs or more.')
    for (const file of files) f.append('fileInput', blob(file), basename(file))
    f.append('sortType', 'orderProvided')
    return f
  }
  f.append('fileInput', blob(files[0]!), basename(files[0]!))
  if (op === 'split' || op === 'remove') {
    if (!/^[\d,\s-]+$|^all$/.test(String(p.pages ?? '').trim())) throw new Error('Pages like 1,3,5-7.')
    f.append('pageNumbers', String(p.pages).trim())
  }
  if (op === 'compress') f.append('optimizeLevel', String(Math.max(1, Math.min(9, Number(p.level) || 5))))
  if (op === 'ocr') {
    for (const l of p.languages?.length ? p.languages : ['eng']) f.append('languages', l)
    f.append('ocrType', 'skip-text')
    f.append('ocrRenderType', 'hocr')
  }
  if (op === 'redact') {
    const terms = (p.terms ?? []).map((t) => t.trim()).filter(Boolean)
    if (!terms.length) throw new Error('Nothing to redact.')
    f.append('listOfText', terms.join('\n'))
    f.append('useRegex', 'false')
    f.append('wholeWordSearch', 'false')
    // the page becomes an image, so the covered text cannot be copied back out
    f.append('convertPDFToImage', 'true')
  }
  return f
}

/** Where a result goes: next to the first file, a new name each time. */
export function outPath(first: string, op: Op, zip: boolean): string {
  const base = join(dirname(first), basename(first, extname(first)))
  const ext = zip ? 'zip' : 'pdf'
  for (let i = 1; ; i++) {
    const p = `${base}.${op}${i > 1 ? `-${i}` : ''}.${ext}`
    if (!existsSync(p)) return p
  }
}

export async function run(base: string, apiKey: string | undefined, op: Op, files: string[], p: Params, doFetch: typeof fetch = fetch): Promise<{ file: string; bytes: number }> {
  const def = OPS.find((o) => o.id === op)
  if (!def) throw new Error('Unknown tool.')
  if (!files.length || files.some((f) => !/\.pdf$/i.test(f) || !existsSync(f))) throw new Error('Pick PDF files that exist.')
  const u = checkBase(base)
  const url = new URL(def.path, u)
  // the request goes to the configured host only, whatever a path might say
  if (url.host !== u.host) throw new Error('Refused: another host.')
  const r = await doFetch(url, { method: 'POST', body: form(op, files, p), headers: apiKey ? { 'X-API-KEY': apiKey } : {} })
  if (!r.ok) {
    const t = (await r.text()).slice(0, 300)
    throw new Error(`Stirling-PDF answered ${r.status}${/"message":"([^"]+)"/.exec(t)?.[1] ? `: ${/"message":"([^"]+)"/.exec(t)![1]}` : ''}`)
  }
  const buf = Buffer.from(await r.arrayBuffer())
  const zip = /zip/.test(r.headers.get('content-type') ?? '') || buf.subarray(0, 2).toString() === 'PK'
  const file = outPath(files[0]!, op, zip)
  writeFileSync(file, buf)
  return { file, bytes: buf.length }
}
