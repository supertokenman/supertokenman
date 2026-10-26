import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { keepDoc, layoutToMarkdown } from './docs'
import { docTree } from './memtree'

const PAGE = `                            Checkout spec
Overview of the checkout.

1. PAYMENTS
                               Method   Fee
                               Pix      0%
                               Card     3.9%

2. REFUNDS
Within 7 days.`

describe('documents', () => {
  it('turns a laid-out PDF page into headings and a table that keeps its columns', () => {
    const md = layoutToMarkdown(PAGE, 'spec.pdf')
    expect(md).toContain('# spec.pdf')
    expect(md).toContain('## PAYMENTS')
    expect(md).toContain('## REFUNDS')
    expect(md).toContain('```\nMethod   Fee\nPix      0%\nCard     3.9%\n```')
    expect(docTree(md, 'docs/app/spec.md').map((n) => n.title)).toEqual(['spec.pdf', 'PAYMENTS', 'REFUNDS'])
  })
  it('keeps nothing for a type it does not read, and nothing without a memory folder', async () => {
    expect(await keepDoc('', 'app', '/x/spec.pdf')).toBeNull()
    expect(await keepDoc('/tmp', 'app', '/x/notes.txt')).toBeNull()
  })
  // runs where the converters are installed, as on this test machine
  it.runIf(process.platform === 'linux')('converts a real PDF and Word file into the project documents', async () => {
    const v = mkdtempSync(join(tmpdir(), 'vault-'))
    expect(await keepDoc(v, 'app', '/tmp/stmt/docs/spec.pdf')).toBe('spec.md')
    expect(readFileSync(join(v, 'docs', 'app', 'spec.md'), 'utf8')).toMatch(/## PAYMENTS[\s\S]*Pix\s+0%/)
    expect(await keepDoc(v, 'app', '/tmp/stmt/docs/spec.docx')).toBe('spec.md')
    expect(readFileSync(join(v, 'docs', 'app', 'spec.md'), 'utf8')).toMatch(/\| Pix +\| 0% +\|/)
  })
})
