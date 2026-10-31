// The ui_* tools of the stm MCP server: a panel's Claude drives the window. Visual changes (layout,
// arrange, fit, list, links the person leaves waiting) apply at once; opening panels starts sessions that
// cost tokens, so the window shows one sheet with the list and nothing opens until the person presses Allow.
import { tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { listPanels, type WinPanel } from '../shared/uitools.js'
import { planDelegation, summarizeResult, taskTitle, type Result, type WorkerInfo } from '../shared/lead.js'
import { checkArrange, checkLayout, checkLinks, checkOpen, layoutSchema, linkSpecSchema, MAX_LINKS, MAX_OPEN, panelSpecSchema, type LinkSpec, type PanelSpec, type UiLayout } from '../shared/uitools.js'

export const UI_TOOLS = ['ui_set_layout', 'ui_open_panels', 'ui_link_panels', 'ui_arrange', 'ui_list_panels', 'delegate', 'collect', 'channel_post', 'channel_read', 'channel_mentions'].map((n) => `mcp__stm__${n}`)

export type UiPanel = { id: string; folder: string; name: string; persona: string | null }
export type UiLink = { a: string; b: string; auto: boolean }
export type UiDeps = {
  /** the panel whose Claude is calling */
  me: string
  panels: () => UiPanel[]
  links: () => UiLink[]
  /** draw (or update) a link; auto true sends messages without the person pressing send */
  link: (a: string, b: string, auto: boolean) => void
  /** the window applies a visual change and answers; layout also tells which layout is on */
  cmd: (op: 'layout' | 'arrange' | 'state', arg?: string) => Promise<{ layout: UiLayout; panels?: WinPanel[] }>
  /** the folder as the stm CLI resolves it, relative to the caller's panel; throws when it is not a folder */
  folder: (raw: string) => string
  /** throws with a reason when the model or persona is not known */
  known: (p: PanelSpec) => void
  /** how many more panels this one may start within the hour */
  spawnLeft: () => number
  /** one confirm sheet; true only on Allow */
  confirm: (items: { folder: string; title?: string; persona?: string; model?: string }[]) => Promise<boolean>
  /** counts the spawn against the limit, opens the panel, returns its id */
  open: (p: PanelSpec & { folder: string }) => Promise<string>
  log: (msg: string) => void
  /** the team channel of the calling panel's team; every call throws a clear error when the panel is in no team */
  channel?: {
    /** @handles of the team, to mention */
    handles: () => string[]
    post: (kind: 'handoff' | 'question' | 'review' | 'result' | 'note', text: string, replyTo?: string) => Promise<{ id: string; wakes: string[] }>
    /** lines of the newest posts after `since` (epoch ms), at most `limit` */
    read: (since?: number, limit?: number) => string[]
    /** lines of the posts that mention the caller; unreadOnly marks them read */
    mentions: (unreadOnly: boolean) => string[]
  }
  /** the lead panel's side; absent in tests of the other tools */
  lead?: {
    leads: () => Set<string>
    /** every open panel with its lead (if a worker) and whether it is busy */
    workers: () => WorkerInfo[]
    /** the same checks as a typed message (secrets, budget, rate); throws with a reason */
    send: (worker: string, task: string) => Promise<void>
    /** makes `lead` a lead and each panel its worker (no task yet); the window shows the marks and fans them on the canvas */
    team?: (lead: string, workers: { id: string; title: string }[]) => void
    /** records the worker's task and draws the edge */
    adopt: (worker: string, title: string, task: string) => void
    /** waits until each worker is done or blocked; results as they stand when the time is up */
    wait: (ids: string[], wait: boolean) => Promise<Result[]>
    owns: (worker: string) => boolean
    /** opens a worker in a worktree */
    openTree: (p: PanelSpec & { folder: string }) => Promise<string>
  }
}

const text = (t: string, isError = false) => ({ content: [{ type: 'text' as const, text: t }], ...(isError ? { isError: true } : {}) })

export function uiTools(d: UiDeps) {
  const fail = (m: string) => (d.log(`refused: ${m}`), text(m, true))
  return [
    tool(
      'ui_set_layout',
      'Switch the window layout of the panels now: auto, grid, columns (alias row) or canvas. Use it when the person asks to see the panels as a grid, in columns or on a canvas.',
      { layout: layoutSchema },
      async ({ layout }) => {
        const l = checkLayout(layout)
        if (!l.ok) return fail(l.error)
        await d.cmd('layout', l.value)
        d.log(`layout ${l.value}`)
        return text(`Layout is now ${l.value}.`)
      },
    ),
    tool(
      'ui_open_panels',
      `Open new Claude panels, one per folder, when the person asks for panels ("open a canvas with 3 panels in X, Y, Z"): do this instead of explaining how. Up to ${MAX_OPEN} at once. Each starts a new Claude session that costs tokens, so the window shows the person one sheet listing them, and nothing opens until they press Allow. Folders must exist (relative paths are from this panel's folder). Optional layout (for example canvas) is applied after they open. Give each panel a title: it is the panel's name in its header. For "an orchestrator (lead) with N workers", pass lead: "self" (this panel leads; do not open a panel for the lead) or the id of an open panel, and open only the workers: each is linked to the lead (mode waits), marked Lead/Worker, and on the canvas fanned to the lead's right. Returns the new panel ids. Subject to the spawn limit per hour.`,
      { panels: z.array(panelSpecSchema), layout: layoutSchema.optional(), lead: z.string().max(64).optional() },
      async (a) => {
        const c = checkOpen(a)
        if (!c.ok) return fail(c.error)
        const items: (PanelSpec & { folder: string })[] = []
        try {
          for (const p of c.value.panels) {
            d.known(p)
            items.push({ ...p, folder: d.folder(p.folder) })
          }
        } catch (e) {
          return fail((e as Error).message)
        }
        const lead = c.value.lead === 'self' ? d.me : c.value.lead
        if (lead) {
          if (!d.lead?.team) return fail('Lead and workers are not available here.')
          if (!d.panels().some((p) => p.id === lead)) return fail(`No panel "${lead}" to lead. Use "self" or an id from ui_list_panels.`)
          if (d.lead.workers().find((w) => w.id === lead)?.lead) return fail(`${lead} is a worker; a worker cannot be the lead.`)
        }
        const left = d.spawnLeft()
        if (items.length > left) return fail(`Rate limit: this panel may start ${left} more panel${left === 1 ? '' : 's'} this hour and ${items.length} were asked for. Ask for fewer, or the person can raise stmLimits.spawnPerHour.`)
        if (!(await d.confirm(items))) return fail('The person did not allow opening the panels. Nothing was opened.')
        const ids: string[] = []
        try {
          for (const p of items) ids.push(await d.open(p))
        } catch (e) {
          return fail(`Opened ${ids.length} of ${items.length}${ids.length ? ` (${ids.join(', ')})` : ''}; then: ${(e as Error).message}`)
        }
        if (lead) {
          for (const id of ids) d.link(lead, id, false)
          d.lead!.team!(lead, ids.map((id, i) => ({ id, title: items[i]!.title?.trim() || `Worker ${i + 1}` })))
        }
        if (c.value.layout) await d.cmd('layout', c.value.layout).catch(() => undefined)
        if (lead && c.value.layout === 'canvas') await d.cmd('arrange', 'fan').catch(() => undefined)
        d.log(`opened ${ids.join(', ')}${lead ? ` as workers of ${lead}` : ''}`)
        return text(`Opened ${ids.length} panel${ids.length === 1 ? '' : 's'}: ${ids.map((id, i) => `${id} "${items[i]!.title?.trim() || items[i]!.folder}" (${items[i]!.folder})`).join(', ')}.${lead ? ` ${lead === d.me ? 'This panel' : lead} is their lead, linked to each (waits).` : ''}${c.value.layout ? ` Layout: ${c.value.layout}.` : ''}`)
      },
    ),
    tool(
      'ui_link_panels',
      `Draw links between open panels (shown on the canvas). Up to ${MAX_LINKS}. from and to are panel ids from ui_list_panels or ui_open_panels. mode "waits" leaves messages in the composer for the person to send; mode "auto" sends them without anyone pressing send, so the window asks the person first.`,
      { links: z.array(linkSpecSchema) },
      async ({ links }) => {
        const known = new Set(d.panels().map((p) => p.id))
        const c = checkLinks(links, known)
        if (!c.ok) return fail(c.error)
        const wantsAuto = c.value.filter((l) => l.mode === 'auto')
        let allowAuto = true
        if (wantsAuto.length) {
          const name = (id: string) => d.panels().find((p) => p.id === id)?.name ?? id
          allowAuto = await d.confirm(wantsAuto.map((l) => ({ folder: `${name(l.from)} and ${name(l.to)}`, title: 'Auto link: messages between them are sent without you pressing send' })))
        }
        const done: string[] = []
        for (const l of c.value as LinkSpec[]) {
          const auto = l.mode === 'auto' && allowAuto
          d.link(l.from, l.to, auto)
          done.push(`${l.from}-${l.to} ${auto ? 'auto' : 'waits'}`)
        }
        d.log(`linked ${done.join(', ')}`)
        return text(`Linked ${done.join(', ')}.${wantsAuto.length && !allowAuto ? ' Auto was not allowed, so those links wait for the person to send.' : ''}`)
      },
    ),
    tool(
      'ui_arrange',
      'Arrange the canvas cards now: fit (frame every card), row, column, grid, or fan (each lead on the left, its workers fanned to its right). Switches the window to the canvas layout if it is not on it.',
      { mode: z.string().min(1).max(20) },
      async ({ mode }) => {
        const m = checkArrange(mode)
        if (!m.ok) return fail(m.error)
        await d.cmd('arrange', m.value)
        d.log(`arrange ${m.value}`)
        return text(`Canvas arranged: ${m.value}.`)
      },
    ),
    tool(
      'ui_list_panels',
      'The open panels with their ids, folders, titles, personas and links, and the current layout. Call it before linking panels.',
      {},
      async () => {
        const st = await d.cmd('state')
        const links = d.links()
        const leads = d.lead?.leads() ?? new Set<string>()
        const ws = d.lead?.workers() ?? []
        const ps = listPanels(d.panels(), st.panels, (id) => (leads.has(id) ? 'lead' : ws.find((w) => w.id === id)?.lead ? 'worker' : ''))
        const lines = ps.map((p) => `${p.id}: ${p.name}${p.role ? ` (${p.role})` : ''}${p.persona ? ` [${p.persona}]` : ''} at ${p.folder || 'no folder yet'}; ${p.state}${links.filter((l) => l.a === p.id || l.b === p.id).length ? `; linked to ${links.filter((l) => l.a === p.id || l.b === p.id).map((l) => `${l.a === p.id ? l.b : l.a} (${l.auto ? 'auto' : 'waits'})`).join(', ')}` : ''}`)
        return text(`Layout: ${st.layout}. ${ps.length} panel${ps.length === 1 ? '' : 's'}${lines.length ? `:\n${lines.join('\n')}` : '.'}`)
      },
      { annotations: { readOnlyHint: true } },
    ),
    tool(
      'delegate',
      'Lead panel only. Give one task to a worker panel: it opens a worker (the person confirms in a sheet first) or reuses an idle worker you own in that folder, links it to you, sends the task and returns the worker id. Use it when the person asks to split work, coordinate panels or orquestrar; then call collect. The task must be complete on its own: the worker has no memory of this chat. Default folder is yours. worktree true gives the worker its own branch so it never edits the same files as another worker. Subject to the spawn limit and the budget.',
      { task: z.string().min(1).max(20000), folder: z.string().max(1000).optional(), persona: z.string().max(64).optional(), model: z.string().max(100).optional(), worktree: z.boolean().optional(), title: z.string().max(80).optional() },
      async (a) => {
        const L = d.lead
        if (!L) return fail('Delegation is not available here.')
        const me = d.panels().find((p) => p.id === d.me)
        let folder: string | undefined
        try {
          folder = a.folder ? d.folder(a.folder) : undefined
        } catch (e) {
          return fail((e as Error).message)
        }
        const plan = planDelegation({ lead: d.me, leadFolder: me?.folder ?? '', folder, worktree: a.worktree, panels: L.workers(), leads: L.leads() })
        if (plan.kind === 'refuse') return fail(plan.reason)
        const title = a.title?.trim() || taskTitle(a.task)
        try {
          let id: string
          if (plan.kind === 'reuse') id = plan.id
          else {
            const spec = { folder: plan.folder, title, persona: a.persona, model: a.model }
            d.known(spec)
            if (d.spawnLeft() < 1) return fail('Rate limit: this panel may not start more panels this hour. The person can raise stmLimits.spawnPerHour.')
            if (!(await d.confirm([{ folder: plan.folder, title: `Worker: ${title}`, persona: a.persona, model: a.model }]))) return fail('The person did not allow opening the worker. Nothing was opened.')
            id = a.worktree ? await L.openTree(spec) : await d.open(spec)
          }
          d.link(d.me, id, false)
          L.adopt(id, title, a.task)
          await L.send(id, a.task)
          d.log(`delegated to ${id}`)
          return text(`Delegated to ${id} (${plan.kind === 'reuse' ? 'reused' : 'opened'}). Call collect with this id when you have nothing else to do.`)
        } catch (e) {
          return fail((e as Error).message)
        }
      },
    ),
    tool(
      'channel_post',
      'Post to your team channel (the lead panel and its workers share one). kind is handoff (give work), question, review, result (what you finished) or note. Write @name to wake a teammate: a post by a worker wakes only linked panels, waits in their queue for the person unless the link is auto, and never goes past the send and link limits. Keep posts short; put long output in a file and name it.',
      { kind: z.enum(['handoff', 'question', 'review', 'result', 'note']), text: z.string().min(1).max(8000), replyTo: z.string().max(64).optional() },
      async ({ kind, text: body, replyTo }) => {
        const C = d.channel
        if (!C) return fail('The team channel is not available here.')
        try {
          const r = await C.post(kind, body, replyTo)
          d.log(`channel post ${r.id}`)
          return text(`Posted ${r.id} to the team channel.${r.wakes.length ? ` Mentions: ${r.wakes.join('; ')}.` : ''}`)
        } catch (e) {
          return fail((e as Error).message)
        }
      },
    ),
    tool(
      'channel_read',
      'Read the newest posts of your team channel (up to 50, each cut to 2000 characters). since is an epoch time in milliseconds to read only newer posts.',
      { since: z.number().int().min(0).optional(), limit: z.number().int().min(1).max(50).optional() },
      async ({ since, limit }) => {
        const C = d.channel
        if (!C) return fail('The team channel is not available here.')
        try {
          const lines = C.read(since, limit)
          return text(lines.length ? lines.join('\n') : 'No posts yet.')
        } catch (e) {
          return fail((e as Error).message)
        }
      },
      { annotations: { readOnlyHint: true } },
    ),
    tool(
      'channel_mentions',
      'Posts in your team channel that mention you. By default only the ones you have not read; they are marked read.',
      { unreadOnly: z.boolean().optional() },
      async ({ unreadOnly }) => {
        const C = d.channel
        if (!C) return fail('The team channel is not available here.')
        try {
          const lines = C.mentions(unreadOnly !== false)
          return text(lines.length ? lines.join('\n') : 'No mentions.')
        } catch (e) {
          return fail((e as Error).message)
        }
      },
    ),
    tool(
      'collect',
      'Lead panel only. Wait until each worker is done or blocked and return its final answer, the files it changed and its cost. Pass the ids delegate returned. wait false returns what is ready now without waiting.',
      { ids: z.array(z.string().min(1).max(64)).min(1).max(8), wait: z.boolean().optional() },
      async ({ ids, wait }) => {
        const L = d.lead
        if (!L || !L.leads().has(d.me)) return fail('Only the lead panel collects.')
        const bad = ids.find((i) => !L.owns(i))
        if (bad) return fail(`${bad} is not one of your workers.`)
        const rs = await L.wait(ids, wait !== false)
        return text(rs.map((r) => summarizeResult(r)).join('\n\n'))
      },
    ),
  ]
}

