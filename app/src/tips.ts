// Tooltips for the whole window, in the app's own look. The system tooltip from `title` does not show
// over the window's drag area (the top bar) and looks foreign elsewhere, so `title` is moved to
// `data-tip` on first hover and drawn here. A button with an icon only and an aria-label gets one too.

const DELAY = 380

let tip: HTMLDivElement | null = null
let timer = 0
let current: Element | null = null

function textOf(el: Element): string {
  const t = el.getAttribute('title')
  if (t) {
    el.setAttribute('data-tip', t)
    el.removeAttribute('title')
  }
  const own = el.getAttribute('data-tip')
  if (own) return own
  // an icon button: its accessible name is the only words it has
  if (el.tagName === 'BUTTON' && !el.textContent?.trim()) return el.getAttribute('aria-label') ?? ''
  return ''
}

function target(from: EventTarget | null): Element | null {
  const el = from instanceof Element ? from : null
  return el?.closest('[title], [data-tip], button[aria-label]') ?? null
}

function hide() {
  window.clearTimeout(timer)
  current = null
  tip?.classList.remove('on')
}

function show(el: Element, text: string) {
  if (!tip) {
    tip = document.createElement('div')
    tip.className = 'tip'
    tip.setAttribute('role', 'tooltip')
    document.body.append(tip)
  }
  tip.textContent = text
  const r = el.getBoundingClientRect()
  tip.style.left = '0px'
  tip.style.top = '0px'
  tip.classList.add('on')
  const w = tip.offsetWidth
  const h = tip.offsetHeight
  const below = r.bottom + 8 + h < window.innerHeight
  const x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8)
  tip.style.left = `${Math.round(x)}px`
  tip.style.top = `${Math.round(below ? r.bottom + 8 : r.top - h - 8)}px`
  tip.dataset.side = below ? 'below' : 'above'
}

export function installTips() {
  document.addEventListener('pointerover', (e) => {
    const el = target(e.target)
    if (el === current) return
    hide()
    if (!el) return
    const text = textOf(el)
    if (!text) return
    current = el
    timer = window.setTimeout(() => current === el && el.isConnected && show(el, text), DELAY)
  })
  document.addEventListener('pointerout', (e) => {
    if (current && !current.contains(e.relatedTarget as Node | null)) hide()
  })
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'blur'] as const) window.addEventListener(ev, hide, { capture: true, passive: true })
}
