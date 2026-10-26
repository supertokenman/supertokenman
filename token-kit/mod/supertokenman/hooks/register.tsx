import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Fight, Fx, Item, Savings, Snapshot, Steps } from '../types'
import { hudBand, hudPane, type HudView } from './hud'

// SuperTokenMan: a fighting-game HUD above the prompt (terminal and Desktop) and a details pane.
// Context, plan windows, prompt cache, what the session is worth at API prices, what token-kit
// saved, and the tool results that cost most because every later request re-reads them.
// In Claude colors. Each time token-kit cuts an output, SuperTokenMan fights it on screen: KO.

const PANE = 'supertokenman'
const TITLE = 'SuperTokenMan'
const snapshot = atom({ plugin: 'supertokenman', key: 'snapshot' } as const, null)
const items = atom({ plugin: 'supertokenman', key: 'items' } as const, [])
const steps = atom({ plugin: 'supertokenman', key: 'steps' } as const, { times: [], model: '' })
const savings = atom({ plugin: 'supertokenman', key: 'savings' } as const, { cuts: [] })
const fx = atom({ plugin: 'supertokenman', key: 'fx' } as const, { currency: 'BRL', rate: 5.05, at: 0, source: 'fallback' })
const fight = atom({ plugin: 'supertokenman', key: 'fight' } as const, null)

const C = { orange: '#d97757', deep: '#c15f3c' }
// the same fight in text, for the terminal: one frame every FRAME_MS, then KO held for KO_MS
const FRAMES = ['[T]o     (>_<)', '[T]==o   (>_<)', '[T]====o (>_<)', '[T]=====o*X_X*', '[T]===o  * * *', '[T]o      KO! ']
const FRAME_MS = 250
const KO_MS = 3000
const TOAST_GAP_MS = 60 * 1000

const CACHE_TTL_MS = 60 * 60 * 1000 // subscriptions get the 1 hour prompt cache

// USD per million tokens (API list prices, 2026-10-06): input and cache read. Writes use the 1 h rate, 2x input.
const PRICES: [string, number, number][] = [
  ['claude-fable-5-1', 10, 0.25],
  ['claude-mythos-5-1', 10, 0.25],
  ['claude-fable-5', 10, 1],
  ['claude-opus-5-5', 4, 0.2],
  ['claude-opus-5', 5, 0.5],
  ['claude-opus-4', 5, 0.5],
  ['claude-sonnet-5', 2, 0.2],
  ['claude-sonnet-4', 3, 0.3],
  ['claude-haiku-5-5', 0.1, 0.01],
  ['claude-haiku-4', 1, 0.1],
]
const DEFAULT_PRICE: [string, number, number] = ['claude-opus-5-5', 4, 0.2]
const price = (model: string) => PRICES.find(([p]) => model.includes(p)) ?? DEFAULT_PRICE
/** USD of `tokens` written to the cache once and re-read `rereads` times. */
const carried = (tokens: number, rereads: number, model: string) => {
  const [, input, readPrice] = price(model)
  return (tokens * (input * 2 + readPrice * rereads)) / 1e6
}

const k = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)))
const money = (usd: number, f: Fx) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: f.currency, maximumFractionDigits: usd * f.rate >= 100 ? 0 : 2 }).format(usd * f.rate)
const hhmm = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '')

/** A short label for a tool call: the command, the file, the pattern or the host. */
function labelOf(e: { tool: string } & Record<string, unknown>) {
  const s = (v: unknown) => String(v ?? '')
  const tail = (p: string) => p.split('/').slice(-2).join('/')
  if (e.tool === 'Bash') return s(e.command).replace(/\s+/g, ' ').slice(0, 48)
  if (e.tool === 'Read' || e.tool === 'Edit' || e.tool === 'Write') return `${e.tool} ${tail(s(e.file_path))}`
  if (e.tool === 'Grep' || e.tool === 'Glob') return `${e.tool} ${s(e.pattern).slice(0, 36)}`
  if (e.tool === 'WebFetch') return `WebFetch ${s(e.url).replace(/^https?:\/\//, '').split('/')[0]}`
  if (e.tool.startsWith('mcp__')) return `MCP ${e.tool.split('__').slice(1).join('.')}`
  return e.tool
}

type Dollar = EngineInterface

/** Where token-kit keeps its data, as the kit computes it. */
async function kitHome($: Dollar) {
  const own = await $.env.get('TOKEN_KIT_HOME')
  if (own) return own
  const cfg = (await $.env.get('CLAUDE_CONFIG_DIR')) || `${await $.env.get('HOME')}/.claude`
  return `${cfg}/token-kit`
}

/** token-kit's cuts recorded for this session (wrap and post-bash), from this month's and last month's stats. */
async function readSavings($: Dollar): Promise<Savings> {
  const home = await kitHome($)
  const session = await $.session.id()
  const now = new Date(await $.clock.now())
  const months = [now, new Date(now.getFullYear(), now.getMonth() - 1, 15)].map((d) => d.toISOString().slice(0, 7))
  const cuts: Savings['cuts'] = []
  for (const m of months) {
    let text = ''
    try {
      text = await $.fs.read(`${home}/stats-${m}.jsonl`)
    } catch {
      continue
    }
    for (const line of text.split('\n')) {
      if (!line.includes(session)) continue
      try {
        const s = JSON.parse(line)
        if (s.session === session && s.kind !== 'read-guard') cuts.push({ at: Date.parse(s.ts), tokens: Math.max(0, s.inChars - s.outChars) / 4 })
      } catch {
        // partial line
      }
    }
  }
  return { cuts: cuts.sort((a, b) => a.at - b.at) }
}

/** The day's USD rate for the kit's configured currency, kept in the store for 12 hours. */
async function refreshFx($: Dollar) {
  let currency = 'BRL'
  try {
    currency = JSON.parse(await $.fs.read(`${await kitHome($)}/config.json`))?.money?.currency || 'BRL'
  } catch {
    // no kit config: BRL
  }
  const cached = (await $.store.get(`fx-${currency}`)) as Fx | undefined
  const now = await $.clock.now()
  if (cached && now - cached.at < 12 * 3600 * 1000) return update($, fx, () => cached)
  if (currency === 'USD') return update($, fx, () => ({ currency, rate: 1, at: now, source: 'USD' }))
  try {
    const r = await $.http.fetch(`https://api.frankfurter.dev/v1/latest?base=USD&symbols=${currency}`)
    const rate = Number(JSON.parse(r.text)?.rates?.[currency])
    if (r.ok && rate > 0) {
      const v: Fx = { currency, rate, at: now, source: 'frankfurter.dev' }
      await $.store.set(`fx-${currency}`, v)
      return update($, fx, () => v)
    }
  } catch {
    // offline: keep the last rate or the fallback
  }
  if (cached) return update($, fx, () => cached)
}

// module-level, so a reload starts over (session.start clears the fight it may have left)
let fightTimer: { cancel: () => void } | null = null
let lastToast = 0
let caughtUp = false

/** Plays the fight: text frames on a timer (the SVG animates by itself), then KO held, then back to idle. */
async function startFight($: Dollar, tokens: number, usd: number) {
  fightTimer?.cancel()
  await update($, fight, () => ({ frame: 0, tokens, usd }))
  const tick = (frame: number) => {
    fightTimer = $.clock.after(frame < FRAMES.length ? FRAME_MS : KO_MS, () => {
      if (frame < FRAMES.length) {
        void update($, fight, (f) => f && { ...f, frame })
        tick(frame + 1)
      } else {
        fightTimer = null
        void update($, fight, () => null)
      }
    })
  }
  tick(1)
  // surfaces that draw no band still get a word, at most once a minute
  const now = await $.clock.now()
  if (now - lastToast >= TOAST_GAP_MS) {
    lastToast = now
    $.ui.toast(`SuperTokenMan KO: ${k(tokens)} wasted tokens cut, ${money(usd, await read($, fx))} not written`)
  }
}

async function refresh($: Dollar) {
  const u = await $.session.usage()
  const snap: Snapshot = {
    contextTokens: u.context.tokens ?? 0,
    window: u.context.window,
    percent: u.context.percent ?? null,
    limits: u.rateLimits.map((l) => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
    costUsd: u.cost?.usd ?? null,
    at: await $.clock.now(),
  }
  await update($, snapshot, () => snap)
  const s = await readSavings($)
  // new cuts since the stored look, counted in the write itself so two refreshes never both claim them
  let before = s.cuts.length
  await update($, savings, (old) => {
    before = Math.min(old.cuts.length, s.cuts.length)
    return s
  })
  // fight them, except on this module's first look, which only catches up (a start, a reload)
  if (caughtUp && s.cuts.length > before) {
    const tokens = s.cuts.slice(before).reduce((n, c) => n + c.tokens, 0)
    await startFight($, tokens, carried(tokens, 0, (await read($, steps)).model))
  }
  caughtUp = true
}

/** Everything the band and the pane draw, computed once from the session's state. */
async function figures($: Dollar) {
  const snap = await read($, snapshot)
  const s = await read($, steps)
  const list = await read($, items)
  const sav = await read($, savings)
  const f = await read($, fx)
  const now = await $.clock.now()
  // a tool result is written to the cache once and re-read by every later request
  const rereadsOf = (step: number) => Math.max(0, s.times.length - step)
  const ranked = list
    .map((i) => ({ ...i, usd: carried(i.tokens, rereadsOf(i.step), s.model), rereads: rereadsOf(i.step) }))
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 6)
  const savedUsd = sav.cuts.reduce((n, c) => n + carried(c.tokens, s.times.filter((t) => t > c.at).length, s.model), 0)
  const lastAt = s.times.at(-1) ?? 0
  const cacheLeft = lastAt ? Math.round((lastAt + CACHE_TTL_MS - now) / 60000) : null
  const five = snap?.limits.find((l) => l.kind === 'five_hour')
  const seven = snap?.limits.find((l) => l.kind === 'seven_day')
  const ctxPct = snap && snap.contextTokens > 0 ? (snap.percent ?? (snap.contextTokens / snap.window) * 100) : null
  return { snap, s, sav, f, ranked, savedUsd, cacheLeft, five, seven, ctxPct }
}

const openPane = ($: Dollar) => $.ui.open({ id: PANE, title: TITLE })

/** The widget's line as plain text: the command's answer and the HUD's alt text. */
function summary(v: Awaited<ReturnType<typeof figures>>) {
  const parts = [
    v.ctxPct != null ? `ctx ${Math.round(v.ctxPct)}% ${k(v.snap?.contextTokens ?? 0)}` : 'ctx -',
    ...(v.five ? [`5h ${Math.round(v.five.percentUsed)}%`] : []),
    ...(v.seven ? [`7d ${Math.round(v.seven.percentUsed)}%`] : []),
    v.cacheLeft == null ? 'cache -' : v.cacheLeft > 0 ? `cache ${v.cacheLeft}m` : 'cache cold',
    v.snap?.costUsd != null ? money(v.snap.costUsd, v.f) : '-',
    `saved ${money(v.savedUsd, v.f)}`,
  ]
  return `SuperTokenMan  ${parts.join(' · ')}`
}

type Figures = Awaited<ReturnType<typeof figures>>

/** A bar of `n` cells, `pct` of them full: the terminal's HP and stamina bars. */
const blocks = (pct: number, n: number) => {
  const full = Math.round((Math.max(0, Math.min(100, pct)) / 100) * n)
  return '█'.repeat(full) + '░'.repeat(n - full)
}
const timer = (m: number | null) => (m == null ? '--' : m > 0 ? `${m}m` : 'COLD')

/** What the SVG HUD draws, as plain values. */
function hudView(v: Figures, ko: Fight | null): HudView {
  const lim = (l: Figures['five']) => (l ? { used: Math.max(0, Math.min(100, l.percentUsed)), resets: hhmm(l.resetsAt) } : null)
  const top = v.ranked[0]?.usd || 1
  return {
    ctxUsed: v.ctxPct == null ? null : Math.max(0, Math.min(100, v.ctxPct)),
    ctxTokens: k(v.snap?.contextTokens ?? 0),
    ctxWindow: k(v.snap?.window ?? 0),
    five: lim(v.five),
    seven: lim(v.seven),
    cacheLeft: v.cacheLeft,
    round: v.s.times.length,
    score: v.snap?.costUsd != null ? money(v.snap.costUsd, v.f) : '-',
    saved: money(v.savedUsd, v.f),
    kos: v.sav.cuts.length,
    ko: ko && { tokens: k(ko.tokens), usd: money(ko.usd, v.f) },
    enemies: v.ranked.map((i) => ({ label: i.label, usd: money(i.usd, v.f), share: i.usd / top, meta: `${k(i.tokens)} tok x${i.rereads}` })),
  }
}

/** The pane's alt text: the HUD's line and the enemies. */
const paneAlt = (v: Figures) => [summary(v), ...v.ranked.map((i) => `${money(i.usd, v.f)} ${i.label} (${k(i.tokens)} tok x${i.rereads})`)].join('\n')

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'supertokenman', description: 'Open SuperTokenMan: context, plan, cache, cost and savings' })
    await update($, fight, () => null)
    void openPane($)
    void refreshFx($)
    void refresh($)
    return next(e)
  })

  // the app attached after the session started (a cloud session, a reopened window): open it there too
  on('session.attach', async ($, e, next) => {
    void openPane($)
    return next(e)
  })

  // opens the pane where the surface draws mods, and always answers in text, which every surface shows
  on('command.run', { command: 'supertokenman' }, async ($) => {
    await refresh($)
    const opened = await openPane($)
    const v = await figures($)
    const top = v.ranked.slice(0, 3).map((i) => `  ${money(i.usd, v.f)}  ${i.label}  (${k(i.tokens)} tok x${i.rereads})`)
    return { text: [summary(v), ...(top.length ? ['Costs most:', ...top] : []), ...(opened.isPlaced ? [] : ['(this surface draws no panes; the line above is the widget)'])].join('\n') }
  })

  // every main-thread model request: one more re-read of everything in context
  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    if (!e.agentId) {
      const at = await $.clock.now()
      await update($, steps, (s) => ({ times: [...s.times, at].slice(-5000), model: e.model || s.model }))
      await refresh($)
    }
    return r
  })

  // what each tool result puts in the main context, by the text the model reads
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId && typeof r.text === 'string' && r.text.length > 400) {
      const s = await read($, steps)
      const item: Item = { id: e.tool_use_id, label: labelOf(e as never), tokens: Math.round(r.text.length / 3.5), step: s.times.length }
      await update($, items, (list) => [...list, item].slice(-400))
    }
    // token-kit cuts Bash output: look now, so the fight follows the command
    if (!e.agentId && e.tool === 'Bash') await refresh($)
    return r
  }).catch(($, e, next) => next(e)) // only observes: a failure here must never change the tool call

  on('session.measure', async ($, e, next) => {
    const at = await $.clock.now()
    await update($, snapshot, (old) => ({
      contextTokens: e.context.tokens ?? old?.contextTokens ?? 0,
      window: e.context.window,
      percent: e.context.percent ?? null,
      limits: e.rateLimits.map((l) => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
      costUsd: e.cost?.usd ?? old?.costUsd ?? null,
      at,
    }))
    return next(e)
  })

  // the HUD: always on screen above the prompt, with a button to the details pane
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const v = await figures($)
    const ko = await read($, fight)
    if (e.surface !== 'terminal') {
      const { Svg } = $.ui.resolve(e)
      return (
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Box flexGrow={1}>
            <Svg source={hudBand(hudView(v, ko))} alt={summary(v)} isInteractive />
          </Box>
          <Button key="details" label="Details" plain dimColor onPress={() => openPane($)} />
        </Box>
      )
    }
    const hp = v.ctxPct == null ? null : 100 - v.ctxPct
    const low = (left: number) => (left < 25 ? C.deep : undefined)
    return (
      <Box flexDirection="row" alignItems="center">
        <Text wrap="truncate-end">
          <Text weight="semibold" color={C.orange}>SUPERTOKENMAN</Text>
          {'  HP '}
          <Text color={hp != null && hp < 25 ? C.deep : C.orange}>{blocks(hp ?? 0, 10)}</Text>
          {` ${hp == null ? '--' : `${Math.round(hp)}%`}`}
          {v.five && <Text color={low(100 - v.five.percentUsed)}>{`  5H ${Math.round(100 - v.five.percentUsed)}%`}</Text>}
          {v.seven && <Text color={low(100 - v.seven.percentUsed)}>{`  7D ${Math.round(100 - v.seven.percentUsed)}%`}</Text>}
          <Text color={v.cacheLeft != null && v.cacheLeft <= 0 ? C.deep : undefined}>{`  CACHE ${timer(v.cacheLeft)}`}</Text>
          {`  ROUND ${v.s.times.length}  SCORE ${v.snap?.costUsd != null ? money(v.snap.costUsd, v.f) : '-'}  `}
          <Text color={C.orange}>{`SAVED ${money(v.savedUsd, v.f)} · ${v.sav.cuts.length} KO`}</Text>
          {ko && <Text color={C.orange}>{`  ${FRAMES[Math.min(ko.frame, FRAMES.length - 1)]}`}</Text>}
          {ko && <Text weight="semibold" color={C.deep}>{`  K.O. -${k(ko.tokens)} WASTED TOKENS +${money(ko.usd, v.f)}`}</Text>}
        </Text>
        <Text>{'  '}</Text>
        <Button key="details" label="Details" plain onPress={() => openPane($)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const v = await figures($)
    const ko = await read($, fight)
    const note = `API list prices, US$1 = ${money(1, v.f)} (${v.f.source}). On a plan this is the value of the work, not the bill.`
    if (e.surface !== 'terminal') {
      const { Svg } = $.ui.resolve(e)
      return (
        <Box flexDirection="column" gap={1}>
          <Svg source={hudPane(hudView(v, ko))} alt={paneAlt(v)} isInteractive />
          <Text dimColor size="caption">{note}</Text>
        </Box>
      )
    }
    const width = Math.max(10, Math.min((e.props.bodyColumns ?? 40) - 16, 40))
    const row = (label: string, left: number | null, value: string, caption: string) => (
      <Box key={label} flexDirection="column">
        <Text>
          <Text weight="semibold">{label.padEnd(5)}</Text>
          <Text color={left != null && left < 25 ? C.deep : C.orange}>{blocks(left ?? 0, width)}</Text>
          {` ${value}`}
        </Text>
        <Text dimColor>{`     ${caption}`}</Text>
      </Box>
    )
    const { snap, five, seven, cacheLeft, ranked, f } = v
    const hp = v.ctxPct == null ? null : 100 - v.ctxPct
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text weight="semibold" color={C.orange}>SUPERTOKENMAN</Text>
          <Text>
            {`SCORE ${snap?.costUsd != null ? money(snap.costUsd, f) : '-'}  ROUND ${v.s.times.length}  `}
            <Text color={C.orange}>{`${money(v.savedUsd, f)} saved by token-kit`}</Text>
            <Text dimColor>{`  ${v.sav.cuts.length} KO`}</Text>
          </Text>
        </Box>
        {ko && (
          <Box flexDirection="column">
            <Text color={C.orange}>{FRAMES[Math.min(ko.frame, FRAMES.length - 1)]}</Text>
            <Text weight="semibold" color={C.deep}>{`K.O.! ${k(ko.tokens)} wasted tokens cut, ${money(ko.usd, f)} not written to the cache`}</Text>
          </Box>
        )}
        <Box flexDirection="column">
          <Text weight="semibold">STATS</Text>
          {row('HP', hp, hp == null ? '--' : `${Math.round(hp)}%`, snap && hp != null ? `context: ${k(snap.contextTokens)} of ${k(snap.window)} tokens used` : 'context: no reply yet')}
          {five && row('5H', 100 - five.percentUsed, `${Math.round(100 - five.percentUsed)}%`, five.resetsAt ? `plan window: resets ${hhmm(five.resetsAt)}` : 'plan window')}
          {seven && row('7D', 100 - seven.percentUsed, `${Math.round(100 - seven.percentUsed)}%`, 'weekly window')}
          {row(
            'TIME',
            cacheLeft == null ? null : (Math.max(0, cacheLeft) / 60) * 100,
            cacheLeft == null ? '--' : cacheLeft > 0 ? `${cacheLeft}m` : 'COLD',
            cacheLeft == null ? 'prompt cache: not written yet' : cacheLeft > 0 ? 'prompt cache warm: a reply resets the hour' : `cache cold: the next message re-reads ${k(snap?.contextTokens ?? 0)} tokens at full price. /clear if it is a new topic.`,
          )}
        </Box>
        <Box flexDirection="column">
          <Text weight="semibold">BIGGEST ENEMIES (written once, re-read every request)</Text>
          {ranked.length === 0 && <Text dimColor>No enemies yet.</Text>}
          {ranked.map((i) => (
            <Text key={i.id} wrap="truncate-end">
              <Text tabular color={C.orange}>{money(i.usd, f).padStart(8)}</Text>
              {`  ${i.label}  `}
              <Text dimColor>{`${k(i.tokens)} tok x${i.rereads}`}</Text>
            </Text>
          ))}
        </Box>
        <Text dimColor size="caption">{note}</Text>
      </Box>
    )
  })
}
