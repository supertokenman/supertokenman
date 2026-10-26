import { useCallback, useEffect, useState } from 'react'
import { IconClose } from './icons'
import { StateMark } from './StateMark'
import { IntegrationMark } from './IntegrationMark'
import { friendly } from './errors'
import type { Exposure, IntegrationInfo, SecretInfo } from './bridge'

type Tab = 'integrations' | 'vault' | 'exposures'

/** Integrations to turn on, the credential vault, and where credentials showed up in chats. */
const GROUPS = ['Code', 'Cloud & data', 'Work', 'Docs', 'Design', 'Business']

const kStars = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n))

export function Connections(props: { onClose: () => void; exposures: (Exposure & { panel: string })[]; initialTab?: Tab; prefill?: { name: string } }) {
  const [tab, setTab] = useState<Tab>(props.initialTab ?? 'integrations')
  const [items, setItems] = useState<IntegrationInfo[]>([])
  const [find, setFind] = useState('')
  const [guide, setGuide] = useState<string | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)
  // GitHub stars: the ones kept from the last time the person asked; the network is used only on Show stars
  const [stars, setStars] = useState<Record<string, number>>({})
  const [starsBusy, setStarsBusy] = useState(false)
  useEffect(() => void window.stm.integrationStars().then(setStars, () => undefined), [])
  const loadStars = () => {
    setStarsBusy(true)
    void window.stm.integrationStars(true).then(setStars, () => undefined).finally(() => setStarsBusy(false))
  }
  const [webLog, setWebLog] = useState('')
  useEffect(() => window.stm.web.onLog((l) => setWebLog(l.trim().split('\n').pop()?.slice(0, 60) ?? '')), [])
  const [secrets, setSecrets] = useState<SecretInfo[]>([])
  const [form, setForm] = useState({ name: props.prefill?.name ?? '', value: '', forCommands: false })
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setItems(await window.stm.integrations())
    setSecrets(await window.stm.vaultList())
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])

  const save = async () => {
    setError('')
    try {
      await window.stm.vaultSet(form.name.trim(), form.value, form.forCommands)
      setForm({ name: '', value: '', forCommands: false })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
    }
  }
  const startAdding = (name: string) => {
    setForm({ name, value: '', forCommands: false })
    setTab('vault')
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet" role="dialog" aria-label="Connections">
        <header className="sheet-head">
          <div className="sheet-title">Connections</div>
          <div className="segmented">
            {(['integrations', 'vault', 'exposures'] as const).map((t) => (
              <button key={t} aria-selected={tab === t} onClick={() => setTab(t)}>
                {t === 'integrations' ? 'Integrations' : t === 'vault' ? 'Vault' : 'Exposures'}
                {t === 'exposures' && props.exposures.length > 0 && <span className="count">{props.exposures.length}</span>}
              </button>
            ))}
          </div>
          <span className="spacer-flex" />
          {tab === 'integrations' && (
            <button className="ghost small" disabled={starsBusy} title="Reads star counts from the public GitHub API" onClick={loadStars}>
              {starsBusy ? 'Reading stars' : 'Show GitHub stars'}
            </button>
          )}
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>

        <div className="sheet-body">
          {tab === 'integrations' && (
            <>
              <svg className="flow" viewBox="0 0 420 54" role="img" aria-label="Credentials go from the vault to the integration; the chat never sees them">
                <rect x="6" y="12" width="30" height="30" rx="4" className="flow-vault" />
                <text x="21" y="52" textAnchor="middle">vault</text>
                <path d="M44 27h70" className="flow-line" />
                <circle cx="150" cy="27" r="15" className="flow-int" />
                <text x="150" y="52" textAnchor="middle">integration</text>
                <path d="M174 27h70" className="flow-line" />
                <path d="M282 12 298 42H266z" className="flow-panel" />
                <text x="282" y="52" textAnchor="middle">new panels</text>
                <path d="M320 27h46" className="flow-cut" />
                <path d="M372 18l18 18M390 18l-18 18" className="flow-x" />
                <text x="381" y="52" textAnchor="middle">chat</text>
              </svg>
              <input className="int-find" value={find} onChange={(e) => setFind(e.target.value)} placeholder={`Search ${items.length} integrations`} spellCheck={false} />
              {GROUPS.map((g) => {
                const words = find.toLowerCase().split(/\s+/).filter(Boolean)
                const list = items.filter((it) => it.group === g && words.every((w) => `${it.name} ${it.what} ${it.group}`.toLowerCase().includes(w))).sort((a, b) => Number(b.enabled) - Number(a.enabled))
                if (!list.length) return null
                return (
              <div key={g}>
              <div className="group">{g}</div>
              <div className="cards">
                {list.map((it) => (
                  <div key={it.id} className={`card ${it.enabled ? 'on' : ''}`} title={it.what}>
                    <div className="card-top">
                      <StateMark state={it.enabled ? (it.ready ? 'up' : 'warn') : 'off'} label={it.enabled ? (it.ready ? 'On' : 'On, needs a token') : 'Off'} />
                      <IntegrationMark id={it.id} name={it.name} group={it.group} size={26} />
                      <span className="card-name" title={it.name}>{it.name}</span>
                      <span className={`auth-mark ${it.auth.kind}`} title={it.auth.kind === 'token' ? 'Token: signs in with a token you save in the vault' : it.auth.kind === 'oauth' ? 'Login: signs in through a browser login' : it.auth.kind === 'cli' ? 'CLI: uses the sign-in of its command-line tool on this Mac' : 'Free: no account needed'} aria-label={it.auth.kind}><AuthGlyph kind={it.auth.kind} /></span>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={it.enabled}
                          onChange={async (e) => {
                            await window.stm.setIntegration(it.id, e.target.checked)
                            await load()
                          }}
                        />
                        <span />
                      </label>
                    </div>
                    <div className="card-meta">
                      <span className="card-tag">{it.tag}</span>
                      {stars[it.id] ? <span className="card-stars" title={`${stars[it.id]!.toLocaleString()} stars on GitHub (${it.repo})`}>★ {kStars(stars[it.id]!)}</span> : null}
                    </div>
                    {it.engine && !it.engineReady && (
                      <div className="card-foot">
                        {installing === it.id ? (
                          <span className="busy-label"><span className="spinner" /> Installing, a few minutes{webLog ? `: ${webLog}` : ''}</span>
                        ) : (
                          <button
                            className="small"
                            onClick={async () => {
                              setInstalling(it.id)
                              setWebLog('')
                              try {
                                await window.stm.web.install()
                              } catch (e) {
                                setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
                              }
                              setInstalling(null)
                              await load()
                            }}
                          >
                            Install engine
                          </button>
                        )}
                      </div>
                    )}
                    {it.auth.kind === 'oauth' && it.enabled && <LoginFoot id={it.id} name={it.name} />}
                    {it.auth.kind === 'cli' && <CliFoot cli={it.auth.cli} guard={it.guard} />}
                    {it.auth.kind === 'token' && (
                      <div className="card-foot">
                        {it.ready ? (
                          <span className="ok">{it.auth.secret} saved</span>
                        ) : (
                          <>
                            <button className="small" title={`Add ${it.auth.secret}`} onClick={() => startAdding((it.auth as { secret: string }).secret)}>Add token</button>
                            {it.steps ? (
                              <button className="ghost small" onClick={() => setGuide(guide === it.id ? null : it.id)}>{guide === it.id ? 'Hide steps' : 'Set up'}</button>
                            ) : (
                              <button className="ghost small" onClick={() => void window.stm.setupOpen((it.auth as { createAt: string }).createAt)}>Create one</button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    {guide === it.id && it.steps && !it.ready && (
                      <ol className="steps">
                        {it.steps.map((st, n) => (
                          <li key={n}>
                            <span>{st.label}</span>
                            <button className="ghost small" onClick={() => void window.stm.setupOpen(st.url)}>Open</button>
                          </li>
                        ))}
                        <li>
                          <span>Paste the ID and secret, separated by a space</span>
                          <button className="small" onClick={() => startAdding((it.auth as { secret: string }).secret)}>Paste</button>
                        </li>
                      </ol>
                    )}
                    {it.commandSecret && (
                      <div className="card-foot">
                        <span className="faint">Commands: {it.commandSecret.secret} ({it.commandSecret.hint})</span>
                        {!secrets.some((s) => s.name === it.commandSecret!.secret) && (
                          <button className="ghost small" onClick={() => startAdding(it.commandSecret!.secret)}>Add</button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              </div>
                )
              })}
              <div className="faint pad">Not here? Catalog (in the Dev menu) searches the official MCP registry and adds any server.</div>
            </>
          )}

          {tab === 'vault' && (
            <>
              <p className="lede">Encrypted with your system keychain. The app shows names only; values reach integrations, and commands only when you allow it.</p>
              <div className="form">
                <input placeholder="NAME_LIKE_THIS" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })} spellCheck={false} />
                <input placeholder="Value" type="password" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} autoComplete="off" />
                <label className="check">
                  <input type="checkbox" checked={form.forCommands} onChange={(e) => setForm({ ...form, forCommands: e.target.checked })} />
                  Commands can read it
                </label>
                <button className="primary" disabled={!form.name || !form.value} onClick={() => void save()}>Save</button>
              </div>
              {error && <div className="notice error">{friendly(error)}</div>}
              <div className="rows">
                {secrets.length === 0 && <div className="faint">No credentials yet.</div>}
                {secrets.map((s) => (
                  <div key={s.name} className="row">
                    <span className="row-name">{s.name}</span>
                    <span className="faint">{'•'.repeat(10)}</span>
                    <span className="faint">{new Date(s.savedAt).toLocaleDateString()}</span>
                    <label className="check" title="Expose it as an environment variable to commands and to Claude's Bash">
                      <input
                        type="checkbox"
                        checked={s.forCommands}
                        onChange={async (e) => {
                          await window.stm.vaultForCommands(s.name, e.target.checked)
                          await load()
                        }}
                      />
                      Commands
                    </label>
                    <button
                      className="ghost small"
                      onClick={async () => {
                        await window.stm.vaultDelete(s.name)
                        await load()
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'exposures' && (
            <>
              <p className="lede">Credentials that appeared in a reply, a command or a tool call. They were masked on screen, but the model saw them: rotate the ones that matter.</p>
              <div className="rows">
                {props.exposures.length === 0 && <div className="faint">Nothing exposed in this session.</div>}
                {[...props.exposures].reverse().map((x, i) => (
                  <div key={i} className="row">
                    <span className="row-name">{x.name}</span>
                    <span className="faint">{x.secretKind}</span>
                    <span className="faint">in {x.where === 'assistant' ? 'a reply' : x.where.startsWith('shell') ? 'a command' : x.where === 'permission' ? 'a tool call' : x.where}</span>
                    <span className="faint">panel {x.panel}</span>
                    <span className="faint">{new Date(x.at).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** A cloud account signed in through its own CLI: who it is, the CLI's sign-in, and what keeps it to reading. */
function CliFoot(props: { cli: 'aws' | 'gcloud' | 'az' | 'railway'; guard?: string }) {
  const [st, setSt] = useState<Awaited<ReturnType<typeof window.stm.cli.status>> | undefined>(undefined)
  const [hint, setHint] = useState('')
  const look = () => void window.stm.cli.status(props.cli).then(setSt, () => setSt(null))
  useEffect(look, [props.cli])
  return (
    <div className="card-foot cli-foot">
      {st === undefined ? (
        <span className="faint">Checking the {props.cli} CLI...</span>
      ) : !st ? null : !st.installed ? (
        <span className="faint">Not installed: <code>{st.install}</code></span>
      ) : st.account ? (
        <span className="ok" title={st.detail}>{st.account}{st.detail ? <span className="faint"> · {st.detail}</span> : null}</span>
      ) : (
        <>
          <span className="faint">Not signed in</span>
          <button className="small" onClick={async () => {
            const r = await window.stm.cli.login(props.cli)
            setHint(r.hint ?? 'Finish in your browser, then check again.')
          }}>Sign in</button>
          <button className="ghost small" onClick={look}>Check again</button>
        </>
      )}
      {st?.runner && <span className="faint">{st.runner}</span>}
      {hint && <span className="faint">{hint}</span>}
      {props.guard && <span className="cli-guard">{props.guard}</span>}
    </div>
  )
}

/** A browser login, started now: the sign-in opens in the app's window and the card says when it is in. */
function LoginFoot(props: { id: string; name: string }) {
  const [st, setSt] = useState<'idle' | 'busy' | 'ok' | string>('idle')
  return (
    <div className="card-foot">
      {st === 'ok' ? (
        <span className="ok">Signed in: new panels can use {props.name}</span>
      ) : st === 'busy' ? (
        <span className="busy-label"><span className="spinner" /> Finish signing in in the window that opened</span>
      ) : (
        <>
          <button className="small" onClick={async () => {
            setSt('busy')
            try {
              await window.stm.connectIntegration(props.id)
              setSt('ok')
            } catch (e) {
              setSt(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
            }
          }}>Sign in now</button>
          <span className="faint">{st === 'idle' ? 'or when a new panel first uses it' : st}</span>
        </>
      )}
    </div>
  )
}

/** How a service signs in, drawn instead of spelled out on every card. */
function AuthGlyph(props: { kind: string }) {
  const p = { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'square' as const, strokeLinejoin: 'miter' as const }
  if (props.kind === 'token') return <svg {...p}><circle cx="5" cy="8" r="3" /><path d="M8 8h6.5M12 8v2.5M14.5 8v2" /></svg>
  if (props.kind === 'oauth') return <svg {...p}><path d="M9 2.5h4.5v11H9" /><path d="M2 8h8M7 5l3 3-3 3" /></svg>
  if (props.kind === 'cli') return <svg {...p}><rect x="1.5" y="2.5" width="13" height="11" /><path d="M4 6l2.5 2L4 10M8 10.5h4" /></svg>
  return <svg {...p}><circle cx="8" cy="8" r="5.5" strokeDasharray="2.6 2" /></svg>
}
