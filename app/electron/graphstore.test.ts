import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { build, importsOf, moduleOf, parseAsk, tablesOf } from '../shared/projgraph'
import { GraphStore } from './graphstore'

const map = {
  services: [
    { name: 'api', dir: 'services/api', lang: 'js' as const, routes: [], stores: ['Postgres'], uses: ['shared'] },
    { name: 'web', dir: 'apps/web', lang: 'js' as const, routes: [], stores: [], uses: ['api'] },
    { name: 'shared', dir: 'packages/shared', lang: 'js' as const, routes: [], stores: [], uses: [] },
  ],
  stores: ['Postgres'],
  scanned: 6,
}
const files = [
  { path: 'services/api/src/billing/invoice.ts', text: "import { money } from '../money/format'\nconst q = 'select * from invoices join customers on customers.id = invoices.customer_id'" },
  { path: 'services/api/src/money/format.ts', text: 'export const money = (n: number) => n.toFixed(2)' },
  { path: 'services/api/src/orders/create.ts', text: "import { bill } from '../billing/invoice'\nawait db.query(`insert into orders (id) values ($1)`)" },
  { path: 'services/api/src/reports/monthly.ts', text: "import { bill } from '../billing'\n" },
  { path: 'services/api/src/billing/index.ts', text: "export * from './invoice'" },
  { path: 'services/api/db/schema.sql', text: 'create table if not exists invoices (id serial);\ncreate table customers (id serial);' },
]
const docs = [
  { kind: 'adr' as const, id: '0003', title: '0003 Invoices are immutable once sent', text: 'The billing module never updates an invoices row; corrections are new rows.' },
  { kind: 'decision' as const, id: 'd1', title: 'Decision: money is stored in cents', text: 'Why: rounding. Applies to format and to orders.', date: '2026-09-01' },
  { kind: 'decision' as const, id: 'd2', title: 'Decision: we use pnpm', text: 'Why: workspaces.' },
]

describe('project graph', () => {
  it('reads modules, imports and tables from code', () => {
    expect(moduleOf('services/api/src/billing/invoice.ts', 'services/api')).toBe('services/api/src/billing')
    expect(moduleOf('services/api/db/schema.sql', 'services/api')).toBe('services/api/db')
    expect(importsOf(files[0]!)).toEqual(['services/api/src/money/format'])
    expect(importsOf({ path: 'app/svc/a.py', text: 'from .models import User\nfrom ..core import x' })).toEqual(['app/svc/models', 'app/core'])
    expect(tablesOf(files[0]!).sort()).toEqual(['customers', 'invoices'])
    expect(tablesOf(files[5]!).sort()).toEqual(['customers', 'invoices'])
    expect(tablesOf({ path: 'x.ts', text: "import a from 'b'\nconst s = 'pick from the list'" })).toEqual([])
  })
  it('answers what depends on a module, through others, and keeps it in SQLite', () => {
    const g = build(map, files, docs)
    const store = new GraphStore(join(mkdtempSync(join(tmpdir(), 'stm-graph-')), 'g.sqlite'))
    store.save(g, Date.UTC(2026, 9, 26, 12))
    const deps = store.dependents('module:services/api/src/money')
    expect(deps.map((d) => [d.label, d.depth])).toEqual([
      ['services/api/src/billing', 1],
      ['services/api/src/orders', 2],
      ['services/api/src/reports', 2],
    ])
    expect(store.dependents('service:api').map((d) => d.label)).toEqual(['web'])
    expect(store.dependents('table:invoices').map((d) => d.label)).toContain('services/api/src/billing')
    store.close()
  })
  it('finds the decisions that touch a part, including what it contains', () => {
    const store = new GraphStore(join(mkdtempSync(join(tmpdir(), 'stm-graph-')), 'g.sqlite'))
    store.save(build(map, files, docs))
    expect(store.touching('module:services/api/src/billing').map((n) => n.id)).toEqual(['adr:0003'])
    expect(store.touching('service:api').map((n) => n.id).sort()).toEqual(['adr:0003', 'decision:d1'])
    expect(store.touching('table:invoices').map((n) => n.id)).toEqual(['adr:0003'])
    const a = store.answer('@graph what depends on money')!
    expect(a).toContain('module services/api/src/money')
    expect(a).toContain('- module services/api/src/orders (through 1 other)')
    expect(store.answer('@graph decisions about billing')).toContain('ADR 0003 Invoices are immutable')
    expect(store.answer('no graph here')).toBeNull()
    expect(store.answer('@graph what depends on nothing-like-this')).toContain('nothing called')
    store.close()
  })
  it('parses the @graph line', () => {
    expect(parseAsk('@graph what depends on billing?')).toEqual({ kind: 'depends', target: 'billing' })
    expect(parseAsk('look: @graph decisions about orders')).toEqual({ kind: 'decisions', target: 'orders' })
    expect(parseAsk('@graph invoices')).toEqual({ kind: 'both', target: 'invoices' })
  })
})
