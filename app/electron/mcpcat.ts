// The MCP catalog in the main process: the awesome-mcp-servers list fetched when you ask and kept in
// userData, a server's README and LICENSE read from its repo for the review, and the install itself.
// A server's keys go into the vault; the config runs it through `stm mcp-run`, which asks the app for
// only that server's keys when it starts, so no key is written into ~/.claude.json or .mcp.json.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { configOf, parseList, review, serverName, type Config, type Entry } from '../shared/mcpcat.js'

const LIST = process.env.STM_MCP_LIST ?? 'https://raw.githubusercontent.com/punkpeye/awesome-mcp-servers/main/README.md'
const RAW = process.env.STM_GH_RAW ?? 'https://raw.githubusercontent.com'
const API = process.env.STM_GH_API ?? 'https://api.github.com'

type Deps = { dir: () => string; claudeDir: () => string; stm: () => string; vaultSet: (n: string, v: string) => void; vaultGet: (n: string) => string | undefined }
type Keys = Record<string, string[]>

const LICENSES: [RegExp, string][] = [[/GNU AFFERO GENERAL PUBLIC LICENSE/i, 'AGPL-3.0'], [/GNU LESSER GENERAL PUBLIC LICENSE/i, 'LGPL'], [/GNU GENERAL PUBLIC LICENSE/i, 'GPL'], [/Apache License/i, 'Apache-2.0'], [/MIT License|Permission is hereby granted, free of charge/i, 'MIT'], [/Mozilla Public License/i, 'MPL-2.0'], [/BSD/i, 'BSD'], [/ISC License/i, 'ISC'], [/Unlicense|unencumbered software/i, 'Unlicense'], [/Creative Commons/i, 'Creative Commons']]
export const licenseOf = (text: string) => (LICENSES.find(([re]) => re.test(text.slice(0, 3000)))?.[1] ?? (text.trim() ? 'Custom license (read it)' : null))

export function mcpCatalog(d: Deps) {
  const listFile = () => join(d.dir(), 'mcp-list.md')
  const keysFile = () => join(d.dir(), 'mcp-keys.json')
  let cache: Entry[] | null = null
  const entries = () => {
    if (cache) return cache
    cache = existsSync(listFile()) ? parseList(readFileSync(listFile(), 'utf8')) : []
    return cache
  }
  const keys = (): Keys => {
    try {
      return existsSync(keysFile()) ? (JSON.parse(readFileSync(keysFile(), 'utf8')) as Keys) : {}
    } catch {
      return {}
    }
  }
  const raw = async (repo: string, file: string) => {
    for (const b of ['main', 'master']) {
      const r = await fetch(`${RAW}/${repo}/${b}/${file}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null)
      if (r?.ok) return r.text()
    }
    return null
  }
  const configPath = (scope: 'user' | 'project', cwd: string) => (scope === 'user' ? join(d.claudeDir(), '.claude.json') : join(cwd, '.mcp.json'))
  const readConf = (f: string): Record<string, unknown> => {
    try {
      return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>) : {}
    } catch {
      throw new Error(`${f} is not valid JSON; fix it first.`)
    }
  }
  return {
    state: () => ({ count: entries().length, categories: [...new Set(entries().map((e) => e.category))], keys: keys() }),
    entries,
    async refresh() {
      const r = await fetch(LIST, { signal: AbortSignal.timeout(60_000) })
      if (!r.ok) throw new Error(`The list answered ${r.status}`)
      writeFileSync(listFile(), await r.text())
      cache = null
      return entries().length
    },
    /** README, license and activity of one server, and the review. */
    async details(repo: string) {
      const e = entries().find((x) => x.repo === repo)
      if (!e) throw new Error('Not in the list.')
      const [readme, lic, meta] = await Promise.all([raw(repo, 'README.md'), raw(repo, 'LICENSE').then((t) => t ?? raw(repo, 'LICENSE.md')), fetch(`${API}/repos/${repo}`, { signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<{ pushed_at?: string; stargazers_count?: number; archived?: boolean } | null>])
      const license = lic ? licenseOf(lic) : null
      const cfg = readme ? configOf(readme) : null
      const days = meta?.pushed_at ? Math.round((Date.now() - Date.parse(meta.pushed_at)) / 86_400_000) : null
      const r = review(e, license, cfg, days)
      if (meta?.archived) r.notes.unshift({ tone: 'stop', text: 'The repository is archived.' }), (r.level = 'stop')
      return { entry: e, license, config: cfg, pushedDaysAgo: days, stars: meta?.stargazers_count ?? null, review: r, readme: readme?.slice(0, 20_000) ?? null, checked: { readme: readme != null, license: lic != null, activity: meta != null } }
    },
    /**
     * Adds the server to Claude Code's config for you (user) or for this project, after your review.
     * Key values go to the vault; the config only names `stm mcp-run <server>` in front of the command.
     */
    install(o: { name: string; scope: 'user' | 'project'; cwd: string; config: Config; values: Record<string, string> }) {
      const name = serverName(o.name)
      const c = o.config
      if (c.url) {
        if (!/^https:\/\//.test(c.url)) throw new Error('A remote server must use https.')
      } else if (!c.command || /[;&|`$<>]/.test([c.command, ...(c.args ?? [])].join(' '))) throw new Error('The command has shell characters; write it as a plain program and arguments.')
      const env = c.env.filter((n) => /^[A-Z][A-Z0-9_]{1,63}$/.test(n))
      for (const n of env) {
        const v = o.values[n]?.trim()
        if (v) d.vaultSet(n, v)
        else if (!d.vaultGet(n)) throw new Error(`${n} has no value and is not in the vault.`)
      }
      const f = configPath(o.scope, o.cwd)
      const conf = readConf(f)
      const servers = { ...((conf.mcpServers ?? {}) as Record<string, unknown>) }
      if (servers[name]) throw new Error(`A server named ${name} is already there.`)
      // with no keys the server runs as it is; with keys it runs through stm, which must be installed
      if (!c.url && env.length && !existsSync(d.stm())) throw new Error('This server needs keys: install the stm command first (Providers and config, Install helper).')
      servers[name] = c.url ? { type: c.type ?? 'http', url: c.url } : env.length ? { type: 'stdio', command: d.stm(), args: ['mcp-run', name, '--', c.command!, ...(c.args ?? [])] } : { type: 'stdio', command: c.command!, args: c.args ?? [] }
      writeFileSync(f, JSON.stringify({ ...conf, mcpServers: servers }, null, 2))
      writeFileSync(keysFile(), JSON.stringify({ ...keys(), [name]: env }, null, 1))
      return { name, file: f }
    },
    uninstall(name: string, scope: 'user' | 'project', cwd: string) {
      const f = configPath(scope, cwd)
      const conf = readConf(f)
      const servers = { ...((conf.mcpServers ?? {}) as Record<string, unknown>) }
      delete servers[name]
      writeFileSync(f, JSON.stringify({ ...conf, mcpServers: servers }, null, 2))
      const k = keys()
      delete k[name]
      writeFileSync(keysFile(), JSON.stringify(k, null, 1))
    },
    /** For `stm mcp-run`: the vault values of the names this server was installed with, and no others. */
    envFor(server: string) {
      const names = keys()[server]
      if (!names) throw new Error(`${server} was not installed from the app's catalog.`)
      return Object.fromEntries(names.map((n) => [n, d.vaultGet(n) ?? '']).filter(([, v]) => v))
    },
  }
}
