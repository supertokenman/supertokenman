import { useEffect, useMemo, useState } from 'react'
import { IconClose } from './icons'
import type { Inventory } from '../electron/inventory'
import { StateMark } from './StateMark'
import { clean } from './errors'
import { count } from '../shared/plural'
import './bridge'

type Extracted = Awaited<ReturnType<typeof window.stm.design.extract>>
const close = (
  <IconClose />
)

/**
 * Design: a reference page's style read as tokens (colors by how much they cover, fonts, type scale,
 * radii, spacing, shadows) to hand to Claude, and the project's components with their props and uses,
 * the look-alikes and the ones nothing uses.
 */
export function DesignSheet(props: { cwd?: string; onClose: () => void; onSend: (text: string) => void }) {
  const [tab, setTab] = useState<'style' | 'components'>('style')
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet design" role="dialog" aria-label="Design">
        <header className="sheet-head">
          <div className="sheet-title">Design</div>
          <div className="segmented small" role="tablist">
            <button role="tab" aria-selected={tab === 'style'} onClick={() => setTab('style')}>Style from a page</button>
            <button role="tab" aria-selected={tab === 'components'} onClick={() => setTab('components')}>Components</button>
          </div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>{close}</button>
        </header>
        {tab === 'style' ? <Style onSend={(t) => (props.onSend(t), props.onClose())} /> : <Components cwd={props.cwd} onSend={(t) => (props.onSend(t), props.onClose())} />}
      </div>
    </div>
  )
}

function Style(props: { onSend: (text: string) => void }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [out, setOut] = useState<Extracted | null>(null)
  const [fmt, setFmt] = useState<'css' | 'tailwind'>('css')
  const read = async () => {
    setBusy(true)
    setErr('')
    try {
      setOut(await window.stm.design.extract(url.trim()))
    } catch (e) {
      setErr(clean(e))
    }
    setBusy(false)
  }
  const code = out ? (fmt === 'css' ? out.css : out.tailwind) : ''
  return (
    <div className="dsg-body">
      <div className="dep-row">
        <label htmlFor="dsg-url" className="sp-label">Page</label>
        <input id="dsg-url" value={url} placeholder="https://linear.app" onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && url.trim() && void read()} />
        <button className="primary small" disabled={busy || !url.trim()} onClick={() => void read()}>{busy ? <><StateMark state="busy" label="Reading" /> Reading…</> : 'Read its style'}</button>
      </div>
      <div className="faint">The page opens in a hidden window with a fresh session (none of your logins), and the app measures what it shows. Use it for inspiration and your own pages; a brand's look belongs to that brand.</div>
      {err && <div className="notice error">{err}</div>}
      {out && (
        <div className="dsg-grid">
          <figure className="dsg-shot">
            <img src={out.shot} alt={`The page ${out.title}`} />
            <figcaption>{out.title} · {out.elements} elements read</figcaption>
          </figure>
          <div className="dsg-tokens">
            <div className="sp-label">Colors · by how much of the page they cover</div>
            <div className="dsg-swatches">
              {out.tokens.colors.map((c) => (
                <div key={c.name} className="dsg-sw">
                  <i style={{ background: c.value }} aria-hidden />
                  <b>{c.name}</b>
                  <code>{c.value}</code>
                  {c.share > 0 && <span className="faint">{c.share}%</span>}
                </div>
              ))}
            </div>
            <div className="sp-label">Type</div>
            <div className="dsg-type">
              {out.tokens.fonts.map((f) => <div key={f.role}><span className="faint">{f.role}</span> <b style={{ fontFamily: `"${f.family}", system-ui` }}>{f.family}</b></div>)}
              <div className="dsg-scale">{out.tokens.sizes.map((s) => <span key={s} style={{ fontSize: Math.min(s, 40) }}>{s}</span>)}</div>
            </div>
            <div className="sp-label">Radii · spacing</div>
            <div className="dsg-shapes">
              {out.tokens.radii.map((r) => <i key={r} className="dsg-r" style={{ borderRadius: Math.min(r, 24) }} title={`${r >= 9999 ? 'pill' : `${r}px`}`}>{r >= 9999 ? 'pill' : r}</i>)}
              <span className="faint">{out.tokens.spacing.join(' · ')} px</span>
            </div>
          </div>
          <div className="dsg-code">
            <div className="segmented small" role="tablist">
              <button role="tab" aria-selected={fmt === 'css'} onClick={() => setFmt('css')}>CSS variables</button>
              <button role="tab" aria-selected={fmt === 'tailwind'} onClick={() => setFmt('tailwind')}>Tailwind</button>
            </div>
            <pre className="tr-text">{code}</pre>
            <div className="sbx-actions">
              <button className="ghost small" onClick={() => void navigator.clipboard.writeText(code).catch(() => undefined)}>Copy</button>
              <button className="primary small" onClick={() => props.onSend(`Tokens read from ${out.url} (colors weighted by how much of the page they cover, the type scale, radii and spacing):\n\n\`\`\`${fmt === 'css' ? 'css' : 'js'}\n${code}\`\`\`\n\nAdapt this project's styles to these tokens: put them where the project keeps its theme, then use them instead of hard-coded values. Keep this project's own content and layout; take the feel, not the brand. Show me the changes before touching more than the theme file.`)}>Send to Claude</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Components(props: { cwd?: string; onSend: (text: string) => void }) {
  const [inv, setInv] = useState<Inventory | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const cwd = props.cwd ?? ''
  useEffect(() => void (cwd && window.stm.design.inventory(cwd).then(setInv, (e) => setErr(clean(e)))), [cwd])
  const shown = useMemo(() => (inv?.components ?? []).filter((c) => !q || `${c.name} ${c.file}`.toLowerCase().includes(q.toLowerCase())), [inv, q])
  if (!cwd) return <div className="dsg-body faint">Open a panel in a project first.</div>
  if (err) return <div className="dsg-body"><div className="notice error">{err}</div></div>
  if (!inv) return <div className="dsg-body faint">Reading the project…</div>
  return (
    <div className="dsg-body">
      <div className="sp-label">{count(inv.components.length, 'component')} in {count(inv.files, 'file')} · {inv.lookalikes.length} look-alike groups · {inv.unused.length} unused</div>
      {inv.lookalikes.length > 0 && (
        <div className="dsg-alike">
          {inv.lookalikes.map((g) => (
            <div key={g.key} className="dsg-alike-row">
              <StateMark state="warn" label="Look-alikes" />
              <span>{g.names.join(', ')} look like the same {g.key}</span>
              <span className="spacer-flex" />
              <button className="ghost small" onClick={() => void window.stm.design.consolidate(cwd, g.key).then(props.onSend)}>Ask Claude to compare</button>
            </div>
          ))}
        </div>
      )}
      {inv.unused.length > 0 && <div className="faint">Nothing uses: {inv.unused.join(', ')}. Check before deleting; something outside the project may.</div>}
      <input className="dsg-filter" id="dsg-filter" value={q} placeholder={`Filter ${inv.components.length} components`} onChange={(e) => setQ(e.target.value)} />
      <div className="dsg-table">
        <table>
          <thead><tr><th>Component</th><th>Props</th><th className="num">Uses</th><th>File</th></tr></thead>
          <tbody>
            {shown.slice(0, 300).map((c) => (
              <tr key={`${c.file}:${c.name}`} className={inv.unused.includes(c.name) ? 'unused' : ''}>
                <td><b>{c.name}</b></td>
                <td className="dsg-props">{c.props.join(', ') || <span className="faint">none</span>}</td>
                <td className="num">{c.uses}{c.refs ? <span className="faint"> +{c.refs}</span> : null}</td>
                <td className="dsg-file" title={c.usedIn.join('\n')}>{c.file}:{c.line}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
