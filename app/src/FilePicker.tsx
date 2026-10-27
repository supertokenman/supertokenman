import { useEffect, useMemo, useRef, useState } from 'react'
import type { Attachment } from '../shared/attach'
import { MAX_ATTACHMENTS } from '../shared/attach'
import { tilde } from '../shared/folderpick'
import { fuzzyRank } from '../shared/fuzzy'
import type { PickEntry, PickError } from '../electron/filepick'
import { IconFolder, IconSearch } from './icons'
import { Checkbox } from './ui'

/**
 * Choosing files inside the app, on the folder picker's frame: the panel's project (its .gitignore
 * respected), recent files and folder browsing, with a fuzzy search and the keyboard. The main
 * process reads the disk; "Use Finder..." falls back to the native dialog.
 */
export type PickOptions = {
  title?: string
  /** The panel's folder, for "This project" and as the place browsing starts. */
  cwd?: string
  /** Lowercase extensions without the dot; files of other kinds are not shown. */
  accept?: string[]
  multiple?: boolean
  /** Folders can be chosen as well as opened. */
  folders?: boolean
  action?: string
}
type Result = string[] | 'finder' | null
type Ask = PickOptions & { resolve: (r: Result) => void }
let ask: ((a: Ask) => void) | null = null
const KEY = 'stm.recentFiles'

/** Opens the in-app picker: the chosen paths, 'finder' when the person asked for the native dialog, or null. */
export function pickPaths(opts: PickOptions): Promise<Result> {
  return new Promise((resolve) => (ask ? ask({ ...opts, resolve }) : resolve('finder')))
}

/** For a main-process call that opens files: the in-app choice, undefined for Finder ("Use Finder..."), [] when cancelled. */
export async function chooseFiles(opts: PickOptions): Promise<string[] | undefined> {
  const r = await pickPaths(opts)
  return r === 'finder' ? undefined : r ?? []
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', csv: 'text/csv', json: 'application/json', html: 'text/html', md: 'text/markdown' }

/**
 * One file for the window to read (in place of <input type="file">): chosen in the in-app picker and
 * read by the main process. "Use Finder..." falls back to the system chooser. null when cancelled.
 */
export async function pickFile(opts: PickOptions): Promise<File | null> {
  const r = await pickPaths({ ...opts, multiple: false })
  if (r === 'finder' || !window.stm.readPicked) {
    // the person asked for the system's chooser: the one place it is used
    return new Promise((resolve) => {
      const i = document.createElement('input')
      i.type = 'file'
      if (opts.accept) i.accept = opts.accept.map((e) => `.${e}`).join(',')
      i.onchange = () => resolve(i.files?.[0] ?? null)
      i.oncancel = () => resolve(null)
      i.click()
    })
  }
  if (!r?.[0]) return null
  const f = await window.stm.readPicked(r[0])
  const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0))
  const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
  return new File([bytes], f.name, { type: MIME[ext] ?? 'text/plain' })
}

/** The composer's attach button: files and folders, as attachments. */
export async function pickAttachments(cwd?: string): Promise<Attachment[]> {
  const r = await pickPaths({ title: 'Attach files', cwd, multiple: true, folders: true, action: 'Attach' })
  if (r === 'finder') return window.stm.pickFiles()
  return r?.length ? window.stm.attachPaths(r) : []
}

const remembered = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}
const remember = (paths: string[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify([...paths, ...remembered().filter((p) => !paths.includes(p))].slice(0, 30)))
  } catch {
    /* a convenience only */
  }
}

/** Mount once, next to FolderPickerHost. */
export function FilePickerHost() {
  const [cur, setCur] = useState<Ask | null>(null)
  useEffect(() => {
    ask = setCur
    return () => {
      ask = null
    }
  }, [])
  if (!cur) return null
  const done = (r: Result) => {
    if (Array.isArray(r) && r.length) remember(r)
    setCur(null)
    cur.resolve(r)
  }
  return <FilePicker opts={cur} onDone={done} />
}

type Source = 'project' | 'recent' | 'browse'
type Loaded = { entries: PickEntry[]; truncated?: boolean; error?: PickError; denied?: string[] }
const IMAGE = /\.(png|jpe?g|gif|webp|heic|bmp|tiff?|svg)$/i
const CODE = /\.(tsx?|jsx?|mjs|cjs|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|cs|php|sh|zsh|css|scss|html?|json|ya?ml|toml|sql|lua|ex|exs)$/i
const DOC = /\.(md|markdown|txt|pdf|docx?|rtf|pages|csv|xlsx?|key|pptx?|epub)$/i
const ext = (n: string) => (n.includes('.') ? n.split('.').pop()!.toLowerCase() : '')

export const sizeLabel = (b: number) => (b < 1024 ? `${b} B` : b < 1024 ** 2 ? `${(b / 1024).toFixed(b < 10240 ? 1 : 0)} KB` : b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${(b / 1024 ** 3).toFixed(1)} GB`)
const dateLabel = (ms: number) => {
  const d = new Date(ms)
  const now = new Date()
  return d.toDateString() === now.toDateString() ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
}

function KindIcon({ e }: { e: PickEntry }) {
  if (e.dir) return <IconFolder />
  const path = IMAGE.test(e.name) ? 'M3 3h10v10H3zM3 11l3-3 2 2 2-3 3 4' : CODE.test(e.name) ? 'M6 5L3 8l3 3M10 5l3 3-3 3' : DOC.test(e.name) ? 'M4 2h5l3 3v9H4zM6 8h4M6 11h4' : 'M4 2h5l3 3v9H4zM9 2v3h3'
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}

function FilePicker({ opts, onDone }: { opts: Ask; onDone: (r: Result) => void }) {
  const [source, setSource] = useState<Source>(opts.cwd ? 'project' : 'recent')
  const [dir, setDir] = useState(opts.cwd ?? '')
  const [home, setHome] = useState('')
  const [hidden, setHidden] = useState(false)
  const [q, setQ] = useState('')
  const [data, setData] = useState<Loaded | null>(null)
  const [sel, setSel] = useState(0)
  const [picked, setPicked] = useState<string[]>([])
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({})
  const list = useRef<HTMLDivElement>(null)
  const multiple = opts.multiple ?? false
  const action = opts.action ?? 'Choose'

  useEffect(() => {
    let live = true
    setData(null)
    const fp = window.stm.filePick
    const job: Promise<Loaded> =
      source === 'project' && opts.cwd
        ? fp.project(opts.cwd, hidden).then((l) => (l.ok ? l : { entries: [], error: l.error }))
        : source === 'recent'
          ? fp.recent(remembered(), hidden).then((r) => (setHome(r.home), r))
          : fp.list(dir || home || '/', hidden).then((l) => (l.ok ? l : { entries: [], error: l.error }))
    void job.then((d) => live && setData(d), () => live && setData({ entries: [], error: 'denied' }))
    return () => {
      live = false
    }
  }, [source, dir, hidden, opts.cwd])
  useEffect(() => {
    if (!home) void window.stm.filePick.recent([], false).then((r) => setHome(r.home), () => undefined)
  }, [])

  const shown = useMemo(() => {
    const ok = (e: PickEntry) => (e.dir ? source === 'browse' || !!opts.folders : !opts.accept || opts.accept.includes(ext(e.name)))
    const rel = (e: PickEntry) => (source === 'project' ? e.name : e.path)
    const base = (e: PickEntry) => e.name.split('/').pop() ?? e.name
    return fuzzyRank((data?.entries ?? []).filter(ok), q, base, rel, 300)
  }, [data, q, source, opts.accept, opts.folders])
  const cur = shown[sel]
  useEffect(() => setSel(0), [q, data])
  useEffect(() => {
    list.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' })
  }, [sel])
  // thumbnails for the images in view, read by the main process from the local disk
  useEffect(() => {
    const want = shown.slice(Math.max(0, sel - 10), sel + 30).filter((e) => !e.dir && IMAGE.test(e.name) && !(e.path in thumbs)).slice(0, 12)
    if (!want.length) return
    setThumbs((t) => ({ ...t, ...Object.fromEntries(want.map((e) => [e.path, null])) }))
    void Promise.all(want.map((e) => window.stm.filePick.thumb(e.path).then((u) => [e.path, u] as const, () => [e.path, null] as const))).then((r) => setThumbs((t) => ({ ...t, ...Object.fromEntries(r) })))
  }, [shown, sel])

  const choosable = (e: PickEntry) => !e.dir || !!opts.folders
  const open = (e: PickEntry) => (setSource('browse'), setDir(e.path), setQ(''))
  const up = () => {
    const parent = dir.replace(/\/[^/]+$/, '') || '/'
    if (parent !== dir) setDir(parent)
  }
  const toggle = (e: PickEntry) => {
    if (!choosable(e)) return
    if (!multiple) return setPicked([e.path])
    setPicked((p) => (p.includes(e.path) ? p.filter((x) => x !== e.path) : [...p, e.path].slice(0, MAX_ATTACHMENTS)))
  }
  const commit = (e?: PickEntry) => {
    if (picked.length) return onDone(picked)
    if (!e) return
    if (e.dir) return open(e)
    onDone([e.path])
  }
  const finder = () => onDone('finder')
  const sources: [Source, string][] = [...(opts.cwd ? ([['project', 'This project']] as [Source, string][]) : []), ['recent', 'Recent'], ['browse', 'Browse']]
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return e.preventDefault(), onDone(null)
    if (e.key === 'ArrowDown') return e.preventDefault(), setSel((s) => Math.min(s + 1, shown.length - 1))
    if (e.key === 'ArrowUp') return e.preventDefault(), setSel((s) => Math.max(s - 1, 0))
    if (e.key === 'Enter') return e.preventDefault(), commit(cur)
    if (e.key === ' ' && cur) return e.preventDefault(), toggle(cur)
    if (e.key === 'Tab') {
      e.preventDefault()
      const i = sources.findIndex(([s]) => s === source)
      return setSource(sources[(i + (e.shiftKey ? sources.length - 1 : 1)) % sources.length]![0]), setQ('')
    }
    if (e.key === 'ArrowRight' && cur?.dir && !q) return e.preventDefault(), open(cur)
    if (e.key === 'ArrowRight' && cur && !cur.dir && source !== 'browse' && !q) return e.preventDefault(), (setSource('browse'), setDir(cur.path.replace(/\/[^/]+$/, '') || '/'))
    if ((e.key === 'ArrowLeft' || e.key === 'Backspace') && source === 'browse' && !q) return e.preventDefault(), up()
  }

  const crumbs = useMemo(() => {
    const base = home && (dir === home || dir.startsWith(home + '/')) ? home : '/'
    const parts = dir.slice(base.length).split('/').filter(Boolean)
    const at = (i: number) => (base === '/' ? '' : base) + '/' + parts.slice(0, i + 1).join('/')
    return [{ name: base === home ? '~' : '/', path: base }, ...parts.map((name, i) => ({ name, path: at(i) }))]
  }, [dir, home])
  const where = (e: PickEntry) => (source === 'project' ? e.name.replace(/\/?[^/]+$/, '') : source === 'recent' ? tilde(e.path.replace(/\/[^/]+$/, ''), home) : '')
  const label = (e: PickEntry) => e.name.split('/').pop() ?? e.name
  const deniedHint = 'macOS may need your permission for this folder (System Settings, Privacy & Security, Files and Folders), or use Finder.'

  return (
    <div className="overlay fp-overlay" onMouseDown={(e) => e.target === e.currentTarget && onDone(null)}>
      <div className="palette fp fip" role="dialog" aria-label={opts.title ?? 'Choose files'} onKeyDown={onKey}>
        <div className="fip-head">
          <div className="fp-title">{opts.title ?? 'Choose files'}</div>
          <div className="fip-tabs" role="tablist">
            {sources.map(([s, name]) => (
              <button key={s} role="tab" aria-selected={source === s} className={source === s ? 'on' : ''} onClick={() => (setSource(s), setQ(''), s === 'browse' && !dir && setDir(home))}>
                {name}
              </button>
            ))}
          </div>
        </div>
        <div className="pal-input">
          <IconSearch />
          <input autoFocus placeholder={source === 'project' ? 'Search this project' : source === 'recent' ? 'Search recent files' : 'Filter this folder'} value={q} onChange={(e) => setQ(e.target.value.replace(/ /g, ''))} spellCheck={false} role="combobox" aria-expanded aria-controls="fip-list" />
        </div>
        {source === 'browse' && (
          <div className="fip-crumbs">
            {crumbs.map((c, i) => (
              <button key={c.path} className={i === crumbs.length - 1 ? 'on' : ''} onClick={() => setDir(c.path)}>
                {c.name}
              </button>
            ))}
          </div>
        )}
        <div className="pal-list fip-list" id="fip-list" ref={list} role="listbox" aria-multiselectable={multiple}>
          {shown.map((e, i) => {
            const on = picked.includes(e.path)
            const t = thumbs[e.path]
            return (
              <button key={e.path} role="option" aria-selected={i === sel} className={`pal-item fip-item${i === sel ? ' on' : ''}${on ? ' picked' : ''}`} onMouseMove={() => setSel(i)} onClick={(ev) => ((ev.metaKey || ev.shiftKey || (multiple && picked.length && !e.dir)) ? toggle(e) : commit(e))}>
                {multiple && <span className={`fip-check${on ? ' on' : ''}`} aria-hidden="true" onClick={(ev) => (ev.stopPropagation(), toggle(e))} />}
                <span className="fip-icon">{t ? <img src={t} alt="" /> : <KindIcon e={e} />}</span>
                <span className="pal-label">{label(e)}{e.dir && source === 'browse' && '/'}</span>
                {where(e) && <span className="pal-hint">{where(e)}</span>}
                <span className="fip-meta">{e.dir ? '' : sizeLabel(e.size)}</span>
                <span className="fip-meta fip-date">{dateLabel(e.mtime)}</span>
              </button>
            )
          })}
          {!data && <div className="pal-empty">{source === 'project' ? 'Reading the project…' : 'Reading the folder…'}</div>}
          {data?.error === 'denied' && (
            <div className="pal-empty fip-error">
              This folder could not be read. {deniedHint}
              <button className="ghost small" onClick={finder}>Use Finder...</button>
            </div>
          )}
          {data?.error === 'missing' && <div className="pal-empty fip-error">This folder no longer exists.</div>}
          {data && !data.error && !shown.length && <div className="pal-empty">{q ? `Nothing matches “${q}”.` : source === 'browse' ? 'This folder is empty.' : source === 'project' ? 'No files in this project.' : 'No recent files.'}</div>}
          {data?.truncated && <div className="pal-empty">Showing the first {data.entries.length} files. Type to narrow, or browse a folder.</div>}
          {source === 'recent' && !!data?.denied?.length && <div className="pal-empty fip-error">Could not read {data.denied.map((d) => tilde(d, home)).join(', ')}. {deniedHint}</div>}
        </div>
        <div className="fp-foot">
          <span><kbd>Enter</kbd> {picked.length ? `${action.toLowerCase()} ${picked.length}` : action.toLowerCase()}</span>
          {multiple && <span><kbd>Space</kbd> select</span>}
          <span><kbd>Tab</kbd> source</span>
          {source === 'browse' && <span><kbd>←</kbd><kbd>→</kbd> folders</span>}
          <span><kbd>Esc</kbd> cancel</span>
          <span className="spacer-flex" />
          <label className="fip-hidden">
            <Checkbox checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Hidden files
          </label>
          <button className="ghost small" onClick={finder}>Use Finder...</button>
          {picked.length > 0 && <button className="primary small" onClick={() => onDone(picked)}>{action} {picked.length}</button>}
        </div>
      </div>
    </div>
  )
}
