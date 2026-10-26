// Playbooks: a procedure in a file (.claude/playbooks/*.yaml) the panel follows step by step. Each step
// is a prompt (or a skill), may name a check command that must pass before the next step, and may be a
// checkpoint where the run stops until the person says go. Idea from AgentScope's SOPs; our own code.

export type PbStep = { name: string; prompt: string; skill?: string; check?: string; checkpoint: boolean }
export type Playbook = { name: string; description: string; steps: PbStep[] }
export type PbRun = { id: string; file: string; name: string; sid: string; step: number; of: number; state: 'running' | 'checking' | 'waiting' | 'failed' | 'done' | 'stopped'; at: number; log: { step: number; ok: boolean; check?: string; out?: string; at: number }[] }

const unquote = (v: string) => {
  const t = v.trim()
  const q = t[0]
  if (q === '"' || q === "'") {
    const end = t.indexOf(q, 1)
    if (end > 0) return t.slice(1, end)
  }
  return t.replace(/\s+#.*$/, '')
}

/**
 * The small YAML a playbook uses: top-level name and description, and a steps list of maps whose values
 * are plain, quoted, or block (| or >) text. Throws with the line number on anything else.
 */
export function parsePlaybook(src: string): Playbook {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const top: Record<string, string> = {}
  const steps: Record<string, string>[] = []
  let i = 0
  const blockAt = (start: number, indent: number, fold: boolean): [string, number] => {
    const out: string[] = []
    let j = start
    for (; j < lines.length; j++) {
      const l = lines[j]!
      if (l.trim() === '') {
        out.push('')
        continue
      }
      const ind = l.length - l.trimStart().length
      if (ind < indent) break
      out.push(l.slice(indent))
    }
    while (out.length && out[out.length - 1] === '') out.pop()
    return [fold ? out.join(' ').replace(/\s+/g, ' ').trim() : out.join('\n'), j]
  }
  while (i < lines.length) {
    const l = lines[i]!
    if (!l.trim() || l.trim().startsWith('#')) {
      i++
      continue
    }
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(l)
    if (!m) throw new Error(`Line ${i + 1}: expected "key: value".`)
    const [, key, rest] = m
    if (key === 'steps') {
      i++
      let cur: Record<string, string> | null = null
      while (i < lines.length) {
        const s = lines[i]!
        if (!s.trim() || s.trim().startsWith('#')) {
          i++
          continue
        }
        const ind = s.length - s.trimStart().length
        if (ind === 0) break
        const item = /^(\s*)-\s+([A-Za-z_][\w-]*):\s*(.*)$/.exec(s)
        const field = /^(\s*)([A-Za-z_][\w-]*):\s*(.*)$/.exec(s)
        const hit = item ?? field
        if (!hit) throw new Error(`Line ${i + 1}: expected "- key: value" or "key: value" in steps.`)
        if (item) steps.push((cur = {}))
        if (!cur) throw new Error(`Line ${i + 1}: a step starts with "- ".`)
        const k = hit[2]!
        const v = hit[3]!
        if (v === '|' || v === '>') {
          const keyIndent = (item ? hit[1]!.length + 2 : hit[1]!.length) + 2
          const [text, next] = blockAt(i + 1, keyIndent, v === '>')
          cur[k] = text
          i = next
        } else {
          cur[k] = unquote(v)
          i++
        }
      }
      continue
    }
    if (rest === '|' || rest === '>') {
      const [text, next] = blockAt(i + 1, 2, rest === '>')
      top[key!] = text
      i = next
    } else {
      top[key!] = unquote(rest!)
      i++
    }
  }
  if (!top.name) throw new Error('A playbook needs a name.')
  if (!steps.length) throw new Error('A playbook needs steps.')
  return {
    name: top.name,
    description: top.description ?? '',
    steps: steps.map((s, k) => {
      if (!s.prompt && !s.skill) throw new Error(`Step ${k + 1} needs a prompt or a skill.`)
      return { name: s.name || `Step ${k + 1}`, prompt: s.prompt ?? '', ...(s.skill ? { skill: s.skill } : {}), ...(s.check ? { check: s.check } : {}), checkpoint: /^(true|yes)$/i.test(s.checkpoint ?? '') }
    }),
  }
}

/** What the panel is told for a step: the skill first if any, then the prompt and what will check it. */
export function stepPrompt(pb: Playbook, i: number, failed?: { check: string; out: string }): string {
  const s = pb.steps[i]!
  const head = `[Playbook "${pb.name}", step ${i + 1} of ${pb.steps.length}: ${s.name}]`
  if (failed) return `${head}\nThe check \`${failed.check}\` failed after this step. Fix what it shows, then stop.\n\n\`\`\`\n${failed.out.slice(-3000)}\n\`\`\``
  return [head, s.skill ? `Use the ${s.skill} skill.` : '', s.prompt, s.check ? `When you are done, \`${s.check}\` must pass; the app runs it after you stop.` : ''].filter(Boolean).join('\n\n')
}

export const EXAMPLE_PLAYBOOK = `name: Upgrade a dependency
description: Bump one package, fix what breaks, and stop for a look before the changelog.
steps:
  - name: Bump it
    prompt: |
      Upgrade the package named in the goal to its latest minor version.
      Change only package.json and the lockfile.
    check: npm test
  - name: Fix what broke
    prompt: Read the release notes and fix any call sites the upgrade broke.
    check: npm test
    checkpoint: true
  - name: Changelog
    prompt: Add one line to CHANGELOG.md under Unreleased.
`
