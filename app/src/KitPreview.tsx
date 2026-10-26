import type { Kit } from './designKits'

/** A small product drawn in the kit: navbar, hero, form, pricing, table, badges, toast. */
export function KitPreview({ kit, accent }: { kit: Kit; accent?: string }) {
  const t = kit.t
  const vars = {
    '--k-bg': t.bg,
    '--k-surface': t.surface,
    '--k-text': t.text,
    '--k-muted': t.muted,
    '--k-border': t.border,
    '--k-accent': accent ?? t.accent,
    '--k-on': t.onAccent,
    '--k-accent2': t.accent2,
    '--k-radius': `${t.radius}px`,
    '--k-bw': `${t.borderWidth}px`,
    '--k-shadow': t.shadow,
    '--k-space': `${t.space}px`,
    '--k-font': t.font,
    '--k-heading': t.heading,
    '--k-weight': t.weight,
    '--k-case': t.upper ? 'uppercase' : 'none',
  } as React.CSSProperties
  const cut = kit.id === 'constructivist' ? ' cut' : ''
  return (
    <div className={`kp${cut}`} style={vars} aria-label={`${kit.name} preview`}>
      <nav className="kp-nav">
        <span className="kp-logo">Acme</span>
        <span className="kp-links"><span>Product</span><span>Pricing</span><span>Docs</span></span>
        <span role="button" className="kp-btn kp-g">Sign in</span>
        <span role="button" className="kp-btn kp-p">Start free</span>
      </nav>
      <section className="kp-hero">
        <span className="kp-badge">New · v2.0</span>
        <h2>Ship the boring parts faster</h2>
        <p>Billing, auth and dashboards your customers trust, set up in an afternoon.</p>
        <div className="kp-row">
          <span role="button" className="kp-btn kp-p">Create account</span>
          <span role="button" className="kp-btn kp-s">Book a demo</span>
        </div>
      </section>
      <div className="kp-grid">
        <div className="kp-card">
          <h3>Sign up</h3>
          <label>Work email<input readOnly value="ana@acme.com" /></label>
          <label className="err">Password<input readOnly type="password" value="1234" /><small>At least 8 characters.</small></label>
          <span role="button" className="kp-btn kp-p kp-wide">Continue</span>
        </div>
        <div className="kp-pricing">
          {[['Starter', 'R$0', 'For trying it out'], ['Pro', 'R$49', 'For small teams'], ['Business', 'R$199', 'For growing companies']].map(([n, p, d], i) => (
            <div key={n} className={`kp-tier ${i === 1 ? 'hot' : ''}`}>
              {i === 1 && <span className="kp-badge solid">Popular</span>}
              <h4>{n}</h4>
              <div className="kp-price">{p}<small>/mo</small></div>
              <p>{d}</p>
              <span role="button" className={`kp-btn ${i === 1 ? 'kp-p' : 'kp-s'} kp-wide`}>Choose</span>
            </div>
          ))}
        </div>
      </div>
      <div className="kp-grid two">
        <div className="kp-card flush">
          <table className="kp-table">
            <thead><tr><th>Customer</th><th>Status</th><th className="num">MRR</th></tr></thead>
            <tbody>
              <tr><td>Padaria Sol</td><td><span className="kp-badge ok">Active</span></td><td className="num">R$ 490</td></tr>
              <tr><td>Studio Ipê</td><td><span className="kp-badge">Trial</span></td><td className="num">R$ 0</td></tr>
              <tr><td>Clínica Mar</td><td><span className="kp-badge warn">Past due</span></td><td className="num">R$ 1.990</td></tr>
            </tbody>
          </table>
        </div>
        <div className="kp-stack">
          <div className="kp-stat"><span>Revenue</span><strong>R$ 12.480</strong><em>+8.2% this month</em></div>
          <div className="kp-toast"><span className="kp-dot" />Invoice sent to Padaria Sol.<span role="button" className="kp-btn kp-g kp-sm">Undo</span></div>
        </div>
      </div>
    </div>
  )
}
