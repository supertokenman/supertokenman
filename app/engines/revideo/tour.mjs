// Renders a tour chapter filmed by scripts/tour/record.mjs: the footage, the drawn cursor, clicks,
// camera and captions from its track, and the narration placed where each step starts.
//
//   node tour.mjs <chapter dir with track.json and screen.webm> <out.mp4>
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const here = import.meta.dirname
const [dir, outFile] = process.argv.slice(2).map((p) => resolve(p))
// Revideo reads media from <cwd>/public
process.chdir(here)
if (!dir || !outFile) {
  console.error('usage: node tour.mjs <chapter dir> <out.mp4>')
  process.exit(1)
}
const track = JSON.parse(readFileSync(join(dir, 'track.json'), 'utf8'))
const id = track.id
const outDir = dirname(outFile)
mkdirSync(outDir, { recursive: true })

// the footage goes where the render's web server can read it
const pub = join(here, 'public', 'tour-tmp', id)
rmSync(pub, { recursive: true, force: true })
mkdirSync(pub, { recursive: true })
cpSync(join(dir, 'screen.webm'), join(pub, 'screen.webm'))
// the browser and Revideo's ffmpeg decoder must name the footage the same way: its full URL on the
// render's own web server, on a fixed port
const PORT = Number(process.env.STM_TOUR_PORT ?? 9341)

const brand = { bg: '#141413', surface: '#1f1e1b', text: '#f4efe6', muted: '#b0aea5', accent: '#d97757', display: 'SuperToken Display', font: 'Inter, -apple-system, system-ui, sans-serif' }
// phase 103: zoom regions from the clicks, kept in zoom.json next to the recording so they can be
// edited (delete one, nudge start, end, place or zoom) before the next render; --auto-zoom makes it
const zoomFile = join(dir, 'zoom.json')
let zoom = existsSync(zoomFile) ? JSON.parse(readFileSync(zoomFile, 'utf8')).regions : undefined
if (!zoom && process.argv.includes('--auto-zoom')) {
  const { zoomRegions } = await import('./src/tourTrack.js')
  zoom = zoomRegions(track)
  writeFileSync(zoomFile, JSON.stringify({ about: 'Zoom regions found from the clicks. Delete or change any, then render again.', regions: zoom }, null, 2))
}
const tour = { ...track, ...(zoom ? { zoom } : {}), video: `http://127.0.0.1:${PORT}/tour-tmp/${id}/screen.webm`, brand }

const { renderVideo } = await import('@revideo/renderer')
const raw = await renderVideo({
  projectFile: join(here, 'src', 'tour.ts'),
  variables: { tour },
  settings: {
    outFile: `${id}_raw.mp4`,
    // Revideo looks for media in <outDir>/../public
    outDir: join(here, 'output'),
    logProgress: true,
    puppeteer: { executablePath: process.env.STM_CHROMIUM || process.env.PUPPETEER_EXECUTABLE_PATH || undefined, args: ['--no-sandbox'] },
    viteBasePort: PORT,
    viteConfig: { root: here, logLevel: 'error' },
  },
})
rmSync(pub, { recursive: true, force: true })

// screen footage is mostly flat: a quality target keeps it sharp and small enough to ship
const video = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']
const voices = track.steps.filter((s) => s.voice)
const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', raw]).toString().trim())
if (voices.length) {
  const inputs = ['-i', raw, ...voices.flatMap((s) => ['-i', s.voice.file])]
  const pre = voices.map((s, k) => `[${k + 1}:a]adelay=${Math.round(s.voice.at * 1000)}:all=1[v${k}]`).join(';') + `;${voices.map((_, k) => `[v${k}]`).join('')}amix=inputs=${voices.length}:normalize=0,apad[pre]`
  const probe = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...inputs, '-filter_complex', `${pre};[pre]loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json[m]`, '-map', '[m]', '-t', String(dur), '-f', 'null', '-'], { encoding: 'utf8' })
  const j = JSON.parse(/\{[^{}]*"input_i"[^{}]*\}/.exec(probe.stderr)?.[0] ?? 'null')
  const norm = j ? `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true` : 'loudnorm=I=-16:TP=-1.5:LRA=11'
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', `${pre};[pre]${norm}[aout]`, '-map', '0:v', '-map', '[aout]', '-t', String(dur), ...video, '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', outFile])
} else execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', raw, '-an', ...video, outFile])
for (const f of [raw, raw.replace(/\.mp4$/, '-0.mp4'), raw.replace(/\.mp4$/, '-audio.wav'), raw.replace(/\.mp4$/, '-visuals.mp4')]) rmSync(f, { force: true })
// the steps, for the Tour sheet's chapter list and for people who watch muted
writeFileSync(outFile.replace(/\.mp4$/, '.json'), JSON.stringify({ id, title: track.title, try: track.try, steps: track.steps.map((s) => ({ title: s.title, say: s.say, start: s.start, dur: s.end - s.start })) }, null, 2))
console.log(outFile)
