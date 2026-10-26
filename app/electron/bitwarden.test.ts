import { describe, expect, it } from 'vitest'
import { Bitwarden, type Run } from './bitwarden'

const ITEMS = [{ id: 'i1', name: 'Anthropic', login: { username: 'me@x.com', password: 'sk-ant-secret-value' }, fields: [{ name: 'org', value: 'o-1' }] }, { id: 'i2', name: 'Notes only', notes: 'n' }]
function fakeBw() {
  const calls: { args: string[]; env?: Record<string, string> }[] = []
  let session = ''
  const run: Run = async (args, env) => {
    calls.push({ args, env })
    if (args[0] === 'status') return { code: 0, out: JSON.stringify({ status: args.includes(session) && session ? 'unlocked' : 'locked', serverUrl: 'https://vault.example.com', userEmail: 'me@x.com' }), err: '' }
    if (args[0] === 'unlock') return env?.BW_PASSWORD === 'right' ? ((session = 'SESSION123'), { code: 0, out: 'SESSION123\n', err: '' }) : { code: 1, out: '', err: 'Invalid master password.' }
    if (args[0] === 'lock') return (session = ''), { code: 0, out: '', err: '' }
    const s = args[args.indexOf('--session') + 1]
    if (s !== session) return { code: 1, out: '', err: 'Vault is locked.' }
    if (args[0] === 'list') return { code: 0, out: JSON.stringify(ITEMS), err: '' }
    if (args[0] === 'get') return { code: 0, out: JSON.stringify(ITEMS.find((i) => i.id === args[2])), err: '' }
    return { code: 1, out: '', err: 'unknown' }
  }
  return { run, calls }
}

describe('bitwarden', () => {
  it('unlocks with the password in bw\'s own environment only, never in its arguments', async () => {
    const f = fakeBw()
    const bw = new Bitwarden(f.run)
    await expect(bw.unlock('wrong')).rejects.toThrow('Wrong master password.')
    await bw.unlock('right')
    expect(f.calls.every((c) => !c.args.join(' ').includes('right'))).toBe(true)
    expect((await bw.status()).status).toBe('unlocked')
  })
  it('lists names and fields, never values', async () => {
    const f = fakeBw()
    const bw = new Bitwarden(f.run)
    await bw.unlock('right')
    const r = await bw.search('anth')
    expect(r[0]).toEqual({ id: 'i1', name: 'Anthropic', fields: ['password', 'username', 'field:org'] })
    expect(JSON.stringify(r)).not.toContain('sk-ant-secret-value')
  })
  it('reads a value on use, keeps it a short while in memory, forgets it on lock', async () => {
    const f = fakeBw()
    const bw = new Bitwarden(f.run, 60_000)
    await expect(bw.value({ item: 'i1', field: 'password', label: 'x' })).rejects.toThrow(/Unlock/)
    await bw.unlock('right')
    expect(await bw.value({ item: 'i1', field: 'password', label: 'x' })).toBe('sk-ant-secret-value')
    expect(await bw.value({ item: 'i1', field: 'field:org', label: 'x' })).toBe('o-1')
    const gets = f.calls.filter((c) => c.args[0] === 'get').length
    await bw.value({ item: 'i1', field: 'password', label: 'x' })
    expect(f.calls.filter((c) => c.args[0] === 'get').length).toBe(gets)
    await bw.lock()
    expect(bw.held({ item: 'i1', field: 'password', label: 'x' })).toBeUndefined()
  })
})
