// Renders one "Ask the agent" beat: the protocol answer (voice and word timings from say.py), the
// dive into the real screen (a proof rendered by tour.mjs), and the sound: voice, a whoosh made here,
// and the proof's own narration from the moment the portal opens.
//
//   node ask.mjs <beat.json> <answer voice dir> <proof.webm> <proof audio.wav> <out.mp4>
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const here = import.meta.dirname
const [beatFile, voiceDir, proofWebm, proofWav, outFile] = process.argv.slice(2).map((p) => resolve(p))
process.chdir(here)
const spec = JSON.parse(readFileSync(beatFile, 'utf8'))
const PORT = Number(process.env.STM_TOUR_PORT ?? 9342)
const pub = join(here, 'public', 'ask-render')
rmSync(pub, { recursive: true, force: true })
mkdirSync(pub, { recursive: true })
cpSync(proofWebm, join(pub, 'proof.webm'))
cpSync(spec.hero, join(pub, 'hero.svg'))

// the answer streams paragraph by paragraph, each when the one before is said; the dive follows
const probe = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim())
const norm = (w) => w.toLowerCase().replace(/[^\w]/g, '')
let at = 0.6 + spec.question.length * 0.032 + 0.25 + 0.6
const paragraphs = spec.paragraphs.map((p, i) => {
  const words = JSON.parse(readFileSync(join(voiceDir, `a${i + 1}.json`), 'utf8'))
  const bold = (p.bold ?? '').split(' ').map(norm).filter(Boolean)
  const para = { at, file: join(voiceDir, `a${i + 1}.wav`), words: words.map((w) => ({ w: w.w, s: w.s, style: p.key && norm(w.w) === norm(p.key) ? 'key' : bold.includes(norm(w.w)) ? 'bold' : undefined })) }
  at += probe(para.file) + 0.25
  return para
})
const dive = at + 0.5
const proofSeconds = probe(proofWebm)
const brand = { bg: '#141413', surface: '#1f1e1b', border: '#3a3833', text: '#f4efe6', muted: '#8f8d86', accent: '#d97757', display: 'SuperToken Display', font: 'Inter, -apple-system, system-ui, sans-serif', mono: 'ui-monospace, Menlo, monospace' }
const beat = { question: spec.question, step: spec.step, paragraphs: paragraphs.map(({ at, words }) => ({ at, words })), dive, proofSeconds, video: `http://127.0.0.1:${PORT}/ask-render/proof.webm`, hero: `http://127.0.0.1:${PORT}/ask-render/hero.svg`, brand }

const { renderVideo } = await import('@revideo/renderer')
const raw = await renderVideo({
  projectFile: join(here, 'src', 'ask.ts'),
  variables: { beat },
  settings: { outFile: 'ask_raw.mp4', outDir: join(here, 'output'), logProgress: false, puppeteer: { executablePath: process.env.STM_CHROMIUM || undefined, args: ['--no-sandbox'] }, viteBasePort: PORT, viteConfig: { root: here, logLevel: 'error' } },
})
rmSync(pub, { recursive: true, force: true })

// the sound: a music bed ducked under the voice, a riser into the dive, the hit, the proof, a whoosh out
const sfx = spec.sfx
const whoosh = join(dirname(outFile), 'whoosh.wav')
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anoisesrc=d=1.0:c=pink:a=0.5', '-af', 'highpass=f=300,lowpass=f=6000,afade=t=in:d=0.6:curve=exp,afade=t=out:st=0.6:d=0.4,volume=0.6', whoosh])
const riser = probe(sfx.riser)
const fx = [[sfx.riser, Math.max(0, dive - riser), 0.8], [sfx.impact, dive, 1.1], [proofWav, dive + 0.2, 1], [whoosh, dive + proofSeconds, 0.9]]
const inputs = ['-i', raw, '-i', sfx.bed, ...paragraphs.flatMap((p) => ['-i', p.file]), ...fx.flatMap(([f]) => ['-i', f])]
const d = (k, t) => `adelay=${Math.round(t * 1000)}:all=1`
const nv = paragraphs.length
const voice = paragraphs.map((p, k) => `[${k + 2}:a]${d(k, p.at)},aresample=44100,aformat=channel_layouts=stereo[v${k}]`).join(';') + `;${paragraphs.map((_, k) => `[v${k}]`).join('')}amix=inputs=${nv}:normalize=0,asplit=2[voice][key]`
const effects = fx.map(([, t, g], k) => `[${k + 2 + nv}:a]${d(k, t)},volume=${g},aresample=44100,aformat=channel_layouts=stereo[f${k}]`).join(';')
const bed = `[1:a]aresample=44100,aformat=channel_layouts=stereo,volume=0.55,afade=t=out:st=${(dive + proofSeconds + 0.8).toFixed(2)}:d=1.5[bed0];[bed0][key]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=350[bed]`
const mix = `${voice};${effects};${bed};[voice][bed]${fx.map((_, k) => `[f${k}]`).join('')}amix=inputs=${fx.length + 2}:normalize=0:duration=longest,loudnorm=I=-14:TP=-1.2[aout]`
mkdirSync(dirname(outFile), { recursive: true })
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', mix, '-map', '0:v', '-map', '[aout]', '-shortest', '-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', outFile])
rmSync(raw, { force: true })
console.log(outFile, `dive at ${dive.toFixed(2)} s`)
