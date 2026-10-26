import { describe, expect, it } from 'vitest'
import { activepiecesServer, CATALOG, n8nServer } from './integrations'

describe('firecrawl and n8n', () => {
  it('sends the Firecrawl key in a header, never in the URL', () => {
    const c = CATALOG.find((i) => i.id === 'firecrawl')!.config('fc-secret123') as { url: string; headers: Record<string, string> }
    expect(c.url).toBe('https://mcp.firecrawl.dev/v2/mcp')
    expect(c.headers.Authorization).toBe('Bearer fc-secret123')
  })
  it('reads the n8n server URL and token, and refuses a plain-http remote URL', () => {
    expect(n8nServer('https://acme.app.n8n.cloud/mcp-server/http tok123')).toEqual({ type: 'http', url: 'https://acme.app.n8n.cloud/mcp-server/http', headers: { Authorization: 'Bearer tok123' } })
    expect(n8nServer('http://localhost:5678/mcp-server/http tok')).toMatchObject({ url: 'http://localhost:5678/mcp-server/http' })
    expect(n8nServer('http://evil.example/mcp tok')).toMatchObject({ url: 'https://invalid.n8n.url', headers: {} })
  })
})

describe('activepieces', () => {
  it('signs in to the cloud through the browser, or takes a self-hosted URL and token', () => {
    expect(JSON.stringify(CATALOG.find((i) => i.id === 'activepieces')!.config())).toContain('https://cloud.activepieces.com/mcp')
    expect(activepiecesServer('https://ap.acme.dev/api/v1/projects/p1/mcp-server/http tok')).toEqual({ type: 'http', url: 'https://ap.acme.dev/api/v1/projects/p1/mcp-server/http', headers: { Authorization: 'Bearer tok' } })
    expect(activepiecesServer('ftp://x tok')).toMatchObject({ url: 'https://invalid.activepieces.url' })
  })
})
