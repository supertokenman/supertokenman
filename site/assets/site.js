// Site motion: pillars enter along the 45 degree line as they scroll in, and the home film plays a
// session in a loop while it is on screen. With reduced motion, everything is shown at once, still.
const still = matchMedia('(prefers-reduced-motion: reduce)').matches

const seen = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) (e.target.classList.add('in'), seen.unobserve(e.target))
}, { threshold: 0.2 })
document.querySelectorAll('.reveal, .reveal-text').forEach((el) => (still ? el.classList.add('in') : seen.observe(el)))

const film = document.getElementById('film')
if (film) {
  const steps = [...film.querySelectorAll('[data-step]')]
  const ask = film.querySelector('.fa-ask')
  const allow = film.querySelector('[data-allow]')
  const cost = film.querySelector('[data-cost]')
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  // split-flap: each changed character drops in, rightmost first, like the Savings totals in the app
  const show = (text) => {
    const old = cost.textContent
    cost.innerHTML = ''
    ;[...text].forEach((ch, i) => {
      const s = document.createElement('span')
      s.textContent = ch
      if (ch !== old[i]) (s.className = 'f'), (s.style.animationDelay = `${(text.length - i) * 30}ms`)
      cost.append(s)
    })
  }
  const step = (n) => steps.find((s) => s.dataset.step === String(n)).classList.add('on')
  const reset = () => {
    steps.forEach((s) => s.classList.remove('on'))
    ask.classList.remove('done')
    allow.classList.remove('press')
    cost.textContent = 'US$0.00'
  }
  if (still) {
    steps.forEach((s) => s.classList.add('on'))
    ask.classList.add('done')
    cost.textContent = 'US$0.04'
  } else {
    let visible = false
    new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(film)
    const play = async () => {
      for (;;) {
        while (!visible) await sleep(400)
        reset()
        await sleep(500)
        step(1); await sleep(700)
        step(2); show('US$0.01'); await sleep(700)
        step(3); await sleep(1100)
        allow.classList.add('press'); await sleep(220)
        ask.classList.add('done'); step(4); show('US$0.02'); await sleep(900)
        step(5); show('US$0.04'); await sleep(3600)
        steps.forEach((s) => s.classList.remove('on')); await sleep(600)
      }
    }
    play()
  }
}

// Launch motion: headline words, the reading bar, the film lying flat, the story and the cascade.
document.querySelectorAll('.split').forEach((el) => {
  let i = 0
  el.innerHTML = el.textContent.trim().split(/\s+/).map((w) => `<span class="w"><span style="--i:${i++}">${w}</span></span>`).join(' ')
  if (still) el.classList.add('in')
  else if (el.closest('.hero')) requestAnimationFrame(() => setTimeout(() => el.classList.add('in'), 120))
  else seen.observe(el)
})
document.querySelectorAll('.cascade').forEach((el) => {
  ;[...el.children].forEach((c, i) => c.style.setProperty('--i', i))
  still ? el.classList.add('in') : seen.observe(el)
})

const story = document.getElementById('story')
const sceneSteps = story ? [...story.querySelectorAll('[data-scene]')] : []
const shots = story ? [...story.querySelectorAll('[data-shot]')] : []
const rail = story ? [...story.querySelectorAll('.story-rail i')] : []
// on a phone the screen does not stay; each step carries its own copy below the text
shots.forEach((f, n) => {
  const m = f.cloneNode(true)
  m.className = 'shot m'
  m.removeAttribute('data-shot')
  sceneSteps[n]?.append(m)
})
let active = -1
const setScene = (n) => {
  if (n === active) return
  active = n
  sceneSteps.forEach((s, i) => s.classList.toggle('on', i === n))
  shots.forEach((f, i) => (f.classList.toggle('on', i === n), f.classList.toggle('past', i < n)))
}
setScene(0)

const progress = document.querySelector('.progress')
let ticking = false
const frame = () => {
  ticking = false
  const h = document.documentElement.scrollHeight - innerHeight
  if (progress) progress.style.setProperty('--read', h > 0 ? (scrollY / h).toFixed(4) : 0)
  if (film) {
    const r = film.getBoundingClientRect()
    film.style.setProperty('--flat', Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight * 0.75))).toFixed(3))
  }
  if (story) {
    const mid = innerHeight / 2
    let n = 0
    sceneSteps.forEach((s, i) => {
      const r = s.getBoundingClientRect()
      if (r.top < mid) n = i
      rail[i]?.style.setProperty('--fill', Math.min(1, Math.max(0, (mid - r.top) / r.height)).toFixed(3))
    })
    setScene(n)
  }
}
if (!still) {
  addEventListener('scroll', () => ticking || ((ticking = true), requestAnimationFrame(frame)), { passive: true })
  addEventListener('resize', frame)
  frame()
} else if (film) film.style.setProperty('--flat', 1)

// Token field: a grid of short bars, each a token. Waves of use light some in the accent; the pointer
// lights the ones around it. Low contrast on purpose: it sits behind the headline, never on top of it.
const field = document.querySelector('.field')
if (field && !still) {
  const ctx = field.getContext('2d')
  const hero = field.parentElement
  const css = getComputedStyle(document.documentElement)
  // the grey bars never change, so they are drawn once to a second canvas and copied each frame
  const base = document.createElement('canvas'), bctx = base.getContext('2d')
  let line, accent, W, H, dpr = 1, cells = [], on = true, mx = -1e4, my = -1e4
  const paintBase = () => {
    base.width = field.width; base.height = field.height
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    bctx.fillStyle = line
    for (const c of cells) bctx.fillRect(c.x, c.y, c.len, 2)
  }
  const colors = () => ((line = css.getPropertyValue('--line').trim()), (accent = css.getPropertyValue('--accent').trim()), cells.length && paintBase())
  const size = () => {
    dpr = Math.min(devicePixelRatio || 1, 1.5)
    W = hero.clientWidth; H = hero.clientHeight
    field.width = W * dpr; field.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const gx = W < 600 ? 26 : 28, gy = W < 600 ? 22 : 22
    cells = []
    for (let y = gy / 2; y < H; y += gy)
      for (let x = gx / 2; x < W; x += gx)
        cells.push({ x, y, len: 6 + ((x * 7 + y * 13) % 9), seed: (x * 12.9898 + y * 78.233) % 6.283 })
    paintBase()
  }
  addEventListener('pointermove', (e) => { const r = field.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top }, { passive: true })
  hero.addEventListener('pointerleave', () => ((mx = -1e4), (my = -1e4)))
  new IntersectionObserver(([e]) => (on = e.isIntersecting)).observe(hero)
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', colors)
  addEventListener('resize', size)
  colors(); size()
  // 30 frames a second is plenty for a slow wave, and halves the work on a phone
  let last = 0
  const draw = (t) => {
    requestAnimationFrame(draw)
    if (!on || document.hidden || t - last < 32) return
    last = t
    t /= 1000
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.clearRect(0, 0, field.width, field.height)
    ctx.drawImage(base, 0, 0)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = accent
    for (const c of cells) {
      // two slow diagonal waves along the brand's 45 degree line, and a flicker per token
      const wave = Math.sin((c.x + c.y) / 160 - t * 0.9) * 0.6 + Math.sin((c.x - c.y) / 230 + t * 0.55) * 0.4
      const lit = Math.max(0, wave * 0.5 + Math.sin(t * 2.1 + c.seed * 3) * 0.5 - 0.55) * 2.2
      const d = Math.hypot(c.x - mx, c.y - my)
      const near = d < 140 ? (1 - d / 140) ** 2 : 0
      const a = Math.min(1, lit + near)
      if (a > 0.02) {
        ctx.globalAlpha = a * 0.55
        ctx.fillRect(c.x, c.y, c.len * (0.4 + a * 0.6), 2)
      }
    }
  }
  requestAnimationFrame(draw)
}
