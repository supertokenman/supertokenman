import { IconTrash } from './icons'
import { RowAct, RowActs } from './RowActs'
import { useEffect, useState } from 'react'
import { DEFAULT_SCHEDULE, type FeedItem, type FeedRule, type RuleAction, type Schedule } from '../shared/feeds'
import { StateMark } from './StateMark'
import { clean } from './errors'
import './bridge'

type Setup = Awaited<ReturnType<typeof window.stm.news.setup>>
const ACTIONS: Record<RuleAction, string> = { hide: 'Hide it', star: 'Star it', summarize: 'Summarize it', notify: 'Notify me' }
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** A briefing line with [n] turned into a link to its source. */
function Cited(props: { text: string; used: FeedItem[] }) {
  return (
    <>
      {props.text.split(/(\[\d+\])/g).map((p, i) => {
        const n = /^\[(\d+)\]$/.exec(p)?.[1]
        const it = n ? props.used[Number(n) - 1] : undefined
        if (it) return <a key={i} className="rs-cite" href={it.link || undefined} title={`${it.title} (${it.source})`} target="_blank" rel="noreferrer">{n}</a>
        return n ? <span key={i} className="rs-cite bad" title="No such source">{n}</span> : <span key={i}>{p}</span>
      })}
    </>
  )
}

/** The digest of what is unread, written by the local model, and the briefings kept so far. */
export function BriefingView(props: { unread: FeedItem[] }) {
  const [setup, setSetup] = useState<Setup | null>(null)
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<{ text: string; used: FeedItem[]; file: string } | null>(null)
  const [past, setPast] = useState<{ name: string; text: string } | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => void window.stm.news.setup().then(setSetup), [])
  const make = async (save: boolean) => {
    setBusy(true)
    setErr('')
    setPast(null)
    try {
      const r = await window.stm.news.digest(props.unread, save)
      // the model saw the items in the order the prompt gave them: starred first, then newest
      const used = [...props.unread].sort((a, b) => Number(Boolean(b.starred)) - Number(Boolean(a.starred)) || b.date.localeCompare(a.date)).slice(0, r.used)
      setOut({ text: r.text.split('\n## Sources')[0]!, used, file: r.file })
      if (save) void window.stm.news.setup().then(setSetup)
    } catch (e) {
      setErr(clean(e))
    }
    setBusy(false)
  }
  return (
    <div className="fd-view">
      <div className="fd-side">
        <div className="sp-label">Briefings kept</div>
        {setup?.briefings.length === 0 && <div className="faint">None yet.</div>}
        {setup?.briefings.map((b) => <button key={b} className={`ib-filter ${past?.name === b ? 'on' : ''}`} onClick={() => void window.stm.news.briefing(b).then((text) => (setOut(null), setPast({ name: b, text })))}>{b.replace(/\.md$/, '').replace(/^(\d{4}-\d\d-\d\d)-(\d\d)-(\d\d)$/, '$1 $2:$3')}</button>)}
      </div>
      <div className="fd-main">
        <div className="dep-row">
          <span className="faint">{props.unread.length} unread · written by {setup?.model || 'the local model (pick one in Local models)'}, free, on this machine</span>
          <span className="spacer-flex" />
          <button className="ghost small" disabled={busy || !props.unread.length} onClick={() => void make(false)}>Brief me now</button>
          <button className="primary small" disabled={busy || !props.unread.length} onClick={() => void make(true)}>{busy ? <><StateMark state="busy" label="Writing" /> Writing…</> : 'Brief me and keep it'}</button>
        </div>
        {err && <div className="notice error">{err}</div>}
        {out && (
          <div className="rs-report">
            {out.text.split(/\n+/).filter((l) => l.trim()).map((l, i) => (/^#{1,3} /.test(l) ? <div key={i} className="rs-h h2">{l.replace(/^#+ /, '')}</div> : <p key={i}><Cited text={l.replace(/^[-*] /, '')} used={out.used} /></p>))}
            {out.file && <div className="faint">Kept in {out.file} and in memory (briefings).</div>}
          </div>
        )}
        {past && <pre className="tr-text fd-past">{past.text}</pre>}
        {!out && !past && !busy && <div className="faint">A short briefing of what you have not read, grouped by theme, every point with its source. Starred items first.</div>}
      </div>
    </div>
  )
}

/** Rules on arrival, newsletter senders, OPML in and out, and the briefing schedule. */
export function SetupView(props: { onChanged: () => void }) {
  const [s, setS] = useState<Setup | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [rule, setRule] = useState<FeedRule>({ id: '', words: '', field: 'any', action: 'hide' })
  const [sender, setSender] = useState('')
  const [sched, setSched] = useState<Schedule>(DEFAULT_SCHEDULE)
  const load = () => void window.stm.news.setup().then((x) => (setS(x), setSched(x.briefing)), (e) => setErr(clean(e)))
  useEffect(load, [])
  const act = (p: Promise<unknown>, done?: (r: unknown) => string) => void p.then((r) => (setErr(''), setMsg(done ? done(r) : ''), load(), props.onChanged()), (e) => setErr(clean(e)))
  if (!s) return <div className="dsg-body faint">{err || 'Loading…'}</div>
  return (
    <div className="fd-setup">
      {err && <div className="notice error">{err}</div>}
      {msg && <div className="notice">{msg}</div>}
      <section>
        <div className="sp-label">Rules on arrival</div>
        <div className="wr-rules">
          {s.rules.map((r) => (
            <div key={r.id} className="wr-rule row-host">
              <span className="faint">When {r.field === 'any' ? 'an item' : `the ${r.field}`} has</span><code>{r.words}</code><b>{ACTIONS[r.action]}</b>
              <RowActs><RowAct label="Remove this rule" icon={<IconTrash />} danger onClick={() => act(window.stm.news.rules(s.rules.filter((x) => x.id !== r.id)))} /></RowActs>
            </div>
          ))}
          {s.rules.length === 0 && <div className="faint">No rules yet.</div>}
        </div>
        <div className="fd-rule-form">
          <select aria-label="Where to look" value={rule.field} onChange={(e) => setRule({ ...rule, field: e.target.value as FeedRule['field'] })}><option value="any">Anywhere</option><option value="title">In the title</option><option value="source">In the source</option></select>
          <input id="fd-words" value={rule.words} placeholder="all these words, e.g. sponsored" onChange={(e) => setRule({ ...rule, words: e.target.value })} />
          <select aria-label="What to do" value={rule.action} onChange={(e) => setRule({ ...rule, action: e.target.value as RuleAction })}>{(Object.keys(ACTIONS) as RuleAction[]).map((a) => <option key={a} value={a}>{ACTIONS[a]}</option>)}</select>
          <button className="primary small" disabled={!rule.words.trim()} onClick={() => (act(window.stm.news.rules([...s.rules, rule])), setRule({ ...rule, id: '', words: '' }))}>Add rule</button>
        </div>
        <div className="faint">Summaries come from the local model ({s.model || 'none picked'}), five per refresh at most.</div>
      </section>
      <section>
        <div className="sp-label">Newsletters · they go to the reader, not the inbox</div>
        <div className="fd-senders">
          {s.senders.map((x) => <button key={x} className="dc-tag on" title="Remove" onClick={() => act(window.stm.news.senders(s.senders.filter((y) => y !== x)))}>{x} ×</button>)}
          {s.senders.length === 0 && <span className="faint">No newsletter senders yet.</span>}
        </div>
        <div className="dep-row">
          <input id="fd-sender" value={sender} placeholder="sender address, e.g. hello@bytes.dev" onChange={(e) => setSender(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sender.trim() && (act(window.stm.news.senders([...s.senders, sender])), setSender(''))} />
          <button className="ghost small" disabled={!sender.includes('@')} onClick={() => (act(window.stm.news.senders([...s.senders, sender])), setSender(''))}>Add</button>
        </div>
        <div className="faint">Mail from these senders in a connected Outlook or Gmail shows here, read on this machine. Tip: subscribe with an address like you+news@gmail.com and add the senders once.</div>
      </section>
      <section>
        <div className="sp-label">OPML</div>
        <div className="dep-row">
          <span className="faint">Bring feeds from another reader, or take yours along.</span>
          <span className="spacer-flex" />
          <button className="ghost small" onClick={() => act(window.stm.news.opmlImport(), (r) => (r ? `Added ${(r as { added: number }).added} feed${(r as { added: number }).added === 1 ? '' : 's'}; ${(r as { skipped: number }).skipped} already here.` : ''))}>Import OPML…</button>
          <button className="ghost small" onClick={() => act(window.stm.news.opmlExport(), (r) => (r ? `Saved ${(r as { count: number }).count} feeds to ${(r as { file: string }).file}.` : ''))}>Export OPML…</button>
        </div>
      </section>
      <section>
        <div className="sp-label">Scheduled briefing</div>
        <div className="dep-row fd-sched">
          <label className="ib-check"><input type="checkbox" checked={sched.on} onChange={(e) => setSched({ ...sched, on: e.target.checked })} />Make one</label>
          <select aria-label="How often" disabled={!sched.on} value={sched.every} onChange={(e) => setSched({ ...sched, every: e.target.value as Schedule['every'] })}><option value="daily">every day</option><option value="weekly">every week</option></select>
          {sched.every === 'weekly' && <select aria-label="Day" disabled={!sched.on} value={sched.day} onChange={(e) => setSched({ ...sched, day: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={d} value={i}>on {d}</option>)}</select>}
          <label className="faint" htmlFor="fd-time">at</label>
          <input id="fd-time" type="time" disabled={!sched.on} value={sched.time} onChange={(e) => setSched({ ...sched, time: e.target.value })} />
          <span className="spacer-flex" />
          <button className="primary small" onClick={() => act(window.stm.news.schedule(sched), () => (sched.on ? 'Saved. It is kept under Briefings and in memory; nothing is sent anywhere.' : 'Scheduled briefings are off.'))}>Save</button>
        </div>
      </section>
    </div>
  )
}
