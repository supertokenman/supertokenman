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
  on('ui.status', () => ({ value: undefined }))
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

  // the command answers in text, for surfaces that draw no mods (cloud sessions)
  const reply = await $.command.run({ command: 'supertokenman', args: '' } as never)
  expect((reply as { text: string }).text).toMatch(/^SuperTokenMan {2}ctx 34% 68k · 5h 23% · 7d 41% · cache \d+m · R\$12\.50 · saved R\$0\.43\nCosts most:\n {2}R\$0\.43 {2}npm test {2}\(10k tok x3\)$/)

  const line = /^SuperTokenMan {2}ctx 34% 68k · 5h 23% · 7d 41% · cache \d+m · R\$12\.50 · saved R\$0\.43$/

  // the terminal draws text: HP and stamina bars drain as context and plan are spent
  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  for (const words of [/^HP {3}█+░+ 66%$/, /68k of 200k tokens used/, /^5H {3}█+░+ 77%$/, /^7D {3}█+░+ 59%$/, /^TIME .* \d+m$/, /SCORE R\$12\.50 {2}ROUND 3/])
    expect((await ui.find({ type: 'Text', text: words }))?.text).toMatch(words)
  // 10k tokens written once ($8/MTok) and re-read 3 times ($0.20/MTok) = $0.086 = R$0.43
  expect((await ui.find({ type: 'Text', text: /saved by token-kit/ }))?.text).toBe('SCORE R$12.50  ROUND 3  R$0.43 saved by token-kit  1 KO')
  // the npm test output (35k chars, ~10k tokens) entered before 3 requests: same cost
  expect((await ui.find({ type: 'Text', text: /npm test/ }))?.text).toBe('  R$0.43  npm test  10k tok x3')
  await ui.unmount()

  // elsewhere the pane is one SVG character sheet, its alt text the same figures
  const desk = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const sheet = await desk.find({ type: 'Svg' })
  expect(String(sheet?.props.alt).split('\n')[0]).toMatch(line)
  expect(String(sheet?.props.alt)).toContain('R$0.43 npm test (10k tok x3)')
  for (const words of ['SUPERTOKENMAN', '>66%<', '>77%<', '>59%<', 'R$12.50', 'R$0.43', 'BIGGEST ENEMIES', 'npm test', '10k tok x3'])
    expect(String(sheet?.props.source)).toContain(words)
  await desk.unmount()

  // the HUD above the prompt, with a button to the pane
  const above = { plugin: 'supertokenman', component: 'AbovePrompt', requestId: 'above', props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 160, scroll: { offset: 0, bodyRows: 6 } } } as never
  let band = await $.ui.mount({ ...(above as object), surface: 'terminal' } as never)
  expect((await band.find({ type: 'Text', text: /^SUPERTOKENMAN {2}HP/ }))?.text).toMatch(/^SUPERTOKENMAN {2}HP █{7}░{3} 66% {2}5H 77% {2}7D 59% {2}CACHE \d+m {2}ROUND 3 {2}SCORE R\$12\.50 {2}SAVED R\$0\.43 · 1 KO$/)
  await band.press({ key: 'details' })
  await band.unmount()
  band = await $.ui.mount({ ...(above as object), surface: 'desktop' } as never)
  const hud = await band.find({ type: 'Svg' })
  expect(String(hud?.props.alt)).toMatch(line)
  for (const words of ['SUPERTOKENMAN', 'HP 66%', '5H 77% LEFT', '7D 59% LEFT', 'CACHE', 'R$12.50', 'SAVED R$0.43  ·  1 KO']) expect(String(hud?.props.source)).toContain(words)
  await band.press({ key: 'details' })
  await band.unmount()
})

test('a new token-kit cut starts a fight: frames on a timer, KO with the cut, then back to idle', async ($, on) => {
  on('command.register', () => ({ value: { command: 'supertokenman' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push((e as { text: string }).text)
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  let now = Date.parse('2026-10-22T12:00:00Z')
  on('clock.now', () => ({ value: (now += 1000) }))
  // timers wait for the test: each fires when the test releases it
  const timers: { ms: number; fire: () => void }[] = []
  const settle = () => new Promise((r) => (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout(() => r(undefined), 5)) // a fired timer's work is not one of the test's acts
  on('clock.after', (_, e) => new Promise((resolve) => timers.push({ ms: e.ms, fire: () => resolve({ value: undefined }) })))
  on('session.id', () => ({ value: 'sess-1' }))
  on('env.get', (_, e) => ({ value: e.name === 'TOKEN_KIT_HOME' ? '/kit' : undefined }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: '{"rates":{"BRL":5}}' } }))
  const cut = (ts: string) => `${JSON.stringify({ ts, kind: 'wrap', profile: 'test', session: 'sess-1', inChars: 40400, outChars: 400 })}\n`
  let stats = cut('2026-10-22T11:00:00Z')
  on('fs.read', (_, e) => {
    if (e.path === '/kit/config.json') return { value: '{"money":{"currency":"BRL"}}' }
    if (e.path === '/kit/stats-2026-10.jsonl') return { value: stats }
    throw new Error('missing')
  })
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 68000, window: 200000, percent: 34 }, rateLimits: [], cost: { usd: 2.5 } } }))
  on('tool.call', () => {
    stats += cut('2026-10-22T12:05:00Z') // token-kit's post-bash hook cut this output
    return { result: {}, text: 'ok' }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const band = (surface: 'terminal' | 'desktop' = 'terminal') => $.ui.mount({ plugin: 'supertokenman', component: 'AbovePrompt', requestId: 'above', surface, props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 6 } } as never })

  // the cut already there when the session started is caught up, not fought
  let ui = await band()
  expect(await ui.find({ type: 'Text', text: /K\.O\./ })).toBe(undefined)
  await ui.unmount()

  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  ui = await band('terminal')
  // 10k tokens written once to the 1 h cache at $8/MTok = $0.08 = R$0.40
  expect((await ui.find({ type: 'Text', text: /^SUPERTOKENMAN/ }))?.text).toMatch(/ {2}\[T\]o {5}\(>_<\) {2}K\.O\. -10k WASTED TOKENS \+R\$0\.40$/)
  await ui.unmount()
  // elsewhere the SVG HUD plays the KO screen
  ui = await band('desktop')
  expect(String((await ui.find({ type: 'Svg' }))?.props.source)).toContain('-10k WASTED TOKENS')
  await ui.unmount()
  expect(toasts).toEqual(['SuperTokenMan KO: 10k wasted tokens cut, R$0.40 not written'])

  // five frames, 250 ms apart, end on KO
  for (let i = 0; i < 5; i++) {
    expect(timers.at(-1)?.ms).toBe(250)
    timers.at(-1)?.fire()
    await settle()
  }
  ui = await band()
  expect((await ui.find({ type: 'Text', text: /^SUPERTOKENMAN/ }))?.text).toContain('  [T]o      KO! ')
  await ui.unmount()

  // KO held, then idle again
  expect(timers.at(-1)?.ms).toBe(3000)
  timers.at(-1)?.fire()
  await settle()
  ui = await band()
  expect(await ui.find({ type: 'Text', text: /K\.O\./ })).toBe(undefined)
  await ui.unmount()
})
