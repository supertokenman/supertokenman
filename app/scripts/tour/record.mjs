// Records the tour as real video: the narration is made first, then the app is filmed while a
// script moves the mouse, clicks and types at the pace of the voice. Every move, click and key is
// logged with its time, so the Revideo tour scene can draw the cursor, the click and the camera
// over the footage, and show each spoken word as it is said.
//
//   STM_WINDOW=1440x900 STM_USER_DATA=/tmp/tourdata \
//     xvfb-run -n 77 -s "-screen 0 2880x1800x24" electron . --force-device-scale-factor=2 --remote-debugging-port=9333
//   node scripts/tour/record.mjs out/tour [chapter...]      (env: DISPLAY=:77 and its XAUTHORITY)
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { ASK_CHAPTERS, CHAPTERS } from './chapters.mjs'

const app = join(import.meta.dirname, '..', '..')
const require = createRequire(join(app, 'engines', 'revideo', 'package.json'))
const puppeteer = require('puppeteer-core')

const out = process.argv[2] ?? 'out/tour'
const only = process.argv.slice(3).filter((a) => !a.startsWith('--'))
const voice = process.env.STM_TOUR_VOICE ?? 'af_heart'
const W = 1440
const H = 900
const display = process.env.DISPLAY ?? ':77'

const browser = await puppeteer.connect({ browserURL: process.env.STM_CDP ?? 'http://127.0.0.1:9333', defaultViewport: null })
const page = (await browser.pages()).find((p) => !p.url().startsWith('devtools'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const now = () => Date.now() / 1000
// a fresh profile greets with the tour itself: mark it seen so the recording shows the app
await page.evaluate(() => localStorage.setItem('stm.tour.seen', '1'))
await page.reload()
await sleep(6000)

/** Narration for every step first: its length sets the pace of the recording. */
function narrate(ch, dir) {
  const voiceDir = process.env.STM_VOICE_DIR || join(app, 'engines', 'voice')
  if (voice === 'none' || !existsSync(join(voiceDir, 'models', 'kokoro-v1.0.onnx'))) return {}
  const py = existsSync(join(voiceDir, '.venv', 'bin', 'python')) ? join(voiceDir, '.venv', 'bin', 'python') : process.env.STM_PYTHON || 'python3'
  const job = join(dir, 'voice.json')
  writeFileSync(job, JSON.stringify({ provider: 'kokoro', voice, speed: 1.05, out: join(dir, 'voice'), segments: ch.steps.map((s, i) => ({ key: `s${i}`, text: s.say ?? '' })) }))
  const said = {}
  for (const line of execFileSync(py, [join(voiceDir, 'say.py'), job], { encoding: 'utf8' }).split('\n').filter(Boolean)) {
    const r = JSON.parse(line)
    said[r.key] = r
  }
  rmSync(job, { force: true })
  return said
}

/** Films the screen; resolves the wall-clock second of the first frame. */
function film(file) {
  const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-f', 'x11grab', '-draw_mouse', '0', '-framerate', '30', '-video_size', `${W * 2}x${H * 2}`, '-i', display, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '14', '-pix_fmt', 'yuv420p', file], { stdio: ['pipe', 'ignore', 'pipe'] })
  let err = ''
  const started = new Promise((ok, fail) => {
    ff.stderr.on('data', (b) => {
      err += String(b)
      // x11grab stamps frames with the wall clock: "start: 1761249000.123456"
      const m = /start: (\d+\.\d+)/.exec(err)
      if (m) ok(Number(m[1]))
    })
    ff.on('close', (c) => fail(new Error(`ffmpeg stopped (${c}): ${err.slice(-400)}`)))
  })
  return { started, stop: () => new Promise((ok) => (ff.on('close', ok), ff.stdin.end('q'))) }
}

// the mouse, moved for real (hover states show in the footage) and logged for the drawn cursor
let mx = W - 120
let my = H - 80
const log = []
async function moveTo(x, y, secs = 0.7) {
  const from = [mx, my]
  const t0 = now()
  const n = Math.max(8, Math.round(secs * 60))
  for (let k = 1; k <= n; k++) {
    const e = k / n < 0.5 ? 4 * (k / n) ** 3 : 1 - (-2 * (k / n) + 2) ** 3 / 2
    await page.mouse.move(from[0] + (x - from[0]) * e, from[1] + (y - from[1]) * e)
    await sleep((secs * 1000) / n)
  }
  mx = x
  my = y
  log.push({ e: 'move', t0, t1: now(), from, to: [x, y] })
}
async function click() {
  log.push({ e: 'click', t: now(), at: [mx, my] })
  await page.mouse.down()
  await sleep(90)
  await page.mouse.up()
}

function helpers() {
  const find = async (sel) => {
    const el = await page.waitForSelector(sel, { visible: true, timeout: 8000 })
    if (!el) throw new Error(`not on screen: ${sel}`)
    return el
  }
  const center = async (el) => {
    const b = await el.boundingBox()
    return [Math.round(b.x + Math.min(b.width / 2, 60)), Math.round(b.y + b.height / 2)]
  }
  return {
    page,
    sleep,
    find,
    click: async (sel) => ({ el: await find(sel), kind: 'click', act: async (el) => {
        await moveTo(...(await center(el)))
        await sleep(120)
        await click()
      },
    }),
    type: async (sel, text) => ({
      el: await find(sel),
      kind: 'type',
      text,
      act: async (el) => {
        await moveTo(...(await center(el)))
        await sleep(120)
        await click()
        await page.keyboard.down('Control')
        await page.keyboard.press('a')
        await page.keyboard.up('Control')
        await page.keyboard.press('Backspace')
        await sleep(200)
        log.push({ e: 'type', t0: now(), text })
        await page.keyboard.type(text, { delay: 55 })
      },
    }),
    press: async (keys, sel) => ({
      el: sel ? await find(sel) : null,
      kind: 'key',
      act: async () => {
        log.push({ e: 'keys', t: now() })
        const parts = keys.split('+')
        for (const k of parts) await page.keyboard.down(k)
        for (const k of [...parts].reverse()) await page.keyboard.up(k)
      },
    }),
    look: async (sel) => ({ el: sel ? await find(sel) : null, kind: 'look', act: async () => undefined }),
    /** Moves to an element and clicks it, now: for steps that go through a menu. */
    go: async (sel) => {
      const el = await find(sel)
      await moveTo(...(await center(el)))
      await sleep(120)
      await click()
    },
  }
}

const box = async (el) => {
  if (!el) return null
  const b = await el.boundingBox()
  return b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null
}

for (const ch of [...CHAPTERS, ...ASK_CHAPTERS].filter((c) => (only.length ? only.includes(c.id) : CHAPTERS.includes(c)))) {
  const dir = join(out, ch.id)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const said = narrate(ch, dir)
  const h = helpers()
  if (ch.setup) await ch.setup(h)
  await page.mouse.move(mx, my)
  await sleep(500)
  log.length = 0
  const cam = film(join(dir, 'screen.mp4'))
  const t0 = await cam.started
  await sleep(700)
  const steps = []
  for (const [i, s] of ch.steps.entries()) {
    const v = said[`s${i}`]
    const start = now()
    const step = await s.do(h)
    const b = await box(step.el)
    // the voice starts as the step starts; the action lands while it is still speaking
    await sleep(350)
    await step.act(step.el)
    const spoken = (v?.seconds ?? 1.6) + 0.35
    await sleep(Math.max(500, (start + spoken + 0.45 - now()) * 1000))
    if (s.wait) await sleep(s.wait)
    steps.push({ title: s.title, say: s.say, kind: s.kind ?? step.kind, keys: s.keys, box: b, start: start - t0, end: now() - t0, voice: v ? { file: v.file, at: start - t0 + 0.3, seconds: v.seconds, words: v.words } : null })
  }
  await sleep(1200)
  const end = now() - t0
  await cam.stop()
  // the render's browser plays open codecs only: VP9 in WebM
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(dir, 'screen.mp4'), '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', '-crf', '18', '-b:v', '0', join(dir, 'screen.webm')])
  rmSync(join(dir, 'screen.mp4'), { force: true })
  const events = log.map((x) => ({ ...x, ...(x.t !== undefined ? { t: x.t - t0 } : {}), ...(x.t0 !== undefined ? { t0: x.t0 - t0 } : {}), ...(x.t1 !== undefined ? { t1: x.t1 - t0 } : {}) }))
  writeFileSync(join(dir, 'track.json'), JSON.stringify({ id: ch.id, title: ch.title, try: ch.try, width: W, height: H, duration: end, steps, events, cursor0: [W - 120, H - 80] }, null, 2))
  if (ch.teardown) await ch.teardown(h)
  console.log(`${ch.id}: ${steps.length} steps, ${end.toFixed(1)} s`)
}
await browser.disconnect()
