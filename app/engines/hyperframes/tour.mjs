// A tour chapter filmed by scripts/tour/record.mjs, rendered with HyperFrames instead of Revideo: the
// same track and the same pure functions of time (../revideo/src/tourTrack.js), drawn in HTML and CSS.
// The narration is placed by the composition itself, so no audio mix step is needed afterwards.
//
//   node tour.mjs <chapter dir with track.json and screen.webm> <out.mp4>
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

const here = import.meta.dirname
const [dir, outFile] = process.argv.slice(2).map((p) => resolve(p))
if (!dir || !outFile) {
  console.error('usage: node tour.mjs <chapter dir> <out.mp4>')
  process.exit(1)
}
const track = JSON.parse(readFileSync(join(dir, 'track.json'), 'utf8'))
const brand = { bg: '#141413', text: '#f4efe6', accent: '#d97757' }

// the project HyperFrames renders: the page and everything it reads, side by side
const proj = join(here, 'out', track.id)
rmSync(proj, { recursive: true, force: true })
mkdirSync(join(proj, 'assets'), { recursive: true })
copyFileSync(join(dir, 'screen.webm'), join(proj, 'assets', 'screen.webm'))
copyFileSync(join(here, 'node_modules', 'gsap', 'dist', 'gsap.min.js'), join(proj, 'assets', 'gsap.min.js'))
copyFileSync(join(here, '..', 'revideo', 'src', 'fonts', 'supertoken-display.woff2'), join(proj, 'assets', 'supertoken-display.woff2'))

const steps = track.steps.map((s, i) => {
  if (!s.voice) return s
  const file = `voice-${i}${s.voice.file.slice(s.voice.file.lastIndexOf('.'))}`
  copyFileSync(s.voice.file, join(proj, 'assets', file))
  return { ...s, voice: { ...s.voice, file: `assets/${file}` } }
})
const audio = steps
  .filter((s) => s.voice)
  .map((s, k) => `<audio id="voice-${k}" src="${s.voice.file}" data-start="${s.voice.at.toFixed(3)}" data-duration="${s.voice.seconds.toFixed(3)}" data-track-index="${k + 1}"></audio>`)
  .join('\n      ')
// the track's functions, as a plain script the page runs before its own
writeFileSync(join(proj, 'assets', 'tourTrack.js'), readFileSync(join(here, '..', 'revideo', 'src', 'tourTrack.js'), 'utf8').replace(/^export /gm, ''))
writeFileSync(join(proj, 'assets', 'track.js'), `window.TOUR = ${JSON.stringify({ ...track, steps, brand })}\n`)
copyFileSync(join(here, 'scene', 'scene.js'), join(proj, 'assets', 'scene.js'))
const html = readFileSync(join(here, 'scene', 'index.html'), 'utf8')
  .replaceAll('__DURATION__', track.duration.toFixed(3))
  .replace('__AUDIO__', () => audio)
writeFileSync(join(proj, 'index.html'), html)

mkdirSync(dirname(outFile), { recursive: true })
// screen recordings are flat UI: frames come out of the footage as PNG to keep text sharp, and the same
// quality target as the Revideo chapters keeps the file small enough to ship
const raw = outFile.replace(/\.mp4$/, '_raw.mp4')
execFileSync(join(here, 'node_modules', '.bin', 'hyperframes'), ['render', proj, '-o', raw, '--video-frame-format', 'png', '--crf', '21', '--quiet'], { stdio: 'inherit' })
// the narration at the level the other chapters use (-16 LUFS), measured first; the picture is copied as is
if (steps.some((s) => s.voice)) {
  const probe = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', raw, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' })
  const j = JSON.parse(/\{[^{}]*"input_i"[^{}]*\}/.exec(probe.stderr)?.[0] ?? 'null')
  const norm = j ? `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true` : 'loudnorm=I=-16:TP=-1.5:LRA=11'
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', raw, '-af', norm, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-movflags', '+faststart', outFile])
  rmSync(raw)
} else renameSync(raw, outFile)
writeFileSync(outFile.replace(/\.mp4$/, '.json'), JSON.stringify({ id: track.id, title: track.title, try: track.try, steps: track.steps.map((s) => ({ title: s.title, say: s.say, start: s.start, dur: s.end - s.start })) }, null, 2))
console.log(`${basename(outFile)}: rendered with HyperFrames`)
