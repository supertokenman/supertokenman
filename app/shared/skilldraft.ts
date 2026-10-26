// Skills from experience (idea from Hermes Agent): after a task went well, the app drafts a Claude Code
// skill from what the panel actually did (the ask, the steps, the checks, the files). The draft is only
// text in the app until you approve it; approving writes .claude/skills/<name>/SKILL.md, which is when
// Claude Code starts using it.

export type DraftTurn = { prompt: string; reply: string; tools: { name: string; summary: string }[] }
export type SkillDraft = { name: string; description: string; body: string }

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '')
const STOP = new Set(['a', 'an', 'the', 'to', 'for', 'of', 'in', 'on', 'and', 'or', 'please', 'can', 'you', 'this', 'that', 'it', 'my', 'me', 'with', 'so', 'is', 'are', 'be'])
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()
const CHECK = /\b(test|vitest|jest|pytest|lint|eslint|tsc|typecheck|build|cargo (test|check|clippy)|go (test|vet))\b/i

/** A short kebab name from the ask: its first meaningful words. */
export function nameOf(prompt: string): string {
  const words = oneLine(prompt).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w)).slice(0, 4)
  return slug(words.join('-')) || 'learned-task'
}

/** The steps the panel took, as instructions: reads grouped, edits by file, commands as written. */
export function stepsOf(turns: DraftTurn[]): { steps: string[]; checks: string[]; files: string[] } {
  const steps: string[] = []
  const checks: string[] = []
  const files: string[] = []
  const add = (s: string) => steps[steps.length - 1] !== s && steps.push(s)
  for (const t of turns) {
    for (const x of t.tools) {
      const what = oneLine(x.summary).slice(0, 160)
      if (/^(Read|Grep|Glob|LS)$/.test(x.name)) add(`Look at the relevant code first (${x.name === 'Read' ? 'read' : 'search'}${what ? `: ${what}` : ''}).`.replace(/\(read: (.*)\)/, '(for example $1)'))
      else if (/^(Edit|MultiEdit|Write|NotebookEdit)$/.test(x.name)) {
        if (what && !files.includes(what)) files.push(what)
        add(`Make the change in ${what || 'the file'}.`)
      } else if (x.name === 'Bash') {
        if (CHECK.test(what)) {
          if (!checks.includes(what)) checks.push(what)
          add(`Run \`${what}\` and fix what it reports.`)
        } else add(`Run \`${what}\`.`)
      } else if (x.name.startsWith('mcp__')) add(`Use the ${x.name.split('__')[1]} tool ${x.name.split('__').slice(2).join('__')}${what ? ` (${what})` : ''}.`)
      else add(`${x.name}${what ? `: ${what}` : ''}.`)
    }
  }
  // repeated reads collapse to the first one
  const firstRead = steps.findIndex((s) => s.startsWith('Look at'))
  const out = steps.filter((s, i) => !s.startsWith('Look at') || i === firstRead)
  return { steps: out.slice(0, 14), checks, files: files.slice(0, 12) }
}

/** The first draft, made only from what happened; nothing is invented. */
export function draftOf(turns: DraftTurn[], ctx: { project: string; date: string }): SkillDraft {
  const ask = oneLine(turns[0]?.prompt ?? '')
  const { steps, checks, files } = stepsOf(turns)
  const outcome = oneLine(turns[turns.length - 1]?.reply ?? '').slice(0, 300)
  const description = `Use when asked to ${ask.replace(/[.?!]+$/, '').replace(/^(please|can you|could you)\s+/i, '').slice(0, 180).replace(/^./, (c) => c.toLowerCase())}. Learned from a task done in ${ctx.project}.`
  const body = [
    `# ${ask.slice(0, 80) || 'Learned task'}`,
    '',
    '## When to use',
    `The person asks for something like: "${ask.slice(0, 300)}".`,
    '',
    '## Steps',
    ...(steps.length ? steps.map((s, i) => `${i + 1}. ${s}`) : ['1. (No tool steps were recorded; describe them here.)']),
    '',
    ...(checks.length ? ['## Checks before saying it is done', ...checks.map((c) => `- \`${c}\` passes.`), ''] : []),
    ...(files.length ? ['## Files it touched last time', ...files.map((f) => `- ${f}`), ''] : []),
    ...(outcome ? ['## What a good result looked like', outcome, ''] : []),
    '## Notes',
    `Drafted by SuperTokenMan from a session in ${ctx.project} on ${ctx.date}, after it was rated good. Edit freely.`,
  ].join('\n')
  return { name: nameOf(ask), description, body }
}

const SECRET = /\b(sk-[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,})/

/** What stops a draft from being approved, or null. */
export function checkDraft(d: SkillDraft): string | null {
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(d.name)) return 'The name is 2 to 64 lowercase letters, digits and dashes.'
  if (!d.description.trim()) return 'Say when Claude should use it: the description is what it reads to decide.'
  if (d.description.length > 1024) return 'The description is over 1024 characters.'
  if (/\n/.test(d.description)) return 'The description is one line.'
  if (!d.body.trim()) return 'The skill has no instructions.'
  if (SECRET.test(`${d.description}\n${d.body}`)) return 'It contains what looks like a key or token. Take it out: skills are plain files.'
  return null
}

/** The SKILL.md file. */
export function skillMd(d: SkillDraft): string {
  const desc = d.description.replace(/"/g, '\\"')
  return `---\nname: ${d.name}\ndescription: "${desc}"\n---\n\n${d.body.trim()}\n`
}

/** Prompt for the local model to tighten a draft without adding anything that did not happen. */
export const POLISH = 'You edit a Claude Code skill (SKILL.md body in Markdown). Make the steps general enough to reuse on a similar task, short and imperative. Keep every command, path and check exactly as written. Do not add steps, tools or facts that are not in the draft. Answer with the Markdown body only, no front matter.'

/** Why a polished body is refused: it dropped a command or path the draft had, or it lost its steps. */
export function polishLost(before: string, after: string): string | null {
  const kept = (before.match(/`[^`\n]+`/g) ?? []).filter((c) => !after.includes(c))
  if (kept.length) return `it dropped ${kept.slice(0, 3).join(', ')}`
  if (/^\d+\. /m.test(before) && !/^\s*(\d+\.|[-*]) /m.test(after)) return 'it lost the steps'
  if (after.trim().length < Math.min(80, before.trim().length / 4)) return 'it came back too short'
  return null
}
