// Demo entry: the fake bridge first, then the real app's own entry, unchanged.
import './bridge'
import './demo.css'
import { installBanner } from './banner'
import { dateKey } from '../day'

try {
  // a visitor lands in the panels, not in the first-run tour or a workspace from another visit
  localStorage.setItem('stm.tour.seen', '1')
  localStorage.setItem('stm.tour.done', '1')
  localStorage.removeItem('stm.workspace')
  // the morning brief would cover the panels on a first look
  localStorage.setItem('stm.brief', dateKey())
} catch {
  // storage blocked: the tour just shows
}
installBanner()
void import('../main')
