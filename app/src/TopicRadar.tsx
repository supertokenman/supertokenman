import { useEffect, useState } from 'react'
import type { RadarCfg } from './bridge'
import type { Hit } from '../shared/radar'
import { IconClose } from './icons'
import { clean } from './errors'
import { Checkbox, Select, Slider } from './ui'

/** Phase 109: how often your topics come up in the feeds you read; a draft for yourself, never a post. */
export function TopicRadar(props: { onClose: () => void }) {
  const [cfg, setCfg] = useState<RadarCfg | null>(null)
  const [groups, setGroups] = useState('')
  const [ntfy, setNtfy] = useState('')
  const [onlyNew, setOnlyNew] = useState(false)
  const [hours, setHours] = useState(24)
  const [res, setRes] = useState<{ hits: Hit[]; sources: string[]; lastAt: number } | null>(null)
  const [draft, setDraft] = useState<{ text: string; by: string } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [msg, setMsg] = useState('')
  const run = (o = onlyNew, h = hours) => void window.stm.radar.run(o, h).then(setRes, (e) => setMsg(clean(e)))
  useEffect(() => void window.stm.radar.get().then((c) => (setCfg(c), setGroups(c.groups), setNtfy(c.ntfy), run())), [])
  const save = () => void window.stm.radar.save(groups, cfg?.weights ?? {}, ntfy).then((c) => (setCfg(c), run()), (e) => setMsg(clean(e)))
  const weight = (s: string, w: number) => cfg && void window.stm.radar.save(groups, { ...cfg.weights, [s]: w }, ntfy).then((c) => (setCfg(c), run()))
  const max = Math.max(1, ...(res?.hits ?? []).map((h) => h.score))
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe tr" role="dialog" aria-label="Topic radar">
        <header className="sheet-head">
          <div className="sheet-title">Topic radar</div>
          <span className="faint">your groups of words, counted in the feeds you already read</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="tr-body">
          <aside className="tr-groups">
            <label className="chart-name" htmlFor="tr-g">Groups</label>
            <textarea id="tr-g" value={groups} rows={10} spellCheck={false} onChange={(e) => setGroups(e.target.value)} onBlur={save} />
            <div className="faint">One a line: <code>Name: word, synonym, two words, prefix* | -excluded</code></div>
            {!!res?.sources.length && (
              <>
                <div className="chart-name">Source weight</div>
                {res.sources.map((s) => (
                  <label key={s} className="tr-w"><span>{s}</span><Slider min={0} max={5} step={0.5} value={cfg?.weights[s] ?? 1} onChange={(e) => weight(s, Number(e.target.value))} /><span className="num">{(cfg?.weights[s] ?? 1).toFixed(1)}</span></label>
                ))}
              </>
            )}
            <label className="chart-name" htmlFor="tr-n">Send to me (ntfy)</label>
            <input id="tr-n" value={ntfy} placeholder="https://ntfy.sh/your-private-topic" spellCheck={false} onChange={(e) => setNtfy(e.target.value)} onBlur={save} />
          </aside>
          <main className="tr-main">
            <div className="ob-row">
              <label className="ca-toggle"><Checkbox checked={onlyNew} onChange={(e) => (setOnlyNew(e.target.checked), run(e.target.checked))} />Only new since the last summary{res?.lastAt ? ` (${new Date(res.lastAt).toLocaleString()})` : ''}</label>
              <span className="spacer-flex" />
              <Select value={hours} aria-label="Window" onChange={(e) => (setHours(Number(e.target.value)), run(onlyNew, Number(e.target.value)))}>
                <option value={6}>6 hours</option><option value={24}>24 hours</option><option value={72}>3 days</option><option value={168}>7 days</option>
              </Select>
            </div>
            {!res ? null : !res.hits.length ? <div className="faint">Nothing from your groups in this window.</div> : res.hits.map((h, i) => (
              <section key={h.group} className="tr-hit">
                <div className="tr-head"><span className="tr-rank">{String(i + 1).padStart(2, '0')}</span><b>{h.group}</b><span className="faint">{h.count} item{h.count === 1 ? '' : 's'} · {h.sources} source{h.sources === 1 ? '' : 's'}</span></div>
                <div className="tr-bar"><i style={{ width: `${(h.score / max) * 100}%` }} /></div>
                {h.items.slice(0, 3).map((x) => <a key={x.id} className="tr-item" href={x.link} target="_blank" rel="noreferrer">{x.title} <span className="faint">· {x.source}</span></a>)}
              </section>
            ))}
            <div className="ob-row">
              <button className="ghost small" onClick={() => void window.stm.radar.mark().then((c) => (setCfg(c), setMsg('Marked: "only new" counts from now.')))}>Mark as summarized</button>
              <span className="spacer-flex" />
              <button disabled={!res?.hits.length} onClick={() => void window.stm.radar.draft(res!.hits).then(setDraft)}>Draft a summary</button>
            </div>
            {draft && (
              <div className="tr-draft">
                <div className="faint">Draft{draft.by !== 'plain' ? ` by ${draft.by} on this machine` : ''}. It stays here unless you send it to yourself.</div>
                <textarea value={draft.text} rows={5} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
                <div className="ob-row">
                  <span className="spacer-flex" />
                  {confirm ? (
                    <><span className="mi-warn">Send to {ntfy}?</span><button onClick={() => setConfirm(false)}>Cancel</button><button className="primary" onClick={() => void window.stm.radar.notify(draft.text).then(() => (setConfirm(false), setMsg('Sent to your ntfy topic.')), (e) => setMsg(clean(e)))}>Send</button></>
                  ) : <button className="primary" disabled={!ntfy} onClick={() => setConfirm(true)}>Send to me</button>}
                </div>
              </div>
            )}
            {msg && <div className="faint">{msg}</div>}
          </main>
        </div>
      </div>
    </div>
  )
}
