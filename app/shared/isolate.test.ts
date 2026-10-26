import { execSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { containerOf, isWrapped, runArgs, wrap } from './isolate'

describe('isolate', () => {
  it('runs the container with no network, no privileges and only the project', () => {
    const a = runArgs('stm-iso-s1', '/w/acme', 'node:22', { uid: 501, gid: 20 })
    expect(a.join(' ')).toMatch(/--network none/)
    expect(a.join(' ')).toMatch(/--cap-drop ALL --security-opt no-new-privileges/)
    expect(a).toContain('/w/acme:/w/acme')
    expect(a.filter((x) => x === '-e')).toHaveLength(1)
    expect(() => runArgs('x', '/w', 'evil; rm -rf /')).toThrow()
  })
  it('wraps a command with quotes that survive the shell', () => {
    const c = wrap('stm-iso-s1', "/w/it's", `echo "a" && echo 'b'`)
    expect(c).toBe(`docker exec -i -w '/w/it'\\''s' stm-iso-s1 sh -lc 'echo "a" && echo '\\''b'\\'''`)
    expect(isWrapped('stm-iso-s1', c)).toBe(true)
    expect(isWrapped('stm-iso-s1', 'npm test')).toBe(false)
    expect(containerOf('s1;x')).toBe('stm-iso-s1x')
  })
  it('the quoting runs as written in a real shell', () => {
    const inner = `printf '%s|' "a b" 'it'"'"'s'`
    const outer = `sh -lc ${wrap('n', '/tmp', inner).split(' sh -lc ')[1]}`
    expect(execSync(outer, { encoding: 'utf8' })).toBe(`a b|it's|`)
  })
})
