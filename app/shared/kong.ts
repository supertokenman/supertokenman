// Phase 112: a Kong gateway's declarative config (kong.yml, decK format) read into the backend map:
// services and routes become edges from the gateway, plugins say what guards each route, and plain
// findings come out (no auth, no rate limit, an http upstream). Only the file in the repo is read;
// the Admin API of a running Kong is never called.
import { parse } from 'yaml'

type Plugin = { name: string; enabled?: boolean; config?: Record<string, unknown> }
type KRoute = { name?: string; paths?: string[]; hosts?: string[]; methods?: string[]; protocols?: string[]; plugins?: Plugin[] }
type KService = { name?: string; url?: string; protocol?: string; host?: string; port?: number; path?: string; routes?: KRoute[]; plugins?: Plugin[] }
type KDoc = { _format_version?: string; services?: KService[]; routes?: (KRoute & { service?: string | { name: string } })[]; plugins?: (Plugin & { service?: string; route?: string })[] }

export type GwRoute = { service: string; route: string; paths: string[]; methods: string[]; upstream: string; plugins: string[] }
export type Finding = { level: 'warn' | 'info'; route: string; text: string }
export type Gateway = { file: string; services: number; routes: GwRoute[]; findings: Finding[]; global: string[] }

const AUTH = /^(key-auth|jwt|basic-auth|oauth2|openid-connect|hmac-auth|ldap-auth|mtls-auth|session)$/
const LIMIT = /^(rate-limiting|rate-limiting-advanced|request-size-limiting|response-ratelimiting)$/
const on = (p: Plugin[] | undefined) => (p ?? []).filter((x) => x.enabled !== false).map((x) => x.name)

export function readKong(file: string, text: string): Gateway {
  const doc = (parse(text) ?? {}) as KDoc
  const global = on(doc.plugins?.filter((p) => !p.service && !p.route))
  const extra = (svc: string, route: string) => on(doc.plugins?.filter((p) => p.service === svc || p.route === route))
  const upstreamOf = (s: KService) => s.url ?? `${s.protocol ?? 'http'}://${s.host ?? '?'}${s.port ? `:${s.port}` : ''}${s.path ?? ''}`
  const routes: GwRoute[] = []
  for (const s of doc.services ?? []) {
    const svc = s.name ?? s.host ?? 'service'
    for (const r of s.routes ?? []) {
      const name = r.name ?? `${svc}-${(r.paths ?? ['/'])[0]}`
      routes.push({ service: svc, route: name, paths: r.paths ?? [], methods: r.methods ?? [], upstream: upstreamOf(s), plugins: [...new Set([...global, ...on(s.plugins), ...on(r.plugins), ...extra(svc, name)])] })
    }
  }
  // routes declared at the top level, pointing at a service by name
  for (const r of doc.routes ?? []) {
    const svcName = typeof r.service === 'string' ? r.service : r.service?.name
    const s = (doc.services ?? []).find((x) => x.name === svcName)
    if (!s) continue
    const name = r.name ?? `${svcName}-${(r.paths ?? ['/'])[0]}`
    routes.push({ service: svcName!, route: name, paths: r.paths ?? [], methods: r.methods ?? [], upstream: upstreamOf(s), plugins: [...new Set([...global, ...on(s.plugins), ...on(r.plugins), ...extra(svcName!, name)])] })
  }
  const findings: Finding[] = []
  for (const r of routes) {
    if (!r.plugins.some((p) => AUTH.test(p))) findings.push({ level: 'warn', route: r.route, text: `${r.route} (${r.paths.join(', ') || '/'}) has no authentication plugin.` })
    if (!r.plugins.some((p) => LIMIT.test(p))) findings.push({ level: 'warn', route: r.route, text: `${r.route} has no rate limit.` })
    if (/^http:\/\//.test(r.upstream) && !/^http:\/\/(localhost|127\.|[\w-]+:\d+|[\w-]+$)/.test(r.upstream)) findings.push({ level: 'warn', route: r.route, text: `${r.route} goes to ${r.upstream} over plain http outside a private network name.` })
    if (!r.methods.length) findings.push({ level: 'info', route: r.route, text: `${r.route} accepts every method.` })
  }
  return { file, services: (doc.services ?? []).length, routes, findings, global }
}

/** The gateway as a Markdown section for the backend map. */
export function kongMarkdown(g: Gateway): string {
  const lines = [`## Gateway (Kong, ${g.file})`, '', `${g.services} services, ${g.routes.length} routes${g.global.length ? `; on every route: ${g.global.join(', ')}` : ''}.`, '']
  for (const r of g.routes) lines.push(`- ${r.methods.join('|') || 'ANY'} ${r.paths.join(', ') || '/'} → ${r.service} (${r.upstream})${r.plugins.length ? ` · ${r.plugins.join(', ')}` : ''}`)
  if (g.findings.length) lines.push('', '### Findings', '', ...g.findings.map((f) => `- ${f.level === 'warn' ? 'Check' : 'Note'}: ${f.text}`))
  return lines.join('\n')
}
