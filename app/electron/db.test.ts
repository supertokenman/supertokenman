import { mkdtempSync } from 'node:fs'
import { createRequire } from 'node:module'
// loaded through require: the test runner's bundler does not know node:sqlite yet
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { query, tables, type DbConn } from './db'

const vault = { get: (n: string) => ({ DB_FILE: file })[n], all: () => [] }
const file = join(mkdtempSync(join(tmpdir(), 'stm-db-')), 'shop.db')
const seed = new DatabaseSync(file)
seed.exec("create table items (id integer primary key, name text, price real); insert into items (name, price) values ('Pay now', 129.9), ('Refund', 10); create view cheap as select * from items where price < 50")
seed.close()
const ro: DbConn = { id: 'a', name: 'shop', kind: 'sqlite', target: '{{DB_FILE}}', writes: false }

describe('database viewer (sqlite)', () => {
  it('lists tables and views with their row counts, the path filled from the vault', async () => {
    expect(await tables(ro, vault)).toEqual([
      { schema: 'main', name: 'cheap', kind: 'view', rows: 1 },
      { schema: 'main', name: 'items', kind: 'table', rows: 2 },
    ])
  })
  it('runs a query', async () => {
    const r = await query(ro, 'select name, price from items order by id', vault)
    expect(r.columns).toEqual(['name', 'price'])
    expect(r.rows).toEqual([['Pay now', 129.9], ['Refund', 10]])
    expect(r.count).toBe(2)
  })
  it('refuses writes unless they are on', async () => {
    expect((await query(ro, "delete from items", vault)).error).toBeTruthy()
    const r = await query({ ...ro, writes: true }, "update items set price = 1 where id = 2", vault)
    expect(r.command).toBe('1 row changed')
  })
  it('says which secret is missing', async () => {
    expect(await tables({ ...ro, target: '{{NOPE}}' }, vault)).toEqual({ error: expect.stringMatching(/NOPE/) })
  })
})

describe('grid apply', () => {
  it('runs all or nothing on SQLite, and only with writes on', async () => {
    const { apply } = await import('./db')
    const { mkdtempSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { createRequire } = await import('node:module')
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
    const f = join(mkdtempSync(join(tmpdir(), 'grid-')), 'a.db')
    const db = new DatabaseSync(f)
    db.exec("create table t (id integer primary key, v text not null); insert into t values (1, 'a'), (2, 'b')")
    db.close()
    const v = { get: () => undefined, all: () => [] }
    const conn = { id: 'x', name: 'x', kind: 'sqlite' as const, target: f, writes: true }
    expect(await apply({ ...conn, writes: false }, ["update t set v = 'z'"], v)).toMatchObject({ ok: false, error: /read-only/ })
    const bad = await apply(conn, ["update t set v = 'c' where id = 1", 'update t set v = null where id = 2'], v)
    expect(bad).toMatchObject({ ok: false, at: 1 })
    const check = new DatabaseSync(f)
    expect(check.prepare('select v from t where id = 1').get()).toEqual({ v: 'a' })
    check.close()
    expect(await apply(conn, ["update t set v = 'c' where id = 1", "insert into t values (3, 'd')", 'delete from t where id = 2'], v)).toMatchObject({ ok: true, changed: 3 })
  })
})

describe('postgres tls', async () => {
  const { pgSsl, pgTlsHint } = await import('./db')
  it('verifies certificates unless the string asks for require', () => {
    expect(pgSsl('postgres://u:p@db.abc.supabase.co:5432/postgres')).toEqual({ rejectUnauthorized: true })
    expect(pgSsl('postgres://u:p@ep-x.neon.tech/db')).toEqual({ rejectUnauthorized: true })
    expect(pgSsl('postgres://u:p@h/db?sslmode=verify-full')).toEqual({ rejectUnauthorized: true })
    expect(pgSsl('postgres://u:p@h/db?sslmode=verify-ca')).toEqual({ rejectUnauthorized: true })
    expect(pgSsl('postgres://u:p@h/db?sslmode=require')).toEqual({ rejectUnauthorized: false })
    expect(pgSsl('postgres://u:p@ep-x.neon.tech/db?sslmode=require')).toEqual({ rejectUnauthorized: false })
    expect(pgSsl('postgres://u:p@localhost/db')).toBeUndefined()
    expect(pgSsl('postgres://u:p@h/db?sslmode=disable')).toBeUndefined()
  })
  it('explains a certificate it could not check', () => {
    expect(pgTlsHint(new Error('self-signed certificate in certificate chain'))).toMatch(/sslmode=require/)
    expect(pgTlsHint(new Error('password authentication failed'))).toBeNull()
  })
})
