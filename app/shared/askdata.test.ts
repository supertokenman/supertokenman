import { describe, expect, it } from 'vitest'
import { chartOf, onlyReads, seriesOf } from './askdata'

describe('ask your data', () => {
  it('runs only one reading statement', () => {
    expect(onlyReads('select * from orders')).toBeNull()
    expect(onlyReads('with t as (select 1) select * from t;')).toBeNull()
    expect(onlyReads("select 'drop table x' as s")).toBeNull()
    expect(onlyReads('select 1; delete from orders')).toMatch(/One statement/)
    expect(onlyReads('delete from orders')).toMatch(/reads/)
    expect(onlyReads('with d as (delete from orders returning *) select * from d')).toMatch(/changes data/)
    expect(onlyReads('-- just a comment')).toMatch(/Nothing/)
  })
  it('picks a number, a line, bars or the table', () => {
    expect(chartOf(['count'], [[42]])).toEqual({ kind: 'number', label: 'count', value: 42 })
    expect(chartOf(['day', 'orders', 'revenue'], [['2026-10-01', 3, '19.5'], ['2026-10-02', 5, '40']])).toEqual({ kind: 'line', x: 0, ys: [1, 2], time: true })
    expect(chartOf(['status', 'n'], [['new', 2], ['paid', 3]])).toEqual({ kind: 'bar', x: 0, ys: [1], time: false })
    expect(chartOf(['name', 'email'], [['a', 'b']])).toEqual({ kind: 'table' })
    expect(chartOf(['status', 'n'], Array.from({ length: 40 }, (_, i) => [`s${i}`, i]))).toEqual({ kind: 'table' })
  })
  it('builds series', () => {
    const p = chartOf(['month', 'n'], [['2026-09', 1], ['2026-10', 2]])
    expect(p.kind).toBe('line')
    if (p.kind === 'line') expect(seriesOf(['month', 'n'], [['2026-09', 1], ['2026-10', 2]], p)[0]!.points.map((x) => x[1])).toEqual([1, 2])
  })
})
