import './control.css'

/** Settings row: where the rules and the audit log open from. */
export default function ControlSettings() {
  const go = (view: 'rules' | 'audit') => window.dispatchEvent(new CustomEvent('stm:control', { detail: { view } }))
  return (
    <>
      <div className="touchid-head">Control</div>
      <div className="tid-row" data-tip="Rules say which tool calls are denied, ask first, or run without a card.">
        <span>Rules and routine limits</span>
        <button className="ghost small" onClick={() => go('rules')}>Edit rules</button>
      </div>
      <div className="tid-row" data-tip="Every tool call and what each turn changed, kept on this computer.">
        <span>Audit log</span>
        <button className="ghost small" onClick={() => go('audit')}>Open</button>
      </div>
    </>
  )
}
