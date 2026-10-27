import { useMemo, useState } from 'react'
import type { DbConn } from '../electron/db'
import { buildUrl, fieldsFor, parseUrl, PRESETS, presetFor, type Fields, type Preset } from '../shared/dbconn'

/** An engine's drawn mark: a cut tile with its monogram, the driver family as a rule under it. */
export function EngineMark({ p }: { p: Preset }) {
  return (
    <svg className={`dbc-mark ${p.kind}`} width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <path d="M0.5 0.5H26L33.5 8V33.5H0.5Z" className="tile" />
      <text x="16" y="21" textAnchor="middle" className="mono-mark">{p.mark}</text>
      <path d="M7 27.5H27" className={`rule ${p.kind}`} />
    </svg>
  )
}

/**
 * New or edit connection: engines and hosted services as cards, then the fields the connection string is
 * built from, or a pasted string. The password is a vault name; it never shows here.
 */
export function DbConnect(props: { editing: DbConn; isNew: boolean; secrets: string[]; onChange: (c: DbConn) => void; onSave: (c: DbConn) => void; onDelete?: () => void }) {
  const { editing } = props
  const start = useMemo(() => {
    const id = (editing.target && presetFor(editing.target)) || editing.kind
    const p = PRESETS.find((x) => x.id === id && x.kind === editing.kind) ?? PRESETS.find((x) => x.kind === editing.kind)!
    const parsed = editing.target ? parseUrl(editing.kind, editing.target) : fieldsFor(p)
    return { p, fields: parsed ?? fieldsFor(p), paste: !!editing.target && !parsed }
    // only when another connection is opened in the form
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing.id])
  const [preset, setPreset] = useState<Preset>(start.p)
  const [f, setF] = useState<Fields>(start.fields)
  const [paste, setPaste] = useState(start.paste)
  const built = buildUrl(preset.kind, f)
  const target = paste ? editing.target : built

  const choose = (p: Preset) => {
    setPreset(p)
    setF(fieldsFor(p))
    setPaste(false)
    props.onChange({ ...editing, kind: p.kind, target: '' })
  }
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const toPaste = () => {
    setPaste(true)
    props.onChange({ ...editing, target: built })
  }
  const toFields = () => {
    const parsed = parseUrl(preset.kind, editing.target)
    if (parsed) setF(parsed)
    setPaste(false)
  }
  const onPaste = (v: string) => {
    const id = presetFor(v)
    const p = id && PRESETS.find((x) => x.id === id)
    if (p && p.kind === preset.kind && p.id !== preset.id && preset.id === preset.kind) setPreset(p)
    props.onChange({ ...editing, target: v })
  }
  const vaultNames = props.secrets
  const h = preset.hints ?? {}
  const canTunnel = preset.kind === 'postgres' || preset.kind === 'mysql' || preset.kind === 'tidb'

  return (
    <div className="dbc cutfields">
      <div className="dbc-head">
        <div className="sp-label">{props.isNew ? 'New connection' : 'Edit connection'}</div>
        <span className="faint">Engines this app can open, and hosted services that run them.</span>
      </div>
      <div className="dbc-cards" role="radiogroup" aria-label="Engine">
        {PRESETS.map((p) => (
          <button key={p.id} role="radio" aria-checked={preset.id === p.id} className={`dbc-card ${preset.id === p.id ? 'on' : ''}`} onClick={() => choose(p)}>
            <EngineMark p={p} />
            <span className="dbc-card-text">
              <b>{p.label}</b>
              <span>{p.about}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="faint dbc-later">Not supported yet: MongoDB, Redis, ClickHouse, Turso (libSQL).</div>

      <div className="dbc-form">
        <label className="fld wide">
          <span className="fld-label">Name</span>
          <input value={editing.name} placeholder={`${preset.label} (Production, Local…)`} onChange={(e) => props.onChange({ ...editing, name: e.target.value })} />
        </label>

        {preset.where && <div className="fld-help dbc-where"><b>Where to find it:</b> {preset.where}</div>}
        {preset.kind === 'tidb' && <div className="fld-help">TiDB has no read-only session: while writes are off, the app refuses any statement that does not only read.</div>}
        {preset.kind === 'd1' && <div className="fld-help">Writes are refused before they reach D1 while they are off.</div>}

        {paste ? (
          <label className="fld wide">
            <span className="fld-label">Connection string</span>
            <input className="mono" value={editing.target} spellCheck={false} autoFocus placeholder={preset.kind === 'sqlite' ? '/Users/you/project/dev.db' : preset.kind === 'd1' ? 'd1://ACCOUNT_ID/DATABASE_ID?token={{CLOUDFLARE_API_TOKEN}}' : `${preset.kind === 'postgres' ? 'postgres' : 'mysql'}://user:{{DB_PASSWORD}}@host:port/db  or  {{DATABASE_URL}}`} onChange={(e) => onPaste(e.target.value)} />
            {preset.kind === 'postgres' && vaultNames.some((n) => /DATABASE_URL|_URL$/.test(n)) && (
              <span className="dbc-chips">
                From the vault:
                {vaultNames.filter((n) => /URL/.test(n)).map((n) => <button key={n} type="button" className="ghost small" onClick={() => props.onChange({ ...editing, target: `{{${n}}}` })}>{`{{${n}}}`}</button>)}
              </span>
            )}
          </label>
        ) : preset.kind === 'sqlite' ? (
          <label className="fld wide">
            <span className="fld-label">File</span>
            <input className="mono" value={f.path} spellCheck={false} placeholder="/Users/you/project/dev.db" onChange={set('path')} />
          </label>
        ) : preset.kind === 'd1' ? (
          <div className="dbc-grid">
            <label className="fld"><span className="fld-label">Account id</span><input value={f.account} spellCheck={false} placeholder="0123456789abcdef…" onChange={set('account')} /></label>
            <label className="fld"><span className="fld-label">Database id</span><input value={f.dbId} spellCheck={false} placeholder="xxxxxxxx-xxxx-…" onChange={set('dbId')} /></label>
            <label className="fld wide"><span className="fld-label">API token, from the vault</span><input value={f.secret} list="dbc-vault" spellCheck={false} placeholder="CLOUDFLARE_API_TOKEN" onChange={set('secret')} /></label>
          </div>
        ) : (
          <div className="dbc-grid">
            <label className="fld host"><span className="fld-label">Host</span><input value={f.host} spellCheck={false} placeholder={h.host ?? 'db.example.com or 127.0.0.1'} onChange={set('host')} /></label>
            <label className="fld port"><span className="fld-label">Port</span><input value={f.port} inputMode="numeric" spellCheck={false} placeholder={h.port ?? ''} onChange={set('port')} /></label>
            <label className="fld"><span className="fld-label">Database</span><input value={f.database} spellCheck={false} placeholder={h.database ?? ''} onChange={set('database')} /></label>
            <label className="fld"><span className="fld-label">User</span><input value={f.user} spellCheck={false} placeholder={h.user ?? ''} onChange={set('user')} /></label>
            <label className="fld">
              <span className="fld-label">Password, from the vault <span className="fld-kind">{f.secret && !vaultNames.includes(f.secret) ? 'not in the vault yet' : ''}</span></span>
              <input value={f.secret} list="dbc-vault" spellCheck={false} placeholder="DB_PASSWORD" onChange={set('secret')} />
            </label>
            <label className="check dbc-ssl"><input type="checkbox" checked={f.ssl} onChange={set('ssl')} /><span>TLS, with the certificate checked</span></label>
          </div>
        )}
        <datalist id="dbc-vault">{vaultNames.map((n) => <option key={n} value={n} />)}</datalist>

        {!paste && preset.kind !== 'sqlite' && (
          <div className="dbc-url">
            <span className="fld-label">Connection string</span>
            <code>{built || <span className="faint">Fill in the fields above.</span>}</code>
          </div>
        )}
        {preset.kind !== 'sqlite' && <button type="button" className="ghost small dbc-switch" onClick={paste ? toFields : toPaste}>{paste ? 'Fill in fields instead' : 'Paste a URL instead'}</button>}

        {canTunnel && (
          <label className="fld wide">
            <span className="fld-label">Through SSH <span className="fld-kind">optional</span></span>
            <input value={editing.ssh ?? ''} spellCheck={false} placeholder="user@bastion.example.com:22, with your own keys" onChange={(e) => props.onChange({ ...editing, ssh: e.target.value })} />
          </label>
        )}
        <label className="check dbc-writes">
          <input type="checkbox" checked={editing.writes} onChange={(e) => props.onChange({ ...editing, writes: e.target.checked })} />
          <span>Allow writes (insert, update, delete). Off, the database refuses any change.</span>
        </label>
        <div className="dbv-row">
          <button className="primary" disabled={!target.trim()} onClick={() => props.onSave({ ...editing, kind: preset.kind, target, name: editing.name.trim() || preset.label })}>Save and connect</button>
          {props.onDelete && <button className="ghost" onClick={props.onDelete}>Delete</button>}
        </div>
        <div className="faint dbv-note">The password stays in the vault (Connections, Vault) and is written here as {'{{NAME}}'}: it is filled in only when connecting and never shows in this window.</div>
      </div>
    </div>
  )
}
