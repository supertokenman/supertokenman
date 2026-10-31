import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { EmptyState } from '../EmptyState'
import { clean } from '../errors'
import { IconClose } from '../icons'
import '../bridge'
import { Checkbox, Switch, confirmDialog } from '../ui'
import type { Catalog, EvalResult, Installed, InstalledPack, PackEntry, RemovePlan, Scope } from './api'
import { gitHost, installLabel } from './logic'
import './packs.css'

const InstallReview = lazy(() => import('./PackReview').then((m) => ({ default: m.InstallReview })))
const UpdateReview = lazy(() => import('./PackReview').then((m) => ({ default: m.UpdateReview })))
const PackEvalSetup = lazy(() => import('./PackEval').then((m) => ({ default: m.PackEvalSetup })))
const PackEvalResult = lazy(() => import('./PackEval').then((m) => ({ default: m.PackEvalResult })))

type Tab = 'builtin' | 'mine' | 'shipped'
const TABS: { id: Tab; label: string }[] = [{ id: 'builtin', label: 'Built-in' }, { id: 'mine', label: 'Mine' }, { id: 'shipped', label: 'Shipped skills' }]
type Mode =
  | { k: 'detail' }
  | { k: 'install'; version: string; scope: Scope }
  | { k: 'update'; to: string; root: string }
  | { k: 'remove'; inst: InstalledPack; plan: RemovePlan; all: boolean }
  | { k: 'evalSetup' }
  | { k: 'eval'; evalId: string; initial?: EvalResult }

/** The eval running now, kept when the sheet closes so reopening it shows the same comparison. */
let running: { evalId: string; packId: string } | null = null

const EMPTY: Installed = { warnings: [], installs: [] }

/** Packs: skills, MCP servers and rules in one bundle you review before it is installed. Opened from the Catalog. */
export function Packs(props: { cwd: string; onClose: () => void }) {
  // the folder the sheet was opened for: the eval puts new panels in focus, and the sheet must not follow them
  const [root] = useState(props.cwd)
  props = { ...props, cwd: root }
  const [cat, setCat] = useState<Catalog | null>(null)
  const [inst, setInst] = useState<Installed>(EMPTY)
  const [tab, setTab] = useState<Tab>('builtin')
  const [pick, setPick] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>({ k: 'detail' })
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState('')
  const hasProject = props.cwd !== ''

  const load = useCallback(async () => {
    try {
      const c = await window.stm.packs.list()
      setCat(c)
      // without a panel, the global installs are read through the Claude folder
      setInst(await window.stm.packs.installed(hasProject ? props.cwd : c.claudeDir))
    } catch (e) {
      setErr(clean(e))
    }
  }, [props.cwd, hasProject])
  useEffect(() => void load(), [load])
  useEffect(() => {
    if (running) {
      setPick(running.packId)
      setMode({ k: 'eval', evalId: running.evalId })
    }
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.dialog-host [role="dialog"], .dlg')) return
      if (mode.k !== 'detail') setMode({ k: 'detail' })
      else props.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode.k, props])

  const rows = useMemo(() => (cat?.entries ?? []).filter((e) => e.origin === tab), [cat, tab])
  const entry = rows.find((e) => e.id === pick) ?? rows[0] ?? null
  const mine = inst.installs.filter((i) => i.packId === entry?.id)
  const back = () => {
    setMode({ k: 'detail' })
    void load()
  }
  const run = async (label: string, f: () => Promise<unknown>, done?: string) => {
    setBusy(label)
    setErr('')
    setNote('')
    try {
      await f()
      if (done) setNote(done)
      await load()
    } catch (e) {
      setErr(clean(e))
    } finally {
      setBusy('')
    }
  }
  const addFolder = () =>
    void run('folder', async () => {
      const dir = await window.stm.pickFolder()
      if (!dir) return
      const r = (await window.stm.packs.addFolder(dir)) as { ok: boolean; errors?: string[]; entry?: { id: string } }
      if (!r.ok) throw new Error((r.errors ?? ['That folder is not a pack.']).join('\n'))
      setTab('mine')
      setNote('Added to Mine. Nothing was installed.')
    })
  const host = gitHost(url)
  const fetchGit = () =>
    void run('git', async () => {
      const r = (await window.stm.packs.fetchGit(url.trim())) as { ok: boolean; errors?: string[] }
      if (!r.ok) throw new Error((r.errors ?? ['That repository is not a pack.']).join('\n'))
      setUrl('')
      setTab('mine')
      setNote('Fetched into Mine. Nothing was installed.')
    })

  const toggleMcp = async (i: InstalledPack, s: InstalledPack['servers'][number], on: boolean) => {
    if (on) {
      const ok = await confirmDialog({
        title: `Turn on ${s.name}?`,
        message: `It starts with every new panel in this project and runs:\n${s.line}\n\nIt can reach: ${s.hosts.length ? s.hosts.join(', ') : 'no declared host'}.${s.warning ? `\n${s.warning}` : ''}`,
        confirm: 'Turn on',
      })
      if (!ok) return
    }
    await run('mcp', () => window.stm.packs.setMcp(i.packId, i.root, s.name, on))
  }
  const rollback = async (i: InstalledPack) => {
    if (!(await confirmDialog({ title: `Roll back ${i.packId}?`, message: `Back to ${i.previous}. Files you edited are kept and you choose what happens to them.`, confirm: 'Roll back' }))) return
    await run('rollback', () => window.stm.packs.rollback(i.packId, i.root), `Rolled back to ${i.previous}.`)
  }
  const planRemove = (i: InstalledPack) =>
    void run('remove', async () => {
      const plan = await window.stm.packs.planRemove(i.packId, i.root)
      setMode({ k: 'remove', inst: i, plan, all: false })
    })
  const startEval = (evalId: string, opened: { with: Opened; without: Opened }, model: string) => {
    running = { evalId, packId: entry!.id }
    window.dispatchEvent(new CustomEvent('stm:adopt-panels', { detail: { model, panels: [opened.with, opened.without] } }))
    setMode({ k: 'eval', evalId })
  }
  const finishEval = async (what: 'keep' | 'remove' | 'discard') => {
    if (!running || !entry) return
    const evalId = running.evalId
    const proj = mine.find((i) => i.scope === 'project')
    if (what === 'remove' && proj) await window.stm.packs.remove(proj.packId, proj.root, true)
    const r = await window.stm.packs.evalDiscard(evalId)
    running = null
    if (r.panels.length) window.dispatchEvent(new CustomEvent('stm:close-panels', { detail: { sids: r.panels } }))
    await load()
    setNote(what === 'keep' ? (proj ? 'Kept. Both test copies are gone.' : 'Both test copies are gone. Review the pack to install it.') : what === 'remove' ? 'Removed from this project. Both test copies are gone.' : 'Both test copies are gone.')
    setMode(what === 'keep' && !proj ? { k: 'install', version: entry.version, scope: 'project' } : { k: 'detail' })
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe pk" role="dialog" aria-modal="true" aria-label="Packs">
        <header className="sheet-head">
          <h2 className="sheet-title">Packs</h2>
          <span className="faint">Skills, MCP servers and rules in one bundle. You review it before it is installed.</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="cf-body pk-body">
          <div className="cf-col pk-left">
            <div className="segmented small pk-tabs" role="tablist" aria-label="Pack sources">
              {TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label} {cat ? cat.entries.filter((e) => e.origin === t.id).length : ''}</button>
              ))}
            </div>
            {tab === 'mine' && (
              <div className="pk-add">
                <button className="small" disabled={!!busy} onClick={addFolder}>Add folder</button>
                <div className="ob-row">
                  <input className="ob-grow" aria-label="Git address" placeholder="https://github.com/owner/pack" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)} />
                  <button className="small" disabled={!host || !!busy} onClick={fetchGit}>{busy === 'git' ? 'Fetching…' : 'Fetch'}</button>
                </div>
                <div className="faint" role="status">{url.trim() ? (host ? `Fetch contacts ${host} and nothing else. Hooks and submodules stay off.` : 'Use a full https:// address with no name or password.') : 'Add from git contacts the git host only when you press Fetch.'}</div>
              </div>
            )}
            {!cat && !err && <div className="faint" role="status">Reading the catalog…</div>}
            {cat && !cat.writable && <div className="notice error" role="alert">{cat.warnings.join('\n') || 'The packs state file cannot be changed, so installs are off.'}</div>}
            <ul className="pk-rows">
              {rows.map((r) => {
                const l = installLabel(r, inst.installs)
                return (
                  <li key={r.id}>
                    <button className={`ob-turn pk-row ${r.id === pick ? 'on' : ''}`} aria-current={r.id === pick} onClick={() => (setPick(r.id), setMode({ k: 'detail' }), setNote(''))}>
                      <span className="ob-turn-top"><span>{r.name}</span><span className="faint mono">{r.valid ? r.version : 'invalid'}</span></span>
                      <span className="ob-turn-prompt faint">{r.valid ? r.description : r.errors[0]}</span>
                      <span className="pk-meta">
                        <span className={l.update ? 'pk-warn' : 'faint'}>{l.update ? `${l.text}. ${l.update} available` : l.text}</span>
                        {r.usesNetwork && <span className="pk-net">Uses network</span>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {cat && !rows.length && (
              <EmptyState title={tab === 'mine' ? 'No packs of your own yet' : 'Nothing here'} text={tab === 'mine' ? 'Add a folder that has a pack.json, or fetch a git repository that does.' : undefined} />
            )}
          </div>
          <div className="cf-col pk-right">
            {err && <div className="notice error" role="alert">{err}</div>}
            {note && <div className="notice" role="status">{note}</div>}
            {!entry ? (
              <div className="faint">Pick a pack to see what it brings.</div>
            ) : (
              <Suspense fallback={<div className="faint" role="status">Opening…</div>}>
                {mode.k === 'install' && (
                  <InstallReview entry={entry} version={mode.version} scope={mode.scope} root={mode.scope === 'global' ? (cat?.claudeDir ?? '') : props.cwd} hasProject={hasProject} onScope={(scope) => setMode({ ...mode, scope })} onCancel={back} onDone={() => (setNote('Installed.'), back())} />
                )}
                {mode.k === 'update' && <UpdateReview entry={entry} to={mode.to} root={mode.root} onCancel={back} onDone={() => (setNote(`Updated to ${mode.to}.`), back())} />}
                {mode.k === 'evalSetup' && <PackEvalSetup entry={entry} root={props.cwd} onCancel={back} onStarted={startEval} />}
                {mode.k === 'eval' && <PackEvalResult evalId={mode.evalId} entry={entry} installed={mine.some((i) => i.scope === 'project')} initial={mode.initial} onFinish={finishEval} />}
                {mode.k === 'remove' && (
                  <div className="pk-review">
                    <div className="ob-head"><div className="ob-prompt">Remove {entry.name} from {mode.inst.scope === 'global' ? 'every project' : 'this project'}</div></div>
                    <section className="pk-sec"><h3>Deleted</h3>{mode.plan.delete.length ? <ul className="pk-list mono">{mode.plan.delete.map((f) => <li key={f}>{f}</li>)}</ul> : <p className="faint">No files.</p>}</section>
                    {mode.plan.kept.length > 0 && (
                      <section className="pk-sec"><h3>Kept</h3>
                        <ul className="pk-list">{mode.plan.kept.map((k) => <li key={k.to}><span className="pk-grow mono">{k.to}</span><span className="faint">{k.reason === 'edited' ? 'you edited it' : k.reason === 'missing' ? 'already gone' : 'not a pack file'}</span></li>)}</ul>
                        {mode.plan.kept.some((k) => k.reason === 'edited') && <label className="check"><Checkbox checked={mode.all} onChange={(e) => setMode({ ...mode, all: e.target.checked })} /> Also delete the files I edited</label>}
                      </section>
                    )}
                    <p className="faint">{mode.plan.rules.action === 'remove' ? 'The rules block in CLAUDE.md is removed.' : mode.plan.rules.action === 'keep' ? 'The rules block in CLAUDE.md stays because you edited it.' : 'No rules block was added.'} Nothing outside the pack is touched.</p>
                    <div className="ob-row pk-actions">
                      <span className="pk-grow" />
                      <button className="ghost" onClick={back}>Cancel</button>
                      <button className="primary" disabled={!!busy} onClick={() => void run('remove', async () => (await window.stm.packs.remove(mode.inst.packId, mode.inst.root, !mode.all), setMode({ k: 'detail' })), 'Removed.')}>Remove pack</button>
                    </div>
                  </div>
                )}
                {mode.k === 'detail' && (
                  <Detail
                    entry={entry}
                    installs={mine}
                    hasProject={hasProject}
                    busy={!!busy}
                    onInstall={(scope) => setMode({ k: 'install', version: entry.version, scope: scope === 'project' && !hasProject ? 'global' : scope })}
                    onUpdate={(i) => setMode({ k: 'update', to: entry.version, root: i.root })}
                    onRollback={(i) => void rollback(i)}
                    onRemove={planRemove}
                    onMcp={(i, s, on) => void toggleMcp(i, s, on)}
                    onEval={() => setMode(running?.packId === entry.id ? { k: 'eval', evalId: running.evalId } : { k: 'evalSetup' })}
                  />
                )}
              </Suspense>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

type Opened = import('./PackEval').Opened

function Detail(props: {
  entry: PackEntry
  installs: InstalledPack[]
  hasProject: boolean
  busy: boolean
  onInstall: (scope: Scope) => void
  onUpdate: (i: InstalledPack) => void
  onRollback: (i: InstalledPack) => void
  onRemove: (i: InstalledPack) => void
  onMcp: (i: InstalledPack, s: InstalledPack['servers'][number], on: boolean) => void
  onEval: () => void
}) {
  const e = props.entry
  const proj = props.installs.find((i) => i.scope === 'project')
  const glob = props.installs.find((i) => i.scope === 'global')
  return (
    <div className="pk-detail">
      <div className="ob-head">
        <div className="ob-prompt">{e.name} <span className="faint mono">{e.version}</span></div>
        <div className="faint">{e.origin === 'builtin' ? 'Ships with the app' : e.origin === 'shipped' ? 'A skill that ships with the app' : e.source?.kind === 'git' ? `From ${new URL(e.source.url).hostname}, commit ${e.source.commit.slice(0, 7)}` : 'From a folder on this computer'}</div>
      </div>
      {!e.valid ? (
        <div className="notice error" role="alert">{e.errors.join('\n')}</div>
      ) : (
        <>
          <p>{e.description}</p>
          <p className={e.usesNetwork ? '' : 'faint'}>{e.usesNetwork ? <>Uses network: {e.hosts.join(', ')}. The hosts come from the manifest and are shown again before a server is turned on.</> : 'Makes no network requests.'}</p>
          <div className="ob-row">
            {!proj && <button className="primary" disabled={props.busy || !props.hasProject} onClick={() => props.onInstall('project')}>Review and install in this project</button>}
            {!glob && <button className="small" disabled={props.busy} onClick={() => props.onInstall('global')}>Review and install globally</button>}
            {!props.hasProject && <span className="faint">Open a panel to install into a project.</span>}
          </div>
          {[proj, glob].map((i) =>
            i ? (
              <section key={i.scope} className="pk-sec pk-inst" aria-label={`Installed ${i.scope === 'global' ? 'globally' : 'in this project'}`}>
                <h3>Installed {i.scope === 'global' ? 'globally' : 'in this project'}</h3>
                <p className="faint">Version {i.version}{i.previous ? `, previous ${i.previous}` : ', no previous version'}.</p>
                <div className="ob-row">
                  {newerThan(e.version, i.version) && <button className="primary small" disabled={props.busy} onClick={() => props.onUpdate(i)}>Review update to {e.version}</button>}
                  <button className="small" disabled={props.busy || !i.previous} onClick={() => props.onRollback(i)}>Roll back</button>
                  <button className="small" disabled={props.busy} onClick={() => props.onRemove(i)}>Remove</button>
                  {i.scope === 'project' && <button className="small" disabled={props.busy} onClick={props.onEval}>Eval</button>}
                </div>
                {i.servers.length > 0 && (
                  <ul className="pk-list">
                    {i.servers.map((s) => (
                      <li key={s.name} className="pk-stack">
                        <label className="pk-switch"><Switch checked={s.enabled} disabled={props.busy || i.scope === 'global'} onChange={(ev) => props.onMcp(i, s, ev.target.checked)} /><span><b>{s.name}</b> <span className="faint">{i.scope === 'global' ? 'Turn on per project' : 'On for this project'}</span></span></label>
                        <code className="pk-code">{s.line}</code>
                        {s.hosts.length > 0 && <span className="faint">Reaches {s.hosts.join(', ')}</span>}
                        {s.warning && <span className="pk-warn">{s.warning}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null,
          )}
          {!proj && props.hasProject && <div className="ob-row"><button className="small" disabled={props.busy} onClick={props.onEval}>Eval against this project</button><span className="faint">Runs a task with and without the pack.</span></div>}
        </>
      )}
    </div>
  )
}

const newerThan = (a: string, b: string) => installLabel({ id: 'x', version: a, versions: [], valid: true }, [{ packId: 'x', version: b, previous: null, scope: 'project' }]).update !== null
