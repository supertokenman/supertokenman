import { describe, expect, it } from 'vitest'
import { buildUrl, EMPTY, fieldsFor, parseUrl, PRESETS, presetFor } from './dbconn'

const f = (o: Partial<typeof EMPTY>) => ({ ...EMPTY, ...o })

describe('connection string from fields', () => {
  it('builds Postgres with the password as a vault name and verified TLS', () => {
    expect(buildUrl('postgres', f({ host: 'db.x.com', port: '5432', database: 'app', user: 'me', secret: 'DB_PASSWORD', ssl: true }))).toBe('postgres://me:{{DB_PASSWORD}}@db.x.com:5432/app?sslmode=verify-full')
  })
  it('builds MySQL with ssl=true, and leaves out what is empty', () => {
    expect(buildUrl('mysql', f({ host: 'aws.connect.psdb.cloud', user: 'u1', secret: 'PS', ssl: true }))).toBe('mysql://u1:{{PS}}@aws.connect.psdb.cloud/?ssl=true'.replace('/?', '?'))
    expect(buildUrl('tidb', f({ host: '127.0.0.1', port: '4000', user: 'root', database: 'test' }))).toBe('mysql://root@127.0.0.1:4000/test')
  })
  it('encodes user and database names', () => {
    expect(buildUrl('postgres', f({ host: 'h', user: 'a@b', database: 'my db' }))).toBe('postgres://a%40b@h/my%20db')
  })
  it('accepts a vault name typed with its braces', () => {
    expect(buildUrl('postgres', f({ host: 'h', user: 'u', secret: '{{PW}}' }))).toBe('postgres://u:{{PW}}@h')
  })
  it('is empty until the host is there', () => {
    expect(buildUrl('postgres', f({ user: 'u' }))).toBe('')
    expect(buildUrl('d1', f({ account: 'a' }))).toBe('')
  })
  it('builds D1 and SQLite', () => {
    expect(buildUrl('d1', f({ account: 'acc', dbId: 'db-1', secret: 'CF' }))).toBe('d1://acc/db-1?token={{CF}}')
    expect(buildUrl('sqlite', f({ path: ' /tmp/a.db ' }))).toBe('/tmp/a.db')
  })
  it('gives each hosted preset a driver the app has and TLS where the service requires it', () => {
    for (const p of PRESETS) expect(['postgres', 'mysql', 'tidb', 'sqlite', 'd1']).toContain(p.kind)
    for (const id of ['supabase', 'neon', 'planetscale', 'tidb', 'render']) expect(fieldsFor(PRESETS.find((p) => p.id === id)!).ssl, id).toBe(true)
  })
})

describe('connection string back to fields', () => {
  it('round-trips what it builds', () => {
    const cases: [Parameters<typeof buildUrl>[0], ReturnType<typeof f>][] = [
      ['postgres', f({ host: 'db.x.com', port: '6543', database: 'app', user: 'postgres.ref', secret: 'SUPA', ssl: true })],
      ['mysql', f({ host: 'h', port: '3306', database: 'shop', user: 'root', secret: '', ssl: false })],
      ['d1', f({ account: 'acc', dbId: 'db1', secret: 'CF' })],
    ]
    for (const [k, fields] of cases) expect(parseUrl(k, buildUrl(k, fields))).toEqual(fields)
  })
  it('refuses what the fields cannot show: a literal password, other options, another scheme', () => {
    expect(parseUrl('postgres', 'postgres://u:secret@h/db')).toBeNull()
    expect(parseUrl('postgres', 'postgres://u@h/db?application_name=x')).toBeNull()
    expect(parseUrl('postgres', '{{DATABASE_URL}}')).toBeNull()
    expect(parseUrl('mysql', 'postgres://u@h/db')).toBeNull()
  })
  it('reads sslmode=require as TLS on and disable as off', () => {
    expect(parseUrl('postgres', 'postgres://u@h/db?sslmode=require')?.ssl).toBe(true)
    expect(parseUrl('postgres', 'postgres://u@h/db?sslmode=disable')?.ssl).toBe(false)
  })
  it('knows the hosted service from the address', () => {
    expect(presetFor('postgres://u@aws-0-sa-east-1.pooler.supabase.com:5432/postgres')).toBe('supabase')
    expect(presetFor('postgres://u@ep-x.us-east-2.aws.neon.tech/neondb')).toBe('neon')
    expect(presetFor('mysql://u@aws.connect.psdb.cloud/db')).toBe('planetscale')
    expect(presetFor('mysql://u@localhost/db')).toBe('mysql')
    expect(presetFor('/tmp/x.db')).toBeNull()
  })
})
