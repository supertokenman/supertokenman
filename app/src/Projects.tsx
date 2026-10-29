import { useEffect, useState } from 'react'
import { clean } from './errors'
import { Checkbox } from './ui'
import { cleanBrandKit, MAX_CHARACTERS, type BrandCharacter, type BrandSeries } from '../shared/brandkit'
import { validateProject, type Project } from '../shared/socaccounts'

// Projects live in the settings of the app (social:projects). A list kept in this window's localStorage by an
// earlier version is moved there once, then removed here.
const OLD_KEY = 'stm.social.projects'

export type Candidate = { id: string; label: string }

type Draft = {
  id: string
  name: string
  accountIds: string[]
  tone: string
  banned: string
  characters: BrandCharacter[]
  series: BrandSeries[]
}

function legacy(): unknown[] {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(OLD_KEY) ?? '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

async function load(): Promise<{ list: Project[]; skipped: number }> {
  const got = await window.stm.social.projects()
  const old = legacy().flatMap((p) => { const c = validateProject(p); return c.ok && !got.list.some((x) => x.id === c.project.id) ? [c.project] : [] })
  if (!old.length) {
    // nothing left to move: an empty or unreadable old list is dropped
    try { if (window.localStorage.getItem(OLD_KEY) !== null) window.localStorage.removeItem(OLD_KEY) } catch { /* private window */ }
    return got
  }
  const list = await window.stm.social.setProjects([...got.list, ...old])
  try { window.localStorage.removeItem(OLD_KEY) } catch { /* private window */ }
  return { list, skipped: got.skipped }
}

const toDraft = (p: Project): Draft => ({
  id: p.id,
  name: p.name,
  accountIds: [...p.accountIds],
  tone: p.brandKit.tone,
  banned: p.brandKit.bannedWords.join(', '),
  characters: p.brandKit.characters,
  series: p.brandKit.series,
})

const blank = (name: string): Draft => ({
  id: `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
  name,
  accountIds: [],
  tone: '',
  banned: '',
  characters: [],
  series: [],
})

/** Projects: a name, the account ids it uses, and a brand kit. Keys and tokens are never here. */
export function Projects(props: { candidates: Candidate[] }) {
  const [loaded, setLoaded] = useState({ list: [] as Project[], skipped: 0 })
  const [list, setList] = useState<Project[]>([])
  useEffect(() => void load().then((r) => (setLoaded(r), setList(r.list)), (e) => setMsg(clean(e))), [])
  const [newName, setNewName] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [msg, setMsg] = useState('')

  const upd = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d))
  const create = () => {
    const name = newName.trim()
    if (!name) {
      setMsg('Give the project a name.')
      return
    }
    setDraft(blank(name))
    setNewName('')
    setMsg('')
  }
  const saveDraft = () => {
    if (!draft) return
    const brandKit = cleanBrandKit({
      tone: draft.tone,
      bannedWords: draft.banned.split(','),
      characters: draft.characters,
      series: draft.series,
    })
    const check = validateProject({ id: draft.id, name: draft.name.trim(), accountIds: draft.accountIds, brandKit })
    if (!check.ok) {
      setMsg(`Not saved: ${check.problem}.`)
      return
    }
    const next = list.some((p) => p.id === draft.id)
      ? list.map((p) => (p.id === draft.id ? check.project : p))
      : [...list, check.project]
    window.stm.social.setProjects(next).then((saved) => (setList(saved), setMsg(''), setDraft(null)), (e) => setMsg(clean(e)))
  }

  const setChar = (i: number, patch: Partial<BrandCharacter>) =>
    upd({ characters: (draft?.characters ?? []).map((c, j) => (j === i ? { ...c, ...patch } : c)) })
  const setSeries = (i: number, patch: Partial<BrandSeries>) =>
    upd({ series: (draft?.series ?? []).map((s, j) => (j === i ? { ...s, ...patch } : s)) })

  const renderEditor = (d: Draft) => {
    const known = props.candidates.map((c) => c.id)
    const options: Candidate[] = [
      ...props.candidates,
      ...d.accountIds.filter((id) => !known.includes(id)).map((id) => ({ id, label: `${id} (not connected now)` })),
    ]
    const full = d.characters.length >= MAX_CHARACTERS
    return (
      <section style={{ display: 'grid', gap: 8 }}>
        <div className="chart-name">{list.some((p) => p.id === d.id) ? 'Edit project' : 'New project'}</div>
        <div className="ob-row">
          <input aria-label="Project name" placeholder="Project name" value={d.name} onChange={(e) => upd({ name: e.target.value })} />
        </div>

        <div className="chart-name">Accounts</div>
        {options.length === 0 && <div className="faint">Not enough data yet. Connect an account with a handle and it can be attached here.</div>}
        {options.map((o) => (
          <label key={o.id} className="ob-row">
            <Checkbox
              checked={d.accountIds.includes(o.id)}
              onChange={(e) => upd({ accountIds: e.target.checked ? [...d.accountIds, o.id] : d.accountIds.filter((x) => x !== o.id) })}
            />
            <span>{o.label}</span>
          </label>
        ))}

        <div className="chart-name">Brand kit</div>
        <input aria-label="Tone" placeholder="Tone, for example: plain, warm, no hype" value={d.tone} onChange={(e) => upd({ tone: e.target.value })} />
        <input aria-label="Banned words" placeholder="Banned words, comma-separated" value={d.banned} onChange={(e) => upd({ banned: e.target.value })} />

        <div className="faint">Characters, up to {MAX_CHARACTERS}</div>
        {d.characters.map((c, i) => (
          <div key={i} className="ob-row">
            <input aria-label={`Character ${i + 1} name`} placeholder="Name" value={c.name} onChange={(e) => setChar(i, { name: e.target.value })} />
            <input aria-label={`Character ${i + 1} look`} placeholder="Look" value={c.look} onChange={(e) => setChar(i, { look: e.target.value })} />
            <input aria-label={`Character ${i + 1} voice`} placeholder="Voice" value={c.voice} onChange={(e) => setChar(i, { voice: e.target.value })} />
            <button onClick={() => upd({ characters: d.characters.filter((_, j) => j !== i) })}>Remove</button>
          </div>
        ))}
        <div className="ob-row">
          <button disabled={full} onClick={() => upd({ characters: [...d.characters, { name: '', look: '', voice: '' }] })}>Add character</button>
          {full && <span className="faint">Six characters at most.</span>}
        </div>

        <div className="faint">Series</div>
        {d.series.map((s, i) => (
          <div key={i} style={{ display: 'grid', gap: 6 }}>
            <div className="ob-row">
              <input aria-label={`Series ${i + 1} name`} placeholder="Name" value={s.name} onChange={(e) => setSeries(i, { name: e.target.value })} />
              <input aria-label={`Series ${i + 1} format`} placeholder="Format" value={s.format} onChange={(e) => setSeries(i, { format: e.target.value })} />
              <input aria-label={`Series ${i + 1} cadence`} placeholder="Cadence" value={s.cadence} onChange={(e) => setSeries(i, { cadence: e.target.value })} />
              <button onClick={() => upd({ series: d.series.filter((_, j) => j !== i) })}>Remove</button>
            </div>
            {d.characters.filter((c) => c.name).length > 0 && (
              <div className="ob-row">
                <span className="faint">Characters:</span>
                {d.characters.filter((c) => c.name).map((c) => (
                  <label key={c.name} className="ob-row">
                    <Checkbox
                      checked={s.characterIds.includes(c.name)}
                      onChange={(e) =>
                        setSeries(i, { characterIds: e.target.checked ? [...s.characterIds, c.name] : s.characterIds.filter((x) => x !== c.name) })
                      }
                    />
                    <span>{c.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="ob-row">
          <button onClick={() => upd({ series: [...d.series, { name: '', characterIds: [], format: '', cadence: '' }] })}>Add series</button>
        </div>

        <div className="ob-row">
          <button className="primary" onClick={saveDraft}>Save project</button>
          <button onClick={() => (setDraft(null), setMsg(''))}>Cancel</button>
        </div>
      </section>
    )
  }

  return (
    <section style={{ display: 'grid', gap: 8 }}>
      <div className="chart-name">Projects</div>
      <div className="faint">A project groups accounts and a brand kit. It holds account ids and the brand kit only; keys stay in the vault.</div>
      {loaded.skipped > 0 && (
        <div className="faint">{loaded.skipped} saved {loaded.skipped === 1 ? 'project was' : 'projects were'} skipped because {loaded.skipped === 1 ? 'it did' : 'they did'} not pass the check.</div>
      )}
      <div className="ob-row">
        <input aria-label="New project name" placeholder="New project name" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
        <button onClick={create}>New project</button>
      </div>
      {list.length === 0 && <div className="faint">No projects yet.</div>}
      {list.map((p) => (
        <div key={p.id} className="ob-row">
          <span style={{ minWidth: 120 }}>{p.name}</span>
          <span className="faint">{p.accountIds.length} {p.accountIds.length === 1 ? 'account' : 'accounts'}</span>
          <span className="spacer-flex" />
          <button onClick={() => (setDraft(toDraft(p)), setMsg(''))}>{draft?.id === p.id ? 'Editing' : 'Edit'}</button>
        </div>
      ))}
      {draft && renderEditor(draft)}
      {msg && <div className="error">{msg}</div>}
    </section>
  )
}
