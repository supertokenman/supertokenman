import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { describe, expect, it } from 'vitest'
import { blocked, classify, initialPanel, type Panel, type Signal } from './panelstate'

const dir = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'panelstate')
type Fixture = { description: string; events: { signal: Signal }[]; states: Panel['state'][]; reason?: string }

const run = (events: Signal[]) => events.reduce<Panel[]>((acc, ev) => [...acc, classify(acc.at(-1) ?? initialPanel(), ev)], [])
const msg = (m: unknown) => ({ kind: 'message', msg: m as SDKMessage }) as Signal
const assistant = (content: unknown[]) => msg({ type: 'assistant', parent_tool_use_id: null, message: { content } })
const result = (text: string) => msg({ type: 'result', subtype: 'success', is_error: false, result: text })

describe('panelstate fixtures', () => {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    it(file.replace('.json', ''), () => {
      const fx = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Fixture
      const seen = run(fx.events.map((e) => e.signal))
      expect(seen.map((p) => p.state)).toEqual(fx.states)
      if (fx.reason !== undefined) expect(seen.at(-1)?.reason).toBe(fx.reason)
    })
  }
})

describe('classify', () => {
  it('starts idle with nothing pending', () => {
    expect(initialPanel()).toEqual({ state: 'idle', pending: 0, asked: false })
  })

  it('approval outranks working and waits for the queue to empty', () => {
    const states = run([{ kind: 'prompt' }, assistant([{ type: 'tool_use', name: 'Write' }]), { kind: 'approval', pending: 2 }, { kind: 'approval', pending: 1 }]).map((p) => p.state)
    expect(states).toEqual(['working', 'working', 'waiting_approval', 'waiting_approval'])
  })

  it('an approval arriving while idle still blocks', () => {
    expect(classify(initialPanel(), { kind: 'approval', pending: 1 }).state).toBe('waiting_approval')
  })

  it('an error beats a pending approval', () => {
    const p = run([{ kind: 'prompt' }, { kind: 'approval', pending: 1 }, { kind: 'disconnect' }]).at(-1)
    expect(p?.state).toBe('error')
  })

  it('sleep goes idle', () => {
    expect(run([{ kind: 'prompt' }, { kind: 'sleep' }]).at(-1)?.state).toBe('idle')
  })

  it('subagent messages do not move the panel', () => {
    const sub = msg({ type: 'assistant', parent_tool_use_id: 'toolu_x', message: { content: [{ type: 'tool_use', name: 'AskUserQuestion' }] } })
    expect(run([{ kind: 'prompt' }, sub]).at(-1)).toEqual({ state: 'working', pending: 0, asked: false, reason: undefined })
  })

  it('an ask flag does not survive into the next turn', () => {
    const states = run([{ kind: 'prompt' }, assistant([{ type: 'tool_use', name: 'ExitPlanMode' }]), result('Plan ready'), { kind: 'prompt' }, result('Done')]).map((p) => p.state)
    expect(states).toEqual(['working', 'working', 'waiting_input', 'working', 'idle'])
  })

  it('a plan awaiting approval (ExitPlanMode) waits for the person', () => {
    expect(run([{ kind: 'prompt' }, assistant([{ type: 'tool_use', name: 'ExitPlanMode' }]), result('Here is the plan.')]).at(-1)?.state).toBe('waiting_input')
  })

  it('a question in the text is only a fallback when no ask tool was used', () => {
    expect(run([{ kind: 'prompt' }, result('Shall I go on?')]).at(-1)?.state).toBe('waiting_input')
    expect(run([{ kind: 'prompt' }, result('All green.')]).at(-1)?.state).toBe('idle')
  })

  it('an error result gives its first error as the reason', () => {
    const p = run([{ kind: 'prompt' }, msg({ type: 'result', subtype: 'error_max_turns', is_error: true, errors: ['too many turns'] })]).at(-1)
    expect(p).toMatchObject({ state: 'error', reason: 'too many turns' })
  })

  it('exit: zero is idle, non-zero and signal kills are errors', () => {
    expect(run([{ kind: 'prompt' }, { kind: 'exit', code: 0 }]).at(-1)?.state).toBe('idle')
    expect(run([{ kind: 'prompt' }, { kind: 'exit', code: 1 }]).at(-1)).toMatchObject({ state: 'error', reason: 'exit 1' })
    expect(run([{ kind: 'prompt' }, { kind: 'exit', code: null }]).at(-1)).toMatchObject({ state: 'error', reason: 'exit by signal' })
  })

  it('closed is terminal', () => {
    const p = run([{ kind: 'prompt' }, { kind: 'closed' }, { kind: 'prompt' }, { kind: 'approval', pending: 1 }]).at(-1)
    expect(p?.state).toBe('closed')
  })

  it('blocked covers approval, input and error only', () => {
    expect(['waiting_approval', 'waiting_input', 'error'].every((s) => blocked(s as Panel['state']))).toBe(true)
    expect(['working', 'idle', 'closed'].some((s) => blocked(s as Panel['state']))).toBe(false)
  })
})
