// A free API becomes an MCP server, in the main process: the public-apis list fetched when you ask,
// an OpenAPI file read from a URL you give, the generated server written into the project (never over
// existing files without your say), its packages installed on a click, and the server added through the
// catalog's install, so its key stays in the vault.

import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { checkGen, generate, opsOf, parsePublicApis, type ApiRow, type Gen } from '../shared/api2mcp.js'

const LIST = process.env.STM_PUBLIC_APIS ?? 'https://raw.githubusercontent.com/public-apis/public-apis/master/README.md'

export function apiToMcp(dir: () => string) {
  const file = () => join(dir(), 'public-apis.md')
  let cache: ApiRow[] | null = null
  const rows = () => (cache ??= existsSync(file()) ? parsePublicApis(readFileSync(file(), 'utf8')) : [])
  const folder = (project: string, name: string) => {
    const f = resolve(project, 'mcp', name)
    if (!f.startsWith(resolve(project) + '/')) throw new Error('The server folder must be inside the project.')
    return f
  }
  return {
    rows,
    async refresh() {
      const r = await fetch(LIST, { signal: AbortSignal.timeout(60_000) })
      if (!r.ok) throw new Error(`The list answered ${r.status}`)
      writeFileSync(file(), await r.text())
      cache = null
      return rows().length
    },
    /** An OpenAPI or Swagger file in JSON, read from its URL. */
    async spec(url: string) {
      if (!/^https?:\/\//.test(url)) throw new Error('Give the URL of the OpenAPI file.')
      const r = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (!r.ok) throw new Error(`The file answered ${r.status}`)
      const text = await r.text()
      try {
        return opsOf(JSON.parse(text))
      } catch {
        throw new Error('That is not an OpenAPI file in JSON (YAML files are not read yet).')
      }
    },
    preview(g: Gen) {
      const bad = checkGen(g)
      if (bad) throw new Error(bad)
      return generate(g)
    },
    write(project: string, g: Gen, overwrite: boolean) {
      const bad = checkGen(g)
      if (bad) throw new Error(bad)
      const f = folder(project, g.name)
      const files = generate(g)
      const clash = files.filter((x) => existsSync(join(f, x.path))).map((x) => x.path)
      if (clash.length && !overwrite) return { written: [] as string[], clash, folder: f }
      mkdirSync(f, { recursive: true })
      for (const x of files) writeFileSync(join(f, x.path), x.content)
      return { written: files.map((x) => join('mcp', g.name, x.path)), clash: [], folder: f }
    },
    /** npm install in the server's folder, only on your click. */
    npmInstall: (project: string, name: string) =>
      new Promise<string>((res, rej) => {
        const f = folder(project, name)
        if (!existsSync(join(f, 'package.json'))) return rej(new Error('Write the server first.'))
        execFile(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund'], { cwd: f, timeout: 5 * 60_000 }, (err, out, errOut) => (err ? rej(new Error((errOut || err.message).trim().split('\n').slice(-3).join(' '))) : res(out.trim().split('\n').slice(-1)[0] ?? 'Installed.')))
      }),
    serverPath: (project: string, name: string) => join(folder(project, name), 'server.mjs'),
  }
}
