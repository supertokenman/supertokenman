// Screenshots of components/demo.html. Usage: PORT=8766 OUT=<dir> node demo-shots.js  (site/ served on PORT)
// The demo folder is served under /__demo/ by request interception, so nothing is added to site/.
const { chromium } = require('playwright'), fs = require('fs'), path = require('path')
const port = process.env.PORT || 8766, out = process.env.OUT, dir = path.join(__dirname, '../components')
;(async () => {
  const b = await chromium.launch()
  for (const rm of ['no-preference', 'reduce']) {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: rm, colorScheme: 'light' })
    const errs = [], hosts = new Set()
    await p.route('**/__demo/**', (r) => {
      const f = path.join(dir, path.basename(new URL(r.request().url()).pathname))
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(f)]
      r.fulfill({ body: fs.readFileSync(f), contentType: type })
    })
    p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
    p.on('pageerror', (e) => errs.push(String(e)))
    p.on('request', (r) => hosts.add(new URL(r.url()).host))
    await p.goto(`http://localhost:${port}/__demo/demo.html`, { waitUntil: 'networkidle' })
    const tag = rm === 'reduce' ? '-reduced' : ''
    await p.waitForTimeout(1400)
    await p.locator('#halftone').screenshot({ path: `${out}/skill-halftone${tag}.png` })
    const top = await p.evaluate(() => document.querySelector('#camera').offsetTop)
    await p.evaluate((y) => scrollTo(0, y + innerHeight * 1.1), top); await p.waitForTimeout(500)
    await p.screenshot({ path: `${out}/skill-scroll${tag}.png` })
    const sw = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth])
    console.log(rm, 'errors:', errs, 'hosts:', [...hosts], 'scrollW/innerW:', sw)
    await p.close()
  }
  await b.close()
})()
