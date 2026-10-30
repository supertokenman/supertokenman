import { describe, expect, it } from 'vitest'
import { checkSshAlias, checkSshHost } from './sshhost'

describe('saved ssh hosts', () => {
  it('accepts aliases and user@host', () => {
    expect(checkSshAlias('box')).toBeNull()
    expect(checkSshAlias('build-01.lan')).toBeNull()
    expect(checkSshAlias('me@box')).toBeNull()
    expect(checkSshAlias('a'.repeat(255))).toBeNull()
  })
  it('rejects options, spaces and shell metacharacters', () => {
    expect(checkSshAlias('-oProxyCommand=curl x')).toMatch(/-/)
    expect(checkSshAlias('-box')).toMatch(/-/)
    expect(checkSshAlias('me@-box')).not.toBeNull()
    expect(checkSshAlias('my box')).toMatch(/spaces/)
    expect(checkSshAlias('box;rm -rf /')).not.toBeNull()
    expect(checkSshAlias('box$(id)')).not.toBeNull()
    expect(checkSshAlias('box`id`')).not.toBeNull()
    expect(checkSshAlias('box|x')).not.toBeNull()
    expect(checkSshAlias('box:22')).not.toBeNull()
    expect(checkSshAlias('user@host@x')).not.toBeNull()
    expect(checkSshAlias('')).not.toBeNull()
    expect(checkSshAlias('a'.repeat(256))).not.toBeNull()
  })
  it('checks a whole saved host', () => {
    const ok = { id: '1', name: 'Build box', sshAlias: 'box', defaultDir: '~/code/app' }
    expect(checkSshHost(ok)).toBeNull()
    expect(checkSshHost({ ...ok, name: '  ' })).toMatch(/name/)
    expect(checkSshHost({ ...ok, sshAlias: '-oX' })).not.toBeNull()
    expect(checkSshHost({ ...ok, defaultDir: '/srv/$(id)' })).toMatch(/folder/)
  })
})
