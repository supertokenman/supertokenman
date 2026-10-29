import { useEffect, useState } from 'react'
import type { Team } from '../shared/teambundle'
import { pickProjectFolder } from './FolderPicker'
import { IconClose } from './icons'

/** A team bundle read from a file: what it would create, listed before anything is made. */
export function TeamImport(props: { team: Team; lines: string[]; onClose: () => void; onCreate: (base: string) => Promise<string> }) {
  const [dir, setDir] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.onClose])
  const create = async () => {
    if (!dir) return
    setBusy(true)
    try {
      setMsg(await props.onCreate(dir))
    } catch (e) {
      setMsg((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet ports" role="dialog" aria-label="Import team">
        <header className="sheet-head">
          <div className="sheet-title">Import team: {props.team.name}</div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="sheet-body">
          {props.team.description && <p className="faint">{props.team.description}</p>}
          <p className="faint">Create makes these. Folders are made under the one you pick. Triggers come in turned off.</p>
          <ul>{props.lines.map((l) => <li key={l}>{l}</li>)}</ul>
          <p>
            <button className="ghost small" onClick={() => void pickProjectFolder('Folder for the team').then((d) => d && setDir(d))}>{dir ? 'Change folder' : 'Pick a folder'}</button> <span className="faint">{dir ?? 'No folder yet'}</span>
          </p>
          {msg && <p>{msg}</p>}
          <button className="primary" disabled={!dir || busy} onClick={() => void create()}>Create</button>{' '}
          <button className="ghost" onClick={props.onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
