// Record one piece of the page as a vertical 9:16 clip for social posts.
// Usage: node export-9x16.js <url> <css selector> <out dir> [seconds]
// Writes a .webm (Playwright video, 1080x1920). Convert: ffmpeg -i in.webm -c:v libx264 -pix_fmt yuv420p out.mp4
const { chromium } = require('playwright')
const [url, sel, out, secs = '8'] = process.argv.slice(2)
;(async () => {
  const b = await chromium.launch()
  const size = { width: 540, height: 960 }
  const ctx = await b.newContext({ viewport: size, deviceScaleFactor: 2, recordVideo: { dir: out, size: { width: 1080, height: 1920 } } })
  const p = await ctx.newPage()
  await p.goto(url, { waitUntil: 'networkidle' })
  // isolate the piece, centred on the page's own background
  await p.evaluate((s) => { const el = document.querySelector(s); document.body.replaceChildren(el)
    Object.assign(document.body.style, { display: 'grid', placeItems: 'center', minHeight: '100vh', padding: '32px' }) }, sel)
  for (let t = 0; t < +secs * 4; t++) { await p.mouse.move(270 + 200 * Math.sin(t / 6), 480 + 200 * Math.cos(t / 7)); await p.waitForTimeout(250) }
  await ctx.close(); await b.close()
  console.log('video in', out)
})()
