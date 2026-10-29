import { useEffect, useState } from 'react'
import { PROJECT_TEMPLATES } from '../shared/projecttemplates'
import { pickProjectFolder } from './FolderPicker'
import { IconClose } from './icons'
import { Checkbox, Radio } from './ui'

/** New project from a template: pick one and a folder, see which files exist, keep or replace each, write. */
export function NewFromTemplate(props: { onClose: () => void; onOpen: (dir: string, persona: string) => void }) {
  const [id, setId] = useState(PROJECT_TEMPLATES[0]!.id)
  const [dir, setDir] = useState<string | null>(null)
  const [files, setFiles] = useState<{ path: string; exists: boolean }[]>([])
  const [replace, setReplace] = useState<string[]>([])
  const [msg, setMsg] = useState('')
  useEffect(() => {
    setReplace([])
    if (dir) void window.stm.template.plan(id, dir).then(setFiles, (e: Error) => setMsg(e.message))
  }, [id, dir])
  const t = PROJECT_TEMPLATES.find((x) => x.id === id)!
  const create = async () => {
    if (!dir) return
    try {
      const r = await window.stm.template.apply(id, dir, replace)
      setMsg(r.text)
      props.onOpen(dir, r.persona)
    } catch (e) {
      setMsg((e as Error).message)
    }
  }
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config" role="dialog" aria-label="New project from template">
        <header className="sheet-head">
          <div className="sheet-title">New project from template</div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="sheet-body">
          <p className="faint">Writes a CLAUDE.md, skills in .claude/skills and a persona in .supertokenman/personas. Files already there are kept unless you tick them.</p>
          {PROJECT_TEMPLATES.map((x) => (
            <label key={x.id} className="row">
              <Radio name="tpl" checked={x.id === id} onChange={() => setId(x.id)} /> <b>{x.name}</b> <span className="faint">{x.what}</span>
            </label>
          ))}
          <p className="faint">Persona: {t.persona.name}. Skills: {t.skills.map((s) => s.name).join(', ')}.</p>
          <p>
            <button className="ghost small" onClick={() => void pickProjectFolder('Folder for the new project').then((d) => d && setDir(d))}>{dir ? 'Change folder' : 'Pick a folder'}</button> <span className="faint">{dir ?? ''}</span>
          </p>
          {dir && (
            <ul>
              {files.map((f) => (
                <li key={f.path}>
                  {f.path}{' '}
                  {f.exists ? (
                    <label className="faint">
                      <Checkbox checked={replace.includes(f.path)} onChange={(e) => setReplace(e.target.checked ? [...replace, f.path] : replace.filter((p) => p !== f.path))} /> already there, replace
                    </label>
                  ) : (
                    <span className="faint">new</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {msg && <p>{msg}</p>}
          <button className="primary" disabled={!dir} onClick={() => void create()}>Create and open</button>
        </div>
      </div>
    </div>
  )
}
