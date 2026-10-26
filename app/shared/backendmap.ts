// Backend map (idea from Encore, MPL-2.0; no code taken): the services of a project, the routes each one
// serves and the data stores it talks to, read from the source without running anything. Services are the
// folders with their own package.json or pyproject; routes come from the usual frameworks' patterns.

export type Route = { method: string; path: string; file: string; line: number; framework: string }
export type Service = { name: string; dir: string; lang: 'js' | 'py'; routes: Route[]; stores: string[]; uses: string[] }
export type BackendMap = { services: Service[]; stores: string[]; scanned: number }
export type SourceFile = { path: string; text: string }

const METHODS = 'get|post|put|patch|delete|all|options|head'
const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length
const norm = (p: string) => (`/${p}`.replace(/\/+/g, '/').replace(/(.)\/$/, '$1'))

/** Routes in one file, by the framework patterns it uses. */
export function routesOf(f: SourceFile): Route[] {
  const out: Route[] = []
  const t = f.text
  const add = (method: string, path: string, at: number, framework: string) => out.push({ method: method.toUpperCase(), path: norm(path), file: f.path, line: lineOf(t, at), framework })
  if (/\.(m?[jt]sx?)$/.test(f.path)) {
    // Express, Hono, Koa router, Fastify shorthand: app.get('/x', ...)
    for (const m of t.matchAll(new RegExp(`\\b(?:app|router|server|api|r|routes|route|hono|fastify)\\.(${METHODS})\\(\\s*['"\`]([^'"\`]+)['"\`]`, 'g'))) add(m[1]!, m[2]!, m.index!, 'express-like')
    // Fastify full form: fastify.route({ method: 'GET', url: '/x' })
    for (const m of t.matchAll(/\.route\(\s*\{[^}]*?method:\s*['"](\w+)['"][^}]*?url:\s*['"]([^'"]+)['"]/g)) add(m[1]!, m[2]!, m.index!, 'fastify')
    // Encore.ts: api({ method: "GET", path: "/x", expose: true }, ...)
    for (const m of t.matchAll(/\bapi(?:\.raw)?\(\s*\{([^}]*)\}/g)) {
      const method = /method:\s*['"]([\w*]+)['"]/.exec(m[1]!)?.[1] ?? 'POST'
      const path = /path:\s*['"]([^'"]+)['"]/.exec(m[1]!)?.[1]
      if (path) add(method === '*' ? 'ALL' : method, path, m.index!, 'encore')
    }
    // NestJS: @Controller('users') with @Get(':id')
    const ctrl = /@Controller\(\s*(?:['"]([^'"]*)['"])?\s*\)/.exec(t)
    if (ctrl) for (const m of t.matchAll(/@(Get|Post|Put|Patch|Delete|All|Options|Head)\(\s*(?:['"]([^'"]*)['"])?\s*\)/g)) add(m[1]!, `${ctrl[1] ?? ''}/${m[2] ?? ''}`, m.index!, 'nestjs')
    // Next.js app router: app/**/route.ts exporting GET, POST...
    const app = /(?:^|\/)app\/(.*?)\/?route\.[jt]s$/.exec(f.path)
    if (app) {
      const p = `/${app[1]}`.replace(/\/\([^)]*\)/g, '').replace(/\[\.\.\.(\w+)\]/g, '*$1').replace(/\[(\w+)\]/g, ':$1')
      for (const m of t.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)) add(m[1]!, p, m.index!, 'next')
    }
    // Next.js pages router: pages/api/**
    const pages = /(?:^|\/)pages\/(api\/.*?)\.[jt]sx?$/.exec(f.path)
    if (pages && /export\s+default/.test(t)) add('ALL', `/${pages[1]!.replace(/\/index$/, '').replace(/\[(\w+)\]/g, ':$1')}`, t.search(/export\s+default/), 'next')
  }
  if (f.path.endsWith('.py')) {
    // FastAPI and Flask 2: @app.get("/x"), @router.post("/x")
    for (const m of t.matchAll(new RegExp(`@\\w+\\.(${METHODS})\\(\\s*['"]([^'"]+)['"]`, 'g'))) add(m[1]!, m[2]!, m.index!, 'fastapi')
    // Flask: @app.route("/x", methods=["GET", "POST"])
    for (const m of t.matchAll(/@\w+\.route\(\s*['"]([^'"]+)['"](?:[^)]*methods\s*=\s*\[([^\]]*)\])?/g)) {
      const methods = m[2] ? [...m[2].matchAll(/['"](\w+)['"]/g)].map((x) => x[1]!) : ['GET']
      for (const meth of methods) add(meth, m[1]!, m.index!, 'flask')
    }
  }
  return out
}

const STORES: [RegExp, string][] = [
  [/from ['"](pg|postgres|@neondatabase\/serverless|drizzle-orm\/(node-)?postgres)|require\(['"]pg['"]\)|import psycopg|asyncpg/, 'Postgres'],
  [/from ['"]mysql2|require\(['"]mysql2?['"]\)|import pymysql|mysqlclient/, 'MySQL'],
  [/from ['"](better-sqlite3|node:sqlite|sqlite3)|import sqlite3/, 'SQLite'],
  [/from ['"]@prisma\/client['"]/, 'Prisma'],
  [/from ['"]mongoose|from ['"]mongodb|import pymongo|motor\.motor_asyncio/, 'MongoDB'],
  [/from ['"](ioredis|redis)['"]|import redis/, 'Redis'],
  [/from ['"]@supabase\/supabase-js['"]|from supabase import/, 'Supabase'],
  [/from ['"]kafkajs['"]|import kafka|confluent_kafka/, 'Kafka'],
  [/from ['"](amqplib|bullmq|bull)['"]|import pika|import celery/, 'Queue'],
  [/from ['"]@aws-sdk\/client-s3['"]|import boto3/, 'S3'],
  [/new SQLDatabase\(|from ['"]encore\.dev\/storage\/sqldb['"]/, 'Encore SQL'],
]

/** The map: a service per folder with its own manifest, its routes, stores and the sibling services it depends on. */
export function mapOf(files: SourceFile[], manifests: { dir: string; name: string; lang: 'js' | 'py'; deps: string[] }[]): BackendMap {
  const roots = [...manifests].sort((a, b) => b.dir.length - a.dir.length)
  const owner = (p: string) => roots.find((m) => m.dir === '' || p === m.dir || p.startsWith(`${m.dir}/`))
  const by = new Map<string, Service>(manifests.map((m) => [m.dir, { name: m.name, dir: m.dir, lang: m.lang, routes: [], stores: [], uses: [] }]))
  for (const f of files) {
    const m = owner(f.path)
    if (!m) continue
    const s = by.get(m.dir)!
    s.routes.push(...routesOf(f))
    for (const [re, name] of STORES) if (re.test(f.text) && !s.stores.includes(name)) s.stores.push(name)
  }
  const names = new Set(manifests.map((m) => m.name))
  for (const m of manifests) by.get(m.dir)!.uses = m.deps.filter((d) => names.has(d) && d !== m.name)
  // a root manifest of a monorepo with no routes of its own is not a service
  const services = [...by.values()].filter((s) => s.routes.length || s.stores.length || s.uses.length || manifests.length === 1)
  for (const s of services) s.routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
  return { services: services.sort((a, b) => b.routes.length - a.routes.length || b.stores.length - a.stores.length || (a.dir === "" ? 1 : b.dir === "" ? -1 : a.name.localeCompare(b.name))), stores: [...new Set(services.flatMap((s) => s.stores))], scanned: files.length }
}

/** The map as Markdown with a Mermaid diagram, for docs or for Claude. */
export function toMarkdown(m: BackendMap, project: string): string {
  const id = (s: string) => s.replace(/[^\w]/g, '_')
  const lines = ['```mermaid', 'flowchart LR']
  for (const s of m.services) lines.push(`  ${id(s.name)}["${s.name}<br/>${s.routes.length} routes"]`)
  for (const st of m.stores) lines.push(`  ${id(`db_${st}`)}[("${st}")]`)
  for (const s of m.services) {
    for (const u of s.uses.filter((x) => m.services.some((o) => o.name === x))) lines.push(`  ${id(s.name)} -.-> ${id(u)}`)
    for (const st of s.stores) lines.push(`  ${id(s.name)} --> ${id(`db_${st}`)}`)
  }
  lines.push('```')
  const tables = m.services.map((s) => [`## ${s.name}`, '', s.dir ? `Folder: \`${s.dir}\`` : 'Folder: project root', ...(s.stores.length ? [`Data: ${s.stores.join(', ')}`] : []), ...(s.uses.length ? [`Uses: ${s.uses.join(', ')}`] : []), '', ...(s.routes.length ? ['| Method | Path | Where |', '| --- | --- | --- |', ...s.routes.map((r) => `| ${r.method} | \`${r.path}\` | ${r.file}:${r.line} |`)] : ['No routes found.']), ''].join('\n'))
  return [`# Backend map: ${project}`, '', `Read from the source by SuperTokenMan (${m.scanned} files); routes from the usual framework patterns, so dynamic ones may be missing.`, '', ...lines, '', ...tables].join('\n')
}
