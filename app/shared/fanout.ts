// Fan-out with a scoreboard (idea from Orca): one prompt in several worktree panels at once, and one board
// that puts each attempt's tests, diff, cost and time side by side. The board only suggests a winner;
// merging it stays a click and a confirm.

export type TestRun = { cmd: string; ok: boolean; passed: number; failed: number; ms: number; tail: string }
export type Attempt = { sid: string; attempt: number; model: string; busy: boolean; costUsd: number; ms: number; files: number; added: number; removed: number; tests: TestRun | null }

/** The project's test command, read from what is in its folder; null when none is found. */
export function testCmdOf(files: string[], pkg?: { scripts?: Record<string, string> } | null): string[] | null {
  const has = (f: string) => files.includes(f)
  const t = pkg?.scripts?.test
  if (t && !/no test specified/.test(t)) return has('pnpm-lock.yaml') ? ['pnpm', 'test'] : has('yarn.lock') ? ['yarn', 'test'] : has('bun.lockb') ? ['bun', 'run', 'test'] : ['npm', 'test', '--silent']
  if (has('Cargo.toml')) return ['cargo', 'test', '--quiet']
  if (has('go.mod')) return ['go', 'test', './...']
  if (has('pyproject.toml') || has('pytest.ini') || has('setup.py')) return ['python3', '-m', 'pytest', '-q']
  return null
}

const num = (re: RegExp, s: string) => {
  let n = 0
  for (const m of s.matchAll(re)) n += Number(m[1])
  return n
}

/** Passed and failed counts from vitest, jest, pytest, go test and cargo test output. */
export function countsOf(out: string): { passed: number; failed: number } {
  const s = out.replace(/\x1b\[[0-9;]*m/g, '')
  // vitest / jest summary line
  const vt = /Tests?:?\s+(?:(\d+) failed[ ,|]+)?(\d+) passed/.exec(s)
  if (vt) return { passed: Number(vt[2]), failed: Number(vt[1] ?? 0) }
  const vf = /Tests?:?\s+(\d+) failed/.exec(s)
  if (vf) return { passed: 0, failed: Number(vf[1]) }
  // pytest: "3 passed, 1 failed in 0.2s"
  if (/=+ .*(passed|failed).* in [\d.]+s/.test(s) || /^\d+ (passed|failed)/m.test(s)) return { passed: num(/(\d+) passed/g, s), failed: num(/(\d+) failed/g, s) + num(/(\d+) errors?\b/g, s) }
  // cargo: "test result: ok. 4 passed; 0 failed"
  if (/test result:/.test(s)) return { passed: num(/(\d+) passed;/g, s), failed: num(/(\d+) failed;/g, s) }
  // go: one line per package
  const ok = (s.match(/^ok\s+\S+/gm) ?? []).length
  const bad = (s.match(/^FAIL\s+\S+/gm) ?? []).length
  return { passed: ok, failed: bad }
}

/**
 * The order of the board: finished before busy, tests run and green first, then fewer failures, then a
 * smaller diff, then cheaper, then faster. A diff of nothing is last: there is nothing to merge.
 */
export function rank(rows: Attempt[]): Attempt[] {
  const key = (a: Attempt) => [
    a.busy ? 1 : 0,
    a.files === 0 ? 1 : 0,
    a.tests ? (a.tests.ok ? 0 : 1) : 0.5,
    a.tests?.failed ?? 0,
    a.added + a.removed,
    a.costUsd,
    a.ms,
  ]
  return [...rows].sort((x, y) => {
    const a = key(x)
    const b = key(y)
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!
    return x.attempt - y.attempt
  })
}

/** Why the top row leads, in a few words; null when no attempt is ready. */
export function whyFirst(rows: Attempt[]): string | null {
  const r = rank(rows)
  const top = r[0]
  if (!top || top.busy || !top.files) return null
  const rest = r.slice(1).filter((x) => !x.busy && x.files)
  if (!rest.length) return 'The only attempt with changes.'
  const nxt = rest[0]!
  if (top.tests?.ok && !nxt.tests?.ok) return nxt.tests ? 'Its tests pass and the next one\'s do not.' : 'Its tests pass; the next one\'s were not run.'
  if ((top.tests?.failed ?? 0) < (nxt.tests?.failed ?? 0)) return 'Fewer failing tests.'
  if (top.added + top.removed < nxt.added + nxt.removed) return 'Same test result, smaller diff.'
  if (top.costUsd < nxt.costUsd) return 'Same tests and diff size, cheaper.'
  return 'Ahead on time.'
}
