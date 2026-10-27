import { useEffect, useRef, useState, type ComponentType } from 'react'
import * as Icons from './icons'
import { StateMark, type MarkState } from './StateMark'
import { Chart, Meter, Sparkline, Stat } from './Chart'
import './bridge'
import { appliedColors, matrix } from './themeContrast'
import { checkIcon, type Finding } from '../shared/iconcheck'
import { Checkbox, Select } from './ui'

const MOVING = new Set(['IconSearch', 'IconCopy', 'IconCheck', 'IconMerge', 'IconDeploy', 'IconExternal', 'IconHistory', 'IconTest'])
const TOKENS = ['--bg', '--surface', '--raised', '--sunken', '--hover', '--border-strong', '--text', '--muted', '--faint', '--accent', '--accent-hover', '--deep', '--green', '--red', '--gold', '--blue', '--s0', '--s1', '--s2', '--s3', '--s4', '--s5']
const STATES: MarkState[] = ['up', 'busy', 'warn', 'down', 'off']

/**
 * The design system, live: the same components the app uses, in the current theme. What docs/BRAND.md
 * describes, here to look at: colours, type, buttons in every kind, fields, the icon set (still and
 * moving), state marks and notices.
 */
export function DesignSystemSheet(props: { onClose: () => void }) {
  const [force, setForce] = useState(false)
  const [q, setQ] = useState('')
  const [checks, setChecks] = useState<Record<string, Finding[]>>({})
  const iconsRef = useRef<HTMLDivElement>(null)
  // each icon checked as it renders here, from its real SVG
  useEffect(() => {
    const next: Record<string, Finding[]> = {}
    for (const b of Array.from(iconsRef.current?.querySelectorAll<HTMLElement>('[data-icon]') ?? [])) next[b.dataset.icon!] = checkIcon(b.querySelector('svg')?.outerHTML ?? '')
    setChecks((o) => ({ ...o, ...next }))
  }, [q])
  const icons = Object.entries(Icons).filter(([n]) => n.startsWith('Icon')) as [string, ComponentType][]
  const val = (t: string) => getComputedStyle(document.documentElement).getPropertyValue(t).trim()
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe ds" role="dialog" aria-label="Design system">
        <header className="sheet-head">
          <div className="sheet-title">Design system</div>
          <span className="faint">live, in this theme · described in docs/BRAND.md</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><Icons.IconClose /></button>
        </header>
        <div className="ds-body">
          <section>
            <h3 className="ds-h">Colour</h3>
            <div className="ds-swatches">
              {TOKENS.map((t) => (
                <div key={t} className="ds-swatch"><i style={{ background: `var(${t})` }} /><code>{t}</code><span className="faint">{val(t)}</span></div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="ds-h">Contrast</h3>
            <div className="faint">WCAG 2.2 in this theme: 4.5 for text, 3 for large text, icons and lines. A test fails any theme under these.</div>
            <table className="ds-contrast">
              <thead><tr><th>Pair</th><th>Used for</th><th>Ratio</th><th>Grade</th></tr></thead>
              <tbody>
                {matrix(appliedColors(val)).map((r) => (
                  <tr key={`${r.fg}-${r.bg}`} className={r.ok ? '' : 'bad'}>
                    <td><span className="ds-pair" style={{ background: r.bgHex, color: r.fgHex }}>Aa</span><code>{r.fg} / {r.bg}</code></td>
                    <td className="faint">{r.use}</td>
                    <td className="num">{r.ratio.toFixed(2)}<span className="faint"> / {r.min}</span></td>
                    <td><span className={`ds-grade ${r.ok ? 'ok' : 'bad'}`}>{r.ok ? r.grade : 'Under'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h3 className="ds-h">Type</h3>
            <div className="ds-type">
              <div className="sheet-title">SuperToken Display · titles</div>
              <div style={{ font: '15px var(--ui-font)' }}>UI sans · running text and controls, about 65 characters a line.</div>
              <div style={{ font: '13px var(--mono)' }}>Mono · code, paths, numbers 0123456789</div>
              <span className="fld"><span className="fld-label">Mono label · uppercase, 0.08em</span></span>
            </div>
          </section>

          <section>
            <h3 className="ds-h">Buttons</h3>
            <div className="ds-row">
              <button>Default</button>
              <button className="primary">Primary</button>
              <button className="danger">Danger</button>
              <button className="ghost">Ghost</button>
              <button disabled>Disabled</button>
              <button className="icon" aria-label="Icon button"><Icons.IconClose /></button>
            </div>
            <div className="ds-row">
              <button className="small">Small</button>
              <button className="primary small"><Icons.IconCheck />Small primary</button>
              <button className="small"><Icons.IconTest />With icon</button>
              <button className="ghost small"><Icons.IconTrash />Ghost small</button>
            </div>
            <div className="faint">Hover lifts the fill; pressed shows a bar at the bottom; Tab shows a bar on the left. Destructive or outward actions take two steps: the button, then a confirm in place.</div>
            <div className="ds-row">
              <span className="ds-two"><button className="small">Approve</button><span className="faint">then</span><button className="ghost small">Cancel</button><button className="primary small"><Icons.IconCheck />Write the skill</button></span>
            </div>
          </section>

          <section>
            <h3 className="ds-h">Fields</h3>
            <div className="fld-grid">
              <label className="fld"><span className="fld-label">Text</span><input placeholder="Placeholder" /></label>
              <label className="fld"><span className="fld-label">Filled</span><input defaultValue="~/code/app" /></label>
              <label className="fld"><span className="fld-label">Select</span><Select defaultValue="b"><option value="a">This project</option><option value="b">Every project</option></Select></label>
              <label className="fld"><span className="fld-label">Disabled</span><input disabled defaultValue="read only" /></label>
              <label className="fld wide"><span className="fld-label">Textarea <span className="fld-kind">markdown</span></span><textarea rows={3} defaultValue={'## Steps\n1. Run `npm test`'} /><span className="fld-help">Help text under a field says what it is for.</span></label>
              <label className="check wide"><Checkbox defaultChecked /> A checkbox, label in plain text</label>
            </div>
            <div className="faint">Cut corner with the border drawn along it; focus is a 3px accent bar on the left, never an outline.</div>
          </section>

          <section>
            <h3 className="ds-h">Icons <span className="faint">{icons.length} · 16px grid, 1.5px stroke, currentColor</span></h3>
            <div className="ds-row">
              <input className="ds-filter" placeholder="Filter icons" value={q} onChange={(e) => setQ(e.target.value)} />
              <label className="check"><Checkbox checked={force} onChange={(e) => setForce(e.target.checked)} /> Play the motion on all</label>
            </div>
            <div className={`ds-icons ${force ? 'ds-force' : ''}`} ref={iconsRef}>
              {icons.filter(([n]) => n.toLowerCase().includes(q.toLowerCase())).map(([n, C]) => (
                <button key={n} className={`ds-icon ${MOVING.has(n) ? 'moving' : ''} ${checks[n]?.length ? 'flag' : ''}`} data-tip={[MOVING.has(n) ? `${n}: moves on hover` : n, ...(checks[n] ?? []).map((f) => f.detail)].join('\n')} data-icon={n}>
                  <C />
                  {(checks[n]?.length ?? 0) > 0 && <i className="ds-flag">{checks[n]!.length}</i>}
                  <span>{n.replace(/^Icon/, '')}</span>
                  {MOVING.has(n) && <em>moves</em>}
                </button>
              ))}
            </div>
            <div className="faint">Checked live: 16 px box, 1.5 stroke in currentColor, no fixed colours, straight lines at multiples of 45°. A number on an icon counts lines off 45° (hover for each); a test keeps that total from growing. {Object.values(checks).reduce((a, f) => a + f.length, 0)} lines flagged in {Object.values(checks).filter((f) => f.length).length} icons.</div>
            <div className="faint">Moving icons react on hover of their button (or when the action lands) and stand still under reduced motion.</div>
          </section>

          <section>
            <h3 className="ds-h">Charts <span className="faint">own SVG · series colours --s0..--s5 in fixed order · one axis per chart</span></h3>
            <div className="ds-row">
              <Stat label="Spent today" value={4.82} unit="US$" change={-12.4} trend={[6.1, 5.4, 5.9, 5.2, 4.9, 5.3, 4.8]} />
              <Stat label="Turns" value={128} change={8.2} trend={[90, 96, 101, 99, 112, 118, 128]} />
              <span className="ds-state"><Sparkline values={[3, 5, 4, 7, 6, 9, 8, 11]} label="Trend" index={1} /><code>sparkline</code></span>
            </div>
            <div className="ds-meters">
              <Meter label="5h quota" value={42} max={100} unit="%" />
              <Meter label="Budget, project" value={8.4} max={10} unit="US$" />
              <Meter label="Context" value={210} max={200} unit="k tokens" />
            </div>
            <div className="ds-charts">
              <Chart kind="bar" label="Orders by status" series={[{ name: 'this week', points: [['new', 14], ['paid', 31], ['shipped', 22], ['refunded', 3]] }, { name: 'last week', points: [['new', 11], ['paid', 27], ['shipped', 25], ['refunded', 5]] }]} height={220} />
              <Chart kind="line" time label="Requests per hour" unit="req" series={[{ name: 'requests', points: Array.from({ length: 24 }, (_, i) => [Date.UTC(2026, 9, 25, i), Math.round(120 + 80 * Math.sin(i / 3) + (i % 5) * 9)] as [number, number]) }]} height={220} />
            </div>
          </section>

          <section>
            <h3 className="ds-h">State marks</h3>
            <div className="ds-row">
              {STATES.map((s) => <span key={s} className="ds-state"><StateMark state={s} size="md" label={s} /><code>{s}</code></span>)}
            </div>
          </section>

          <section>
            <h3 className="ds-h">Notices and chips</h3>
            <div className="notice">A notice tells what happened or what a click will do.</div>
            <div className="notice error">An error says what failed and what to do next.</div>
            <div className="ds-row">
              <span className="remote-chip"><Icons.IconRemote />box<span className="faint">fan</span></span>
              <span className="is-label">bug</span>
              <span className="term-tip-tag">Tip</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
