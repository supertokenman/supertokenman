// Renders the "Ask the agent" trailer cut: one voice from the answer straight into fast cuts of the
// real app. The plan (voice timings, cuts, dive) comes from a JSON made beside the footage.
//
//   node trailer.mjs <spec.json> <out.mp4>
// spec: { question, step, key, voice: {key: {file, words}}, plan: {D0, OUT, END, at, cuts}, answer: [keys],
//         outro: key, accents: [words], footage, hero, fragments: [png], sfx: {bed, riser, impact} }
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const here = import.meta.dirname
const [specFile, outFile] = process.argv.slice(2).map((p) => resolve(p))
process.chdir(here)
const spec = JSON.parse(readFileSync(specFile, 'utf8'))
const PORT = Number(process.env.STM_TOUR_PORT ?? 9342)
const pub = join(here, 'public', 'ask-render')
rmSync(pub, { recursive: true, force: true })
mkdirSync(pub, { recursive: true })
cpSync(spec.footage, join(pub, 'footage.webm'))
cpSync(spec.hero, join(pub, 'hero.svg'))
const fragments = (spec.fragments ?? []).map((f, i) => (cpSync(f, join(pub, `frag${i}.png`)), `http://127.0.0.1:${PORT}/ask-render/frag${i}.png`))

const { plan, voice } = spec
const norm = (w) => w.toLowerCase().replace(/[^\w]/g, '')
const accents = new Set(spec.accents.map(norm))
const wordsOf = (k) => voice[k].words.map((w) => ({ w: w.w, s: plan.at[k] + w.s, ...(accents.has(norm(w.w)) ? { key: true } : {}) }))
const answer = spec.answer.flatMap(wordsOf)
const beat = {
  question: spec.question,
  step: spec.step,
  answer,
  keyIndex: answer.findIndex((w) => norm(w.w) === norm(spec.key)),
  dive: plan.D0,
  out: plan.OUT,
  end: plan.END,
  cuts: plan.cuts.map((c) => ({ start: c.start, end: c.end, words: c.keys.flatMap(wordsOf) })),
  outro: wordsOf(spec.outro),
  fragments,
  video: `http://127.0.0.1:${PORT}/ask-render/footage.webm`,
  hero: `http://127.0.0.1:${PORT}/ask-render/hero.svg`,
  brand: { bg: '#141413', surface: '#1f1e1b', border: '#3a3833', text: '#f4efe6', muted: '#8f8d86', accent: '#d97757', display: 'SuperToken Display', font: 'Inter, -apple-system, system-ui, sans-serif', mono: 'ui-monospace, Menlo, monospace' },
}

const { renderVideo } = await import('@revideo/renderer')
const raw = await renderVideo({
  projectFile: join(here, 'src', 'ask3.ts'),
  variables: { beat },
  settings: { outFile: 'trailer_raw.mp4', outDir: join(here, 'output'), logProgress: false, puppeteer: { executablePath: process.env.STM_CHROMIUM || undefined, args: ['--no-sandbox'] }, viteBasePort: PORT, viteConfig: { root: here, logLevel: 'error' } },
})
rmSync(pub, { recursive: true, force: true })

// the sound: one voice on a stage (compressed, a short hall), the bed ducking under it, a riser into
// the dive, a hit on the dive and a lighter one on every cut, a whoosh out
const probe = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim())
const whoosh = join(dirname(outFile), 'whoosh.wav')
mkdirSync(dirname(outFile), { recursive: true })
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anoisesrc=d=0.9:c=pink:a=0.5', '-af', 'highpass=f=400,lowpass=f=7000,afade=t=in:d=0.5:curve=exp,afade=t=out:st=0.5:d=0.4,volume=0.6', whoosh])
const lines = Object.entries(plan.at).map(([k, t]) => [voice[k].file, t])
const fx = [[spec.sfx.riser, Math.max(0, plan.D0 - probe(spec.sfx.riser)), 0.9], [spec.sfx.impact, plan.D0, 1.2], ...plan.cuts.slice(1).map((c) => [spec.sfx.impact, c.start, 0.45]), [whoosh, plan.OUT - 0.3, 0.9], [spec.sfx.impact, plan.OUT + 0.2, 0.8]]
const inputs = ['-i', raw, '-i', spec.sfx.bed, ...lines.flatMap(([f]) => ['-i', f]), ...fx.flatMap(([f]) => ['-i', f])]
const st = 'aresample=44100,aformat=channel_layouts=stereo'
const nv = lines.length
const voiceBus = lines.map(([, t], k) => `[${k + 2}:a]adelay=${Math.round(t * 1000)}:all=1,${st}[v${k}]`).join(';') + `;${lines.map((_, k) => `[v${k}]`).join('')}amix=inputs=${nv}:normalize=0,highpass=f=90,equalizer=f=3200:t=q:w=1:g=3,equalizer=f=180:t=q:w=1:g=2,acompressor=threshold=0.08:ratio=4:attack=5:release=120:makeup=2,aecho=0.85:0.6:45|90:0.18|0.1,asplit=2[voice][key]`
const effects = fx.map(([, t, g], k) => `[${k + 2 + nv}:a]adelay=${Math.round(t * 1000)}:all=1,volume=${g},${st}[f${k}]`).join(';')
const bed = `[1:a]${st},volume=0.7,afade=t=out:st=${(plan.END - 1.2).toFixed(2)}:d=1.2[bed0];[bed0][key]sidechaincompress=threshold=0.04:ratio=5:attack=15:release=250[bed]`
const mix = `${voiceBus};${effects};${bed};[voice][bed]${fx.map((_, k) => `[f${k}]`).join('')}amix=inputs=${fx.length + 2}:normalize=0:duration=longest,loudnorm=I=-14:TP=-1.2[aout]`
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', mix, '-map', '0:v', '-map', '[aout]', '-shortest', '-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', outFile])
rmSync(raw, { force: true })
console.log(outFile)
