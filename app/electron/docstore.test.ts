import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DocStore, type Deps } from './docstore'
import { toMarkdown } from './docs'

const dir = () => mkdtempSync(join(tmpdir(), 'ds-'))
// a fake embedding: a vector of word families, so "electricity" lands near "energy"
const FAM = [/energ|electric|enel|luz/i, /pix|pay|pag/i, /contract|contrato|rent|aluguel/i, /bank|banco/i]
const embed = async (ts: string[]) => ts.map((t) => FAM.map((r) => (r.test(t) ? 1 : 0.05)))
const ask = async (p: string) =>
  p.startsWith('Suggest up to 3') ? (/aluguel/i.test(p) ? 'housing, contracts' : 'bills, energy') : p.startsWith('List up to 5 facts') ? (/231/.test(p) ? '1. The Enel bill total is R$ 231,40.\n2. It is due on 2026-10-05.' : '') : p.startsWith('Score how well') ? p.split('\n').filter((l) => /^\d+: /.test(l)).map((l, i) => `${i + 1}: ${/aluguel/i.test(l) ? 9 : 3}`).join('\n') : ''
const deps = (over: Partial<Deps> = {}): Deps => ({ ask, embed, toMarkdown: async () => null, ocr: async () => 'ENEL Fatura de energia\nVencimento: 05/10/2026\nTotal a pagar: R$ 231,40', ...over })

describe('documents store', () => {
  it('reads, files by rule and template, tags, chunks and proposes facts; keeps duplicates once', async () => {
    const root = dir()
    const src = dir()
    const s = new DocStore(root, deps())
    s.saveRule({ id: 'r1', name: 'Energy', kind: 'words', value: 'enel fatura', tags: ['bills'], template: '{sender}/{year}/{title}' })
    writeFileSync(join(src, 'enel_outubro.txt'), 'From: Enel\nFatura de energia\nVencimento: 05/10/2026\n\nTotal a pagar: R$ 231,40')
    writeFileSync(join(src, 'copy.txt'), 'From: Enel\nFatura de energia\nVencimento: 05/10/2026\n\nTotal a pagar: R$ 231,40')
    writeFileSync(join(src, 'contrato.md'), '# Contrato de aluguel\nAluguel de R$ 2.000 por mês, reajuste pelo IGP-M em janeiro.')
    writeFileSync(join(src, 'virus.exe'), 'MZ')
    for (const f of ['enel_outubro.txt', 'copy.txt', 'contrato.md', 'virus.exe']) s.enqueue(join(src, f))
    await s.work()
    const q = s.queue()
    expect(q.map((j) => j.status).sort()).toEqual(['done', 'done', 'duplicate', 'failed'])
    expect(q.find((j) => j.status === 'failed')!.error).toMatch(/not a document type/)
    expect(q.find((j) => j.status === 'duplicate')!.error).toMatch(/Same content as "enel outubro"/)
    const enel = s.docs().find((d) => d.title === 'enel outubro')!
    expect(enel.path).toBe(join(root, 'files', 'Enel', '2026', 'enel outubro.txt'))
    expect(enel).toMatchObject({ tags: ['bills'], suggested: ['energy'], sender: 'Enel', date: '2026-10-05' })
    expect(s.facts(enel.id).map((f) => f.text)).toEqual(['The Enel bill total is R$ 231,40.', 'It is due on 2026-10-05.'])
    expect(s.chunks(enel.id).length).toBeGreaterThan(0)
    // the default template for a document no rule placed
    expect(s.docs().find((d) => d.title === 'contrato')!.path).toMatch(/files\/unknown\/2026\/contrato\.md$|files\/unknown\/\d{4}\/contrato\.md$/)
  })

  it('masks credentials before indexing and tags the document', async () => {
    const s = new DocStore(dir(), deps({ ask: null, embed: null }))
    const src = dir()
    const key = 'sk-ant-api03-' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0'
    writeFileSync(join(src, 'setup.md'), `# Setup\nExport ANTHROPIC_API_KEY=${key} before running.`)
    s.enqueue(join(src, 'setup.md'))
    await s.work()
    const d = s.docs()[0]!
    expect(d.tags).toContain('had-secrets')
    const all = s.chunks(d.id).map((c) => c.text).join('\n')
    expect(all).not.toContain(key)
    expect(all).toContain('sk-a')
  })

  it('merges and splits chunks, re-embedding only those, and keeps compiled versions', async () => {
    const s = new DocStore(dir(), deps({ ask: null }))
    const src = dir()
    writeFileSync(join(src, 'notes.md'), '# Plan\n' + 'Alpha paragraph with words. '.repeat(40) + '\n\n## Next\n' + 'Beta paragraph with words. '.repeat(40))
    s.enqueue(join(src, 'notes.md'))
    await s.work()
    const d = s.docs()[0]!
    const before = s.chunks(d.id)
    expect(before.length).toBeGreaterThanOrEqual(2)
    expect(before.every((c) => c.embedded)).toBe(true)
    await s.splitChunk(before[0]!.id, 20)
    const split = s.chunks(d.id)
    expect(split).toHaveLength(before.length + 1)
    expect(split.map((c) => c.ord)).toEqual(split.map((_, i) => i))
    await s.mergeChunk(split[0]!.id)
    expect(s.chunks(d.id)).toHaveLength(before.length)
    expect(s.chunks(d.id)[0]!.text).toBe(before[0]!.text.slice(0, 20).trim() + '\n\n' + before[0]!.text.slice(20).trim())
    expect(s.saveCompiled(d.id, 'v1', 'outline')).toBe(1)
    expect(s.saveCompiled(d.id, 'v2', 'outline + local summary')).toBe(2)
    expect(s.compiledOf(d.id).map((c) => c.version)).toEqual([2, 1])
  })

  it('accepts and rejects suggestions, edits chunks, and confirms facts', async () => {
    const s = new DocStore(dir(), deps())
    const f = join(dir(), 'bill.txt')
    writeFileSync(f, 'Enel fatura de energia, total R$ 231,40')
    s.enqueue(f)
    await s.work()
    const d = s.docs()[0]!
    s.setTags(d.id, [...d.tags, 'energy'])
    s.rejectSuggestion(d.id, 'bills')
    expect(s.getDoc(d.id)).toMatchObject({ tags: ['energy'], suggested: [] })
    const c = s.chunks(d.id)[0]!
    await s.editChunk(c.id, 'Conta de luz da Enel, total R$ 231,40, paga por Pix.')
    await s.addChunk(d.id, 'Leitura do medidor: 412 kWh.')
    expect(s.chunks(d.id).map((x) => [x.text, x.edited])).toEqual([['Conta de luz da Enel, total R$ 231,40, paga por Pix.', true], ['Leitura do medidor: 412 kWh.', true]])
    const fact = s.facts(d.id)[0]!
    expect(s.setFact(fact.id, 'confirmed')!.status).toBe('confirmed')
    expect(s.facts()).toHaveLength(1)
    await s.editChunk(s.chunks(d.id)[1]!.id, '')
    expect(s.chunks(d.id)).toHaveLength(1)
  })

  it('searches by words and meaning, reranks, and says each step', async () => {
    const s = new DocStore(dir(), deps())
    const src = dir()
    writeFileSync(join(src, 'enel.txt'), 'Enel fatura de energia, total R$ 231,40')
    writeFileSync(join(src, 'contrato.txt'), 'Contrato de aluguel, R$ 2.000 por mês')
    writeFileSync(join(src, 'banco.txt'), 'Extrato do banco de outubro')
    for (const f of ['enel.txt', 'contrato.txt', 'banco.txt']) s.enqueue(join(src, f))
    await s.work()
    const stages: string[] = []
    // "electricity" shares no word with the bill; only the meaning index finds it
    const hits = await s.search('electricity', (e) => stages.push(e.stage))
    expect(hits[0]!.doc.title).toBe('enel')
    expect(hits[0]!.via).toContain('meaning')
    expect(hits[0]!.via).not.toContain('words')
    expect(stages).toEqual(['words', 'meaning', 'done'])
    const r = await s.search('fatura aluguel', (e) => stages.push(e.stage))
    expect(r[0]!.doc.title).toBe('contrato')
    // the bill scored 3 of 10 stays; nothing under 3 is shown
    expect(r.every((h) => h.via.includes('rerank'))).toBe(true)
    expect(stages.slice(-2)).toEqual(['rerank', 'done'])
    // words only, with no models picked
    const plain = new DocStore(dir(), deps({ ask: null, embed: null }))
    plain.enqueue(join(src, 'banco.txt'))
    await plain.work()
    const st: string[] = []
    expect((await plain.search('extrato banco', (e) => st.push(e.note)))[0]!.via).toEqual(['words'])
    expect(st[1]).toMatch(/words only/)
  })

  it('keeps a failure with its error and retries it', async () => {
    let n = 0
    const s = new DocStore(dir(), deps({ ocr: async () => (n++ === 0 ? Promise.reject(new Error('This file needs OCR: install Tesseract')) : 'Recibo de Pix R$ 50') }))
    const f = join(dir(), 'recibo.png')
    writeFileSync(f, 'png')
    const id = s.enqueue(f)
    await s.work()
    expect(s.queue()[0]).toMatchObject({ status: 'failed', error: 'This file needs OCR: install Tesseract' })
    s.retry(id)
    await s.work()
    expect(s.queue()[0]).toMatchObject({ status: 'done', tries: 2 })
    expect(s.docs()[0]!.ocr).toBe(true)
  })

  const has = (b: string) => { try { execFileSync('which', [b]); return true } catch { return false } }
  it.runIf(has('tesseract') && has('convert') && has('pdftoppm'))('reads a scanned image and a scanned PDF with real OCR', async () => {
    const src = dir()
    execFileSync('convert', ['-size', '900x300', 'xc:white', '-pointsize', '32', '-fill', 'black', '-annotate', '+30+70', 'ENEL Fatura de energia', '-annotate', '+30+130', 'Total a pagar: R$ 231,40', join(src, 'scan.png')])
    execFileSync('convert', [join(src, 'scan.png'), join(src, 'scan.pdf')])
    const s = new DocStore(dir(), { ask: null, embed: null, toMarkdown })
    s.enqueue(join(src, 'scan.png'))
    s.enqueue(join(src, 'scan.pdf'))
    await s.work()
    expect(s.queue().map((j) => [j.status, j.error])).toEqual([['done', ''], ['done', '']])
    for (const d of s.docs()) {
      expect(d.ocr).toBe(true)
      expect(s.chunks(d.id).map((c) => c.text).join(' ')).toMatch(/Fatura de energia[\s\S]*231,40/)
    }
    expect(existsSync(s.docs()[0]!.path)).toBe(true)
  }, 120_000)
})
