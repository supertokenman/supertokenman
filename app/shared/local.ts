// URLs on this machine: the only ones a panel's Preview may show.

/** A URL the preview may show: http(s) on this machine only. */
export function isLocalUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (u.protocol === 'http:' || u.protocol === 'https:') && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
  } catch {
    return false
  }
}
