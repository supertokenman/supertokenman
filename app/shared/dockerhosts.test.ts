import { describe, expect, it } from 'vitest'
import { blocked, ctxArgs, hostLabel, hostsOf, isRemote, NAME } from './dockerhosts'

const LS = [
  '{"Current":true,"Description":"Current DOCKER_HOST based configuration","DockerEndpoint":"unix:///var/run/docker.sock","Name":"default"}',
  '{"Current":false,"Description":"","DockerEndpoint":"ssh://deploy@web-1.example.com","Name":"prod"}',
  '{"Current":false,"Description":"","DockerEndpoint":"tcp://10.0.0.5:2376","Name":"staging"}',
].join('\n')

describe('docker hosts', () => {
  it('reads contexts as lines or an array and tells remote from local', () => {
    const h = hostsOf(LS)
    expect(h.map((x) => [x.name, x.remote])).toEqual([['default', false], ['prod', true], ['staging', true]])
    expect(hostsOf(`[${LS.split('\n').join(',')}]`)).toHaveLength(3)
    expect(isRemote('npipe:////./pipe/docker_engine')).toBe(false)
    expect(hostLabel(h[1]!)).toBe('web-1.example.com')
    expect(hostLabel(h[0]!)).toBe('this machine')
  })
  it('never runs an action on a remote host without it being turned on and confirmed', () => {
    const [local, prod] = hostsOf(LS)
    expect(blocked(local, {}, false)).toBeNull()
    expect(blocked(prod, {}, true)).toBe('read-only')
    expect(blocked(prod, { prod: true }, false)).toBe('confirm')
    expect(blocked(prod, { staging: true }, true)).toBe('read-only')
    expect(blocked(prod, { prod: true }, true)).toBeNull()
  })
  it('checks names and builds the flag', () => {
    expect(NAME.test('prod')).toBe(true)
    expect(NAME.test('--host=x')).toBe(false)
    expect(ctxArgs('prod')).toEqual(['--context', 'prod'])
    expect(ctxArgs('')).toEqual([])
  })
})
