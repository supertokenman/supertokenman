// Phase 110: a GitHub Actions job run here with `act` (MIT, a separate program) before pushing. The
// workflows are read for their jobs; act's log lines become step results; secrets go only when ticked.

export type Job = { file: string; workflow: string; id: string; name: string }
/** Jobs of one workflow file, read from its YAML by indentation (no YAML library needed for this). */
export function jobsOf(file: string, yaml: string): Job[] {
  const lines = yaml.replace(/\r\n/g, '\n').split('\n')
  const workflow = /^name:\s*["']?(.+?)["']?\s*$/m.exec(yaml)?.[1] ?? file.split('/').pop()!.replace(/\.ya?ml$/, '')
  const start = lines.findIndex((l) => /^jobs:\s*$/.test(l))
  if (start < 0) return []
  const out: Job[] = []
  let indent = -1
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i]!
    if (/^\S/.test(l)) break
    const m = /^(\s+)([\w-]+):\s*$/.exec(l)
    if (!m) continue
    if (indent < 0) indent = m[1]!.length
    if (m[1]!.length !== indent) continue
    // the job's display name, if it has one, two spaces deeper
    let name = m[2]!
    for (let j = i + 1; j < lines.length && (lines[j]!.startsWith(' '.repeat(indent + 1)) || !lines[j]!.trim()); j++) {
      const n = new RegExp(`^\\s{${indent + 2}}name:\\s*["']?(.+?)["']?\\s*$`).exec(lines[j]!)
      if (n) { name = n[1]!; break }
    }
    out.push({ file, workflow, id: m[2]!, name })
  }
  return out
}

export type Step = { name: string; status: 'running' | 'success' | 'failure' | 'skipped'; lines: string[] }
export type Run = { job: string; steps: Step[]; done: 'success' | 'failure' | null }

const STRIP = /\u001b\[[0-9;]*m/g
/** Feeds one log line of act (its default text logger) into the run. */
export function feed(run: Run, raw: string): Run {
  const line = raw.replace(STRIP, '').trimEnd()
  const m = /^\[([^\]]+)\]\s+(.*)$/.exec(line)
  if (!m) return run
  const body = m[2]!
  const steps = [...run.steps]
  const cur = steps[steps.length - 1]
  let r: RegExpExecArray | null
  if ((r = /^⭐\s*Run\s+(?:(?:Main|Pre|Post)\s+)?(.+)$/u.exec(body))) steps.push({ name: r[1]!.trim(), status: 'running', lines: [] })
  else if ((r = /^✅\s*Success\s*-\s*(?:(?:Main|Pre|Post)\s+)?(.+?)(?:\s*\[[\d.]+m?s\])?$/u.exec(body))) {
    const s = [...steps].reverse().find((x) => x.name === r![1]!.trim() && x.status === 'running')
    if (s) s.status = 'success'
  } else if ((r = /^❌\s*Failure\s*-\s*(?:(?:Main|Pre|Post)\s+)?(.+?)(?:\s*\[[\d.]+m?s\])?$/u.exec(body))) {
    const s = [...steps].reverse().find((x) => x.name === r![1]!.trim() && x.status === 'running')
    if (s) s.status = 'failure'
  } else if (/^🏁\s*Job succeeded/u.test(body)) return { ...run, steps, done: 'success' }
  else if (/^🏁\s*Job failed/u.test(body)) return { ...run, steps, done: 'failure' }
  else if (cur && /^\s*\|\s?/.test(body)) cur.lines = [...cur.lines, body.replace(/^\s*\|\s?/, '')].slice(-200)
  return { ...run, steps }
}

/** What goes to a panel when a step failed: the step, its last lines, nothing else. */
export function failureReport(r: Run, job: Job): string {
  const f = r.steps.find((s) => s.status === 'failure')
  if (!f) return ''
  return `The CI job "${job.name}" (${job.file}) failed here under act, at step "${f.name}". Its last output:\n\n\`\`\`\n${f.lines.slice(-60).join('\n')}\n\`\`\`\n\nFind the cause and fix it; do not push.`
}

/** act's arguments: this workflow and job, secrets only from a file when any were ticked. */
export const actArgs = (job: Job, secretFile?: string) => ['-W', job.file, '-j', job.id, ...(secretFile ? ['--secret-file', secretFile] : []), '--rm']
