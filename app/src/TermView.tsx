import { FitAddon } from '@xterm/addon-fit'
import { IconClear, IconClose, IconCopy, IconSearch } from './icons'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef, useState, type KeyboardEvent as KeyEv } from 'react'
import { StateMark } from './StateMark'
import { ExplainBox } from './Explain'
import { CmdBar, RiskChip } from './CmdBar'
import { commandOnLine, riskOf, type Risk } from '../shared/cmdrisk'
import type { HistItem } from '../shared/termhist'
import { roughTokens } from '../shared/trace'
import { askOnce, SHRINK } from './localStream'
import { between, hintsOf, move, tipFor, type Move, type Pos } from '../shared/termplus'

const NERD = "'JetBrainsMono Nerd Font Mono'"
const VI: Record<string, Move> = { h: 'h', j: 'j', k: 'k', l: 'l', w: 'w', b: 'b', '0': '0', $: '$', g: 'g', G: 'G', ArrowLeft: 'h', ArrowDown: 'j', ArrowUp: 'k', ArrowRight: 'l' }

// the brand's sixteen colours: warm on dark, printer's ink on paper; the accent is the magenta slot
const DARK = { black: '#2a2825', red: '#e8705a', green: '#a6c98c', yellow: '#e6b25e', blue: '#8fb2e0', magenta: '#d97757', cyan: '#7cc6be', white: '#d8d2c4', brightBlack: '#6f6b63', brightRed: '#f4937e', brightGreen: '#c2e0a8', brightYellow: '#f5cf86', brightBlue: '#b4cdf0', brightMagenta: '#f2a283', brightCyan: '#a5e0d8', brightWhite: '#f6f1e6' }
const PAPER = { black: '#2a2824', red: '#b4462a', green: '#4f7a3a', yellow: '#94691f', blue: '#3a6296', magenta: '#c15f3c', cyan: '#2a746c', white: '#6b6962', brightBlack: '#8f8b82', brightRed: '#cf5a3b', brightGreen: '#5f9146', brightYellow: '#b07f2a', brightBlue: '#4c78b0', brightMagenta: '#d97757', brightCyan: '#358b81', brightWhite: '#1f1e1b' }

/** The theme's colours for the terminal, read from the app's CSS, so it follows every theme. */
function themeOf() {
  const cs = getComputedStyle(document.documentElement)
  const v = (k: string, d: string) => cs.getPropertyValue(k).trim() || d
  const bg = v('--bg', '#0f0f0e')
  const n = parseInt(bg.replace('#', '').padEnd(6, '0').slice(0, 6), 16)
  const light = ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11 > 128
  return {
    ...(light ? PAPER : DARK),
    background: light ? '#fffdf8' : '#0c0b0a',
    foreground: v('--text', '#ecebe6'),
    cursor: v('--accent', '#d97757'),
    cursorAccent: light ? '#fffdf8' : '#0c0b0a',
    selectionBackground: `rgba(${v('--accent-rgb', '217, 119, 87')}, 0.3)`,
  }
}

/**
 * The panel's terminal: an interactive shell in the panel's folder (vim, htop, prompts all work). It
 * starts the first time the tab opens and lives as long as the panel. What is selected, or the last
 * screenful, goes to Claude as a chip.
 */
export function TermView(props: { sid: string; active: boolean; onAttach: (note: { label: string; text: string }) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const term = useRef<Terminal | null>(null)
  const fit = useRef<FitAddon | null>(null)
  const [ended, setEnded] = useState<number | null>(null)
  const [hasSel, setHasSel] = useState(false)
  const [shell, setShell] = useState<{ shell: string; cwd: string; headroom?: boolean } | null>(null)
  // a dangerous command typed in the terminal waits at Enter until confirmed
  const [hold, setHold] = useState<{ cmd: string; risk: Risk } | null>(null)
  const [bar, setBar] = useState(false)
  const [hist, setHist] = useState<HistItem[]>([])
  // what Send output would cost, counted before it goes
  const [toks, setToks] = useState(0)
  const [longToks, setLongToks] = useState(0)
  const [shrinking, setShrinking] = useState(false)
  const cwdRef = useRef('')
  const procRef = useRef<string | null>(null)
  const typed = useRef({ text: '', ok: true })
  // the program in the foreground: the shell when idle, anything else is a command running
  const [proc, setProc] = useState<{ name: string; since: number } | null>(null)
  const [lastRun, setLastRun] = useState<{ name: string; ms: number } | null>(null)
  const [now, setNow] = useState(Date.now())
  const [active, setActive] = useState(false)
  const quiet = useRef<ReturnType<typeof setTimeout>>()
  // the machine the terminal went into, until its shell comes back
  const [remote, setRemote] = useState<{ kind: 'docker' | 'ssh' | 'cloud'; name: string } | null>(null)
  const [picker, setPicker] = useState(false)
  const [explain, setExplain] = useState<string | null>(null)
  // the machine asked for: it becomes the badge only once its program takes the terminal
  const pending = useRef<{ kind: 'docker' | 'ssh' | 'cloud'; name: string; at: number } | null>(null)
  const search = useRef<SearchAddon | null>(null)
  const [find, setFind] = useState<{ q: string; n: number; of: number } | null>(null)
  // copy mode: a cursor over the scrollback moved with vi keys; v starts a selection, y copies it
  const [copy, setCopy] = useState<{ at: Pos; mark: Pos | null } | null>(null)
  const [tip, setTip] = useState<{ tip: string; link: string } | null>(null)
  const lastTip = useRef<string>()

  const start = async () => {
    const t = term.current
    if (!t) return
    setEnded(null)
    t.reset()
    const r = await window.stm.term.open(props.sid, t.cols, t.rows)
    if (r) setShell(r)
  }

  useEffect(() => {
    const el = host.current
    if (!el) return
    const t = new Terminal({ fontFamily: `${NERD}, ${getComputedStyle(document.documentElement).getPropertyValue('--mono').trim() || 'ui-monospace, Menlo, monospace'}`, fontSize: 12.5, lineHeight: 1.25, cursorBlink: true, allowProposedApi: true, scrollback: 5000, theme: themeOf(), macOptionIsMeta: true })
    const f = new FitAddon()
    t.loadAddon(f)
    const sa = new SearchAddon()
    t.loadAddon(sa)
    search.current = sa
    sa.onDidChangeResults(({ resultIndex, resultCount }) => setFind((c) => (c ? { ...c, n: resultIndex + 1, of: resultCount } : c)))
    // links open in the browser, never inside the app
    t.loadAddon(new WebLinksAddon((ev, uri) => ev.metaKey || ev.ctrlKey ? void window.stm.openUrl(uri) : undefined))
    // paths with a line number and commit ids: Cmd+click sends the path to Claude, or types git show
    t.registerLinkProvider({
      provideLinks: (y, cb) => {
        const text = t.buffer.active.getLine(y - 1)?.translateToString(true) ?? ''
        const hs = hintsOf(text)
        cb(hs.length ? hs.map((h) => ({ text: text.slice(h.start, h.end), range: { start: { x: h.start + 1, y }, end: { x: h.end, y } }, decorations: { underline: true, pointerCursor: true }, activate: (ev: MouseEvent) => {
          if (!ev.metaKey && !ev.ctrlKey) return
          if (h.kind === 'commit') window.stm.term.write(props.sid, `git show --stat ${h.text}`)
          else props.onAttach({ label: `File ${h.text}${h.line ? `:${h.line}` : ''}`, text: `Look at ${h.text}${h.line ? `, line ${h.line}${h.col ? `, column ${h.col}` : ''}` : ''} (from the panel's terminal, in ${cwdRef.current}).` })
        } })) : undefined)
      },
    })
    t.open(el)
    // WebGL draws faster; when the GPU drops the context, the default renderer takes over
    try {
      const gl = new WebglAddon()
      gl.onContextLoss(() => gl.dispose())
      t.loadAddon(gl)
    } catch {
      // no WebGL here: the DOM renderer stays
    }
    void document.fonts.load(`12.5px ${NERD}`).then(() => {
      // measured again once the font is in
      const ff = t.options.fontFamily
      t.options.fontFamily = 'monospace'
      t.options.fontFamily = ff
      try { f.fit() } catch { /* hidden */ }
    }).catch(() => undefined)
    term.current = t
    fit.current = f
    try {
      f.fit()
    } catch {
      // hidden at first: fitted when shown
    }
    t.onData((d) => {
      // Enter at the shell's prompt: the line is read from the screen and checked before it runs
      if (d === '\r' && !procRef.current && t.buffer.active.type === 'normal') {
        const b = t.buffer.active
        let y = b.baseY + b.cursorY
        let line = b.getLine(y)?.translateToString(true) ?? ''
        while (y > 0 && b.getLine(y)?.isWrapped) line = (b.getLine(--y)?.translateToString(true) ?? '') + line
        // what was typed is exact unless arrows, Tab or history changed the line; then the screen says
        const cmd = typed.current.ok && typed.current.text.trim() ? typed.current.text.trim() : commandOnLine(line)
        typed.current = { text: '', ok: true }
        const risk = riskOf(cmd)
        if (risk.level === 'blocked') return setHold({ cmd, risk })
        const tp = tipFor(cmd, lastTip.current)
        if (tp) lastTip.current = tp.tip
        setTip(tp)
        if (cmd && cwdRef.current) void window.stm.term.remember(cwdRef.current, cmd).then(setHist)
      }
      if (d === '\r' || d === '\x03' || d === '\x15') typed.current = { text: '', ok: true }
      else if (d === '\x7f') typed.current = { ...typed.current, text: typed.current.text.slice(0, -1) }
      else if (/^[^\x00-\x1f\x7f]+$/.test(d)) typed.current = { ...typed.current, text: typed.current.text + d }
      else typed.current = { ...typed.current, ok: false }
      window.stm.term.write(props.sid, d)
    })
    t.onResize(({ cols, rows }) => window.stm.term.resize(props.sid, cols, rows))
    t.onSelectionChange(() => { setHasSel(t.hasSelection()); setToks(roughTokens(grabRef.current())); setLongToks(roughTokens(grabLongRef.current())) })
    const offData = window.stm.term.onData((sid, d) => {
      if (sid !== props.sid) return
      t.write(d)
      // output arriving: the activity line sweeps until it goes quiet
      setActive(true)
      clearTimeout(quiet.current)
      quiet.current = setTimeout(() => { setActive(false); setToks(roughTokens(grabRef.current())); setLongToks(roughTokens(grabLongRef.current())) }, 350)
    })
    const offProc = window.stm.term.onProc((sid, name) => {
      if (sid !== props.sid) return
      procRef.current = /^-?(zsh|bash|fish|sh|login)$/.test(name.split('/').pop() ?? name) ? null : name
      setProc((cur) => {
        const base = (n: string) => n.split('/').pop() ?? n
        const isShell = /^-?(zsh|bash|fish|sh|login)$/.test(base(name))
        if (isShell) {
          if (cur) setLastRun({ name: cur.name, ms: Date.now() - cur.since })
          setRemote(null)
          return null
        }
        const p = pending.current
        if (p && Date.now() - p.at < 5000) {
          setRemote({ kind: p.kind, name: p.name })
          pending.current = null
        }
        return cur && cur.name === base(name) ? cur : { name: base(name), since: Date.now() }
      })
    })
    const offExit = window.stm.term.onExit((sid, code) => sid === props.sid && setEnded(code))
    // the theme can change while the panel is open
    const paint = () => {
      const th = themeOf()
      t.options.theme = th
      el.style.setProperty('--term-bg', th.background)
    }
    paint()
    const watch = new MutationObserver(paint)
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] })
    const resize = new ResizeObserver(() => {
      if (el.offsetParent) {
        try {
          f.fit()
        } catch {
          // not laid out yet
        }
      }
    })
    resize.observe(el)
    void window.stm.term.open(props.sid, t.cols, t.rows).then((r) => {
      if (!r) return
      setShell(r)
      cwdRef.current = r.cwd
      void window.stm.term.history(r.cwd).then(setHist)
    })
    return () => {
      offData()
      offProc()
      offExit()
      watch.disconnect()
      resize.disconnect()
      t.dispose()
      term.current = null
    }
  }, [props.sid])

  // a running command's clock
  useEffect(() => {
    if (!proc) return
    // nothing to see while the window is hidden; the next tick after it shows catches up
    const t = setInterval(() => !document.hidden && setNow(Date.now()), 200)
    return () => clearInterval(t)
  }, [proc])

  // shown again: fit to the space and take the keys
  useEffect(() => {
    if (!props.active) return
    const id = requestAnimationFrame(() => {
      try {
        fit.current?.fit()
      } catch {
        // not laid out yet
      }
      term.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [props.active])

  /** The last 400 lines, for a shortened send. */
  const grabLong = () => {
    const t = term.current
    if (!t) return ''
    const sel = t.getSelection()
    if (sel.trim()) return sel
    const b = t.buffer.active
    const lines: string[] = []
    for (let i = Math.max(0, b.length - 400); i < b.length; i++) lines.push(b.getLine(i)?.translateToString(true) ?? '')
    return lines.join('\n').replace(/\n+$/, '')
  }
  /** The selection, or the last screenful of output. */
  const grab = () => {
    const t = term.current
    if (!t) return ''
    const sel = t.getSelection()
    if (sel.trim()) return sel
    const b = t.buffer.active
    const lines: string[] = []
    for (let i = Math.max(0, b.length - 400); i < b.length; i++) lines.push(b.getLine(i)?.translateToString(true) ?? '')
    return lines.join('\n').replace(/\n+$/, '').split('\n').slice(-60).join('\n')
  }
  const grabRef = useRef(grab)
  grabRef.current = grab
  const grabLongRef = useRef(grabLong)
  grabLongRef.current = grabLong
  // long output: the local model keeps the errors, paths and numbers and drops the noise first
  const sendShorter = async () => {
    const text = grabLong()
    if (!text.trim()) return
    setShrinking(true)
    try {
      const short = await askOnce(SHRINK, text.slice(-40_000), 'shrink')
      props.onAttach({ label: `Terminal output, shortened (~${roughTokens(short).toLocaleString('en-US')} tokens)`, text: `From the panel's terminal, shortened by the local model:\n\`\`\`\n${short}\n\`\`\`` })
    } catch {
      send()
    }
    setShrinking(false)
  }
  const send = () => {
    const t = term.current
    if (!t) return
    let text = t.getSelection()
    let label = 'Terminal selection'
    if (!text.trim()) {
      const b = t.buffer.active
      const lines: string[] = []
      for (let i = Math.max(0, b.length - 400); i < b.length; i++) lines.push(b.getLine(i)?.translateToString(true) ?? '')
      text = lines.join('\n').replace(/\n+$/, '').split('\n').slice(-60).join('\n')
      label = 'Terminal output'
    }
    if (!text.trim()) return
    props.onAttach({ label: `${label} (~${roughTokens(text.slice(-12_000)).toLocaleString('en-US')} tokens)`, text: `From the panel's terminal:\n\`\`\`\n${text.slice(-12_000)}\n\`\`\`` })
  }

  const lines = () => {
    const b = term.current!.buffer.active
    return Array.from({ length: b.length }, (_, i) => b.getLine(i)?.translateToString(true) ?? '')
  }
  const showCopy = (c: { at: Pos; mark: Pos | null }) => {
    const t = term.current!
    const a = c.mark ?? c.at
    const [s, e] = a.row < c.at.row || (a.row === c.at.row && a.col <= c.at.col) ? [a, c.at] : [c.at, a]
    const cols = t.cols
    t.select(s.col, s.row, (e.row - s.row) * cols + e.col - s.col + 1)
    t.scrollToLine(Math.max(0, c.at.row - Math.floor(t.rows / 2)))
    setCopy(c)
  }
  const startCopy = () => {
    const t = term.current
    if (!t) return
    const b = t.buffer.active
    showCopy({ at: { row: b.baseY + b.cursorY, col: 0 }, mark: null })
  }
  const endCopy = () => {
    setCopy(null)
    term.current?.clearSelection()
    term.current?.scrollToBottom()
    term.current?.focus()
  }
  const copyKey = (e: KeyEv) => {
    if (!copy) return false
    e.preventDefault()
    e.stopPropagation()
    const ls = lines()
    const m: Move | undefined = e.ctrlKey && e.key === 'u' ? 'ctrl-u' : e.ctrlKey && e.key === 'd' ? 'ctrl-d' : VI[e.key]
    if (m) showCopy({ ...copy, at: move(copy.at, m, ls, Math.floor((term.current?.rows ?? 40) / 2)) })
    else if (e.key === 'v') showCopy({ ...copy, mark: copy.mark ? null : copy.at })
    else if (e.key === 'y' || e.key === 'Enter') {
      void navigator.clipboard.writeText(between(copy.mark ?? copy.at, copy.at, ls)).catch(() => undefined)
      endCopy()
    } else if (e.key === 'Escape' || e.key === 'q') endCopy()
    return true
  }
  const runFind = (q: string, back = false) => {
    setFind((c) => ({ q, n: c?.n ?? 0, of: c?.of ?? 0 }))
    if (!q) return search.current?.clearDecorations()
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d97757'
    const deco = { matchOverviewRuler: accent, activeMatchColorOverviewRuler: accent, matchBackground: '#a8841a', activeMatchBackground: accent }
    if (back) search.current?.findPrevious(q, { decorations: deco })
    else search.current?.findNext(q, { decorations: deco, incremental: true })
  }
  const closeFind = () => {
    search.current?.clearDecorations()
    setFind(null)
    term.current?.focus()
  }

  const secs = (ms: number) => (ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`)
  const where = shell ? shell.cwd.split('/').filter(Boolean).slice(-2).join('/') : ''
  return (
    <div className="term">
      <div className="term-bar">
        {ended !== null ? (
          <StateMark state="down" size="md" label={`The shell exited (${ended})`} />
        ) : proc ? (
          <StateMark state="busy" size="md" label={`${proc.name} is running`} />
        ) : (
          <StateMark state={shell ? 'up' : 'off'} size="md" label={shell ? 'Ready' : 'Starting'} />
        )}
        <span className="term-shell">{shell?.shell ?? 'shell'}</span>
        <span className="term-where" title={shell?.cwd}>{where}</span>
        {shell?.headroom && <span className="term-via" title="claude, aider and other tools started here go through Headroom's proxy, like headroom wrap">via Headroom</span>}
        {remote ? (
          <span className={`term-remote ${remote.kind}`} key={remote.name}>
            <svg viewBox="0 0 16 16" aria-hidden><path d="M2 8h9M8 4l4 4-4 4" /></svg>
            {remote.name}
            {proc && <span className="term-clock">{secs(now - proc.since)}</span>}
          </span>
        ) : proc ? (
          <span className="term-run" key={proc.name}>
            <b>{proc.name}</b>
            <span className="term-clock">{secs(now - proc.since)}</span>
          </span>
        ) : lastRun ? (
          <span className="term-last" key={lastRun.name + lastRun.ms}>{lastRun.name} took {secs(lastRun.ms)}</span>
        ) : null}
        <span className="spacer-flex" />
        {ended !== null && <button className="small" onClick={() => void start()}>Restart shell</button>}
        <button className={`ghost small term-cmd-btn ${bar ? 'on' : ''}`} onClick={() => setBar(!bar)} aria-expanded={bar} title="Command bar: past commands by meaning, plain words to a command (Ctrl+Space)">
          <svg viewBox="0 0 16 16" aria-hidden><path d="M2 4l4 4-4 4M8 12h6" /></svg>
          Command
        </button>
        <div className="term-connect-wrap">
          <button className={`ghost small term-connect-btn ${picker ? 'on' : ''}`} onClick={() => setPicker(!picker)} aria-expanded={picker} title="Open a shell in a container, an SSH host or a cloud machine">
            <svg viewBox="0 0 16 16" aria-hidden><rect x="1.5" y="4" width="5" height="8" /><path d="M6.5 8h4M9 5.5 11.5 8 9 10.5" /><circle cx="13" cy="8" r="1.6" /></svg>
            Connect
          </button>
          {picker && <ConnectPicker onPick={async (t) => {
            setPicker(false)
            if (await window.stm.term.connect(props.sid, t.command)) pending.current = { kind: t.kind, name: t.name, at: Date.now() }
            term.current?.focus()
          }} onClose={() => setPicker(false)} />}
        </div>
        <button className="ghost small term-explain" onClick={() => setExplain(grab())} title="The local model explains the error in the selection or the last lines; free, nothing leaves the Mac">
          <svg viewBox="0 0 16 16" aria-hidden><path d="M8 1.5 14.5 13H1.5Z" /><path d="M8 6v3.5M8 11.2v.1" /></svg>
          Explain
        </button>
        <button className={`ghost small ${find ? 'on' : ''}`} onClick={() => (find ? closeFind() : setFind({ q: '', n: 0, of: 0 }))} title="Search the scrollback (Cmd+F)"><IconSearch />Find</button>
        <button className={`ghost small ${copy ? 'on' : ''}`} onClick={() => (copy ? endCopy() : (startCopy(), host.current?.focus()))} title="Copy mode: move with h j k l w b, v to select, y to copy, Esc to leave (Cmd+Shift+C)"><IconCopy />Copy mode</button>
        <button className="ghost small" onClick={() => term.current?.clear()} title="Clear (Cmd+K)"><IconClear />Clear</button>
        <button className="ghost small term-send" onClick={send} title="Adds the selection, or the last lines, to your message">
          <svg viewBox="0 0 16 16" aria-hidden><path d="M2 2h6M2 2v6M14 14H8M14 14V8" /></svg>
          {hasSel ? 'Send selection' : 'Send output'}
          {toks > 0 && <span className="term-toks">~{toks >= 1000 ? `${(toks / 1000).toFixed(1)}k` : toks}</span>}
        </button>
        {longToks > 2000 && <button className="ghost small" disabled={shrinking} onClick={() => void sendShorter()} title={`${hasSel ? 'The selection' : 'The last 400 lines'} (~${longToks.toLocaleString('en-US')} tokens), shortened first by the local model, keeping errors, paths and numbers (free)`}>{shrinking ? 'Shortening…' : hasSel ? 'Send shorter' : 'Send more, shorter'}</button>}
      </div>
      {bar && <CmdBar sid={props.sid} history={hist} onClose={() => { setBar(false); term.current?.focus() }} onRan={(cmd) => cwdRef.current && void window.stm.term.remember(cwdRef.current, cmd).then(setHist)} />}
      {hold && (
        <div className="term-hold" role="alert">
          <RiskChip risk={hold.risk} />
          <code className="term-hold-cmd">{hold.cmd}</code>
          <span className="spacer-flex" />
          <button className="ghost small" onClick={() => { window.stm.term.write(props.sid, '\x03'); setHold(null); term.current?.focus() }}>Cancel</button>
          <button className="danger small" onClick={() => { window.stm.term.write(props.sid, '\r'); setHold(null); term.current?.focus() }}>Run anyway</button>
        </div>
      )}
      {explain !== null && <ExplainBox output={explain} onClose={() => setExplain(null)} onAsk={(why) => (props.onAttach({ label: 'Terminal error', text: `From the panel's terminal:\n\`\`\`\n${explain.slice(-12_000)}\n\`\`\`\n\nThe local model's read of it:\n${why}` }), setExplain(null))} />}
      {find && (
        <div className="term-find">
          <input autoFocus placeholder="Search the scrollback" value={find.q} onChange={(e) => runFind(e.target.value)} onKeyDown={(e) => {
            if (e.key === 'Enter') runFind(find.q, e.shiftKey)
            else if (e.key === 'Escape') closeFind()
          }} aria-label="Search the scrollback" />
          <span className="faint term-find-count">{find.q ? (find.of ? `${find.n} of ${find.of}` : 'No match') : ''}</span>
          <button className="ghost small" onClick={() => runFind(find.q, true)} disabled={!find.of}>Previous</button>
          <button className="ghost small" onClick={() => runFind(find.q)} disabled={!find.of}>Next</button>
          <button className="ghost small" onClick={closeFind}>Done</button>
        </div>
      )}
      {copy && <div className="term-copy"><b>Copy mode</b><span className="faint">h j k l w b 0 $ g G, Ctrl+U/D · v {copy.mark ? 'ends' : 'starts'} the selection · y copies · Esc leaves</span><span className="term-copy-at">{copy.at.row + 1}:{copy.at.col + 1}</span></div>}
      {tip && !copy && (
        <div className="term-tip">
          <span className="term-tip-tag">Tip</span>
          <span>{tip.tip}</span>
          <a href={tip.link} onClick={(e) => (e.preventDefault(), void window.stm.openUrl(tip.link))}>The art of the command line</a>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Hide tip" onClick={() => setTip(null)}><IconClose /></button>
        </div>
      )}
      <div className={`term-frame ${active ? 'live' : ''} ${proc ? 'running' : ''}`}>
        <i className="term-activity" aria-hidden />
        <div className="term-host" tabIndex={-1} ref={host} onKeyDownCapture={(e) => void copyKey(e)} onKeyDown={(e) => {
          if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'c') {
            e.preventDefault()
            return startCopy()
          }
          if (e.metaKey && e.key.toLowerCase() === 'f') {
            e.preventDefault()
            e.stopPropagation()
            return setFind((c) => c ?? { q: '', n: 0, of: 0 })
          }
          // Cmd+K clears, like Terminal.app; it does not reach the app's search from here
          if (e.ctrlKey && e.code === 'Space') {
            e.preventDefault()
            setBar(true)
            return
          }
          if (e.metaKey && e.key.toLowerCase() === 'k') {
            e.preventDefault()
            e.stopPropagation()
            term.current?.clear()
          }
        }} />
      </div>
    </div>
  )
}

type Target = Awaited<ReturnType<typeof window.stm.term.targets>>['targets'][number]
const KIND = { docker: 'Containers', ssh: 'SSH hosts', cloud: 'Cloud machines' } as const

/** Where the terminal can go: running containers and ssh hosts right away, cloud machines on request. */
function ConnectPicker(props: { onPick: (t: Target) => void; onClose: () => void }) {
  const [local, setLocal] = useState<{ targets: Target[]; missing: string[] } | null>(null)
  const [cloud, setCloud] = useState<{ targets: Target[]; missing: string[] } | 'loading' | null>(null)
  useEffect(() => {
    void window.stm.term.targets('local').then(setLocal)
    const k = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [props])
  const all = [...(local?.targets ?? []), ...(cloud && cloud !== 'loading' ? cloud.targets : [])]
  return (
    <div className="term-connect" role="menu">
      {!local && <div className="faint term-connect-note"><StateMark state="busy" label="Looking" /> Looking for containers and hosts…</div>}
      {(['docker', 'ssh', 'cloud'] as const).map((k) => {
        const items = all.filter((t) => t.kind === k)
        if (!items.length) return null
        return (
          <div key={k} className="term-connect-group">
            <div className="sp-label">{KIND[k]}</div>
            {items.map((t) => (
              <button key={t.command} role="menuitem" className={`term-target ${k}`} onClick={() => props.onPick(t)} title={t.command}>
                <svg viewBox="0 0 10 10" aria-hidden>{k === 'docker' ? <rect x="1.2" y="1.2" width="7.6" height="7.6" /> : k === 'ssh' ? <circle cx="5" cy="5" r="3.8" /> : <path d="M5 1 9.2 9H.8Z" />}</svg>
                <span className="term-target-name">{t.name}</span>
                <span className="term-target-detail">{t.detail}</span>
              </button>
            ))}
          </div>
        )
      })}
      {local && !local.targets.length && <div className="faint term-connect-note">No running containers and no hosts in ~/.ssh/config.</div>}
      {local?.missing.includes('docker') && <div className="faint term-connect-note">Docker is not running.</div>}
      <div className="term-connect-foot">
        {cloud === null ? (
          <button className="small" onClick={() => (setCloud('loading'), void window.stm.term.targets('cloud').then(setCloud))}>Look in the cloud</button>
        ) : cloud === 'loading' ? (
          <span className="faint"><StateMark state="busy" label="Looking" /> Asking AWS, Google Cloud, DigitalOcean and Fly…</span>
        ) : (
          <span className="faint">{cloud.targets.length ? `${cloud.targets.length} running in the cloud` : 'No running machines in the cloud'}{cloud.missing.length ? `; not installed: ${cloud.missing.join(', ')}` : ''}</span>
        )}
      </div>
    </div>
  )
}
