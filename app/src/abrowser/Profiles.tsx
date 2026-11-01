import { useCallback, useEffect, useState } from 'react'
import { Select } from '../ui'
import { scopeLabel } from './model'
import type { ProfileInfo } from './types'

const api = () => window.stm.agentBrowser

/**
 * Named browser profiles. A profile holds sign-ins; several panels may use the same one, which is how one
 * sign-in serves them all. With `panel` it also chooses where that panel's sign-ins live and whether the
 * project defaults to a profile. Without it (Settings) it only manages the list.
 */
export function Profiles(props: { panel?: string; /** changes when the scope changes elsewhere */ stamp?: string; onScope?: () => void }) {
  const [info, setInfo] = useState<ProfileInfo | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [confirm, setConfirm] = useState('')
  const load = useCallback(() => void api().profiles(props.panel).then(setInfo, () => setInfo(null)), [props.panel])
  useEffect(load, [load, props.stamp])
  if (!info) return null
  const run = async (a: Parameters<ReturnType<typeof api>['editProfile']>[0]) => {
    const r = await api().editProfile(a)
    setError(r.ok ? '' : r.error)
    if (r.ok) load()
    return r
  }
  const create = async () => {
    const r = await run({ op: 'create', name })
    if (r.ok) setName('')
  }
  const choose = async (scope: string) => {
    await api().profile(props.panel!, scope)
    load()
    props.onScope?.()
  }
  return (
    <div className="ab-prof">
      {props.panel && (
        <div className="ab-prof-row">
          <label className="ab-label" id="ab-scope-l">Sign-ins for this panel</label>
          <Select aria-label="Sign-ins for this panel" value={info.scope} onChange={(e) => void choose(e.target.value)}>
            <option value="panel">This panel only</option>
            <option value="project">Project profile</option>
            {info.list.map((p) => (
              <option key={p.id} value={`profile:${p.id}`}>{p.name}</option>
            ))}
          </Select>
        </div>
      )}
      {props.panel && (
        <div className="ab-prof-row">
          <span className="ab-label">Default for this project</span>
          <Select aria-label="Default profile for this project" value={info.default ?? ''} onChange={(e) => void run({ op: 'default', panel: props.panel, id: e.target.value || undefined })}>
            <option value="">None</option>
            {info.list.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>
      )}
      {props.panel && <p className="ab-help faint">Currently {scopeLabel(info.scope, info.list).toLowerCase()}. Changing it closes this panel's browser tabs.</p>}
      {info.list.length === 0 ? (
        <p className="ab-help faint">No named profiles yet. Create one to share a sign-in between panels.</p>
      ) : (
        <ul className="ab-prof-list">
          {info.list.map((p) => (
            <li key={p.id}>
              {editing?.id === p.id ? (
                <form
                  className="ab-inline"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void run({ op: 'rename', id: p.id, name: editing.name }).then((r) => r.ok && setEditing(null))
                  }}
                >
                  <input aria-label="Profile name" className="ab-field" value={editing.name} maxLength={40} autoFocus onChange={(e) => setEditing({ id: p.id, name: e.target.value })} />
                  <button className="small primary" type="submit">Save</button>
                  <button className="small ghost" type="button" onClick={() => setEditing(null)}>Cancel</button>
                </form>
              ) : (
                <>
                  <span className="ab-prof-name">{p.name}</span>
                  {confirm === p.id ? (
                    <>
                      <span className="faint ab-help">Signs out everywhere it is used.</span>
                      <button className="small danger" onClick={() => void run({ op: 'delete', id: p.id }).then(() => setConfirm(''))}>Delete {p.name}</button>
                      <button className="small ghost" onClick={() => setConfirm('')}>Keep</button>
                    </>
                  ) : (
                    <>
                      <button className="small ghost" onClick={() => setEditing({ id: p.id, name: p.name })}>Rename</button>
                      <button className="small ghost" onClick={() => setConfirm(p.id)}>Delete</button>
                    </>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="ab-inline"
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <input aria-label="New profile name" className="ab-field" placeholder="New profile, for example Shop admin" value={name} maxLength={40} onChange={(e) => (setName(e.target.value), setError(""))} />
        <button className="small" type="submit" disabled={!name.trim()}>Create profile</button>
      </form>
      {error && <p className="ab-error" role="alert">{error}</p>}
    </div>
  )
}
