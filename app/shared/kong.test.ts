import { describe, expect, it } from 'vitest'
import { kongMarkdown, readKong } from './kong'

const yml = `_format_version: "3.0"
plugins:
  - name: cors
services:
  - name: orders
    url: http://orders:8080
    plugins:
      - name: rate-limiting
        config: { minute: 60 }
    routes:
      - name: orders-api
        paths: [/orders]
        methods: [GET, POST]
        plugins:
          - name: key-auth
  - name: legacy
    url: http://legacy.example.com
    routes:
      - name: legacy-all
        paths: [/legacy]
  - name: billing
    host: billing.internal
    port: 443
    protocol: https
routes:
  - name: billing-webhooks
    service: billing
    paths: [/webhooks/billing]
    methods: [POST]
    plugins:
      - name: hmac-auth
      - name: rate-limiting
        enabled: false
`

describe('kong declarative config', () => {
  const g = readKong('kong.yml', yml)
  it('reads services, routes and the plugins on each', () => {
    expect(g.services).toBe(3)
    expect(g.routes.map((r) => [r.route, r.upstream, r.plugins.join('+')])).toEqual([
      ['orders-api', 'http://orders:8080', 'cors+rate-limiting+key-auth'],
      ['legacy-all', 'http://legacy.example.com', 'cors'],
      ['billing-webhooks', 'https://billing.internal:443', 'cors+hmac-auth'],
    ])
  })
  it('finds routes without auth or rate limit, and http upstreams on public names', () => {
    expect(g.findings.map((f) => f.text)).toEqual([
      'legacy-all (/legacy) has no authentication plugin.',
      'legacy-all has no rate limit.',
      'legacy-all goes to http://legacy.example.com over plain http outside a private network name.',
      'legacy-all accepts every method.',
      'billing-webhooks has no rate limit.',
    ])
  })
  it('writes the map section', () => {
    expect(kongMarkdown(g)).toContain('- GET|POST /orders → orders (http://orders:8080) · cors, rate-limiting, key-auth')
    expect(kongMarkdown(g)).toContain('- Check: legacy-all has no rate limit.')
  })
  it('an empty file is an empty gateway', () => expect(readKong('k.yml', '').routes).toEqual([]))
})
