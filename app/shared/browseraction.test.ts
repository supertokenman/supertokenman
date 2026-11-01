import { describe, expect, it } from 'vitest'
import { BROWSER_TOOLS, mcpName, toolFromMcp, validateAction, type ActionContext } from './browseraction'

const ctx: ActionContext = { revision: 4, count: 12, tabs: [1, 2] }
const ok = (tool: string, input: unknown, c: ActionContext = ctx) => {
  const r = validateAction(tool, input, c)
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`)
  return r.value
}
const err = (tool: string, input: unknown, c: ActionContext = ctx) => {
  const r = validateAction(tool, input, c)
  if (r.ok) throw new Error('expected an error')
  return r.error
}

describe('browser action validation: every tool', () => {
  it('has the seventeen tools of the spec, with mcp names', () => {
    expect(BROWSER_TOOLS).toHaveLength(18)
    expect(mcpName('tab_new')).toBe('mcp__stm__browser_tab_new')
    expect(toolFromMcp('mcp__stm__browser_click')).toBe('click')
    expect(toolFromMcp('mcp__stm__browser_evaluate')).toBeUndefined()
    expect(toolFromMcp('Bash')).toBeUndefined()
  })
  it('open takes an http or https url, and an optional open tab', () => {
    expect(ok('open', { url: 'https://example.com/a' })).toEqual({ tool: 'open', url: 'https://example.com/a' })
    expect(ok('open', { url: 'http://example.com', tab: 2 })).toEqual({ tool: 'open', url: 'http://example.com', tab: 2 })
    expect(err('open', { url: 'file:///etc/passwd' })).toContain('http or https')
    expect(err('open', { url: 'javascript:alert(1)' })).toContain('http or https')
    expect(err('open', { url: 'not a url' })).toContain('http or https')
    expect(err('open', { url: 'https://example.com', tab: 9 })).toContain('open tab')
  })
  it('takeover takes one of the fixed reasons', () => {
    expect(ok('takeover', { reason: 'sign-in' })).toEqual({ tool: 'takeover', reason: 'sign-in' })
    expect(err('takeover', { reason: 'bored' })).toContain('reason must be one of')
  })
  it('read, elements and screenshot take an optional tab', () => {
    expect(ok('read', {})).toEqual({ tool: 'read', page: 1 })
    expect(ok('read', { page: 3, tab: 1 })).toEqual({ tool: 'read', page: 3, tab: 1 })
    expect(err('read', { page: 0 })).toContain('page')
    expect(ok('elements', {})).toEqual({ tool: 'elements' })
    expect(ok('screenshot', { tab: 2 })).toEqual({ tool: 'screenshot', tab: 2 })
  })
  it('click, type and select need the tab, the revision and an index', () => {
    expect(ok('click', { tab: 1, revision: 4, index: 7 })).toEqual({ tool: 'click', tab: 1, revision: 4, index: 7 })
    expect(ok('type', { tab: 1, revision: 4, index: 2, text: 'hello' })).toEqual({
      tool: 'type', tab: 1, revision: 4, index: 2, text: 'hello', submit: false,
    })
    expect(ok('type', { tab: 1, revision: 4, index: 2, text: '', submit: true })).toMatchObject({ submit: true, text: '' })
    expect(ok('select', { tab: 2, revision: 4, index: 3, value: 'Brazil' })).toMatchObject({ value: 'Brazil' })
    expect(err('click', { tab: 1, revision: 4 })).toContain('index')
    expect(err('click', { tab: 1, revision: 4, index: 0 })).toContain('index')
    expect(err('click', { tab: 1, revision: 4, index: 1.5 })).toContain('index')
    expect(err('type', { tab: 1, revision: 4, index: 2, text: 'x'.repeat(2001) })).toContain('2000')
    expect(err('type', { tab: 1, revision: 4, index: 2, text: 'a', submit: 'yes' })).toContain('submit')
  })
  it('scroll, wait, back and forward have their fixed choices', () => {
    expect(ok('scroll', { direction: 'down' })).toEqual({ tool: 'scroll', direction: 'down', amount: 'page' })
    expect(ok('scroll', { direction: 'up', amount: 'half', tab: 1 })).toEqual({ tool: 'scroll', tab: 1, direction: 'up', amount: 'half' })
    expect(err('scroll', { direction: 'left' })).toContain('direction')
    expect(err('scroll', { direction: 'down', amount: '3000px' })).toContain('amount')
    expect(ok('wait', { until: 'load' })).toEqual({ tool: 'wait', until: 'load' })
    expect(ok('wait', { until: 'selector', selector: '#done', timeoutMs: 5000 })).toEqual({
      tool: 'wait', until: 'selector', selector: '#done', timeoutMs: 5000,
    })
    expect(err('wait', { until: 'selector' })).toContain('selector')
    expect(err('wait', { until: 'load', selector: '#x' })).toContain('load takes no')
    expect(err('wait', { until: 'selector', selector: '#x', timeoutMs: 999999 })).toContain('timeoutMs')
    expect(ok('back', {})).toEqual({ tool: 'back' })
    expect(ok('forward', { tab: 1 })).toEqual({ tool: 'forward', tab: 1 })
  })
  it('tab_new, tab_switch and tab_close', () => {
    expect(ok('tab_new', {})).toEqual({ tool: 'tab_new' })
    expect(ok('tab_new', { url: 'https://example.com' })).toEqual({ tool: 'tab_new', url: 'https://example.com' })
    expect(err('tab_new', { url: 'chrome://settings' })).toContain('http or https')
    expect(ok('tab_switch', { tab: 2 })).toEqual({ tool: 'tab_switch', tab: 2 })
    expect(err('tab_close', { tab: 5 })).toContain('open tab')
  })
  it('done takes a summary', () => {
    expect(ok('done', { summary: 'Found three flights.' })).toEqual({ tool: 'done', summary: 'Found three flights.' })
    expect(err('done', { summary: '' })).toContain('summary')
  })
})

describe('browser action validation: index references', () => {
  it('refuses an index before any element list exists', () => {
    expect(err('click', { tab: 1, revision: 1, index: 1 }, { tabs: [1] })).toContain('call elements first')
  })
  it('refuses a stale revision', () => {
    expect(err('click', { tab: 1, revision: 3, index: 1 })).toContain('call elements again')
  })
  it('refuses an index past the end of the list', () => {
    expect(err('click', { tab: 1, revision: 4, index: 13 })).toContain('no element 13')
  })
  it('refuses a tab that is not open', () => {
    expect(err('click', { tab: 3, revision: 4, index: 1 })).toContain('open tab')
  })
})

describe('browser action validation: steps', () => {
  const steps = (actions: unknown[], revision = 4) => ({ tab: 1, revision, actions })
  it('validates each action in a batch and takes the tab and revision from the call', () => {
    const v = ok('steps', steps([
      { tool: 'click', index: 2 },
      { tool: 'type', index: 3, text: 'Ana', submit: true },
      { tool: 'wait', until: 'load' },
      { tool: 'scroll', direction: 'down' },
    ]))
    expect(v).toEqual({
      tool: 'steps',
      tab: 1,
      revision: 4,
      actions: [
        { tool: 'click', index: 2 },
        { tool: 'type', index: 3, text: 'Ana', submit: true },
        { tool: 'wait', until: 'load' },
        { tool: 'scroll', direction: 'down', amount: 'page' },
      ],
    })
  })
  it('allows at most ten actions', () => {
    const eleven = Array.from({ length: 11 }, () => ({ tool: 'back' }))
    expect(err('steps', steps(eleven))).toContain('1 to 10')
    expect(ok('steps', steps(eleven.slice(0, 10)))).toMatchObject({ tool: 'steps' })
    expect(err('steps', steps([]))).toContain('1 to 10')
  })
  it('refuses tools that are not batchable, and nested steps or open', () => {
    expect(err('steps', steps([{ tool: 'open', url: 'https://example.com' }]))).toContain('not allowed in steps')
    expect(err('steps', steps([{ tool: 'steps', actions: [] }]))).toContain('not allowed in steps')
    expect(err('steps', steps([{ tool: 'screenshot' }]))).toContain('not allowed in steps')
  })
  it('validates each step one by one and names the failing step', () => {
    expect(err('steps', steps([{ tool: 'back' }, { tool: 'click', index: 0 }]))).toBe('step 2: index must be a whole number from the element list')
  })
  it('refuses a stale revision for the whole batch', () => {
    expect(err('steps', steps([{ tool: 'back' }], 2))).toContain('call elements again')
  })
  it('refuses a step that tries to pick its own tab or revision', () => {
    expect(err('steps', steps([{ tool: 'click', index: 1, tab: 2 }]))).toContain('unknown field')
  })
})

describe('browser action validation: unknown fields and tools', () => {
  it('refuses a tool name that is not in the set', () => {
    expect(err('evaluate', { code: '1+1' })).toContain('unknown tool')
    expect(err('__proto__', {})).toContain('unknown tool')
  })
  it('refuses fields the tool does not take', () => {
    expect(err('back', { tab: 1, force: true })).toBe('unknown field: force')
    expect(err('click', { tab: 1, revision: 4, index: 1, script: 'x' })).toBe('unknown field: script')
  })
  it('refuses input that is not an object', () => {
    expect(err('back', null)).toContain('object')
    expect(err('back', ['tab'])).toContain('object')
  })
})
