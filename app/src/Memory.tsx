import { useEffect, useRef, useState } from 'react'
import type { MemoryInfo } from './bridge'
import type { GraphEdge, GraphNode } from '../electron/memory'
import { VaultMap } from './VaultMap'

const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60000)
  if (m < 60) return `${Math.max(1, m)} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return d < 30 ? `${d} d ago` : new Date(ms).toLocaleDateString()
}

/** Earlier sessions of the folder to resume, and the vault's notes to search and reuse. */
export function Memory(props: { cwd: string; onClose: () => void; onResume: (id: string) => void; onUse: (text: string) => void }) {
  const [info, setInfo] = useState<MemoryInfo | null>(null)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<{ file: string; line: number; text: string }[]>([])
  const input = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<'map' | 'list' | 'edit'>('map')
  const [g, setG] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null)

  useEffect(() => {
    input.current?.focus()
    void window.stm.memoryInfo(props.cwd).then(setInfo)
    void window.stm.memoryGraph().then(setG)
  }, [props.cwd])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])
  useEffect(() => {
    if (q.trim().length < 2) return setHits([])
    const t = setTimeout(() => void window.stm.memorySearch(props.cwd, q).then(setHits), 200)
    return () => clearTimeout(t)
  }, [q, props.cwd])

  const use = async (file: string) => {
    const text = await window.stm.memoryRead(file)
    // the note without its front matter, as context for the next message
    props.onUse(`Context from my notes (${file}):\n\n${text.replace(/^---\n[\s\S]*?\n---\n/, '').trim()}\n\n`)
    props.onClose()
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={`sheet catalog memory-sheet ${mode}`} role="dialog" aria-label="Memory">
        <div className="search">
          <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" fill="none" /><path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={info?.vault ? `Search your notes for ${info.project}` : 'Search your notes'} spellCheck={false} />
          <div className="segmented">
            <button aria-selected={mode === 'map'} onClick={() => setMode('map')}>Map</button>
            <button aria-selected={mode === 'list'} onClick={() => setMode('list')}>List</button>
            <button aria-selected={mode === 'edit'} onClick={() => setMode('edit')}>Edit</button>
          </div>
          <kbd>Esc</kbd>
        </div>
        {mode === 'edit' ? (
          <DocEditor cwd={props.cwd} />
        ) : mode === 'map' && q.trim().length < 2 ? (
          g === null ? (
            <div className="faint pad">Drawing your vault...</div>
          ) : g.nodes.length === 0 ? (
            info?.vault ? (
              <div className="faint pad">The vault has no notes yet.</div>
            ) : (
              <div className="sheet-empty">
                <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true"><rect x="8" y="10" width="26" height="34" rx="3" className="se-a" /><rect x="22" y="16" width="26" height="34" rx="3" className="se-b" /><path d="M28 28h14M28 34h14M28 40h8" className="se-line" /></svg>
                <div className="se-title">Memory needs a notes folder</div>
                <div className="se-text">Sessions, decisions and summaries are saved as Markdown notes in a folder you choose. Run this once in a terminal:</div>
                <code className="se-code">tk vault init ~/vault</code>
              </div>
            )
          ) : (
            <VaultMap nodes={g.nodes} edges={g.edges} project={info?.project ?? ''} onUse={(f) => void use(f)} />
          )
        ) : (
        <div className="results memory">
          {q.trim().length >= 2 ? (
            <>
              <div className="group">Notes matching "{q.trim()}"</div>
              {!info?.vault && <div className="faint pad">No vault yet. Run <code className="md-code">tk vault init ~/vault</code> from token-kit and your sessions start writing notes.</div>}
              {info?.vault && hits.length === 0 && <div className="faint pad">Nothing in the notes.</div>}
              {hits.map((h, i) => (
                <button key={i} className="mem-row" onClick={() => void use(h.file)}>
                  <span className="mem-file">{h.file}:{h.line}</span>
                  <span className="mem-text">{h.text}</span>
                  <span className="mem-act">Use as context</span>
                </button>
              ))}
            </>
          ) : (
            <>
              <div className="group">Pick up where you left off{info ? ` in ${info.project}` : ''}</div>
              {info === null && <div className="faint pad">Reading sessions...</div>}
              {info?.sessions.length === 0 && <div className="faint pad">No earlier sessions in this folder.</div>}
              {info?.sessions.slice(0, 8).map((s) => (
                <div key={s.id} className="result">
                  <span className="src skill">Session</span>
                  <div className="result-main">
                    <div className="result-top">
                      <span className="result-name">{s.title}</span>
                      <span className="faint">{ago(s.at)}</span>
                      {s.branch && <span className="pill">{s.branch}</span>}
                    </div>
                    {s.firstPrompt && s.firstPrompt !== s.title && <div className="result-desc">{s.firstPrompt}</div>}
                  </div>
                  <div className="result-actions">
                    <button className="primary small" onClick={() => props.onResume(s.id)}>Resume</button>
                  </div>
                </div>
              ))}
              {info?.vault && (
                <>
                  <div className="group">Session notes in the vault</div>
                  {info.notes.length === 0 && <div className="faint pad">No notes for this project yet.</div>}
                  {info.notes.slice(0, 8).map((n) => (
                    <div key={n.file} className="result">
                      <span className="src plugin">Note</span>
                      <div className="result-main">
                        <div className="result-top">
                          <span className="result-name">{n.title}</span>
                          <span className="faint">{n.date}</span>
                        </div>
                        {n.excerpt && <div className="result-desc">{n.excerpt}</div>}
                      </div>
                      <div className="result-actions">
                        <button className="small" onClick={() => void use(n.file)}>Use as context</button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
        )}
      </div>
    </div>
  )
}

/** The two memories Claude reads: the project's note (this app and token-kit) and the folder's CLAUDE.md. */
function DocEditor({ cwd }: { cwd: string }) {
  const [kind, setKind] = useState<'note' | 'claude'>('note')
  const [doc, setDoc] = useState<{ path: string; text: string; exists: boolean } | null>(null)
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  useEffect(() => {
    setDoc(null)
    setMsg('')
    window.stm.memoryDoc(kind, cwd).then(
      (d) => {
        setDoc(d)
        setText(d.text)
      },
      (e) => setMsg(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)),
    )
  }, [kind, cwd])
  const dirty = doc !== null && text !== doc.text
  const save = async () => {
    if (!dirty) return
    try {
      await window.stm.memorySaveDoc(kind, cwd, text)
      setDoc({ ...doc!, text, exists: true })
      setMsg('Saved. New panels read it; open ones pick it up after a restart.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <div className="doc-edit">
      <div className="doc-bar">
        <div className="segmented">
          <button aria-selected={kind === 'note'} onClick={() => setKind('note')}>Project note</button>
          <button aria-selected={kind === 'claude'} onClick={() => setKind('claude')}>CLAUDE.md</button>
        </div>
        <span className="faint doc-path">{doc ? `${doc.path}${doc.exists ? '' : ' (new)'}` : ''}</span>
        <button className="primary small" disabled={!dirty} onClick={() => void save()}>{dirty ? 'Save' : 'Saved'}</button>
      </div>
      <textarea
        className="doc-text"
        value={text}
        disabled={doc === null}
        spellCheck={false}
        placeholder={kind === 'claude' ? 'Rules Claude Code follows in this folder: commands, conventions, what not to do.' : 'State, decisions and next steps of this project.'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault()
            void save()
          }
        }}
      />
      {msg && <div className="faint doc-msg">{msg}</div>}
    </div>
  )
}
