import { describe, expect, it } from 'vitest'
import { checkMonitor, cleanMonitor, incidents, judge, netdataAlarms, netdataLatest, stateOf, statusOk, statusPage, transition, uptime, type Beat } from './monitors'

const http = cleanMonitor({ name: 'API', kind: 'http', target: 'https://api.example.com/health', retries: 2 })
const beat = (at: number, ok: boolean, ms = 100): Beat => ({ at, ok, ms, msg: ok ? 'HTTP 200' : 'HTTP 503' })

describe('monitors', () => {
  it('checks and cleans a monitor', () => {
    expect(checkMonitor({ name: 'x', kind: 'tcp', target: 'db.local' })).toMatch(/host:port/)
    expect(checkMonitor({ name: 'x', kind: 'http', target: 'ftp://a' })).toMatch(/http/)
    expect(checkMonitor({ name: 'x', kind: 'keyword', target: 'https://a' })).toMatch(/keyword/)
    expect(checkMonitor({ name: 'x', kind: 'http', target: 'https://a', everySec: 5 })).toMatch(/20 seconds/)
    expect(checkMonitor({ name: 'x', kind: 'tcp', target: 'db.local:5432' })).toBeNull()
    expect(cleanMonitor({ name: 'x', everySec: 1, retries: 99 })).toMatchObject({ everySec: 20, retries: 10, kind: 'http' })
  })

  it('judges status codes, keywords, JSON and slowness', () => {
    expect(statusOk(undefined, 204)).toBe(true)
    expect(statusOk('200,301-302', 302)).toBe(true)
    expect(statusOk('200,301-302', 404)).toBe(false)
    expect(judge(http, { status: 503, ms: 50 }, 1)).toMatchObject({ ok: false, msg: 'HTTP 503' })
    expect(judge(http, { error: 'ECONNREFUSED', ms: 3 }, 1)).toMatchObject({ ok: false, msg: 'ECONNREFUSED' })
    const kw = cleanMonitor({ name: 'k', kind: 'keyword', target: 'https://a', keyword: 'Healthy' })
    expect(judge(kw, { status: 200, body: 'all healthy', ms: 10 }, 1).ok).toBe(true)
    expect(judge({ ...kw, invert: true }, { status: 200, body: 'all healthy', ms: 10 }, 1).ok).toBe(false)
    const js = cleanMonitor({ name: 'j', kind: 'json', target: 'https://a', path: 'checks.0.status', keyword: 'pass' })
    expect(judge(js, { status: 200, body: '{"checks":[{"status":"pass"}]}', ms: 10 }, 1).ok).toBe(true)
    expect(judge(js, { status: 200, body: '{"checks":[{"status":"fail"}]}', ms: 10 }, 1).msg).toMatch(/expected pass/)
    expect(judge(js, { status: 200, body: '<html>', ms: 10 }, 1).msg).toBe('Not JSON')
    expect(judge({ ...http, slowMs: 500 }, { status: 200, ms: 900 }, 1)).toMatchObject({ ok: true, slow: true })
    expect(judge({ ...http, certDays: 14 }, { status: 200, ms: 10, certExpires: 5 * 86_400_000 }, 0).msg).toBe('Certificate expires in 5 days')
  })

  it('goes down only after the retries, and comes back on one success', () => {
    expect(stateOf(http, [beat(1, true), beat(2, false), beat(3, false)], 4)).toBe('pending')
    const down = [beat(1, true), beat(2, false), beat(3, false), beat(4, false)]
    expect(stateOf(http, down, 5)).toBe('down')
    expect(stateOf(http, [...down, beat(5, true)], 6)).toBe('up')
    expect(stateOf({ ...http, maintenance: [{ from: 0, to: 10 }] }, down, 5)).toBe('maintenance')
    expect(transition('pending', 'down')).toBe('down')
    expect(transition('down', 'down')).toBeNull()
    expect(transition('down', 'up')).toBe('up')
    expect(transition('pending', 'up')).toBeNull()
  })

  it('measures uptime and lists incidents', () => {
    const b = [beat(1, true, 100), beat(2, false), beat(3, false), beat(4, true, 300), beat(5, false)]
    expect(uptime(b, 0)).toEqual({ ratio: 0.4, avgMs: 200, count: 5 })
    expect(uptime(b, 4).ratio).toBe(0.5)
    expect(incidents(b)).toEqual([{ from: 5, to: null, msg: 'HTTP 503', beats: 1 }, { from: 2, to: 4, msg: 'HTTP 503', beats: 2 }])
  })

  it('writes a status page without targets and escapes names', () => {
    const html = statusPage('Status', [{ name: '<API>', state: 'down', day: 0.5, month: 0.99 }], 0)
    expect(html).toContain('&#60;API&#62;')
    expect(html).toContain('Some systems have problems')
    expect(html).toContain('50.00%')
    expect(html).not.toContain('example.com')
  })

  it('reads a Netdata agent', () => {
    const alarms = netdataAlarms({ alarms: { a: { name: 'ram_in_use', chart: 'system.ram', status: 'WARNING', value_string: '85%', last_status_change: 10, info: 'RAM' }, b: { name: 'disk_space', chart: 'disk.space', status: 'CRITICAL', value: 97 }, c: { name: 'ok', status: 'CLEAR' } } })
    expect(alarms.map((a) => [a.name, a.status])).toEqual([['disk_space', 'CRITICAL'], ['ram_in_use', 'WARNING']])
    expect(alarms[1]!.since).toBe(10_000)
    expect(netdataLatest({ labels: ['time', 'user', 'system'], data: [[1, 12.34, 3.01]] })).toEqual({ user: 12.3, system: 3 })
  })
})

describe('promql monitors', () => {
  it('goes down when the value crosses the threshold', () => {
    const m = cleanMonitor({ name: 'API errors', kind: 'promql', target: 'sum(rate(errors[5m]))', keyword: '> 0.5' })
    expect(checkMonitor(m)).toBeNull()
    expect(checkMonitor({ ...m, keyword: 'high' })).toMatch(/down/)
    expect(judge(m, { ms: 3, value: 0.2 }, 1)).toMatchObject({ ok: true, msg: 'Value 0.2' })
    expect(judge(m, { ms: 3, value: 0.75 }, 1)).toMatchObject({ ok: false, msg: '0.75 > 0.5' })
    expect(judge(m, { ms: 3, value: null }, 1).ok).toBe(false)
  })
})
