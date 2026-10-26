import { describe, expect, it } from 'vitest'
import { countsOf, rank, testCmdOf, whyFirst, type Attempt } from './fanout'

const at = (o: Partial<Attempt>): Attempt => ({ sid: 's', attempt: 1, model: 'm', busy: false, costUsd: 0.1, ms: 1000, files: 1, added: 10, removed: 0, tests: null, ...o })

describe('fanout', () => {
  it('finds the test command', () => {
    expect(testCmdOf(['package.json', 'pnpm-lock.yaml'], { scripts: { test: 'vitest run' } })).toEqual(['pnpm', 'test'])
    expect(testCmdOf(['package.json'], { scripts: { test: 'echo "Error: no test specified" && exit 1' } })).toBeNull()
    expect(testCmdOf(['go.mod'])).toEqual(['go', 'test', './...'])
    expect(testCmdOf(['pyproject.toml'])).toEqual(['python3', '-m', 'pytest', '-q'])
    expect(testCmdOf(['README.md'])).toBeNull()
  })
  it('counts tests from each runner', () => {
    expect(countsOf('      Tests  1 failed | 3 passed (4)')).toEqual({ passed: 3, failed: 1 })
    expect(countsOf('Tests:       2 failed, 5 passed, 7 total')).toEqual({ passed: 5, failed: 2 })
    expect(countsOf('\x1b[32m      Tests  12 passed\x1b[0m (12)')).toEqual({ passed: 12, failed: 0 })
    expect(countsOf('==== 3 passed, 1 failed in 0.12s ====')).toEqual({ passed: 3, failed: 1 })
    expect(countsOf('test result: ok. 4 passed; 0 failed; 0 ignored')).toEqual({ passed: 4, failed: 0 })
    expect(countsOf('ok  \tex/a\t0.1s\nFAIL\tex/b\t0.2s\n')).toEqual({ passed: 1, failed: 1 })
  })
  it('ranks green, then smaller, then cheaper; busy and empty last', () => {
    const t = (ok: boolean, failed = 0) => ({ cmd: 'npm test', ok, passed: 3, failed, ms: 10, tail: '' })
    const rows = [
      at({ sid: 'a', attempt: 1, tests: t(false, 2) }),
      at({ sid: 'b', attempt: 2, tests: t(true), added: 50 }),
      at({ sid: 'c', attempt: 3, tests: t(true), added: 20 }),
      at({ sid: 'd', attempt: 4, busy: true }),
      at({ sid: 'e', attempt: 5, files: 0 }),
    ]
    expect(rank(rows).map((r) => r.sid)).toEqual(['c', 'b', 'a', 'e', 'd'])
    expect(whyFirst(rows)).toBe('Same test result, smaller diff.')
    expect(whyFirst([rows[0]!, rows[1]!])).toBe("Its tests pass and the next one's do not.")
    expect(whyFirst([rows[3]!])).toBeNull()
  })
})
