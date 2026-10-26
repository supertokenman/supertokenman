import { describe, expect, it } from 'vitest'
import { eventOf, mayTouch, rowsOf, useOf } from './containers'

describe('app containers', () => {
  const ps = [
    JSON.stringify({ ID: 'a1', Names: 'stm-iso-s1', Image: 'alpine:3.20', State: 'running', Status: 'Up 2 minutes', Labels: 'stm=1,stm.kind=isolate', CreatedAt: '2026-10-25' }),
    JSON.stringify({ ID: 'b2', Names: 'someone-else', Image: 'postgres', State: 'running', Status: 'Up', Labels: 'com.docker.compose.project=x' }),
    'not json',
  ].join('\n')
  it('keeps only containers with the app label', () => {
    const r = rowsOf(ps)
    expect(r).toEqual([{ id: 'a1', name: 'stm-iso-s1', image: 'alpine:3.20', state: 'running', status: 'Up 2 minutes', kind: 'isolate', created: '2026-10-25' }])
    expect(mayTouch(r, 'a1')).toBe(true)
    expect(mayTouch(r, 'b2')).toBe(false)
  })
  it('reads stats', () => {
    expect(useOf(JSON.stringify({ Name: 'stm-iso-s1', CPUPerc: '1.25%', MemUsage: '12.5MiB / 2GiB', MemPerc: '0.61%' }))).toEqual({ 'stm-iso-s1': { cpu: 1.25, memUsed: '12.5MiB', memPct: 0.61 } })
  })
  it('reads events of labelled containers only', () => {
    expect(eventOf(JSON.stringify({ Type: 'container', Action: 'exec_start: sh -c ls', Actor: { ID: 'a1b2c3d4e5f6a7', Attributes: { stm: '1', name: 'stm-iso-s1' } }, timeNano: 1792970000000000000 }))).toEqual({ at: 1792970000000, id: 'a1b2c3d4e5f6', name: 'stm-iso-s1', action: 'exec_start' })
    expect(eventOf(JSON.stringify({ Type: 'container', Action: 'start', Actor: { Attributes: { name: 'x' } } }))).toBeNull()
    expect(eventOf('garbage')).toBeNull()
  })
})
