import { describe, expect, it } from 'vitest'
import { cleanAttachments, filesNote, imageTypeOf, MAX_IMAGE_BYTES } from './attach'

describe('attachments', () => {
  it('keeps known images under the cap and absolute file paths', () => {
    const big = 'A'.repeat(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8)
    expect(cleanAttachments([
      { kind: 'image', name: 'shot.png', mediaType: 'image/png', data: 'iVBORw0KGgo=' },
      { kind: 'image', name: 'x.svg', mediaType: 'image/svg+xml', data: 'AAAA' },
      { kind: 'image', name: 'huge.png', mediaType: 'image/png', data: big },
      { kind: 'image', name: 'bad.png', mediaType: 'image/png', data: '<script>' },
      { kind: 'file', name: 'spec.pdf', path: '/Users/me/spec.pdf' },
      { kind: 'file', name: 'rel', path: 'relative/path' },
      { kind: 'file', name: 'src', path: '/Users/me/app/src', dir: true },
    ])).toEqual([
      { kind: 'image', name: 'shot.png', mediaType: 'image/png', data: 'iVBORw0KGgo=' },
      { kind: 'file', name: 'spec.pdf', path: '/Users/me/spec.pdf', dir: false },
      { kind: 'file', name: 'src', path: '/Users/me/app/src', dir: true },
    ])
    expect(cleanAttachments('nope')).toEqual([])
    expect(cleanAttachments(Array.from({ length: 30 }, () => ({ kind: 'file', path: '/a' })))).toHaveLength(10)
  })
  it('names image types and points Claude at files', () => {
    expect(imageTypeOf('A.JPG')).toBe('image/jpeg')
    expect(imageTypeOf('a.pdf')).toBeNull()
    expect(filesNote([{ path: '/a/b.pdf' }, { path: '/a/src', dir: true }])).toBe('\n\nAttached files (read what you need):\n- /a/b.pdf\n- /a/src/ (folder)')
  })
})
