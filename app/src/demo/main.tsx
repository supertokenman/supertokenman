// Demo entry: the fake bridge first, then the real app's own entry, unchanged.
import './bridge'
import './demo.css'
import { installBanner } from './banner'
import { dateKey } from '../day'
import { AUTO } from './autoplay'

const NOITE = {
  id: 'custom',
  name: 'Noite',
  scheme: 'dark',
  c: { bg: '#0c0d10', surface: '#14161a', raised: '#1b1e23', hover: '#23262c', sunken: '#08090b', text: '#eef0f4', muted: '#a9aeb8', faint: '#7b808a', accent: '#ff6a2b', accentHover: '#ff8550', deep: '#e8551c', glow: '#ffb08a', onAccent: '#0c0d10', green: '#8fd19e', red: '#ff7a6b', gold: '#e0b066', blue: '#9fb7e0' },
}

try {
  // a visitor lands in the panels, not in the first-run tour or a workspace from another visit
  localStorage.setItem('stm.tour.seen', '1')
  localStorage.setItem('stm.tour.done', '1')
  localStorage.removeItem('stm.workspace')
  // the morning brief would cover the panels on a first look
  localStorage.setItem('stm.brief', dateKey())
  // the site's own colours (Noite, docs/BRAND.md) as the app's custom theme
  localStorage.setItem('stm.customTheme', JSON.stringify(NOITE))
  localStorage.setItem('stm.theme', 'custom')
  if (AUTO.on) {
    // playing in the home page: no opening film, no note over the app (the page says it is sample data)
    localStorage.setItem('stm.motion.boot', 'off')
    localStorage.setItem('stm.layout', 'columns')
    localStorage.setItem('stm.intro.last', new Date().toISOString().slice(0, 10))
  }
} catch {
  // storage blocked: the tour just shows
}
if (AUTO.on) document.documentElement.classList.add('demo-auto')
else installBanner()
void import('../main')
