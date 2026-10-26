import { Circle, Layout, makeScene2D, Rect, Txt } from '@revideo/2d'
import { all, chain, createRef, createRefArray, easeInCubic, tween, easeInOutCubic, easeOutBack, easeOutCubic, easeOutExpo, linear, sequence, useScene, waitFor, type ThreadGenerator } from '@revideo/core'
import { SAMPLE, type Data } from '../data'
import { captionGroups, timeline, total, wordTimes } from '../timeline.js'

/*
 * One vertical video, 1080 x 1920, origin at the center. What reads stays in the safe area
 * (x within ±470, y from -720 to +520): the top 240 px and the bottom 420 px carry the networks' UI.
 * Every segment lasts exactly its timeline length, so the voice and the picture never drift.
 */
const SAFE_TOP = -700
const EXIT = 0.34

const words = (s: string) => s.split(/\s+/).filter(Boolean).map((w) => ({ text: w.replace(/\*/g, ''), hot: /\*/.test(w) }))
/** A display size that keeps the longest word inside the safe width. */
const fit = (s: string, max = 190) => Math.max(96, Math.min(max, Math.floor(1500 / Math.max(6, ...s.split(/\s+/).map((w) => w.length)))))

export default makeScene2D('reel', function* (view) {
  const d = useScene().variables.get<Data>('data', SAMPLE)()
  const b = d.brand
  const up = (s: string) => (b.upper ? s.toUpperCase() : s)
  const tl = d.timeline?.length ? d.timeline : timeline(d)
  const length = total(tl)
  view.fill(b.bg)

  // -- the stage: slow geometric shapes, a parallax that never stops
  const disc = createRef<Circle>()
  const band = createRef<Rect>()
  const square = createRef<Rect>()
  view.add(
    <>
      <Circle ref={disc} size={820} fill={b.accent} opacity={0.13} x={380} y={-560} />
      <Rect ref={band} width={1900} height={210} fill={b.surface} rotation={-14} y={420} opacity={0.9} />
      <Rect ref={square} size={180} lineWidth={6} stroke={b.accent2} opacity={0.5} rotation={18} x={-380} y={700} />
    </>,
  )
  yield all(disc().position([300, -470], length, linear), band().y(330, length, linear), square().rotation(60, length, linear), square().y(640, length, linear))

  // -- progress, like stories: one segment per point
  const pts = tl.filter((s) => s.kind === 'point')
  const segs = createRefArray<Rect>()
  const segW = (940 - (pts.length - 1) * 12) / Math.max(1, pts.length)
  if (pts.length)
    view.add(
      <Layout direction="row" gap={12} y={SAFE_TOP - 40} layout>
        {pts.map(() => (
          <Rect width={segW} height={8} radius={4} fill={b.surface} clip>
            <Rect ref={segs} width={0} height={8} fill={b.accent} />
          </Rect>
        ))}
      </Layout>,
    )

  // -- captions: the spoken words, a few at a time, the one being said in the accent
  const captionsOn = d.captions !== false && tl.some((s) => s.voice)
  const capBox = createRef<Rect>()
  const capTxt = createRefArray<Txt>()
  const capWords = (ws: { word: string; on: boolean }[]) =>
    capTxt.forEach((t, k) => {
      t.text(ws[k]?.word ?? '')
      t.fill(ws[k]?.on ? b.accent : b.text)
    })
  if (captionsOn) {
    view.add(
      <Rect ref={capBox} y={470} padding={[14, 26]} radius={14} fill={b.bg} opacity={0} gap={14} layout>
        {[0, 1, 2, 3].map(() => (
          <Txt ref={capTxt} fontFamily={b.font} fontWeight={800} fontSize={50} fill={b.text} text="" />
        ))}
      </Rect>,
    )
    yield (function* (): ThreadGenerator {
      let now = 0
      for (const seg of tl) {
        const ws = wordTimes(seg)
        const groups = captionGroups(ws.map((x: { word: string }) => x.word))
        for (let i = 0; i < ws.length; i++) {
          const w = ws[i]!
          if (w.start > now) yield* waitFor(w.start - now)
          now = w.start
          // chunks of up to 4 words that never cross a sentence; the current one marked
          const [from, to] = groups.find(([a, b]) => i >= a && i < b)!
          capWords(ws.slice(from, to).map((x: { word: string }, j: number) => ({ word: x.word.replace(/[.,!?;:]$/, ''), on: from + j === i })))
          capBox().opacity(1)
        }
        if (ws.length) {
          const end = ws[ws.length - 1]!.end
          yield* waitFor(Math.max(0, end - now))
          now = end
          capBox().opacity(0)
        }
      }
    })()
  }

  /** Runs a segment's entrance, holds until the segment's end, then its exit. */
  function* hold(dur: number, enter: ThreadGenerator, exit: () => ThreadGenerator) {
    yield* all(enter, waitFor(Math.max(0, dur - EXIT)))
    yield* exit()
  }

  const wipe = createRef<Rect>()
  view.add(<Rect ref={wipe} width={2600} height={2600} fill={b.accent} rotation={-14} x={-2600} />)

  for (const seg of tl) {
    if (seg.kind === 'hook') {
      const hook = createRefArray<Txt>()
      const kicker = createRef<Txt>()
      const box = createRef<Layout>()
      view.add(
        <Layout ref={box} direction="column" gap={36} width={940} y={-90} layout>
          {d.kicker ? <Txt ref={kicker} text={up(d.kicker)} fontFamily={b.display} fontSize={42} letterSpacing={8} fill={b.accent2} opacity={0} /> : null}
          <Layout wrap="wrap" columnGap={46} rowGap={4} width={940} layout>
            {words(d.hook).map((w) => (
              <Txt ref={hook} text={up(w.text)} fontFamily={b.display} fontSize={150} lineHeight={150} fill={w.hot ? b.accent : b.text} opacity={0} y={70} />
            ))}
          </Layout>
        </Layout>,
      )
      const hot = words(d.hook).map((w, i) => (w.hot ? hook[i] : null)).filter(Boolean) as Txt[]
      yield* hold(
        seg.dur,
        chain(
          d.kicker ? kicker().opacity(1, 0.25) : waitFor(0),
          sequence(0.07, ...hook.map((t) => all(t.opacity(1, 0.28, easeOutCubic), t.y(0, 0.45, easeOutExpo)))),
          hot.length ? all(...hot.map((t) => chain(t.scale(1.12, 0.14, easeOutCubic), t.scale(1, 0.24, easeOutBack)))) : waitFor(0),
        ),
        function* () {
          yield* wipe().x(0, EXIT, easeInCubic)
          box().remove()
          wipe().x(2600, 0)
          yield* waitFor(0)
          wipe().x(-2600)
        },
      )
      continue
    }

    if (seg.kind === 'product' && d.product) {
      const name = createRef<Txt>()
      const tag = createRef<Txt>()
      const box = createRef<Layout>()
      view.add(
        <Layout ref={box} direction="column" gap={28} width={940} y={-60} layout>
          <Txt ref={name} text={up(d.product.name)} fontFamily={b.display} fontSize={fit(d.product.name)} lineHeight={fit(d.product.name) * 1.02} fill={b.text} opacity={0} textWrap width={940} />
          <Txt ref={tag} text={d.product.tagline} fontFamily={b.font} fontSize={60} lineHeight={78} fill={b.muted} opacity={0} textWrap width={900} />
        </Layout>,
      )
      yield* hold(seg.dur, all(name().opacity(1, 0.4), name().scale(1.06, 0).to(1, 0.6, easeOutExpo), tag().opacity(1, 0.6)), function* () {
        yield* all(name().opacity(0, EXIT), tag().opacity(0, EXIT))
        box().remove()
      })
      continue
    }

    if (seg.kind === 'stat' && d.stat) {
      // the number counts up to its value; whatever is not a digit stays as written
      const m = /^(\D*)([\d.,]+)(.*)$/.exec(d.stat.value)
      const target = m ? Number(m[2]!.replace(/\./g, '').replace(',', '.')) : 0
      const decimals = m && m[2]!.includes(',') ? m[2]!.split(',')[1]!.length : 0
      const big = createRef<Txt>()
      const label = createRef<Txt>()
      const src = createRef<Txt>()
      const box = createRef<Layout>()
      const shown = (n: number) => (m ? `${m[1]}${n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${m[3]}` : d.stat!.value)
      view.add(
        <Layout ref={box} direction="column" gap={30} width={940} y={-80} layout>
          <Txt ref={big} text={shown(0)} fontFamily={b.display} fontSize={fit(d.stat.value, 300)} lineHeight={fit(d.stat.value, 300)} fill={b.accent} opacity={0} />
          <Txt ref={label} text={up(d.stat.label)} fontFamily={b.display} fontSize={78} lineHeight={86} fill={b.text} opacity={0} textWrap width={940} />
          {d.stat.source ? <Txt ref={src} text={d.stat.source} fontFamily={b.font} fontSize={38} fill={b.muted} opacity={0} textWrap width={900} /> : null}
        </Layout>,
      )
      yield* hold(seg.dur, all(big().opacity(1, 0.2), tween(Math.min(1.4, seg.dur - 1), (v) => big().text(shown(easeOutCubic(v) * target))), chain(waitFor(0.5), label().opacity(1, 0.4)), d.stat.source ? chain(waitFor(0.9), src().opacity(1, 0.4)) : waitFor(0)), function* () {
        yield* all(big().opacity(0, EXIT), label().opacity(0, EXIT), d.stat?.source ? src().opacity(0, EXIT) : waitFor(0))
        box().remove()
      })
      continue
    }

    if (seg.kind === 'quote' && d.quote) {
      const mark = createRef<Txt>()
      const lines = createRefArray<Txt>()
      const who = createRef<Txt>()
      const box = createRef<Layout>()
      view.add(
        <Layout ref={box} direction="column" gap={20} width={940} y={-80} layout>
          <Txt ref={mark} text="“" fontFamily={b.display} fontSize={320} lineHeight={200} fill={b.accent} opacity={0} />
          <Layout wrap="wrap" columnGap={18} rowGap={0} width={940} layout>
            {words(d.quote.text).map((w) => (
              <Txt ref={lines} text={w.text} fontFamily={b.font} fontWeight={700} fontSize={72} lineHeight={92} fill={w.hot ? b.accent : b.text} opacity={0} y={20} />
            ))}
          </Layout>
          <Txt ref={who} text={`${d.quote.author}${d.quote.role ? ` · ${d.quote.role}` : ''}`} fontFamily={b.display} fontSize={40} lineHeight={52} letterSpacing={4} fill={b.accent2} opacity={0} textWrap width={940} />
        </Layout>,
      )
      yield* hold(seg.dur, chain(all(mark().opacity(1, 0.3), mark().y(-30, 0).to(0, 0.5, easeOutExpo)), sequence(0.035, ...lines.map((t) => all(t.opacity(1, 0.2), t.y(0, 0.3, easeOutExpo)))), who().opacity(1, 0.35)), function* () {
        yield* box().opacity(0, EXIT)
        box().remove()
      })
      continue
    }

    if (seg.kind === 'point') {
      const i = seg.index ?? 0
      const p = d.points[i]!
      const card = createRef<Rect>()
      const num = createRef<Txt>()
      const tw = createRefArray<Txt>()
      const body = createRef<Txt>()
      const chip = createRef<Rect>()
      view.add(
        <Rect ref={card} width={940} height={1060} x={1200} y={-90} direction="column" justifyContent="end" gap={34} padding={[70, 64, 84, 64]} fill={b.surface} layout clip>
          <Txt ref={num} text={String(i + 1).padStart(2, '0')} fontFamily={b.display} fontSize={300} lineHeight={260} fill={b.accent} opacity={0} />
          <Layout wrap="wrap" columnGap={36} rowGap={0} layout>
            {words(p.title).map((w) => (
              <Txt ref={tw} text={up(w.text)} fontFamily={b.display} fontSize={118} lineHeight={122} fill={w.hot ? b.accent : b.text} opacity={0} y={50} />
            ))}
          </Layout>
          {p.body ? <Txt ref={body} text={p.body} fontFamily={b.font} fontSize={54} lineHeight={70} fill={b.muted} opacity={0} textWrap width={812} /> : null}
          {p.value ? (
            <Rect ref={chip} fill={b.accent2} padding={[16, 34]} radius={999} alignSelf="start" layout opacity={0}>
              <Txt text={up(p.value)} fontFamily={b.display} fontSize={52} fill={b.bg} />
            </Rect>
          ) : null}
        </Rect>,
      )
      // the progress fills over the whole segment on its own thread, so it never lengthens it
      if (segs[i]) yield segs[i]!.width(segW, seg.dur, linear)
      yield* hold(
        seg.dur,
        all(
          card().x(-60, 0.42, easeOutExpo).to(0, 0.22, easeInOutCubic),
          chain(
            waitFor(0.12),
            all(num().opacity(1, 0.18), num().scale(1.25, 0).to(1, 0.4, easeOutBack)),
            sequence(0.06, ...tw.map((t) => all(t.opacity(1, 0.22), t.y(0, 0.38, easeOutExpo)))),
            p.body ? body().opacity(1, 0.3) : waitFor(0),
            p.value ? all(chip().opacity(1, 0.2), chip().scale(0.6, 0).to(1, 0.35, easeOutBack)) : waitFor(0),
          ),
        ),
        function* () {
          yield* card().x(-1300, EXIT, easeInCubic)
          card().remove()
        },
      )
      continue
    }

    if (seg.kind === 'cta') {
      const block = createRef<Rect>()
      const cta = createRefArray<Txt>()
      const handle = createRef<Txt>()
      view.add(
        <Rect ref={block} width={0} height={760} fill={b.accent} y={-90} direction="column" alignItems="start" justifyContent="end" gap={30} padding={[0, 70, 80, 70]} layout clip>
          <Layout wrap="wrap" columnGap={36} rowGap={0} width={800} layout>
            {words(d.cta).map((w) => (
              <Txt ref={cta} text={up(w.text)} fontFamily={b.display} fontSize={128} lineHeight={130} fill={b.onAccent} opacity={0} y={40} />
            ))}
          </Layout>
          {d.handle ? <Txt ref={handle} text={d.handle} fontFamily={b.font} fontSize={52} fontWeight={600} fill={b.onAccent} opacity={0} /> : null}
        </Rect>,
      )
      yield* all(chain(block().width(940, 0.45, easeOutExpo), sequence(0.06, ...cta.map((t) => all(t.opacity(1, 0.22), t.y(0, 0.36, easeOutExpo)))), d.handle ? handle().opacity(1, 0.3) : waitFor(0)), waitFor(seg.dur))
    }
  }
})
