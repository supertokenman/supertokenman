import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'supertokenman',
  component: 'Pane',
  requestId: 'supertokenman',
  props: { title: 'SuperTokenMan', isFocused: false, bodyColumns: 48, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const STEP = { turnId: 't1', model: 'claude-opus-5-5', messageCount: 2 } as const

test('the details pane shows context, plan, cost and savings in BRL, and ranks what costs most', async ($, on) => {
  // Nothing sits beneath the plugin: each hook here stands for the engine.
  on('command.register', () => ({ value: { command: 'supertokenman' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  let now = Date.parse('2026-10-22T12:00:00Z')
  on('clock.now', () => ({ value: (now += 1000) }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('env.get', (_, e) => ({ value: e.name === 'TOKEN_KIT_HOME' ? '/kit' : undefined }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: '{"rates":{"BRL":5}}' } }))
  on('fs.read', (_, e) => {
    if (e.path === '/kit/config.json') return { value: '{"money":{"currency":"BRL"}}' }
    // only this month's file has the cut; last month's is missing
    if (e.path === '/kit/stats-2026-10.jsonl')
      return { value: `${JSON.stringify({ ts: '2000-01-01T00:00:00Z', kind: 'wrap', profile: 'test', session: 'sess-1', inChars: 40400, outChars: 400 })}\n` }
    throw new Error('missing')
  })
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: 68000, window: 200000, percent: 34 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 23, resetsAt: '2026-10-22T14:30:00Z' },
        { kind: 'seven_day', percentUsed: 41 },
      ],
      cost: { usd: 2.5 },
    },
  }))
  on('tool.call', () => ({ result: {}, text: 'x'.repeat(35000) }))
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  for (let index = 0; index < 3; index++) for await (const _ of $.turn.step({ ...STEP, index })) void _

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    for (const words of [/34%/, /68k of 200k tokens/, /5h {2}23%/, /7d {2}41%/, /R\$12\.50/, /3 requests/, /saved by token-kit/, /npm test/, /10k tok x3/])
      expect((await ui.find({ type: 'Text', text: words }))?.text).toMatch(words)
    // 10k tokens written once ($8/MTok) and re-read 3 times ($0.20/MTok) = $0.086 = R$0.43
    expect((await ui.find({ type: 'Text', text: /saved by token-kit/ }))?.text).toBe('R$0.43 saved by token-kit  1 cut')
    // the npm test output (35k chars, ~10k tokens) entered before 3 requests: same cost
    expect((await ui.find({ type: 'Text', text: /npm test/ }))?.text).toBe('  R$0.43  npm test  10k tok x3')
    await ui.unmount()

    // the widget above the prompt: always on, one line, with a button to the pane
    const band = await $.ui.mount({ plugin: 'supertokenman', component: 'AbovePrompt', requestId: 'above', surface, props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 6 } } as never })
    for (const words of [/^SuperTokenMan$/, /^ctx 34% 68k$/, /^5h 23%$/, /^7d 41%$/, /^R\$12\.50$/, /^saved R\$0\.43$/])
      expect((await band.find({ type: 'Text', text: words }))?.text).toMatch(words)
    await band.press({ key: 'details' })
    await band.unmount()
  }
})
