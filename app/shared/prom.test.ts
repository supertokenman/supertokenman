import { describe, expect, it } from 'vitest'
import { alertsOf, checkPromql, crossed, parseThreshold, promqlOf, seriesOf, stepFor, targetsOf } from './prom'

describe('prometheus', () => {
  it('reads alerts and targets, the worst first', () => {
    const a = alertsOf({ data: { alerts: [
      { labels: { alertname: 'DiskFilling', severity: 'warning' }, annotations: { summary: 'Disk 85% full' }, state: 'pending', activeAt: 't1', value: '0.85' },
      { labels: { alertname: 'ApiDown', severity: 'critical' }, annotations: { description: 'api is down' }, state: 'firing', activeAt: 't2', value: '0' },
    ] } })
    expect(a.map((x) => [x.name, x.state, x.summary])).toEqual([['ApiDown', 'firing', 'api is down'], ['DiskFilling', 'pending', 'Disk 85% full']])
    const t = targetsOf({ data: { activeTargets: [{ labels: { job: 'node', instance: 'a:9100' }, health: 'up' }, { labels: { job: 'api', instance: 'b:8080' }, health: 'down', lastError: 'connection refused' }] } })
    expect(t.map((x) => [x.job, x.health, x.error])).toEqual([['api', 'down', 'connection refused'], ['node', 'up', '']])
  })

  it('names series by the labels that differ', () => {
    const r = seriesOf({ data: { resultType: 'matrix', result: [
      { metric: { __name__: 'up', job: 'api', instance: 'b' }, values: [[1, '1'], [2, '0']] },
      { metric: { __name__: 'up', job: 'node', instance: 'b' }, values: [[1, '1'], [2, 'NaN']] },
    ] } }, 1)
    expect(r.series).toEqual([{ name: 'up{job="api"}', points: [[1000, 1], [2000, 0]] }])
    expect(r.dropped).toBe(1)
    expect(seriesOf({ data: { result: [{ metric: { __name__: 'x' }, value: [5, '2'] }] } }).series[0]!.points).toEqual([[5000, 2]])
  })

  it('picks steps, reads answers and thresholds', () => {
    expect(stepFor(3600)).toBe(30)
    expect(stepFor(604800)).toBe(7200)
    expect(promqlOf('```promql\nsum(rate(http_requests_total[5m]))\n```\nRequests per second.')).toBe('sum(rate(http_requests_total[5m]))')
    expect(checkPromql('')).toMatch(/Write/)
    expect(parseThreshold('> 0.9')).toEqual({ op: '>', value: 0.9 })
    expect(parseThreshold('more than 3')).toBeNull()
    expect(crossed({ op: '>', value: 0.9 }, 0.95)).toBe(true)
    expect(crossed({ op: '<', value: 1 }, 1)).toBe(false)
  })
})
