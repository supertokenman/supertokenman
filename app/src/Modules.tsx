import { CORE, MODULES } from '../shared/modules'
import { IconCheck, IconClose } from './icons'

/**
 * Modules: the core of the app stays; each optional module can be switched off, and its screens leave
 * the palette. Nothing is deleted.
 */
export function ModulesSheet(props: { off: string[]; onChange: (off: string[]) => void; onClose: () => void }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe md" role="dialog" aria-label="Modules">
        <header className="sheet-head">
          <div className="sheet-title">Modules</div>
          <span className="faint">{MODULES.length - props.off.length} of {MODULES.length} optional modules on</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="ar-pad">
          <section className="md-core">
            <span className="chart-name">Always on: the core</span>
            <ul>{CORE.map((c) => <li key={c}><IconCheck />{c}</li>)}</ul>
          </section>
          <div className="md-grid">
            {MODULES.map((m) => {
              const on = !props.off.includes(m.id)
              return (
                <label key={m.id} className={`md-mod ${on ? 'on' : ''}`}>
                  <span className="md-head"><b>{m.name}</b><input type="checkbox" checked={on} onChange={(e) => props.onChange(e.target.checked ? props.off.filter((x) => x !== m.id) : [...props.off, m.id])} aria-label={`${m.name} on`} /></span>
                  <span className="faint">{m.what}</span>
                  <span className="md-cmds">{m.commands.length} screens</span>
                </label>
              )
            })}
          </div>
          <div className="faint">A module that is off keeps its data and settings; turning it back on brings it back as it was.</div>
        </div>
      </div>
    </div>
  )
}
