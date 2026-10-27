// The app's own icon set: 16 px grid, 1.5 px strokes, round caps, currentColor. Drawn for this app.
import type { ReactNode } from 'react'

const Icon = ({ children, size = 16, cls = '' }: { children: ReactNode; size?: number; cls?: string }) => (
  <svg className={`ico ${cls}`} width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

/** a panel with a plus in its corner */
export const IconPanel = () => (
  <Icon>
    <rect x="1.75" y="2.75" width="10" height="10.5" rx="2" />
    <path d="M5 2.75v10.5M12.5 1.5v4M10.5 3.5h4" />
  </Icon>
)
/** an open folder */
export const IconFolder = () => (
  <Icon>
    <path d="M1.75 12.25V4.5c0-.7.55-1.25 1.25-1.25h2.6l1.4 1.5h4.5c.7 0 1.25.55 1.25 1.25v.75" />
    <path d="M1.75 12.25l1.6-4.6c.15-.45.6-.75 1.1-.75h9.1c.5 0 .85.5.7.95l-1.4 4.4H1.75z" />
  </Icon>
)
/** a lens over a grid: search across catalogs */
export const IconCatalog = () => (
  <Icon>
    <path d="M2 2.5h3.5v3.5H2zM2 8.5h3.5V12H2zM8 2.5h3.5" />
    <circle cx="10.25" cy="9.75" r="2.75" />
    <path d="M12.25 11.75L14.5 14" />
  </Icon>
)
/** an orbit with a planet: the vault map */
export const IconMemory = () => (
  <Icon>
    <circle cx="8" cy="8" r="2.25" />
    <ellipse cx="8" cy="8" rx="6.25" ry="3.25" transform="rotate(-25 8 8)" />
    <circle cx="13.1" cy="5" r="0.9" fill="currentColor" stroke="none" />
  </Icon>
)
/** a plug: connections */
export const IconPlug = () => (
  <Icon>
    <path d="M5.5 1.75v3M10.5 1.75v3M3.75 4.75h8.5v2.5a4.25 4.25 0 0 1-8.5 0v-2.5zM8 11.5v2.75" />
  </Icon>
)
/** an eye with a slash: private */
export const IconPrivate = ({ on }: { on: boolean }) => (
  <Icon>
    <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z" />
    <circle cx="8" cy="8" r="1.9" />
    {on && <path d="M2.5 2.5l11 11" />}
  </Icon>
)
/** a bookmark with a spark: remember */
export const IconRemember = () => (
  <Icon>
    <path d="M4 1.75h8v12.5l-4-2.75-4 2.75z" />
    <path d="M8 4.75v3M6.5 6.25h3" />
  </Icon>
)
/** a prompt chevron with a cursor: run in the shell */
export const IconRun = () => (
  <Icon>
    <path d="M2.5 4l3.5 4-3.5 4M8 12h5.5" />
  </Icon>
)
export const IconClose = () => (
  <Icon size={12}>
    <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
  </Icon>
)
export const IconSend = () => (
  <Icon size={14}>
    <path d="M8 13V3M3.75 7.25L8 3l4.25 4.25" strokeWidth="1.8" />
  </Icon>
)
export const IconStop = () => (
  <Icon size={12}>
    <path d="M5.5 2.5h8v11h-11v-8z" fill="currentColor" stroke="none" />
  </Icon>
)
/** a target: focus */
/** a speech block with two eyes: community chat */
export const IconCrew = () => (
  <Icon>
    <path d="M2.5 3.5h11v7.5H8.5L5 13.5v-2.5H2.5z" />
    <rect x="5.5" y="6" width="1.4" height="1.6" fill="currentColor" />
    <rect x="9.1" y="6" width="1.4" height="1.6" fill="currentColor" />
  </Icon>
)
/** a chip with its pins: a model running on this Mac */
export const IconChip = () => (
  <Icon>
    <rect x="4" y="4" width="8" height="8" />
    <rect x="6.5" y="6.5" width="3" height="3" fill="currentColor" />
    <path d="M6 1.5v2.5M10 1.5v2.5M6 12v2.5M10 12v2.5M1.5 6h2.5M1.5 10h2.5M12 6h2.5M12 10h2.5" />
  </Icon>
)
export const IconFocus = () => (
  <Icon>
    <circle cx="8" cy="8" r="6.25" />
    <circle cx="8" cy="8" r="3" />
    <circle cx="8" cy="8" r="0.6" fill="currentColor" />
  </Icon>
)
/** a palette: appearance */
export const IconPalette = () => (
  <Icon>
    <path d="M8 1.75a6.25 6.25 0 1 0 0 12.5c.9 0 1.4-.6 1.4-1.3 0-.8-.6-1.1-.6-1.8 0-.7.6-1.2 1.3-1.2h1.5a2.6 2.6 0 0 0 2.65-2.6C14.25 4.2 11.5 1.75 8 1.75z" />
    <circle cx="5" cy="7" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="7.5" cy="4.6" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="10.7" cy="5.4" r="0.9" fill="currentColor" stroke="none" />
  </Icon>
)
/** a note: music */
export const IconMusic = () => (
  <Icon>
    <path d="M6 12.25V3.5l7.25-1.75v8.75" />
    <circle cx="4.25" cy="12.25" r="1.75" />
    <circle cx="11.5" cy="10.5" r="1.75" />
  </Icon>
)
/** a speech bubble with a phone: chat */
export const IconChat = () => (
  <Icon>
    <path d="M8 1.75a6.25 6.25 0 0 0-5.4 9.4L1.75 14.25l3.2-.85A6.25 6.25 0 1 0 8 1.75z" />
    <path d="M5.9 5.4c.2-.4.6-.4.8 0l.5 1.1c.1.2 0 .5-.2.6l-.4.3c.4.9 1.1 1.6 2 2l.3-.4c.1-.2.4-.3.6-.2l1.1.5c.4.2.4.6 0 .8-.6.5-1.5.6-2.3.2A5.3 5.3 0 0 1 5.7 7.7c-.4-.8-.3-1.7.2-2.3z" fill="currentColor" stroke="none" />
  </Icon>
)

/** A plug socket: ports in use. */
export const IconPorts = () => (
  <Icon>
    <rect x="2" y="3" width="12" height="10" rx="2" />
    <path d="M5.5 6.5v2M10.5 6.5v2M6 11h4" />
  </Icon>
)

/** An envelope with its flap open a little: mail. */
export const IconMail = () => (
  <Icon>
    <rect x="1.75" y="3.25" width="12.5" height="9.5" rx="2" />
    <path d="M2.25 4.5 8 8.75l5.75-4.25" />
  </Icon>
)
/** An inbox tray: work mail. */
export const IconInbox = () => (
  <Icon>
    <path d="M1.75 9.25 3.4 3.9c.17-.53.66-.9 1.2-.9h6.8c.54 0 1.03.37 1.2.9l1.65 5.35v2.5c0 .7-.55 1.25-1.25 1.25H3c-.7 0-1.25-.55-1.25-1.25z" />
    <path d="M1.75 9.25h3.5l.9 1.5h3.7l.9-1.5h3.5" />
  </Icon>
)
/** A screen with a play mark: video. */
export const IconPlay = () => (
  <Icon>
    <rect x="1.5" y="3" width="13" height="10" rx="3" />
    <path d="M6.75 5.9v4.2L10.25 8z" fill="currentColor" />
  </Icon>
)
/** A stack of tiles: the apps drawer. */
export const IconApps = () => (
  <Icon>
    <rect x="2" y="2" width="5" height="5" rx="1.5" />
    <rect x="9" y="2" width="5" height="5" rx="1.5" />
    <rect x="2" y="9" width="5" height="5" rx="1.5" />
    <path d="M11.5 9v5M9 11.5h5" />
  </Icon>
)

/** A bowl with steam: food. */
export const IconFood = () => (
  <Icon>
    <path d="M1.75 8.25h12.5a6.25 5 0 0 1-12.5 0z" />
    <path d="M5.5 2.25c-.6.7.6 1.3 0 2.25M8 1.75c-.6.7.6 1.3 0 2.5M10.5 2.25c-.6.7.6 1.3 0 2.25" />
  </Icon>
)

/** Stacked boxes on a deck: containers. */
export const IconBoxes = () => (
  <Icon>
    <rect x="2" y="7" width="4" height="4" rx=".75" />
    <rect x="6" y="7" width="4" height="4" rx=".75" />
    <rect x="6" y="3" width="4" height="4" rx=".75" />
    <path d="M1.5 11h13c0 1.8-1.6 2.75-3.5 2.75H4.5c-1.6 0-3-1.1-3-2.75z" />
  </Icon>
)

/** A car from the front: rides. */
export const IconCar = () => (
  <Icon>
    <path d="M2.5 9.5 3.6 5.2c.15-.6.7-1.05 1.35-1.05h6.1c.65 0 1.2.45 1.35 1.05l1.1 4.3" />
    <rect x="1.75" y="9.25" width="12.5" height="3.25" rx="1.25" />
    <path d="M3.25 12.5v1.25M12.75 12.5v1.25M4.5 10.9h.5M11 10.9h.5" />
  </Icon>
)
/** A badge with a person: professional network. */
export const IconBadge = () => (
  <Icon>
    <rect x="2" y="2.5" width="12" height="11" rx="2.5" />
    <circle cx="8" cy="6.75" r="1.75" />
    <path d="M5 11.25c.5-1.3 1.6-2 3-2s2.5.7 3 2" />
  </Icon>
)
/** A bolt over a stream of posts: a fast timeline. */
export const IconSpark = () => (
  <Icon>
    <path d="M8.75 1.75 5.5 7h3l-1.25 4.25L10.5 6h-3z" />
    <path d="M2.5 13.75h11" />
  </Icon>
)
/** Two overlapping speech bubbles: threads and comments. */
export const IconThreads = () => (
  <Icon>
    <path d="M2 3.75c0-.7.55-1.25 1.25-1.25h6.5c.7 0 1.25.55 1.25 1.25v4c0 .7-.55 1.25-1.25 1.25H6L3.5 11V9H3.25C2.55 9 2 8.45 2 7.75z" />
    <path d="M11 6h1.75c.7 0 1.25.55 1.25 1.25v4c0 .7-.55 1.25-1.25 1.25h-.25V14l-2.25-1.5H7.5c-.6 0-1.1-.4-1.2-1" />
  </Icon>
)

/** Two branches joining: pull requests. */
export const IconPull = () => (
  <Icon>
    <circle cx="4" cy="3.5" r="1.5" />
    <circle cx="4" cy="12.5" r="1.5" />
    <circle cx="12" cy="12.5" r="1.5" />
    <path d="M4 5v6M12 11V6.5c0-1.1-.9-2-2-2H7.5M9 3l-1.5 1.5L9 6" />
  </Icon>
)

/** A megaphone: publish. */
export const IconMegaphone = () => (
  <Icon>
    <path d="M2 6.5v3c0 .4.3.75.75.75H4.5l6.25 3V2.75L4.5 5.75H2.75c-.45 0-.75.35-.75.75z" />
    <path d="M5.25 10.25 6 13.5h1.75M13 6.25c.6.5.6 3 0 3.5" />
  </Icon>
)

/** Three shapes side by side: the team. */
export const IconTeam = () => (
  <Icon>
    <circle cx="4.5" cy="9" r="2.5" />
    <rect x="9" y="6.5" width="5" height="5" rx="1" />
    <path d="M7.5 2 9.5 5.25h-4z" />
  </Icon>
)

/** A seal with a check: validate. */
export const IconSeal = () => (
  <Icon>
    <path d="M8 1.75 9.6 3l2-.1.6 1.9 1.65 1.15-.6 1.9.6 1.9-1.65 1.15-.6 1.9-2-.1L8 13.75 6.4 12.5l-2 .1-.6-1.9-1.65-1.15.6-1.9-.6-1.9L3.8 4.8l.6-1.9 2 .1z" />
    <path d="m5.75 7.75 1.5 1.5 3-3" />
  </Icon>
)

/** A coin stack: spend. */
export const IconCoins = () => (
  <Icon>
    <ellipse cx="6.5" cy="4.5" rx="4.25" ry="1.75" />
    <path d="M2.25 4.5v3c0 1 1.9 1.75 4.25 1.75s4.25-.8 4.25-1.75v-3" />
    <path d="M5.25 10.5v1.75c0 1 1.9 1.75 4.25 1.75s4.25-.8 4.25-1.75v-3c0-.9-1.5-1.6-3.5-1.75" />
  </Icon>
)

/** A folded paper: news. */
export const IconNews = () => (
  <Icon>
    <path d="M3.5 2.75h9.75v9.5c0 .7-.55 1.25-1.25 1.25H3.25c-.85 0-1.5-.65-1.5-1.5V6h1.75" />
    <path d="M3.5 2.75v9.75M6 5.5h4.5M6 8h4.5M6 10.5h3" />
  </Icon>
)

/** A hash of four strokes: team chat. */
export const IconHash = () => (
  <Icon>
    <path d="M6 2.25 4.75 13.75M11.25 2.25 10 13.75M2.5 5.75h11.25M2.25 10.25H13.5" />
  </Icon>
)
/** Two overlapping heads: meetings. */
export const IconPeople = () => (
  <Icon>
    <circle cx="6" cy="5.5" r="2.25" />
    <path d="M1.75 13c.4-2.4 2.1-3.75 4.25-3.75S9.85 10.6 10.25 13" />
    <path d="M10.25 3.4a2.25 2.25 0 1 1 0 4.2M11.5 9.4c1.5.35 2.5 1.6 2.75 3.6" />
  </Icon>
)
/** A page of days: the calendar. */
export const IconCalendar = () => (
  <Icon>
    <rect x="2" y="3" width="12" height="11" rx="2" />
    <path d="M2 6.5h12M5.25 1.75v2.5M10.75 1.75v2.5" />
    <rect x="4.75" y="8.5" width="2.5" height="2.5" rx=".5" fill="currentColor" stroke="none" />
  </Icon>
)
/** A camera: video calls. */
export const IconCamera = () => (
  <Icon>
    <rect x="1.75" y="4" width="9" height="8" rx="2" />
    <path d="m10.75 7 3.5-2v6l-3.5-2" />
  </Icon>
)

/** A rising line with a dot: markets. */
export const IconTrend = () => (
  <Icon>
    <path d="M1.75 12.5 6 8l3 2.75 5.25-6" />
    <path d="M10.75 4.75h3.5v3.5" />
  </Icon>
)

/** A key: secrets. */
export const IconKey = () => (
  <Icon>
    <circle cx="5" cy="10.5" r="2.75" />
    <path d="m7 8.5 6.25-6.25M11 4.5l1.75 1.75M9.5 6l1.25 1.25" />
  </Icon>
)

/** A cloud: what runs in your accounts. */
export const IconCloud = () => (
  <Icon>
    <path d="M4.5 12.5h7.25a2.75 2.75 0 0 0 .4-5.47A4 4 0 0 0 4.4 7.6 2.5 2.5 0 0 0 4.5 12.5z" />
  </Icon>
)

/** Two arrows in a circle: update. */
export const IconRefresh = () => (
  <Icon>
    <path d="M13 8a5 5 0 0 1-8.9 3.1M3 8a5 5 0 0 1 8.9-3.1" />
    <path d="M12.25 2.25v2.9h-2.9M3.75 13.75v-2.9h2.9" />
  </Icon>
)

export const IconCheckAll = () => (
  <Icon>
    <path d="M1.75 8.5 4.5 11.25 10 5.25M7.5 10.5l.75.75 5.75-6" />
  </Icon>
)

export const IconPersona = () => (
  <Icon>
    <circle cx="8" cy="5.5" r="2.75" />
    <path d="M2.75 14a5.25 5.25 0 0 1 10.5 0" />
    <path d="M11.5 2.25l1.25 1.25L15 1.25" />
  </Icon>
)

export const IconClock = () => (
  <Icon>
    <circle cx="8" cy="8.5" r="5.75" />
    <path d="M8 5.5v3l2 1.5" />
    <path d="M12.5 1.75l1.75 1.75" />
  </Icon>
)

export const IconSwatch = () => (
  <Icon>
    <rect x="1.75" y="2.25" width="4.5" height="11.5" rx="1" />
    <path d="M6.25 5.5 9.5 2.75l3 3.25-6.25 6.75" />
    <path d="M6.25 13.75h7.5v-4.5h-3.5" />
  </Icon>
)

// Action icons with their own small motion (app.css, .ico-*): they move on hover or when the action lands,
// never on their own, and stand still under reduced motion.

/** two sheets; the front one slides when copied */
export const IconCopy = () => (
  <Icon cls="ico-copy">
    <rect x="5.25" y="5.25" width="8.5" height="8.5" />
    <path d="M10.75 2.25h-8.5v8.5" />
  </Icon>
)
/** a check drawn in one stroke */
export const IconCheck = () => (
  <Icon cls="ico-check">
    <path d="M2.75 8.5 6.5 12l6.75-8" pathLength={1} />
  </Icon>
)
/** a lens; it leans in on hover */
export const IconSearch = () => (
  <Icon cls="ico-search">
    <circle cx="7" cy="7" r="4.25" />
    <path d="M10.25 10.25 13.75 13.75" />
  </Icon>
)
/** a branch splitting off */
export const IconBranch = () => (
  <Icon>
    <circle cx="4" cy="3.5" r="1.5" />
    <circle cx="4" cy="12.5" r="1.5" />
    <circle cx="12" cy="5.5" r="1.5" />
    <path d="M4 5v6M12 7c0 3-8 2-8 4" />
  </Icon>
)
/** two lines meeting: a merge; the joint drops in on hover */
export const IconMerge = () => (
  <Icon cls="ico-merge">
    <path d="M4 2v4.5c0 2 4 2.5 4 5V14M12 2v4.5c0 2-4 2.5-4 5" />
  </Icon>
)
/** a flask: tests */
export const IconTest = () => (
  <Icon cls="ico-test">
    <path d="M6 2h4M6.75 2v4.5L2.75 13a.75.75 0 0 0 .65 1.1h9.2a.75.75 0 0 0 .65-1.1L9.25 6.5V2" />
    <path d="M4.5 10.5h7" />
  </Icon>
)
/** plus and minus lines: a diff */
export const IconDiff = () => (
  <Icon>
    <path d="M5 2.5v5M2.5 5h5M2.5 12.5h5M10 2.5h3.5v11H10" />
  </Icon>
)
/** a prompt and a cursor: the terminal */
export const IconTerminal = () => (
  <Icon>
    <path d="M2.5 4.5 6 8l-3.5 3.5M8 12h5.5" />
  </Icon>
)
/** a cut-corner sheet with an arrow out: open elsewhere */
export const IconExternal = () => (
  <Icon cls="ico-external">
    <path d="M12.5 9v4.5h-10v-10H7" />
    <path d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5" />
  </Icon>
)
/** a bin */
export const IconTrash = () => (
  <Icon>
    <path d="M2.5 4.25h11M6 4.25V2.5h4v1.75M3.75 4.25l.75 9.25h7l.75-9.25" />
  </Icon>
)
/** a plus in a cut-corner square */
export const IconAdd = () => (
  <Icon>
    <path d="M2 2h9l3 3v9H2Z" />
    <path d="M8 5.5v5M5.5 8h5" />
  </Icon>
)
/** a stacked cylinder: a database */
export const IconDatabase = () => (
  <Icon>
    <ellipse cx="8" cy="3.75" rx="5.25" ry="1.75" />
    <path d="M2.75 3.75v8.5c0 1 2.35 1.75 5.25 1.75s5.25-.75 5.25-1.75v-8.5M2.75 8c0 1 2.35 1.75 5.25 1.75S13.25 9 13.25 8" />
  </Icon>
)
/** an arrow rising off a bar: deploy */
export const IconDeploy = () => (
  <Icon cls="ico-deploy">
    <path d="M8 11V2.5M4.5 6 8 2.5 11.5 6M2.5 13.5h11" />
  </Icon>
)
/** a plug joined to a socket: an MCP server */
export const IconMcp = () => (
  <Icon>
    <path d="M5 1.75v3M9 1.75v3M3.5 4.75h7v2.5a3.5 3.5 0 0 1-7 0zM7 10.75v3.5h5.5" />
  </Icon>
)
/** a page turning back: history */
export const IconHistory = () => (
  <Icon cls="ico-history">
    <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.25 2.5v2.75H5" />
    <path d="M8 5v3.25l2.25 1.5" />
  </Icon>
)
/** a scoreboard: three bars of different length */
export const IconBoard = () => (
  <Icon>
    <path d="M2 3.5h9M2 8h12M2 12.5h6" />
  </Icon>
)
/** an eraser line: clear */
export const IconClear = () => (
  <Icon>
    <path d="M9.5 2.5 13.5 6.5 7 13H3.5l-1-1z M6 6l4 4M7 13h6.5" />
  </Icon>
)
/** a screen with a line out to another: a machine reached over SSH */
export const IconRemote = () => (
  <Icon>
    <path d="M1.75 3h7v5.5h-7zM4 11h2.5M5.25 8.5V11M8.75 5.75h2.5l2 2M13.25 7.75v3.5h-3" />
  </Icon>
)
export const IconMic = () => (
  <Icon>
    <path d="M5.5 2.5h3v6h-3zM3.25 7v1.5a3.75 3.75 0 0 0 7.5 0V7M7 12.25V14M4.75 14h4.5" />
  </Icon>
)
export const IconSpeaker = () => (
  <Icon>
    <path d="M1.75 5.5h2.5L7.5 2.75v8.5L4.25 8.5h-2.5zM9.75 5a2.5 2.5 0 0 1 0 4M11.25 3.25a5 5 0 0 1 0 7.5" />
  </Icon>
)

/** a pencil at 45 degrees: edit */
export const IconEdit = () => (
  <Icon>
    <path d="M10.5 2.75l2.75 2.75L6 12.75H3.25V10z" />
    <path d="M9 4.25l2.75 2.75" />
  </Icon>
)
/** a box with a lid and a slot: archive */
export const IconArchive = () => (
  <Icon>
    <rect x="1.75" y="2.5" width="12.5" height="3" rx="0.75" />
    <path d="M2.75 5.5v7c0 .55.45 1 1 1h8.5c.55 0 1-.45 1-1v-7M6.5 8.25h3" />
  </Icon>
)

// Catalog kinds: one shape each, read at 12 px in a filter chip.
/** a puzzle piece: a plugin adds a piece to Claude Code */
export const IconPluginKind = () => (
  <Icon>
    <path d="M2.5 5.5h2.75a1.5 1.5 0 1 1 3 0H11v2.75a1.5 1.5 0 1 1 0 3V13.5H2.5z" />
  </Icon>
)
/** a page with a spark: a skill is written know-how */
export const IconSkillKind = () => (
  <Icon>
    <path d="M9.5 1.75H4c-.55 0-1 .45-1 1v10.5c0 .55.45 1 1 1h8c.55 0 1-.45 1-1V5.25z" />
    <path d="M8 6.25l2.25 2.25L8 10.75 5.75 8.5z" />
  </Icon>
)
/** two stacked server units with a link: an MCP server */
export const IconServerKind = () => (
  <Icon>
    <rect x="2" y="2.25" width="12" height="4.5" rx="1" />
    <rect x="2" y="9.25" width="12" height="4.5" rx="1" />
    <path d="M4.75 4.5h.01M4.75 11.5h.01M8.5 4.5h3M8.5 11.5h3" />
  </Icon>
)
/** a branch from a commit: a repository */
export const IconRepoKind = () => (
  <Icon>
    <circle cx="4.5" cy="3.5" r="1.5" />
    <circle cx="4.5" cy="12.5" r="1.5" />
    <circle cx="11.5" cy="5.5" r="1.5" />
    <path d="M4.5 5v6M11.5 7c0 2.5-3 2.5-7 4" />
  </Icon>
)
