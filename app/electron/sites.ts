// Sites the person adds as drawer apps: the icon is fetched once, on add, from the site itself, and
// kept locally as a small data URL; nothing about the site is fetched again by the app.
import { iconHref } from '../shared/webapps.js'

const MAX_ICON = 200_000

/** The site's icon as a data URL, or undefined; never throws, the app is added either way. */
export async function fetchIcon(page: string, f: typeof fetch = fetch): Promise<string | undefined> {
  try {
    const r = await f(page, { redirect: 'follow', signal: AbortSignal.timeout(10_000) })
    const html = r.ok && /html/i.test(r.headers.get('content-type') ?? 'text/html') ? (await r.text()).slice(0, 200_000) : ''
    const href = iconHref(html, r.url || page)
    if (new URL(href).hostname.replace(/^www\./, '') !== new URL(page).hostname.replace(/^www\./, '') && !new URL(href).hostname.endsWith(new URL(page).hostname.replace(/^www\./, ''))) {
      // an icon on a CDN of another host is a host the person did not name: fall back to the site's own
      return await grab(new URL('/favicon.ico', page).href, f)
    }
    return (await grab(href, f)) ?? (href.endsWith('/favicon.ico') ? undefined : await grab(new URL('/favicon.ico', page).href, f))
  } catch {
    return undefined
  }
}

async function grab(url: string, f: typeof fetch): Promise<string | undefined> {
  try {
    const r = await f(url, { signal: AbortSignal.timeout(10_000) })
    const type = (r.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
    if (!r.ok || !/^image\/(png|x-icon|vnd\.microsoft\.icon|svg\+xml|jpeg|gif|webp)$/.test(type)) return undefined
    const buf = Buffer.from(await r.arrayBuffer())
    if (!buf.length || buf.length > MAX_ICON) return undefined
    // an SVG could carry script: it is shown in an <img>, where scripts never run
    return `data:${type};base64,${buf.toString('base64')}`
  } catch {
    return undefined
  }
}
