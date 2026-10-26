import { describe, expect, it } from 'vitest'
import { findDevUrls, isLocalUrl } from './preview'
import { initial, reduce } from './state'

describe('preview', () => {
  it('finds the URLs dev servers print', () => {
    expect(findDevUrls('  \x1b[32m➜\x1b[39m  Local:   \x1b[36mhttp://localhost:\x1b[1m5173\x1b[22m/\x1b[39m')).toEqual(['http://localhost:5173/'])
    expect(findDevUrls('  ➜  Local:   http://localhost:5173/\n  ➜  Network: http://192.168.0.2:5173/')).toEqual(['http://localhost:5173/'])
    expect(findDevUrls('ready - started server on 0.0.0.0:3000, url: http://0.0.0.0:3000.')).toEqual(['http://localhost:3000'])
    expect(findDevUrls('\x1b[1mhttp://127.0.0.1:8787\x1b[0m and http://127.0.0.1:8787')).toEqual(['http://127.0.0.1:8787'])
  })
  it('only shows this machine', () => {
    expect(isLocalUrl('http://localhost:3000/a')).toBe(true)
    expect(isLocalUrl('https://example.com')).toBe(false)
    expect(isLocalUrl('file:///etc/passwd')).toBe(false)
  })
  it('keeps a server while its command runs', () => {
    let s = reduce(initial, { kind: 'shell-start', id: 'a', command: 'npm run dev', cwd: '/x' })
    s = reduce(s, { kind: 'shell-out', id: 'a', text: 'Local: http://localhost:5173/\n', stream: 'out' })
    s = reduce(s, { kind: 'shell-out', id: 'a', text: 'Local: http://localhost:5173/\n', stream: 'out' })
    expect(s.servers).toEqual([{ url: 'http://localhost:5173/', id: 'a', command: 'npm run dev' }])
    s = reduce(s, { kind: 'shell-end', id: 'a', code: 0, ms: 5 })
    expect(s.servers).toEqual([])
  })
})
