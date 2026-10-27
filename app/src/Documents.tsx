import { pickPaths } from './FilePicker'
import { useEffect, useState } from 'react'
import { IconClose, IconTrash } from './icons'
import { RowAct, RowActs } from './RowActs'
import type { Chunk, Doc, Fact, Hit, Job, SearchStage } from '../electron/docstore'
import type { Rule } from '../shared/docrules'
import { StateMark } from './StateMark'
import { clean } from './errors'
import './bridge'
import { Select } from './ui'
import { pickProjectFolder } from './FolderPicker'

// what the inbox reads (electron/docstore.ts ACCEPTED); the main process checks again
const DOC_EXTS = ['txt', 'md', 'csv', 'json', 'eml', 'png', 'jpg', 'jpeg', 'tif', 'tiff', 'bmp', 'webp', 'pdf', 'docx', 'pptx', 'xlsx', 'html', 'epub']

type State = Awaited<ReturnType<typeof window.stm.docs.state>>
const JOB: Record<Job['status'], { state: 'busy' | 'up' | 'down' | 'off' | 'warn'; label: string }> = {
  waiting: { state: 'off', label: 'Waiting' },
  working: { state: 'busy', label: 'Reading' },
  done: { state: 'up', label: 'Filed' },
  failed: { state: 'down', label: 'Failed' },
  duplicate: { state: 'warn', label: 'Duplicate' },
}
/** Enough rows for the text's lines, wrapped at about 90 characters, up to ten. */
const rowsFor = (t: string) => Math.min(10, Math.max(2, t.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 90)), 0)))
const name = (f: string) => f.split('/').pop() ?? f

/**
 * Documents: a watched folder feeds a queue; each file is read (OCR for scans), filed by a path
 * template, tagged by rules and by suggestions you accept, cut into chunks you can fix, and searched by
 * words and meaning. Facts the local model finds wait for you before they go to memory.
 */
export function DocumentsSheet(props: { onClose: () => void; onSend: (text: string) => void }) {
  const [tab, setTab] = useState<'inbox' | 'docs' | 'search' | 'rules'>('inbox')
  const [st, setSt] = useState<State | null>(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const load = () => void window.stm.docs.state().then(setSt, (e) => setErr(clean(e)))
  useEffect(() => (load(), window.stm.docs.onChanged(load)), [])
  const act = (p: Promise<unknown>) => void p.then(load, (e) => setErr(clean(e)))
  const failed = st?.queue.filter((j) => j.status === 'failed').length ?? 0
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet documents" role="dialog" aria-label="Documents">
        <header className="sheet-head">
          <div className="sheet-title">Documents</div>
          <div className="segmented small" role="tablist">
            <button role="tab" aria-selected={tab === 'inbox'} onClick={() => setTab('inbox')}>Inbox{failed ? ` · ${failed} failed` : ''}</button>
            <button role="tab" aria-selected={tab === 'docs'} onClick={() => setTab('docs')}>Filed {st ? `· ${st.docs.length}` : ''}</button>
            <button role="tab" aria-selected={tab === 'search'} onClick={() => setTab('search')}>Search</button>
            <button role="tab" aria-selected={tab === 'rules'} onClick={() => setTab('rules')}>Rules</button>
          </div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        <div className="dsg-body">
          {err && <div className="notice error">{err}</div>}
          {st && tab === 'inbox' && (
            <>
              <div className="dep-row">
                <span className="sp-label">Watched folder</span>
                <code className="dc-folder">{st.folder || 'none yet'}</code>
                <span className="spacer-flex" />
                <button className="ghost small" onClick={() => act(pickProjectFolder('Folder to watch for documents').then((d) => window.stm.docs.setFolder(d)))}>{st.folder ? 'Change…' : 'Pick a folder…'}</button>
                <button className="primary small" onClick={() => act(pickPaths({ title: 'Add documents', accept: DOC_EXTS, multiple: true, action: 'Add' }).then((r) => (r === 'finder' ? window.stm.docs.addFiles() : r ? window.stm.docs.addFiles(r) : 0)))}>Add files…</button>
              </div>
              <div className="faint">Files put there are read once and copied into the app's documents folder; the original stays where it is. PDFs, Office files, text, and photos or scans through OCR (Tesseract). {st.models.small ? `Tags and facts are suggested by ${st.models.small}.` : 'Pick a local model to get tag and fact suggestions.'}</div>
              {st.queue.length === 0 && <div className="faint">Nothing in the queue.</div>}
              <ol className="dc-queue">
                {st.queue.map((j) => (
                  <li key={j.id} className={j.status}>
                    <StateMark state={JOB[j.status].state} label={JOB[j.status].label} />
                    <span className="dc-st">{JOB[j.status].label}</span>
                    <span className="dc-file" data-tip={j.file}>{name(j.file)}</span>
                    <span className="faint dc-err" data-tip={j.error}>{j.error}{j.tries > 1 ? ` · try ${j.tries}` : ''}</span>
                    {j.status === 'failed' && <button className="ghost small" onClick={() => act(window.stm.docs.retry(j.id))}>Retry</button>}
                    {(j.status === 'done' || j.status === 'duplicate') && j.doc && <button className="ghost small" onClick={() => (setOpen(j.doc), setTab('docs'))}>Open</button>}
                  </li>
                ))}
              </ol>
            </>
          )}
          {st && tab === 'docs' && (open ? <DocView id={open} onBack={() => (setOpen(null), load())} onSend={props.onSend} /> : <DocList docs={st.docs} onOpen={setOpen} />)}
          {st && tab === 'search' && <Search tags={st.tags} models={st.models} onOpen={(id) => (setOpen(id), setTab('docs'))} onSend={props.onSend} />}
          {st && tab === 'rules' && <Rules rules={st.rules} template={st.template} act={act} />}
        </div>
      </div>
    </div>
  )
}

function DocList(props: { docs: Doc[]; onOpen: (id: number) => void }) {
  if (!props.docs.length) return <div className="faint">No documents yet. Put files in the watched folder or use Add files.</div>
  return (
    <div className="dc-table">
      <table className="tbl">
        <thead><tr><th>Document</th><th>From</th><th className="num">Date</th><th>Tags</th><th className="num">Text</th></tr></thead>
        <tbody>
          {props.docs.map((d) => (
            <tr key={d.id} onClick={() => props.onOpen(d.id)}>
              <td><b>{d.title}</b>{d.ocr && <span className="dc-chip">OCR</span>}</td>
              <td>{d.sender || <span className="faint">unknown</span>}</td>
              <td className="num">{d.date || <span className="faint">none</span>}</td>
              <td>{d.tags.map((t) => <span key={t} className="dc-tag">{t}</span>)}{d.suggested.length > 0 && <span className="dc-tag sug">+{d.suggested.length} suggested</span>}</td>
              <td className="num faint">{(d.chars / 1000).toFixed(1)}k</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DocView(props: { id: number; onBack: () => void; onSend: (t: string) => void }) {
  const [d, setD] = useState<{ doc?: Doc; chunks: Chunk[]; facts: Fact[] } | null>(null)
  const [edit, setEdit] = useState<Record<number, string>>({})
  const [add, setAdd] = useState('')
  const [cursor, setCursor] = useState<{ id: number; at: number } | null>(null)
  const [tag, setTag] = useState('')
  const load = () => void window.stm.docs.doc(props.id).then(setD)
  useEffect(load, [props.id])
  if (!d?.doc) return <div className="faint">Loading…</div>
  const doc = d.doc
  const tags = (t: string[]) => void window.stm.docs.setTags(doc.id, t).then(load)
  return (
    <div className="dc-view">
      <div className="dep-row">
        <button className="ghost small" onClick={props.onBack}>← All documents</button>
        <b className="dc-title">{doc.title}</b>
        <span className="faint">{doc.sender || 'unknown sender'} · {doc.date || 'no date'}{doc.ocr ? ' · read by OCR' : ''}</span>
        <span className="spacer-flex" />
        <button className="ghost small" onClick={() => void window.stm.docs.show(doc.id)}>Show file</button>
        <button className="ghost small" onClick={() => props.onSend(`From the document "${doc.title}" (${doc.path}):\n\n${d.chunks.map((c) => c.text).join('\n\n')}`)}>Send to panel</button>
      </div>
      <code className="dc-path faint">{doc.path}</code>
      <div className="dc-tags">
        <span className="sp-label">Tags</span>
        {doc.tags.map((t) => <button key={t} className="dc-tag on" data-tip="Remove" onClick={() => tags(doc.tags.filter((x) => x !== t))}>{t} ×</button>)}
        {doc.suggested.map((t) => (
          <span key={t} className="dc-sug">
            <span className="dc-tag sug">{t}</span>
            <button className="ghost small" onClick={() => tags([...doc.tags, t])}>Accept</button>
            <button className="ghost small" onClick={() => void window.stm.docs.reject(doc.id, t).then(load)}>Reject</button>
          </span>
        ))}
        <input id="dc-newtag" value={tag} placeholder="add a tag" onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && tag.trim() && (tags([...doc.tags, tag.trim()]), setTag(''))} />
      </div>
      {d.facts.some((f) => f.status === 'suggested') && (
        <div className="dc-facts">
          <div className="sp-label">Facts found · confirm to keep them in memory</div>
          {d.facts.filter((f) => f.status === 'suggested').map((f) => (
            <div key={f.id} className="dc-fact">
              <span>{f.text}</span>
              <span className="spacer-flex" />
              <button className="ghost small" onClick={() => void window.stm.docs.fact(f.id, false).then(load)}>Reject</button>
              <button className="primary small" onClick={() => void window.stm.docs.fact(f.id, true).then(load)}>Remember</button>
            </div>
          ))}
        </div>
      )}
      {d.facts.some((f) => f.status === 'confirmed') && <div className="faint">In memory: {d.facts.filter((f) => f.status === 'confirmed').map((f) => f.text).join(' · ')}</div>}
      <Compiled id={doc.id} />
      <div className="sp-label">Chunks search uses · {d.chunks.length} · edit to fix OCR errors, empty one to delete it</div>
      <div className="dc-chunks">
        {d.chunks.map((c, i) => (
          <div key={c.id} className={`dc-chunk ${c.edited ? 'edited' : ''}`}>
            <span className="dc-ord">{c.ord + 1}{c.edited ? ' · edited' : ''}<span className={`dc-vec ${c.embedded ? 'on' : ''}`} data-tip={c.embedded ? 'Has a vector: found by meaning' : 'No vector yet: found by words only'}>{c.embedded ? 'vector' : 'words only'}</span></span>
            <textarea value={edit[c.id] ?? c.text} spellCheck={false} onChange={(e) => setEdit({ ...edit, [c.id]: e.target.value })} onSelect={(e) => setCursor({ id: c.id, at: e.currentTarget.selectionStart })} rows={rowsFor(edit[c.id] ?? c.text)} />
            <span className="dc-chunk-acts">
              <button className="ghost small" disabled={!(cursor?.id === c.id && cursor.at > 0 && cursor.at < c.text.length) || edit[c.id] !== undefined} data-tip="Cut this chunk in two where the cursor is" onClick={() => void window.stm.docs.split(c.id, cursor!.at).then(load)}>Split here</button>
              {i < d.chunks.length - 1 && <button className="ghost small" data-tip="Join with the next chunk" onClick={() => void window.stm.docs.merge(c.id).then(load)}>Join with next</button>}
            </span>
            {edit[c.id] !== undefined && edit[c.id] !== c.text && <button className="primary small" onClick={() => void window.stm.docs.chunk(c.id, edit[c.id]!).then(() => (setEdit({ ...edit, [c.id]: undefined as unknown as string }), load()))}>{edit[c.id]!.trim() ? 'Save' : 'Delete'}</button>}
          </div>
        ))}
        <div className="dc-chunk">
          <span className="dc-ord">new</span>
          <textarea id="dc-add" value={add} placeholder="Add a chunk: a correction, a summary, context search should find" onChange={(e) => setAdd(e.target.value)} rows={2} />
          {add.trim() && <button className="primary small" onClick={() => void window.stm.docs.addChunk(doc.id, add).then(() => (setAdd(''), load()))}>Add</button>}
        </div>
      </div>
      <div className="sbx-actions"><button className="danger small" onClick={() => void window.stm.docs.remove(doc.id).then(props.onBack)}>Remove from the app</button></div>
    </div>
  )
}

const STEPS: SearchStage['stage'][] = ['words', 'meaning', 'rerank', 'done']

function Search(props: { tags: string[]; models: { small: string; embed: string }; onOpen: (id: number) => void; onSend: (t: string) => void }) {
  const [q, setQ] = useState('')
  const [tag, setTag] = useState('')
  const [stages, setStages] = useState<SearchStage[]>([])
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => window.stm.docs.onStage((s) => setStages((x) => [...x, s])), [])
  const go = async () => {
    setBusy(true)
    setStages([])
    setHits(await window.stm.docs.search(q, tag).catch(() => []))
    setBusy(false)
  }
  return (
    <>
      <div className="dep-row">
        <input id="dc-q" value={q} placeholder="What are you looking for? e.g. how much was the October power bill" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && q.trim() && void go()} />
        <Select className="dc-select" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag"><option value="">All tags</option>{props.tags.map((t) => <option key={t}>{t}</option>)}</Select>
        <button className="primary small" disabled={busy || !q.trim()} onClick={() => void go()}>Search</button>
      </div>
      <div className="faint">Words (BM25), then meaning ({props.models.embed || 'no embedding model picked'}), fused by rank, then a rerank by {props.models.small || 'the local model, when one is picked'}.</div>
      {(busy || stages.length > 0) && (
        <ol className="dc-steps">
          {STEPS.map((s) => {
            const got = stages.find((x) => x.stage === s)
            return <li key={s} className={got ? 'on' : ''}><StateMark state={got ? 'up' : busy ? 'busy' : 'off'} label={s} /><b>{s === 'words' ? 'Retrieve by words' : s === 'meaning' ? 'Retrieve by meaning' : s === 'rerank' ? 'Rerank' : 'Answer'}</b><span className="faint">{got?.note ?? (busy ? '…' : 'skipped')}</span></li>
          })}
        </ol>
      )}
      {hits && hits.length === 0 && !busy && <div className="faint">Nothing found.</div>}
      <ol className="dc-hits">
        {(hits ?? []).map((h) => (
          <li key={h.chunk.id}>
            <div className="dc-hit-top">
              <button className="dc-link" onClick={() => props.onOpen(h.doc.id)}>{h.doc.title}</button>
              <span className="faint">chunk {h.chunk.ord + 1}</span>
              {h.via.map((v) => <span key={v} className="dc-via">{v}</span>)}
              <span className="spacer-flex" />
              <button className="ghost small" onClick={() => props.onSend(`From "${h.doc.title}" (${h.doc.path}), chunk ${h.chunk.ord + 1}:\n\n${h.chunk.text}`)}>Send</button>
            </div>
            <div className="dc-hit-text">{h.chunk.text}</div>
          </li>
        ))}
      </ol>
    </>
  )
}

function Rules(props: { rules: Rule[]; template: string; act: (p: Promise<unknown>) => void }) {
  const blank: Rule = { id: '', name: '', kind: 'words', value: '', tags: [], template: '' }
  const [r, setR] = useState<Rule>(blank)
  const [tags, setTags] = useState('')
  const [tpl, setTpl] = useState(props.template)
  return (
    <>
      <div className="sp-label">Where documents go</div>
      <div className="dep-row">
        <input id="dc-tpl" value={tpl} onChange={(e) => setTpl(e.target.value)} />
        <button className="ghost small" disabled={tpl === props.template} onClick={() => props.act(window.stm.docs.template(tpl))}>Save</button>
      </div>
      <div className="faint">{'{sender}'}, {'{year}'}, {'{month}'}, {'{title}'} and {'{tag}'} come from each document; a rule can set its own.</div>
      <div className="sp-label">Rules · applied to every new document</div>
      {props.rules.length === 0 && <div className="faint">No rules yet.</div>}
      <div className="wr-rules">
        {props.rules.map((x) => (
          <div key={x.id} className="wr-rule row-host">
            <b>{x.name}</b>
            <code>{x.kind === 'regex' ? `/${x.value}/` : x.value}</code>
            <span className="faint">→ {x.tags.join(', ') || 'no tags'}{x.template ? ` · ${x.template}` : ''}</span>
            <RowActs><RowAct label="Remove this rule" icon={<IconTrash />} danger onClick={() => props.act(window.stm.docs.dropRule(x.id))} /></RowActs>
          </div>
        ))}
      </div>
      <div className="dc-rule-form">
        <input id="dc-rname" value={r.name} placeholder="Name, e.g. Power bill" onChange={(e) => setR({ ...r, name: e.target.value })} />
        <div className="segmented small" role="radiogroup" aria-label="Match by">
          <button role="radio" aria-checked={r.kind === 'words'} aria-selected={r.kind === 'words'} onClick={() => setR({ ...r, kind: 'words' })}>All these words</button>
          <button role="radio" aria-checked={r.kind === 'regex'} aria-selected={r.kind === 'regex'} onClick={() => setR({ ...r, kind: 'regex' })}>Regex</button>
        </div>
        <input id="dc-rvalue" value={r.value} placeholder={r.kind === 'words' ? 'enel fatura' : 'NF-?e\\s*\\d+'} onChange={(e) => setR({ ...r, value: e.target.value })} />
        <input id="dc-rtags" value={tags} placeholder="tags, comma separated" onChange={(e) => setTags(e.target.value)} />
        <input id="dc-rtpl" value={r.template ?? ''} placeholder="folder (optional), e.g. bills/{year}/{title}" onChange={(e) => setR({ ...r, template: e.target.value })} />
        <button className="primary small" disabled={!r.name.trim() || !r.value.trim()} onClick={() => (props.act(window.stm.docs.rule({ ...r, tags: tags.split(',') })), setR(blank), setTags(''))}>Add rule</button>
      </div>
    </>
  )
}

/** The compiled outline and summary of a document: cheap context with pointers back to the chunks. */
function Compiled(props: { id: number }) {
  const [list, setList] = useState<{ version: number; text: string; at: number; how: string }[]>([])
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [confirm, setConfirm] = useState(false)
  const load = () => void window.stm.docs.compiled(props.id).then(setList)
  useEffect(load, [props.id])
  const run = (how: 'outline' | 'local' | 'claude') => {
    setBusy(how)
    setNote('')
    setConfirm(false)
    void window.stm.docs.compile(props.id, how).then((r) => (setNote(`Version ${r.version}: about ${r.tokensCompiled.toLocaleString()} tokens instead of ${r.tokensWhole.toLocaleString()}.`), load()), (e: Error) => setNote(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))).finally(() => setBusy(''))
  }
  const last = list[0]
  return (
    <div className="dc-compiled">
      <div className="ob-row">
        <span className="sp-label ob-grow">Compiled{last ? ` · version ${last.version} · ${last.how}` : ''}</span>
        <button className="ghost small" disabled={!!busy} onClick={() => run('outline')}>Outline</button>
        <button className="ghost small" disabled={!!busy} onClick={() => run('local')}>Outline + local summary</button>
        {confirm ? <><span className="faint">Haiku, about US$ 0.01.</span><button className="small" onClick={() => run('claude')}>Summarize with Claude</button><button className="ghost small" onClick={() => setConfirm(false)}>Cancel</button></> : <button className="ghost small" disabled={!!busy} onClick={() => setConfirm(true)}>Outline + Claude summary</button>}
      </div>
      {busy && <div className="faint">Compiling...</div>}
      {note && <div className="faint">{note}</div>}
      {last && <pre className="ex-src">{last.text}</pre>}
    </div>
  )
}
