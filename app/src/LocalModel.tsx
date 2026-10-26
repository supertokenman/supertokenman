import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { paramsOf, READ_MIN_PARAMS } from '../shared/params'

/**
 * The local model at a glance: each link of the chain from "Ollama is installed" to "panels use it",
 * up or not with the one thing to do about it, a test that proves it answers, what ran on this Mac
 * and what that kept off the plan.
 */
type Status = Awaited<ReturnType<typeof window.stm.local.status>>
type Test = Awaited<ReturnType<typeof window.stm.local.test>>
type State = 'up' | 'warn' | 'down' | 'off'

const gb = (n: number) => `${(n / 1e9).toFixed(1)} GB`
const kTok = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n)))
const PULL = 'ollama pull qwen3:4b-instruct'
const ago = (at: number) => {
  const s = Math.round((Date.now() - at) / 1000)
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`
}
const until = (iso: string) => {
  const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000)
  return s <= 0 ? 'now' : s < 90 ? `in ${s}s` : `in ${Math.round(s / 60)} min`
}

/** The brand's pictograms, one per link: the same shapes as the panel steps. */
function Mark({ shape }: { shape: 'square' | 'circle' | 'triangle' | 'cut' | 'cross' }) {
  return (
    <svg className="lm-mark" viewBox="0 0 10 10" aria-hidden>
      {shape === 'square' && <rect x="1" y="1" width="8" height="8" />}
      {shape === 'circle' && <circle cx="5" cy="5" r="4" />}
      {shape === 'triangle' && <path d="M5 1 9.2 9H.8Z" />}
      {shape === 'cut' && <path d="M1 1h8v5L6 9H1Z" />}
      {shape === 'cross' && <path d="m1.5 1.5 7 7m0-7-7 7" />}
    </svg>
  )
}

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      className="ghost small lm-cmd"
      title="Copy the command"
      onClick={() => {
        void navigator.clipboard?.writeText(text)
        setDone(true)
        setTimeout(() => setDone(false), 1200)
      }}
    >
      <code>{text}</code>
      <span>{done ? 'Copied' : 'Copy'}</span>
    </button>
  )
}

export function LocalModelSheet(props: { onClose: () => void; usdToBrl: number }) {
  const [st, setSt] = useState<Status | null>(null)
  const [test, setTest] = useState<Test | null>(null)
  const [suggested, setSuggested] = useState<{ name: string; job: string; size: string }[]>([])
  const [pull, setPull] = useState<{ name: string; status: string; done: number; error?: string } | null>(null)
  useEffect(() => {
    void window.stm.local.suggested().then(setSuggested)
    return window.stm.local.onPull((p) => setPull((cur) => (cur && cur.name === p.name ? { ...cur, ...p } : cur)))
  }, [])
  const download = async (name: string) => {
    setPull({ name, status: 'starting', done: 0 })
    const r = await window.stm.local.pull(name)
    setPull(r.error ? { name, status: 'failed', done: 0, error: r.error } : null)
    refresh()
  }
  const [testing, setTesting] = useState(false)
  const [starting, setStarting] = useState(false)
  const [saved, setSaved] = useState<{ today: number; week: number; all: number; usd: number } | null>(null)
  const refresh = () => void window.stm.local.status().then(setSt)
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 3000)
    const pick = (s: Awaited<ReturnType<typeof window.stm.savings.get>>) => s.summary.bySource.find((b) => b.id === 'local-model')
    void Promise.all([window.stm.savings.get(1), window.stm.savings.get(7), window.stm.savings.get(0)]).then(([d, w, a]) =>
      setSaved({ today: pick(d)?.tokens ?? 0, week: pick(w)?.tokens ?? 0, all: pick(a)?.tokens ?? 0, usd: pick(a)?.usd ?? 0 }),
    )
    const k = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', k)
    return () => {
      clearInterval(t)
      window.removeEventListener('keydown', k)
    }
  }, [props])

  const money = (usd: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(usd * props.usdToBrl)
  const pick = async (m: string | null) => {
    await window.stm.small.set(m)
    setTest(null)
    refresh()
  }
  const runTest = async () => {
    setTesting(true)
    setTest(await window.stm.local.test())
    setTesting(false)
    refresh()
  }
  const start = async () => {
    setStarting(true)
    await window.stm.local.start()
    setTimeout(() => {
      setStarting(false)
      refresh()
    }, 4000)
  }

  const running = st ? st.version !== null : false
  const models = st?.models ?? []
  const chosen = st?.model ? models.find((m) => m.name === st.model) : undefined
  const params = paramsOf(chosen?.params) ?? 0
  const inMemory = st?.loaded?.find((l) => l.name === st.model)
  const chain: { shape: Parameters<typeof Mark>[0]['shape']; title: string; state: State; detail: string; act?: JSX.Element }[] = st
    ? [
        {
          shape: 'square',
          title: 'Ollama installed',
          state: st.installed ? 'up' : 'down',
          detail: st.installed ? (st.version ? `Version ${st.version}` : 'Found on this Mac') : 'Runs open models on this Mac, free.',
          act: st.installed ? undefined : <button className="small" onClick={() => void window.stm.openUrl('https://ollama.com/download')}>Get Ollama</button>,
        },
        {
          shape: 'circle',
          title: 'Server running',
          state: !st.installed ? 'off' : running ? 'up' : 'down',
          detail: running ? 'Answering on 127.0.0.1:11434' : st.installed ? 'Installed but not running.' : 'Needs Ollama first.',
          act: st.installed && !running ? <button className="small" disabled={starting} onClick={() => void start()}>{starting ? 'Starting...' : 'Start Ollama'}</button> : undefined,
        },
        {
          shape: 'triangle',
          title: 'Model picked',
          state: !running ? 'off' : !models.length ? 'down' : !chosen ? 'warn' : params && params < READ_MIN_PARAMS ? 'warn' : 'up',
          detail: !running
            ? 'Needs the server.'
            : !models.length
              ? 'No model downloaded yet.'
              : !chosen
                ? 'Pick one; until then small tasks go to Claude Haiku on your plan.'
                : `${chosen.name}${chosen.params ? `, ${chosen.params}` : ''}, ${gb(chosen.size)}${params && params < READ_MIN_PARAMS ? '. Too small to read files well.' : ''}`,
          act: running && !models.length ? <Copy text={PULL} /> : undefined,
        },
        {
          shape: 'cut',
          title: 'In memory',
          state: !chosen ? 'off' : inMemory ? 'up' : 'off',
          detail: !chosen ? 'Needs a model.' : inMemory ? `${gb(inMemory.bytes)}, unloads ${until(inMemory.until)}` : 'Loads on the next task, unloads 2 minutes after. Normal.',
        },
        {
          shape: 'cross',
          title: 'Panels use it',
          state: !chosen ? 'off' : params && params < READ_MIN_PARAMS ? 'warn' : 'up',
          detail: !chosen
            ? 'Needs a model.'
            : params && params < READ_MIN_PARAMS
              ? 'Short drafts only. Reading long files needs a 3B model or larger.'
              : 'Panels opened from now on read long files and draft short text here.',
        },
      ]
    : []
  const allUp = chain.length > 0 && chain.every((c) => c.state === 'up' || (c.title === 'In memory' && c.state === 'off'))

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet local-model" role="dialog" aria-label="Local model">
        <header className="sheet-head">
          <div className="sheet-title">Local model</div>
          <span className="faint">Chores on this Mac, free, off your Claude plan</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        <div className="sheet-body lm">
          {!st ? (
            <div className="faint pad">Checking Ollama...</div>
          ) : (
            <>
              <div className={`lm-verdict ${allUp ? 'up' : 'down'}`}>
                <strong>{allUp ? 'Working' : 'Next step'}</strong>
                <span>{allUp ? 'Small tasks and panel chores run on this Mac.' : (() => { const n = chain.find((c) => c.state === 'down' || c.state === 'warn'); return n ? `${n.title}: ${n.detail}` : '' })()}</span>
              </div>

              <ol className={`lm-chain${allUp ? ' live' : ''}`}>
                {chain.map((c) => (
                  <li key={c.title} className={`lm-link ${c.state}`}>
                    <span className={`lm-sign ${c.state}`} role="img" aria-label={c.state === 'up' ? 'up' : c.state === 'warn' ? 'needs a look' : c.state === 'down' ? 'down' : 'waiting'} title={c.state === 'up' ? 'Up' : c.state === 'warn' ? 'Needs a look' : c.state === 'down' ? 'Down' : 'Waiting on the step above'}>
                      <Mark shape={c.shape} />
                    </span>
                    <div className="lm-link-text">
                      <div className="lm-link-title">{c.title}</div>
                      <div className="lm-link-detail">{c.detail}</div>
                    </div>
                    {c.act}
                  </li>
                ))}
              </ol>

              {running && models.length > 0 && (
                <div className="lm-row">
                  <label className="lm-label" htmlFor="lm-model">Model</label>
                  <select id="lm-model" value={st.model ?? ''} onChange={(e) => void pick(e.target.value || null)}>
                    <option value="">Claude Haiku (your plan)</option>
                    {models.map((m) => (
                      <option key={m.name} value={m.name}>{m.name}{m.params ? ` · ${m.params}` : ''} · {gb(m.size)}</option>
                    ))}
                  </select>
                  <button disabled={!st.model || testing} onClick={() => void runTest()}>{testing ? 'Testing...' : 'Test now'}</button>
                </div>
              )}
              {test && (
                <div className={`lm-test ${test.ok ? 'up' : 'down'}`}>
                  {test.ok ? (
                    <>
                      <div><strong>{(test.ms / 1000).toFixed(1)}s</strong><span>to answer</span></div>
                      <div><strong>{test.perSec.toFixed(0)}</strong><span>tokens per second</span></div>
                      <div className="lm-test-text"><span>It said</span><code>{test.text || '(nothing)'}</code></div>
                    </>
                  ) : (
                    <div className="lm-test-text"><span>Failed</span><code>{test.error}</code></div>
                  )}
                </div>
              )}

              {running && suggested.length > 0 && (
                <section className="lm-get">
                  <div className="sp-label">Models for each job</div>
                  <div className="lm-get-list">
                    {suggested.map((m) => {
                      const have = models.some((x) => x.name === m.name || x.name === `${m.name}:latest`)
                      const here = pull?.name === m.name ? pull : null
                      return (
                        <div key={m.name} className={`lm-get-row ${have ? 'have' : ''}`}>
                          <div className="lm-get-text">
                            <code>{m.name}</code>
                            <span>{m.job}</span>
                          </div>
                          {here && !here.error ? (
                            <div className="lm-get-progress" title={here.status}>
                              <i style={{ width: `${Math.round(here.done * 100)}%` }} />
                              <span>{here.done ? `${Math.round(here.done * 100)}%` : here.status}</span>
                            </div>
                          ) : have ? (
                            st.model === m.name ? <span className="lm-get-in-use">In use</span> : <button className="ghost small" onClick={() => void pick(m.name)}>Use</button>
                          ) : (
                            <button className="small" disabled={!!pull && !pull.error} onClick={() => void download(m.name)} title={here?.error}>{here?.error ? 'Retry' : `Get · ${m.size}`}</button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              <div className="lm-split">
                <section>
                  <div className="sp-label">Kept off your plan</div>
                  <div className="lm-saved">
                    <div><strong>{kTok(saved?.today ?? 0)}</strong><span>tokens today</span></div>
                    <div><strong>{kTok(saved?.week ?? 0)}</strong><span>this week</span></div>
                    <div><strong>{kTok(saved?.all ?? 0)}</strong><span>all time · {money(saved?.usd ?? 0)}</span></div>
                  </div>
                  <div className="lm-counts faint">
                    {st.stats.local} small tasks on this Mac · {st.stats.claude} went to Claude
                  </div>
                </section>
                <section>
                  <div className="sp-label">Latest chores</div>
                  {st.jobs.length === 0 ? (
                    <div className="faint lm-empty">None yet. When a panel reads a long file or drafts text here, it shows up live.</div>
                  ) : (
                    <ul className="lm-jobs">
                      {st.jobs.slice(0, 8).map((j) => (
                        <li key={j.at} className={j.ok ? '' : 'failed'}>
                          <span className="lm-job-kind">{j.kind === 'read' ? 'Read' : 'Draft'}</span>
                          <span className="lm-job-what" title={j.what}>{j.what}</span>
                          <span className="faint">{j.ok ? (j.kind === 'read' ? `${kTok(j.read - j.kept)} kept out` : 'done') : 'failed, Claude did it'}</span>
                          <span className="faint num">{(j.ms / 1000).toFixed(1)}s · {ago(j.at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
