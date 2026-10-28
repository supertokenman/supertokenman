import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { LoopNoticeView } from './LoopNotice'

const loop = {
  reason: 'Paused: the same Bash call repeated 4 times.',
  why: 'repeat' as const,
  tool: 'Bash',
  count: 4,
  usd: 0.0421,
  tokens: 12345,
  steps: [1, 2, 3, 4].map(() => ({ kind: 'call' as const, tool: 'Bash', label: 'npm test' })),
}
const money = (usd: number) => `US$${usd.toFixed(2)}`
const view = (open = false) => {
  const p = { loop, money, onContinue: vi.fn(), onQuiet: vi.fn(), onToggle: vi.fn(), open }
  return { p, el: LoopNoticeView(p) }
}
/** every button in the tree, by its text */
function buttons(n: ReactNode, out: Record<string, () => void> = {}) {
  if (Array.isArray(n)) n.forEach((c) => buttons(c, out))
  else if (isValidElement(n)) {
    const e = n as ReactElement<{ children?: ReactNode; onClick?: () => void }>
    if (e.type === 'button') out[String(e.props.children)] = e.props.onClick!
    buttons(e.props.children, out)
  }
  return out
}

describe('loop notice', () => {
  it('says what repeated and what the repeats cost, in the display currency', () => {
    const html = renderToStaticMarkup(view().el)
    expect(html).toContain('Paused: the same Bash call repeated 4 times. Those repeats cost about US$0.04 (12,345 tokens).')
    expect(html).toContain('role="alert"')
    expect(html).not.toContain('npm test')
  })
  it('has the three ways on, and Show the repeats lists them', () => {
    const { p, el } = view()
    const b = buttons(el)
    expect(Object.keys(b)).toEqual(['Show the repeats', "Continue and don't pause again in this session", 'Continue'])
    b['Continue']!()
    b["Continue and don't pause again in this session"]!()
    b['Show the repeats']!()
    expect(p.onContinue).toHaveBeenCalledOnce()
    expect(p.onQuiet).toHaveBeenCalledOnce()
    expect(p.onToggle).toHaveBeenCalledOnce()
    const open = renderToStaticMarkup(view(true).el)
    expect(open.match(/npm test/g)).toHaveLength(4)
    expect(open).toContain('Hide the repeats')
  })
})
