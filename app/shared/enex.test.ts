import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { noteFile, parseEnex, safeName } from './enex'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const md5 = createHash('md5').update(png).digest('hex')
const enex = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export4.dtd">
<en-export export-date="20261025T120000Z" application="Evernote">
<note><title>Trip &amp; plans</title><created>20250301T093000Z</created><updated>20250302T101500Z</updated><tag>travel</tag><tag>2025</tag>
<note-attributes><source-url>https://example.com/a</source-url></note-attributes>
<content><![CDATA[<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd"><en-note><h1>Lisbon</h1><div>Book <b>flights</b> and <a href="https://tap.pt">TAP</a>.</div><div><en-todo checked="true"/>passport</div><div><en-todo/>adapter</div><ul><li>Day 1</li><li>Day 2</li></ul><en-media type="image/png" hash="${md5}"/><div>5 &lt; 6</div></en-note>]]></content>
<resource><data encoding="base64">${png.toString('base64').replace(/(.{20})/g, '$1\n')}</data><mime>image/png</mime><resource-attributes><file-name>map.png</file-name></resource-attributes></resource>
</note>
<note><title></title><content><![CDATA[<en-note><div>Just text</div></en-note>]]></content></note>
</en-export>`

describe('enex import', () => {
  it('reads notes, dates, tags, source and attachments', () => {
    const [a, b] = parseEnex(enex)
    expect(a!.title).toBe('Trip & plans')
    expect(a!.created).toBe('2025-03-01T09:30:00Z')
    expect(a!.updated).toBe('2025-03-02T10:15:00Z')
    expect(a!.tags).toEqual(['travel', '2025'])
    expect(a!.source).toBe('https://example.com/a')
    expect(a!.files).toHaveLength(1)
    expect(a!.files[0]!.name).toBe('map.png')
    expect(a!.files[0]!.data.equals(png)).toBe(true)
    expect(b!.title).toBe('Untitled')
    expect(b!.markdown).toBe('Just text')
  })
  it('turns ENML into Markdown with the attachment linked', () => {
    const md = parseEnex(enex)[0]!.markdown
    expect(md).toContain('# Lisbon')
    expect(md).toContain('Book **flights** and [TAP](https://tap.pt).')
    expect(md).toContain('- [x] passport')
    expect(md).toContain('- [ ] adapter')
    expect(md).toContain('- Day 1\n- Day 2')
    expect(md).toContain('![[map.png]]')
    expect(md).toContain('5 < 6')
  })
  it('writes a note file with frontmatter', () => {
    const f = noteFile(parseEnex(enex)[0]!)
    expect(f.startsWith('---\ntitle: "Trip & plans"\ncreated: 2025-03-01T09:30:00Z\n')).toBe(true)
    expect(f).toContain('tags:\n  - "travel"\n  - "2025"')
    expect(safeName('a/b: c?')).toBe('a b c')
  })
})
