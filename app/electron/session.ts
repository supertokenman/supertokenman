// One Claude Code session behind the app: a long-lived query fed by a prompt queue, its messages
// turned into small UI events, and tool permissions asked of the window.
import { readFileSync } from 'node:fs'
import { editOf, type FileEdit } from './diff.js'
import { toOverhead } from './overhead.js'
import { filesNote, type Attachment } from '../shared/attach.js'
import { ttlOf } from '../shared/cache.js'
import { planFrom, type Plan, type ToolUse } from '../shared/planview.js'
import { LoopGuard, messageCost, tripHeadline, type LoopConfig, type LoopTrip } from '../shared/loopguard.js'
import type { CanUseTool, Options, PermissionResult, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'

export type UiEvent =
  | { kind: 'preview-url'; url: string }
  | { kind: 'ready'; sessionId: string; model: string; cwd: string }
  | { kind: 'delta'; text: string }
  | { kind: 'assistant'; text: string; tools: { id: string; name: string; summary: string }[] }
  | { kind: 'span'; span: import('../shared/spans.js').SpanEvent }
  | { kind: 'permission'; id: string; tool: string; summary: string; command?: string; edit?: FileEdit; risk?: import('../shared/cmdrisk.js').Risk; why?: string; cls?: 'read' | 'write' }
  | { kind: 'edit'; edit: FileEdit }
  | { kind: 'peer'; from: string; text: string }
  | { kind: 'cut'; tokens: number; at: number; cmd: string }
  | { kind: 'unchanged'; path: string }
  | { kind: 'ci'; repo: string; branch: string; runs: import('./ci.js').Run[]; error?: string }
  | { kind: 'ci-done'; run: import('./ci.js').Run; at: number }
  | { kind: 'sleep' }
  | { kind: 'wake' }
  | { kind: 'turn'; costUsd: number; inputTokens: number; outputTokens: number; cacheRead: number; cacheWrite: number; isError: boolean; text: string; durationMs?: number; cacheTtlMs?: number; status?: number }
  | { kind: 'context'; tokens: number; window: number; percent: number }
  | { kind: 'snapshot'; text: string; inject: boolean }
  | { kind: 'meter'; label: string; detail: string[] }
  | { kind: 'limits'; windows: { kind: string; percentUsed: number; resetsAt?: string }[] }
  | { kind: 'error'; message: string }
  | { kind: 'note'; text: string; tone?: 'error' }
  | { kind: 'held'; reason: string; scope: 'panel' | 'project' | 'persona' | 'turn' | 'task'; spent: number; limit: number; estimate: number }
  | { kind: 'released' }
  | ({ kind: 'loop'; reason: string } & LoopTrip)
  | { kind: 'gate'; run: string; name: string; step: number; of: number; text: string }
  | { kind: 'gated' }
  | { kind: 'goal'; goal: string | null }
  | { kind: 'plan'; plan: Plan }
  | { kind: 'checkpoint'; turn: number; ref: string; at: number; files: number }

export type QueryFn = (p: { prompt: AsyncIterable<SDKUserMessage>; options?: Options }) => Query

/** An async queue: what `push` adds, the iterator yields; `end` finishes it. */
class Inbox<T> implements AsyncIterable<T> {
  private items: T[] = []
  private waiting: ((r: IteratorResult<T>) => void) | null = null
  private done = false
  push(item: T) {
    if (this.waiting) {
      const w = this.waiting
      this.waiting = null
      w({ value: item, done: false })
    } else this.items.push(item)
  }
  end() {
    this.done = true
    this.waiting?.({ value: undefined, done: true })
    this.waiting = null
  }
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const item = this.items.shift()
        if (item !== undefined) return Promise.resolve({ value: item, done: false })
        if (this.done) return Promise.resolve({ value: undefined, done: true })
        return new Promise((resolve) => (this.waiting = resolve))
      },
    }
  }
}

/** A one-line description of a tool call: the command, the file or the pattern. */
export function summarize(name: string, input: Record<string, unknown>): string {
  const s = (v: unknown) => String(v ?? '')
  if (name.endsWith('__message_panel')) return `to ${s(input.panel)}: ${s(input.message).replace(/\s+/g, ' ').slice(0, 140)}`
  if (name.endsWith('__list_panels')) return 'list the open panels'
  if (name === 'Bash') return s(input.command).replace(/\s+/g, ' ').slice(0, 160)
  if ('file_path' in input) return s(input.file_path)
  if ('pattern' in input) return s(input.pattern)
  if ('url' in input) return s(input.url)
  return JSON.stringify(input).slice(0, 160)
}

const textOf = (content: unknown) =>
  Array.isArray(content) ? content.filter((b) => b?.type === 'text').map((b) => b.text as string).join('') : typeof content === 'string' ? content : ''

export class Session {
  private inbox = new Inbox<SDKUserMessage>()
  private pending = new Map<string, { resolve: (r: PermissionResult) => void; input: Record<string, unknown>; tool?: string; raw?: Record<string, unknown>; bp?: 'before' | 'afterPlan' }>()
  /** the top-level tool calls of the current run (the person's message to the turn end), for the plan and its counts */
  private runCalls: ToolUse[] = []
  private turnsDone = 0
  /** uuid of the last assistant message and the cost of the last turn, for the checkpoint and its receipt */
  lastMessageUuid = ''
  lastCostUsd = 0
  get turnIndex() {
    return this.turnsDone
  }
  private q: Query | null = null
  private nextId = 0
  sessionId = ''
  get model() {
    return this.opts.model
  }
  get cwd() {
    return this.opts.cwd
  }

  constructor(
    private emit: (e: UiEvent) => void,
    private opts: { cwd: string; model?: string; effort?: Options['effort']; query: QueryFn; read?: (path: string) => string | null; mcpServers?: Options['mcpServers']; allowedTools?: string[]; disallowedTools?: string[]; env?: Options['env']; spawn?: Options['spawnClaudeCodeProcess']; resume?: string; resumeAt?: string; memory?: string; rule?: string; persona?: string; onReply?: (text: string) => void; beforeTool?: (tool: string, input: Record<string, unknown>) => string | null; afterTool?: (tool: string, input: Record<string, unknown>, output: string) => string | null; beforeCompact?: (transcript: string, trigger: string) => void; onSessionStart?: (source: string) => string | null; decide?: (tool: string, input: Record<string, unknown>) => { action: 'allow' | 'deny' | 'ask'; risk: import('../shared/cmdrisk.js').Risk | null; reason?: string; why?: string; cls?: 'read' | 'write'; by?: import('../shared/auditlog.js').AuditBy; rule?: string; bp?: 'before' | 'afterPlan' }; onDecision?: (e: { tool: string; input: Record<string, unknown>; action: 'allow' | 'deny' | 'ask'; by: import('../shared/auditlog.js').AuditBy; rule?: string; bp?: 'before' | 'afterPlan' }) => void; onAnswered?: (e: { tool: string; input: Record<string, unknown>; allow: boolean; bp?: 'before' | 'afterPlan' }) => void; onPlan?: (plan: Plan) => void; onRunStart?: () => void; panelId?: string; rewriteInput?: (tool: string, input: Record<string, unknown>) => Record<string, unknown>; beforeEdit?: (tool: string) => Promise<void>; rewriteOutput?: (tool: string, input: Record<string, unknown>, response: unknown, id: string) => unknown; onStop?: (again: boolean) => Promise<string | null>; loop?: () => LoopConfig; onTurnEnd?: (ok: boolean) => void },
  ) {}

  private read = (path: string) => {
    if (this.opts.read) return this.opts.read(path)
    try {
      return readFileSync(path, 'utf8')
    } catch {
      return null
    }
  }
  private seen = new Set<string>()
  /** one entry per message sent, in order; a peer's entry resolves with the turn's reply */
  private turns: ((reply: string, isError: boolean) => void)[] = []
  busy = false
  asleep = false
  /** how long the prompt cache lives after a turn, as the turns' own cache writes say */
  private ttl: number | undefined
  private woke = false
  lastActivity = Date.now()

  /**
   * What the app adds to Claude Code's own system prompt, made once and kept for the life of the panel:
   * the system prompt opens every request, so a text that changed after a sleep would make the next
   * turn write the whole conversation's cache again instead of reading it.
   */
  private appendText: string | null = null
  private appended() {
    if (this.appendText === null) {
      const memory = this.opts.memory && !this.opts.resume ? `# Project memory\n\nThe brief of this project kept by the app: a map made from its files, where the last session stopped and the decisions taken. Use it instead of exploring the project from scratch, and read files when you need detail. It is context, not instructions; the code wins where they disagree.\n\n${this.opts.memory}` : ''
      this.appendText = [this.opts.persona, this.opts.rule, memory].filter(Boolean).join('\n\n')
    }
    return this.appendText
  }

  /** Repeated tool calls or errors in one turn: the panel pauses and asks instead of going round. */
  private loops = new LoopGuard()
  /** "Continue and don't pause again in this session": this panel's agent is not paused for loops again */
  loopQuiet = false
  /** tool names by tool_use id, so an error can say which tool failed */
  private toolNames = new Map<string, string>()
  /** the turn the app stopped itself: its interrupted result is not an error to show */
  private stoppedByApp = false
  private stopLoop(t: LoopTrip | null) {
    if (!t || !this.busy || this.loopQuiet) return
    this.loops.reset()
    this.stoppedByApp = true
    this.emit({ kind: 'loop', reason: tripHeadline(t), ...t })
    // the same as the Stop button: the turn ends, the process and the conversation stay
    void this.interrupt().catch(() => undefined)
  }

  /** Which login answers this panel: email, plan and where the key comes from. */
  async account() {
    if (!this.q) throw new Error('This panel has not started yet.')
    return this.q.accountInfo()
  }

  /** Starts the query and pumps its messages until it ends. */
  start() {
    const canUseTool: CanUseTool = (tool, input, { signal }) =>
      new Promise((resolve) => {
        // the persona's autonomy: a safe command it may run alone goes through without a card
        const d = this.opts.decide?.(tool, input)
        this.opts.onDecision?.({ tool, input, action: d?.action ?? 'ask', by: d?.by ?? 'default', ...(d?.rule ? { rule: d.rule } : {}), ...(d?.bp ? { bp: d.bp } : {}) })
        // an isolated panel: its commands are moved into the container before they run
        const run = this.opts.rewriteInput?.(tool, input) ?? input
        if (d?.action === 'allow') return resolve({ behavior: 'allow', updatedInput: run })
        if (d?.action === 'deny') return resolve({ behavior: 'deny', message: d.reason ?? 'Refused by the app.' })
        const id = `p${++this.nextId}`
        this.pending.set(id, { resolve, input: run, tool, raw: input, ...(d?.bp ? { bp: d.bp } : {}) })
        signal.addEventListener('abort', () => {
          this.pending.delete(id)
          resolve({ behavior: 'deny', message: 'aborted' })
        })
        const edit = editOf(id, tool, input, this.read) ?? undefined
        this.emit({ kind: 'permission', id, tool, summary: summarize(tool, input), ...(tool === 'Bash' && typeof input.command === 'string' ? { command: input.command } : {}), edit, ...(d?.risk && d.risk.level !== 'safe' ? { risk: d.risk } : {}), ...(d?.why ? { why: d.why } : {}), ...(d?.cls ? { cls: d.cls } : {}) })
      })
    this.q = this.opts.query({
      prompt: this.inbox,
      options: {
        cwd: this.opts.cwd,
        model: this.opts.model,
        ...(this.opts.effort ? { effort: this.opts.effort } : {}),
        includePartialMessages: true,
        permissionMode: 'default',
        canUseTool,
        settingSources: ['user', 'project', 'local'],
        mcpServers: this.opts.mcpServers,
        allowedTools: this.opts.allowedTools,
        ...(this.opts.disallowedTools?.length ? { disallowedTools: this.opts.disallowedTools } : {}),
        env: this.opts.env,
        // a panel on another machine: Claude Code is started there through ssh
        ...(this.opts.spawn ? { spawnClaudeCodeProcess: this.opts.spawn } : {}),
        // after a sleep, pick up this panel's own conversation
        resume: this.woke ? this.sessionId : this.opts.resume,
        // opened at a past turn: the conversation up to it, as a new branch, so the old log stays as it was
        ...(!this.woke && this.opts.resume && this.opts.resumeAt ? { resumeSessionAt: this.opts.resumeAt, forkSession: true } : {}),
        // every conversation gets the app's rule; a new one also what earlier ones saved to the project's note
        ...(this.appended() ? { systemPrompt: { type: 'preset' as const, preset: 'claude_code' as const, append: this.appended() } } : {}),
        hooks: {
          // a tool call the app turns aside, with the reason Claude reads instead
          ...(this.opts.beforeTool
            ? {
                PreToolUse: [
                  {
                    hooks: [
                      async (input) => {
                        if (input.hook_event_name !== 'PreToolUse') return {}
                        // phase 119: the project's errors are taken before the turn's first edit lands
                        await this.opts.beforeEdit?.(input.tool_name)
                        const why = this.opts.beforeTool!(input.tool_name, (input.tool_input ?? {}) as Record<string, unknown>)
                        return why ? { hookSpecificOutput: { hookEventName: 'PreToolUse' as const, permissionDecision: 'deny' as const, permissionDecisionReason: why } } : {}
                      },
                    ],
                  },
                ],
              }
            : {}),
          // a tool's result that tries to give orders: Claude is told it is data, and the panel says so
          ...(this.opts.afterTool
            ? {
                PostToolUse: [
                  {
                    hooks: [
                      async (input) => {
                        if (input.hook_event_name !== 'PostToolUse') return {}
                        const out = typeof input.tool_response === 'string' ? input.tool_response : JSON.stringify(input.tool_response ?? '')
                        const warn = this.opts.afterTool!(input.tool_name, (input.tool_input ?? {}) as Record<string, unknown>, out)
                        // phase 122: a long result Claude gets as one symbolic line, the original kept on disk
                        const swapped = this.opts.rewriteOutput?.(input.tool_name, (input.tool_input ?? {}) as Record<string, unknown>, input.tool_response, input.tool_use_id)
                        return warn || swapped !== undefined ? { hookSpecificOutput: { hookEventName: 'PostToolUse' as const, ...(warn ? { additionalContext: warn } : {}), ...(swapped !== undefined ? { updatedToolOutput: swapped } : {}) } } : {}
                      },
                    ],
                  },
                ],
                // a call that failed still happened: it goes to the same place (the tool log), with its error
                PostToolUseFailure: [
                  {
                    hooks: [
                      async (input) => {
                        if (input.hook_event_name !== 'PostToolUseFailure') return {}
                        this.opts.afterTool!(input.tool_name, (input.tool_input ?? {}) as Record<string, unknown>, `error: ${input.error}`)
                        return {}
                      },
                    ],
                  },
                ],
              }
            : {}),
          // phase 119: before Claude finishes a turn that edited files, the new errors of the project's check
          ...(this.opts.onStop
            ? {
                Stop: [
                  {
                    hooks: [
                      async (input) => {
                        if (input.hook_event_name !== 'Stop') return {}
                        const reason = await this.opts.onStop!(input.stop_hook_active === true)
                        return reason ? { decision: 'block' as const, reason } : {}
                      },
                    ],
                  },
                ],
              }
            : {}),
          // phase 96: after a compact or a resume, the app's snapshot of where things were, if there is one
          SessionStart: [
            {
              hooks: [
                async (input) => {
                  if (input.hook_event_name !== 'SessionStart' || !this.opts.onSessionStart) return {}
                  const text = this.opts.onSessionStart(input.source)
                  return text ? { hookSpecificOutput: { hookEventName: 'SessionStart' as const, additionalContext: text } } : {}
                },
              ],
            },
          ],
          PreCompact: [
            {
              hooks: [
                async (input) => {
                  if (input.hook_event_name === 'PreCompact') this.opts.beforeCompact?.(input.transcript_path, input.trigger)
                  return {}
                },
              ],
            },
          ],
        },
      },
    })
    void this.pump(this.q)
  }

  private async pump(q: Query) {
    try {
      for await (const m of q) this.handle(m)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (this.lost(message) && this.startOver()) return
      this.emit({ kind: 'error', message })
    }
  }

  /** The saved conversation asked for is not on this Mac (deleted, or from another machine). */
  private lost = (text: string) => Boolean(this.opts.resume) && !this.startedOver && /No conversation found with session ID/i.test(text)
  private startedOver = false
  /** Opens a new conversation in its place, once, with the project's notes so it does not start blank. */
  private startOver() {
    if (this.startedOver) return false
    this.startedOver = true
    this.opts.resume = undefined
    this.sessionId = ''
    this.woke = false
    // a new conversation: it gets the project's memory, which a resume leaves out
    this.appendText = null
    this.inbox = new Inbox<SDKUserMessage>()
    this.emit({ kind: 'note', text: "The saved conversation is no longer on this Mac (deleted, or from another machine), so this panel started a new one. It has the project's notes." })
    this.start()
    return true
  }

  /** Maps one SDK message to UI events. */
  /** Model calls and tool calls as spans: a tool opens when the model asks for it and closes on its result. */
  private spans(m: SDKMessage) {
    const parent = (m as { parent_tool_use_id?: string | null }).parent_tool_use_id ?? null
    const now = Date.now()
    if (m.type === 'assistant') {
      const msg = m.message as unknown as { id?: string; model?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number }; content: { type: string; id?: string; name?: string; input?: Record<string, unknown> }[] }
      this.emit({ kind: 'span', span: { kind: 'model', id: msg.id ?? `m${now}`, parent, at: now, name: msg.model ?? 'model', inputTokens: msg.usage?.input_tokens ?? 0, outputTokens: msg.usage?.output_tokens ?? 0, cacheRead: msg.usage?.cache_read_input_tokens ?? 0 } })
      for (const b of msg.content) if (b.type === 'tool_use' && b.id) this.emit({ kind: 'span', span: { kind: 'tool', id: b.id, parent, at: now, name: b.name ?? 'tool', summary: summarize(b.name ?? '', b.input ?? {}) } })
    } else if (m.type === 'user' && Array.isArray((m.message as { content?: unknown }).content)) {
      for (const b of (m.message as { content: { type?: string; tool_use_id?: string; is_error?: boolean; content?: unknown }[] }).content)
        if (b.type === 'tool_result' && b.tool_use_id) this.emit({ kind: 'span', span: { kind: 'end', id: b.tool_use_id, at: now, ...(b.is_error ? { error: (textOf(b.content as never) || String(b.content ?? '')).split('\n')[0]!.slice(0, 200) } : {}) } })
    }
  }

  /** The plan from this message's tool calls (TodoWrite replaces it; agents and panels started count against the caps). */
  private plan(content: { type: string; name?: string; input?: Record<string, unknown> }[]) {
    const calls = content.filter((b) => b.type === 'tool_use' && b.name).map((b) => ({ name: b.name!, input: b.input ?? {} }))
    if (!calls.length) return
    this.runCalls.push(...calls)
    if (!calls.some((c) => /(^|__)(TodoWrite|Task|Agent|delegate|ui_open_panels)$/.test(c.name))) return
    try {
      const plan = planFrom({ panel: String(this.opts.panelId ?? ''), sessionId: this.sessionId, turn: this.turnsDone, at: Date.now(), calls: this.runCalls })
      this.emit({ kind: 'plan', plan })
      this.opts.onPlan?.(plan)
    } catch {
      // a plan that cannot be built is skipped; the turn goes on
    }
  }

  /** A new run starts: the person's message, a peer's or a trigger's step. */
  private runStart() {
    this.runCalls = []
    this.opts.onRunStart?.()
  }

  handle(m: SDKMessage) {
    if (m.type === 'system' && m.subtype === 'init') {
      this.sessionId = m.session_id
      this.emit({ kind: 'ready', sessionId: m.session_id, model: m.model, cwd: m.cwd })
    }
    // spans for the trace tree: every model call and tool call, subagents' included, with its parent
    this.spans(m)
    if (m.type === 'user' && (m.tool_use_result as { type?: string } | undefined)?.type === 'file_unchanged') {
      // Claude Code answered a re-read of an unchanged file with a stub instead of the file
      const path = (m.tool_use_result as { file?: { filePath?: string } }).file?.filePath
      if (path) this.emit({ kind: 'unchanged', path })
    } else if (m.type === 'user' && !m.parent_tool_use_id && Array.isArray((m.message as { content?: unknown }).content)) {
      for (const b of (m.message as { content: { type?: string; is_error?: boolean; content?: unknown }[] }).content)
        if (b.type === 'tool_result' && b.is_error) this.stopLoop(this.loops.error(textOf(b.content) || String(b.content ?? ''), this.toolNames.get((b as { tool_use_id?: string }).tool_use_id ?? '')))
    } else if (m.type === 'stream_event') {
      const ev = m.event as { type?: string; delta?: { type?: string; text?: string } }
      if (!m.parent_tool_use_id && ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) this.emit({ kind: 'delta', text: ev.delta.text })
    } else if (m.type === 'assistant' && !m.parent_tool_use_id) {
      const content = m.message.content as unknown as { type: string; id?: string; name?: string; input?: Record<string, unknown> }[]
      const tools = content.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id ?? '', name: b.name ?? '', summary: summarize(b.name ?? '', b.input ?? {}) }))
      this.emit({ kind: 'assistant', text: textOf(content), tools })
      const msg = m.message as unknown as { id?: string; model?: string; usage?: Parameters<typeof messageCost>[1] }
      if (msg.usage) {
        const c = messageCost(msg.model ?? this.opts.model, msg.usage)
        this.loops.spend(c.usd, c.tokens, msg.id)
      }
      for (const b of content) if (b.type === 'tool_use' && b.id && b.name) this.toolNames.set(b.id, b.name)
      if (m.uuid) this.lastMessageUuid = m.uuid
      this.plan(content)
      for (const b of content) if (b.type === 'tool_use') this.stopLoop(this.loops.call(b.name ?? '', b.input ?? {}, summarize(b.name ?? '', b.input ?? {})))
      // each file edit once, read before the tool runs (a Write's old text is still on disk)
      for (const b of content)
        if (b.type === 'tool_use' && b.id && !this.seen.has(b.id)) {
          const edit = editOf(b.id, b.name ?? '', b.input ?? {}, this.read)
          if (edit) {
            this.seen.add(b.id)
            this.emit({ kind: 'edit', edit })
          }
        }
    } else if (m.type === 'result') {
      // a resume that found nothing: not a turn of the person's, the panel starts over instead
      if (m.is_error && this.lost(JSON.stringify(m))) return
      const usage = m.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number } }
      this.ttl = ttlOf(usage.cache_creation, this.ttl)
      const failed = m.is_error && !this.stoppedByApp
      const status = (m as { api_error_status?: number | null }).api_error_status
      this.emit({
        kind: 'turn',
        costUsd: m.total_cost_usd,
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheRead: usage.cache_read_input_tokens ?? 0,
        cacheWrite: usage.cache_creation_input_tokens ?? 0,
        isError: failed,
        text: m.subtype === 'success' ? m.result : this.stoppedByApp ? '' : m.subtype,
        durationMs: m.duration_ms,
        cacheTtlMs: this.ttl,
        // the HTTP status the API answered with, when the SDK reports it: the failover classifier reads it
        ...(failed && typeof status === 'number' ? { status } : {}),
      })
      this.lastCostUsd = m.total_cost_usd
      this.stoppedByApp = false
      if (m.subtype === 'success' && !m.is_error) this.opts.onReply?.(m.result)
      this.turns.shift()?.(m.subtype === 'success' ? m.result : m.subtype, m.is_error)
      this.lastActivity = Date.now()
      this.busy = this.turns.length > 0
      void this.measure()
      // after busy is current: the panel's queue sends its next item from here
      this.opts.onTurnEnd?.(!failed)
      this.turnsDone++
    } else if (m.type === 'rate_limit_event') {
      const info = m.rate_limit_info
      // the type does not say the scale: a fraction or a percent
      if (info.rateLimitType && typeof info.utilization === 'number')
        this.emit({ kind: 'limits', windows: [{ kind: info.rateLimitType, percentUsed: info.utilization <= 1 ? info.utilization * 100 : info.utilization, resetsAt: info.resetsAt ? new Date(info.resetsAt * 1000).toISOString() : undefined }] })
    }
  }

  /** Context fill after a turn; best effort (the call is newer than the rest of the API). */
  private async measure() {
    try {
      const c = await this.q?.getContextUsage({ detail: 'summary' })
      if (c && c.maxTokens) this.emit({ kind: 'context', tokens: c.totalTokens, window: c.maxTokens, percent: c.percentage })
    } catch {
      // not available on this build
    }
  }

  /** What every turn of this panel carries before the conversation; null while it sleeps or before it starts. */
  async overhead() {
    if (!this.q || this.asleep) return null
    try {
      return toOverhead(await this.q.getContextUsage({ detail: 'full' }))
    } catch {
      return null
    }
  }

  /**
   * Ends the Claude Code process of an idle panel to free its memory. The conversation stays on
   * disk; the next message starts a process that resumes it.
   */
  sleep(): boolean {
    if (this.asleep || this.busy || this.pending.size || !this.sessionId) return false
    this.asleep = true
    this.inbox.end()
    this.emit({ kind: 'sleep' })
    return true
  }

  /** Tools taken away from this panel (or given back); the next message resumes with the new list. */
  setDisallowed(list: string[]): boolean {
    if (this.busy || this.pending.size) return false
    this.opts.disallowedTools = [...new Set(list)]
    return this.restartIdle()
  }
  /** Phase 88: the environment the CLI runs with (which source it bills); the next message resumes with it. */
  setEnv(env: Options['env']): boolean {
    if (this.busy || this.pending.size) return false
    this.opts.env = env
    return this.restartIdle()
  }
  /** An idle process started with the old options: end it, so the next message starts one with the new ones. */
  private restartIdle(): boolean {
    if (this.asleep) return true
    if (this.sessionId) return this.sleep()
    if (!this.q) return true
    this.asleep = true
    this.inbox.end()
    return true
  }
  get env() {
    return this.opts.env
  }
  get disallowed() {
    return this.opts.disallowedTools ?? []
  }

  private wake() {
    if (!this.asleep) return
    this.inbox = new Inbox<SDKUserMessage>()
    this.woke = true
    this.start()
    this.asleep = false
    this.emit({ kind: 'wake' })
  }

  send(text: string, attachments: Attachment[] = []) {
    this.lastActivity = Date.now()
    this.runStart()
    this.loops.reset()
    this.toolNames.clear()
    if (this.opts.loop) this.loops.config = this.opts.loop()
    this.wake()
    this.turns.push(() => {})
    this.busy = true
    const images = attachments.filter((a) => a.kind === 'image')
    const files = attachments.filter((a) => a.kind === 'file')
    const body = text + filesNote(files)
    if (!images.length) return this.push(body)
    // images go as image blocks Claude sees, before the words about them
    this.inbox.push({
      type: 'user',
      message: { role: 'user', content: [...images.map((i) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.mediaType, data: i.data } })), { type: 'text' as const, text: body || 'See the image.' }] },
      parent_tool_use_id: null,
      session_id: this.sessionId,
      origin: { kind: 'human' },
    } as SDKUserMessage)
  }

  /** A message from another panel: shown in this panel, run as a turn, its reply returned. */
  ask(text: string, from: string): Promise<string> {
    this.lastActivity = Date.now()
    this.runStart()
    this.wake()
    this.emit({ kind: 'peer', from, text })
    return new Promise((resolve, reject) => {
      this.turns.push((reply, isError) => (isError ? reject(new Error(reply)) : resolve(reply)))
      this.busy = true
      this.push(`[Message from the "${from}" panel of this app. Do what it asks; your final reply goes back to it.]\n\n${text}`)
    })
  }

  /** A trigger's step: shown with where it came from, sent as is, resolved when its turn ends. */
  step(text: string, from: string): Promise<string> {
    this.lastActivity = Date.now()
    this.runStart()
    this.wake()
    this.emit({ kind: 'peer', from, text })
    return new Promise((resolve, reject) => {
      this.turns.push((reply, isError) => (isError ? reject(new Error(reply)) : resolve(reply)))
      this.busy = true
      this.push(text)
    })
  }

  private push(text: string) {
    this.inbox.push({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null, session_id: this.sessionId, origin: { kind: 'human' } } as SDKUserMessage)
  }

  /** An action the agent asked the app for (through `stm ask`): shown like a tool approval, true if allowed. */
  request(tool: string, summary: string, why?: string): Promise<boolean> {
    return new Promise((ok) => {
      const id = `p${++this.nextId}`
      // nobody answering in 5 minutes is a no
      const t = setTimeout(() => this.answer(id, false), 5 * 60_000)
      this.pending.set(id, { resolve: (r: { behavior: string }) => (clearTimeout(t), ok(r.behavior === 'allow')), input: {} } as never)
      this.emit({ kind: 'permission', id, tool, summary, ...(why ? { why } : {}), cls: 'write' })
    })
  }

  /**
   * The person's answer. `command` replaces a Bash command before it runs (checked again like the
   * original, and moved into the container the same way); `note` goes back to the agent with a denial.
   */
  answer(id: string, allow: boolean, extra: { command?: string; note?: string } = {}) {
    const p = this.pending.get(id)
    if (!p) return
    this.pending.delete(id)
    const note = extra.note?.trim().slice(0, 4000)
    this.opts.onAnswered?.({ tool: p.tool ?? 'request', input: p.raw ?? p.input, allow, ...(p.bp ? { bp: p.bp } : {}) })
    // Deny at the breakpoint after the plan ends the turn
    if (!allow && p.bp === 'afterPlan') void this.interrupt().catch(() => undefined)
    if (!allow) return p.resolve({ behavior: 'deny', message: note ? `Denied in the app. The person says: ${note}` : 'Denied in the app' })
    const command = extra.command?.trim()
    if (!command || p.tool !== 'Bash' || !p.raw || command === p.raw.command) return p.resolve({ behavior: 'allow', updatedInput: p.input })
    const edited = { ...p.raw, command }
    if (this.opts.decide?.('Bash', edited)?.action === 'deny') return p.resolve({ behavior: 'deny', message: 'The edited command is refused by the app.' })
    p.resolve({ behavior: 'allow', updatedInput: this.opts.rewriteInput?.('Bash', edited) ?? edited })
  }

  /** A different model from the next turn on, at the person's click (the router only suggests). */
  async setModel(model: string) {
    // kept for the next process too: a panel that has not started, or is asleep (its process ended to
    // free memory), starts or wakes with it, and a live one is told now
    this.opts.model = model
    if (!this.q || this.asleep) return
    await this.q.setModel(model)
  }
  async interrupt() {
    await this.q?.interrupt()
  }
  /**
   * A steer that cannot wait: ends the running turn like Stop does, marked as made by the app so the interrupted
   * result is not an error. The SDK has no call to inject text into a running turn; the steer goes out as the next
   * turn, from onTurnEnd. False when nothing runs.
   */
  async steer(): Promise<boolean> {
    if (!this.busy || !this.q) return false
    this.stoppedByApp = true
    await this.q.interrupt()
    return true
  }

  close() {
    for (const done of this.turns) done('panel closed', true)
    this.turns = []
    this.inbox.end()
    for (const [, p] of this.pending) p.resolve({ behavior: 'deny', message: 'session closed' })
    this.pending.clear()
  }
}
