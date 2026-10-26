// Spec first: a big request goes through a spec, its open questions, a plan and a task list, each
// written to a file in the project and approved before the next, and only then becomes code. The
// files live in the repository (docs/specs/<name>/), so they are reviewed and versioned like code.

export type SpecStage = 'spec' | 'plan' | 'tasks'
export type SpecTask = { id: string; done: boolean; persona?: string; text: string; line: number }

export const specSlug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'spec'

export const specDir = (slug: string) => `docs/specs/${slug}`

/** What the panel is asked at each stage; each one ends by stopping for the person. */
export function stageMessage(stage: SpecStage, slug: string, request = '', personas: string[] = []): string {
  const dir = specDir(slug)
  if (stage === 'spec')
    return [
      `Spec first. Do not write code yet. The request:`,
      '',
      request.trim(),
      '',
      `1. Write ${dir}/spec.md: the problem, who it is for, what done looks like (acceptance criteria as a list), what is out of scope. Follow the project constitution if there is one.`,
      '2. Then list in your reply, numbered, at most 5 questions whose answers would change the spec. Do not assume answers.',
      '3. Stop there and wait.',
    ].join('\n')
  if (stage === 'plan')
    return [
      `The spec in ${dir}/spec.md is approved (with the answers above, if any: update the spec with them first).`,
      `Write ${dir}/plan.md: the technical approach, the files and modules it touches, data or API changes, risks, and how it will be tested. Keep it short. Do not write code yet. Stop when the plan is written.`,
    ].join('\n')
  return [
    `The plan in ${dir}/plan.md is approved.`,
    `Write ${dir}/tasks.md as a checklist, one small task per line, in order, each one doable in one sitting:`,
    '`- [ ] T1 [persona] what to do`',
    `where persona is the best fit of: ${personas.length ? personas.join(', ') : 'any role'}. Do not start the tasks. Stop when the list is written. As tasks get done later, tick them in this file ([x]).`,
  ].join('\n')
}

/** The checklist of a tasks.md: `- [ ] T1 [frontend] Make the form` lines, ticked or not. */
export function parseTasks(md: string): SpecTask[] {
  const out: SpecTask[] = []
  md.split('\n').forEach((raw, i) => {
    const m = /^\s*[-*]\s+\[( |x|X)\]\s+(?:\*\*)?(T\d+)?(?:\*\*)?[.:)]?\s*(?:\[([\w -]+)\])?\s*(.+)$/.exec(raw)
    if (!m) return
    out.push({ id: m[2] ?? `T${out.length + 1}`, done: m[1] !== ' ', persona: m[3]?.trim().toLowerCase().replace(/\s+/g, '-') || undefined, text: m[4]!.trim(), line: i + 1 })
  })
  return out
}

/** What a task is sent as: the task, and where its spec and plan are, so the panel reads only those. */
export function taskMessage(slug: string, t: SpecTask): string {
  const dir = specDir(slug)
  return `Task ${t.id} of the spec in ${dir}: ${t.text}\n\nRead ${dir}/spec.md and ${dir}/plan.md for context (not the whole project). Do only this task, then tick ${t.id} in ${dir}/tasks.md ([x]) and say in two lines what you did.`
}

/** The constitution a project starts with: its rules and the decisions taken so far, for the person to edit. */
export function draftConstitution(project: string, decisions: string[]): string {
  return [
    `# ${project} constitution`,
    '',
    'Principles every panel in this project follows. Edit freely; every new panel gets this file.',
    '',
    '## Principles',
    '',
    '- Small, reviewable changes; tests for behavior that changes.',
    '- Ask before adding a dependency.',
    '- Keep secrets out of the repository.',
    '',
    '## Decisions',
    '',
    ...(decisions.length ? decisions.map((d) => `- ${d}`) : ['- None recorded yet.']),
    '',
  ].join('\n')
}
