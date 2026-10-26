// Message filters: small functions the person writes that change a message before it goes to Claude
// (inlet) or a reply before it is shown (outlet). They run in an isolated worker with no network, no
// files, no require and a time limit (electron/filterbox.ts); a filter that fails is skipped, not trusted.
// Idea from Open WebUI's filters (valves); our own code.

export type Stage = 'inlet' | 'outlet'
export type MsgFilter = { id: string; name: string; code: string; valves: Record<string, unknown>; on: boolean; order: number; projects: string[] }

export const MAX_CODE = 20_000

export const EXAMPLE = `// name: Trim long stack traces
// valves: {"maxLines": 40}
// Runs on your message before it goes. inlet(text, valves) and outlet(text, valves) return the new text.
function inlet(text, valves) {
  return text.replace(/((?:^\\s+at .+\\n?){1,})/gm, (block) => {
    const lines = block.split('\\n').filter(Boolean)
    return lines.length <= valves.maxLines ? block : lines.slice(0, valves.maxLines).join('\\n') + '\\n    ... ' + (lines.length - valves.maxLines) + ' more frames\\n'
  })
}
`

/** The name and default valves a filter declares in its first comment lines. */
export function headerOf(code: string): { name: string; valves: Record<string, unknown>; stages: Stage[]; error?: string } {
  const name = /^\s*\/\/\s*name:\s*(.+)$/m.exec(code)?.[1]?.trim() ?? 'Untitled filter'
  let valves: Record<string, unknown> = {}
  let error: string | undefined
  const v = /^\s*\/\/\s*valves:\s*(\{.*\})\s*$/m.exec(code)?.[1]
  if (v)
    try {
      valves = JSON.parse(v) as Record<string, unknown>
    } catch {
      error = 'The valves line is not valid JSON.'
    }
  const stages = (['inlet', 'outlet'] as const).filter((s) => new RegExp(`function\\s+${s}\\s*\\(`).test(code))
  if (!stages.length) error = 'Define function inlet(text, valves) or function outlet(text, valves).'
  if (code.length > MAX_CODE) error = `Over ${MAX_CODE.toLocaleString()} characters.`
  return { name, valves, stages, ...(error ? { error } : {}) }
}

/** The filters that run for a project at a stage, in order. No projects listed means every project. */
export function activeFor(filters: MsgFilter[], cwd: string, stage: Stage): MsgFilter[] {
  return filters
    .filter((f) => f.on && headerOf(f.code).stages.includes(stage) && !headerOf(f.code).error)
    .filter((f) => !f.projects.length || f.projects.some((p) => cwd === p || cwd.startsWith(`${p}/`)))
    .sort((a, b) => a.order - b.order)
}

/** A filter's answer is used only if it is text and not wildly larger than what went in. */
export function acceptable(before: string, after: unknown): after is string {
  return typeof after === 'string' && after.length <= Math.max(before.length * 4, before.length + 20_000)
}
