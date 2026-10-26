// Everything on screen is a function of the timeline's time, drawn on every seek: the same frame
// always comes out the same, as the renderer asks for them in any order.
const t = window.TOUR
const b = t.brand
const root = document.getElementById('root')
for (const [k, v] of Object.entries({ bg: b.bg, text: b.text, accent: b.accent })) root.style.setProperty(`--${k}`, v)
const FW = 1680, FH = 1050, CARD_W = 700
const s = FW / t.width
const screen = document.getElementById('screen')
const cursor = document.getElementById('cursor')
const ripple = document.getElementById('ripple')
const keys = document.getElementById('keys')

const side = (st) => (st.box && (st.box.x + st.box.w / 2) / t.width < 0.5 && (st.box.y + st.box.h / 2) / t.height > 0.55 ? 1 : -1)
const cards = t.steps.map((st, i) => {
  const card = document.createElement('div')
  card.className = 'card'
  card.style.left = `${960 + side(st) * (FW / 2 - CARD_W / 2 - 28) - CARD_W / 2}px`
  const kicker = Object.assign(document.createElement('div'), { className: 'kicker', textContent: `${t.title.toUpperCase()} · ${String(i + 1).padStart(2, '0')} / ${String(t.steps.length).padStart(2, '0')}` })
  const title = Object.assign(document.createElement('div'), { className: 'title', textContent: st.title })
  const line = Object.assign(document.createElement('div'), { className: 'line' })
  card.append(kicker, title, line)
  document.getElementById('cards').append(card)
  return { card, line, words: (st.say ?? '').split(/\s+/).filter(Boolean) }
})
const keyStep = t.steps.find((st) => st.kind === 'key' && st.keys)
for (const k of (keyStep?.keys ?? '').split(' ').filter(Boolean)) keys.append(Object.assign(document.createElement('b'), { textContent: k.toUpperCase() }))
const keyAt = t.events.find((e) => e.e === 'keys')?.t ?? -9

const toFrame = (p, c) => [FW / 2 + (p[0] - c.x) * s * c.z, FH / 2 + (p[1] - c.y) * s * c.z]
const outBack = (v) => 1 + 2.2 * (v - 1) ** 3 + 1.2 * (v - 1) ** 2

function draw(now) {
  const c = cameraAt(t, now)
  screen.style.transform = `translate(${(t.width / 2 - c.x) * s * c.z}px, ${(t.height / 2 - c.y) * s * c.z}px) scale(${c.z})`
  const [cx, cy] = toFrame(cursorAt(t, now), c)
  cursor.style.transform = `translate(${cx}px, ${cy}px) scale(${1.3 * (1 - 0.18 * pressAt(t, now))})`
  const r = rippleAt(t, now)
  if (r) {
    const [rx, ry] = toFrame(r.at, c)
    const d = 20 + 120 * r.r
    ripple.style.transform = `translate(${rx - d / 2}px, ${ry - d / 2}px)`
    ripple.style.width = ripple.style.height = `${d}px`
    ripple.style.opacity = 0.9 * r.a
  } else ripple.style.opacity = 0
  const cap = captionAt(t, now)
  cards.forEach(({ card, line, words }, i) => {
    if (!cap || cap.i !== i) return (card.style.opacity = 0)
    const inn = Math.min(1, cap.since / 0.35)
    const out = Math.min(1, Math.max(0, cap.left / 0.3))
    card.style.opacity = Math.min(inn, out)
    card.style.transform = `translateY(calc(-50% + ${24 * (1 - outBack(inn))}px))`
    line.textContent = words.slice(0, cap.said).join(' ')
  })
  const dk = now - keyAt
  const kv = dk < -0.05 ? 0 : dk < 0.25 ? (dk + 0.05) / 0.3 : dk < 1.3 ? 1 : Math.max(0, 1 - (dk - 1.3) / 0.3)
  keys.style.opacity = kv
  keys.style.transform = `translate(-50%, -50%) scale(${0.85 + 0.15 * outBack(Math.min(1, Math.max(0, (dk + 0.05) / 0.3)))})`
}

const tl = gsap.timeline({ paused: true })
// an empty span gives the timeline its length; the picture comes from draw()
tl.set({}, {}, t.duration)
tl.eventCallback('onUpdate', () => draw(tl.time()))
draw(0)
window.__timelines = window.__timelines || {}
window.__timelines.tour = tl
