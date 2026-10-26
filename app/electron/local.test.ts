import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_CHARS, projectText } from './local'
import { askLocal, KEEP_ALIVE } from './small'

const project = () => {
  const root = mkdtempSync(join(tmpdir(), 'local-'))
  mkdirSync(join(root, 'p'))
  writeFileSync(join(root, 'secret.txt'), 'outside')
  writeFileSync(join(root, 'p', 'log.txt'), 'x'.repeat(MAX_CHARS) + 'THE END')
  writeFileSync(join(root, 'p', 'img.bin'), Buffer.from([1, 0, 2]))
  symlinkSync(join(root, 'secret.txt'), join(root, 'p', 'link.txt'))
  return join(root, 'p')
}

describe('projectText', () => {
  const p = project()
  it('keeps the tail of a long log', () => {
    const r = projectText(p, 'log.txt')
    expect('text' in r && r.cut && r.text.endsWith('THE END') && r.text.length === MAX_CHARS).toBe(true)
  })
  it('never leaves the project, by path or by link', () => {
    expect(projectText(p, '../secret.txt')).toEqual({ error: 'Only files inside the project.' })
    expect(projectText(p, 'link.txt')).toEqual({ error: 'Only files inside the project.' })
    expect(projectText(p, '/etc/hostname')).toMatchObject({ error: expect.any(String) })
  })
  it('refuses binaries and missing files', () => {
    expect(projectText(p, 'img.bin')).toEqual({ error: 'img.bin is binary.' })
    expect(projectText(p, 'nope')).toEqual({ error: 'No such file: nope' })
  })
})

describe('askLocal', () => {
  it('asks Ollama to unload soon and sizes the context', async () => {
    let body: Record<string, unknown> = {}
    const f = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body))
      return new Response(JSON.stringify({ message: { content: '<think>hm</think> ok' }, prompt_eval_count: 900, eval_count: 3 }))
    }) as unknown as typeof fetch
    expect(await askLocal('m', 'p', f, 32768)).toEqual({ text: 'ok', tokens: 903, read: 900 })
    expect(body).toMatchObject({ keep_alive: KEEP_ALIVE, options: { num_ctx: 32768 } })
  })
})

describe('suspects', () => {
  it('finds failure lines and skips the all-clear summary', async () => {
    const { suspects } = await import('./local')
    expect(suspects('ok a\n ✓ fails nicely\n × gmail > raw mail\n   → expected "Hi"\nTests 0 failed\nError: boom\n  warning: slow')).toEqual(['× gmail > raw mail', '→ expected "Hi"', 'Error: boom', 'warning: slow'])
  })
})

describe('bigRead', () => {
  it('turns a whole read of a big file aside once, never a small one or a ranged one', async () => {
    const { bigRead } = await import('./local')
    const p = project()
    writeFileSync(join(p, 'small.txt'), 'a\nb')
    const asked = new Set<string>()
    expect(bigRead({ file_path: 'small.txt' }, p, asked)).toBeNull()
    expect(bigRead({ file_path: 'log.txt', offset: 1, limit: 50 }, p, asked)).toBeNull()
    expect(bigRead({ file_path: 'log.txt' }, p, asked)).toMatch(/local_read/)
    expect(bigRead({ file_path: 'log.txt' }, p, asked)).toBeNull()
    expect(bigRead({ file_path: 'missing' }, p, asked)).toBeNull()
  })
})
