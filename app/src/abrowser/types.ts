// What the window knows about the agent browser (the preload's `agentBrowser`). Types only.
export type Tab = { id: number; url: string; title: string; loading: boolean }
export type PaneState = {
  panel: string
  tabs: Tab[]
  active: number | null
  held: boolean
  /** why the agent handed the browser over: sign-in, captcha, passkey, payment, unclear */
  reason: string
  /** the task ended (challenge, budget, done); the text says why */
  stopped: string
  /** panel, project or profile:<id> */
  scope: string
  step: number
  budget: { steps: number; wallMs: number; screenshots: number; newHosts: number }
}
export type Ask = { id: string; panel: string; kind: 'host' | 'download' | 'upload'; detail: { host?: string; name?: string; size?: number; always: boolean; pick?: boolean } }
export type Profile = { id: string; name: string }
export type ProfileInfo = { list: Profile[]; scope: string; default: string | null; project: string }
export type Edit<T = true> = { ok: true; value?: T } | { ok: false; error: string }
export type Settings = { enabled: boolean; screenshots: boolean; limits: { steps: number; wallMs: number; screenshots: number; newHosts: number } }

export type AgentBrowserApi = {
  enabled: (on?: boolean) => Promise<boolean>
  bounds: (panel: string, rect: { x: number; y: number; width: number; height: number } | null) => Promise<void>
  take: (panel: string) => Promise<void>
  release: (panel: string) => Promise<void>
  answer: (id: string, answer: 'once' | 'always' | 'deny') => Promise<boolean>
  profile: (panel: string, scope: string) => Promise<string>
  profiles: (panel?: string) => Promise<ProfileInfo>
  editProfile: (a: { op: 'create' | 'rename' | 'delete' | 'default'; id?: string; name?: string; panel?: string }) => Promise<Edit<Profile | boolean>>
  settings: (a?: { screenshots?: boolean; limits?: Partial<Settings['limits']> }) => Promise<Settings>
  nav: (panel: string, op: 'go' | 'back' | 'forward' | 'reload' | 'stop', url?: string) => Promise<string>
  tab: (panel: string, op: 'switch' | 'close' | 'new', id?: number) => Promise<string>
  state: (panel: string) => Promise<PaneState | null>
  snap: (panel: string) => Promise<string | null>
  clear: (panel: string) => Promise<boolean>
  onState: (fn: (s: PaneState) => void) => () => void
  onAsk: (fn: (a: Ask) => void) => () => void
  onEnabled: (fn: (on: boolean) => void) => () => void
}
