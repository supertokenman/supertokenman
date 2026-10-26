import { describe, expect, it } from 'vitest'
import { aliases, erLayout, suggest } from './sqlcomplete'

const s = { tables: [{ name: 'customers', columns: [{ name: 'id', type: 'int' }, { name: 'name', type: 'text' }, { name: 'email', type: 'text' }] }, { name: 'orders', columns: [{ name: 'id', type: 'int' }, { name: 'customer_id', type: 'int' }, { name: 'total', type: 'numeric' }] }] }
const at = (sql: string) => suggest(sql, sql.length, s)

describe('sql autocomplete', () => {
  it('offers tables after from and join', () => {
    expect(at('select * from ').items.map((x) => x.text)).toEqual(['customers', 'orders'])
    expect(at('select * from orders o join cu').items.map((x) => x.text)).toEqual(['customers'])
  })
  it('offers a table or alias columns after a dot', () => {
    const q = 'select o. from orders o'
    expect(suggest(q, 'select o.'.length, s).items.map((x) => x.text)).toEqual(['id', 'customer_id', 'total'])
    const sql = 'select c.na from customers c'
    expect(suggest(sql, 'select c.na'.length, s)).toEqual({ start: 9, items: [{ text: 'name', kind: 'column', detail: 'text' }] })
  })
  it('offers the named tables columns first, then tables and keywords', () => {
    const sql = 'select to from orders'
    expect(suggest(sql, 'select to'.length, s).items.map((x) => x.text)).toEqual(['total'])
    expect(at('select * from orders whe').items.map((x) => x.text)).toEqual(['where', 'when'])
    expect(at('select ').items).toEqual([])
  })
  it('reads aliases', () => {
    expect([...aliases('select * from orders as o left join customers c on 1=1 where x', s)]).toEqual([['orders', 'orders'], ['o', 'orders'], ['customers', 'customers'], ['c', 'customers']])
  })
  it('lays tables out in a grid at their real height', () => {
    const l = erLayout([{ name: 'a', columns: [1, 2] }, { name: 'b', columns: Array(20).fill(0) }, { name: 'c', columns: [1] }])
    expect(l.boxes.map((b) => [b.x, b.y])).toEqual([[10, 10], [258, 10], [10, 10 + l.boxes[1]!.h + 48]])
    expect(l.boxes[1]!.shown).toBe(12)
  })
})
