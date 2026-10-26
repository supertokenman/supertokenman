import { SplitFlap } from './SplitFlap'
import type { Stage } from '../shared/compact'
import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import type { Source, Summary } from '../electron/ledger'

type Info = { id: Source; name: string; what: string; method: 'measured' | 'from the tool' | 'estimated' }
const RANGES = [
  { id: 1, name: 'Today' },
  { id: 7, name: '7 days' },
  { id: 30, name: '30 days' },
  { id: 0, name: 'All' },
]
/** One fixed color per source, validated for color vision in both themes; it follows the source, never its rank. */
const COLOR: Record<Source, string> = { cache: 'var(--sv-1)', condenser: 'var(--sv-2)', headroom: 'var(--sv-3)', 'local-model': 'var(--sv-4)', 'web-reader': 'var(--sv-5)', reread: 'var(--sv-6)', compactor: 'var(--sv-7)', scripts: 'var(--sv-8)', symbolic: 'var(--sv-9)' }
const kTok = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n)))

type Panel = { sid: string; cwd: string; model: string }

/** The switch for leaving out built-in tools panels here do not use. */
function LeanTools() {
  const [l, setL] = useState<Awaited<ReturnType<typeof window.stm.lean.get>> | null>(null)
  useEffect(() => void window.stm.lean.get().then(setL), [])
  if (!l) return null
  return (
    <div className="sv-over-list">
      <div className="sv-lean">
        <div>
          <div className="sv-over-sub">Leave out tools panels do not use</div>
          <div className="faint sv-small">{l.off.join(', ')}. About {kTok(l.saves)} tokens less on every turn; coding, web and task tools stay. Applies to panels opened after.</div>
        </div>
        <label className="switch">
          <input type="checkbox" checked={l.on} onChange={async (e) => setL({ ...l, on: await window.stm.lean.set(e.target.checked) })} />
          <span />
        </label>
      </div>
    </div>
  )
}

/** The context compactor's stages: what the app adds to prompts, without repeats; cutting is opt-in. */
function Compactor() {
  const [st, setSt] = useState<Stage[] | null>(null)
  useEffect(() => void window.stm.compactor.get().then(setSt), [])
  if (!st) return null
  const flip = (x: Stage, on: boolean) => {
    const next = on ? [...st, x] : st.filter((y) => y !== x)
    setSt(next)
    void window.stm.compactor.set(next)
  }
  const ROWS: [Stage, string, string][] = [
    ['repeats', 'Repeated lines', 'A line that repeats becomes one line with a count.'],
    ['json', 'JSON lists as tables', 'A list of records with the same fields becomes a table, turned back exactly when read.'],
    ['dedup', 'Paragraphs already sent', 'A long paragraph this panel already sent becomes a pointer to it.'],
    ['cut', 'Cut long text (loses detail)', 'Keeps the start and end of very long text and says how much was left out. Off by default.'],
  ]
  return (
    <div className="sv-over-list">
      <div className="sv-over-sub">Context compactor: what the app adds to prompts</div>
      {ROWS.map(([id, name, what]) => (
        <div className="sv-lean" key={id}>
          <div><div>{name}</div><div className="faint sv-small">{what}</div></div>
          <label className="switch"><input type="checkbox" checked={st.includes(id)} onChange={(e) => flip(id, e.target.checked)} aria-label={name} /><span /></label>
        </div>
      ))}
    </div>
  )
}

/** What one open panel carries on every turn, largest first, priced warm and cold. */
function Overhead(props: { money: (usd: number) => string }) {
  const [panels, setPanels] = useState<Panel[]>([])
  const [sid, setSid] = useState('')
  const [o, setO] = useState<Awaited<ReturnType<typeof window.stm.overhead.get>> | undefined>(undefined)
  useEffect(() => {
    void window.stm.overhead.panels().then((p) => {
      setPanels(p)
      setSid((s) => s || p[p.length - 1]?.sid || '')
    })
  }, [])
  useEffect(() => {
    if (!sid) return
    setO(undefined)
    void window.stm.overhead.get(sid).then(setO)
  }, [sid])
  if (!panels.length) return null
  const max = o ? Math.max(...o.rows.map((r) => r.tokens), 1) : 1
  const name = (p: Panel) => `${p.cwd.split('/').filter(Boolean).pop() ?? p.cwd}${p.model ? ` · ${p.model.replace(/^claude-/, '')}` : ''}`
  return (
    <section className="sv-over">
      <div className="sv-over-head">
        <div>
          <div className="sv-over-title">Paid on every turn</div>
          <div className="faint sv-small">What a panel sends before the conversation: instructions, tool definitions, memory files. Smaller is cheaper on every message.</div>
        </div>
        <span className="spacer-flex" />
        {panels.length > 1 && (
          <select value={sid} onChange={(e) => setSid(e.target.value)} aria-label="Panel">
            {panels.map((p) => <option key={p.sid} value={p.sid}>{name(p)}</option>)}
          </select>
        )}
      </div>
      {o === undefined ? (
        <div className="faint sv-small">Measuring...</div>
      ) : o === null ? (
        <div className="faint sv-small">This panel is asleep or has not started: send it a message, then come back.</div>
      ) : (
        <>
          <div className="sv-over-sum">
            <span className="sv-over-big">{kTok(o.fixed)}</span>
            <span className="faint">tokens a turn · {props.money(o.warmUsd)} while the cache is warm, {props.money(o.coldUsd)} cold · {props.money(o.warmUsd * 100)} per 100 warm turns</span>
          </div>
          <ul className="sv-bars">
            {o.rows.map((r) => (
              <li key={r.id}>
                <span>{r.name}</span>
                <span className="sv-bar"><span style={{ width: `${(r.tokens / max) * 100}%` }} /></span>
                <span className="num">{kTok(r.tokens)}</span>
              </li>
            ))}
          </ul>
          {o.servers.length > 0 && (
            <div className="sv-over-list">
              <div className="sv-over-sub">Tools by server</div>
              {o.servers.map((x) => (
                <div key={x.name} className="sv-over-item">
                  <span className="mono">{x.name}</span>
                  <span className="faint">{x.tools} tools{x.onDemand ? ', on demand' : ', every turn'}</span>
                  <span className="num">{kTok(x.tokens)}</span>
                </div>
              ))}
              <div className="faint sv-small">
                {o.servers.some((x) => !x.onDemand)
                  ? 'Tools sent every turn cost on every message even when unused: turn the server off in Connections if this project does not need it.'
                  : 'All on demand: a server’s tools cost only once Claude looks them up.'}
              </div>
            </div>
          )}
          {o.memory.length > 0 && (
            <div className="sv-over-list">
              <div className="sv-over-sub">Memory files</div>
              {o.memory.map((m) => (
                <div key={m.path} className="sv-over-item">
                  <span className="mono sv-path" title={m.path}>{m.path.replace(/^\/(Users|home)\/[^/]+/, '~')}</span>
                  <span />
                  <span className="num">{kTok(m.tokens)}</span>
                </div>
              ))}
            </div>
          )}
          <LeanTools />
          <Compactor />
          {o.deferred > 0 && <div className="faint sv-small">Another {kTok(o.deferred)} tokens of tool definitions wait until Claude searches for them, and cost nothing until then.</div>}
        </>
      )}
    </section>
  )
}

/**
 * Where the money did not go: what the work would have cost, each saving tool taking its part off,
 * and what was billed. Every number says how it is known.
 */
export function SavingsSheet(props: { onClose: () => void; usdToBrl: number }) {
  const [range, setRange] = useState(7)
  const [data, setData] = useState<{ summary: Summary; sources: Info[] } | null>(null)
  const [hr, setHr] = useState<Awaited<ReturnType<typeof window.stm.headroom.get>> | null>(null)
  const [sym, setSym] = useState<{ on: boolean; installed: boolean } | null>(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [hover, setHover] = useState<string | null>(null)
  const money = (usd: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'BRL', maximumFractionDigits: usd * props.usdToBrl >= 100 ? 0 : 2 }).format(usd * props.usdToBrl)
  useEffect(() => {
    void window.stm.savings.get(range).then(setData)
    void window.stm.headroom.get().then(setHr)
    void window.stm.symbols.get().then(setSym)
    const t = setInterval(() => void window.stm.savings.get(range).then(setData), 30_000)
    return () => clearInterval(t)
  }, [range])
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [props])

  const s = data?.summary
  const without = s ? s.billedUsd + s.savedUsd : 0
  const pct = without > 0 && s ? (s.savedUsd / without) * 100 : 0
  const info = (id: Source) => data?.sources.find((x) => x.id === id)

  // the waterfall: a full bar, one floating step per source, the billed bar
  const W = 720
  const H = 230
  const top = 18
  const base = H - 34
  const bars = s ? [{ key: 'without', label: 'Without savings', usd: without }, ...s.bySource.map((b) => ({ key: b.id, label: info(b.id)?.name ?? b.id, usd: b.usd })), { key: 'billed', label: 'Billed', usd: s.billedUsd }] : []
  const y = (usd: number) => base - (without > 0 ? (usd / without) * (base - top) : 0)
  const slot = W / Math.max(1, bars.length)
  const bw = Math.min(64, slot * 0.56)
  let level = without

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet savings" role="dialog" aria-label="Savings">
        <header className="sheet-head">
          <div className="sheet-title">Savings</div>
          <span className="faint">What each tool kept off your bill</span>
          <span className="spacer-flex" />
          <div className="segmented">
            {RANGES.map((r) => (
              <button key={r.id} aria-selected={range === r.id} onClick={() => setRange(r.id)}>{r.name}</button>
            ))}
          </div>
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        <div className="sheet-body sv">
          {err && <div className="notice error">{err}</div>}
          {!s ? (
            <div className="faint pad">Reading...</div>
          ) : without === 0 ? (
            <div className="sheet-empty">
              <div className="se-title">Nothing recorded yet</div>
              <div className="se-text">Every panel's turns, cuts and local tasks are written here as they happen. Run a panel for a while and come back.</div>
            </div>
          ) : (
            <>
              <div className="sv-hero">
                <div>
                  <div className="sv-big"><SplitFlap value={money(s.savedUsd)} /></div>
                  <div className="sv-sub">kept off the bill · {kTok(s.savedTokens)} tokens</div>
                </div>
                <div>
                  <div className="sv-big">{pct.toFixed(0)}%</div>
                  <div className="sv-sub">of what it would have cost</div>
                </div>
                <div>
                  <div className="sv-big"><SplitFlap value={money(s.billedUsd)} /></div>
                  <div className="sv-sub">billed, at API prices</div>
                </div>
              </div>

              {s.lapsed.count > 0 && (
                <div className="sv-lapsed faint">
                  Lost to an expired cache: {money(s.lapsed.usd)}, {s.lapsed.count === 1 ? 'once' : `${s.lapsed.count} times`}. A message before a panel’s cache chip runs out re-reads the conversation at a tenth of the price.
                </div>
              )}

              <figure className="sv-chart">
                <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Would have cost ${money(without)}; savings took off ${money(s.savedUsd)}; billed ${money(s.billedUsd)}`}>
                  <line x1="0" x2={W} y1={base} y2={base} className="sv-axis" />
                  {bars.map((b, i) => {
                    const x = i * slot + (slot - bw) / 2
                    const isStep = b.key !== 'without' && b.key !== 'billed'
                    const y0 = isStep ? y(level) : y(b.usd)
                    const h = isStep ? Math.max(2, y(level - b.usd) - y(level)) : Math.max(2, base - y(b.usd))
                    const fill = isStep ? COLOR[b.key as Source] : b.key === 'billed' ? 'var(--sv-billed)' : 'var(--sv-without)'
                    const out = (
                      <g key={b.key} onMouseEnter={() => setHover(b.key)} onMouseLeave={() => setHover(null)} className={hover && hover !== b.key ? 'sv-dim' : ''}>
                        {isStep && i > 0 && <line x1={x - (slot - bw)} x2={x} y1={y(level)} y2={y(level)} className="sv-link" />}
                        <rect x={x - 6} y={top - 6} width={bw + 12} height={base - top + 12} fill="transparent" />
                        <rect x={x} y={y0} width={bw} height={h} rx="4" fill={fill} />
                        <text x={x + bw / 2} y={y0 - 6} textAnchor="middle" className="sv-val">{isStep ? `−${money(b.usd)}` : money(b.usd)}</text>
                        <text x={x + bw / 2} y={base + 16} textAnchor="middle" className="sv-lab">{b.label}</text>
                      </g>
                    )
                    if (isStep) level -= b.usd
                    return out
                  })}
                </svg>
                {hover && hover !== 'without' && hover !== 'billed' && (() => {
                  const b = s.bySource.find((x) => x.id === hover)!
                  const i = info(b.id)
                  return (
                    <div className="sv-tip">
                      <b>{i?.name}</b> · {money(b.usd)} · {kTok(b.tokens)} tokens
                      <div className="faint">{i?.what}</div>
                    </div>
                  )
                })()}
              </figure>

              <table className="sv-table">
                <thead>
                  <tr><th>Tool</th><th>What it does</th><th className="num">Tokens</th><th className="num">Kept off</th><th>How we know</th></tr>
                </thead>
                <tbody>
                  {s.bySource.map((b) => {
                    const i = info(b.id)
                    return (
                      <tr key={b.id}>
                        <td><span className="sv-key" style={{ background: COLOR[b.id] }} />{i?.name}</td>
                        <td className="faint">{i?.what}</td>
                        <td className="num">{kTok(b.tokens)}</td>
                        <td className="num">{money(b.usd)}</td>
                        <td><span className={`sv-method ${i?.method.replace(/\s/g, '-')}`}>{i?.method}</span></td>
                      </tr>
                    )
                  })}
                  <tr className="sv-unmeasured">
                    <td><span className="sv-key off" />caveman</td>
                    <td className="faint">Terse answers, from the Catalog. Our test: replies two thirds shorter, total cost unchanged on a code task, one answer in three incomplete.</td>
                    <td className="num faint">–</td>
                    <td className="num faint">–</td>
                    <td><span className="sv-method none">no saving found</span></td>
                  </tr>
                  <tr className="sv-unmeasured">
                    <td><span className="sv-key off" />superpowers</td>
                    <td className="faint">Planning and review habits that aim for fewer wasted turns, from the Catalog.</td>
                    <td className="num faint">–</td>
                    <td className="num faint">–</td>
                    <td><span className="sv-method none">not measured</span></td>
                  </tr>
                </tbody>
              </table>
              <p className="faint sv-note">Measured: from Anthropic's own usage numbers or our own counts. From the tool: the tool's own stats. Estimated: about four characters to a token. A token kept out is priced once at the model's input price, so long sessions, where it would have been re-read every turn, save more than shown.</p>
            </>
          )}

          <Overhead money={money} />

          {hr && (
            <div className="sv-more">
              <div className="sv-more-head">
                <span className="sv-key" style={{ background: COLOR.headroom }} />
                <b>Headroom</b>
                <span className="faint">{hr.live ? 'on: new panels send through it' : hr.on ? 'on, but not answering: panels go straight to Anthropic' : 'compresses tool output, logs and JSON before they are sent'}</span>
                <span className="spacer-flex" />
                {!hr.installed ? (
                  <button className="small" disabled={Boolean(busy)} onClick={async () => {
                    setBusy('install'); setErr('')
                    try { await window.stm.headroom.install(); setHr(await window.stm.headroom.get()) } catch (e) { setErr(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)) }
                    setBusy('')
                  }}>{busy === 'install' ? <span className="spinner" /> : 'Install, about 200 MB'}</button>
                ) : (
                  <label className="switch">
                    <input type="checkbox" checked={hr.on} disabled={Boolean(busy)} onChange={async (e) => {
                      setBusy('toggle'); setErr('')
                      try { await window.stm.headroom.set(e.target.checked) } catch (x) { setErr(x instanceof Error ? x.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(x)) }
                      setHr(await window.stm.headroom.get()); setBusy('')
                    }} />
                    <span />
                  </label>
                )}
              </div>
              {hr.stats && hr.stats.requests > 0 && <div className="faint sv-small">{hr.stats.requests} requests · {kTok(hr.stats.tokensSaved)} tokens kept out · its own estimate {money(hr.stats.savedUsd)}</div>}
              {hr.installed && (
                <div className="sv-opt">
                  <div>
                    <b>Shorter answers</b>
                    <div className="faint sv-small">Headroom steers replies to fewer words. It needs its token mode, which can rewrite earlier turns and read the prompt cache less, so 1 conversation in 10 runs without it and the reduction below is measured against those.</div>
                  </div>
                  <label className="switch">
                    <input id="hr-shorter" type="checkbox" checked={hr.shorter} disabled={Boolean(busy)} onChange={async (e) => {
                      setBusy('shorter'); setErr('')
                      try { await window.stm.headroom.shorter(e.target.checked) } catch (x) { setErr(x instanceof Error ? x.message : String(x)) }
                      setHr(await window.stm.headroom.get()); setBusy('')
                    }} />
                    <span />
                  </label>
                </div>
              )}
              {hr.stats?.output?.active && (
                <div className="faint sv-small">
                  {hr.stats.output.method === null
                    ? 'Shorter answers: no replies measured yet.'
                    : `Shorter answers: ${hr.stats.output.percent.toFixed(1)}% fewer output tokens over ${hr.stats.output.requests} replies, ${hr.stats.output.method === 'measured' ? 'measured against the 10% that ran without it' : hr.stats.output.method === 'estimated' ? 'estimated from your earlier sessions, not yet measured' : 'modelled from benchmarks, not yet measured'}${hr.stats.output.low !== null && hr.stats.output.high !== null ? ` (${hr.stats.output.method === 'modelled' ? 'range' : '95% interval'} ${hr.stats.output.low.toFixed(1)}% to ${hr.stats.output.high.toFixed(1)}%)` : ''}.`}
                </div>
              )}
              {hr.stats?.cache && hr.stats.cache.requests > 0 && (
                <div className={`sv-small ${hr.stats.cache.prefixMisses ? 'sv-warn' : 'faint'}`}>
                  Prompt cache: {hr.stats.cache.hits} of {hr.stats.cache.requests} requests read it{hr.stats.cache.prefixMisses ? `; ${hr.stats.cache.prefixMisses} missed because the start of the prompt changed` : '; none missed because the prompt changed'}.
                </div>
              )}
              {hr.installed && <HeadroomQuality onErr={setErr} />}
              <div className="faint sv-small">Runs on this Mac (Apache-2.0); its anonymous beacon stays off. Applies to panels opened after you turn it on.</div>
            </div>
          )}
          {sym && (
            <div className="sv-more">
              <div className="sv-more-head">
                <span className="sv-key off" />
                <b>Code index</b>
                <span className="faint">{sym.on ? 'on: new panels look up one function or its callers instead of reading whole files' : 'panels look up a symbol, one function or its callers instead of reading whole files'}</span>
                <span className="spacer-flex" />
                {!sym.installed ? (
                  <button className="small" disabled={Boolean(busy)} onClick={async () => {
                    setBusy('symbols'); setErr('')
                    try { await window.stm.symbols.install(); setSym(await window.stm.symbols.get()) } catch (e) { setErr(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)) }
                    setBusy('')
                  }}>{busy === 'symbols' ? <span className="spinner" /> : 'Install, about 70 MB'}</button>
                ) : (
                  <label className="switch">
                    <input type="checkbox" checked={sym.on} disabled={Boolean(busy)} onChange={async (e) => setSym({ ...sym, on: await window.stm.symbols.set(e.target.checked) })} />
                    <span />
                  </label>
                )}
              </div>
              <div className="faint sv-small">Token Savior (MIT) indexes each panel’s folder on this Mac; a large repository takes a couple of minutes the first time. In our tests (Haiku, our app and VS Code) it did not lower the cost, and twice its search missed one of six callers that grep found: off by default, not in the chart.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** What compression kept, request by request, from the proxy's own log of before and after. */
function HeadroomQuality(props: { onErr: (e: string) => void }) {
  const [q, setQ] = useState<Awaited<ReturnType<typeof window.stm.headroom.quality>> | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => void window.stm.headroom.quality().then(setQ), [])
  if (!q) return null
  return (
    <>
      <div className="sv-opt">
        <div>
          <b>Check what compression kept</b>
          <div className="faint sv-small">The proxy keeps its last requests before and after compression, in its own memory on this Mac, so each can be compared: how much of the text survived, whether error lines did, and whether what was cut can be fetched back.</div>
        </div>
        <label className="switch">
          <input id="hr-inspect" type="checkbox" checked={q.on} disabled={busy} onChange={async (e) => {
            setBusy(true)
            try {
              await window.stm.headroom.inspect(e.target.checked)
            } catch (x) {
              props.onErr(x instanceof Error ? x.message : String(x))
            }
            setQ(await window.stm.headroom.quality())
            setBusy(false)
          }} />
          <span />
        </label>
      </div>
      {q.on && (
        <div className="hrq">
          {q.rows.filter((r) => r.changed).length === 0 && <div className="faint sv-small">{q.rows.length ? `${q.rows.length} requests logged; compression changed none of them yet.` : 'No requests logged since it was turned on.'}</div>}
          {q.rows.filter((r) => r.changed).map((r) => (
            <div key={r.id} className="hrq-row">
              <span className="hrq-num">{r.percent}% smaller</span>
              <span className="hrq-num">{r.kept}% of the words kept</span>
              <span className={`hrq-num ${r.errors && r.errorsKept < r.errors ? 'bad' : ''}`}>{r.errors ? `${r.errorsKept} of ${r.errors} error lines kept` : 'no error lines'}</span>
              <span className={`hrq-num ${r.retrievable ? '' : 'bad'}`}>{r.retrievable ? 'cut text can be fetched back' : 'cut text is gone'}</span>
              <span className="faint hrq-t">{r.transforms.filter((t) => !t.startsWith('cache_mode')).join(', ')}</span>
            </div>
          ))}
          <button className="ghost small" onClick={() => void window.stm.headroom.quality().then(setQ)}>Refresh</button>
        </div>
      )}
    </>
  )
}
