import { blur, Circle, Img, Layout, Line, makeScene2D, Rect, Txt, Video } from '@revideo/2d'
import { createRef, tween, useScene } from '@revideo/core'

/*
 * "Ask the agent", trailer cut, 1920 x 1080. The answer starts streaming and the camera is already
 * leaning into it; mid-sentence it goes through the key word and lands inside the app, where one voice
 * keeps going over fast cuts of the real screen. Each line lands as huge type that bends and settles,
 * so the system reads as something alive, not a manual. Everything is a function of time.
 */
type Word = { w: string; s: number; key?: boolean }
export type Trailer = {
  question: string
  step: string
  answer: Word[]
  keyIndex: number
  dive: number
  out: number
  end: number
  cuts: { start: number; end: number; words: Word[] }[]
  outro: Word[]
  fragments: string[]
  video: string
  hero: string
  brand: { bg: string; surface: string; border: string; text: string; muted: string; accent: string; display: string; font: string; mono: string }
}

const W = 1920
const H = 1080
const clamp = (v: number) => Math.max(0, Math.min(1, v))
const out = (v: number) => 1 - (1 - v) ** 3
const back = (v: number) => 1 + 2.6 * (v - 1) ** 3 + 1.6 * (v - 1) ** 2
const elastic = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : 2 ** (-9 * v) * Math.sin((v * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1)
const noise = (t: number, k: number) => Math.sin(t * 91.7 + k * 12.3) * Math.sin(t * 57.1 + k * 3.7)

export default makeScene2D('ask3', function* (view) {
  const b0 = useScene().variables.get<Trailer | null>('beat', null)()
  if (!b0) return
  const b: Trailer = b0
  const c = b.brand
  view.fill(c.bg)

  // the ground: a drifting grid and two accent blobs that flow around each other
  const grid = createRef<Layout>()
  const blobA = createRef<Circle>()
  const blobB = createRef<Circle>()
  view.add(
    <>
      <Circle ref={blobA} size={1100} fill={c.accent} opacity={0.1} filters={[blur(160)]} />
      <Circle ref={blobB} size={800} fill={'#5b3cc4'} opacity={0.08} filters={[blur(160)]} />
      <Layout ref={grid}>
        {Array.from({ length: 45 }, (_, i) => <Line points={[[-W / 2 - 96 + i * 48, -H / 2 - 96], [-W / 2 - 96 + i * 48, H / 2 + 96]]} stroke={'#ffffff'} opacity={0.035} lineWidth={1} />)}
        {Array.from({ length: 27 }, (_, i) => <Line points={[[-W / 2 - 96, -H / 2 - 96 + i * 48], [W / 2 + 96, -H / 2 - 96 + i * 48]]} stroke={'#ffffff'} opacity={0.035} lineWidth={1} />)}
      </Layout>
    </>,
  )

  // the chat, inside a camera that leans in while the answer streams
  const cam = createRef<Layout>()
  const bubble = createRef<Rect>()
  const typed = createRef<Txt>()
  const stepRow = createRef<Layout>()
  const stepMark = createRef<Rect>()
  const heroImg = createRef<Img>()
  const composer = createRef<Rect>()
  const COL = 1120
  view.add(
    <Layout ref={cam}>
      <Rect ref={bubble} x={COL / 2 - 20} y={-300} offsetX={1} padding={[18, 26]} radius={24} fill={c.surface} stroke={c.border} lineWidth={1} opacity={0}>
        <Txt text={b.question} fontFamily={c.font} fontSize={38} fill={c.text} />
      </Rect>
      <Img ref={heroImg} src={b.hero} width={64} x={-COL / 2 + 32} y={-170} opacity={0} />
      <Layout ref={stepRow} layout alignItems={'center'} gap={14} x={-COL / 2 + 96} y={-170} offsetX={-1} opacity={0}>
        <Rect ref={stepMark} size={14} stroke={c.accent} lineWidth={2.4} />
        <Txt text={b.step} fontFamily={c.mono} fontSize={26} fill={c.muted} />
      </Layout>
      <Rect ref={composer} width={COL} height={84} y={360} radius={14} fill={c.surface} stroke={c.border} lineWidth={1.5} layout alignItems={'center'} padding={[0, 28]} gap={18}>
        <Txt text={'›'} fontFamily={c.mono} fontSize={40} fill={c.accent} />
        <Txt ref={typed} text={''} fontFamily={c.font} fontSize={34} fill={c.text} grow={1} />
      </Rect>
    </Layout>,
  )
  // the answer, word by word, wrapped by hand so each word can be its own node
  const words: Txt[] = []
  {
    let x = -COL / 2 + 96
    let y = -90
    for (const wd of b.answer) {
      const node = new Txt({ text: wd.w, fontFamily: c.font, fontSize: 64, fontWeight: wd.key ? 750 : 500, fill: wd.key ? c.accent : c.text, x, y, offsetX: -1, opacity: 0 })
      cam().add(node)
      const w = node.width()
      if (x + w > COL / 2) {
        x = -COL / 2 + 96
        y += 86
        node.position([x, y])
      }
      x += w + 18
      words.push(node)
    }
  }
  const keyNode = words[b.keyIndex]!

  // through the word: a door of light opens where it was, onto a space where pieces of the app float
  // at every depth; the camera flies through them and lands inside the screen, which fills the frame
  const door = createRef<Rect>()
  const space = createRef<Layout>()
  const screen = createRef<Video>()
  const flash = createRef<Rect>()
  const F = 900
  const VW = 1920
  const VH = 1200
  view.add(
    <>
      <Rect ref={door} width={0} height={0} fill={'#07060c'} stroke={'#fff3ea'} lineWidth={6} shadowColor={c.accent} shadowBlur={120} opacity={0} />
      <Layout ref={space} />
    </>,
  )
  // a seeded scatter, so every render is the same
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const stars = Array.from({ length: 160 }, () => {
    const ln = new Line({ points: [[0, 0], [0, 0]], stroke: rnd() > 0.85 ? c.accent : '#ffffff', lineWidth: 2 + rnd() * 2, lineCap: 'round', opacity: 0 })
    space().add(ln)
    return { ln, x: (rnd() - 0.5) * 5200, y: (rnd() - 0.5) * 3200, z: 200 + rnd() * 4200 }
  })
  const frags = b.fragments.map((src, i) => {
    const ang = (i / b.fragments.length) * Math.PI * 2 + rnd() * 0.6
    const rad = 520 + rnd() * 520
    const img = new Img({ src, width: 520, radius: 10, opacity: 0, shadowColor: 'rgba(0,0,0,0.6)', shadowBlur: 40 })
    space().add(img)
    return { img, x: Math.cos(ang) * rad * 1.5, y: Math.sin(ang) * rad * 0.9, z: 700 + (i / b.fragments.length) * 2900 + rnd() * 200, r: (rnd() - 0.5) * 24 }
  })
  const ZV = 4400
  space().add(<Video ref={screen} src={b.video} width={VW} height={VH} decoder={'ffmpeg'} opacity={0} />)
  view.add(<Rect ref={flash} width={W} height={H} fill={'#ffffff'} opacity={0} />)
  const kinetic: { node: Txt; at: number; cut: number; key: boolean; x: number; y: number }[] = []
  b.cuts.forEach((cut, ci) => {
    let x = -W / 2 + 120
    const y = H / 2 - 170
    for (const wd of cut.words) {
      const node = new Txt({ text: wd.w.toUpperCase(), fontFamily: c.display, fontSize: 132, fill: wd.key ? c.accent : '#ffffff', shadowColor: 'rgba(0,0,0,0.7)', shadowBlur: 40, offsetX: -1, x, y, opacity: 0 })
      view.add(node)
      kinetic.push({ node, at: wd.s, cut: ci, key: Boolean(wd.key), x, y })
      x += node.width() + 34
    }
    const row = kinetic.filter((k) => k.cut === ci)
    const fit = Math.min(1, (W - 240) / (x - 34 + W / 2 - 120))
    for (const k of row) {
      k.node.fontSize(132 * fit)
      k.x = -W / 2 + 120 + (k.x + W / 2 - 120) * fit
    }
  })
  // the outro: hero and name
  const endHero = createRef<Img>()
  const endName = createRef<Txt>()
  const endBar = createRef<Rect>()
  view.add(
    <>
      <Img ref={endHero} src={b.hero} width={260} y={-90} opacity={0} />
      <Txt ref={endName} text={'SuperTokenMan'} fontFamily={c.display} fontSize={128} fill={c.text} y={110} opacity={0} />
      <Rect ref={endBar} width={0} height={10} y={200} fill={c.accent} />
    </>,
  )
  flash().moveToTop()

  const T0 = 0.35
  const T1 = T0 + b.question.length * 0.026
  const SENT = T1 + 0.18
  const D0 = b.dive
  const cutAt = (t: number) => b.cuts.findIndex((k) => t >= k.start && t < k.end)

  function draw(t: number) {
    // ground, always moving
    grid().position([(t * 14) % 48, (t * 9) % 48])
    blobA().position([Math.sin(t * 0.7) * 420, Math.cos(t * 0.5) * 220])
    blobB().position([Math.cos(t * 0.6) * 480, Math.sin(t * 0.8) * 260])
    blobA().scale(1 + 0.12 * Math.sin(t * 1.9))

    // the chat: question typed and sent, the step, the answer streaming in
    typed().text(t < SENT ? b.question.slice(0, Math.round(b.question.length * clamp((t - T0) / (T1 - T0)))) : '')
    const sb = clamp((t - SENT) / 0.3)
    bubble().opacity(sb).scale(0.85 + 0.15 * back(sb)).y(-300 + 40 * (1 - out(sb)))
    const st = clamp((t - SENT - 0.25) / 0.3)
    heroImg().opacity(st).scale(0.6 + 0.4 * back(st))
    stepRow().opacity(st)
    stepMark().rotation(t * 120).scale(1 + 0.25 * Math.sin(t * 9))
    for (const [i, wd] of b.answer.entries()) {
      const k = clamp((t - wd.s) / 0.22)
      const node = words[i]!
      node.opacity(k).scale(0.7 + 0.3 * back(k))
      node.skew([-12 * (1 - out(k)), 0])
      if (i !== b.keyIndex) node.opacity(k * (1 - 0.85 * clamp((t - D0 + 0.6) / 0.4)))
    }

    // the camera leans in from the first word and speeds up into the key word
    const firstWord = b.answer[0]!.s
    const lean = clamp((t - firstWord + 0.4) / (D0 - firstWord + 0.4))
    const kp = keyNode.position()
    const kc: [number, number] = [kp.x + keyNode.width() / 2, kp.y]
    const zoom = 1 + 0.9 * lean ** 2.2
    const pull = lean ** 1.6
    const shake = t > D0 - 0.5 && t < D0 + 0.4 ? 8 * clamp((t - D0 + 0.5) / 0.5) : 0
    cam().scale(zoom).position([-kc[0] * pull * zoom + shake * noise(t, 1), -kc[1] * pull * zoom + shake * noise(t, 2)])
    if (t > D0 - 0.6) keyNode.scale(1 + 0.5 * clamp((t - D0 + 0.6) / 0.6) ** 2)
    keyNode.shadowColor(c.accent).shadowBlur(t > D0 - 0.6 ? 60 * clamp((t - D0 + 0.6) / 0.6) : 0)

    // the door opens from the word, the chat falls away behind it
    const LAND = b.cuts[0]!.start
    const dOpen = clamp((t - D0 + 0.12) / 0.4)
    const kc2: [number, number] = [kc[0] * zoom + cam().position().x, kc[1] * zoom + cam().position().y]
    door().opacity(t > D0 - 0.12 && t < LAND + 0.2 ? 1 : 0)
    door().width(30 + (W + 80) * out(dOpen) ** 1.4).height(keyNode.height() * zoom + (H + 80) * out(clamp((dOpen - 0.15) / 0.85)))
    door().position([kc2[0] * (1 - out(dOpen)), kc2[1] * (1 - out(dOpen))]).lineWidth(6 * (1 - dOpen) + 0.01)
    if (t >= D0) cam().opacity(1 - clamp((t - D0) / 0.35)).scale(zoom * (1 + 2 * out(clamp((t - D0) / 0.4))))
    else cam().opacity(1)
    flash().opacity(Math.max(t >= D0 ? 0.5 * (1 - clamp((t - D0) / 0.25)) : 0, ...b.cuts.slice(1).map((k) => (t >= k.start ? 0.18 * (1 - clamp((t - k.start) / 0.12)) : 0)), t >= b.out ? 0.5 * (1 - clamp((t - b.out) / 0.2)) : 0))

    // the flight: slow at the door, fast through the middle, easing as the screen comes up to meet us
    const fly = clamp((t - D0 - 0.1) / (LAND - D0 - 0.1))
    const fe = fly < 0.5 ? 4 * fly ** 3 : 1 - (-2 * fly + 2) ** 3 / 2
    const camZ = (ZV - F) * fe
    const inSpace = t > D0 - 0.05 && t < LAND + 0.3
    const swirl = 0.35 * (1 - fe) * Math.sin(t * 2)
    space().rotation(inSpace ? swirl * 20 : 0)
    const speed = fly > 0 && fly < 1 ? Math.min(1, 6 * fly * (1 - fly)) : 0
    for (const st of stars) {
      const dz = st.z - (camZ % 4400)
      const z = dz < 60 ? dz + 4400 : dz
      const k1 = F / z
      const k2 = F / (z + 40 + 900 * speed)
      st.ln.points([[st.x * k1, st.y * k1], [st.x * k2, st.y * k2]]).opacity(inSpace ? clamp((4400 - z) / 1500) * clamp((t - D0) / 0.3) : 0)
    }
    for (const f of frags) {
      const z = f.z - camZ
      const k = F / z
      const vis = z > 80 ? clamp((ZV - z) / 1400) * clamp((z - 80) / 300) : 0
      f.img.opacity(inSpace ? vis * clamp((t - D0) / 0.3) : 0).position([f.x * k, f.y * k]).scale(k).rotation(f.r + 8 * Math.sin(t * 1.4 + f.r))
    }

    // inside: the screen fills the frame; each cut flies through the last into the next
    const ci = cutAt(t)
    if (t >= D0 - 0.05 && t < b.out + 0.5) {
      const leave = clamp((t - b.out) / 0.45)
      if (t < LAND) {
        const k = F / (ZV - camZ)
        screen().opacity(clamp((t - D0) / 0.5)).position([0, 0]).scale(k).rotation(0)
      } else {
        const cut = b.cuts[Math.max(0, ci)]!
        const local = clamp((t - cut.start) / 0.4)
        const into = ci > 0 ? back(local) : 1
        const drift = (t - cut.start) / Math.max(0.5, cut.end - cut.start)
        // a slow push and a breath, so the screen is never still
        const s = (1.02 + 0.06 * drift) * (ci > 0 ? 1.5 - 0.5 * into : 1) * (1 - 0.8 * out(leave))
        const dir = ci % 2 ? 1 : -1
        screen().opacity(1 - leave).position([dir * 40 * drift, -20 * drift]).scale([s * (1 + 0.01 * Math.sin(t * 3.1)), s * (1 - 0.01 * Math.sin(t * 3.1))]).rotation(dir * 2.5 * (1 - into) + 0.4 * Math.sin(t * 1.3))
      }
    } else screen().opacity(0)

    // the line, landing word by word as huge type that overshoots, bends and settles
    for (const k of kinetic) {
      const cut = b.cuts[k.cut]!
      const inn = clamp((t - k.at + 0.04) / 0.35)
      const gone = clamp((t - cut.end + 0.05) / 0.2)
      const e = elastic(inn)
      k.node.opacity(Math.min(clamp(inn * 4), 1 - gone))
      k.node.scale([e * (1 + 0.25 * (1 - inn)), e * (1 - 0.15 * (1 - inn))]).skew([-14 * (1 - out(inn)) + 18 * gone, 0])
      k.node.position([k.x, k.y - 70 * gone - 40 * (1 - out(inn))])
      if (k.key) k.node.rotation(-3 + 3 * out(inn))
    }

    // the outro: the hero bounces in, the name lands, the bar draws
    const o = clamp((t - b.out - 0.2) / 0.8)
    endHero().opacity(clamp(o * 3)).scale(elastic(o)).rotation(-12 * (1 - out(o)))
    const n = clamp((t - b.out - 0.5) / 0.6)
    endName().opacity(n).scale([1 + 0.3 * (1 - out(n)), 1 - 0.2 * (1 - out(n))]).skew([-10 * (1 - out(n)), 0])
    endBar().width(560 * out(clamp((t - b.out - 0.8) / 0.5)))
  }

  draw(0)
  const LAND = b.cuts[0]!.start
  yield* tween(LAND, (v) => draw(v * LAND))
  screen().play()
  yield* tween(b.end - LAND, (v) => draw(LAND + v * (b.end - LAND)))
})
