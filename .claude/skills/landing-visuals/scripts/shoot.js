// Before/after shots + checks. Usage: OUT=<dir> node shoot.js before|after  (site served at :8765)
const { chromium } = require('playwright')
const out = process.env.OUT, pre = process.argv[2]
;(async () => {
  const b = await chromium.launch()
  const runs = [['desktop', { width: 1440, height: 900 }, 'no-preference'], ['mobile', { width: 390, height: 844 }, 'no-preference']]
  if (pre === 'after') runs.push(['reduced', { width: 1440, height: 900 }, 'reduce'])
  for (const [name, vp, rm] of runs) {
    const p = await b.newPage({ viewport: vp, reducedMotion: rm, colorScheme: 'light' })
    const errs = [], hosts = new Set()
    p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
    p.on('pageerror', (e) => errs.push(String(e)))
    p.on('request', (r) => hosts.add(new URL(r.url()).host))
    await p.goto('http://localhost:8765/', { waitUntil: 'networkidle' })
    await p.mouse.move(vp.width * 0.8, vp.height * 0.3)
    await p.waitForTimeout(2200)
    await p.screenshot({ path: `${out}/${pre}-${name}.png` })
    const sw = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth])
    if (pre === 'after' && name === 'desktop') {
      const c = await p.$('#features'); if (c) { await c.scrollIntoViewIfNeeded(); await p.waitForTimeout(900)
        const f = await p.$('.flip'); await f.click(); await p.waitForTimeout(900)
        await p.screenshot({ path: `${out}/after-cards.png` }) }
    }
    console.log(name, 'errors:', errs, 'hosts:', [...hosts], 'scrollW/innerW:', sw)
    await p.close()
  }
  await b.close()
})()
