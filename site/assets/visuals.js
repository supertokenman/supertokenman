// Landing visuals: dot-matrix drawings, the live demo in the hero, flip cards. No libraries, no network.
// Source of these pieces: .claude/skills/landing-visuals/. With reduced motion everything is still.
;(() => {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  const css = getComputedStyle(document.documentElement)
  const tone = (n) => css.getPropertyValue(n).trim()

  // Dot matrix. Spec in data-dots: rows split by "/", "#" ink, "*" accent, "+" accent that fills in
  // order (a meter), anything else a faint dot. Drawn on a canvas sized to the element.
  const draw = (el, t) => {
    const rows = el.dataset.dots.split('/'), cols = Math.max(...rows.map((r) => r.length))
    const c = el.querySelector('canvas') || el.appendChild(document.createElement('canvas'))
    const w = el.clientWidth, cell = w / cols, h = cell * rows.length, dpr = devicePixelRatio || 1
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.height = h + 'px' }
    const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h)
    const ink = tone('--ink'), acc = tone('--accent'), faint = tone('--line')
    let k = 0; const fills = el.dataset.dots.split('+').length - 1
    rows.forEach((r, y) => [...r].forEach((ch, i) => {
      let col = faint, rad = cell * 0.16
      if (ch === '#') { col = ink; rad = cell * 0.36 }
      else if (ch === '*') { col = acc; rad = cell * 0.4 }
      else if (ch === '+') { const on = k++ < Math.round(fills * t); col = on ? acc : faint; rad = on ? cell * 0.4 : cell * 0.16 }
      x.fillStyle = col; x.beginPath(); x.arc(i * cell + cell / 2, y * cell + cell / 2, rad, 0, 7); x.fill()
    }))
  }
  const dots = [...document.querySelectorAll('[data-dots]')]
  const all = (t) => dots.forEach((el) => draw(el, t))
  all(1)
  addEventListener('resize', () => all(1))
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => all(1))
  if (!still) {
    // meters fill, hold, empty: about one cycle every 4 seconds, only while on screen
    const live = new Set()
    const io = new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? live.add(e.target) : live.delete(e.target))))
    dots.filter((el) => el.dataset.dots.includes('+')).forEach((el) => io.observe(el))
    const loop = (ms) => { const p = (ms / 4000) % 1; const t = Math.min(1, p * 1.6); live.forEach((el) => draw(el, t)); requestAnimationFrame(loop) }
    requestAnimationFrame(loop)
  }

  // The live demo in the hero: the real interface with sample data (/docs/demo/?autoplay=1), playing its
  // scripted turn by itself. The poster shows first; the frame (about 450 KB gzip) loads once the page
  // has, and only on screens wide enough to read it. Off screen it is told to pause. Reduced motion
  // keeps the poster, a still frame of the finished turn.
  const live = document.getElementById('live')
  if (live && !still && matchMedia('(min-width: 701px)').matches) {
    const box = live.querySelector('.live-frame')
    const start = () => {
      const f = document.createElement('iframe')
      f.src = live.dataset.src
      f.title = 'SuperTokenMan live demo, playing by itself'
      f.setAttribute('sandbox', 'allow-scripts allow-same-origin')
      f.setAttribute('loading', 'eager')
      f.setAttribute('tabindex', '-1')
      f.setAttribute('aria-hidden', 'true')
      f.width = 1280; f.height = 780
      const fit = () => f.style.setProperty('--s', (box.clientWidth / 1280).toFixed(4))
      fit(); new ResizeObserver(fit).observe(box)
      const say = (m) => f.contentWindow && f.contentWindow.postMessage({ stm: m }, location.origin)
      let seen = true
      new IntersectionObserver(([e]) => { seen = e.isIntersecting; say(seen ? 'play' : 'pause') }).observe(live)
      f.addEventListener('load', () => { say(seen ? 'play' : 'pause'); setTimeout(() => live.classList.add('on'), 500) })
      box.appendChild(f)
    }
    if (document.readyState === 'complete') start()
    else addEventListener('load', start, { once: true })
  }

  // Flip cards are buttons; aria-pressed says which face is up.
  document.querySelectorAll('button.flip').forEach((b) =>
    b.addEventListener('click', () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true')))
})()
