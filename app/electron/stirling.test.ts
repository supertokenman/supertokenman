import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkBase, run } from './stirling'

let port = 0
const seen: { path: string; key?: string; body: string }[] = []
const srv = createServer((req, res) => {
  let b = ''
  req.setEncoding('latin1')
  req.on('data', (c) => (b += c))
  req.on('end', () => {
    seen.push({ path: req.url!, key: req.headers['x-api-key'] as string | undefined, body: b })
    if (req.headers['x-api-key'] !== 'k1') return res.writeHead(401, { 'content-type': 'application/json' }).end('{"message":"Invalid API key"}')
    if (req.url!.includes('split')) return res.writeHead(200, { 'content-type': 'application/zip' }).end('PK fake zip')
    res.writeHead(200, { 'content-type': 'application/pdf' }).end('%PDF-1.7 result')
  })
})
beforeAll(async () => { await new Promise<void>((d) => srv.listen(0, '127.0.0.1', d)); port = (srv.address() as { port: number }).port })
afterAll(() => srv.close())

const dir = mkdtempSync(join(tmpdir(), 'st-'))
const a = join(dir, 'a.pdf'), b = join(dir, 'b.pdf')
writeFileSync(a, '%PDF-1.4 a'); writeFileSync(b, '%PDF-1.4 b')

describe('stirling-pdf', () => {
  it('only http on this machine or https', () => {
    expect(() => checkBase('http://10.0.0.5:8080')).toThrow(/https/)
    expect(checkBase('http://127.0.0.1:8080').host).toBe('127.0.0.1:8080')
    expect(checkBase('https://pdf.example.com').host).toBe('pdf.example.com')
  })
  it('merges with the key, in order, next to the first file', async () => {
    const r = await run(`http://127.0.0.1:${port}`, 'k1', 'merge', [a, b], {})
    expect(r.file).toBe(join(dir, 'a.merge.pdf'))
    expect(readFileSync(r.file, 'utf8')).toBe('%PDF-1.7 result')
    const last = seen.at(-1)!
    expect(last.path).toBe('/api/v1/general/merge-pdfs')
    expect(last.body.match(/name="fileInput"/g)?.length).toBe(2)
    expect(last.body).toContain('orderProvided')
    // a second run never overwrites the first result
    expect((await run(`http://127.0.0.1:${port}`, 'k1', 'merge', [a, b], {})).file).toBe(join(dir, 'a.merge-2.pdf'))
  })
  it('split returns a zip, redact sends the terms and flattens the page', async () => {
    expect((await run(`http://127.0.0.1:${port}`, 'k1', 'split', [a], { pages: '1,3-4' })).file).toBe(join(dir, 'a.split.zip'))
    await run(`http://127.0.0.1:${port}`, 'k1', 'redact', [a], { terms: ['529.982.247-25', 'ana@example.com'] })
    const body = seen.at(-1)!.body
    expect(body).toMatch(/529.982.247-25\r?\nana@example.com/)
    expect(body).toMatch(/name="convertPDFToImage"\r\n\r\ntrue/)
  })
  it('says what the server said, and checks its input', async () => {
    await expect(run(`http://127.0.0.1:${port}`, 'wrong', 'compress', [a], {})).rejects.toThrow('answered 401: Invalid API key')
    await expect(run(`http://127.0.0.1:${port}`, 'k1', 'split', [a], { pages: '1; rm -rf' })).rejects.toThrow(/Pages/)
    await expect(run(`http://127.0.0.1:${port}`, 'k1', 'merge', [a], {})).rejects.toThrow(/two PDFs/)
    await expect(run(`http://127.0.0.1:${port}`, 'k1', 'redact', [a], { terms: [] })).rejects.toThrow(/Nothing/)
  })
})
