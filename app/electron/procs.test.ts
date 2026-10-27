import { describe, expect, it } from 'vitest'
import { listeners, parseCwd, parseLsof, parsePs } from './procs'

describe('procs', () => {
  it('reads lsof, one row per pid and port', () => {
    const t = 'p101\ncnode\nn*:5173\nn[::1]:5173\np202\ncpostgres\nn127.0.0.1:5432\n'
    expect(parseLsof(t)).toEqual([
      { pid: 101, name: 'node', port: 5173, host: '*' },
      { pid: 202, name: 'postgres', port: 5432, host: '127.0.0.1' },
    ])
  })
  it('lists a port held by inherited children once, under the lowest pid', () => {
    const t = 'p2570\ncclaude\nn127.0.0.1:9336\np876\ncelectron\nn127.0.0.1:9336\nn[::1]:9336\np970\ncclaude\nn127.0.0.1:9336\n'
    expect(parseLsof(t)).toEqual([{ pid: 876, name: 'electron', port: 9336, host: '127.0.0.1', shared: [970, 2570] }])
  })
  it('reads ps and cwd', () => {
    expect(parsePs('  101  3.5  204800    01:02:03 node /x/vite.js --port 5173\n').get(101)).toEqual({ cpu: 3.5, memMb: 200, uptime: '01:02:03', command: 'node /x/vite.js --port 5173' })
    expect(parseCwd('p101\nfcwd\nn/home/u/app\n').get(101)).toBe('/home/u/app')
  })
  it('lists a real listener', async () => {
    const { createServer } = await import('node:net')
    const srv = createServer().listen(0, '127.0.0.1')
    await new Promise((r) => srv.once('listening', r))
    const port = (srv.address() as { port: number }).port
    const found = (await listeners()).find((l) => l.port === port)
    srv.close()
    expect(found?.pid).toBe(process.pid)
    expect(found?.mine).toBe(true)
  })
})
