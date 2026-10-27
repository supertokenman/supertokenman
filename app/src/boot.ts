// The opening and closing of the window: index.html paints the opening before any script; this hands
// over to the app with a wipe, and plays the closing when the main process asks. Off: stm.motion.boot.
const KEY = 'stm.motion.boot'
const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
export const bootOn = () => read(KEY) !== 'off' && !matchMedia('(prefers-reduced-motion: reduce)').matches
export const setBootOn = (on: boolean) => {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // the setting is a convenience
  }
}

/** After the first render: the plain dark cover gives way to the opening. */
export function handOver() {
  const el = document.getElementById('boot')
  if (!el) return
  // the dark opening (Splash) is on screen by now, in the same colour; the plain cover steps aside
  el.classList.add('out')
  setTimeout(() => el.remove(), 300)
}

/** The closing: the window's dark fades back over the app with the name; the main process waits for it, never more than a moment. */
export function playClosing(done: () => void) {
  if (!bootOn()) return done()
  const tpl = document.createElement('div')
  tpl.id = 'boot'
  tpl.className = 'bye'
  tpl.setAttribute('aria-hidden', 'true')
  tpl.innerHTML =
    '<div><svg class="boot-mark" viewBox="262 318 500 388" width="96" height="74"><path d="M262 318H704L762 376V406H262Z"/><rect x="262" y="468" width="340" height="88"/><rect class="acc" x="262" y="618" width="180" height="88"/></svg><span class="boot-name">SuperTokenMan</span></div>'
  document.getElementById('boot')?.remove()
  document.body.append(tpl)
  // on macOS the window only hides: the cover comes off once it is out of sight
  tpl.addEventListener('animationend', (e) => e.target === tpl && void setTimeout(() => (done(), setTimeout(() => tpl.remove(), 900)), 200))
}
