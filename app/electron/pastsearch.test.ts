import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pastIndex } from './pastsearch'
import { fuse } from '../shared/pastsearch'

const line = (o: object) => JSON.stringify(o)
const log = (sid: string, cwd: string, turns: [string, string][]) =>
  turns.flatMap(([p, r], i) => [line({ type: 'user', uuid: `${sid}-u${i}`, sessionId: sid, cwd, timestamp: `2026-10-0${i + 1}T00:00:00Z`, message: { content: p } }), line({ type: 'assistant', uuid: `${sid}-a${i}`, message: { content: [{ type: 'text', text: r }] } })]).join('\n')

describe('past search index', () => {
  it('indexes, finds with accents and prefixes, updates and forgets', () => {
    const dir = mkdtempSync(join(tmpdir(), 'past-'))
    const projects = join(dir, 'projects')
    mkdirSync(join(projects, '-a'), { recursive: true })
    mkdirSync(join(projects, '-b'), { recursive: true })
    const fa = join(projects, '-a', 'A.jsonl')
    writeFileSync(fa, log('A', '/a', [['Fix the login redirect', 'Changed auth.ts'], ['Add a migration for orders', 'Wrote 0003_orders.sql']]))
    writeFileSync(join(projects, '-b', 'B.jsonl'), log('B', '/b', [['Configurar a autenticação', 'Pronto, sessão renovada']]))
    const ix = pastIndex(join(dir, 'past.db'), () => projects)
    expect(ix.refresh(true)).toEqual({ files: 2, turns: 3, read: 2 })
    expect(ix.refresh(true).read).toBe(0)
    const h = ix.search('migrat orders')
    expect(h.map((x) => [x.sessionId, x.n, x.of, x.endUuid])).toEqual([['A', 2, 2, 'A-a1']])
    expect(h[0]!.prompt.text.slice(h[0]!.prompt.marks[0]![0], h[0]!.prompt.marks[0]![1])).toBe('migration')
    expect(ix.search('autenticacao').map((x) => x.cwd)).toEqual(['/b'])
    expect(ix.search('auth', { cwd: '/b' })).toEqual([])
    expect(ix.search('"login redirect"').length).toBe(1)
    expect(ix.around(fa, 2).map((t) => t.n)).toEqual([1, 2])
    writeFileSync(fa, log('A', '/a', [['Rename the billing module', 'Done']]))
    utimesSync(fa, new Date(), new Date(Date.now() + 5000))
    ix.refresh(true)
    expect(ix.search('migration')).toEqual([])
    expect(ix.search('billing').length).toBe(1)
    rmSync(join(projects, '-b'), { recursive: true })
    expect(ix.refresh(true)).toMatchObject({ files: 1, turns: 1 })
    ix.close()
    rmSync(dir, { recursive: true })
  })

  it('finds turns by meaning, embeds only what is new, and fuses with words', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'past-'))
    const projects = join(dir, 'projects')
    mkdirSync(join(projects, '-a'), { recursive: true })
    writeFileSync(join(projects, '-a', 'A.jsonl'), log('A', '/a', [['Users cannot sign in after the deploy', 'The session cookie lost its domain; fixed in auth.ts'], ['Make the invoice PDF smaller', 'Compressed the images'], ['Speed up the orders query', 'Added an index on customer_id']]))
    const ix = pastIndex(join(dir, 'past.db'), () => projects)
    ix.refresh(true)
    // a fake embedding: words of the same idea land on the same axis
    const AX = [['login', 'sign in', 'auth', 'session', 'cookie'], ['pdf', 'invoice', 'document'], ['slow', 'speed', 'index', 'query', 'performance']]
    let calls = 0
    const embed = async (ts: string[]) => (calls++, ts.map((t) => AX.map((ws) => (ws.some((w) => t.toLowerCase().includes(w)) ? 1 : 0.01))))
    expect(await ix.embedPending('fake', embed)).toEqual({ done: 3, total: 3, added: 3 })
    expect(await ix.embedPending('fake', embed)).toMatchObject({ added: 0 })
    expect(calls).toBe(1)
    const q = (await embed(['the login is broken']))[0]!
    const near = ix.nearest('fake', q)
    expect(near[0]!.n).toBe(1)
    expect(ix.search('login broken')).toEqual([])
    const both = fuse(ix.search('invoice'), near)
    expect(both.map((h) => [h.n, h.by.join('+')]).slice(0, 2)).toEqual([[2, 'words+meaning'], [1, 'meaning']])
    expect(ix.vecStat('other')).toEqual({ done: 0, total: 3 })
    ix.close()
    rmSync(dir, { recursive: true })
  })
})
