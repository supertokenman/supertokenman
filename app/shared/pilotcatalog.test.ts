import { describe, expect, it } from 'vitest'
import { COMMANDS, findCommand, validateArgs, type CommandSpec } from './pilotcatalog'

// Palette ids from App.tsx paletteEntries (the `go-` entries), kept here as the list the catalog must cover.
const PALETTE_GO = ['today', 'agenda', 'prs', 'docker', 'ports', 'news', 'team', 'publish', 'validate', 'spend', 'worktree', 'lab', 'stm', 'api2mcp', 'mcphealth', 'mcpapprovals', 'mcpinspector', 'mcpcatalog', 'prometheus', 'analytics', 'security', 'workbench', 'shot2code', 'modelservers', 'monitoring', 'observe', 'pubcal', 'config', 'diagrams', 'oneinbox', 'documents', 'research', 'webreader', 'teamfile', 'design', 'deploys', 'trace', 'spec', 'try-ways', 'skill-drafts', 'skill-draft-now', 'modules', 'backtest', 'photos', 'video-meta', 'booking', 'learn', 'self-host', 'arch-desk', 'boot-anim', 'memory-items', 'diagnostics', 'routines', 'work-tasks', 'control-rules', 'control-audit', 'playbooks', 'msg-filters', 'extract', 'phone', 'connect-agents', 'backend-map', 'ask-data', 'short-term', 'project-graph', 'session-review', 'check-after-edits', 'compose-stacks', 'image-xray', 'while-away', 'run-ci', 'post-brief', 'mentions', 'post-everywhere', 'topic-radar', 'bitwarden', 'app-containers', 'pdf-tools', 'vault-board', 'design-handoff', 'md-images', 'office-files', 'design-system', 'remote-panel', 'issue', 'past', 'fanout', 'budgets', 'savings', 'database', 'api', 'quick-ask', 'local-model', 'cloud', 'secrets', 'health', 'markets', 'memory', 'catalog', 'business', 'studio', 'triggers', 'personas', 'connections', 'mail', 'tour', 'appearance', 'focus', 'private']

const spec = (id: string): CommandSpec => {
  const r = findCommand(id)
  if (!r) throw new Error(`no spec for ${id}`)
  return r.spec
}

describe('catalog covers the palette', () => {
  it('has a spec for every static palette id', () => {
    for (const id of PALETTE_GO) expect(findCommand(`go-${id}`)?.spec.id).toBe(`go-${id}`)
  })
  it('has unique spec ids', () => {
    const ids = COMMANDS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('gives every spec a group and a title', () => {
    for (const c of COMMANDS) {
      expect(c.title.length).toBeGreaterThan(0)
      expect(c.group.length).toBeGreaterThan(0)
    }
  })
  it('returns null for an unknown id', () => {
    expect(findCommand('go-nope')).toBeNull()
    expect(findCommand('nope')).toBeNull()
  })
  it('keeps the dynamic families agent-free where no agent pick makes sense', () => {
    expect(findCommand('ev-123')?.spec.agent).toBe(false)
    expect(findCommand('secret-OPENAI')?.spec.agent).toBe(false)
  })
})

describe('prefix families', () => {
  it('matches layout-<id> with the enum arg', () => {
    const r = findCommand('layout-grid')
    expect(r?.spec.id).toBe('layout-<id>')
    expect(r?.args).toEqual({ id: 'grid' })
  })
  it('matches panel-<sid> with the sid arg', () => {
    expect(findCommand('panel-s42')?.args).toEqual({ sid: 's42' })
  })
  it('matches open-<cwd> as ask tier', () => {
    const r = findCommand('open-/home/u/proj')
    expect(r?.args).toEqual({ cwd: '/home/u/proj' })
    expect(r?.spec.tier).toBe('ask')
  })
  it('does not match a bare prefix', () => {
    expect(findCommand('layout-')).toBeNull()
  })
})

describe('tiers follow the real effect', () => {
  it('leaves view commands free', () => {
    expect(spec('go-today').tier).toBe('free')
    expect(spec('go-spend').tier).toBe('free')
  })
  it('marks starting work as ask', () => {
    expect(spec('go-stm').tier).toBe('ask')
    expect(spec('go-skill-draft-now').tier).toBe('ask')
    expect(spec('go-worktree').tier).toBe('ask')
  })
  it('marks picker and secret-entry commands as not agent-runnable', () => {
    expect(spec('go-worktree').agent).toBe(false)
    expect(spec('go-md-images').agent).toBe(false)
    expect(spec('go-bitwarden').agent).toBe(false)
  })
  it('marks settings toggles as undoable settings', () => {
    expect(spec('go-private').undo).toBe('setting')
    expect(spec('go-boot-anim').undo).toBe('setting')
  })
})

describe('validateArgs', () => {
  const layout = spec('layout-<id>')
  const open = spec('open-<cwd>')
  it('accepts a valid enum value', () => {
    expect(validateArgs(layout, { id: 'canvas' })).toEqual({ ok: true, args: { id: 'canvas' } })
  })
  it('rejects an enum value outside the list', () => {
    const r = validateArgs(layout, { id: '2x2' })
    expect(r.ok).toBe(false)
  })
  it('rejects unknown keys', () => {
    const r = validateArgs(open, { cwd: '/a', extra: 1 })
    expect(r).toEqual({ ok: false, error: 'unknown argument: extra' })
  })
  it('rejects a missing required argument and accepts a missing optional one', () => {
    const sheet: CommandSpec = { ...open, args: { a: { type: 'string', describe: 'a' }, b: { type: 'boolean', optional: true, describe: 'b' } } }
    expect(validateArgs(sheet, {})).toEqual({ ok: false, error: 'missing argument: a' })
    expect(validateArgs(sheet, { a: 'x' })).toEqual({ ok: true, args: { a: 'x' } })
  })
  it('checks string types and the max length', () => {
    const s: CommandSpec = { ...open, args: { a: { type: 'string', max: 3, describe: 'a' } } }
    expect(validateArgs(s, { a: 12 }).ok).toBe(false)
    expect(validateArgs(s, { a: 'abcd' }).ok).toBe(false)
    expect(validateArgs(s, { a: 'abc' }).ok).toBe(true)
  })
  it('checks numbers, finiteness and max', () => {
    const n: CommandSpec = { ...open, args: { n: { type: 'number', max: 10, describe: 'n' } } }
    expect(validateArgs(n, { n: NaN }).ok).toBe(false)
    expect(validateArgs(n, { n: 11 }).ok).toBe(false)
    expect(validateArgs(n, { n: 10 }).ok).toBe(true)
  })
  it('rejects a non-object args value', () => {
    expect(validateArgs(open, null).ok).toBe(false)
    expect(validateArgs(open, ['x']).ok).toBe(false)
  })
})
