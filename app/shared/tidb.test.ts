import { describe, expect, it } from 'vitest'
import { addressProblem, isCloud, tidbPlan, tlsFor, vectorColumns, vectorSql } from './tidb'

// rows as TiDB v8.5 returned them for EXPLAIN ANALYZE select * from orders where total > 8000
const COLS = ['id', 'estRows', 'actRows', 'task', 'access object', 'execution info', 'operator info', 'memory', 'disk']
const ROWS = [
  ['TableReader_7', '1000.00', '324', 'root', '', 'time:1.23ms, loops:2, RU:1.132617, cop_task: {num: 2}', 'data:Selection_6', '12.0 KB', 'N/A'],
  ['└─Selection_6', '1000.00', '324', 'cop[tikv]', '', 'tikv_task:{proc max:564.3µs}', 'gt(test.orders.total, 8000)', 'N/A', 'N/A'],
  ['  └─TableFullScan_5', '3000.00', '3000', 'cop[tikv]', 'table:orders', 'tikv_task:{proc max:564.3µs}', 'keep order:false', 'N/A', 'N/A'],
]

describe('TiDB', () => {
  it('requires verified TLS on TiDB Cloud and when asked', () => {
    expect(isCloud('gateway01.us-west-2.prod.aws.tidbcloud.com')).toBe(true)
    expect(isCloud('tidbcloud.com.evil.example')).toBe(false)
    expect(tlsFor('mysql://2abc.root:x@gateway01.eu-central-1.prod.aws.tidbcloud.com:4000/test')).toEqual({ minVersion: 'TLSv1.2', rejectUnauthorized: true })
    expect(tlsFor('mysql://root@127.0.0.1:4000/test')).toBeUndefined()
    expect(tlsFor('mysql://root@db.internal:4000/test?ssl=true')).toBeDefined()
    expect(addressProblem('mysql://2abc.root:x@gateway01.x.prod.aws.tidbcloud.com:4000/test?ssl=false')).toMatch(/only accepts TLS/)
    expect(addressProblem('mysql://root:x@gateway01.x.prod.aws.tidbcloud.com:4000/test')).toMatch(/prefix/)
    expect(addressProblem('mysql://root@127.0.0.1:4000/test')).toBeNull()
  })
  it('reads the EXPLAIN ANALYZE rows as a tree and marks the full scan', () => {
    const [root] = tidbPlan(COLS, ROWS)
    expect(root!.label).toBe('TableReader')
    expect(root!.detail).toContain('time 1.23ms')
    const sel = root!.children[0]!
    expect(sel.label).toBe('Selection')
    const scan = sel.children[0]!
    expect(scan).toMatchObject({ label: 'TableFullScan on orders', rows: 3000, warn: 'reads the whole table (about 3,000 rows)' })
    expect(scan.detail).toContain('est 3,000 · actual 3,000')
  })
  it('reads plain EXPLAIN too and flags a bad estimate', () => {
    const [r] = tidbPlan(['id', 'estRows', 'task', 'access object', 'operator info'], [['IndexLookUp_10', '10.00', 'root', '', ''], ['├─IndexRangeScan_8(Build)', '10.00', 'cop[tikv]', 'table:orders, index:idx_customer(customer)', 'range:["c1","c1"]'], ['└─TableRowIDScan_9(Probe)', '10.00', 'cop[tikv]', 'table:orders', 'keep order:false']])
    expect(r!.children.map((c) => c.label)).toEqual(['IndexRangeScan_8(Build) on orders, index:idx_customer(customer)', 'TableRowIDScan_9(Probe) on orders'])
    const [bad] = tidbPlan(COLS, [['Selection_6', '1.00', '900', 'root', '', 'time:2ms', '', 'N/A', 'N/A']])
    expect(bad!.warn).toMatch(/estimate was off/)
  })
  it('builds a similarity query for a VECTOR column and refuses anything that is not a vector', () => {
    expect(vectorSql({ table: 'docs', column: 'embedding', vector: '[1, 0, 0]', k: 3, show: ['id', 'title'] })).toBe("SELECT `id`, `title`, VEC_COSINE_DISTANCE(`embedding`, '[1,0,0]') AS distance\nFROM `docs`\nORDER BY distance\nLIMIT 3")
    expect(vectorSql({ table: 'docs', column: 'e', vector: '[0.5,-1e-3]', metric: 'l2' })).toContain('VEC_L2_DISTANCE')
    expect(() => vectorSql({ table: 'docs', column: 'e', vector: "[1]'); drop table docs; --" })).toThrow(/should look like/)
    expect(vectorColumns([{ name: 'docs', columns: [{ name: 'id', type: 'int' }, { name: 'embedding', type: 'vector' }] }])).toEqual([{ table: 'docs', column: 'embedding', others: ['id'] }])
  })
})
