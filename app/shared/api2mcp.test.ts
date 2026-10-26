import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkGen, generate, opsOf, parsePublicApis, type Gen } from './api2mcp'

const MD = `### APIs Covered Under APILayer Suite!
| [IPstack](https://ipstack.com) | Locate | x |
### Animals
API | Description | Auth | HTTPS | CORS
|:---|:---|:---|:---|:---|
| [Cat Facts](https://catfact.ninja/) | Random cat facts | No | Yes | Yes |
| [Cats](https://docs.thecatapi.com/) | Pictures of cats | \`apiKey\` | Yes | No |
`
const SPEC = {
  openapi: '3.0.0',
  servers: [{ url: 'https://catfact.ninja' }],
  paths: {
    '/fact': { get: { operationId: 'getRandomFact', summary: 'Get a random fact', parameters: [{ name: 'max_length', in: 'query', schema: { type: 'integer' } }] } },
    '/breeds/{id}': { get: { summary: 'One breed', parameters: [{ name: 'id', in: 'path', schema: { type: 'string' } }] }, delete: { operationId: 'deleteBreed' } },
    '/votes': { post: { operationId: 'createVote', requestBody: { content: { 'application/json': { schema: { required: ['image_id'], properties: { image_id: { type: 'string' }, value: { type: 'integer' } } } } } } } },
  },
}

describe('api to mcp', () => {
  it('reads the public-apis tables', () => {
    const l = parsePublicApis(MD)
    expect(l.map((x) => [x.name, x.auth, x.https, x.category])).toEqual([['Cat Facts', 'none', true, 'Animals'], ['Cats', 'apiKey', true, 'Animals']])
  })

  it('reads OpenAPI operations, GETs first', () => {
    const { base, ops } = opsOf(SPEC)
    expect(base).toBe('https://catfact.ninja')
    expect(ops.map((o) => [o.tool, o.method])).toEqual([['get_random_fact', 'GET'], ['get_breeds_by_id', 'GET'], ['delete_breed', 'DELETE'], ['create_vote', 'POST']])
    expect(ops.find((o) => o.tool === 'create_vote')!.params).toEqual([{ name: 'image_id', in: 'body', required: true, type: 'string' }, { name: 'value', in: 'body', required: false, type: 'integer' }])
  })

  it('checks and writes the server', () => {
    const g: Gen = { name: 'cat-facts', base: 'https://catfact.ninja', auth: { type: 'header', name: 'x-api-key', env: 'CATS_API_KEY' }, ops: opsOf(SPEC).ops, minIntervalMs: 500, source: 'its OpenAPI file' }
    expect(checkGen(g)).toBeNull()
    expect(checkGen({ ...g, base: 'http://x' })).toMatch(/https/)
    expect(checkGen({ ...g, ops: [{ ...g.ops[0]!, path: "/x'; rm" }] })).toMatch(/path/)
    const files = generate(g)
    const server = files[0]!.content
    expect(server).toContain('server.registerTool("get_random_fact"')
    expect(server).toContain('readOnlyHint: true')
    expect(server).toContain('readOnlyHint: false')
    expect(server).toContain('headers["x-api-key"] = key()')
    expect(server).not.toMatch(/sk_|api_key_value/)
    expect(JSON.parse(files[1]!.content).dependencies['@modelcontextprotocol/sdk']).toBe('1.32.1')
  })

  it('reads the real list when it is here', () => {
    if (!existsSync('/tmp/stmt/public-apis.md')) return
    const l = parsePublicApis(readFileSync('/tmp/stmt/public-apis.md', 'utf8'))
    expect(l.length).toBeGreaterThan(1000)
  })
})
