// Input validation for the agent browser's tools (`mcp__stm__browser_<tool>`). Pure, no zod, no electron.
// Every input is checked field by field; unknown fields and unknown tools are refused. An element index
// is only valid for the element list it came from: the caller passes the current list revision and count,
// and a call that names another revision fails with "call elements again".

export const BROWSER_TOOLS = [
  'open', 'steps', 'takeover', 'read', 'elements', 'click', 'type', 'select', 'scroll', 'screenshot',
  'wait', 'back', 'forward', 'tab_new', 'tab_switch', 'tab_close', 'done',
] as const
export type BrowserTool = (typeof BROWSER_TOOLS)[number]

/** Tools a `steps` call may batch: they act on the elements of one list and return no new list. */
export const STEP_TOOLS: readonly BrowserTool[] = ['click', 'type', 'select', 'scroll', 'wait', 'back', 'forward']
export const MAX_STEPS = 10
export const TAKEOVER_REASONS = ['sign-in', 'captcha', 'passkey', 'payment', 'unclear'] as const
export type TakeoverReason = (typeof TAKEOVER_REASONS)[number]

const MCP_PREFIX = 'mcp__stm__browser_'
export const mcpName = (tool: BrowserTool): string => `${MCP_PREFIX}${tool}`
export const toolFromMcp = (name: string): BrowserTool | undefined => {
  if (!name.startsWith(MCP_PREFIX)) return undefined
  const t = name.slice(MCP_PREFIX.length)
  return (BROWSER_TOOLS as readonly string[]).includes(t) ? (t as BrowserTool) : undefined
}

/** What the caller knows about the page state. Index-based tools need `revision` and `count`. */
export type ActionContext = {
  /** revision of the element list the model last received, if any */
  revision?: number
  /** number of elements in that list */
  count?: number
  /** tab ids that are open */
  tabs?: number[]
}

export type StepAction =
  | { tool: 'click'; index: number }
  | { tool: 'type'; index: number; text: string; submit: boolean }
  | { tool: 'select'; index: number; value: string }
  | { tool: 'scroll'; direction: 'up' | 'down'; amount: 'page' | 'half' }
  | { tool: 'wait'; until: 'load' } | { tool: 'wait'; until: 'selector'; selector: string; timeoutMs?: number }
  | { tool: 'back' }
  | { tool: 'forward' }

export type BrowserAction =
  | { tool: 'open'; url: string; tab?: number }
  | { tool: 'steps'; tab: number; revision: number; actions: StepAction[] }
  | { tool: 'takeover'; reason: TakeoverReason }
  | { tool: 'read'; tab?: number; page: number }
  | { tool: 'elements'; tab?: number }
  | { tool: 'click'; tab: number; revision: number; index: number }
  | { tool: 'type'; tab: number; revision: number; index: number; text: string; submit: boolean }
  | { tool: 'select'; tab: number; revision: number; index: number; value: string }
  | { tool: 'scroll'; tab?: number; direction: 'up' | 'down'; amount: 'page' | 'half' }
  | { tool: 'screenshot'; tab?: number }
  | { tool: 'wait'; tab?: number; until: 'load' }
  | { tool: 'wait'; tab?: number; until: 'selector'; selector: string; timeoutMs?: number }
  | { tool: 'back'; tab?: number }
  | { tool: 'forward'; tab?: number }
  | { tool: 'tab_new'; url?: string }
  | { tool: 'tab_switch'; tab: number }
  | { tool: 'tab_close'; tab: number }
  | { tool: 'done'; summary: string }

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string }

const MAX_URL = 2048
const MAX_TEXT = 2000
const MAX_SELECTOR = 200
const MAX_SUMMARY = 4000

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

function unknownKey(input: Record<string, unknown>, allowed: string[]): string | undefined {
  return Object.keys(input).find((k) => !allowed.includes(k))
}

function intIn(v: unknown, min: number, max: number): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined
}

function textIn(v: unknown, min: number, max: number): string | undefined {
  return typeof v === 'string' && v.length >= min && v.length <= max ? v : undefined
}

function oneOf<T extends string>(v: unknown, list: readonly T[]): T | undefined {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : undefined
}

function checkUrl(v: unknown): string | undefined {
  const s = textIn(v, 1, MAX_URL)
  if (s === undefined) return undefined
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:' ? s : undefined
  } catch {
    return undefined
  }
}

/** A tab id, which must be open when the caller said which tabs are. */
function checkTab(v: unknown, ctx: ActionContext): number | undefined {
  const t = intIn(v, 1, 1_000_000)
  if (t === undefined) return undefined
  if (ctx.tabs && !ctx.tabs.includes(t)) return undefined
  return t
}

/** An element index into the list named by `revision`; stale or missing lists are refused. */
function checkIndex(revision: unknown, index: unknown, ctx: ActionContext): Checked<{ revision: number; index: number }> {
  if (ctx.revision === undefined) return fail('no element list yet: call elements first')
  if (revision !== ctx.revision) return fail('stale element list: call elements again')
  const i = intIn(index, 1, 100_000)
  if (i === undefined) return fail('index must be a whole number from the element list')
  if (ctx.count !== undefined && i > ctx.count) return fail(`no element ${i} in the last list`)
  return { ok: true, value: { revision: ctx.revision, index: i } }
}

const TAB_ERR = 'tab must be an open tab id'

/** Validates one tool call. `ctx` carries the revision, count and tabs the caller knows. */
export function validateAction(tool: unknown, input: unknown, ctx: ActionContext = {}): Checked<BrowserAction> {
  if (typeof tool !== 'string' || !(BROWSER_TOOLS as readonly string[]).includes(tool)) return fail(`unknown tool: ${String(tool)}`)
  if (!isObj(input)) return fail('input must be an object')
  const t = tool as BrowserTool
  const bad = (allowed: string[]) => {
    const k = unknownKey(input, allowed)
    return k === undefined ? undefined : fail(`unknown field: ${k}`)
  }
  switch (t) {
    case 'open': {
      const e = bad(['url', 'tab']); if (e) return e
      const url = checkUrl(input.url)
      if (!url) return fail('url must be an http or https address')
      if (input.tab === undefined) return { ok: true, value: { tool: 'open', url } }
      const tab = checkTab(input.tab, ctx)
      return tab === undefined ? fail(TAB_ERR) : { ok: true, value: { tool: 'open', url, tab } }
    }
    case 'steps': {
      const e = bad(['tab', 'revision', 'actions']); if (e) return e
      const tab = checkTab(input.tab, ctx)
      if (tab === undefined) return fail(TAB_ERR)
      if (ctx.revision === undefined) return fail('no element list yet: call elements first')
      if (input.revision !== ctx.revision) return fail('stale element list: call elements again')
      if (!Array.isArray(input.actions) || input.actions.length < 1 || input.actions.length > MAX_STEPS) {
        return fail(`actions must be a list of 1 to ${MAX_STEPS}`)
      }
      const actions: StepAction[] = []
      for (const [n, raw] of input.actions.entries()) {
        if (!isObj(raw)) return fail(`step ${n + 1}: must be an object`)
        if (typeof raw.tool !== 'string' || !(STEP_TOOLS as readonly string[]).includes(raw.tool)) {
          return fail(`step ${n + 1}: tool is not allowed in steps`)
        }
        if ('tab' in raw || 'revision' in raw) return fail(`step ${n + 1}: unknown field`)
        const { tool: name, ...fields } = raw
        const refs = name === 'click' || name === 'type' || name === 'select' ? { tab, revision: ctx.revision } : { tab }
        const r = validateAction(name, { ...fields, ...refs }, ctx)
        if (!r.ok) return fail(`step ${n + 1}: ${r.error}`)
        const { tab: _tab, revision: _rev, ...rest } = r.value as BrowserAction & { tab?: number; revision?: number }
        void _tab
        void _rev
        actions.push(rest as StepAction)
      }
      return { ok: true, value: { tool: 'steps', tab, revision: ctx.revision, actions } }
    }
    case 'takeover': {
      const e = bad(['reason']); if (e) return e
      const reason = oneOf(input.reason, TAKEOVER_REASONS)
      return reason ? { ok: true, value: { tool: 'takeover', reason } } : fail(`reason must be one of ${TAKEOVER_REASONS.join(', ')}`)
    }
    case 'read':
    case 'elements':
    case 'screenshot':
    case 'back':
    case 'forward': {
      const extra = t === 'read' ? ['page'] : []
      const e = bad(['tab', ...extra]); if (e) return e
      const tab = input.tab === undefined ? undefined : checkTab(input.tab, ctx)
      if (input.tab !== undefined && tab === undefined) return fail(TAB_ERR)
      if (t === 'read') {
        const page = input.page === undefined ? 1 : intIn(input.page, 1, 50)
        if (page === undefined) return fail('page must be a whole number from 1 to 50')
        return { ok: true, value: { tool: 'read', page, ...(tab === undefined ? {} : { tab }) } }
      }
      return { ok: true, value: { tool: t, ...(tab === undefined ? {} : { tab }) } as BrowserAction }
    }
    case 'click': {
      const e = bad(['tab', 'revision', 'index']); if (e) return e
      const tab = checkTab(input.tab, ctx)
      if (tab === undefined) return fail(TAB_ERR)
      const ref = checkIndex(input.revision, input.index, ctx)
      return ref.ok ? { ok: true, value: { tool: 'click', tab, ...ref.value } } : ref
    }
    case 'type': {
      const e = bad(['tab', 'revision', 'index', 'text', 'submit']); if (e) return e
      const tab = checkTab(input.tab, ctx)
      if (tab === undefined) return fail(TAB_ERR)
      const text = textIn(input.text, 0, MAX_TEXT)
      if (text === undefined) return fail(`text must be up to ${MAX_TEXT} characters`)
      if (input.submit !== undefined && typeof input.submit !== 'boolean') return fail('submit must be true or false')
      const ref = checkIndex(input.revision, input.index, ctx)
      return ref.ok ? { ok: true, value: { tool: 'type', tab, ...ref.value, text, submit: input.submit === true } } : ref
    }
    case 'select': {
      const e = bad(['tab', 'revision', 'index', 'value']); if (e) return e
      const tab = checkTab(input.tab, ctx)
      if (tab === undefined) return fail(TAB_ERR)
      const value = textIn(input.value, 1, 200)
      if (value === undefined) return fail('value must be 1 to 200 characters')
      const ref = checkIndex(input.revision, input.index, ctx)
      return ref.ok ? { ok: true, value: { tool: 'select', tab, ...ref.value, value } } : ref
    }
    case 'scroll': {
      const e = bad(['tab', 'direction', 'amount']); if (e) return e
      const tab = input.tab === undefined ? undefined : checkTab(input.tab, ctx)
      if (input.tab !== undefined && tab === undefined) return fail(TAB_ERR)
      const direction = oneOf(input.direction, ['up', 'down'] as const)
      if (!direction) return fail('direction must be up or down')
      const amount = input.amount === undefined ? 'page' : oneOf(input.amount, ['page', 'half'] as const)
      if (!amount) return fail('amount must be page or half')
      return { ok: true, value: { tool: 'scroll', ...(tab === undefined ? {} : { tab }), direction, amount } }
    }
    case 'wait': {
      const e = bad(['tab', 'until', 'selector', 'timeoutMs']); if (e) return e
      const tab = input.tab === undefined ? undefined : checkTab(input.tab, ctx)
      if (input.tab !== undefined && tab === undefined) return fail(TAB_ERR)
      const until = oneOf(input.until, ['load', 'selector'] as const)
      if (!until) return fail('until must be load or selector')
      const at = tab === undefined ? {} : { tab }
      if (until === 'load') {
        if (input.selector !== undefined || input.timeoutMs !== undefined) return fail('load takes no selector or timeout')
        return { ok: true, value: { tool: 'wait', ...at, until } }
      }
      const selector = textIn(input.selector, 1, MAX_SELECTOR)
      if (selector === undefined) return fail(`selector must be 1 to ${MAX_SELECTOR} characters`)
      const timeoutMs = input.timeoutMs === undefined ? undefined : intIn(input.timeoutMs, 100, 30_000)
      if (input.timeoutMs !== undefined && timeoutMs === undefined) return fail('timeoutMs must be 100 to 30000')
      return { ok: true, value: { tool: 'wait', ...at, until, selector, ...(timeoutMs === undefined ? {} : { timeoutMs }) } }
    }
    case 'tab_new': {
      const e = bad(['url']); if (e) return e
      if (input.url === undefined) return { ok: true, value: { tool: 'tab_new' } }
      const url = checkUrl(input.url)
      return url ? { ok: true, value: { tool: 'tab_new', url } } : fail('url must be an http or https address')
    }
    case 'tab_switch':
    case 'tab_close': {
      const e = bad(['tab']); if (e) return e
      const tab = checkTab(input.tab, ctx)
      return tab === undefined ? fail(TAB_ERR) : { ok: true, value: { tool: t, tab } }
    }
    case 'done': {
      const e = bad(['summary']); if (e) return e
      const summary = textIn(input.summary, 1, MAX_SUMMARY)
      return summary === undefined ? fail(`summary must be 1 to ${MAX_SUMMARY} characters`) : { ok: true, value: { tool: 'done', summary } }
    }
  }
}
