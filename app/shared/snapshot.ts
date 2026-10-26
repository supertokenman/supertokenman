// Phase 96: what a panel was doing, kept from its tool calls and prompts, so after a compact (or a
// resume) it is told in a few lines instead of starting from a summary that lost the thread. The
// person sees the snapshot before it goes in, can edit it, or keep it out.

export type Ev =
  | { kind: 'task'; at: number; text: string }
  | { kind: 'edit'; at: number; file: string }
  | { kind: 'git'; at: number; text: string }
  | { kind: 'error'; at: number; text: string; key: string }
  | { kind: 'fixed'; at: number; key: string }
  | { kind: 'decision'; at: number; text: string }

/** Files whose names are never written down, not even as a path that was edited. */
export const SECRET_FILE = /(^|\/)(\.env(\..*)?|\.dev\.vars|\.npmrc|\.netrc|id_(rsa|ed25519|ecdsa)(\.pub)?|credentials(\.json)?|.*\.(pem|key|p12|pfx))$/i

const one = (s: string, n = 200) => s.replace(/\s+/g, ' ').trim().slice(0, n)
const errKey = (s: string) => one(s, 80).replace(/\d+/g, '#').toLowerCase()

/** Events from one tool call: edits, git commands, failures and the end of a failure. */
export function fromTool(tool: string, input: Record<string, unknown>, output: string, at: number): Ev[] {
  const out: Ev[] = []
  const file = String(input.file_path ?? input.notebook_path ?? '')
  if (/^(Edit|MultiEdit|Write|NotebookEdit)$/.test(tool) && file && !SECRET_FILE.test(file)) out.push({ kind: 'edit', at, file })
  if (tool === 'Bash') {
    const cmd = String(input.command ?? '')
    if (/^\s*git\s+(commit|checkout|switch|merge|rebase|reset|stash|branch|push|pull|cherry-pick)\b/.test(cmd)) out.push({ kind: 'git', at, text: one(cmd, 140) })
    const failed = /^error:|exit code [1-9]|\bERR!|Traceback|\bFAIL\b|✗|failed\b/im.exec(output)
    const key = errKey(cmd)
    if (failed) out.push({ kind: 'error', at, text: `${one(cmd, 80)} → ${one(output.slice(Math.max(0, failed.index - 40)), 160)}`, key })
    else out.push({ kind: 'fixed', at, key })
  }
  return out
}

export const record = (evs: Ev[], add: Ev[], max = 400) => [...evs, ...add].slice(-max)
const tok = (s: string) => Math.ceil(s.length / 4)

/** The snapshot under a token budget: the task first, then open errors, edits, git, decisions. */
export function snapshot(evs: Ev[], budget = 600): string {
  if (!evs.length) return ''
  const task = [...evs].reverse().find((e) => e.kind === 'task') as Extract<Ev, { kind: 'task' }> | undefined
  const fixedAfter = (e: Extract<Ev, { kind: 'error' }>) => evs.some((x) => x.kind === 'fixed' && x.key === e.key && x.at > e.at)
  const errors = [...new Map(evs.filter((e): e is Extract<Ev, { kind: 'error' }> => e.kind === 'error' && !fixedAfter(e)).map((e) => [e.key, e])).values()].slice(-5)
  const files = [...new Set(evs.filter((e): e is Extract<Ev, { kind: 'edit' }> => e.kind === 'edit').map((e) => e.file).reverse())].slice(0, 15)
  const git = evs.filter((e): e is Extract<Ev, { kind: 'git' }> => e.kind === 'git').slice(-5).map((e) => e.text)
  const decisions = evs.filter((e): e is Extract<Ev, { kind: 'decision' }> => e.kind === 'decision').slice(-5).map((e) => e.text)
  const sections: [string, string[]][] = [
    ['Working on', task ? [one(task.text, 400)] : []],
    ['Still failing', errors.map((e) => e.text)],
    ['Files changed', files],
    ['Git', git],
    ['Decided', decisions],
  ]
  const head = 'Where this conversation was before the context was compacted (kept by the app from tool calls):'
  let out = head
  for (const [title, items] of sections) {
    if (!items.length) continue
    const block = `\n${title}:\n${items.map((i) => `- ${i}`).join('\n')}`
    if (tok(out + block) <= budget) out += block
    else {
      // fit what still fits of this section, then stop: lower sections matter less
      let part = `\n${title}:`
      for (const i of items) if (tok(out + part + `\n- ${i}`) <= budget) part += `\n- ${i}`
      if (part.includes('\n- ')) out += part
      break
    }
  }
  return out === head ? '' : out
}
