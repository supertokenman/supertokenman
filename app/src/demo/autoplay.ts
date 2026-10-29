// `?autoplay=1`: the demo plays its scripted turn by itself, for the hero of the home page. A cursor
// moves to Allow on the `npm test` approval and clicks it, the turn finishes, and after a pause the page
// starts over. The embedding page sends {stm: 'pause' | 'play'} (same origin only) when the frame leaves
// or enters the screen. With reduced motion the script runs straight to its last frame and stays there.
// Without the parameter nothing here does anything.
const query = new URLSearchParams(location.search)
export const AUTO = {
  on: query.get('autoplay') === '1',
  still: matchMedia('(prefers-reduced-motion: reduce)').matches,
}

let paused = false
const waiting: Array<() => void> = []
const resume = () => waiting.splice(0).forEach((go) => go())
if (AUTO.on) {
  addEventListener('message', (e) => {
    if (e.origin !== location.origin) return
    const m = (e.data as { stm?: string } | null)?.stm
    if (m === 'pause') paused = true
    if (m === 'play') (paused = false), resume()
  })
  document.addEventListener('visibilitychange', () => !document.hidden && !paused && resume())
}

/** Resolves at once while playing; while paused (or the tab is hidden), when play comes back. */
export const gate = () =>
  AUTO.on && (paused || document.hidden) ? new Promise<void>((go) => waiting.push(go)) : Promise.resolve()

const sleep = async (ms: number) => {
  await gate()
  await new Promise((r) => setTimeout(r, AUTO.still ? 0 : ms))
}

async function find(pick: () => HTMLElement | undefined) {
  for (let i = 0; i < 100; i++) {
    const el = pick()
    if (el) return el
    await new Promise((r) => setTimeout(r, 50))
  }
  return null
}

let cur: HTMLDivElement | null = null
/** The visible cursor travels to a control, presses it, and the real control gets the click. */
async function pointAndClick(el: HTMLElement) {
  if (AUTO.still) return el.click()
  if (!cur) {
    cur = document.createElement('div')
    cur.className = 'demo-cursor'
    cur.setAttribute('aria-hidden', 'true')
    cur.innerHTML = '<svg viewBox="0 0 20 24" width="26" height="31"><path d="M2 2v18l5-5 3.5 7 3-1.5-3.5-6.8H17Z" fill="#fff" stroke="#0c0d10" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    cur.style.transform = `translate(${Math.round(innerWidth * 0.62)}px, ${Math.round(innerHeight + 20)}px)`
    document.body.appendChild(cur)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    cur.classList.add('go')
  }
  const r = el.getBoundingClientRect()
  cur.classList.remove('down', 'gone')
  cur.style.transform = `translate(${Math.round(r.left + r.width * 0.55)}px, ${Math.round(r.top + r.height * 0.55)}px)`
  await sleep(1050)
  el.classList.add('demo-press')
  cur.classList.add('down')
  await sleep(380)
  el.click()
  el.classList.remove('demo-press')
  await sleep(450)
  cur.classList.remove('down')
}

/** Allow on the `npm test` approval. */
export async function clickAllow() {
  const btn = await find(() => Array.from(document.querySelectorAll<HTMLElement>('.ask-actions button.primary')).find((b) => b.textContent?.trim() === 'Allow'))
  if (!btn) return
  await sleep(1300)
  await pointAndClick(btn)
}

/** After the turn: hold the last frame, then start over (the page fades out and loads again). */
export async function loopLater() {
  // reduced motion: the last frame is the finished turn in the chat, and it stays
  if (AUTO.still) return
  // then the first panel's Changes tab, where the diff of the fix is
  await sleep(1200)
  const tabs = Array.from(document.querySelectorAll<HTMLElement>('button, [role="tab"]')).filter((b) => /^Changes/.test(b.textContent?.trim() ?? ''))
  const first = tabs.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0]
  if (first) await pointAndClick(first)
  cur?.classList.add('gone')
  await sleep(7000)
  document.documentElement.classList.add('demo-leaving')
  await sleep(450)
  location.reload()
}
