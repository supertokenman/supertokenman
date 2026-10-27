import { useEffect, useMemo, useRef, useState } from 'react'
import { StateMark } from './StateMark'
import { friendly } from './errors'
import { Markdown } from './markdown'
import type { CatalogItem } from './bridge'
import { IconPluginKind, IconSkillKind, IconServerKind, IconRepoKind } from './icons'

type Filter = 'all' | CatalogItem['source']
const LABEL: Record<CatalogItem['source'], string> = { plugin: 'Plugin', skill: 'Skill', mcp: 'MCP server', github: 'Repository' }
const KIND_ICON: Record<CatalogItem['source'], () => JSX.Element> = { plugin: IconPluginKind, skill: IconSkillKind, mcp: IconServerKind, github: IconRepoKind }
const PLURAL: Record<CatalogItem['source'], string> = { plugin: 'Plugins', skill: 'Skills', mcp: 'MCP servers', github: 'Repositories' }

/** Local ranking for instant results: every word must appear, name hits first. */
function rankLocal(items: CatalogItem[], q: string) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return items
  return items
    .map((it) => {
      const name = it.name.toLowerCase()
      const hay = `${name} ${it.description.toLowerCase()} ${it.where.toLowerCase()}`
      if (!words.every((w) => hay.includes(w))) return null
      return { it, score: words.reduce((n, w) => n + (name === w ? 100 : name.startsWith(w) ? 40 : name.includes(w) ? 25 : 5), it.installed ? 3 : 0) }
    })
    .filter((x): x is { it: CatalogItem; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.it)
}

/** Plugins, skills, MCP servers and repositories in one live search. */
export function Catalog(props: { cwd: string; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [local, setLocal] = useState<CatalogItem[] | null>(null)
  const [remote, setRemote] = useState<{ q: string; items: CatalogItem[]; errors: string[] } | null>(null)
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  // before anything is typed, a first page of MCP servers and repositories, so every tab has results and a count
  const [browse, setBrowse] = useState<{ items: CatalogItem[]; errors: string[] } | null>(null)
  const [open, setOpen] = useState<{ it: CatalogItem; readme?: string; err?: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    void window.stm.catalogLocal(props.cwd).then(setLocal)
    void window.stm.catalogSearch('mcp').then(setBrowse).catch(() => setBrowse(null))
  }, [props.cwd])
  const show = (it: CatalogItem) => {
    if (!it.url) return
    if (!/^https:\/\/github\.com\//.test(it.url)) return void window.stm.setupOpen(it.url)
    setOpen({ it })
    window.stm.catalogReadme(it.url).then((r) => setOpen((o) => (o?.it === it ? { it, readme: r?.markdown ?? '' } : o)), (e: unknown) => setOpen((o) => (o?.it === it ? { it, err: e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e) } : o)))
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (open ? setOpen(null) : props.onClose())
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props, open])

  // the network sources wait for a pause in typing
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setRemote(null)
      return
    }
    setSearching(true)
    const t = setTimeout(() => {
      void window.stm
        .catalogSearch(term)
        .then((r) => setRemote({ q: term, ...r }))
        .finally(() => setSearching(false))
    }, 350)
    return () => clearTimeout(t)
  }, [q])

  const all = useMemo(() => {
    const term = q.trim()
    const found = term.length < 2 ? (browse?.items ?? []) : remote && remote.q === term ? remote.items : []
    const items = [...rankLocal(local ?? [], q), ...found]
    return filter === 'all' ? items : items.filter((i) => i.source === filter)
  }, [local, remote, browse, q, filter])
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    const term = q.trim()
    const found = term.length < 2 ? (browse?.items ?? []) : remote && remote.q === term ? remote.items : []
    for (const i of [...rankLocal(local ?? [], q), ...found]) c[i.source] = (c[i.source] ?? 0) + 1
    return c
  }, [local, remote, browse, q])

  const act = async (it: CatalogItem, label: string, fn: () => Promise<void>, done: string) => {
    setBusy({ ...busy, [it.id]: label })
    setNotice('')
    try {
      await fn()
      setNotice(done)
      setLocal(await window.stm.catalogLocal(props.cwd, true))
    } catch (e) {
      setNotice(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
    } finally {
      setBusy((b) => {
        const { [it.id]: _gone, ...rest } = b
        return rest
      })
    }
  }

  const actionsFor = (it: CatalogItem) => (
    <>
                {busy[it.id] ? (
                  <span className="busy-label"><span className="spinner" /> {busy[it.id]}</span>
                ) : it.source === 'plugin' ? (
                  it.installed ? (
                    <button className="ghost small" onClick={() => void act(it, 'Removing', () => window.stm.uninstallPlugin(it.id), `${it.name} removed. New panels start without it.`)}>Uninstall</button>
                  ) : (
                    <button className="primary small" onClick={() => void act(it, 'Installing', () => window.stm.installPlugin(it.id), `${it.name} installed. New panels load it.`)}>Install</button>
                  )
                ) : it.source === 'skill' ? (
                  <StateMark state="up" size="md" label="Installed" />
                ) : it.source === 'mcp' ? (
                  it.mcp?.remote || it.mcp?.npm ? (
                    <button className="small" onClick={() => void act(it, 'Adding', () => window.stm.addMcp({ id: it.name, name: it.name, remote: it.mcp?.remote, npm: it.mcp?.npm }), `${it.name} added. New panels connect to it.`)}>Add</button>
                  ) : (
                    <span className="faint">No package listed</span>
                  )
                ) : (
                  <button className="small" data-tip="Add it as a plugin marketplace (it needs a .claude-plugin/marketplace.json)" onClick={() => void act(it, 'Adding', () => window.stm.addMarketplace(it.id), `${it.id} added as a marketplace. Its plugins now show up here.`)}>Add marketplace</button>
                )}
    </>
  )

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet catalog" role="dialog" aria-label="Catalog">
        <div className="search">
          <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" fill="none" /><path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search plugins, skills, MCP servers and repositories" spellCheck={false} />
          {searching && <span className="spinner" />}
          <kbd>Esc</kbd>
        </div>
        <div className="filters">
          {(['all', 'plugin', 'skill', 'mcp', 'github'] as const).map((f) => (
            <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
              {f !== 'all' && (() => { const I = KIND_ICON[f]; return <I /> })()}
              {f === 'all' ? 'All' : PLURAL[f]}
              {f !== 'all' && counts[f] ? <span className="chip-count">{counts[f]}</span> : null}
            </button>
          ))}
          {notice && <span className="catalog-notice">{notice}</span>}
        </div>
        {open ? (
          <div className="results detail">
            <div className="detail-head">
              <button className="ghost small" onClick={() => setOpen(null)}>Back</button>
              <span className={`src ${open.it.source}`}>{LABEL[open.it.source]}</span>
              <span className="result-name">{open.it.name}</span>
              <span className="faint">{open.it.where}</span>
              {open.it.stars != null && <span className="faint">{open.it.stars >= 1000 ? `${(open.it.stars / 1000).toFixed(1)}k` : open.it.stars} stars</span>}
              <span className="spacer-flex" />
              <div className="result-actions">{busy[open.it.id] ? <span className="busy-label"><span className="spinner" /> {busy[open.it.id]}</span> : actionsFor(open.it)}</div>
            </div>
            {open.it.pick && <div className="result-why">{open.it.pick.why}</div>}
            {open.err ? <div className="notice error">{open.err}</div> : open.readme === undefined ? <div className="faint pad">Reading the README...</div> : open.readme ? <div className="readme"><Markdown text={open.readme} /></div> : <div className="faint pad">No README.</div>}
          </div>
        ) : (
        <div className="results">
          {local === null && <div className="faint pad">Reading your marketplaces...</div>}
          {local !== null && all.length === 0 && <div className="faint pad">{q.trim().length < 2 ? 'Type to search the MCP registry and GitHub too.' : searching ? 'Searching...' : 'Nothing matches.'}</div>}
          {all.slice(0, 120).map((it) => (
            <div key={`${it.source}:${it.id}`} className="result">
              <span className={`src ${it.source}`}>{LABEL[it.source]}</span>
              <div className="result-main">
                <div className="result-top">
                  <span className="result-name">{it.name}</span>
                  <span className="faint">{it.where}</span>
                  {it.stars != null && <span className="faint">{it.stars >= 1000 ? `${(it.stars / 1000).toFixed(1)}k` : it.stars} stars</span>}
                  {it.mcp?.needsAuth && <span className="pill">needs sign-in</span>}
                  {it.pick && <span className="pill pick">Recommended</span>}
                  {it.pick && <span className="faint">{it.pick.license}</span>}
                </div>
                {it.description && <div className="result-desc">{it.description}</div>}
                {it.pick && <div className="result-why">{it.pick.why}</div>}
              </div>
              <div className="result-actions">
                {actionsFor(it)}
                {it.url && <button className="ghost small" onClick={() => show(it)}>Open</button>}
              </div>
            </div>
          ))}
          {remote?.errors.map((e) => (
            <div key={e} className="notice error">{friendly(e)}</div>
          ))}
        </div>
        )}
      </div>
    </div>
  )
}
