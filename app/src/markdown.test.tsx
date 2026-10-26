import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Markdown, parseBlocks } from './markdown'

const html = (t: string) => renderToStaticMarkup(<Markdown text={t} />)

describe('markdown', () => {
  it('splits blocks', () => {
    const src = '# Title\n\nSome text\nmore\n\n- a\n- b\n\n1. one\n2. two\n\n```ts\nconst x = 1\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n> quote\n\n---'
    expect(parseBlocks(src).map((b) => b.kind)).toEqual(['h', 'p', 'list', 'list', 'code', 'table', 'quote', 'hr'])
  })

  it('renders inline marks and links, and escapes HTML', () => {
    const out = html('Use `npm test`, **bold**, *it*, ~~old~~ and [docs](https://x.dev) <script>x</script>')
    expect(out).toContain('<code class="md-code">npm test</code>')
    expect(out).toContain('<strong>bold</strong>')
    expect(out).toContain('<em>it</em>')
    expect(out).toContain('<s>old</s>')
    expect(out).toContain('<a href="https://x.dev" target="_blank" rel="noreferrer">docs</a>')
    expect(out).toContain('&lt;script&gt;')
    expect(out).not.toContain('<script>')
  })

  it('keeps snake_case and file paths intact', () => {
    expect(html('see src/my_file_name.ts and 2*3*4')).toContain('see src/my_file_name.ts and 2*3*4')
  })

  it('renders an unclosed fence while a reply streams', () => {
    expect(parseBlocks('Here:\n```js\nconst a = 1')).toMatchObject([{ kind: 'p' }, { kind: 'code', lang: 'js', text: 'const a = 1' }])
  })

  it('turns a memory citation into a chip, and leaves other brackets alone', () => {
    const out = html('Use pnpm [mem:a1b2c3d], see [docs](https://x.dev) and [note].')
    expect(out).toContain('class="mem-cite"')
    expect(out).toContain('a1b2c3d')
    expect(out).toContain('href="https://x.dev"')
    expect(out).toContain('[note]')
  })
})
