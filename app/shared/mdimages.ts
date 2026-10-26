// Phase 101: images a Markdown file points at on this machine, published only when the person picks
// them: each one goes to the bucket under a name from its hash, and the file's links are rewritten.

export type LocalImage = { ref: string; alt: string; line: number; form: 'md' | 'html' }
export type Template = 'markdown' | 'html' | 'url'

const REMOTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i
const IMG = /\.(png|jpe?g|gif|webp|svg|avif)$/i

/** Local images in the text, in order, each reference once; links that already point online are left out. */
export function localImages(md: string): LocalImage[] {
  const out: LocalImage[] = []
  const seen = new Set<string>()
  const body = md.replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, ' '))
  body.split('\n').forEach((l, i) => {
    for (const m of l.matchAll(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) add(m[2]!, m[1]!, i, 'md')
    for (const m of l.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) add(m[1]!, /\balt=["']([^"']*)["']/i.exec(m[0])?.[1] ?? '', i, 'html')
  })
  return out
  function add(ref: string, alt: string, line: number, form: 'md' | 'html') {
    const r = decodeURI(ref)
    if (REMOTE.test(r) || !IMG.test(r.split('?')[0]!) || seen.has(r)) return
    seen.add(r)
    out.push({ ref: r, alt, line: line + 1, form })
  }
}

/** The bucket name for an image: its content hash, so the same picture is one object. */
export const assetName = (hash: string, ref: string) => `${hash.slice(0, 16)}.${(/\.([a-z0-9]+)$/i.exec(ref.split('?')[0]!)?.[1] ?? 'png').toLowerCase()}`

/** Rewrites each published reference; running it again with the same map changes nothing. */
export function rewrite(md: string, urls: Record<string, string>, template: Template = 'markdown'): { text: string; changed: number } {
  let changed = 0
  const enc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let text = md
  for (const [ref, url] of Object.entries(urls)) {
    const variants = [...new Set([ref, encodeURI(ref)])].map(enc).join('|')
    text = text.replace(new RegExp(`!\\[([^\\]]*)\\]\\(\\s*<?(?:${variants})>?((?:\\s+"[^"]*")?)\\s*\\)`, 'g'), (_m, alt: string, title: string) => {
      changed++
      return template === 'html' ? `<img src="${url}" alt="${alt.replace(/"/g, '&quot;')}">` : template === 'url' ? url : `![${alt}](${url}${title})`
    })
    text = text.replace(new RegExp(`(<img\\b[^>]*\\bsrc=["'])(?:${variants})(["'])`, 'gi'), (_m, a: string, b: string) => (changed++, `${a}${url}${b}`))
  }
  return { text, changed }
}
