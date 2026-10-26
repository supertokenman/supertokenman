import { useEffect, useMemo, useState } from 'react'
import { IconClose } from './icons'
import type { Persona } from '../shared/personas'
import type { Version } from '../shared/versions'
import { presetOf, type Choice, type Kind, type Tally, type Winner } from '../shared/arena'
import type { EvalResult } from '../shared/evals'
import { lineDiff } from '../electron/diff'
import { StateMark } from './StateMark'
import { StylePicker } from './Personas'
import { STYLES, type StyleId } from '../shared/styles'
import { byStyles, versusNone, type Band } from '../shared/bands'
import { pct, rougeL } from '../shared/rouge'
import { clean } from './errors'
import './bridge'

type Tab = 'versions' | 'evals' | 'arena' | 'choices' | 'board' | 'memory' | 'learn'

export function DiffBlock(props: { before: string; after: string }) {
  const lines = useMemo(() => lineDiff(props.before, props.after), [props.before, props.after])
  return (
    <pre className="lab-diff">
      {lines.map((l, i) => (
        <div key={i} className={l.op === '+' ? 'add' : l.op === '-' ? 'del' : ''}>
          {l.op} {l.text}
        </div>
      ))}
    </pre>
  )
}

/**
 * The lab: how the personas and the local model are doing. Versions of each persona's instructions with
 * what changed and a way back; evals that grade a persona on fixed prompts; the arena, local model
 * against Claude on one prompt; where each small task went; and what Headroom learned from past sessions.
 */
export function LabSheet(props: { cwd?: string; money: (usd: number) => string; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('versions')
  const [list, setList] = useState<Persona[]>([])
  const [pid, setPid] = useState('')
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  useEffect(() => {
    void window.stm.personas.list().then((l) => {
      setList(l)
      setPid((x) => x || l[0]?.id || '')
    })
  }, [])
  const persona = list.find((p) => p.id === pid)
  const fail = (e: unknown) => setMsg({ text: clean(e), bad: true })
  const tabs: [Tab, string][] = [['versions', 'Versions'], ['evals', 'Evals'], ['arena', 'Arena'], ['choices', 'Local or Claude'], ['board', 'Board'], ['memory', 'Memory'], ['learn', 'Learn']]
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet lab" role="dialog" aria-label="Lab">
        <header className="sheet-head">
          <div className="sheet-title">Lab</div>
          <div className="segmented small" role="tablist">
            {tabs.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setMsg(null) }}>{label}</button>
            ))}
          </div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        {msg && <div className={`notice lab-msg ${msg.bad ? 'error' : ''}`}>{msg.text}</div>}
        {(tab === 'versions' || tab === 'evals') && (
          <div className="sp-grid">
            <aside className="sp-side">
              <div className="sp-label">Personas</div>
              {list.map((p) => (
                <button key={p.id} className={`sp-item ${p.id === pid ? 'on' : ''}`} onClick={() => setPid(p.id)}>
                  <span className="lab-dot" style={{ background: p.color }} />
                  <span className="sp-item-title">{p.name}</span>
                </button>
              ))}
            </aside>
            <section className="sp-main">
              {persona && tab === 'versions' && <Versions key={persona.id} p={persona} onSaved={setList} onMsg={setMsg} fail={fail} />}
              {persona && tab === 'evals' && <Evals key={persona.id} p={persona} onSaved={setList} onMsg={setMsg} fail={fail} />}
            </section>
          </div>
        )}
        {tab === 'arena' && <Arena money={props.money} fail={fail} />}
        {tab === 'choices' && <Choices />}
        {tab === 'board' && <Board money={props.money} />}
        {tab === 'memory' && <MemoryLab cwd={props.cwd} fail={fail} />}
        {tab === 'learn' && <Learn cwd={props.cwd} fail={fail} />}
      </div>
    </div>
  )
}

function Versions(props: { p: Persona; onSaved: (l: Persona[]) => void; onMsg: (m: { text: string }) => void; fail: (e: unknown) => void }) {
  const [hist, setHist] = useState<Version[]>([])
  const [at, setAt] = useState<number | null>(null)
  useEffect(() => void window.stm.personas.history(props.p.id).then(setHist), [props.p])
  const v = hist.find((x) => x.at === at) ?? hist[0]
  if (!hist.length) return <div className="faint">No earlier versions of {props.p.name} yet. Each save keeps the instructions it replaced.</div>
  return (
    <div className="lab-versions">
      <div className="lab-vlist">
        {hist.map((x) => (
          <button key={x.at} className={`sp-item ${v?.at === x.at ? 'on' : ''}`} onClick={() => setAt(x.at)}>
            <span className="sp-item-title">{new Date(x.at).toLocaleString()}</span>
            {x.note && <span className="faint lab-note">{x.note}</span>}
          </button>
        ))}
      </div>
      {v && (
        <>
          <div className="sp-label">From that version to now</div>
          <DiffBlock before={v.instructions} after={props.p.instructions} />
          <div className="sbx-actions">
            <button className="primary small" onClick={() => void window.stm.personas.restore(props.p.id, v.at).then((l) => { props.onSaved(l); props.onMsg({ text: `Restored. The instructions it replaced are kept as a version too.` }); void window.stm.personas.history(props.p.id).then(setHist) }, props.fail)}>Restore this version</button>
          </div>
        </>
      )}
    </div>
  )
}

function Evals(props: { p: Persona; onSaved: (l: Persona[]) => void; onMsg: (m: { text: string }) => void; fail: (e: unknown) => void }) {
  const [text, setText] = useState('')
  const [res, setRes] = useState<EvalResult[] | null>(null)
  const [busy, setBusy] = useState('')
  const [proposal, setProposal] = useState<{ text: string; res?: EvalResult[] } | null>(null)
  const [askClaude, setAskClaude] = useState(false)
  useEffect(() => void window.stm.evals.get(props.p.id).then(setText), [props.p])
  const run = async (where: 'local' | 'claude', instructions?: string) => {
    setBusy(where)
    try {
      await window.stm.evals.set(props.p.id, text)
      const r = await window.stm.evals.run(props.p.id, where, instructions)
      if (instructions !== undefined) setProposal((p) => (p ? { ...p, res: r } : p))
      else setRes(r)
    } catch (e) {
      props.fail(e)
    }
    setBusy('')
  }
  const failures = (res ?? []).filter((r) => !r.pass).map((r) => `${r.id}${r.missing.length ? ` missed ${r.missing.map((m) => `"${m}"`).join(', ')}` : ''}${r.forbidden.length ? ` said ${r.forbidden.map((m) => `"${m}"`).join(', ')}` : ''}`)
  const score = (r: EvalResult[]) => `${r.filter((x) => x.pass).length} of ${r.length} pass`
  return (
    <div className="lab-evals">
      <label className="sp-label" htmlFor="lab-cases">Cases for {props.p.name}: one per line, prompt | must: words | not: words (/regex/ works)</label>
      <textarea id="lab-cases" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Review: const q = "SELECT * FROM users WHERE id=" + id | must: injection, parameter | not: looks fine'} />
      <div className="sbx-actions">
        {askClaude ? (
          <>
            <span className="faint">Each case is one short Claude call on your plan.</span>
            <button className="ghost small" onClick={() => setAskClaude(false)}>Cancel</button>
            <button className="primary small" disabled={!!busy} onClick={() => { setAskClaude(false); void run('claude') }}>Run with Claude</button>
          </>
        ) : (
          <>
            <button className="ghost small" disabled={!!busy || !text.trim()} onClick={() => setAskClaude(true)}>Run with Claude…</button>
            <button className="primary small" disabled={!!busy || !text.trim()} onClick={() => void run('local')}>{busy ? 'Running…' : 'Run with the local model'}</button>
          </>
        )}
      </div>
      {res && (
        <>
          <div className="sp-label">Now · {score(res)}</div>
          <div className="sp-tasks">
            {res.map((r) => (
              <details key={r.id} className={`lab-res ${r.pass ? '' : 'bad'}`}>
                <summary>
                  <StateMark state={r.pass ? 'up' : 'warn'} label={r.pass ? 'Pass' : 'Fail'} />
                  <b>{r.id}</b>
                  <span>{r.pass ? 'Pass' : [r.missing.length ? `missing ${r.missing.join(', ')}` : '', r.forbidden.length ? `said ${r.forbidden.join(', ')}` : ''].filter(Boolean).join('; ')}</span>
                  <span className="faint">{r.where === 'local' ? 'Local' : 'Claude'}</span>
                </summary>
                <pre className="tr-text">{r.answer}</pre>
              </details>
            ))}
          </div>
          <div className="sbx-actions">
            <button className="ghost small" disabled={!!busy} onClick={async () => {
              setBusy('rewrite')
              try {
                setProposal({ text: await window.stm.evals.rewrite(props.p.id, failures) })
              } catch (e) {
                props.fail(e)
              }
              setBusy('')
            }}>{busy === 'rewrite' ? 'Writing…' : 'Improve the instructions (local model)'}</button>
          </div>
        </>
      )}
      {proposal && (
        <div className="lab-proposal">
          <div className="sp-label">Proposed instructions{proposal.res ? ` · ${score(proposal.res)}` : ''}</div>
          <DiffBlock before={props.p.instructions} after={proposal.text} />
          <div className="sbx-actions">
            <button className="ghost small" onClick={() => setProposal(null)}>Discard</button>
            <button className="ghost small" disabled={!!busy} onClick={() => void run('local', proposal.text)}>Run the evals on it</button>
            <button className="primary small" onClick={() => void window.stm.personas.save({ ...props.p, instructions: proposal.text }).then((l) => { props.onSaved(l); setProposal(null); props.onMsg({ text: 'Saved. The old instructions are in Versions.' }) }, props.fail)}>Use these</button>
          </div>
        </div>
      )}
    </div>
  )
}

const KIND_LABEL: Record<Kind, string> = { summarize: 'Summaries', translate: 'Translations', commit: 'Commit messages', reply: 'Replies', explain: 'Explanations', code: 'Code', classify: 'Picking one', other: 'Other' }

function Arena(props: { money: (usd: number) => string; fail: (e: unknown) => void }) {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<Awaited<ReturnType<typeof window.stm.arena.run>> | null>(null)
  const [tally, setTally] = useState<Tally>({})
  const [model, setModel] = useState<string | null>(null)
  const [voted, setVoted] = useState(false)
  useEffect(() => void window.stm.arena.get().then((a) => { setTally(a.tally); setModel(a.model) }), [])
  const run = async () => {
    setBusy(true)
    setVoted(false)
    try {
      setOut(await window.stm.arena.run(prompt))
    } catch (e) {
      props.fail(e)
    }
    setBusy(false)
  }
  const pick = async (w: Winner) => {
    if (!out) return
    setTally(await window.stm.arena.vote(out.kind, w))
    setVoted(true)
  }
  const side = (name: string, r: { text: string; ms: number } | { error: string } | undefined, extra?: string) => (
    <figure className="lab-side">
      <figcaption>{name}{r && 'ms' in r ? ` · ${(r.ms / 1000).toFixed(1)}s${extra ? ` · ${extra}` : ''}` : ''}</figcaption>
      {!r ? <div className="cmp-wait">{busy ? <StateMark state="busy" label="Answering" /> : null}</div> : 'error' in r ? <div className="notice error">{r.error}</div> : <pre className="tr-text">{r.text}</pre>}
    </figure>
  )
  return (
    <div className="lab-arena">
      <label className="sp-label" htmlFor="lab-arena">One prompt, two answers: the local model ({model ?? 'none picked'}) and Claude. Claude's side is one short call on your plan.</label>
      <textarea id="lab-arena" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Write a git commit message for: renamed userId to accountId in the billing module" />
      <div className="sbx-actions">
        <button className="primary small" disabled={busy || !prompt.trim()} onClick={() => void run()}>{busy ? 'Asking both…' : 'Ask both'}</button>
      </div>
      {(busy || out) && (
        <>
          <div className="cmp-grid lab-pair">
            {side('Local model', out?.local)}
            {side('Claude', out?.claude, out && 'costUsd' in out.claude ? props.money(out.claude.costUsd) : undefined)}
          </div>
          {out && (
            <div className="sbx-actions">
              {'text' in out.local && 'text' in out.claude && <span className="faint" title="ROUGE-L between the two answers: how much of their wording they share">{pct(rougeL(out.local.text, out.claude.text).f)}% alike</span>}
              <span className="spacer-flex" />
              <span className="faint">{voted ? 'Counted.' : `Which was better for ${KIND_LABEL[out.kind].toLowerCase()}?`}</span>
              <button className="ghost small" disabled={voted} onClick={() => void pick('local')}>Local</button>
              <button className="ghost small" disabled={voted} onClick={() => void pick('tie')}>Same</button>
              <button className="ghost small" disabled={voted} onClick={() => void pick('claude')}>Claude</button>
            </div>
          )}
        </>
      )}
      <div className="sp-label">Picks so far · a kind with a clear winner after 3 picks becomes a preset for small tasks</div>
      <div className="sp-tasks">
        {(Object.keys(tally) as Kind[]).length === 0 && <div className="sp-task"><span /><span /><span className="faint">No picks yet.</span></div>}
        {(Object.keys(tally) as Kind[]).map((k) => {
          const c = tally[k]!
          const pre = presetOf(tally, k)
          return (
            <div key={k} className="sp-task lab-tally">
              <span className={`sp-check ${pre ? 'on' : ''}`} aria-hidden />
              <b>{KIND_LABEL[k]}</b>
              <span className="sp-task-text">Local {c.local} · Same {c.tie} · Claude {c.claude}</span>
              <span className="pill">{pre === 'local' ? 'Goes local' : pre === 'claude' ? 'Goes to Claude' : 'No preset'}</span>
              <button className="ghost small" onClick={() => void window.stm.arena.reset(k).then(setTally)}>Reset</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const WHY: Record<Choice['why'], string> = { preset: 'preset from the arena', model: 'local model picked', fallback: 'local failed, Claude took it', 'no-model': 'no local model', 'claude-down': 'Claude failed, the local model took it', deferred: 'local draft sent up to Claude' }

function Choices() {
  const [list, setList] = useState<Choice[]>([])
  useEffect(() => void window.stm.arena.get().then((a) => setList(a.choices)), [])
  const local = list.filter((c) => c.where === 'local').length
  return (
    <div className="lab-arena">
      <div className="sp-label">Small tasks (titles, commit messages, replies, routing) · {local} of {list.length} done on this machine</div>
      <div className="sp-tasks">
        {list.length === 0 && <div className="sp-task"><span /><span /><span className="faint">None yet.</span></div>}
        {list.map((c) => (
          <div key={c.at} className="sp-task lab-choice">
            <span className={`sp-check ${c.where === 'local' ? 'on' : ''}`} aria-hidden />
            <b>{c.where === 'local' ? 'Local' : 'Claude'}</b>
            <span className="sp-task-text">{KIND_LABEL[c.kind]} · {WHY[c.why]}{c.note ? `: ${c.note}` : ''}</span>
            <span className="faint">{(c.ms / 1000).toFixed(1)}s</span>
            <span className="faint">{new Date(c.at).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Learn(props: { cwd?: string; fail: (e: unknown) => void }) {
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<{ ok: boolean; text: string; applied: boolean } | null>(null)
  const go = async (apply: boolean) => {
    if (!props.cwd) return
    setBusy(true)
    try {
      const r = await window.stm.headroomLearn(props.cwd, apply)
      setOut({ ...r, applied: apply })
    } catch (e) {
      props.fail(e)
    }
    setBusy(false)
  }
  return (
    <div className="lab-arena">
      <div className="faint">Headroom reads this project's past Claude Code sessions with your local model and proposes lines for CLAUDE.local.md that would have avoided their failures (wrong paths, missing modules, retries). Free, on this machine. Preview first; Apply writes the file, which git ignores.</div>
      <div className="sbx-actions">
        <button className="ghost small" disabled={busy || !props.cwd} onClick={() => void go(false)}>{busy ? 'Reading sessions…' : 'Preview'}</button>
        <button className="primary small" disabled={busy || !out || out.applied || !out.ok} onClick={() => void go(true)}>Apply to CLAUDE.local.md</button>
      </div>
      {out && <pre className={`tr-text ${out.ok ? '' : 'bad'}`}>{out.text || 'Nothing to learn yet.'}</pre>}
    </div>
  )
}

const tok = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k tok` : `${n} tok`)
const styleName = (key: string) => (key === 'none' ? 'No style' : key.split('+').map((k) => STYLES[k as StyleId]?.label ?? k).join(' + '))

/** The board: what each task cost, grouped by the answer styles that were on, so a style's saving is measured here. */
function Board(props: { money: (usd: number) => string }) {
  const [bands, setBands] = useState<Band[] | null>(null)
  const [styles, setStyles] = useState<StyleId[]>([])
  useEffect(() => {
    void window.stm.bands().then(setBands)
    void window.stm.styles.get().then(setStyles)
  }, [])
  const sum = byStyles(bands ?? [])
  return (
    <div className="lab-arena">
      <div className="sp-label">Panels without a persona answer like this (a persona sets its own in Personas)</div>
      <StylePicker value={styles} onChange={(v) => void window.stm.styles.set(v).then(setStyles)} />
      <div className="faint">Takes effect in panels opened from now on: the rule is fixed for a panel's life so its cache holds.</div>
      <div className="sp-label">Average per task, by the styles that were on · {bands?.length ?? 0} {bands?.length === 1 ? 'task' : 'tasks'}</div>
      <div className="sp-tasks board-sum">
        {sum.length === 0 && <div className="sp-task"><span /><span /><span className="faint">No tasks yet. Each message to a panel counts once its turn ends.</span></div>}
        {sum.map((x) => {
          const vs = x.key === 'none' ? null : versusNone(sum, x.key)
          return (
            <div key={x.key} className="sp-task board-row">
              <span className={`sp-check ${x.key !== 'none' ? 'on' : ''}`} aria-hidden />
              <b>{styleName(x.key)}</b>
              <span className="board-num">{x.n} {x.n === 1 ? 'task' : 'tasks'}</span>
              <span className="board-num">{props.money(x.costUsd)}</span>
              <span className="board-num">{tok(x.tokens)}</span>
              <span className="board-num">{(x.ms / 1000).toFixed(0)}s</span>
              <span className="board-vs">{x.key === 'none' ? 'baseline' : vs ? `${vs.cost > 0 ? '+' : ''}${vs.cost}% cost, ${vs.tokens > 0 ? '+' : ''}${vs.tokens}% tokens` : 'needs 5 tasks each'}</span>
            </div>
          )
        })}
      </div>
      <div className="sp-label">Latest tasks</div>
      <div className="sp-tasks">
        {(bands ?? []).slice(0, 30).map((b) => (
          <div key={b.at} className={`sp-task board-row ${b.isError ? 'bad' : ''}`}>
            <span className={`sp-check ${b.styles.length ? 'on' : ''}`} aria-hidden />
            <b>{b.persona ?? b.project}</b>
            <span className="sp-task-text">{b.prompt}</span>
            <span className="board-num">{props.money(b.costUsd)}</span>
            <span className="board-num">{tok(b.tokens)}</span>
            <span className="board-num">{b.edits} {b.edits === 1 ? 'edit' : 'edits'}</span>
            <span className="board-vs">{styleName(b.styles.length ? [...b.styles].sort().join('+') : 'none')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The memory: its meaning index, and the same question asked with and without it. */
function MemoryLab(props: { cwd?: string; fail: (e: unknown) => void }) {
  const [st, setSt] = useState<Awaited<ReturnType<typeof window.stm.vec.status>> | null>(null)
  const [busy, setBusy] = useState('')
  const [q, setQ] = useState('')
  const [askClaude, setAskClaude] = useState(false)
  const [res, setRes] = useState<Awaited<ReturnType<typeof window.stm.memtest>> | null>(null)
  const cwd = props.cwd ?? ''
  useEffect(() => void (cwd && window.stm.vec.status(cwd).then(setSt)), [cwd])
  const go = async (k: string, f: () => Promise<void>) => {
    setBusy(k)
    try {
      await f()
    } catch (e) {
      props.fail(e)
    }
    setBusy('')
  }
  if (!cwd) return <div className="lab-arena faint">Open a panel in a project first.</div>
  return (
    <div className="lab-arena">
      <div className="sp-label">Find by meaning · {st?.project}</div>
      <div className="faint">A local embedding model turns each memory entry into a vector, so memory_index also finds entries that mean the same thing in other words. On this machine, free; only changed entries are redone.</div>
      <div className="lab-row">
        <label htmlFor="lab-embed" className="faint">Embedding model</label>
        <select id="lab-embed" value={st?.model ?? ''} onChange={(e) => void window.stm.vec.model(e.target.value || null).then(() => window.stm.vec.status(cwd).then(setSt))}>
          <option value="">Off (words only)</option>
          {st?.models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <span className="faint">{st?.model ? `${st.size} of ${st.total} entries indexed` : 'Pull nomic-embed-text in Local model, then pick it here.'}</span>
        <span className="spacer-flex" />
        <button className="primary small" disabled={!st?.model || !!busy} onClick={() => void go('build', async () => { await window.stm.vec.build(cwd); setSt(await window.stm.vec.status(cwd)) })}>{busy === 'build' ? 'Indexing…' : 'Bring the index up to date'}</button>
      </div>
      <div className="sp-label">What the memory adds</div>
      <label htmlFor="lab-memq" className="faint">The same question with and without this project's memory: how much of each answer the memory backs up.</label>
      <textarea id="lab-memq" rows={2} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Which package manager does this project use, and why?" />
      <div className="sbx-actions">
        {askClaude ? (
          <>
            <span className="faint">Two short Claude calls on your plan.</span>
            <button className="ghost small" onClick={() => setAskClaude(false)}>Cancel</button>
            <button className="primary small" disabled={!!busy} onClick={() => { setAskClaude(false); void go('claude', async () => setRes(await window.stm.memtest(cwd, q, 'claude'))) }}>Ask Claude</button>
          </>
        ) : (
          <>
            <button className="ghost small" disabled={!!busy || !q.trim()} onClick={() => setAskClaude(true)}>Ask Claude…</button>
            <button className="primary small" disabled={!!busy || !q.trim()} onClick={() => void go('local', async () => setRes(await window.stm.memtest(cwd, q, 'local')))}>{busy === 'local' ? 'Asking…' : 'Ask the local model'}</button>
          </>
        )}
      </div>
      {res && (
        <div className="cmp-grid lab-pair">
          <figure className="lab-side">
            <figcaption>Without memory · {res.backedWithout}% backed by it</figcaption>
            <pre className="tr-text">{res.without}</pre>
          </figure>
          <figure className="lab-side">
            <figcaption>With memory · {res.backedWith}% backed by it</figcaption>
            <pre className="tr-text">{res.withMem}</pre>
          </figure>
        </div>
      )}
      {res && <div className="faint">The two answers are {res.agree}% alike (ROUGE-L). Backed means the share of the answer's words found in the memory, in order.</div>}
    </div>
  )
}
