// Phase 103: the zoom regions of a recorded tour chapter, as a small editor on the command line.
//   node zoom.mjs <chapter dir>                      find them from the clicks (or show the saved ones)
//   node zoom.mjs <chapter dir> --reset              find them again, dropping hand edits
//   node zoom.mjs <chapter dir> --drop 2             delete region 2
//   node zoom.mjs <chapter dir> --set 1 start=3.2 end=6 z=1.8 x=600 y=400
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { zoomRegions } from './src/tourTrack.js'

const [dir, ...rest] = process.argv.slice(2)
if (!dir) (console.error('usage: node zoom.mjs <chapter dir> [--reset | --drop N | --set N key=value...]'), process.exit(1))
const track = JSON.parse(readFileSync(join(dir, 'track.json'), 'utf8'))
const file = join(dir, 'zoom.json')
let regions = existsSync(file) && !rest.includes('--reset') ? JSON.parse(readFileSync(file, 'utf8')).regions : zoomRegions(track)
const n = (flag) => Number(rest[rest.indexOf(flag) + 1]) - 1
if (rest.includes('--drop')) regions = regions.filter((_, i) => i !== n('--drop'))
if (rest.includes('--set')) {
  const i = n('--set')
  if (!regions[i]) (console.error(`no region ${i + 1}`), process.exit(1))
  for (const kv of rest.slice(rest.indexOf('--set') + 2)) {
    const [k, v] = kv.split('=')
    if (['start', 'end', 'x', 'y', 'z'].includes(k) && Number.isFinite(Number(v))) regions[i][k] = Number(v)
  }
}
regions.sort((a, b) => a.start - b.start)
writeFileSync(file, JSON.stringify({ about: 'Zoom regions found from the clicks. Delete or change any, then render again.', regions }, null, 2))
console.log(regions.map((r, i) => `${i + 1}. ${r.start.toFixed(1)}s to ${r.end.toFixed(1)}s  at ${r.x},${r.y}  zoom ${r.z}`).join('\n') || 'No clicks, no zoom.')
