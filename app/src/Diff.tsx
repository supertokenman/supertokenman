import { useState } from 'react'
import type { FileEdit } from '../electron/diff'
import { reviewMessage, type ReviewComment } from '../shared/review'

type Comments = Record<string, ReviewComment>
type CommentProps = { comments?: Comments; onComment?: (key: string, c: ReviewComment | null) => void }

/** A file edit as a unified diff: red lines out, green lines in. A click on a line writes a comment on it. */
export function Diff({ edit, cwd, comments, onComment }: { edit: FileEdit; cwd?: string } & CommentProps) {
  const name = cwd && edit.file.startsWith(cwd + '/') ? edit.file.slice(cwd.length + 1) : edit.file
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <div className="diff">
      <div className="diff-head">
        <span className="diff-file">{name}</span>
        {edit.isNew && <span className="diff-tag">new</span>}
        <span className="diff-count add">+{edit.added}</span>
        <span className="diff-count del">-{edit.removed}</span>
      </div>
      <pre className="diff-body">
        {edit.lines.map((l, i) => {
          const key = `${edit.id}:${i}`
          const fold = l.text.startsWith('...')
          const c = comments?.[key]
          return (
            <div key={i} className="diff-line-wrap">
              <div
                className={`${l.op === '+' ? 'add' : l.op === '-' ? 'del' : fold ? 'fold' : ''} ${onComment && !fold ? 'commentable' : ''} ${c ? 'has-comment' : ''}`}
                onClick={onComment && !fold ? () => setEditing(editing === key ? null : key) : undefined}
                title={onComment && !fold ? 'Comment on this line' : undefined}
              >
                <span className="op">{l.op}</span>
                {l.text || ' '}
              </div>
              {onComment && (editing === key || c) && (
                <CommentBox
                  value={c?.text ?? ''}
                  open={editing === key}
                  onOpen={() => setEditing(key)}
                  onSave={(text) => {
                    onComment(key, text.trim() ? { file: edit.file, op: l.op as ReviewComment['op'], line: l.text, text } : null)
                    setEditing(null)
                  }}
                />
              )}
            </div>
          )
        })}
      </pre>
    </div>
  )
}

function CommentBox(props: { value: string; open: boolean; onOpen: () => void; onSave: (text: string) => void }) {
  const [text, setText] = useState(props.value)
  if (!props.open)
    return (
      <button className="diff-comment saved" onClick={props.onOpen}>
        {props.value}
      </button>
    )
  return (
    <div className="diff-comment">
      <textarea
        autoFocus
        rows={2}
        value={text}
        placeholder="What should change here?"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            props.onSave(text)
          }
          if (e.key === 'Escape') props.onSave(props.value)
        }}
      />
      <span className="faint">Enter saves · empty removes</span>
    </div>
  )
}

/** Every edit of the session, newest first, grouped by file; comments on its lines go back to Claude. */
export function Changes({ changes, cwd, onSend }: { changes: FileEdit[]; cwd: string; onSend?: (text: string) => void }) {
  const [comments, setComments] = useState<Comments>({})
  if (!changes.length) return <div className="note">No file changes yet.</div>
  const files = [...new Set(changes.map((c) => c.file))]
  const count = Object.keys(comments).length
  return (
    <div className="changes">
      <div className="changes-sum">
        {`${files.length} file${files.length === 1 ? '' : 's'}  ·  `}
        <span className="add">+{changes.reduce((n, c) => n + c.added, 0)}</span>{' '}
        <span className="del">-{changes.reduce((n, c) => n + c.removed, 0)}</span>
        {onSend && <span className="faint">  ·  click a line to comment on it</span>}
      </div>
      {[...changes].reverse().map((c) => (
        <Diff key={c.id} edit={c} cwd={cwd} comments={comments} onComment={onSend ? (key, cm) => setComments((x) => { const { [key]: _, ...rest } = x; return cm ? { ...rest, [key]: cm } : rest }) : undefined} />
      ))}
      {onSend && count > 0 && (
        <div className="review-bar">
          <span>{count === 1 ? '1 comment' : `${count} comments`} on these changes</span>
          <button className="ghost small" onClick={() => setComments({})}>Clear</button>
          <button className="primary small" onClick={() => {
            const text = reviewMessage(Object.values(comments), cwd)
            if (!text) return
            onSend(text)
            setComments({})
          }}>Send to Claude</button>
        </div>
      )}
    </div>
  )
}
