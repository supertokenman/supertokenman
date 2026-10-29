import { useEffect, useMemo, useRef, useState } from 'react'
import { folderList, tilde } from '../shared/folderpick'
import { IconFolder, IconSearch } from './icons'

/**
 * Choosing a project folder inside the app: recent projects, git repositories found under the home
 * folder, a search box and the keyboard. "Browse with Finder..." falls back to the native dialog.
 * Files are still picked with the native dialog.
 */
type Ask = { title: string; resolve: (dir: string | null) => void }
let ask: ((a: Ask) => void) | null = null
const KEY = 'stm.recentFolders'

/** Opens the in-app picker; resolves with the folder or null. Falls back to the native dialog when no host is mounted. */
export function pickProjectFolder(title = 'Open a project folder'): Promise<string | null> {
  return new Promise((resolve) => (ask ? ask({ title, resolve }) : void window.stm.pickFolder().then(resolve)))
}

export const remembered = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}
const remember = (dir: string) => {
  try {
    localStorage.setItem(KEY, JSON.stringify([dir, ...remembered().filter((d) => d !== dir)].slice(0, 20)))
  } catch {
    /* a convenience only */
  }
}

/** Mount once; `recents` are the folders the app already knows were worked in, newest first. */
export function FolderPickerHost({ recents }: { recents: string[] }) {
  const [cur, setCur] = useState<Ask | null>(null)
  useEffect(() => {
    ask = setCur
    return () => {
      ask = null
    }
  }, [])
  if (!cur) return null
  const done = (dir: string | null) => {
    if (dir) remember(dir)
    setCur(null)
    cur.resolve(dir)
  }
  return <FolderPicker title={cur.title} recents={[...remembered(), ...recents]} onDone={done} />
}

function FolderPicker(props: { title: string; recents: string[]; onDone: (dir: string | null) => void }) {
  const [q, setQ] = useState('')
  const [found, setFound] = useState<{ home: string; repos: string[] } | null>(null)
  const [sel, setSel] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    void window.stm.findRepos().then(setFound, () => setFound({ home: '', repos: [] }))
  }, [])
  const items = useMemo(() => folderList(props.recents, found?.repos ?? [], q), [props.recents, found, q])
  const browseAt = items.length
  useEffect(() => {
    setSel(0)
  }, [q])
  useEffect(() => {
    list.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' })
  }, [sel])
  const browse = () => void window.stm.pickFolder().then((d) => d && props.onDone(d))
  const choose = (i: number) => (i === browseAt ? browse() : items[i] && props.onDone(items[i]!.path))
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return e.preventDefault(), props.onDone(null)
    if (e.key === 'ArrowDown') return e.preventDefault(), setSel((s) => Math.min(s + 1, browseAt))
    if (e.key === 'ArrowUp') return e.preventDefault(), setSel((s) => Math.max(s - 1, 0))
    if (e.key === 'Enter') return e.preventDefault(), choose(sel)
  }
  let last = ''
  return (
    <div className="overlay fp-overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onDone(null)}>
      <div className="palette fp" role="dialog" aria-label={props.title} onKeyDown={onKey}>
        <div className="fp-title">{props.title}</div>
        <div className="pal-input">
          <IconSearch />
          <input autoFocus placeholder="Search projects and repositories" value={q} onChange={(e) => setQ(e.target.value)} spellCheck={false} role="combobox" aria-expanded aria-controls="fp-list" />
        </div>
        <div className="pal-list" id="fp-list" ref={list} role="listbox">
          {items.map((f, i) => {
            const head = f.group !== last ? ((last = f.group), <div className="pal-group" key={`g-${f.group}`}>{f.group}</div>) : null
            return [
              head,
              <button key={f.path} role="option" aria-selected={i === sel} className={`pal-item${i === sel ? ' on' : ''}`} onMouseMove={() => setSel(i)} onClick={() => choose(i)}>
                <IconFolder />
                <span className="pal-label">{f.name}</span>
                <span className="pal-hint">{tilde(f.path, found?.home ?? '')}</span>
              </button>,
            ]
          })}
          {!found && <div className="pal-empty">Looking for git repositories in your home folder…</div>}
          {found && !items.length && <div className="pal-empty">{q ? `Nothing matches “${q}”.` : 'No recent projects or repositories found.'}</div>}
          <div className="fp-sep" />
          <button role="option" aria-selected={sel === browseAt} className={`pal-item fp-browse${sel === browseAt ? ' on' : ''}`} onMouseMove={() => setSel(browseAt)} onClick={browse}>
            <span className="pal-label">Browse with Finder...</span>
            <span className="pal-hint">any folder</span>
          </button>
        </div>
        <div className="fp-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd>Enter</kbd> open</span>
          <span><kbd>Esc</kbd> cancel</span>
          <span className="spacer-flex" />
          <span>Repositories under ~, ~/dev, ~/code, ~/projects, ~/Developer</span>
        </div>
      </div>
    </div>
  )
}
