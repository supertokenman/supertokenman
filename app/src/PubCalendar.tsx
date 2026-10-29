import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { IconClose } from './icons'
import type { NetworkId } from '../electron/social/core'
import { problem, stateOf, textFor, type Item, type ItemState } from '../electron/social/queue'
import { byDay, LIMITS, moveToDay, nextFreeSlot, slotAt, weekOf, type Slot } from '../shared/pubcal'
import { StateMark } from './StateMark'
import { clean } from './errors'
import './bridge'
import { Checkbox, DateTimeField, Select, TimeField } from './ui'

const SlotsEditor = lazy(() => import('./SlotsEditor').then((x) => ({ default: x.SlotsEditor })))
const BestTime = lazy(() => import('./BestTime').then((x) => ({ default: x.BestTime })))
const NAMES: Record<NetworkId, string> = { instagram: 'Instagram', facebook: 'Facebook', threads: 'Threads', youtube: 'YouTube', linkedin: 'LinkedIn', x: 'X', tiktok: 'TikTok', bluesky: 'Bluesky', mastodon: 'Mastodon' }
const SHORT: Record<NetworkId, string> = { instagram: 'IG', facebook: 'FB', threads: 'TH', youtube: 'YT', linkedin: 'IN', x: 'X', tiktok: 'TT', bluesky: 'BS', mastodon: 'MA' }
const STATE: Record<ItemState, { label: string; mark: 'off' | 'warn' | 'busy' | 'up' | 'down' }> = {
  draft: { label: 'Needs Approve', mark: 'off' },
  scheduled: { label: 'Approved', mark: 'warn' },
  publishing: { label: 'Going out', mark: 'busy' },
  done: { label: 'Posted', mark: 'up' },
  partly: { label: 'Partly posted', mark: 'warn' },
  failed: { label: 'Failed', mark: 'down' },
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const localInput = (t: number | null) => {
  if (t == null) return ''
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * The publishing calendar: drafts and queued posts on a week, dragged between days or onto a preferred
 * slot. Moving an approved post takes the approval back; nothing goes out without Approve.
 */
export function PubCalendarSheet(props: { onClose: () => void }) {
  const [q, setQ] = useState<Item[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [nets, setNets] = useState<NetworkId[]>([])
  const [anchor, setAnchor] = useState(() => new Date())
  const [pick, setPick] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [slotsOpen, setSlotsOpen] = useState(false)
  const [bestOpen, setBestOpen] = useState(false)
  const [held, setHeld] = useState<Item[]>([])
  const [drag, setDrag] = useState<string | null>(null)
  const load = () => {
    void window.stm.social.queue().then(setQ, (e) => setErr(clean(e)))
    void window.stm.social.held().then(setHeld, (e) => setErr(clean(e)))
  }
  useEffect(() => {
    load()
    void window.stm.social.slots().then(setSlots)
    void window.stm.social.connected().then(setNets)
  }, [])
  // a held post is late: Post now, Move to the next slot of its network, or Skip; then read both lists again
  const heldAct = (p: Promise<unknown>) => void p.then(() => (load(), setErr('')), (e) => setErr(clean(e)))
  const moveHeld = (it: Item) => heldAct(toNextSlot(it))
  // while something is going out, read the queue again until each network has answered
  const going = q.some((i) => stateOf(i) === 'publishing')
  useEffect(() => {
    if (!going) return
    const t = setInterval(load, 2000)
    return () => clearInterval(t)
  }, [going])
  const act = (p: Promise<Item[]>) => void p.then((x) => (setQ(x), setErr('')), (e) => setErr(clean(e)))
  const week = useMemo(() => weekOf(anchor), [anchor])
  const days = byDay(q, week)
  const drafts = q.filter((i) => i.when == null && stateOf(i) === 'draft')
  const today = new Date()
  const drop = (target: { day?: Date; at?: number | null }) => {
    if (!drag) return
    const it = q.find((x) => x.id === drag)
    setDrag(null)
    if (!it) return
    const when = target.at !== undefined ? target.at : moveToDay(it.when, target.day!)
    if (when !== it.when) act(window.stm.social.move(it.id, when))
  }
  const newPost = () =>
    act(
      window.stm.social.save({ text: '', networks: nets.length ? [nets[0]!] : ['bluesky'], when: nextFreeSlot(slots, q.map((x) => x.when), new Date()) }).then((x) => {
        setPick(x[0]?.id ?? null)
        return x
      }),
    )
  const current = q.find((x) => x.id === pick) ?? null
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet pubcal" role="dialog" aria-label="Publishing calendar">
        <header className="sheet-head">
          <div className="sheet-title">Publishing calendar</div>
          <div className="pc-week">
            <button className="ghost small" aria-label="Previous week" onClick={() => setAnchor(new Date(anchor.getTime() - 7 * 86_400_000))}>‹</button>
            <button className="ghost small" onClick={() => setAnchor(new Date())}>This week</button>
            <button className="ghost small" aria-label="Next week" onClick={() => setAnchor(new Date(anchor.getTime() + 7 * 86_400_000))}>›</button>
            <span className="pc-range">{week[0]!.toLocaleDateString([], { day: '2-digit', month: 'short' })} – {week[6]!.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          </div>
          <span className="spacer-flex" />
          <button className="ghost small" aria-expanded={slotsOpen} onClick={() => setSlotsOpen(!slotsOpen)}>Time slots…</button>
          <button className="ghost small" aria-expanded={bestOpen} onClick={() => setBestOpen(!bestOpen)}>Best time…</button>
          <button className="primary small" onClick={newPost}>New post</button>
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        {err && <div className="notice error pc-notice">{err}</div>}
        {slotsOpen && <Slots slots={slots} onSave={(s) => void window.stm.social.setSlots(s).then((x) => (setSlots(x), setSlotsOpen(false)), (e) => setErr(clean(e)))} />}
        {slotsOpen && (
          <Suspense fallback={null}>
            <SlotsEditor nets={nets} onError={setErr} />
          </Suspense>
        )}
        {bestOpen && (
          <Suspense fallback={null}>
            <BestTime nets={nets} />
          </Suspense>
        )}
        {held.length > 0 && (
          <div className="pc-slots pc-held">
            <span className="sp-label">Missed</span>
            <span className="faint">These were due while the app was closed or the Mac was asleep. Nothing posts until you pick one.</span>
            {held.map((i) => (
              <div key={i.id} className="pc-held-row">
                <span className="pc-text">{i.text || <span className="faint">Empty draft</span>}</span>
                <span className="faint">{i.when != null ? hhmm(i.when) : ''} · {i.networks.map((n) => SHORT[n]).join(' ')}</span>
                <span className="spacer-flex" />
                <button className="primary small" onClick={() => heldAct(window.stm.social.postNow(i.id))}>Post now</button>
                <button className="ghost small" onClick={() => moveHeld(i)}>Move to next slot</button>
                <button className="ghost small" onClick={() => heldAct(window.stm.social.skip(i.id))}>Skip</button>
              </div>
            ))}
          </div>
        )}
        <div className={`pc-body ${current ? 'with-editor' : ''}`}>
          <aside className="pc-drafts" onDragOver={(e) => e.preventDefault()} onDrop={() => drop({ at: null })}>
            <div className="sp-label">Drafts · no time yet</div>
            {drafts.length === 0 && <div className="faint pc-hint">Drag a post here to take its time off.</div>}
            {drafts.map((i) => <Card key={i.id} i={i} on={pick === i.id} onPick={() => setPick(i.id)} onDrag={() => setDrag(i.id)} />)}
          </aside>
          <div className="pc-grid">
            {week.map((d, k) => {
              const free = slots.filter((s) => s.day === d.getDay()).map((s) => slotAt(d, s.time)).filter((t) => t > Date.now() && !days[k]!.some((i) => Math.abs(i.when! - t) < 30 * 60_000))
              const isToday = d.toDateString() === today.toDateString()
              return (
                <div key={k} className={`pc-day ${isToday ? 'today' : ''} ${d < new Date(today.getFullYear(), today.getMonth(), today.getDate()) ? 'past' : ''}`} onDragOver={(e) => e.preventDefault()} onDrop={() => drop({ day: d })}>
                  <div className="pc-dayhead"><b>{DAYS[d.getDay()]}</b><span className="faint">{d.getDate()}</span></div>
                  {[...days[k]!.map((i) => ({ t: i.when!, i })), ...free.map((t) => ({ t, i: null }))].sort((a, b) => a.t - b.t).map(({ t, i }) =>
                    i ? (
                      <Card key={i.id} i={i} on={pick === i.id} onPick={() => setPick(i.id)} onDrag={() => setDrag(i.id)} />
                    ) : (
                      <div key={`s${t}`} className="pc-slot" onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.stopPropagation(), drop({ at: t }))}>
                        {hhmm(t)} · free slot
                      </div>
                    ),
                  )}
                </div>
              )
            })}
          </div>
          {current && <Editor key={`${current.id}:${current.when}:${current.approved}:${Object.keys(current.results).length}`} it={current} nets={nets} slots={slots} queue={q} act={act} onClose={() => setPick(null)} />}
        </div>
      </div>
    </div>
  )
}

/**
 * Places each network of the item on the next free time of that network. A queue item has one time, so a
 * post for several networks becomes one item per network, each with its own text and slot. Every slot is
 * found before anything is changed. Nothing is approved here.
 */
async function toNextSlot(it: Item): Promise<Item[]> {
  if (!it.networks.length) throw new Error('Pick a network first.')
  const at: number[] = []
  for (const n of it.networks) {
    const t = await window.stm.social.nextSlot(n)
    if (t == null) throw new Error(`No free time on ${NAMES[n]} in the next four weeks. Set its times in Time slots first.`)
    at.push(t)
  }
  const [first, ...rest] = it.networks
  for (const [i, n] of rest.entries()) {
    await window.stm.social.save({ text: it.variants?.[n]?.trim() ? it.variants[n] : it.text, mediaUrl: it.mediaUrl, mediaKind: it.mediaKind, link: it.link, title: it.title, networks: [n], when: at[i + 1]! })
  }
  if (rest.length) {
    const own = it.variants?.[first!]
    await window.stm.social.save({ ...it, text: own?.trim() ? own : it.text, variants: undefined, networks: [first!] })
  }
  return window.stm.social.move(it.id, at[0]!)
}

function Card(props: { i: Item; on: boolean; onPick: () => void; onDrag: () => void }) {
  const st = stateOf(props.i)
  const done = st === 'done' || st === 'partly'
  return (
    <button className={`pc-card ${st} ${props.on ? 'on' : ''}`} draggable={!done} onDragStart={props.onDrag} onClick={props.onPick} data-tip={done ? 'Posted; it stays where it went out' : 'Drag to another day or a free slot'}>
      <span className="pc-card-top">
        {props.i.when != null && <b className="pc-time">{hhmm(props.i.when)}</b>}
        <span className="pc-nets">{props.i.networks.map((n) => <span key={n} className="pc-net">{SHORT[n]}</span>)}</span>
      </span>
      <span className="pc-text">{props.i.text || <span className="faint">Empty draft</span>}</span>
      <span className="pc-state"><StateMark state={props.i.held ? 'warn' : STATE[st].mark} label={props.i.held ? 'Missed' : STATE[st].label} />{props.i.held ? 'Missed' : STATE[st].label}{props.i.comments?.length ? <span className="faint"> · {props.i.comments.length} note{props.i.comments.length === 1 ? '' : 's'}</span> : null}</span>
    </button>
  )
}

function Editor(props: { it: Item; nets: NetworkId[]; slots: Slot[]; queue: Item[]; act: (p: Promise<Item[]>) => void; onClose: () => void }) {
  const [d, setD] = useState<Item>(props.it)
  const [tab, setTab] = useState<NetworkId | 'all'>('all')
  const [note, setNote] = useState('')
  const st = stateOf(props.it)
  // once it went out somewhere, it is a record: only the failed networks can be retried
  const sent = Object.values(props.it.results).some((r) => r?.ok)
  // only what goes out counts as a change; approval, results and notes are not edits
  const pickEdit = (x: Item) => JSON.stringify([x.text, x.variants ?? {}, x.networks, x.when, x.link ?? '', x.mediaUrl ?? ''])
  const dirty = pickEdit(d) !== pickEdit(props.it)
  const all = [...new Set([...props.nets, ...d.networks])]
  const textOf = (n: NetworkId) => textFor(d, n)
  return (
    <aside className="pc-editor">
      <fieldset className="pc-lock" disabled={sent}>
      <div className="pc-ed-head">
        <StateMark state={STATE[st].mark} label={STATE[st].label} />
        <b>{STATE[st].label}</b>
        {props.it.when != null && <span className="faint">{new Date(props.it.when).toLocaleString([], { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
        <span className="spacer-flex" />
        <button className="icon" aria-label="Close editor" onClick={props.onClose}>×</button>
      </div>
      <div className="pc-nets-pick">
        {all.map((n) => (
          <label key={n} className="ib-check"><Checkbox checked={d.networks.includes(n)} onChange={(e) => setD({ ...d, networks: e.target.checked ? [...d.networks, n] : d.networks.filter((x) => x !== n) })} />{NAMES[n]}{!props.nets.includes(n) && <span className="faint"> (not connected)</span>}</label>
        ))}
      </div>
      <div className="segmented small pc-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')}>Main text</button>
        {d.networks.map((n) => <button key={n} role="tab" aria-selected={tab === n} onClick={() => setTab(n)}>{NAMES[n]}{d.variants?.[n] ? ' *' : ''}</button>)}
      </div>
      {tab === 'all' ? (
        <textarea id="pc-text" rows={6} value={d.text} placeholder="What to post" onChange={(e) => setD({ ...d, text: e.target.value })} />
      ) : (
        <>
          <textarea id="pc-variant" rows={6} value={d.variants?.[tab] ?? ''} placeholder={`Leave empty to use the main text on ${NAMES[tab]}`} onChange={(e) => setD({ ...d, variants: { ...d.variants, [tab]: e.target.value } })} />
          {d.variants?.[tab] && <button className="ghost small pc-reset" onClick={() => setD({ ...d, variants: Object.fromEntries(Object.entries(d.variants ?? {}).filter(([k]) => k !== tab)) })}>Use the main text instead</button>}
        </>
      )}
      <div className="pc-limits">
        {d.networks.map((n) => {
          const len = textOf(n).length + (d.link && !textOf(n).includes(d.link) ? d.link.length + 1 : 0)
          const p = problem(d, n)
          return (
            <div key={n} className={`pc-limit ${p ? 'bad' : ''}`}>
              <span>{NAMES[n]}</span>
              <span className="pc-count">{len.toLocaleString('en-US')}{LIMITS[n] ? ` / ${LIMITS[n]!.toLocaleString('en-US')}` : ''}</span>
              <span className="faint">{p || (d.variants?.[n] ? 'its own version' : 'main text')}</span>
            </div>
          )
        })}
      </div>
      <input id="pc-link" value={d.link ?? ''} placeholder="Link (optional)" onChange={(e) => setD({ ...d, link: e.target.value || undefined })} />
      <input id="pc-media" value={d.mediaUrl ?? ''} placeholder="Photo or video address, https:// (needed for Instagram and TikTok)" onChange={(e) => setD({ ...d, mediaUrl: e.target.value || undefined })} />
      <div className="dep-row">
        <DateTimeField id="pc-when" value={localInput(d.when)} onChange={(e) => setD({ ...d, when: e.target.value ? new Date(e.target.value).getTime() : null })} />
        <button className="ghost small" disabled={!props.slots.length} onClick={() => setD({ ...d, when: nextFreeSlot(props.slots, props.queue.filter((x) => x.id !== d.id).map((x) => x.when), new Date()) })}>Next free slot</button>
        <button className="ghost small" onClick={() => setD({ ...d, when: null })}>No time</button>
      </div>
      </fieldset>
      {sent && <div className="faint">Posted; what went out stays as it was. Delete only removes it from this calendar.</div>}
      <div className="sbx-actions">
        <button className="danger small" onClick={() => (props.act(window.stm.social.remove(d.id)), props.onClose())}>{sent ? 'Remove from the calendar' : 'Delete'}</button>
        <span className="spacer-flex" />
        {dirty && !sent && <button className="ghost small" onClick={() => props.act(window.stm.social.save(d))}>Save</button>}
        {!dirty && st === 'draft' && d.when == null && !sent && (
          <button className="ghost small" data-tip={d.networks[0] ? (d.networks.length > 1 ? 'Each network takes its own next free time; the post becomes one item per network' : `Takes the next free time of ${NAMES[d.networks[0]]}`) : 'Pick a network first'} disabled={!d.networks[0]} onClick={() => props.act(toNextSlot(props.it))}>Add to queue</button>
        )}
        {!dirty && st === 'draft' && <button className="primary small" onClick={() => props.act(window.stm.social.approve(d.id, true))}>{d.when == null || d.when <= Date.now() ? 'Approve and post now' : `Approve for ${hhmm(d.when)}`}</button>}
        {!dirty && st === 'scheduled' && <button className="ghost small" onClick={() => props.act(window.stm.social.approve(d.id, false))}>Take approval back</button>}
        {(st === 'failed' || st === 'partly') && <button className="ghost small" onClick={() => props.act(window.stm.social.retry(d.id))}>Retry the failed ones</button>}
      </div>
      {dirty && !sent && props.it.approved && <div className="faint">Saving a change takes the approval back; approve what will really go out.</div>}
      {Object.keys(props.it.results).length > 0 && (
        <div className="pc-results">
          {Object.entries(props.it.results).map(([n, r]) => (
            <div key={n} className={`pc-limit ${r?.ok ? '' : 'bad'}`}><span>{NAMES[n as NetworkId]}</span>{r?.ok ? (r.url ? <a href={r.url} target="_blank" rel="noreferrer">Posted</a> : <span>Posted</span>) : <span>{r?.error}</span>}</div>
          ))}
        </div>
      )}
      <div className="sp-label">Notes before approving · never posted</div>
      {(props.it.comments ?? []).map((c) => <div key={c.at} className="pc-note"><span className="faint">{new Date(c.at).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span><span>{c.text}</span></div>)}
      <div className="dep-row">
        <input id="pc-note" value={note} placeholder="e.g. check the link before Friday" onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && note.trim() && (props.act(window.stm.social.comment(d.id, note)), setNote(''))} />
        <button className="ghost small" disabled={!note.trim()} onClick={() => (props.act(window.stm.social.comment(d.id, note)), setNote(''))}>Add note</button>
      </div>
    </aside>
  )
}

function Slots(props: { slots: Slot[]; onSave: (s: Slot[]) => void }) {
  const [s, setS] = useState<Slot[]>(props.slots)
  const [day, setDay] = useState(1)
  const [time, setTime] = useState('09:00')
  return (
    <div className="pc-slots">
      <span className="sp-label">Preferred times</span>
      {s.map((x, i) => <button key={`${x.day}${x.time}`} className="dc-tag on" data-tip="Remove" onClick={() => setS(s.filter((_, k) => k !== i))}>{DAYS[x.day]} {x.time} ×</button>)}
      {s.length === 0 && <span className="faint">None yet.</span>}
      <Select aria-label="Day" value={day} onChange={(e) => setDay(Number(e.target.value))}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</Select>
      <TimeField id="pc-slot-time" value={time} onChange={(e) => setTime(e.target.value)} />
      <button className="ghost small" onClick={() => setS([...s.filter((x) => !(x.day === day && x.time === time)), { day, time }])}>Add</button>
      <span className="spacer-flex" />
      <button className="primary small" onClick={() => props.onSave(s)}>Save</button>
    </div>
  )
}
