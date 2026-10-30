import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'

export type PanelState = 'working' | 'waiting_approval' | 'waiting_input' | 'idle' | 'error' | 'closed'

export type Panel = { state: PanelState; reason?: string; pending: number; asked: boolean }

/** What happened to a panel: a message from the SDK stream, or a local signal from the app. */
export type Signal =
  | { kind: 'prompt' }
  | { kind: 'message'; msg: SDKMessage }
  | { kind: 'approval'; pending: number }
  | { kind: 'sleep' }
  | { kind: 'quota'; text: string }
  | { kind: 'disconnect' }
  | { kind: 'exit'; code: number | null }
  | { kind: 'closed' }

/** tools that put a question or a plan to the person; a turn that used one ends in waiting_input */
const ASK_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode'])

export const initialPanel = (): Panel => ({ state: 'idle', pending: 0, asked: false })

/** blocked = waiting for the person or broken; "done" is decided by the wait conditions */
export const blocked = (s: PanelState): boolean => s === 'waiting_approval' || s === 'waiting_input' || s === 'error'

export function classify(prev: Panel, ev: Signal): Panel {
  if (prev.state === 'closed') return prev
  let next: Panel
  switch (ev.kind) {
    case 'closed':
      return { state: 'closed', pending: 0, asked: false }
    case 'prompt':
      next = { ...prev, state: 'working', reason: undefined, asked: false }
      break
    case 'approval':
      next = { ...prev, pending: ev.pending }
      if (ev.pending === 0 && prev.state === 'waiting_approval') next.state = 'working'
      break
    case 'sleep':
      next = { ...prev, state: 'idle' }
      break
    case 'quota':
      next = { ...prev, state: 'error', reason: ev.text }
      break
    case 'disconnect':
      next = { ...prev, state: 'error', reason: 'disconnected' }
      break
    case 'exit':
      next = ev.code === 0 ? { ...prev, state: 'idle' } : { ...prev, state: 'error', reason: `exit ${ev.code ?? 'by signal'}` }
      break
    case 'message':
      next = onMessage(prev, ev.msg)
      break
  }
  // a pending approval outranks working and waiting_input, but not an error
  if (next.state !== 'error' && next.pending > 0) next.state = 'waiting_approval'
  return next
}

function onMessage(prev: Panel, m: SDKMessage): Panel {
  switch (m.type) {
    case 'assistant': {
      if (m.parent_tool_use_id) return prev
      const asked = prev.asked || blocksOf(m.message.content).some((b) => b.type === 'tool_use' && ASK_TOOLS.has(b.name ?? ''))
      return { ...prev, state: 'working', asked }
    }
    case 'user':
    case 'stream_event':
      return m.parent_tool_use_id ? prev : { ...prev, state: 'working' }
    case 'result': {
      if (m.is_error || m.subtype !== 'success') {
        return { ...prev, state: 'error', reason: m.subtype === 'success' ? m.result : (m.errors[0] ?? m.subtype), asked: false }
      }
      // structured signal first; a closing question in the text is only the fallback
      const text = m.result.trim()
      const question = text.endsWith('?') || text.endsWith('？')
      return { ...prev, state: prev.asked || question ? 'waiting_input' : 'idle', reason: undefined, asked: false }
    }
    default:
      return prev
  }
}

function blocksOf(content: unknown): { type: string; name?: string }[] {
  return Array.isArray(content) ? (content as { type: string; name?: string }[]) : []
}
