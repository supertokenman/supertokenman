import { Circle, Layout, makeScene2D, Path, Rect, Txt, Video } from '@revideo/2d'
import { createRef, createRefArray, tween, useScene } from '@revideo/core'
import { cameraAt, captionAt, cursorAt, pressAt, rippleAt } from '../tourTrack.js'

/*
 * A tour chapter, 1920 x 1080: the app filmed for real (scripts/tour/record.mjs), and over it a
 * camera that follows the action, a cursor that moves and clicks where the script did, and a
 * caption whose words light up as the voice says them. Everything is a function of time.
 */
type Box = { x: number; y: number; w: number; h: number } | null
type Step = { title: string; say?: string; kind: string; keys?: string; box: Box; start: number; end: number; voice: { at: number; seconds: number; words: { w: string; s: number; e: number }[] } | null }
export type TourTrack = { title: string; width: number; height: number; duration: number; steps: Step[]; events: ({ e: 'move'; t0: number; t1: number; from: number[]; to: number[] } | { e: 'click'; t: number; at: number[] } | { e: 'keys'; t: number } | { e: 'type'; t0: number; text: string })[]; cursor0: number[]; video: string; brand: { bg: string; surface: string; text: string; muted: string; accent: string; display: string; font: string } }

const FW = 1680
const FH = 1050
const CARD_W = 700

export default makeScene2D('tour', function* (view) {
  const given = useScene().variables.get<TourTrack | null>('tour', null)()
  if (!given) return
  const t: TourTrack = given
  const b = t.brand
  const s = FW / t.width
  view.fill(b.bg)

  const video = createRef<Video>()
  const cursor = createRef<Path>()
  const ripple = createRef<Circle>()
  // yielded, so the video is ready before anything reads it
  yield view.add(
    <Rect width={FW} height={FH} clip radius={10} fill={'#000'} shadowColor={'#00000099'} shadowBlur={50} shadowOffsetY={14}>
      <Video ref={video} src={t.video} width={FW} height={FH} decoder="ffmpeg" />
      <Circle ref={ripple} size={0} stroke={b.accent} lineWidth={5} opacity={0} />
      <Path ref={cursor} data="M0 0 L0 30 L8 23 L14 36 L20 33 L14 21 L25 21 Z" fill={'#ffffff'} stroke={'#141413'} lineWidth={2.5} shadowColor={'#00000088'} shadowBlur={10} shadowOffsetY={3} />
    </Rect>,
  )

  // one caption card per step, made up front; only the current one shows
  const cards = createRefArray<Rect>()
  // the spoken line writes itself in as the voice says it
  const lines: Txt[] = []
  const side = (st: Step) => (st.box && (st.box.x + st.box.w / 2) / t.width < 0.5 && (st.box.y + st.box.h / 2) / t.height > 0.55 ? 1 : -1)
  t.steps.forEach((st, i) => {
    const line = new Txt({ text: '', fontFamily: b.font, fontSize: 28, lineHeight: 38, fill: b.text, textWrap: true, width: CARD_W - 60, minHeight: 76 })
    view.add(
      <Rect ref={cards} layout direction="column" gap={10} padding={[24, 30, 28, 30]} width={CARD_W} fill={b.bg} radius={6} opacity={0} x={side(st) * (FW / 2 - CARD_W / 2 - 28)} y={FH / 2 - 130} shadowColor={'#00000088'} shadowBlur={40}>
        <Txt text={`${t.title.toUpperCase()} · ${String(i + 1).padStart(2, '0')} / ${String(t.steps.length).padStart(2, '0')}`} fontFamily={b.display} fontSize={22} letterSpacing={5} fill={b.accent} />
        <Txt text={st.title.toUpperCase()} fontFamily={b.display} fontSize={46} lineHeight={52} fill={b.text} textWrap width={CARD_W - 60} />
        {line}
      </Rect>,
    )
    lines[i] = line
  })

  // shortcut keys, shown as they are pressed
  const keys = createRef<Layout>()
  const keyStep = t.steps.findIndex((st) => st.kind === 'key' && st.keys)
  const keyAt = (t.events.find((e) => e.e === 'keys') as { t: number } | undefined)?.t ?? -9
  view.add(
    <Layout ref={keys} layout gap={18} y={-60} opacity={0}>
      {(keyStep >= 0 ? t.steps[keyStep]!.keys! : '').split(' ').filter(Boolean).map((k) => (
        <Rect layout padding={[22, 36]} radius={12} fill={b.bg} stroke={b.accent} lineWidth={3} shadowColor={'#00000099'} shadowBlur={30}>
          <Txt text={k.toUpperCase()} fontFamily={b.display} fontSize={60} fill={b.text} />
        </Rect>
      ))}
    </Layout>,
  )

  const toScreen = (p: number[], c: { z: number; x: number; y: number }) => [(p[0]! - c.x) * s * c.z, (p[1]! - c.y) * s * c.z]
  const outBack = (v: number) => 1 + 2.2 * (v - 1) ** 3 + 1.2 * (v - 1) ** 2

  // the footage plays from its first frame; Revideo prepares a video only when play() is called here
  video().play()
  yield* tween(t.duration, (v) => {
    const now = v * t.duration
    // camera
    const c = cameraAt(t, now)
    video().scale(c.z)
    video().position([(t.width / 2 - c.x) * s * c.z, (t.height / 2 - c.y) * s * c.z])
    // cursor: follows the path, sinks on a click, a ripple where it landed
    const [cx, cy] = toScreen(cursorAt(t, now), c)
    cursor().position([cx!, cy!])
    cursor().scale(1.3 * (1 - 0.18 * pressAt(t, now)))
    const r = rippleAt(t, now)
    if (r) {
      const [rx, ry] = toScreen(r.at, c)
      ripple().position([rx!, ry!])
      ripple().size(20 + 120 * r.r)
      ripple().opacity(0.9 * r.a)
    } else ripple().opacity(0)
    // caption: the card slides in and its line writes itself in, word by word, with the voice
    const cap = captionAt(t, now)
    cards.forEach((card, i) => {
      if (!cap || cap.i !== i) return card.opacity(0)
      const inn = Math.min(1, cap.since / 0.35)
      const out = Math.min(1, Math.max(0, cap.left / 0.3))
      card.opacity(Math.min(inn, out))
      card.y(FH / 2 - 130 + 24 * (1 - outBack(inn)))
      lines[i]!.text((t.steps[i]!.say ?? '').split(/\s+/).filter(Boolean).slice(0, cap.said).join(' '))
    })
    // keys
    const dk = now - keyAt
    const kv = dk < -0.05 ? 0 : dk < 0.25 ? (dk + 0.05) / 0.3 : dk < 1.3 ? 1 : Math.max(0, 1 - (dk - 1.3) / 0.3)
    keys().opacity(kv)
    keys().scale(0.85 + 0.15 * outBack(Math.min(1, Math.max(0, (dk + 0.05) / 0.3))))
  })
})
