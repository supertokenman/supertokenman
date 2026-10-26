// What the app is at its core, and what is an optional module. The core is everything around Claude Code
// panels; modules are useful but separate products, and each can be switched off: its screens leave the
// palette and the menus. Nothing is deleted; switching a module back on brings it back as it was.

export type Module = { id: string; name: string; what: string; commands: string[] }

export const CORE = ['Panels, worktrees and fan-out', 'Cost and context: budget, Headroom, savings, trace', 'Memory, past sessions, skills', 'MCP: catalog, inspector, approvals, health', 'Safety: approvals, injection defense, vault, security scans', 'Ship: tests, CI, deploys, backend map, architecture desk, database, API client']

export const MODULES: Module[] = [
  { id: 'comms', name: 'Inbox and social', what: 'Mail, social mentions, team chat and publishing calendar in one inbox.', commands: ['mail', 'oneinbox', 'publish', 'pubcal', 'team', 'teamfile'] },
  { id: 'agenda', name: 'Agenda and scheduling', what: 'Calendars, today view, focus timer and the scheduling link.', commands: ['agenda', 'today', 'focus', 'booking'] },
  { id: 'reading', name: 'Reading and research', what: 'News, the web reader, research notes and documents in.', commands: ['news', 'webreader', 'research', 'documents'] },
  { id: 'content', name: 'Content studio', what: 'The business pipeline, studio, video metadata and photos.', commands: ['business', 'studio', 'video-meta', 'photos'] },
  { id: 'money', name: 'Markets and backtests', what: 'Market quotes and the backtest lab (simulation only).', commands: ['markets', 'backtest'] },
  { id: 'learning', name: 'Learning', what: 'Tutor projects, flashcards and plan reviews.', commands: ['learn'] },
  { id: 'homelab', name: 'Self-hosting and machines', what: 'Self-hosting catalog, Docker, ports and cloud machines.', commands: ['self-host', 'docker', 'ports', 'cloud'] },
  { id: 'analytics', name: 'Product analytics', what: 'PostHog analytics, Prometheus metrics, monitors and model servers.', commands: ['analytics', 'prometheus', 'monitoring', 'modelservers'] },
]

/** The command ids hidden by the modules that are off. */
export const hiddenBy = (off: string[]) => new Set(MODULES.filter((m) => off.includes(m.id)).flatMap((m) => m.commands))
