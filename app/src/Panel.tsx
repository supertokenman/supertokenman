import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useContext, useRef, useState } from 'react'
import { Windowed } from './windowed'
import { pickAttachments } from './FilePicker'
import { markOf, type PanelRun } from './panelview'
import { StateMark } from './StateMark'
import { LoopNotice, LOOP_CONTINUE } from './LoopNotice'
import { useQueueState } from './queueHook'
import { useFailoverCard } from './failoverHook'
import { openChannel } from './channelOpen'
import { cacheLeft, coldExtraUsd } from '../shared/cache'
import { Thinking } from './Thinking'
import { IMAGE_TYPES, imageTypeOf, MAX_ATTACHMENTS, MAX_IMAGE_BYTES, type Attachment } from '../shared/attach'
import { hudView, KO_MS, type Action, type Line, type State } from './state'
import { Changes, Diff } from './Diff'
import { CiView } from './CiView'
import { GitView } from './GitView'
import { AccessMark } from './Personas'
import { SandboxChip } from './Sandbox'
import { RemoteChip } from './RemoteChip'
import { WorktreeChip } from './Worktree'
import { LinksChip } from './PanelLinks'
import { PanelMore } from './PanelMore'
import { heldText } from '../shared/budget'
import { ACCESS } from '../shared/personas'
import { askOnce, SHRINK } from './localStream'
import { coach } from './coach'
import { moodOf, WHY } from './mood'
import { themeSvg, type Theme } from './themes'
import { Markdown } from './markdown'
import { InCanvas } from './InCanvas'
import { hudMini } from './hudMini'
import { ShellBlock, forClaude } from './ShellBlock'
import { findSecrets, mask, type Finding } from '../shared/secrets'
import { wrapOutside, type InjectionFinding } from '../shared/injection'
import { collectionsOf, fieldsOf, fill, findPrompt, slashOf, type Prompt } from '../shared/workbench'
import { correctionOf } from '../shared/corrections'
import { splitReport } from '../shared/styles'
import { RiskChip } from './CmdBar'
import { DictateButton, ReadAloud } from './VoiceButtons'
import { insertDictation } from '../shared/voicecmd'
import { ExportSessionSheet } from './ExportSession'
import { IsolateChip } from './IsolateChip'
import { TrimTools } from './TrimTools'
import { SourceChip } from './SourceChip'
import { SnapshotCard } from './SnapshotCard'
import { LABEL, MODEL_OF, suggest, tierOf, type Suggestion } from '../shared/modelroute'
import type { Tally } from '../shared/arena'
import { CITE_RULE, citeCheck, citesOf, sourceLabel, type Source } from '../shared/citations'
import { faithfulness, type Faith } from '../shared/faithful'
import { compact, LOSSLESS } from '../shared/compact'
import { goalCommand } from '../shared/goal'
import { injectionScore } from '../shared/autonomy'
import './bridge'
import { IconClose, IconRemember, IconRun, IconSend, IconStop, IconRemote } from './icons'


/** A tool's name as people read it: MCP prefixes out, our panel tools by name. */
export const toolName = (n: string) =>
  n === 'mcp__panels__message_panel' ? 'Message panel' : n === 'mcp__panels__list_panels' ? 'List panels' : n.startsWith('mcp__') ? n.slice(5).replace('__', ' · ').replace(/_/g, ' ') : n

// first words that are almost always a command, not a question
// the terminal (xterm, a third of the start-up bundle) and Preview load the first time their tab opens
const PreviewView = lazy(() => import('./PreviewView').then((m) => ({ default: m.PreviewView })))
const UsageChip = lazy(() => import('./UsageChip').then((m) => ({ default: m.UsageChip })))
const QueueList = lazy(() => import('./QueueList'))
const PlanStrip = lazy(() => import('./control/PlanStrip'))
const PanelControl = lazy(() => import('./control/PanelControl'))
const FailoverCard = lazy(() => import('./FailoverCard'))
const FallbackChip = lazy(() => import('./FailoverCard').then((m) => ({ default: m.FallbackChip })))
const TermView = lazy(() => import('./TermView').then((m) => ({ default: m.TermView })))

const COMMANDS = /^(git|npm|npx|pnpm|yarn|bun|node|deno|python3?|pip3?|uv|ls|cd|cat|grep|rg|find|make|cargo|go|docker|kubectl|wrangler|supabase|neonctl|gh|curl|brew|tsc|vitest|jest|pytest|ruby|bundle|rails|php|composer|mvn|gradle|terraform|aws|gcloud|ssh|scp|rm|mv|cp|mkdir|touch|echo|export|source|chmod|tail|head|ps|kill|open|code)(\s|$)/
export const looksLikeCommand = (t: string) => COMMANDS.test(t.trim()) && !t.includes('\n')

/** How many transcript lines a panel draws at first; older ones wait behind "Show earlier". */
const WINDOW = 150

/** One transcript line. Memoized: a new line or a streamed token redraws only what changed. */
const LineView = memo(function LineView({ l, onStop, onSend }: { l: Line; onStop: (id: string) => void; onSend: (l: Extract<Line, { kind: 'shell' }>) => void }) {
  if (l.kind === 'user')
    return (
      <div className="msg user">
        {(l.images?.length || l.files?.length) ? (
          <div className="msg-atts">
            {l.images?.map((src, i) => <img key={i} src={src} alt="" />)}
            {l.files?.map((f) => <span key={f} className="att-chip" data-tip={f}><FileGlyph />{f.split('/').pop()}</span>)}
          </div>
        ) : null}
        {l.text}
      </div>
    )
  if (l.kind === 'assistant') {
    // the closing Not verified list stands apart, so what was not checked is never lost at the bottom
    // the GOAL MET line is for the app, which says it in a note below
    const { body, report } = splitReport(l.text.replace(/\n\s*\**GOAL MET\**\.?\s*$/, ''))
    return (
      <div className="msg assistant">
        <Markdown text={body} />
        {report && (
          <div className="not-verified" role="note">
            <div className="nv-head"><StateMark state={report.length === 1 && /^(nothing|nada)\.?$/i.test(report[0]!) ? 'up' : 'warn'} label="Not verified" />Not verified</div>
            <ul>{report.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
        )}
      </div>
    )
  }
  if (l.kind === 'peer')
    return (
      <div className="peer">
        <span className="peer-from">From {l.from}</span>
        <Markdown text={l.text} />
      </div>
    )
  if (l.kind === 'shell') return <ShellBlock r={l} onStop={() => onStop(l.id)} onSend={() => onSend(l)} />
  if (l.kind === 'tool') return null
  if (l.kind === 'evidence')
    return (
      <div className={`evidence ${l.level}`} role="note" data-tip={`Claim: ${l.claim}`}>
        <StateMark state={l.level === 'observed' ? 'up' : 'warn'} label={l.level} />
        {l.text}
      </div>
    )
  return <div className={`notice ${l.tone ?? ''}`}>{l.text}</div>
})

type Tool = Extract<Line, { kind: 'tool' }>
// what a step did, in the words the transcript reads best with
const VERBS: Record<string, string> = { mcp__mem__memory_index: 'Looked in memory', mcp__mem__memory_read: 'Read memory', mcp__stm__manual: 'Read the manual', mcp__headroom__headroom_retrieve: 'Read the original', Read: 'Read', Bash: 'Ran', Edit: 'Edited', MultiEdit: 'Edited', Write: 'Wrote', Grep: 'Searched', Glob: 'Listed', WebFetch: 'Fetched', WebSearch: 'Searched the web', TodoWrite: 'Planned', Task: 'Delegated', Agent: 'Delegated', NotebookEdit: 'Edited' }
const verb = (name: string) => VERBS[name] ?? toolName(name)
// each kind of step wears one of the brand's pictograms: reading a square, searching a circle,
// running a triangle, writing the cut-corner square, everything else (MCP, agents) the cross
type Shape = 'read' | 'find' | 'run' | 'write' | 'other'
const SHAPES: Record<string, Shape> = { mcp__mem__memory_index: 'find', mcp__mem__memory_read: 'read', mcp__stm__manual: 'read', mcp__headroom__headroom_retrieve: 'read', Read: 'read', WebFetch: 'read', Grep: 'find', Glob: 'find', WebSearch: 'find', Bash: 'run', Edit: 'write', MultiEdit: 'write', Write: 'write', NotebookEdit: 'write' }
function StepMark({ name }: { name: string }) {
  const shape = SHAPES[name] ?? 'other'
  return (
    <svg className={`step-mark ${shape}`} viewBox="0 0 10 10" aria-hidden>
      {shape === 'read' && <rect x="1" y="1" width="8" height="8" />}
      {shape === 'find' && <circle cx="5" cy="5" r="4" />}
      {shape === 'run' && <path d="M5 1 9.2 9H.8Z" />}
      {shape === 'write' && <path d="M1 1h8v5L6 9H1Z" />}
      {shape === 'other' && <path d="m1.5 1.5 7 7m0-7-7 7" />}
    </svg>
  )
}

/** One step: a quiet line with a dot; a click shows the whole argument when it was cut. */
function StepLine({ t, live, open, onToggle }: { t: Tool; live: boolean; open: boolean; onToggle: () => void }) {
  return (
    <button className={`step ${open ? 'open' : ''} ${live ? 'live' : ''}`} onClick={onToggle} data-tip={open ? undefined : t.summary}>
      <StepMark name={t.name} />
      <span className="step-tool">{verb(t.name)}</span>
      <span className="step-arg">{t.summary}</span>
    </button>
  )
}

/** Steps in a row: up to three shown as they are, more folded under one line that opens them. What is
 * open lives in the panel (`opened`, by `at`), so a run drawn again after scrolling away keeps it. */
const StepRun = memo(function StepRun({ at, tools, live, opened, onToggle }: { at: number; tools: Tool[]; live: boolean; opened: ReadonlySet<string>; onToggle: (k: string) => void }) {
  const open = opened.has(`${at}`)
  const setOpen = () => onToggle(`${at}`)
  const line = (t: Tool, i: number, live: boolean) => <StepLine key={i} t={t} live={live} open={opened.has(`${at}:${i}`)} onToggle={() => onToggle(`${at}:${i}`)} />
  if (tools.length <= 3) return <div className="steps-run">{tools.map((t, i) => line(t, i, live && i === tools.length - 1))}</div>
  const last = tools[tools.length - 1]!
  return (
    <div className={`steps-run ${open ? 'open' : ''}`}>
      <button className={`step step-fold ${live ? 'live' : ''}`} onClick={setOpen} aria-expanded={open}>
        <span className="step-stack">{tools.slice(-3).map((t, i) => <StepMark key={i} name={t.name} />)}</span>
        <span className="step-tool">{tools.length} steps</span>
        <span className="step-arg">{open ? 'Hide' : `${verb(last.name)} ${last.summary}`}</span>
        <span className="step-chev">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="steps-list">{tools.map((t, i) => line(t, i, false))}</div>}
    </div>
  )
})

/** The transcript in drawing order: steps next to each other become one run. */
function runs(lines: Line[]): ({ at: number; l: Line } | { at: number; tools: Tool[] })[] {
  const out: ({ at: number; l: Line } | { at: number; tools: Tool[] })[] = []
  lines.forEach((l, at) => {
    const prev = out[out.length - 1]
    if (l.kind === 'tool' && prev && 'tools' in prev) prev.tools.push(l)
    else out.push(l.kind === 'tool' ? { at, tools: [l] } : { at, l })
  })
  return out
}

const SUGGESTIONS = ['Explain how this project is laid out', 'Run the tests and fix what fails', 'Find dead code and unused files']

/** One session: its HUD, its transcript or changes, the coach, the permission cards and the composer. */
const mins = (ms: number) => (ms >= 60_000 ? `${Math.ceil(ms / 60_000)} min` : `${Math.ceil(ms / 1000)}s`)

/**
 * How long this panel's prompt cache stays warm. A message before it runs out re-reads the
 * conversation at a tenth of the price; after, the whole context is written again.
 */
function CacheChip(props: { at: number; ttl: number; tokens: number; model: string; money: (usd: number) => string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    // frozen while the window is hidden, caught up the moment it shows
    const t = setInterval(() => !document.hidden && setNow(Date.now()), 15_000)
    const show = () => !document.hidden && setNow(Date.now())
    document.addEventListener('visibilitychange', show)
    return () => (clearInterval(t), document.removeEventListener('visibilitychange', show))
  }, [])
  const left = cacheLeft(props.at, props.ttl, now)
  const extra = coldExtraUsd(props.tokens, props.model)
  const cost = `about ${props.money(extra)}`
  const state = left === 0 ? 'cold' : left < props.ttl * 0.2 ? 'low' : 'warm'
  return (
    <span
      className={`cache-chip ${state}`}
      data-tip={left === 0
        ? `The prompt cache has lapsed: the next message writes the whole context again, ${cost} more than a warm one.`
        : `The prompt cache stays warm for ${mins(left)}. A message before then re-reads the conversation at a tenth of the price; after, it costs ${cost} more.`}
    >
      {left === 0 ? 'Cache cold' : `Cache ${mins(left)}`}
    </span>
  )
}

export function Panel(props: {
  sid: string
  /** the runtime state kept in main (working, waiting, idle, error) */
  run?: PanelRun
  s: State
  /** 'lead' or 'worker' when the panel takes part in a lead's work */
  role?: string
  workerTitle?: string
  onLead?: (on: boolean) => void
  focused: boolean
  theme?: Theme
  dim?: boolean
  coachExtra?: { stretch?: number; focus?: boolean }
  money: (usd: number) => string
  dispatch: (a: Action) => void
  onFocus: () => void
  onClose: () => void
}) {
  const { sid, s, money, dispatch } = props
  const [draft, setDraft] = useState('')
  const [atts, setAtts] = useState<Attachment[]>([])
  // context the browser picked (an element, the console, failed requests): a chip here, the full text on send
  // the Workbench library and the Documents tags, for /name and @tag
  const library = useRef<Prompt[]>([])
  const docTags = useRef<string[]>([])
  const [filling, setFilling] = useState<{ prompt: Prompt; rest: string; values: Record<string, string> } | null>(null)
  const [rated, setRated] = useState<string>('')
  useEffect(() => {
    const load = () => {
      void window.stm.wb.state().then((w) => (library.current = w.prompts), () => undefined)
      void window.stm.docs.state().then((d) => (docTags.current = d.tags), () => undefined)
    }
    load()
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [])
  const [sources, setSources] = useState<Source[]>([])
  const sentBlocks = useRef(new Map<string, string>())
  const [exporting, setExporting] = useState(false)
  useEffect(() => {
    const on = (e: Event) => (e as CustomEvent<{ sid: string }>).detail.sid === sid && setExporting(true)
    window.addEventListener('stm:export', on)
    return () => window.removeEventListener('stm:export', on)
  }, [sid])
  // the router: a suggested model for what is being typed, never applied without a click
  const [route, setRoute] = useState<Suggestion | null>(null)
  const [routeOff, setRouteOff] = useState('')
  const tally = useRef<Tally>({})
  useEffect(() => void window.stm.routeTally().then((t) => (tally.current = t), () => undefined), [])
  const sourcesFor = useRef(-1)
  const [ctx, setCtx] = useState<{ label: string; text: string; shrunk?: boolean; busy?: boolean }[]>([])
  // a chip made shorter by the local model before it goes to Claude: errors, paths and numbers kept
  const shrink = async (i: number) => {
    const c = ctx[i]
    if (!c || c.busy) return
    setCtx((x) => x.map((y, k) => (k === i ? { ...y, busy: true } : y)))
    try {
      const short = await askOnce(SHRINK, c.text, 'shrink')
      setCtx((x) => x.map((y) => (y === c || y.text === c.text ? { label: `${c.label} · shrunk`, text: `${short}\n\n(Shortened on this Mac from ${c.text.length.toLocaleString()} to ${short.length.toLocaleString()} characters.)`, shrunk: true } : y)))
    } catch (e) {
      setCtx((x) => x.map((y) => (y.text === c.text ? { ...y, busy: false } : y)))
      dispatch({ kind: 'note', tone: 'error', text: `Could not shorten it on this Mac: ${e instanceof Error ? e.message : String(e)}` })
    }
  }
  const inCanvas = useContext(InCanvas)
  const [tab, setTab] = useState<'chat' | 'changes' | 'git' | 'ci' | 'preview' | 'terminal'>('chat')
  const [previewed, setPreviewed] = useState(false)
  useEffect(() => { if (tab === 'preview') setPreviewed(true) }, [tab])
  // the terminal starts the first time its tab opens, then lives with the panel
  const [termed, setTermed] = useState(false)
  useEffect(() => { if (tab === 'terminal') setTermed(true) }, [tab])
  const [guard, setGuard] = useState<{ text: string; found: Finding[] } | null>(null)
  const [outside, setOutside] = useState<{ text: string; checked: boolean; found: (InjectionFinding & { label: string })[] } | null>(null)
  const [rule, setRule] = useState<{ rule: string; done: string } | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const end = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  // what the panel's browser picked goes into the message, and the chat comes back to ask about it
  const attachFromBrowser = useCallback((add: Attachment[], note?: { label: string; text: string }) => {
    if (add.length) setAtts((a) => [...a, ...add].slice(0, MAX_ATTACHMENTS))
    if (note) setCtx((c) => [...c, note].slice(-5))
    setTab('chat')
    setTimeout(() => box.current?.focus(), 50)
  }, [])
  const root = useRef<HTMLElement>(null)
  const [narrow, setNarrow] = useState(false)

  // a narrow panel (three side by side, or a small window) gets the one-line HUD
  useEffect(() => {
    const el = root.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setNarrow((e?.contentRect.width ?? 1000) < 720))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [s.lines.length, s.streaming, s.asks.length, tab])
  // the composer grows with its text, up to a third of the panel: done in CSS (field-sizing), because
  // measuring scrollHeight here forced three layouts of the whole window on every key
  useEffect(() => {
    if (props.focused) box.current?.focus()
  }, [props.focused])
  // text handed over from the Memory sheet goes in front of the draft
  useEffect(() => {
    const onPrefill = (e: Event) => {
      const d = (e as CustomEvent<{ sid: string; text: string; quiet?: boolean }>).detail
      if (d.sid !== sid) return
      setDraft((cur) => d.text + cur)
      if (!d.quiet) box.current?.focus()
    }
    window.addEventListener('stm:prefill', onPrefill)
    return () => window.removeEventListener('stm:prefill', onPrefill)
  }, [sid])
  const [saved, setSaved] = useState('')
  const lastReply = [...s.lines].reverse().find((l) => l.kind === 'assistant')
  const [snapHidden, setSnapHidden] = useState(false)
  useEffect(() => setSnapHidden(false), [s.snapshot?.text])
  useEffect(() => {
    const t = setTimeout(() => setRoute(s.model ? suggest(draft, tierOf(s.model), s.context?.tokens ?? 0, tally.current) : null), 400)
    return () => clearTimeout(t)
  }, [draft, s.model, s.context?.tokens])
  // the reply to a message with sources: its citations are checked once, when it lands
  const replies = s.lines.filter((l) => l.kind === 'assistant').length
  const [cited, setCited] = useState<number[]>([])
  const [faith, setFaith] = useState<Faith | null>(null)
  const [judged, setJudged] = useState<{ verdicts: (string | null)[]; costUsd: number } | null>(null)
  useEffect(() => {
    if (s.busy || !sources.length || sourcesFor.current < 0 || replies <= sourcesFor.current || lastReply?.kind !== 'assistant') return
    sourcesFor.current = -1
    setCited(citesOf(lastReply.text))
    setFaith(faithfulness(lastReply.text, sources))
    setJudged(null)
    const bad = citeCheck(lastReply.text, sources)
    if (bad) dispatch({ kind: 'note', tone: 'error', text: bad })
  }, [s.busy, replies])
  const rememberLast = async () => {
    if (!lastReply || lastReply.kind !== 'assistant') return
    const asked = [...s.lines].reverse().find((l) => l.kind === 'user')
    try {
      const file = await window.stm.remember(s.cwd, asked && asked.kind === 'user' ? asked.text : 'Note', lastReply.text)
      // also a memory item, marked as coming from Claude (kept when you chose to remember it)
      void window.stm.mi.add(s.cwd.split('/').filter(Boolean).pop() ?? '', lastReply.text.slice(0, 1500), 'agent').catch(() => undefined)
      setSaved(`Saved to ${file}`)
    } catch (e) {
      setSaved(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
    }
    setTimeout(() => setSaved(''), 4000)
  }

  const queued = useQueueState(sid)
  const [fbOpen, setFbOpen] = useState(false)
  const failCard = useFailoverCard(sid)
  const submit = (text: string, checked = false, outsideChecked = false, list = ctx) => {
    let typed = text.trim()
    if (!typed && !atts.length && !list.length) return
    // /name from the Workbench library: its fields asked first, then its text with what follows
    const sl = slashOf(typed)
    const lib = sl && !/^(goal|status|account)$/.test(sl.name) ? findPrompt(library.current, sl.name) : null
    if (sl && lib) {
      const fs = fieldsOf(lib.body)
      if (fs.length) {
        setFilling({ prompt: lib, rest: sl.rest, values: Object.fromEntries(fs.map((f) => [f.name, f.default ?? ''])) })
        setDraft('')
        return
      }
      typed = [lib.body, sl.rest].filter(Boolean).join('\n\n')
    }
    // @tag: the best passages of the documents with that tag go along, marked as outside data
    const col = collectionsOf(typed, docTags.current)
    if (col.tags.length && !outsideChecked) {
      setDraft('')
      void Promise.all(col.tags.map((tag) => window.stm.docs.search(col.text || tag, tag).then((hits) => hits.slice(0, 3).map((h) => ({ tag, h })), () => []))).then(async (all) => {
        // each passage gets a mark the answer cites, [S1] and on, checked when the reply comes back
        const srcs: Source[] = all.flat().map(({ tag, h }, i) => ({ n: i + 1, doc: h.doc.id, chunk: h.chunk.id, title: h.doc.title || h.doc.original, tag, text: h.chunk.text }))
        // phase 84: passages go in compacted; a paragraph this panel already sent becomes a pointer
        const stages = await window.stm.compactor.get().catch(() => LOSSLESS)
        let saved = 0
        const items = srcs.map((x) => {
          const c = compact(x.text, { stages }, sentBlocks.current)
          saved += c.before - c.after
          return { label: sourceLabel(x), text: c.text }
        })
        if (saved > 0) void window.stm.compactor.saved(sid, saved)
        if (!items.length) dispatch({ kind: 'note', text: `No passages found under ${col.tags.map((t) => `@${t}`).join(', ')}.` })
        setSources(srcs)
        sourcesFor.current = s.lines.filter((l) => l.kind === 'assistant').length
        setCtx((c) => [...c, ...items])
        submit(srcs.length ? `${col.text}\n\n${CITE_RULE}` : col.text, checked, false, [...list, ...items])
      })
      return
    }
    // what came from outside (a page, an API answer, a query result) goes in marked as data, not orders
    const t = [typed, ...list.map((c) => wrapOutside(c.label, c.text))].filter(Boolean).join('\n\n')
    // a credential in a prompt would sit in the transcript and the model's context: stop and ask
    if (!checked) {
      const local = findSecrets(t)
      // saved vault values too: the main process holds them and only answers with the ones in this text
      void window.stm.guardSecrets(t).catch(() => []).then((saved) => {
        const found = [...saved, ...local.filter((l) => !saved.some((v) => v.value === l.value))]
        if (found.length) setGuard({ text: typed, found })
        else submit(typed, true, outsideChecked, list)
      })
      return
    }
    setGuard(null)
    // outside text that tries to give orders: say what and where before it goes
    if (!outsideChecked && list.length) {
      void Promise.all(list.map((c) => window.stm.guardInject(c.text).then((f) => f.map((x) => ({ ...x, label: c.label }))).catch(() => []))).then((all) => {
        const hits = all.flat()
        if (hits.length) setOutside({ text: typed, checked, found: hits })
        else submit(typed, checked, true, list)
      })
      return
    }
    setOutside(null)
    setDraft('')
    // /status and /account are terminal screens Claude Code cannot show here: the app answers them
    // /goal: a condition for done that rides along with every message until a reply says it is met
    const gc = goalCommand(t)
    if (gc) {
      if ('set' in gc) void window.stm.goal.set(sid, gc.set).then((g) => { dispatch({ kind: 'goal', goal: g?.text ?? null }); dispatch({ kind: 'note', text: `Goal set: ${gc.set}. Every message here carries it until a reply says it is met. /goal clear ends it.` }) })
      else if ('clear' in gc) void window.stm.goal.set(sid, null).then(() => { dispatch({ kind: 'goal', goal: null }); dispatch({ kind: 'note', text: 'Goal cleared.' }) })
      else dispatch({ kind: 'note', text: s.goal ? `Goal: ${s.goal}` : 'No goal. Set one with /goal and the condition for done, e.g. /goal all tests in api/ pass.' })
      return
    }
    if (/^\/(status|account)\s*$/.test(t)) {
      window.stm.account(sid).then(
        (a) => {
          const plan = a.subscriptionType ? `${a.subscriptionType[0]!.toUpperCase()}${a.subscriptionType.slice(1)} plan` : 'no subscription'
          const viaKey = !!a.apiKeySource
          dispatch({
            kind: 'note',
            tone: viaKey ? 'error' : undefined,
            text: [
              `Account: ${a.email ?? 'unknown'}${a.organization ? ` (${a.organization})` : ''}`,
              `Billing: ${viaKey ? `API key from ${a.apiKeySource}, charged per token` : plan}`,
              a.apiProvider && a.apiProvider !== 'firstParty' ? `Provider: ${a.apiProvider}` : '',
              `Model: ${s.model || 'default'}`,
            ].filter(Boolean).join('\n'),
          })
        },
        (e: Error) => dispatch({ kind: 'note', tone: 'error', text: e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }),
      )
      return
    }
    setTab('chat')
    const sending = atts
    setAtts([])
    // a turn is running: the message goes into the queue and leaves when the turn ends (attachments still go straight in)
    if (s.busy && !sending.length) {
      setCtx([])
      void window.stm.queue.act(sid, { t: 'add', item: { id: crypto.randomUUID(), text: t, at: Date.now(), state: 'waiting' } }).catch((e: Error) => dispatch({ kind: 'note', tone: 'error', text: e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }))
      return
    }
    const shown = list.length ? [typed, `+ ${list.map((c) => c.label).join(', ')}`].filter(Boolean).join('\n') : t
    setCtx([])
    dispatch({ kind: 'sent', text: shown, at: Date.now(), images: sending.flatMap((a) => (a.kind === 'image' ? [`data:${a.mediaType};base64,${a.data}`] : [])), files: sending.flatMap((a) => (a.kind === 'file' ? [a.path] : [])) })
    void window.stm.send(sid, t, sending)
    // a correction said once can stand: offered as a rule for the persona or the project
    const c = correctionOf(typed || t)
    setRule(c ? { rule: c.rule, done: '' } : null)
  }
  // pasted, dropped or picked: images Claude will see, files and folders it is pointed at
  const addFiles = async (files: File[]) => {
    const next: Attachment[] = []
    for (const f of files) {
      const type = IMAGE_TYPES.find((t) => t === f.type) ?? imageTypeOf(f.name)
      if (type && f.size <= MAX_IMAGE_BYTES) {
        const data = await new Promise<string>((ok) => {
          const r = new FileReader()
          r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''))
          r.readAsDataURL(f)
        })
        next.push({ kind: 'image', name: f.name || 'pasted image', mediaType: type, data })
        continue
      }
      const path = window.stm.pathOf(f)
      if (path) next.push({ kind: 'file', name: f.name || path.split('/').pop()!, path, dir: await window.stm.isDir(path) })
      else if (type) dispatch({ kind: 'note', tone: 'error', text: `${f.name || 'The image'} is over 5 MB, the most an image can be.` })
    }
    if (next.length) setAtts((a) => [...a, ...next].slice(0, MAX_ATTACHMENTS))
    box.current?.focus()
  }
  /** Cmd+Enter: run the text in the panel's folder, no model, no tokens. */
  const runShell = (text: string) => {
    const t = text.trim()
    if (!t) return
    setDraft('')
    setTab('chat')
    void window.stm.runShell(sid, t)
  }
  const answer = (id: string, allow: boolean, extra?: { command?: string; note?: string; tool?: string }) => {
    dispatch({ kind: 'answered', id })
    setReply(null)
    void window.stm.answer(sid, id, allow, extra)
  }
  // an approval with something added: the command edited before it runs, or a note sent back with a denial
  const [reply, setReply] = useState<{ id: string; mode: 'edit' | 'note'; text: string } | null>(null)

  // a K.O. plays for a few seconds after each cut, then the HUD goes back to the numbers
  const [, setTick] = useState(0)
  useEffect(() => {
    const last = s.cuts.at(-1)
    if (!last) return
    const left = KO_MS - (Date.now() - last.at)
    if (left <= 0) return
    const t = setTimeout(() => setTick((n) => n + 1), left + 50)
    return () => clearTimeout(t)
  }, [s.cuts])
  const themed = (svg: string) => (props.theme ? themeSvg(svg, props.theme) : svg)
  const mood = moodOf(s, Date.now(), { focus: props.coachExtra?.focus && !props.dim })
  const tips = coach(s, Date.now(), props.coachExtra).filter((t) => !dismissed.has(t.id))
  const [shown, setShown] = useState(WINDOW)
  const hidden = Math.max(0, s.lines.length - shown)
  // the drawn transcript, keyed by place in s.lines (stable when earlier lines are shown)
  const items = useMemo(() => runs(s.lines.slice(hidden)).map((r) => ({ ...r, at: hidden + r.at })), [s.lines, hidden])
  const itemKeys = useMemo(() => items.map((r) => String(r.at)), [items])
  const scroller = useRef<HTMLElement>(null)
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set())
  const toggleOpen = useCallback((k: string) => setOpened((o) => { const n = new Set(o); if (!n.delete(k)) n.add(k); return n }), [])
  const stopShell = useCallback((id: string) => void window.stm.stopShell(sid, id), [sid])
  const [dropping, setDropping] = useState(false)
  const submitRef = useRef(submit)
  const attachRef = useRef(attachFromBrowser)
  attachRef.current = attachFromBrowser
  submitRef.current = submit
  // other surfaces (Docker) ask the focused panel through a window event
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ sid: string; text: string; quiet?: boolean }>).detail
      if (d.sid === sid) submitRef.current(d.text)
    }
    window.addEventListener('stm:ask', on)
    // and hand it context to send with the next message (the API client, the database viewer)
    const attach = (e: Event) => {
      const d = (e as CustomEvent<{ sid: string; label: string; text: string }>).detail
      if (d.sid === sid) attachRef.current([], { label: d.label, text: d.text })
    }
    window.addEventListener('stm:attach', attach)
    return () => {
      window.removeEventListener('stm:ask', on)
      window.removeEventListener('stm:attach', attach)
    }
  }, [sid])
  const sendShell = useCallback((l: Extract<Line, { kind: 'shell' }>) => submitRef.current(forClaude(l)), [])
  const files = new Set(s.changes.map((c) => c.file)).size
  // the latest run of the branch, as a dot on the CI tab
  const latest = s.ci?.runs[0]
  const ciState = !latest ? 'none' : latest.status !== 'completed' ? 'running' : latest.conclusion === 'success' ? 'success' : latest.conclusion === 'failure' ? 'failure' : 'neutral'
  const ciTitle = latest ? `${latest.workflow}: ${latest.status === 'completed' ? latest.conclusion : latest.status}` : 'No runs yet'
  // a worktree panel is named after the repository it came from; its chip says the branch
  const folder = (s.worktree?.repo ?? s.cwd).split('/').filter(Boolean)
  const empty = s.lines.length === 0 && !s.streaming && !s.asks.length

  return (
    <section
      ref={root}
      data-sid={props.sid}
      className={`panel ${props.focused ? 'focused' : ''} ${narrow ? 'narrow' : ''} ${props.dim ? 'dim' : ''} ${dropping ? 'dropping' : ''}`}
      onMouseDown={props.onFocus}
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes('Files')) return
        e.preventDefault()
        setDropping(true)
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDropping(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return
        e.preventDefault()
        setDropping(false)
        void addFiles(Array.from(e.dataTransfer.files))
      }}
    >
      {dropping && <div className="drop-veil"><span>Drop to attach</span></div>}
      <header className={`panel-bar${inCanvas ? ' compact' : ''}`}>
        {(() => {
          const m = s.asleep || !s.model ? null : markOf(props.run)
          return m ? <StateMark state={m.state} shape={m.shape} label={m.label} /> : <StateMark state={s.busy ? 'busy' : s.asleep ? 'off' : s.model ? 'up' : 'warn'} label={s.busy ? 'Working' : s.asleep ? 'Asleep: the next message resumes it' : s.model ? 'Ready' : 'Starting'} />
        })()}
        <span className="path" data-tip={`${s.cwd}\nPanel id ${sid}, for messages between panels`}>
          <span className="path-parent">{folder.slice(-2, -1)[0] ?? ''}/</span>
          {folder.at(-1) ?? '...'}
        </span>
        {props.role && <span className={`role-mark ${props.role}`} data-tip={props.role === 'lead' ? 'Lead: plans the work and hands tasks to its workers' : `Worker${props.workerTitle ? `: ${props.workerTitle}` : ''}. Does one task and answers the lead`}>{props.role === 'lead' ? 'Lead' : 'Worker'}</span>}
        {inCanvas && props.role === 'worker' && props.workerTitle && <span className="task-title" data-tip={props.workerTitle}>{props.workerTitle}</span>}
        <span className="cost-chip" data-tip={`Spent in this panel: ${props.money(s.costUsd)}`}>{props.money(s.costUsd)}</span>
        {s.goal && (
          <span className="goal-chip" data-tip={`Goal: ${s.goal}. /goal clear ends it.`}>
            <svg viewBox="0 0 12 12" aria-hidden><circle cx="6" cy="6" r="4.6" /><circle cx="6" cy="6" r="1.6" /></svg>
            <span>{s.goal}</span>
          </span>
        )}
        {s.persona && (
          <span className="persona-chip" style={{ '--pc': s.persona.color } as React.CSSProperties} data-tip={`Persona: ${s.persona.name}${s.persona.access && s.persona.access !== 'ask' ? `. ${ACCESS[s.persona.access].what}` : ''}`}>
            {s.persona.access && s.persona.access !== 'ask' && <AccessMark access={s.persona.access} />}
            {s.persona.name}
          </span>
        )}
        {s.sandbox && <SandboxChip cwd={s.cwd} />}
        {s.remote && (
          <RemoteChip sid={sid} remote={s.remote} onPreview={(url) => (dispatch({ kind: 'preview-url', url }), setTab('preview'))} onDone={(note, close) => (dispatch({ kind: 'note', text: note }), close && props.onClose())} />
        )}
        {s.worktree && (
          <WorktreeChip
            sid={sid}
            wt={s.worktree}
            hasPreview={s.servers.length > 0}
            onPreview={() => setTab('preview')}
            onDone={(note, close) => window.dispatchEvent(new CustomEvent('stm:close-panels', { detail: { sids: close, note, repo: s.worktree?.repo } }))}
          />
        )}
        {s.model && <span className="badge">{s.model.replace(/^claude-/, '').replace(/-(\d+)-(\d+)$/, ' $1.$2')}</span>}
        {s.cacheTtl && s.lastTurnAt && !s.busy && <CacheChip at={s.lastTurnAt} ttl={s.cacheTtl} tokens={s.context?.tokens ?? 0} model={s.model} money={props.money} />}
        {saved && <span className="saved-note">{saved}</span>}
        {lastReply && !s.busy && (
          <span className="wb-rate" role="group" aria-label="Rate the last reply">
            {rated ? <span className="saved-note">{rated}{rated === 'Rated good' && <button className="ghost small" data-tip="The app drafts a Claude Code skill from what this panel did; it does nothing until you approve it" onClick={() => window.dispatchEvent(new CustomEvent('stm:skill-draft', { detail: { sid } }))}>Draft a skill</button>}</span> : (
              <>
                <ReadAloud text={lastReply.kind === 'assistant' ? lastReply.text : ''} onNote={(text) => dispatch({ kind: 'note', tone: 'error', text })} />
                <button className="ghost small" data-tip="A good reply: scored in Observability and kept as an example" onClick={() => void window.stm.wb.rate(sid, 1, lastReply.kind === 'assistant' ? lastReply.text : '').then(() => (setRated('Rated good'), setTimeout(() => setRated(''), 15000)), (e: Error) => setRated(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))}>Good</button>
                <button className="ghost small" data-tip="A bad reply: scored in Observability and kept as a case to improve" onClick={() => void window.stm.wb.rate(sid, 0, '').then(() => (setRated('Rated bad'), setTimeout(() => setRated(''), 3000)), (e: Error) => setRated(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))}>Bad</button>
              </>
            )}
          </span>
        )}
        {lastReply && (
          <button className="ghost small remember" data-tip="Save the last reply to this project's note in the vault" onClick={() => void rememberLast()}>
            <IconRemember /> Remember
          </button>
        )}
        <PanelMore sid={sid}>
          <div className="more-tabs" role="tablist" aria-label="Panel views">
            {(['chat', 'changes', 'git', 'terminal', 'preview'] as const).map((t) => (
              <button key={t} role="tab" className="ghost small" aria-selected={tab === t} onClick={() => setTab(t)}>{t === 'preview' ? 'Browse' : t[0]!.toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
          {props.onLead && props.role !== 'worker' && (
            <button className="ghost small" data-tip={props.role === 'lead' ? 'This panel stops being the lead; its workers are unlinked' : 'This panel plans and hands tasks to worker panels; workers only execute and answer it'} onClick={() => props.onLead!(props.role !== 'lead')}>{props.role === 'lead' ? 'Remove lead' : 'Make lead'}</button>
          )}
          <span className="more-meter">{s.context ? `Context ${Math.round(s.context.percent)}% used of ${Math.round(s.context.window / 1000)}k. ` : ''}{props.money(s.costUsd)} spent.</span>
          {props.role && <button className="ghost small" data-tip="The shared channel of the lead and its workers" onClick={() => openChannel()}>Team channel</button>}
          {fbOpen ? <Suspense fallback={null}><FallbackChip sid={sid} /></Suspense> : <button className="ghost small" data-tip="What to offer when a limit or an outage stops a turn" onClick={() => setFbOpen(true)}>Fallback</button>}
          <LinksChip sid={sid} />
          <Suspense fallback={null}><PanelControl sid={sid} cwd={s.cwd} busy={s.busy} /></Suspense>
          {s.meter?.label && <span className="meter-chip" data-tip={[...s.meter.detail, 'Estimates from characters; Headroom counts for all panels in Savings.'].join('\n')}>{s.meter.label}</span>}
          <Suspense fallback={null}><UsageChip sid={sid} refresh={`${s.turns}:${JSON.stringify(s.limits)}`} /></Suspense>
          <SourceChip sid={sid} limits={s.limits} refresh={s.lines.length} onNote={(text) => dispatch({ kind: 'note', tone: 'error', text })} />
          <TrimTools sid={sid} task={String(([...s.lines].reverse().find((l) => l.kind === 'user') as { text?: string } | undefined)?.text ?? '').slice(0, 300)} onNote={(text) => dispatch({ kind: 'note', tone: 'error', text })} />
          {!s.sandbox && <IsolateChip sid={sid} onNote={(text) => dispatch({ kind: 'note', tone: 'error', text })} />}
          {lastReply && (
            <button className="ghost small" data-tip="Export this conversation as Markdown or HTML, credentials masked" onClick={() => setExporting(true)}>Export</button>
          )}
        </PanelMore>
        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={tab === 'chat'} onClick={() => setTab('chat')}>Chat</button>
          <button role="tab" aria-selected={tab === 'changes'} onClick={() => setTab('changes')}>
            Changes{files ? <span className="count">{files}</span> : null}
          </button>
          <button role="tab" aria-selected={tab === 'git'} onClick={() => setTab('git')}>Git</button>
          <button role="tab" aria-selected={tab === 'terminal'} onClick={() => setTab('terminal')} data-tip="A shell in this folder">Terminal</button>
          <button role="tab" aria-selected={tab === 'preview'} onClick={() => setTab('preview')} data-tip={s.servers.length ? s.servers.map((v) => v.url).join('\n') : 'Your app on localhost, or any site, with developer tools'}>
            Browse{s.servers.length ? <StateMark state="up" label="A dev server is running" /> : null}
          </button>
          {s.ci && (
            <button role="tab" aria-selected={tab === 'ci'} onClick={() => setTab('ci')} data-tip={ciTitle}>
              CI <StateMark state={ciState === 'success' ? 'up' : ciState === 'failure' ? 'down' : ciState === 'running' ? 'busy' : 'off'} label={ciTitle} />
            </button>
          )}
        </div>
        <button className="icon" data-tip="Close panel (Cmd+W)" aria-label="Close panel" onClick={props.onClose}>
          <IconClose />
        </button>
      </header>

      {inCanvas && (
        <div className="ctx-thin" role="img" aria-label={`Context ${Math.round(s.context?.percent ?? 0)}% used`} data-tip={`${s.context ? `Context ${Math.round(s.context.percent)}% used (${s.context.tokens.toLocaleString()} of ${s.context.window.toLocaleString()} tokens)` : 'No context used yet'}\n${props.money(s.costUsd)} spent. ${WHY[mood]}\nFull meter: use the grid layout.`}>
          <i style={{ width: `${Math.min(100, Math.max(0, s.context?.percent ?? 0))}%` }} />
        </div>
      )}
      <Suspense fallback={null}><PlanStrip sid={sid} compact={inCanvas} /></Suspense>
      <div className="hud" data-tip={WHY[mood]} role="img" aria-label={WHY[mood]} dangerouslySetInnerHTML={{ __html: themed(hudMini(hudView(s, money, Date.now()))) }} />

      {/* stays mounted once opened, so switching tabs keeps the page and its state */}
      {(tab === 'preview' || previewed) && <section className="preview-host" hidden={tab !== 'preview'}><Suspense fallback={null}><PreviewView panel={sid} servers={s.servers} onAttach={attachFromBrowser} persona={s.persona?.id} /></Suspense></section>}
      {(tab === 'terminal' || termed) && <section className="preview-host" hidden={tab !== 'terminal'}><Suspense fallback={null}><TermView sid={sid} active={tab === 'terminal'} onAttach={(note) => attachFromBrowser([], note)} /></Suspense></section>}
      <main ref={scroller} className="scroll" hidden={tab === 'preview' || tab === 'terminal'}>
        <div className="column">
          {tab === 'changes' && <Changes changes={s.changes} cwd={s.cwd} onSend={(text) => { setTab('chat'); dispatch({ kind: 'sent', text, at: Date.now() }); void window.stm.send(sid, text) }} />}
          {tab === 'git' && <GitView sid={sid} active={tab === 'git'} />}
          {tab === 'ci' && <CiView sid={sid} ci={s.ci} onAsk={(t) => submit(t)} />}
          {tab === 'chat' && empty && (
            <div className="welcome">
              <div className="welcome-title">What are we building in {folder.at(-1) ?? 'this folder'}?</div>
              <div className="chips">
                {SUGGESTIONS.map((t) => (
                  <button key={t} className="chip" onClick={() => submit(t)}>{t}</button>
                ))}
              </div>
            </div>
          )}
          {tab === 'chat' && hidden > 0 && (
            <button className="ghost small earlier" onClick={() => setShown((n) => n + WINDOW)}>
              Show {Math.min(hidden, WINDOW)} earlier of {hidden}
            </button>
          )}
          {tab === 'chat' && (
            <Windowed scroller={scroller} keys={itemKeys}>
              {(i) => {
                const r = items[i]!
                return 'tools' in r ? (
                  <StepRun key={r.at} at={r.at} tools={r.tools} live={s.busy && !s.streaming && i === items.length - 1} opened={opened} onToggle={toggleOpen} />
                ) : (
                  <LineView key={r.at} l={r.l} onStop={stopShell} onSend={sendShell} />
                )
              }}
            </Windowed>
          )}
          {tab === 'chat' && s.streaming && (
            <div className="msg assistant">
              <Markdown text={s.streaming} live />
              <span className="caret" />
            </div>
          )}
          {tab === 'chat' && s.busy && !s.streaming && !s.asks.length && (
            <Thinking lines={s.lines} />
          )}
          {s.asks.map((a) => (
            <div key={a.id} className="ask">
              <div className="ask-head">
                <span className="ask-label">Permission</span>
                <span className="ask-tool">{toolName(a.tool)}</span>
                {a.cls && <span className={`in-cls ${a.cls}`}>{a.cls === 'read' ? 'Read' : 'Write'}</span>}
              </div>
              {a.why && <div className="ask-why faint">Asks because it is {a.why}. Change this in MCP approvals.</div>}
              {a.edit ? <Diff edit={a.edit} cwd={s.cwd} /> : <pre className="ask-cmd">{a.summary}</pre>}
              {a.risk && <div className="ask-risk"><RiskChip risk={a.risk} /></div>}
              {reply?.id === a.id ? (
                <div className="ask-reply">
                  <textarea
                    className="ask-reply-text"
                    aria-label={reply.mode === 'edit' ? 'Command to run instead' : 'Note for the agent'}
                    placeholder={reply.mode === 'note' ? 'What to do instead, sent back to the agent' : undefined}
                    value={reply.text}
                    rows={reply.mode === 'edit' ? Math.min(8, reply.text.split('\n').length + 1) : 3}
                    autoFocus
                    onChange={(e) => setReply({ ...reply, text: e.target.value })}
                  />
                  <div className="ask-actions">
                    <button className="ghost" onClick={() => setReply(null)}>Back</button>
                    {reply.mode === 'edit' ? (
                      <button className="primary" disabled={!reply.text.trim()} onClick={() => answer(a.id, true, { command: reply.text })}>Run this instead</button>
                    ) : (
                      <button className="primary" disabled={!reply.text.trim()} onClick={() => answer(a.id, false, { note: reply.text, tool: a.tool })}>Deny and send the note</button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="ask-actions">
                  <button className="ghost" onClick={() => setReply({ id: a.id, mode: 'note', text: '' })}>Deny with a note</button>
                  {a.command !== undefined && <button className="ghost" onClick={() => setReply({ id: a.id, mode: 'edit', text: a.command! })}>Edit and run</button>}
                  <button className="ghost" onClick={() => answer(a.id, false)}>Deny</button>
                  <button className="primary" onClick={() => answer(a.id, true)}>Allow</button>
                </div>
              )}
            </div>
          ))}
          {s.held && (
            <div className="ask held-card" role="alert">
              <div className="ask-head">
                <StateMark state="warn" label="Held" />
                <span className="ask-label">{s.held.scope === 'turn' ? 'Asks first' : 'Budget'}</span>
              </div>
              <p className="held-why">{heldText(s.held, props.money)} The message waits here until you decide.</p>
              <div className="ask-actions">
                <button className="ghost" onClick={() => window.dispatchEvent(new Event('stm:budget'))}>Limits</button>
                <button className="ghost" onClick={() => void window.stm.drop(sid)}>Drop it</button>
                <button className="primary" onClick={() => void window.stm.release(sid)}>Send anyway</button>
              </div>
            </div>
          )}
          {s.gate && (
            <div className="ask held-card gate-card" role="alert">
              <div className="ask-head">
                <StateMark state="warn" label="Waiting" />
                <span className="ask-label">{s.gate.name} · step {s.gate.step} of {s.gate.of}</span>
              </div>
              <pre className="ask-cmd">{s.gate.text}</pre>
              <div className="ask-actions">
                <button className="ghost" onClick={() => void window.stm.triggers.gate(s.gate!.run, false)}>Stop the run</button>
                <button className="primary" onClick={() => void window.stm.triggers.gate(s.gate!.run, true)}>Run this step</button>
              </div>
            </div>
          )}
          {failCard && <Suspense fallback={null}><FailoverCard sid={sid} card={failCard} /></Suspense>}
          {s.loop && !s.busy && (
            <LoopNotice
              loop={s.loop}
              money={money}
              onContinue={() => {
                dispatch({ kind: 'sent', text: LOOP_CONTINUE, at: Date.now() })
                void window.stm.send(sid, LOOP_CONTINUE)
              }}
              onQuiet={() => {
                void window.stm.loopQuiet(sid)
                dispatch({ kind: 'sent', text: LOOP_CONTINUE, at: Date.now() })
                void window.stm.send(sid, LOOP_CONTINUE)
              }}
            />
          )}
          {rule && (
            <div className="ask rule-card" role="status">
              <div className="ask-head">
                <StateMark state={rule.done ? 'up' : 'off'} label={rule.done ? 'Saved' : 'Rule'} />
                <span className="ask-label">{rule.done ? 'Rule saved' : 'Keep this as a rule?'}</span>
              </div>
              <p className="held-why">{rule.done ? `Added to ${rule.done}. New panels follow it.` : <>“{rule.rule}”</>}</p>
              {!rule.done && (
                <div className="ask-actions">
                  <button className="ghost" onClick={() => setRule(null)}>No</button>
                  <button className="ghost" onClick={() => void window.stm.addRule('project', s.cwd, rule.rule).then((r) => setRule({ ...rule, done: r.where }), (e: Error) => dispatch({ kind: 'note', tone: 'error', text: e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }))}>For this project</button>
                  {s.persona?.id && <button className="primary" onClick={() => void window.stm.addRule('persona', s.persona!.id!, rule.rule).then((r) => setRule({ ...rule, done: r.where }), (e: Error) => dispatch({ kind: 'note', tone: 'error', text: e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }))}>For {s.persona.name}</button>}
                </div>
              )}
              {rule.done && <div className="ask-actions"><button className="ghost" onClick={() => setRule(null)}>Dismiss</button></div>}
            </div>
          )}
          <div ref={end} />
        </div>
      </main>

      <footer className="dock">
        {guard && (
          <div className="guard" role="alert">
            <div className="guard-text">
              <span className="guard-title">
                {guard.found.length === 1 ? 'This message carries a credential' : `This message carries ${guard.found.length} credentials`}
              </span>
              <span className="guard-list">
                {guard.found.map((f) => (
                  <span key={f.index}>
                    {f.kind} <code>{mask(f.value)}</code> as <b>{f.name}</b>
                  </span>
                ))}
              </span>
            </div>
            <div className="guard-actions">
              <button className="ghost small" onClick={() => setGuard(null)}>Edit</button>
              <button className="ghost small" onClick={() => submit(guard.text, true)}>Send as is</button>
              <button
                className="primary small"
                onClick={async () => {
                  let t = guard.text
                  for (const f of guard.found) {
                    await window.stm.vaultSet(f.name, f.value)
                    t = t.split(f.value).join(`[${f.name}, saved in the vault]`)
                  }
                  // the credential may also sit in attached context: it leaves there too
                  submit(t, true, false, ctx.map((c) => ({ ...c, text: guard.found.reduce((x, f) => x.split(f.value).join(`[${f.name}, saved in the vault]`), c.text) })))
                }}
              >
                Save to vault and send without it
              </button>
            </div>
          </div>
        )}
        {filling && (
          <div className="guard wb-fill" role="dialog" aria-label={`Fields of /${filling.prompt.name}`}>
            <div className="guard-text">
              <span className="guard-title">/{filling.prompt.name}: {filling.prompt.title}</span>
              <div className="wb-fields">
                {Object.keys(filling.values).map((k, i) => (
                  <label key={k}>{k}<input autoFocus={i === 0} value={filling.values[k]} onChange={(e) => setFilling({ ...filling, values: { ...filling.values, [k]: e.target.value } })} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), setFilling(null), submit([fill(filling.prompt.body, filling.values), filling.rest].filter(Boolean).join('\n\n')))} /></label>
                ))}
              </div>
            </div>
            <div className="guard-actions">
              <button className="ghost small" onClick={() => (setDraft([`/${filling.prompt.name}`, filling.rest].filter(Boolean).join(' ')), setFilling(null))}>Cancel</button>
              <button className="primary small" onClick={() => (setFilling(null), submit([fill(filling.prompt.body, filling.values), filling.rest].filter(Boolean).join('\n\n')))}>Send</button>
            </div>
          </div>
        )}
        {outside && (
          <div className="guard outside-guard" role="alert">
            <div className="guard-text">
              <span className="guard-title">
                <StateMark state="warn" label="Looks like orders for an AI" />
                Text you are about to send tries to give Claude orders
                <span className="guard-score">{(() => { const sc = injectionScore(outside.found.map((f) => ({ severity: f.severity, rule: f.rule }))); return `${sc.label} · ${sc.score}/100` })()}</span>
              </span>
              <span className="guard-list">
                {outside.found.map((f, i) => (
                  <span key={i}>
                    <b>{f.label}</b> {f.rule}: <code>{f.excerpt}</code>
                  </span>
                ))}
              </span>
            </div>
            <div className="guard-actions">
              <button className="ghost small" onClick={() => setOutside(null)}>Edit</button>
              <button className="ghost small" onClick={() => {
                const flagged = new Set(outside.found.map((f) => f.label))
                setCtx((cs) => cs.filter((c) => !flagged.has(c.label)))
                setOutside(null)
              }}>Remove it</button>
              <button className="primary small" onClick={() => submit(outside.text, outside.checked, true)}>Send it as data</button>
            </div>
          </div>
        )}
        {tips.length > 0 && (
          <div className="tips">
            {tips.map((t) => (
              <div key={t.id} className={`tip ${t.tone}`} data-tip={t.body}>
                {t.meter != null && (
                  <svg className="tip-ring" width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
                    <circle cx="17" cy="17" r="14" className="track" />
                    <circle cx="17" cy="17" r="14" className="fill" strokeDasharray={`${Math.min(1, t.meter) * 88} 88`} transform="rotate(-90 17 17)" />
                    <text x="17" y="21" textAnchor="middle">{t.mark}</text>
                  </svg>
                )}
                <div className="tip-text">
                  <span className="tip-title">{t.title}</span>
                  {t.meter == null && <span className="tip-body">{t.body}</span>}
                </div>
                {t.action && (
                  <button className="ghost small" onClick={() => submit(t.action!.prompt)}>{t.action.label}</button>
                )}
                <button className="icon" aria-label="Dismiss" onClick={() => setDismissed(new Set([...dismissed, t.id]))}>
                  <IconClose />
                </button>
              </div>
            ))}
          </div>
        )}
        {(atts.length > 0 || ctx.length > 0) && (
          <div className="atts">
            {ctx.map((c, i) => (
              <span key={`c${i}`} className="att ctx" data-tip={c.text.slice(0, 600)}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2h6M2 2v6M14 14H8M14 14V8" /></svg>
                <span className="att-name">{c.label}</span>
                {!c.shrunk && c.text.length > 1500 && (
                  <button className={`att-shrink ${c.busy ? 'busy' : ''}`} data-tip={`Shorten it on this Mac before sending (${Math.round(c.text.length / 4).toLocaleString()} tokens now); free`} aria-label="Shorten on this Mac" onClick={() => void shrink(i)}>
                    <svg viewBox="0 0 12 12" aria-hidden><path d="M2 2l3 3M5 2v3H2M10 10 7 7M7 10V7h3" /></svg>
                  </button>
                )}
                <button className="att-x" aria-label={`Remove ${c.label}`} onClick={() => setCtx((x) => x.filter((_, k) => k !== i))}>×</button>
              </span>
            ))}
            {atts.map((a, i) => (
              <span key={i} className={`att ${a.kind}`} data-tip={a.kind === 'file' ? a.path : a.name}>
                {a.kind === 'image' ? <img src={`data:${a.mediaType};base64,${a.data}`} alt="" /> : <FileGlyph dir={a.dir} />}
                <span className="att-name">{a.name}</span>
                <button className="att-x" aria-label={`Remove ${a.name}`} onClick={() => setAtts((x) => x.filter((_, k) => k !== i))}>×</button>
              </span>
            ))}
          </div>
        )}
        {exporting && <ExportSessionSheet lines={s.lines.filter((l): l is Exclude<Line, { kind: 'evidence' }> => l.kind !== 'evidence')} cwd={s.cwd ?? ''} home={/^(\/(?:Users|home)\/[^/]+)/.exec(s.cwd ?? '')?.[1] ?? ''} onClose={() => setExporting(false)} />}
        {route && routeOff !== `${route.tier}|${s.model}` && !s.busy && (
          <div className={`route-chip ${route.costsMore ? 'more' : 'less'}`} role="status">
            <span className="chart-name">Suggested</span>
            <b>{LABEL[route.tier]}</b>
            <span className="faint">{route.why} · about US$ {Math.abs(route.deltaUsd).toFixed(3)} {route.deltaUsd < 0 ? 'less' : 'more'} a turn</span>
            <button className="ghost small" onClick={() => void window.stm.setPanelModel(sid, MODEL_OF[route.tier]).then(() => (dispatch({ kind: 'ready', model: MODEL_OF[route.tier], cwd: s.cwd ?? '', sessionId: s.sessionId ?? '' } as Action), setRoute(null)), (e: Error) => dispatch({ kind: 'note', tone: 'error', text: e.message }))}>Switch</button>
            <button className="icon" aria-label="Not now" onClick={() => setRouteOff(`${route.tier}|${s.model}`)}><IconClose /></button>
          </div>
        )}
        {sources.length > 0 && (
          <div className="cite-bar" role="group" aria-label="Sources of the last answer">
            <span className="chart-name">Sources</span>
            {sources.map((x) => (
              <button key={x.n} className={`cite-chip ${cited.includes(x.n) ? 'used' : ''}`} data-tip={`${x.text.slice(0, 300)}${x.text.length > 300 ? '...' : ''}\n\nClick to open the document`} onClick={() => void window.stm.docs.show(x.doc)}>
                <b>S{x.n}</b> {x.title}
              </button>
            ))}
            <button className="icon" aria-label="Clear sources" onClick={() => (setSources([]), setCited([]), setFaith(null))}><IconClose /></button>
            {faith && faith.claims.length > 0 && (
              <details className="faith">
                <summary>
                  <span className={faith.coverage >= 0.8 ? 'ok' : 'warn'}>{Math.round(faith.coverage * 100)}% of claims cited</span> · <span className={faith.supported >= 0.7 ? 'ok' : 'warn'}>{Math.round(faith.supported * 100)}% supported by the cited text</span>
                  {faith.unused.length > 0 && <span className="faint"> · {faith.unused.map((n) => `S${n}`).join(', ')} not used</span>}
                </summary>
                <ol>
                  {faith.claims.map((c, i) => (
                    <li key={i} className={`faith-${c.verdict}`}>
                      <span className="faith-v">{judged?.verdicts[faith.claims.filter((x) => x.cites.length && x.verdict !== 'bad-mark').indexOf(c)] ?? c.verdict}</span> {c.text}
                      {c.missingNumbers.length > 0 && <span className="faint"> (not in the source: {c.missingNumbers.join(', ')})</span>}
                    </li>
                  ))}
                </ol>
                {!judged ? (
                  <button className="ghost small" onClick={() => {
                    const cl = faith.claims.filter((c) => c.cites.length && c.verdict !== 'bad-mark')
                    void window.stm.faithJudge(cl.map((c) => ({ claim: c.text, passages: c.cites.map((n) => sources.find((x) => x.n === n)?.text ?? '').join('\n') }))).then(setJudged)
                  }}>Ask a model to judge {faith.claims.filter((c) => c.cites.length).length} claims (Haiku, about US$ {(faith.claims.length * 0.0015).toFixed(3)})</button>
                ) : <span className="faint">Judged by Haiku for US$ {judged.costUsd.toFixed(4)}. A judge can be wrong too.</span>}
              </details>
            )}
          </div>
        )}
        {s.snapshot && !snapHidden && <SnapshotCard sid={sid} text={s.snapshot.text} inject={s.snapshot.inject} onDone={() => setSnapHidden(true)} />}
        {queued.count > 0 && <Suspense fallback={null}><QueueList sid={sid} money={money} /></Suspense>}
        <div className="composer">
          <button className="attach" data-tip="Attach files, folders or images (or paste and drop them)" aria-label="Attach" onClick={async () => {
            const picked = await pickAttachments(s.cwd)
            if (picked.length) setAtts((a) => [...a, ...picked].slice(0, MAX_ATTACHMENTS))
          }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M8 3v10M3 8h10" /></svg>
          </button>
          <span className="prompt-mark" aria-hidden="true">›</span>
          <textarea
            ref={box}
            rows={1}
            value={draft}
            placeholder={s.busy ? 'Queue a follow-up, or Cmd+Enter to run a command' : 'Ask Claude, or type a command and press Cmd+Enter'}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files)
              if (!files.length) return
              e.preventDefault()
              void addFiles(files)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                if (e.metaKey || e.ctrlKey) runShell(draft)
                else submit(draft)
              }
            }}
          />
          {looksLikeCommand(draft) && (
            <button className="run-hint" onClick={() => runShell(draft)} data-tip="Run in the shell (Cmd+Enter)">
              <IconRun /> Run
            </button>
          )}
          <DictateButton
            onNote={(text) => dispatch({ kind: 'note', tone: 'error', text })}
            onText={(heard) => {
              const el = box.current
              const r = insertDictation(draft, el?.selectionStart ?? draft.length, heard)
              setDraft(r.draft)
              requestAnimationFrame(() => (el?.focus(), el?.setSelectionRange(r.cursor, r.cursor)))
            }}
          />
          {s.busy ? (
            <button className="send stop" data-tip="Stop" aria-label="Stop" onClick={() => void window.stm.interrupt(sid)}>
              <IconStop />
            </button>
          ) : (
            <button className="send" data-tip="Send (Enter)" aria-label="Send" disabled={!draft.trim() && !atts.length} onClick={() => submit(draft)}>
              <IconSend />
            </button>
          )}
        </div>
        <div className="hints">
          <span><kbd>Enter</kbd> send</span>
          <span><kbd>Cmd</kbd><kbd>Enter</kbd> run in shell</span>
          <span><kbd>Shift</kbd><kbd>Enter</kbd> new line</span>
          <span><kbd>Cmd</kbd><kbd>T</kbd> new panel</span>
        </div>
      </footer>
    </section>
  )
}

/** A file or a folder, in the app's line. */
function FileGlyph(props: { dir?: boolean }) {
  return props.dir ? (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M1.5 3.5h5l1.5 2h6.5v7.5h-13z" /></svg>
  ) : (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M3 1.5h6.5l3.5 3.5v9.5H3z" /><path d="M9.5 1.5V5H13" /></svg>
  )
}
