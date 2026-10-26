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

/** The app that owns a storage partition, `persist:<id>`. */
export const appOfPartition = (partition: string) => WEB_APPS.find((a) => `persist:${a.id}` === partition)

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
