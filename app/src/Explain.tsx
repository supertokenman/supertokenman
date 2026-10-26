import { useEffect } from 'react'
import { IconClose } from './icons'
import { Markdown } from './markdown'
import { StateMark } from './StateMark'
import { EXPLAIN, useLocalStream } from './localStream'

/** What went wrong in some output, explained by the local model as it streams; free, nothing leaves the Mac. */
export function ExplainBox(props: { output: string; onClose: () => void; onAsk?: (text: string) => void }) {
  const s = useLocalStream()
  useEffect(() => {
    void s.run([{ role: 'system', content: EXPLAIN }, { role: 'user', content: props.output.slice(-16_000) }], 'explain')
    const k = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', k)
    return () => (s.stop(), window.removeEventListener('keydown', k))
    // runs once per box
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="explain" role="dialog" aria-label="Explanation">
      <div className="explain-head">
        <StateMark state={s.error ? 'down' : s.busy ? 'busy' : 'up'} label={s.busy ? 'Reading' : s.error ? 'Failed' : 'Done'} />
        <span className="sp-label">Explained on this Mac</span>
        <span className="spacer-flex" />
        {!s.busy && s.text && props.onAsk && <button className="ghost small" onClick={() => props.onAsk!(s.text)}>Ask Claude to fix it</button>}
        <button className="icon" aria-label="Close" onClick={props.onClose}>
          <IconClose />
        </button>
      </div>
      {s.error ? <div className="api-err">{s.error}</div> : <div className="explain-body msg assistant"><Markdown text={s.text || ' '} />{s.busy && <span className="caret" />}</div>}
    </div>
  )
}
