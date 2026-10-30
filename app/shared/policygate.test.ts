import { describe, expect, it } from 'vitest'
import { parseRule, type Rule } from './policyrules'
import { absPath, evaluate, strictest, type Call, type Ctx, type Decision, type ScopedRule } from './policygate'

const ctx: Ctx = { project: '/home/u/proj', home: '/home/u', cwd: '/home/u/proj' }
const rule = (line: string, scope: 'global' | 'project' = 'project', n = 1): ScopedRule => {
  const r = parseRule(line, n)
  if ('message' in r) throw new Error(r.message)
  return { scope, rule: r as Rule }
}
const bash = (command: string): Call => ({ tool: 'Bash', input: { command } })
const read = (file_path: string): Call => ({ tool: 'Read', input: { file_path } })
const decide = (rules: ScopedRule[], call: Call, existing: Decision) => evaluate(rules, call, ctx, existing)

describe('evaluation order', () => {
  it('deny beats ask beats allow when all three match', () => {
    const all = [rule('allow Bash'), rule('ask Bash'), rule('deny Bash')]
    expect(decide(all, bash('ls'), 'allow')).toMatchObject({ decision: 'deny', by: 'rule' })
    expect(decide(all.slice(0, 2), bash('ls'), 'allow')).toMatchObject({ decision: 'ask', by: 'rule' })
    expect(decide(all.slice(0, 1), bash('ls'), 'ask')).toMatchObject({ decision: 'allow', by: 'rule', explicit: true })
  })

  it('a global deny wins over a project allow, and a global ask wins over a project allow', () => {
    expect(decide([rule('allow network', 'project'), rule('deny network', 'global', 4)], bash('curl x'), 'ask')).toMatchObject({ decision: 'deny', rule: 'global:4' })
    expect(decide([rule('allow network', 'project'), rule('ask network', 'global', 2)], bash('curl x'), 'ask')).toMatchObject({ decision: 'ask', rule: 'global:2' })
  })

  it('reports the rule label with its note', () => {
    const v = decide([rule('deny Bash when cmd matches "rm*" -- no removals', 'project', 3)], bash('rm a'), 'ask')
    expect(v.rule).toBe('project:3 no removals')
  })

  it('no matching rule leaves the existing decision unchanged, attributed to the app', () => {
    expect(decide([rule('deny Bash when cmd is "nope"')], bash('ls'), 'ask')).toEqual({ decision: 'ask', by: 'app', explicit: false })
    expect(decide([], bash('ls'), 'allow')).toEqual({ decision: 'allow', by: 'app', explicit: false })
  })
})

describe('strictest and explicit allow', () => {
  it('strictest picks deny over ask over allow', () => {
    expect(strictest('allow', 'ask')).toBe('ask')
    expect(strictest('ask', 'allow')).toBe('ask')
    expect(strictest('deny', 'allow')).toBe('deny')
    expect(strictest('allow', 'deny')).toBe('deny')
    expect(strictest('allow', 'allow')).toBe('allow')
  })

  it('an explicit allow turns an existing ask into allow', () => {
    expect(decide([rule('allow read when path inside $project')], read('/home/u/proj/src/a.ts'), 'ask')).toMatchObject({ decision: 'allow', explicit: true })
  })

  it('an allow never overrides a deny from the app', () => {
    expect(decide([rule('allow read')], read('/home/u/proj/a.ts'), 'deny')).toEqual({ decision: 'deny', by: 'app', explicit: false })
  })

  it('an ask rule never loosens a deny from the app', () => {
    expect(decide([rule('ask read')], read('/home/u/proj/a.ts'), 'deny')).toMatchObject({ decision: 'deny' })
  })

  it('an ask rule on an existing allow asks', () => {
    expect(decide([rule('ask read')], read('/home/u/proj/a.ts'), 'allow')).toMatchObject({ decision: 'ask', by: 'rule' })
  })
})

describe('conditions', () => {
  it('rm -rf outside the project is denied; inside is not', () => {
    const r = [rule('deny Bash when cmd matches "rm -rf *" and path outside $project')]
    expect(decide(r, bash('rm -rf /tmp/x'), 'ask').decision).toBe('deny')
    expect(decide(r, bash('rm -rf ./build'), 'ask').decision).toBe('ask')
  })

  it('a command with no path tokens does not match a path condition', () => {
    expect(decide([rule('deny Bash when cmd matches "rm -rf *" and path outside $project')], bash('rm -rf *'), 'ask').decision).toBe('ask')
  })

  it('git push to main is denied, to claude/* allowed by the unless clause, and a bare push is denied', () => {
    const r = [rule('deny Bash when cmd matches "git push*" unless branch matches "claude/*"')]
    expect(decide(r, bash('git push origin main'), 'allow').decision).toBe('deny')
    expect(decide(r, bash('git push -u origin claude/feat-1'), 'allow').decision).toBe('allow')
    expect(decide(r, bash('git push origin claude/x:main'), 'allow').decision).toBe('deny')
    expect(decide(r, bash('git push'), 'allow').decision).toBe('deny')
  })

  it('ask network matches curl, git push and package installs, not ls', () => {
    const r = [rule('ask network')]
    expect(decide(r, bash('curl https://example.com'), 'allow').decision).toBe('ask')
    expect(decide(r, bash('git push origin claude/x'), 'allow').decision).toBe('ask')
    expect(decide(r, bash('npm install left-pad'), 'allow').decision).toBe('ask')
    expect(decide(r, bash('ls -la'), 'allow').decision).toBe('allow')
    expect(decide(r, { tool: 'WebFetch', input: { url: 'https://x.test' } }, 'allow').decision).toBe('ask')
  })

  it('tool globs and the read and write classes', () => {
    expect(decide([rule('deny mcp__stm__ui_*')], { tool: 'mcp__stm__ui_open_panels', input: {} }, 'allow').decision).toBe('deny')
    expect(decide([rule('ask write when path outside $project')], { tool: 'Edit', input: { file_path: '/etc/hosts' } }, 'allow').decision).toBe('ask')
    expect(decide([rule('ask write')], read('/home/u/proj/a'), 'allow').decision).toBe('allow')
  })

  it('arg.<key> conditions read the call input', () => {
    const r = [rule('ask mcp__stm__* when arg.label has "prod"')]
    expect(decide(r, { tool: 'mcp__stm__x', input: { label: 'deploy prod' } }, 'allow').decision).toBe('ask')
    expect(decide(r, { tool: 'mcp__stm__x', input: { label: 'dev' } }, 'allow').decision).toBe('allow')
    expect(decide(r, { tool: 'mcp__stm__x', input: {} }, 'allow').decision).toBe('allow')
  })

  it('host conditions read URLs and strip credentials', () => {
    const r = [rule('deny WebFetch when host matches "*.evil.test"')]
    expect(decide(r, { tool: 'WebFetch', input: { url: 'https://a.evil.test/x' } }, 'allow').decision).toBe('deny')
    expect(decide(r, { tool: 'WebFetch', input: { url: 'https://u:p@good.test/x' } }, 'allow').decision).toBe('allow')
  })

  it('a quoted "$project" is the literal text, not the project folder', () => {
    expect(decide([rule('allow read when path inside "$project"')], read('/home/u/proj/a.ts'), 'ask').decision).toBe('ask')
    expect(decide([rule('allow read when path inside $project')], read('/home/u/proj/a.ts'), 'ask').decision).toBe('allow')
  })

  it('inside does not match a sibling folder that shares the prefix', () => {
    expect(decide([rule('allow read when path inside $project')], read('/home/u/proj-old/a.ts'), 'ask').decision).toBe('ask')
  })
})

describe('fail closed', () => {
  it('an unresolvable command matches a deny with a path condition', () => {
    const r = [rule('deny Bash when cmd matches "echo*" and path outside $project')]
    expect(decide(r, bash('echo $(cat /etc/shadow)'), 'allow').decision).toBe('deny')
    expect(decide(r, bash('echo `id`'), 'allow').decision).toBe('deny')
  })

  it('an unresolvable command never matches an allow', () => {
    expect(decide([rule('allow Bash when path inside $project')], bash('cat $(pwd)/a.txt'), 'ask').decision).toBe('ask')
    expect(decide([rule('allow Bash when path inside $project')], bash('eval "cat /etc/x"'), 'ask').decision).toBe('ask')
  })

  it('an allow with a path condition needs every path inside the project', () => {
    const r = [rule('allow Bash when path inside $project')]
    expect(decide(r, bash('cat ./a.txt'), 'ask').decision).toBe('allow')
    expect(decide(r, bash('cat ./a.txt /etc/hosts'), 'ask').decision).toBe('ask')
  })

  it('a write with no path cannot be allowed by a path condition', () => {
    expect(decide([rule('allow write when path inside $project')], { tool: 'Write', input: {} }, 'ask').decision).toBe('ask')
  })

  it('an unknown host does not satisfy an allow, but does satisfy a deny', () => {
    expect(decide([rule('allow network when host is "good.test"')], bash('wget'), 'ask').decision).toBe('ask')
    expect(decide([rule('deny network when host is "good.test"')], bash('wget'), 'allow').decision).toBe('deny')
  })

  it('a parse-level rule with an unknown field never matches (dropped at parse time)', () => {
    expect(parseRule('allow Bash when color is red')).toHaveProperty('message')
  })
})

describe('absPath', () => {
  it('resolves relative, home and dot-dot paths without touching the disk', () => {
    expect(absPath('src/a.ts', '/home/u/proj', '/home/u')).toBe('/home/u/proj/src/a.ts')
    expect(absPath('../x', '/a/b', '/h')).toBe('/a/x')
    expect(absPath('~/notes', '/a', '/h')).toBe('/h/notes')
    expect(absPath('/etc/../etc/hosts', '/a', '/h')).toBe('/etc/hosts')
  })
})
