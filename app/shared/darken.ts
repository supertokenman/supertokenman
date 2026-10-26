// A light web page shown dark, the way the rest of the app is: the page is inverted and turned back to
// its own hues, and pictures, video and canvases (QR codes among them) are inverted again so they look
// as they should. Applied only while the page itself is light: a page in its own dark mode is left alone.

export const DARKEN_CSS = `
html { filter: invert(0.9) hue-rotate(180deg) !important; background: #fff !important; }
img, video, picture, canvas, iframe, embed, object, [style*="background-image"] { filter: invert(1) hue-rotate(180deg) !important; }
`

/** "rgb(250, 250, 250)" or "rgba(0, 0, 0, 0)" as relative luminance 0..1; transparent counts as white. */
export function luminance(css: string): number {
  const m = css.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/)
  if (!m) return 1
  if (m[4] !== undefined && Number(m[4]) === 0) return 1
  const [r, g, b] = [m[1], m[2], m[3]].map((v) => {
    const c = Number(v) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

/** The page's background as the browser computes it: body first, then html. */
export const PAGE_BG_JS = `(() => { const b = document.body && getComputedStyle(document.body).backgroundColor; const h = getComputedStyle(document.documentElement).backgroundColor; return b && !/rgba\\(0, 0, 0, 0\\)/.test(b) ? b : h })()`

export const isLight = (css: string) => luminance(css) > 0.45
