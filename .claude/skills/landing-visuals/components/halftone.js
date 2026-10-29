// Halftone: draws a REAL screenshot as a field of dots. No libraries, no network, same-origin images only.
// <figure class="halftone" data-halftone="assets/panels.jpg" data-cell="7" data-accent="0.05,0.1,0.3,0.4"
//         role="img" aria-label="What the picture shows"></figure>
// data-cell: dot pitch in CSS px. data-accent: "x,y,w,h" boxes (0..1 of the image), ";" between boxes:
// dots inside are drawn in --accent, the rest in --ink. Pixels far from the picture's background tone make big dots, so dark and light screenshots both work. With
// prefers-reduced-motion the field is drawn at once; otherwise it grows in once, when first seen.
;(() => {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  const tone = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()
  const els = [...document.querySelectorAll('[data-halftone]')]
  const state = new Map()

  const sample = (el, img) => {
    const cell = +el.dataset.cell || 7, w = el.clientWidth, h = Math.round(w * img.naturalHeight / img.naturalWidth)
    const cols = Math.max(1, Math.floor(w / cell)), rows = Math.max(1, Math.floor(h / cell))
    const c = document.createElement('canvas'); c.width = cols; c.height = rows
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, cols, rows)
    const d = x.getImageData(0, 0, cols, rows).data, lum = new Float32Array(cols * rows)
    for (let i = 0; i < lum.length; i++) lum[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255
    // The most common tone is the screenshot's own background: it gets no dots, whatever the theme.
    // Dot size follows the distance from it, stretched so the strongest detail fills a cell.
    const sorted = Float32Array.from(lum).sort(), bg = sorted[sorted.length >> 1]
    let span = 0.08; for (const v of lum) span = Math.max(span, Math.abs(v - bg))
    for (let i = 0; i < lum.length; i++) lum[i] = Math.abs(lum[i] - bg) / span
    const boxes = (el.dataset.accent || '').split(';').filter(Boolean).map((b) => b.split(',').map(Number))
    return { cell: w / cols, cols, rows, w, h: rows * (w / cols), lum, boxes }
  }

  const draw = (el, t) => {
    const s = state.get(el); if (!s) return
    const c = el.querySelector('canvas') || el.appendChild(document.createElement('canvas'))
    const dpr = devicePixelRatio || 1
    c.width = Math.round(s.w * dpr); c.height = Math.round(s.h * dpr); c.style.width = s.w + 'px'; c.style.height = s.h + 'px'
    const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, s.w, s.h)
    const ink = tone('--ink'), acc = tone('--accent')
    for (let r = 0; r < s.rows; r++) for (let q = 0; q < s.cols; q++) {
      const v = s.lum[r * s.cols + q]
      const on = s.boxes.some(([bx, by, bw, bh]) => q / s.cols >= bx && q / s.cols < bx + bw && r / s.rows >= by && r / s.rows < by + bh)
      // a little stagger along the diagonal while it grows in
      const k = Math.min(1, Math.max(0, t * 1.6 - (q / s.cols + r / s.rows) * 0.3))
      const rad = s.cell * 0.5 * Math.sqrt(v) * k
      if (rad < 0.35) continue
      x.fillStyle = on ? acc : ink; x.beginPath(); x.arc(q * s.cell + s.cell / 2, r * s.cell + s.cell / 2, rad, 0, 7); x.fill()
    }
  }

  const grow = (el) => {
    if (still) return draw(el, 1)
    const t0 = performance.now(), dur = 900
    const step = (now) => { const p = Math.min(1, (now - t0) / dur); draw(el, 1 - Math.pow(1 - p, 3)); if (p < 1) requestAnimationFrame(step) }
    requestAnimationFrame(step)
  }

  const io = 'IntersectionObserver' in window && new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { io.unobserve(e.target); grow(e.target) }
  }))

  els.forEach((el) => {
    const img = new Image()
    img.onload = () => { el._img = img; state.set(el, sample(el, img)); io ? (draw(el, still ? 1 : 0), io.observe(el)) : draw(el, 1) }
    img.src = el.dataset.halftone
  })
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => els.forEach((el) => el._img && (state.set(el, sample(el, el._img)), draw(el, 1))), 150) })
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => els.forEach((el) => draw(el, 1)))
})()
