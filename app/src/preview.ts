// The dev servers a panel's commands announce: the local URLs they print, kept while the command runs.

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g
const URL_RE = /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\])(?::\d{2,5})?(?:\/[^\s'"<>)\]]*)?/gi

/** The local URLs in a chunk of output, as a browser would open them, first seen first. */
export function findDevUrls(text: string): string[] {
  const out: string[] = []
  for (const m of text.replace(ANSI, '').matchAll(URL_RE)) {
    const url = m[0].replace(/0\.0\.0\.0|\[::1?\]/, 'localhost').replace(/[.,;:]+$/, '')
    if (!out.includes(url)) out.push(url)
  }
  return out
}

export { isLocalUrl } from '../shared/local'
