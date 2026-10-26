import { useCallback, useEffect, useRef, useState } from 'react'
import { LANGS } from '../shared/voices'
import { STAGES, windowShare, type Piece, type Stage } from '../electron/content/pieces'
import type { SocialStatus } from './bridge'
import { clean } from './errors'
import { IntegrationMark } from './IntegrationMark'

const STAGE_LABEL: Record<Stage, string> = { idea: 'Idea', script: 'Script', render: 'Render', check: 'Check', review: 'Review', queued: 'Queued' }
const k = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n))
const media = (path: string) => `stmmedia://media${encodeURI(path)}`

/**
 * Content: one piece at a time from idea to the queue, in the project's own engine, with what it cost.
 * The script is written by a panel (the plan's tokens); render and checks run on this Mac for free.
 */
export function Content(props: { project: string; onProject: (dir: string) => void; nets: SocialStatus[]; onScript: (piece: Piece, prompt: string) => void; onErr: (e: string) => void; usdToBrl: number }) {
  const [list, setList] = useState<Piece[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [engine, setEngine] = useState<{ id: string; label: string; ready: boolean; note: string } | null>(null)
  const [form, setForm] = useState({ title: '', idea: '', format: 'reel' as Piece['format'] })
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState('')
  const [pub, setPub] = useState<{ nets: string[]; url: string }>({ nets: [], url: '' })
  const [voiceOk, setVoiceOk] = useState(false)
  const [eleven, setEleven] = useState<Awaited<ReturnType<typeof window.stm.voice.get>>>({ connected: false })
  const logEnd = useRef<HTMLDivElement>(null)
  const load = useCallback(() => void window.stm.content.list(props.project).then(setList), [props.project])
  useEffect(() => {
    load()
    void window.stm.content.engine(props.project).then(setEngine)
    void window.stm.content.voiceReady().then(setVoiceOk)
    void window.stm.voice.get().then(setEleven)
    const a = window.stm.content.onChanged(load)
    const b = window.stm.content.onLog((id, line) => (id === sel || id === 'engine') && setLog((l) => [...l.slice(-200), line]))
    return () => (a(), b())
  }, [load, props.project, sel])
  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: 'end' })
  }, [log])
  const p = list.find((x) => x.id === sel) ?? null
  const act = async (name: string, fn: () => Promise<unknown>) => {
    props.onErr('')
    setBusy(name)
    try {
      await fn()
    } catch (e) {
      props.onErr(clean(e))
    }
    setBusy('')
    load()
  }
  const folder = props.project.split('/').filter(Boolean).slice(-2).join('/')

  return (
    <div className="ct">
      <div className="ct-side">
        <div className="ct-proj">
          <span className="faint">Project</span>
          <code title={props.project}>{folder || 'no folder'}</code>
          {engine && <span className={`pill ${engine.ready ? '' : 'warn'}`} title={engine.note}>{engine.label}</span>}
          <button className="ghost small" onClick={() => void window.stm.pickFolder().then((d) => d && props.onProject(d))}>Change</button>
        </div>
        {engine && !engine.ready && (
          <div className="ct-engine">
            <span>{engine.note}</span>
            <button className="primary small" disabled={Boolean(busy)} onClick={() => void act('install', async () => { setSel(null); setLog([]); await window.stm.content.install(); setEngine(await window.stm.content.engine(props.project)) })}>
              {busy === 'install' ? <span className="spinner" /> : 'Install engine'}
            </button>
          </div>
        )}
        <div className="ct-new">
          <input placeholder="New piece: title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea placeholder="The idea, the angle, the source" value={form.idea} onChange={(e) => setForm({ ...form, idea: e.target.value })} />
          <div className="biz-row">
            <div className="segmented">
              {(['reel', 'carousel', 'post'] as const).map((f) => (
                <button key={f} aria-selected={form.format === f} onClick={() => setForm({ ...form, format: f })}>{f === 'reel' ? 'Reel' : f === 'carousel' ? 'Carousel' : 'Post'}</button>
              ))}
            </div>
            <span className="spacer-flex" />
            <button className="primary small" disabled={!form.title.trim()} onClick={() => void act('new', async () => { const n = await window.stm.content.create({ ...form, project: props.project }); setSel(n.id); setForm({ title: '', idea: '', format: form.format }) })}>Add</button>
          </div>
        </div>
        <div className="ct-list">
          {list.map((x) => (
            <button key={x.id} className={`ct-item ${sel === x.id ? 'on' : ''}`} onClick={() => (setSel(x.id), setLog([]))}>
              <span className="ct-item-title">{x.title}</span>
              <span className={`ct-stage s-${x.stage}`}>{STAGE_LABEL[x.stage]}</span>
              <span className="ct-item-meter">{k(x.usage.inputTokens + x.usage.outputTokens)} tok{windowShare(x.usage) != null ? ` · ${windowShare(x.usage)!.toFixed(1)}% of 5h` : ''}</span>
            </button>
          ))}
          {!list.length && <div className="faint pad">No pieces in this project yet.</div>}
        </div>
      </div>

      {p ? (
        <div className="ct-main">
          <div className="ct-steps">
            {STAGES.map((s, i) => (
              <span key={s} className={`ct-step ${s === p.stage ? 'now' : STAGES.indexOf(p.stage) > i ? 'done' : ''}`}>{STAGE_LABEL[s]}</span>
            ))}
          </div>
          <div className="ct-title">{p.title}</div>
          {p.idea && <div className="ct-idea">{p.idea}</div>}

          <div className="ct-meter">
            <div><strong>{k(p.usage.inputTokens)}</strong><span>tokens in</span></div>
            <div><strong>{k(p.usage.outputTokens)}</strong><span>tokens out</span></div>
            <div><strong>{k(p.usage.cacheRead)}</strong><span>from cache</span></div>
            <div><strong>{p.usage.turns}</strong><span>turns</span></div>
            <div><strong>{windowShare(p.usage) != null ? `${windowShare(p.usage)!.toFixed(1)}%` : '–'}</strong><span>of the 5h window</span></div>
            <div><strong>R$ {(p.usage.costUsd * props.usdToBrl).toFixed(2)}</strong><span>at API prices</span></div>
            {p.voiceChars != null && <div><strong>{k(p.voiceChars)}</strong><span>ElevenLabs chars</span></div>}
          </div>

          <div className="ct-actions">
            {(p.stage === 'idea' || p.stage === 'script') && (
              <button className="primary small" disabled={Boolean(busy)} onClick={() => void act('script', async () => props.onScript(p, await window.stm.content.script(p.id)))}>
                {p.stage === 'script' ? 'Write the script again' : 'Write the script with Claude'}
              </button>
            )}
            {p.stage === 'script' && p.engine !== 'text' && (
              <button className="ghost small" onClick={() => void act('skip', () => window.stm.content.update(p.id, { stage: 'render' }))}>The script is written</button>
            )}
            {(p.stage === 'render' || p.stage === 'check' || p.stage === 'review') && p.engine !== 'text' && (
              <button className={p.stage === 'render' ? 'primary small' : 'ghost small'} disabled={Boolean(busy)} onClick={() => void act('render', () => (setLog([]), window.stm.content.render(p.id)))}>
                {busy === 'render' ? <span className="spinner" /> : p.stage === 'render' ? 'Render on this Mac' : 'Render again'}
              </button>
            )}
            {(p.stage === 'check' || p.stage === 'review') && <button className="ghost small" disabled={Boolean(busy)} onClick={() => void act('check', () => window.stm.content.check(p.id))}>Check again</button>}
            {p.outputs[0] && <button className="ghost small" onClick={() => void window.stm.content.reveal(p.outputs[0]!)}>Show in Finder</button>}
            <span className="spacer-flex" />
            <button className="ghost small pcard-del" onClick={() => void act('rm', async () => { await window.stm.content.remove(p.id); setSel(null) })}>Delete</button>
          </div>

          {p.engine === 'revideo' && p.stage !== 'idea' && (
            <div className="ct-music">
              <span className="faint">Voice</span>
              {voiceOk && (
                <select value={p.voice?.startsWith('eleven:') ? '' : (p.voice ?? 'pf_dora')} onChange={(e) => e.target.value && void act('voice', () => window.stm.content.update(p.id, { voice: e.target.value }))}>
                  {p.voice?.startsWith('eleven:') && <option value="">Local voice...</option>}
                  <option value="none">No narration</option>
                  {LANGS.map((l) => (
                    <optgroup key={l.id} label={l.name}>
                      {l.voices.map(([v, name]) => <option key={v} value={v}>{name} · {l.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              )}
              {eleven.voices?.length ? (
                <select className={p.voice?.startsWith('eleven:') ? 'on' : ''} value={p.voice?.startsWith('eleven:') ? p.voice : ''} onChange={(e) => e.target.value && void act('voice', () => window.stm.content.update(p.id, { voice: e.target.value }))}>
                  <option value="">ElevenLabs voice...</option>
                  {eleven.voices.map((v) => <option key={v.id} value={`eleven:${v.id}`}>{v.name}{v.labels ? ` (${v.labels})` : ''}</option>)}
                </select>
              ) : null}
              {(voiceOk || p.voice?.startsWith('eleven:')) && (
                <select value={String(p.voiceSpeed ?? 1.05)} onChange={(e) => void act('voice', () => window.stm.content.update(p.id, { voiceSpeed: Number(e.target.value) }))}>
                  {[0.95, 1, 1.05, 1.1, 1.15, 1.2].map((x) => <option key={x} value={String(x)}>{x}×</option>)}
                </select>
              )}
              <span className="faint">
                {p.voice?.startsWith('eleven:')
                  ? eleven.usage
                    ? `ElevenLabs, paid · ${eleven.usage.used.toLocaleString()} of ${eleven.usage.limit.toLocaleString()} characters this period`
                    : eleven.error ?? 'ElevenLabs, paid'
                  : voiceOk && p.voice !== 'none'
                    ? `Kokoro on this Mac, free (Apache-2.0)${p.voice?.startsWith('z') ? ' · captions by phrase' : ''}`
                    : ''}
              </span>
              {!voiceOk && (
                <>
                  <span className="faint">Free local voice and exact captions: about 500 MB, once.</span>
                  <button className="ghost small" disabled={Boolean(busy)} onClick={() => void act('install', async () => { setLog([]); await window.stm.content.install('voice'); setVoiceOk(await window.stm.content.voiceReady()) })}>{busy === 'install' ? <span className="spinner" /> : 'Install voice'}</button>
                </>
              )}
            </div>
          )}
          {p.engine === 'revideo' && p.stage !== 'idea' && (
            <div className="ct-music">
              <span className="faint">Music</span>
              {p.music ? <code title={p.music}>{p.music.split('/').pop()}</code> : <span className="faint">none: the video goes out silent</span>}
              <button className="ghost small" onClick={() => void act('music', () => window.stm.content.pickMusic(p.id))}>{p.music ? 'Change' : 'Add a track'}</button>
              {p.music && <button className="ghost small" onClick={() => void act('music', () => window.stm.content.update(p.id, { music: undefined, musicLicense: undefined }))}>Remove</button>}
              {p.music && (
                <input placeholder="Where the license is (link or note): required to post commercially" value={p.musicLicense ?? ''} onChange={(e) => setList(list.map((x) => (x.id === p.id ? { ...x, musicLicense: e.target.value } : x)))} onBlur={(e) => void window.stm.content.update(p.id, { musicLicense: e.target.value })} />
              )}
              <span className="faint ct-music-note">Free with a commercial license: YouTube Audio Library, Pixabay Music. Mixed at −14 LUFS with a fade out.</span>
            </div>
          )}
          {(busy === 'render' || log.length > 0) && (
            <div className="ct-log">
              {log.map((l, i) => <div key={i}>{l}</div>)}
              <div ref={logEnd} />
            </div>
          )}

          {p.outputs.length > 0 && (
            <div className="ct-media">
              {p.outputs.filter((f) => /\.(mp4|mov|webm)$/i.test(f)).map((f) => <video key={f} src={media(f)} controls playsInline />)}
              {p.outputs.filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).map((f) => <img key={f} src={media(f)} alt="" />)}
            </div>
          )}
          {p.sheet && <img className="ct-sheet" src={media(p.sheet)} alt="Key frames" />}

          {p.checks.length > 0 && (
            <div className="ct-checks">
              {p.checks.map((c) => (
                <div key={c.name} className={`ct-check ${c.ok ? 'ok' : c.warn ? 'warn' : 'bad'}`}>
                  <span className="ct-dot" />
                  <strong>{c.name}</strong>
                  <span>{c.detail}</span>
                </div>
              ))}
            </div>
          )}

          {(p.stage === 'review' || p.stage === 'queued' || p.caption) && (
            <>
              <div className="group">Caption</div>
              <textarea className="ct-caption" value={p.caption} onChange={(e) => setList(list.map((x) => (x.id === p.id ? { ...x, caption: e.target.value } : x)))} onBlur={(e) => void window.stm.content.update(p.id, { caption: e.target.value })} />
            </>
          )}

          {p.stage === 'review' && (
            <div className="ct-pub">
              <div className="group">To the queue</div>
              <div className="biz-row">
                {props.nets.filter((x) => x.connected && x.can.publish).map((x) => (
                  <label key={x.id} className={`pe-int ${pub.nets.includes(x.id) ? 'on' : ''}`}>
                    <input type="checkbox" checked={pub.nets.includes(x.id)} onChange={() => setPub({ ...pub, nets: pub.nets.includes(x.id) ? pub.nets.filter((y) => y !== x.id) : [...pub.nets, x.id] })} />
                    <IntegrationMark id={x.id} name={x.name} size={16} />
                    {x.name}
                  </label>
                ))}
                {!props.nets.some((x) => x.connected && x.can.publish) && <span className="faint">Connect an account in Accounts first.</span>}
              </div>
              {p.outputs.length > 0 && (
                <div className="biz-row">
                  <input className="ct-url" placeholder="Public https link of the video or image (networks fetch media from a link)" value={pub.url} onChange={(e) => setPub({ ...pub, url: e.target.value })} />
                  <button className="ghost small" disabled={Boolean(busy)} onClick={() => void act('upload', async () => setPub({ ...pub, url: await window.stm.storage.upload(p.outputs.find((f) => /\.(mp4|mov|webm)$/i.test(f)) ?? p.outputs[0]!) }))}>
                    {busy === 'upload' ? <span className="spinner" /> : 'Upload to my storage'}
                  </button>
                </div>
              )}
              <div className="biz-row">
                <span className="faint">It lands in the Queue as a draft: nothing goes out before you Approve it there.</span>
                <span className="spacer-flex" />
                <button
                  className="primary small"
                  disabled={!pub.nets.length}
                  onClick={() =>
                    void act('queue', async () => {
                      const q = await window.stm.social.save({ text: p.caption, networks: pub.nets as never, mediaUrl: pub.url || undefined, mediaKind: p.outputs.some((f) => /\.(mp4|mov|webm)$/i.test(f)) ? 'video' : 'image' })
                      await window.stm.content.update(p.id, { stage: 'queued', queueId: q[0]?.id })
                    })
                  }
                >
                  Send to the queue
                </button>
              </div>
            </div>
          )}
        </div>
      ) : busy === 'install' || log.length ? (
        <div className="ct-main"><div className="group">Installing the video engine</div><div className="ct-log tall">{log.map((l, i) => <div key={i}>{l}</div>)}<div ref={logEnd} /></div></div>
      ) : (
        <div className="sheet-empty">
          <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true"><rect x="10" y="8" width="24" height="40" rx="3" className="se-b" /><path d="M19 22v12l10-6z" className="se-a" /><path d="M40 16h8M40 26h8M40 36h5" className="se-line" /></svg>
          <div className="se-title">Make something to post</div>
          <div className="se-text">Add a piece on the left. Claude writes the script with your plan; the render and the quality checks run on this Mac for free; the queue waits for your Approve.</div>
        </div>
      )}
    </div>
  )
}
