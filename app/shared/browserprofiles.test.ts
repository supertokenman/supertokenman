import { describe, expect, it } from 'vitest'
import { cleanName, createProfile, deleteProfile, effectiveScope, emptyProfiles, MAX_PROFILES, profilePartition, renameProfile, setDefault, setScope } from './browserprofiles'

const make = () => {
  const a = createProfile(emptyProfiles(), '  Shop   login ', 'a1')
  if (!a.ok) throw new Error('x')
  const b = createProfile(a.value.profiles, 'Admin', 'b2')
  if (!b.ok) throw new Error('x')
  return b.value.profiles
}

describe('browser profiles', () => {
  it('cleans names and refuses empty, long and duplicate ones', () => {
    expect(cleanName('  a   b ')).toBe('a b')
    expect(cleanName('')).toBeNull()
    expect(cleanName('x'.repeat(41))).toBeNull()
    expect(createProfile(make(), 'shop login', 'c3')).toMatchObject({ ok: false })
    expect(createProfile(make(), '   ', 'c3')).toMatchObject({ ok: false })
  })
  it('caps the number of profiles', () => {
    let p = emptyProfiles()
    for (let i = 0; i < MAX_PROFILES; i++) p = (createProfile(p, `P${i}`, `id${i}`) as { ok: true; value: { profiles: typeof p } }).value.profiles
    expect(createProfile(p, 'One more', 'zz')).toMatchObject({ ok: false })
  })
  it('renames, refusing a taken name', () => {
    const p = make()
    expect(renameProfile(p, 'a1', 'Shop')).toMatchObject({ ok: true, value: { list: [{ id: 'a1', name: 'Shop' }, { id: 'b2', name: 'Admin' }] } })
    expect(renameProfile(p, 'a1', 'admin')).toMatchObject({ ok: false })
    expect(renameProfile(p, 'a1', 'SHOP LOGIN')).toMatchObject({ ok: true })
    expect(renameProfile(p, 'nope', 'X')).toMatchObject({ ok: false })
  })
  it('shares one profile between panels and falls back to the panel when it is deleted', () => {
    let p = make()
    p = (setScope(p, 'p1', 'profile:a1') as { ok: true; value: typeof p }).value
    p = (setScope(p, 'p2', 'profile:a1') as { ok: true; value: typeof p }).value
    p = (setScope(p, 'p3', 'project') as { ok: true; value: typeof p }).value
    expect(effectiveScope(p, 'p1', '/r')).toBe('profile:a1')
    expect(effectiveScope(p, 'p2', '/r')).toBe('profile:a1')
    const d = deleteProfile(p, 'a1')
    if (!d.ok) throw new Error('x')
    expect(d.value.panels.sort()).toEqual(['p1', 'p2'])
    expect(effectiveScope(d.value.profiles, 'p1', '/r')).toBe('panel')
    expect(effectiveScope(d.value.profiles, 'p3', '/r')).toBe('project')
  })
  it('refuses a scope that names a missing profile', () => {
    expect(setScope(make(), 'p1', 'profile:zzz')).toMatchObject({ ok: false })
    expect(setScope(make(), 'p1', 'whatever')).toMatchObject({ ok: false })
  })
  it('uses the project default for panels without a choice, and the panel choice over it', () => {
    let p = make()
    p = (setDefault(p, '/r', 'b2') as { ok: true; value: typeof p }).value
    expect(effectiveScope(p, 'x', '/r')).toBe('profile:b2')
    expect(effectiveScope(p, 'x', '/other')).toBe('panel')
    p = (setScope(p, 'x', 'panel') as { ok: true; value: typeof p }).value
    expect(effectiveScope(p, 'x', '/r')).toBe('panel')
    p = (setDefault(p, '/r', null) as { ok: true; value: typeof p }).value
    expect(effectiveScope(p, 'y', '/r')).toBe('panel')
    expect(setDefault(p, '/r', 'nope')).toMatchObject({ ok: false })
  })
  it('deleting a profile clears the project defaults that used it', () => {
    let p = make()
    p = (setDefault(p, '/r', 'a1') as { ok: true; value: typeof p }).value
    const d = deleteProfile(p, 'a1')
    expect(d).toMatchObject({ ok: true, value: { profiles: { defaults: {} } } })
  })
  it('names the partition from the id, apart from panel and project ones', () => {
    expect(profilePartition('1234-abcd')).toBe('persist:browse-n-1234abcd')
    expect(profilePartition('1234-abcd')).not.toMatch(/^persist:panel-/)
  })
})
