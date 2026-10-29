// Scroll camera: a tall section with a sticky stage; scrolling moves a camera through panes placed in
// CSS 3D. No libraries, no network. Markup:
// <section class="cam" data-camera style="--cam-len: 300vh">
//   <div class="cam-stage"><div class="cam-world">
//     <figure class="cam-pane" style="--x:0; --y:0; --z:0; --ry:0deg">...</figure> ...
//   </div></div>
// </section>
// data-camera-keys: JSON list of camera stops [{x,y,z,rx,ry}] (px and deg), one per stop, spread evenly
// over the scroll length. Default: one stop per pane, looking at it from 600px away.
// Reduced motion: the script does nothing and the CSS shows the panes as a flat column.
;(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) // ease-in-out between stops
  document.querySelectorAll('[data-camera]').forEach((sec) => {
    const world = sec.querySelector('.cam-world'); if (!world) return
    sec.classList.add('cam-on')
    const panes = [...sec.querySelectorAll('.cam-pane')]
    const num = (el, n) => parseFloat(getComputedStyle(el).getPropertyValue(n)) || 0
    const keys = sec.dataset.cameraKeys ? JSON.parse(sec.dataset.cameraKeys)
      : panes.map((p) => ({ x: num(p, '--x'), y: num(p, '--y'), z: num(p, '--z') + 600, rx: 0, ry: num(p, '--ry') }))
    let live = false, queued = false
    const frame = () => {
      queued = false
      const r = sec.getBoundingClientRect(), len = r.height - innerHeight
      const p = Math.min(1, Math.max(0, -r.top / (len || 1))) * (keys.length - 1)
      const i = Math.min(keys.length - 2, Math.floor(p)), a = keys[i], b = keys[i + 1] || a, t = ease(p - i)
      const m = (k) => (a[k] || 0) + ((b[k] || 0) - (a[k] || 0)) * t
      // the world moves opposite to the camera
      world.style.transform = `translateZ(${-m('z')}px) rotateX(${-m('rx')}deg) rotateY(${-m('ry')}deg) translate3d(${-m('x')}px, ${-m('y')}px, 0)`
      sec.style.setProperty('--cam-p', (p / (keys.length - 1)).toFixed(3))
      panes.forEach((pn, k) => pn.toggleAttribute('data-near', Math.abs(p - k) < 0.5))
    }
    const kick = () => { if (live && !queued) { queued = true; requestAnimationFrame(frame) } }
    new IntersectionObserver(([e]) => { live = e.isIntersecting; kick() }).observe(sec)
    addEventListener('scroll', kick, { passive: true }); addEventListener('resize', kick)
    frame()
  })
})()
