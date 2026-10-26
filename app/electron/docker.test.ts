import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import * as D from './docker'

const up = (() => {
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 5000 })
    return true
  } catch {
    return false
  }
})()

describe('docker', () => {
  it('reads labels with commas in values', () => {
    expect(D.labels('com.docker.compose.project=web,desc=a,b,com.docker.compose.service=api')).toEqual({ 'com.docker.compose.project': 'web', desc: 'a,b', 'com.docker.compose.service': 'api' })
    expect(D.labels('')).toEqual({})
  })
  it('joins containers with their stats', () => {
    const ps = '{"ID":"734c6e235bc6797d","Names":"web-api-1","Image":"node:22","State":"running","Status":"Up 2 minutes","Ports":"0.0.0.0:3000-\\u003e3000/tcp","Labels":"com.docker.compose.project=web,com.docker.compose.service=api","RunningFor":"3 minutes ago"}'
    const st = '{"ID":"734c6e235bc6","Container":"734c6e235bc6","CPUPerc":"1.20%","MemUsage":"80MiB / 15GiB"}'
    expect(D.parseContainers(ps, st)[0]).toMatchObject({ id: '734c6e235bc6', project: 'web', service: 'api', ports: '0.0.0.0:3000->3000/tcp', cpu: '1.20%', mem: '80MiB' })
  })
  it('merges stdout and stderr by time', () => {
    expect(D.mergeByTime('2026-01-01T00:00:02Z b\n', '2026-01-01T00:00:01Z a\n')).toBe('2026-01-01T00:00:01Z a\n2026-01-01T00:00:02Z b')
  })
  it('refuses names that are not names', async () => {
    await expect(D.act('stop', '--all')).rejects.toThrow()
    await expect(D.act('nuke' as D.Op, 'x')).rejects.toThrow()
  })
  it.runIf(up)('runs against a real daemon', async () => {
    execFileSync('docker', ['run', '-d', '--name', 'stm-vitest', 'alpine', 'sh', '-c', 'echo hello; echo oops >&2; sleep 60'])
    try {
      const c = (await D.containers()).find((x) => x.name === 'stm-vitest')!
      expect(c.state).toBe('running')
      expect((await D.exec(c.id, 'echo $((6*7))')).out.trim()).toBe('42')
      await new Promise((r) => setTimeout(r, 500))
      const l = await D.logsMerged(c.id)
      expect(l).toContain('hello')
      expect(l).toContain('oops')
      await D.act('stop', c.id)
      expect((await D.containers()).find((x) => x.name === 'stm-vitest')?.state).toBe('exited')
      expect((await D.images()).some((i) => i.repo === 'alpine')).toBe(true)
    } finally {
      await D.act('rm', 'stm-vitest')
    }
  }, 60_000)
})
