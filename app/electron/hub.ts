// Panels talking to each other: each session gets two tools, list_panels and message_panel.
// A message runs as a turn in the target panel and its reply comes back as the tool's result.
// Waits form a graph; a message that would close a cycle (A waits on B, B on A) is refused.
import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

/** What the hub needs of a panel's session. */
export type Peer = { label: string; cwd: string; busy: () => boolean; ask: (text: string, from: string) => Promise<string> }

export const SERVER = 'panels'
export const TOOLS = [`mcp__${SERVER}__list_panels`, `mcp__${SERVER}__message_panel`, `mcp__${SERVER}__panel_state`, `mcp__${SERVER}__panel_wait`]
type ExtraTools = NonNullable<Parameters<typeof createSdkMcpServer>[0]['tools']>
const TIMEOUT_MS = 15 * 60 * 1000

export class CycleError extends Error {
  constructor(from: string, to: string) {
    super(from === to ? 'A panel cannot wait on itself.' : `Panel "${to}" is waiting on this panel; waiting on it would deadlock both.`)
  }
}

export class Hub {
  private peers = new Map<string, Peer>()
  /** who is waiting on whom */
  private waits = new Map<string, string>()
  /** more tools for a panel's server (panel_state, panel_wait), set by the app */
  extraTools?: (from: string) => ExtraTools

  add(sid: string, peer: Peer) {
    this.peers.set(sid, peer)
  }

  remove(sid: string) {
    this.peers.delete(sid)
    this.waits.delete(sid)
  }

  list(from: string) {
    return [...this.peers].filter(([sid]) => sid !== from).map(([sid, p]) => ({ panel: sid, name: p.label, folder: p.cwd, busy: p.busy() }))
  }

  /** True when `to` already waits, directly or not, on `from`. */
  wouldCycle(from: string, to: string) {
    let cur: string | undefined = to
    const seen = new Set<string>()
    while (cur && !seen.has(cur)) {
      if (cur === from) return true
      seen.add(cur)
      cur = this.waits.get(cur)
    }
    return false
  }

  /**
   * Records that `from` waits on `to` (stm wait / panel_wait) and returns the call that ends it. Throws
   * when `to` already waits, directly or not, on `from`: A waits B waits A would never end. A caller
   * that is not a panel (the command line from outside) has no edge and cannot close a cycle.
   */
  beginWait(from: string | undefined, to: string): () => void {
    if (!from) return () => undefined
    if (from === to || this.wouldCycle(from, to)) throw new CycleError(from, to)
    this.waits.set(from, to)
    return () => {
      if (this.waits.get(from) === to) this.waits.delete(from)
    }
  }

  /** Sends `text` from one panel to another and resolves with the target's reply. */
  async message(from: string, to: string, text: string): Promise<string> {
    const target = this.peers.get(to)
    if (!target) throw new Error(`No panel "${to}". Call list_panels to see the open panels.`)
    if (to === from) throw new Error('A panel cannot message itself.')
    if (this.wouldCycle(from, to)) throw new Error(`Panel "${to}" is waiting on this panel; messaging it would deadlock both.`)
    this.waits.set(from, to)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const sender = this.peers.get(from)?.label ?? from
      return await Promise.race([
        target.ask(text, sender),
        new Promise<string>((_, reject) => (timer = setTimeout(() => reject(new Error(`Panel "${to}" did not answer within 15 minutes.`)), TIMEOUT_MS))),
      ])
    } finally {
      clearTimeout(timer)
      this.waits.delete(from)
    }
  }

  /** The tools one panel's session gets. */
  server(from: string): McpSdkServerConfigWithInstance {
    const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] })
    return createSdkMcpServer({
      name: SERVER,
      instructions: 'Other Claude Code sessions run in panels of the same app, each in its own folder. Use list_panels to see them and message_panel to hand one a task; its reply comes back as the result.',
      tools: [
        tool('list_panels', 'List the other open panels: id, name, folder and whether each is busy.', {}, async () => text(JSON.stringify(this.list(from), null, 2))),
        tool(
          'message_panel',
          'Send a task or question to another panel. It runs there as a turn and its final reply is returned. Be specific: the other panel does not see this conversation.',
          { panel: z.string().describe('Panel id from list_panels, e.g. s2'), message: z.string().describe('What the other panel should do or answer') },
          async ({ panel, message }) => {
            try {
              return text(await this.message(from, panel, message))
            } catch (err) {
              return { ...text(err instanceof Error ? err.message : String(err)), isError: true }
            }
          },
        ),
        ...(this.extraTools?.(from) ?? []),
      ],
    })
  }
}
