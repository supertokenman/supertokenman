import { describe, expect, it } from 'vitest'
import { actArgs, failureReport, feed, jobsOf, type Run } from './act'

const yml = `name: CI
on: [push]
jobs:
  test:
    name: Unit tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
  lint:
    runs-on: ubuntu-latest
    steps:
      - run: npm run lint
`
describe('act', () => {
  it('lists jobs with their names', () => {
    expect(jobsOf('.github/workflows/ci.yml', yml)).toEqual([
      { file: '.github/workflows/ci.yml', workflow: 'CI', id: 'test', name: 'Unit tests' },
      { file: '.github/workflows/ci.yml', workflow: 'CI', id: 'lint', name: 'lint' },
    ])
  })
  it('reads act log lines into steps', () => {
    let r: Run = { job: 'test', steps: [], done: null }
    for (const l of [
      '[CI/Unit tests] 🚀  Start image=catthehacker/ubuntu:act-latest',
      '[CI/Unit tests] ⭐ Run Main actions/checkout@v4',
      '[CI/Unit tests]   ✅  Success - Main actions/checkout@v4 [120ms]',
      '[CI/Unit tests] ⭐ Run Main npm test',
      '[CI/Unit tests]   | FAIL src/sum.test.ts',
      '[CI/Unit tests]   |   expected 3, received 4',
      '[CI/Unit tests]   ❌  Failure - Main npm test [2.1s]',
      '[CI/Unit tests] 🏁  Job failed',
    ]) r = feed(r, l)
    expect(r.steps.map((s) => [s.name, s.status])).toEqual([['actions/checkout@v4', 'success'], ['npm test', 'failure']])
    expect(r.done).toBe('failure')
    const rep = failureReport(r, { file: 'ci.yml', workflow: 'CI', id: 'test', name: 'Unit tests' })
    expect(rep).toContain('at step "npm test"')
    expect(rep).toContain('expected 3, received 4')
  })
  it('passes secrets only through a file, and only when given', () => {
    const j = { file: 'ci.yml', workflow: 'CI', id: 'test', name: 'x' }
    expect(actArgs(j)).toEqual(['-W', 'ci.yml', '-j', 'test', '--rm'])
    expect(actArgs(j, '/tmp/s')).toContain('--secret-file')
  })
})
