// The New connection form: engines the database viewer can open, hosted services as presets over those
// same drivers, and the connection string built from fields (or read back from a pasted one).
// The password is never typed here: it is a vault name, written as {{NAME}} and filled in the main process.

export type Kind = 'postgres' | 'mysql' | 'tidb' | 'sqlite' | 'd1'
export type Fields = { host: string; port: string; database: string; user: string; secret: string; ssl: boolean; path: string; account: string; dbId: string }

export type Preset = {
  id: string
  label: string
  kind: Kind
  /** two or three letters for the drawn mark */
  mark: string
  /** what it is, in a few words */
  about: string
  defaults: Partial<Fields>
  /** placeholders for the fields, where the service has a known shape */
  hints?: Partial<Record<keyof Fields, string>>
  /** where to find the values, in the service's own words */
  where?: string
}

export const PRESETS: Preset[] = [
  { id: 'postgres', label: 'Postgres', kind: 'postgres', mark: 'PG', about: 'Any Postgres server', defaults: { port: '5432', user: 'postgres', database: 'postgres' } },
  { id: 'mysql', label: 'MySQL', kind: 'mysql', mark: 'MY', about: 'MySQL or MariaDB', defaults: { port: '3306', user: 'root' } },
  { id: 'sqlite', label: 'SQLite', kind: 'sqlite', mark: 'SQ', about: 'A file on this Mac', defaults: {} },
  { id: 'supabase', label: 'Supabase', kind: 'postgres', mark: 'SB', about: 'Postgres, hosted', defaults: { port: '5432', database: 'postgres', ssl: true, secret: 'SUPABASE_DB_PASSWORD' }, hints: { host: 'aws-0-us-east-1.pooler.supabase.com', user: 'postgres.yourprojectref' }, where: 'Project settings, Database, Connection string, Session pooler.' },
  { id: 'neon', label: 'Neon', kind: 'postgres', mark: 'NE', about: 'Serverless Postgres', defaults: { port: '5432', database: 'neondb', user: 'neondb_owner', ssl: true, secret: 'NEON_DB_PASSWORD' }, hints: { host: 'ep-name-123456.us-east-2.aws.neon.tech' }, where: 'Project dashboard, Connect.' },
  { id: 'railway', label: 'Railway', kind: 'postgres', mark: 'RW', about: 'Postgres on Railway', defaults: { user: 'postgres', database: 'railway', secret: 'RAILWAY_DB_PASSWORD' }, hints: { host: 'name.proxy.rlwy.net', port: '12345' }, where: 'The Postgres service, Variables, DATABASE_PUBLIC_URL.' },
  { id: 'render', label: 'Render', kind: 'postgres', mark: 'RN', about: 'Postgres on Render', defaults: { port: '5432', ssl: true, secret: 'RENDER_DB_PASSWORD' }, hints: { host: 'dpg-abc123-a.oregon-postgres.render.com', user: 'app_user', database: 'app_db' }, where: 'The database, Connect, External.' },
  { id: 'planetscale', label: 'PlanetScale', kind: 'mysql', mark: 'PS', about: 'MySQL on Vitess', defaults: { port: '3306', ssl: true, secret: 'PLANETSCALE_PASSWORD' }, hints: { host: 'aws.connect.psdb.cloud', user: 'abc123def456' }, where: 'The database, Connect, a new password, General.' },
  { id: 'tidb', label: 'TiDB', kind: 'tidb', mark: 'TI', about: 'TiDB Cloud or local', defaults: { port: '4000', database: 'test', ssl: true, secret: 'TIDB_PASSWORD' }, hints: { host: 'gateway01.us-east-1.prod.aws.tidbcloud.com', user: '2abc.root' }, where: 'The cluster, Connect. The user name keeps its prefix.' },
  { id: 'd1', label: 'Cloudflare D1', kind: 'd1', mark: 'D1', about: 'SQLite at the edge', defaults: { secret: 'CLOUDFLARE_API_TOKEN' }, where: 'The account id is on the dashboard; the database id under Storage, D1. The token needs D1 read (and edit, for writes).' },
]

export const EMPTY: Fields = { host: '', port: '', database: '', user: '', secret: '', ssl: false, path: '', account: '', dbId: '' }

export const fieldsFor = (p: Preset): Fields => ({ ...EMPTY, ...p.defaults })

const enc = (s: string) => encodeURIComponent(s.trim())
const pw = (secret: string) => (secret.trim() ? `:{{${secret.trim().replace(/^\{\{|\}\}$/g, '')}}}` : '')

/** The connection string for an engine, from its fields; empty while the required ones are missing. */
export function buildUrl(kind: Kind, f: Fields): string {
  if (kind === 'sqlite') return f.path.trim()
  if (kind === 'd1') {
    if (!f.account.trim() || !f.dbId.trim()) return ''
    return `d1://${enc(f.account)}/${enc(f.dbId)}${f.secret.trim() ? `?token={{${f.secret.trim()}}}` : ''}`
  }
  if (!f.host.trim()) return ''
  const scheme = kind === 'postgres' ? 'postgres' : 'mysql'
  const user = f.user.trim() ? `${enc(f.user)}${pw(f.secret)}@` : ''
  const port = f.port.trim() ? `:${f.port.trim()}` : ''
  const db = f.database.trim() ? `/${enc(f.database)}` : ''
  const ssl = f.ssl ? (kind === 'postgres' ? '?sslmode=verify-full' : '?ssl=true') : ''
  return `${scheme}://${user}${f.host.trim()}${port}${db}${ssl}`
}

/** A pasted connection string read back into fields; null when it is not one this form can show. */
export function parseUrl(kind: Kind, url: string): Fields | null {
  const t = url.trim()
  if (kind === 'sqlite') return { ...EMPTY, path: t }
  // {{NAME}} is not valid in a URL: swap it for a marker while parsing
  const names: string[] = []
  const safe = t.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (_, n: string) => `vault${names.push(n) - 1}x`)
  const back = (s: string) => s.replace(/vault(\d+)x/g, (_, i: string) => `{{${names[Number(i)]}}}`)
  let u: URL
  try {
    u = new URL(safe)
  } catch {
    return null
  }
  if (kind === 'd1') {
    if (u.protocol !== 'd1:') return null
    const token = back(u.searchParams.get('token') ?? '')
    return { ...EMPTY, account: decodeURIComponent(u.hostname), dbId: decodeURIComponent(u.pathname.replace(/^\/+/, '')), secret: /^\{\{(.+)\}\}$/.exec(token)?.[1] ?? '' }
  }
  if (!(kind === 'postgres' ? /^postgres(ql)?:$/ : /^mysql:$/).test(u.protocol)) return null
  const pass = back(decodeURIComponent(u.password))
  // a literal password cannot be shown as a vault name: the string stays as pasted
  if (pass && !/^\{\{[A-Za-z_][A-Za-z0-9_]*\}\}$/.test(pass)) return null
  const mode = (u.searchParams.get('sslmode') ?? u.searchParams.get('ssl') ?? '').toLowerCase()
  const others = [...u.searchParams.keys()].filter((k) => k !== 'sslmode' && k !== 'ssl')
  if (others.length) return null
  return {
    ...EMPTY,
    host: u.hostname,
    port: u.port,
    database: decodeURIComponent(u.pathname.replace(/^\//, '')),
    user: decodeURIComponent(u.username),
    secret: pass.slice(2, -2),
    ssl: !!mode && !/^(disable|false|0)$/.test(mode),
  }
}

/** The preset a pasted address most likely belongs to, by its host. */
export function presetFor(url: string): string | null {
  const rules: [RegExp, string][] = [
    [/supabase\.(co|com)/i, 'supabase'],
    [/neon\.tech/i, 'neon'],
    [/rlwy\.net|railway\.app/i, 'railway'],
    [/render\.com/i, 'render'],
    [/psdb\.cloud/i, 'planetscale'],
    [/tidbcloud\.com/i, 'tidb'],
    [/^d1:/i, 'd1'],
    [/^postgres(ql)?:/i, 'postgres'],
    [/^mysql:/i, 'mysql'],
  ]
  return rules.find(([re]) => re.test(url.trim()))?.[1] ?? null
}
