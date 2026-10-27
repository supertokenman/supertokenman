// Tooltips for the whole window, in the app's own look: one delegated host reads `data-tip` (the source
// never uses `title`, which draws the system's tooltip; scripts/no-native-ui.mjs keeps it that way).
// A `title` that arrives in rendered HTML is moved to `data-tip` on first hover. A button with an icon
// only and an aria-label gets one too. While shown, the tip describes its element (aria-describedby).

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
  // a table's name cell cut with an ellipsis: the full name
  if (el.tagName === 'TD' && el.scrollWidth > el.clientWidth) return el.textContent?.trim() ?? ''
  return ''
}

function target(from: EventTarget | null): Element | null {
  const el = from instanceof Element ? from : null
  return el?.closest('[title], [data-tip], button[aria-label], table.tbl td:first-child') ?? null
}

const TIP_ID = 'ui-tooltip'
let described: Element | null = null

function hide() {
  window.clearTimeout(timer)
  current = null
  tip?.classList.remove('on')
  if (described) {
    const ids = (described.getAttribute('aria-describedby') ?? '').split(' ').filter((x) => x && x !== TIP_ID)
    if (ids.length) described.setAttribute('aria-describedby', ids.join(' '))
    else described.removeAttribute('aria-describedby')
    described = null
  }
}

function show(el: Element, text: string) {
  if (!tip) {
    tip = document.createElement('div')
    tip.className = 'tip'
    tip.setAttribute('role', 'tooltip')
    tip.id = TIP_ID
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
  // the words are already the element's name when it has no other: no need to read them twice
  if (el.getAttribute('aria-label') !== text) {
    const ids = (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)
    el.setAttribute('aria-describedby', [...ids, TIP_ID].join(' '))
    described = el
  }
}

export function installTooltips() {
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
  // keyboard focus shows the same words as hover, so icon-only row actions are named either way
  document.addEventListener('focusin', (e) => {
    const el = e.target instanceof Element && e.target.matches(':focus-visible') ? target(e.target) : null
    if (!el || el === current) return
    hide()
    const text = textOf(el)
    if (!text) return
    current = el
    timer = window.setTimeout(() => current === el && el.isConnected && show(el, text), DELAY)
  })
  document.addEventListener('focusout', () => hide())
  document.addEventListener('pointerout', (e) => {
    if (current && !current.contains(e.relatedTarget as Node | null)) hide()
  })
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'blur'] as const) window.addEventListener(ev, hide, { capture: true, passive: true })
}
