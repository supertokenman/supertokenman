// The demo's window.stm: the real interface in a browser, with sample data and a scripted session.
// Nothing here touches a network or a disk; every call the script does not cover returns an empty
// value, so a sheet that needs the machine shows its empty state. Built only by `vite build --mode demo`
// (demo.html), never part of the Electron app.
import type { Bridge, UiEvent } from '../bridge'

type Ev = UiEvent | { kind: string; [k: string]: unknown }
type Listener = (sid: string, e: Ev) => void

const listeners = new Set<Listener>()
const emit = (sid: string, e: Ev) => listeners.forEach((fn) => fn(sid, e as never))
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

// sample projects: made-up folders, made-up numbers (labelled as sample in the banner)
const PROJECTS = [
  { sid: 'demo-1', cwd: '/Users/you/acme-shop' },
  { sid: 'demo-2', cwd: '/Users/you/acme-api' },
  { sid: 'demo-3', cwd: '/Users/you/acme-docs' },
]
const MODEL = 'claude-sonnet-5'
let opened = 0
const cost: Record<string, number> = { 'demo-1': 0, 'demo-2': 0, 'demo-3': 0 }
const pending: Record<string, () => void> = {}
let cliOpen: ((r: { req: string; cwd?: string }) => void) | null = null

async function stream(sid: string, text: string, ms = 18) {
  for (const word of text.match(/\S+\s*/g) ?? []) {
    emit(sid, { kind: 'delta', text: word })
    await wait(ms)
  }
}

function turn(sid: string, add: number, inputTokens: number, outputTokens: number, cacheRead: number) {
  cost[sid] = Math.round((cost[sid]! + add) * 10000) / 10000
  emit(sid, { kind: 'turn', costUsd: cost[sid]!, inputTokens, outputTokens, cacheRead, cacheWrite: Math.round(inputTokens / 3), isError: false, text: '', durationMs: 14000, cacheTtlMs: 300000 })
}

// the cost moves while a turn runs: each step reports what it used so far, as the HUD shows it
async function tick(sid: string, steps: number, each: number, ms: number) {
  for (let i = 0; i < steps; i++) {
    await wait(ms)
    turn(sid, each, 8000 + i * 2100, 90 * (i + 1), 30000 + i * 3000)
  }
}

const diff = {
  id: 'edit-1',
  tool: 'Edit',
  file: '/Users/you/acme-shop/src/cart.ts',
  added: 3,
  removed: 2,
  isNew: false,
  lines: [
    { op: ' ' as const, text: 'export function cartTotal(items: Item[], coupon?: Coupon): number {' },
    { op: '-' as const, text: '  const subtotal = items.reduce((s, i) => s + i.price, 0)' },
    { op: '-' as const, text: '  return coupon ? subtotal - coupon.amount : subtotal' },
    { op: '+' as const, text: '  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0)' },
    { op: '+' as const, text: '  const off = coupon ? Math.min(coupon.amount, subtotal) : 0' },
    { op: '+' as const, text: '  return Math.round((subtotal - off) * 100) / 100' },
    { op: ' ' as const, text: '}' },
  ],
}

async function history(sid: string, prompt: string, reply: string, add: number) {
  emit(sid, { kind: 'ready', sessionId: `${sid}-session`, model: MODEL, cwd: PROJECTS.find((p) => p.sid === sid)!.cwd })
  emit(sid, { kind: 'sent', text: prompt, at: Date.now() })
  await stream(sid, reply, 6)
  emit(sid, { kind: 'assistant', text: reply, tools: [] })
  turn(sid, add, 18200, 640, 41000)
  emit(sid, { kind: 'context', tokens: 59800, window: 200000, percent: 30 })
}

async function script() {
  await wait(600)
  cliOpen?.({ req: 'demo-2', cwd: PROJECTS[1]!.cwd })
  await wait(150)
  cliOpen?.({ req: 'demo-3', cwd: PROJECTS[2]!.cwd })
  await wait(300)
  void history('demo-2', 'Add rate limiting to POST /orders, 20 requests a minute per key.',
    'Done. `src/routes/orders.ts` now goes through a token bucket keyed on the API key (20 a minute, burst of 5), and a 429 says when to retry. I added two tests in `test/orders.test.ts`; the suite passes.', 0.21)
  void history('demo-3', 'Write the changelog entry for 2.4.0 from the merged PRs.',
    '## 2.4.0\n\n- Cart totals count quantities and never go below zero with a coupon.\n- `POST /orders` is rate limited (20 a minute per key).\n- The checkout page loads its fonts locally.', 0.09)

  const sid = 'demo-1'
  emit(sid, { kind: 'ready', sessionId: `${sid}-session`, model: MODEL, cwd: PROJECTS[0]!.cwd })
  await wait(500)
  emit(sid, { kind: 'sent', text: 'The cart total test fails. Find out why, fix it and run the tests.', at: Date.now() })
  await stream(sid, 'Reading `src/cart.ts` and the failing test first. ')
  emit(sid, { kind: 'assistant', text: 'Reading `src/cart.ts` and the failing test first.', tools: [{ id: 't1', name: 'Read', summary: 'src/cart.ts' }, { id: 't2', name: 'Read', summary: 'test/cart.test.ts' }] })
  await tick(sid, 3, 0.024, 350)
  await stream(sid, 'The total ignores `qty`, and a coupon larger than the subtotal makes it negative. Fixing both. ')
  emit(sid, { kind: 'assistant', text: 'The total ignores `qty`, and a coupon larger than the subtotal makes it negative. Fixing both.', tools: [{ id: 't3', name: 'Edit', summary: 'src/cart.ts' }] })
  emit(sid, { kind: 'edit', edit: diff })
  await tick(sid, 3, 0.03, 350)
  emit(sid, { kind: 'context', tokens: 42100, window: 200000, percent: 21 })
  await stream(sid, 'Now the tests. ')
  emit(sid, { kind: 'permission', id: 'ask-1', tool: 'Bash', summary: 'npm test', risk: { level: 'ask', why: 'runs a command in your project' }, why: 'a command that runs code in your project', cls: 'write' })
  await new Promise<void>((r) => (pending['ask-1'] = r))
}

async function afterAllow(sid: string, allow: boolean) {
  emit(sid, { kind: 'answered', id: 'ask-1' })
  if (!allow) {
    emit(sid, { kind: 'assistant', text: 'Not running it. The fix is in `src/cart.ts`; run `npm test` when you want.', tools: [] })
    turn(sid, 0.03, 24100, 410, 38000)
    return
  }
  emit(sid, { kind: 'assistant', text: 'Now the tests.', tools: [{ id: 't4', name: 'Bash', summary: 'npm test' }] })
  await tick(sid, 3, 0.02, 400)
  const reply = 'All 42 tests pass, including the two cart cases that failed (quantity 3, and a $15 coupon on a $10 cart). The change is 3 lines in `src/cart.ts`, shown in Changes.'
  await stream(sid, reply)
  emit(sid, { kind: 'assistant', text: reply, tools: [] })
  turn(sid, 0.05, 31800, 1120, 52300)
  emit(sid, { kind: 'context', tokens: 51200, window: 200000, percent: 26 })
}

async function reply(sid: string, text: string) {
  const r = `This is the demo, so nothing runs here: no model, no files, no network. In the app this panel would send "${text.slice(0, 80)}" to Claude Code in \`${PROJECTS.find((p) => p.sid === sid)?.cwd ?? 'your project'}\`. Download it to try it on your own code.`
  await stream(sid, r, 22)
  emit(sid, { kind: 'assistant', text: r, tools: [] })
  turn(sid, 0.01, 9000, 120, 30000)
}

// answers for the calls a screen needs a shape from; anything else gets an empty value
const known = {
  newSession: async () => {
    const p = PROJECTS[Math.min(opened++, PROJECTS.length - 1)]!
    if (opened === 1) setTimeout(() => void script(), 0)
    return { sid: opened > PROJECTS.length ? `demo-${opened}` : p.sid, cwd: p.cwd, missing: [] }
  },
  onEvent: (fn: Listener) => {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  answer: async (sid: string, id: string, allow: boolean) => {
    if (id === 'ask-1' && pending[id]) {
      pending[id]!()
      delete pending[id]
      void afterAllow(sid, allow)
    }
  },
  send: async (sid: string, text: string) => void reply(sid, text),
  stmCli: {
    onOpen: (fn: typeof cliOpen) => {
      cliOpen = fn
      return () => (cliOpen = null)
    },
    opened: () => undefined,
    install: async () => ({ file: '', onPath: false, hint: 'Not in the demo.' }),
  },
  existing: async () => [],
  pathOf: () => '',
  closeReady: () => undefined,
  diag: { renderer: () => undefined },
  openUrl: async () => undefined,
  countTokens: async (text: string) => ({ tokens: Math.ceil(text.length / 4), exact: false }),
  timeGet: async () => ({}),
  findRepos: async () => ({ home: '/Users/you', repos: PROJECTS.map((p) => p.cwd) }),
  pickFolder: async () => null,
  deeplink: { pending: async () => null, on: () => () => undefined },
  pr: { inbox: async () => ({ review: [], mine: [] }) },
  pickFiles: async () => [],
  attachPaths: async () => [],
  filePick: {
    list: async () => ({ ok: true, entries: [], truncated: false }),
    project: async () => ({ ok: true, entries: [], truncated: false }),
    recent: async () => ({ entries: [], denied: [], home: '' }),
    thumb: async () => null,
  },
  isDir: async () => false,
}

// An empty answer: an empty list that also reads as an object with nothing set, so `r.map(...)`,
// `r.length` and `r.available` all work and say "nothing"; a plural field (`r.items`) is another empty
// answer. `onX` subscriptions get an unsubscribe.
const hollow = (): unknown =>
  new Proxy([], {
    get(t, key) {
      if (typeof key === 'symbol' || key in t) return Reflect.get(t, key)
      return /[^su]s$/.test(key) ? hollow() : undefined
    },
  })
function fallback(path: string[]): unknown {
  const name = path[path.length - 1] ?? ''
  if (/^on([A-Z]|$)/.test(name)) return () => () => undefined
  return async () => hollow()
}

function deep(path: string[], base: Record<string, unknown> | undefined): unknown {
  const fn = fallback(path) as (...a: unknown[]) => unknown
  return new Proxy(fn, {
    get(_t, key) {
      if (typeof key === 'symbol' || key === 'then') return undefined
      const v = base?.[key]
      if (v !== undefined && (typeof v === 'function' || typeof v !== 'object')) return v
      return deep([...path, key], v as Record<string, unknown> | undefined)
    },
    apply(_t, _this, args) {
      return fn(...args)
    },
  })
}

window.stm = deep([], known as unknown as Record<string, unknown>) as Bridge
