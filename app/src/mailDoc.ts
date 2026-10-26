// An email's HTML made safe to show: no scripts, no forms, no frames, links open in the browser,
// and remote images (tracking pixels among them) stay off until the person allows them. The result
// goes into a sandboxed iframe whose own policy enforces the same.

const DROP = 'script,iframe,frame,frameset,object,embed,applet,form,input,button,select,textarea,meta,link,base,noscript'

export type MailDoc = { html: string; remoteImages: number }

export function mailDoc(raw: string, allowImages: boolean): MailDoc {
  const doc = new DOMParser().parseFromString(raw || '', 'text/html')
  doc.querySelectorAll(DROP).forEach((n) => n.remove())
  let remote = 0
  doc.querySelectorAll('*').forEach((el) => {
    for (const a of Array.from(el.attributes)) {
      const name = a.name.toLowerCase()
      const v = a.value.trim().toLowerCase()
      if (name.startsWith('on')) el.removeAttribute(a.name)
      else if ((name === 'href' || name === 'src' || name === 'xlink:href' || name === 'action') && /^(javascript|vbscript|data:text\/html)/.test(v)) el.removeAttribute(a.name)
    }
    if (el.tagName === 'IMG' && /^https?:/i.test(el.getAttribute('src') ?? '')) remote++
    if (/url\(\s*['"]?https?:/i.test(el.getAttribute('style') ?? '')) remote++
    if (el.tagName === 'A') {
      el.setAttribute('target', '_blank')
      el.setAttribute('rel', 'noopener noreferrer')
    }
  })
  const policy = `default-src 'none'; img-src data: cid:${allowImages ? ' https: http:' : ''}; style-src 'unsafe-inline'; font-src data:`
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><base target="_blank"><style>
    html { color-scheme: light; }
    body { margin: 0; padding: 22px 26px; background: #ffffff; color: #1b1a17; font: 14.5px/1.55 -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; overflow-wrap: anywhere; }
    img { max-width: 100%; height: auto; }
    table { max-width: 100%; }
    a { color: #b5532f; }
    blockquote { margin: 0 0 0 4px; padding-left: 12px; border-left: 3px solid #e2ddd2; color: #5d5a52; }
  </style>`
  return { html: `<!doctype html><html><head>${head}</head><body>${doc.body.innerHTML}</body></html>`, remoteImages: remote }
}
