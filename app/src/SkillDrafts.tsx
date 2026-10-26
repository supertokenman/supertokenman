import { useEffect, useState } from 'react'
import { checkDraft, draftOf, POLISH, polishLost, skillMd, type DraftTurn, type SkillDraft } from '../shared/skilldraft'
import { lineDiff, scanSkill } from '../shared/skillimport'
import type { SkillDraftRow } from './bridge'
import type { Line } from './state'
import { askOnce } from './localStream'
import { StateMark } from './StateMark'
import { clean } from './errors'
import { IconCheck, IconClose, IconSpark, IconTrash } from './icons'
import './bridge'

/** The panel's conversation as turns for a draft: the last few, each with the tools it used. */
export function turnsOfLines(lines: Line[], max = 8): DraftTurn[] {
  const out: DraftTurn[] = []
  for (const l of lines) {
    if (l.kind === 'user') out.push({ prompt: l.text, reply: '', tools: [] })
    else if (!out.length) continue
    else if (l.kind === 'assistant') out[out.length - 1]!.reply = `${out[out.length - 1]!.reply}${out[out.length - 1]!.reply ? '\n' : ''}${l.text}`
    else if (l.kind === 'tool') out[out.length - 1]!.tools.push({ name: l.name, summary: l.summary })
  }
  return out.slice(-max)
}

/** A new draft from a panel, saved in the app; nothing is written to the project yet. */
export async function draftFromPanel(cwd: string, lines: Line[]): Promise<SkillDraftRow> {
  const turns = turnsOfLines(lines)
  if (!turns.length) throw new Error('This panel has no finished turn to learn from.')
  const project = cwd.split('/').filter(Boolean).pop() ?? cwd
  return window.stm.sdraft.save({ project, cwd, draft: draftOf(turns, { project, date: new Date().toISOString().slice(0, 10) }) })
}

/**
 * Skill drafts: what the app learned from tasks rated good, as Claude Code skills you can edit. A draft
 * does nothing until you approve it; approving writes SKILL.md into the project or your personal skills.
 */
export function SkillDraftsSheet(props: { focus?: string; cwd?: string; onClose: () => void }) {
  const [rows, setRows] = useState<SkillDraftRow[] | null>(null)
  const [sel, setSel] = useState<string | undefined>(props.focus)
  const load = () => void window.stm.sdraft.list().then((r) => (setRows(r), setSel((s) => s && r.some((x) => x.id === s) ? s : r[r.length - 1]?.id)))
  useEffect(load, [])
  const row = rows?.find((r) => r.id === sel)
  const [url, setUrl] = useState('')
  const [ierr, setIerr] = useState('')
  const [ibusy, setIbusy] = useState(false)
  const importUrl = () => {
    setIbusy(true)
    setIerr('')
    void window.stm.sdraft.import(url, props.cwd ?? '').then((r) => (setUrl(''), load(), setSel(r.id)), (e) => setIerr(clean(e))).finally(() => setIbusy(false))
  }
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe sd" role="dialog" aria-label="Skill drafts">
        <header className="sheet-head">
          <div className="sheet-title">Skill drafts</div>
          <span className="faint">{rows ? `${rows.length} waiting for review` : ''}</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="sd-import">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Import a skill from a link (GitHub file or raw SKILL.md)" aria-label="Skill link" spellCheck={false} />
          <button disabled={!url.trim() || ibusy} onClick={importUrl}>{ibusy ? 'Reading...' : 'Import as a draft'}</button>
          <button className="ghost" title="obsidian-markdown and json-canvas from kepano/obsidian-skills (MIT), shipped with the app at a fixed commit. They wait here until you approve them." onClick={() => void window.stm.sdraft.factory(props.cwd ?? '').then((n) => (load(), setIerr(n ? '' : 'The vault format skills are already in your drafts.')), (e) => setIerr(clean(e)))}>Add vault format skills</button>
          {ierr && <div className="notice error">{ierr}</div>}
        </div>
        {rows && !rows.length ? (
          <div className="dsg-body"><div className="faint">No drafts. Rate a reply Good in a panel, then Draft a skill: the app writes one from what that panel did. Nothing is used until you approve it here.</div></div>
        ) : (
          <div className="sd-body">
            <div className="sd-list">
              {rows?.slice().reverse().map((r) => (
                <button key={r.id} className={`sd-item ${r.id === sel ? 'on' : ''}`} onClick={() => setSel(r.id)}>
                  <b>{r.draft.name}</b>
                  <span className="faint">{r.project} · {new Date(r.at).toLocaleDateString()}</span>
                </button>
              ))}
            </div>
            {row ? <Editor key={row.id} row={row} onDone={load} /> : <div className="faint sd-empty">Pick a draft.</div>}
          </div>
        )}
      </div>
    </div>
  )
}

function Editor(props: { row: SkillDraftRow; onDone: () => void }) {
  const [d, setD] = useState<SkillDraft>(props.row.draft)
  const [scope, setScope] = useState<'project' | 'personal'>('project')
  const [confirm, setConfirm] = useState(false)
  const [exists, setExists] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [prev, setPrev] = useState<string | null>(null)
  const [acks, setAcks] = useState<number[]>([])
  const [ondisk, setOndisk] = useState<string | null>(null)
  const src = props.row.source
  const findings = src ? scanSkill(`${d.description}\n${d.body}`) : []
  const blocks = findings.filter((f) => f.level === 'block')
  useEffect(() => void (src ? window.stm.sdraft.existing(props.row.cwd, d.name, scope).then(setOndisk) : undefined), [d.name, scope])
  const problem = checkDraft(d) ?? (blocks.length && acks.length < blocks.length ? `Acknowledge each finding below, or edit the instructions to remove it.` : null)
  const set = (o: Partial<SkillDraft>) => (setD({ ...d, ...o }), setConfirm(false), setExists(''))
  const where = scope === 'personal' ? `~/.claude/skills/${d.name}/SKILL.md` : `${props.row.cwd}/.claude/skills/${d.name}/SKILL.md`
  const save = () => void window.stm.sdraft.save({ ...props.row, draft: d })
  const polish = async () => {
    setBusy('polish')
    setErr('')
    try {
      const body = (await askOnce(POLISH, d.body, 'shrink')).replace(/^---[\s\S]*?---\s*/, '').trim()
      const lost = polishLost(d.body, body)
      if (lost) setErr(`Kept your draft: the local model's version was not used because ${lost}.`)
      else (setPrev(d.body), set({ body }))
    } catch (e) {
      setErr(`The local model could not polish it: ${clean(e)}`)
    }
    setBusy('')
  }
  const approve = async (replace: boolean) => {
    setBusy('approve')
    setErr('')
    try {
      const r = await window.stm.sdraft.approve(props.row.id, d, scope, replace, acks.length)
      if (!r.written) setExists(r.exists)
      else {
        setMsg(`Written to ${r.file}. New panels in ${scope === 'personal' ? 'any project' : props.row.project} can use it.`)
        setTimeout(props.onDone, 1600)
      }
    } catch (e) {
      setErr(clean(e))
    }
    setBusy('')
  }
  return (
    <div className="sd-edit">
      {src && (
        <section className="sd-source">
          <div className="ob-row"><span className="chart-name">Imported from</span><a className="faint sd-url" href={src.url} onClick={(e) => (e.preventDefault(), void window.stm.openUrl(src.url))}>{src.url}</a></div>
          <div className="ob-row"><span className="chart-name">License</span><span className={src.license ? '' : 'sd-warn'}>{src.license ?? 'none found: you may not have the right to reuse it'}</span>{src.repo && <span className="faint">{src.repo}</span>}</div>
          {findings.length === 0 ? <div className="sd-ok">Nothing risky found in the text. Read it anyway: a scan cannot prove a skill is safe.</div> : (
            <ul className="sd-find">
              {findings.map((f, i) => {
                const bi = blocks.indexOf(f)
                return (
                  <li key={i} className={f.level}>
                    {f.level === 'block' ? <label><input type="checkbox" checked={acks.includes(bi)} onChange={(e) => setAcks(e.target.checked ? [...acks, bi] : acks.filter((x) => x !== bi))} /> {f.text}</label> : f.text}
                  </li>
                )
              })}
            </ul>
          )}
          {ondisk !== null && (
            <details className="s2c-file" open><summary>Changes against the skill already at this name</summary>
              <pre className="ob-pre sd-diff">{lineDiff(ondisk, skillMd(d)).map((l, i) => <span key={i} className={l.op === '+' ? 'add' : l.op === '-' ? 'del' : ''}>{l.op} {l.text}{'\n'}</span>)}</pre>
            </details>
          )}
        </section>
      )}
      <div className="fld-grid">
        <label className="fld"><span className="fld-label">Name</span><input value={d.name} onChange={(e) => set({ name: e.target.value.toLowerCase() })} onBlur={save} /></label>
        <label className="fld"><span className="fld-label">Goes to</span>
          <select value={scope} onChange={(e) => (setScope(e.target.value as 'project' | 'personal'), setConfirm(false), setExists(''))}><option value="project">This project ({props.row.project})</option><option value="personal">My skills, every project</option></select>
        </label>
        <label className="fld wide"><span className="fld-label">When Claude should use it</span><input value={d.description} onChange={(e) => set({ description: e.target.value.replace(/\n/g, ' ') })} onBlur={save} /><span className="fld-help">Claude reads this line to decide when the skill applies.</span></label>
        <label className="fld wide"><span className="fld-label">Instructions</span><textarea rows={14} value={d.body} onChange={(e) => set({ body: e.target.value })} onBlur={save} spellCheck={false} /></label>
      </div>
      <details className="s2c-file"><summary>SKILL.md as it will be written <span className="faint">{where}</span></summary><pre className="ob-pre">{skillMd(d)}</pre></details>
      {problem && <div className="notice error">{problem}</div>}
      {exists && <div className="notice">{exists} already exists. Replace it, or rename this one.</div>}
      {confirm && !exists && <div className="notice">Approving writes {where}. From then on Claude Code may use it when a task matches the line above.</div>}
      <div className="ob-row">
        <button className="ghost small" disabled={!!busy} onClick={() => void window.stm.sdraft.discard(props.row.id).then(props.onDone)}><IconTrash />Discard</button>
        <button className="small" disabled={!!busy} onClick={() => void polish()} title="Make the steps general with the local model; free, nothing leaves the Mac">{busy === 'polish' ? <StateMark state="busy" label="Polishing" /> : <IconSpark />}Polish with the local model</button>
        {prev !== null && <button className="ghost small" onClick={() => (set({ body: prev }), setPrev(null))}>Undo polish</button>}
        <span className="spacer-flex" />
        {exists ? <button className="danger small" disabled={!!busy} onClick={() => void approve(true)}>Replace it</button>
          : confirm ? <>
            <button className="ghost small" onClick={() => setConfirm(false)}>Cancel</button>
            <button className="primary small" disabled={!!busy || !!problem} onClick={() => void approve(false)}><IconCheck />Write the skill</button>
          </> : <button className="primary small" disabled={!!busy || !!problem} onClick={() => setConfirm(true)}>Approve</button>}
      </div>
      {msg && <div className="notice">{msg}</div>}
      {err && <div className="notice error">{err}</div>}
    </div>
  )
}
