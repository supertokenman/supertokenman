// The web apps the side drawer may show, each in its own storage, each held to its own sites.
// Claude never reads or drives them: they are the user's own accounts, shown as the sites themselves.

export type WebApp = { id: string; name: string; url: string; hosts: string[]; hint: string }

export const WEB_APPS: WebApp[] = [
  { id: 'whatsapp', name: 'WhatsApp', url: 'https://web.whatsapp.com/', hosts: ['whatsapp.com', 'whatsapp.net'], hint: 'Scan the QR code with your phone once.' },
  { id: 'slack', name: 'Slack', url: 'https://app.slack.com/client', hosts: ['slack.com', 'slack-edge.com', 'slack-imgs.com', 'slack-files.com', 'google.com', 'accounts.google.com'], hint: 'Your workspaces.' },
  { id: 'discord', name: 'Discord', url: 'https://discord.com/app', hosts: ['discord.com', 'discordapp.com', 'discord.gg', 'discordapp.net', 'discord.media', 'discordcdn.com', 'hcaptcha.com'], hint: 'Servers and DMs; voice asks for the microphone first.' },
  { id: 'teams', name: 'Teams', url: 'https://teams.microsoft.com/', hosts: ['teams.microsoft.com', 'teams.live.com', 'microsoft.com', 'microsoftonline.com', 'live.com', 'office.com', 'skype.com', 'msauth.net', 'msftauth.net'], hint: 'Chats and meetings; the camera asks first.' },
  { id: 'calendar', name: 'Calendar', url: 'https://calendar.google.com/', hosts: ['calendar.google.com', 'accounts.google.com', 'google.com', 'gstatic.com'], hint: 'Google Calendar.' },
  { id: 'meet', name: 'Meet', url: 'https://meet.google.com/', hosts: ['meet.google.com', 'accounts.google.com', 'google.com', 'gstatic.com'], hint: 'Join from the agenda or paste a link.' },
  { id: 'gmail', name: 'Gmail', url: 'https://mail.google.com/mail/', hosts: ['mail.google.com', 'accounts.google.com', 'google.com', 'gstatic.com', 'googleusercontent.com'], hint: 'Google may refuse sign-in in an embedded window; then use Open in browser.' },
  { id: 'outlook', name: 'Outlook', url: 'https://outlook.live.com/owa/?nlp=1', hosts: ['outlook.live.com', 'outlook.office.com', 'outlook.office365.com', 'live.com', 'microsoftonline.com', 'microsoft.com', 'microsoft365.com', 'office.com', 'office.net', 'msauth.net', 'msftauth.net', 'msecnd.net', 'akamaihd.net'], hint: 'Personal or work account.' },
  { id: 'ifood', name: 'iFood', url: 'https://www.ifood.com.br/', hosts: ['ifood.com.br', 'ifood.com', 'ifoodcorp.com.br'], hint: 'Ordering and payment stay with you.' },
  { id: 'uber', name: 'Uber', url: 'https://m.uber.com/', hosts: ['uber.com', 'ubereats.com', 'cdn-uber.com'], hint: 'Rides are requested and paid by you.' },
  { id: 'linkedin', name: 'LinkedIn', url: 'https://www.linkedin.com/feed/', hosts: ['linkedin.com', 'licdn.com'], hint: 'Your feed and messages.' },
  { id: 'x', name: 'X', url: 'https://x.com/home', hosts: ['x.com', 'twitter.com', 'twimg.com'], hint: 'Your timeline.' },
  { id: 'reddit', name: 'Reddit', url: 'https://www.reddit.com/', hosts: ['reddit.com', 'redditmedia.com', 'redditstatic.com', 'redd.it'], hint: 'Your subreddits.' },
  { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/', hosts: ['youtube.com', 'youtu.be', 'google.com', 'accounts.google.com', 'gstatic.com', 'ytimg.com', 'googlevideo.com'], hint: 'Keeps playing while the drawer is closed.' },
]

/**
 * A site the person added as an app (idea from tw93/Pake): its own kept storage, held to its own host
 * (and any they list for sign-in), optional CSS put in on each load, optional user agent. Same
 * hardening as the built-in apps: no Node, sandboxed, no preload.
 */
export type Site = { id: string; name: string; url: string; hosts: string[]; css?: string; ua?: string; icon?: string; custom: true }
export type SiteInput = { name: string; url: string; css?: string; ua?: string; alsoHosts?: string }

const HOST = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'site'

/** A checked site, or why not. The id (and so the storage) stays the same on edit. */
export function validateSite(input: SiteInput, taken: string[] = [], id?: string): Site {
  const name = String(input.name ?? '').trim()
  if (!name || name.length > 40) throw new Error('Give the app a name of up to 40 characters.')
  let u: URL
  try {
    u = new URL(String(input.url ?? '').trim())
  } catch {
    throw new Error('The address starts with https://.')
  }
  if (u.protocol !== 'https:') throw new Error('Only https sites can be apps.')
  if (u.username || u.password) throw new Error('Leave the login out of the address; sign in inside the app.')
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  if (!HOST.test(host)) throw new Error('Use the site\'s name, not an IP address or a local name.')
  const also = String(input.alsoHosts ?? '').split(/[\s,]+/).map((h) => h.trim().toLowerCase().replace(/^\*\./, '')).filter(Boolean)
  for (const h of also) if (!HOST.test(h)) throw new Error(`${h} is not a host name.`)
  if (also.length > 10) throw new Error('Up to 10 extra hosts.')
  const css = String(input.css ?? '').trim()
  if (css.length > 20_000) throw new Error('Keep the custom CSS under 20,000 characters.')
  // CSS that loads something (@import, url()) would reach other hosts on every page load
  if (/@import|url\s*\(/i.test(css)) throw new Error('Custom CSS cannot load files (@import or url()); use it to hide or restyle elements.')
  const ua = String(input.ua ?? '').trim()
  if (ua && (ua.length > 300 || !/^[\x20-\x7e]+$/.test(ua))) throw new Error('The user agent is one line of plain text, up to 300 characters.')
  const builtIn = WEB_APPS.map((a) => a.id)
  let sid = id
  if (!sid) {
    const base = `site-${slug(name)}`
    sid = base
    for (let n = 2; [...builtIn, ...taken].includes(sid); n++) sid = `${base}-${n}`
  }
  if (!/^site-[a-z0-9-]{1,40}$/.test(sid)) throw new Error('Not a site id.')
  return { id: sid, name, url: u.href, hosts: [...new Set([host, ...also])], ...(css ? { css } : {}), ...(ua ? { ua } : {}), custom: true }
}

/** The app that owns a storage partition, `persist:<id>`: a built-in one or a site the person added. */
export const appOfPartition = (partition: string, sites: Site[] = []): WebApp | undefined => [...WEB_APPS, ...sites.map(siteApp)].find((a) => `persist:${a.id}` === partition)

/** A site as a drawer app. */
export const siteApp = (s: Site): WebApp & { css?: string; ua?: string; icon?: string; custom?: true } => ({ id: s.id, name: s.name, url: s.url, hosts: s.hosts, hint: `${new URL(s.url).hostname}, in its own storage.`, css: s.css, ua: s.ua, icon: s.icon, custom: true })

/** The icon a page names (<link rel="icon">), else /favicon.ico, as an absolute https address. */
export function iconHref(html: string, page: string): string {
  const head = html.split(/<body[\s>]/i)[0] ?? ''
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0])
  const pick = links.find((l) => /rel=["']?(?:shortcut )?icon["'\s>]/i.test(l)) ?? links.find((l) => /rel=["']?apple-touch-icon/i.test(l))
  const href = pick?.match(/href=["']([^"']+)["']/i)?.[1]
  try {
    const u = new URL(href ? href.replace(/&amp;/g, '&') : '/favicon.ico', page)
    return u.protocol === 'https:' ? u.href : new URL('/favicon.ico', page).href
  } catch {
    return new URL('/favicon.ico', page).href
  }
}

/** Whether a URL belongs to an app: https, on one of its hosts or their subdomains. */
export function allows(app: WebApp, url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && app.hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))
  } catch {
    return false
  }
}

/** The unread count a page puts in its title: "(3) WhatsApp", "Inbox (12) - me@gmail.com". */
export const unreadOf = (title: string) => Number(title.match(/\((\d+)\)/)?.[1] ?? 0)

/** A popup that left the sign-in pages and reached the app itself: hand it back to the drawer. */
export function isAppPage(app: WebApp, url: string): boolean {
  let u: URL
  try { u = new URL(url) } catch { return false }
  if (!allows(app, url)) return false
  if (/(^|\.)(login|signin|auth|account|accounts|sso)\./i.test(u.hostname) || /microsoftonline|msauth|msftauth/.test(u.hostname)) return false
  if (/(login|signin|sign-in|oauth|auth|sso|callback|consent)/i.test(u.pathname + u.search)) return false
  return u.hostname === new URL(app.url).hostname || /^(outlook\.(office|office365|live)\.com)$/.test(u.hostname)
}
