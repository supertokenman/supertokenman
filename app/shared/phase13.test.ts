import { describe, expect, it } from 'vitest'
import { activeProvider, applyProvider, BUILT_IN, checkProvider, lineDiff, readConf, type Provider } from './claudeconf'
import { projectFolder, trayTitle, turnsOf, usageSince } from './sessionlog'

const helper = (k: string) => `/usr/local/bin/stm key ${k}`
const MINE = `{
  // my hooks, keep them
  "hooks": { "PostToolUse": [{ "matcher": "Edit", "hooks": [{ "type": "command", "command": "prettier -w" }] }] },
  "env": { "MY_FLAG": "1" },
  "permissions": { "allow": ["Bash(npm test)"] },
}
`
const OR: Provider = { id: 'or', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api', keyName: 'OPENROUTER_KEY', model: 'anthropic/claude-sonnet-5.5', smallModel: '' }

describe('providers', () => {
  it('changes only its own keys and keeps comments, hooks and the rest', () => {
    const out = applyProvider(MINE, OR, helper)
    expect(out).toContain('// my hooks, keep them')
    expect(out).toContain('"command": "prettier -w"')
    expect(out).toContain('"MY_FLAG": "1"')
    expect(out).toContain('"allow": ["Bash(npm test)"]')
    const v = readConf(out).value as { env: Record<string, string>; apiKeyHelper: string }
    expect(v.env).toEqual({ MY_FLAG: '1', ANTHROPIC_BASE_URL: 'https://openrouter.ai/api', ANTHROPIC_MODEL: 'anthropic/claude-sonnet-5.5' })
    expect(v.apiKeyHelper).toBe('/usr/local/bin/stm key OPENROUTER_KEY')
    expect(out).not.toMatch(/sk-|OPENROUTER_KEY"\s*:/)
    expect(activeProvider(out, [...BUILT_IN, OR], helper)).toBe('or')
    // back to the plain login: ours goes, theirs stays
    const back = applyProvider(out, BUILT_IN[0]!, helper)
    expect(readConf(back).value).toEqual(readConf(MINE).value)
    expect(back).toContain('// my hooks, keep them')
    expect(activeProvider(back, BUILT_IN, helper)).toBe('claude')
  })

  it('starts a missing file, refuses a broken one, and checks what is typed', () => {
    expect(readConf(applyProvider('', BUILT_IN[1]!, helper)).value).toEqual({ env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:8787' } })
    expect(() => applyProvider('{ "a": ', OR, helper)).toThrow(/does not parse/)
    expect(checkProvider({ name: 'x', baseUrl: 'http://evil.example' })).toMatch(/https/)
    expect(checkProvider({ name: 'x', baseUrl: 'https://relay.example' })).toMatch(/needs a key/)
    expect(checkProvider({ name: 'x', baseUrl: 'https://a.example', keyName: 'sk-123' })).toMatch(/vault entry/)
    expect(checkProvider(OR)).toBeNull()
  })

  it('shows the lines that change', () => {
    expect(lineDiff('a\nb\nc', 'a\nB\nc\nd').filter((l) => l.sign !== ' ')).toEqual([{ sign: '-', text: 'b' }, { sign: '+', text: 'B' }, { sign: '+', text: 'd' }])
  })
})

const LOG = [
  { type: 'user', timestamp: '2026-10-25T10:00:00Z', message: { role: 'user', content: '<system-reminder>x</system-reminder>Fix the checkout total' } },
  { type: 'assistant', timestamp: '2026-10-25T10:00:05Z', message: { content: [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: '/p/src/cart.ts' } }, { type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'npm test' } }], usage: { input_tokens: 1000, output_tokens: 300, cache_read_input_tokens: 5000 } } },
  { type: 'user', timestamp: '2026-10-25T10:00:09Z', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }, { type: 'tool_result', tool_use_id: 't2', is_error: true, content: 'FAIL src/cart.test.ts > total\nExpected 10' }] } },
  { type: 'assistant', timestamp: '2026-10-25T10:01:00Z', message: { content: [{ type: 'tool_use', id: 't3', name: 'Write', input: { file_path: '/p/src/cart.test.ts' } }], usage: { input_tokens: 200, output_tokens: 100 } } },
  { type: 'assistant', isSidechain: true, timestamp: '2026-10-25T10:01:30Z', message: { content: [{ type: 'tool_use', id: 's', name: 'Edit', input: { file_path: '/p/side.ts' } }] } },
  { type: 'user', timestamp: '2026-10-25T10:30:00Z', message: { content: [{ type: 'text', text: '[Request interrupted by user]' }] } },
  { type: 'user', timestamp: '2026-10-25T11:00:00Z', message: { content: [{ type: 'text', text: 'Now the README' }] } },
  { type: 'assistant', timestamp: '2026-10-20T11:00:00Z', message: { content: [], usage: { input_tokens: 9, output_tokens: 9 } } },
]
  .map((l) => JSON.stringify(l))
  .join('\n')

describe('session logs', () => {
  it('reads turns with the files changed and the step that failed', () => {
    const t = turnsOf(`${LOG}\nnot json`)
    expect(t.map((x) => x.prompt)).toEqual(['Fix the checkout total', 'Now the README'])
    expect(t[0]).toMatchObject({ files: ['/p/src/cart.ts', '/p/src/cart.test.ts'], failed: [{ tool: 'Bash', error: 'FAIL src/cart.test.ts > total' }], tools: 3, outputTokens: 400 })
    expect(t[1]!.files).toEqual([])
  })

  it('adds up the tokens of a window and words the tray', () => {
    const u = usageSince(LOG, Date.parse('2026-10-25T09:00:00Z'))
    expect(u).toEqual({ input: 1200, output: 400, cacheRead: 5000, cacheWrite: 0, messages: 2 })
    expect(trayTitle([{ kind: 'five_hour', percentUsed: 41.6 }], u)).toBe('42%')
    expect(trayTitle(null, u)).toBe('2k tok')
    expect(projectFolder('/Users/yuji/my app')).toBe('-Users-yuji-my-app')
  })
})
