// Renders one video from a JSON of variables, then finishes it for delivery with the system's ffmpeg:
// H.264 high profile at a quality that survives the networks' recompression, faststart, and, when a
// music file is given, the track mixed in at -14 LUFS with a fade out. Prints the files it wrote.
//   node render.mjs piece.json out/dir [--music track.mp3]
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.DISABLE_TELEMETRY = 'true'
const here = dirname(fileURLToPath(import.meta.url))
const [jsonPath, outDirArg] = process.argv.slice(2)
const musicIdx = process.argv.indexOf('--music')
const music = musicIdx > 0 ? process.argv[musicIdx + 1] : undefined
const flag = (n) => (process.argv.indexOf(n) > 0 ? process.argv[process.argv.indexOf(n) + 1] : undefined)
const voiceFlag = flag('--voice')
const speedFlag = flag('--speed')
if (!jsonPath || !outDirArg) {
  console.error('usage: node render.mjs piece.json out/dir [--music track.mp3]')
  process.exit(2)
}
const spec = JSON.parse(readFileSync(jsonPath, 'utf8'))
const id = spec.id ?? basename(jsonPath, '.json')
const outDir = resolve(outDirArg)
mkdirSync(outDir, { recursive: true })

// narration first: its lengths decide how long each segment stays on screen
const { segments, timeline, LEAD } = await import('./src/timeline.js')
const data = spec.data ?? spec
const voiceDir = process.env.STM_VOICE_DIR || join(here, '..', 'voice')
const py = existsSync(join(voiceDir, '.venv', 'bin', 'python')) ? join(voiceDir, '.venv', 'bin', 'python') : process.env.STM_PYTHON || 'python3'
const toSay = segments(data).filter((s) => s.say)
const voiced = {}
const voiceFiles = {}
const voiceId = voiceFlag ?? spec.voice ?? 'pf_dora'
// 'eleven:<voice id>' narrates with ElevenLabs (paid, optional); anything else is a local Kokoro voice
const provider = voiceId.startsWith('eleven:') ? 'elevenlabs' : 'kokoro'
const words = {}
let chars = 0
const canSay = provider === 'elevenlabs' ? Boolean(process.env.STM_ELEVENLABS_KEY) : existsSync(join(voiceDir, 'models', 'kokoro-v1.0.onnx'))
if (toSay.length && voiceId !== 'none' && canSay) {
  const job = join(outDir, `${id}_voice.json`)
  writeFileSync(job, JSON.stringify({ provider, voice: voiceId.replace(/^eleven:/, ''), speed: Number(speedFlag ?? spec.voiceSpeed ?? 1.05), lang: spec.lang, out: join(outDir, `${id}_voice`), segments: toSay.map((s) => ({ key: s.key, text: s.say })) }))
  console.log(`Narrating with ${provider === 'elevenlabs' ? 'ElevenLabs' : 'Kokoro'}...`)
  const out = execFileSync(py, [join(voiceDir, 'say.py'), job], { encoding: 'utf8' })
  for (const line of out.split('\n').filter(Boolean)) {
    const r = JSON.parse(line)
    voiced[r.key] = r.seconds
    voiceFiles[r.key] = r.file
    words[r.key] = r.words ?? []
    chars += toSay.find((t) => t.key === r.key)?.say.length ?? 0
  }
  rmSync(job, { force: true })
  if (provider === 'elevenlabs') console.log(`STM_USAGE elevenlabs_chars=${chars}`)
} else if (toSay.length && voiceId !== 'none') console.log(provider === 'elevenlabs' ? 'ElevenLabs is not connected: rendering without voice.' : 'Narration written but the voice engine is not installed: rendering without voice.')
const tl = timeline(data, voiced, words)
data.timeline = tl

const { renderVideo } = await import('@revideo/renderer')
const raw = await renderVideo({
  projectFile: join(here, 'src', 'project.ts'),
  variables: { data },
  settings: {
    outFile: `${id}_raw.mp4`,
    outDir,
    logProgress: true,
    puppeteer: { executablePath: process.env.STM_CHROMIUM || undefined, args: ['--no-sandbox'] },
    viteConfig: { root: here, logLevel: 'error' },
  },
})

const final = join(outDir, `${id}.mp4`)
// a steady 12 Mb/s: flat motion graphics compress to almost nothing, and a thin file is what the
// networks' recompression turns into blocks; delivering high keeps edges and gradients clean
const video = ['-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-b:v', '12M', '-minrate', '12M', '-maxrate', '12M', '-bufsize', '24M', '-x264-params', 'nal-hrd=cbr', '-movflags', '+faststart']
const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', raw]).toString().trim())
// the sound: the voice placed at each segment's start, the music under it ducking while the voice
// speaks, everything at -14 LUFS (the networks' loudness), the music fading out at the end
const voices = tl.filter((s) => voiceFiles[s.key])
const inputs = ['-i', raw]
const parts = []
voices.forEach((s, k) => {
  inputs.push('-i', voiceFiles[s.key])
  parts.push(`[${k + 1}:a]adelay=${Math.round((s.start + LEAD) * 1000)}:all=1[v${k}]`)
})
const hasMusic = music && existsSync(music)
if (hasMusic) inputs.push('-stream_loop', '-1', '-i', music)
const m = voices.length + 1
let graph = parts.join(';')
let outLabel = ''
if (voices.length) {
  graph += `${graph ? ';' : ''}${voices.map((_, k) => `[v${k}]`).join('')}amix=inputs=${voices.length}:normalize=0:duration=longest,apad[voice]`
  outLabel = '[voice]'
}
if (hasMusic && voices.length) {
  graph += `;[${m}:a]volume=0.55[bed];[voice]asplit=2[vk][vm];[bed][vk]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=350[duck];[vm][duck]amix=inputs=2:normalize=0[mix]`
  outLabel = '[mix]'
} else if (hasMusic) outLabel = `[${m}:a]`
if (outLabel) {
  // two-pass loudness: measure the mix, then correct it exactly (one pass misses with ducking)
  const pre = `${graph}${graph ? ';' : ''}${outLabel}afade=t=out:st=${Math.max(0, dur - 1)}:d=1,atrim=0:${dur}[pre]`
  const probe = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...inputs, '-filter_complex', `${pre};[pre]loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json[m]`, '-map', '[m]', '-t', String(dur), '-f', 'null', '-'], { encoding: 'utf8' })
  const j = JSON.parse(/\{[^{}]*"input_i"[^{}]*\}/s.exec(probe.stderr)?.[0] ?? '{}')
  const second = j.input_i
    ? `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`
    : 'loudnorm=I=-14:TP=-1.5:LRA=11'
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', `${pre};[pre]${second}[aout]`, '-map', '0:v', '-map', '[aout]', '-t', String(dur), ...video, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', final])
} else {
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', raw, '-an', ...video, final])
}
rmSync(join(outDir, `${id}_voice`), { recursive: true, force: true })
for (const f of [raw, raw.replace(/\.mp4$/, '-0.mp4'), raw.replace(/\.mp4$/, '-audio.wav'), raw.replace(/\.mp4$/, '-visuals.mp4')]) rmSync(f, { force: true })
console.log(final)
if (spec.caption) {
  const cap = join(outDir, `${id}_legenda.txt`)
  writeFileSync(cap, spec.caption)
  console.log(cap)
}
