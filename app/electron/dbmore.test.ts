import { mkdtempSync } from 'node:fs'
import { createRequire } from 'node:module'
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { explain, pgPlan, query, schema, sqlPrompt, tables, toCsv, toJson, WRITES, type DbConn } from './db'

const vault = { get: (n: string) => ({ PW: 'pw123', CF: 'cf-token' })[n], all: () => [{ value: 'pw123' }, { value: 'cf-token' }] }
const file = join(mkdtempSync(join(tmpdir(), 'stm-db2-')), 'shop.db')
const seed = new DatabaseSync(file)
seed.exec('pragma foreign_keys = on; create table customers (id integer primary key, name text not null); create table orders (id integer primary key, customer_id integer references customers(id), total real); insert into customers (name) values (\'Ana\')')
seed.close()
const lite: DbConn = { id: 'l', name: 'shop', kind: 'sqlite', target: file, writes: false }

describe('schema, plan and export (sqlite)', () => {
  it('reads tables, columns, keys and foreign keys', async () => {
    const s = await schema(lite, vault)
    expect(s.tables.map((t) => t.name)).toEqual(['customers', 'orders'])
    expect(s.tables[0]!.columns).toEqual([{ name: 'id', type: 'INTEGER', nullable: true, pk: true }, { name: 'name', type: 'TEXT', nullable: false, pk: false }])
    expect(s.fks).toEqual([{ from: 'orders', column: 'customer_id', to: 'customers', toColumn: 'id' }])
  })
  it('explains a query and marks a full scan', async () => {
    const p = await explain(lite, 'select * from orders where total > 10', vault)
    expect(p[0]).toMatchObject({ warn: 'reads the whole table' })
    expect((await explain(lite, 'select * from customers where id = 1', vault))[0]!.warn).toBeUndefined()
  })
  it('writes CSV with quotes and JSON objects', () => {
    expect(toCsv(['a', 'b'], [['x,y', 'say "hi"'], [null, 2]])).toBe('a,b\n"x,y","say ""hi"""\n,2\n')
    expect(JSON.parse(toJson(['a'], [[1], [null]]))).toEqual([{ a: 1 }, { a: null }])
  })
  it('knows a write when it sees one', () => {
    for (const s of ['insert into x values (1)', ' DELETE from x', 'with a as (select 1) update x set y=1', 'drop table x', 'pragma user_version = 3']) expect(WRITES.test(s), s).toBe(true)
    for (const s of ['select 1', 'with a as (select 1) select * from a', 'pragma table_info(x)', 'explain query plan select 1']) expect(WRITES.test(s), s).toBe(false)
  })
  it('asks the local model for SQL with the dialect and the schema', async () => {
    const p = sqlPrompt('postgres', await schema(lite, vault), 'orders per customer')
    expect(p).toContain('PostgreSQL')
    expect(p).toContain('orders(id INTEGER pk, customer_id INTEGER, total REAL)')
    expect(p).toContain('orders.customer_id -> customers.id')
  })
  it('reads a Postgres plan and marks a big sequential scan', () => {
    const n = pgPlan({ 'Node Type': 'Hash Join', 'Total Cost': 300, 'Plan Rows': 9000, Plans: [{ 'Node Type': 'Seq Scan', 'Relation Name': 'orders', 'Plan Rows': 9000 }, { 'Node Type': 'Index Scan', 'Relation Name': 'customers', 'Index Name': 'customers_pkey', 'Plan Rows': 1 }] })
    expect(n.children[0]!.warn).toMatch(/9,000 rows/)
    expect(n.children[1]).toMatchObject({ label: 'Index Scan on customers', detail: 'index customers_pkey' })
  })
})

describe('Cloudflare D1 through its API', () => {
  const calls: { url: string; body: string; auth: string }[] = []
  const d1 = (async (url: string, init: { body: string; headers: Record<string, string> }) => {
    calls.push({ url, body: init.body, auth: init.headers.authorization! })
    const { sql } = JSON.parse(init.body) as { sql: string }
    if (/sqlite_master/.test(sql)) return new Response(JSON.stringify({ success: true, result: [{ results: { columns: ['name', 'type'], rows: [['notes', 'table']] } }] }))
    if (/count/.test(sql)) return new Response(JSON.stringify({ success: true, result: [{ results: { columns: ['n'], rows: [[3]] } }] }))
    return new Response(JSON.stringify({ success: true, result: [{ results: { columns: ['id', 'body'], rows: [[1, 'hi']] } }] }))
  }) as unknown as typeof fetch
  const conn: DbConn = { id: 'd', name: 'edge', kind: 'd1', target: 'd1://acc123/db456?token={{CF}}', writes: false }
  it('lists tables and runs a query with the token from the vault', async () => {
    expect(await tables(conn, vault, d1)).toEqual([{ schema: 'main', name: 'notes', kind: 'table', rows: 3 }])
    expect(await query(conn, 'select * from notes', vault, d1)).toMatchObject({ columns: ['id', 'body'], rows: [[1, 'hi']] })
    expect(calls[0]).toMatchObject({ url: 'https://api.cloudflare.com/client/v4/accounts/acc123/d1/database/db456/raw', auth: 'Bearer cf-token' })
  })
  it('refuses a write while writes are off, before calling the API', async () => {
    const n = calls.length
    expect((await query(conn, 'delete from notes', vault, d1)).error).toMatch(/Writes are off/)
    expect(calls.length).toBe(n)
  })
})

// against real servers started for the test: STM_DB_LIVE=1 with Postgres on 5544, MariaDB on 3307, sshd on 2222
describe.skipIf(!process.env.STM_DB_LIVE)('live servers', () => {
  const pgc: DbConn = { id: 'p', name: 'pg', kind: 'postgres', target: 'postgres://postgres@127.0.0.1:5544/postgres', writes: false }
  const my: DbConn = { id: 'm', name: 'my', kind: 'mysql', target: 'mysql://app:{{PW}}@127.0.0.1:3307/shop', writes: false }
  it('Postgres: schema with foreign keys, a plan with a full scan, read-only', async () => {
    const s = await schema(pgc, vault)
    expect(s.fks).toContainEqual({ from: 'orders', column: 'customer_id', to: 'customers', toColumn: 'id' })
    const p = await explain(pgc, 'select * from orders where total > 5', vault)
    expect(JSON.stringify(p)).toMatch(/reads the whole table/)
    expect((await query(pgc, 'delete from orders', vault)).error).toMatch(/read-only/)
  })
  it('MySQL: tables, schema, a query, a plan, read-only, password masked', async () => {
    expect((await tables(my, vault)) as unknown[]).toContainEqual(expect.objectContaining({ name: 'customers', kind: 'table' }))
    const s = await schema(my, vault)
    expect(s.fks).toEqual([{ from: 'orders', column: 'customer_id', to: 'customers', toColumn: 'id' }])
    expect(await query(my, 'select name from customers order by id', vault)).toMatchObject({ columns: ['name'], rows: [['Ana'], ['Bia']] })
    expect((await explain(my, 'select * from customers', vault))[0]!.children.length).toBeGreaterThan(0)
    expect((await query(my, 'delete from customers', vault)).error).toMatch(/read.only|READ ONLY/i)
    const bad = await query({ ...my, target: 'mysql://app:{{PW}}@127.0.0.1:1/shop' }, 'select 1', vault)
    expect(bad.error).not.toContain('pw123')
  })
  it('both through an SSH tunnel', async () => {
    expect(await query({ ...pgc, ssh: 'root@127.0.0.1:2222' }, 'select count(*)::int from customers', vault)).toMatchObject({ rows: [[3000]] })
    expect(await query({ ...my, ssh: 'root@127.0.0.1:2222' }, 'select count(*) from customers', vault)).toMatchObject({ rows: [[2]] })
    expect((await query({ ...pgc, ssh: 'nobody@127.0.0.1:1' }, 'select 1', vault)).error).toMatch(/SSH tunnel/)
  })
})
