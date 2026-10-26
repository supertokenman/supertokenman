/** The YouTube video a page or link is about, in its watch, short, live, embed or youtu.be form. */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^(www|m|music)\./, '')
    let id: string | null = null
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0] ?? null
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v')
      else {
        const m = /^\/(shorts|live|embed)\/([^/?#]+)/.exec(u.pathname)
        id = m ? m[2]! : null
      }
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null
  } catch {
    return null
  }
}
