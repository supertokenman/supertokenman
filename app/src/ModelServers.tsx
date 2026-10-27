import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { epModel, fit, parseEpModel, type Endpoint, type PresetId, type ServerKind, type ServerStats, type VllmArgs } from '../shared/modelserver'
import { clean } from './errors'
import './bridge'
import { NumberField, Select } from './ui'

const close = (
  <IconClose />
)
type St = Awaited<ReturnType<typeof window.stm.models.state>>
const KINDS: Record<ServerKind, { label: string; url: string }> = {
  vllm: { label: 'vLLM', url: 'http://127.0.0.1:8000' },
  llamacpp: { label: 'llama.cpp server', url: 'http://127.0.0.1:8080' },
  lmstudio: { label: 'LM Studio', url: 'http://127.0.0.1:1234' },
  ollama: { label: 'Ollama (OpenAI API)', url: 'http://127.0.0.1:11434' },
  other: { label: 'Other OpenAI-compatible', url: 'http://' },
}

/**
 * Your own model server: any OpenAI-compatible endpoint (vLLM, llama.cpp, LM Studio, Ollama) as the
 * local model, its live numbers, vLLM started on your GPU box over SSH, and whether a model fits.
 * Ideas from vLLM (Apache-2.0) and textgen (AGPL-3.0, idea only); no code from either.
 */
export function ModelServersSheet(props: { onClose: () => void }) {
  const [tab, setTab] = useState<'endpoints' | 'gpu' | 'fit'>('endpoints')
  const [st, setSt] = useState<St | null>(null)
  const load = () => void window.stm.models.state().then(setSt)
  useEffect(load, [])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe" role="dialog" aria-label="Model servers">
        <header className="sheet-head">
          <div className="sheet-title">Model servers</div>
          <div className="segmented small" role="tablist">
            <button role="tab" aria-selected={tab === 'endpoints'} onClick={() => setTab('endpoints')}>Endpoints</button>
            <button role="tab" aria-selected={tab === 'gpu'} onClick={() => setTab('gpu')}>GPU box</button>
            <button role="tab" aria-selected={tab === 'fit'} onClick={() => setTab('fit')}>Will it fit</button>
          </div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>{close}</button>
        </header>
        {!st ? <div className="dsg-body faint">Reading…</div> : tab === 'endpoints' ? <Endpoints st={st} reload={load} /> : tab === 'gpu' ? <Gpu st={st} reload={load} /> : <Fit st={st} />}
      </div>
    </div>
  )
}

function Endpoints(props: { st: St; reload: () => void }) {
  const { st } = props
  const [pick, setPick] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<Endpoint> | null>(null)
  const [models, setModels] = useState<string[] | null>(null)
  const [model, setModel] = useState('')
  const [prompt, setPrompt] = useState('Write a haiku about caching.')
  const [test, setTest] = useState<Awaited<ReturnType<typeof window.stm.models.test>> | null>(null)
  const [stats, setStats] = useState<ServerStats | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const e = st.endpoints.find((x) => x.id === pick) ?? (form ? undefined : st.endpoints[0])
  const small = parseEpModel(st.small ?? undefined)
  useEffect(() => {
    setModels(null)
    setTest(null)
    setStats(null)
    setErr('')
    if (!e) return
    void window.stm.models.list(e.id).then((m) => (setModels(m), setModel(small?.id === e.id ? small.model : m[0] ?? '')), (x) => setErr(clean(x)))
    if (e.kind !== 'vllm') return
    const tick = () => void window.stm.models.metrics(e.id).then(setStats, () => setStats(null))
    tick()
    const t = setInterval(tick, 5000)
    return () => clearInterval(t)
  }, [e?.id])
  const set = (k: keyof Endpoint, v: unknown) => setForm((f) => ({ ...f, [k]: v }))
  const num = (n: number | null | undefined, unit = '') => (n == null ? 'n/a' : `${n}${unit}`)
  return (
    <div className="cf-body">
      <div className="cf-col ob-list">
        <div className="ob-row"><button className="primary" onClick={() => (setForm({ kind: 'vllm', baseUrl: KINDS.vllm.url, name: '' }), setPick(null))}>Add endpoint</button></div>
        {!st.endpoints.length && !form && <div className="faint">No endpoints yet. Add vLLM, llama.cpp, LM Studio or Ollama by its URL; it can then do the app's small tasks instead of Claude.</div>}
        {st.endpoints.map((x) => (
          <button key={x.id} className={`ob-turn ${x === e ? 'on' : ''}`} onClick={() => (setPick(x.id), setForm(null))}>
            <span className="ob-turn-top"><span>{x.name}</span><span className="faint">{KINDS[x.kind].label}</span></span>
            <span className="faint">{x.baseUrl}{small?.id === x.id ? `, small tasks: ${small.model}` : ''}</span>
          </button>
        ))}
      </div>
      <div className="cf-col">
        {form ? (
          <>
            <div className="ob-label">{form.id ? 'Edit endpoint' : 'New endpoint'}</div>
            <div className="mn-form">
              <label>Name<input value={form.name ?? ''} onChange={(x) => set('name', x.target.value)} /></label>
              <label>Server<Select value={form.kind} onChange={(x) => setForm((f) => ({ ...f, kind: x.target.value as ServerKind, baseUrl: KINDS[x.target.value as ServerKind].url }))}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></label>
              <label className="wide">Base URL<input value={form.baseUrl ?? ''} onChange={(x) => set('baseUrl', x.target.value)} /></label>
              <label>API key name in the vault<input placeholder="none" value={form.keyName ?? ''} onChange={(x) => set('keyName', x.target.value.toUpperCase())} /></label>
              <label>Sampling preset<Select value={form.preset ?? 'precise'} onChange={(x) => set('preset', x.target.value as PresetId)}>{Object.entries(st.presets).map(([k, v]) => <option key={k} value={k}>{v.label}, temp {v.temperature}</option>)}</Select></label>
            </div>
            <div className="ob-row">
              <button className="primary" onClick={() => void window.stm.models.save(form).then((l) => (setForm(null), setPick(form.id ?? l[l.length - 1]?.id ?? null), props.reload()), (x) => setErr(clean(x)))}>Save</button>
              <button onClick={() => setForm(null)}>Cancel</button>
            </div>
          </>
        ) : e ? (
          <>
            <div className="ob-head">
              <div className="ob-prompt">{e.name}</div>
              <div className="faint">{KINDS[e.kind].label} at {e.baseUrl}, preset {st.presets[e.preset ?? 'precise'].label}{e.keyName ? `, key ${e.keyName}` : ''}</div>
            </div>
            <div className="ob-row">
              <button onClick={() => setForm({ ...e })}>Edit</button>
              <button onClick={() => void window.stm.models.remove(e.id).then(() => (setPick(null), props.reload()))}>Remove</button>
            </div>
            <div className="ob-label">Model</div>
            <div className="ob-row">
              <Select className="ob-grow" value={model} onChange={(x) => setModel(x.target.value)} disabled={!models?.length}>{(models ?? []).map((m) => <option key={m} value={m}>{m}</option>)}</Select>
              <button disabled={!model} className={small?.id === e.id && small.model === model ? 'primary' : ''} onClick={() => void window.stm.small.set(epModel(e.id, model)).then(() => (setMsg(`${model} now does the small tasks, the arena and the local panels.`), props.reload()))}>{small?.id === e.id && small.model === model ? 'Used for small tasks' : 'Use for small tasks'}</button>
            </div>
            {models && !models.length && <div className="faint">The server lists no models.</div>}
            <div className="ob-label">Test</div>
            <div className="ob-row">
              <input className="ob-grow" value={prompt} onChange={(x) => setPrompt(x.target.value)} />
              <button disabled={!model || busy} onClick={() => (setBusy(true), void window.stm.models.test(e.id, model, prompt).then((r) => (setTest(r), setErr('')), (x) => setErr(clean(x))).finally(() => setBusy(false)))}>{busy ? 'Asking…' : 'Send'}</button>
            </div>
            {test && (
              <>
                <div className="mn-stats">
                  <div><span className="ob-label">First token</span><b>{num(test.ttftMs, ' ms')}</b></div>
                  <div><span className="ob-label">Tokens/s</span><b>{num(test.tokensPerSec)}</b></div>
                  <div><span className="ob-label">Total</span><b>{test.totalMs} ms</b></div>
                </div>
                <pre className="ob-pre">{test.text || '(empty answer)'}</pre>
              </>
            )}
            {e.kind === 'vllm' && (
              <>
                <div className="ob-label">Live, every 5 s from /metrics</div>
                {stats ? (
                  <div className="mn-stats">
                    <div><span className="ob-label">Generated/s</span><b>{num(stats.tokensPerSec)}</b></div>
                    <div><span className="ob-label">Prompt/s</span><b>{num(stats.promptPerSec)}</b></div>
                    <div><span className="ob-label">Avg first token</span><b>{num(stats.ttftMs, ' ms')}</b></div>
                    <div><span className="ob-label">KV cache</span><b>{stats.kvCache == null ? 'n/a' : `${Math.round(stats.kvCache * 100)}%`}</b></div>
                    <div><span className="ob-label">Prefix hits</span><b>{stats.prefixHit == null ? 'n/a' : `${Math.round(stats.prefixHit * 100)}%`}</b></div>
                    <div><span className="ob-label">Running</span><b>{num(stats.running)}</b></div>
                    <div><span className="ob-label">Waiting</span><b>{num(stats.waiting)}</b></div>
                  </div>
                ) : <div className="faint">No metrics: the server has no /metrics or it is not reachable.</div>}
              </>
            )}
          </>
        ) : null}
        {msg && <div className="notice">{msg}</div>}
        {err && <div className="notice error">{err}</div>}
      </div>
    </div>
  )
}

function Gpu(props: { st: St; reload: () => void }) {
  const { st } = props
  const [host, setHost] = useState(st.hosts[0] ?? '')
  const [a, setA] = useState<VllmArgs>({ model: 'Qwen/Qwen3-8B', port: 8000, maxModelLen: 32768, gpuMemory: 0.9 })
  const [local, setLocal] = useState(18000)
  const [cmd, setCmd] = useState('')
  const [confirm, setConfirm] = useState<'start' | 'stop' | null>(null)
  const [log, setLog] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [tunnels, setTunnels] = useState(st.tunnels)
  useEffect(() => void window.stm.models.preview(a).then((c) => (setCmd(c), setErr('')), (x) => (setCmd(''), setErr(clean(x)))), [a])
  const set = (k: keyof VllmArgs, v: unknown) => setA((x) => ({ ...x, [k]: v }))
  const run = (p: Promise<unknown>, done: string) => void p.then(() => (setMsg(done), setErr(''), setConfirm(null)), (x) => (setErr(clean(x)), setConfirm(null)))
  const open = tunnels.some((t) => t.host === host && t.local === local)
  if (!st.hosts.length) return <div className="dsg-body faint">No hosts in ~/.ssh/config. Add your GPU box there (Host, HostName, User) and it shows here.</div>
  return (
    <div className="cf-body">
      <div className="cf-col">
        <div className="faint">Starts vLLM's OpenAI-compatible server on a Linux machine with a GPU, bound to its localhost, and reaches it through an SSH tunnel. Nothing runs without your click and a confirm.</div>
        <div className="mn-form">
          <label>Host<Select value={host} onChange={(x) => setHost(x.target.value)}>{st.hosts.map((h) => <option key={h}>{h}</option>)}</Select></label>
          <label>Port on the box<NumberField value={a.port} onChange={(x) => set('port', Number(x.target.value))} /></label>
          <label className="wide">Model (Hugging Face id)<input value={a.model} onChange={(x) => set('model', x.target.value)} /></label>
          <label>Max context<NumberField value={a.maxModelLen ?? ''} onChange={(x) => set('maxModelLen', Number(x.target.value) || undefined)} /></label>
          <label>GPU memory share<NumberField step="0.05" value={a.gpuMemory ?? ''} onChange={(x) => set('gpuMemory', Number(x.target.value) || undefined)} /></label>
          <label>GPUs (tensor parallel)<NumberField min={1} value={a.tensorParallel ?? 1} onChange={(x) => set('tensorParallel', Number(x.target.value))} /></label>
          <label>Quantization<input placeholder="none, awq, gptq, fp8" value={a.quantization ?? ''} onChange={(x) => set('quantization', x.target.value || undefined)} /></label>
          <label className="wide">API key name in the vault<input placeholder="none" value={a.keyName ?? ''} onChange={(x) => set('keyName', x.target.value.toUpperCase() || undefined)} /></label>
        </div>
        <div className="ob-label">Runs on {host}</div>
        <pre className="ob-pre">{cmd || '…'}</pre>
        {confirm ? (
          <div className="ob-row">
            <span>{confirm === 'start' ? `Start vLLM on ${host}?` : `Stop the vLLM on port ${a.port} of ${host}?`}</span>
            <button className="primary" onClick={() => run(confirm === 'start' ? window.stm.models.start(host, a) : window.stm.models.stop(host, a.port), confirm === 'start' ? 'Started. Loading a model takes a minute or more; read the log.' : 'Stopped.')}>Yes</button>
            <button onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        ) : (
          <div className="ob-row">
            <button className="primary" disabled={!cmd} onClick={() => setConfirm('start')}>Start vLLM</button>
            <button onClick={() => setConfirm('stop')}>Stop</button>
            <button onClick={() => void window.stm.models.log(host, a.port).then(setLog, (x) => setErr(clean(x)))}>Read the log</button>
          </div>
        )}
        {msg && <div className="notice">{msg}</div>}
        {err && <div className="notice error">{err}</div>}
      </div>
      <div className="cf-col">
        <div className="ob-label">Tunnel</div>
        <div className="ob-row">
          <span className="faint">127.0.0.1:</span>
          <NumberField className="mn-hours" value={local} onChange={(x) => setLocal(Number(x.target.value))} aria-label="Local port" />
          <span className="faint">to {host}:{a.port}</span>
          <button onClick={() => void window.stm.models.tunnel(host, local, a.port, !open).then(setTunnels, (x) => setErr(clean(x)))}>{open ? 'Close tunnel' : 'Open tunnel'}</button>
        </div>
        {open && (
          <div className="ob-row">
            <span className="faint">Add it as an endpoint at http://127.0.0.1:{local}</span>
            <button onClick={() => void window.stm.models.save({ name: `${host} vLLM`, kind: 'vllm', baseUrl: `http://127.0.0.1:${local}`, keyName: a.keyName }).then(() => (setMsg('Endpoint added.'), props.reload()), (x) => setErr(clean(x)))}>Add endpoint</button>
          </div>
        )}
        {log && (
          <>
            <div className="ob-label">Log, last 40 lines</div>
            <pre className="ob-pre">{log}</pre>
          </>
        )}
      </div>
    </div>
  )
}

function Fit(props: { st: St }) {
  const names = Object.keys(props.st.shapes)
  const [shape, setShape] = useState(names[0]!)
  const [bits, setBits] = useState(16)
  const [kvBits, setKvBits] = useState(16)
  const [context, setContext] = useState(32768)
  const [batch, setBatch] = useState(1)
  const [memoryGb, setMemoryGb] = useState(24)
  const r = fit({ ...props.st.shapes[shape]!, bits, kvBits, context, batch, memoryGb })
  const bar = (n: number) => `${Math.min(100, (n / Math.max(memoryGb, r.totalGb)) * 100)}%`
  return (
    <div className="cf-body">
      <div className="cf-col">
        <div className="faint">Before you load a model: its weights at the chosen precision, the KV cache for the context and parallel requests, and runtime overhead, against the GPU or unified memory you have.</div>
        <div className="mn-form">
          <label className="wide">Model<Select value={shape} onChange={(x) => setShape(x.target.value)}>{names.map((n) => <option key={n}>{n}</option>)}</Select></label>
          <label>Weights precision<Select value={bits} onChange={(x) => setBits(Number(x.target.value))}><option value={16}>16-bit (BF16)</option><option value={8}>8-bit (FP8, Q8)</option><option value={4.5}>4-bit (Q4_K_M, AWQ)</option></Select></label>
          <label>KV cache precision<Select value={kvBits} onChange={(x) => setKvBits(Number(x.target.value))}><option value={16}>16-bit</option><option value={8}>8-bit (FP8)</option></Select></label>
          <label>Context (tokens)<NumberField value={context} onChange={(x) => setContext(Number(x.target.value))} /></label>
          <label>Parallel requests<NumberField min={1} value={batch} onChange={(x) => setBatch(Math.max(1, Number(x.target.value)))} /></label>
          <label className="wide">Memory you have (GB)<NumberField value={memoryGb} onChange={(x) => setMemoryGb(Number(x.target.value))} /></label>
        </div>
      </div>
      <div className="cf-col">
        <div className={`notice ${r.fits ? '' : 'error'}`}>{r.fits ? `Fits: ${r.totalGb} GB of ${memoryGb} GB.` : `Does not fit: needs ${r.totalGb} GB, you have ${memoryGb} GB.`}</div>
        <div className="ms-bar" aria-label="Memory use">
          <i className="w" style={{ width: bar(r.weightsGb) }} />
          <i className="kv" style={{ width: bar(r.kvGb) }} />
          <i className="oh" style={{ width: bar(r.overheadGb) }} />
        </div>
        <div className="mn-stats">
          <div><span className="ob-label"><span className="ms-key w" />Weights</span><b>{r.weightsGb} GB</b></div>
          <div><span className="ob-label"><span className="ms-key kv" />KV cache</span><b>{r.kvGb} GB</b></div>
          <div><span className="ob-label"><span className="ms-key oh" />Overhead</span><b>{r.overheadGb} GB</b></div>
          <div><span className="ob-label">Max context</span><b>{r.maxContext.toLocaleString()}</b></div>
        </div>
        <div className="faint">An estimate: real use varies with the server, activations and CUDA graphs. vLLM takes its GPU memory share up front and fills the rest with KV cache.</div>
      </div>
    </div>
  )
}
