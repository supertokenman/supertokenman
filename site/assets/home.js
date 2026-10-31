// Home: the live demo in the hero (/docs/demo/?autoplay=1), the real interface with sample data. The
// poster shows first; the frame loads after the page, only on wide screens and without reduced motion,
// and is told to pause off screen. No libraries, no network beyond this site.
;(() => {
  const live = document.getElementById('live')
  if (!live || matchMedia('(prefers-reduced-motion: reduce)').matches || !matchMedia('(min-width: 701px)').matches) return
  const box = live.querySelector('.h-live-frame')
  const start = () => {
    const f = document.createElement('iframe')
    f.src = live.dataset.src
    f.title = 'SuperTokenMan live demo, playing by itself'
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin')
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
})()
