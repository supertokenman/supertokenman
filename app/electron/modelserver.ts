// Your own model servers in the main process: OpenAI-compatible endpoints kept in userData, their
// models listed, a timed test answer, vLLM's /metrics read into live numbers, and on a GPU box you
// reach over SSH: vLLM started and stopped, and a tunnel to it. Every remote step is a click.

import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { baseOf, checkEndpoint, parsePrometheus, sampling, serverStats, tunnelArgs, vllmCommand, vllmStop, type Endpoint, type VllmArgs } from '../shared/modelserver.js'

type Deps = { dir: () => string; secret: (name: string) => string | undefined; hosts: () => string[] }

export function modelServers(d: Deps) {
  const file = () => join(d.dir(), 'model-endpoints.json')
  const list = (): Endpoint[] => {
    try {
      return existsSync(file()) ? (JSON.parse(readFileSync(file(), 'utf8')) as Endpoint[]) : []
    } catch {
      return []
    }
  }
  const byId = (id: string) => {
    const e = list().find((x) => x.id === id)
    if (!e) throw new Error('No such endpoint.')
    return e
  }
  const headers = (e: Endpoint): Record<string, string> => {
    const k = e.keyName ? d.secret(e.keyName) : undefined
    return k ? { authorization: `Bearer ${k}` } : {}
  }
  const scrapes = new Map<string, { at: number; m: Record<string, number> }>()
  const tunnels = new Map<string, { child: ChildProcess; host: string; local: number; remote: number }>()

  const ssh = (host: string, command: string, stdin?: string) =>
    new Promise<string>((res, rej) => {
      if (!d.hosts().includes(host)) return rej(new Error('Pick a host from your ~/.ssh/config.'))
      const c = execFile('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, command], { timeout: 60_000 }, (err, out, errOut) => (err ? rej(new Error((errOut || err.message).trim().slice(0, 400))) : res(out)))
      if (stdin != null) c.stdin?.end(stdin)
    })

  return {
    list,
    /** What main needs to send a small task to `ep:<id>/<model>`. */
    resolve(id: string, model: string) {
      const e = list().find((x) => x.id === id)
      return e ? { baseUrl: baseOf(e.baseUrl), key: headers(e).authorization?.slice(7), sampling: sampling(e.preset), model } : null
    },
    save(e: Partial<Endpoint>) {
      const bad = checkEndpoint(e)
      if (bad) throw new Error(bad)
      const clean: Endpoint = { id: e.id || `e${Date.now().toString(36)}`, name: e.name!.trim().slice(0, 60), kind: e.kind ?? 'other', baseUrl: baseOf(e.baseUrl!), ...(e.keyName ? { keyName: e.keyName } : {}), ...(e.preset ? { preset: e.preset } : {}), ...(e.template?.trim() ? { template: e.template.trim().slice(0, 20_000) } : {}) }
      const all = list()
      writeFileSync(file(), JSON.stringify(all.some((x) => x.id === clean.id) ? all.map((x) => (x.id === clean.id ? clean : x)) : [...all, clean], null, 1))
      return list()
    },
    remove(id: string) {
      writeFileSync(file(), JSON.stringify(list().filter((x) => x.id !== id), null, 1))
      return list()
    },
    async models(id: string): Promise<string[]> {
      const e = byId(id)
      const r = await fetch(`${baseOf(e.baseUrl)}/v1/models`, { headers: headers(e), signal: AbortSignal.timeout(8000) })
      if (!r.ok) throw new Error(`/v1/models answered ${r.status}`)
      const j = (await r.json()) as { data?: { id: string }[] }
      return (j.data ?? []).map((m) => m.id)
    },
    /** One short streamed answer, timed: time to first token, then tokens per second as the server counts them. */
    async test(id: string, model: string, prompt: string) {
      const e = byId(id)
      const t0 = performance.now()
      const r = await fetch(`${baseOf(e.baseUrl)}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers(e) },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 256, stream: true, stream_options: { include_usage: true }, ...sampling(e.preset) }),
        signal: AbortSignal.timeout(120_000),
      })
      if (!r.ok || !r.body) throw new Error(`The server answered ${r.status}: ${(await r.text()).slice(0, 200)}`)
      let text = ''
      let first: number | null = null
      let out = 0
      const dec = new TextDecoder()
      let buf = ''
      for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) {
        buf += dec.decode(chunk, { stream: true })
        let i
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim()
          buf = buf.slice(i + 1)
          if (!line.startsWith('data:') || line === 'data: [DONE]') continue
          try {
            const j = JSON.parse(line.slice(5)) as { choices?: { delta?: { content?: string } }[]; usage?: { completion_tokens?: number } }
            const piece = j.choices?.[0]?.delta?.content ?? ''
            if (piece && first == null) first = performance.now()
            text += piece
            if (j.usage?.completion_tokens) out = j.usage.completion_tokens
          } catch {
            // a keep-alive or a partial line
          }
        }
      }
      const end = performance.now()
      const gen = first != null ? (end - first) / 1000 : 0
      return { text: text.replace(/<think>[\s\S]*?<\/think>/g, '').trim(), ttftMs: first != null ? Math.round(first - t0) : null, totalMs: Math.round(end - t0), outTokens: out || null, tokensPerSec: out && gen > 0 ? Math.round((out / gen) * 10) / 10 : null }
    },
    /** vLLM's live numbers: the first call takes a baseline, later calls give rates since the last one. */
    async metrics(id: string) {
      const e = byId(id)
      const r = await fetch(`${baseOf(e.baseUrl)}/metrics`, { headers: headers(e), signal: AbortSignal.timeout(5000) })
      if (!r.ok) throw new Error(`/metrics answered ${r.status}`)
      const m = parsePrometheus(await r.text())
      const now = Date.now()
      const prev = scrapes.get(id)
      scrapes.set(id, { at: now, m })
      return serverStats(prev?.m ?? m, m, prev ? (now - prev.at) / 1000 : 0)
    },
    hosts: d.hosts,
    /** The command shown before it runs, so the confirm is about the real thing. */
    preview: (a: VllmArgs) => vllmCommand(a),
    async start(host: string, a: VllmArgs) {
      const key = a.keyName ? d.secret(a.keyName) : undefined
      if (a.keyName && !key) throw new Error(`${a.keyName} is not in the vault.`)
      // the key travels on ssh's stdin into a file only you can read, never on a command line
      if (key) await ssh(host, 'umask 077 && mkdir -p ~/.config/stm && cat > ~/.config/stm/vllm-key', key)
      await ssh(host, vllmCommand(a))
      return { log: `~/.cache/stm/vllm-${a.port}.log` }
    },
    stop: (host: string, port: number) => ssh(host, vllmStop(Math.round(port))),
    log: (host: string, port: number) => ssh(host, `tail -n 40 ~/.cache/stm/vllm-${Math.round(port)}.log 2>/dev/null || echo 'No log yet.'`),
    tunnel(host: string, local: number, remote: number) {
      if (!d.hosts().includes(host)) throw new Error('Pick a host from your ~/.ssh/config.')
      const key = `${host}:${local}`
      if (tunnels.has(key)) return
      const child = spawn('ssh', ['-o', 'BatchMode=yes', ...tunnelArgs(host, local, remote)], { stdio: 'ignore' })
      child.on('exit', () => tunnels.delete(key))
      tunnels.set(key, { child, host, local, remote })
    },
    closeTunnel(host: string, local: number) {
      tunnels.get(`${host}:${local}`)?.child.kill()
      tunnels.delete(`${host}:${local}`)
    },
    tunnels: () => [...tunnels.values()].map(({ host, local, remote }) => ({ host, local, remote })),
    closeAll: () => tunnels.forEach((t) => t.child.kill()),
  }
}
