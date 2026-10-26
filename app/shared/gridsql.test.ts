import { describe, expect, it } from 'vitest'
import { addEdit, browseSql, countSql, editorFor, firstView, jsonProblem, literal, parseCell, parseTsv, toSql } from './gridsql'

describe('grid edits to SQL', () => {
  it('quotes values per dialect', () => {
    expect(literal('postgres', "O'Brien")).toBe("'O''Brien'")
    expect(literal('mysql', 'a\\b')).toBe("'a\\\\b'")
    expect(literal('postgres', true)).toBe('TRUE')
    expect(literal('sqlite', true)).toBe('1')
    expect(literal('postgres', null)).toBe('NULL')
    expect(literal('postgres', 12.5)).toBe('12.5')
  })
  it('reads what was typed by column type', () => {
    expect(parseCell('', 'text', true)).toBeNull()
    expect(parseCell('', 'text', false)).toBe('')
    expect(parseCell('42', 'integer', false)).toBe(42)
    expect(parseCell('42abc', 'integer', false)).toBe('42abc')
    expect(parseCell('true', 'boolean', false)).toBe(true)
  })
  it('writes updates, inserts and deletes by primary key', () => {
    expect(toSql('postgres', 'public', 'orders', [
      { kind: 'update', key: { id: 7 }, set: { status: 'paid', note: null } },
      { kind: 'insert', values: { id: 9, status: 'new' } },
      { kind: 'delete', key: { id: 3 } },
    ])).toEqual([
      `UPDATE "orders" SET "status" = 'paid', "note" = NULL WHERE "id" = 7;`,
      `INSERT INTO "orders" ("id", "status") VALUES (9, 'new');`,
      `DELETE FROM "orders" WHERE "id" = 3;`,
    ])
    expect(toSql('mysql', 'shop', 'line items', [{ kind: 'delete', key: { order_id: 1, sku: 'A' } }])).toEqual(["DELETE FROM `shop`.`line items` WHERE `order_id` = 1 AND `sku` = 'A';"])
    expect(() => toSql('sqlite', 'main', 't', [{ kind: 'delete', key: {} }])).toThrow(/primary key/)
    expect(toSql('postgres', 'public', 'x"y', [{ kind: 'insert', values: { 'a"b': '1' } }])).toEqual([`INSERT INTO "x""y" ("a""b") VALUES ('1');`])
  })
  it('folds edits', () => {
    let l = addEdit([], { kind: 'update', key: { id: 1 }, set: { a: 1 } })
    l = addEdit(l, { kind: 'update', key: { id: 1 }, set: { b: 2 } })
    expect(l).toEqual([{ kind: 'update', key: { id: 1 }, set: { a: 1, b: 2 } }])
    l = addEdit(l, { kind: 'delete', key: { id: 1 } })
    expect(l).toEqual([{ kind: 'delete', key: { id: 1 } }])
    const withNew = addEdit([], { kind: 'insert', values: { id: 5 } })
    expect(addEdit(withNew, { kind: 'delete', key: { id: 5 } }, () => 0)).toEqual([])
  })
})

describe('browsing a table', () => {
  const cols = ['id', 'name', 'total']
  it('pages, sorts and filters with known columns only and values as literals', () => {
    const v = { ...firstView(50), page: 2, sort: { col: 'total', desc: true }, filters: [{ col: 'name', op: 'contains' as const, value: "o'5%" }, { col: 'total', op: '>' as const, value: '10' }, { col: 'evil); drop table x; --', op: '=' as const, value: '1' }] }
    expect(browseSql('postgres', 'public', 'orders', cols, v)).toBe(`SELECT * FROM "orders" WHERE CAST("name" AS TEXT) ILIKE '%o''5\\%%' ESCAPE '\\' AND "total" > 10 ORDER BY "total" DESC LIMIT 50 OFFSET 100`)
    expect(browseSql('mysql', '', 'orders', cols, { ...firstView(), filters: [{ col: 'name', op: 'null', value: '' }] })).toBe('SELECT * FROM `orders` WHERE `name` IS NULL LIMIT 100 OFFSET 0')
    expect(countSql('sqlite', 'main', 'orders', cols, { ...firstView(), sort: { col: 'id', desc: false }, filters: [{ col: 'total', op: '!=', value: 'x' }] })).toBe(`SELECT COUNT(*) FROM "orders" WHERE "total" <> 'x'`)
    expect(browseSql('sqlite', 'main', 'orders', cols, { ...firstView(), sort: { col: 'nope', desc: true } })).not.toContain('ORDER BY')
  })
  it('reads a spreadsheet paste and picks editors by type', () => {
    expect(parseTsv('a\tb\r\nc\td\n')).toEqual([['a', 'b'], ['c', 'd']])
    expect(['boolean', 'jsonb', 'timestamp with time zone', 'date', 'bigint', 'varchar(20)'].map(editorFor)).toEqual(['bool', 'json', 'datetime', 'date', 'number', 'text'])
    expect(jsonProblem('{"a":1}')).toBeNull()
    expect([parseCell('1', 'boolean', true), parseCell('no', 'BOOLEAN', false), parseCell('2', 'boolean', true)]).toEqual([true, false, '2'])
    expect(jsonProblem('{a:1}')).toBeTruthy()
  })
})
