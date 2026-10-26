import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cells } from '../shared/drawio'
import { create, DiagramStore, diagramPath, edit, fromImage, listDiagrams, readModel } from './diagrams'

const BASE = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="a" value="Browser" vertex="1" parent="1"><mxGeometry x="10" y="10" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="b" value="API" vertex="1" parent="1"><mxGeometry x="200" y="10" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="e1" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell></root></mxGraphModel>`

describe('diagrams', () => {
  it('creates, retries a broken answer once, and refuses a second broken one', async () => {
    const asked: string[] = []
    let n = 0
    const ask = async (p: string) => (asked.push(p), n++ === 0 ? 'Sure! <mxGraphModel><root><mxCell id="x"/></root></mxGraphModel>' : '```xml\n' + BASE + '\n```')
    expect(cells(await create(ask, 'browser calls the API')).map((c) => c.id)).toEqual(['0', '1', 'a', 'b', 'e1'])
    expect(asked[1]).toMatch(/would not open in draw.io: .*root cells/)
    await expect(create(async () => 'no diagram here', 'x')).rejects.toThrow(/did not give a diagram/)
  })

  it('sends only the selected shapes and keeps the rest', async () => {
    let sent = ''
    const ask = async (p: string) => ((sent = p), `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="b" value="API gateway" vertex="1" parent="1"><mxGeometry x="200" y="10" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel>`)
    const out = await edit(ask, BASE, 'rename to API gateway', ['b'])
    expect(sent).toContain('id="b"')
    expect(sent).not.toContain('id="a"')
    expect(sent).toContain('Other shapes on the page: Browser.')
    expect(cells(out).map((c) => `${c.id}:${c.value}`)).toEqual(['0:', '1:', 'a:Browser', 'b:API gateway', 'e1:'])
  })

  it('redraws an image with the image attached', async () => {
    let got: unknown = null
    const out = await fromImage(async (p, img) => ((got = img), BASE), { data: 'aGk=', mediaType: 'image/png' })
    expect(got).toEqual({ data: 'aGk=', mediaType: 'image/png' })
    expect(cells(out)).toHaveLength(5)
  })

  it('keeps a version for every change and restores one', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'dg-'))
    const s = new DiagramStore(join(cwd, '.versions'))
    const p = diagramPath(cwd, 'Arquitetura do Checkout')
    expect(p).toBe(join(cwd, 'diagrams', 'arquitetura-do-checkout.drawio'))
    s.write(p, BASE, 'created')
    s.write(p, BASE.replace('value="API"', 'value="API v2"'), 'renamed API', 1000)
    expect(readModel(p)).toContain('API v2')
    expect(s.versions(p)).toEqual([{ at: 1000, model: BASE, note: 'renamed API' }])
    s.restore(p, 1000)
    expect(readModel(p)).toBe(BASE)
    expect(s.versions(p)).toHaveLength(2)
    expect(() => s.write(p, '<mxGraphModel><root></root></mxGraphModel>', 'x')).toThrow(/would not open/)
    expect(() => s.write(join(cwd, 'elsewhere.drawio'), BASE, 'x')).toThrow(/diagrams folder/)
    mkdirSync(join(cwd, 'diagrams'), { recursive: true })
    writeFileSync(join(cwd, 'diagrams', 'notes.txt'), 'x')
    expect(listDiagrams(cwd).map((d) => d.name)).toEqual(['arquitetura-do-checkout'])
  })
})
