import { describe, expect, it } from 'vitest'
import { mapOf, routesOf, toMarkdown } from './backendmap'

describe('backend map', () => {
  it('finds routes across frameworks', () => {
    const r = (path: string, text: string) => routesOf({ path, text }).map((x) => `${x.method} ${x.path} ${x.framework}:${x.line}`)
    expect(r('api/src/index.ts', "import express from 'express'\nconst app = express()\napp.get('/users/:id', h)\nrouter.post(\"/orders\", h)")).toEqual(['GET /users/:id express-like:3', 'POST /orders express-like:4'])
    expect(r('svc/users.controller.ts', "@Controller('users')\nexport class U {\n  @Get(':id') one() {}\n  @Post() make() {}\n}")).toEqual(['GET /users/:id nestjs:3', 'POST /users nestjs:4'])
    expect(r('web/app/(shop)/orders/[id]/route.ts', 'export async function GET() {}\nexport const DELETE = async () => {}')).toEqual(['GET /orders/:id next:1', 'DELETE /orders/:id next:2'])
    expect(r('web/pages/api/health.ts', 'export default function h() {}')).toEqual(['ALL /api/health next:1'])
    expect(r('enc/users/users.ts', 'export const get = api({ expose: true, method: "GET", path: "/users/:id" }, async () => {})')).toEqual(['GET /users/:id encore:1'])
    expect(r('py/main.py', '@app.get("/items/{id}")\ndef f(): ...\n@bp.route("/login", methods=["GET", "POST"])\ndef g(): ...')).toEqual(['GET /items/{id} fastapi:1', 'GET /login flask:3', 'POST /login flask:3'])
    expect(r('x.ts', "fastify.route({ method: 'PUT', url: '/x' })")).toEqual(['PUT /x fastify:1'])
  })
  it('groups by service with stores and dependencies', () => {
    const m = mapOf(
      [
        { path: 'services/api/src/server.ts', text: "import { Pool } from 'pg'\nimport Redis from 'ioredis'\napp.get('/a', h)" },
        { path: 'services/billing/main.py', text: 'import boto3\n@app.post("/charge")\ndef c(): ...' },
        { path: 'scripts/x.ts', text: "app.get('/ignored', h)" },
      ],
      [
        { dir: '', name: 'root', lang: 'js', deps: [] },
        { dir: 'services/api', name: '@acme/api', lang: 'js', deps: ['@acme/shared', 'express'] },
        { dir: 'services/billing', name: 'billing', lang: 'py', deps: [] },
        { dir: 'packages/shared', name: '@acme/shared', lang: 'js', deps: [] },
      ],
    )
    expect(m.services.map((s) => [s.name, s.routes.map((r) => r.path), s.stores, s.uses])).toEqual([
      ['@acme/api', ['/a'], ['Postgres', 'Redis'], ['@acme/shared']],
      ['billing', ['/charge'], ['S3'], []],
      ['root', ['/ignored'], [], []],
    ])
    const md = toMarkdown(m, 'acme')
    expect(md).not.toContain('_acme_shared')
    expect(md).toContain('_acme_api --> db_Postgres')
    expect(md).toContain('| POST | `/charge` | services/billing/main.py:2 |')
  })
})
