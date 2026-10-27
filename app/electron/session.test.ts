import { describe, expect, it } from 'vitest'
import type { Options, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { Session, summarize, type UiEvent } from './session'

/** A stand-in for the SDK's query: answers each prompt with the scripted messages, asking permission first when told to. */
function fakeQuery(script: (prompt: string, options: Options) => AsyncGenerator<SDKMessage>) {
  let opts: Options = {}
  const fn = (p: { prompt: AsyncIterable<SDKUserMessage>; options?: Options }) => {
    opts = p.options ?? {}
    async function* run() {
      yield { type: 'system', subtype: 'init', session_id: 's1', model: 'claude-opus-5-5', cwd: '/proj' } as unknown as SDKMessage
      for await (const m of p.prompt) yield* script(String(m.message.content), opts)
    }
    const it = run() as unknown as Query
    ;(it as unknown as { getContextUsage: () => Promise<unknown> }).getContextUsage = async () => ({ totalTokens: 68000, maxTokens: 200000, percentage: 34 })
    return it
  }
  return { fn, options: () => opts }
}

const settle = () => new Promise((r) => setTimeout(r, 10))

describe('Session', () => {
  it('streams text, reports the turn and measures the context', async () => {
    const events: UiEvent[] = []
    const q = fakeQuery(async function* (prompt) {
      yield { type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi ' } } } as unknown as SDKMessage
      yield { type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'text', text: `Hi, you said ${prompt}` }] } } as unknown as SDKMessage
      yield { type: 'result', subtype: 'success', is_error: false, result: 'done', total_cost_usd: 0.12, usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 3000, cache_creation_input_tokens: 400 } } as unknown as SDKMessage
    })
    const s = new Session((e) => events.push(e), { cwd: '/proj', query: q.fn })
    s.start()
    s.send('hello')
    await settle()
    expect(q.options()).toMatchObject({ cwd: '/proj', includePartialMessages: true, permissionMode: 'default' })
    expect(events.filter((e) => e.kind !== 'span')).toEqual([
      { kind: 'ready', sessionId: 's1', model: 'claude-opus-5-5', cwd: '/proj' },
      { kind: 'delta', text: 'Hi ' },
      { kind: 'assistant', text: 'Hi, you said hello', tools: [] },
      { kind: 'turn', costUsd: 0.12, inputTokens: 10, outputTokens: 20, cacheRead: 3000, cacheWrite: 400, isError: false, text: 'done' },
      { kind: 'context', tokens: 68000, window: 200000, percent: 34 },
    ])
    s.close()
  })

  it('asks the window before a tool runs and passes the answer back', async () => {
    const events: UiEvent[] = []
    const decisions: unknown[] = []
    const q = fakeQuery(async function* (_prompt, options) {
      decisions.push(await options.canUseTool!('Bash', { command: 'npm   test' }, { signal: new AbortController().signal } as never))
      decisions.push(await options.canUseTool!('Bash', { command: 'rm -rf /' }, { signal: new AbortController().signal } as never))
    })
    const s = new Session((e) => {
      events.push(e)
      if (e.kind === 'permission') s.answer(e.id, e.summary === 'npm test')
    }, { cwd: '/proj', query: q.fn })
    s.start()
    s.send('go')
    await settle()
    expect(events.filter((e) => e.kind === 'permission')).toEqual([
      { kind: 'permission', id: 'p1', tool: 'Bash', summary: 'npm test' },
      { kind: 'permission', id: 'p2', tool: 'Bash', summary: 'rm -rf /' },
    ])
    expect(decisions).toEqual([
      { behavior: 'allow', updatedInput: { command: 'npm   test' } },
      { behavior: 'deny', message: 'Denied in the app' },
    ])
    s.close()
  })

  it('carries the cache time to live the turn wrote with, and keeps it on a turn that wrote nothing', () => {
    const events: UiEvent[] = []
    const s = new Session((e) => events.push(e), { cwd: '/', query: fakeQuery(async function* () {}).fn })
    const result = (cc: object) => ({ type: 'result', subtype: 'success', is_error: false, result: 'ok', total_cost_usd: 0, duration_ms: 1200, usage: { input_tokens: 1, output_tokens: 1, cache_creation: cc } }) as unknown as SDKMessage
    s.handle(result({ ephemeral_1h_input_tokens: 500 }))
    s.handle(result({}))
    expect(events.filter((e) => e.kind === 'turn').map((e) => e.kind === 'turn' && [e.cacheTtlMs, e.durationMs])).toEqual([[3_600_000, 1200], [3_600_000, 1200]])
  })

  it('passes the tools to leave out, and none when the list is empty', async () => {
    const lean = fakeQuery(async function* () {})
    new Session(() => undefined, { cwd: '/p', query: lean.fn, disallowedTools: ['Workflow'] }).start()
    expect(lean.options().disallowedTools).toEqual(['Workflow'])
    const full = fakeQuery(async function* () {})
    new Session(() => undefined, { cwd: '/p', query: full.fn, disallowedTools: [] }).start()
    expect(full.options()).not.toHaveProperty('disallowedTools')
  })

  it('reports a re-read Claude Code answered with a stub, and nothing for a real read', () => {
    const events: UiEvent[] = []
    const s = new Session((e) => events.push(e), { cwd: '/', query: fakeQuery(async function* () {}).fn })
    s.handle({ type: 'user', message: { role: 'user', content: [] }, tool_use_result: { type: 'file_unchanged', file: { filePath: '/proj/a.ts' } } } as unknown as SDKMessage)
    s.handle({ type: 'user', message: { role: 'user', content: [] }, tool_use_result: { type: 'text', file: { filePath: '/proj/a.ts', content: 'x' } } } as unknown as SDKMessage)
    expect(events).toEqual([{ kind: 'unchanged', path: '/proj/a.ts' }])
  })

  it('reads plan windows from rate limit events, as a fraction or a percent', () => {
    const events: UiEvent[] = []
    const s = new Session((e) => events.push(e), { cwd: '/', query: fakeQuery(async function* () {}).fn })
    s.handle({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', utilization: 0.23, resetsAt: 1792679400 } } as unknown as SDKMessage)
    s.handle({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'seven_day', utilization: 41 } } as unknown as SDKMessage)
    expect(events).toEqual([
      { kind: 'limits', windows: [{ kind: 'five_hour', percentUsed: 23, resetsAt: new Date(1792679400 * 1000).toISOString() }] },
      { kind: 'limits', windows: [{ kind: 'seven_day', percentUsed: 41, resetsAt: undefined }] },
    ])
  })

  it('summarizes tool calls in one line', () => {
    expect(summarize('Read', { file_path: '/a/b.ts' })).toBe('/a/b.ts')
    expect(summarize('Grep', { pattern: 'TODO' })).toBe('TODO')
  })

  it('sends each file edit once, and shows the diff on its permission card', async () => {
    const events: UiEvent[] = []
    const edit = { type: 'tool_use', id: 't1', name: 'Write', input: { file_path: '/p/a.ts', content: 'x\nz' } }
    const q = fakeQuery(async function* (_prompt, options) {
      yield { type: 'assistant', parent_tool_use_id: null, message: { content: [edit] } } as unknown as SDKMessage
      yield { type: 'assistant', parent_tool_use_id: null, message: { content: [edit] } } as unknown as SDKMessage
      await options.canUseTool!('Write', edit.input, { signal: new AbortController().signal } as never)
    })
    const s = new Session((e) => {
      events.push(e)
      if (e.kind === 'permission') s.answer(e.id, true)
    }, { cwd: '/p', query: q.fn, read: (f) => (f === '/p/a.ts' ? 'x\ny' : null) })
    s.start()
    s.send('go')
    await settle()
    const edits = events.filter((e) => e.kind === 'edit')
    expect(edits).toHaveLength(1)
    expect(edits[0]).toMatchObject({ edit: { file: '/p/a.ts', added: 1, removed: 1, isNew: false } })
    const ask = events.find((e) => e.kind === 'permission')
    expect(ask).toMatchObject({ tool: 'Write', edit: { file: '/p/a.ts', added: 1, removed: 1 } })
    s.close()
  })

  it('answers a peer with its own turn, even behind a turn of the user', async () => {
    const events: UiEvent[] = []
    const q = fakeQuery(async function* (prompt) {
      const said = prompt.includes('[Message from') ? 'types updated' : 'hello back'
      yield { type: 'result', subtype: 'success', is_error: false, result: said, total_cost_usd: 0, usage: {} } as unknown as SDKMessage
    })
    const s = new Session((e) => events.push(e), { cwd: '/web', query: q.fn })
    s.start()
    s.send('hello')
    const reply = s.ask('update the client types', 'api')
    expect(s.busy).toBe(true)
    expect(await reply).toBe('types updated')
    await settle()
    expect(s.busy).toBe(false)
    expect(events.find((e) => e.kind === 'peer')).toEqual({ kind: 'peer', from: 'api', text: 'update the client types' })
    s.close()
  })

  it('sleeps when idle and resumes its own conversation on the next message', async () => {
    const events: UiEvent[] = []
    const starts: (string | undefined)[] = []
    const q = fakeQuery(async function* () {
      yield { type: 'result', subtype: 'success', is_error: false, result: 'ok', total_cost_usd: 0, usage: {} } as unknown as SDKMessage
    })
    const s = new Session((e) => events.push(e), {
      cwd: '/p',
      query: (p) => {
        starts.push(p.options?.resume)
        return q.fn(p)
      },
    })
    s.start()
    s.send('first')
    await settle()
    expect(s.sessionId).toBe('s1')
    expect(s.sleep()).toBe(true)
    expect(s.sleep()).toBe(false)
    s.send('second')
    await settle()
    expect(starts).toEqual([undefined, 's1'])
    expect(events.filter((e) => e.kind === 'sleep' || e.kind === 'wake').map((e) => e.kind)).toEqual(['sleep', 'wake'])
    expect(events.filter((e) => e.kind === 'turn')).toHaveLength(2)
    s.close()
  })

  it('changes the model of a sleeping panel without reaching its ended process, and wakes with it', async () => {
    const models: (string | undefined)[] = []
    const q = fakeQuery(async function* () {
      yield { type: 'result', subtype: 'success', is_error: false, result: 'ok', total_cost_usd: 0, usage: {} } as unknown as SDKMessage
    })
    const s = new Session(() => {}, {
      cwd: '/p',
      model: 'claude-sonnet-4-5',
      query: (p) => {
        models.push(p.options?.model)
        // the ended process of a sleeping panel answers no control request
        return Object.assign(q.fn(p), { setModel: () => Promise.reject(new Error('Query closed before response received')) })
      },
    })
    s.start()
    s.send('first')
    await settle()
    s.sleep()
    await expect(s.setModel('claude-opus-4-5')).resolves.toBeUndefined()
    expect(s.model).toBe('claude-opus-4-5')
    s.send('second')
    await settle()
    expect(models).toEqual(['claude-sonnet-4-5', 'claude-opus-4-5'])
    s.close()
  })

  it('keeps the same system prompt after a sleep, so the conversation cache is read, not written again', async () => {
    const prompts: unknown[] = []
    const q = fakeQuery(async function* () {
      yield { type: 'result', subtype: 'success', is_error: false, result: 'ok', total_cost_usd: 0, usage: {} } as unknown as SDKMessage
    })
    const s = new Session(() => {}, {
      cwd: '/p',
      rule: 'Rule.',
      memory: 'Map of the project.',
      query: (p) => {
        prompts.push(p.options?.systemPrompt)
        return q.fn(p)
      },
    })
    s.start()
    s.send('first')
    await settle()
    s.sleep()
    s.send('second')
    await settle()
    expect(prompts).toHaveLength(2)
    expect(prompts[1]).toEqual(prompts[0])
    expect(JSON.stringify(prompts[0])).toContain('Map of the project.')
    s.close()
  })

  it('stops a turn that repeats the same tool call, and says why', async () => {
    const events: UiEvent[] = []
    let interrupted = 0
    const q = fakeQuery(async function* () {
      for (let i = 0; i < 3; i++) yield { type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: `t${i}`, name: 'Bash', input: { command: 'npm test' } }] } } as unknown as SDKMessage
    })
    const s = new Session((e) => events.push(e), {
      cwd: '/p',
      query: (p) => {
        const it = q.fn(p)
        ;(it as unknown as { interrupt: () => Promise<void> }).interrupt = async () => void interrupted++
        return it
      },
    })
    s.start()
    s.send('fix the tests')
    await settle()
    expect(events.filter((e) => e.kind === 'loop')).toEqual([{ kind: 'loop', reason: 'Bash ran 3 times with the same input (npm test).' }])
    expect(interrupted).toBe(1)
    s.close()
  })

  it('stops on the same tool error three times', async () => {
    const events: UiEvent[] = []
    const q = fakeQuery(async function* () {
      for (let i = 0; i < 3; i++) yield { type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `t${i}`, is_error: true, content: 'Error: Cannot find module ./x' }] } } as unknown as SDKMessage
    })
    const s = new Session((e) => events.push(e), { cwd: '/p', query: q.fn })
    s.start()
    s.send('go')
    await settle()
    expect(events.find((e) => e.kind === 'loop')).toMatchObject({ reason: expect.stringMatching(/same error came back 3 times/) })
    s.close()
  })

  it('does not sleep while working', () => {
    const s = new Session(() => {}, { cwd: '/p', query: fakeQuery(async function* () {}).fn })
    s.start()
    s.send('x')
    expect(s.sleep()).toBe(false)
    s.close()
  })
  it('starts a new conversation, once, when the one to resume is gone', async () => {
    const events: UiEvent[] = []
    const seen: (string | undefined)[] = []
    const fn = (p: { prompt: AsyncIterable<SDKUserMessage>; options?: Options }) => {
      seen.push(p.options?.resume)
      const gone = Boolean(p.options?.resume)
      async function* run() {
        if (gone) {
          yield { type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['No conversation found with session ID: dead'], usage: {} } as unknown as SDKMessage
          throw new Error('Claude Code returned an error result: No conversation found with session ID: dead')
        }
        yield { type: 'system', subtype: 'init', session_id: 'fresh', model: 'm', cwd: '/proj' } as unknown as SDKMessage
      }
      return run() as unknown as Query
    }
    const s = new Session((e) => events.push(e), { cwd: '/proj', query: fn, resume: 'dead', memory: 'old notes' })
    s.start()
    await settle()
    expect(seen).toEqual(['dead', undefined])
    expect(events.map((e) => e.kind)).toEqual(['note', 'ready'])
    expect(events.some((e) => e.kind === 'error' || e.kind === 'turn')).toBe(false)
    s.close()
  })
})

describe('Session options changed before the first message', () => {
  it('starts a new process with the new tools and environment', async () => {
    const calls: Options[] = []
    const fn = (p: { prompt: AsyncIterable<SDKUserMessage>; options?: Options }) => {
      calls.push(p.options ?? {})
      async function* run() {
        for await (const m of p.prompt) {
          yield { type: 'system', subtype: 'init', session_id: 's9', model: 'm', cwd: '/proj' } as unknown as SDKMessage
          yield { type: 'result', subtype: 'success', is_error: false, result: String(m.message.content), total_cost_usd: 0, usage: { input_tokens: 1, output_tokens: 1 } } as unknown as SDKMessage
        }
      }
      const it = run() as unknown as Query
      ;(it as unknown as { getContextUsage: () => Promise<unknown> }).getContextUsage = async () => null
      return it
    }
    const s = new Session(() => {}, { cwd: '/proj', query: fn as never })
    s.start()
    expect(s.setDisallowed(['mcp__x__y'])).toBe(true)
    expect(s.setEnv({ PATH: '/bin' })).toBe(true)
    s.send('hi')
    await settle()
    expect(calls).toHaveLength(2)
    expect(calls[1]).toMatchObject({ disallowedTools: ['mcp__x__y'], env: { PATH: '/bin' } })
    s.close()
  })
})
