// Against a real TiDB when STM_TIDB_URL is set (docker run -p 4000:4000 pingcap/tidb); skipped otherwise.
import { describe, expect, it } from 'vitest'
import { explain, query, schema, type DbConn } from './db'

const url = process.env.STM_TIDB_URL
const vault = { get: (n: string) => ({ TIDB_URL: url })[n], all: () => [] }
const ro: DbConn = { id: 't', name: 'tidb', kind: 'tidb', target: '{{TIDB_URL}}', writes: false }

describe.skipIf(!url)('TiDB, live', () => {
  it('reads, refuses writes when they are off, and plans with EXPLAIN ANALYZE', async () => {
    const r = await query(ro, 'select count(*) from orders', vault)
    expect(r.error).toBeUndefined()
    expect(Number(r.rows[0]![0])).toBeGreaterThan(0)
    const w = await query(ro, "insert into orders (customer, total, created) values ('x', 1, '2026-01-01')", vault)
    expect(w.error).toMatch(/TiDB has no read-only session/)
    const plan = await explain(ro, 'select * from orders where total > 8000', vault)
    expect(JSON.stringify(plan)).toMatch(/TableFullScan on orders/)
    expect(JSON.stringify(plan)).toMatch(/actual/)
  })
  it('sees VECTOR columns and ranks by distance', async () => {
    const s = await schema(ro, vault)
    expect(s.tables.find((t) => t.name === 'docs')?.columns.find((c) => c.name === 'embedding')?.type).toMatch(/vector/i)
    const r = await query(ro, "select id from docs order by vec_cosine_distance(embedding, '[1,0,0]') limit 1", vault)
    expect(Number(r.rows[0]![0])).toBe(1)
  })
})
