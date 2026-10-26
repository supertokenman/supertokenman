import { useEffect, useState } from 'react'
import { IconClose } from './icons'

const TOOLS: [string, string][] = [
  ['stm_status', 'Version, open panels, how many are working, spend today'],
  ['stm_panels', 'The open panels: folder, persona, busy, goal'],
  ['stm_spend', "Today's spend and the budget limits"],
  ['stm_memory', "The project's memory index for a query"],
  ['stm_db_list', 'Saved database connections, names only'],
  ['stm_db_query', 'Read-only SQL on a saved connection'],
  ['stm_send', 'Send to a panel and wait for the reply (off unless allowed below)'],
]

/** Connect other agents: SuperTokenMan as an MCP server over stdio, through the stm command. */
export function ConnectAgentsSheet(props: { onClose: () => void }) {
  const [info, setInfo] = useState<{ send: boolean; stm: string } | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => { void window.stm.mcpsrv.get().then(setInfo) }, [])
  const snippet = JSON.stringify({ mcpServers: { supertokenman: { command: info?.stm ?? 'stm', args: ['mcp'] } } }, null, 2)
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe md" role="dialog" aria-label="Connect other agents">
        <header className="sheet-head">
          <div className="sheet-title">Connect other agents</div>
          <span className="faint">SuperTokenMan as an MCP server</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="ar-pad">
          <span className="chart-name">Add this to the other agent's MCP config</span>
          <pre className="ca-snippet">{snippet}</pre>
          <div><button className="btn" onClick={() => void navigator.clipboard.writeText(snippet).then(() => setCopied(true))}>{copied ? 'Copied' : 'Copy'}</button></div>
          <span className="chart-name">Tools it gets</span>
          <ul className="ca-tools">{TOOLS.map(([n, w]) => <li key={n}><code>{n}</code> <span className="faint">{w}</span></li>)}</ul>
          <label className="ca-toggle">
            <input type="checkbox" checked={Boolean(info?.send)} disabled={!info} onChange={(e) => void window.stm.mcpsrv.setSend(e.target.checked).then((send: boolean) => setInfo((i) => i && { ...i, send }))} />
            Let other agents send to panels
          </label>
          <div className="faint">Off by default. When on, messages arrive marked as coming from another agent and go through the budget brake. Reads never include credentials. The app must be open; the stm command talks to it locally.</div>
        </div>
      </div>
    </div>
  )
}
