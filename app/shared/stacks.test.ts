import { describe, expect, it } from 'vitest'
import { argsFor, configError, confirmText, countsOf, fileOf, servicesOf, stacksOf } from './stacks'

describe('compose stacks', () => {
  it('reads compose ls and counts running', () => {
    const s = stacksOf('[{"Name":"web","Status":"running(2), exited(1)","ConfigFiles":"/srv/web/compose.yaml"},{"Name":"api","Status":"exited(1)","ConfigFiles":"/a/compose.yml,/a/override.yml"}]')
    expect(s.map((x) => x.name)).toEqual(['api', 'web'])
    expect(s[1]).toMatchObject({ running: 2, total: 3 })
    expect(s[0]!.files).toEqual(['/a/compose.yml', '/a/override.yml'])
    expect(stacksOf('not json')).toEqual([])
    expect(countsOf('running(1)')).toEqual({ running: 1, total: 1 })
  })
  it('reads ps as lines or as an array', () => {
    const line = '{"Service":"db","Name":"web-db-1","State":"running","Status":"Up 2 minutes","Image":"postgres:16","Ports":""}'
    expect(servicesOf(`${line}\n${line.replace('db', 'app').replace('web-db-1', 'web-app-1')}`).map((s) => s.name)).toEqual(['app', 'db'])
    expect(servicesOf(`[${line}]`)[0]!.container).toBe('web-db-1')
    expect(servicesOf('')).toEqual([])
  })
  it('only touches files the stack names', () => {
    const s = stacksOf('[{"Name":"web","Status":"running(1)","ConfigFiles":"/srv/web/compose.yaml"}]')
    expect(fileOf(s, 'web', '/srv/web/compose.yaml')).toBe('/srv/web/compose.yaml')
    expect(fileOf(s, 'web', '/etc/passwd')).toBeNull()
    expect(fileOf(s, 'other', '/srv/web/compose.yaml')).toBeNull()
  })
  it('builds safe arguments and says what happens', () => {
    const s = stacksOf('[{"Name":"web","Status":"running(2)","ConfigFiles":"/srv/web/compose.yaml"}]')[0]!
    expect(argsFor(s, 'up')).toEqual(['compose', '-p', 'web', '-f', '/srv/web/compose.yaml', 'up', '-d'])
    expect(argsFor(s, 'stop').at(-1)).toBe('stop')
    expect(argsFor(s, 'up')).not.toContain('--remove-orphans')
    expect(confirmText(s, 'stop')).toContain('2 running containers')
  })
  it('keeps the first useful error line', () => {
    expect(configError('time="x" level=warning msg="obsolete"\nvalidating /a/compose.yaml: services.web.ports must be a array\n')).toBe('validating /a/compose.yaml: services.web.ports must be a array')
  })
})
