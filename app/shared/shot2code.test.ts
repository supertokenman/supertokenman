import { describe, expect, it } from 'vitest'
import { best, entryOf, filesOf, fixPrompt, generatePrompt, prototype, safePath, shouldStop, type Round } from './shot2code'

const r = (n: number, percent: number | null): Round => ({ n, files: [{ path: 'index.html', content: 'x' }], percent, costUsd: 0 })

describe('screenshot to code', () => {
  it('asks for the right files', () => {
    expect(generatePrompt('html', 800, 600)).toMatch(/index\.html.*cdn\.tailwindcss\.com\/3\.4\.17/s)
    const p = generatePrompt('react', 800, 600, { components: ['Button', 'Card'], tokens: '--accent: #d97757' })
    expect(p).toContain('Button, Card')
    expect(p).toContain('--accent: #d97757')
    expect(fixPrompt('html', [{ path: 'index.html', content: '<p>a</p>' }], 12.345, { x: 10, y: 20, w: 30, h: 40 }, 800, 600)).toMatch(/12\.3%.*x 10\.\.40, y 20\.\.60.*```html index\.html\n<p>a<\/p>/s)
  })

  it('reads files out of an answer and refuses unsafe paths', () => {
    const a = 'Here:\n```html index.html\n<!doctype html><p>hi</p>\n```\n```tsx ../../etc/x.tsx\nbad\n```\n```tsx Screen.tsx\nexport default () => null\n```'
    expect(filesOf(a, 'html').map((f) => f.path)).toEqual(['index.html', 'Screen.tsx'])
    expect(filesOf('```html\n<html><body>x</body></html>\n```', 'html')[0]!.path).toBe('index.html')
    expect(filesOf('```html\n<html></html>\n```', 'react')[0]!.path).toBe('preview.html')
    expect(filesOf('<!doctype html><p>raw</p>', 'html')).toEqual([{ path: 'index.html', content: '<!doctype html><p>raw</p>\n' }])
    expect(safePath('/abs.html') || safePath('a/../b') || safePath('.env')).toBe(false)
    expect(entryOf('react', [{ path: 'Screen.tsx', content: '' }, { path: 'preview.html', content: '' }])!.path).toBe('preview.html')
  })

  it('stops when close, out of rounds, or stuck, and keeps the best', () => {
    expect(shouldStop([r(1, 30), r(2, 4)], { target: 5, max: 4 })).toMatch(/Within/)
    expect(shouldStop([r(1, 30), r(2, 20)], { target: 5, max: 2 })).toMatch(/2 rounds/)
    expect(shouldStop([r(1, 20), r(2, 20.1), r(3, 19.9)], { target: 5, max: 9 })).toMatch(/without progress/)
    expect(shouldStop([r(1, 30), r(2, 20), r(3, 12)], { target: 5, max: 9 })).toBeNull()
    expect(best([r(1, 30), r(2, 9), r(3, 12), r(4, null)])!.n).toBe(2)
  })

  it('links screens into a prototype', () => {
    const f = prototype([{ name: 'Login', html: '<html><body>a</body></html>' }, { name: 'Home <1>', html: '<p>b</p>' }])
    expect(f.map((x) => x.path)).toEqual(['screen-1.html', 'screen-2.html', 'index.html'])
    expect(f[0]!.content).toMatch(/href="screen-2\.html".*Home &#60;1&#62;.*<\/nav><\/body>/s)
    expect(f[2]!.content).toContain('url=screen-1.html')
  })
})
