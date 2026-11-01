import { useEffect, useMemo, useState } from 'react'
import { clean } from '../errors'
import '../bridge'
import { Select } from '../ui'
import type { PackEntry, ReviewOk, Scope, UpdateOk } from './api'
import { canAllow, lineDiff, openUpdate, toUpdateDecisions } from './logic'

type View = ReviewOk['view']

/** What the pack brings, as the person has to read it before allowing it: files, servers, hosts, vault names, rules. */
export function ManifestSections({ v, newHosts = [] }: { v: View; newHosts?: string[] }) {
  return (
    <>
      <section className="pk-sec" aria-labelledby="pk-files">
        <h3 id="pk-files">Files</h3>
        {v.files.length ? (
          <ul className="pk-list mono">
            {v.files.map((f) => (
              <li key={f.to}><span className="pk-grow">{f.to}</span><span className="faint">{f.kind}</span></li>
            ))}
          </ul>
        ) : (
          <p className="faint">No files.</p>
        )}
      </section>
      <section className="pk-sec" aria-labelledby="pk-mcp">
        <h3 id="pk-mcp">MCP servers</h3>
        {v.servers.length ? (
          <ul className="pk-list">
            {v.servers.map((s) => (
              <li key={s.name} className="pk-stack">
                <span><b>{s.name}</b> <span className="faint">{s.type}. Off until you turn it on for a project.</span></span>
                <code className="pk-code">{s.line}</code>
                {s.warning && <span className="pk-warn">{s.warning}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="faint">No servers.</p>
        )}
      </section>
      <section className="pk-sec" aria-labelledby="pk-hosts">
        <h3 id="pk-hosts">Network hosts</h3>
        {v.hosts.length ? (
          <ul className="pk-list mono">
            {v.hosts.map((h) => (
              <li key={h}><span className="pk-grow">{h}</span>{newHosts.includes(h) && <span className="pk-warn">new in this version</span>}</li>
            ))}
          </ul>
        ) : (
          <p className="faint">None. This pack makes no network requests.</p>
        )}
      </section>
      <section className="pk-sec" aria-labelledby="pk-env">
        <h3 id="pk-env">Credentials (vault names)</h3>
        {v.env.length ? (
          <ul className="pk-list">
            {v.env.map((e) => (
              <li key={e.name} className="pk-stack">
                <span><b className="mono">{e.name}</b> <span className="faint">{e.secret ? 'secret' : 'not secret'}</span></span>
                <span className="faint">{e.why}</span>
                <span className={e.inVault ? 'pk-ok' : 'pk-warn'}>{e.inVault ? 'In the vault' : 'Not in the vault yet. Add it in Connections before you turn the server on.'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="faint">None. Only the servers above that declare a name receive its value.</p>
        )}
      </section>
      <section className="pk-sec" aria-labelledby="pk-rules">
        <h3 id="pk-rules">Rules text</h3>
        {v.rules ? (
          <>
            <p className="faint">Added to CLAUDE.md between markers, word for word:</p>
            {v.rules.flags.map((f) => <p key={f} className="pk-warn">{f}</p>)}
            <pre className="pk-pre">{v.rules.text}</pre>
          </>
        ) : (
          <p className="faint">None.</p>
        )}
      </section>
      {v.notes.map((n) => <p key={n} className="pk-warn">{n}</p>)}
    </>
  )
}

const SCOPES: { id: Scope; label: string }[] = [{ id: 'project', label: 'This project' }, { id: 'global', label: 'Global' }]

/** Review before install: scope, the manifest, conflicts, and Allow or Cancel. */
export function InstallReview(props: { entry: PackEntry; version: string; scope: Scope; root: string; hasProject: boolean; onScope: (s: Scope) => void; onDone: () => void; onCancel: () => void }) {
  const [r, setR] = useState<Awaited<ReturnType<typeof window.stm.packs.review>> | null>(null)
  const [err, setErr] = useState('')
  const [dec, setDec] = useState<Record<string, 'skip' | 'overwrite'>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setR(null)
    setErr('')
    setDec({})
    window.stm.packs.review(props.entry.id, props.version, props.scope, props.root).then(setR, (e) => setErr(clean(e)))
  }, [props.entry.id, props.version, props.scope, props.root])
  const ok = r && r.ok ? r : null
  const allow = ok ? canAllow(ok.plan, dec) : { ok: false, why: '' }
  const go = () => {
    setBusy(true)
    window.stm.packs.install(props.entry.id, props.version, props.scope, props.root, dec).then(props.onDone, (e) => (setErr(clean(e)), setBusy(false)))
  }
  return (
    <div className="pk-review">
      <div className="ob-head">
        <div className="ob-prompt">Review {props.entry.name} {props.version}</div>
        <div className="faint">Nothing is written until you press Allow. No script from the pack runs at install.</div>
      </div>
      <div className="ob-row">
        <div className="segmented small" role="tablist" aria-label="Where to install">
          {SCOPES.map((s) => (
            <button key={s.id} role="tab" aria-selected={props.scope === s.id} disabled={s.id === 'project' && !props.hasProject} onClick={() => props.onScope(s.id)}>{s.label}</button>
          ))}
        </div>
        {!props.hasProject && <span className="faint">Open a panel to install into a project.</span>}
      </div>
      {err && <div className="notice error" role="alert">{err}</div>}
      {r && !r.ok && <div className="notice error" role="alert">{r.errors.join('\n')}</div>}
      {!r && !err && <div className="faint" role="status">Reading the pack…</div>}
      {ok && (
        <>
          <ManifestSections v={ok.view} />
          {ok.plan.errors.length > 0 && <div className="notice error" role="alert">{ok.plan.errors.join('\n')}</div>}
          {ok.plan.conflicts.length > 0 && (
            <section className="pk-sec" aria-labelledby="pk-conf">
              <h3 id="pk-conf">Files already there</h3>
              <ul className="pk-list">
                {ok.plan.conflicts.map((c) => (
                  <li key={c.to} className="pk-conflict">
                    <span className="pk-grow mono">{c.to}</span>
                    <span className="faint">{c.reason === 'exists' ? 'exists and is not from this pack' : c.reason === 'symlink' ? 'is a link' : 'is not a file'}</span>
                    <Select aria-label={`What to do with ${c.to}`} value={dec[c.to] ?? ''} onChange={(e) => setDec({ ...dec, [c.to]: e.target.value as 'skip' | 'overwrite' })}>
                      <option value="">Choose…</option>
                      <option value="skip">Skip it</option>
                      {c.overwritable && <option value="overwrite">Overwrite (keeps a .stm-backup copy)</option>}
                    </Select>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <div className="ob-row pk-actions">
        <span className="pk-grow faint" role="status">{ok && !allow.ok ? allow.why : ''}</span>
        <button className="ghost" onClick={props.onCancel}>Cancel</button>
        <button className="primary" disabled={!allow.ok || busy} onClick={go}>{busy ? 'Installing…' : 'Allow and install'}</button>
      </div>
    </div>
  )
}

const ACTION: Record<string, string> = { keep: 'Unchanged', update: 'Updated', add: 'Added', remove: 'Removed', conflict: 'You edited it', ask: 'You deleted it' }

function Diff({ mine, theirs }: { mine: string; theirs: string }) {
  const lines = useMemo(() => lineDiff(mine, theirs), [mine, theirs])
  return (
    <pre className="pk-diff" aria-label="Your file against the new one">
      {lines.map((l, i) => (
        <span key={i} className={`pk-d-${l.kind}`}>{l.kind === 'add' ? '+ ' : l.kind === 'del' ? '- ' : '  '}{l.text}{'\n'}</span>
      ))}
    </pre>
  )
}

/** Review before an update: what changes per file, new hosts, and the three-way conflicts with a diff. */
export function UpdateReview(props: { entry: PackEntry; to: string; root: string; onDone: () => void; onCancel: () => void }) {
  const [r, setR] = useState<Awaited<ReturnType<typeof window.stm.packs.planUpdate>> | null>(null)
  const [err, setErr] = useState('')
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    window.stm.packs.planUpdate(props.entry.id, props.to, props.root).then(setR, (e) => setErr(clean(e)))
  }, [props.entry.id, props.to, props.root])
  const ok: UpdateOk | null = r && r.ok ? r : null
  const open = ok ? openUpdate(ok, picks) : []
  const go = () => {
    if (!ok) return
    setBusy(true)
    window.stm.packs.update(props.entry.id, props.to, props.root, toUpdateDecisions(picks, ok.asks)).then(props.onDone, (e) => (setErr(clean(e)), setBusy(false)))
  }
  return (
    <div className="pk-review">
      <div className="ob-head">
        <div className="ob-prompt">{ok ? `Update ${props.entry.name} from ${ok.from} to ${ok.to}` : `Update ${props.entry.name}`}</div>
        <div className="faint">Files you did not edit are updated. Files you edited are never overwritten without your choice.</div>
      </div>
      {err && <div className="notice error" role="alert">{err}</div>}
      {r && !r.ok && <div className="notice error" role="alert">{r.errors.join('\n')}</div>}
      {!r && !err && <div className="faint" role="status">Comparing the versions…</div>}
      {ok && (
        <>
          {ok.newHosts.length > 0 && <div className="notice pk-newhosts" role="alert">This version reaches {ok.newHosts.length === 1 ? 'a new host' : 'new hosts'}: {ok.newHosts.join(', ')}. Its servers stay off until you turn them on again.</div>}
          <section className="pk-sec" aria-labelledby="pk-chg">
            <h3 id="pk-chg">Changes</h3>
            <ul className="pk-list">
              {ok.items.map((i) => (
                <li key={i.path}><span className="pk-grow mono">{i.path === '@rules' ? 'CLAUDE.md rules block' : i.path}</span><span className={i.action === 'conflict' || i.action === 'ask' ? 'pk-warn' : 'faint'}>{ACTION[i.action] ?? i.action}</span></li>
              ))}
            </ul>
          </section>
          {ok.conflicts.map((c) => (
            <section key={c.path} className="pk-sec" aria-label={`Conflict in ${c.path}`}>
              <h3 className="pk-path">{c.path === '@rules' ? 'CLAUDE.md rules block' : c.path}</h3>
              <p className="faint">You and the pack both changed this file.</p>
              <Diff mine={c.mine} theirs={c.theirs} />
              <div className="ob-row" role="radiogroup" aria-label={`Choice for ${c.path}`}>
                {([['mine', 'Keep mine'], ['theirs', 'Take theirs'], ['beside', 'Save theirs beside']] as const).map(([k, label]) => (
                  <button key={k} role="radio" aria-checked={picks[c.path] === k} className={`pk-choice ${picks[c.path] === k ? 'on' : ''}`} onClick={() => setPicks({ ...picks, [c.path]: k })}>{label}</button>
                ))}
              </div>
              <p className="faint">{picks[c.path] === 'theirs' ? 'Your version is saved as a .stm-mine copy.' : picks[c.path] === 'beside' ? 'The new version is written next to yours as a .pack-new file.' : ''}</p>
            </section>
          ))}
          {ok.asks.map((p) => (
            <section key={p} className="pk-sec" aria-label={`Deleted file ${p}`}>
              <h3 className="pk-path">{p === '@rules' ? 'CLAUDE.md rules block' : p}</h3>
              <p className="faint">You deleted this file. It is not put back unless you ask. A later update asks again.</p>
              <div className="ob-row" role="radiogroup" aria-label={`Choice for ${p}`}>
                {([['leave', 'Leave it deleted'], ['recreate', 'Put it back']] as const).map(([k, label]) => (
                  <button key={k} role="radio" aria-checked={picks[p] === k} className={`pk-choice ${picks[p] === k ? 'on' : ''}`} onClick={() => setPicks({ ...picks, [p]: k })}>{label}</button>
                ))}
              </div>
            </section>
          ))}
          <ManifestSections v={ok.manifest} newHosts={ok.newHosts} />
        </>
      )}
      <div className="ob-row pk-actions">
        <span className="pk-grow faint" role="status">{open.length ? `Choose what to do with ${open[0]}.` : ''}</span>
        <button className="ghost" onClick={props.onCancel}>Cancel</button>
        <button className="primary" disabled={!ok || open.length > 0 || busy} onClick={go}>{busy ? 'Updating…' : 'Allow and update'}</button>
      </div>
    </div>
  )
}
