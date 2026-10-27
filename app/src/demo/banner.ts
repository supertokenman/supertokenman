// The strip that says what this page is: sample data, nothing sent. It sits over the app, never in it.
export function installBanner() {
  const bar = document.createElement('div')
  bar.className = 'demo-banner'
  bar.setAttribute('role', 'note')
  bar.innerHTML =
    '<span class="demo-tag">LIVE DEMO</span>' +
    '<span class="demo-text">The real interface with sample data, running in your browser. Nothing is sent anywhere. Projects, numbers and replies are made up.</span>' +
    '<a class="demo-link" href="/download/">Download</a>' +
    '<button class="demo-close" type="button" aria-label="Hide this note">\u00d7</button>'
  bar.querySelector('.demo-close')!.addEventListener('click', () => bar.remove())
  document.body.appendChild(bar)
}
