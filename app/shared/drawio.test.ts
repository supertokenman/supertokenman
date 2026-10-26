import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { cells, check, diffCells, erModel, extractModel, fileOf, mergeSelection, modelOf, selection } from './drawio'

const M = `<mxGraphModel><root>
<mxCell id="0"/>
<mxCell id="1" parent="0"/>
<mxCell id="a" value="Browser" style="rounded=1;html=1;" vertex="1" parent="1"><mxGeometry x="10" y="10" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="b" value="API &amp; auth" style="rounded=1;html=1;" vertex="1" parent="1"><mxGeometry x="200" y="10" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="c" value="Postgres" style="shape=cylinder3;html=1;" vertex="1" parent="1"><mxGeometry x="390" y="10" width="80" height="80" as="geometry"/></mxCell>
<mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>
<mxCell id="e2" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="b" target="c"><mxGeometry relative="1" as="geometry"/></mxCell>
</root></mxGraphModel>`

describe('draw.io diagrams', () => {
  it('reads cells with labels, geometry and arrow ends', () => {
    const cs = cells(M)
    expect(cs.map((c) => c.id)).toEqual(['0', '1', 'a', 'b', 'c', 'e1', 'e2'])
    expect(cs[3]).toMatchObject({ value: 'API & auth', vertex: true, geo: { x: 200, y: 10, w: 120, h: 60 } })
    expect(cs[5]).toMatchObject({ edge: true, source: 'a', target: 'b', geo: undefined })
    expect(check(M)).toEqual({ ok: true, problems: [] })
  })

  it('finds what would stop draw.io from opening a model', () => {
    const bad = M.replace('target="c"', 'target="zz"').replace('id="b"', 'id="a"')
    expect(check(bad).problems).toEqual(expect.arrayContaining(['Repeated ids: a.', 'Arrow e2 points at a shape that is not there.']))
    expect(check('<mxGraphModel><root><mxCell id="x"/></root>').ok).toBe(false)
  })

  it('takes the model out of an answer and out of a file, compressed or not', () => {
    expect(extractModel('Here:\n```xml\n' + M + '\n```')).toBe(M)
    expect(modelOf(fileOf(M))).toBe(M)
    const packed = deflateRawSync(Buffer.from(encodeURIComponent(M))).toString('base64')
    const file = `<mxfile><diagram id="x" name="P">${packed}</diagram></mxfile>`
    expect(modelOf(file, (b) => inflateRawSync(Buffer.from(b, 'base64')).toString())).toBe(M)
    expect(modelOf(file)).toBeNull()
  })

  it('sends only the selection and merges the edit back by id', () => {
    const s = selection(M, ['b', 'c'])
    expect(cells(s.model).map((c) => c.id)).toEqual(['0', '1', 'b', 'c', 'e2'])
    expect(s.around).toBe('Other shapes on the page: Browser.')
    // the model renames b, drops c (and so its arrow), and adds a cache
    const edited = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="b" value="API gateway" style="rounded=1;html=1;" vertex="1" parent="1"><mxGeometry x="200" y="10" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="r" value="Redis" style="shape=cylinder3;" vertex="1" parent="1"><mxGeometry x="390" y="120" width="80" height="80" as="geometry"/></mxCell>
<mxCell id="e3" edge="1" parent="1" source="b" target="r"><mxGeometry relative="1" as="geometry"/></mxCell></root></mxGraphModel>`
    const merged = mergeSelection(M, ['b', 'c'], edited)
    expect(cells(merged).map((c) => `${c.id}:${c.value}`)).toEqual(['0:', '1:', 'a:Browser', 'b:API gateway', 'e1:', 'r:Redis', 'e3:'])
    expect(check(merged).ok).toBe(true)
    const d = diffCells(M, merged)
    expect(d.added.map((c) => c.id)).toEqual(['r', 'e3'])
    expect(d.removed.map((c) => c.id)).toEqual(['c', 'e2'])
    expect(d.changed.map((c) => [c.after.id, c.what])).toEqual([['b', ['label']]])
  })

  it('writes an ER diagram that draw.io can open', () => {
    const m = erModel(
      [{ name: 'customers', columns: [{ name: 'id', type: 'int', pk: true }, { name: 'name', type: 'text' }] }, { name: 'orders', columns: [{ name: 'id', type: 'int', pk: true }, { name: 'customer_id', type: 'int' }] }],
      [{ from: 'orders', column: 'customer_id', to: 'customers' }],
      [{ name: 'customers', x: 10, y: 10, w: 200, h: 80 }, { name: 'orders', x: 260, y: 10, w: 200, h: 80 }],
    )
    expect(check(m)).toEqual({ ok: true, problems: [] })
    expect(cells(m).filter((c) => c.edge)[0]).toMatchObject({ source: 't_orders', target: 't_customers', value: 'customer_id' })
    expect(cells(m).find((c) => c.id === 't_customers_0')!.value).toBe('PK id: int')
  })
})
