// Evidence on claims: when a reply says something is fixed, passing, working or faster, whether a test,
// build or measurement ran in that same turn. Only from what the panel saw; it does not read results.
//   observed: a check ran in this turn after the last edit
//   stale: a check ran, but files changed after it
//   inferred: no check ran in this turn

export type Level = 'observed' | 'stale' | 'inferred'
export type Step = { name: string; summary: string }
export type Evidence = { level: Level; claim: string; checks: string[] }

const CLAIM = /\b(?:fixed|fixes|resolved|works now|now works|working now|passes|passing|all tests pass|tests pass|green|faster|quicker|speeds? up|sped up|no longer (?:fails|breaks|crashes)|corrigid[oa]s?|resolvid[oa]|funciona agora|passando|passam|mais r[aá]pid[oa])\b/i
const CHECK = /(?:^|[\s;&|(])(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|t|build|lint|typecheck|check|bench\w*|perf\w*)\b|\b(?:vitest|jest|mocha|pytest|go\s+test|cargo\s+(?:test|build|bench)|tsc|eslint|ruff|mypy|make\s+(?:test|check|build)|hyperfine|playwright\s+test|swift\s+test|xcodebuild|gradle\w*\s+test|mvn\s+test|rspec|phpunit|dotnet\s+test)\b|\btime\s+\S/
const EDIT = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

/** The sentence in `text` that makes the claim, or null when there is none. */
export function claimOf(text: string): string | null {
  // a claim inside the Not verified list is the opposite of one
  const body = text.split(/\n(?:#{1,4}\s*|\*\*)?(?:not verified|não verificado)/i)[0]!
  const m = CLAIM.exec(body)
  if (!m) return null
  const start = Math.max(body.lastIndexOf('\n', m.index), body.lastIndexOf('. ', m.index)) + 1
  const end = body.slice(m.index).search(/[.\n]/)
  return body.slice(start, end < 0 ? undefined : m.index + end).trim().replace(/^[-*\d.)\s]+/, '').slice(0, 160)
}

export const isCheck = (s: Step) => s.name === 'Bash' && CHECK.test(s.summary)

/** Evidence for the last reply of a turn, from the steps it took; null when the reply claims nothing. */
export function evidenceOf(reply: string, steps: Step[]): Evidence | null {
  const claim = claimOf(reply)
  if (!claim) return null
  const lastCheck = steps.map(isCheck).lastIndexOf(true)
  const checks = steps.filter(isCheck).map((s) => s.summary.slice(0, 80))
  if (lastCheck < 0) return { level: 'inferred', claim, checks }
  const editedAfter = steps.slice(lastCheck + 1).some((s) => EDIT.has(s.name))
  return { level: editedAfter ? 'stale' : 'observed', claim, checks }
}

export const evidenceText = (e: Evidence) =>
  e.level === 'observed'
    ? `Observed: ${e.checks.slice(-2).join(', ')} ran in this turn. The panel did not read whether it passed.`
    : e.level === 'stale'
      ? `Not checked since the last edit: ${e.checks.slice(-1)[0]} ran, then files changed.`
      : 'Inferred: no test, build or measurement ran in this turn.'
