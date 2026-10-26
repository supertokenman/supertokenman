import { describe, expect, it } from 'vitest'
import { assetName, localImages, rewrite } from './mdimages'

const md = `# Trip
![Beach](./assets/beach.png "at noon")
![Logo](https://cdn.example.com/logo.png)
<img src="img/map.jpg" alt="Map">
\`\`\`
![not](./code.png)
\`\`\`
![Beach again](./assets/beach.png)
![Doc](./notes.pdf)`

describe('markdown images', () => {
  it('finds local images only, once each, outside code', () => {
    expect(localImages(md)).toEqual([
      { ref: './assets/beach.png', alt: 'Beach', line: 2, form: 'md' },
      { ref: 'img/map.jpg', alt: 'Map', line: 4, form: 'html' },
    ])
  })
  it('names by hash with the extension', () => expect(assetName('abcdef0123456789ffff', 'x/Photo.JPG')).toBe('abcdef0123456789.jpg'))
  it('rewrites every use, keeps titles, and is idempotent', () => {
    const urls = { './assets/beach.png': 'https://img.example.com/a1.png', 'img/map.jpg': 'https://img.example.com/b2.jpg' }
    const r = rewrite(md, urls)
    expect(r.changed).toBe(3)
    expect(r.text).toContain('![Beach](https://img.example.com/a1.png "at noon")')
    expect(r.text).toContain('![Beach again](https://img.example.com/a1.png)')
    expect(r.text).toContain('<img src="https://img.example.com/b2.jpg" alt="Map">')
    expect(r.text).toContain('![not](./code.png)')
    expect(rewrite(r.text, urls)).toEqual({ text: r.text, changed: 0 })
    expect(localImages(r.text)).toEqual([])
  })
  it('other link templates', () => {
    expect(rewrite('![A](a.png)', { 'a.png': 'https://x/a.png' }, 'html').text).toBe('<img src="https://x/a.png" alt="A">')
    expect(rewrite('![A](a.png)', { 'a.png': 'https://x/a.png' }, 'url').text).toBe('https://x/a.png')
  })
})
