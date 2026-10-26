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
        await sleep(2200)
        step(1); await sleep(1100)
        step(2); show('US$0.01'); await sleep(1000)
        step(3); await sleep(1700)
        allow.classList.add('press'); await sleep(260)
        ask.classList.add('done'); step(4); show('US$0.02'); await sleep(1300)
        step(5); show('US$0.04'); await sleep(4200)
        steps.forEach((s) => s.classList.remove('on')); await sleep(600)
      }
    }
    play()
  }
}
