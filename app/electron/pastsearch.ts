// Search across past sessions: Claude Code's logs under <config>/projects indexed with SQLite FTS5, one row
// per turn. Only files that changed since the last look are read again. The index lives in the app's
// data folder and holds only what the logs already hold on this machine.
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ftsQuery, marksOf, sessionOf, type PastTurn } from '../shared/pastsearch.js'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')

export type PastHit = { file: string; sessionId: string; cwd: string; branch: string; n: number; of: number; uuid: string; endUuid: string; at: string; prompt: { text: string; marks: [number, number][] }; reply: { text: string; marks: [number, number][] }; tools: string[] }

export function pastIndex(dbFile: string, projectsDir: () => string) {
  const db = new DatabaseSync(dbFile)
  db.exec(`
    create table if not exists files (path text primary key, mtime real, size integer, session text, cwd text, branch text, nturns integer);
    create table if not exists vecs (path text not null, n integer not null, model text not null, h text not null, v blob not null, primary key (path, n, model));
    create virtual table if not exists turns using fts5(prompt, reply, tools, path unindexed, n unindexed, uuid unindexed, end_uuid unindexed, at unindexed, tokenize = 'unicode61 remove_diacritics 2');
  `)
  let last = 0

  /** Reads the logs that changed; at most once every 20 seconds unless forced. */
  function refresh(force = false): { files: number; turns: number; read: number } {
    let read = 0
    if (force || Date.now() - last > 20_000) {
      last = Date.now()
      const root = projectsDir()
      const seen = new Set<string>()
      let dirs: string[] = []
      try {
        dirs = readdirSync(root)
      } catch {
        // no logs yet
      }
      const known = new Map((db.prepare('select path, mtime, size from files').all() as { path: string; mtime: number; size: number }[]).map((r) => [r.path, r]))
      const del = db.prepare('delete from turns where path = ?')
      const ins = db.prepare('insert into turns (prompt, reply, tools, path, n, uuid, end_uuid, at) values (?, ?, ?, ?, ?, ?, ?, ?)')
      const put = db.prepare('insert or replace into files (path, mtime, size, session, cwd, branch, nturns) values (?, ?, ?, ?, ?, ?, ?)')
      for (const d of dirs) {
        let names: string[] = []
        try {
          names = readdirSync(join(root, d)).filter((n) => n.endsWith('.jsonl'))
        } catch {
          continue
        }
        for (const n of names) {
          const path = join(root, d, n)
          seen.add(path)
          let st
          try {
            st = statSync(path)
          } catch {
            continue
          }
          const k = known.get(path)
          if (k && k.mtime === st.mtimeMs && k.size === st.size) continue
          const s = sessionOf(readFileSync(path, 'utf8'))
          db.exec('begin')
          try {
            del.run(path)
            for (const t of s.turns) ins.run(t.prompt, t.reply, t.tools.join(' '), path, t.n, t.uuid, t.endUuid, t.at)
            put.run(path, st.mtimeMs, st.size, s.sessionId || n.replace(/\.jsonl$/, ''), s.cwd, s.branch, s.turns.length)
            db.exec('commit')
          } catch (e) {
            db.exec('rollback')
            throw e
          }
          read++
        }
      }
      // logs deleted since: out of the index too
      for (const p of known.keys()) {
        if (seen.has(p)) continue
        db.prepare('delete from turns where path = ?').run(p)
        db.prepare('delete from files where path = ?').run(p)
      }
    }
    const c = db.prepare('select count(*) as f, coalesce(sum(nturns), 0) as t from files').get() as { f: number; t: number }
    return { files: c.f, turns: c.t, read }
  }

  /** Turns matching the words, best first; `cwd` limits it to one project folder. */
  function search(q: string, opts: { cwd?: string; limit?: number } = {}): PastHit[] {
    const fq = ftsQuery(q)
    if (!fq) return []
    const rows = db
      .prepare(
        `select t.path as path, t.n as n, t.uuid as uuid, t.end_uuid as endUuid, t.at as at, t.tools as tools,
          snippet(turns, 0, char(1), char(2), '…', 24) as sp, snippet(turns, 1, char(1), char(2), '…', 32) as sr,
          f.session as session, f.cwd as cwd, f.branch as branch, f.nturns as total
        from turns t join files f on f.path = t.path
        where turns match ? ${opts.cwd ? 'and f.cwd = ?' : ''}
        order by bm25(turns, 3.0, 1.0, 0.5) limit ?`,
      )
      .all(...([fq, ...(opts.cwd ? [opts.cwd] : []), Math.min(200, opts.limit ?? 50)] as string[])) as Record<string, string | number>[]
    return rows.map((r) => ({ file: String(r.path), sessionId: String(r.session), cwd: String(r.cwd), branch: String(r.branch), n: Number(r.n), of: Number(r.total), uuid: String(r.uuid), endUuid: String(r.endUuid), at: String(r.at), prompt: marksOf(String(r.sp)), reply: marksOf(String(r.sr)), tools: String(r.tools).split(' ').filter(Boolean) }))
  }

  // ---- meaning: one vector per turn from a local embedding model, kept next to the words ----

  const turnText = (prompt: string, reply: string) => `${prompt.slice(0, 1500)}\n${reply.slice(0, 1500)}`
  const hashText = (t: string) => createHash('sha1').update(t).digest('hex').slice(0, 12)
  const toBlob = (v: number[]) => Buffer.from(new Float32Array(v).buffer)
  const fromBlob = (b: Uint8Array) => new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4)

  /** How many turns have a vector for this model, out of all. */
  function vecStat(model: string): { done: number; total: number } {
    const total = (db.prepare('select count(*) as c from turns').get() as { c: number }).c
    const done = (db.prepare('select count(*) as c from vecs where model = ?').get(model) as { c: number }).c
    return { done: Math.min(done, total), total }
  }

  /** Embeds turns that have no vector yet (or whose text changed), newest first, until the time runs out. */
  async function embedPending(model: string, embed: (texts: string[]) => Promise<number[][]>, msBudget = 4000): Promise<{ done: number; total: number; added: number }> {
    const t0 = Date.now()
    let added = 0
    // vectors of turns that are gone go too
    db.exec('delete from vecs where not exists (select 1 from turns t where t.path = vecs.path and t.n = vecs.n)')
    const todo = db.prepare(`select t.path as path, t.n as n, t.prompt as prompt, t.reply as reply, v.h as h from turns t join files f on f.path = t.path
      left join vecs v on v.path = t.path and v.n = t.n and v.model = ? order by f.mtime desc, t.n desc`).all(model) as { path: string; n: number; prompt: string; reply: string; h: string | null }[]
    const need = todo.map((r) => ({ ...r, text: turnText(r.prompt, r.reply) })).filter((r) => r.h !== hashText(r.text))
    const put = db.prepare('insert or replace into vecs (path, n, model, h, v) values (?, ?, ?, ?, ?)')
    for (let i = 0; i < need.length && Date.now() - t0 < msBudget; i += 16) {
      const chunk = need.slice(i, i + 16)
      const vs = await embed(chunk.map((r) => r.text))
      db.exec('begin')
      chunk.forEach((r, k) => put.run(r.path, r.n, model, hashText(r.text), toBlob(vs[k]!)))
      db.exec('commit')
      added += chunk.length
    }
    return { ...vecStat(model), added }
  }

  /** Turns closest in meaning to the query vector, best first; turns not embedded yet are not seen. */
  function nearest(model: string, qv: number[], opts: { cwd?: string; limit?: number } = {}): (PastHit & { score: number })[] {
    const rows = db.prepare(`select v.path as path, v.n as n, v.v as v, t.prompt as prompt, t.reply as reply, t.tools as tools, t.uuid as uuid, t.end_uuid as endUuid, t.at as at,
        f.session as session, f.cwd as cwd, f.branch as branch, f.nturns as total
      from vecs v join turns t on t.path = v.path and t.n = v.n join files f on f.path = v.path
      where v.model = ? ${opts.cwd ? 'and f.cwd = ?' : ''}`).all(...([model, ...(opts.cwd ? [opts.cwd] : [])] as string[])) as Record<string, unknown>[]
    let qn = 0
    for (const x of qv) qn += x * x
    qn = Math.sqrt(qn) || 1
    const scored = rows.map((r) => {
      const v = fromBlob(r.v as Uint8Array)
      let d = 0
      let n = 0
      for (let i = 0; i < Math.min(v.length, qv.length); i++) (d += v[i]! * qv[i]!), (n += v[i]! * v[i]!)
      return { r, score: d / (qn * (Math.sqrt(n) || 1)) }
    })
    scored.sort((a, b) => b.score - a.score)
    const cut = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t)
    return scored.slice(0, Math.min(200, opts.limit ?? 50)).map(({ r, score }) => ({ file: String(r.path), sessionId: String(r.session), cwd: String(r.cwd), branch: String(r.branch), n: Number(r.n), of: Number(r.total), uuid: String(r.uuid), endUuid: String(r.endUuid), at: String(r.at), prompt: { text: cut(String(r.prompt), 200), marks: [] }, reply: { text: cut(String(r.reply), 260), marks: [] }, tools: String(r.tools).split(' ').filter(Boolean), score }))
  }

  /** The turns around one, read fresh from its log, for the preview and for the panel it opens. */
  function around(file: string, n: number, before = 3, after = 1): PastTurn[] {
    const known = db.prepare('select 1 from files where path = ?').get(file)
    if (!known) throw new Error('That session is not in the index.')
    const s = sessionOf(readFileSync(file, 'utf8'))
    return s.turns.filter((t) => t.n >= n - before && t.n <= n + after)
  }

  return { refresh, search, around, vecStat, embedPending, nearest, close: () => db.close() }
}
