import { SandboxButton } from './Sandbox'

import { effortsOf, MODEL_LIST, type Effort } from '../shared/models'
import { ModelMenu } from './ModelMenu'
import { BranchMark, TryWaysSheet } from './Worktree'

import { FanoutSheet } from './Fanout'

import { PastSearchSheet } from './PastSearch'

import { IssuesSheet } from './Issues'















import { askText, type Link } from '../shared/deeplink'

import { bootOn, setBootOn } from './boot'

import { ArchDeskSheet } from './ArchDesk'

import { LearnSheet } from './Learn'

import { hiddenBy } from '../shared/modules'

import { issueSlug } from '../shared/issuespec'

import { draftFromPanel, SkillDraftsSheet } from './SkillDrafts'

import { ownerOf } from '../shared/sametask'

import { SpecSheet } from './Spec'


import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'

import { Panel } from './Panel'

import { IconCatalog, IconFocus, IconFolder, IconMemory, IconPanel, IconPlug, IconPrivate, IconPalette, IconMusic, IconApps, IconPorts, IconBoxes, IconPull, IconMegaphone, IconTeam, IconPersona, IconClock, IconSwatch, IconSeal, IconChip, IconCoins, IconNews, IconCalendar, IconTrend, IconKey, IconCloud, IconRefresh, IconMail } from './icons'

import { FocusChip, FocusSheet, RoundDone } from './Focus'

import { roundState, stretch, tick, type Focus, type TimeLog } from './focusRound'

// the sheets load when first opened, keeping the first paint small
import { LockScreen, useAppLock } from './Lock'

import { RouterBox } from './Router'

import type { Persona } from '../shared/personas'
// sheets that open only on a click load then, not at start
// the canvas loads when it is first picked, so the first screen stays inside its size budget
const Canvas = lazy(() => import('./Canvas').then((x) => ({ default: x.Canvas })))
const OfficeFiles = lazy(() => import('./OfficeFiles').then((x) => ({ default: x.OfficeFiles })))
const MdImages = lazy(() => import('./MdImages').then((x) => ({ default: x.MdImages })))
const DesignHandoff = lazy(() => import('./DesignHandoff').then((x) => ({ default: x.DesignHandoff })))
const VaultBoard = lazy(() => import('./VaultBoard').then((x) => ({ default: x.VaultBoard })))
const PdfTools = lazy(() => import('./PdfTools').then((x) => ({ default: x.PdfTools })))
const AppContainers = lazy(() => import('./AppContainers').then((x) => ({ default: x.AppContainers })))
const TopicRadar = lazy(() => import('./TopicRadar').then((x) => ({ default: x.TopicRadar })))
const RunCi = lazy(() => import('./RunCi').then((x) => ({ default: x.RunCi })))
const ImageXray = lazy(() => import('./ImageXray').then((x) => ({ default: x.ImageXray })))
const ComposeStacks = lazy(() => import('./ComposeStacks').then((x) => ({ default: x.ComposeStacks })))
const DiagCheck = lazy(() => import('./DiagCheck').then((x) => ({ default: x.DiagCheck })))
const Reflect = lazy(() => import('./Reflect').then((x) => ({ default: x.Reflect })))
const ProjectGraph = lazy(() => import('./ProjectGraph').then((x) => ({ default: x.ProjectGraph })))
const ShortTerm = lazy(() => import('./ShortTerm').then((x) => ({ default: x.ShortTerm })))
const Ports = lazy(() => import('./Ports').then((x) => ({ default: x.Ports })))
const PullRequests = lazy(() => import('./PullRequests').then((x) => ({ default: x.PullRequests })))
const Publish = lazy(() => import('./Publish').then((x) => ({ default: x.Publish })))
const Validate = lazy(() => import('./Validate').then((x) => ({ default: x.Validate })))
const Spend = lazy(() => import('./Spend').then((x) => ({ default: x.Spend })))
const Appearance = lazy(() => import('./Appearance').then((x) => ({ default: x.Appearance })))
const DiagramsSheet = lazy(() => import('./Diagrams').then((x) => ({ default: x.DiagramsSheet })))
const Business = lazy(() => import('./Business').then((m) => ({ default: m.Business })))
const Studio = lazy(() => import('./Studio').then((m) => ({ default: m.Studio })))
const Triggers = lazy(() => import('./Triggers').then((m) => ({ default: m.Triggers })))
const Personas = lazy(() => import('./Personas').then((m) => ({ default: m.Personas })))
const Connections = lazy(() => import('./Connections').then((m) => ({ default: m.Connections })))
const Catalog = lazy(() => import('./Catalog').then((m) => ({ default: m.Catalog })))
const Memory = lazy(() => import('./Memory').then((m) => ({ default: m.Memory })))
import { Splash } from './Splash'
import { UpdateAsk } from './UpdateAsk'

import { apply, CUSTOM, resolve, saveCustomTheme, type Theme } from './themes'

import { applyTypo, DEFAULT_TYPO, type Typo } from './typography'

import { sceneFor, sceneSvg } from './landscapes'


import { Menu } from './Menu'

import { Presence } from './Presence'

import { Docker } from './Docker'



import { TeamSheet, useTeam } from './Team'



import { DevicesButton } from './Devices'

import { StateMark } from './StateMark'

import { useNews } from './News'
import { NextChip, useAgenda, join } from './Agenda'
import { InboxButton } from './Inbox'

import { needs, type Need } from './needs'

import { TodaySheet } from './Today'

import { Palette } from './Palette'

import { firstRun, Tour } from './Tour'
import { cloudWatchOn } from './cloudWatch'
import { daysSince, forgotten as isForgotten } from './cloudView'

import type { Entry } from './fuzzy'
import { dateKey, lastDay, record, snapshot, type DayLog } from './day'

import { WEB_APPS } from '../shared/webapps'

import { arrange, LAYOUTS, type Layout } from '../shared/layout'

import { FolderPickerHost, pickProjectFolder } from './FolderPicker'
import { FilePickerHost } from './FilePicker'
import { alertDialog, confirmDialog, ContextMenuHost, DialogHost } from './ui'

import { MusicChip, MusicSheet, useSpotify } from './Music'

const WebAppsDrawer = lazy(() => import('./WebApps').then((m) => ({ default: m.WebAppsDrawer })))

import { noPanels, reducePanels, type PanelAction, type Panels } from './state'

import './bridge'
import { useMoney } from './currency'

// sheets load when first opened: the start-up bundle stays small
const BudgetSheet = lazy(() => import('./Budget').then((m) => ({ default: m.BudgetSheet })))
const RemotePanelSheet = lazy(() => import('./RemotePanel').then((m) => ({ default: m.RemotePanelSheet })))
const BitwardenSheet = lazy(() => import('./Bitwarden').then((m) => ({ default: m.BitwardenSheet })))
const DesignSystemSheet = lazy(() => import('./DesignSystem').then((m) => ({ default: m.DesignSystemSheet })))
const AskDataSheet = lazy(() => import('./AskData').then((m) => ({ default: m.AskDataSheet })))
const BackendMapSheet = lazy(() => import('./BackendMap').then((m) => ({ default: m.BackendMapSheet })))
const ConnectAgentsSheet = lazy(() => import('./ConnectAgents').then((m) => ({ default: m.ConnectAgentsSheet })))
const PhoneCompanionSheet = lazy(() => import('./PhoneCompanion').then((m) => ({ default: m.PhoneCompanionSheet })))
const ExtractSheet = lazy(() => import('./Extract').then((m) => ({ default: m.ExtractSheet })))
const MessageFiltersSheet = lazy(() => import('./MessageFilters').then((m) => ({ default: m.MessageFiltersSheet })))
const PlaybooksSheet = lazy(() => import('./Playbooks').then((m) => ({ default: m.PlaybooksSheet })))
const WorkTasksSheet = lazy(() => import('./WorkTasks').then((m) => ({ default: m.WorkTasksSheet })))
const RoutinesSheet = lazy(() => import('./Routines').then((m) => ({ default: m.RoutinesSheet })))
const DiagnosticsSheet = lazy(() => import('./Diagnostics').then((m) => ({ default: m.DiagnosticsSheet })))
const MemoryItemsSheet = lazy(() => import('./MemoryItems').then((m) => ({ default: m.MemoryItemsSheet })))
const SelfHostSheet = lazy(() => import('./SelfHost').then((m) => ({ default: m.SelfHostSheet })))
const BookingSheet = lazy(() => import('./Booking').then((m) => ({ default: m.BookingSheet })))
const VideoMetaSheet = lazy(() => import('./VideoMeta').then((m) => ({ default: m.VideoMetaSheet })))
const PhotosSheet = lazy(() => import('./Photos').then((m) => ({ default: m.PhotosSheet })))
const BacktestSheet = lazy(() => import('./Backtest').then((m) => ({ default: m.BacktestSheet })))
const ModulesSheet = lazy(() => import('./Modules').then((m) => ({ default: m.ModulesSheet })))
const LabSheet = lazy(() => import('./Lab').then((m) => ({ default: m.LabSheet })))
const DeploysSheet = lazy(() => import('./Deploys').then((m) => ({ default: m.DeploysSheet })))
const DesignSheet = lazy(() => import('./Design').then((m) => ({ default: m.DesignSheet })))
const TeamFileSheet = lazy(() => import('./TeamFile').then((m) => ({ default: m.TeamFileSheet })))
const WebReaderSheet = lazy(() => import('./WebReader').then((m) => ({ default: m.WebReaderSheet })))
const ResearchSheet = lazy(() => import('./Research').then((m) => ({ default: m.ResearchSheet })))
const DocumentsSheet = lazy(() => import('./Documents').then((m) => ({ default: m.DocumentsSheet })))
const InboxSheet = lazy(() => import('./OneInbox').then((m) => ({ default: m.InboxSheet })))
const ConfigSheet = lazy(() => import('./Config').then((m) => ({ default: m.ConfigSheet })))
const PubCalendarSheet = lazy(() => import('./PubCalendar').then((m) => ({ default: m.PubCalendarSheet })))
const ObserveSheet = lazy(() => import('./Observe').then((m) => ({ default: m.ObserveSheet })))
const MonitorsSheet = lazy(() => import('./Monitors').then((m) => ({ default: m.MonitorsSheet })))
const ModelServersSheet = lazy(() => import('./ModelServers').then((m) => ({ default: m.ModelServersSheet })))
const PostBriefSheet = lazy(() => import('./PostBrief').then((m) => ({ default: m.PostBriefSheet })))
const ShotToCodeSheet = lazy(() => import('./ShotToCode').then((m) => ({ default: m.ShotToCodeSheet })))
const WorkbenchSheet = lazy(() => import('./Workbench').then((m) => ({ default: m.WorkbenchSheet })))
const SecuritySheet = lazy(() => import('./Security').then((m) => ({ default: m.SecuritySheet })))
const AnalyticsSheet = lazy(() => import('./Analytics').then((m) => ({ default: m.AnalyticsSheet })))
const MetricsSheet = lazy(() => import('./Metrics').then((m) => ({ default: m.MetricsSheet })))
const McpCatalogSheet = lazy(() => import('./McpCatalog').then((m) => ({ default: m.McpCatalogSheet })))
const McpInspectorSheet = lazy(() => import('./McpInspector').then((m) => ({ default: m.McpInspectorSheet })))
const McpApprovalsSheet = lazy(() => import('./McpApprovals').then((m) => ({ default: m.McpApprovalsSheet })))
const McpHealthSheet = lazy(() => import('./McpHealth').then((m) => ({ default: m.McpHealthSheet })))
const ApiToMcpSheet = lazy(() => import('./ApiToMcp').then((m) => ({ default: m.ApiToMcpSheet })))
const TraceSheet = lazy(() => import('./Trace').then((m) => ({ default: m.TraceSheet })))
const SavingsSheet = lazy(() => import('./Savings').then((m) => ({ default: m.SavingsSheet })))
const LocalModelSheet = lazy(() => import('./LocalModel').then((m) => ({ default: m.LocalModelSheet })))
const ApiClientSheet = lazy(() => import('./ApiClient').then((m) => ({ default: m.ApiClientSheet })))
const DatabaseSheet = lazy(() => import('./Database').then((m) => ({ default: m.DatabaseSheet })))
const LocalAskSheet = lazy(() => import('./LocalAsk').then((m) => ({ default: m.LocalAskSheet })))
const NewsSheet = lazy(() => import('./News').then((m) => ({ default: m.NewsSheet })))
const AgendaSheet = lazy(() => import('./Agenda').then((m) => ({ default: m.AgendaSheet })))
const MailSheet = lazy(() => import('./Mail').then((m) => ({ default: m.MailSheet })))
const MarketsSheet = lazy(() => import('./Markets').then((m) => ({ default: m.MarketsSheet })))
const HealthSheet = lazy(() => import('./Health').then((m) => ({ default: m.HealthSheet })))
const SecretsSheet = lazy(() => import('./Secrets').then((m) => ({ default: m.SecretsSheet })))
const CloudSheet = lazy(() => import('./Cloud').then((m) => ({ default: m.CloudSheet })))

const MODELS = [{ id: '', label: 'Default model' }, ...MODEL_LIST.map(({ id, label }) => ({ id, label }))]


/** The time, refreshed every second while a round runs and every 30 s otherwise; frozen while hidden. */
function useNow(fast: boolean) {
  const [now, set] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => !document.hidden && set(Date.now()), fast ? 1000 : 30000)
    // a hidden window catches up the moment it shows again
    const show = () => !document.hidden && set(Date.now())
    document.addEventListener('visibilitychange', show)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', show)
    }
  }, [fast])
  return now
}

const THEME_KEY = 'stm.theme'

/** The chosen theme, applied to the document, following macOS when set to System. */
function useTheme() {
  const [id, setId] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) || 'claude-dark'
    } catch {
      return 'claude-dark'
    }
  })
  const [dark, setDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const on = (e: MediaQueryListEvent) => setDark(e.matches)
    mq?.addEventListener('change', on)
    return () => mq?.removeEventListener('change', on)
  }, [])
  // ver: a custom theme saved again under the same id
  const [ver, setVer] = useState(0)
  const theme = useMemo(() => resolve(id, dark), [id, dark, ver])
  useEffect(() => {
    apply(theme)
  }, [theme])
  useEffect(() => void window.stm.setScheme?.(id === 'system' ? 'system' : theme.scheme), [id, theme.scheme])
  const pick = (next: string) => {
    setId(next)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      // storage off: the theme applies for this session
    }
  }
  const applyCustom = (t: Theme) => {
    saveCustomTheme(t)
    setVer((v) => v + 1)
    pick(CUSTOM)
  }
  return [id, theme, pick, applyCustom] as const
}

const TYPO_KEY = 'stm.typo'

/** The chat's reading settings, kept on this machine. */
function useTypo() {
  const [typo, setTypo] = useState<Typo>(() => {
    try {
      return { ...DEFAULT_TYPO, ...JSON.parse(localStorage.getItem(TYPO_KEY) || '{}') }
    } catch {
      return DEFAULT_TYPO
    }
  })
  useEffect(() => {
    applyTypo(typo)
  }, [typo])
  const save = (t: Typo) => {
    setTypo(t)
    try {
      localStorage.setItem(TYPO_KEY, JSON.stringify(t))
    } catch {
      // storage off: the setting applies for this session
    }
  }
  return [typo, save] as const
}

const SCENE_KEY = 'stm.scene'

/** The background landscape and how strong it shows, kept on this machine. */
function useScene() {
  const [scene, setScene] = useState<{ id: string; strength: number }>(() => {
    try {
      return { id: 'auto', strength: 1, ...JSON.parse(localStorage.getItem(SCENE_KEY) || '{}') }
    } catch {
      return { id: 'auto', strength: 1 }
    }
  })
  const save = (v: { id: string; strength: number }) => {
    setScene(v)
    try {
      localStorage.setItem(SCENE_KEY, JSON.stringify(v))
    } catch {
      // storage off: the setting applies for this session
    }
  }
  return [scene, save] as const
}

/** The landscape behind everything, relit as the hour changes. */
function Backdrop({ id, strength, theme }: { id: string; strength: number; theme: Theme }) {
  const [hour, setHour] = useState(() => new Date().getHours())
  useEffect(() => {
    const t = setInterval(() => setHour(new Date().getHours()), 5 * 60_000)
    return () => clearInterval(t)
  }, [])
  const scene = sceneFor(id)
  const svg = useMemo(() => (scene ? sceneSvg(scene, theme, hour, strength) : ''), [scene, theme, hour, strength])
  if (!scene) return null
  // an image, not inline SVG: the browser rasterizes it once, so nothing above it repaints the landscape
  return (
    <div key={scene.id} className="scene" aria-hidden="true" data-tip={scene.place} role="img" aria-label={scene.place}>
      <img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg.replace('width="100%" height="100%"', 'width="1600" height="900"'))}`} alt="" />
    </div>
  )
}

const FOCUS_KEY = 'stm.focus'
const loadFocus = (): Focus | null => {
  try {
    return JSON.parse(localStorage.getItem(FOCUS_KEY) || 'null')
  } catch {
    return null
  }
}

const PRIVATE_KEY = 'stm.private'

/** Private mode: kept across launches, applied to the window on start and on every change. */
function usePrivate() {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(PRIVATE_KEY) === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    void window.stm.setPrivate(on)
    try {
      localStorage.setItem(PRIVATE_KEY, on ? '1' : '0')
    } catch {
      // storage off: the mode still applies for this run
    }
  }, [on])
  return [on, setOn] as const
}

/** The mark: three bars, the last one short and in the accent (docs/BRAND.md). */
function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <rect x="1" y="2.5" width="14" height="2.5" fill="currentColor" />
      <rect x="1" y="6.75" width="9.5" height="2.5" fill="currentColor" />
      <rect x="1" y="11" width="5.5" height="2.5" fill="var(--accent)" />
    </svg>
  )
}

export function App() {
  const lock = useAppLock()
  const [priv, setPriv] = usePrivate()
  // the top bar never clips: when what it holds does not fit, labels give way to icons, then the extras go
  const topRef = useRef<HTMLElement>(null)
  const [topFit, setTopFit] = useState<'' | 'tight' | 'tighter' | 'tightest'>('')
  useLayoutEffect(() => {
    const el = topRef.current
    if (!el) return
    const fit = () => {
      for (const level of ['', 'tight', 'tighter', 'tightest'] as const) {
        el.classList.remove('tight', 'tighter', 'tightest')
        // each level keeps the ones before it
        if (level) el.classList.add(...['tight', 'tighter', 'tightest'].slice(0, ['tight', 'tighter', 'tightest'].indexOf(level) + 1))
        if (el.scrollWidth <= el.clientWidth + 1 || level === 'tightest') return setTopFit(level)
      }
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const [themeId, theme, pickTheme, applyCustomTheme] = useTheme()
  const [typo, setTypo] = useTypo()
  // the mascot's SVG animations stop while the window is hidden or in the background
  useEffect(() => {
    const set = (run: boolean) => document.querySelectorAll('svg').forEach((svg) => (run ? svg.unpauseAnimations?.() : svg.pauseAnimations?.()))
    const vis = () => set(document.visibilityState === 'visible' && document.hasFocus())
    window.addEventListener('blur', vis)
    window.addEventListener('focus', vis)
    document.addEventListener('visibilitychange', vis)
    return () => {
      window.removeEventListener('blur', vis)
      window.removeEventListener('focus', vis)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [])
  const [scene, setScene] = useScene()
  const [appearance, setAppearance] = useState(false)
  const [ports, setPorts] = useState(false)
  const [dockerOpen, setDockerOpen] = useState(false)
  const [prsOpen, setPrsOpen] = useState(false)
  const [pubOpen, setPubOpen] = useState(false)
  const [teamOpen, setTeamOpen] = useState(false)
  const [valOpen, setValOpen] = useState(false)
  const [spendOpen, setSpendOpen] = useState(false)
  const [savingsOpen, setSavingsOpen] = useState(false)
  const [localOpen, setLocalOpen] = useState(false)
  const [apiOpen, setApiOpen] = useState(false)
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [tryOpen, setTryOpen] = useState(false)
  const [fanOpen, setFanOpen] = useState<{ group?: string } | null>(null)
  const [pastOpen, setPastOpen] = useState(false)
  const [issuesOpen, setIssuesOpen] = useState(false)
  const [remoteOpen, setRemoteOpen] = useState(false)
  const [dsOpen, setDsOpen] = useState(false)
  const [officeOpen, setOfficeOpen] = useState(false)
  const [mdImgOpen, setMdImgOpen] = useState(false)
  const [handoffOpen, setHandoffOpen] = useState(false)
  const [boardOpen, setBoardOpen] = useState(false)
  const [pdfOpen, setPdfOpen] = useState(false)
  const [ctrOpen, setCtrOpen] = useState(false)
  const [bwOpen, setBwOpen] = useState(false)
  const [radarOpen, setRadarOpen] = useState(false)
  const [briefOpen, setBriefOpen] = useState(false)
  const [briefSid, setBriefSid] = useState<string | null>(null)
  const [ciOpen, setCiOpen] = useState(false)
  const [xrOpen, setXrOpen] = useState(false)
  const [stkOpen, setStkOpen] = useState(false)
  const [ckOpen, setCkOpen] = useState(false)
  const [rfOpen, setRfOpen] = useState(false)
  const [pgOpen, setPgOpen] = useState(false)
  const [stOpen, setStOpen] = useState(false)
  const [adOpen, setAdOpen] = useState(false)
  const [bmOpen, setBmOpen] = useState(false)
  const [caOpen, setCaOpen] = useState(false)
  const [pcOpen, setPcOpen] = useState(false)
  const [exOpen, setExOpen] = useState(false)
  const [mfOpen, setMfOpen] = useState(false)
  const [pbOpen, setPbOpen] = useState(false)
  const [wtOpen, setWtOpen] = useState(false)
  const [rtOpen, setRtOpen] = useState(false)
  const [dgOpen, setDgOpen] = useState(false)
  const [miOpen, setMiOpen] = useState(false)
  const [arOpen, setArOpen] = useState(false)
  const [shOpen, setShOpen] = useState(false)
  const [lnOpen, setLnOpen] = useState(false)
  const [bkOpen, setBkOpen] = useState(false)
  const [vmOpen, setVmOpen] = useState(false)
  const [phOpen, setPhOpen] = useState(false)
  const [draftsOpen, setDraftsOpen] = useState<{ focus?: string } | null>(null)
  useEffect(() => {
    const f = (e: Event) => {
      const sid = (e as CustomEvent<{ sid: string }>).detail.sid
      const st = pRef.current.byId[sid]
      if (!st) return
      void draftFromPanel(st.worktree?.repo ?? st.cwd, st.lines).then((r) => setDraftsOpen({ focus: r.id }), (err: Error) => dispatch({ kind: 'event', sid, action: { kind: 'note', text: err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), tone: 'error' } }))
    }
    window.addEventListener('stm:skill-draft', f)
    return () => window.removeEventListener('stm:skill-draft', f)
  }, [])
  useEffect(() => {
    const f = (e: Event) => setFanOpen({ group: (e as CustomEvent<{ group?: string }>).detail?.group })
    window.addEventListener('stm:fanout', f)
    return () => window.removeEventListener('stm:fanout', f)
  }, [])
  const [specOpen, setSpecOpen] = useState(false)
  const [labOpen, setLabOpen] = useState(false)
  const [deploysOpen, setDeploysOpen] = useState(false)
  const [designOpen, setDesignOpen] = useState(false)
  const [teamFileOpen, setTeamFileOpen] = useState(false)
  const [webReaderOpen, setWebReaderOpen] = useState(false)
  const [researchOpen, setResearchOpen] = useState(false)
  const [documentsOpen, setDocumentsOpen] = useState(false)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [pubcalOpen, setPubcalOpen] = useState(false)
  const [obsOpen, setObsOpen] = useState(false)
  const [monOpen, setMonOpen] = useState(false)
  const [msOpen, setMsOpen] = useState(false)
  const [s2cOpen, setS2cOpen] = useState(false)
  const [wbOpen, setWbOpen] = useState(false)
  const [secOpen, setSecOpen] = useState(false)
  const [photosOpen, setPhotosOpen] = useState(false)
  const [btOpen, setBtOpen] = useState(false)
  const [modsOpen, setModsOpen] = useState(false)
  // optional modules switched off: their screens leave the palette (a per-device choice)
  const [modsOff, setModsOff] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('stm.modules.off') || '[]') as string[]
    } catch {
      return []
    }
  })
  const setOff = (off: string[]) => {
    setModsOff(off)
    try {
      localStorage.setItem('stm.modules.off', JSON.stringify(off))
    } catch {
      // storage blocked: the choice lasts this session
    }
  }
  const hidden = hiddenBy(modsOff)
  const [promOpen, setPromOpen] = useState(false)
  const [mcatOpen, setMcatOpen] = useState(false)
  const [inspOpen, setInspOpen] = useState(false)
  const [mpolOpen, setMpolOpen] = useState(false)
  const [mhOpen, setMhOpen] = useState(false)
  const [a2mOpen, setA2mOpen] = useState(false)
  const [diagramsOpen, setDiagramsOpen] = useState<false | { path?: string }>(false)
  const [traceOpen, setTraceOpen] = useState(false)
  const [specPersonas, setSpecPersonas] = useState<Persona[]>([])
  useEffect(() => {
    if (specOpen) void window.stm.personas.list().then(setSpecPersonas)
  }, [specOpen])
  // a worktree merged or dropped, or the other attempts of a kept one: their panels close
  useEffect(() => {
    const close = (e: Event) => {
      const d = (e as CustomEvent<{ sids: string[]; note?: string; repo?: string }>).detail
      // their folders are gone: they leave the saved workspace too, so the next launch does not offer them
      const gone = new Set(d.sids.map((sid) => pRef.current.byId[sid]?.cwd).filter(Boolean))
      try {
        const saved = JSON.parse(localStorage.getItem('stm.workspace') || '[]') as { cwd: string }[]
        localStorage.setItem('stm.workspace', JSON.stringify(saved.filter((x) => !gone.has(x.cwd))))
      } catch {
        // storage blocked: the launch check below still skips missing folders
      }
      for (const sid of d.sids) {
        void window.stm.closeSession(sid)
        dispatch({ kind: 'close', sid })
      }
      // what happened is told in a panel of the repository the work went into, when one is open
      const home = d.repo ? pRef.current.order.find((sid) => !d.sids.includes(sid) && pRef.current.byId[sid]?.cwd === d.repo) : undefined
      if (d.note && home) dispatch({ kind: 'event', sid: home, action: { kind: 'note', text: d.note } })
    }
    window.addEventListener('stm:close-panels', close)
    return () => window.removeEventListener('stm:close-panels', close)
  }, [])
  // the held-message card in a panel opens the limits
  useEffect(() => {
    const open = () => setBudgetOpen(true)
    window.addEventListener('stm:budget', open)
    return () => window.removeEventListener('stm:budget', open)
  }, [])
  // the Small tasks card in Spend opens the Ollama setup
  useEffect(() => {
    const open = () => setLocalOpen(true)
    window.addEventListener('stm:local-model', open)
    return () => window.removeEventListener('stm:local-model', open)
  }, [])
  const [dbOpen, setDbOpen] = useState(false)
  const [askLocal, setAskLocal] = useState(false)
  const [newsOpen, setNewsOpen] = useState(false)
  const news = useNews()
  const agenda = useAgenda()
  const [agendaOpen, setAgendaOpen] = useState(false)
  // what waits on you elsewhere: reviews asked of you, renewals this week; both refreshed slowly
  const [reviews, setReviews] = useState<{ repo: string; number: number; title: string }[]>([])
  const [renewals, setRenewals] = useState<{ name: string; inDays: number }[]>([])
  // cloud machines left running: checked at start and every 6 hours, through the CLIs already logged in,
  // only once the person turned it on in the Cloud sheet
  const [forgotten, setForgotten] = useState<{ name: string; provider: string; days: number }[]>([])
  useEffect(() => {
    const check = () =>
      cloudWatchOn() &&
      window.stm.cloud?.scan().then(
        (res) => setForgotten(res.flatMap((p) => p.resources).filter((r) => isForgotten(r)).map((r) => ({ name: r.name, provider: r.provider, days: daysSince(r.since) ?? 0 }))),
        () => undefined,
      )
    void check()
    const t = setInterval(check, 6 * 3_600_000)
    // turned on from the first-run question: start the gated check now (it still waits a minute)
    window.addEventListener('stm:update-enabled', check)
    return () => {
      clearInterval(t)
      window.removeEventListener('stm:update-enabled', check)
    }
  }, [])
  // the installed app checks its source checkout for new commits every 6 hours
  const [update, setUpdate] = useState<{ behind: number; subjects: string[]; source: string | null } | undefined>()
  const [updating, setUpdating] = useState(false)
  // the update as it runs: its current step, or why it stopped
  const [upd, setUpd] = useState<{ state: 'busy' | 'down'; step: string; pct?: number; tail?: string } | null>(null)
  useEffect(() => window.stm.onUpdateProgress?.(setUpd), [])
  // the Update button: checks right now, then rebuilds and reopens (or says there is nothing new)
  const runUpdate = async () => {
    setUpdating(true)
    try {
      const u = await window.stm.updateCheck()
      setUpdate({ behind: u.behind, subjects: u.subjects ?? [], source: u.source })
      if (!u.source) {
        await alertDialog({ title: 'Update', message: 'This copy runs from the source folder (npm run dev). Update it with git pull in the terminal.' })
        return
      }
      if (u.source === 'release') {
        if (!u.behind) return void (await alertDialog({ title: 'Update', message: 'SuperTokenMan is up to date.' }))
        if (await confirmDialog({ title: `Install ${u.subjects?.[0] ?? 'the new version'}?`, message: `${(u.subjects ?? []).slice(1).join('\n')}\n\nIt downloads, quits and opens the new version.`.trim(), confirm: 'Install' })) {
          setUpd({ state: 'busy', step: 'Starting' })
          await window.stm.updateRun()
        }
        return
      }
      const ask = u.behind
        ? `Update SuperTokenMan? ${u.behind} new change${u.behind > 1 ? 's' : ''}:\n\n${(u.subjects ?? []).join('\n')}\n\nIt pulls, rebuilds (a few minutes), quits and opens the new version.`
        : 'Already up to date. Rebuild and reinstall anyway?'
      if (await confirmDialog({ title: 'Update', message: ask, confirm: u.behind ? 'Update' : 'Rebuild' })) {
        setUpd({ state: 'busy', step: 'Starting' })
        await window.stm.updateRun()
      }
    } catch (e) {
      await alertDialog({ title: 'Update', message: `Could not check for updates: ${(e as Error).message}` })
    } finally {
      setUpdating(false)
    }
  }
  useEffect(() => {
    const check = () => window.stm.updateCheck?.(true).then((u) => setUpdate({ behind: u.behind, subjects: u.subjects ?? [], source: u.source }), () => undefined)
    void check()
    const t = setInterval(check, 6 * 3_600_000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    const pull = () => {
      if (document.hidden) return
      window.stm.pr.inbox().then((b) => setReviews(b.review), () => undefined)
      window.stm.billing.all().then((src) => setRenewals(src.flatMap((x) => x.renewals ?? []).map((r) => ({ name: r.name, inDays: Math.round((Date.parse(r.date) - Date.now()) / 86_400_000) }))), () => undefined)
    }
    pull()
    const t = setInterval(pull, 10 * 60_000)
    return () => clearInterval(t)
  }, [])
  // Publish opens a network inside the Apps drawer: the drawer has to be there and open
  useEffect(() => {
    const on = () => {
      setWaMounted(true)
      setWa(true)
    }
    const show = (e: Event) => {
      setWaApp((e as CustomEvent<{ app: string }>).detail.app)
      on()
    }
    window.addEventListener('stm:webapp', on)
    window.addEventListener('stm:webapp-show', show)
    return () => {
      window.removeEventListener('stm:webapp', on)
      window.removeEventListener('stm:webapp-show', show)
    }
  }, [])
  const [music, setMusic] = useState(false)
  const [wa, setWa] = useState(false)
  const [waMounted, setWaMounted] = useState(false)
  const [waUnread, setWaUnread] = useState<Record<string, number>>({})
  const [waWidth, setWaWidth] = useState(520)
  const [waApp, setWaApp] = useState('whatsapp')
  const unreadTotal = Object.values(waUnread).reduce((a, b) => a + b, 0)
  const toggleWa = () => {
    setWaMounted(true)
    setWa((v) => !v)
  }
  const spotify = useSpotify(music)
  const [p, dispatch] = useReducer((st: Panels, a: PanelAction) => reducePanels(st, a), noPanels)
  const { gridRef, leave } = usePanelMotion(p.order)
  // the team room: what the room sees of you is the focused panel's folder and whether it is working
  const team = useTeam(() => {
    const st = p.focus ? p.byId[p.focus] : undefined
    return st ? { repo: st.cwd.split('/').filter(Boolean).slice(-2).join('/'), status: st.busy ? 'busy' : 'idle' } : {}
  })
  const [model, setModel] = useState('')
  // reasoning effort for new panels: lower spends less of the plan on simple work
  const [effort, setEffortState] = useState(() => {
    try {
      return localStorage.getItem('stm.effort') ?? ''
    } catch {
      return ''
    }
  })
  const setEffort = (v: string) => {
    setEffortState(v)
    try {
      localStorage.setItem('stm.effort', v)
    } catch {
      // this session only
    }
  }
  const [sheet, setSheet] = useState(false)
  const [catalog, setCatalog] = useState(false)
  const [memory, setMemory] = useState(false)
  const { code: currency, rate } = useMoney()
  const [focus, setFocusState] = useState<Focus | null>(loadFocus)
  const [focusSheet, setFocusSheet] = useState(false)
  const [doneRound, setDoneRound] = useState<{ f: Focus; turns: number; cost: string } | null>(null)
  const startMark = useRef<{ turns: number; cost: number }>({ turns: 0, cost: 0 })
  const [log, setLog] = useState<TimeLog>({})
  const lastActive = useRef<{ sid: string | null; at: number }>({ sid: null, at: 0 })
  const activity = useRef<number[]>([])
  const now = useNow(Boolean(focus))
  const setFocus = (f: Focus | null) => {
    setFocusState(f)
    try {
      if (f) localStorage.setItem(FOCUS_KEY, JSON.stringify(f))
      else localStorage.removeItem(FOCUS_KEY)
    } catch {
      // storage off: the round still runs for this session
    }
  }

  useEffect(() => {
    return window.stm.onEvent((sid, action) => dispatch({ kind: 'event', sid, action }))
  }, [])

  // your activity: keys and clicks, credited to the focused panel
  const focusRef = useRef<string | null>(null)
  focusRef.current = p.focus
  useEffect(() => {
    const mark = () => {
      const at = Date.now()
      lastActive.current = { sid: focusRef.current, at }
      const a = activity.current
      if (!a.length || at - a[a.length - 1]! > 20000) a.push(at)
      if (a.length > 2000) a.splice(0, a.length - 2000)
    }
    window.addEventListener('keydown', mark)
    window.addEventListener('mousedown', mark)
    return () => {
      window.removeEventListener('keydown', mark)
      window.removeEventListener('mousedown', mark)
    }
  }, [])

  // a minute at a time: yours and Claude's, by project, saved for the summary
  useEffect(() => void window.stm.timeGet().then(setLog), [])
  const panelsRef = useRef(p)
  panelsRef.current = p
  useEffect(() => {
    const t = setInterval(() => {
      const cur = panelsRef.current
      const at = Date.now()
      const recent = at - lastActive.current.at < 5 * 60000
      const panels = cur.order.map((sid) => {
        const st = cur.byId[sid]!
        return { project: st.cwd.split('/').filter(Boolean).at(-1) ?? 'misc', youActive: recent && lastActive.current.sid === sid, claudeBusy: st.busy }
      })
      if (!panels.some((x) => x.youActive || x.claudeBusy)) return
      setLog((l) => {
        const next = tick(l, at, panels)
        void window.stm.timeSet(next)
        return next
      })
    }, 60000)
    return () => clearInterval(t)
  }, [])

  // the end of a round
  useEffect(() => {
    if (!focus || doneRound || !roundState(focus, now).done) return
    const st = focus.sid ? p.byId[focus.sid] : undefined
    setDoneRound({ f: focus, turns: Math.max(0, (st?.turns ?? 0) - startMark.current.turns), cost: money(Math.max(0, (st?.costUsd ?? 0) - startMark.current.cost)) })
  }, [focus, now, doneRound, p.byId])

  // where each panel actually opened (a worktree's path, not the folder asked for)
  const openedCwd = useRef<Record<string, string>>({})
  const open = useCallback(async (cwd?: string, resume?: string, persona?: string, sandbox?: boolean, extra?: { worktree?: { label: string; group?: string; attempt?: number; of?: number }; model?: string; resumeAt?: string; remote?: { host: string; dir: string; worktree?: boolean; branch?: string; repo?: string } }) => {
    const m = extra?.model ?? model
    const r = await window.stm.newSession({ cwd, model: m, resume, resumeAt: extra?.resumeAt, remote: extra?.remote, persona, effort: effortsOf(m).includes(effort as Effort) ? effort : undefined, sandbox, worktree: extra?.worktree })
    openedCwd.current[r.sid] = r.cwd
    dispatch({ kind: 'open', sid: r.sid, cwd: r.cwd, model: r.persona?.model || m, persona: r.persona, sandbox: r.sandbox, remote: r.remote, worktree: r.worktree })
    // an integration turned on without its credential: say so in the new panel
    for (const x of r.missing ?? [])
      dispatch({ kind: 'event', sid: r.sid, action: { kind: 'error', message: `${x.id} is on but ${x.secret} is not in the vault, so this panel runs without it. Add it in Connections.` } })
    return r.sid
  }, [model, effort])

  // a panel on its own branch in the focused panel's repository; it says why when there is no repository
  const openWorktree = async () => {
    const f = p.focus ? p.byId[p.focus] : undefined
    try {
      await open(f?.worktree?.repo ?? f?.cwd, undefined, undefined, false, { worktree: { label: 'panel' } })
    } catch (e) {
      if (p.focus) dispatch({ kind: 'event', sid: p.focus, action: { kind: 'note', tone: 'error', text: e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e) } })
    }
  }

  // the router: to the persona's open panel (the focused one first), or a new panel with it
  const sendToTeam = useCallback(
    async (persona: Persona | null, text: string, why?: string, fresh = false) => {
      // one task, one owner: the same request already being worked on is not started again elsewhere
      const asking = (sid: string) => [...(p.byId[sid]?.lines ?? [])].reverse().find((l) => l.kind === 'user')?.text ?? ''
      const owner = ownerOf(text, p.order.map((sid) => ({ sid, busy: Boolean(p.byId[sid]?.busy), asking: (p.byId[sid]?.lines ?? []).some((l) => l.kind === 'user') ? asking(sid) : '' })))
      if (owner) {
        dispatch({ kind: 'focus', sid: owner })
        dispatch({ kind: 'event', sid: owner, action: { kind: 'note', text: `Already on it here, so it was not started again: "${text.slice(0, 120)}". Send it again when this one is done if you want a second go.` } })
        return
      }
      // fresh: the task gets a panel with nothing else in its context (a spec task needs only its spec and plan)
      const mine = (sid: string) => (persona ? p.byId[sid]?.persona?.name === persona.name : true) && (!fresh || !(p.byId[sid]?.lines ?? []).some((l) => l.kind === 'user'))
      let sid = p.focus && mine(p.focus) ? p.focus : p.order.find(mine)
      if (!sid) sid = await open(p.focus ? p.byId[p.focus]?.cwd : undefined, undefined, persona?.id)
      dispatch({ kind: 'focus', sid })
      dispatch({ kind: 'event', sid, action: { kind: 'sent', text, at: Date.now() } })
      void window.stm.send(sid, text, undefined, why)
    },
    [p, open],
  )

  // a trigger fired: open its panel and send its prompt, as if typed
  useEffect(
    () =>
      window.stm.triggers.onFire(async (t) => {
        // the main process sends its steps one by one, stopping at the ones that ask first
        const sid = await open(t.cwd || undefined, undefined, t.persona || undefined)
        void window.stm.triggers.begin(sid, { id: t.id, name: t.name, prompt: t.prompt, gate: t.gate })
      }),
    [open],
  )
  // the command line asked for a new panel: opened here like any other, its id sent back
  useEffect(
    () =>
      window.stm.stmCli.onOpen(async (r) => {
        const sid = await open(r.cwd, undefined, r.persona, undefined, r.model ? { model: r.model } : undefined)
        window.stm.stmCli.opened(r.req, sid)
      }),
    [open],
  )
  // a message from another panel (stm send): put in the composer for the person to send, never sent
  // from here; only a link the person set to auto-send arrives already sent, shown like a typed one
  useEffect(
    () =>
      window.stm.panelBus.onInbox((sid, text, sent) => {
        if (sent) dispatch({ kind: 'event', sid, action: { kind: 'sent', text, at: Date.now() } })
        else window.dispatchEvent(new CustomEvent('stm:prefill', { detail: { sid, text: `${text}\n\n`, quiet: true } }))
      }),
    [],
  )
  // a run a restart left unfinished, picked up from its step
  useEffect(() => {
    const on = async (e: Event) => {
      const { trigger, run } = (e as CustomEvent<{ trigger: string; run: string }>).detail
      const t = (await window.stm.triggers.list()).find((x) => x.id === trigger)
      if (!t) return
      const sid = await open(t.cwd || undefined, undefined, t.persona || undefined)
      void window.stm.triggers.begin(sid, { id: t.id, name: t.name, prompt: t.prompt, gate: t.gate }, run)
    }
    window.addEventListener('stm:resume-run', on)
    return () => window.removeEventListener('stm:resume-run', on)
  }, [open])

  // the first panel opens on the folder the app started in
  useEffect(() => {
    void open()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // the workspace: which panels were open, each with its conversation, kept for the next launch (after a
  // restart too). The app offers it back instead of starting over, so nothing has to be explained again.
  type Saved = { cwd: string; sessionId: string; persona?: string; sandbox?: boolean; remote?: { host: string; dir: string; branch?: string; repo?: string } }
  const [lastTime, setLastTime] = useState<Saved[]>(() => {
    try {
      return (JSON.parse(localStorage.getItem('stm.workspace') || '[]') as Saved[]).filter((x) => x.cwd && x.sessionId).slice(0, 8)
    } catch {
      return []
    }
  })
  // folders that no longer exist (a worktree merged or dropped) are not offered back
  useEffect(() => {
    if (lastTime.length) void window.stm.existing(lastTime.map((w) => w.cwd)).then((ok) => setLastTime((l) => l.filter((w) => ok.includes(w.cwd))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    // a panel on another machine is saved with its host and folder, so it comes back there, never on this Mac
    const now = p.order.map((sid) => ({ cwd: p.byId[sid]?.cwd ?? '', sessionId: p.byId[sid]?.sessionId ?? '', turns: p.byId[sid]?.turns ?? 0, persona: p.byId[sid]?.persona?.id, sandbox: Boolean(p.byId[sid]?.sandbox), remote: p.byId[sid]?.remote })).filter((x) => x.cwd && x.sessionId && x.turns > 0)
    // an untouched panel is not worth bringing back; nor is saving over the last workspace before anything happened
    if (!now.length) return
    try {
      localStorage.setItem('stm.workspace', JSON.stringify(now.map(({ cwd, sessionId, persona, sandbox, remote }) => ({ cwd, sessionId, persona, sandbox: sandbox || undefined, remote }))))
    } catch {
      // storage full or blocked: the workspace is just not kept
    }
  }, [p])
  const reopen = async () => {
    const list = lastTime
    setLastTime([])
    // the empty panel the app opened at start gives its place to the ones from last time
    for (const sid of p.order) if (!(p.byId[sid]?.turns ?? 0)) (void window.stm.closeSession(sid), dispatch({ kind: 'close', sid }))
    // a sandboxed panel comes back in its sandbox, never on this machine; if the sandbox is gone it is not reopened
    for (const w of list) {
      if (w.sandbox && !(await window.stm.sandbox.prepare(w.cwd).catch(() => ''))) continue
      // a folder that is gone (a worktree merged since) is skipped, not an error
      // a remote panel resumes on its machine (its conversation lives there); unreachable, it is skipped
      await open(w.remote ? undefined : w.cwd, w.sessionId, w.persona, w.sandbox, w.remote ? { remote: { host: w.remote.host, dir: w.remote.dir, branch: w.remote.branch, repo: w.remote.repo } } : undefined).catch(() => undefined)
    }
  }

  // Cmd+T: a new panel in the focused panel's folder; Cmd+W: close the focused panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey) return
      if (e.shiftKey && e.key.toLowerCase() === 'w') {
        e.preventDefault()
        toggleWa()
      } else if (e.key === ',') {
        e.preventDefault()
        setAppearance((v) => !v)
      } else if (e.key === 'j') {
        e.preventDefault()
        setMemory((v) => !v)
      } else if (e.key === 'k' && !e.shiftKey) {
        e.preventDefault()
        setPalette((v) => !v)
      } else if (e.key === 'k') {
        e.preventDefault()
        setCatalog((v) => !v)
      } else if (e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setPriv((v) => !v)
      } else if (e.key === 't') {
        e.preventDefault()
        void open(p.focus ? p.byId[p.focus]?.cwd : undefined)
      } else if (e.key === 'w' && p.focus) {
        e.preventDefault()
        void window.stm.closeSession(p.focus)
        dispatch({ kind: 'close', sid: p.focus })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, p, setPriv])

  const money = useMemo(() => {
    const f = new Intl.NumberFormat(currency === 'BRL' ? 'pt-BR' : 'en-US', { style: 'currency', currency })
    return (usd: number) => f.format(usd * rate)
  }, [rate, currency])
  const exposures = p.order.flatMap((sid) => (p.byId[sid]?.exposures ?? []).map((x) => ({ ...x, panel: sid })))
  const total = p.order.reduce((n, sid) => n + (p.byId[sid]?.costUsd ?? 0), 0)
  // a portrait monitor stacks panels: one column for two, two columns from three on
  const portrait = usePortrait()
  const [layout, setLayoutState] = useState<Layout>(() => {
    try {
      return (LAYOUTS.find((l) => l.id === localStorage.getItem('stm.layout'))?.id ?? 'auto') as Layout
    } catch {
      return 'auto'
    }
  })
  const setLayout = (l: Layout) => {
    setLayoutState(l)
    try {
      localStorage.setItem('stm.layout', l)
    } catch {
      // storage off: the layout lasts this session
    }
  }
  const screenSize = useScreen()
  const { cols, rows } = arrange(p.order.length, layout, portrait, screenSize)

  // everything that waits on you, ranked; the bell, the brief and the panels read it
  const needList = needs({
    panels: p,
    appUnread: waUnread,
    appNames: Object.fromEntries(WEB_APPS.map((a) => [a.id, a.name])),
    teamUnread: teamOpen ? 0 : team.unread,
    reviews,
    next: agenda.next ? { title: agenda.next.event.title, inMin: agenda.next.inMin, join: agenda.next.event.join } : null,
    exposures: exposures.length,
    renewals,
    newsUnread: news.unread,
    update,
    forgotten,
    now: Date.now(),
  })
  const goNeed = (n: Need) => {
    const g = n.go
    if (g.to === 'panel') dispatch({ kind: 'focus', sid: g.sid })
    else if (g.to === 'agenda') setAgendaOpen(true)
    else if (g.to === 'join') join(g.url)
    else if (g.to === 'prs') setPrsOpen(true)
    else if (g.to === 'team') setTeamOpen(true)
    else if (g.to === 'app') window.dispatchEvent(new CustomEvent('stm:webapp-show', { detail: { app: g.app } }))
    else if (g.to === 'connections') setSheet(true)
    else if (g.to === 'spend') setSpendOpen(true)
    else if (g.to === 'news') setNewsOpen(true)
    else if (g.to === 'cloud') setCloudOpen(true)
    else if (g.to === 'update') void runUpdate()
          }
  // the day's edges: where each panel stopped, saved every 5 minutes and on quit; the brief once a day
  const [dayLogs, setDayLogs] = useState<DayLog[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('stm.days') || '[]') as DayLog[]
    } catch {
      return []
    }
  })
  const pRef = useRef(p)
  pRef.current = p
  useEffect(() => {
    const save = () =>
      setDayLogs((logs) => {
        const next = record(logs, snapshot(pRef.current))
        try {
          localStorage.setItem('stm.days', JSON.stringify(next))
        } catch {
          // storage off
        }
        return next
      })
    const t = setInterval(save, 5 * 60_000)
    window.addEventListener('beforeunload', save)
    return () => {
      clearInterval(t)
      window.removeEventListener('beforeunload', save)
    }
  }, [])
  const [palette, setPalette] = useState(false)
  // more to search, read when the palette opens: personas, content pieces, secret names (never values)
  const [found, setFound] = useState<{ personas: Persona[]; pieces: { id: string; title: string; stage: string }[]; secrets: string[] }>({ personas: [], pieces: [], secrets: [] })
  useEffect(() => {
    if (!palette) return
    void Promise.all([window.stm.personas.list(), window.stm.content.list(), window.stm.vaultList()]).then(([personas, pieces, secrets]) => setFound({ personas, pieces, secrets: secrets.map((x) => x.name) }), () => undefined)
  }, [palette])
  useEffect(() => window.stm.palette.onSummon(() => setPalette(true)), [])
  // the application menu: screens by their palette id, plus a few actions of its own
  const menuRef = useRef<(id: string) => void>(() => undefined)
  menuRef.current = (id: string) => {
    if (id === 'menu:palette') return setPalette(true)
    if (id === 'menu:new-panel') return void open(p.focus ? p.byId[p.focus]?.cwd : undefined)
    if (id === 'menu:open-folder') return void pickProjectFolder().then((dir) => dir && void open(dir))
    if (id === 'menu:export') return void (p.focus && window.dispatchEvent(new CustomEvent('stm:export', { detail: { sid: p.focus } })))
    const e = paletteEntries().find((x) => x.id === id)
    if (e) e.run()
    else setPalette(true)
  }
  useEffect(() => window.stm.onMenu((id) => menuRef.current(id)), [])
  // supertokenman:// links: the window says what the link wants and acts only on Open
  const [link, setLink] = useState<Link | { error: string } | null>(null)
  useEffect(() => {
    const take = async (l: Link | { error: string } | null) => {
      if (!l) return
      if (!('error' in l) && l.kind === 'open' && !(await window.stm.existing([l.path])).length) return setLink({ error: `No folder at ${l.path}.` })
      setLink(l)
    }
    void window.stm.deeplink.pending().then(take)
    return window.stm.deeplink.on((l) => void take(l))
  }, [])
  const followLink = (l: Link) => {
    setLink(null)
    if (l.kind === 'open') return void open(l.path)
    if (l.kind === 'focus') return p.byId[l.panel] ? dispatch({ kind: 'focus', sid: l.panel }) : setLink({ error: `No panel ${l.panel} is open.` })
    if (l.kind === 'pr') return setPrsOpen(true)
    paletteEntries().find((x) => x.id === `go-${l.id}`)?.run()
  }
  // a notification clicked: the panel it was about comes forward
  useEffect(() => window.stm.onPanelFocus((sid) => dispatch({ kind: 'focus', sid })), [])
  // no network: a badge says so, and that the local model still answers
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  const [marketsOpen, setMarketsOpen] = useState(false)
  const [healthOpen, setHealthOpen] = useState(false)
  const [secretsOpen, setSecretsOpen] = useState(false)
  const [personasOpen, setPersonasOpen] = useState(false)
  const [triggersOpen, setTriggersOpen] = useState(false)
  const [studioOpen, setStudioOpen] = useState(false)
  const [bizOpen, setBizOpen] = useState(false)
  // a brief from Research handed to Content as the new piece's context
  const [draftSeed, setDraftSeed] = useState<{ title: string; idea: string } | null>(null)
  const [tourOpen, setTourOpen] = useState(firstRun)
  // the update question waits for the splash to finish and the Tour to close
  const [splashOff, setSplashOff] = useState(false)
  const splashGone = useCallback(() => setSplashOff(true), [])
  const [mailOpen, setMailOpen] = useState(false)
  // Outlook's unread count for the menu: read now and every few minutes while connected
  const [mailUnread, setMailUnread] = useState(0)
  useEffect(() => {
    const tick = () =>
      void window.stm.mail
        .status()
        .then((s) => Promise.all((['outlook', 'gmail'] as const).filter((a) => s.accounts[a].connected).map((a) => window.stm.mail.unread(a).catch(() => 0))))
        .then((n) => setMailUnread(n.reduce((a, b) => a + b, 0)))
        .catch(() => undefined)
    tick()
    const t = setInterval(tick, 3 * 60_000)
    return () => clearInterval(t)
  }, [])
  const [cloudOpen, setCloudOpen] = useState(false)
  const ask = (text: string) => p.focus && window.dispatchEvent(new CustomEvent('stm:ask', { detail: { sid: p.focus, text } }))
  const paletteEntries = (): Entry[] => [
    ...LAYOUTS.map((l) => ({ id: `layout-${l.id}`, group: 'Layout', label: `Layout: ${l.name}`, hint: l.what, keywords: 'layout grid columns canvas panels arrange 2x2 move zoom', run: () => setLayout(l.id) })),
    ...p.order.map((sid) => ({ id: `panel-${sid}`, group: 'Panels', label: p.byId[sid]?.cwd.split('/').filter(Boolean).slice(-2).join('/') ?? sid, hint: sid, keywords: 'panel', run: () => dispatch({ kind: 'focus', sid }) })),
    ...[
      ['today', 'Today', 'brief morning day', () => setTodayOpen(true)],
      ['agenda', 'Agenda', 'calendar meetings', () => setAgendaOpen(true)],
      ['prs', 'Pull requests', 'prs github review', () => setPrsOpen(true)],
      ['docker', 'Docker', 'containers logs', () => setDockerOpen(true)],
      ['ports', 'Ports', 'processes kill', () => setPorts(true)],
      ['news', 'News', 'rss feed stories', () => setNewsOpen(true)],
      ['team', 'Team room', 'chat colleague handoff', () => setTeamOpen(true)],
      ['publish', 'Publish', 'post linkedin x social', () => setPubOpen(true)],
      ['validate', 'Validate', 'name domain market', () => setValOpen(true)],
      ['spend', 'Spend', 'billing cost money', () => setSpendOpen(true)],
      ['worktree', 'New panel in a worktree', 'worktree branch isolated parallel separate checkout git', () => void openWorktree()],
      ['lab', 'Lab', 'persona versions rollback evals arena local claude compare instructions improve rewrite headroom learn choices', () => setLabOpen(true)],
      ['stm', 'Install the stm command', 'command line cli terminal stm install path script json automation', () => {
        void window.stm.stmCli.install().then((r) => p.focus && dispatch({ kind: 'event', sid: p.focus, action: { kind: 'note', text: `Installed ${r.file}. Try: stm status${r.hint ? `. ${r.hint}` : ''}` } }))
      }],
      ['api2mcp', 'API to MCP: turn a free API into an MCP server', 'api to mcp public apis free api openapi swagger generate server tools', () => setA2mOpen(true)],
      ['mcphealth', 'MCP health: servers alive, changed tools, context cost', 'mcp health status servers alive check changed tools updated held context tokens cost', () => setMhOpen(true)],
      ['mcpapprovals', 'MCP approvals: reads run, writes ask', 'mcp approvals permissions allow ask deny read write tools servers persona policy', () => setMpolOpen(true)],
      ['mcpinspector', 'MCP inspector: see and call any MCP server', 'mcp inspector debug test tools resources prompts call server schema', () => setInspOpen(true)],
      ['mcpcatalog', 'MCP catalog: find, review and install MCP servers', 'mcp catalog servers install model context protocol awesome tools review license registry', () => setMcatOpen(true)],
      ['prometheus', 'Prometheus: alerts, targets, PromQL charts', 'prometheus metrics promql alerts alertmanager targets scrape grafana cpu memory latency rate', () => setPromOpen(true)],
      ['analytics', 'Product analytics: your PostHog', 'product analytics posthog hogql events funnel trends feature flags experiments errors exceptions users pageviews', () => setPhOpen(true)],
      ['security', 'Security scan: vulnerabilities, misconfigurations, licenses, SBOM', 'security scan trivy vulnerability cve dependencies audit misconfiguration dockerfile terraform kubernetes license sbom cyclonedx spdx supply chain', () => setSecOpen(true)],
      ['workbench', 'Workbench: prompt library, prompts.chat, filters', 'workbench prompt library prompts template variables fields slash command prompts.chat awesome chatgpt prompts filters concise portuguese', () => setWbOpen(true)],
      ['shot2code', 'Screenshot to code: an image becomes HTML or React', 'screenshot to code image mockup sketch design figma html react tailwind rebuild clone ui prototype pixel compare', () => setS2cOpen(true)],
      ['modelservers', 'Model servers: vLLM, llama.cpp, LM Studio as the local model', 'model server vllm llama.cpp llamacpp lm studio openai compatible endpoint gpu ssh tunnel metrics tokens per second kv cache fit memory quantization preset sampling', () => setMsOpen(true)],
      ['monitoring', 'Monitoring: uptime of your sites and ports, Netdata alarms', 'monitoring uptime monitor down status page ping port tcp http keyword certificate ssl incident maintenance netdata alarms cpu ram', () => setMonOpen(true)],
      ['observe', 'Observability: traces, ratings, datasets and experiments', 'observability traces spans tree tools slow rating score dataset experiment staging langfuse otel opentelemetry export', () => setObsOpen(true)],
      ['pubcal', 'Publishing calendar: posts on a week', 'publishing calendar schedule posts social queue drafts slots bluesky mastodon linkedin instagram week', () => setPubcalOpen(true)],
      ['config', 'Providers and config: endpoint, MCP and skills per persona, sessions', 'provider providers endpoint openrouter config settings.json mcp skills registry persona sessions logs quota api key model', () => setConfigOpen(true)],
      ['diagrams', 'Diagrams: draw.io from a description', 'diagram drawio draw.io architecture flowchart sketch image er boxes arrows chart', () => setDiagramsOpen({})],
      ['oneinbox', 'Inbox: mail and mentions to triage', 'inbox triage mail email outlook gmail bluesky mastodon mentions replies snooze saved replies notes labels business hours', () => setInboxOpen(true)],
      ['documents', 'Documents: inbox, filed, search, rules', 'documents inbox ocr scan pdf bills receipts invoices folder watch tags rules search paperless facts', () => setDocumentsOpen(true)],
      ['research', 'Research: a report with sources', 'research report sources topic hacker news github web search cite citations extract schema', () => setResearchOpen(true)],
      ['webreader', 'Web reader: try a page, cache rules, search, schemas', 'web reader crawl fetch page scrape robots cache searxng search schema extract selectors', () => setWebReaderOpen(true)],
      ['teamfile', 'Team file: export or import', 'team share export import colleague setup personas triggers evals file', () => setTeamFileOpen(true)],
      ['design', 'Design', 'style reference tokens colors fonts theme extract page inspiration components inventory props duplicates unused look-alike', () => setDesignOpen(true)],
      ['deploys', 'Deploys', 'deploy coolify rollback health check supabase advisors security performance lint rls production release', () => setDeploysOpen(true)],
      ['trace', 'Trace', 'why this turn context inspector system prompt tokens tools cost trace explain', () => setTraceOpen(true)],
      ['spec', 'Spec first', 'spec plan tasks constitution principles requirements big feature checklist approve', () => setSpecOpen(true)],
      ['try-ways', 'Try several ways', 'attempts compare models worktree pick best parallel try two ways fan out', () => setTryOpen(true)],
      ['skill-drafts', 'Skill drafts', 'skills learned experience review approve draft', () => setDraftsOpen({})],
      ['skill-draft-now', 'Draft a skill from this panel', 'skill learn experience save as skill', () => p.focus && window.dispatchEvent(new CustomEvent('stm:skill-draft', { detail: { sid: p.focus } }))],
      ['modules', 'Modules', 'modules extensions optional features turn off hide simplify core', () => setModsOpen(true)],
      ['backtest', 'Backtest lab', 'backtest trading strategy simulation prices csv sma rsi nautilus', () => setBtOpen(true)],
      ['photos', 'Photos', 'photo library images immich pictures gallery search', () => setPhotosOpen(true)],
      ['video-meta', 'Video metadata', 'youtube video metadata chapters license curation title duration', () => setVmOpen(true)],
      ['booking', 'Scheduling link', 'book meeting calendar availability slots booking page calendly', () => setBkOpen(true)],
      ['learn', 'Learn by building', 'tutor flashcards study learn build your own spaced repetition plan review', () => setLnOpen(true)],
      ['self-host', 'Self-hosting', 'self host server docker compose deploy apps catalog homelab', () => setShOpen(true)],
      ['arch-desk', 'Architecture desk', 'adr decision record design review capacity estimate system design exercise architecture', () => setArOpen(true)],
      ['boot-anim', `${bootOn() ? 'Turn off' : 'Turn on'} the opening and closing animation`, 'motion animation splash intro outro start quit opening closing', () => setBootOn(!bootOn())],
      ['memory-items', 'Memory items', 'memory facts decisions remember history versions search', () => setMiOpen(true)],
      ['diagnostics', 'Diagnostics', 'errors logs crash report debug diagnostics', () => setDgOpen(true)],
      ['routines', 'Routines', 'routine schedule weekly scan draft summary recurring job', () => setRtOpen(true)],
      ['work-tasks', 'Tasks across panels', 'task budget thread timeline decision across panels fan-out', () => setWtOpen(true)],
      ['playbooks', 'Playbooks', 'playbook sop procedure steps checkpoint check runbook yaml', () => setPbOpen(true)],
      ['msg-filters', 'Message filters', 'filter inlet outlet pipeline valves code before after message reply', () => setMfOpen(true)],
      ['extract', 'Extract with sources', 'extract structured fields json log spec issue grounding quote source', () => setExOpen(true)],
      ['phone', 'Phone companion', 'mobile phone companion remote approve pair', () => setPcOpen(true)],
      ['connect-agents', 'Connect other agents', 'mcp server other agents cursor codex tools connect expose', () => setCaOpen(true)],
      ['backend-map', 'Backend map', 'services routes endpoints api architecture diagram map backend', () => setBmOpen(true)],
      ['ask-data', 'Ask your data', 'question database sql chart dashboard metrics answer', () => setAdOpen(true)],
      ['short-term', 'Short-term compression: long tool results as one line', 'compress compression tool output long log json diff listing symbolic tokens context original', () => setStOpen(true)],
      ['project-graph', 'Project graph: what depends on what, which decisions touch it', 'graph dependencies depends imports modules tables services adr decisions cognee knowledge', () => setPgOpen(true)],
      ['session-review', 'Session review: what to keep from finished sessions', 'reflect reflection memory decisions facts lessons keep contradiction review session hindsight', () => setRfOpen(true)],
      ['check-after-edits', 'Check after edits: new type or lint errors back to Claude', 'typecheck tsc lint ruff mypy errors diagnostics after edit check turn', () => setCkOpen(true)],
      ['compose-stacks', 'Compose stacks: edit, start, stop, logs', 'docker compose stacks yaml dockge up down stop pull logs services', () => setStkOpen(true)],
      ['image-xray', 'Image X-ray: Docker layers and waste', 'docker image layers size waste dive dockerfile slim', () => setXrOpen(true)],
      ['run-ci', 'Run CI here with act, before the push', 'github actions workflow ci act local docker job run test', () => setCiOpen(true)],
      ['post-brief', 'Brief a post: summary and the best prompt from a link or screenshot', 'brief post link url screenshot summary summarize x twitter linkedin threads reddit youtube article prompt deeper', () => setBriefOpen(true)],
      ['topic-radar', 'Topic radar: your topics in your feeds', 'radar trends topics keywords feeds news count ranking summary ntfy', () => setRadarOpen(true)],
      ['bitwarden', 'Bitwarden or Vaultwarden: link secrets', 'bitwarden vaultwarden bw secrets password keys link', () => setBwOpen(true)],
      ['app-containers', 'App containers: what the app runs in Docker, live', 'docker containers isolate self-hosting stats events stop remove', () => setCtrOpen(true)],
      ['pdf-tools', 'PDF tools: merge, split, compress, OCR, redact', 'pdf stirling merge split compress ocr redact cpf personal data', () => setPdfOpen(true)],
      ['vault-board', 'Vault board: notes by frontmatter, table or kanban', 'vault tasks kanban board table frontmatter properties evernote enex import joplin', () => setBoardOpen(true)],
      ['design-handoff', 'Design handoff: DESIGN.md and HTML preview', 'design md tokens export preview html sandbox artifact', () => setHandoffOpen(true)],
      ['md-images', 'Publish images in a Markdown file', 'upload images markdown s3 r2 bucket links rewrite', () => setMdImgOpen(true)],
      ['office-files', 'Office files', 'word excel powerpoint docx xlsx pptx officecli documents artifacts', () => setOfficeOpen(true)],
      ['design-system', 'Design system', 'brand icons buttons fields components colours typography style guide', () => setDsOpen(true)],
      ['remote-panel', 'Panel on another machine (SSH)', 'remote ssh server machine worktree box run elsewhere', () => setRemoteOpen(true)],
      ['issue', 'Panel from an issue', 'github issue spec worktree start work ticket bug', () => setIssuesOpen(true)],
      ['past', 'Search past sessions', 'history find old conversation transcript turn resume search sessions', () => setPastOpen(true)],
      ['fanout', 'Fan-out scoreboard', 'attempts compare tests diff cost time winner merge board', () => setFanOpen({})],
      ['budgets', 'Budgets', 'budget limit brake spend cap approve cost per panel project persona', () => setBudgetOpen(true)],
      ['savings', 'Savings', 'tokens saved economy headroom cache', () => setSavingsOpen(true)],
      ['database', 'Database', 'database db sql postgres sqlite supabase neon tables query rows', () => setDbOpen(true)],
      ['api', 'API client', 'api client http request rest postman curl endpoint test', () => setApiOpen(true)],
      ['quick-ask', 'Quick ask (local)', 'ask local ollama offline private free chat question', () => setAskLocal(true)],
      ['local-model', 'Local model', 'ollama local model offline free small tasks status test', () => setLocalOpen(true)],
      ['cloud', 'Cloud', 'aws gcp ec2 running instances machines forgotten billing repo secrets', () => setCloudOpen(true)],
      ['secrets', 'Secrets', 'env dotenv keys leaked gitignore', () => setSecretsOpen(true)],
      ['health', 'Health', 'memory cpu performance slow', () => setHealthOpen(true)],
      ['markets', 'Markets', 'stocks b3 dollar bitcoin quotes', () => setMarketsOpen(true)],
      ['memory', 'Memory', 'sessions notes vault', () => setMemory(true)],
      ['catalog', 'Catalog', 'plugins skills mcp', () => setCatalog(true)],
      ['business', 'Business', 'social instagram facebook threads youtube linkedin x tiktok posts comments schedule queue', () => setBizOpen(true)],
      ['studio', 'Design studio', 'design kit components saas colors palette theme design system tokens tailwind contrast', () => setStudioOpen(true)],
      ['triggers', 'Triggers', 'schedule cron automation run every morning pr review', () => setTriggersOpen(true)],
      ['personas', 'Personas', 'roles reviewer devops frontend writer', () => setPersonasOpen(true)],
      ['connections', 'Connections', 'integrations vault secrets tokens', () => setSheet(true)],
      ['mail', 'Mail', 'outlook email inbox hotmail message', () => setMailOpen(true)],
      ['tour', 'Tour', 'help onboarding how video learn start guide', () => setTourOpen(true)],
      ['appearance', 'Appearance', 'theme font background landscape', () => setAppearance(true)],
      ['focus', 'Focus', 'timer pomodoro', () => setFocusSheet(true)],
      ['private', priv ? 'Show in screen sharing' : 'Hide from screen sharing', 'private', () => setPriv(!priv)],
    ].filter(([id]) => !hidden.has(id as string)).map(([id, label, keywords, run]) => ({ id: `go-${id as string}`, group: 'Go to', label: label as string, keywords: keywords as string, run: run as () => void })),
    ...WEB_APPS.map((a) => ({ id: `app-${a.id}`, group: 'Apps', label: a.name, hint: waUnread[a.id] ? `${waUnread[a.id]} unread` : undefined, run: () => window.dispatchEvent(new CustomEvent('stm:webapp-show', { detail: { app: a.id } })) })),
    ...agenda.events.filter((e) => Date.parse(e.end) > Date.now()).slice(0, 8).map((e) => ({ id: `ev-${e.id}`, group: 'Meetings', label: e.title, hint: new Date(e.start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }), run: () => (e.join ? join(e.join) : setAgendaOpen(true)) })),
    ...reviews.map((r) => ({ id: `pr-${r.repo}-${r.number}`, group: 'Reviews', label: r.title, hint: `${r.repo} #${r.number}`, run: () => setPrsOpen(true) })),
    ...dayLogs.flatMap((l) => l.stops).filter((st, i, all) => all.findIndex((x) => x.cwd === st.cwd) === i).slice(0, 8).map((st) => ({ id: `open-${st.cwd}`, group: 'Recent folders', label: st.cwd.split('/').filter(Boolean).slice(-2).join('/'), hint: st.last, run: () => void open(st.cwd, st.sessionId) })),
    ...found.personas.map((x) => ({ id: `persona-${x.id}`, group: 'Personas', label: `New ${x.name} panel`, keywords: 'persona role', run: () => void open(p.focus ? p.byId[p.focus]?.cwd : undefined, undefined, x.id) })),
    ...found.pieces.slice(0, 30).map((x) => ({ id: `piece-${x.id}`, group: 'Content', label: x.title, hint: x.stage, keywords: 'video reel post content', run: () => setBizOpen(true) })),
    ...found.secrets.map((n) => ({ id: `secret-${n}`, group: 'Secrets', label: n, hint: 'in the vault', keywords: 'secret key token', run: () => setSheet(true) })),
    ...news.items.slice(0, 40).map((n) => ({ id: `news-${n.id}`, group: 'Stories', label: n.title, hint: n.source, run: () => void window.stm.openUrl(n.link) })),
  ]
  const [todayOpen, setTodayOpen] = useState(() => {
    try {
      // the first launch belongs to the tour; the brief starts the next day
      if (firstRun()) {
        localStorage.setItem('stm.brief', dateKey())
        return false
      }
      return localStorage.getItem('stm.brief') !== dateKey()
    } catch {
      return false
    }
  })
  const closeToday = () => {
    setTodayOpen(false)
    try {
      localStorage.setItem('stm.brief', dateKey())
    } catch {
      // storage off: the brief shows again next launch
    }
  }

  const recentDirs = dayLogs.flatMap((l) => l.stops).sort((a, b) => b.at - a.at).map((st) => st.cwd)
  const panelEl = (sid: string) => (
          <Panel
            key={sid}
            sid={sid}
            s={p.byId[sid]!}
            focused={p.focus === sid}
            theme={theme}
            dim={Boolean(focus && focus.kind === 'focus' && focus.sid && focus.sid !== sid)}
            coachExtra={{ stretch: stretch(activity.current, now), focus: Boolean(focus && focus.kind === 'focus') }}
            money={money}
            dispatch={(action) => dispatch({ kind: 'event', sid, action })}
            onFocus={() => p.focus !== sid && dispatch({ kind: 'focus', sid })}
            onClose={() =>
              leave(sid, () => {
                void window.stm.closeSession(sid)
                dispatch({ kind: 'close', sid })
              })
            }
          />
  )
  return (
    <div className={`shell ${priv ? 'is-private' : ''} ${sceneFor(scene.id) ? 'has-scene' : ''}`}>
      <Backdrop id={scene.id} strength={scene.strength} theme={theme} />
      <FolderPickerHost recents={recentDirs} />
      <FilePickerHost />
      <DialogHost />
      <ContextMenuHost />
      <header className={`top ${topFit === 'tightest' ? 'tight tighter tightest' : topFit === 'tighter' ? 'tight tighter' : topFit}`} ref={topRef}>
        <div className="brand">
          <BrandMark />
          <span className="brand-name">SuperTokenMan</span>
        </div>
        <div className="top-actions">
          <ModelMenu model={model} effort={effort} onModel={setModel} onEffort={setEffort} />
          <button className="ghost" onClick={() => void open(p.focus ? p.byId[p.focus]?.cwd : undefined)} data-tip="New panel in the same folder (Cmd+T)" aria-label="New panel in the same folder (Cmd+T)">
            <IconPanel />
          </button>
          <SandboxButton cwd={p.focus ? p.byId[p.focus]?.cwd : undefined} onOpen={(cwd) => open(cwd, undefined, undefined, true)} />
          <button className="ghost icon" onClick={() => void openWorktree()} data-tip="New panel in its own git worktree, on its own branch" aria-label="New panel in its own git worktree, on its own branch">
            <BranchMark size={16} />
          </button>
          {p.order.length > 1 && (
            <button className="ghost layout-btn" onClick={() => setLayout(LAYOUTS[(LAYOUTS.findIndex((l) => l.id === layout) + 1) % LAYOUTS.length]!.id)} data-tip={`Panels: ${LAYOUTS.find((l) => l.id === layout)!.name}. ${LAYOUTS.find((l) => l.id === layout)!.what}. Click for the next layout.`} aria-label={`Panels: ${LAYOUTS.find((l) => l.id === layout)!.name}. ${LAYOUTS.find((l) => l.id === layout)!.what}. Click for the next layout.`}>
              <LayoutGlyph layout={layout} />
            </button>
          )}
          <button
            className="ghost"
            data-tip="Open a folder in a new panel" aria-label="Open a folder in a new panel"
            onClick={async () => {
              const dir = await pickProjectFolder('Open a folder in a new panel')
              if (dir) void open(dir)
            }}
          >
            <IconFolder />
          </button>
        </div>
        <span className="spacer" />
        <RouterBox onSend={sendToTeam} />
        <span className="spacer" />
        <span className="total" data-tip="All panels, at API prices">
          <span className="total-n">{p.order.length}</span> {p.order.length === 1 ? 'panel' : 'panels'}
          <span className="sep" />
          {money(total)}
        </span>
        {upd && (
          <div className={`update-bar ${upd.state}`} role="status">
            <div className="update-head">
              <StateMark state={upd.state} label={upd.state === 'busy' ? 'Updating' : 'Update failed'} />
              <span className="update-text">
                <b>{upd.state === 'busy' ? `Updating${update?.subjects[0] ? ` to ${update.subjects[0].replace(/^Version /, '')}` : ''}` : upd.step}</b>
                {upd.state === 'busy' && <span className="faint">{upd.step}{upd.pct != null ? ` · ${upd.pct}%` : ''}. Reopens by itself.</span>}
              </span>
              {upd.state === 'down' && (
                <>
                  <button className="ghost small" onClick={() => void navigator.clipboard.writeText(upd.tail ?? '')}>Copy log</button>
                  <button className="ghost small" onClick={() => setUpd(null)}>Close</button>
                </>
              )}
            </div>
            {upd.state === 'busy' && (
              <div className={`update-track${upd.pct == null ? ' wait' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={upd.pct}>
                <i style={upd.pct != null ? { transform: `scaleX(${upd.pct / 100})` } : undefined} />
              </div>
            )}
            {upd.tail && <pre className="update-tail">{upd.tail}</pre>}
          </div>
        )}
        {!online && (
          <button className="ghost offline-badge" onClick={() => setAskLocal(true)} data-tip="No network: panels wait for it. Quick ask runs on the local model and works offline.">
            <StateMark state="down" label="Offline" />
            Offline
          </button>
        )}
        <DevicesButton />
        <InboxButton items={needList} onGo={goNeed} />
        <NextChip agenda={agenda} onOpen={() => setAgendaOpen(true)} />
        {(!agenda.next || agenda.next.inMin > 120) && (
          <button className="ghost" onClick={() => setAgendaOpen(true)} data-tip="Today's meetings">
            <IconCalendar /> <span className="lbl">Agenda</span>
          </button>
        )}
        {focus ? (
          <FocusChip f={focus} now={now} onClick={() => setFocusSheet(true)} />
        ) : (
          <button className="ghost" onClick={() => setFocusSheet(true)} data-tip="Start a focus round, see where the time went">
            <IconFocus /> <span className="lbl">Focus</span>
          </button>
        )}
        {spotify.np?.running && spotify.np.track ? (
          <MusicChip np={spotify.np} onClick={() => setMusic(true)} />
        ) : (
          spotify.np && (
            <button className="ghost" onClick={() => setMusic(true)} data-tip="Spotify">
              <IconMusic /> <span className="lbl">Music</span>
            </button>
          )
        )}
        <button className="ghost" onClick={() => setNewsOpen(true)} data-tip="News from your feeds">
          <IconNews /> <span className="lbl">News</span>
          {news.unread > 0 && <span className="count quiet">{news.unread > 99 ? '99+' : news.unread}</span>}
        </button>
        <button className={`ghost wa-btn ${wa ? 'on' : ''}`} onClick={toggleWa} data-tip="Your web apps: messages, mail, food, rides, social, video (Cmd+Shift+W)">
          <IconApps /> <span className="lbl">Apps</span>
          {unreadTotal > 0 && <span className="count">{unreadTotal > 99 ? '99+' : unreadTotal}</span>}
        </button>
        <Menu
          icon={<IconBoxes />}
          label="Dev"
          items={[
            { id: 'cloud', icon: <IconCloud />, label: 'Cloud', detail: 'What runs and bills', onClick: () => setCloudOpen(true) },
            { id: 'prs', icon: <IconPull />, label: 'Pull requests', detail: 'Reviews and checks', onClick: () => setPrsOpen(true) },
            { id: 'docker', icon: <IconBoxes />, label: 'Docker', detail: 'Containers and logs', onClick: () => setDockerOpen(true) },
            { id: 'ports', icon: <IconPorts />, label: 'Ports', detail: 'What listens where', onClick: () => setPorts(true) },
            { id: 'api', icon: <IconPorts />, label: 'API client', detail: 'Requests with vault secrets', onClick: () => setApiOpen(true) },
            { id: 'database', icon: <IconPorts />, label: 'Database', detail: 'Postgres and SQLite, read-only first', onClick: () => setDbOpen(true) },
            { id: 'catalog', icon: <IconCatalog />, label: 'Catalog', detail: 'Plugins, skills, MCP', keys: '⇧⌘K', onClick: () => setCatalog(true) },
          ]}
        />
        <Menu
          icon={<IconTeam />}
          label="Team"
          items={[
            { id: 'markets', icon: <IconTrend />, label: 'Markets', detail: 'B3, dollar, crypto', onClick: () => setMarketsOpen(true) },
            { id: 'today', icon: <IconCalendar />, label: 'Today', detail: 'The day at a glance', onClick: () => setTodayOpen(true) },
            { id: 'mail', icon: <IconMail />, label: 'Mail', detail: mailUnread ? `${mailUnread} unread` : 'Outlook and Gmail', badge: mailUnread, onClick: () => setMailOpen(true) },
            { id: 'business', icon: <IconMegaphone />, label: 'Business', detail: 'Your social accounts', onClick: () => setBizOpen(true) },
            { id: 'personas', icon: <IconPersona />, label: 'Personas', detail: 'Roles for panels', onClick: () => setPersonasOpen(true) },
            { id: 'triggers', icon: <IconClock />, label: 'Triggers', detail: 'Personas on their own', onClick: () => setTriggersOpen(true) },
            { id: 'team', icon: <IconTeam />, label: 'Team room', detail: team.state.s === 'live' ? `${team.members.length} online` : 'Invite a colleague', badge: teamOpen ? 0 : team.unread, hot: team.state.s === 'live', onClick: () => setTeamOpen(true) },
            { id: 'publish', icon: <IconMegaphone />, label: 'Publish', detail: 'Post on your networks', onClick: () => setPubOpen(true) },
            { id: 'validate', icon: <IconSeal />, label: 'Validate', detail: 'Name and market', onClick: () => setValOpen(true) },
            { id: 'memory', icon: <IconMemory />, label: 'Memory', detail: 'Sessions and notes', keys: '⌘J', onClick: () => setMemory(true) },
          ]}
        />
        <Menu
          icon={<IconPalette />}
          label="Settings"
          items={[
            { id: 'tour', icon: <IconPanel />, label: 'Tour', detail: 'The app, a minute at a time', onClick: () => setTourOpen(true) },
            { id: 'spend', icon: <IconCoins />, label: 'Spend', detail: 'What it all costs', onClick: () => setSpendOpen(true) },
            { id: 'savings', icon: <IconCoins />, label: 'Savings', detail: 'What each tool kept off the bill', onClick: () => setSavingsOpen(true) },
            { id: 'local-model', icon: <IconChip />, label: 'Local model', detail: 'Ollama on this Mac: status, test', onClick: () => setLocalOpen(true) },
            { id: 'quick-ask', icon: <IconChip />, label: 'Quick ask', detail: 'Ask the local model, free and offline', onClick: () => setAskLocal(true) },
            { id: 'connections', icon: <IconPlug />, label: 'Connections', detail: exposures.length ? `${exposures.length} exposed` : 'Integrations, vault', badge: exposures.length, onClick: () => setSheet(true) },
            { id: 'secrets', icon: <IconKey />, label: 'Secrets', detail: 'Env files, exposed keys', onClick: () => setSecretsOpen(true) },
            { id: 'health', icon: <IconFocus />, label: 'Health', detail: 'Memory and CPU by part', onClick: () => setHealthOpen(true) },
            { id: 'update', icon: <IconRefresh />, label: updating ? 'Updating...' : 'Update', detail: !update?.source ? 'From source: git pull' : update.behind ? `${update.behind} new change${update.behind > 1 ? 's' : ''}` : 'Up to date', badge: update?.behind ?? 0, onClick: () => void runUpdate() },
            { id: 'studio', icon: <IconSwatch />, label: 'Design studio', detail: 'Kits, palettes, design systems', onClick: () => setStudioOpen(true) },
            { id: 'theme', icon: <IconPalette />, label: 'Appearance', detail: 'Theme, text, place', keys: '⌘,', onClick: () => setAppearance(true) },
          ]}
        />
        {!!update?.behind && (
          <button className="update-pill" disabled={updating} onClick={() => void runUpdate()} data-tip={update.subjects.join('\n')}>
            <IconRefresh /> Update <b>{update.behind}</b>
          </button>
        )}
        <button className={`private ${priv ? 'on' : ''}`} onClick={() => setPriv(!priv)} data-tip="Hide this window from screen sharing and recordings (Cmd+Shift+P)">
          <IconPrivate on={priv} />
          <span className="lbl">{priv ? 'Hidden from sharing' : 'Private'}</span>
        </button>
      </header>
        {link && (
          <div className={`deeplink-bar ${'error' in link ? 'bad' : ''}`} role="alertdialog" aria-label="Link">
            <span className="chart-name">Link</span>
            <span>{'error' in link ? `A link was refused: ${link.error}` : askText(link)}</span>
            <span className="spacer-flex" />
            {!('error' in link) && <button className="primary small" onClick={() => followLink(link)}>Open</button>}
            <button className="ghost small" onClick={() => setLink(null)}>{'error' in link ? 'Dismiss' : 'Ignore'}</button>
          </div>
        )}
      {lastTime.length > 0 && (
        <div className="resume-bar" role="status">
          <StateMark state="warn" label="Last time" />
          <span>Pick up where you left off: {lastTime.map((w) => w.cwd.split('/').filter(Boolean).slice(-1)[0]).join(', ')}</span>
          <button className="primary small" onClick={() => void reopen()}>Reopen {lastTime.length === 1 ? 'it' : `all ${lastTime.length}`}</button>
          <button className="ghost small" onClick={() => setLastTime([])}>Not now</button>
        </div>
      )}

      <Presence show={!!music}><MusicSheet np={spotify.np} position={spotify.position} refresh={spotify.refresh} onClose={() => setMusic(false)} /></Presence>
      <Presence show={!!palette}>
        <Palette
          entries={paletteEntries()}
          onAsk={(t) => ask(t)}
          onShell={(cmd) => p.focus && void window.stm.runShell(p.focus, cmd)}
          onClose={() => {
            setPalette(false)
            void window.stm.palette.used()
          }}
          onDismiss={() => void window.stm.palette.dismissed()}
        />
      </Presence>
      <Presence show={mailOpen}><MailSheet onClose={() => setMailOpen(false)} onUnread={setMailUnread} /></Presence>
      <Presence show={tourOpen}>
        <Tour
          onClose={() => setTourOpen(false)}
          onTry={(what) => {
            setTourOpen(false)
            if (what === 'palette') setPalette(true)
            else if (what === 'personas') setPersonasOpen(true)
            else if (what === 'business') setBizOpen(true)
            else if (what === 'triggers') setTriggersOpen(true)
            else setTimeout(() => document.querySelector<HTMLTextAreaElement>('.panel.focused textarea, .panel textarea')?.focus(), 50)
          }}
        />
      </Presence>
      <Presence show={cloudOpen}><CloudSheet onClose={() => setCloudOpen(false)} /></Presence>
      <Presence show={secretsOpen}><SecretsSheet onClose={() => setSecretsOpen(false)} /></Presence>
      <Presence show={healthOpen}><HealthSheet onClose={() => setHealthOpen(false)} /></Presence>
      <Presence show={marketsOpen}><MarketsSheet onClose={() => setMarketsOpen(false)} /></Presence>
      <Presence show={todayOpen}>
        <TodaySheet
          events={agenda.events}
          needs={needList}
          yesterday={lastDay(dayLogs)}
          stories={news.items.filter((i) => !news.read.has(i.id))}
          onGo={goNeed}
          onResume={(cwd, sessionId) => void open(cwd, sessionId)}
          onStory={() => setNewsOpen(true)}
          onClose={closeToday}
        />
      </Presence>
      <Presence show={agendaOpen}><AgendaSheet agenda={agenda} onClose={() => setAgendaOpen(false)} /></Presence>
      <Presence show={newsOpen}><NewsSheet news={news} onClose={() => setNewsOpen(false)} onAsk={(text) => { setNewsOpen(false); if (p.focus) window.dispatchEvent(new CustomEvent('stm:ask', { detail: { sid: p.focus, text } })) }} /></Presence>
      <Presence show={askLocal}><LocalAskSheet onClose={() => setAskLocal(false)} onOpenLocal={() => (setAskLocal(false), setLocalOpen(true))} /></Presence>
      <Presence show={dbOpen}><DatabaseSheet cwd={p.focus ? p.byId[p.focus]?.cwd : undefined} onDiagram={(path) => (setDbOpen(false), setDiagramsOpen({ path }))} onClose={() => setDbOpen(false)} onAttach={(note) => p.focus && window.dispatchEvent(new CustomEvent('stm:attach', { detail: { sid: p.focus, ...note } }))} /></Presence>
      <Presence show={apiOpen}><ApiClientSheet onClose={() => setApiOpen(false)} onAttach={(note) => p.focus && window.dispatchEvent(new CustomEvent('stm:attach', { detail: { sid: p.focus, ...note } }))} /></Presence>
      <Presence show={localOpen}><LocalModelSheet onClose={() => setLocalOpen(false)} usdToBrl={rate} /></Presence>
      <Presence show={a2mOpen}><ApiToMcpSheet cwd={p.focus ? p.byId[p.focus]?.cwd : undefined} onClose={() => setA2mOpen(false)} /></Presence>
      <Presence show={mhOpen}><McpHealthSheet cwd={p.focus ? p.byId[p.focus]?.cwd : undefined} onClose={() => setMhOpen(false)} onInspect={() => (setMhOpen(false), setInspOpen(true))} onApprovals={() => (setMhOpen(false), setMpolOpen(true))} onCatalog={() => (setMhOpen(false), setMcatOpen(true))} /></Presence>
      <Presence show={mpolOpen}><McpApprovalsSheet cwd={p.focus ? p.byId[p.focus]?.cwd : undefined} onClose={() => setMpolOpen(false)} /></Presence>
      <Presence show={inspOpen}><McpInspectorSheet cwd={p.focus ? p.byId[p.focus]?.cwd : undefined} onClose={() => setInspOpen(false)} /></Presence>
      <Presence show={mcatOpen}><McpCatalogSheet cwd={p.focus ? p.byId[p.focus]?.cwd : undefined} onClose={() => setMcatOpen(false)} /></Presence>
      <Presence show={promOpen}><MetricsSheet onClose={() => setPromOpen(false)} /></Presence>
      <Presence show={phOpen}><AnalyticsSheet cwd={p.focus ? p.byId[p.focus]?.cwd : undefined} sid={p.focus ?? undefined} onClose={() => setPhOpen(false)} /></Presence>
      <Presence show={secOpen}><SecuritySheet cwd={p.focus ? p.byId[p.focus]?.cwd : undefined} sid={p.focus ?? undefined} onClose={() => setSecOpen(false)} /></Presence>
      <Presence show={wbOpen}><WorkbenchSheet onClose={() => setWbOpen(false)} /></Presence>
      <Presence show={s2cOpen}><ShotToCodeSheet cwd={p.focus ? p.byId[p.focus]?.cwd : undefined} onClose={() => setS2cOpen(false)} /></Presence>
      <Presence show={msOpen}><ModelServersSheet onClose={() => setMsOpen(false)} /></Presence>
      <Presence show={monOpen}><MonitorsSheet onClose={() => setMonOpen(false)} /></Presence>
      <Presence show={obsOpen}><ObserveSheet onClose={() => setObsOpen(false)} /></Presence>
      <Presence show={pubcalOpen}><PubCalendarSheet onClose={() => setPubcalOpen(false)} /></Presence>
      <Presence show={configOpen}><ConfigSheet cwd={p.focus ? p.byId[p.focus]?.cwd : undefined} onClose={() => setConfigOpen(false)} /></Presence>
      <Presence show={!!diagramsOpen}><DiagramsSheet cwd={p.focus ? p.byId[p.focus]?.cwd : undefined} open={diagramsOpen ? diagramsOpen.path : undefined} onClose={() => setDiagramsOpen(false)} /></Presence>
      <Presence show={inboxOpen}><InboxSheet onClose={() => setInboxOpen(false)} /></Presence>
      <Presence show={documentsOpen}><DocumentsSheet onClose={() => setDocumentsOpen(false)} onSend={(text) => void sendToTeam(null, text, 'Documents')} /></Presence>
      <Presence show={researchOpen}><ResearchSheet cwd={p.focus ? p.byId[p.focus]?.cwd : undefined} onClose={() => setResearchOpen(false)} onSend={(text) => void sendToTeam(null, text, 'Research')} onDraft={(title, idea) => (setDraftSeed({ title, idea }), setBizOpen(true))} /></Presence>
      <Presence show={webReaderOpen}><WebReaderSheet onClose={() => setWebReaderOpen(false)} /></Presence>
      <Presence show={teamFileOpen}><TeamFileSheet onClose={() => setTeamFileOpen(false)} /></Presence>
      <Presence show={designOpen}><DesignSheet cwd={p.focus ? p.byId[p.focus]?.cwd : undefined} onClose={() => setDesignOpen(false)} onSend={(text) => void sendToTeam(null, text, 'Design')} /></Presence>
      <Presence show={deploysOpen}><DeploysSheet onClose={() => setDeploysOpen(false)} onAsk={(text) => void sendToTeam(null, text, 'Supabase advisor')} /></Presence>
      <Presence show={labOpen}><LabSheet cwd={p.focus ? p.byId[p.focus]?.cwd : undefined} money={money} onClose={() => setLabOpen(false)} /></Presence>
      <Presence show={traceOpen}><TraceSheet sid={p.focus ?? undefined} name={p.focus ? `${p.byId[p.focus]?.persona?.name ? `${p.byId[p.focus]!.persona!.name} · ` : ''}${(p.byId[p.focus]?.cwd ?? '').split('/').filter(Boolean).pop() ?? ''}` : ''} money={money} onClose={() => setTraceOpen(false)} /></Presence>
      <Presence show={specOpen}>
        <SpecSheet
          cwd={p.focus ? p.byId[p.focus]?.cwd : undefined}
          personas={specPersonas}
          onClose={() => setSpecOpen(false)}
          toPanel={(text) => {
            const sid = p.focus
            if (!sid) return
            dispatch({ kind: 'event', sid, action: { kind: 'sent', text, at: Date.now() } })
            void window.stm.send(sid, text)
          }}
          toPersona={(persona, text) => void sendToTeam(persona, text, 'A spec task', true)}
        />
      </Presence>
      <Presence show={tryOpen}>
        <TryWaysSheet
          cwd={p.focus ? p.byId[p.focus]?.cwd : undefined}
          models={MODELS}
          onClose={() => setTryOpen(false)}
          onStart={async (prompt, models) => {
            const cwd = p.focus ? (p.byId[p.focus]?.worktree?.repo ?? p.byId[p.focus]?.cwd) : undefined
            const group = `g${Date.now().toString(36)}`
            for (const [i, m] of models.entries()) {
              const sid = await open(cwd, undefined, undefined, false, { worktree: { label: `attempt-${i + 1}`, group, attempt: i + 1, of: models.length }, model: m })
              dispatch({ kind: 'event', sid, action: { kind: 'sent', text: prompt, at: Date.now() } })
              void window.stm.send(sid, prompt)
            }
            setFanOpen({ group })
          }}
        />
      </Presence>
      <Presence show={!!draftsOpen}><SkillDraftsSheet key={draftsOpen?.focus ?? 'all'} focus={draftsOpen?.focus} cwd={p.focus ? p.byId[p.focus]?.cwd : undefined} onClose={() => setDraftsOpen(null)} /></Presence>
      <Presence show={modsOpen}><ModulesSheet off={modsOff} onChange={setOff} onClose={() => setModsOpen(false)} /></Presence>
      <Presence show={btOpen}><BacktestSheet cwd={p.focus ? p.byId[p.focus]?.cwd : undefined} onClose={() => setBtOpen(false)} /></Presence>
      <Presence show={photosOpen}><PhotosSheet onClose={() => setPhotosOpen(false)} /></Presence>
      <Presence show={vmOpen}><VideoMetaSheet cwd={p.focus ? p.byId[p.focus]?.cwd : undefined} onClose={() => setVmOpen(false)} /></Presence>
      <Presence show={bkOpen}><BookingSheet onClose={() => setBkOpen(false)} /></Presence>
      <Presence show={lnOpen}>
        <LearnSheet
          cwd={p.focus ? (p.byId[p.focus]?.worktree?.repo ?? p.byId[p.focus]?.cwd) : undefined}
          onClose={() => setLnOpen(false)}
          onTutor={async (text) => {
            const sid = await open(p.focus ? p.byId[p.focus]?.cwd : undefined)
            dispatch({ kind: 'event', sid, action: { kind: 'sent', text, at: Date.now() } })
            void window.stm.send(sid, text)
            setLnOpen(false)
          }}
          onReview={(text) => {
            const sid = p.focus
            if (!sid) return
            dispatch({ kind: 'event', sid, action: { kind: 'sent', text, at: Date.now() } })
            void window.stm.send(sid, text)
            setLnOpen(false)
          }}
        />
      </Presence>
      <Presence show={shOpen}><SelfHostSheet onClose={() => setShOpen(false)} /></Presence>
      <Presence show={arOpen}>
        <ArchDeskSheet
          cwd={p.focus ? (p.byId[p.focus]?.worktree?.repo ?? p.byId[p.focus]?.cwd) : undefined}
          onClose={() => setArOpen(false)}
          onSend={(text) => {
            const sid = p.focus
            if (!sid) return
            dispatch({ kind: 'event', sid, action: { kind: 'sent', text, at: Date.now() } })
            void window.stm.send(sid, text)
            setArOpen(false)
          }}
          onExercise={async (text) => {
            const sid = await open(p.focus ? p.byId[p.focus]?.cwd : undefined)
            dispatch({ kind: 'event', sid, action: { kind: 'sent', text, at: Date.now() } })
            void window.stm.send(sid, text)
            setArOpen(false)
          }}
        />
      </Presence>
      <Presence show={miOpen}><MemoryItemsSheet project={(p.focus ? p.byId[p.focus]?.cwd : '')?.split('/').filter(Boolean).pop() ?? ''} onClose={() => setMiOpen(false)} /></Presence>
      <Presence show={dgOpen}><DiagnosticsSheet onClose={() => setDgOpen(false)} /></Presence>
      <Presence show={rtOpen}><RoutinesSheet cwd={p.focus ? p.byId[p.focus]?.cwd : undefined} onClose={() => setRtOpen(false)} /></Presence>
      <Presence show={wtOpen}><WorkTasksSheet panels={p.order.map((sid) => ({ sid, label: `${(p.byId[sid]?.cwd ?? '').split('/').pop() || 'panel'} (${sid})` }))} focus={p.focus ?? undefined} onClose={() => setWtOpen(false)} /></Presence>
      <Presence show={pbOpen}><PlaybooksSheet sid={p.focus ?? undefined} cwd={p.focus ? p.byId[p.focus]?.cwd : undefined} onClose={() => setPbOpen(false)} /></Presence>
      <Presence show={mfOpen}><MessageFiltersSheet project={p.focus ? p.byId[p.focus]?.cwd : undefined} onClose={() => setMfOpen(false)} /></Presence>
      <Presence show={exOpen}><ExtractSheet project={p.focus ? p.byId[p.focus]?.cwd : undefined} onClose={() => setExOpen(false)} /></Presence>
      <Presence show={pcOpen}><PhoneCompanionSheet onClose={() => setPcOpen(false)} /></Presence>
      <Presence show={caOpen}><ConnectAgentsSheet onClose={() => setCaOpen(false)} /></Presence>
      <Presence show={bmOpen}><BackendMapSheet cwd={p.focus ? (p.byId[p.focus]?.worktree?.repo ?? p.byId[p.focus]?.cwd) : undefined} onClose={() => setBmOpen(false)} onAttach={(note) => (p.focus && window.dispatchEvent(new CustomEvent('stm:attach', { detail: { sid: p.focus, ...note } })), setBmOpen(false))} /></Presence>
      <Presence show={adOpen}><AskDataSheet onClose={() => setAdOpen(false)} onDatabase={() => (setAdOpen(false), setDbOpen(true))} /></Presence>
      <Presence show={dsOpen}><DesignSystemSheet onClose={() => setDsOpen(false)} /></Presence>
      <Presence show={stOpen}><ShortTerm sid={p.focus ?? undefined} onClose={() => setStOpen(false)} onAttach={(note) => (p.focus && window.dispatchEvent(new CustomEvent('stm:attach', { detail: { sid: p.focus, ...note } })), setStOpen(false))} /></Presence>
      <Presence show={pgOpen}><ProjectGraph cwd={p.focus ? (p.byId[p.focus]?.worktree?.repo ?? p.byId[p.focus]?.cwd) : undefined} onClose={() => setPgOpen(false)} onAsk={(text) => { setPgOpen(false); if (p.focus) window.dispatchEvent(new CustomEvent('stm:ask', { detail: { sid: p.focus, text } })) }} /></Presence>
      <Presence show={rfOpen}><Reflect onClose={() => setRfOpen(false)} /></Presence>
      <Presence show={ckOpen}><DiagCheck sid={p.focus ?? undefined} onClose={() => setCkOpen(false)} /></Presence>
      <Presence show={stkOpen}><ComposeStacks onClose={() => setStkOpen(false)} /></Presence>
      <Presence show={xrOpen}><ImageXray sid={p.focus ?? undefined} onClose={() => setXrOpen(false)} /></Presence>
      <Presence show={ciOpen}><RunCi cwd={p.focus ? p.byId[p.focus]?.cwd : undefined} sid={p.focus ?? undefined} onClose={() => setCiOpen(false)} /></Presence>
      <Presence show={briefOpen}>
        <PostBriefSheet
          run={briefSid && p.byId[briefSid] ? { busy: p.byId[briefSid].busy, reply: [...p.byId[briefSid].lines].reverse().find((l) => l.kind === 'assistant')?.text ?? '' } : null}
          onClose={() => setBriefOpen(false)}
          onBrief={async (text, images) => {
            const sid = await open(p.focus ? p.byId[p.focus]?.cwd : undefined)
            setBriefSid(sid)
            dispatch({ kind: 'event', sid, action: { kind: 'sent', text, at: Date.now(), images: images.map((i) => `data:${i.mediaType};base64,${i.data}`) } })
            await window.stm.send(sid, text, images)
          }}
          onOpen={async (prompt) => {
            const sid = await open(p.focus ? p.byId[p.focus]?.cwd : undefined)
            dispatch({ kind: 'event', sid, action: { kind: 'sent', text: prompt, at: Date.now() } })
            void window.stm.send(sid, prompt)
            setBriefOpen(false)
          }}
        />
      </Presence>
      <Presence show={radarOpen}><TopicRadar onClose={() => setRadarOpen(false)} /></Presence>
      <Presence show={bwOpen}><BitwardenSheet onClose={() => setBwOpen(false)} /></Presence>
      <Presence show={ctrOpen}><AppContainers onClose={() => setCtrOpen(false)} /></Presence>
      <Presence show={pdfOpen}><PdfTools onClose={() => setPdfOpen(false)} /></Presence>
      <Presence show={boardOpen}><VaultBoard onClose={() => setBoardOpen(false)} /></Presence>
      <Presence show={handoffOpen}><DesignHandoff cwd={p.focus ? p.byId[p.focus]?.cwd : undefined} onClose={() => setHandoffOpen(false)} /></Presence>
      <Presence show={mdImgOpen}><MdImages onClose={() => setMdImgOpen(false)} /></Presence>
      <Presence show={officeOpen}><OfficeFiles onClose={() => setOfficeOpen(false)} /></Presence>
      <Presence show={remoteOpen}><RemotePanelSheet onClose={() => setRemoteOpen(false)} onOpen={async (r) => void (await open(undefined, undefined, undefined, false, { remote: r }))} /></Presence>
      <Presence show={issuesOpen}>
        <IssuesSheet
          cwd={p.focus ? (p.byId[p.focus]?.worktree?.repo ?? p.byId[p.focus]?.cwd) : undefined}
          onClose={() => setIssuesOpen(false)}
          onStart={async (repo, issue) => {
            const home = p.focus ? (p.byId[p.focus]?.worktree?.repo ?? p.byId[p.focus]?.cwd) : undefined
            const slug = issueSlug(issue)
            const sid = await open(home, undefined, undefined, false, { worktree: { label: slug } })
            const spec = await window.stm.issue.spec(openedCwd.current[sid] ?? home ?? '', repo, issue)
            const text = spec.prompt
            dispatch({ kind: 'event', sid, action: { kind: 'sent', text, at: Date.now() } })
            void window.stm.send(sid, text)
          }}
        />
      </Presence>
      <Presence show={pastOpen}>
        <PastSearchSheet
          cwd={p.focus ? (p.byId[p.focus]?.worktree?.repo ?? p.byId[p.focus]?.cwd) : undefined}
          onClose={() => setPastOpen(false)}
          onOpen={async (hit) => {
            const before = await window.stm.past.around(hit.file, hit.n, 8)
            const sid = await open(hit.cwd || undefined, hit.sessionId, undefined, false, { resumeAt: hit.endUuid })
            dispatch({ kind: 'event', sid, action: { kind: 'past', turns: before.map((t) => ({ prompt: t.prompt, reply: t.reply })), note: `Picked up at turn ${hit.n} of ${hit.of}, ${new Date(hit.at).toLocaleString()}. Later turns stay in the original session; this one goes on as a new branch of it.` } })
            setPastOpen(false)
          }}
        />
      </Presence>
      <Presence show={!!fanOpen}>
        <FanoutSheet key={fanOpen?.group ?? "all"} byId={p.byId} group={fanOpen?.group} money={money} onFocus={(sid) => (dispatch({ kind: 'focus', sid }), setFanOpen(null))} onClose={() => setFanOpen(null)} />
      </Presence>
      <Presence show={budgetOpen}><BudgetSheet onClose={() => setBudgetOpen(false)} usdToBrl={rate} panels={p.order.map((sid) => ({ sid, name: `${p.byId[sid]?.persona?.name ? `${p.byId[sid]!.persona!.name} · ` : ''}${(p.byId[sid]?.cwd ?? '').split('/').filter(Boolean).pop() ?? sid}` }))} /></Presence>
      <Presence show={savingsOpen}><SavingsSheet onClose={() => setSavingsOpen(false)} usdToBrl={rate} /></Presence>
      <Presence show={spendOpen}><Spend onClose={() => setSpendOpen(false)} onConnections={() => { setSpendOpen(false); setSheet(true) }} /></Presence>
      <Presence show={valOpen}><Validate onClose={() => setValOpen(false)} /></Presence>
      <Presence show={bizOpen}>
        <Suspense fallback={null}>
          <Business
            onClose={() => (setBizOpen(false), setDraftSeed(null))}
            seed={draftSeed}
            project={(p.focus && p.byId[p.focus]?.cwd) || ''}
            usdToBrl={rate}
            onScript={async (piece, prompt) => {
              // a panel in the piece's project writes the script; its turns go to the piece's meter
              const sid = await open(piece.project || undefined)
              await window.stm.content.tag(sid, piece.id)
              const text = `[Content: ${piece.title}] ${prompt}`
              dispatch({ kind: 'event', sid, action: { kind: 'sent', text, at: Date.now() } })
              void window.stm.send(sid, text)
              setBizOpen(false)
            }}
          />
        </Suspense>
      </Presence>
      <Presence show={studioOpen}>
        <Suspense fallback={null}>
          <Studio onClose={() => setStudioOpen(false)} onApply={(t) => applyCustomTheme(t)} onBuild={(prompt) => { setStudioOpen(false); void sendToTeam(null, prompt) }} />
        </Suspense>
      </Presence>
      <Presence show={triggersOpen}>
        <Suspense fallback={null}>
          <Triggers cwd={(p.focus && p.byId[p.focus]?.cwd) || ''} onClose={() => setTriggersOpen(false)} />
        </Suspense>
      </Presence>
      <Presence show={personasOpen}>
        <Suspense fallback={null}>
          <Personas onClose={() => setPersonasOpen(false)} onOpen={(id) => void open(p.focus ? p.byId[p.focus]?.cwd : undefined, undefined, id)} />
        </Suspense>
      </Presence>
      <Presence show={teamOpen}>
        <TeamSheet
          team={team}
          onClose={() => setTeamOpen(false)}
          onContinue={(text) => p.focus && window.dispatchEvent(new CustomEvent('stm:ask', { detail: { sid: p.focus, text } }))}
          handoffFrom={() => {
            const st = p.focus ? p.byId[p.focus] : undefined
            const last = st?.lines.filter((l) => l.kind === 'assistant').at(-1)
            if (!st || !last || last.kind !== 'assistant') return null
            return { title: last.text.split('\n').find((l) => l.trim())!.replace(/^#+\s*/, '').slice(0, 80), text: last.text.slice(0, 6000), repo: st.cwd.split('/').filter(Boolean).slice(-2).join('/') }
          }}
        />
      </Presence>
      <Presence show={pubOpen}><Publish focusSid={p.focus} onClose={() => { setPubOpen(false) }} /></Presence>
      <Presence show={!!prsOpen}><PullRequests focusSid={p.focus} onClose={() => setPrsOpen(false)} onAsk={(text) => p.focus && window.dispatchEvent(new CustomEvent('stm:ask', { detail: { sid: p.focus, text } }))} /></Presence>
      <Presence show={!!dockerOpen}><Docker onClose={() => setDockerOpen(false)} onAsk={(text) => p.focus && window.dispatchEvent(new CustomEvent('stm:ask', { detail: { sid: p.focus, text } }))} /></Presence>
      <Presence show={!!ports}><Ports onClose={() => setPorts(false)} /></Presence>
      <Presence show={!!appearance}><Appearance current={themeId} onPick={pickTheme} typo={typo} onTypo={setTypo} scene={scene} onScene={setScene} onClose={() => setAppearance(false)} /></Presence>
      <Presence show={!!focusSheet}>{(
        <FocusSheet
          f={focus}
          now={now}
          log={log}
          panels={p.order.map((sid) => ({ sid, name: `${sid}  ${p.byId[sid]?.cwd.split('/').filter(Boolean).at(-1) ?? ''}` }))}
          focusSid={p.focus}
          onStart={(f) => {
            const st = f.sid ? p.byId[f.sid] : undefined
            startMark.current = { turns: st?.turns ?? 0, cost: st?.costUsd ?? 0 }
            setFocus(f)
            setFocusSheet(false)
            if (f.sid) dispatch({ kind: 'focus', sid: f.sid })
          }}
          onStop={() => setFocus(null)}
          onClose={() => setFocusSheet(false)}
        />
      )}</Presence>
      {doneRound && (
        <RoundDone
          {...doneRound}
          onDone={() => {
            setDoneRound(null)
            setFocus(null)
          }}
          onBreak={() => {
            setDoneRound(null)
            setFocus({ goal: '', sid: null, startedAt: Date.now(), minutes: 5, kind: 'break' })
          }}
          onMore={() => {
            const f = doneRound.f
            setDoneRound(null)
            setFocusSheet(f.kind === 'break')
            if (f.kind === 'focus') setFocus({ ...f, startedAt: Date.now() })
            else setFocus(null)
          }}
        />
      )}
      <Suspense fallback={null}>
      <Presence show={!!memory}>{(
        <Memory
          cwd={(p.focus && p.byId[p.focus]?.cwd) || ''}
          onClose={() => setMemory(false)}
          onResume={(id) => {
            setMemory(false)
            void open((p.focus && p.byId[p.focus]?.cwd) || undefined, id)
          }}
          onUse={(text) => p.focus && window.dispatchEvent(new CustomEvent('stm:prefill', { detail: { sid: p.focus, text } }))}
        />
      )}</Presence>
      <Presence show={!!catalog}><Catalog cwd={(p.focus && p.byId[p.focus]?.cwd) || ''} onClose={() => setCatalog(false)} /></Presence>
      <Presence show={!!sheet}><Connections onClose={() => setSheet(false)} exposures={exposures} initialTab={exposures.length ? 'exposures' : 'integrations'} /></Presence>

      </Suspense>

      {lock.locked && <LockScreen onUnlock={lock.unlock} touchId={Boolean(lock.state?.touchId)} />}
      <Splash done={p.order.some((sid) => Boolean(p.byId[sid]?.model))} onGone={splashGone} />
      <UpdateAsk ready={splashOff && !tourOpen && !lock.locked} />

      <div className="body">
      {layout === 'canvas' ? (
        <Suspense fallback={null}>
          <Canvas order={p.order} panel={panelEl} />
        </Suspense>
      ) : (
      <div className="grid" ref={gridRef} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
        {p.order.map(panelEl)}
        {p.order.length === 0 && (
          <div className="empty">
            <div className="empty-title">No panels open</div>
            <button className="primary" onClick={() => void open()}>New panel</button>
          </div>
        )}
      </div>
      )}
      {waMounted && <Suspense fallback={null}><WebAppsDrawer open={wa} app={waApp} onApp={setWaApp} width={waWidth} onResize={setWaWidth} onUnread={setWaUnread} onClose={() => setWa(false)} /></Suspense>}
      </div>
    </div>
  )
}

/**
 * Panels move instead of jumping: a new one grows in, the others glide to their new places (FLIP), and
 * a closing one shrinks away before it is removed. Off with reduced motion.
 */
function usePanelMotion(order: string[]) {
  const gridRef = useRef<HTMLDivElement>(null)
  const last = useRef(new Map<string, DOMRect>())
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const now = new Map<string, DOMRect>()
    for (const el of Array.from(grid.querySelectorAll<HTMLElement>(':scope > .panel[data-sid]'))) now.set(el.dataset.sid!, el.getBoundingClientRect())
    if (!still) {
      for (const el of Array.from(grid.querySelectorAll<HTMLElement>(':scope > .panel[data-sid]'))) {
        const was = last.current.get(el.dataset.sid!)
        const is = now.get(el.dataset.sid!)!
        if (!was) {
          if (last.current.size) el.animate([{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.7,.2,1)' })
          continue
        }
        const dx = was.left - is.left, dy = was.top - is.top, sx = was.width / is.width, sy = was.height / is.height
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) continue
        el.animate([{ transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transformOrigin: '0 0', transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2,.7,.2,1)' })
      }
    }
    last.current = now
  }, [order.join('|'), still])
  const leave = (sid: string, done: () => void) => {
    const el = gridRef.current?.querySelector<HTMLElement>(`:scope > .panel[data-sid="${CSS.escape(sid)}"]`)
    if (!el || still) return done()
    el.style.pointerEvents = 'none'
    el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.96)' }], { duration: 170, easing: 'ease-in', fill: 'forwards' }).finished.then(done, done)
  }
  return { gridRef, leave }
}

/** The window's size, for layouts that change on big and turned monitors. */
function useScreen() {
  const [s, setS] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    let t = 0
    const f = () => (clearTimeout(t), (t = window.setTimeout(() => setS({ w: window.innerWidth, h: window.innerHeight }), 120)))
    window.addEventListener('resize', f)
    return () => (clearTimeout(t), window.removeEventListener('resize', f))
  }, [])
  return s
}

function usePortrait() {
  const q = '(orientation: portrait)'
  const [on, setOn] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const f = () => setOn(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return on
}

/** The layouts, drawn as what they do. */
function LayoutGlyph(props: { layout: Layout }) {
  const r = (x: number, y: number, w: number, h: number) => <rect x={x} y={y} width={w} height={h} rx="1" />
  return (
    <svg width="15" height="13" viewBox="0 0 15 13" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      {props.layout === 'canvas' ? <>{r(0.65, 0.65, 6, 5)}{r(8.35, 6.85, 6, 5.5)}<path d="M6.65 3.15 Q 10 3.5 11.35 6.85" /></> : props.layout === 'columns' ? <>{r(0.65, 0.65, 3.9, 11.7)}{r(5.55, 0.65, 3.9, 11.7)}{r(10.45, 0.65, 3.9, 11.7)}</> : props.layout === 'grid' ? <>{r(0.65, 0.65, 6.3, 5.3)}{r(8.05, 0.65, 6.3, 5.3)}{r(0.65, 7.05, 6.3, 5.3)}{r(8.05, 7.05, 6.3, 5.3)}</> : <>{r(0.65, 0.65, 6.3, 11.7)}{r(8.05, 0.65, 6.3, 5.3)}{r(8.05, 7.05, 6.3, 5.3)}</>}
    </svg>
  )
}
