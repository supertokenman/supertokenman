// Renders every recorded chapter into public/tour, where the app's Tour plays them from.
//
//   node scripts/tour/build.mjs <recordings dir>   (the voice was picked when recording)
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHAPTERS } from './chapters.mjs'

const app = join(import.meta.dirname, '..', '..')
const rec = process.argv[2] ?? 'out/tour'
const out = join(app, 'public', 'tour')
mkdirSync(out, { recursive: true })
const done = []
for (const ch of CHAPTERS) {
  if (!existsSync(join(rec, ch.id, 'track.json'))) continue
  execFileSync('node', [join(app, 'engines', 'revideo', 'tour.mjs'), join(rec, ch.id), join(out, `${ch.id}.mp4`)], { stdio: 'inherit', env: { ...process.env, DISABLE_TELEMETRY: 'true' } })
  done.push(ch.id)
}
writeFileSync(join(out, 'index.json'), JSON.stringify(done))
console.log(`${done.length} chapters in ${out}`)
