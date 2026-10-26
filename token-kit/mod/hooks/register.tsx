import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Fx, Item, Savings, Snapshot, Steps } from '../types'

// SuperTokenMan: an always-on band above the prompt (terminal and Desktop) and a details pane.
// Context, plan windows, prompt cache, what the session is worth at API prices, what token-kit
// saved, and the tool results that cost most because every later request re-reads them.
// Text only, Anthropic palette.

const PANE = 'supertokenman'
const TITLE = 'SuperTokenMan'
const snapshot = atom({ plugin: 'supertokenman', key: 'snapshot' } as const, null)
const items = atom({ plugin: 'supertokenman', key: 'items' } as const, [])
const steps = atom({ plugin: 'supertokenman', key: 'steps' } as const, { times: [], model: '' })
const savings = atom({ plugin: 'supertokenman', key: 'savings' } as const, { cuts: [] })
const fx = atom({ plugin: 'supertokenman', key: 'fx' } as const, { currency: 'BRL', rate: 5.05, at: 0, source: 'fallback' })

const C = { dark: '#141413', light: '#faf9f5', gray: '#b0aea5', track: '#e8e6dc', orange: '#d97757', blue: '#6a9bcc', green: '#788c5d' }
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

type Dollar = Parameters<Parameters<Register>[0]>[2] extends (...a: infer A) => unknown ? A[0] : never

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
  return { cuts }
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
  await update($, savings, () => s)
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

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'supertokenman', description: 'Open SuperTokenMan: context, plan, cache, cost and savings' })
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

  on('command.run', { command: 'supertokenman' }, async ($) => {
    await openPane($)
    await refresh($)
    return { text: 'SuperTokenMan opened.' }
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

  // the widget: always on screen above the prompt, one line, with a button to the details pane
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const v = await figures($)
    const tone = (pct: number) => (pct >= 80 ? C.orange : undefined)
    const sep = <Text dimColor>{'  ·  '}</Text>
    return (
      <Box flexDirection="row" flexWrap="wrap" alignItems="center">
        <Text weight="semibold" color={C.orange}>
          SuperTokenMan
        </Text>
        {sep}
        <Text color={v.ctxPct != null ? tone(v.ctxPct) : undefined}>{v.ctxPct != null ? `ctx ${Math.round(v.ctxPct)}% ${k(v.snap?.contextTokens ?? 0)}` : 'ctx -'}</Text>
        {v.five && (
          <>
            {sep}
            <Text color={tone(v.five.percentUsed)}>{`5h ${Math.round(v.five.percentUsed)}%`}</Text>
          </>
        )}
        {v.seven && (
          <>
            {sep}
            <Text color={tone(v.seven.percentUsed)}>{`7d ${Math.round(v.seven.percentUsed)}%`}</Text>
          </>
        )}
        {sep}
        <Text color={v.cacheLeft != null && v.cacheLeft <= 0 ? C.orange : undefined}>
          {v.cacheLeft == null ? 'cache -' : v.cacheLeft > 0 ? `cache ${v.cacheLeft}m` : 'cache cold'}
        </Text>
        {sep}
        <Text>{v.snap?.costUsd != null ? money(v.snap.costUsd, v.f) : '-'}</Text>
        {sep}
        <Text color={C.orange}>{`saved ${money(v.savedUsd, v.f)}`}</Text>
        <Text>{'  '}</Text>
        <Button key="details" label="Details" plain onPress={() => openPane($)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    // Svg is drawn everywhere but the terminal; narrowing the surface narrows the table
    const Svg = e.surface !== 'terminal' ? $.ui.resolve(e).Svg : null
    const { snap, s, sav, f, ranked, savedUsd, cacheLeft, five, seven, ctxPct } = await figures($)
    const width = Math.max(20, Math.min(e.props.bodyColumns ?? 40, 60))

    const bar = (pct: number, key: string) => {
      const p = Math.max(0, Math.min(100, pct))
      const color = p >= 80 ? C.orange : C.blue
      if (Svg) {
        const w = 240
        const src = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="8" viewBox="0 0 ${w} 8"><rect width="${w}" height="8" rx="4" fill="${C.track}"/><rect width="${Math.max(4, (w * p) / 100)}" height="8" rx="4" fill="${color}"/></svg>`
        return <Svg key={key} source={src} alt={`${Math.round(p)}%`} width={w} height={8} />
      }
      const cells = Math.max(10, width - 8)
      const full = Math.round((cells * p) / 100)
      return <Text color={color}>{'='.repeat(full)}<Text dimColor>{'-'.repeat(cells - full)}</Text></Text>
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text weight="semibold">Context</Text>
          {snap && ctxPct != null ? (
            <>
              <Text>
                {snap.percent != null ? `${Math.round(snap.percent)}%  ` : ''}
                <Text dimColor>{`${k(snap.contextTokens)} of ${k(snap.window)} tokens`}</Text>
              </Text>
              {bar(ctxPct, 'ctx')}
            </>
          ) : (
            <Text dimColor>No response yet.</Text>
          )}
        </Box>

        {(five || seven) && (
          <Box flexDirection="column">
            <Text weight="semibold">Plan</Text>
            {five && (
              <>
                <Text>
                  {`5h  ${Math.round(five.percentUsed)}%  `}
                  <Text dimColor>{five.resetsAt ? `resets ${hhmm(five.resetsAt)}` : ''}</Text>
                </Text>
                {bar(five.percentUsed, '5h')}
              </>
            )}
            {seven && (
              <>
                <Text>{`7d  ${Math.round(seven.percentUsed)}%`}</Text>
                {bar(seven.percentUsed, '7d')}
              </>
            )}
          </Box>
        )}

        <Box flexDirection="column">
          <Text weight="semibold">Prompt cache</Text>
          {cacheLeft == null ? (
            <Text dimColor>Not written yet.</Text>
          ) : cacheLeft > 0 ? (
            <Text>
              {`warm, ~${cacheLeft} min left  `}
              <Text dimColor>a reply resets the hour</Text>
            </Text>
          ) : (
            <Text color={C.orange}>{`cold: the next message re-reads ${k(snap?.contextTokens ?? 0)} tokens at full price. /clear if it is a new topic.`}</Text>
          )}
        </Box>

        <Box flexDirection="column">
          <Text weight="semibold">This session</Text>
          <Text>
            {snap?.costUsd != null ? money(snap.costUsd, f) : '-'}
            <Text dimColor>{`  at API prices, ${s.times.length} requests`}</Text>
          </Text>
          <Text color={C.orange}>
            {`${money(savedUsd, f)} saved by token-kit`}
            <Text dimColor>{`  ${sav.cuts.length} cut${sav.cuts.length === 1 ? '' : 's'}`}</Text>
          </Text>
        </Box>

        <Box flexDirection="column">
          <Text weight="semibold">Costs most (written once, re-read every request)</Text>
          {ranked.length === 0 && <Text dimColor>No large tool results yet.</Text>}
          {ranked.map((i) => (
            <Text key={i.id} wrap="truncate-end">
              <Text tabular>{money(i.usd, f).padStart(8)}</Text>
              {`  ${i.label}  `}
              <Text dimColor>{`${k(i.tokens)} tok x${i.rereads}`}</Text>
            </Text>
          ))}
        </Box>

        <Text dimColor size="caption">
          {`API list prices, US$1 = ${money(1, f)} (${f.source}). On a plan this is the value of the work, not the bill.`}
        </Text>
      </Box>
    )
  })
}
