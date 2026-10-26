// Docker through the docker CLI the user already has: containers (grouped by Compose project),
// their stats and logs, start/stop/restart/remove, one-off exec, images and volumes.
import { execFile } from 'node:child_process'
import { ctxArgs, NAME } from '../shared/dockerhosts.js'

// Phase 117: the host every call goes to (a docker context name; empty is the CLI's current one)
let ctx = ''
export const context = () => ctx
export function setContext(name: string) {
  if (name && !NAME.test(name)) throw new Error('Not a context name.')
  ctx = name
}

export type Container = {
  id: string
  name: string
  image: string
  state: string
  status: string
  ports: string
  project: string
  service: string
  createdAgo: string
  cpu?: string
  mem?: string
}
export type Image = { id: string; repo: string; tag: string; size: string; created: string; inUse: number }
export type Volume = { name: string; driver: string; project: string }

const docker = (args: string[], timeout = 20_000) =>
  new Promise<string>((resolve, reject) =>
    execFile('docker', [...ctxArgs(ctx), ...args], { timeout, maxBuffer: 16 * 1024 * 1024 }, (err, out, errOut) => {
      if (!err) return resolve(out)
      const msg = (errOut || err.message).trim()
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') reject(new Error('Docker is not installed (no docker command on PATH).'))
      else if (/Cannot connect|failed to connect|docker daemon|docker\.sock/i.test(msg)) reject(new Error('Docker is not running. Start Docker Desktop, OrbStack or colima.'))
      else reject(new Error(msg))
    }),
  )

/** `--format '{{json .}}'` output: one object per line. */
export const jsonLines = <T>(text: string): T[] =>
  text
    .split('\n')
    .filter((l) => l.trim().startsWith('{'))
    .map((l) => JSON.parse(l) as T)

/** "a=1,com.docker.compose.project=web" as a map; values may hold commas, keys never hold '='. */
export function labels(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  let key = ''
  for (const part of text ? text.split(',') : []) {
    const i = part.indexOf('=')
    if (i > 0 && !/\s/.test(part.slice(0, i))) {
      key = part.slice(0, i)
      out[key] = part.slice(i + 1)
    } else if (key) out[key] += `,${part}`
  }
  return out
}

type RawContainer = { ID: string; Names: string; Image: string; State: string; Status: string; Ports: string; Labels: string; RunningFor: string }
type RawStats = { ID: string; Container: string; CPUPerc: string; MemUsage: string }

export function parseContainers(ps: string, stats = ''): Container[] {
  const st = jsonLines<RawStats>(stats)
  return jsonLines<RawContainer>(ps).map((c) => {
    const l = labels(c.Labels)
    const s = st.find((x) => c.ID.startsWith(x.ID) || x.Container === c.ID)
    return {
      id: c.ID.slice(0, 12),
      name: c.Names,
      image: c.Image,
      state: c.State,
      status: c.Status,
      ports: c.Ports.replace(/>/g, '>'),
      project: l['com.docker.compose.project'] ?? '',
      service: l['com.docker.compose.service'] ?? '',
      createdAgo: c.RunningFor,
      cpu: s?.CPUPerc,
      mem: s?.MemUsage.split(' / ')[0],
    }
  })
}

export async function containers(): Promise<Container[]> {
  const [ps, stats] = await Promise.all([docker(['ps', '-a', '--no-trunc', '--format', '{{json .}}']), docker(['stats', '--no-stream', '--format', '{{json .}}']).catch(() => '')])
  return parseContainers(ps, stats)
}

export async function images(): Promise<Image[]> {
  const raw = jsonLines<{ ID: string; Repository: string; Tag: string; Size: string; CreatedSince: string; Containers: string }>(await docker(['images', '--format', '{{json .}}']))
  return raw.map((i) => ({ id: i.ID, repo: i.Repository, tag: i.Tag, size: i.Size, created: i.CreatedSince, inUse: Number(i.Containers) || 0 }))
}

export async function volumes(): Promise<Volume[]> {
  const raw = jsonLines<{ Name: string; Driver: string; Labels: string }>(await docker(['volume', 'ls', '--format', '{{json .}}']))
  return raw.map((v) => ({ name: v.Name, driver: v.Driver, project: labels(v.Labels)['com.docker.compose.project'] ?? '' }))
}

const ID = /^[a-zA-Z0-9][a-zA-Z0-9_.\-:/@]*$/
const checked = (id: string) => {
  if (!ID.test(id)) throw new Error('Not a container, image or volume name.')
  return id
}

export type Op = 'start' | 'stop' | 'restart' | 'pause' | 'unpause' | 'rm'
export async function act(op: Op, id: string) {
  if (!['start', 'stop', 'restart', 'pause', 'unpause', 'rm'].includes(op)) throw new Error('Unknown operation.')
  await docker(op === 'rm' ? ['rm', '-f', checked(id)] : [op, checked(id)], 60_000)
}

export const removeImage = (id: string) => docker(['rmi', checked(id)], 60_000).then(() => undefined)
export const removeVolume = (name: string) => docker(['volume', 'rm', checked(name)], 60_000).then(() => undefined)

/** The last lines of a container's logs, stdout and stderr together, with timestamps. */
export function logsMerged(id: string, tail = 300) {
  return new Promise<string>((resolve, reject) =>
    execFile('docker', [...ctxArgs(ctx), 'logs', '--tail', String(tail), '--timestamps', checked(id)], { timeout: 20_000, maxBuffer: 16 * 1024 * 1024 }, (err, out, errOut) =>
      err ? reject(new Error((errOut || err.message).trim())) : resolve(mergeByTime(out, errOut)),
    ),
  )
}

/** stdout and stderr of `docker logs --timestamps`, merged back into time order. */
export function mergeByTime(out: string, err: string): string {
  const lines = [...out.split('\n'), ...err.split('\n')].filter(Boolean)
  return lines.sort((a, b) => (a.slice(0, 30) < b.slice(0, 30) ? -1 : a.slice(0, 30) > b.slice(0, 30) ? 1 : 0)).join('\n')
}

/** A one-off command in a running container, through its sh. Not interactive. */
export function exec(id: string, command: string) {
  return new Promise<{ out: string; code: number }>((resolve) =>
    execFile('docker', [...ctxArgs(ctx), 'exec', checked(id), 'sh', '-c', command], { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 }, (err, out, errOut) =>
      resolve({ out: `${out}${errOut}`.slice(-200_000), code: err ? Number((err as { code?: number }).code) || 1 : 0 }),
    ),
  )
}
