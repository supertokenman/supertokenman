import { Circle, Img, Layout, Line, makeScene2D, Rect, Txt, Video } from '@revideo/2d'
import { blur } from '@revideo/2d'
import { createRef, tween, useScene } from '@revideo/core'

/*
 * "Ask the agent", one beat, 1920 x 1080. A question sent in the app's composer, the hero answering the
 * way the agent really does (a step it took, then short prose streaming in), the key word charging up,
 * then a hard dive: a flash, the portal bursting open with shake and an RGB split onto the real screen,
 * and out again. Everything is a function of time.
 */
type Word = { w: string; s: number; style?: 'key' | 'bold' }
export type Beat = {
  question: string
  step: string
  paragraphs: { at: number; words: Word[] }[]
  dive: number
  proofSeconds: number
  video: string
  hero: string
  brand: { bg: string; surface: string; border: string; text: string; muted: string; accent: string; display: string; font: string; mono: string }
}

const W = 1920
const H = 1080
const clamp = (v: number) => Math.max(0, Math.min(1, v))
const out = (v: number) => 1 - (1 - v) ** 3
const ease = (v: number) => (v < 0.5 ? 4 * v ** 3 : 1 - (-2 * v + 2) ** 3 / 2)
const back = (v: number) => 1 + 2.4 * (v - 1) ** 3 + 1.4 * (v - 1) ** 2
const noise = (t: number, k: number) => Math.sin(t * 91.7 + k * 12.3) * Math.sin(t * 57.1 + k * 3.7)

export default makeScene2D('ask', function* (view) {
  const b0 = useScene().variables.get<Beat | null>('beat', null)()
  if (!b0) return
  const b: Beat = b0
  const c = b.brand
  view.fill(c.bg)
  const world = createRef<Layout>()
  view.add(<Layout ref={world} />)

  // the grid, drifting slowly
  const grid = createRef<Layout>()
  world().add(
    <Layout ref={grid}>
      {Array.from({ length: 45 }, (_, i) => <Line points={[[-W / 2 - 96 + i * 48, -H / 2 - 96], [-W / 2 - 96 + i * 48, H / 2 + 96]]} stroke={'#ffffff'} opacity={0.04} lineWidth={1} />)}
      {Array.from({ length: 27 }, (_, i) => <Line points={[[-W / 2 - 96, -H / 2 - 96 + i * 48], [W / 2 + 96, -H / 2 - 96 + i * 48]]} stroke={'#ffffff'} opacity={0.04} lineWidth={1} />)}
    </Layout>,
  )
  // a soft accent glow that breathes behind the chat
  const glow = createRef<Circle>()
  world().add(<Circle ref={glow} size={900} fill={c.accent} opacity={0.06} filters={[blur(120)]} />)

  const COL = 1160
  const chat = createRef<Layout>()
  const bubble = createRef<Rect>()
  const typed = createRef<Txt>()
  const send = createRef<Rect>()
  const hero = createRef<Img>()
  const step = createRef<Layout>()
  const stepDot = createRef<Circle>()
  world().add(
    <Layout ref={chat}>
      <Rect ref={bubble} layout padding={[22, 30]} radius={22} fill={c.surface} x={COL / 2 - 300} y={-330} offsetX={1} opacity={0}>
        <Txt text={b.question} fontFamily={c.font} fontSize={34} fill={c.text} />
      </Rect>
      <Img ref={hero} src={b.hero} width={72} height={72} x={-COL / 2 + 36} y={-205} opacity={0} />
      <Layout ref={step} layout gap={12} alignItems="center" x={-COL / 2 + 96} y={-205} offsetX={-1} opacity={0}>
        <Circle ref={stepDot} size={12} fill={c.accent} />
        <Txt text={b.step} fontFamily={c.mono} fontSize={24} fill={c.muted} />
      </Layout>
      <Rect x={0} y={400} width={COL} height={92} radius={8} fill={c.surface} stroke={c.border} lineWidth={2}>
        <Txt text={'›'} x={-COL / 2 + 40} fontFamily={c.mono} fontSize={44} fill={c.accent} />
        <Txt ref={typed} text={''} x={-COL / 2 + 80} offsetX={-1} fontFamily={c.font} fontSize={32} fill={c.text} />
        <Rect ref={send} x={COL / 2 - 52} width={60} height={60} fill={c.border} />
      </Rect>
    </Layout>,
  )
  // the answer: prose that wraps, words streaming in a little ahead of the voice
  const words: { node: Txt; at: number }[] = []
  const kw = createRef<Txt>()
  let y = -130
  for (const p of b.paragraphs) {
    const para = new Layout({ layout: true, wrap: 'wrap', columnGap: 12, rowGap: 6, width: COL - 96, x: -COL / 2 + 96, y, offsetX: -1, offsetY: -1 })
    for (const wd of p.words) {
      const node = new Txt({ text: wd.w, fontFamily: c.font, fontSize: 46, lineHeight: 62, fontWeight: wd.style ? 700 : 400, fill: wd.style === 'key' ? c.accent : c.text, opacity: 0 })
      if (wd.style === 'key') kw(node)
      para.add(node)
      words.push({ node, at: p.at + wd.s * 0.55 })
    }
    chat().add(para)
    y += 150
  }

  // the dive: a flash, a portal with a colored split and a cut corner, onto the real screen
  const portal = createRef<Rect>()
  const video = createRef<Video>()
  const splitA = createRef<Rect>()
  const splitB = createRef<Rect>()
  const flash = createRef<Rect>()
  const corner = createRef<Line>()
  yield world().add(
    <Rect ref={portal} width={0} height={0} clip fill={'#000'} opacity={0}>
      <Video ref={video} src={b.video} width={W} height={H} decoder="ffmpeg" />
    </Rect>,
  )
  world().add(<Rect ref={splitA} stroke={'#3ff4ff'} lineWidth={6} opacity={0} />)
  world().add(<Rect ref={splitB} stroke={'#ff3fa4'} lineWidth={6} opacity={0} />)
  world().add(<Line ref={corner} points={[[0, 0], [0, 0], [0, 0]]} closed fill={c.accent} opacity={0} />)
  view.add(<Rect ref={flash} width={W} height={H} fill={'#fff6ee'} opacity={0} />)

  const T0 = 0.6
  const T1 = T0 + b.question.length * 0.032
  const SENT = T1 + 0.25
  const D0 = b.dive
  const CHARGE = D0 - 0.7
  const OPEN = D0 + 0.75
  const P1 = D0 + b.proofSeconds
  const BACK = P1 + 0.55
  const END = BACK + 1.2
  let kwAt: [number, number] | null = null

  const frame = (now: number) => {
    // ambient: the grid drifts, the glow breathes
    grid().position([(now * 9) % 48, (now * 5) % 48])
    glow().scale(1 + 0.08 * Math.sin(now * 1.6))
    // question typed fast, then sent
    typed().text(now < SENT ? b.question.slice(0, Math.floor(clamp((now - T0) / (T1 - T0)) * b.question.length)) : '')
    send().fill(now > T0 && now < SENT ? c.accent : c.border)
    const up = out(clamp((now - SENT) / 0.35))
    bubble().opacity(up)
    bubble().y(-330 + (1 - up) * 380)
    bubble().scale(0.92 + 0.08 * up)
    // the agent: avatar, a step it took, then the words
    const ag = out(clamp((now - SENT - 0.15) / 0.3))
    hero().opacity(ag)
    hero().scale(0.7 + 0.3 * back(clamp((now - SENT - 0.15) / 0.4)))
    step().opacity(ag)
    stepDot().opacity(0.4 + 0.6 * Math.abs(Math.sin(now * 5)))
    for (const w of words) {
      const v = out(clamp((now - w.at) / 0.12))
      w.node.opacity(v * (now > CHARGE && now < D0 && w.node !== kw() ? 1 - 0.7 * clamp((now - CHARGE) / 0.4) : 1))
      w.node.y((1 - v) * 8)
    }
    // the key word charges: it grows and glows, the camera leans in, everything else dims
    if (now > CHARGE && now < D0) {
      const k = clamp((now - CHARGE) / (D0 - CHARGE))
      kw().scale(1 + 0.35 * ease(k))
      kw().shadowColor(c.accent)
      kw().shadowBlur(40 * k)
      const p = kw().absolutePosition()
      kwAt = [p.x - W / 2, p.y - H / 2]
      const z = 1 + 0.12 * ease(k)
      chat().scale(z)
      chat().position([-kwAt[0] * (z - 1), -kwAt[1] * (z - 1)])
      world().position([noise(now, 1) * 4 * k, noise(now, 2) * 4 * k])
    }
    // the burst
    if (now >= D0 && now < BACK) {
      const at = kwAt ?? [0, 0]
      const k = clamp((now - D0) / (OPEN - D0))
      const e = back(k)
      flash().opacity(now < D0 + 0.18 ? 0.9 * (1 - (now - D0) / 0.18) : 0)
      // the chat rushes past the camera
      const z = 1.12 + 7 * ease(clamp((now - D0) / 0.45))
      chat().scale(z)
      chat().position([-at[0] * (z - 1), -at[1] * (z - 1)])
      chat().opacity(1 - clamp((now - D0) / 0.3))
      grid().scale(1 + 0.6 * ease(k))
      // the portal opens past full and settles, turning as it lands
      const pw = 40 + (W - 40) * e
      const ph = 24 + (H - 24) * e
      portal().opacity(1)
      portal().size([pw, ph])
      portal().position([at[0] * (1 - ease(k)), at[1] * (1 - ease(k))])
      portal().rotation(-9 * (1 - ease(k)))
      video().position([-portal().x(), -portal().y()])
      video().rotation(9 * (1 - ease(k)))
      // a color split that slides apart and closes, and a shake that dies away
      const sp = 22 * (1 - ease(k))
      for (const [r, dx] of [[splitA, sp], [splitB, -sp]] as const) {
        r().opacity(k < 1 ? 0.9 * (1 - k) : 0)
        r().size([pw, ph])
        r().position([portal().x() + dx, portal().y() - dx / 2])
        r().rotation(portal().rotation())
      }
      const shake = 18 * (1 - k)
      world().position([noise(now, 3) * shake, noise(now, 4) * shake])
      // the brand's cut corner rides the portal's edge
      const cx = portal().x() + pw / 2
      const cy = portal().y() + ph / 2
      const cut = 90 * (1 - 0.6 * k)
      corner().opacity(k < 1 ? 1 : 0)
      corner().points([[cx, cy - cut], [cx, cy], [cx - cut, cy]])
    }
    // and out: the screen snaps back into the word, with a small flash
    if (now >= P1 && now < BACK) {
      const k = ease(clamp((now - P1) / (BACK - P1)))
      const at = kwAt ?? [0, 0]
      portal().size([W - (W - 40) * k, H - (H - 24) * k])
      portal().position([at[0] * k, at[1] * k])
      video().position([-portal().x(), -portal().y()])
      chat().opacity(k)
      chat().scale(1 + 0.3 * (1 - k))
      chat().position([0, 0])
      kw().scale(1)
      kw().shadowBlur(0)
      for (const w of words) w.node.opacity(1)
      flash().opacity(k > 0.85 ? 0.5 * (1 - (k - 0.85) / 0.15) : 0)
    }
    if (now >= BACK) {
      portal().opacity(0)
      corner().opacity(0)
      chat().opacity(1)
      chat().scale(1)
      world().position([0, 0])
    }
  }

  yield* tween(D0, (v) => frame(v * D0))
  video().play()
  yield* tween(END - D0, (v) => frame(D0 + v * (END - D0)))
})
